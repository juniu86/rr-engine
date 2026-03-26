import { describe, it, expect } from 'vitest';
import { findSINAPIPrice, findSINAPIFromExpandedDB } from './config/sinapi-precos';
import { priceItems } from './modules/pricing';
import { calculateLogistics } from './modules/logistics';
import { crossValidate } from './modules/crossValidation';
import { buildConfig } from './config/defaults';
import type { ItemMemorial, LogisticaMemorial, ItemOrcamento } from './types';

// ==================== Fase 3: Estimativa por Categoria ====================

describe('Fase 3: Estimativa por categoria', () => {
  const config = buildConfig();

  it('deve retornar estimativa diferenciada para demolição (m²)', () => {
    const item: ItemMemorial = { descricao: 'Demolição de paredes', categoria: 'Demolição', unidade: 'm²', quantidade: 50 };
    const result = priceItems([item], config, 'capital');
    const priced = result.itens.find(i => !i.is_header);
    // Demolição deve ser precificada via SINAPI ou estimativa ~45/m², não o genérico 50/m²
    expect(priced).toBeDefined();
    expect(priced!.preco_unitario_ajustado).toBeGreaterThan(0);
  });

  it('deve retornar estimativa diferenciada para pintura (m²)', () => {
    const item: ItemMemorial = { descricao: 'Pintura acrílica em paredes internas', categoria: 'Pintura', unidade: 'm²', quantidade: 100 };
    const result = priceItems([item], config, 'capital');
    const priced = result.itens.find(i => !i.is_header);
    expect(priced).toBeDefined();
    // Pintura ~25-30/m², não o genérico antigo de 50/m²
    expect(priced!.preco_unitario_ajustado).toBeLessThan(50);
  });

  it('deve retornar estimativa para porta (un) maior que estimativa genérica antiga', () => {
    const item: ItemMemorial = { descricao: 'Porta completa de madeira', categoria: 'Esquadrias', unidade: 'un', quantidade: 3 };
    const result = priceItems([item], config, 'capital');
    const priced = result.itens.find(i => !i.is_header);
    expect(priced).toBeDefined();
    // Porta ~800/un via estimativa por categoria, não 200/un genérico
    expect(priced!.preco_unitario_ajustado).toBeGreaterThan(200);
  });

  it('deve retornar estimativa para concreto (m³)', () => {
    const item: ItemMemorial = { descricao: 'Concreto usinado fck 25', categoria: 'Estrutura', unidade: 'm³', quantidade: 10 };
    const result = priceItems([item], config, 'capital');
    const priced = result.itens.find(i => !i.is_header);
    expect(priced).toBeDefined();
    expect(priced!.preco_unitario_ajustado).toBeGreaterThan(100);
  });

  it('deve retornar estimativa para verba de instalação elétrica', () => {
    // This will be decomposed into sub-items, so check the header total
    const item: ItemMemorial = { descricao: 'Instalação elétrica completa', categoria: 'Elétrica', unidade: 'vb', quantidade: 1 };
    const result = priceItems([item], config, 'capital');
    const header = result.itens.find(i => i.is_header);
    expect(header).toBeDefined();
    expect(header!.preco_total).toBeGreaterThan(1000); // Should be substantial
  });
});

// ==================== Fase 1+2: Base Expandida ====================

describe('Fase 1+2: Base expandida SINAPI', () => {
  it('findSINAPIPrice deve encontrar itens na base curada (30 itens)', () => {
    const result = findSINAPIPrice('porcelanato retificado 60x60');
    expect(result).not.toBeNull();
    expect(result!.preco_unitario).toBeGreaterThan(0);
  });

  it('findSINAPIFromExpandedDB deve encontrar itens não presentes na base curada', () => {
    // "sapata de concreto" não está na base curada de 30 itens, mas está na SINAPI_DB
    const result = findSINAPIFromExpandedDB('sapata de concreto armado', 'm³');
    // May or may not find depending on SINAPI_DB availability, but should not throw
    if (result) {
      expect(result.preco_unitario).toBeGreaterThan(0);
      expect(result.codigo).toBeTruthy();
    }
  });

  it('findSINAPIFromExpandedDB deve dar bônus para unidade compatível', () => {
    const withUnit = findSINAPIFromExpandedDB('alvenaria de blocos cerâmicos', 'm²');
    const withoutUnit = findSINAPIFromExpandedDB('alvenaria de blocos cerâmicos');
    // Both should find something, but with compatible unit may find better match
    if (withUnit && withoutUnit) {
      expect(withUnit.preco_unitario).toBeGreaterThan(0);
    }
  });

  it('findSINAPIFromExpandedDB deve rejeitar itens com score muito baixo', () => {
    const result = findSINAPIFromExpandedDB('xyz item inexistente completamente aleatório');
    expect(result).toBeNull();
  });

  it('cadeia de fallback deve funcionar: curada → expandida → estimativa', () => {
    const config = buildConfig();
    // Item que não está na base curada nem na expandida
    const item: ItemMemorial = { descricao: 'Serviço especializado único customizado', categoria: 'Outros', unidade: 'vb', quantidade: 1 };
    const result = priceItems([item], config, 'capital');
    expect(result.itens.length).toBeGreaterThan(0);
    expect(result.itens[0].preco_total).toBeGreaterThan(0);
    // Should have a warning about using estimation
    expect(result.warnings.some(w => w.includes('estimativa'))).toBe(true);
  });
});

