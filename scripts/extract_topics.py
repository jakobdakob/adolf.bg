#!/usr/bin/env python3
"""
Extract per-topic Markdown from the EN + BG compendium plain-text exports.

Hard rule (from spec): do NOT change the source text.
We only:
  - locate Topic N: <Title> headings and the spans between them
  - normalize trivial PDF artifacts (page numbers, repeated headers/footers)
  - emit Markdown frontmatter + body verbatim

Output:
  src/content/topics/{lang}/{section}-{N}.md
  src/content/topics/{lang}/preface.md
"""
import os, re, sys
from pathlib import Path

SRC = Path("/sessions/vigilant-nice-newton/mnt/Downloads/adolf-source")
OUT = Path("/sessions/vigilant-nice-newton/mnt/outputs/adolf.bg/src/content/topics")

EN_TXT = SRC / "en.txt"
BG_TXT = SRC / "bg.txt"

# Headings ------------------------------------------------------------
# EN body topic heading example:
#   " Topic Ortho-1: Tumor-like Lesions of Bones"
# BG body topic heading example:
#   "Тема Ортопедия-1: Тумороподобни лезии на костите"
EN_HEAD = re.compile(r"^\s*Topic (Ortho|Trauma)-(\d+):\s*(.*?)\s*$")
BG_HEAD = re.compile(r"^\s*Тема (Ортопедия|Травматология)-(\d+):\s*(.*?)\s*$")

EN_SECTION = {"Ortho": "ortho", "Trauma": "trauma"}
BG_SECTION = {"Ортопедия": "ortho", "Травматология": "trauma"}

EN_PREFACE_RE = re.compile(r"^\s*Preface\s*$")
BG_PREFACE_RE = re.compile(r"^\s*Предговор\s*$")

# In TOC, headings have trailing dot leaders + page number, e.g.
#   "Topic Ortho-1: Tumor-like Lesions of Bones ............................. 27"
# We exclude any line that contains "..." (dot leaders).
def is_toc_line(s: str) -> bool:
    return "..." in s

def find_body_start_en(lines):
    """Find the start of the BODY preface (after the TOC).
    The TOC ends with the last dot-leader line; the body preface is a clean 'Preface' heading."""
    last_toc = 0
    for i, ln in enumerate(lines):
        if is_toc_line(ln):
            last_toc = i
    # body Preface heading is the first matching line after the TOC
    for i in range(last_toc, len(lines)):
        if EN_PREFACE_RE.match(lines[i]):
            return i
    return last_toc + 1

def find_body_start_bg(lines):
    """BG file: TOC is much shorter; preface is at the very top (line 3).
    Body starts at the body 'Предговор' which is the same line (no separate TOC body sep).
    But there's a Table of Contents block — let's locate body content by finding the first
    Тема Ортопедия-1 heading and walk back to the preceding section start.
    For BG, the file structure is: Title -> Предговор block -> books list -> 'Тема Ортопедия-1' etc.
    We'll keep the entire preface from start through line before first topic heading."""
    for i, ln in enumerate(lines):
        if BG_HEAD.match(ln):
            return 0  # take everything before first topic as preface front-matter
    return 0

def gather(lines, head_re, sec_map, body_start, has_explicit_preface):
    """Return list of (kind, section_or_None, n_or_None, title, span_lines)."""
    # Find indices of all body heading lines
    heads = []
    for i in range(body_start, len(lines)):
        m = head_re.match(lines[i])
        if m and not is_toc_line(lines[i]):
            section_label = m.group(1)
            n = int(m.group(2))
            title = m.group(3).strip()
            # Some titles wrap to next line(s) before a blank line / numbered subsection
            # Look at the next 3 lines for continuation that isn't a numbered list / section
            j = i + 1
            cont = []
            while j < len(lines) and j < i + 4:
                nl = lines[j].strip()
                if not nl:
                    break
                # numbered subsection: "1. ...", "2. ..."
                if re.match(r"^\d+\.\s", nl):
                    break
                # any new heading line
                if head_re.match(lines[j]):
                    break
                cont.append(nl)
                j += 1
            if cont:
                title = (title + " " + " ".join(cont)).strip()
            heads.append((i, sec_map[section_label], n, title, j))
    # Build topic spans
    out = []
    # Preface span (from body_start up to first heading)
    if has_explicit_preface:
        out.append(("preface", None, None, "Preface", body_start, heads[0][0]))
    else:
        out.append(("preface", None, None, "Предговор", body_start, heads[0][0]))
    # Each topic span from its heading line through line before next heading
    for k, (idx, sec, n, title, body_offset) in enumerate(heads):
        next_idx = heads[k + 1][0] if k + 1 < len(heads) else len(lines)
        out.append((sec, sec, n, title, body_offset, next_idx))
    return out

