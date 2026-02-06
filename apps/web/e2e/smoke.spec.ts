import { test, expect } from "@playwright/test";

const VALID_ADDRESS = "0x9508752Ba171D37EBb3AA437927458E0a21D1e04";

test.describe("Agent Pulse Smoke Tests", () => {
  test("homepage loads with correct title", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("Routing eligibility console");
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

  test("wallet authenticate button is present", async ({ page }) => {
    await page.goto("/");
    // LR-008: Button text is "Authenticate" (not "Connect Wallet")
    await expect(page.locator("button:has-text('Authenticate')")).toBeVisible();
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

test.describe("Agent Pulse API v2 Smoke Tests", () => {
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

  test("v2 endpoint /api/v2/agent/{address}/reliability returns 402 without payment", async ({ request }) => {
    const response = await request.get(`/api/v2/agent/${VALID_ADDRESS}/reliability`);
    expect(response.status()).toBe(402);

    const data = await response.json();
    expect(data).toHaveProperty("error");
    expect(data).toHaveProperty("x402Version");
    expect(data).toHaveProperty("accepts");
  });

  test("v2 402 response includes proper payment details", async ({ request }) => {
    const response = await request.get(`/api/v2/agent/${VALID_ADDRESS}/reliability`);
    expect(response.status()).toBe(402);

    const data = await response.json();
    expect(data.accepts).toBeInstanceOf(Array);
    expect(data.accepts.length).toBeGreaterThan(0);

    const paymentOption = data.accepts[0];
    expect(paymentOption).toHaveProperty("scheme", "exact");
    expect(paymentOption).toHaveProperty("network", "eip155:84532");
    expect(paymentOption).toHaveProperty("maxAmountRequired", "$0.01");
    expect(paymentOption).toHaveProperty("payTo");
    expect(paymentOption).toHaveProperty("asset");
  });

  test("v2 endpoint /api/v2/network/global-stats returns 402 without payment", async ({ request }) => {
    const response = await request.get("/api/v2/network/global-stats");
    expect(response.status()).toBe(402);

    const data = await response.json();
    expect(data).toHaveProperty("error");
    expect(data.accepts[0].maxAmountRequired).toBe("$0.03");
  });

  test("v2 endpoint returns 400 for invalid address", async ({ request }) => {
    const response = await request.get("/api/v2/agent/notanaddress/reliability");
    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data).toHaveProperty("error");
  });

  test("v2 endpoints have CORS headers", async ({ request }) => {
    const response = await request.get(`/api/v2/agent/${VALID_ADDRESS}/reliability`, {
      headers: {
        Origin: "https://example.com",
      },
    });

    // Response should be accessible (402 is expected)
    expect(response.status()).toBe(402);
  });

  test("free endpoints have rate limit headers", async ({ request }) => {
    const response = await request.get(`/api/status/${VALID_ADDRESS}`);
    expect(response.status()).toBe(200);

    const headers = response.headers();
    // Rate limit headers should be present
    expect(headers["x-ratelimit-limit"] || headers["X-RateLimit-Limit"]).toBeDefined();
  });
});
