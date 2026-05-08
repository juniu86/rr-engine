/**
 * Shared agent persistence logic.
 *
 * Extracted from routers.ts to eliminate 4x duplicated code for saving
 * budget items, logistics costs, schedule items, and cash flow.
 */

import * as db from "../db";
import type { AgentType } from "../../shared/agents";

// ==================== TOTAL WEEKS DERIVATION (P0 — 07/05/2026) ====================

/**
 * Heurística pra inferir total de semanas do projeto a partir do output
 * do Gestão de Projetos, lidando com 3 inconsistências reais observadas:
 *
 *  1. Schema de saída do agente declara `totalDuration` E `totalDays`
 *     mas na prática o LLM populava ora um, ora outro, ora ambos com
 *     valores em UNIDADES diferentes (totalDuration às vezes vinha em
 *     semanas, às vezes em dias).
 *  2. shared/agents.ts type tem `scheduleItems[].endWeek` (semanas);
 *     o schema tem `endDay` (dias). LLM usa ora um, ora outro.
 *  3. Em obras grandes (8 meses real), o LLM colocava totalDuration=4 ou
 *     totalDuration=null e o fallback `finInput.cashFlow?.length || 4`
 *     dava FC de 4 semanas (errado).
 *
 * Política: usar `scheduleItems` como fonte primária (max endDay/endWeek),
 * inferindo unidade pela magnitude. Fallback em ordem de confiança até
 * `project.estimatedDuration` (assumido em dias). Mínimo 4 semanas.
 */
function deriveTotalWeeks(
  gestaoOutput: any,
  projectInfo?: { estimatedDuration?: number | null },
  cashFlowFallbackLength?: number
): number {
  // Fonte 1 (mais confiável): scheduleItems max endDay/endWeek
  const scheduleItems = Array.isArray(gestaoOutput?.scheduleItems)
    ? gestaoOutput.scheduleItems
    : [];
  if (scheduleItems.length > 0) {
    const maxEnd = scheduleItems.reduce((max: number, s: any) => {
      const end = Number(s.endDay ?? s.endWeek ?? s.duration ?? 0);
      return end > max ? end : max;
    }, 0);
    if (maxEnd > 0) {
      // Heurística de unidade: schedules de obra raramente passam de 60
      // semanas; magnitude > 60 quase sempre é dias. Threshold 60 é
      // conservador (cobre obra de até 1 ano em semanas).
      const isWeekly = maxEnd <= 60;
      const weeks = isWeekly ? maxEnd : Math.ceil(maxEnd / 7);
      return Math.max(4, weeks);
    }
  }

  // Fonte 2: totalDays direto (campo dedicado)
  const totalDaysRaw = Number(gestaoOutput?.totalDays ?? 0);
  if (totalDaysRaw > 0) {
    return Math.max(4, Math.ceil(totalDaysRaw / 7));
  }

  // Fonte 3: totalDuration — inferir unidade
  const totalDurationRaw = Number(gestaoOutput?.totalDuration ?? 0);
  if (totalDurationRaw > 0) {
    const isLikelyWeeks = totalDurationRaw <= 60;
    return isLikelyWeeks
      ? Math.max(4, totalDurationRaw)
      : Math.max(4, Math.ceil(totalDurationRaw / 7));
  }

  // Fonte 4: project.estimatedDuration (dias)
  const estimated = Number(projectInfo?.estimatedDuration ?? 0);
  if (estimated > 0) {
    return Math.max(4, Math.ceil(estimated / 7));
  }

  // Fallback final: cashFlow do LLM ou 4 semanas
  return Math.max(4, cashFlowFallbackLength || 4);
}

/** Descrição pra logging — qual fonte foi usada na derivação. */
function describeWeeksSource(gestaoOutput: any): string {
  const items = gestaoOutput?.scheduleItems;
  if (Array.isArray(items) && items.length > 0) {
    return `scheduleItems(${items.length} fases)`;
  }
  if (Number(gestaoOutput?.totalDays ?? 0) > 0) return `totalDays`;
  if (Number(gestaoOutput?.totalDuration ?? 0) > 0) return `totalDuration`;
  return `fallback`;
}

