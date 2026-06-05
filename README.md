# adolf.bg

Bilingual (Bulgarian + English) orthopedics & traumatology state-board exam compendium.

The site is a static Astro build. All 62 topic chapters (30 Orthopedics + 32 Traumatology) plus the preface live in `src/content/topics/{en,bg}/`. The Markdown files are produced verbatim from the source PDFs — no AI rewriting; the extraction script only normalizes page-number artifacts and promotes numbered section markers to H2 headings.

## Routing

| URL                  | Page                          |
|----------------------|-------------------------------|
| `/`                  | Redirect → `/bg/`             |
| `/bg/`, `/en/`       | Language home (topic index)   |
| `/bg/preface`        | Preface (Предговор)           |
| `/en/preface`        | Preface                       |
| `/bg/ortho/3`        | Ortho topic 3 in Bulgarian    |
| `/en/trauma/12`      | Trauma topic 12 in English    |

The language toggle in the header swaps to the same topic in the other language.

## Local development

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # → ./dist
npm run preview
```

The build also runs `pagefind --site dist` to generate the static search index (optional).

## Regenerating topic content from sources

The extraction script is checked in at `scripts/extract_topics.py` (also available in the parent workspace). It reads two PDF-extracted text files and emits one Markdown file per topic per language. Source content must not be edited by hand — re-run the script if the source PDFs change.

## Deploy

Pushes to `main` trigger `.github/workflows/deploy.yml`, which builds and deploys to GitHub Pages. Custom domain `adolf.bg` is wired via `public/CNAME`. DNS:

- Apex `A` records → `185.199.108.153`, `.109.153`, `.110.153`, `.111.153`
- `www` `CNAME` → `<gh-username>.github.io`

## Design

Warm off-white background (`#FAF9F7`), near-black text (`#1d1d1f`), muted teal accent (`#0F8C7A`). Reading width 70ch. System font stack with full Cyrillic coverage. Dark mode via `prefers-color-scheme` and persisted toggle. View Transitions on nav.
