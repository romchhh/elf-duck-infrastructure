FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    RUNTIME_DIR=/data

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

COPY tegger/tegger-tg/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY tegger/tegger-tg/ ./

RUN mkdir -p /data/data /data/sessions

EXPOSE 8000

HEALTHCHECK --interval=20s --timeout=5s --retries=5 --start-period=30s \
  CMD curl -fsS http://127.0.0.1:8000/api/health || exit 1

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