// ==================== LOGISTICS CATEGORY MAPPING ====================

type LogisticsCategory =
  | "frete"
  | "bota_fora"
  | "deslocamento"
  | "hospedagem"
  | "alimentacao"
  | "equipamentos"
  | "outros";

export function mapLogisticsCategory(rawCategory: string): LogisticsCategory {
  const lower = (rawCategory || "").toLowerCase();
  if (lower.includes("frete") || lower.includes("transporte")) return "frete";
  if (
    lower.includes("bota") ||
    lower.includes("resíduo") ||
    lower.includes("entulho")
  )
    return "bota_fora";
  if (lower.includes("desloc") || lower.includes("viagem"))
    return "deslocamento";
  if (lower.includes("hosped") || lower.includes("hotel")) return "hospedagem";
  if (lower.includes("aliment") || lower.includes("refeiç"))
    return "alimentacao";
  if (lower.includes("equip") || lower.includes("ferramenta"))
    return "equipamentos";
  return "outros";
}

// ==================== BUDGET ITEMS ====================

export async function persistBudgetItems(
  projectId: number,
  rawItems: any[],
  bdiPercent: number
): Promise<void> {
  await db.deleteBudgetItemsByProjectId(projectId);

  // Passo 1: Filtrar itens PAI/RESUMO (isSummaryItem=true) para evitar duplicação
  const filteredItems = rawItems.filter((item: any) => !item.isSummaryItem);

  // Passo 4a: Deduplicar por description+unit+category (exact match)
  const deduplicatedItems = deduplicateBudgetItems(filteredItems);

  // Passo 4b: Deduplicação semântica — remover itens contidos em outros (containment)
  const semanticDeduped = detectContainmentDuplicates(deduplicatedItems);

  // Correção C: Garantir itemNumber/code único (sufixo para duplicatas)
  const pricingItems = deduplicateItemNumbers(semanticDeduped);

  const items = pricingItems.map((item: any) => {
    const quantity = Number(item.quantity) || 0;
    const unitCostTotal = Number(item.unitCostTotal) || 0;
    const totalCost = quantity * unitCostTotal;
    const bdiAmount = totalCost * bdiPercent;
    const finalPrice = totalCost + bdiAmount;
    return {
      projectId,
      category: item.category || "Geral",
      code: item.code || "",
      description: item.description,
      unit: (item.unit || "").substring(0, 20),
      quantity: String(quantity),
      unitCostMaterial: String(item.unitCostMaterial || 0),
      unitCostLabor: String(item.unitCostLabor || 0),
      unitCostLogistics: String(item.unitCostLogistics || 0),
      unitCostTotal: String(unitCostTotal),
      totalCost: String(totalCost),
      bdiAmount: String(bdiAmount),
      finalPrice: String(finalPrice),
      taxAmount: String(item.taxAmount || 0),
      source: item.source || "Estimativa",
      sourceCode: item.sourceCode || null,
      sourceDate: (item.sourceDate || "").substring(0, 20) || null,
    };
  });
  await db.createBudgetItems(items);
}

// ==================== LOGISTICS COSTS ====================

export async function persistLogisticsCosts(
  projectId: number,
  rawCosts: any[]
): Promise<void> {
  await db.deleteLogisticsCostsByProjectId(projectId);
  const costs = rawCosts.map((cost: any) => ({
    projectId,
    category: mapLogisticsCategory(cost.category),
    description: String(cost.description || "Custo logístico").substring(
      0,
      1000
    ),
    quantity: String(Number(cost.quantity) || 1),
    unit: String(cost.unit || "un").substring(0, 20),
    unitCost: String(Number(cost.unitCost) || 0),
    totalCost: String(Number(cost.totalCost) || 0),
  }));
  await db.createLogisticsCosts(costs);
}

// ==================== SCHEDULE ITEMS ====================

