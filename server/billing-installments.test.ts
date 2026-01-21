import { describe, it, expect } from "vitest";

describe("Billing Installments Configuration", () => {
  // Interface esperada para parcelas de faturamento
  interface BillingInstallment {
    name: string;
    percentage: number;
  }

  // Valores padrão do sistema
  const DEFAULT_INSTALLMENTS: BillingInstallment[] = [
    { name: "Entrada", percentage: 40 },
    { name: "Final", percentage: 60 }
  ];

  // Presets disponíveis
  const PRESETS = {
    "40-60": [{ name: "Entrada", percentage: 40 }, { name: "Final", percentage: 60 }],
    "50-50": [{ name: "Entrada", percentage: 50 }, { name: "Final", percentage: 50 }],
    "30-40-30": [
      { name: "Entrada", percentage: 30 },
      { name: "Intermediária", percentage: 40 },
      { name: "Final", percentage: 30 }
    ],
  };

  describe("Validação de Parcelas", () => {
    it("deve validar que a soma das parcelas é 100%", () => {
      const validateInstallments = (installments: BillingInstallment[]): boolean => {
        const total = installments.reduce((sum, item) => sum + item.percentage, 0);
        return total === 100;
      };

      // Parcelas válidas
      expect(validateInstallments(DEFAULT_INSTALLMENTS)).toBe(true);
      expect(validateInstallments(PRESETS["50-50"])).toBe(true);
      expect(validateInstallments(PRESETS["30-40-30"])).toBe(true);

      // Parcelas inválidas
      expect(validateInstallments([
        { name: "Entrada", percentage: 30 },
        { name: "Final", percentage: 50 }
      ])).toBe(false);

      expect(validateInstallments([
        { name: "Entrada", percentage: 60 },
        { name: "Final", percentage: 60 }
      ])).toBe(false);
    });

    it("deve exigir mínimo de 2 parcelas", () => {
      const validateMinInstallments = (installments: BillingInstallment[]): boolean => {
        return installments.length >= 2;
      };

      expect(validateMinInstallments(DEFAULT_INSTALLMENTS)).toBe(true);
      expect(validateMinInstallments(PRESETS["30-40-30"])).toBe(true);
      expect(validateMinInstallments([{ name: "Única", percentage: 100 }])).toBe(false);
    });

    it("deve validar que cada parcela tem nome e percentual", () => {
      const validateInstallmentFields = (installment: BillingInstallment): boolean => {
        return (
          typeof installment.name === "string" &&
          installment.name.length > 0 &&
          typeof installment.percentage === "number" &&
          installment.percentage >= 0 &&
          installment.percentage <= 100
        );
      };

      expect(validateInstallmentFields({ name: "Entrada", percentage: 40 })).toBe(true);
      expect(validateInstallmentFields({ name: "", percentage: 40 })).toBe(false);
      expect(validateInstallmentFields({ name: "Entrada", percentage: -10 })).toBe(false);
      expect(validateInstallmentFields({ name: "Entrada", percentage: 150 })).toBe(false);
    });
  });

  describe("Presets de Faturamento", () => {
    it("preset 40/60 deve somar 100%", () => {
      const total = PRESETS["40-60"].reduce((sum, item) => sum + item.percentage, 0);
      expect(total).toBe(100);
    });

    it("preset 50/50 deve somar 100%", () => {
      const total = PRESETS["50-50"].reduce((sum, item) => sum + item.percentage, 0);
      expect(total).toBe(100);
    });

    it("preset 30/40/30 deve somar 100%", () => {
      const total = PRESETS["30-40-30"].reduce((sum, item) => sum + item.percentage, 0);
      expect(total).toBe(100);
    });

    it("preset 30/40/30 deve ter 3 parcelas", () => {
      expect(PRESETS["30-40-30"].length).toBe(3);
    });
  });

  describe("Cálculo de Valores por Parcela", () => {
    it("deve calcular corretamente o valor de cada parcela", () => {
      const calculateInstallmentValues = (
        totalValue: number,
        installments: BillingInstallment[]
      ): { name: string; value: number }[] => {
        return installments.map(inst => ({
          name: inst.name,
          value: (totalValue * inst.percentage) / 100
        }));
      };

      const totalValue = 100000;
      const values = calculateInstallmentValues(totalValue, DEFAULT_INSTALLMENTS);

      expect(values[0].name).toBe("Entrada");
      expect(values[0].value).toBe(40000);
      expect(values[1].name).toBe("Final");
      expect(values[1].value).toBe(60000);

      // Verificar que a soma dos valores é igual ao total
      const sumValues = values.reduce((sum, item) => sum + item.value, 0);
      expect(sumValues).toBe(totalValue);
    });

    it("deve calcular valores para preset 30/40/30", () => {
      const calculateInstallmentValues = (
        totalValue: number,
        installments: BillingInstallment[]
      ): { name: string; value: number }[] => {
        return installments.map(inst => ({
          name: inst.name,
          value: (totalValue * inst.percentage) / 100
        }));
      };

      const totalValue = 150000;
      const values = calculateInstallmentValues(totalValue, PRESETS["30-40-30"]);

      expect(values[0].value).toBe(45000);  // 30% de 150000
      expect(values[1].value).toBe(60000);  // 40% de 150000
      expect(values[2].value).toBe(45000);  // 30% de 150000

      // Verificar que a soma dos valores é igual ao total
      const sumValues = values.reduce((sum, item) => sum + item.value, 0);
      expect(sumValues).toBe(totalValue);
    });
  });

  describe("Serialização JSON", () => {
    it("deve serializar e deserializar parcelas corretamente", () => {
      const installments = PRESETS["30-40-30"];
      const json = JSON.stringify(installments);
      const parsed = JSON.parse(json) as BillingInstallment[];

      expect(parsed).toEqual(installments);
      expect(parsed.length).toBe(3);
      expect(parsed[0].name).toBe("Entrada");
      expect(parsed[0].percentage).toBe(30);
    });

    it("deve lidar com valores padrão quando billingInstallments é null", () => {
      const getInstallments = (stored: unknown): BillingInstallment[] => {
        if (stored && Array.isArray(stored)) {
          return stored as BillingInstallment[];
        }
        return DEFAULT_INSTALLMENTS;
      };

      expect(getInstallments(null)).toEqual(DEFAULT_INSTALLMENTS);
      expect(getInstallments(undefined)).toEqual(DEFAULT_INSTALLMENTS);
      expect(getInstallments(PRESETS["50-50"])).toEqual(PRESETS["50-50"]);
    });
  });
});
