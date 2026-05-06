#!/usr/bin/env node
/**
 * Sprint 5 (P1.7) — bootstrap dos 3 produtos Stripe (Starter, Pro, Business)
 * via API.
 *
 * Uso:
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/create-stripe-products.mjs
 *
 * O que ele faz:
 *   1. Cria (ou atualiza) os 3 produtos no Stripe.
 *   2. Cria 1 Price recorrente mensal em BRL para cada produto.
 *   3. Imprime as 3 envs (`STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`,
 *      `STRIPE_PRICE_BUSINESS`) prontas pra colar no Railway.
 *
 * O script é idempotente por produto via metadata `rr_engine_tier`.
 * Re-rodar não duplica produtos; cria um Price novo se nenhum bate
 * exatamente o valor configurado.
 */

import Stripe from "stripe";

const SECRET = process.env.STRIPE_SECRET_KEY;
if (!SECRET) {
  console.error("ERRO: STRIPE_SECRET_KEY não está configurado.");
  process.exit(1);
}

const stripe = new Stripe(SECRET, { apiVersion: "2025-01-27.acacia" });

const TIERS = [
  {
    tier: "starter",
    name: "RR Engine — Starter",
    description:
      "5 orçamentos/mês com cap de R$ 500.000 por obra. Para profissionais autônomos e escritórios pequenos.",
    priceCents: 19900,
    envVar: "STRIPE_PRICE_STARTER",
  },
  {
    tier: "pro",
    name: "RR Engine — Pro",
    description:
      "20 orçamentos/mês com cap de R$ 5.000.000 por obra. Para construtoras com volume médio.",
    priceCents: 49900,
    envVar: "STRIPE_PRICE_PRO",
  },
  {
    tier: "business",
    name: "RR Engine — Business",
    description:
      "Orçamentos ilimitados sem cap de valor por obra. Para construtoras médias/grandes.",
    priceCents: 149900,
    envVar: "STRIPE_PRICE_BUSINESS",
  },
];

async function findOrCreateProduct(def) {
  const list = await stripe.products.search({
    query: `metadata['rr_engine_tier']:'${def.tier}'`,
  });
  if (list.data.length > 0) {
    console.log(`[${def.tier}] produto já existe: ${list.data[0].id}`);
    return list.data[0];
  }
  const created = await stripe.products.create({
    name: def.name,
    description: def.description,
    metadata: { rr_engine_tier: def.tier },
  });
  console.log(`[${def.tier}] produto criado: ${created.id}`);
  return created;
}

async function findOrCreatePrice(product, def) {
  const list = await stripe.prices.list({
    product: product.id,
    active: true,
    currency: "brl",
    limit: 100,
  });
  const matched = list.data.find(
    p =>
      p.unit_amount === def.priceCents &&
      p.recurring?.interval === "month" &&
      p.currency === "brl"
  );
  if (matched) {
    console.log(`[${def.tier}] price já existe: ${matched.id}`);
    return matched;
  }
  const created = await stripe.prices.create({
    product: product.id,
    unit_amount: def.priceCents,
    currency: "brl",
    recurring: { interval: "month" },
    metadata: { rr_engine_tier: def.tier },
  });
  console.log(`[${def.tier}] price criado: ${created.id}`);
  return created;
}

async function main() {
  const envLines = [];
  for (const def of TIERS) {
    const product = await findOrCreateProduct(def);
    const price = await findOrCreatePrice(product, def);
    envLines.push(`${def.envVar}=${price.id}`);
  }
  console.log("\n=== Variáveis de ambiente (cole no Railway) ===");
  envLines.forEach(l => console.log(l));
}

main().catch(err => {
  console.error("Falha:", err);
  process.exit(1);
});