export async function persistScheduleItems(
  projectId: number,
  rawSchedule: any[]
): Promise<void> {
  await db.deleteScheduleItemsByProjectId(projectId);
  const items = rawSchedule.map((item: any) => {
    const startDay = item.startDay || item.startWeek || 1;
    const endDay = item.endDay || item.endWeek || startDay;
    const startWeek = Math.ceil(startDay / 7) || 1;
    const endWeek = Math.ceil(endDay / 7) || startWeek;
    return {
      projectId,
      description:
        item.activity || item.description || item.phase || "Atividade",
      startWeek,
      duration: endWeek - startWeek + 1,
      dependencies: item.dependencies
        ? JSON.stringify(item.dependencies)
        : null,
    };
  });
  await db.createScheduleItems(items);
}

// ==================== CASH FLOW ====================

export async function persistCashFlowItems(
  projectId: number,
  cashFlowItems: Array<{
    week: number;
    expense: number;
    income: number;
    balance: number;
  }>
): Promise<void> {
  await db.deleteCashFlowItemsByProjectId(projectId);
  const items = cashFlowItems.map(item => ({
    projectId,
    weekNumber: item.week,
    plannedExpense: String(item.expense),
    plannedIncome: String(item.income),
    actualExpense: null,
    actualIncome: null,
    cashBalance: String(item.balance),
    hasAlert: item.balance < 0,
  }));
  await db.createCashFlowItems(items);
}

// ==================== PERSIST ALL AGENT OUTPUTS ====================

/**
 * Persists the derived data for an agent execution.
 * Call after each agent completes to save its side-effect data to the DB.
 */
