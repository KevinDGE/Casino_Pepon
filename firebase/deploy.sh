#!/usr/bin/env bash
# Publica las reglas e índices de Firestore con la API de Firebase (requiere `gcloud auth login`).
set -euo pipefail
cd "$(dirname "$0")"
P=casino-pepon
T=$(env -u CLOUDSDK_AUTH_ACCESS_TOKEN gcloud auth print-access-token)
H=(-H "Authorization: Bearer $T" -H "x-goog-user-project: $P" -H "Content-Type: application/json")
BODY=$(python3 -c "import json;print(json.dumps({'source':{'files':[{'name':'firestore.rules','content':open('firestore.rules').read()}]}}))")
RS=$(curl -sS "${H[@]}" -X POST "https://firebaserules.googleapis.com/v1/projects/$P/rulesets" -d "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('name') or d)")
echo "ruleset: $RS"
REL="projects/$P/releases/cloud.firestore"
if curl -sS -o /dev/null -w "%{http_code}" "${H[@]}" "https://firebaserules.googleapis.com/v1/$REL" | grep -q 200; then
  curl -sS "${H[@]}" -X PATCH "https://firebaserules.googleapis.com/v1/$REL" -d "{\"release\":{\"name\":\"$REL\",\"rulesetName\":\"$RS\"}}" | head -c 300; echo
else
  curl -sS "${H[@]}" -X POST "https://firebaserules.googleapis.com/v1/projects/$P/releases" -d "{\"name\":\"$REL\",\"rulesetName\":\"$RS\"}" | head -c 300; echo
fi
python3 - "$T" "$P" <<'PY'
import json, sys, urllib.request
t, p = sys.argv[1], sys.argv[2]
base = f"https://firestore.googleapis.com/v1/projects/{p}/databases/(default)/collectionGroups/ranking/indexes"
for ix in json.load(open('firestore.indexes.json'))['indexes']:
    body = json.dumps({"queryScope": ix["queryScope"], "fields": ix["fields"]}).encode()
    req = urllib.request.Request(base, data=body, method="POST", headers={"Authorization": f"Bearer {t}", "x-goog-user-project": p, "Content-Type": "application/json"})
    try:
        print("índice", ix["fields"][0]["fieldPath"], urllib.request.urlopen(req).status)
    except urllib.error.HTTPError as e:
        print("índice", ix["fields"][0]["fieldPath"], e.code, "(ya existe)" if e.code == 409 else e.read()[:200])
PY
