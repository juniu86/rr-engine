import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { agents } from "./agents";
import { AGENT_ORDER, AGENT_NAMES, AGENT_DESCRIPTIONS } from "../shared/agents";
import type { AgentType } from "../shared/agents";
import { searchSinapi, getSinapiComposition } from "./services/sinapi";
import { searchPini, getPiniComposition, comparePrices } from "./services/pini";
import { generateProposalPDF, generateMemoriaCalculo, generateSchedulePDF } from "./services/documents";

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // Project Router
  project: router({
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        contractType: z.enum(["manutencao", "obra"]).optional().default("obra"),
        location: z.string().optional(),
        restrictions: z.string().optional(),
        memorialDescritivo: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Usar transação atômica: se qualquer operação falhar, tudo é revertido
        const projectId = await db.createProjectWithAgents({
          userId: ctx.user.id,
          name: input.name,
          description: input.description || null,
          contractType: input.contractType,
          location: input.location || null,
          restrictions: input.restrictions || null,
          memorialDescritivo: input.memorialDescritivo || null,
          status: "draft",
          currentAgentId: 1,
        });
        
        return { projectId };
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getProjectsByUserId(ctx.user.id);
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.id);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        return project;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        contractType: z.enum(["manutencao", "obra"]).optional(),
        location: z.string().optional(),
        restrictions: z.string().optional(),
        memorialDescritivo: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.id);
        if (!project) throw new TRPCError({ code: "NOT_FOUND" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        
        const { id, ...updateData } = input;
        await db.updateProject(id, updateData);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.id);
        if (!project) throw new TRPCError({ code: "NOT_FOUND" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        
        await db.deleteProject(input.id);
        return { success: true };
      }),

    // Criar revisão do projeto com memorial editado
    // Usa transação atômica: projeto + agentes criados juntos ou nenhum
    createRevision: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        newMemorialDescritivo: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        
        // Criar nova revisão com transação atômica (projeto + agentes)
        const newProjectId = await db.createProjectRevision(
          input.projectId,
          input.newMemorialDescritivo,
          ctx.user.id
        );
        
        return { 
          success: true, 
          newProjectId,
          message: "Revisão criada com sucesso. Execute os agentes para processar o novo memorial."
        };
      }),

    // Listar revisões de um projeto
    getRevisions: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        
        // Determinar o ID do projeto pai
        const parentId = project.parentProjectId || project.id;
        
        // Buscar projeto original e todas as revisões
        const parentProject = await db.getProjectById(parentId);
        const revisions = await db.getProjectRevisions(parentId);
        
        return {
          original: parentProject,
          revisions,
          currentRevisionNumber: project.revisionNumber || 0,
        };
      }),

    // Obter próximo número de revisão
    getNextRevisionNumber: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        
        const nextNumber = await db.getNextRevisionNumber(input.projectId);
        const originalName = project.originalName || project.name;
        const nextRevisionName = `${originalName}_REV_${String(nextNumber).padStart(2, '0')}`;
        
        return {
          nextRevisionNumber: nextNumber,
          nextRevisionName,
        };
      }),

    getDetails: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.id);
        if (!project) throw new TRPCError({ code: "NOT_FOUND" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        
        const [agentExecutions, budgetItems, logisticsCosts, scheduleItems, cashFlowItems, documents] = await Promise.all([
          db.getAgentExecutionsByProjectId(input.id),
          db.getBudgetItemsByProjectId(input.id),
          db.getLogisticsCostsByProjectId(input.id),
          db.getScheduleItemsByProjectId(input.id),
          db.getCashFlowItemsByProjectId(input.id),
          db.getGeneratedDocumentsByProjectId(input.id),
        ]);
        
        return {
          project,
          agentExecutions,
          budgetItems,
          logisticsCosts,
          scheduleItems,
          cashFlowItems,
          documents,
        };
      }),
  }),

  // Agent Router
  agent: router({
    list: publicProcedure.query(() => {
      return Object.entries(AGENT_ORDER).map(([type, order]) => ({
        type: type as AgentType,
        order,
        name: AGENT_NAMES[type as AgentType],
        description: AGENT_DESCRIPTIONS[type as AgentType],
      }));
    }),

    getExecutions: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        
        return db.getAgentExecutionsByProjectId(input.projectId);
      }),

    execute: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        agentType: z.enum([
          "engenheiro_tecnico", "logistica", "orcamentista", "tributario",
          "comercial", "gestao_projetos", "financeiro", "juridico", "board"
        ]),
      }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        
        const executions = await db.getAgentExecutionsByProjectId(input.projectId);
        const execution = executions.find(e => e.agentType === input.agentType);
        if (!execution) throw new TRPCError({ code: "NOT_FOUND", message: "Execução do agente não encontrada" });
        
        await db.updateAgentExecution(execution.id, { status: "running", startedAt: new Date() });
        
        try {
          const agentInput = await buildAgentInput(input.agentType, project, executions, ctx.user.id);
          const agent = agents[input.agentType];
          const output = await agent.execute(agentInput);
          
          await db.updateAgentExecution(execution.id, {
            status: "completed",
            output: output as any,
            completedAt: new Date(),
          });
          
          const nextAgentOrder = AGENT_ORDER[input.agentType] + 1;
          if (nextAgentOrder <= 9) {
            await db.updateProject(input.projectId, { currentAgentId: nextAgentOrder });
          }
          
          return { success: true, output };
        } catch (error) {
          await db.updateAgentExecution(execution.id, {
            status: "failed",
            errors: { message: error instanceof Error ? error.message : "Unknown error" } as any,
          });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha na execução do agente" });
        }
      }),

    executeAll: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        
        await db.updateProject(input.projectId, { status: "processing" });
        
        const agentTypes: AgentType[] = [
          "engenheiro_tecnico", "orcamentista", "logistica", "tributario",
          "comercial", "gestao_projetos", "financeiro", "juridico", "board"
        ];
        
        const results: Record<string, any> = {};
        
        for (const agentType of agentTypes) {
          const executions = await db.getAgentExecutionsByProjectId(input.projectId);
          const execution = executions.find(e => e.agentType === agentType);
          if (!execution) continue;
          
          await db.updateAgentExecution(execution.id, { status: "running", startedAt: new Date() });
          
          try {
            const agentInput = await buildAgentInput(agentType, project, executions, ctx.user.id);
            const agent = agents[agentType];
            const output = await agent.execute(agentInput);
            
            results[agentType] = output;
            
            // Salvar itens de orçamento após execução do orçamentista
            if (agentType === 'orcamentista' && output && (output as any).budgetItems) {
              const rawItems = (output as any).budgetItems;
              const budgetItemsToSave = rawItems.map((item: any) => {
                const quantity = Number(item.quantity) || 0;
                const unitCostTotal = Number(item.unitCostTotal) || 0;
                const totalCost = quantity * unitCostTotal;
                // Aplicar BDI padrão de 55% para obras
                const bdiPercent = 0.55;
                const bdiAmount = totalCost * bdiPercent;
                const finalPrice = totalCost + bdiAmount;
                
                return {
                  projectId: input.projectId,
                  category: item.category || 'Geral',
                  code: item.code || '',
                  description: item.description,
                  unit: item.unit,
                  quantity: String(quantity),
                  unitCostMaterial: String(item.unitCostMaterial || 0),
                  unitCostLabor: String(item.unitCostLabor || 0),
                  unitCostLogistics: String(item.unitCostLogistics || 0),
                  unitCostTotal: String(unitCostTotal),
                  totalCost: String(totalCost),
                  bdiAmount: String(bdiAmount),
                  finalPrice: String(finalPrice),
                  source: item.source || 'Estimativa',
                  sourceCode: item.sourceCode || null,
                  sourceDate: item.sourceDate || null,
                };
              });
              await db.createBudgetItems(budgetItemsToSave);
            }
            
            // Salvar custos logísticos após execução do agente de logística
            if (agentType === 'logistica' && output && (output as any).costs) {
              try {
                const rawCosts = (output as any).costs;
                const validCategories = ['frete', 'bota_fora', 'deslocamento', 'hospedagem', 'alimentacao', 'equipamentos', 'outros'] as const;
                const costsToSave = rawCosts.map((cost: any) => {
                  // Mapear categoria para valor válido do enum
                  let category: typeof validCategories[number] = 'outros';
                  const rawCategory = (cost.category || '').toLowerCase();
                  if (rawCategory.includes('frete') || rawCategory.includes('transporte')) category = 'frete';
                  else if (rawCategory.includes('bota') || rawCategory.includes('resíduo') || rawCategory.includes('entulho')) category = 'bota_fora';
                  else if (rawCategory.includes('desloc') || rawCategory.includes('viagem')) category = 'deslocamento';
                  else if (rawCategory.includes('hosped') || rawCategory.includes('hotel')) category = 'hospedagem';
                  else if (rawCategory.includes('aliment') || rawCategory.includes('refeiç')) category = 'alimentacao';
                  else if (rawCategory.includes('equip') || rawCategory.includes('ferramenta')) category = 'equipamentos';
                  
                  return {
                    projectId: input.projectId,
                    category,
                    description: String(cost.description || 'Custo logístico').substring(0, 1000),
                    quantity: String(Number(cost.quantity) || 1),
                    unit: String(cost.unit || 'un').substring(0, 20),
                    unitCost: String(Number(cost.unitCost) || 0),
                    totalCost: String(Number(cost.totalCost) || 0),
                  };
                });
                console.log('[Logistica] Saving costs:', JSON.stringify(costsToSave, null, 2));
                await db.createLogisticsCosts(costsToSave);
              } catch (logisticsError) {
                console.error('[Logistica] Error saving costs:', logisticsError);
                // Não interromper o fluxo, apenas logar o erro
              }
            }
            
            // Salvar cronograma após execução do agente de gestão
            if (agentType === 'gestao_projetos' && output && (output as any).schedule) {
              const rawSchedule = (output as any).schedule;
              const scheduleToSave = rawSchedule.map((item: any) => ({
                projectId: input.projectId,
                description: item.activity || item.description || 'Atividade',
                startWeek: item.startWeek,
                duration: item.endWeek - item.startWeek + 1,
                dependencies: item.dependencies ? JSON.stringify(item.dependencies) : null,
              }));
              await db.createScheduleItems(scheduleToSave);
            }
            
            // Salvar fluxo de caixa após execução do agente financeiro
            if (agentType === 'financeiro' && output && (output as any).cashFlow) {
              const rawCashFlow = (output as any).cashFlow;
              let cumulativeBalance = 0;
              const cashFlowToSave = rawCashFlow.map((item: any) => {
                const expense = Number(item.expense || item.outflow || 0);
                const income = Number(item.income || item.inflow || 0);
                cumulativeBalance += income - expense;
                return {
                  projectId: input.projectId,
                  weekNumber: item.week,
                  plannedExpense: String(expense),
                  plannedIncome: String(income),
                  actualExpense: null,
                  actualIncome: null,
                  cashBalance: String(cumulativeBalance),
                  hasAlert: cumulativeBalance < 0,
                };
              });
              await db.createCashFlowItems(cashFlowToSave);
              
              // === CÁLCULO PROGRAMÁTICO DE MARGEM LÍQUIDA ===
              // Buscar dados dos agentes anteriores para cálculo correto
              const comercialOut = results.comercial as any;
              const tributarioOut = results.tributario as any;
              const logisticaOut = results.logistica as any;
              const orcamentistaOut = results.orcamentista as any;
              
              if (comercialOut && tributarioOut) {
                const totalPrice = Number(comercialOut.finalPrice) || 0;
                const totalDirectCost = Number(orcamentistaOut?.totalDirectCost) || 0;
                const totalLogisticsCost = Number(logisticaOut?.totalCost) || 0;
                const totalTaxes = Number(tributarioOut?.totalTaxes) || 0;
                const totalBaseCost = totalDirectCost + totalLogisticsCost;
                
                // Margem bruta: Preço - Custo base (sem impostos)
                const grossMargin = totalPrice - totalBaseCost;
                const grossMarginPercent = totalPrice > 0 ? (grossMargin / totalPrice) * 100 : 0;
                
                // Margem líquida: Preço - Custo base - Impostos
                const netMargin = totalPrice - totalBaseCost - totalTaxes;
                const netMarginPercent = totalPrice > 0 ? (netMargin / totalPrice) * 100 : 0;
                
                // Adicionar campos calculados ao output do financeiro
                (output as any).grossMargin = Math.round(grossMargin * 100) / 100;
                (output as any).grossMarginPercent = Math.round(grossMarginPercent * 100) / 100;
                (output as any).netMargin = Math.round(netMargin * 100) / 100;
                (output as any).netMarginPercent = Math.round(netMarginPercent * 100) / 100;
                
                console.log(`[Financeiro] Margens calculadas programaticamente:`);
                console.log(`  - Preço de Venda: R$ ${totalPrice.toFixed(2)}`);
                console.log(`  - Custo Base: R$ ${totalBaseCost.toFixed(2)}`);
                console.log(`  - Impostos: R$ ${totalTaxes.toFixed(2)}`);
                console.log(`  - Margem Bruta: R$ ${grossMargin.toFixed(2)} (${grossMarginPercent.toFixed(2)}%)`);
                console.log(`  - Margem Líquida: R$ ${netMargin.toFixed(2)} (${netMarginPercent.toFixed(2)}%)`);
              }
            }
            
            await db.updateAgentExecution(execution.id, {
              status: "completed",
              output: output as any,
              completedAt: new Date(),
            });
            
            await db.updateProject(input.projectId, { currentAgentId: AGENT_ORDER[agentType] + 1 });
          } catch (error) {
            await db.updateAgentExecution(execution.id, {
              status: "failed",
              errors: { message: error instanceof Error ? error.message : "Unknown error" } as any,
            });
            await db.updateProject(input.projectId, { status: "review" });
            throw new TRPCError({ 
              code: "INTERNAL_SERVER_ERROR", 
              message: `Falha no agente ${AGENT_NAMES[agentType]}` 
            });
          }
        }
        
        const boardResult = results.board as any;
        
        // === VALIDAÇÃO CRUZADA ENTRE AGENTES ===
        const coherenceValidation = validateAgentCoherence(results);
        console.log(`[Validação Cruzada] ${coherenceValidation.summary}`);
        
        if (!coherenceValidation.isValid) {
          console.warn('[Validação Cruzada] Inconsistências encontradas:');
          coherenceValidation.inconsistencies.forEach(inc => {
            console.warn(`  - ${inc.field}: esperado ${inc.expected}, encontrado ${inc.found} (erro: ${inc.percentError}%)`);
          });
          
          // Adicionar inconsistências ao resultado para visibilidade
          (results as any)._coherenceValidation = coherenceValidation;
        }
        
        // Lógica crítica do Board
        if (boardResult?.blockProposal) {
          // Verificar se é rejeição exclusivamente financeira e se pode solicitar revisão
          const isFinancialOnly = boardResult.isFinancialOnlyRejection === true;
          const wantsRevision = boardResult.requestFinancialRevision === true;
          const currentRevisionCycle = project.financialRevisionCycle || 0;
          const canRequestRevision = currentRevisionCycle === 0; // Só pode revisar uma vez
          
          if (isFinancialOnly && wantsRevision && canRequestRevision) {
            // CICLO DE REVISÃO FINANCEIRA AUTOMÁTICO
            console.log('[Board] Iniciando ciclo de revisão financeira automático...');
            
            // Salvar instruções de revisão no projeto
            await db.updateProject(input.projectId, {
              financialRevisionCycle: 1,
              financialRevisionReason: boardResult.financialRevisionReason || 'Margem abaixo do mínimo',
              financialRevisionInstructions: boardResult.financialRevisionInstructions || {},
              status: "processing" // Voltar para processamento
            });
            
            // Resetar agentes financeiros para re-execução
            const financialAgents: AgentType[] = ['orcamentista', 'logistica', 'tributario', 'comercial', 'gestao_projetos', 'financeiro', 'juridico', 'board'];
            const executions = await db.getAgentExecutionsByProjectId(input.projectId);
            
            for (const agentType of financialAgents) {
              const exec = executions.find(e => e.agentType === agentType);
              if (exec) {
                await db.updateAgentExecution(exec.id, { 
                  status: 'pending', 
                  output: null,
                  errors: null,
                  startedAt: null,
                  completedAt: null
                });
              }
            }
            
            // Limpar dados antigos de orçamento, logística, fluxo de caixa
            await db.deleteBudgetItemsByProjectId(input.projectId);
            await db.deleteLogisticsCostsByProjectId(input.projectId);
            await db.deleteCashFlowItemsByProjectId(input.projectId);
            await db.deleteScheduleItemsByProjectId(input.projectId);
            
            // Re-executar agentes financeiros com instruções de correção
            console.log('[Board] Re-executando agentes com instruções de correção...');
            
            const revisionInstructions = boardResult.financialRevisionInstructions || {};
            const revisedResults: Record<string, any> = { ...results };
            
            // Manter resultado do engenheiro técnico
            const engenheiroOutput = results.engenheiro_tecnico;
            
            for (const agentType of financialAgents) {
              const exec = executions.find(e => e.agentType === agentType);
              if (!exec) continue;
              
              await db.updateAgentExecution(exec.id, { status: 'running', startedAt: new Date() });
              
              try {
                // Recarregar projeto com instruções de revisão
                const updatedProject = await db.getProjectById(input.projectId);
                const updatedExecutions = await db.getAgentExecutionsByProjectId(input.projectId);
                
                // Construir input com instruções de correção
                let agentInput = await buildAgentInput(agentType, updatedProject!, updatedExecutions, ctx.user.id);
                
                // Adicionar instruções de correção ao input
                const instruction = revisionInstructions[agentType as keyof typeof revisionInstructions];
                if (instruction) {
                  (agentInput as any).revisionInstruction = instruction;
                  (agentInput as any).isFinancialRevision = true;
                  (agentInput as any).targetMargin = 15; // Margem alvo mínima
                }
                
                const agent = agents[agentType];
                const output = await agent.execute(agentInput);
                
                revisedResults[agentType] = output;
                
                // Salvar dados (mesma lógica de antes)
                if (agentType === 'orcamentista' && output && (output as any).budgetItems) {
                  const rawItems = (output as any).budgetItems;
                  const budgetItemsToSave = rawItems.map((item: any) => {
                    const quantity = Number(item.quantity) || 0;
                    const unitCostTotal = Number(item.unitCostTotal) || 0;
                    const totalCost = quantity * unitCostTotal;
                    const bdiPercent = 0.55;
                    const bdiAmount = totalCost * bdiPercent;
                    const finalPrice = totalCost + bdiAmount;
                    
                    return {
                      projectId: input.projectId,
                      category: item.category || 'Geral',
                      code: item.code || '',
                      description: item.description,
                      unit: item.unit,
                      quantity: String(quantity),
                      unitCostMaterial: String(item.unitCostMaterial || 0),
                      unitCostLabor: String(item.unitCostLabor || 0),
                      unitCostLogistics: String(item.unitCostLogistics || 0),
                      unitCostTotal: String(unitCostTotal),
                      totalCost: String(totalCost),
                      bdiAmount: String(bdiAmount),
                      finalPrice: String(finalPrice),
                      source: item.source || 'Estimativa',
                      sourceCode: item.sourceCode || null,
                      sourceDate: item.sourceDate || null,
                    };
                  });
                  await db.createBudgetItems(budgetItemsToSave);
                }
                
                if (agentType === 'logistica' && output && (output as any).costs) {
                  try {
                    const rawCosts = (output as any).costs;
                    const validCategories = ['frete', 'bota_fora', 'deslocamento', 'hospedagem', 'alimentacao', 'equipamentos', 'outros'] as const;
                    const costsToSave = rawCosts.map((cost: any) => {
                      let category: typeof validCategories[number] = 'outros';
                      const rawCategory = (cost.category || '').toLowerCase();
                      if (rawCategory.includes('frete') || rawCategory.includes('transporte')) category = 'frete';
                      else if (rawCategory.includes('bota') || rawCategory.includes('resíduo') || rawCategory.includes('entulho')) category = 'bota_fora';
                      else if (rawCategory.includes('desloc') || rawCategory.includes('viagem')) category = 'deslocamento';
                      else if (rawCategory.includes('hosped') || rawCategory.includes('hotel')) category = 'hospedagem';
                      else if (rawCategory.includes('aliment') || rawCategory.includes('refeiç')) category = 'alimentacao';
                      else if (rawCategory.includes('equip') || rawCategory.includes('ferramenta')) category = 'equipamentos';
                      
                      return {
                        projectId: input.projectId,
                        category,
                        description: String(cost.description || 'Custo logístico').substring(0, 1000),
                        quantity: String(Number(cost.quantity) || 1),
                        unit: String(cost.unit || 'un').substring(0, 20),
                        unitCost: String(Number(cost.unitCost) || 0),
                        totalCost: String(Number(cost.totalCost) || 0),
                      };
                    });
                    await db.createLogisticsCosts(costsToSave);
                  } catch (logisticsError) {
                    console.error('[Logistica Revision] Error saving costs:', logisticsError);
                  }
                }
                
                if (agentType === 'financeiro' && output && (output as any).cashFlow) {
                  const rawCashFlow = (output as any).cashFlow;
                  let cumulativeBalance = 0;
                  const cashFlowToSave = rawCashFlow.map((item: any) => {
                    const expense = Number(item.expense || item.outflow || 0);
                    const income = Number(item.income || item.inflow || 0);
                    cumulativeBalance += income - expense;
                    return {
                      projectId: input.projectId,
                      weekNumber: item.week,
                      plannedExpense: String(expense),
                      plannedIncome: String(income),
                      actualExpense: null,
                      actualIncome: null,
                      cashBalance: String(cumulativeBalance),
                      hasAlert: cumulativeBalance < 0,
                    };
                  });
                  await db.createCashFlowItems(cashFlowToSave);
                  
                  // === CÁLCULO PROGRAMÁTICO DE MARGEM LÍQUIDA (REVISÃO) ===
                  const comercialRevOut = revisedResults.comercial as any;
                  const tributarioRevOut = revisedResults.tributario as any;
                  const logisticaRevOut = revisedResults.logistica as any;
                  const orcamentistaRevOut = revisedResults.orcamentista as any;
                  
                  if (comercialRevOut && tributarioRevOut) {
                    const totalPrice = Number(comercialRevOut.finalPrice) || 0;
                    const totalDirectCost = Number(orcamentistaRevOut?.totalDirectCost) || 0;
                    const totalLogisticsCost = Number(logisticaRevOut?.totalCost) || 0;
                    const totalTaxes = Number(tributarioRevOut?.totalTaxes) || 0;
                    const totalBaseCost = totalDirectCost + totalLogisticsCost;
                    
                    const grossMargin = totalPrice - totalBaseCost;
                    const grossMarginPercent = totalPrice > 0 ? (grossMargin / totalPrice) * 100 : 0;
                    const netMargin = totalPrice - totalBaseCost - totalTaxes;
                    const netMarginPercent = totalPrice > 0 ? (netMargin / totalPrice) * 100 : 0;
                    
                    (output as any).grossMargin = Math.round(grossMargin * 100) / 100;
                    (output as any).grossMarginPercent = Math.round(grossMarginPercent * 100) / 100;
                    (output as any).netMargin = Math.round(netMargin * 100) / 100;
                    (output as any).netMarginPercent = Math.round(netMarginPercent * 100) / 100;
                    
                    console.log(`[Financeiro Revisão] Margens calculadas: Bruta ${grossMarginPercent.toFixed(2)}%, Líquida ${netMarginPercent.toFixed(2)}%`);
                  }
                }
                
                await db.updateAgentExecution(exec.id, {
                  status: 'completed',
                  output: output as any,
                  completedAt: new Date(),
                });
                
              } catch (error) {
                console.error(`[Revision] Agent ${agentType} failed:`, error);
                await db.updateAgentExecution(exec.id, {
                  status: 'failed',
                  errors: { message: error instanceof Error ? error.message : 'Unknown error' } as any,
                });
                // Continuar com próximo agente em caso de erro
              }
            }
            
            // Verificar resultado do Board após revisão
            const revisedBoardResult = revisedResults.board as any;
            
            if (revisedBoardResult?.approved) {
              await db.updateProject(input.projectId, { status: 'approved' });
              return { 
                success: true, 
                revisedAfterFinancialCorrection: true,
                results: revisedResults 
              };
            } else if (revisedBoardResult?.requiresUserConfirmation) {
              await db.updateProject(input.projectId, { 
                status: 'pending_confirmation',
                warningMessages: JSON.stringify(revisedBoardResult.warningMessages || [])
              });
              return { 
                success: true, 
                requiresConfirmation: true,
                revisedAfterFinancialCorrection: true,
                warningMessages: revisedBoardResult.warningMessages,
                results: revisedResults 
              };
            } else {
              // Ainda bloqueado após revisão - não tentar novamente
              await db.updateProject(input.projectId, { 
                status: 'blocked',
                blockReason: revisedBoardResult?.blockReason || 'Proposta bloqueada mesmo após revisão financeira'
              });
              return { 
                success: false, 
                blocked: true,
                revisedAfterFinancialCorrection: true,
                blockReason: revisedBoardResult?.blockReason || 'Proposta não atingiu margem mínima mesmo após revisão',
                results: revisedResults 
              };
            }
          }
          
          // Proposta BLOQUEADA - não pode ser gerada (sem revisão automática)
          await db.updateProject(input.projectId, { 
            status: "blocked",
            blockReason: boardResult.blockReason || "Proposta bloqueada pelo Board"
          });
          return { 
            success: false, 
            blocked: true,
            blockReason: boardResult.blockReason,
            results 
          };
        } else if (boardResult?.requiresUserConfirmation) {
          // Proposta com ATENÇÃO - precisa confirmação do usuário
          await db.updateProject(input.projectId, { 
            status: "pending_confirmation",
            warningMessages: JSON.stringify(boardResult.warningMessages || [])
          });
          return { 
            success: true, 
            requiresConfirmation: true,
            warningMessages: boardResult.warningMessages,
            results 
          };
        } else if (boardResult?.approved) {
          // Proposta APROVADA
          await db.updateProject(input.projectId, { status: "approved" });
          return { success: true, results };
        } else {
          // Proposta em REVISÃO
          await db.updateProject(input.projectId, { status: "review" });
          return { success: true, results };
        }
      }),

    // Confirmar proposta após alertas do Board
    confirmProposal: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        
        if (project.status !== "pending_confirmation") {
          throw new TRPCError({ 
            code: "BAD_REQUEST", 
            message: "Projeto não está aguardando confirmação" 
          });
        }
        
        // Marcar como aprovado após confirmação do usuário
        await db.updateProject(input.projectId, { 
          status: "approved",
          warningMessages: null // Limpar warnings após confirmação
        });
        
        return { success: true, message: "Proposta confirmada com sucesso!" };
      }),

    // Obter alertas pendentes do Board
    getBoardWarnings: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        
        let warnings: string[] = [];
        if (project.warningMessages) {
          try {
            warnings = JSON.parse(project.warningMessages as string);
          } catch {
            warnings = [];
          }
        }
        
        return {
          status: project.status,
          blockReason: project.blockReason,
          warnings,
        };
      }),

    // Selecionar itens opcionais da logística
    selectOptionalItems: protectedProcedure
      .input(z.object({ 
        projectId: z.number(),
        selectedItems: z.array(z.number()) // Índices dos itens opcionais selecionados
      }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        
        // Buscar execução do agente de logística
        const executions = await db.getAgentExecutionsByProjectId(input.projectId);
        const logisticaExec = executions.find(e => e.agentType === "logistica");
        
        if (!logisticaExec || !logisticaExec.output) {
          throw new TRPCError({ 
            code: "BAD_REQUEST", 
            message: "Agente de logística ainda não foi executado" 
          });
        }
        
        const output = logisticaExec.output as any;
        const optionalItems = output.optionalItems || [];
        
        // Calcular custo adicional dos itens selecionados
        let additionalCost = 0;
        const selectedOptionalItems = input.selectedItems.map(idx => {
          if (idx >= 0 && idx < optionalItems.length) {
            additionalCost += optionalItems[idx].totalCost;
            return optionalItems[idx];
          }
          return null;
        }).filter(Boolean);
        
        // Atualizar output do agente com itens selecionados
        const updatedOutput = {
          ...output,
          selectedOptionalItems,
          totalLogisticsCost: output.totalLogisticsCost + additionalCost,
        };
        
        await db.updateAgentExecution(logisticaExec.id, { output: updatedOutput });
        
        // Salvar custos opcionais selecionados no banco
        if (selectedOptionalItems.length > 0) {
          const validCategories = ['frete', 'bota_fora', 'deslocamento', 'hospedagem', 'alimentacao', 'equipamentos', 'outros'] as const;
          const costsToSave = selectedOptionalItems.map((item: any) => {
            let category: typeof validCategories[number] = 'outros';
            const rawCategory = (item.category || '').toLowerCase();
            if (rawCategory.includes('placa')) category = 'outros';
            else if (rawCategory.includes('tapume')) category = 'outros';
            else if (rawCategory.includes('seguro')) category = 'outros';
            
            return {
              projectId: input.projectId,
              category,
              description: String(item.description || 'Item opcional').substring(0, 1000),
              quantity: String(Number(item.quantity) || 1),
              unit: String(item.unit || 'un').substring(0, 20),
              unitCost: String(Number(item.unitCost) || 0),
              totalCost: String(Number(item.totalCost) || 0),
            };
          });
          await db.createLogisticsCosts(costsToSave);
        }
        
        return { 
          success: true, 
          additionalCost,
          newTotalLogisticsCost: output.totalLogisticsCost + additionalCost,
          selectedCount: selectedOptionalItems.length
        };
      }),
  }),

  // Budget Router
  // Company Settings Router - Configurações de Impostos e BDI por Empresa
  settings: router({
    get: protectedProcedure
      .query(async ({ ctx }) => {
        return db.getCompanySettingsOrDefault(ctx.user.id);
      }),

    update: protectedProcedure
      .input(z.object({
        companyName: z.string().optional(),
        cnpj: z.string().optional(),
        priceRegion: z.enum(["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]).optional(),
        taxaLeisSociais: z.string().optional(),
        bdiPercentual: z.string().optional(),
        lucroPercentual: z.string().optional(),
        issPercentual: z.string().optional(),
        pisPercentual: z.string().optional(),
        cofinsPercentual: z.string().optional(),
        irpjPercentual: z.string().optional(),
        csllPercentual: z.string().optional(),
        adminCentralPercentual: z.string().optional(),
        despesasFinanceirasPercentual: z.string().optional(),
        riscosPercentual: z.string().optional(),
        regimeTributario: z.enum(["simples_nacional", "lucro_presumido", "lucro_real"]).optional(),
        dataReferenciaPrecos: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return db.upsertCompanySettings(ctx.user.id, input);
      }),

    // Calcular BDI baseado nos componentes
    calculateBdi: protectedProcedure
      .input(z.object({
        adminCentral: z.number(),
        despesasFinanceiras: z.number(),
        riscos: z.number(),
        lucro: z.number(),
        iss: z.number(),
        pis: z.number(),
        cofins: z.number(),
        irpj: z.number(),
        csll: z.number(),
      }))
      .query(({ input }) => {
        // Fórmula do BDI: ((1 + AC + DF + R + L) / (1 - T)) - 1
        // Onde T = soma dos tributos sobre faturamento
        const { adminCentral, despesasFinanceiras, riscos, lucro, iss, pis, cofins, irpj, csll } = input;
        
        const tributos = (iss + pis + cofins + irpj + csll) / 100;
        const despesas = (adminCentral + despesasFinanceiras + riscos + lucro) / 100;
        
        const bdi = ((1 + despesas) / (1 - tributos)) - 1;
        const bdiPercentual = bdi * 100;
        
        return {
          bdiPercentual: bdiPercentual.toFixed(2),
          composicao: {
            administracaoCentral: adminCentral,
            despesasFinanceiras,
            riscos,
            lucro,
            tributos: {
              iss,
              pis,
              cofins,
              irpj,
              csll,
              total: (iss + pis + cofins + irpj + csll).toFixed(2),
            },
          },
        };
      }),
  }),

  // Admin Dashboard Router
  admin: router({
    getStats: protectedProcedure
      .query(async ({ ctx }) => {
        const stats = await db.getAdminStats();
        return stats;
      }),

    getUsers: protectedProcedure
      .query(async ({ ctx }) => {
        const users = await db.getAdminUsers();
        return users;
      }),

    getProjects: protectedProcedure
      .query(async ({ ctx }) => {
        const projects = await db.getAdminProjects();
        return projects;
      }),
  }),

  budget: router({
    getItems: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        
        return db.getBudgetItemsByProjectId(input.projectId);
      }),
  }),

  // Price Search Router
  price: router({
    searchSinapi: protectedProcedure
      .input(z.object({ query: z.string(), limit: z.number().optional() }))
      .query(async ({ input }) => {
        return searchSinapi(input.query, input.limit || 10);
      }),

    searchPini: protectedProcedure
      .input(z.object({ query: z.string(), region: z.string().optional(), limit: z.number().optional() }))
      .query(async ({ input }) => {
        return searchPini(input.query, input.region || "São Paulo", input.limit || 10);
      }),

    getSinapiComposition: protectedProcedure
      .input(z.object({ code: z.string() }))
      .query(async ({ input }) => {
        return getSinapiComposition(input.code);
      }),

    getPiniComposition: protectedProcedure
      .input(z.object({ code: z.string(), region: z.string().optional() }))
      .query(async ({ input }) => {
        return getPiniComposition(input.code, input.region || "São Paulo");
      }),

    compare: protectedProcedure
      .input(z.object({ description: z.string() }))
      .query(async ({ input }) => {
        return comparePrices(input.description);
      }),
  }),

  // Documents Router
  document: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        
        return db.getGeneratedDocumentsByProjectId(input.projectId);
      }),

    generateProposal: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        
        const [budgetItems, logisticsCosts, executions, companySettings] = await Promise.all([
          db.getBudgetItemsByProjectId(input.projectId),
          db.getLogisticsCostsByProjectId(input.projectId),
          db.getAgentExecutionsByProjectId(input.projectId),
          db.getCompanySettingsOrDefault(ctx.user.id),
        ]);
        
        const juridicaExec = executions.find(e => e.agentType === "juridico");
        const juridicaOutput = juridicaExec?.output;
        
        // Get comercial output to get the final sale price
        const comercialExec = executions.find(e => e.agentType === "comercial");
        const comercialOutput = comercialExec?.output;
        
        const result = await generateProposalPDF(project, budgetItems, logisticsCosts, juridicaOutput, comercialOutput, companySettings);
        return result;
      }),

    generateMemoria: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        
        const [budgetItems, logisticsCosts, cashFlowItems, executions] = await Promise.all([
          db.getBudgetItemsByProjectId(input.projectId),
          db.getLogisticsCostsByProjectId(input.projectId),
          db.getCashFlowItemsByProjectId(input.projectId),
          db.getAgentExecutionsByProjectId(input.projectId),
        ]);
        
        // Obter output do agente comercial para usar o preço final correto
        const comercialExec = executions.find(e => e.agentType === "comercial");
        const comercialOutput = comercialExec?.output;
        
        const result = await generateMemoriaCalculo(project, budgetItems, logisticsCosts, cashFlowItems, comercialOutput);
        return result;
      }),

    generateSchedule: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        
        const executions = await db.getAgentExecutionsByProjectId(input.projectId);
        const gestaoExec = executions.find(e => e.agentType === "gestao_projetos");
        
        if (!gestaoExec || !gestaoExec.output) {
          throw new TRPCError({ 
            code: "BAD_REQUEST", 
            message: "Agente de Gestão de Projetos ainda não foi executado" 
          });
        }
        
        const gestaoOutput = gestaoExec.output as any;
        
        const result = await generateSchedulePDF(
          project,
          gestaoOutput.dailySchedule || [],
          gestaoOutput.scheduleItems || [],
          gestaoOutput.milestones || [],
          gestaoOutput.totalDays || gestaoOutput.totalDuration * 5 || 30,
          gestaoOutput.teamSummary || "Equipe a ser definida conforme cronograma",
          gestaoOutput.materialsSummary || "Materiais conforme memorial descritivo"
        );
        return result;
      }),

    // Exportar todos os documentos em ZIP
    exportAllDocuments: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        
        // Buscar documentos existentes
        const documents = await db.getDocumentsByProjectId(input.projectId);
        
        // Verificar se há documentos para exportar
        if (documents.length === 0) {
          throw new TRPCError({ 
            code: "BAD_REQUEST", 
            message: "Nenhum documento gerado. Execute os agentes e gere os documentos primeiro." 
          });
        }
        
        // Importar bibliotecas necessárias
        const archiver = await import("archiver");
        const { storagePut, storageGet } = await import("./storage");
        
        // Criar buffer para o ZIP
        const chunks: Buffer[] = [];
        const archive = archiver.default("zip", { zlib: { level: 9 } });
        
        archive.on("data", (chunk: Buffer) => chunks.push(chunk));
        
        // Baixar e adicionar cada documento ao ZIP
        for (const doc of documents) {
          try {
            // Buscar o conteúdo do arquivo do S3
            const response = await fetch(doc.fileUrl);
            if (response.ok) {
              const buffer = Buffer.from(await response.arrayBuffer());
              const extension = doc.fileUrl.split(".").pop() || "html";
              const fileName = `${doc.documentType}_${project.name.replace(/\s+/g, "_")}.${extension}`;
              archive.append(buffer, { name: fileName });
            }
          } catch (error) {
            console.error(`Erro ao baixar documento ${doc.documentType}:`, error);
          }
        }
        
        // Finalizar o arquivo ZIP
        await archive.finalize();
        
        // Aguardar todos os chunks serem coletados
        await new Promise<void>((resolve) => archive.on("end", resolve));
        
        const zipBuffer = Buffer.concat(chunks);
        
        // Upload do ZIP para S3
        const timestamp = Date.now();
        const zipFileName = `documentos_${project.name.replace(/\s+/g, "_")}_${timestamp}.zip`;
        const zipFileKey = `exports/${project.id}/${zipFileName}`;
        
        const { url } = await storagePut(zipFileKey, zipBuffer, "application/zip");
        
        return {
          url,
          fileName: zipFileName,
          documentCount: documents.length,
        };
      }),
  }),
});

