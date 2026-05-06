import Stripe from "stripe";
import { getDb } from "../db";
import { subscriptions, budgetCredits, users } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { PLANS, TIERS, getStripePriceId, type Tier } from "./products";

let _stripe: Stripe | null = null;

function getStripeClient(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-01-27.acacia" as any,
    });
  }
  return _stripe;
}

// ==================== CHECKOUT ====================

export async function createSubscriptionCheckout(
  userId: number,
  userEmail: string,
  userName: string,
  origin: string
) {
  const customerId = await getOrCreateStripeCustomer(
    userId,
    userEmail,
    userName
  );

  const session = await getStripeClient().checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [
      {
        price_data: {
          currency: PLANS.mensal.currency,
          product_data: {
            name: PLANS.mensal.name,
            description: PLANS.mensal.description,
          },
          unit_amount: PLANS.mensal.priceInCents,
          recurring: { interval: PLANS.mensal.interval },
        },
        quantity: 1,
      },
    ],
    client_reference_id: userId.toString(),
    metadata: {
      user_id: userId.toString(),
      customer_email: userEmail,
      customer_name: userName,
      plan: "mensal",
    },
    allow_promotion_codes: true,
    success_url: `${origin}/dashboard?payment=success&plan=mensal`,
    cancel_url: `${origin}/planos?payment=canceled`,
  });

  return session;
}

export async function createSingleBudgetCheckout(
  userId: number,
  userEmail: string,
  userName: string,
  origin: string,
  quantity: number = 1
) {
  const customerId = await getOrCreateStripeCustomer(
    userId,
    userEmail,
    userName
  );

  const session = await getStripeClient().checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: PLANS.avulso.currency,
          product_data: {
            name: PLANS.avulso.name,
            description: PLANS.avulso.description,
          },
          unit_amount: PLANS.avulso.priceInCents,
        },
        quantity,
      },
    ],
    client_reference_id: userId.toString(),
    metadata: {
      user_id: userId.toString(),
      customer_email: userEmail,
      customer_name: userName,
      plan: "avulso",
      credits: quantity.toString(),
    },
    allow_promotion_codes: true,
    success_url: `${origin}/dashboard?payment=success&plan=avulso`,
    cancel_url: `${origin}/planos?payment=canceled`,
  });

  return session;
}

// ==================== 3-TIER CHECKOUT (Sprint 5 / P1.7) ====================

const FRONTEND_URL = process.env.FRONTEND_URL ?? "https://engine.rres.com.br";

/**
 * Cria sessão de checkout para um dos tiers Sprint 5 (starter/pro/business).
 * Usa Price IDs configurados em STRIPE_PRICE_{STARTER,PRO,BUSINESS} —
 * preços vivos no Stripe Dashboard, não duplicados aqui.
 */
export async function createTierCheckout(
  userId: number,
  userEmail: string,
  userName: string,
  tier: Tier
) {
  const priceId = getStripePriceId(tier);
  const customerId = await getOrCreateStripeCustomer(
    userId,
    userEmail,
    userName
  );

  const session = await getStripeClient().checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: userId.toString(),
    metadata: {
      user_id: userId.toString(),
      customer_email: userEmail,
      customer_name: userName,
      tier,
      plan: tier,
    },
    allow_promotion_codes: true,
    success_url: `${FRONTEND_URL}/dashboard/settings?stripe=success`,
    cancel_url: `${FRONTEND_URL}/planos?stripe=canceled`,
  });

  return session;
}

/**
 * Cancela a assinatura ativa do usuário no fim do período atual.
 * O Stripe envia `customer.subscription.updated` (com `cancel_at_period_end=true`)
 * imediatamente e `customer.subscription.deleted` quando o período fecha.
 */
export async function cancelUserSubscription(userId: number): Promise<{
  success: true;
  cancelAt: Date;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(
      and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active"))
    )
    .limit(1);

  if (!sub?.stripeSubscriptionId) {
    throw new Error("Nenhuma assinatura ativa encontrada");
  }

  const updated = await getStripeClient().subscriptions.update(
    sub.stripeSubscriptionId,
    { cancel_at_period_end: true }
  );

  // Stripe pode retornar `cancel_at` (ts em segundos) OU usar
  // `current_period_end`. Preferimos `cancel_at` quando vier.
  const stripeAny = updated as unknown as {
    cancel_at?: number | null;
    current_period_end?: number;
  };
  const cancelAtSec = stripeAny.cancel_at ?? stripeAny.current_period_end ?? 0;

  return {
    success: true,
    cancelAt: new Date(cancelAtSec * 1000),
  };
}

