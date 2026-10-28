FROM python:3.12-slim-bookworm

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    RUNTIME_DIR=/data \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=300 \
    PIP_RETRIES=10

COPY tegger/tegger-tg/requirements.txt ./

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    libc6-dev \
    libffi-dev \
    zlib1g-dev \
    libjpeg62-turbo-dev \
  && python -m pip install --upgrade pip setuptools wheel \
  && pip install --no-cache-dir -r requirements.txt \
  && apt-get purge -y --auto-remove \
    gcc \
    libc6-dev \
    libffi-dev \
    zlib1g-dev \
    libjpeg62-turbo-dev \
  && rm -rf /var/lib/apt/lists/*

COPY tegger/tegger-tg/ ./
COPY docker/tegger-api-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
  && mkdir -p /data/data /data/sessions

EXPOSE 8000

# Healthcheck also defined in docker-compose.yml
HEALTHCHECK --interval=10s --timeout=5s --retries=12 --start-period=40s \
  CMD curl -fsS http://127.0.0.1:8000/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
