import { Request, Response } from "express";
import {
  getStripeClient,
  handleCheckoutCompleted,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleInvoicePaid,
} from "./stripeService";

// Simple idempotency guard: track recently processed event IDs to prevent duplicate processing.
// Stripe may retry webhook deliveries, and handlers should not execute multiple times.
const processedEvents = new Set<string>();
const MAX_PROCESSED_EVENTS = 10_000;

function markEventProcessed(eventId: string): boolean {
  if (processedEvents.has(eventId)) return false; // already processed
  if (processedEvents.size >= MAX_PROCESSED_EVENTS) {
    // Evict oldest entries (Set iteration order is insertion order)
    const iterator = processedEvents.values();
    for (let i = 0; i < MAX_PROCESSED_EVENTS / 2; i++) {
      processedEvents.delete(iterator.next().value!);
    }
  }
  processedEvents.add(eventId);
  return true;
}

export async function stripeWebhookHandler(req: Request, res: Response) {
  const sig = req.headers["stripe-signature"] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured");
    return res.status(500).json({ error: "Webhook secret not configured" });
  }

  let event;

  try {
    event = getStripeClient().webhooks.constructEvent(
      req.body,
      sig,
      webhookSecret
    );
  } catch (err: any) {
    console.error(
      `[Stripe Webhook] Signature verification failed: ${err.message}`
    );
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // Handle test events
  if (event.id.startsWith("evt_test_")) {
    console.log(
      "[Webhook] Test event detected, returning verification response"
    );
    return res.json({ verified: true });
  }

  // Idempotency check: skip already-processed events
  if (!markEventProcessed(event.id)) {
    console.log(`[Stripe Webhook] Duplicate event skipped: ${event.id}`);
    return res.json({ received: true, duplicate: true });
  }

  console.log(`[Stripe Webhook] Event received: ${event.type} (${event.id})`);

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as any);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as any);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as any);
        break;

      case "invoice.paid":
        await handleInvoicePaid(event.data.object as any);
        break;

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (err: any) {
    console.error(`[Stripe Webhook] Error processing event: ${err.message}`);
    res.status(500).json({ error: "Webhook processing failed" });
  }
}