/**
 * Resposta do `stripe.getCurrentSubscription` — espelhada no schema do
 * frontend. Retorna null quando o usuário não tem nenhuma assinatura
 * (incluindo histórico — é literalmente "sem registro").
 */
export interface CurrentSubscriptionInfo {
  plan: Tier | "mensal" | "avulso" | "free" | null;
  status: string;
  currentPeriodEnd: Date | null;
  quotaUsed: number;
  quotaLimit: number | null;
  obraValueCap: number | null;
}

export async function getCurrentSubscription(
  userId: number
): Promise<CurrentSubscriptionInfo | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(sql`${subscriptions.createdAt} DESC`)
    .limit(1);

  if (!sub) return null;

  return {
    plan: sub.plan,
    status: sub.status,
    currentPeriodEnd: sub.currentPeriodEnd ?? null,
    quotaUsed: sub.quotaUsed,
    quotaLimit: sub.quotaLimit > 0 ? sub.quotaLimit : null,
    obraValueCap: sub.obraValueCap !== null ? Number(sub.obraValueCap) : null,
  };
}

// ==================== CUSTOMER MANAGEMENT ====================

async function getOrCreateStripeCustomer(
  userId: number,
  email: string,
  name: string
): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  if (existing?.stripeCustomerId) {
    return existing.stripeCustomerId;
  }

  const customer = await getStripeClient().customers.create({
    email,
    name,
    metadata: { user_id: userId.toString() },
  });

  return customer.id;
}

// ==================== SUBSCRIPTION MANAGEMENT ====================