// Helper function to build agent input based on previous outputs
async function buildAgentInput(agentType: AgentType, project: any, executions: any[], userId: number): Promise<any> {
  const getOutput = (type: AgentType) => {
    const exec = executions.find(e => e.agentType === type);
    return exec?.output || {};
  };
  
  // Buscar configurações da empresa do usuário
  const companySettings = await db.getCompanySettingsOrDefault(userId);
  
  switch (agentType) {
    case "engenheiro_tecnico":
      return {
        memorialDescritivo: project.memorialDescritivo || "",
        location: project.location || "",
        restrictions: project.restrictions || "",
      };
      
    case "orcamentista":
      // Orçamentista agora vem ANTES de Logística
      // Recebe itens do Engenheiro Técnico e precifica
      return {
        items: getOutput("engenheiro_tecnico").items || [],
        logisticsCosts: { costs: [], totalLogisticsCost: 0, restrictions: [] }, // Logística ainda não executou
        region: project.location || "São Paulo",
      };
      
    case "logistica":
      // Logística agora vem DEPOIS de Orçamentista
      // Recebe itens do Engenheiro Técnico e orçamento para calcular custos indiretos
      const engenheiroOutput = getOutput("engenheiro_tecnico");
      const orcamentistaOutput = getOutput("orcamentista");
      return {
        items: engenheiroOutput.items || [],
        location: project.location || "",
        restrictions: project.restrictions || "",
        estimatedDuration: 8,
        // Passar informações do orçamento para ajudar a estimar logística
        budgetItems: orcamentistaOutput.budgetItems || [],
      };
      
    case "tributario":
      return {
        budgetItems: getOutput("orcamentista").budgetItems || [],
        contractType: project.contractType,
        // Configurações de impostos da empresa
        companyTaxSettings: {
          regimeTributario: companySettings.regimeTributario,
          issPercentual: parseFloat(companySettings.issPercentual as string) || 5.0,
          pisPercentual: parseFloat(companySettings.pisPercentual as string) || 0.65,
          cofinsPercentual: parseFloat(companySettings.cofinsPercentual as string) || 3.0,
          irpjPercentual: parseFloat(companySettings.irpjPercentual as string) || 1.2,
          csllPercentual: parseFloat(companySettings.csllPercentual as string) || 1.08,
          taxaLeisSociais: parseFloat(companySettings.taxaLeisSociais as string) || 128.23,
        },
      };
      
    case "comercial":
      const orcOutput = getOutput("orcamentista");
      const tribOutput = getOutput("tributario");
      const logOutput = getOutput("logistica");
      // IMPORTANTE: totalIndirectCost vem da Logística, não do Orçamentista
      const totalIndirectFromLogistics = logOutput.totalLogisticsCost || 0;
      return {
        budgetItems: orcOutput.budgetItems || [],
        totalDirectCost: orcOutput.totalDirectCost || 0,
        totalIndirectCost: totalIndirectFromLogistics,
        totalTaxes: tribOutput.totalTaxes || 0,
        contractType: project.contractType,
        logisticsComplexity: logOutput.totalLogisticsCost > 50000 ? "high" : logOutput.totalLogisticsCost > 20000 ? "medium" : "low",
        fiscalRisk: tribOutput.alerts?.length > 2 ? "high" : tribOutput.alerts?.length > 0 ? "medium" : "low",
        // Configurações de BDI e lucro da empresa
        companyBdiSettings: {
          bdiPercentual: parseFloat(companySettings.bdiPercentual as string) || 25.0,
          lucroPercentual: parseFloat(companySettings.lucroPercentual as string) || 8.0,
          adminCentralPercentual: parseFloat(companySettings.adminCentralPercentual as string) || 4.0,
          despesasFinanceirasPercentual: parseFloat(companySettings.despesasFinanceirasPercentual as string) || 1.0,
          riscosPercentual: parseFloat(companySettings.riscosPercentual as string) || 1.0,
        },
      };
      
    case "gestao_projetos":
      return {
        budgetItems: getOutput("orcamentista").budgetItems || [],
        logisticsCosts: getOutput("logistica"),
        restrictions: project.restrictions || "",
      };
      
    case "financeiro":
      const gestaoOutput = getOutput("gestao_projetos");
      const comercialOutput = getOutput("comercial");
      return {
        scheduleItems: gestaoOutput.scheduleItems || [],
        budgetItems: getOutput("orcamentista").budgetItems || [],
        totalPrice: comercialOutput.finalPrice || 0,
        paymentTerms: "30/60/90 dias após medição",
      };
      
    case "juridico":
      const finOutput = getOutput("financeiro");
      const gestOutput = getOutput("gestao_projetos");
      const comOutput = getOutput("comercial");
      return {
        projectName: project.name,
        contractType: project.contractType,
        totalPrice: comOutput.finalPrice || 0,
        paymentTerms: "30/60/90 dias após medição",
        duration: gestOutput.totalDuration || 8,
        restrictions: getOutput("logistica").restrictions || [],
        financialAlerts: finOutput.alerts || [],
      };
      
    case "board":
      return {
        allAgentOutputs: {
          engenheiro: getOutput("engenheiro_tecnico"),
          logistica: getOutput("logistica"),
          orcamentista: getOutput("orcamentista"),
          tributario: getOutput("tributario"),
          comercial: getOutput("comercial"),
          gestao: getOutput("gestao_projetos"),
          financeiro: getOutput("financeiro"),
          juridico: getOutput("juridico"),
        },
        projectSummary: {
          name: project.name,
          totalPrice: getOutput("comercial").finalPrice || 0,
          duration: getOutput("gestao_projetos").totalDuration || 8,
          contractType: project.contractType,
        },
      };
      
    default:
      return {};
  }
}

