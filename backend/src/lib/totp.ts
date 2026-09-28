import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, randomInt } from "node:crypto";
import { safeEqual } from "./crypto";

/**
 * TOTP (RFC 6238: HMAC-SHA1, 30-second steps, 6 digits), the format every
 * authenticator app supports. Pure functions; persistence lives in the admin
 * MFA service.
 */
export const TOTP_PERIOD_SECONDS = 30;
const DIGITS = 6;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = BASE32.indexOf(char);
    if (idx === -1) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160-bit secret, base32 encoded (RFC 4226 recommended length). */
export const generateTotpSecret = () => base32Encode(randomBytes(20));

export function hotp(secret: Buffer, counter: number, digits = DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(msg).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return code.toString().padStart(digits, "0");
}

export const totpStep = (nowMs = Date.now()) => Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);

export const totpCode = (secretB32: string, nowMs = Date.now()) => hotp(base32Decode(secretB32), totpStep(nowMs));

/**
 * Returns the matched time step (allowing ±1 step of clock drift), or null.
 * Callers must reject steps at or below the last accepted one to stop replay.
 */
export function verifyTotp(secretB32: string, code: string, nowMs = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const key = base32Decode(secretB32);
  const current = totpStep(nowMs);
  let matched: number | null = null;
  // Check every candidate (no early exit) so timing doesn't reveal which step matched.
  for (const step of [current - 1, current, current + 1]) {
    if (safeEqual(hotp(key, step), code)) matched = step;
  }
  return matched;
}

export function otpauthUrl(secretB32: string, account: string, issuer: string) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretB32,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/* ───────────────────────── Secret encryption at rest ───────────────────────── */

const deriveKey = (keyMaterial: string) => Buffer.from(hkdfSync("sha256", keyMaterial, "wovenwhale", "totp-secret-v1", 32));

/** AES-256-GCM. Format: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function encryptSecret(plain: string, keyMaterial: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(keyMaterial), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(sealed: string, keyMaterial: string): string {
  const [version, iv, tag, ct] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !ct) throw new Error("Unsupported secret format");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(keyMaterial), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

/* ─────────────────────────────── Recovery codes ─────────────────────────────── */

const RECOVERY_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I

/** Ten codes of 10 characters (50 bits each), shown as XXXXX-XXXXX. */
export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    let raw = "";
    for (let i = 0; i < 10; i++) raw += RECOVERY_ALPHABET[randomInt(0, RECOVERY_ALPHABET.length)];
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export const normalizeRecoveryCode = (code: string) => code.toUpperCase().replace(/[^0-9A-Z]/g, "");

/** Keyed hash, so a database leak alone can't be brute-forced offline. */
export const hashRecoveryCode = (code: string, keyMaterial: string) =>
  createHmac("sha256", deriveKey(keyMaterial)).update(normalizeRecoveryCode(code)).digest("hex");
