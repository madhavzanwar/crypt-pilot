# Cryptiq backend image. Build:  docker build -t cryptiq-backend backend/
# Free-host friendly: listens on $PORT (default 8000), runs as uid 1000, no curl needed, artifacts are fetched
# at start-up from a PRIVATE repo when ARTIFACTS_REPO is set (see scripts/fetch_artifacts.py). Never baked in.
ARG BASE_IMAGE=python:3.11-slim
FROM ${BASE_IMAGE}

# ffmpeg converts uploaded audio for speech-to-text. libgomp1 is NOT needed: the xgboost wheel bundles OpenMP.
# Build with --build-arg INSTALL_FFMPEG=false where apt is unreachable (voice upload then returns 503).
ARG INSTALL_FFMPEG=true
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN if [ "$INSTALL_FFMPEG" = "true" ]; then \
      apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*; \
    fi
RUN pip install --no-cache-dir uv
# Create the user BEFORE installing and copy with --chown: a later `chown -R /app` would copy the whole
# virtualenv into a second image layer (this doubled the image size).
RUN useradd --uid 1000 -m cryptiq && mkdir -p /app/data /app/artifacts && chown cryptiq:cryptiq /app /app/data /app/artifacts
USER cryptiq
WORKDIR /app
COPY --chown=cryptiq:cryptiq pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project --no-cache
COPY --chown=cryptiq:cryptiq app ./app
COPY --chown=cryptiq:cryptiq scripts ./scripts
COPY --chown=cryptiq:cryptiq docker-entrypoint.sh ./docker-entrypoint.sh
# data/ and artifacts/ are mounted (volume) or fetched at start-up; they are never in the image
ENV PORT=8000 PATH="/app/.venv/bin:${PATH}"
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD python -c "import os,sys,urllib.request as u; \
sys.exit(0 if u.urlopen('http://127.0.0.1:%s/api/health' % os.environ.get('PORT','8000'), timeout=4).status == 200 else 1)"
# X-Forwarded-For is NOT trusted (uvicorn default); rate limits key on Fly-Client-IP when TRUST_FLY_CLIENT_IP=true
ENTRYPOINT ["./docker-entrypoint.sh"]
