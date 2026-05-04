import { describe, expect, it } from "vitest";
import { isCompleteTaxSettings } from "../shared/types";

describe("isCompleteTaxSettings (P1.5)", () => {
  const completeLP = {
    regimeTributario: "lucro_presumido" as const,
    issPercentual: 5,
    pisPercentual: 0.65,
    cofinsPercentual: 3,
    irpjPercentual: 1.2,
    csllPercentual: 1.08,
    taxaLeisSociais: 128,
  };

  it("rejeita null e undefined", () => {
    expect(isCompleteTaxSettings(null)).toBe(false);
    expect(isCompleteTaxSettings(undefined)).toBe(false);
  });

  it("rejeita objeto vazio", () => {
    expect(isCompleteTaxSettings({})).toBe(false);
  });

  it("aceita Lucro Presumido completo", () => {
    expect(isCompleteTaxSettings(completeLP)).toBe(true);
  });

  it("aceita Lucro Real completo", () => {
    expect(
      isCompleteTaxSettings({
        ...completeLP,
        regimeTributario: "lucro_real",
      })
    ).toBe(true);
  });

  it("rejeita quando falta regimeTributario", () => {
    const { regimeTributario: _omit, ...rest } = completeLP;
    expect(isCompleteTaxSettings(rest as Partial<typeof completeLP>)).toBe(
      false
    );
  });

  it("rejeita quando ISS é negativo", () => {
    expect(
      isCompleteTaxSettings({
        ...completeLP,
        issPercentual: -1,
      })
    ).toBe(false);
  });

  it("aceita ISS 0 (regimes/serviços isentos)", () => {
    expect(
      isCompleteTaxSettings({
        ...completeLP,
        issPercentual: 0,
      })
    ).toBe(true);
  });

  it("rejeita Simples Nacional sem faixaSimples", () => {
    expect(
      isCompleteTaxSettings({
        ...completeLP,
        regimeTributario: "simples_nacional",
        // faixaSimples ausente
      })
    ).toBe(false);
  });

  it("aceita Simples Nacional com faixaSimples", () => {
    expect(
      isCompleteTaxSettings({
        ...completeLP,
        regimeTributario: "simples_nacional",
        faixaSimples: 3,
      })
    ).toBe(true);
  });

  it("rejeita quando taxaLeisSociais ausente", () => {
    const { taxaLeisSociais: _omit, ...rest } = completeLP;
    expect(isCompleteTaxSettings(rest as Partial<typeof completeLP>)).toBe(
      false
    );
  });
});

describe("isCompleteTaxSettings — coluna faixaSimples (P1.5.1)", () => {
  const baseSimples = {
    regimeTributario: "simples_nacional" as const,
    issPercentual: 4,
    pisPercentual: 0,
    cofinsPercentual: 0,
    irpjPercentual: 0,
    csllPercentual: 0,
    taxaLeisSociais: 100,
  };

  it("aceita Simples Nacional COM faixa preenchida (1-6)", () => {
    for (const faixa of [1, 2, 3, 4, 5, 6] as const) {
      expect(
        isCompleteTaxSettings({ ...baseSimples, faixaSimples: faixa })
      ).toBe(true);
    }
  });

  it("rejeita Simples Nacional SEM faixa", () => {
    expect(isCompleteTaxSettings(baseSimples)).toBe(false);
  });

  it("rejeita Simples Nacional com faixa null", () => {
    expect(
      isCompleteTaxSettings({ ...baseSimples, faixaSimples: undefined })
    ).toBe(false);
  });

  it("aceita Lucro Presumido SEM faixa (faixa não se aplica)", () => {
    const completeLP = {
      regimeTributario: "lucro_presumido" as const,
      issPercentual: 5,
      pisPercentual: 0.65,
      cofinsPercentual: 3,
      irpjPercentual: 1.2,
      csllPercentual: 1.08,
      taxaLeisSociais: 128,
    };
    expect(isCompleteTaxSettings(completeLP)).toBe(true);
  });

  it("aceita Lucro Real SEM faixa (faixa não se aplica)", () => {
    const completeLR = {
      regimeTributario: "lucro_real" as const,
      issPercentual: 5,
      pisPercentual: 1.65,
      cofinsPercentual: 7.6,
      irpjPercentual: 4.8,
      csllPercentual: 2.88,
      taxaLeisSociais: 128,
    };
    expect(isCompleteTaxSettings(completeLR)).toBe(true);
  });
});
