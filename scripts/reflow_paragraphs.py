#!/usr/bin/env python3
"""
Reflow PDF-extracted hard-wrapped paragraphs back into long single-line
markdown paragraphs while preserving every other markdown structure.

Rationale: the source content was extracted from a PDF whose column width
broke every paragraph at ~80 characters. Markdown renders single-newlines
within a paragraph as a single space, so the *output* is fine — but the
source is awful to diff/edit. This script joins the wrap-lines back
together, conservatively.

What it preserves (untouched):
  • YAML frontmatter (between leading `---` fences)
  • Fenced code blocks (between ``` markers)
  • Headings (lines starting with `#`)
  • Blockquotes (lines starting with `>`)
  • Tables (any line containing `|` and not inside a paragraph)
  • Bullet lists (`-`, `*`, `+`)
  • Numbered lists (`1.`, `2.` …)
  • Parenthesised numbered lists ((1), (2), … — used by our quiz lists)
  • Indented continuations (lines starting with whitespace) inside list items

What it reflows:
  • A "paragraph block" = consecutive non-blank lines where *no* line
    matches any of the structural patterns above. The lines are joined
    with spaces, with two refinements:
      – if a line ends with `-` (ASCII hyphen) and the next line begins
        with a lowercase Cyrillic or Latin letter, the lines are joined
        WITHOUT a space and the hyphen is preserved (e.g. "по-\nдълбоко"
        → "по-дълбоко"). PDF-extracted Bulgarian text uses real hyphens
        that wrap mid-word; we mustn't insert a stray space.
      – otherwise lines join with a single ASCII space, and any leading
        whitespace on the continuation is stripped.

Idempotency: a second run leaves files unchanged (no paragraphs left to
join — every paragraph is already one line).
"""

import argparse
import os
import re
import sys
from pathlib import Path

# Lines that mark the start of a structural block; if a paragraph block
# contains any such line, we leave the whole block alone.
HEADING = re.compile(r"^#{1,6}\s")
BLOCKQUOTE = re.compile(r"^>\s?")
BULLET = re.compile(r"^[\-\*\+]\s")
NUMBERED = re.compile(r"^\d+\.\s")
PARENED = re.compile(r"^\(\d+\)\s")  # our quiz-list style
TABLE_ROW = re.compile(r"^\|")
TABLE_SEP = re.compile(r"^\s*\|?(?:\s*:?-+:?\s*\|)+\s*$")
INDENTED = re.compile(r"^[ \t]")  # any leading whitespace
FENCE = re.compile(r"^\s*```")
HTML_BLOCK_OPEN = re.compile(r"^<[a-zA-Z]")
# A line that's effectively "structural" — paragraph block touching this
# line stays untouched.
STRUCT_LINE = [HEADING, BLOCKQUOTE, BULLET, NUMBERED, PARENED, TABLE_ROW,
               TABLE_SEP, INDENTED, FENCE, HTML_BLOCK_OPEN]


def is_structural_line(line: str) -> bool:
    return any(p.match(line) for p in STRUCT_LINE)


# Lowercase letters that can validly follow a hyphen-wrap. Cyrillic
# lowercase a..ja + latin lowercase a..z + a few accented (just in case).
LOWERCASE_AFTER_HYPHEN = re.compile(r"^[a-zа-яё]")


def join_paragraph(lines):
    """Join the lines of a reflowable paragraph into a single line."""
    out = lines[0].rstrip()
    for nxt in lines[1:]:
        nxt_stripped = nxt.lstrip()
        if out.endswith("-") and len(out) >= 2 and out[-2].isalpha() and \
           LOWERCASE_AFTER_HYPHEN.match(nxt_stripped):
            # Wrapped hyphenated word (e.g. "по-\nдълбоко"): join without space.
            out = out + nxt_stripped.rstrip()
        else:
            out = out.rstrip() + " " + nxt_stripped.rstrip()
    # Collapse any accidental double-spaces.
    out = re.sub(r"  +", " ", out)
    return out


def reflow_body(body: str):
    """Returns (new_body, num_paragraphs_joined, num_extra_newlines_removed)."""
    lines = body.split("\n")
    out_lines = []
    i = 0
    n_joined = 0
    n_lines_removed = 0
    in_code_fence = False
    while i < len(lines):
        line = lines[i]
        # Track fenced code blocks.
        if FENCE.match(line):
            in_code_fence = not in_code_fence
            out_lines.append(line)
            i += 1
            continue
        if in_code_fence:
            out_lines.append(line)
            i += 1
            continue
        if not line.strip():
            out_lines.append(line)
            i += 1
            continue

        # Collect the contiguous non-blank block.
        block = [line]
        j = i + 1
        while j < len(lines) and lines[j].strip():
            block.append(lines[j])
            j += 1

        # If the block contains any structural line, leave it alone.
        if any(is_structural_line(b) for b in block):
            out_lines.extend(block)
        elif len(block) == 1:
            out_lines.append(block[0])
        else:
            joined = join_paragraph(block)
            out_lines.append(joined)
            n_joined += 1
            n_lines_removed += len(block) - 1
        i = j

    return "\n".join(out_lines), n_joined, n_lines_removed


def process_file(path: Path, dry_run: bool):
    text = path.read_text(encoding="utf-8")
    # Split off YAML frontmatter at the top.
    if text.startswith("---\n"):
        end = text.find("\n---\n", 4)
        if end == -1:
            # malformed frontmatter; treat whole file as body
            head, body = "", text
        else:
            head = text[:end + len("\n---\n")]
            body = text[end + len("\n---\n"):]
    else:
        head, body = "", text

    new_body, n_joined, n_removed = reflow_body(body)
    new_text = head + new_body

    if not dry_run and new_text != text:
        path.write_text(new_text, encoding="utf-8")
    return n_joined, n_removed, (new_text != text)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", action="append",
                    default=[],
                    help="Directory to process (repeatable). "
                         "Default: src/content/topics/bg + en.")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not args.dir:
        args.dir = [
            "src/content/topics/bg",
            "src/content/topics/en",
        ]

    total_files = 0
    total_changed = 0
    total_joined = 0
    total_removed = 0
    per_file = []

    for d in args.dir:
        if not os.path.isdir(d):
            print(f"Skip (not a dir): {d}", file=sys.stderr)
            continue
        for fn in sorted(os.listdir(d)):
            if not fn.endswith(".md"):
                continue
            p = Path(d) / fn
            n_joined, n_removed, changed = process_file(p, args.dry_run)
            total_files += 1
            if changed:
                total_changed += 1
                total_joined += n_joined
                total_removed += n_removed
                per_file.append((str(p), n_joined, n_removed))

    print(f"Scanned: {total_files} files")
    print(f"Touched: {total_changed} files (dry-run={args.dry_run})")
    print(f"Paragraphs joined:  {total_joined}")
    print(f"Newlines removed:   {total_removed}")
    if per_file:
        print()
        print(f"{'file':50s}  paras  newlines")
        for p, j, r in sorted(per_file, key=lambda x: -x[2])[:20]:
            print(f"{p:50s}  {j:5d}  {r:7d}")
        if len(per_file) > 20:
            print(f"… and {len(per_file) - 20} more")


if __name__ == "__main__":
    main()
