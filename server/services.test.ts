import { describe, expect, it, vi, beforeEach } from "vitest";
import { searchSinapi, getSinapiComposition, getSinapiPriceByDescription } from "./services/sinapi";
import { searchPini, getPiniComposition, comparePrices, getRegionalFactor } from "./services/pini";

// Mock database functions
vi.mock("./db", () => ({
  getCachedPrice: vi.fn().mockResolvedValue(null),
  setCachedPrice: vi.fn().mockResolvedValue(undefined),
}));

describe("SINAPI Service", () => {
  describe("searchSinapi", () => {
    it("returns results for valid query", async () => {
      const results = await searchSinapi("alvenaria", 5);
      
      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty("code");
      expect(results[0]).toHaveProperty("description");
      expect(results[0]).toHaveProperty("unit");
      expect(results[0]).toHaveProperty("price");
    });

    it("returns empty array for non-matching query", async () => {
      const results = await searchSinapi("xyznonexistent123", 5);
      expect(results).toEqual([]);
    });

    it("respects limit parameter", async () => {
      const results = await searchSinapi("piso", 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe("getSinapiComposition", () => {
    it("returns composition for valid code", async () => {
      const composition = await getSinapiComposition("87292");
      
      expect(composition).not.toBeNull();
      expect(composition?.code).toBe("87292");
      expect(composition?.price).toBeGreaterThan(0);
      expect(composition?.unit).toBe("M2");
    });

    it("returns null for invalid code", async () => {
      const composition = await getSinapiComposition("INVALID999");
      expect(composition).toBeNull();
    });
  });

  describe("getSinapiPriceByDescription", () => {
    it("finds price by description", async () => {
      const result = await getSinapiPriceByDescription("pintura latex");
      
      expect(result).not.toBeNull();
      expect(result?.price).toBeGreaterThan(0);
    });
  });
});

describe("PINI Service", () => {
  describe("searchPini", () => {
    it("returns results for valid query", async () => {
      const results = await searchPini("alvenaria", "São Paulo", 5);
      
      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty("code");
      expect(results[0]).toHaveProperty("description");
      expect(results[0]).toHaveProperty("region");
    });

    it("returns empty array for non-matching query", async () => {
      const results = await searchPini("xyznonexistent123", "São Paulo", 5);
      expect(results).toEqual([]);
    });
  });

  describe("getPiniComposition", () => {
    it("returns composition for valid code", async () => {
      const composition = await getPiniComposition("TCPO-02.PARE.ALVE.001");
      
      expect(composition).not.toBeNull();
      expect(composition?.code).toBe("TCPO-02.PARE.ALVE.001");
      expect(composition?.laborCost).toBeGreaterThan(0);
      expect(composition?.materialCost).toBeGreaterThan(0);
    });

    it("returns null for invalid code", async () => {
      const composition = await getPiniComposition("INVALID-CODE");
      expect(composition).toBeNull();
    });
  });

  describe("getRegionalFactor", () => {
    it("returns 1.0 for São Paulo", () => {
      expect(getRegionalFactor("São Paulo")).toBe(1.0);
    });

    it("returns higher factor for Rio de Janeiro", () => {
      expect(getRegionalFactor("Rio de Janeiro")).toBe(1.05);
    });

    it("returns 1.0 for unknown region", () => {
      expect(getRegionalFactor("Unknown Region")).toBe(1.0);
    });
  });

  describe("comparePrices", () => {
    it("compares prices from both sources", async () => {
      const comparison = await comparePrices("alvenaria bloco");
      
      expect(comparison).toHaveProperty("sinapi");
      expect(comparison).toHaveProperty("pini");
      expect(comparison).toHaveProperty("recommendation");
      expect(comparison).toHaveProperty("recommendedPrice");
      expect(["sinapi", "pini", "average"]).toContain(comparison.recommendation);
    });
  });
});
