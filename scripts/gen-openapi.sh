#!/bin/sh
# Regenerates openapi/openapi.json from the backend's public API reference.
# TUNER_BACKEND_DIR points at a voice-ray checkout with a venv (default ../.wt-m2).
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
backend=${TUNER_BACKEND_DIR:-"$here/../.wt-m2"}
cd "$backend"
env TESTING_ENVIRONMENT=true CLERK_SECRET_KEY=x CLERK_ISSUER=https://example.invalid SECRET_KEY=x \
  POSTGRES_SERVER=x POSTGRES_USER=x POSTGRES_PASSWORD=x POSTGRES_DB=x \
  ./venv/bin/python -c "import json; from app.main import app, public_openapi; print(json.dumps(public_openapi(app), indent=2))" \
  > "$here/openapi/openapi.json.tmp" 2>/dev/null
mv "$here/openapi/openapi.json.tmp" "$here/openapi/openapi.json"
