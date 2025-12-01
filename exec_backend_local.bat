set MONGO_URI=mongodb://localhost:27017
set GEMINI_API_KEY=
set GEMINI_MODEL_NAME=gemini-2.5-flash

call backend\venv\Scripts\activate
python backend/app.py
