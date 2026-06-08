#!/usr/bin/env python3
"""
Look up Wikimedia Commons file info — URL, license, artist — for a list of
filenames. Rate-limited with a polite User-Agent.

Usage:
  python3 scripts/commons_info.py "Osteoid osteoma.jpg" "Enchondroma 2.jpg" ...

Prints one block per file:
  --- <filename> ---
    url: https://...
    license: CC BY-SA 4.0
    artist: Hellerhoff
    size: 1200 x 800
"""
import sys
import time
import json
import urllib.parse
import urllib.request
import html
import re

UA = "adolf-bg-research/1.0 (https://adolf.bg/; jakob@adolf.bg)"


def clean(s):
    if not s:
        return ""
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s)
    return s.strip()


def fetch(title):
    safe = urllib.parse.quote(title)
    url = (
        "https://commons.wikimedia.org/w/api.php?"
        "action=query&format=json&prop=imageinfo&"
        "iiprop=url|size|extmetadata&"
        "titles=File:" + safe
    )
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.load(resp)
    pages = data.get("query", {}).get("pages", {})
    for k, v in pages.items():
        ii = (v.get("imageinfo") or [{}])[0]
        em = ii.get("extmetadata", {})
        print(f"--- {title} ---")
        print(f"  url: {ii.get('url','')}")
        print(f"  license: {em.get('LicenseShortName',{}).get('value','')}")
        print(f"  artist: {clean(em.get('Artist',{}).get('value',''))[:120]}")
        print(f"  size: {ii.get('width','')} x {ii.get('height','')}")


def main():
    if len(sys.argv) < 2:
        print("Usage: commons_info.py <file> [<file> ...]", file=sys.stderr)
        sys.exit(2)
    for i, title in enumerate(sys.argv[1:]):
        if i:
            time.sleep(1.2)
        try:
            fetch(title)
        except Exception as e:
            print(f"--- {title} ---")
            print(f"  err: {e}")


if __name__ == "__main__":
    main()
