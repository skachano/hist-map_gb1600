FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Tesseract: OCR for scanned pages without a text layer and for printed page numbers.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-fra tesseract-ocr-deu \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /work/pipeline
COPY pipeline/requirements.txt /tmp/requirements.txt
RUN pip install -r /tmp/requirements.txt

ENV PYTHONPATH=/work/pipeline
CMD ["python", "-m", "bailliage"]
