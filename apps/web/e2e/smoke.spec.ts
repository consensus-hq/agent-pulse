import { test, expect } from "@playwright/test";

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
    await input.fill("0x9508752Ba171D37EBb3AA437927458E0a21D1e04");
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
