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
