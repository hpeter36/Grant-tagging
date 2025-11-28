"""
Flask backend for Grant Tagging System.

Responsibilities:
- Accept new grants (single or list) with name/description.
- Call Gemini to assign tags from a predefined tag list.
- Persist grants in MongoDB.
- Expose filtered retrieval of grants and the available tags.

All inputs are validated server-side and errors are returned with clear messages.
"""

from __future__ import annotations

import os
import logging
from typing import List, Dict, Any

from flask import Flask, jsonify, request
from flask_cors import CORS
from pymongo import MongoClient

import google.generativeai as genai


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


###############################################################################
# Configuration
###############################################################################

MONGO_URI = os.getenv("MONGO_URI", "mongodb://mongo:27017")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "grants_db")
MONGO_COLLECTION_NAME = os.getenv("MONGO_COLLECTION_NAME", "grants")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL_NAME = os.getenv("GEMINI_MODEL_NAME", "gemini-1.5-flash")


###############################################################################
# Predefined tags (NOT in database by design)
###############################################################################

PREDEFINED_TAGS: List[str] = [
    "agriculture",
    "aquaculture",
    "capacity-building",
    "capital",
    "climate",
    "community-benefit",
    "conservation",
    "cost-share",
    "dairy",
    "distribution",
    "drought",
    "education",
    "equipment",
    "equine",
    "equine-owners",
    "food-safety",
    "farmer",
    "farm-to-school",
    "grant",
    "infrastructure",
    "irrigation",
    "local-food",
    "local-government",
    "logistics",
    "marketing",
    "mixed-operations",
    "nonprofit",
    "nutrient-management",
    "operational",
    "organic-certification",
    "organic-transition",
    "outreach",
    "planning",
    "pilot",
    "producer-group",
    "procurement",
    "processing",
    "research",
    "resilience",
    "reimbursement",
    "rolling",
    "rural",
    "safety-net",
    "school",
    "seafood",
    "seafood-harvester",
    "soil",
    "supply-chain",
    "technical-assistance",
    "training",
    "value-added",
    "water",
    "water-storage",
    "working-capital",
    "row-crops",
    "vegetables",
    "fruit",
    "livestock",
    "competitive",
    "match-required",
    "public-entity-eligible",
    "individual-eligible",
    "rfa-open",
    "wi",
    "va",
    "ri",
    "nh",
    "mn",
    "me",
    "ky",
    "co",
    "cooperative",
    "for-profit",
    "university",
    "extension",
    "tribal",
    "veteran",
    "beginning-farmer",
    "underserved",
    "youth",
    "food-access",
    "nutrition",
    "workforce",
    "energy",
    "renewable-energy",
    "water-quality",
    "soil-health",
    "wildlife-habitat",
    "pasture",
    "grazing",
    "manure-management",
    "disaster-relief",
    "flood",
]


###############################################################################
# App / DB bootstrap
###############################################################################

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

mongo_client = MongoClient(MONGO_URI)
mongo_db = mongo_client[MONGO_DB_NAME]
grants_collection = mongo_db[MONGO_COLLECTION_NAME]


###############################################################################
# Helper functions
###############################################################################

def validate_grant_payload(raw: Dict[str, Any]) -> Dict[str, str]:
    """
    Validate a single grant payload.

    Returns a normalized dict with required fields or raises ValueError.
    """
    if not isinstance(raw, dict):
        raise ValueError("Each grant must be an object.")

    name = raw.get("grant_name")
    desc = raw.get("grant_description")

    if not isinstance(name, str) or not name.strip():
        raise ValueError("grant_name must be a non-empty string.")
    if not isinstance(desc, str) or not desc.strip():
        raise ValueError("grant_description must be a non-empty string.")

    return {
        "grant_name": name.strip(),
        "grant_description": desc.strip(),
    }


