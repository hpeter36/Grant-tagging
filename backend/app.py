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
from typing import List, Dict, Any, Optional

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

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL_NAME = os.getenv("GEMINI_MODEL_NAME", "gemini-2.5-flash")


###############################################################################
# Predefined tags (NOT in database by design)
###############################################################################

INITIAL_PREDEFINED_TAGS: List[str] = [
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
grants_collection = mongo_db["grants"]
tags_collection = mongo_db["tags"]
tag_synonyms_collection = mongo_db["tag_synonyms"]


###############################################################################
# Helper functions
###############################################################################

def validate_url(url: str, must_be_pdf: bool = False) -> bool:
    """
    Validate a URL string.
    
    Args:
        url: URL string to validate
        must_be_pdf: If True, URL must point to a PDF file
    
    Returns:
        True if valid, False otherwise
    """
    if not isinstance(url, str) or not url.strip():
        return False
    
    url = url.strip()
    
    # Basic URL format check
    if not url.startswith(("http://", "https://")):
        return False
    
    # PDF check if required
    if must_be_pdf:
        url_lower = url.lower()
        # Check if URL ends with .pdf or has .pdf in path
        if not (url_lower.endswith(".pdf") or ".pdf?" in url_lower or ".pdf#" in url_lower):
            return False
    
    return True


def validate_grant_payload(raw: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate a single grant payload.

    Returns a normalized dict with required fields and optional sources.
    Raises ValueError on validation failure.
    """
    if not isinstance(raw, dict):
        raise ValueError("Each grant must be an object.")

    name = raw.get("grant_name")
    desc = raw.get("grant_description")

    if not isinstance(name, str) or not name.strip():
        raise ValueError("grant_name must be a non-empty string.")
    if not isinstance(desc, str) or not desc.strip():
        raise ValueError("grant_description must be a non-empty string.")

    result: Dict[str, Any] = {
        "grant_name": name.strip(),
        "grant_description": desc.strip(),
    }

    # Validate website_urls if provided
    website_urls = raw.get("website_urls")
    if website_urls is not None:
        if not isinstance(website_urls, list):
            raise ValueError("website_urls must be an array of strings.")
        validated_websites = []
        for idx, url in enumerate(website_urls):
            if not isinstance(url, str):
                continue  # Skip invalid entries
            if validate_url(url, must_be_pdf=False):
                validated_websites.append(url.strip())
            else:
                logger.warning(f"Invalid website URL at index {idx}, ignoring: {url}")
        if validated_websites:
            result["website_urls"] = validated_websites

    # Validate document_urls if provided
    document_urls = raw.get("document_urls")
    if document_urls is not None:
        if not isinstance(document_urls, list):
            raise ValueError("document_urls must be an array of strings.")
        validated_docs = []
        for idx, url in enumerate(document_urls):
            if not isinstance(url, str):
                continue  # Skip invalid entries
            if validate_url(url, must_be_pdf=True):
                validated_docs.append(url.strip())
            else:
                logger.warning(f"Invalid document URL at index {idx}, ignoring: {url}")
        if validated_docs:
            result["document_urls"] = validated_docs

    return result

def get_all_tags_from_db() -> Set[str]:
    """Retrieve all tags from the database."""
    return {doc["name"] for doc in tags_collection.find({}, {"name": 1, "_id": 0})}

def get_synonyms_for_tags(tags: List[str]) -> Set[str]:
    """Retrieve all synonyms for a given list of tags from the database."""
    all_related_tags = set(tags)
    for tag in tags:
        synonym_groups = tag_synonyms_collection.find({"tags": tag})
        for group in synonym_groups:
            all_related_tags.update(group["tags"])
    return all_related_tags

def initialize_tag_synonyms_if_empty():
    """
    Populates the tag_synonyms collection with initial synonym groups using LLM if it's empty.
    """
    if tag_synonyms_collection.count_documents({}) == 0:
        logger.info("Tag synonyms collection is empty, attempting to generate initial groups with LLM.")
        if not GEMINI_API_KEY:
            logger.warning("GEMINI_API_KEY is not set; cannot initialize tag synonyms with LLM.")
            return

        db_predefined_tags = get_all_tags_from_db()
        if not db_predefined_tags:
            logger.warning("No predefined tags available to generate synonyms.")
            return

        try:
            genai.configure(api_key=GEMINI_API_KEY)
            model = genai.GenerativeModel(GEMINI_MODEL_NAME)

            prompt = (
                "You are a tag synonym grouper. Given a list of tags, group them into "
                "sets of synonyms or closely related terms. Each group should contain at least two tags. "
                "Tags that have no clear synonyms should be excluded. "
                "For example, 'agriculture' and 'farmer' could be in one group, or 'climate' and 'resilience'. "
                "Ensure that each tag appears in AT MOST one group. "
                "Return ONLY a JSON array where each element is an array of synonym tags. "
                "Do not include any additional text outside the JSON.\n\n"
                f"Tags to group: {list(db_predefined_tags)}"
            )
            response = model.generate_content(prompt)
            text = (response.text or "").strip()
            logger.debug("Gemini raw synonym response: %s", text)

            import json
            import re

            text_clean = re.sub(r"^\s*", "", text, flags=re.MULTILINE)
            text_clean = re.sub(r"^```", "", text_clean, flags=re.MULTILINE)
            text_clean = re.sub(r"^(json\s*:?[\n]*)?", "", text_clean, flags=re.IGNORECASE)
            text_clean = text_clean.strip()

            parsed_response = json.loads(text_clean)

            if not isinstance(parsed_response, list):
                raise ValueError("Gemini synonym response is not a valid JSON array.")

            inserted_groups = []
            seen_tags_in_groups = set()
            for group_list in parsed_response:
                if not isinstance(group_list, list) or len(group_list) < 2:
                    logger.warning(f"Skipping invalid synonym group: {group_list}. Must be a list of at least two tags.")
                    continue

                valid_group = []
                for tag in group_list:
                    if isinstance(tag, str) and tag.strip().lower() in db_predefined_tags and tag.strip().lower() not in seen_tags_in_groups:
                        valid_group.append(tag.strip().lower())
                        seen_tags_in_groups.add(tag.strip().lower())
                
                if len(valid_group) >= 2:
                    inserted_groups.append({"tags": valid_group})

            if inserted_groups:
                tag_synonyms_collection.insert_many(inserted_groups)
                logger.info(f"Generated and added {len(inserted_groups)} tag synonym groups to the database.")
            else:
                logger.info("No valid tag synonym groups were generated by LLM.")

        except Exception as exc:
            logger.exception("Failed to initialize tag synonyms with LLM: %s", exc)
    else:
        logger.info("Tag synonyms collection already contains data, skipping initial population.")

def update_tag_synonyms_with_new_tag(new_tag: str):
    """
    Uses LLM to determine which existing synonym group a new tag belongs to
    and updates the group in the database.
    """
    if not GEMINI_API_KEY:
        logger.warning(f"GEMINI_API_KEY is not set; cannot update tag synonyms for new tag '{new_tag}'.")
        return

    existing_synonym_groups = list(tag_synonyms_collection.find({}, {"tags": 1, "_id": 0}))
    if not existing_synonym_groups:
        logger.info(f"No existing synonym groups to associate new tag '{new_tag}' with.")
        return

    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel(GEMINI_MODEL_NAME)

        prompt = (
            "You are a tag synonym classifier. A new tag has been created: "
            f"'{new_tag}'.\n\n"
            "Here are the existing synonym groups:\n"
            f"{existing_synonym_groups}\n\n"
            "Determine which, if any, of these existing synonym groups the new tag "
            "most closely belongs to. If it belongs to a group, return ONLY a JSON object "
            "with a single key 'matching_group_index' and its value as the 0-based index "
            "of the matching group in the provided list. "
            "If it does not clearly fit into any existing group, return ONLY a JSON object "
            "with 'matching_group_index' as -1. "
            "Do not include any additional text outside the JSON.\n"
        )
        response = model.generate_content(prompt)
        text = (response.text or "").strip()
        logger.debug("Gemini raw new tag synonym response: %s", text)

        import json
        import re

        text_clean = re.sub(r"^\s*", "", text, flags=re.MULTILINE)
        text_clean = re.sub(r"^```", "", text_clean, flags=re.MULTILINE)
        text_clean = re.sub(r"^(json\s*:?[\n]*)?", "", text_clean, flags=re.IGNORECASE)
        text_clean = text_clean.strip()

        parsed_response = json.loads(text_clean)

        if not isinstance(parsed_response, dict) or "matching_group_index" not in parsed_response:
            raise ValueError("Gemini response for new tag synonym is invalid.")

        matching_group_index = parsed_response["matching_group_index"]

        if 0 <= matching_group_index < len(existing_synonym_groups):
            original_group = existing_synonym_groups[matching_group_index]["tags"]
            updated_group_set = set(original_group)
            updated_group_set.add(new_tag.lower())
            updated_group = sorted(list(updated_group_set))

            filter_query = {"tags": {"$all": original_group, "$size": len(original_group)}}
            
            update_result = tag_synonyms_collection.update_one(
                filter_query,
                {"$set": {"tags": updated_group}}
            )
            if update_result.modified_count > 0:
                logger.info(f"Added new tag '{new_tag}' to synonym group: {updated_group}")
            else:
                logger.warning(f"Failed to update synonym group for new tag '{new_tag}'. Matching group found but not updated.")
        else:
            logger.info(f"New tag '{new_tag}' does not fit into any existing synonym group.")

    except Exception as exc:
        logger.exception("Failed to update tag synonyms with new tag '%s' using LLM: %s", new_tag, exc)

def add_new_tags_to_db(new_tags: List[str]):
    """Adds new tags to the database, avoiding duplicates, and updates synonym groups."""
    existing_tags = get_all_tags_from_db()
    to_insert = []
    newly_added_for_synonyms = []
    for tag in new_tags:
        normalized_tag = tag.strip().lower().replace("_", "-")
        if normalized_tag and normalized_tag not in existing_tags:
            to_insert.append({"name": normalized_tag})
            existing_tags.add(normalized_tag)
            newly_added_for_synonyms.append(normalized_tag)
    if to_insert:
        tags_collection.insert_many(to_insert)
        logger.info(f"Added {len(to_insert)} new tags to the database.")
        for new_t in newly_added_for_synonyms:
            update_tag_synonyms_with_new_tag(new_t)

def initialize_tags_if_empty():
    """Populates the tags collection with initial predefined tags if it's empty."""
    if tags_collection.count_documents({}) == 0:
        logger.info("Tags collection is empty, populating with initial predefined tags.")
        initial_tag_documents = [{"name": tag} for tag in INITIAL_PREDEFINED_TAGS]
        tags_collection.insert_many(initial_tag_documents)
    else:
        logger.info("Tags collection already contains data, skipping initial population.")

def call_gemini_for_tags(
    description: str,
    website_urls: Optional[List[str]] = None,
    document_urls: Optional[List[str]] = None,
    require_llm: bool = False,
) -> List[str]:
    """
    Call Gemini API to classify a grant description and optional sources into predefined tags.

    Args:
        description: Grant description text
        website_urls: Optional list of website URLs to analyze
        document_urls: Optional list of PDF document URLs to analyze
        require_llm: If True, only use LLM (no heuristic fallback). Required when sources are provided.

    Returns:
        List of validated tags from the database.
    """
    # Fetch current predefined tags from the database
    db_predefined_tags = get_all_tags_from_db()
    
    has_sources = (website_urls and len(website_urls) > 0) or (document_urls and len(document_urls) > 0)
    
    if require_llm or has_sources:
        if not GEMINI_API_KEY:
            if has_sources:
                raise ValueError(
                    "GEMINI_API_KEY is required when website_urls or document_urls are provided. "
                    "LLM-based tagging is necessary to process external sources and discover new tags."
                )
            logger.warning("GEMINI_API_KEY is not set; falling back to heuristic tags.")
            return heuristic_tags(description)

    if not GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY is not set; falling back to heuristic tags.")
        return heuristic_tags(description)

    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel(GEMINI_MODEL_NAME)
        
        # Build prompt with description and sources
        prompt_parts = [
            "You are a grant tagging classifier and new tag discoverer.\n"
            "Given the following grant information, first choose ALL relevant tags from "
            "this predefined list ONLY:\n"
            f"{list(db_predefined_tags)}\n\n" # Use list(db_predefined_tags) here
            "SECONDLY, if the website URLs or document URLs contain significant concepts "
            "that are NOT adequately covered by the predefined tags, suggest up to 3 "
            "GENUINELY NEW and distinct tags. These new tags should be concise (1-3 words), "
            "hyphenated (e.g., 'climate-resilience', 'urban-farming'), and in lowercase. "
            "Only suggest new tags if they introduce a critical, unrepresented concept "
            "from the provided sources. DO NOT invent tags if existing ones are sufficient, "
            "and DO NOT suggest duplicates or near-synonyms of existing tags.\n\n"
            "Return ONLY a JSON object {...} with two keys: 'existing_tags' (an array of strings "
            "from the predefined list) and 'newly_discovered_tags' (an array of strings "
            "for genuinely new tags, or an empty array if none are found). "
            "Do not include any additional text outside the JSON.\n\n"
            f"Grant description:\n{description}"
        ]
        
        if website_urls and len(website_urls) > 0:
            prompt_parts.append(f"\n\nWebsite URLs to consider:\n" + "\n".join(f"- {url}" for url in website_urls))
        
        if document_urls and len(document_urls) > 0:
            prompt_parts.append(f"\n\nDocument URLs (PDFs) to consider:\n" + "\n".join(f"- {url}" for url in document_urls))
        
        prompt_parts.append(
            "\n\nAnalyze the grant description and the provided sources (if any) to extract "
            "all relevant tags and discover new ones. Consider information from all sources "
            "when determining tags and suggesting new ones."
        )
        
        prompt = "".join(prompt_parts)
        
        response = model.generate_content(prompt)
        text = (response.text or "").strip()
        logger.debug("Gemini raw response: %s", text)

        # Try to parse JSON object from the response text.
        import json
        import re

        # Clean up response - remove markdown code blocks and 'json' prefix if present
        text_clean = re.sub(r"^\s*", "", text, flags=re.MULTILINE)
        text_clean = re.sub(r"^```", "", text_clean, flags=re.MULTILINE)
        text_clean = re.sub(r"^(json\s*:?[\n]*)?", "", text_clean, flags=re.IGNORECASE)
        text_clean = text_clean.strip()

        #print(f"--- {text_clean} ---")
        parsed_response = json.loads(text_clean)
        
        if not isinstance(parsed_response, dict) or "existing_tags" not in parsed_response or "newly_discovered_tags" not in parsed_response:
            raise ValueError("Gemini response is not a valid JSON object with 'existing_tags' and 'newly_discovered_tags'.")

        raw_existing_tags = parsed_response["existing_tags"]
        raw_newly_discovered_tags = parsed_response["newly_discovered_tags"]

        if not isinstance(raw_existing_tags, list) or not isinstance(raw_newly_discovered_tags, list):
            raise ValueError("Gemini response 'existing_tags' or 'newly_discovered_tags' are not lists.")

        # Normalize + filter existing tags to the allowed set and deduplicate
        validated_existing_tags = []
        seen_tags = set()
        for t in raw_existing_tags:
            if not isinstance(t, str):
                continue
            tag = t.strip().lower().replace("_", "-")
            if tag in db_predefined_tags and tag not in seen_tags:
                validated_existing_tags.append(tag)
                seen_tags.add(tag)

        # Process newly discovered tags (only if sources are provided)
        newly_discovered_and_validated_tags = []
        if has_sources:
            add_new_tags_to_db(raw_newly_discovered_tags)
            updated_db_tags = get_all_tags_from_db() 
            for t in raw_newly_discovered_tags:
                if not isinstance(t, str):
                    continue
                tag = t.strip().lower().replace("_", "-")
                if tag in updated_db_tags and tag not in seen_tags:
                    newly_discovered_and_validated_tags.append(tag)
                    seen_tags.add(tag)

        combined_tags = list(seen_tags) # All unique tags found (existing + newly discovered)

        if combined_tags:
           return combined_tags

        # If LLM required but returned empty, still fall back if allowed
        if require_llm or has_sources:
            logger.warning("Gemini returned no valid tags, but sources were provided. Using heuristic as fallback.")
        
        return heuristic_tags(description)
    except Exception as exc:  # noqa: BLE001 - we want any Gemini failure to be non-fatal
        if require_llm or has_sources:
            logger.exception("Gemini tagging failed with sources provided: %s", exc)
            raise ValueError(f"Failed to process grant with sources using LLM: {exc}")
        logger.exception("Gemini tagging failed, using heuristic fallback: %s", exc)
        return heuristic_tags(description)

def heuristic_tags(description: str) -> List[str]:
    """
    Very crude keyword-based fallback tagger.
    Intentionally simple: substring search over lowercase description.
    """
    desc_lc = description.lower()
    guesses: List[str] = []
    
    # Fetch tags from DB for heuristic matching
    db_predefined_tags = get_all_tags_from_db()

    for tag in db_predefined_tags:
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
    db_tags = get_all_tags_from_db()
    return jsonify({"tags": list(db_tags)}), 200 # Convert set to list for JSON response

@app.route("/api/tags/effective_tags", methods=["GET"])
def get_effective_tags() -> Any:
    """
    Returns the effective list of tags, optionally including synonyms.
    Used by the frontend to update the selected tags in the UI.

    Optional query parameters:
    - tags: comma-separated list of base tags.
    - include_synonyms: 'true' to include synonyms of the base tags.
    """
    raw_tags = request.args.get("tags", "").strip()
    include_synonyms_param = request.args.get("include_synonyms", "false").lower() == "true"

    base_tags = [t.strip() for t in raw_tags.split(",") if t.strip()]

    effective_tags: Set[str] = set()
    if base_tags:
        if include_synonyms_param:
            effective_tags.update(get_synonyms_for_tags(base_tags))
        else:
            effective_tags.update(base_tags)
    
    # Ensure only valid tags from the database are returned
    db_all_tags = get_all_tags_from_db()
    filtered_effective_tags = [tag for tag in effective_tags if tag in db_all_tags]

    return jsonify({"effective_tags": sorted(list(filtered_effective_tags))}), 200

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
    - Call Gemini to assign tags from INITIAL_PREDEFINED_TAGS
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

        # Check for duplicate grant_name
        existing_grant = grants_collection.find_one({"grant_name": grant["grant_name"]})
        if existing_grant:
            return (
                jsonify(
                    {
                        "error": f"Grant with name '{grant['grant_name']}' already exists.",
                    }
                ),
                409, # 409 Conflict status code
            )

        # Assign tags - use LLM if sources are provided
        website_urls = grant.get("website_urls")
        document_urls = grant.get("document_urls")
        has_sources = (website_urls and len(website_urls) > 0) or (document_urls and len(document_urls) > 0)
        
        try:
            tags = call_gemini_for_tags(
                grant["grant_description"],
                website_urls=website_urls,
                document_urls=document_urls,
                require_llm=has_sources,
            )
        except ValueError as exc:
            return (
                jsonify(
                    {
                        "error": f"Invalid grant at index {idx}: {exc}",
                    }
                ),
                400,
            )
        
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

    Optional query parameters:
    - tags: comma-separated list of tags, e.g. ?tags=agriculture,education
    - include_synonyms: 'true' to include synonyms of filtered tags

    If include_synonyms is true, the API returns grants that contain ANY of the
    requested tags OR their synonyms (MongoDB $in). Otherwise, if tags are
    provided, it returns grants that contain ALL of the requested tags (MongoDB $all).
    """
    
    raw_tags = request.args.get("tags", "").strip()
    include_synonyms_param = request.args.get("include_synonyms", "false").lower() == "true"

    logger.info(f"Received raw_tags: '{raw_tags}', include_synonyms_param: {include_synonyms_param}") # DEBUG LOG

    query: Dict[str, Any] = {}
    if raw_tags:  # Only apply tag filtering if raw_tags is not empty
        selected_tags = [t.strip() for t in raw_tags.split(",") if t.strip()]
        
        if not selected_tags:
            # If raw_tags was provided but resulted in no valid individual tags (e.g., ",," or just empty string after split/strip)
            # Explicitly query for no documents matching to return an empty list
            query["tags"] = {"$in": []}
            logger.info("No valid tags parsed from raw_tags, querying for empty set.")
        else:
            logger.info(f"Parsed selected_tags: {selected_tags}")
            effective_tags: Set[str] = set(selected_tags)
            if include_synonyms_param:
                synonym_tags = get_synonyms_for_tags(selected_tags)
                effective_tags.update(synonym_tags)
                
                if effective_tags:
                    query["tags"] = {"$in": list(effective_tags)}
                    logger.info(f"Synonyms included. Effective tags for $in query: {list(effective_tags)}")
                else:
                    # If after synonym expansion, effective_tags becomes empty, return no grants.
                    query["tags"] = {"$in": []}
                    logger.info("Synonyms included, but effective tags became empty, querying for empty set.")
            else:
                query["tags"] = {"$in": selected_tags}
                logger.info(f"Synonyms NOT included. Tags for $all query: {selected_tags}")

    logger.info(f"Final MongoDB query: {query}")
    docs = list(grants_collection.find(query))
    logger.info(f"MongoDB query returned {len(docs)} grants.")
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
    initialize_tags_if_empty()
    initialize_tag_synonyms_if_empty()
    # Default to port 5000 for local dev; docker-compose can override with env.
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True)


