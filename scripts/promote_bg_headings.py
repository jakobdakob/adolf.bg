#!/usr/bin/env python3
"""
Promote BG content sub-headings.

Heuristic (matches scripts/promote_headings.py spirit, BG-side re-pass):
  A paragraph whose first text line is a short label-like phrase glued to body
  becomes an H2. Specifically, a line P is promoted to "## P" when:
    - preceded by a blank line
    - followed immediately by a non-blank text line (no blank between)
    - 1..8 words, starts with an uppercase letter (Cyrillic or Latin)
    - does not start with #, list/quote/bullet markers, digit, whitespace
    - does not end with sentence-terminator punctuation . ? ! , ; :
    - contains no colon (label-paragraph indicator)
    - has balanced parentheses (so it is not a body-wrap fragment)
    - the next line is not itself a heading

After promotion, a blank line is inserted between the new heading and the body
so the resulting markdown is well-formed:
   <blank>
   ## Label
   <blank>
   Body text…

The script is idempotent: a second run finds 0 candidates because promoted
lines start with "## " and are filtered.
"""

import os
import re
import sys
import argparse

LIST_OR_NONHEADING_START = re.compile(r'^[#\s\-\*\>0-9•·▪►■]')
UPPER_START = re.compile(r'^[A-ZА-ЯЁ]')
# A trailing relative pronoun (Bulgarian) signals a body-clause continuation,
# not a heading: "...състояние, при което" → next line completes the relative clause.
TRAILING_RELATIVE = re.compile(r'\b(който|която|което|които|чийто|чиято|чието|чиито)$')
# A line containing a comma AND a standalone verb-like form ("е"/"са"/"има"/...)
# anywhere on the line is almost always a wrapped sentence, not a heading.
# Genuine headings are noun phrases without verbs (e.g. "Епидемиология и етиология").
SENTENCE_VERB = re.compile(r'\s(е|са|има|няма|бе|беше|бил|била|било|били)\s')


def is_candidate(line: str, prev: str, nxt: str) -> bool:
    if not line.strip():
        return False
    if prev.strip():  # must be preceded by blank
        return False
    if not nxt.strip():  # must be glued to body (no blank between)
        return False
    if LIST_OR_NONHEADING_START.match(line):
        return False
    if nxt.startswith('#'):
        return False
    stripped = line.strip()
    words = stripped.split()
    if not (1 <= len(words) <= 8):
        return False
    if stripped[-1] in '.?!,;:':
        return False
    if stripped.count('(') != stripped.count(')'):
        return False
    if ':' in stripped:
        return False
    if not UPPER_START.match(stripped):
        return False
    # Reject wrapped sentences masquerading as headings.
    if TRAILING_RELATIVE.search(stripped):
        return False
    # A standalone verb form combined with a comma elsewhere → wrapped sentence.
    padded = ' ' + stripped + ' '
    if ',' in stripped and SENTENCE_VERB.search(padded):
        return False
    return True


def promote(text: str):
    # split frontmatter and body so we never touch frontmatter
    parts = text.split('---', 2)
    if len(parts) >= 3 and text.startswith('---'):
        head = '---' + parts[1] + '---'
        body = parts[2]
    else:
        head = ''
        body = text

    lines = body.split('\n')
    new_lines = []
    promoted = []
    i = 0
    while i < len(lines):
        line = lines[i]
        prev = lines[i - 1] if i > 0 else ''
        nxt = lines[i + 1] if i + 1 < len(lines) else ''
        if is_candidate(line, prev, nxt):
            stripped = line.strip()
            new_lines.append('## ' + stripped)
            new_lines.append('')  # blank between heading and body
            promoted.append(stripped)
            i += 1
        else:
            new_lines.append(line)
            i += 1

    new_body = '\n'.join(new_lines)
    return head + new_body, promoted


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', default='src/content/topics/bg')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    if not os.path.isdir(args.dir):
        print(f"Not a directory: {args.dir}", file=sys.stderr)
        sys.exit(2)

    total_promoted = 0
    per_file = {}
    for fn in sorted(os.listdir(args.dir)):
        if not fn.endswith('.md'):
            continue
        fp = os.path.join(args.dir, fn)
        with open(fp, encoding='utf-8') as f:
            text = f.read()
        # Loop within a single file until no more candidates — this handles
        # adjacent-label pairs that were blocked by their neighbour in pass 1.
        passes = 0
        file_promoted = 0
        while True:
            new_text, promoted = promote(text)
            if not promoted:
                break
            file_promoted += len(promoted)
            text = new_text
            passes += 1
            if passes > 10:
                raise RuntimeError(f"promote did not converge for {fn}")
        if file_promoted:
            per_file[fn] = file_promoted
            total_promoted += file_promoted
            if not args.dry_run:
                with open(fp, 'w', encoding='utf-8') as f:
                    f.write(text)

    print(f"Files touched: {len(per_file)}")
    print(f"Total promoted: {total_promoted}")
    print(f"Dry-run: {args.dry_run}")
    for fn, n in sorted(per_file.items()):
        print(f"  {fn:25s} +{n}")


if __name__ == '__main__':
    main()
