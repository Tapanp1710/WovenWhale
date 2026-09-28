import { describe, expect, it } from "vitest";
import { mfaVerifySchema } from "../../src/contracts/admin";
import { adminLoginStep } from "../../src/domain/mfa";
import {
  base32Decode,
  base32Encode,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  hotp,
  otpauthUrl,
  totpCode,
  verifyTotp,
} from "../../src/lib/totp";

// RFC 6238 appendix B uses the ASCII secret "12345678901234567890" (SHA-1).
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));
const KEY = "k".repeat(48);

describe("TOTP (RFC 6238)", () => {
  it("matches the RFC test vectors (last 6 digits)", () => {
    const vectors: [number, string][] = [
      [59, "287082"],
      [1111111109, "081804"],
      [1111111111, "050471"],
      [1234567890, "005924"],
      [2000000000, "279037"],
    ];
    for (const [seconds, code] of vectors) expect(totpCode(RFC_SECRET, seconds * 1000)).toBe(code);
  });

  it("matches the RFC 4226 HOTP vectors", () => {
    const key = Buffer.from("12345678901234567890");
    expect([0, 1, 2, 9].map((c) => hotp(key, c))).toEqual(["755224", "287082", "359152", "520489"]);
  });

  it("round-trips base32", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
  });

  it("accepts ±1 step of clock drift and returns the matched step", () => {
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now), now)).toBe(step);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now - 30_000), now)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now + 30_000), now)).toBe(step + 1);
  });

  it("rejects codes outside the window and malformed input", () => {
    const now = 1_700_000_000_000;
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now - 90_000), now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "12345", now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "abcdef", now)).toBeNull();
  });

  it("builds an otpauth URL authenticator apps understand", () => {
    const url = new URL(otpauthUrl("ABC234", "owner@wovenwhale.com", "WovenWhale Admin"));
    expect(url.protocol).toBe("otpauth:");
    expect(url.searchParams.get("secret")).toBe("ABC234");
    expect(url.searchParams.get("issuer")).toBe("WovenWhale Admin");
  });
});

describe("TOTP secret encryption at rest", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encryptSecret("SECRET", KEY);
    const b = encryptSecret("SECRET", KEY);
    expect(a).not.toBe(b);
    expect(a).not.toContain("SECRET");
    expect(decryptSecret(a, KEY)).toBe("SECRET");
  });

  it("fails with the wrong key or tampered ciphertext", () => {
    const sealed = encryptSecret("SECRET", KEY);
    expect(() => decryptSecret(sealed, "x".repeat(48))).toThrow();
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."), KEY)).toThrow();
  });
});

describe("recovery codes", () => {
  it("generates ten unique XXXXX-XXXXX codes", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/);
  });

  it("hashes with a key and ignores case and separators", () => {
    const code = "ABCDE-FGHJK";
    expect(hashRecoveryCode("abcde fghjk", KEY)).toBe(hashRecoveryCode(code, KEY));
    expect(hashRecoveryCode(code, KEY)).not.toBe(hashRecoveryCode(code, "y".repeat(48)));
  });

  it("validates the second-step input shape", () => {
    expect(mfaVerifySchema.safeParse({ method: "totp", code: "123456" }).success).toBe(true);
    expect(mfaVerifySchema.safeParse({ method: "totp", code: "12345a" }).success).toBe(false);
    expect(mfaVerifySchema.safeParse({ method: "recovery", code: "ABCDE-FGHJK" }).success).toBe(true);
    expect(mfaVerifySchema.safeParse({ method: "recovery", code: "' OR 1=1 --" }).success).toBe(false);
  });
});

describe("admin sign-in step", () => {
  it("requires verification for enrolled admins, enrolment when mandatory, else done", () => {
    expect(adminLoginStep(true, false)).toBe("verify");
    expect(adminLoginStep(true, true)).toBe("verify");
    expect(adminLoginStep(false, true)).toBe("enroll");
    expect(adminLoginStep(false, false)).toBe("done");
  });
});
