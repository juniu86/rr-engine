/**
 * Ordena execucoes de agentes por agentOrder EM MEMORIA.
 *
 * IMPORTANTE: nao usar `ORDER BY agentOrder` no SQL. O campo `output` de um
 * agente pode ter centenas de KB; o filesort do MySQL carrega as linhas
 * inteiras e estoura o sort_buffer (ER_OUT_OF_SORTMEMORY), derrubando a leitura
 * (a UI nao carrega os agentes e o popup de missingInfoRequests some). Sao
 * poucas linhas (1 por agente), entao ordenar em JS e seguro e barato.
 * Incidente que originou: 21/05/2026 (ver docs/INFRA.md).
 */
export function sortByAgentOrder<T extends { agentOrder: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.agentOrder - b.agentOrder);
}
