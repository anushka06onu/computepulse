# Stage 1: Build the Vite Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/Frontend
COPY Frontend/package*.json ./
RUN npm ci
COPY Frontend/ ./
RUN npm run build

# Stage 2: Build the FastAPI backend and copy frontend build
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies for LightGBM
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source, data, models, and results
COPY api/ ./api
COPY data/ ./data
COPY models/ ./models
COPY results/ ./results

# Copy compiled frontend build
COPY --from=frontend-builder /app/Frontend/dist ./Frontend/dist

# Expose default Hugging Face / container port
EXPOSE 7860

# Run FastAPI using the dynamic PORT environment variable or fallback to 7860
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-7860}"]

