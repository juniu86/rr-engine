/**
 * Sprint 5 (P1.7) — testes do catálogo de tiers, gate por tier e
 * sequência de webhook events.
 *
 * Mocks: `./db` (in-memory store), Stripe client (skip rede). Estes
 * testes validam a lógica de plano/cap/quota — o teste de assinatura
 * Stripe live fica em sprint5-webhook.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock do banco antes de importar qualquer módulo do servidor ────────────

type SubRow = {
  id: number;
  userId: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: string;
  plan: string;
  quotaUsed: number;
  quotaLimit: number;
  obraValueCap: string | null;
  currentPeriodEnd: Date | null;
  currentPeriodStart: Date | null;
  createdAt: Date;
};

const fakeDb = {
  subs: [] as SubRow[],
  credits: [] as Array<{
    id: number;
    userId: number;
    creditsTotal: number;
    creditsUsed: number;
    status: string;
  }>,
  users: [] as Array<{ id: number; role: string }>,
};

let nextSubId = 1;

// Drizzle table objects são opacos — identificamos por referência.
// Importamos lazily dentro do mockGetDb para evitar circular deps.
const buildBuilder = (rows: any[]) => {
  const builder: any = {
    where: () => builder,
    orderBy: () => builder,
    limit: async () => rows.slice(0, 1),
    then: (resolve: (v: any) => void) => Promise.resolve(rows).then(resolve),
  };
  return builder;
};

const mockGetDb = async () => {
  const schema = await import("../../drizzle/schema");
  return {
    select: () => ({
      from: (table: any) => {
        if (table === schema.subscriptions) return buildBuilder(fakeDb.subs);
        if (table === schema.budgetCredits) return buildBuilder(fakeDb.credits);
        if (table === schema.users) return buildBuilder(fakeDb.users);
        return buildBuilder([]);
      },
    }),
    update: (table: any) => ({
      set: (changes: any) => ({
        where: async () => {
          if (table === schema.subscriptions) {
            fakeDb.subs.forEach(s => {
              for (const k of Object.keys(changes)) {
                const v = (changes as any)[k];
                if (
                  v &&
                  typeof v === "object" &&
                  ("queryChunks" in v || "_" in v)
                ) {
                  // sql`${quotaUsed} + 1` — incremento simples
                  if (k === "quotaUsed") s.quotaUsed += 1;
                } else {
                  (s as any)[k] = v;
                }
              }
            });
          }
          return [{ affectedRows: 1 }];
        },
      }),
    }),
    insert: (_table: any) => ({
      values: async (data: any) => {
        const row: SubRow = {
          id: nextSubId++,
          userId: data.userId,
          stripeCustomerId: data.stripeCustomerId ?? null,
          stripeSubscriptionId: data.stripeSubscriptionId ?? null,
          status: data.status ?? "incomplete",
          plan: data.plan ?? "free",
          quotaUsed: data.quotaUsed ?? 0,
          quotaLimit: data.quotaLimit ?? 0,
          obraValueCap: data.obraValueCap ?? null,
          currentPeriodEnd: data.currentPeriodEnd ?? null,
          currentPeriodStart: data.currentPeriodStart ?? null,
          createdAt: new Date(),
        };
        fakeDb.subs.push(row);
        return row;
      },
    }),
  };
};

vi.mock("../db", () => ({
  getDb: () => mockGetDb(),
}));

// ─── Stripe client é mockado para não bater rede ────────────────────────────

const stripeMock = {
  subscriptions: {
    update: vi.fn().mockResolvedValue({
      id: "sub_test",
      status: "active",
      cancel_at: 1_900_000_000,
      current_period_end: 1_900_000_000,
    }),
    retrieve: vi.fn().mockResolvedValue({
      id: "sub_test",
      status: "active",
      current_period_start: 1_700_000_000,
      current_period_end: 1_900_000_000,
    }),
  },
  customers: {
    create: vi.fn().mockResolvedValue({ id: "cus_test_new" }),
  },
  checkout: {
    sessions: {
      create: vi.fn().mockResolvedValue({
        id: "cs_test_123",
        url: "https://checkout.stripe.com/c/test",
      }),
    },
  },
};

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => stripeMock),
}));

// ─── Imports de produção (depois dos mocks) ─────────────────────────────────

import { TIERS, listPublicTiers, getStripePriceId } from "./products";
import {
  canCreateBudget,
  createTierCheckout,
  cancelUserSubscription,
  getCurrentSubscription,
  handleCheckoutCompleted,
  handleSubscriptionDeleted,
  handleInvoicePaid,
} from "./stripeService";

// ─── Reset entre testes ─────────────────────────────────────────────────────

beforeEach(() => {
  fakeDb.subs.length = 0;
  fakeDb.credits.length = 0;
  fakeDb.users.length = 0;
  nextSubId = 1;
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  process.env.STRIPE_PRICE_STARTER = "price_starter_test";
  process.env.STRIPE_PRICE_PRO = "price_pro_test";
  process.env.STRIPE_PRICE_BUSINESS = "price_business_test";
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── TIERS ──────────────────────────────────────────────────────────────────

describe("TIERS catálogo (Sprint 5)", () => {
  it("define 3 tiers com preços e caps esperados", () => {
    expect(TIERS.starter.priceMonthlyCents).toBe(19900);
    expect(TIERS.starter.quota).toBe(5);
    expect(TIERS.starter.capCents).toBe(50_000_000);

    expect(TIERS.pro.priceMonthlyCents).toBe(49900);
    expect(TIERS.pro.quota).toBe(20);
    expect(TIERS.pro.capCents).toBe(500_000_000);

    expect(TIERS.business.priceMonthlyCents).toBe(149900);
    expect(TIERS.business.quota).toBeNull();
    expect(TIERS.business.capCents).toBeNull();
  });

  it("listPublicTiers retorna 3 entradas com priceFormatted BRL e priceId", () => {
    const list = listPublicTiers();
    expect(list).toHaveLength(3);
    const starter = list.find(p => p.tier === "starter");
    expect(starter?.priceMonthly).toBe(199);
    expect(starter?.priceFormatted).toMatch(/R\$\s?199,00/);
    expect(starter?.priceId).toBe("price_starter_test");
  });

  it("getStripePriceId lança quando env var não configurada", () => {
    delete process.env.STRIPE_PRICE_STARTER;
    expect(() => getStripePriceId("starter")).toThrow(/STRIPE_PRICE_STARTER/);
  });
});

// ─── canCreateBudget ────────────────────────────────────────────────────────

const futureDate = () => new Date(Date.now() + 30 * 24 * 3600 * 1000);

const seedSub = (overrides: Partial<SubRow>): SubRow => {
  const row: SubRow = {
    id: nextSubId++,
    userId: 1,
    stripeCustomerId: null,
    stripeSubscriptionId: "sub_test",
    status: "active",
    plan: "starter",
    quotaUsed: 0,
    quotaLimit: 5,
    obraValueCap: "500000.00",
    currentPeriodEnd: futureDate(),
    currentPeriodStart: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
  fakeDb.subs.push(row);
  return row;
};

describe("canCreateBudget por tier (Sprint 5)", () => {
  it("Starter dentro da quota → allowed=true", async () => {
    seedSub({ plan: "starter", quotaUsed: 2, quotaLimit: 5 });
    const r = await canCreateBudget(1);
    expect(r.allowed).toBe(true);
    expect(r.plan).toBe("starter");
    expect(r.quotaUsed).toBe(2);
    expect(r.quotaLimit).toBe(5);
  });

  it("Pro com quota esgotada → allowed=false", async () => {
    seedSub({ plan: "pro", quotaUsed: 20, quotaLimit: 20 });
    const r = await canCreateBudget(1);
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/Limite de 20/);
  });

  it("Business com quotaLimit=0 (ilimitado) → allowed=true sem limite", async () => {
    seedSub({
      plan: "business",
      quotaUsed: 999,
      quotaLimit: 0,
      obraValueCap: null,
    });
    const r = await canCreateBudget(1);
    expect(r.allowed).toBe(true);
    expect(r.plan).toBe("business");
    expect(r.quotaLimit).toBeUndefined();
  });

  it("Mensal legado continua funcionando (compat)", async () => {
    seedSub({
      plan: "mensal",
      quotaUsed: 3,
      quotaLimit: 10,
      obraValueCap: null,
    });
    const r = await canCreateBudget(1);
    expect(r.allowed).toBe(true);
    expect(r.plan).toBe("mensal");
  });
});

// ─── getCurrentSubscription ────────────────────────────────────────────────

describe("getCurrentSubscription (Sprint 5)", () => {
  it("retorna null quando usuário nunca assinou", async () => {
    const r = await getCurrentSubscription(42);
    expect(r).toBeNull();
  });

  it("retorna obraValueCap como número quando definido", async () => {
    seedSub({ plan: "pro", obraValueCap: "5000000.00" });
    const r = await getCurrentSubscription(1);
    expect(r?.plan).toBe("pro");
    expect(r?.obraValueCap).toBe(5_000_000);
    expect(r?.quotaLimit).toBe(5);
  });

  it("retorna obraValueCap null para Business", async () => {
    seedSub({ plan: "business", obraValueCap: null, quotaLimit: 0 });
    const r = await getCurrentSubscription(1);
    expect(r?.obraValueCap).toBeNull();
    expect(r?.quotaLimit).toBeNull();
  });
});

// ─── createTierCheckout / cancelUserSubscription ────────────────────────────

describe("createTierCheckout (Sprint 5)", () => {
  it("retorna URL e sessionId quando Stripe responde sucesso", async () => {
    const session = await createTierCheckout(
      1,
      "user@example.com",
      "User",
      "starter"
    );
    expect(session.id).toBe("cs_test_123");
    expect(session.url).toContain("checkout.stripe.com");
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(1);
    const args = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(args.line_items[0].price).toBe("price_starter_test");
    expect(args.mode).toBe("subscription");
  });

  it("propaga erro de configuração quando Price ID não está setado", async () => {
    delete process.env.STRIPE_PRICE_PRO;
    await expect(createTierCheckout(1, "u@e.com", "U", "pro")).rejects.toThrow(
      /STRIPE_PRICE_PRO/
    );
  });
});

describe("cancelUserSubscription (Sprint 5)", () => {
  it("retorna cancelAt quando há assinatura ativa", async () => {
    seedSub({ stripeSubscriptionId: "sub_active_xyz" });
    const r = await cancelUserSubscription(1);
    expect(r.success).toBe(true);
    expect(r.cancelAt).toBeInstanceOf(Date);
    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
      "sub_active_xyz",
      { cancel_at_period_end: true }
    );
  });

  it("lança quando não há assinatura ativa", async () => {
    await expect(cancelUserSubscription(99)).rejects.toThrow(
      /Nenhuma assinatura ativa/
    );
  });
});

// ─── Webhook handlers ───────────────────────────────────────────────────────

describe("Webhook handlers (Sprint 5)", () => {
  it("handleCheckoutCompleted insere subscription do tier Pro", async () => {
    const session = {
      id: "cs_test",
      customer: "cus_x",
      subscription: "sub_x",
      client_reference_id: "1",
      metadata: { user_id: "1", plan: "pro", tier: "pro" },
    } as any;
    await handleCheckoutCompleted(session);
    expect(fakeDb.subs).toHaveLength(1);
    const row = fakeDb.subs[0];
    expect(row.plan).toBe("pro");
    expect(row.quotaLimit).toBe(20);
    expect(row.obraValueCap).toBe("5000000.00");
    expect(row.status).toBe("active");
  });

  it("handleCheckoutCompleted Business deixa obraValueCap null", async () => {
    const session = {
      id: "cs_test",
      customer: "cus_x",
      subscription: "sub_x",
      client_reference_id: "1",
      metadata: { user_id: "1", plan: "business" },
    } as any;
    await handleCheckoutCompleted(session);
    expect(fakeDb.subs[0].plan).toBe("business");
    expect(fakeDb.subs[0].obraValueCap).toBeNull();
    expect(fakeDb.subs[0].quotaLimit).toBe(0);
  });

  it("handleSubscriptionDeleted marca status='canceled'", async () => {
    seedSub({ stripeSubscriptionId: "sub_to_cancel", status: "active" });
    await handleSubscriptionDeleted({ id: "sub_to_cancel" } as any);
    expect(fakeDb.subs[0].status).toBe("canceled");
  });

  it("handleInvoicePaid reseta quotaUsed e avança currentPeriodEnd", async () => {
    seedSub({
      stripeSubscriptionId: "sub_active_xyz",
      quotaUsed: 5,
      currentPeriodEnd: new Date(2026, 0, 1),
    });
    await handleInvoicePaid({
      subscription: "sub_active_xyz",
    } as any);
    expect(fakeDb.subs[0].quotaUsed).toBe(0);
    expect(fakeDb.subs[0].currentPeriodEnd?.getTime()).toBe(
      1_900_000_000 * 1000
    );
  });
});