/**
 * Validação cruzada entre outputs dos agentes.
 * Verifica consistência matemática dos valores calculados.
 * 
 * @param results - Objeto com outputs de todos os agentes
 * @returns Objeto com resultado da validação e lista de inconsistências
 */
export function validateAgentCoherence(results: Record<string, any>): {
  isValid: boolean;
  inconsistencies: Array<{
    field: string;
    expected: number;
    found: number;
    difference: number;
    percentError: number;
    severity: 'warning' | 'error';
  }>;
  summary: string;
} {
  const inconsistencies: Array<{
    field: string;
    expected: number;
    found: number;
    difference: number;
    percentError: number;
    severity: 'warning' | 'error';
  }> = [];
  
  const TOLERANCE_PERCENT = 1; // Tolerância de 1% para arredondamentos
  
  // Extrair valores dos agentes
  const orcamentista = results.orcamentista || {};
  const logistica = results.logistica || {};
  const tributario = results.tributario || {};
  const comercial = results.comercial || {};
  const financeiro = results.financeiro || {};
  
  // Valores base
  const totalDirectCost = Number(orcamentista.totalDirectCost) || 0;
  const totalLogisticsCost = Number(logistica.totalCost) || 0;
  const totalTaxes = Number(tributario.totalTaxes) || 0;
  const bdi = Number(comercial.adjustedBdi) || 0;
  const finalPrice = Number(comercial.finalPrice) || 0;
  
  // Validação 1: Preço Final = (Custo Direto + Logística) * (1 + BDI)
  const expectedPrice = (totalDirectCost + totalLogisticsCost) * (1 + bdi);
  if (finalPrice > 0 && expectedPrice > 0) {
    const priceDiff = Math.abs(finalPrice - expectedPrice);
    const priceError = (priceDiff / expectedPrice) * 100;
    
    if (priceError > TOLERANCE_PERCENT) {
      inconsistencies.push({
        field: 'Preço Final',
        expected: Math.round(expectedPrice * 100) / 100,
        found: Math.round(finalPrice * 100) / 100,
        difference: Math.round(priceDiff * 100) / 100,
        percentError: Math.round(priceError * 100) / 100,
        severity: priceError > 5 ? 'error' : 'warning',
      });
    }
  }
  
  // Validação 2: Margem Líquida = Preço - Custo Base - Impostos
  const expectedNetMargin = finalPrice - totalDirectCost - totalLogisticsCost - totalTaxes;
  const foundNetMargin = Number(financeiro.netMargin) || 0;
  
  if (foundNetMargin !== 0 && expectedNetMargin !== 0) {
    const marginDiff = Math.abs(foundNetMargin - expectedNetMargin);
    const marginError = (marginDiff / Math.abs(expectedNetMargin)) * 100;
    
    if (marginError > TOLERANCE_PERCENT) {
      inconsistencies.push({
        field: 'Margem Líquida',
        expected: Math.round(expectedNetMargin * 100) / 100,
        found: Math.round(foundNetMargin * 100) / 100,
        difference: Math.round(marginDiff * 100) / 100,
        percentError: Math.round(marginError * 100) / 100,
        severity: marginError > 10 ? 'error' : 'warning',
      });
    }
  }
  
  // Validação 3: Soma dos itens do orçamento = Total Direto
  const budgetItems = orcamentista.budgetItems || [];
  const sumBudgetItems = budgetItems.reduce((sum: number, item: any) => {
    return sum + (Number(item.quantity) || 0) * (Number(item.unitCostTotal) || 0);
  }, 0);
  
  if (totalDirectCost > 0 && sumBudgetItems > 0) {
    const budgetDiff = Math.abs(totalDirectCost - sumBudgetItems);
    const budgetError = (budgetDiff / totalDirectCost) * 100;
    
    if (budgetError > TOLERANCE_PERCENT) {
      inconsistencies.push({
        field: 'Total Custo Direto',
        expected: Math.round(sumBudgetItems * 100) / 100,
        found: Math.round(totalDirectCost * 100) / 100,
        difference: Math.round(budgetDiff * 100) / 100,
        percentError: Math.round(budgetError * 100) / 100,
        severity: budgetError > 5 ? 'error' : 'warning',
      });
    }
  }
  
  // Validação 4: Soma dos custos logísticos = Total Logística
  const logisticsCosts = logistica.costs || [];
  const sumLogistics = logisticsCosts.reduce((sum: number, cost: any) => {
    return sum + (Number(cost.totalCost) || 0);
  }, 0);
  
  if (totalLogisticsCost > 0 && sumLogistics > 0) {
    const logDiff = Math.abs(totalLogisticsCost - sumLogistics);
    const logError = (logDiff / totalLogisticsCost) * 100;
    
    if (logError > TOLERANCE_PERCENT) {
      inconsistencies.push({
        field: 'Total Logística',
        expected: Math.round(sumLogistics * 100) / 100,
        found: Math.round(totalLogisticsCost * 100) / 100,
        difference: Math.round(logDiff * 100) / 100,
        percentError: Math.round(logError * 100) / 100,
        severity: logError > 5 ? 'error' : 'warning',
      });
    }
  }
  
  // Gerar resumo
  const errors = inconsistencies.filter(i => i.severity === 'error');
  const warnings = inconsistencies.filter(i => i.severity === 'warning');
  
  let summary = '';
  if (inconsistencies.length === 0) {
    summary = 'Validação OK: Todos os valores estão consistentes entre os agentes.';
  } else {
    summary = `Validação encontrou ${errors.length} erro(s) e ${warnings.length} aviso(s) de inconsistência.`;
  }
  
  return {
    isValid: errors.length === 0,
    inconsistencies,
    summary,
  };
}

export type AppRouter = typeof appRouter;