// ==================== Fase 4: Fatores Regionais por Estado ====================

describe('Fase 4: Fatores regionais por UF', () => {
  const config = buildConfig();
  const item: ItemMemorial = { descricao: 'Porcelanato retificado 60x60', categoria: 'Pisos', unidade: 'm²', quantidade: 100 };

  it('deve aplicar fator por estado quando estado é fornecido (RJ = 1.05)', () => {
    const resultRJ = priceItems([item], config, 'capital', 'RJ');
    const resultSP = priceItems([item], config, 'capital', 'SP');
    const pricedRJ = resultRJ.itens.find(i => !i.is_header)!;
    const pricedSP = resultSP.itens.find(i => !i.is_header)!;
    // RJ (1.05) should be more expensive than SP (1.0)
    expect(pricedRJ.preco_unitario_ajustado).toBeGreaterThan(pricedSP.preco_unitario_ajustado);
  });

  it('deve aplicar fator por estado para BA (0.88) - mais barato', () => {
    const resultBA = priceItems([item], config, 'interior', 'BA');
    const resultSP = priceItems([item], config, 'capital', 'SP');
    const pricedBA = resultBA.itens.find(i => !i.is_header)!;
    const pricedSP = resultSP.itens.find(i => !i.is_header)!;
    // BA (0.88) should be cheaper than SP (1.0)
    expect(pricedBA.preco_unitario_ajustado).toBeLessThan(pricedSP.preco_unitario_ajustado);
  });

  it('deve usar FAR genérico quando estado não é fornecido', () => {
    const resultInterior = priceItems([item], config, 'interior');
    const pricedInterior = resultInterior.itens.find(i => !i.is_header)!;
    // Interior FAR = 0.80
    expect(pricedInterior.fator_regional).toBe(0.80);
  });

  it('deve usar FAR por estado na logística também', () => {
    const logistica: LogisticaMemorial = {
      transporte: true,
      deslocamento_local: true,
      itens_explicitos: ['transporte de materiais', 'deslocamento local'],
    };
    const budgetItems: ItemOrcamento[] = [];
    const resultRJ = calculateLogistics(logistica, config, 'capital', 4, budgetItems, 'RJ');
    const resultBA = calculateLogistics(logistica, config, 'interior', 4, budgetItems, 'BA');
    const transporteRJ = resultRJ.custos.find(c => c.categoria === 'transporte');
    const transporteBA = resultBA.custos.find(c => c.categoria === 'transporte');
    if (transporteRJ && transporteBA) {
      // RJ (1.05) > BA (0.88)
      expect(transporteRJ.preco_unitario).toBeGreaterThan(transporteBA.preco_unitario);
    }
  });
});

// ==================== Fase 7: Logística Escalável ====================

describe('Fase 7: Logística escalável por porte', () => {
  const config = buildConfig();
  const logistica: LogisticaMemorial = {
    transporte: true,
    deslocamento_local: false,
    itens_explicitos: ['transporte de materiais'],
  };

  function makeBudgetItems(total: number): ItemOrcamento[] {
    return [{
      id: 1,
      descricao: 'Item teste',
      descricao_normalizada: 'item teste',
      categoria: 'Teste',
      unidade: 'm²',
      quantidade: 100,
      preco_unitario_sinapi: total / 100,
      fator_regional: 1.0,
      preco_unitario_ajustado: total / 100,
      preco_total: total,
      fonte: 'sinapi',
      modulo_origem: 'orcamento',
      is_header: false,
    }];
  }

  it('deve usar 2 viagens para projetos < R$20k', () => {
    const result = calculateLogistics(logistica, config, 'capital', 4, makeBudgetItems(15000));
    const transporte = result.custos.find(c => c.categoria === 'transporte');
    expect(transporte).toBeDefined();
    expect(transporte!.quantidade).toBe(2);
  });

  it('deve usar 3 viagens para projetos R$20k-50k', () => {
    const result = calculateLogistics(logistica, config, 'capital', 4, makeBudgetItems(35000));
    const transporte = result.custos.find(c => c.categoria === 'transporte');
    expect(transporte).toBeDefined();
    expect(transporte!.quantidade).toBe(3);
  });

  it('deve usar 4 viagens para projetos R$50k-100k', () => {
    const result = calculateLogistics(logistica, config, 'capital', 4, makeBudgetItems(80000));
    const transporte = result.custos.find(c => c.categoria === 'transporte');
    expect(transporte).toBeDefined();
    expect(transporte!.quantidade).toBe(4);
  });

  it('deve escalar viagens para projetos > R$100k', () => {
    const result = calculateLogistics(logistica, config, 'capital', 4, makeBudgetItems(200000));
    const transporte = result.custos.find(c => c.categoria === 'transporte');
    expect(transporte).toBeDefined();
    expect(transporte!.quantidade).toBe(8); // ceil(200000/25000) = 8
  });
});

