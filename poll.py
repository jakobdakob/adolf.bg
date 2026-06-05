import json, os, sys, time, urllib.request

PAT = os.environ.get("GH_PAT", "")
REPO = "jakobdakob/adolf.bg"

def fetch(url):
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {PAT}",
        "X-GitHub-Api-Version": "2022-11-28",
        "Accept": "application/vnd.github+json",
    })
    return json.load(urllib.request.urlopen(req, timeout=15))

def latest():
    d = fetch(f"https://api.github.com/repos/{REPO}/actions/runs?per_page=1")
    r = d["workflow_runs"][0]
    return r["head_sha"][:7], r["id"], r["status"], r["conclusion"]

for i in range(20):
    sha, rid, st, co = latest()
    print(f"tick {i}: {sha} run={rid} status={st} conclusion={co}", flush=True)
    if st == "completed":
        break
    time.sleep(8)
