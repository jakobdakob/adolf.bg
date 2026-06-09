// Server-side content gating.
//
// SECURITY PRINCIPLE: bytes leaving the Worker for non-authed visitors must
// NOT contain the full prose of a locked topic. Client-side hiding (display:
// none, CSS masking) is insecure — view-source / disable-JS / curl reveals
// everything. We physically strip the response bytes here.

import { paywallCard } from "./paywall-card";

export interface GateConfig {
  wordPreviewLimit: number;
  publicOrigin: string;
  lang: "bg" | "en";
  /** Where the "Try a free preview" CTA links to. */
  showcasePath: string;
  /** True when the visitor had a valid cookie that was superseded by a
   *  newer login on another device. Changes the paywall card to a
   *  "kicked" message + login link instead of subscribe options. */
  kicked: boolean;
}

// ---------------------------------------------------------------------------
// Public API

/** Transform a successful HTML response from the origin into the locked
 *  variant. Strips prose past the word limit, injects paywall card, adds
 *  noindex meta, and removes any quiz / "test yourself" affordances since
 *  they belong to gated material. */
export async function lockHtmlResponse(
  upstream: Response,
  cfg: GateConfig,
): Promise<Response> {
  // Only attempt to gate HTML responses.
  const ct = upstream.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("text/html")) return upstream;

  const html = await upstream.text();
  const transformed = transformLockedHtml(html, cfg);

  // Build new response. Drop CDN cache headers that would let the locked
  // variant leak to a paying user later — we vary by auth state, not URL.
  const headers = new Headers(upstream.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.delete("Content-Length");
  headers.delete("Etag");
  headers.set("Cache-Control", "private, no-store, must-revalidate");
  headers.set("X-Adolf-Variant", "locked");
  // Defense in depth — explicit referrer policy + frame restriction.
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "SAMEORIGIN");

  return new Response(transformed, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

/** Returns the response with noindex injected — for any page the Worker
 *  serves a locked variant of, regardless of stripping. */
export function withNoindex(html: string): string {
  if (/<meta\s+name=["']robots["']/i.test(html)) {
    // Replace existing robots meta.
    return html.replace(
      /<meta\s+name=["']robots["'][^>]*>/i,
      '<meta name="robots" content="noindex,nofollow">',
    );
  }
  // Inject right after <head>.
  return html.replace(/<head([^>]*)>/i, `<head$1>\n    <meta name="robots" content="noindex,nofollow">`);
}

// ---------------------------------------------------------------------------
// Core transform

export function transformLockedHtml(html: string, cfg: GateConfig): string {
  // 1. noindex on the locked variant.
  let out = withNoindex(html);

  // 2. Strip the test-yourself CTA and any quiz buttons (gated content too).
  out = out.replace(/<aside\b[^>]*class=["'][^"']*\btest-yourself\b[^"']*["'][^>]*>[\s\S]*?<\/aside>/gi, "");

  // 3. Find the `.prose` container and splice top-level children past the
  //    word limit, injecting the paywall card at the splice point.
  out = stripProse(out, cfg);

  return out;
}

/** Find <div class="prose">…</div> and replace its tail with the paywall card. */
function stripProse(html: string, cfg: GateConfig): string {
  const open = findProseOpen(html);
  if (!open) return html; // no prose container — leave as-is
  const innerStart = open.end;
  const innerEnd = findMatchingClose(html, innerStart, "div");
  if (innerEnd < 0) return html;
  const inner = html.slice(innerStart, innerEnd);

  const splice = findSplicePoint(inner, cfg.wordPreviewLimit);
  if (splice >= inner.length) {
    // Topic is shorter than the preview window. Still inject the paywall card
    // at the end so the user is gently prompted; but the few hundred words of
    // content are entirely visible (acceptable: short topics aren't the
    // money-makers).
    return (
      html.slice(0, innerStart) +
      inner +
      `\n${paywallCard(cfg)}\n` +
      html.slice(innerEnd)
    );
  }

  const preserved = inner.slice(0, splice);
  // Insert a fade overlay that visually dims the last bit of preserved prose,
  // then the paywall card. The fade is purely cosmetic — the bytes past the
  // splice are still not present in the response.
  return (
    html.slice(0, innerStart) +
    preserved +
    `\n<div class="adolf-prose-fade" aria-hidden="true"></div>\n${paywallCard(cfg)}\n` +
    html.slice(innerEnd)
  );
}

interface OpenTag { start: number; end: number; }

function findProseOpen(html: string): OpenTag | null {
  // Match opening <div ... class="... prose ..." ...>
  // Be tolerant of single quotes, extra spaces, attribute order.
  const re = /<div\b[^>]*\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const cls = (m[1] ?? m[2] ?? "").split(/\s+/);
    if (cls.includes("prose")) {
      return { start: m.index, end: m.index + m[0].length };
    }
  }
  return null;
}

/** Returns the index of the start of the matching `</tag>` for an opening
 *  tag whose closing `>` ends at `from`. Returns -1 on failure. */
function findMatchingClose(html: string, from: number, tag: string): number {
  const lower = tag.toLowerCase();
  const openRe = new RegExp(`<${lower}\\b[^>]*>`, "gi");
  const closeRe = new RegExp(`</${lower}\\s*>`, "gi");
  let depth = 1;
  let cursor = from;
  while (depth > 0) {
    openRe.lastIndex = cursor;
    closeRe.lastIndex = cursor;
    const o = openRe.exec(html);
    const c = closeRe.exec(html);
    if (!c) return -1;
    if (o && o.index < c.index) {
      depth++;
      cursor = o.index + o[0].length;
    } else {
      depth--;
      if (depth === 0) return c.index;
      cursor = c.index + c[0].length;
    }
  }
  return -1;
}

/** Walk top-level children of `inner`, summing words; return the offset
 *  in `inner` at which we should splice (start of the first child that
 *  would push the running word count past the limit). */
function findSplicePoint(inner: string, limit: number): number {
  let i = 0;
  let total = 0;
  while (i < inner.length) {
    // Skip whitespace between children.
    while (i < inner.length && /\s/.test(inner[i])) i++;
    if (i >= inner.length) return inner.length;

    const childStart = i;

    if (inner[i] !== "<") {
      // Top-level text node — count words, advance.
      let j = i;
      while (j < inner.length && inner[j] !== "<") j++;
      const w = countWords(inner.slice(i, j));
      if (total + w > limit) return childStart;
      total += w;
      i = j;
      continue;
    }

    // Open tag. Determine tag name.
    const tagOpen = inner.slice(i).match(/^<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/);
    if (!tagOpen) { i++; continue; }
    const tagName = tagOpen[1].toLowerCase();
    const tagAttrs = tagOpen[2];
    const fullOpenLen = tagOpen[0].length;

    // Skip top-level comments.
    if (inner.startsWith("<!--", i)) {
      const end = inner.indexOf("-->", i + 4);
      if (end < 0) return inner.length;
      i = end + 3;
      continue;
    }

    if (isVoid(tagName) || /\/\s*$/.test(tagAttrs)) {
      // Void element. Count any alt text or empty (most void elements have
      // no text content).
      const segText = tagOpen[0];
      const w = countWords(segText);
      if (total + w > limit) return childStart;
      total += w;
      i += fullOpenLen;
      continue;
    }

    // Find matching close.
    const close = findMatchingClose(inner, i + fullOpenLen, tagName);
    if (close < 0) {
      // Malformed — bail to end.
      return inner.length;
    }
    const closeEnd = close + `</${tagName}>`.length;
    // Adjust closeEnd: actually we want index AFTER `</tag>`. close is index
    // of `<`. The real close-tag length depends on the match, but `findMatchingClose`
    // searches `</tag\\s*>`. Recompute end properly:
    const closeRe = new RegExp(`</${tagName}\\s*>`, "gi");
    closeRe.lastIndex = close;
    const cm = closeRe.exec(inner);
    const actualCloseEnd = cm ? cm.index + cm[0].length : closeEnd;

    const segText = inner.slice(i, actualCloseEnd);
    const w = countWords(segText);
    if (total + w > limit) return childStart;
    total += w;
    i = actualCloseEnd;
  }
  return inner.length;
}

function countWords(html: string): number {
  // Strip tags, count non-whitespace runs.
  const text = html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ");
  const matches = text.match(/[\p{L}\p{N}]+/gu);
  return matches ? matches.length : 0;
}

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img",
  "input", "link", "meta", "param", "source", "track", "wbr",
]);
function isVoid(tag: string): boolean {
  return VOID_TAGS.has(tag.toLowerCase());
}

// ---------------------------------------------------------------------------
// Path helpers

/** Returns `<section>/<n>` for topic and topic-test paths, else null.
 *  - /bg/ortho/22/        → "ortho/22"
 *  - /en/trauma/1/test/   → "trauma/1"
 *  - /bg/qbank/           → null (non-topic page, never gated)
 *  - /bg/preface/         → null (free)
 */
export function matchTopicPath(pathname: string): { section: string; n: number; lang: "bg" | "en" } | null {
  const m = pathname.match(/^\/(bg|en)\/(ortho|trauma|anatomy)\/(\d+)(?:\/|$)/);
  if (!m) return null;
  return { lang: m[1] as "bg" | "en", section: m[2], n: parseInt(m[3], 10) };
}

export function topicKey(t: { section: string; n: number }): string {
  return `${t.section}/${t.n}`;
}

export function detectLang(pathname: string): "bg" | "en" {
  return pathname.startsWith("/en/") ? "en" : "bg";
}
