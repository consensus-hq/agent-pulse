import { test, expect } from "@playwright/test";

test.describe("Agent Pulse Smoke Tests", () => {
  test("homepage loads with correct title", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("Routing eligibility console");
  });

  test("status query section is visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Status query")).toBeVisible();
  });

  test("pulse feed section shows data", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Pulse feed")).toBeVisible();
    // Wait for feed to load
    await page.waitForTimeout(2000);
    // Should show at least headers
    await expect(page.locator("text=Agent")).toBeVisible();
  });

  test("wallet connect button is present", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("button:has-text('Connect Wallet')")).toBeVisible();
  });

  test("status query with valid address", async ({ page }) => {
    await page.goto("/");
    const input = page.locator("input[aria-label='Agent wallet address']");
    await input.fill("0x9508752Ba171D37EBb3AA437927458E0a21D1e04");
    await page.locator("button:has-text('Query')").click();
    // Wait for response
    await page.waitForTimeout(1500);
    // Should show some status data
    await expect(page.locator("pre")).not.toContainText("// Status payload will appear here.");
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

  test("network indicator shows Base Sepolia", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Base Sepolia")).toBeVisible();
  });

  test("runtime config shows walletConnect configured", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=walletConnect")).toBeVisible();
    await expect(page.locator("text=configured")).toBeVisible();
  });
});
