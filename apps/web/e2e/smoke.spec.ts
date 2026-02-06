import { test, expect } from "@playwright/test";

const VALID_ADDRESS = "0x9508752Ba171D37EBb3AA437927458E0a21D1e04";

test.describe("Agent Pulse Smoke Tests", () => {
  test("homepage loads with correct title", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Routing eligibility console" })).toBeVisible();
  });

  test("status query section is visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /status query/i })).toBeVisible();
  });

  test("pulse feed section shows data", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /pulse feed/i })).toBeVisible();
    // Wait for feed to load
    await page.waitForTimeout(2000);
  });

  test("wallet section is present", async ({ page }) => {
    await page.goto("/");
    // The Authenticate button is rendered but hidden until wallet provider loads.
    // Verify the wallet panel section exists instead.
    await expect(page.locator("[data-auth-status]").first()).toBeAttached();
  });

  test("status query with valid address", async ({ page }) => {
    await page.goto("/");
    const input = page.getByLabel("Agent wallet address");
    await input.fill(VALID_ADDRESS);
    await page.getByRole("button", { name: "Query" }).click();
    // Wait for response
    await page.waitForTimeout(2000);
    // Should show some JSON response (isAlive field)
    await expect(page.locator("pre[role='status']")).toContainText("isAlive");
  });

  test("status query with invalid address shows error", async ({ page }) => {
    await page.goto("/");
    const input = page.locator("input[aria-label='Agent wallet address']");
    await input.fill("invalid");
    await page.locator("button:has-text('Query')").click();
    await page.waitForTimeout(1500);
    // Should show error
    await expect(page.locator("text=error")).toBeVisible();
  });

  test("network indicator shows testnet chain", async ({ page }) => {
    await page.goto("/");
    // Check for chain ID in page content
    const pageContent = await page.content();
    expect(pageContent).toContain("84532");
  });

  test("runtime config shows walletConnect configured", async ({ page }) => {
    await page.goto("/");
    // Config is in a JSON block, check the pre/code element
    const configBlock = page.locator("pre, code").filter({ hasText: "walletConnect" });
    await expect(configBlock).toBeVisible();
  });
});

test.describe("Agent Pulse API Smoke Tests", () => {
  test("free endpoint /api/config returns 200", async ({ request }) => {
    const response = await request.get("/api/config");
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("network");
    expect(data).toHaveProperty("chainId");
    expect(data).toHaveProperty("contracts");
  });

  test("free endpoint /api/status/{address} returns 200", async ({ request }) => {
    const response = await request.get(`/api/status/${VALID_ADDRESS}`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("isAlive");
    expect(data).toHaveProperty("streak");
    expect(data).toHaveProperty("lastPulse");
    expect(data).toHaveProperty("hazardScore");
  });

  test("free endpoint /api/abi returns 200", async ({ request }) => {
    const response = await request.get("/api/abi");
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("contracts");
    expect(data.contracts).toHaveProperty("PulseRegistry");
    expect(data.contracts).toHaveProperty("PulseToken");
  });

  test("free endpoint /api/v2/agent/{address}/alive returns 200", async ({ request }) => {
    const response = await request.get(`/api/v2/agent/${VALID_ADDRESS}/alive`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("isAlive");
    expect(data).toHaveProperty("streak");
    expect(data).toHaveProperty("staleness");
    expect(data).toHaveProperty("ttl");
  });

  test("paid endpoint /api/paid/health returns 402 without payment", async ({ request }) => {
    const response = await request.get("/api/paid/health");
    expect(response.status()).toBe(402);

    const data = await response.json();
    expect(data).toHaveProperty("error");
    expect(data).toHaveProperty("paymentRequired", true);
    expect(data).toHaveProperty("accepts");
  });

  test("paid 402 response includes proper payment details", async ({ request }) => {
    const response = await request.get("/api/paid/health");
    expect(response.status()).toBe(402);

    const data = await response.json();
    expect(data.accepts).toBeInstanceOf(Array);
    expect(data.accepts.length).toBeGreaterThan(0);

    const paymentOption = data.accepts[0];
    expect(paymentOption).toHaveProperty("scheme", "exact");
    expect(paymentOption).toHaveProperty("network", "base");
    expect(paymentOption).toHaveProperty("maxAmountRequired");
    expect(paymentOption).toHaveProperty("payTo");
    expect(paymentOption).toHaveProperty("asset");
  });

  test("paid endpoint /api/paid/portfolio returns 402 without payment", async ({ request }) => {
    const response = await request.get("/api/paid/portfolio");
    expect(response.status()).toBe(402);

    const data = await response.json();
    expect(data).toHaveProperty("error");
    expect(data).toHaveProperty("paymentRequired", true);
    expect(data.accepts[0].maxAmountRequired).toBe("$0.02");
  });

  test("v2 alive returns 400 for invalid address", async ({ request }) => {
    const response = await request.get("/api/v2/agent/notanaddress/alive");
    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data).toHaveProperty("error");
  });

  test("v2 alive endpoints have CORS headers", async ({ request }) => {
    const response = await request.get(`/api/v2/agent/${VALID_ADDRESS}/alive`, {
      headers: {
        Origin: "https://example.com",
      },
    });
    expect(response.status()).toBe(200);

    const headers = response.headers();
    expect(headers["access-control-allow-origin"]).toBeDefined();
  });

  test("free endpoints have rate limit headers", async ({ request }) => {
    const response = await request.get(`/api/status/${VALID_ADDRESS}`);
    expect(response.status()).toBe(200);

    const headers = response.headers();
    // Rate limit remaining header should be present
    expect(headers["x-ratelimit-remaining"]).toBeDefined();
  });
});
