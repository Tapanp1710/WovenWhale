import { createHmac } from "node:crypto";
import { expect, request as playwrightRequest, test, type APIRequestContext } from "@playwright/test";
import { BASE_URL, adminApi } from "./support/fixtures";

/** RFC 6238 TOTP, computed independently of the API so the test checks real interoperability. */
function totp(secretB32: string, offsetSteps = 0) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secretB32.replace(/\s/g, "")) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offsetSteps));
  const h = createHmac("sha1", key).update(msg).digest();
  const o = h[h.length - 1]! & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

const newContext = () => playwrightRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL } });

async function createAdmin(owner: APIRequestContext, role = "ORDER_MANAGER") {
  const email = `mfa-${Date.now()}-${Math.floor(Math.random() * 1e4)}@wovenwhale.local`;
  const password = "Mfa-Test-Pass-2026";
  const res = await owner.post("/api/admin/admins", { data: { email, fullName: "MFA Tester", role, password } });
  expect(res.ok()).toBe(true);
  const list = (await (await owner.get("/api/admin/admins")).json()) as { id: string; email: string }[];
  return { email, password, id: list.find((a) => a.email === email)!.id };
}

async function login(email: string, password: string) {
  const api = await newContext();
  const res = await api.post("/api/admin/auth/login", { data: { email, password } });
  expect(res.ok()).toBe(true);
  return { api, step: ((await res.json()) as { step: string }).step };
}

/** Creates an admin and enrols them in 2FA. Returns the secret and recovery codes. */
async function enrolledAdmin(owner: APIRequestContext) {
  const admin = await createAdmin(owner);
  const { api } = await login(admin.email, admin.password);
  const { secret } = (await (await api.post("/api/admin/auth/2fa/setup")).json()) as { secret: string };
  const enrolCode = totp(secret);
  const enabled = await api.post("/api/admin/auth/2fa/enable", { data: { code: enrolCode } });
  expect(enabled.ok()).toBe(true);
  const { recoveryCodes } = (await enabled.json()) as { recoveryCodes: string[] };
  await api.dispose();
  return { ...admin, secret, recoveryCodes, enrolCode };
}

const auditActions = async (owner: APIRequestContext, id: string) =>
  ((await (await owner.get(`/api/admin/audit-logs?entityType=admin_user&entityId=${id}`)).json()) as { items: { action: string }[] }).items.map(
    (a) => a.action,
  );

