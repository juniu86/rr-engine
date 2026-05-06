import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createSubscriptionCheckout,
  createSingleBudgetCheckout,
  createTierCheckout,
  cancelUserSubscription,
  getCurrentSubscription,
  canCreateBudget,
  getUserPlanInfo,
  createCustomerPortal,
  getPaymentHistory,
} from "../stripe/stripeService";
import { PLANS, listPublicTiers } from "../stripe/products";

export const stripeRouter = router({
  // ─── Sprint 5 (P1.7) — 3 tiers ─────────────────────────────────────────────

  /** Catálogo público dos tiers (sem proteção) — usado pela página /planos. */
  listPlans: publicProcedure.query(() => listPublicTiers()),

  /** Cria sessão de checkout para um dos 3 tiers Sprint 5. */
  createCheckout: protectedProcedure
    .input(z.object({ tier: z.enum(["starter", "pro", "business"]) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const session = await createTierCheckout(
          ctx.user.id,
          ctx.user.email || "",
          ctx.user.name || "",
          input.tier
        );
        return { sessionId: session.id, url: session.url ?? "" };
      } catch (err: any) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: err.message || "Falha ao criar checkout",
        });
      }
    }),

  /** Cancela a assinatura ativa no fim do período atual. */
  cancelSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      return await cancelUserSubscription(ctx.user.id);
    } catch (err: any) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: err.message || "Nenhuma assinatura ativa",
      });
    }
  }),

  /** Detalhes da assinatura atual (ou null se nunca assinou). */
  getCurrentSubscription: protectedProcedure.query(async ({ ctx }) => {
    return getCurrentSubscription(ctx.user.id);
  }),

  // ─── Endpoints legados (mantidos para compat com checkouts antigos) ────────

  /** Catálogo legado (mensal + avulso). Mantido para o portal antigo. */
  getPlans: protectedProcedure.query(() => {
    return {
      mensal: { ...PLANS.mensal, priceFormatted: "R$ 450,00" },
      avulso: { ...PLANS.avulso, priceFormatted: "R$ 89,90" },
    };
  }),

  getPlanInfo: protectedProcedure.query(async ({ ctx }) => {
    return getUserPlanInfo(ctx.user.id);
  }),

  canCreateBudget: protectedProcedure.query(async ({ ctx }) => {
    return canCreateBudget(ctx.user.id);
  }),

  createSubscriptionCheckout: protectedProcedure.mutation(async ({ ctx }) => {
    const origin =
      ctx.req.headers.origin || `${ctx.req.protocol}://${ctx.req.get("host")}`;
    const session = await createSubscriptionCheckout(
      ctx.user.id,
      ctx.user.email || "",
      ctx.user.name || "",
      origin
    );
    return { url: session.url };
  }),

  createSingleBudgetCheckout: protectedProcedure
    .input(z.object({ quantity: z.number().min(1).max(50).default(1) }))
    .mutation(async ({ ctx, input }) => {
      const origin =
        ctx.req.headers.origin ||
        `${ctx.req.protocol}://${ctx.req.get("host")}`;
      const session = await createSingleBudgetCheckout(
        ctx.user.id,
        ctx.user.email || "",
        ctx.user.name || "",
        origin,
        input.quantity
      );
      return { url: session.url };
    }),

  getPaymentHistory: protectedProcedure.query(async ({ ctx }) => {
    return getPaymentHistory(ctx.user.id);
  }),

  createPortalSession: protectedProcedure.mutation(async ({ ctx }) => {
    const origin =
      ctx.req.headers.origin || `${ctx.req.protocol}://${ctx.req.get("host")}`;
    try {
      const session = await createCustomerPortal(ctx.user.id, origin);
      return { url: session.url };
    } catch (err: any) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: err.message || "Nenhuma assinatura encontrada para gerenciar",
      });
    }
  }),
});
