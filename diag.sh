#!/bin/bash
PAT="$GH_PAT"
echo "===Latest Pages deploys==="
curl -s -H "Authorization: Bearer $PAT" "https://api.github.com/repos/jakobdakob/adolf.bg/actions/runs?per_page=3" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for r in d['workflow_runs']:
    print(r['head_sha'][:7], r['status'], r['conclusion'], r['created_at'])
"
echo
echo "===Pages config==="
curl -s -H "Authorization: Bearer $PAT" https://api.github.com/repos/jakobdakob/adolf.bg/pages | python3 -m json.tool

echo
echo "===HTTP probes==="
for u in https://adolf.bg/ https://adolf.bg/bg/ https://adolf.bg/en/ https://adolf.bg/bg/ortho/1/ https://adolf.bg/bg/trauma/1/ https://adolf.bg/bg/anatomy/1/ ; do
  code=$(curl -sI -m 8 -o /dev/null -w "%{http_code}" "$u")
  printf "  %s  %s\n" "$code" "$u"
done

echo
echo "===Last 50 chars of /bg/ HTML (sanity)==="
curl -s -m 8 https://adolf.bg/bg/ | tail -c 200
