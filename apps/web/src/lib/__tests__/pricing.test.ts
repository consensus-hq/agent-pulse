import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculatePrice } from "../pricing";

describe("Pricing Infrastructure", () => {
  const BASE_PRICE = 1000n;

  it("calculates 1.5x price for real-time data (age 0)", () => {
    const price = calculatePrice(BASE_PRICE, 0);
    expect(price).toBe(1500n);
  });

  it("calculates 0.5x price for cached data (age <= 1h)", () => {
    const price = calculatePrice(BASE_PRICE, 60); // 1 minute
    expect(price).toBe(500n);
    
    const priceLimit = calculatePrice(BASE_PRICE, 3600); // 1 hour
    expect(priceLimit).toBe(500n);
  });

  it("calculates 1.0x price for old cached data (age > 1h)", () => {
    const price = calculatePrice(BASE_PRICE, 3601);
    expect(price).toBe(1000n);
  });
});
