/**
 * P2.2 — Observabilidade externa via Langfuse.
 *
 * Cliente singleton, inicializado on-demand. Quando LANGFUSE_ENABLED não
 * é "true" (default), `getLangfuse()` retorna null e o restante do código
 * deve usar optional chaining: `langfuse?.trace(...)`.
 *
 * Razão: tracing não pode quebrar o pipeline. Se a chave não existe ou a
 * rede para Langfuse falha, o orçamento continua. Combinado com a
 * telemetria interna (P0.3), temos cobertura redundante intencional.
 */
import { Langfuse } from "langfuse";
import { ENV } from "../_core/env";

let client: Langfuse | null = null;
let initFailed = false;

export function getLangfuse(): Langfuse | null {
  if (!ENV.langfuseEnabled) return null;
  if (initFailed) return null;
  if (client) return client;

  if (!ENV.langfusePublicKey || !ENV.langfuseSecretKey) {
    console.warn(
      "[Langfuse] LANGFUSE_ENABLED=true mas chaves faltando. Tracing desativado."
    );
    initFailed = true;
    return null;
  }

  try {
    client = new Langfuse({
      publicKey: ENV.langfusePublicKey,
      secretKey: ENV.langfuseSecretKey,
      baseUrl: ENV.langfuseHost,
    });
  } catch (err) {
    console.warn(
      "[Langfuse] Falha ao inicializar cliente, tracing desativado:",
      err
    );
    initFailed = true;
    client = null;
  }
  return client;
}

/**
 * Encerra o cliente Langfuse. Chamado no graceful shutdown do Express
 * (server/_core/index.ts) para garantir flush dos eventos pendentes.
 */
export async function shutdownTracing(): Promise<void> {
  if (!client) return;
  try {
    await client.shutdownAsync();
  } catch (err) {
    console.warn("[Langfuse] Falha em shutdownAsync, ignorando:", err);
  } finally {
    client = null;
  }
}

/**
 * Reinicia o estado interno (útil para testes — não usar em produção).
 */
export function _resetTracingForTests(): void {
  client = null;
  initFailed = false;
}
