import { describe, expect, it } from "vitest";
import {
  formatBRL,
  formatDate,
  renderProposta,
} from "./services/juridicoTemplating";

const baseSlots = {
  projectName: "Reforma Vânia",
  clientName: "Vânia Souza",
  proposalDate: "2026-05-04",
  validityDays: 30,
  totalPrice: 150_000,
  paymentTerms: "40% entrada + 60% ao final",
  durationDays: 45,
  durationWeeksLabel: "6 semanas e 3 dias",
  contractType: "obra" as const,
  contratada: "RR Engenharia LTDA",
  contratante: "Vânia Souza",
  tipoObra: "reforma residencial",
  memorialDate: "2026-04-15",
  escopoBreve: "reforma de cozinha e dois banheiros",
  enderecoObra: "Rua das Acácias, 123 — São Paulo/SP",
  foro: "São Paulo - SP",
  companyAddress: "Av. Paulista, 1000 — São Paulo/SP",
  companyCnpj: "00.000.000/0001-00",
};

describe("formatBRL (P1.6)", () => {
  it("formata número em BRL pt-BR (sem prefixo R$)", () => {
    expect(formatBRL(150000)).toBe("150.000,00");
    expect(formatBRL(1234.5)).toBe("1.234,50");
  });

  it("aceita 0 e valores negativos", () => {
    expect(formatBRL(0)).toBe("0,00");
    expect(formatBRL(-99.9)).toBe("-99,90");
  });

  it("retorna 0,00 para NaN/Infinity", () => {
    expect(formatBRL(Number.NaN)).toBe("0,00");
    expect(formatBRL(Number.POSITIVE_INFINITY)).toBe("0,00");
  });
});

describe("formatDate (P1.6)", () => {
  it("formata ISO em DD/MM/YYYY", () => {
    expect(formatDate("2026-05-04")).toMatch(/^04\/05\/2026$/);
  });

  it("retorna a string original quando data inválida", () => {
    expect(formatDate("não-é-data")).toBe("não-é-data");
  });
});

describe("renderProposta (P1.6) — template padrão", () => {
  it("substitui slots simples (projectName, clientName, validityDays)", async () => {
    const out = await renderProposta("padrao", baseSlots);
    expect(out.text).toContain("# Proposta Comercial — Reforma Vânia");
    expect(out.text).toContain("Vânia Souza");
    expect(out.text).toContain("30 dias");
  });

  it("aplica filtro |brl em totalPrice", async () => {
    const out = await renderProposta("padrao", baseSlots);
    expect(out.text).toContain("R$ 150.000,00");
  });

  it("aplica filtro |date em proposalDate", async () => {
    const out = await renderProposta("padrao", baseSlots);
    expect(out.text).toMatch(/04\/05\/2026/);
  });

  it("resolve include {{cl_objeto}} a partir de clausulas/objeto.md", async () => {
    const out = await renderProposta("padrao", baseSlots);
    // O texto da cláusula de objeto contém "compromete-se a executar"
    expect(out.text).toContain("compromete-se a executar");
    // E inclui o tipoObra do slot
    expect(out.text).toContain("reforma residencial");
  });

  it("resolve include {{cl_foro}} com slot {{foro}} preenchido", async () => {
    const out = await renderProposta("padrao", baseSlots);
    expect(out.text).toContain("foro da comarca de **São Paulo - SP**");
  });

  it("renderiza condicional {{?contractType=obra}}...{{/?}} quando bate", async () => {
    const out = await renderProposta("padrao", {
      ...baseSlots,
      contractType: "obra",
    });
    // Bloco de "obra" inclui o endereço
    expect(out.text).toContain("Rua das Acácias, 123");
    // Bloco "manutencao" NÃO deve aparecer
    expect(out.text).not.toContain("NBR 5674");
  });

  it("renderiza bloco de manutencao e omite bloco de obra quando contractType=manutencao", async () => {
    const out = await renderProposta("padrao", {
      ...baseSlots,
      contractType: "manutencao",
    });
    expect(out.text).toContain("NBR 5674");
    expect(out.text).not.toContain("Rua das Acácias, 123");
  });

  it("retorna lista de clauses[] com 9 cláusulas default tituladas", async () => {
    const out = await renderProposta("padrao", baseSlots);
    expect(out.clauses.length).toBe(9);
    const titles = out.clauses.map(c => c.title);
    expect(titles).toEqual([
      "Objeto",
      "Preço",
      "Forma de Pagamento",
      "Prazo de Execução",
      "Garantias",
      "Responsabilidades das Partes",
      "Confidencialidade",
      "Rescisão",
      "Foro",
    ]);
  });

  it("clauses[].content tem slots resolvidos (durationDays e foro)", async () => {
    const out = await renderProposta("padrao", baseSlots);
    const prazo = out.clauses.find(c => c.title === "Prazo de Execução");
    const foro = out.clauses.find(c => c.title === "Foro");
    expect(prazo?.content).toContain("45 dias");
    expect(foro?.content).toContain("São Paulo - SP");
  });

  it("deixa {{slot}} visível quando slot está ausente (não silencia erro)", async () => {
    const out = await renderProposta("padrao", {
      ...baseSlots,
      // Removemos foro intencionalmente para simular slot ausente.
      foro: undefined,
    });
    // Cláusula de foro mantém o token visível para revisão fácil.
    expect(out.text).toContain("{{foro}}");
  });

  // P1.6 (post-review): testes que validam que o foro vem derivado pela
  // LLM a partir do location da obra (não mais default "São Paulo - SP").
  it("preenche foro a partir da localização extraída pela LLM", async () => {
    const out = await renderProposta("padrao", {
      ...baseSlots,
      foro: "Niterói - RJ",
    });
    expect(out.text).toContain("Niterói - RJ");
    expect(out.text).toContain("renúncia expressa");
  });

  it("exibe placeholder quando foro não pôde ser derivado", async () => {
    const out = await renderProposta("padrao", {
      ...baseSlots,
      foro: "[Comarca da obra — preencher antes da assinatura]",
    });
    expect(out.text).toContain("[Comarca da obra — preencher antes da assinatura]");
  });
});

describe("renderProposta (P1.6) — variantes", () => {
  it("variante obra_publica usa edital number", async () => {
    const out = await renderProposta("obra_publica", {
      ...baseSlots,
      editalNumber: "Edital nº 042/2026",
    });
    expect(out.text).toContain("Proposta para Licitação");
    expect(out.text).toContain("Edital nº 042/2026");
    expect(out.text).toContain("Lei nº 14.133/2021");
  });

  it("variante manutencao referencia NBR 5674 e inclui SLA", async () => {
    const out = await renderProposta("manutencao", {
      ...baseSlots,
      contractType: "manutencao",
    });
    expect(out.text).toContain("Manutenção de Edificações");
    expect(out.text).toContain("Emergencial");
    expect(out.text).toContain("4 horas");
  });
});