export async function persistAgentOutput(
  agentType: AgentType,
  projectId: number,
  output: any,
  opts: {
    bdiPercent: number;
    executions?: any[];
    agentInput?: any;
  }
): Promise<any> {
  let finalOutput = output;

  if (agentType === "orcamentista" && output?.budgetItems) {
    await persistBudgetItems(projectId, output.budgetItems, opts.bdiPercent);

    // Correção 1: Recalcular totalDirectCost dos itens efetivamente persistidos
    // (após filtro de isSummaryItem + deduplicação por descrição + dedup de código)
    try {
      const savedItems = await db.getBudgetItemsByProjectId(projectId);
      const recalculatedDirectCost = savedItems.reduce(
        (sum: number, item: any) => sum + Number(item.totalCost || 0),
        0
      );
      const itemsRemoved =
        (output.budgetItems?.length || 0) - savedItems.length;

      // Atualizar o output com o valor correto (pós-deduplicação)
      finalOutput = {
        ...output,
        totalDirectCost: Math.round(recalculatedDirectCost * 100) / 100,
        _originalTotalDirectCost: output.totalDirectCost,
        _itemsFiltered: itemsRemoved,
        budgetItems: savedItems.map((item: any) => ({
          id: item.id,
          category: item.category,
          code: item.code,
          description: item.description,
          unit: item.unit,
          quantity: Number(item.quantity) || 0,
          unitCostMaterial: Number(item.unitCostMaterial) || 0,
          unitCostLabor: Number(item.unitCostLabor) || 0,
          unitCostLogistics: Number(item.unitCostLogistics) || 0,
          unitCostTotal: Number(item.unitCostTotal) || 0,
          totalCost: Number(item.totalCost) || 0,
          source: item.source,
          sourceCode: item.sourceCode,
          sourceDate: item.sourceDate,
        })),
      };

      if (itemsRemoved > 0) {
        console.log(
          `[Orcamentista] Deduplication: ${itemsRemoved} items removed. Cost: R$${output.totalDirectCost?.toFixed(2)} → R$${recalculatedDirectCost.toFixed(2)}`
        );
      }
    } catch (err) {
      console.error("[Orcamentista] Error recalculating after dedup:", err);
    }
  }

  if (agentType === "logistica") {
    // O output da Logística pode vir em formatos diferentes dependendo da
    // versão do prompt: `costs` (formato antigo) ou `items` (atual). Em
    // ambos os casos garantimos que `totalLogisticsCost` esteja no nível
    // top — isso é exigido pela validação no buildAgentInput do Comercial.
    const itemsList = output?.items || output?.costs || [];

    if (output?.costs) {
      // Caminho legado: cross-check vs orçamento.
      try {
        const budgetItems = await db.getBudgetItemsByProjectId(projectId);
        const filteredCosts = crossCheckLogisticsVsBudget(
          output.costs,
          budgetItems
        );
        await persistLogisticsCosts(projectId, filteredCosts);

        if (filteredCosts.length < output.costs.length) {
          const removedCount = output.costs.length - filteredCosts.length;
          const newTotal = filteredCosts.reduce(
            (sum: number, c: any) => sum + Number(c.totalCost || 0),
            0
          );
          finalOutput = {
            ...output,
            costs: filteredCosts,
            totalLogisticsCost: Math.round(newTotal * 100) / 100,
            _originalLogisticsCost: output.totalLogisticsCost,
            _logisticsItemsRemoved: removedCount,
          };
          console.log(
            `[Logistica] Cross-check: ${removedCount} items removed (overlap with budget). Cost: R$${output.totalLogisticsCost?.toFixed(2)} → R$${newTotal.toFixed(2)}`
          );
        }
      } catch (err) {
        console.error("[Logistica] Error saving costs:", err);
      }
    }

    // Garante totalLogisticsCost no top-level. Ordem de preferência:
    //  1. output.totalLogisticsCost se já existe
    //  2. summary.mandatoryTotal (formato atual)
    //  3. summary.grandTotal
    //  4. soma dos itens
    if (typeof finalOutput?.totalLogisticsCost !== "number") {
      const summary = output?.summary || {};
      let derivedTotal: number;
      if (typeof summary.mandatoryTotal === "number") {
        derivedTotal = summary.mandatoryTotal;
      } else if (typeof summary.grandTotal === "number") {
        derivedTotal = summary.grandTotal;
      } else {
        derivedTotal = itemsList.reduce(
          (sum: number, c: any) => sum + Number(c.totalCost || 0),
          0
        );
      }
      finalOutput = {
        ...finalOutput,
        totalLogisticsCost: Math.round(derivedTotal * 100) / 100,
      };
      console.log(
        `[Logistica] Derived totalLogisticsCost: R$${derivedTotal.toFixed(2)}`
      );
    }
  }

  if (agentType === "tributario") {
    // Tributário tem 3 formatos observados (Claude varia entre runs):
    //   F1 (declarado): { classifiedItems[], totalTaxes, alerts }
    //   F2: { taxClassification: { items[], summary{ totalTaxes }, ... } }
    //   F3: { classification[] } — array no top-level
    // Normalizamos pra garantir totalTaxes no top-level (exigido pelo
    // validador no Comercial e usado pelo Auditor).
    //
    // P2 (estabilidade prompts): instrumenta log de "Schema OK" quando vier
    // no formato declarado (F1). Permite medir taxa de drift em produção
    // após o few-shot reforçado no prompt.
    const isDeclaredFormat =
      typeof output?.totalTaxes === "number" &&
      Array.isArray(output?.classifiedItems);
    if (isDeclaredFormat) {
      console.log(
        `[Tributario] Schema OK (declared format) — totalTaxes=R$${Number(output.totalTaxes).toFixed(2)}, items=${output.classifiedItems.length}`
      );
    }

    if (typeof finalOutput?.totalTaxes !== "number") {
      let derivedTaxes = 0;

      const sumByField = (arr: any[], ...fields: string[]) =>
        arr.reduce((sum, i) => {
          for (const f of fields) {
            const v = Number(i?.[f]);
            if (!Number.isNaN(v) && v > 0) return sum + v;
          }
          return sum;
        }, 0);

      // F1: classifiedItems no top-level (schema oficial)
      if (Array.isArray(output?.classifiedItems)) {
        derivedTaxes = sumByField(output.classifiedItems, "taxAmount");
      }
      // F2: taxClassification aninhado
      else if (output?.taxClassification) {
        const tax = output.taxClassification;
        const summary = tax.summary || {};
        if (typeof summary.totalTaxes === "number") {
          derivedTaxes = summary.totalTaxes;
        } else if (typeof summary.grandTotal === "number") {
          derivedTaxes = summary.grandTotal;
        } else if (Array.isArray(tax.items)) {
          derivedTaxes = sumByField(tax.items, "taxAmount", "totalTax");
        }
      }
      // F3: classification array no top-level
      else if (Array.isArray(output?.classification)) {
        // Cada item pode ter taxAmount, ou issAmount + pisRate*base + ...
        derivedTaxes = output.classification.reduce((sum: number, i: any) => {
          const direct = Number(i?.taxAmount) || Number(i?.totalTax) || 0;
          if (direct > 0) return sum + direct;
          // Fallback: somar issAmount + pisCofinsAmount + irpjAmount + csllAmount
          const composite =
            (Number(i?.issAmount) || 0) +
            (Number(i?.pisCofinsAmount) || 0) +
            (Number(i?.pisAmount) || 0) +
            (Number(i?.cofinsAmount) || 0) +
            (Number(i?.irpjAmount) || 0) +
            (Number(i?.csllAmount) || 0);
          return sum + composite;
        }, 0);
      }

      finalOutput = {
        ...finalOutput,
        totalTaxes: Math.round(derivedTaxes * 100) / 100,
      };
      console.log(
        `[Tributario] Derived totalTaxes: R$${derivedTaxes.toFixed(2)} ` +
          `(format: ${
            Array.isArray(output?.classifiedItems)
              ? "F1-classifiedItems"
              : output?.taxClassification
                ? "F2-taxClassification"
                : Array.isArray(output?.classification)
                  ? "F3-classification"
                  : "unknown"
          })`
      );
    }
  }

  if (agentType === "auditor" && finalOutput?.validations) {
    // Auditor está marcando falsos positivos (passed=false em validações cuja
    // matemática bate). Recalculamos as 3 mais comuns server-side e sobrescrevemos
    // `passed` quando valores batem dentro de tolerância de 1%.
    //
    // P2 (estabilidade prompts): instrumenta log explícito de quantas
    // validações precisaram de override server-side. Few-shot no prompt
    // deve reduzir esse número ao longo do tempo.
    try {
      const orcExec = opts.executions?.find(
        (e: any) => e.agentType === "orcamentista"
      );
      const logExec = opts.executions?.find(
        (e: any) => e.agentType === "logistica"
      );
      const tribExec = opts.executions?.find(
        (e: any) => e.agentType === "tributario"
      );
      const comExec = opts.executions?.find(
        (e: any) => e.agentType === "comercial"
      );
      const finExec = opts.executions?.find(
        (e: any) => e.agentType === "financeiro"
      );

      const directCost = Number((orcExec?.output as any)?.totalDirectCost) || 0;
      const logCost = Number((logExec?.output as any)?.totalLogisticsCost) || 0;
      const taxes = Number((tribExec?.output as any)?.totalTaxes) || 0;
      const finalPrice = Number((comExec?.output as any)?.finalPrice) || 0;
      const cashFlowItems = (finExec?.output as any)?.cashFlow || [];
      const finalBalance = cashFlowItems.length
        ? Number(cashFlowItems[cashFlowItems.length - 1]?.balance ?? 0)
        : null;

      const within = (a: number, b: number, tol = 0.01) =>
        Math.abs(a - b) <= Math.abs(b) * tol + 1; // 1% + 1 real de tolerância

      let overrides = 0;
      const validations = (finalOutput.validations as any[]).map(v => {
        if (v.passed) return v;

        // Recalcula price_consistency: preço esperado deve ser o que o Comercial
        // computou. Se valores batem, marca passed=true.
        if (v.rule === "price_consistency") {
          const expected = Number(v.expected) || finalPrice;
          const actual = Number(v.actual) || finalPrice;
          if (within(expected, actual)) {
            overrides++;
            return {
              ...v,
              passed: true,
              recommendation:
                "Override server-side: valores batem dentro de 1%",
            };
          }
        }

        if (v.rule === "gross_margin") {
          const expectedMargin = finalPrice - (directCost + logCost);
          const actual = Number(v.actual);
          if (!Number.isNaN(actual) && within(actual, expectedMargin)) {
            overrides++;
            return { ...v, passed: true };
          }
          // Se v.expected vier vazio, valida que matemática faz sentido.
          if (!v.expected && expectedMargin >= 0) {
            overrides++;
            return { ...v, passed: true };
          }
        }

        if (v.rule === "cash_flow" && finalBalance !== null) {
          if (finalBalance >= 0) {
            overrides++;
            return { ...v, passed: true };
          }
        }

        return v;
      });

      // Recalcula contadores se sobrescrevemos algo.
      if (overrides > 0) {
        const passed = validations.filter((v: any) => v.passed).length;
        const failed = validations.filter((v: any) => !v.passed);
        const criticalErrors = failed.filter(
          (v: any) => v.severity === "critical"
        ).length;
        const warnings = failed.filter(
          (v: any) => v.severity === "warning"
        ).length;
        const total = validations.length;
        const newScore = total > 0 ? Math.round((passed / total) * 100) : 0;

        // Regrade do auditSeal
        let newSeal: "approved" | "approved_with_warnings" | "rejected";
        if (criticalErrors > 0) newSeal = "rejected";
        else if (warnings > 0) newSeal = "approved_with_warnings";
        else newSeal = "approved";

        finalOutput = {
          ...finalOutput,
          validations,
          validationScore: newScore,
          criticalErrors,
          warnings,
          isValid: criticalErrors === 0,
          auditSeal: newSeal,
          _serverOverrides: overrides,
        };
        console.log(
          `[Auditor] Override aplicado em ${overrides} validações. ` +
            `Score ajustado: ${newScore}, seal: ${newSeal}`
        );
      } else {
        // P2 (estabilidade prompts): log positivo quando zero overrides.
        // Em produção, taxa alta desse caminho indica que few-shot estabilizou
        // o Auditor e que o normalizador server-side virou redundante.
        const total = (finalOutput.validations as any[]).length;
        const allHaveValues = (finalOutput.validations as any[]).every(
          (v: any) =>
            typeof v.expected === "string" &&
            v.expected.length > 0 &&
            typeof v.actual === "string" &&
            v.actual.length > 0
        );
        console.log(
          `[Auditor] Schema OK (0 overrides, ${total} validações, ` +
            `expected/actual preenchidos: ${allHaveValues ? "sim" : "parcial"})`
        );
      }
    } catch (err) {
      console.warn("[Auditor] Falha ao validar matemática server-side:", err);
    }

    // P2 ADENDO (dedup semântica): se auditNotes menciona sobreposição
    // mas budgetItemsToRemove vier vazio, o Auditor detectou o problema
    // mas não tomou decisão acionável. Loga warning para visibilidade —
    // few-shot no prompt deve eliminar isso ao longo do tempo.
    try {
      const notes = String(
        (finalOutput as any)?.auditNotes ?? ""
      ).toLowerCase();
      const itemsToRemove =
        (finalOutput as any)?.corrections?.budgetItemsToRemove ?? [];
      const mentionsOverlap =
        /sobrepos|escopo sobreposto|dupla cobran|dupla contagem/.test(notes);
      if (mentionsOverlap && itemsToRemove.length === 0) {
        console.warn(
          `[Auditor] Inconsistência: auditNotes menciona sobreposição mas corrections.budgetItemsToRemove está vazio — ` +
            `frontend não vai disparar AuditCorrectionsModal. Notes: "${String((finalOutput as any).auditNotes).slice(0, 200)}..."`
        );
      }
    } catch {
      /* noop — diagnóstico não pode quebrar persistência */
    }
  }

  if (agentType === "gestao_projetos" && output?.schedule) {
    await persistScheduleItems(projectId, output.schedule);
  }

  if (agentType === "financeiro") {
    const {
      calculateDeterministicCashFlow,
      buildDeterministicFinanceiroOutput,
    } = await import("./deterministicCashFlow");
    const finInput = opts.agentInput || {};
    const tributarioExec = opts.executions?.find(
      (e: any) => e.agentType === "tributario"
    );
    const totalTaxes = tributarioExec?.output
      ? Number((tributarioExec.output as any).totalTaxes) || 0
      : 0;

    // P0 (07/05/2026) — derivação robusta de totalWeeks para o fluxo de caixa.
    // O Gestão de Projetos tem schema inconsistente: às vezes preenche
    // `totalDuration` em DIAS (matching scheduleItems[].endDay), outras vezes
    // em SEMANAS (matching shared/agents.ts type). E em alguns casos só
    // preenche `totalDays`. Pra evitar FC com 4 semanas em obra de 8 meses,
    // usamos múltiplas fontes em ordem de confiança:
    //   1. scheduleItems: max(endDay/endWeek) — fonte mais confiável
    //   2. totalDays / totalDuration / project.estimatedDuration
    //   3. Heurística por magnitude (números pequenos → semanas, grandes → dias)
    const gestaoExec = opts.executions?.find(
      (e: any) => e.agentType === "gestao_projetos"
    );
    const gestaoOutput = (gestaoExec?.output as any) || {};
    const projectFromInput = opts.agentInput?._projectInfo as
      | { estimatedDuration?: number | null }
      | undefined;

    const totalWeeks = deriveTotalWeeks(
      gestaoOutput,
      projectFromInput,
      finInput.cashFlow?.length
    );

    if (totalWeeks > 4) {
      console.log(
        `[Financeiro] Cash flow expandido para ${totalWeeks} semanas (derivado: ${describeWeeksSource(gestaoOutput)})`
      );
    }

    const deterministicResult = calculateDeterministicCashFlow({
      totalCost: finInput.totalCost || 0,
      totalPrice: finInput.totalPrice || 0,
      totalDuration: totalWeeks,
      totalTaxes,
    });

    finalOutput = buildDeterministicFinanceiroOutput(
      deterministicResult,
      output
    );
    await persistCashFlowItems(projectId, deterministicResult.cashFlow);

    console.log(
      `[Financeiro] Determinístico: Saldo final R$ ${deterministicResult.cashFlow[deterministicResult.cashFlow.length - 1]?.balance.toFixed(2)}`
    );
  }

  return finalOutput;
}

