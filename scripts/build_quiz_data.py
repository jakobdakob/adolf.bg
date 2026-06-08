#!/usr/bin/env python3
"""
Parse final_quiz_{ortho,trauma,anatomy}.md → per-topic JSON files.

Source files are bilingual MCQs in the format:

    ## Ortho 1 — <BG title> / <EN title>

    ### Q1
    **BG:** <stem>
    - A) <option>
    - B) <option>
    - C) <option>
    - D) <option>
    **Correct:** C
    **EN:** <stem>
    - A) <option>
    - B) <option>
    - C) <option>
    - D) <option>
    **Correct:** C

Output:
  public/quizzes/{section}-{n}.json    -- 74 per-topic files, 100 Qs each
  public/quizzes/all.json              -- mega-mix source, 7400 entries

Each Q record:
  { "id":      "ortho-1-q3",
    "bg":      {"stem": "...", "options": ["...","...","...","..."], "correct": 2 },
    "en":      {"stem": "...", "options": ["...","...","...","..."], "correct": 2 },
    "section": "ortho",
    "topic":   1 }

The correct field is the 0-based index of the right option (A=0..D=3).
"""

import json
import os
import re
import sys
from pathlib import Path

SECTIONS = ("ortho", "trauma", "anatomy")
LETTER_TO_IDX = {"A": 0, "B": 1, "C": 2, "D": 3}


def parse_pool(path: Path, section: str):
    text = path.read_text(encoding="utf-8")
    # Split on chapter headers like "## Ortho 1 — ..."
    section_cap = section.capitalize()
    chap_pattern = re.compile(
        rf"^## {section_cap} (\d+) — (.+)$", re.MULTILINE
    )
    chunks = []
    for m in chap_pattern.finditer(text):
        chunks.append((int(m.group(1)), m.group(2), m.start(), m.end()))
    if not chunks:
        raise RuntimeError(f"no chapters found in {path}")

    out = {}  # topic_num -> list of Qs
    for i, (n, title, _start, body_start) in enumerate(chunks):
        end = chunks[i + 1][2] if i + 1 < len(chunks) else len(text)
        body = text[body_start:end]
        questions = parse_questions(body, section, n)
        if not questions:
            raise RuntimeError(f"{section} ch{n}: no questions parsed")
        out[n] = {"section": section, "topic": n, "title": title, "questions": questions}
    return out


# Single Q block:
#   ### Q<n>
#   **BG:** stem (may wrap multiple lines)
#   - A) opt
#   - B) opt
#   - C) opt
#   - D) opt
#   **Correct:** X
#   **EN:** stem
#   - A) opt … etc
#   **Correct:** Y
Q_BLOCK_RE = re.compile(
    r"^### Q(\d+)\s*\n"
    r"\*\*BG:\*\*\s*(?P<bg_stem>.+?)\n"
    r"-\s*A\)\s*(?P<bg_a>.+?)\n"
    r"-\s*B\)\s*(?P<bg_b>.+?)\n"
    r"-\s*C\)\s*(?P<bg_c>.+?)\n"
    r"-\s*D\)\s*(?P<bg_d>.+?)\n"
    r"\*\*Correct:\*\*\s*(?P<bg_correct>[A-D])\s*\n"
    r"\*\*EN:\*\*\s*(?P<en_stem>.+?)\n"
    r"-\s*A\)\s*(?P<en_a>.+?)\n"
    r"-\s*B\)\s*(?P<en_b>.+?)\n"
    r"-\s*C\)\s*(?P<en_c>.+?)\n"
    r"-\s*D\)\s*(?P<en_d>.+?)\n"
    r"\*\*Correct:\*\*\s*(?P<en_correct>[A-D])",
    re.MULTILINE | re.DOTALL,
)


def parse_questions(body: str, section: str, topic_n: int):
    qs = []
    for m in Q_BLOCK_RE.finditer(body):
        qn = int(m.group(1))
        bg_correct = LETTER_TO_IDX[m.group("bg_correct")]
        en_correct = LETTER_TO_IDX[m.group("en_correct")]
        # Source might disagree between BG and EN correct letters; use BG as
        # authoritative since the conspectus is BG, and flag mismatches.
        if bg_correct != en_correct:
            print(
                f"  warn: {section}-{topic_n}-q{qn} BG/EN correct letter mismatch "
                f"({m.group('bg_correct')} vs {m.group('en_correct')}); using BG.",
                file=sys.stderr,
            )
        qs.append({
            "id": f"{section}-{topic_n}-q{qn}",
            "bg": {
                "stem": m.group("bg_stem").strip(),
                "options": [m.group("bg_a").strip(), m.group("bg_b").strip(),
                            m.group("bg_c").strip(), m.group("bg_d").strip()],
                "correct": bg_correct,
            },
            "en": {
                "stem": m.group("en_stem").strip(),
                "options": [m.group("en_a").strip(), m.group("en_b").strip(),
                            m.group("en_c").strip(), m.group("en_d").strip()],
                "correct": en_correct,
            },
            "section": section,
            "topic": topic_n,
        })
    return qs


def main():
    repo = Path(__file__).resolve().parent.parent
    src_dir = Path(os.environ.get(
        "QUIZ_SRC_DIR",
        Path.home() / "Downloads" / "quiz_pools" / "_final",
    ))
    out_dir = repo / "public" / "quizzes"
    out_dir.mkdir(parents=True, exist_ok=True)

    all_qs = []
    total_per_section = {}
    for section in SECTIONS:
        path = src_dir / f"final_quiz_{section}.md"
        if not path.is_file():
            raise FileNotFoundError(path)
        per_topic = parse_pool(path, section)
        for n, payload in sorted(per_topic.items()):
            qs = payload["questions"]
            (out_dir / f"{section}-{n}.json").write_text(
                json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
                encoding="utf-8",
            )
            all_qs.extend(qs)
        total_per_section[section] = sum(len(p["questions"]) for p in per_topic.values())

    # Mega-mix source: trimmed to fields the client needs, single big JSON.
    (out_dir / "all.json").write_text(
        json.dumps({"questions": all_qs}, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )

    # Summary
    print("Wrote:")
    for section, n in total_per_section.items():
        print(f"  {section}: {n} questions")
    print(f"  all.json: {len(all_qs)} questions")
    bytes_total = sum(p.stat().st_size for p in out_dir.glob("*.json"))
    print(f"  total bytes: {bytes_total:,}")


if __name__ == "__main__":
    main()
