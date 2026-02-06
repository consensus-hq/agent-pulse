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
  });

  test("v2 endpoints require payment: 402 without X-PAYMENT", async ({ request }) => {
    const response = await request.get(`/api/v2/agent/${VALID_ADDRESS}/reliability`);
    expect(response.status()).toBe(402);
  });

  test("402 response includes proper payment details", async ({ request }) => {
    const response = await request.get(`/api/v2/agent/${VALID_ADDRESS}/reliability`);
    expect(response.status()).toBe(402);

    const data = await response.json();
    const paymentOption = data.accepts[0];
    expect(paymentOption).toHaveProperty("payTo");
    expect(paymentOption).toHaveProperty("maxAmountRequired");
    expect(paymentOption).toHaveProperty("network");
  });

  test("Rate limiting: 61 rapid requests trigger 429 on 61st", async ({ request }) => {
    for (let i = 1; i <= 60; i++) {
      const res = await request.get(`/api/v2/agent/${VALID_ADDRESS}/reliability`);
      expect(res.status()).toBe(402);
    }
    const res61 = await request.get(`/api/v2/agent/${VALID_ADDRESS}/reliability`);
    expect(res61.status()).toBe(429);
  });

  test("Cache headers are present", async ({ request }) => {
    const response = await request.get(`/api/v2/agent/${VALID_ADDRESS}/reliability`);
    const headers = response.headers();
    expect(headers).toHaveProperty("x-cache-status");
    expect(headers).toHaveProperty("x-cache-age");
  });

  test("Invalid address returns 400", async ({ request }) => {
    const response = await request.get("/api/v2/agent/notanaddress/reliability");
    expect(response.status()).toBe(400);
  });

  test("CORS headers on v2 endpoints", async ({ request }) => {
    const response = await request.get(`/api/v2/agent/${VALID_ADDRESS}/reliability`, {
      headers: {
        Origin: "https://example.com",
      },
    });
    expect(response.status()).toBe(402);
    const headers = response.headers();
    expect(headers["access-control-allow-origin"]).toBeDefined();
    // Optionally: expect(headers["access-control-allow-origin"]).toBe("*"); or the origin
  });
});
