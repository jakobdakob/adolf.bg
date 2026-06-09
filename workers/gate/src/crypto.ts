// JWT (HS256), HMAC, SHA-256, hex/base64url helpers.
//
// All hand-rolled with Web Crypto — no third-party crypto libs in the
// Worker bundle. Constant-time signature comparison used in verifyJwt and
// verifyHmac.

const enc = new TextEncoder();
const dec = new TextDecoder();

// ---------------------------------------------------------------------------
// Encoding helpers

function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = "";
  for (let i = 0; i < u8.length; i++) out += u8[i].toString(16).padStart(2, "0");
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, "");
  if (clean.length % 2 !== 0) throw new Error("hex string must be even length");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeBytes(s: string): Uint8Array {
  let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function base64UrlEncodeString(s: string): string {
  return base64UrlEncodeBytes(enc.encode(s));
}

export function base64UrlDecodeString(s: string): string {
  return dec.decode(base64UrlDecodeBytes(s));
}

// Constant-time byte compare
function ctEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Hashing

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return bytesToHex(buf);
}

// Salted email hash → KV key. Normalize email (lowercase, trim) before
// hashing so a@x.com and A@x.com map to the same record.
export async function emailKey(email: string, salt: string): Promise<string> {
  return sha256Hex(email.trim().toLowerCase() + "::" + salt);
}

// Fingerprint hash — derives a short stable id from User-Agent and
// Accept-Language. Pulls main UA family so light UA quirks (Chrome minor
// version, etc.) don't churn the value too aggressively, but cross-device
// sharing still breaks.
export async function fingerprintHash(ua: string, acceptLang: string, salt: string): Promise<string> {
  // Reduce UA to platform + browser family to allow harmless minor-version drift.
  const fam = uaFamily(ua);
  const lang = (acceptLang || "").split(",")[0]?.trim().toLowerCase() || "";
  const full = await sha256Hex([fam, lang, salt].join("::"));
  return full.slice(0, 32); // 128-bit truncated fp claim
}

function uaFamily(ua: string): string {
  // Coarse: platform + primary browser. Don't include version numbers.
  const u = ua || "";
  const platform =
    /iphone|ipad|ipod/i.test(u) ? "iOS" :
    /android/i.test(u) ? "Android" :
    /macintosh|mac os x/i.test(u) ? "macOS" :
    /windows nt/i.test(u) ? "Windows" :
    /linux/i.test(u) ? "Linux" : "Other";
  const browser =
    /edg\//i.test(u) ? "Edge" :
    /firefox\//i.test(u) ? "Firefox" :
    /chrome\//i.test(u) ? "Chrome" :
    /safari\//i.test(u) ? "Safari" :
    /opr\//i.test(u) ? "Opera" : "Other";
  return `${platform}/${browser}`;
}

// ---------------------------------------------------------------------------
// HMAC-SHA256

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return bytesToHex(sig);
}

// Stripe webhook signature verification. The header has form:
//   t=<timestamp>,v1=<sig>[,v1=<sig2>...]
// Where sig = HMAC_SHA256(secret, `${t}.${payload}`).
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.trim());
  const tPart = parts.find((p) => p.startsWith("t="));
  const v1Parts = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!tPart || v1Parts.length === 0) return false;
  const ts = parseInt(tPart.slice(2), 10);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > toleranceSeconds) return false;
  const expected = await hmacSha256Hex(secret, `${ts}.${payload}`);
  const expectedBytes = hexToBytes(expected);
  for (const sig of v1Parts) {
    try {
      const sigBytes = hexToBytes(sig);
      if (ctEqual(expectedBytes, sigBytes)) return true;
    } catch { /* ignore malformed */ }
  }
  return false;
}

// ---------------------------------------------------------------------------
// JWT (HS256)

export interface JwtClaims {
  sub: string;     // email_hash
  iat: number;     // issued at (unix seconds)
  exp: number;     // expires at (unix seconds)
  fp: string;      // fingerprint hash (UA + Accept-Language)
  jti: string;     // unique session id — must match KV.active_device_jti
                   // for the request to be authenticated (single-device).
}

/** Random 128-bit hex string. Used as JWT `jti` and to identify the device
 *  that currently holds the single active session. */
export function genJti(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function signJwt(claims: JwtClaims, secret: string): Promise<string> {
  const header = base64UrlEncodeString(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncodeString(JSON.stringify(claims));
  const signingInput = `${header}.${body}`;
  const sig = await hmacSha256Hex(secret, signingInput);
  const sigB64 = base64UrlEncodeBytes(hexToBytes(sig));
  return `${signingInput}.${sigB64}`;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtClaims | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, bodyB64, sigB64] = parts;
  const signingInput = `${headerB64}.${bodyB64}`;
  const expected = await hmacSha256Hex(secret, signingInput);
  let provided: Uint8Array;
  try {
    provided = base64UrlDecodeBytes(sigB64);
  } catch {
    return null;
  }
  if (!ctEqual(hexToBytes(expected), provided)) return null;
  let claims: JwtClaims;
  try {
    claims = JSON.parse(base64UrlDecodeString(bodyB64));
  } catch {
    return null;
  }
  if (typeof claims.exp !== "number" || claims.exp < Math.floor(Date.now() / 1000)) return null;
  if (typeof claims.sub !== "string" || typeof claims.fp !== "string" || typeof claims.jti !== "string") return null;
  return claims;
}

// Short-lived magic-link tokens — same HS256, narrower payload.
export interface MagicLinkClaims {
  email: string;
  purpose: "magic-link";
  iat: number;
  exp: number;
  nonce: string;
}

export async function signMagicToken(email: string, secret: string, ttlSeconds = 900): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const claims: MagicLinkClaims = {
    email: email.trim().toLowerCase(),
    purpose: "magic-link",
    iat: now,
    exp: now + ttlSeconds,
    nonce: bytesToHex(nonceBytes),
  };
  const header = base64UrlEncodeString(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncodeString(JSON.stringify(claims));
  const signingInput = `${header}.${body}`;
  const sig = await hmacSha256Hex(secret, signingInput);
  const sigB64 = base64UrlEncodeBytes(hexToBytes(sig));
  return `${signingInput}.${sigB64}`;
}

export async function verifyMagicToken(token: string, secret: string): Promise<MagicLinkClaims | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, bodyB64, sigB64] = parts;
  const signingInput = `${headerB64}.${bodyB64}`;
  const expected = await hmacSha256Hex(secret, signingInput);
  let provided: Uint8Array;
  try {
    provided = base64UrlDecodeBytes(sigB64);
  } catch {
    return null;
  }
  if (!ctEqual(hexToBytes(expected), provided)) return null;
  let claims: MagicLinkClaims;
  try {
    claims = JSON.parse(base64UrlDecodeString(bodyB64));
  } catch {
    return null;
  }
  if (claims.purpose !== "magic-link") return null;
  if (typeof claims.exp !== "number" || claims.exp < Math.floor(Date.now() / 1000)) return null;
  if (typeof claims.email !== "string") return null;
  return claims;
}

// ---------------------------------------------------------------------------
// Re-export for callers that just want the bytesToHex utility
export { bytesToHex, hexToBytes };