def call_gemini_for_tags(description: str) -> List[str]:
    """
    Call Gemini API to classify a grant description into predefined tags.

    If Gemini is not configured or something goes wrong, fall back to a very
    naive keyword-based tag guesser based on substring matches.
    """
    if not GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY is not set; falling back to heuristic tags.")
        return heuristic_tags(description)

    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel(GEMINI_MODEL_NAME)
        prompt = (
            "You are a grant tagging classifier.\n"
            "Given the following grant description, choose ALL relevant tags from "
            "this predefined list ONLY (no new tags):\n"
            f"{PREDEFINED_TAGS}\n\n"
            "Return ONLY a JSON array of strings, e.g. [\"agriculture\", \"education\"]. "
            "Do not include any additional text.\n\n"
            f"Grant description:\n{description}"
        )
        response = model.generate_content(prompt)
        text = (response.text or "").strip()
        logger.debug("Gemini raw response: %s", text)

        # Try to parse JSON array from the response text.
        import json

        tags = json.loads(text)
        if not isinstance(tags, list):
            raise ValueError("Gemini response is not a list.")

        # Normalize + filter to the allowed set
        normalized = []
        for t in tags:
            if not isinstance(t, str):
                continue
            tag = t.strip()
            if tag in PREDEFINED_TAGS and tag not in normalized:
                normalized.append(tag)

        return normalized or heuristic_tags(description)
    except Exception as exc:  # noqa: BLE001 - we want any Gemini failure to be non-fatal
        logger.exception("Gemini tagging failed, using heuristic fallback: %s", exc)
        return heuristic_tags(description)


def heuristic_tags(description: str) -> List[str]:
    """
    Very crude keyword-based fallback tagger.
    Intentionally simple: substring search over lowercase description.
    """
    desc_lc = description.lower()
    guesses: List[str] = []
    for tag in PREDEFINED_TAGS:
        key = tag.replace("-", " ")
        if key in desc_lc and tag not in guesses:
            guesses.append(tag)
    return guesses


###############################################################################
# Routes
###############################################################################

@app.route("/api/health", methods=["GET"])
def health() -> Any:
    """Simple health check endpoint."""
    return jsonify({"status": "ok"}), 200


@app.route("/api/tags", methods=["GET"])
def get_tags() -> Any:
    """
    Return the predefined list of tags used by the system.
    """
    return jsonify({"tags": PREDEFINED_TAGS}), 200


@app.route("/api/grants", methods=["POST"])
def add_grants() -> Any:
    """
    Create new grants.

    Request body can be:
    - A single grant object
    - An array of grant objects

    Each object must include:
    - grant_name: string
    - grant_description: string

    The backend will:
    - Validate input
    - Call Gemini to assign tags from PREDEFINED_TAGS
    - Store to MongoDB
    - Return the stored documents (excluding Mongo's internal _id)
    """
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({"error": "Invalid JSON body."}), 400

    # Normalize input to a list
    if isinstance(data, dict):
        raw_grants = [data]
    elif isinstance(data, list):
        raw_grants = data
    else:
        return jsonify({"error": "Payload must be an object or an array of objects."}), 400

    validated: List[Dict[str, Any]] = []
    for idx, raw in enumerate(raw_grants):
        try:
            grant = validate_grant_payload(raw)
        except ValueError as exc:
            return (
                jsonify(
                    {
                        "error": f"Invalid grant at index {idx}: {exc}",
                    }
                ),
                400,
            )

        # Assign tags
        tags = call_gemini_for_tags(grant["grant_description"])
        grant["tags"] = tags
        validated.append(grant)

    # Insert into MongoDB
    if not validated:
        return jsonify({"error": "No valid grants found in payload."}), 400

    insert_result = grants_collection.insert_many(validated)
    inserted_ids = set(insert_result.inserted_ids)

    # Fetch the inserted documents and strip _id for frontend
    docs = list(grants_collection.find({"_id": {"$in": list(inserted_ids)}}))
    response_items: List[Dict[str, Any]] = []
    for doc in docs:
        response_items.append(
            {
                "grant_name": doc.get("grant_name", ""),
                "grant_description": doc.get("grant_description", ""),
                "tags": doc.get("tags", []),
            }
        )

    return jsonify({"grants": response_items}), 201


@app.route("/api/grants", methods=["GET"])
def list_grants() -> Any:
    """
    Retrieve grants from the database.

    Optional query parameter:
    - tags: comma-separated list of tags, e.g. ?tags=agriculture,education

    When tags are provided the API returns only grants that contain ALL of the
    requested tags (MongoDB $all).
    """
    raw_tags = request.args.get("tags", "").strip()
    query: Dict[str, Any] = {}
    if raw_tags:
        tags = [t.strip() for t in raw_tags.split(",") if t.strip()]
        if tags:
            query["tags"] = {"$all": tags}

    docs = list(grants_collection.find(query))
    items: List[Dict[str, Any]] = []
    for doc in docs:
        items.append(
            {
                "grant_name": doc.get("grant_name", ""),
                "grant_description": doc.get("grant_description", ""),
                "tags": doc.get("tags", []),
            }
        )

    return jsonify({"grants": items}), 200


if __name__ == "__main__":
    # Default to port 5000 for local dev; docker-compose can override with env.
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True)