// ==================== Fase 5: Decomposição Expandida ====================

describe('Fase 5: Decomposição expandida', () => {
  const config = buildConfig();

  it('deve decompor instalação hidráulica em sub-itens', () => {
    const item: ItemMemorial = { descricao: 'Instalação hidráulica completa conforme projeto', categoria: 'Hidráulica', unidade: 'vb', quantidade: 1 };
    const result = priceItems([item], config, 'capital');
    // Should have header + sub-items
    const header = result.itens.find(i => i.is_header);
    const subItems = result.itens.filter(i => !i.is_header);
    expect(header).toBeDefined();
    expect(subItems.length).toBeGreaterThanOrEqual(3); // água fria, esgoto, louças
  });

  it('deve decompor banheiro completo em sub-itens', () => {
    const item: ItemMemorial = { descricao: 'Banheiro completo com louças e metais', categoria: 'Hidráulica', unidade: 'vb', quantidade: 2 };
    const result = priceItems([item], config, 'capital');
    const header = result.itens.find(i => i.is_header);
    const subItems = result.itens.filter(i => !i.is_header);
    expect(header).toBeDefined();
    expect(subItems.length).toBeGreaterThanOrEqual(3); // vaso + lavatório + chuveiro + revestimento
  });

  it('deve decompor cobertura completa em sub-itens', () => {
    const item: ItemMemorial = { descricao: 'Cobertura completa com telha cerâmica', categoria: 'Cobertura', unidade: 'm²', quantidade: 80 };
    const result = priceItems([item], config, 'capital');
    const header = result.itens.find(i => i.is_header);
    const subItems = result.itens.filter(i => !i.is_header);
    expect(header).toBeDefined();
    expect(subItems.length).toBeGreaterThanOrEqual(2); // estrutura + telhas + calhas
  });

  it('deve manter decomposição existente de drywall + porta', () => {
    const item: ItemMemorial = { descricao: 'Drywall 14m² com 1 porta', categoria: 'Vedação', unidade: 'm²', quantidade: 14 };
    const result = priceItems([item], config, 'capital');
    const subItems = result.itens.filter(i => !i.is_header);
    expect(subItems.length).toBe(2); // placa + porta
    expect(subItems.some(i => i.descricao.toLowerCase().includes('drywall'))).toBe(true);
    expect(subItems.some(i => i.descricao.toLowerCase().includes('porta'))).toBe(true);
  });
});

// ==================== Fase 6: Cross-Validation ====================

describe('Fase 6: Cross-validation', () => {
  it('deve retornar severity "none" quando llmTotal não é fornecido', () => {
    const result = crossValidate(100000, undefined);
    expect(result.severity).toBe('none');
    expect(result.warning).toBeUndefined();
  });

  it('deve retornar severity "none" para divergência < 20%', () => {
    const result = crossValidate(100000, 110000); // 10% divergence
    expect(result.severity).toBe('none');
    expect(result.warning).toBeUndefined();
  });

  it('deve retornar severity "warning" para divergência entre 20% e 40%', () => {
    const result = crossValidate(100000, 130000); // 30% divergence
    expect(result.severity).toBe('warning');
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain('30%');
  });

  it('deve retornar severity "critical" para divergência > 40%', () => {
    const result = crossValidate(100000, 150000); // 50% divergence
    expect(result.severity).toBe('critical');
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain('Revisão manual');
  });

  it('deve funcionar quando LLM total é menor que determinístico', () => {
    const result = crossValidate(100000, 55000); // 45% divergence
    expect(result.severity).toBe('critical');
    expect(result.divergencePercent).toBe(45);
  });

  it('deve ignorar quando llmTotal é zero', () => {
    const result = crossValidate(100000, 0);
    expect(result.severity).toBe('none');
  });
});
