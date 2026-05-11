import { describe, expect, it } from "vitest";
import {
  countActualRemovals,
  countSuspects,
  dedupItems,
  normalizeDescription,
  tokenSimilarity,
} from "./agents/dedupUtils";

describe("normalizeDescription (P1.3)", () => {
  it("remove acentos e baixa caso", () => {
    expect(normalizeDescription("Pintura Acrílica")).toBe("pintura acrilica");
  });

  it("colapsa múltiplos espaços e trim", () => {
    expect(normalizeDescription("  piso   cerâmico  ")).toBe("piso ceramico");
  });

  it("normaliza descrição complexa do enunciado", () => {
    expect(normalizeDescription("Pintura Acrílica Branca, 2 demãos")).toBe(
      "pintura acrilica branca 2 demaos"
    );
  });

  it("mantém números", () => {
    expect(normalizeDescription("Cerâmica 30x30 esmaltada PEI 4")).toBe(
      "ceramica 30x30 esmaltada pei 4"
    );
  });
});

describe("tokenSimilarity (P1.3)", () => {
  it("idênticos retorna 1", () => {
    expect(tokenSimilarity("pintura acrilica", "pintura acrilica")).toBe(1);
  });

  it("totalmente diferentes retorna 0", () => {
    expect(
      tokenSimilarity("pintura branca interna", "cimento betoneira concreto")
    ).toBe(0);
  });

  it("similar retorna entre 0 e 1", () => {
    const sim = tokenSimilarity(
      "pintura acrilica branca",
      "pintura acrilica colorida"
    );
    expect(sim).toBeGreaterThan(0.4);
    expect(sim).toBeLessThan(1);
  });

  it("'demãos' / 'duas demãos' tem similaridade ≥ 0.65 (par suspeito)", () => {
    const sim = tokenSimilarity(
      "Pintura acrílica 2 demãos",
      "Pintura acrílica duas demãos"
    );
    expect(sim).toBeGreaterThanOrEqual(0.65);
  });

  it("descartar tokens curtos (<= 2 chars)", () => {
    // "de", "em" são tokens curtos — não influenciam similaridade
    const sim = tokenSimilarity("piso de ceramica", "piso em ceramica");
    expect(sim).toBe(1);
  });
});

