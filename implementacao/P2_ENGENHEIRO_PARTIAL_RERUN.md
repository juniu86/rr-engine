# Ticket — Engenheiro re-roda só chunks afetados pelas respostas

**Para:** Claude Code
**Branch:** `feat/engenheiro-partial-rerun`
**Prioridade:** P2 (otimização de custo, não bug)
**Origem:** smoke test DGOA (project 7), 06/05/2026 — Engenheiro Técnico rodou os 5 chunks 2x (pré-respostas + pós-respostas), gastando ~$6 em Opus quando deveria gastar ~$3.

## Problema

Quando o user responde `missingInfoRequests`, o pipeline chama `executeAll` de novo a partir do Engenheiro. Hoje, isso faz o agente **re-chunkar e re-processar todos os chunks**, mesmo que a resposta do user só afete 1 ou 2 chunks específicos.

Log de evidência (project 7):

```
21:17 [EngenheiroTecnico] Memorial length: 12457, temRespostas: false
21:17 [EngenheiroTecnico] Dividido em 5 chunks
... 5 chamadas Opus, ~40k tokens output ...
21:22 [EngenheiroTecnico] Todos os 5 chunks completos em 312.2s

(user responde missingInfoRequests)

21:25 [EngenheiroTecnico] Memorial length: 12457, temRespostas: true
21:25 [EngenheiroTecnico] Dividido em 5 chunks
... 5 chamadas Opus, ~45k tokens output ...
21:31 [EngenheiroTecnico] Todos os 5 chunks completos em 349.9s
```

**Custo dobrado** sem ganho. Os outputs dos 4 chunks que NÃO tinham missingInfoRequest são idênticos (memorial não mudou).

## Fix

### Estratégia

Após a primeira execução, armazenar o output de cada chunk individualmente (já existe `agent_executions` mas é por agente, não por chunk). Quando o user responde, identificar:

1. Quais chunks tinham `missingInfoRequests` (lookup no output armazenado da 1ª run)
2. Re-rodar **apenas esses chunks** com as respostas
3. Mergear: outputs antigos dos chunks sem mudança + outputs novos dos chunks que rerodaram

### Implementação proposta

**Schema:** adicionar tabela `agent_execution_chunks`:

```ts
export const agentExecutionChunks = mysqlTable("agent_execution_chunks", {
  id: int("id").autoincrement().primaryKey(),
  agentExecutionId: int("agentExecutionId").notNull().references(() => agentExecutions.id),
  chunkIndex: int("chunkIndex").notNull(),
  chunkInput: json("chunkInput").notNull(),       // memorial slice + temRespostas
  chunkOutput: json("chunkOutput").notNull(),
  hasMissingInfo: boolean("hasMissingInfo").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
```

**Engenheiro chunking flow** (em `server/agents/index.ts`, `EngenheiroTecnicoAgent.execute()`):

```ts
async execute(input) {
  // ...
  const chunks = chunkifyMemorial(input.memorialDescritivo);
  
  // Lookup chunks da execução anterior, se houver
  const previousChunks = await getPreviousChunks(input.projectId);
  
  const results = await pLimit(concurrency, chunks.map((chunk, i) => async () => {
    const previous = previousChunks.find(p => p.chunkIndex === i);
    
    // Pula chunk se: já existe output anterior + chunk não tinha missingInfo OU 
    //                missingInfo foi respondido em outro chunk
    if (previous && !previous.hasMissingInfo) {
      return previous.chunkOutput;
    }
    
    // Re-roda esse chunk
    const output = await this._executeChunk(chunk, input.respostasUsuario);
    await saveChunk({ chunkIndex: i, chunkInput: chunk, chunkOutput: output, hasMissingInfo: !!output.missingInfoRequests?.length });
    return output;
  }));
  
  return mergeChunks(results);
}
```

**Aplicar a mesma lógica no Orçamentista** (frentes em vez de chunks).

### Caveats

- Se o memorial mudar entre runs (revisão), invalidar todos os chunks. Comparar `hash(memorialDescritivo)` da run anterior vs atual.
- Se o user responder uma `missingInfoRequest` que afeta o entendimento global do projeto, o resultado pode divergir entre chunks que não rerodaram. Mitigação: marcar `affectsGlobalContext: boolean` na request — se true, invalidar tudo.

## Validação

Test em `server/agents/engenheiro.test.ts`:

```ts
it("re-roda apenas chunks com missingInfoRequests quando há respostas", async () => {
  // 1ª run: 5 chunks, 1 deles com missingInfo
  // 2ª run com respostas: deve rodar apenas 1 chunk, não 5
  // Espera: invokeLLM chamado 1x na 2ª run, não 5x
});
```

## Estimativa de impacto

- Pipeline DGOA atual: ~$10 por run completo (memorial 12k chars)
- Com fix: ~$7 (Engenheiro 50% mais barato + Orçamentista mesma redução)
- **Economia: ~30% por orçamento com revisão**

Se ~50% dos orçamentos exigem 1 revisão, economia média ~15%. Em 1000 orçamentos/mês, isso é ~$1.500/mês.

## Definition of done

- [ ] Migration nova com `agent_execution_chunks`
- [ ] Lógica de skip no Engenheiro
- [ ] Lógica de skip no Orçamentista
- [ ] Hash do memorial pra invalidação total quando muda
- [ ] 2 testes (1 por agente)
- [ ] Smoke test medindo redução real de tokens (rodar projeto antes/depois)