// ==================== DEDUPLICATION ====================

/**
 * Remove duplicate budget items based on normalized description + unit + category.
 * Keeps the item with the highest totalCost when duplicates are found.
 */
function deduplicateBudgetItems(items: any[]): any[] {
  const seen = new Map<string, { item: any; index: number }>();
  const result: any[] = [];

  for (const item of items) {
    const key = `${normalizeForDedup(item.description || "")}|${(item.unit || "").toLowerCase()}|${(item.category || "").toLowerCase()}`;

    const existing = seen.get(key);
    if (existing) {
      // Keep the item with higher total cost (more detailed pricing)
      const existingCost =
        Number(existing.item.totalCost) ||
        Number(existing.item.quantity || 0) *
          Number(existing.item.unitCostTotal || 0);
      const newCost =
        Number(item.totalCost) ||
        Number(item.quantity || 0) * Number(item.unitCostTotal || 0);

      if (newCost > existingCost) {
        result[existing.index] = item;
        seen.set(key, { item, index: existing.index });
      }
      continue; // Skip duplicate
    }

    seen.set(key, { item, index: result.length });
    result.push(item);
  }

  return result;
}

/**
 * Normalize description text for deduplication comparison.
 * Removes accents, common prefixes, and punctuation.
 */
export function normalizeForDedup(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(
      /\b(fornecimento|instalacao|execucao|servico|pacote)\s*(de|e|do|da|dos|das)?\s*/g,
      ""
    );
}

