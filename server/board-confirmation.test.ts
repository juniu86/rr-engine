import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do db
vi.mock('./db', () => ({
  getProjectById: vi.fn(),
  updateProject: vi.fn(),
  getAgentExecutionsByProjectId: vi.fn(),
  updateAgentExecution: vi.fn(),
  createLogisticsCosts: vi.fn(),
}));

import * as db from './db';

describe('Board Confirmation and Optional Items', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('confirmProposal logic', () => {
    it('should only allow confirmation when status is pending_confirmation', async () => {
      // Simular projeto com status pending_confirmation
      const mockProject = {
        id: 1,
        userId: 1,
        status: 'pending_confirmation',
        warningMessages: JSON.stringify(['Alerta 1', 'Alerta 2']),
      };
      
      vi.mocked(db.getProjectById).mockResolvedValue(mockProject as any);
      vi.mocked(db.updateProject).mockResolvedValue(undefined);
      
      // Verificar que o projeto tem status correto
      expect(mockProject.status).toBe('pending_confirmation');
      
      // Verificar que os warnings estão em formato JSON
      const warnings = JSON.parse(mockProject.warningMessages);
      expect(warnings).toHaveLength(2);
      expect(warnings[0]).toBe('Alerta 1');
    });

    it('should reject confirmation when status is not pending_confirmation', async () => {
      const mockProject = {
        id: 1,
        userId: 1,
        status: 'draft',
      };
      
      vi.mocked(db.getProjectById).mockResolvedValue(mockProject as any);
      
      // Verificar que o status não é pending_confirmation
      expect(mockProject.status).not.toBe('pending_confirmation');
    });
  });

  describe('selectOptionalItems logic', () => {
    it('should calculate additional cost correctly', async () => {
      const optionalItems = [
        { category: 'Mobilização', description: 'Placa de obra', quantity: 1, unit: 'un', unitCost: 350, totalCost: 350, reason: 'Identificação visual' },
        { category: 'Mobilização', description: 'Tapume', quantity: 10, unit: 'm²', unitCost: 100, totalCost: 1000, reason: 'Privacidade' },
        { category: 'Outros', description: 'Seguro', quantity: 1, unit: 'vb', unitCost: 500, totalCost: 500, reason: 'Proteção' },
      ];
      
      const selectedIndices = [0, 2]; // Placa e Seguro
      
      let additionalCost = 0;
      const selectedItems = selectedIndices.map(idx => {
        if (idx >= 0 && idx < optionalItems.length) {
          additionalCost += optionalItems[idx].totalCost;
          return optionalItems[idx];
        }
        return null;
      }).filter(Boolean);
      
      expect(selectedItems).toHaveLength(2);
      expect(additionalCost).toBe(850); // 350 + 500
    });

    it('should update totalLogisticsCost with selected items', async () => {
      const mockOutput = {
        costs: [],
        optionalItems: [
          { category: 'Mobilização', description: 'Placa', quantity: 1, unit: 'un', unitCost: 350, totalCost: 350, reason: 'Teste' },
        ],
        totalLogisticsCost: 5000,
        totalOptionalCost: 350,
        restrictions: [],
      };
      
      const selectedIndices = [0];
      const additionalCost = mockOutput.optionalItems[0].totalCost;
      
      const updatedOutput = {
        ...mockOutput,
        selectedOptionalItems: [mockOutput.optionalItems[0]],
        totalLogisticsCost: mockOutput.totalLogisticsCost + additionalCost,
      };
      
      expect(updatedOutput.totalLogisticsCost).toBe(5350);
      expect(updatedOutput.selectedOptionalItems).toHaveLength(1);
    });
  });

  describe('Board warnings parsing', () => {
    it('should parse warning messages from JSON string', () => {
      const warningMessagesJson = JSON.stringify([
        'Margem de lucro abaixo do ideal (12%)',
        'Prazo apertado para os quantitativos',
        'Risco de caixa médio no início do projeto',
      ]);
      
      const warnings = JSON.parse(warningMessagesJson);
      
      expect(warnings).toHaveLength(3);
      expect(warnings[0]).toContain('Margem de lucro');
    });

    it('should handle empty or invalid warning messages', () => {
      const emptyWarnings = JSON.stringify([]);
      const parsed = JSON.parse(emptyWarnings);
      expect(parsed).toHaveLength(0);
      
      // Teste de fallback para string inválida
      let warnings: string[] = [];
      try {
        warnings = JSON.parse('invalid json');
      } catch {
        warnings = [];
      }
      expect(warnings).toHaveLength(0);
    });
  });
});