export async function canCreateBudget(userId: number): Promise<{
  allowed: boolean;
  reason?: string;
  plan: string;
  quotaUsed?: number;
  quotaLimit?: number;
  creditsAvailable?: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Sprint 5 (P1.7): qualquer assinatura ativa (mensal legado OU
  // starter/pro/business novos) entra neste check. Business com
  // quotaLimit=0 sinaliza ilimitado.
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(
      and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active"))
    )
    .orderBy(sql`${subscriptions.createdAt} DESC`)
    .limit(1);

  if (sub) {
    const now = new Date();
    const periodActive = !sub.currentPeriodEnd || now <= sub.currentPeriodEnd;
    if (periodActive) {
      // Business / qualquer plano com quotaLimit <= 0 → sem limite.
      if (sub.quotaLimit <= 0) {
        return {
          allowed: true,
          plan: sub.plan,
          quotaUsed: sub.quotaUsed,
          quotaLimit: undefined,
        };
      }
      if (sub.quotaUsed < sub.quotaLimit) {
        return {
          allowed: true,
          plan: sub.plan,
          quotaUsed: sub.quotaUsed,
          quotaLimit: sub.quotaLimit,
        };
      }
      return {
        allowed: false,
        reason: `Limite de ${sub.quotaLimit} orçamentos atingido neste período. Aguarde o próximo ciclo ou faça upgrade.`,
        plan: sub.plan,
        quotaUsed: sub.quotaUsed,
        quotaLimit: sub.quotaLimit,
      };
    }
  }

  // 2. Verificar créditos avulsos
  const credits = await db
    .select()
    .from(budgetCredits)
    .where(
      and(eq(budgetCredits.userId, userId), eq(budgetCredits.status, "paid"))
    );

  const totalCredits = credits.reduce(
    (sum: number, c: any) => sum + c.creditsTotal,
    0
  );
  const usedCredits = credits.reduce(
    (sum: number, c: any) => sum + c.creditsUsed,
    0
  );
  const available = totalCredits - usedCredits;

  if (available > 0) {
    return {
      allowed: true,
      plan: "avulso",
      creditsAvailable: available,
    };
  }

  // 3. Admin sempre pode
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (user?.role === "admin") {
    return { allowed: true, plan: "admin" };
  }

  return {
    allowed: false,
    reason:
      "Nenhum plano ativo ou crédito disponível. Assine o Plano Profissional ou compre orçamentos avulsos.",
    plan: "none",
  };
}

export async function consumeBudgetCredit(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 1. Tentar consumir de qualquer assinatura ativa (Sprint 5: starter,
  // pro, business OU mensal legado). Business (quotaLimit<=0) consome
  // sem cap — incrementa counter mas allow é sempre true.
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(
      and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active"))
    )
    .orderBy(sql`${subscriptions.createdAt} DESC`)
    .limit(1);

  if (sub) {
    if (sub.quotaLimit <= 0) {
      // Plano ilimitado: incrementa contador para visibilidade, sempre allow.
      await db
        .update(subscriptions)
        .set({ quotaUsed: sql`${subscriptions.quotaUsed} + 1` })
        .where(eq(subscriptions.id, sub.id));
      return true;
    }
    if (sub.quotaUsed < sub.quotaLimit) {
      const result = await db
        .update(subscriptions)
        .set({ quotaUsed: sql`${subscriptions.quotaUsed} + 1` })
        .where(
          and(
            eq(subscriptions.id, sub.id),
            sql`${subscriptions.quotaUsed} < ${subscriptions.quotaLimit}`
          )
        );
      if ((result as any)[0]?.affectedRows > 0) {
        return true;
      }
    }
  }

  // 2. Tentar consumir crédito avulso (mais antigo primeiro)
  const credits = await db
    .select()
    .from(budgetCredits)
    .where(
      and(eq(budgetCredits.userId, userId), eq(budgetCredits.status, "paid"))
    );

  for (const credit of credits) {
    if (credit.creditsUsed < credit.creditsTotal) {
      // Atomic update with condition to prevent race conditions
      const result = await db
        .update(budgetCredits)
        .set({ creditsUsed: sql`${budgetCredits.creditsUsed} + 1` })
        .where(
          and(
            eq(budgetCredits.id, credit.id),
            sql`${budgetCredits.creditsUsed} < ${budgetCredits.creditsTotal}`
          )
        );
      if ((result as any)[0]?.affectedRows > 0) {
        return true;
      }
    }
  }

  // 3. Admin não consome crédito
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (user?.role === "admin") {
    return true;
  }

  return false;
}

export async function getUserPlanInfo(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(sql`${subscriptions.createdAt} DESC`)
    .limit(1);

  const credits = await db
    .select()
    .from(budgetCredits)
    .where(
      and(eq(budgetCredits.userId, userId), eq(budgetCredits.status, "paid"))
    );

  const totalCredits = credits.reduce(
    (sum: number, c: any) => sum + c.creditsTotal,
    0
  );
  const usedCredits = credits.reduce(
    (sum: number, c: any) => sum + c.creditsUsed,
    0
  );

  return {
    subscription: sub
      ? {
          plan: sub.plan,
          status: sub.status,
          quotaUsed: sub.quotaUsed,
          quotaLimit: sub.quotaLimit,
          currentPeriodEnd: sub.currentPeriodEnd,
        }
      : null,
    credits: {
      total: totalCredits,
      used: usedCredits,
      available: totalCredits - usedCredits,
    },
  };
}

export async function createCustomerPortal(userId: number, origin: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  if (!sub?.stripeCustomerId) {
    throw new Error("Nenhuma assinatura encontrada");
  }

  const session = await getStripeClient().billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${origin}/planos`,
  });

  return session;
}

// ==================== WEBHOOK HANDLERS ====================

/**
 * Mapeia um plano da tabela `subscriptions` para `quotaLimit` e
 * `obraValueCap` derivados do catálogo TIERS. Para `business`,
 * `quotaLimit` é 0 (sentinela de ilimitado) e `obraValueCap` é null.
 * Para planos legados não-Sprint-5 (mensal/avulso/free), retorna defaults.
 */
function tierDataFor(plan: Tier | string): {
  quotaLimit: number;
  obraValueCap: string | null;
} {
  if (plan === "starter" || plan === "pro" || plan === "business") {
    const def = TIERS[plan];
    return {
      quotaLimit: def.quota ?? 0,
      obraValueCap:
        def.capCents === null ? null : (def.capCents / 100).toFixed(2),
    };
  }
  if (plan === "mensal") {
    return { quotaLimit: PLANS.mensal.quotaLimit, obraValueCap: null };
  }
  return { quotaLimit: 0, obraValueCap: null };
}

export async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const userId = parseInt(
    session.metadata?.user_id || session.client_reference_id || "0"
  );
  if (!userId) {
    console.error("[Stripe Webhook] No user_id in session metadata");
    return;
  }

  const plan = session.metadata?.plan;
  const isSprint5Tier =
    plan === "starter" || plan === "pro" || plan === "business";

  if ((plan === "mensal" || isSprint5Tier) && session.subscription) {
    const stripeSub = await getStripeClient().subscriptions.retrieve(
      session.subscription as string
    );

    const [existing] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    const tierData = tierDataFor(plan);
    const subData = {
      userId,
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: session.subscription as string,
      status: "active" as const,
      plan: plan as "mensal" | Tier,
      quotaUsed: 0,
      quotaLimit: tierData.quotaLimit,
      obraValueCap: tierData.obraValueCap,
      currentPeriodStart: new Date(
        ((stripeSub as any).current_period_start || 0) * 1000
      ),
      currentPeriodEnd: new Date(
        ((stripeSub as any).current_period_end || 0) * 1000
      ),
    };

    if (existing) {
      await db
        .update(subscriptions)
        .set(subData)
        .where(eq(subscriptions.id, existing.id));
    } else {
      await db.insert(subscriptions).values(subData);
    }

    console.log(`[Stripe] Assinatura ${plan} ativada para user ${userId}`);
  } else if (plan === "avulso") {
    const credits = parseInt(session.metadata?.credits || "1");

    await db.insert(budgetCredits).values({
      userId,
      stripePaymentIntentId: session.payment_intent as string,
      stripeSessionId: session.id,
      creditsTotal: credits,
      creditsUsed: 0,
      status: "paid",
    });

    console.log(
      `[Stripe] ${credits} crédito(s) avulso(s) adicionado(s) para user ${userId}`
    );
  }
}

export async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
) {
  const db = await getDb();
  if (!db) return;

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, subscription.id))
    .limit(1);

  if (!sub) return;

  const statusMap: Record<string, string> = {
    active: "active",
    canceled: "canceled",
    past_due: "past_due",
    trialing: "trialing",
    incomplete: "incomplete",
    incomplete_expired: "canceled",
    unpaid: "past_due",
    paused: "canceled",
  };

  await db
    .update(subscriptions)
    .set({
      status: (statusMap[subscription.status] || "incomplete") as any,
      currentPeriodStart: new Date(
        ((subscription as any).current_period_start || 0) * 1000
      ),
      currentPeriodEnd: new Date(
        ((subscription as any).current_period_end || 0) * 1000
      ),
    })
    .where(eq(subscriptions.id, sub.id));

  console.log(
    `[Stripe] Subscription ${subscription.id} updated: ${subscription.status}`
  );
}

export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
) {
  const db = await getDb();
  if (!db) return;

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, subscription.id))
    .limit(1);

  if (!sub) return;

  await db
    .update(subscriptions)
    .set({ status: "canceled" })
    .where(eq(subscriptions.id, sub.id));

  console.log(`[Stripe] Subscription ${subscription.id} canceled`);
}

export async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const db = await getDb();
  if (!db) return;

  const invoiceAny = invoice as any;
  if (invoiceAny.subscription) {
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(
        eq(
          subscriptions.stripeSubscriptionId,
          invoiceAny.subscription as string
        )
      )
      .limit(1);

    if (sub) {
      // Sprint 5: também avança currentPeriodEnd para refletir o ciclo
      // que acabou de ser pago. Sem essa atualização, canCreateBudget
      // continua usando o currentPeriodEnd antigo até o próximo
      // customer.subscription.updated.
      const stripeSub = await getStripeClient().subscriptions.retrieve(
        invoiceAny.subscription as string
      );
      const stripeAny = stripeSub as any;
      await db
        .update(subscriptions)
        .set({
          quotaUsed: 0,
          currentPeriodStart: new Date(
            (stripeAny.current_period_start || 0) * 1000
          ),
          currentPeriodEnd: new Date(
            (stripeAny.current_period_end || 0) * 1000
          ),
        })
        .where(eq(subscriptions.id, sub.id));

      console.log(
        `[Stripe] Quota resetada para subscription ${invoiceAny.subscription}`
      );
    }
  }
}

// ==================== PAYMENT HISTORY ====================

export async function getPaymentHistory(userId: number): Promise<
  Array<{
    id: string;
    date: number;
    amount: number;
    currency: string;
    status: string;
    description: string;
    type: "subscription" | "avulso";
    receiptUrl: string | null;
  }>
> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Buscar o stripeCustomerId do usuário
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  if (!sub?.stripeCustomerId) {
    return [];
  }

  try {
    // Buscar charges do Stripe para esse customer
    const charges = await getStripeClient().charges.list({
      customer: sub.stripeCustomerId,
      limit: 50,
    });

    return charges.data.map(charge => {
      const chargeAny = charge as any;
      const isSubscription = !!chargeAny.invoice;
      return {
        id: charge.id,
        date: charge.created,
        amount: charge.amount,
        currency: charge.currency,
        status: charge.status,
        description:
          charge.description ||
          (isSubscription ? "Plano Profissional - Mensal" : "Orçamento Avulso"),
        type: isSubscription ? ("subscription" as const) : ("avulso" as const),
        receiptUrl: charge.receipt_url || null,
      };
    });
  } catch (err: any) {
    console.error("[Stripe] Error fetching payment history:", err.message);
    return [];
  }
}

export { getStripeClient };