test.describe("admin two-factor authentication", () => {
  test("enrolment: wrong code refused, correct code enables 2FA and issues recovery codes", async () => {
    const owner = await adminApi();
    const admin = await createAdmin(owner);
    const { api } = await login(admin.email, admin.password);

    const setup = (await (await api.post("/api/admin/auth/2fa/setup")).json()) as { secret: string; otpauthUrl: string; qrDataUrl: string };
    expect(setup.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(setup.otpauthUrl).toContain("otpauth://totp/");
    expect(setup.qrDataUrl).toMatch(/^data:image\/png;base64,/);

    const wrong = await api.post("/api/admin/auth/2fa/enable", { data: { code: totp(setup.secret, 5) } });
    expect(wrong.status()).toBe(401);

    const ok = await api.post("/api/admin/auth/2fa/enable", { data: { code: totp(setup.secret) } });
    expect(ok.ok()).toBe(true);
    const { recoveryCodes } = (await ok.json()) as { recoveryCodes: string[] };
    expect(recoveryCodes).toHaveLength(10);
    // The rotated session is fully signed in.
    expect((await api.get("/api/admin/auth/me")).ok()).toBe(true);
    expect(await auditActions(owner, admin.id)).toContain("admin.mfa_enabled");
    await Promise.all([api.dispose(), owner.dispose()]);
  });

  test("sign-in: password alone gives no access; a replayed code is refused; a fresh code signs in", async () => {
    const owner = await adminApi();
    const admin = await enrolledAdmin(owner);
    const { api, step } = await login(admin.email, admin.password);
    expect(step).toBe("verify");

    // Password-only session: every admin API is closed, including /me.
    expect((await api.get("/api/admin/orders")).status()).toBe(401);
    expect((await api.get("/api/admin/auth/me")).status()).toBe(401);

    // The code used for enrolment can't be replayed.
    expect((await api.post("/api/admin/auth/2fa/verify", { data: { method: "totp", code: admin.enrolCode } })).status()).toBe(401);
    // The next time step's code is accepted (±1 step drift window).
    expect((await api.post("/api/admin/auth/2fa/verify", { data: { method: "totp", code: totp(admin.secret, 1) } })).ok()).toBe(true);
    expect((await api.get("/api/admin/orders")).ok()).toBe(true);

    // 2FA doesn't widen RBAC: an order manager still can't manage coupons.
    expect((await api.post("/api/admin/coupons", { data: { code: "NOPE20", type: "PERCENTAGE", value: 20 } })).status()).toBe(403);
    await Promise.all([api.dispose(), owner.dispose()]);
  });

  test("recovery codes work exactly once", async () => {
    const owner = await adminApi();
    const admin = await enrolledAdmin(owner);
    const code = admin.recoveryCodes[0]!;

    const first = await login(admin.email, admin.password);
    expect((await first.api.post("/api/admin/auth/2fa/verify", { data: { method: "recovery", code: code.toLowerCase() } })).ok()).toBe(true);

    const second = await login(admin.email, admin.password);
    expect((await second.api.post("/api/admin/auth/2fa/verify", { data: { method: "recovery", code } })).status()).toBe(401);
    expect(await auditActions(owner, admin.id)).toContain("admin.recovery_code_used");
    await Promise.all([first.api.dispose(), second.api.dispose(), owner.dispose()]);
  });

  test("brute force: five wrong codes lock 2FA, even a correct code is then refused, and a reset clears it", async () => {
    const owner = await adminApi();
    const admin = await enrolledAdmin(owner);
    const { api } = await login(admin.email, admin.password);

    // Guesses sent in parallel are still bounded by the counter.
    const guesses = await Promise.all(
      Array.from({ length: 8 }, (_, i) => api.post("/api/admin/auth/2fa/verify", { data: { method: "totp", code: String(100000 + i) } })),
    );
    const statuses = guesses.map((g) => g.status());
    expect(statuses.filter((s) => s === 401).length).toBeLessThanOrEqual(5);
    expect(statuses).toContain(429);

    const correct = await api.post("/api/admin/auth/2fa/verify", { data: { method: "totp", code: totp(admin.secret, 1) } });
    expect(correct.status()).toBe(429);

    const actions = await auditActions(owner, admin.id);
    expect(actions).toContain("admin.mfa_failed");
    expect(actions).toContain("admin.mfa_locked");

    // A super admin resets 2FA for a locked-out admin; they are signed out.
    expect((await owner.post(`/api/admin/admins/${admin.id}/reset-2fa`)).ok()).toBe(true);
    expect((await api.get("/api/admin/auth/2fa/status")).status()).toBe(401);
    const relogin = await login(admin.email, admin.password);
    expect(relogin.step).toBe("done"); // 2FA is optional in development; required in production.
    await Promise.all([api.dispose(), relogin.api.dispose(), owner.dispose()]);
  });

  test("only admins with admins.manage can reset someone else's 2FA", async () => {
    const owner = await adminApi();
    const target = await enrolledAdmin(owner);
    const manager = await enrolledAdmin(owner);
    const { api } = await login(manager.email, manager.password);
    await api.post("/api/admin/auth/2fa/verify", { data: { method: "totp", code: totp(manager.secret, 1) } });
    expect((await api.post(`/api/admin/admins/${target.id}/reset-2fa`)).status()).toBe(403);
    await Promise.all([api.dispose(), owner.dispose()]);
  });

  test("UI: set up 2FA from Sign-in security, then sign in with a code", async ({ page }) => {
    const owner = await adminApi();
    const admin = await createAdmin(owner);
    await owner.dispose();

    await page.goto("/admin/login?next=/admin/security");
    await page.getByLabel("Email").fill(admin.email);
    await page.getByLabel("Password").fill(admin.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByRole("heading", { name: "Sign-in security" })).toBeVisible();

    await page.getByRole("link", { name: "Set up two-factor" }).click();
    await page.getByRole("button", { name: "Start setup" }).click();
    await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();
    await page.getByText("Can't scan it?").click();
    const secret = (await page.getByTestId("totp-secret").innerText()).replace(/\s/g, "");
    await page.getByLabel(/6-digit code/).fill(totp(secret));
    await page.getByRole("button", { name: "Turn on two-factor" }).click();
    await expect(page.getByTestId("recovery-codes").locator("li")).toHaveCount(10);
    await page.getByLabel("I've saved my recovery codes").check();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Sign-in security" })).toBeVisible();
    await expect(page.getByText("Recovery codes left")).toBeVisible();

    // Sign out, then sign back in through the second step.
    await page.context().clearCookies();
    await page.goto("/admin/login?next=/admin/orders");
    await page.getByLabel("Email").fill(admin.email);
    await page.getByLabel("Password").fill(admin.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByRole("heading", { name: "Two-factor verification" })).toBeVisible();
    await page.getByLabel("Authenticator code").fill("000000");
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByText(/That code didn't work/)).toBeVisible();
    await page.getByLabel("Authenticator code").fill(totp(secret, 1));
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page).toHaveURL(/\/admin\/orders/);
  });
});