/**
 * Ensure unique itemNumber/code for all budget items.
 * When two items share the same code but have different descriptions,
 * the duplicate gets a numeric suffix (.1, .2, etc.).
 */
function deduplicateItemNumbers(items: any[]): any[] {
  const seen = new Map<string, number>();
  return items.map(item => {
    const code = item.code || "";
    if (!code) return item;
    const count = seen.get(code) || 0;
    seen.set(code, count + 1);
    if (count > 0) {
      return { ...item, code: `${code}.${count}` };
    }
    return item;
  });
}

// ==================== SEMANTIC CONTAINMENT DEDUPLICATION ====================

/**
 * Detect items where a "global scope" item contains sub-items that are also listed individually.
 * Example: "Sistema de drenagem oleosa completo" contains "Canaletas" + "Caixas de inspeção" + "SAO"
 *
 * Strategy: When item A's keywords are a superset of item B's keywords within the same category,
 * and A costs more than B, keep A and remove B (B is contained in A).
 * Conversely, if detailed items (B, C, D) together cover A's scope, keep the details and remove A.
 */
function detectContainmentDuplicates(items: any[]): any[] {
  const result = [...items];
  const toRemove = new Set<number>();

  for (let i = 0; i < result.length; i++) {
    if (toRemove.has(i)) continue;
    const itemA = result[i];
    const catA = (itemA.category || "").toLowerCase();
    const descA = normalizeForDedup(itemA.description || "");
    const keywordsA = descA.split(/\s+/).filter((k: string) => k.length > 3);
    if (keywordsA.length === 0) continue;

    for (let j = i + 1; j < result.length; j++) {
      if (toRemove.has(j)) continue;
      const itemB = result[j];
      const catB = (itemB.category || "").toLowerCase();

      // Only check within same category
      if (catA !== catB) continue;

      const descB = normalizeForDedup(itemB.description || "");
      const keywordsB = descB.split(/\s+/).filter((k: string) => k.length > 3);
      if (keywordsB.length === 0) continue;

      // Check containment: what fraction of B's keywords appear in A's description?
      const bInA =
        keywordsB.filter((kw: string) => descA.includes(kw)).length /
        keywordsB.length;
      const aInB =
        keywordsA.filter((kw: string) => descB.includes(kw)).length /
        keywordsA.length;

      const costA =
        Number(itemA.totalCost) ||
        Number(itemA.quantity || 0) * Number(itemA.unitCostTotal || 0);
      const costB =
        Number(itemB.totalCost) ||
        Number(itemB.quantity || 0) * Number(itemB.unitCostTotal || 0);

      // If B is semantically contained in A (>70% keywords overlap) and A costs more → remove B
      if (bInA >= 0.7 && costA >= costB) {
        toRemove.add(j);
        console.log(
          `[Dedup:containment] Removed "${itemB.description}" (contained in "${itemA.description}")`
        );
      }
      // If A is semantically contained in B (>70%) and B costs more → remove A
      else if (aInB >= 0.7 && costB >= costA) {
        toRemove.add(i);
        console.log(
          `[Dedup:containment] Removed "${itemA.description}" (contained in "${itemB.description}")`
        );
        break; // A is removed, move to next i
      }
    }
  }

  return result.filter((_, idx) => !toRemove.has(idx));
}

