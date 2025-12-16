import { describe, expect, it, vi } from "vitest";
import { formatCurrency } from "./services/documents";

// Mock storage and db
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://example.com/file.pdf", key: "test/file.pdf" }),
}));

vi.mock("./db", () => ({
  createGeneratedDocument: vi.fn().mockResolvedValue(1),
}));

describe("Document Service", () => {
  describe("formatCurrency", () => {
    it("formats positive values correctly", () => {
      expect(formatCurrency(1234.56)).toBe("R$ 1.234,56");
    });

    it("formats zero correctly", () => {
      expect(formatCurrency(0)).toBe("R$ 0,00");
    });

    it("formats large values correctly", () => {
      expect(formatCurrency(1234567.89)).toBe("R$ 1.234.567,89");
    });

    it("formats small decimal values correctly", () => {
      expect(formatCurrency(0.01)).toBe("R$ 0,01");
    });
  });
});
