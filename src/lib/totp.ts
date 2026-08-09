// RFC 6238 TOTP + RFC 4648 Base32, implemented on node:crypto (no dependency).
// Used for approver-role 2FA (track 5c). Defaults: HMAC-SHA1, 30s step, 6 digits.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PERIOD = 30;
const DIGITS = 6;

/** Encode bytes to unpadded, uppercase Base32. */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

/** Decode a Base32 string (ignores spaces / padding / case). */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Generate a new random Base32 secret (default 20 bytes = 160 bits). */
export function generateSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

/** HOTP (RFC 4226): 6-digit code for a given counter. */
function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  // 64-bit big-endian counter (safe for the ~centuries-out range we use).
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, "0");
}

/** Current TOTP code (optionally at a fixed unix-seconds time, for testing). */
export function totp(secret: string, atUnixSeconds = Date.now() / 1000): string {
  return hotp(secret, Math.floor(atUnixSeconds / PERIOD));
}

/**
 * Verify a submitted token against the secret, tolerating clock drift of
 * +/- `window` steps (default 1 = +/-30s). Constant-time digit comparison.
 */
export function verifyTotp(
  secret: string,
  token: string,
  window = 1,
  atUnixSeconds = Date.now() / 1000,
): boolean {
  const cleaned = (token || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(cleaned) || !secret) return false;
  const counter = Math.floor(atUnixSeconds / PERIOD);
  for (let i = -window; i <= window; i++) {
    const candidate = hotp(secret, counter + i);
    if (
      candidate.length === cleaned.length &&
      timingSafeEqual(Buffer.from(candidate), Buffer.from(cleaned))
    ) {
      return true;
    }
  }
  return false;
}

/** otpauth:// URI for authenticator apps (manual key entry or QR). */
export function otpauthUri(
  secret: string,
  account: string,
  issuer = "UniTech PM",
): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(PERIOD),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Format a secret in groups of 4 for readable manual entry. */
export function formatSecretForDisplay(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}