// ==================== LOGISTICS CROSS-CHECK ====================

/**
 * Keywords that indicate a logistics item overlaps with budget items.
 * If a logistics item description contains these AND a budget item also contains them,
 * the logistics item is likely already covered by the SINAPI composition.
 */
const LOGISTICS_OVERLAP_KEYWORDS = [
  ["frete", "transporte", "material"],
  ["cacamba", "entulho", "bota-fora", "residuo", "demolicao"],
  ["betoneira", "locacao"],
  ["limpeza", "final"],
  ["munck", "icamento", "guindaste"],
];

/**
 * Remove logistics items that overlap with budget items already in the database.
 * Uses keyword matching to detect when a logistics cost is already covered by
 * a SINAPI/PINI composition in the budget.
 */
function crossCheckLogisticsVsBudget(
  logisticsCosts: any[],
  budgetItems: any[]
): any[] {
  const budgetDescriptions = budgetItems.map((item: any) =>
    normalizeForDedup(item.description || "")
  );

  return logisticsCosts.filter((cost: any) => {
    const costDesc = normalizeForDedup(cost.description || "");

    for (const keywordGroup of LOGISTICS_OVERLAP_KEYWORDS) {
      const costMatchesGroup = keywordGroup.some(kw => costDesc.includes(kw));
      if (!costMatchesGroup) continue;

      // Check if any budget item also matches these keywords
      const budgetHasOverlap = budgetDescriptions.some((budgetDesc: string) =>
        keywordGroup.some(kw => budgetDesc.includes(kw))
      );

      if (budgetHasOverlap) {
        console.log(
          `[Logistica] Cross-check removed: "${cost.description}" (overlaps with budget item)`
        );
        return false; // Remove this logistics item
      }
    }

    return true; // Keep this logistics item
  });
}
