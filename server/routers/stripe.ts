import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createSubscriptionCheckout,
  createSingleBudgetCheckout,
  canCreateBudget,
  getUserPlanInfo,
  createCustomerPortal,
  getPaymentHistory,
} from "../stripe/stripeService";
import { PLANS } from "../stripe/products";

export const stripeRouter = router({
  // Retorna os planos disponíveis (público para exibição)
  getPlans: protectedProcedure.query(() => {
    return {
      mensal: {
        ...PLANS.mensal,
        priceFormatted: "R$ 450,00",
      },
      avulso: {
        ...PLANS.avulso,
        priceFormatted: "R$ 89,90",
      },
    };
  }),

  // Retorna informações do plano do usuário logado
  getPlanInfo: protectedProcedure.query(async ({ ctx }) => {
    return getUserPlanInfo(ctx.user.id);
  }),

  // Verifica se o usuário pode criar um orçamento
  canCreateBudget: protectedProcedure.query(async ({ ctx }) => {
    return canCreateBudget(ctx.user.id);
  }),

  // Cria sessão de checkout para assinatura mensal
  createSubscriptionCheckout: protectedProcedure.mutation(async ({ ctx }) => {
    const origin = `${ctx.req.protocol}://${ctx.req.get("host")}`;
    const session = await createSubscriptionCheckout(
      ctx.user.id,
      ctx.user.email || "",
      ctx.user.name || "",
      origin
    );
    return { url: session.url };
  }),

  // Cria sessão de checkout para orçamento avulso
  createSingleBudgetCheckout: protectedProcedure
    .input(
      z.object({
        quantity: z.number().min(1).max(50).default(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const origin = `${ctx.req.protocol}://${ctx.req.get("host")}`;
      const session = await createSingleBudgetCheckout(
        ctx.user.id,
        ctx.user.email || "",
        ctx.user.name || "",
        origin,
        input.quantity
      );
      return { url: session.url };
    }),

  // Retorna histórico de pagamentos do usuário
  getPaymentHistory: protectedProcedure.query(async ({ ctx }) => {
    return getPaymentHistory(ctx.user.id);
  }),

  // Cria sessão do portal de billing do Stripe
  createPortalSession: protectedProcedure.mutation(async ({ ctx }) => {
    const origin = `${ctx.req.protocol}://${ctx.req.get("host")}`;
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
