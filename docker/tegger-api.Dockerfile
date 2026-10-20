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
COPY docker/tegger-api-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
  && mkdir -p /data/data /data/sessions

EXPOSE 8000

# Healthcheck also defined in docker-compose.yml
HEALTHCHECK --interval=10s --timeout=5s --retries=12 --start-period=40s \
  CMD curl -fsS http://127.0.0.1:8000/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
