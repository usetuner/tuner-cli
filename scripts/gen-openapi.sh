#!/bin/sh
# Downloads the public OpenAPI schema to openapi/openapi.json.
# TUNER_OPENAPI_URL picks another server (default https://api.usetuner.ai).
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
url=${TUNER_OPENAPI_URL:-https://api.usetuner.ai}
tmp="$here/openapi/openapi.json.tmp"
trap 'rm -f "$tmp"' EXIT
curl -fsS --max-time 30 "${url%/}/public/openapi.json" |
  node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>process.stdout.write(JSON.stringify(JSON.parse(s),null,2)+"\n"))' \
    >"$tmp"
mv "$tmp" "$here/openapi/openapi.json"