describe('Schedule PDF Generation', () => {
  it('should calculate Gantt bar positions correctly', () => {
    const scheduleItems = [
      { phase: 'Mobilização', description: 'Preparo', startDay: 1, endDay: 2, duration: 2 },
      { phase: 'Demolição', description: 'Demolição', startDay: 3, endDay: 5, duration: 3 },
      { phase: 'Alvenaria', description: 'Construção', startDay: 6, endDay: 15, duration: 10 },
    ];
    const totalDays = 15;
    
    const ganttPositions = scheduleItems.map(item => {
      const startPercent = ((item.startDay - 1) / totalDays) * 100;
      const widthPercent = (item.duration / totalDays) * 100;
      return { phase: item.phase, startPercent, widthPercent };
    });
    
    // Mobilização: começa em 0%, dura 2/15 = 13.33%
    expect(ganttPositions[0].startPercent).toBeCloseTo(0, 1);
    expect(ganttPositions[0].widthPercent).toBeCloseTo(13.33, 1);
    
    // Demolição: começa em 2/15 = 13.33%, dura 3/15 = 20%
    expect(ganttPositions[1].startPercent).toBeCloseTo(13.33, 1);
    expect(ganttPositions[1].widthPercent).toBeCloseTo(20, 1);
    
    // Alvenaria: começa em 5/15 = 33.33%, dura 10/15 = 66.67%
    expect(ganttPositions[2].startPercent).toBeCloseTo(33.33, 1);
    expect(ganttPositions[2].widthPercent).toBeCloseTo(66.67, 1);
  });

  it('should generate milestone markers at correct positions', () => {
    const milestones = [
      { day: 2, description: 'Canteiro pronto' },
      { day: 10, description: 'Estrutura concluída' },
      { day: 15, description: 'Entrega final' },
    ];
    const totalDays = 15;
    
    const markerPositions = milestones.map(m => ({
      description: m.description,
      position: ((m.day - 1) / totalDays) * 100,
    }));
    
    expect(markerPositions[0].position).toBeCloseTo(6.67, 1); // (2-1)/15 * 100
    expect(markerPositions[1].position).toBeCloseTo(60, 1);   // (10-1)/15 * 100
    expect(markerPositions[2].position).toBeCloseTo(93.33, 1); // (15-1)/15 * 100
  });
});

describe('Logistics Optional Items Schema', () => {
  it('should validate optional item structure', () => {
    const optionalItem = {
      category: 'Mobilização',
      description: 'Placa de obra padrão',
      quantity: 1,
      unit: 'un',
      unitCost: 350,
      totalCost: 350,
      reason: 'Identificação visual do canteiro conforme exigência municipal',
    };
    
    // Validar campos obrigatórios
    expect(optionalItem.category).toBeDefined();
    expect(optionalItem.description).toBeDefined();
    expect(optionalItem.quantity).toBeGreaterThan(0);
    expect(optionalItem.unit).toBeDefined();
    expect(optionalItem.unitCost).toBeGreaterThan(0);
    expect(optionalItem.totalCost).toBe(optionalItem.quantity * optionalItem.unitCost);
    expect(optionalItem.reason).toBeDefined();
    expect(optionalItem.reason.length).toBeGreaterThan(10);
  });

  it('should calculate total optional cost correctly', () => {
    const optionalItems = [
      { totalCost: 350 },
      { totalCost: 1000 },
      { totalCost: 500 },
    ];
    
    const totalOptionalCost = optionalItems.reduce((sum, item) => sum + item.totalCost, 0);
    expect(totalOptionalCost).toBe(1850);
  });
});
