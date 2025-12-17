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
import { generateProposalPDF, generateMemoriaCalculo } from "./services/documents";

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
        contractType: z.enum(["manutencao", "obra"]),
        location: z.string().optional(),
        restrictions: z.string().optional(),
        memorialDescritivo: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const projectId = await db.createProject({
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
        
        const agentTypes: AgentType[] = [
          "engenheiro_tecnico", "logistica", "orcamentista", "tributario",
          "comercial", "gestao_projetos", "financeiro", "juridico", "board"
        ];
        
        for (const agentType of agentTypes) {
          await db.createAgentExecution({
            projectId,
            agentType,
            agentOrder: AGENT_ORDER[agentType],
            status: "pending",
          });
        }
        
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
          const agentInput = await buildAgentInput(input.agentType, project, executions);
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
          "engenheiro_tecnico", "logistica", "orcamentista", "tributario",
          "comercial", "gestao_projetos", "financeiro", "juridico", "board"
        ];
        
        const results: Record<string, any> = {};
        
        for (const agentType of agentTypes) {
          const executions = await db.getAgentExecutionsByProjectId(input.projectId);
          const execution = executions.find(e => e.agentType === agentType);
          if (!execution) continue;
          
          await db.updateAgentExecution(execution.id, { status: "running", startedAt: new Date() });
          
          try {
            const agentInput = await buildAgentInput(agentType, project, executions);
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
        if (boardResult?.approved) {
          await db.updateProject(input.projectId, { status: "approved" });
        } else {
          await db.updateProject(input.projectId, { status: "review" });
        }
        
        return { success: true, results };
      }),
  }),

  // Budget Router
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
        
        const [budgetItems, executions] = await Promise.all([
          db.getBudgetItemsByProjectId(input.projectId),
          db.getAgentExecutionsByProjectId(input.projectId),
        ]);
        
        const juridicaExec = executions.find(e => e.agentType === "juridico");
        const juridicaOutput = juridicaExec?.output;
        
        // Get comercial output to get the final sale price
        const comercialExec = executions.find(e => e.agentType === "comercial");
        const comercialOutput = comercialExec?.output;
        
        const result = await generateProposalPDF(project, budgetItems, juridicaOutput, comercialOutput);
        return result;
      }),

    generateMemoria: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        
        const [budgetItems, logisticsCosts, cashFlowItems] = await Promise.all([
          db.getBudgetItemsByProjectId(input.projectId),
          db.getLogisticsCostsByProjectId(input.projectId),
          db.getCashFlowItemsByProjectId(input.projectId),
        ]);
        
        const result = await generateMemoriaCalculo(project, budgetItems, logisticsCosts, cashFlowItems);
        return result;
      }),
  }),
});

// Helper function to build agent input based on previous outputs
async function buildAgentInput(agentType: AgentType, project: any, executions: any[]): Promise<any> {
  const getOutput = (type: AgentType) => {
    const exec = executions.find(e => e.agentType === type);
    return exec?.output || {};
  };
  
  switch (agentType) {
    case "engenheiro_tecnico":
      return {
        memorialDescritivo: project.memorialDescritivo || "",
        location: project.location || "",
        restrictions: project.restrictions || "",
      };
      
    case "logistica":
      const engenheiroOutput = getOutput("engenheiro_tecnico");
      return {
        items: engenheiroOutput.items || [],
        location: project.location || "",
        restrictions: project.restrictions || "",
        estimatedDuration: 8,
      };
      
    case "orcamentista":
      return {
        items: getOutput("engenheiro_tecnico").items || [],
        logisticsCosts: getOutput("logistica"),
        region: project.location || "São Paulo",
      };
      
    case "tributario":
      return {
        budgetItems: getOutput("orcamentista").budgetItems || [],
        contractType: project.contractType,
      };
      
    case "comercial":
      const orcOutput = getOutput("orcamentista");
      const tribOutput = getOutput("tributario");
      const logOutput = getOutput("logistica");
      return {
        budgetItems: orcOutput.budgetItems || [],
        totalDirectCost: orcOutput.totalDirectCost || 0,
        totalIndirectCost: orcOutput.totalIndirectCost || 0,
        totalTaxes: tribOutput.totalTaxes || 0,
        contractType: project.contractType,
        logisticsComplexity: logOutput.totalLogisticsCost > 50000 ? "high" : logOutput.totalLogisticsCost > 20000 ? "medium" : "low",
        fiscalRisk: tribOutput.alerts?.length > 2 ? "high" : tribOutput.alerts?.length > 0 ? "medium" : "low",
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

export type AppRouter = typeof appRouter;