SECTION_NUM_RE = re.compile(r"^\s*(\d{1,2})\.\s+(\S.+?)\s*$")

def clean_body(raw_lines):
    """Strip running headers/footers and isolated page numbers.
    Then promote 'N. Title' numbered section markers to '## N. Title' H2 headings
    (only when the next non-blank line is NOT another numbered item — to avoid
    munging actual ordered lists)."""
    cleaned = []
    for ln in raw_lines:
        s = ln.rstrip()
        # Pure page number
        if re.match(r"^\s*\d{1,4}\s*$", s):
            continue
        # Repeated running headers
        if re.match(r"^\s*Orthopedics & Traumatology .*Compendium\s*$", s, re.I):
            continue
        if re.match(r"^\s*Ортопедия и травматология\s*$", s):
            continue
        if re.match(r"^\s*Компендиум за държавния изпит\s*$", s):
            continue
        cleaned.append(ln)
    # Collapse 3+ consecutive blank lines to 2
    collapsed = []
    blank = 0
    for ln in cleaned:
        if ln.strip() == "":
            blank += 1
            if blank <= 2:
                collapsed.append(ln)
        else:
            blank = 0
            collapsed.append(ln)
    # Promote numbered section markers
    out = []
    i = 0
    while i < len(collapsed):
        ln = collapsed[i]
        m = SECTION_NUM_RE.match(ln)
        if m and len(ln.strip()) <= 100:
            j = i + 1
            while j < len(collapsed) and collapsed[j].strip() == "":
                j += 1
            next_ln = collapsed[j] if j < len(collapsed) else ""
            if not SECTION_NUM_RE.match(next_ln):
                heading_text = f"{m.group(1)}. {m.group(2)}"
                if out and out[-1].strip() != "":
                    out.append("")
                out.append(f"## {heading_text}")
                out.append("")
                i += 1
                continue
        out.append(ln)
        i += 1
    return out

def slugify_topic(section: str, n: int) -> str:
    return f"{section}-{n}"

def yaml_escape(s: str) -> str:
    s = s.replace('"', '\\"')
    return s

def write_file(path: Path, frontmatter: dict, body: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    fm = ["---"]
    for k, v in frontmatter.items():
        if isinstance(v, int):
            fm.append(f"{k}: {v}")
        else:
            fm.append(f'{k}: "{yaml_escape(str(v))}"')
    fm.append("---")
    path.write_text("\n".join(fm) + "\n\n" + body.rstrip() + "\n", encoding="utf-8")

def emit_lang(lines, lang: str, head_re, sec_map, body_start, preface_label):
    spans = gather(lines, head_re, sec_map, body_start, True)
    lang_dir = OUT / lang
    counts = {"preface": 0, "ortho": 0, "trauma": 0}
    for span in spans:
        kind = span[0]
        if kind == "preface":
            _, _, _, title, a, b = span
            body_lines = clean_body(lines[a:b])
            # Drop the heading itself from the body (already in title)
            body = "\n".join(body_lines).lstrip("\n")
            # Remove first occurrence of the preface heading line at top of body
            body = re.sub(r"^\s*(Preface|Предговор)\s*\n+", "", body, count=1)
            fm = {
                "title": title,
                "lang": lang,
                "kind": "preface",
                "order": 0,
            }
            write_file(lang_dir / "preface.md", fm, body)
            counts["preface"] += 1
        else:
            _, sec, n, title, a, b = span
            body_lines = clean_body(lines[a:b])
            body = "\n".join(body_lines).lstrip("\n")
            slug = slugify_topic(sec, n)
            order = (n if sec == "ortho" else 100 + n)
            fm = {
                "title": title,
                "lang": lang,
                "kind": "topic",
                "section": sec,
                "topicNumber": n,
                "order": order,
            }
            write_file(lang_dir / f"{slug}.md", fm, body)
            counts[sec] += 1
    return counts

def main():
    en_lines = EN_TXT.read_text(encoding="utf-8").splitlines()
    bg_lines = BG_TXT.read_text(encoding="utf-8").splitlines()
    en_body_start = find_body_start_en(en_lines)
    bg_body_start = find_body_start_bg(bg_lines)
    print(f"EN body starts at line {en_body_start}; BG body starts at line {bg_body_start}")
    en_counts = emit_lang(en_lines, "en", EN_HEAD, EN_SECTION, en_body_start, "Preface")
    bg_counts = emit_lang(bg_lines, "bg", BG_HEAD, BG_SECTION, bg_body_start, "Предговор")
    print("EN:", en_counts)
    print("BG:", bg_counts)

if __name__ == "__main__":
    main()
