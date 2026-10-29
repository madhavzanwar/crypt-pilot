# Full FinPilot backend including the local AI (CLIP photo recognition, RapidOCR), for any container host
# (Cloud Run, Render, Fly.io, Railway, Hugging Face Spaces). Needs about 2 GB RAM.
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 FINPILOT_MODEL_CACHE=/models
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt requirements-ml.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-ml.txt
COPY . .
# Run as an unprivileged user; it owns /app (caches, telemetry) and /models (baked model cache).
RUN useradd --create-home --uid 10001 app && mkdir -p /models && chown -R app:app /app /models
USER app
# bake the models into the image so a cold start does not download ~600 MB
RUN python -c "from app.expenses import vision; vision._image_model(); vision._text_model()" \
 && (python -c "from app.ocr import warm; warm()" || echo "OCR warm-up skipped (models download on first use)")
EXPOSE 8080
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
