import Stripe from "stripe";
import { getDb } from "../db";
import { subscriptions, budgetCredits, users } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { PLANS } from "./products";

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
  const customerId = await getOrCreateStripeCustomer(userId, userEmail, userName);

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
  const customerId = await getOrCreateStripeCustomer(userId, userEmail, userName);

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

  // 1. Verificar assinatura ativa
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "active"),
        eq(subscriptions.plan, "mensal")
      )
    )
    .limit(1);

  if (sub) {
    const now = new Date();
    if (sub.currentPeriodEnd && now <= sub.currentPeriodEnd) {
      if (sub.quotaUsed < sub.quotaLimit) {
        return {
          allowed: true,
          plan: "mensal",
          quotaUsed: sub.quotaUsed,
          quotaLimit: sub.quotaLimit,
        };
      } else {
        return {
          allowed: false,
          reason: `Limite de ${sub.quotaLimit} orçamentos atingido neste período. Adquira créditos avulsos ou aguarde o próximo ciclo.`,
          plan: "mensal",
          quotaUsed: sub.quotaUsed,
          quotaLimit: sub.quotaLimit,
        };
      }
    }
  }

  // 2. Verificar créditos avulsos
  const credits = await db
    .select()
    .from(budgetCredits)
    .where(
      and(
        eq(budgetCredits.userId, userId),
        eq(budgetCredits.status, "paid")
      )
    );

  const totalCredits = credits.reduce((sum: number, c: any) => sum + c.creditsTotal, 0);
  const usedCredits = credits.reduce((sum: number, c: any) => sum + c.creditsUsed, 0);
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
    reason: "Nenhum plano ativo ou crédito disponível. Assine o Plano Profissional ou compre orçamentos avulsos.",
    plan: "none",
  };
}

export async function consumeBudgetCredit(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 1. Tentar consumir da assinatura mensal
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "active"),
        eq(subscriptions.plan, "mensal")
      )
    )
    .limit(1);

  if (sub && sub.quotaUsed < sub.quotaLimit) {
    // Atomic update with condition to prevent race conditions
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

  // 2. Tentar consumir crédito avulso (mais antigo primeiro)
  const credits = await db
    .select()
    .from(budgetCredits)
    .where(
      and(
        eq(budgetCredits.userId, userId),
        eq(budgetCredits.status, "paid")
      )
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
      and(
        eq(budgetCredits.userId, userId),
        eq(budgetCredits.status, "paid")
      )
    );

  const totalCredits = credits.reduce((sum: number, c: any) => sum + c.creditsTotal, 0);
  const usedCredits = credits.reduce((sum: number, c: any) => sum + c.creditsUsed, 0);

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

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const userId = parseInt(session.metadata?.user_id || session.client_reference_id || "0");
  if (!userId) {
    console.error("[Stripe Webhook] No user_id in session metadata");
    return;
  }

  const plan = session.metadata?.plan;

  if (plan === "mensal" && session.subscription) {
    const stripeSub = await getStripeClient().subscriptions.retrieve(session.subscription as string);

    const [existing] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    const subData = {
      userId,
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: session.subscription as string,
      status: "active" as const,
      plan: "mensal" as const,
      quotaUsed: 0,
      quotaLimit: PLANS.mensal.quotaLimit,
      currentPeriodStart: new Date(((stripeSub as any).current_period_start || 0) * 1000),
      currentPeriodEnd: new Date(((stripeSub as any).current_period_end || 0) * 1000),
    };

    if (existing) {
      await db.update(subscriptions).set(subData).where(eq(subscriptions.id, existing.id));
    } else {
      await db.insert(subscriptions).values(subData);
    }

    console.log(`[Stripe] Assinatura mensal ativada para user ${userId}`);
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

    console.log(`[Stripe] ${credits} crédito(s) avulso(s) adicionado(s) para user ${userId}`);
  }
}

export async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
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
      currentPeriodStart: new Date(((subscription as any).current_period_start || 0) * 1000),
      currentPeriodEnd: new Date(((subscription as any).current_period_end || 0) * 1000),
    })
    .where(eq(subscriptions.id, sub.id));

  console.log(`[Stripe] Subscription ${subscription.id} updated: ${subscription.status}`);
}

export async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const db = await getDb();
  if (!db) return;

  const invoiceAny = invoice as any;
  if (invoiceAny.subscription) {
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, invoiceAny.subscription as string))
      .limit(1);

    if (sub) {
      await db
        .update(subscriptions)
        .set({ quotaUsed: 0 })
        .where(eq(subscriptions.id, sub.id));

      console.log(`[Stripe] Quota resetada para subscription ${invoiceAny.subscription}`);
    }
  }
}

// ==================== PAYMENT HISTORY ====================

export async function getPaymentHistory(userId: number): Promise<Array<{
  id: string;
  date: number;
  amount: number;
  currency: string;
  status: string;
  description: string;
  type: "subscription" | "avulso";
  receiptUrl: string | null;
}>> {
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

    return charges.data.map((charge) => {
      const chargeAny = charge as any;
      const isSubscription = !!chargeAny.invoice;
      return {
        id: charge.id,
        date: charge.created,
        amount: charge.amount,
        currency: charge.currency,
        status: charge.status,
        description: charge.description || (isSubscription ? "Plano Profissional - Mensal" : "Orçamento Avulso"),
        type: isSubscription ? "subscription" as const : "avulso" as const,
        receiptUrl: charge.receipt_url || null,
      };
    });
  } catch (err: any) {
    console.error("[Stripe] Error fetching payment history:", err.message);
    return [];
  }
}

export { getStripeClient };
