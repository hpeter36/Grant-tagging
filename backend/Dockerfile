FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV MONGO_URI=mongodb://mongo:27017
ENV MONGO_DB_NAME=grants_db
ENV GEMINI_API_KEY=
ENV GEMINI_MODEL_NAME=gemini-2.5-flash

EXPOSE 5000

CMD ["python", "app.py"]


