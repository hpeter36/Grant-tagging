import axios from "axios";

// Simple axios instance pointing at the Flask backend.
// Default to localhost dev port, but allow override via Vite env.
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000/api";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});


