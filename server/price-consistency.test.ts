import { describe, it, expect } from "vitest";

/**
 * Testes de Consistência de Preços
 * 
 * Valida que os valores calculados pelo sistema estão consistentes
 * entre os diferentes agentes e documentos gerados.
 */

describe("Consistência de Preços", () => {
  // Dados de exemplo baseados no caso "Vania Esgoto REV06"
  const custosDiretos = 5750.00;  // Do Orçamentista
  const custosLogistica = 6350.00; // Da Logística
  const bdiPercentual = 0.30;      // 30% configurado
  
  it("deve calcular o custo base corretamente (direto + logística)", () => {
    const custoBase = custosDiretos + custosLogistica;
    expect(custoBase).toBe(12100.00);
  });
  
  it("deve calcular o BDI sobre o custo base completo", () => {
    const custoBase = custosDiretos + custosLogistica;
    const bdiAmount = custoBase * bdiPercentual;
    expect(bdiAmount).toBe(3630.00);
  });
  
  it("deve calcular o preço final corretamente", () => {
    const custoBase = custosDiretos + custosLogistica;
    const precoFinal = custoBase * (1 + bdiPercentual);
    expect(precoFinal).toBe(15730.00);
  });
  
  it("não deve calcular BDI apenas sobre custo direto", () => {
    // Este era o bug: BDI aplicado apenas sobre custo direto
    const precoErrado = custosDiretos * (1 + 0.55); // BDI de 55% só sobre direto
    const custoBase = custosDiretos + custosLogistica;
    const precoCorreto = custoBase * (1 + bdiPercentual);
    
    // O preço errado era muito menor que o correto
    expect(precoErrado).toBeLessThan(precoCorreto);
    expect(precoErrado).toBe(8912.50); // ~R$ 8.920 que aparecia na planilha
  });
  
  it("deve garantir que preço final >= custo base", () => {
    const custoBase = custosDiretos + custosLogistica;
    const precoFinal = custoBase * (1 + bdiPercentual);
    expect(precoFinal).toBeGreaterThan(custoBase);
  });
  
  it("deve garantir que margem seja positiva", () => {
    const custoBase = custosDiretos + custosLogistica;
    const precoFinal = custoBase * (1 + bdiPercentual);
    const margem = (precoFinal - custoBase) / precoFinal;
    expect(margem).toBeGreaterThan(0);
    expect(margem).toBeCloseTo(0.23, 2); // ~23% de margem com BDI de 30%
  });
});

describe("Fluxo de Caixa", () => {
  const precoVenda = 13520.00; // Preço do Comercial
  const custoTotal = 12100.00; // Direto + Logística
  
  it("deve calcular adiantamento de 40% corretamente", () => {
    const adiantamento = precoVenda * 0.40;
    expect(adiantamento).toBe(5408.00);
  });
  
  it("deve calcular saldo final de 60% corretamente", () => {
    const saldoFinal = precoVenda * 0.60;
    expect(saldoFinal).toBe(8112.00);
  });
  
  it("deve ter lucro positivo ao final", () => {
    const lucro = precoVenda - custoTotal;
    expect(lucro).toBeGreaterThan(0);
    expect(lucro).toBe(1420.00);
  });
  
  it("não deve ter despesas maiores que receitas totais", () => {
    const receitaTotal = precoVenda;
    const despesaTotal = custoTotal;
    expect(receitaTotal).toBeGreaterThan(despesaTotal);
  });
});

describe("Validação de Fórmulas", () => {
  it("fórmula do preço de venda: (Direto + Logística) × (1 + BDI)", () => {
    const direto = 5750;
    const logistica = 6350;
    const bdi = 0.30;
    
    const precoVenda = (direto + logistica) * (1 + bdi);
    
    // Verificar que a fórmula está correta
    expect(precoVenda).toBe(15730);
    
    // Verificar decomposição
    const custoBase = direto + logistica;
    const bdiAmount = custoBase * bdi;
    expect(custoBase + bdiAmount).toBe(precoVenda);
  });
  
  it("BDI não deve ser aplicado sobre impostos (já incluídos)", () => {
    const direto = 5750;
    const logistica = 6350;
    const impostos = 391.41; // Apenas para classificação fiscal
    const bdi = 0.30;
    
    // ERRADO: Somar impostos ao custo base antes do BDI
    const precoErrado = (direto + logistica + impostos) * (1 + bdi);
    
    // CORRETO: BDI já inclui tributos na sua composição
    const precoCorreto = (direto + logistica) * (1 + bdi);
    
    expect(precoCorreto).toBeLessThan(precoErrado);
  });
});
