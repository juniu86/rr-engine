# Ticket — Fortalecer parsing JSON do Auditor

**Para:** Claude Code
**Branch:** `fix/auditor-json-robustness`
**Origem:** smoke test DGOA (project 7), 06/05/2026 — Auditor (Sonnet) crashou com `SyntaxError: Expected ',' or '}'` na posição 6589 do output. `tolerantJsonParse` não conseguiu recuperar. Pipeline morreu antes de gerar XLSX, queimando ~$10 em tokens upstream.

## Stack trace relevante

```
[Agent Auditor de Consistência] JSON parse error: SyntaxError: Expected ',' or '}' after property value in JSON at position 6589 (line 126 column 160)
    at JSON.parse (<anonymous>)
    at tolerantJsonParse (file:///app/dist/index.js:4685:17)
    at AuditorAgent._execute (file:///app/dist/index.js:4906:22)
```

Usage: `prompt:6339, completion:4646, cache_create:3552, cache_read:0` — `finish=stop`, ou seja, **NÃO foi truncamento** (Sonnet 4.6 max output é 64k, ainda longe). É malformed JSON real (provavelmente aspas não escapadas dentro de uma `description` ou `recommendation` string).

## Causa raiz

1. `invokeAnthropicDirect` (em `server/_core/llm.ts`) **não passa `response_format: { type: "json_object" }`** na chamada. Sem isso, o Sonnet às vezes devolve JSON com aspas quebradas em strings longas — comportamento conhecido na API Anthropic.

2. `tolerantJsonParse` em `server/utils/...` (procurar localização exata) só lida com JSON com markdown wrapper, vírgulas finais, e alguns casos comuns. Não lida com aspas não escapadas dentro de strings.

3. `executeWithRetry` em `BaseAgent` retenta 3x mas a falha é determinística — Sonnet vai voltar com a mesma quebra na mesma posição. Retry sem mudança de prompt não ajuda.

## Fix

### 1. Forçar `response_format: json_object` na chamada Anthropic

Em `server/_core/llm.ts`, na função `invokeAnthropicDirect` (ou equivalente), quando o agente passa um schema (`response_format` definido), incluir no payload da Anthropic:

```ts
{
  model,
  messages,
  system,
  max_tokens,
  // ⬇️ NOVO
  response_format: { type: "json_object" },
  // ⬆️
  // ... resto
}
```

**Cuidado:** essa flag só funciona em alguns modelos da Anthropic. Verificar docs antes de habilitar geral. Se Sonnet 4.6 ainda não suporta nativamente, usar a alternativa do item 2.

### 2. Retry com prompt de correção quando JSON.parse falha

Em `BaseAgent._execute` (ou helper), depois do `tolerantJsonParse` falhar, fazer **uma tentativa adicional** chamando o LLM novamente com:

```
SYSTEM: O output anterior tinha JSON malformado. Aqui está exatamente o que você devolveu:

<COLA O OUTPUT BRUTO ANTERIOR>

Corrija APENAS os erros de sintaxe JSON (aspas não escapadas, vírgulas faltando, brackets desbalanceados). Devolva o mesmo conteúdo, apenas com sintaxe válida. NÃO altere os valores.
```

Modelo: o mesmo do agente original. Custo: ~$0,05–$0,30 dependendo do tamanho. Bem mais barato que perder o pipeline inteiro.

### 3. Fortalecer `tolerantJsonParse`

Adicionar:

- Detecção e escape automático de aspas não-escapadas dentro de strings longas (regex que detecta `"..."[a-zA-Z]"...` e escapa o do meio).
- Se ainda falhar, retornar `null` em vez de throw, e deixar o caller decidir (camada 2 acima).

## Validação

Test novo em `server/agents/auditor.test.ts`:

```ts
it("recupera de JSON malformado via retry de correção", async () => {
  // Mock: 1ª chamada devolve JSON com aspas quebradas, 2ª devolve corrigido
  // Espera: agente conclui com sucesso, sem propagar erro
});

it("propaga erro só depois de 2 tentativas falhadas", async () => {
  // Mock: todas as chamadas devolvem JSON quebrado
  // Espera: throw após retry de correção falhar
});
```

## Definition of done

- [ ] `response_format: json_object` adicionado em `invokeAnthropicDirect` (com guard por modelo se necessário)
- [ ] Retry de correção implementado em `BaseAgent._execute` ou helper dedicado
- [ ] `tolerantJsonParse` lida com aspas não escapadas
- [ ] 2 testes novos cobrindo os cenários
- [ ] Smoke test no projeto 7 (DGOA) — pipeline conclui sem crashar no Auditor
