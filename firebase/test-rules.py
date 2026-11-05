# Prueba las reglas de Firestore contra la API de Firebase (requiere `gcloud auth login`).
import json, subprocess, urllib.request, sys
T = subprocess.check_output("env -u CLOUDSDK_AUTH_ACCESS_TOKEN gcloud auth print-access-token", shell=True, text=True).strip()
rules = open(__import__('os').path.join(__import__('os').path.dirname(__file__), 'firestore.rules')).read()
D = '/databases/(default)/documents'
rk = {"day":"2026-11-05","dayNet":1500,"dayRounds":3,"week":"2026-W45","weekNet":1500,"weekRounds":3,"month":"2026-11","monthNet":-20,"monthRounds":3,"v":1,"updatedAt":1762331885000,"alias":"El Pepón"}
mp = {"v":1,"table":"abc:123","seat":0,"joinedAt":1,"alive":2,"ready":0,"h":{"n":1,"acts":[{"s":0,"t":"c"}],"rv":{"flop":["aa"]}},"alias":"Ana"}
def req(path, method, data, uid, exp):
    r = {"path": f"/databases/(default)/documents/{path}", "method": method}
    if uid: r["auth"] = {"uid": uid}
    if data is not None: r["resource"] = {"data": data}
    return {"expectation": exp, "request": r, "functionMocks": []}
def T_(name, path, method, data, uid, exp): return (name, req(path, method, data, uid, exp))
cases = [
  T_("leer ranking sin sesión", "ranking/u1", "get", None, None, "ALLOW"),
  T_("crear mi ranking", "ranking/u1", "create", rk, "u1", "ALLOW"),
  T_("crear ranking de otro", "ranking/u2", "create", rk, "u1", "DENY"),
  T_("crear sin sesión", "ranking/u1", "create", rk, None, "DENY"),
  T_("decimal no", "ranking/u1", "create", {**rk, "dayNet": 1.5}, "u1", "DENY"),
  T_("campo extra no", "ranking/u1", "create", {**rk, "x": 1}, "u1", "DENY"),
  T_("apodo largo no", "ranking/u1", "create", {**rk, "alias": "x"*21}, "u1", "DENY"),
  T_("sin apodo sí", "ranking/u1", "create", {k:v for k,v in rk.items() if k!="alias"}, "u1", "ALLOW"),
  T_("mp mío", "mp/u1", "create", mp, "u1", "ALLOW"),
  T_("mp mesa null", "mp/u1", "create", {**mp, "table": None}, "u1", "ALLOW"),
  T_("mp de otro", "mp/u2", "create", mp, "u1", "DENY"),
  T_("otra colección", "x/u1", "create", mp, "u1", "DENY"),
]
body = {"source": {"files": [{"name": "firestore.rules", "content": rules}]}, "testSuite": {"testCases": [c[1] for c in cases]}}
r = urllib.request.Request("https://firebaserules.googleapis.com/v1/projects/casino-pepon:test", data=json.dumps(body).encode(), method="POST",
  headers={"Authorization": f"Bearer {T}", "x-goog-user-project": "casino-pepon", "Content-Type": "application/json"})
try: out = json.load(urllib.request.urlopen(r))
except urllib.error.HTTPError as e: print(e.read().decode()[:1500]); sys.exit(1)
for (n, _), res in zip(cases, out.get("testResults", [])):
    print(res.get("state"), "-", n, "" if res.get("state")=="SUCCESS" else json.dumps(res)[:400])
