import { describe, it, expect } from "vitest";

// Test SINAPI expanded database
describe("SINAPI Expanded Database", () => {
  it("should have 170+ compositions", async () => {
    const { getSinapiCount } = await import("./services/sinapi");
    expect(getSinapiCount()).toBeGreaterThanOrEqual(170);
  });

  it("should search by description", async () => {
    const { searchSinapi } = await import("./services/sinapi");
    const results = await searchSinapi("pintura latex acrilica");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty("code");
    expect(results[0]).toHaveProperty("description");
    expect(results[0]).toHaveProperty("price");
    expect(results[0]).toHaveProperty("unit");
  });

  it("should get composition by code", async () => {
    const { getSinapiComposition } = await import("./services/sinapi");
    const comp = await getSinapiComposition("88489");
    expect(comp).not.toBeNull();
    if (comp) {
      expect(comp.code).toBe("88489");
      expect(comp.price).toBeGreaterThan(0);
      expect(comp.category).toBeDefined();
    }
  });

  it("should adjust prices by state", async () => {
    const { searchSinapi } = await import("./services/sinapi");
    const spResults = await searchSinapi("concreto usinado", 1, "SP");
    const amResults = await searchSinapi("concreto usinado", 1, "AM");
    expect(spResults.length).toBeGreaterThan(0);
    expect(amResults.length).toBeGreaterThan(0);
    // Amazonas should be more expensive than São Paulo (factor 1.12 vs 1.0)
    expect(amResults[0].price).toBeGreaterThan(spResults[0].price);
  });

  it("should search for posto de combustivel items", async () => {
    const { searchSinapi } = await import("./services/sinapi");
    const results = await searchSinapi("tanque subterraneo");
    expect(results.length).toBeGreaterThan(0);
    const hasPosto = results.some(r => r.code.startsWith("PC"));
    expect(hasPosto).toBe(true);
  });

  it("should return empty for non-matching search", async () => {
    const { searchSinapi } = await import("./services/sinapi");
    const results = await searchSinapi("xyznonexistent12345");
    expect(results.length).toBe(0);
  });

  it("should get price by description", async () => {
    const { getSinapiPriceByDescription } = await import("./services/sinapi");
    const result = await getSinapiPriceByDescription("concreto usinado");
    expect(result).not.toBeNull();
    if (result) {
      expect(result.price).toBeGreaterThan(0);
    }
  });
});

// Test PINI expanded database
describe("PINI Expanded Database", () => {
  it("should have 80+ compositions", async () => {
    const { getPiniCount } = await import("./services/pini");
    expect(getPiniCount()).toBeGreaterThanOrEqual(80);
  });

  it("should search by description", async () => {
    const { searchPini } = await import("./services/pini");
    const results = await searchPini("piso ceramico");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty("code");
    expect(results[0]).toHaveProperty("description");
    expect(results[0]).toHaveProperty("price");
  });

  it("should get composition by code", async () => {
    const { getPiniComposition } = await import("./services/pini");
    const comp = await getPiniComposition("TCPO-02.PINT.LATE.001");
    expect(comp).not.toBeNull();
    if (comp) {
      expect(comp.code).toBe("TCPO-02.PINT.LATE.001");
      expect(comp.price).toBeGreaterThan(0);
      expect(comp.laborCost).toBeGreaterThan(0);
      expect(comp.materialCost).toBeGreaterThan(0);
      expect(comp.components).toBeDefined();
      expect(comp.components!.length).toBeGreaterThan(0);
    }
  });

  it("should adjust prices by region", async () => {
    const { searchPini } = await import("./services/pini");
    const spResults = await searchPini("piso ceramico", "São Paulo", 1);
    const rjResults = await searchPini("piso ceramico", "Rio de Janeiro", 1);
    expect(spResults.length).toBeGreaterThan(0);
    expect(rjResults.length).toBeGreaterThan(0);
    // Rio de Janeiro should be slightly more expensive (factor 1.05 vs 1.0)
    expect(rjResults[0].price).toBeGreaterThan(spResults[0].price);
  });

  it("should search for posto de combustivel items", async () => {
    const { searchPini } = await import("./services/pini");
    const results = await searchPini("bomba abastecimento");
    expect(results.length).toBeGreaterThan(0);
    const hasPosto = results.some(r => r.code.startsWith("TCPO-PC"));
    expect(hasPosto).toBe(true);
  });

  it("should get price by description", async () => {
    const { getPiniPriceByDescription } = await import("./services/pini");
    const result = await getPiniPriceByDescription("porta madeira");
    expect(result).not.toBeNull();
    if (result) {
      expect(result.price).toBeGreaterThan(0);
    }
  });

  it("should have decomposition for alvenaria", async () => {
    const { getPiniComposition } = await import("./services/pini");
    const comp = await getPiniComposition("TCPO-02.PARE.ALVE.001");
    expect(comp).not.toBeNull();
    if (comp) {
      expect(comp.components).toBeDefined();
      expect(comp.components!.length).toBeGreaterThan(0);
      const hasLabor = comp.components!.some(c => c.type === "labor");
      const hasMaterial = comp.components!.some(c => c.type === "material");
      expect(hasLabor).toBe(true);
      expect(hasMaterial).toBe(true);
    }
  });
});

// Test cross-database comparison
describe("SINAPI + PINI Price Comparison", () => {
  it("should compare prices across databases", async () => {
    const { comparePrices } = await import("./services/pini");
    const result = await comparePrices("pintura acrilica parede");
    expect(result).toHaveProperty("sinapi");
    expect(result).toHaveProperty("pini");
    expect(result).toHaveProperty("recommendation");
    expect(result).toHaveProperty("recommendedPrice");
    expect(["sinapi", "pini", "average"]).toContain(result.recommendation);
    expect(result.recommendedPrice).toBeGreaterThan(0);
  });
});
