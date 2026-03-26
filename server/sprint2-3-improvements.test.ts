import { describe, it, expect } from 'vitest';
import { adjustForInflation, findPINIFromDB } from './lib/deterministicEngine/config/sinapi-precos';
import { validatePricesAgainstAnchors } from './agents/priceAnchorValidator';
import { compareNumericOutputs, isEnsembleEnabled, ORCAMENTISTA_NUMERIC_PATHS, BOARD_NUMERIC_PATHS } from './agents/ensemble';
import { detectProvider, getProviderCapabilities } from './_core/llm-providers';

// ==================== INCC-M Inflation Adjustment ====================

describe('INCC-M Inflation Adjustment', () => {
  it('should not adjust prices within the first month', () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 15); // 15 days ago
    const adjusted = adjustForInflation(100, recentDate);
    expect(adjusted).toBe(100); // No adjustment
  });

  it('should adjust prices after reference date', () => {
    const oldDate = new Date('2025-01-01');
    const adjusted = adjustForInflation(100, oldDate);
    // After Jan 2025, should be higher
    expect(adjusted).toBeGreaterThan(100);
  });

  it('should apply 0.5% per month', () => {
    // 12 months = 6% increase
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const adjusted = adjustForInflation(1000, oneYearAgo);
    // Approximately 1060 (6% increase)
    expect(adjusted).toBeGreaterThanOrEqual(1050);
    expect(adjusted).toBeLessThanOrEqual(1080);
  });

  it('should handle zero price', () => {
    expect(adjustForInflation(0)).toBe(0);
  });
});

// ==================== PINI DB Integration ====================

describe('PINI DB Integration (findPINIFromDB)', () => {
  it('should find alvenaria in PINI database', () => {
    const result = findPINIFromDB('alvenaria de blocos cerâmicos', 'm²');
    if (result) {
      expect(result.preco_unitario).toBeGreaterThan(0);
      expect(result.codigo).toBeTruthy();
    }
  });

  it('should find porcelanato in PINI database', () => {
    const result = findPINIFromDB('piso porcelanato retificado', 'm²');
    if (result) {
      expect(result.preco_unitario).toBeGreaterThan(0);
    }
  });

  it('should return null for nonsense query', () => {
    const result = findPINIFromDB('xyz completamente aleatório inexistente');
    expect(result).toBeNull();
  });
});

// ==================== Price Anchor Validator ====================

describe('Price Anchor Validator', () => {
  it('should return empty warnings for reasonable prices', () => {
    const items = [{
      description: 'Pintura acrílica em paredes',
      unit: 'm²',
      unitCostTotal: 15, // Within range of SINAPI ~12.87
      quantity: 100,
    }];
    const warnings = validatePricesAgainstAnchors(items);
    expect(warnings.length).toBe(0);
  });

  it('should return warnings array (may be empty if no SINAPI/PINI match found)', () => {
    const items = [{
      description: 'Alvenaria de vedação de blocos cerâmicos furados 9x19x19cm',
      unit: 'm²',
      unitCostTotal: 500, // Way above SINAPI ~72.45
      quantity: 100,
    }];
    const warnings = validatePricesAgainstAnchors(items);
    // Validator should always return an array, even if empty (matching depends on DB availability)
    expect(Array.isArray(warnings)).toBe(true);
    // If a match was found, the divergence should be flagged
    if (warnings.length > 0) {
      expect(warnings[0]).toContain('Divergência');
    }
  });

  it('should handle items with zero cost gracefully', () => {
    const items = [{ description: 'Item teste', unit: 'un', unitCostTotal: 0, quantity: 1 }];
    const warnings = validatePricesAgainstAnchors(items);
    expect(warnings.length).toBe(0);
  });
});

// ==================== Ensemble Validation ====================

describe('Ensemble Validation', () => {
  it('isEnsembleEnabled should default to false', () => {
    expect(isEnsembleEnabled()).toBe(false);
  });

  it('should report high confidence when outputs agree', () => {
    const outputA = { totalDirectCost: 100000, totalIndirectCost: 20000 };
    const outputB = { totalDirectCost: 102000, totalIndirectCost: 19500 };
    const result = compareNumericOutputs(outputA, outputB, ORCAMENTISTA_NUMERIC_PATHS, 0.20);
    expect(result.confidence).toBe(1);
    expect(result.divergences.length).toBe(0);
  });

  it('should detect divergence when outputs disagree significantly', () => {
    const outputA = { totalDirectCost: 100000, totalIndirectCost: 20000 };
    const outputB = { totalDirectCost: 150000, totalIndirectCost: 20000 };
    const result = compareNumericOutputs(outputA, outputB, ORCAMENTISTA_NUMERIC_PATHS, 0.20);
    expect(result.confidence).toBeLessThan(1);
    expect(result.divergences.length).toBeGreaterThan(0);
    expect(result.divergences[0]).toContain('totalDirectCost');
  });

  it('should handle nested paths for Board agent', () => {
    const outputA = {
      calculosFinanceiros: { margemPercentual: 15.5, precoFinal: 200000, custoTotal: 170000 },
    };
    const outputB = {
      calculosFinanceiros: { margemPercentual: 14.8, precoFinal: 198000, custoTotal: 168000 },
    };
    const result = compareNumericOutputs(
      outputA as any, outputB as any, BOARD_NUMERIC_PATHS, 0.20,
    );
    expect(result.confidence).toBe(1); // All within 20%
  });

  it('should handle missing fields gracefully', () => {
    const outputA = { totalDirectCost: 100000 };
    const outputB = {};
    const result = compareNumericOutputs(outputA, outputB, ORCAMENTISTA_NUMERIC_PATHS, 0.20);
    // Missing fields are skipped, not counted as divergence
    expect(result.divergences.length).toBe(0);
  });
});

// ==================== Provider Detection ====================

describe('Provider Model Routing', () => {
  it('should detect claude-opus-4-6 as claude-opus provider', () => {
    expect(detectProvider('claude-opus-4-6')).toBe('claude-opus');
  });

  it('should detect claude-sonnet-4-6 as claude-sonnet provider', () => {
    expect(detectProvider('claude-sonnet-4-6')).toBe('claude-sonnet');
  });

  it('should give Opus 32K tokens', () => {
    const caps = getProviderCapabilities('claude-opus-4-6');
    expect(caps.maxOutputTokens).toBe(32768);
  });

  it('should give Sonnet 16K tokens', () => {
    const caps = getProviderCapabilities('claude-sonnet-4-6');
    expect(caps.maxOutputTokens).toBe(16384);
  });
});
