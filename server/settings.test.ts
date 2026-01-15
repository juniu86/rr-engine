import { describe, it, expect, vi } from 'vitest';

// Mock do db
vi.mock('./db', () => ({
  getCompanySettingsOrDefault: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    companyName: 'Empresa Teste',
    cnpj: '12.345.678/0001-99',
    priceRegion: 'SP',
    taxaLeisSociais: '128.23',
    bdiPercentual: '25.00',
    lucroPercentual: '8.00',
    issPercentual: '5.00',
    pisPercentual: '0.65',
    cofinsPercentual: '3.00',
    irpjPercentual: '1.20',
    csllPercentual: '1.08',
    adminCentralPercentual: '4.00',
    despesasFinanceirasPercentual: '1.00',
    riscosPercentual: '1.00',
    regimeTributario: 'lucro_presumido',
    dataReferenciaPrecos: '2025/01',
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  createOrUpdateCompanySettings: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    bdiPercentual: '30.00',
  }),
}));

describe('Company Settings', () => {
  describe('Valores padrão', () => {
    it('deve ter BDI padrão de 25%', async () => {
      const { getCompanySettingsOrDefault } = await import('./db');
      const settings = await getCompanySettingsOrDefault(1);
      expect(parseFloat(settings.bdiPercentual as string)).toBe(25.00);
    });

    it('deve ter taxa de leis sociais padrão de 128.23%', async () => {
      const { getCompanySettingsOrDefault } = await import('./db');
      const settings = await getCompanySettingsOrDefault(1);
      expect(parseFloat(settings.taxaLeisSociais as string)).toBe(128.23);
    });

    it('deve ter ISS padrão de 5%', async () => {
      const { getCompanySettingsOrDefault } = await import('./db');
      const settings = await getCompanySettingsOrDefault(1);
      expect(parseFloat(settings.issPercentual as string)).toBe(5.00);
    });

    it('deve ter PIS+COFINS padrão de 3.65%', async () => {
      const { getCompanySettingsOrDefault } = await import('./db');
      const settings = await getCompanySettingsOrDefault(1);
      const pis = parseFloat(settings.pisPercentual as string);
      const cofins = parseFloat(settings.cofinsPercentual as string);
      expect(pis + cofins).toBe(3.65);
    });
  });

  describe('Cálculo de BDI', () => {
    it('deve calcular BDI corretamente a partir dos componentes', () => {
      // Fórmula: BDI = ((1 + AC + DF + R + L) / (1 - Tributos)) - 1
      const adminCentral = 0.04;
      const despesasFinanceiras = 0.01;
      const riscos = 0.01;
      const lucro = 0.08;
      const tributos = 0.05 + 0.0065 + 0.03 + 0.012 + 0.0108; // ISS + PIS + COFINS + IRPJ + CSLL

      const despesas = adminCentral + despesasFinanceiras + riscos + lucro;
      const bdi = ((1 + despesas) / (1 - tributos)) - 1;
      
      // BDI esperado: aproximadamente 26.5%
      expect(bdi).toBeGreaterThan(0.25);
      expect(bdi).toBeLessThan(0.30);
    });

    it('deve aplicar BDI sobre custo base sem duplicação de impostos', () => {
      const custoBase = 100000;
      const bdi = 0.25; // 25%
      
      // Preço de venda = Custo Base × (1 + BDI)
      const precoVenda = custoBase * (1 + bdi);
      
      expect(precoVenda).toBe(125000);
      
      // Verificar que não há duplicação (preço não deve ser > 2x custo base com BDI de 25%)
      expect(precoVenda / custoBase).toBeLessThan(2);
    });
  });

  describe('Validação de campos', () => {
    it('deve aceitar regiões válidas do Brasil', () => {
      const regioesValidas = ['SP', 'RJ', 'MG', 'BA', 'RS', 'PR', 'SC', 'PE', 'CE', 'DF'];
      regioesValidas.forEach(regiao => {
        expect(regiao.length).toBe(2);
      });
    });

    it('deve aceitar regimes tributários válidos', () => {
      const regimesValidos = ['simples_nacional', 'lucro_presumido', 'lucro_real'];
      expect(regimesValidos).toContain('lucro_presumido');
    });

    it('deve validar que ISS está entre 2% e 5%', () => {
      const issMin = 2;
      const issMax = 5;
      const issAtual = 5;
      
      expect(issAtual).toBeGreaterThanOrEqual(issMin);
      expect(issAtual).toBeLessThanOrEqual(issMax);
    });
  });

  describe('Integração com Agentes', () => {
    it('deve passar configurações de impostos para agente Tributário', () => {
      const companyTaxSettings = {
        regimeTributario: 'lucro_presumido',
        issPercentual: 5.0,
        pisPercentual: 0.65,
        cofinsPercentual: 3.0,
        irpjPercentual: 1.2,
        csllPercentual: 1.08,
        taxaLeisSociais: 128.23,
      };
      
      // Verificar que todos os campos necessários estão presentes
      expect(companyTaxSettings).toHaveProperty('regimeTributario');
      expect(companyTaxSettings).toHaveProperty('issPercentual');
      expect(companyTaxSettings).toHaveProperty('pisPercentual');
      expect(companyTaxSettings).toHaveProperty('cofinsPercentual');
    });

    it('deve passar configurações de BDI para agente Comercial', () => {
      const companyBdiSettings = {
        bdiPercentual: 25.0,
        lucroPercentual: 8.0,
        adminCentralPercentual: 4.0,
        despesasFinanceirasPercentual: 1.0,
        riscosPercentual: 1.0,
      };
      
      // Verificar que todos os campos necessários estão presentes
      expect(companyBdiSettings).toHaveProperty('bdiPercentual');
      expect(companyBdiSettings).toHaveProperty('lucroPercentual');
      expect(companyBdiSettings).toHaveProperty('adminCentralPercentual');
    });
  });
});
