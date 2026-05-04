import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P1.4 — testes do priceDatabaseRepo, dos getters do sinapi/pini com cache
 * em memória, e do stub do piniScraper. Não faz chamada real a Puppeteer
 * nem ao orcamentor.com — tudo mockado.
 */

describe("priceDatabaseRepo (P1.4)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("upsert chama insert+onDuplicateKeyUpdate com payload correto", async () => {
    const valuesMock = vi.fn().mockReturnValue({
      onDuplicateKeyUpdate: vi.fn().mockResolvedValue(undefined),
    });
    const insertMock = vi.fn().mockReturnValue({ values: valuesMock });
    vi.doMock("./db", () => ({
      getDb: async () => ({ insert: insertMock }),
    }));

    const { upsertPriceEntry } = await import("./services/priceDatabaseRepo");

    await upsertPriceEntry({
      source: "sinapi",
      code: "TEST-001",
      description: "Teste",
      unit: "m²",
      price: 123.456,
      state: "SP",
      category: "Acabamento",
      referenceDate: new Date(Date.UTC(2025, 0, 1)),
      dataSource: "manual_seed",
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(valuesMock).toHaveBeenCalledTimes(1);
    const v = valuesMock.mock.calls[0][0];
    expect(v.source).toBe("sinapi");
    expect(v.code).toBe("TEST-001");
    // referenceDate convertida para "YYYY-MM-DD"
    expect(v.referenceDate).toBe("2025-01-01");
    // price formatado com 4 casas
    expect(v.price).toBe("123.4560");
    expect(v.dataSource).toBe("manual_seed");
  });

  it("upsert é no-op quando banco está indisponível (sem lançar)", async () => {
    vi.doMock("./db", () => ({ getDb: async () => null }));
    const { upsertPriceEntry } = await import("./services/priceDatabaseRepo");

    await expect(
      upsertPriceEntry({
        source: "pini",
        code: "X",
        description: "Y",
        unit: "un",
        price: 1,
        referenceDate: new Date(),
      })
    ).resolves.toBeUndefined();
  });

  it("getActivePriceEntries retorna [] quando banco indisponível", async () => {
    vi.doMock("./db", () => ({ getDb: async () => null }));
    const { getActivePriceEntries } = await import(
      "./services/priceDatabaseRepo"
    );
    const entries = await getActivePriceEntries("sinapi", "SP");
    expect(entries).toEqual([]);
  });

  it("deactivateOldEntries retorna 0 quando banco indisponível", async () => {
    vi.doMock("./db", () => ({ getDb: async () => null }));
    const { deactivateOldEntries } = await import(
      "./services/priceDatabaseRepo"
    );
    const n = await deactivateOldEntries("sinapi", new Date());
    expect(n).toBe(0);
  });

  it("searchPriceEntries retorna [] quando banco indisponível", async () => {
    vi.doMock("./db", () => ({ getDb: async () => null }));
    const { searchPriceEntries } = await import("./services/priceDatabaseRepo");
    const r = await searchPriceEntries("sinapi", "pintura");
    expect(r).toEqual([]);
  });
});

describe("getSinapiData fallback (P1.4)", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("usa SINAPI_DB embutida quando o repo retorna 0 entradas", async () => {
    vi.doMock("./db", () => ({ getDb: async () => null }));
    const { getSinapiData, SINAPI_DB } = await import("./services/sinapi");
    const data = await getSinapiData("SP");
    // Sem banco → cai no fallback constante
    expect(data).toBe(SINAPI_DB);
    expect(data.length).toBeGreaterThan(0);
  });

  it("getSinapiDataSync retorna SINAPI_DB enquanto cache não foi populado", async () => {
    const { getSinapiDataSync, SINAPI_DB, clearSinapiCache } = await import(
      "./services/sinapi"
    );
    clearSinapiCache();
    expect(getSinapiDataSync("SP")).toBe(SINAPI_DB);
  });
});

describe("getPiniData fallback (P1.4)", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("usa PINI_DATABASE embutida quando o repo retorna 0 entradas", async () => {
    vi.doMock("./db", () => ({ getDb: async () => null }));
    const { getPiniData, PINI_DATABASE } = await import("./services/pini");
    const data = await getPiniData("São Paulo");
    expect(data).toBe(PINI_DATABASE);
    expect(data.length).toBeGreaterThan(0);
  });
});

describe("piniScraper stub (P1.4 Phase 3)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("scrapePiniBatch lança erro quando credenciais ausentes", async () => {
    vi.stubEnv("PINI_USERNAME", "");
    vi.stubEnv("PINI_PASSWORD", "");
    const { scrapePiniBatch } = await import("./services/piniScraper");
    await expect(scrapePiniBatch(["TCPO-001"])).rejects.toThrow(
      /PINI_USERNAME/
    );
  });

  it("scrapePiniBatch ainda lança 'não implementado' mesmo com credenciais (Phase 3 pendente)", async () => {
    vi.stubEnv("PINI_USERNAME", "test-user");
    vi.stubEnv("PINI_PASSWORD", "test-pass");
    const { scrapePiniBatch } = await import("./services/piniScraper");
    await expect(scrapePiniBatch(["TCPO-001"])).rejects.toThrow(
      /scrapePiniBatch ainda não implementado/
    );
  });
});

describe("refreshPriceDatabases (P1.4 Phase 4)", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("refreshSinapi retorna stats zerados quando não há códigos ativos no repo", async () => {
    vi.doMock("./db", () => ({ getDb: async () => null }));
    const { refreshSinapi } = await import("./jobs/refreshPriceDatabases");
    const stats = await refreshSinapi("SP");
    expect(stats.source).toBe("sinapi");
    expect(stats.attempted).toBe(0);
    expect(stats.added).toBe(0);
    expect(stats.failed).toBe(0);
  });

  it("refreshPini é pulado graciosamente sem credenciais (Phase 3 pendente)", async () => {
    vi.stubEnv("PINI_USERNAME", "");
    vi.stubEnv("PINI_PASSWORD", "");
    vi.doMock("./db", () => ({ getDb: async () => null }));
    const { refreshPini } = await import("./jobs/refreshPriceDatabases");
    const stats = await refreshPini();
    expect(stats.source).toBe("pini");
    expect(stats.attempted).toBe(0);
    // Não lança — Phase 3 pendente é tratada como skip silencioso
  });

  it("scheduleRefreshJob é no-op em NODE_ENV=test", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const { scheduleRefreshJob } = await import("./jobs/refreshPriceDatabases");
    // Não deve lançar nem registrar cron real
    expect(() => scheduleRefreshJob()).not.toThrow();
  });
});
