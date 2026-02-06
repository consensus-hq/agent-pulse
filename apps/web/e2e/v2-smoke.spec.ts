import { test, expect } from "@playwright/test";

const VALID_ADDRESS = "0x9508752Ba171D37EBb3AA437927458E0a21D1e04";

test.describe("Agent Pulse v2 E2E Smoke Tests", () => {
  test("Free endpoints return 200", async ({ request }) => {
    let response = await request.get("/api/config");
    expect(response.status()).toBe(200);

    response = await request.get(`/api/status/${VALID_ADDRESS}`);
    expect(response.status()).toBe(200);

    response = await request.get("/api/abi");
    expect(response.status()).toBe(200);

    response = await request.get(`/api/v2/agent/${VALID_ADDRESS}/alive`);
    expect(response.status()).toBe(200);
  });

  test("Paid endpoints require payment: 402 without x-payment", async ({ request }) => {
    const healthResponse = await request.get("/api/paid/health");
    expect(healthResponse.status()).toBe(402);

    const portfolioResponse = await request.get("/api/paid/portfolio");
    expect(portfolioResponse.status()).toBe(402);
  });

  test("402 response includes proper payment details", async ({ request }) => {
    const response = await request.get("/api/paid/health");
    expect(response.status()).toBe(402);

    const data = await response.json();
    const paymentOption = data.accepts[0];
    expect(paymentOption).toHaveProperty("payTo");
    expect(paymentOption).toHaveProperty("maxAmountRequired");
    expect(paymentOption).toHaveProperty("network");
    expect(paymentOption).toHaveProperty("asset");
  });

  test("v2 alive response has correct shape", async ({ request }) => {
    const response = await request.get(`/api/v2/agent/${VALID_ADDRESS}/alive`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("address");
    expect(data).toHaveProperty("isAlive");
    expect(data).toHaveProperty("streak");
    expect(data).toHaveProperty("staleness");
    expect(data).toHaveProperty("ttl");
    expect(data).toHaveProperty("checkedAt");
    expect(typeof data.isAlive).toBe("boolean");
    expect(typeof data.streak).toBe("number");
  });

  test("Cache headers are present on v2 alive", async ({ request }) => {
    const response = await request.get(`/api/v2/agent/${VALID_ADDRESS}/alive`);
    const headers = response.headers();
    expect(headers["cache-control"]).toBeDefined();
    expect(headers["cache-control"]).toContain("max-age");
  });

  test("Invalid address returns 400", async ({ request }) => {
    const response = await request.get("/api/v2/agent/notanaddress/alive");
    expect(response.status()).toBe(400);
  });

  test("CORS headers on v2 endpoints", async ({ request }) => {
    const response = await request.get(`/api/v2/agent/${VALID_ADDRESS}/alive`, {
      headers: {
        Origin: "https://example.com",
      },
    });
    expect(response.status()).toBe(200);
    const headers = response.headers();
    expect(headers["access-control-allow-origin"]).toBeDefined();
  });

  test("Status endpoint includes hazard score", async ({ request }) => {
    const response = await request.get(`/api/status/${VALID_ADDRESS}`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("hazardScore");
    expect(typeof data.hazardScore).toBe("number");
    expect(data.hazardScore).toBeGreaterThanOrEqual(0);
    expect(data.hazardScore).toBeLessThanOrEqual(100);
  });

  test("Config endpoint includes contract addresses", async ({ request }) => {
    const response = await request.get("/api/config");
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.contracts).toHaveProperty("pulseToken");
    expect(data.contracts).toHaveProperty("pulseRegistry");
    expect(data.contracts).toHaveProperty("signalSink");
    expect(data.contracts.signalSink).toBe("0x000000000000000000000000000000000000dEaD");
  });

  test("Paid endpoints have x-payment-required header", async ({ request }) => {
    const response = await request.get("/api/paid/health");
    expect(response.status()).toBe(402);
    const headers = response.headers();
    expect(headers["x-payment-required"]).toBeDefined();
  });
});