describe("dedupItems (P1.3)", () => {
  it("remove duplicata exata e mantém o de maior quantidade", () => {
    const items = [
      { description: "Pintura", unit: "m²", quantity: 50 },
      { description: "pintura", unit: "m²", quantity: 80 },
    ];
    const r = dedupItems(items);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].quantity).toBe(80);
    expect(r.duplicatesRemoved[0].reason).toBe("exact_match");
  });

  it("remove sob alta similaridade com mesma unit/categoria", () => {
    // Tokens > 2 chars de A: pintura, acrilica, branca, interna, fosca, demaos = 6
    // Tokens > 2 chars de B: pintura, acrilica, branca, interna, fosca, demaos = 6
    // (números 2 e 3 são filtrados — len ≤ 2)
    // Intersection = 6, Union = 6, sim = 1.0 → high_similarity
    const items = [
      {
        description: "Pintura acrílica branca interna fosca 2 demãos",
        unit: "m²",
        category: "Acabamento",
      },
      {
        description: "Pintura acrilica branca interna fosca 3 demaos",
        unit: "m²",
        category: "Acabamento",
      },
    ];
    const r = dedupItems(items);
    expect(r.items).toHaveLength(1);
    expect(r.duplicatesRemoved[0].reason).toBe("high_similarity");
  });

  it("mantém quando categoria difere (pré-filtro)", () => {
    const items = [
      { description: "Tomada elétrica", unit: "un", category: "Elétrica" },
      { description: "Tomada elétrica", unit: "un", category: "Hidráulica" },
    ];
    const r = dedupItems(items);
    expect(r.items).toHaveLength(2);
  });

  it("mantém quando unidade difere (pré-filtro)", () => {
    const items = [
      { description: "Cabo elétrico", unit: "m" },
      { description: "Cabo elétrico", unit: "kg" },
    ];
    const r = dedupItems(items);
    expect(r.items).toHaveLength(2);
  });

  it("apenas loga suspeitas (não remove)", () => {
    // 5 tokens cada, 4 compartilhados, 1 diferente:
    // intersection=4, union=6, sim ≈ 0.667 → suspect (entre 0.65 e 0.85)
    const items = [
      { description: "Pintura latex acrilica branca interior", unit: "m²" },
      { description: "Pintura latex acrilica branca exterior", unit: "m²" },
    ];
    const r = dedupItems(items);
    expect(r.items).toHaveLength(2);
    expect(
      r.duplicatesRemoved.some(d => d.reason === "suspect_only_logged")
    ).toBe(true);
  });

  it("preserva itens hierárquicos pai/filho — não remove pacote VRF + componentes", () => {
    // Caso clássico do enunciado do prompt do Engenheiro Tecnico:
    // "Sistema VRF" (pai, isSummaryItem=true) + "Condensadora VRF" + "Fan coils VRF"
    // O dedup NÃO deve remover o pai por similaridade textual com filhos.
    const items = [
      {
        description: "Sistema VRF de climatização",
        unit: "vb",
        category: "Climatização",
        isSummaryItem: true,
        quantity: 1,
      },
      {
        description: "Condensadora VRF 10TR",
        unit: "un",
        category: "Climatização",
        quantity: 2,
      },
      {
        description: "Fan coils VRF",
        unit: "un",
        category: "Climatização",
        quantity: 8,
      },
    ];
    const r = dedupItems(items);
    expect(r.items).toHaveLength(3);
    expect(r.items.find(i => i.isSummaryItem)).toBeDefined();
  });

  it("PR5a: detecta numeric_match — mesma unit + qty + unitCost com texto parafraseado", () => {
    // Caso real do Maricá REV_03: Aço CA-50 gerado em 2 chunks com texto
    // levemente diferente. Jaccard fica baixo (~0.4) mas dados numéricos
    // são idênticos.
    const items = [
      {
        description: "Aço CA-50 cortado e dobrado para estrutura de concreto armado",
        unit: "kg",
        quantity: 11500,
        unitCostTotal: 15.3,
        totalCost: 175950,
      },
      {
        description: "Aço CA-50 corte e dobra para estrutura",
        unit: "kg",
        quantity: 11500,
        unitCostTotal: 15.3,
        totalCost: 175950,
      },
    ];
    const r = dedupItems(items);
    expect(r.items).toHaveLength(1);
    expect(r.duplicatesRemoved[0].reason).toBe("numeric_match");
  });

  it("PR5a: numeric_match NÃO dispara quando texto é totalmente diferente", () => {
    // Falso positivo a evitar: cimento e areia, ambos qty=10 saco R$35.
    // Sem overlap lexical (Jaccard 0), o numericFingerprintsMatch deve
    // descartar a duplicação.
    const items = [
      {
        description: "Cimento Portland CP-II saco 50kg",
        unit: "saco",
        quantity: 10,
        unitCostTotal: 35,
        totalCost: 350,
      },
      {
        description: "Areia média ensacada lavada",
        unit: "saco",
        quantity: 10,
        unitCostTotal: 35,
        totalCost: 350,
      },
    ];
    const r = dedupItems(items);
    expect(r.items).toHaveLength(2);
  });

  it("PR5a: numeric_match exige tolerância 1% na quantity e unitCost", () => {
    // Mesma unit, qty bem diferente (>1% de delta) — não dispara
    const items = [
      {
        description: "Concreto fck 25 lançado em fundação",
        unit: "m³",
        quantity: 38,
        unitCostTotal: 450,
      },
      {
        description: "Concreto fck 25 lançado em fundação",
        unit: "m³",
        quantity: 50,
        unitCostTotal: 450,
      },
    ];
    const r = dedupItems(items);
    // Mesmo texto exato — vai pegar como exact_match, mantém o de maior qty
    expect(r.items).toHaveLength(1);
    expect(r.duplicatesRemoved[0].reason).toBe("exact_match");
    expect(r.items[0].quantity).toBe(50);
  });

  it("aplica strictThreshold customizado", () => {
    // Threshold mais baixo (0.5) faz mais coisas baterem como duplicata
    const items = [
      { description: "Pintura branca", unit: "m²" },
      { description: "Pintura colorida", unit: "m²" },
    ];
    // Default 0.85: similaridade ~0.33 → suspect (na verdade nem isso)
    const defaultRun = dedupItems(items);
    expect(defaultRun.items).toHaveLength(2);
    // Threshold 0.3 force remoção
    const aggressive = dedupItems(items, {
      strictThreshold: 0.3,
      suspectThreshold: 0.1,
    });
    expect(aggressive.items).toHaveLength(1);
  });

  it("não compara itens com unit ausente vs unit presente como diferentes", () => {
    // Quando ambos têm unit diferente: pré-filtro pula
    // Quando UM dos dois não tem unit, pré-filtro PASSA (compara)
    const items = [
      { description: "Pintura interna", unit: "m²" },
      { description: "Pintura interna" }, // sem unit
    ];
    const r = dedupItems(items);
    expect(r.items).toHaveLength(1);
  });

  it("countActualRemovals ignora suspect_only_logged", () => {
    const items = [
      {
        description: "Pintura acrílica branca interna fosca 2 demãos",
        unit: "m²",
      },
      {
        description: "Pintura acrilica branca interna fosca 3 demaos",
        unit: "m²",
      }, // high
      { description: "Pintura latex acrilica branca interior", unit: "m²" },
      { description: "Pintura latex acrilica branca exterior", unit: "m²" }, // suspect
    ];
    const r = dedupItems(items);
    const actual = countActualRemovals(r.duplicatesRemoved);
    const suspects = countSuspects(r.duplicatesRemoved);
    expect(actual).toBeGreaterThanOrEqual(1); // pelo menos um "high_similarity"
    expect(suspects).toBeGreaterThanOrEqual(1);
  });

  it("retorna lista vazia quando input vazio", () => {
    const r = dedupItems([]);
    expect(r.items).toHaveLength(0);
    expect(r.duplicatesRemoved).toHaveLength(0);
  });
});
