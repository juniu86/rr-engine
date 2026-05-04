import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { agents } from "./agents";
import { AGENT_ORDER, AGENT_NAMES, AGENT_DESCRIPTIONS } from "../shared/agents";
import type { AgentType } from "../shared/agents";
import { searchSinapi, getSinapiComposition } from "./services/sinapi";
import { searchPini, getPiniComposition, comparePrices } from "./services/pini";
import { generateProposalPDF, generateMemoriaCalculo, generateSchedulePDF } from "./services/documents";
import { stripeRouter } from "./routers/stripe";
import { canCreateBudget, consumeBudgetCredit } from "./stripe/stripeService";
import { persistAgentOutput, persistBudgetItems, persistLogisticsCosts, persistScheduleItems, persistCashFlowItems, normalizeForDedup } from "./services/agentPersistence";
import { filterItemsForPricing } from "./utils/hierarchy";

export const appRouter = router({
  system: systemRouter,
  stripe: stripeRouter,
  
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
        // Gate de pagamento: verificar se usuário pode criar orçamento
        const budgetCheck = await canCreateBudget(ctx.user.id);
        if (!budgetCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: budgetCheck.reason || "Sem plano ativo ou créditos disponíveis. Acesse a página de Planos.",
          });
        }

        // Buscar BDI das configurações da empresa do usuário
        const companySettings = await db.getCompanySettingsOrDefault(ctx.user.id);
        const bdiValue = companySettings.bdiPercentual ?? 25;

        // Consumir crédito/quota ANTES de criar o projeto (atômico via SQL WHERE)
        // Se não houver crédito, consumeBudgetCredit retorna false e o projeto não é criado
        const creditConsumed = await consumeBudgetCredit(ctx.user.id);
        if (!creditConsumed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Falha ao consumir crédito. Verifique seu plano ou créditos disponíveis.",
          });
        }

        // Criar projeto somente após crédito consumido com sucesso
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
          bdiPreset: "padrao", // Sempre usar padrão pois BDI vem das configurações
          bdiPercentual: bdiValue.toString(),
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

    getTokenUsage: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

        return db.getProjectTokenUsage(input.projectId);
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
          "comercial", "gestao_projetos", "financeiro", "juridico", "board", "auditor"
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
          (agentInput as any)._projectId = input.projectId;
          (agentInput as any)._agentExecutionId = execution.id;
          const agent = agents[input.agentType];
          const output = await agent.execute(agentInput);

          // Persistir dados derivados conforme tipo de agente
          const companySettingsSingle = await db.getCompanySettingsOrDefault(ctx.user.id);
          const singleBdiValue = project.bdiPercentual ? parseFloat(project.bdiPercentual as string) / 100 : (parseFloat(companySettingsSingle.bdiPercentual as string) / 100 || 0.25);

          const finalOutput = await persistAgentOutput(input.agentType, input.projectId, output, {
            bdiPercent: singleBdiValue,
            executions,
            agentInput,
          });

          await db.updateAgentExecution(execution.id, {
            status: "completed",
            output: finalOutput as any,
            completedAt: new Date(),
          });
          
          const nextAgentOrder = AGENT_ORDER[input.agentType] + 1;
          if (nextAgentOrder <= 10) {
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
          "comercial", "gestao_projetos", "financeiro", "juridico", "board", "auditor"
        ];
        
        const results: Record<string, any> = {};
        
        // P0-2 FIX: Buscar BDI dinâmico do projeto/empresa (em vez de hardcoded 55%)
        const companySettings = await db.getCompanySettingsOrDefault(ctx.user.id);
        const projectBdiValue = project.bdiPercentual ? parseFloat(project.bdiPercentual as string) / 100 : null;
        const companyBdiValue = parseFloat(companySettings.bdiPercentual as string) / 100 || 0.25;
        const effectiveBdiPercent = projectBdiValue ?? companyBdiValue;
        
        for (const agentType of agentTypes) {
          const executions = await db.getAgentExecutionsByProjectId(input.projectId);
          const execution = executions.find(e => e.agentType === agentType);
          if (!execution) continue;
          
          await db.updateAgentExecution(execution.id, { status: "running", startedAt: new Date() });
          
          try {
            const agentInput = await buildAgentInput(agentType, project, executions, ctx.user.id);
            (agentInput as any)._projectId = input.projectId;
            (agentInput as any)._agentExecutionId = execution.id;
            const agent = agents[agentType];
            let output = await agent.execute(agentInput);

            results[agentType] = output;


            // Verificar se o agente precisa de mais dados do usuário (interatividade)
            if (agentType === 'engenheiro_tecnico') {
              const typedOutput = output as any;
              if (typedOutput.analysisStatus === 'waiting_for_user_input' && 
                  typedOutput.missingInfoRequests?.length > 0) {
                // Pausar pipeline e aguardar input do usuário
                await db.updateAgentExecution(execution.id, {
                  status: 'waiting_for_user_input',
                  output: output as any,
                  missingInfoRequests: typedOutput.missingInfoRequests,
                });
                
                await db.updateProject(input.projectId, { status: 'waiting_for_input' });
                
                // === REGISTRAR INTERAÇÃO NO HISTÓRICO ===
                await db.createAgentInteraction({
                  projectId: input.projectId,
                  agentExecutionId: execution.id,
                  agentType: 'engenheiro_tecnico',
                  iterationNumber: 1,
                  questions: typedOutput.missingInfoRequests,
                  reasonForQuestions: 'Memorial descritivo incompleto - dados faltantes identificados na análise inicial',
                });
                
                return {
                  success: false,
                  status: 'waiting_for_user_input',
                  agentType: 'engenheiro_tecnico',
                  missingInfoRequests: typedOutput.missingInfoRequests,
                  message: 'O Engenheiro Técnico precisa de mais informações para continuar.',
                };
              }
            }
            
            // Persistir dados derivados e obter output final (pode ser substituído pelo determinístico)
            output = await persistAgentOutput(agentType, input.projectId, output, {
              bdiPercent: effectiveBdiPercent,
              executions,
              agentInput,
            });

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
        
        // === APLICAR PARCELAS SUGERIDAS PELO BOARD (v3.3) ===
        if (boardResult?.suggestedBillingSchedule?.installments?.length >= 2) {
          try {
            const { calculateDeterministicCashFlow } = await import("./services/deterministicCashFlow");
            const suggestedInstallments = boardResult.suggestedBillingSchedule.installments;
            console.log(`[Board] Aplicando cronograma de pagamento sugerido: ${suggestedInstallments.map((i: any) => `${i.name}(${i.percentage}%)`).join(' + ')}`);

            // Recalcular cash flow com novas parcelas
            const orcOutput = results.orcamentista as any;
            const logOutput = results.logistica as any;
            const comercialOutput = results.comercial as any;
            const tribOutput = results.tributario as any;
            const gestaoOutput = results.gestao_projetos as any;

            const totalCostForReCalc = (orcOutput?.totalDirectCost || 0) + (logOutput?.totalLogisticsCost || 0);
            const totalPriceForReCalc = comercialOutput?.finalPrice || 0;
            const scheduleItems = gestaoOutput?.scheduleItems || gestaoOutput?.schedule || [];
            const maxWeek = scheduleItems.length > 0 ? Math.max(...scheduleItems.map((s: any) => s.endWeek || s.week || 1)) : 4;

            const newCashFlow = calculateDeterministicCashFlow({
              totalCost: totalCostForReCalc,
              totalPrice: totalPriceForReCalc,
              totalDuration: maxWeek,
              totalTaxes: tribOutput?.totalTaxes || 0,
              billingInstallments: suggestedInstallments,
            });

            // Atualizar output do Financeiro com novo cash flow
            const finExec = (await db.getAgentExecutionsByProjectId(input.projectId)).find((e: any) => e.agentType === 'financeiro');
            if (finExec) {
              const updatedFinOutput = {
                ...(finExec.output as any),
                cashFlow: newCashFlow.cashFlow,
                maxExposure: newCashFlow.maxExposure,
                needsAdvance: newCashFlow.needsAdvance,
                suggestedAdvance: newCashFlow.suggestedAdvance,
                alerts: newCashFlow.alerts,
                grossMargin: newCashFlow.grossMargin,
                netMargin: newCashFlow.netMargin,
              };
              await db.updateAgentExecution(finExec.id, { output: updatedFinOutput as any });
              results.financeiro = updatedFinOutput;
            }

            // Salvar parcelas no projeto
            await db.updateProject(input.projectId, {
              billingInstallments: JSON.stringify(suggestedInstallments),
            } as any);

            console.log(`[Board] Cash flow recalculado. Nova exposição máx: R$${newCashFlow.maxExposure.toFixed(2)}`);
          } catch (err) {
            console.error('[Board] Erro ao aplicar parcelas sugeridas:', err);
          }
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
            
            // Resetar agentes financeiros para re-execução (inclui auditor para revalidação)
            const financialAgents: AgentType[] = ['orcamentista', 'logistica', 'tributario', 'comercial', 'gestao_projetos', 'financeiro', 'juridico', 'board', 'auditor'];
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
                (agentInput as any)._projectId = input.projectId;
                (agentInput as any)._agentExecutionId = exec.id;

                // Adicionar instruções de correção ao input
                const instruction = revisionInstructions[agentType as keyof typeof revisionInstructions];
                if (instruction) {
                  (agentInput as any).revisionInstruction = instruction;
                  (agentInput as any).isFinancialRevision = true;
                  (agentInput as any).targetMargin = 15; // Margem alvo mínima
                }

                const agent = agents[agentType];
                let output = await agent.execute(agentInput);
                
                revisedResults[agentType] = output;
                
                // Persistir dados derivados (uses shared service)
                output = await persistAgentOutput(agentType, input.projectId, output, {
                  bdiPercent: effectiveBdiPercent,
                  executions: updatedExecutions,
                  agentInput,
                });
                revisedResults[agentType] = output;

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
          // Correção 2: Verificar se Auditor rejeitou — ele é a última linha de defesa
          const auditorResult = results.auditor as any;
          if (auditorResult?.auditSeal === 'rejected') {
            await db.updateProject(input.projectId, { status: "review" });
            console.log('[Pipeline] Board aprovou mas Auditor rejeitou — status = review');
          } else {
            // Proposta APROVADA (Board + Auditor concordam)
            await db.updateProject(input.projectId, { status: "approved" });
          }

          // Correção 3: Gravar totais finais na tabela projects (fonte única de verdade)
          try {
            const finalBudgetItems = await db.getBudgetItemsByProjectId(input.projectId);
            const finalDirectCost = finalBudgetItems.reduce((sum: number, item: any) => sum + Number(item.totalCost || 0), 0);
            const finalLogistics = await db.getLogisticsCostsByProjectId(input.projectId);
            const finalLogisticsCost = finalLogistics.reduce((sum: number, c: any) => sum + Number(c.totalCost || 0), 0);
            const comercialResult = results.comercial as any;

            await db.updateProject(input.projectId, {
              totalCostDirect: String(Math.round(finalDirectCost * 100) / 100),
              totalCostIndirect: String(Math.round(finalLogisticsCost * 100) / 100),
              totalPrice: String(comercialResult?.finalPrice || 0),
            });
            console.log(`[Pipeline] Totais finais gravados: Direto R$${finalDirectCost.toFixed(2)}, Logística R$${finalLogisticsCost.toFixed(2)}, Preço R$${comercialResult?.finalPrice?.toFixed(2) || 0}`);
          } catch (err) {
            console.error('[Pipeline] Error saving final totals:', err);
          }

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

    // Aplicar correções sugeridas pelo Auditor (v3.2)
    applyAuditCorrections: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        budgetItemsToRemove: z.array(z.string()),
        logisticsToRemove: z.array(z.string()),
      }))
      .mutation(async ({ ctx, input }) => {
        // 1. Validar ownership
        const project = await db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

        let budgetRemoved = 0;
        let logisticsRemoved = 0;

        // 2. Remover budget items por matching de descrição → delete por ID
        if (input.budgetItemsToRemove.length > 0) {
          const allBudgetItems = await db.getBudgetItemsByProjectId(input.projectId);
          for (const descToRemove of input.budgetItemsToRemove) {
            const normalized = normalizeForDedup(descToRemove);
            const match = allBudgetItems.find((item: any) =>
              normalizeForDedup(item.description || '') === normalized
            );
            if (match) {
              await db.deleteBudgetItemById(match.id);
              budgetRemoved++;
              console.log(`[AuditCorrections] Removed budget item: "${match.description}" (ID: ${match.id})`);
            }
          }
        }

        // 3. Remover logistics items por matching de descrição → delete por ID
        if (input.logisticsToRemove.length > 0) {
          const allLogistics = await db.getLogisticsCostsByProjectId(input.projectId);
          for (const descToRemove of input.logisticsToRemove) {
            const normalized = normalizeForDedup(descToRemove);
            const match = allLogistics.find((item: any) =>
              normalizeForDedup(item.description || '') === normalized
            );
            if (match) {
              await db.deleteLogisticsCostById(match.id);
              logisticsRemoved++;
              console.log(`[AuditCorrections] Removed logistics cost: "${match.description}" (ID: ${match.id})`);
            }
          }
        }

        // 4. Recalcular totais deterministicamente
        const remainingBudget = await db.getBudgetItemsByProjectId(input.projectId);
        const correctedDirectCost = remainingBudget.reduce(
          (sum: number, item: any) => sum + Number(item.totalCost || 0), 0
        );
        const remainingLogistics = await db.getLogisticsCostsByProjectId(input.projectId);
        const correctedLogisticsCost = remainingLogistics.reduce(
          (sum: number, c: any) => sum + Number(c.totalCost || 0), 0
        );

        const bdiPercent = project.bdiPercentual ? parseFloat(project.bdiPercentual as string) : 25;
        const baseCost = correctedDirectCost + correctedLogisticsCost;
        const correctedFinalPrice = Math.round(baseCost * (1 + bdiPercent / 100) * 100) / 100;

        // 5. Atualizar projects table com totais corrigidos
        await db.updateProject(input.projectId, {
          totalCostDirect: String(Math.round(correctedDirectCost * 100) / 100),
          totalCostIndirect: String(Math.round(correctedLogisticsCost * 100) / 100),
          totalPrice: String(correctedFinalPrice),
        });

        // 6. Atualizar agentExecution do Orçamentista com totalDirectCost corrigido
        try {
          const executions = await db.getAgentExecutionsByProjectId(input.projectId);
          const orcExec = executions.find((e: any) => e.agentType === 'orcamentista');
          if (orcExec && orcExec.output) {
            const updatedOutput = { ...(orcExec.output as any), totalDirectCost: Math.round(correctedDirectCost * 100) / 100 };
            await db.updateAgentExecution(orcExec.id, { output: updatedOutput as any });
          }
        } catch (err) {
          console.error('[AuditCorrections] Error updating orcamentista execution:', err);
        }

        console.log(`[AuditCorrections] Applied: ${budgetRemoved} budget items removed, ${logisticsRemoved} logistics removed. New cost: R$${correctedDirectCost.toFixed(2)}, Price: R$${correctedFinalPrice.toFixed(2)}`);

        return {
          success: true,
          budgetItemsRemoved: budgetRemoved,
          logisticsRemoved,
          correctedDirectCost: Math.round(correctedDirectCost * 100) / 100,
          correctedLogisticsCost: Math.round(correctedLogisticsCost * 100) / 100,
          correctedFinalPrice,
        };
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
        
        // P1-8 FIX: Reexecutar agentes dependentes (Comercial e Financeiro) após mudança nos custos
        const dependentAgents: AgentType[] = ['comercial', 'financeiro'];
        for (const depAgent of dependentAgents) {
          const depExec = executions.find(e => e.agentType === depAgent);
          if (depExec && depExec.status === 'completed') {
            try {
              const updatedExecs = await db.getAgentExecutionsByProjectId(input.projectId);
              const depInput = await buildAgentInput(depAgent, project, updatedExecs, ctx.user.id);
              (depInput as any)._projectId = input.projectId;
              (depInput as any)._agentExecutionId = depExec.id;
              const agent = agents[depAgent];
              const depOutput = await agent.execute(depInput);
              await db.updateAgentExecution(depExec.id, {
                status: 'completed',
                output: depOutput as any,
                completedAt: new Date(),
              });
              console.log(`[P1-8] Reexecutado ${depAgent} após seleção de opcionais`);
            } catch (err) {
              console.error(`[P1-8] Erro ao reexecutar ${depAgent}:`, err);
            }
          }
        }
        
        return { 
          success: true, 
          additionalCost,
          newTotalLogisticsCost: output.totalLogisticsCost + additionalCost,
          selectedCount: selectedOptionalItems.length
        };
      }),

    // ========================================
    // INTERATIVIDADE DO AGENTE (v2.1)
    // ========================================
    
    /**
     * Continuar execução de um agente que está aguardando input do usuário.
     * Recebe as respostas do usuário e re-executa o agente com os dados complementares.
     */
    continueAgent: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        agentType: z.string()
          .transform((val) => {
            // Normalize: trim, lowercase, replace spaces/hyphens with underscores, remove accents
            return val.trim().toLowerCase()
              .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
              .replace(/[\s-]+/g, '_')
              .replace(/[^a-z0-9_]/g, '');
          })
          .refine((val) => [
            "engenheiro_tecnico", "orcamentista", "logistica", "tributario",
            "comercial", "gestao_projetos", "financeiro", "juridico", "board", "auditor"
          ].includes(val), { message: "Tipo de agente inválido" }),
        userResponses: z.record(z.string(), z.union([z.string(), z.number()]).nullable().transform(v => v ?? "")).default({}),
      }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        
        // Buscar execução do agente
        const executions = await db.getAgentExecutionsByProjectId(input.projectId);
        const execution = executions.find(e => e.agentType === input.agentType);
        
        if (!execution) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Execução do agente não encontrada" });
        }
        
        if (execution.status !== "waiting_for_user_input") {
          throw new TRPCError({ 
            code: "BAD_REQUEST", 
            message: `Agente não está aguardando input. Status atual: ${execution.status}` 
          });
        }
        
        // Mesclar respostas anteriores com as novas
        const previousResponses = (execution.userResponses as Record<string, string | number>) || {};
        const mergedResponses: Record<string, string | number> = { 
          ...previousResponses, 
          ...input.userResponses as Record<string, string | number> 
        };
        
        // Incrementar contador de iterações
        const currentIterationCount = execution.iterationCount || 1;
        const newIterationCount = currentIterationCount + 1;
        
        // === REGISTRAR RESPOSTA DO USUÁRIO NO HISTÓRICO ===
        // Buscar a interação pendente e atualizar com as respostas
        const pendingInteraction = await db.getPendingInteraction(execution.id);
        if (pendingInteraction) {
          await db.updateAgentInteraction(pendingInteraction.id, {
            responses: input.userResponses,
            respondedAt: new Date(),
          });
        }
        
        // Limite de segurança para evitar loops infinitos
        if (newIterationCount > 5) {
          // Buscar histórico completo de interações para exibir ao usuário
          const interactionHistory = await db.getAgentInteractionsByExecutionId(execution.id);
          
          // Construir resumo detalhado do histórico
          let historySummary = `\n\n=== HISTÓRICO DE INTERAÇÕES (${interactionHistory.length}) ===\n`;
          for (const interaction of interactionHistory) {
            const questions = interaction.questions as any[] || [];
            const responses = interaction.responses as Record<string, any> || {};
            
            historySummary += `\n--- Iteração ${interaction.iterationNumber} ---\n`;
            historySummary += `Motivo: ${interaction.reasonForQuestions || 'Não especificado'}\n`;
            
            historySummary += `Perguntas:\n`;
            for (const q of questions) {
              historySummary += `  • ${q.question}\n`;
            }
            
            if (Object.keys(responses).length > 0) {
              historySummary += `Respostas:\n`;
              for (const q of questions) {
                const response = responses[q.fieldId];
                if (response !== undefined) {
                  historySummary += `  • ${q.question}: ${response}${q.unit ? ` ${q.unit}` : ''}\n`;
                }
              }
            } else {
              historySummary += `Respostas: Aguardando\n`;
            }
          }
          
          // Marcar agente como falhou com histórico
          await db.updateAgentExecution(execution.id, {
            status: "failed",
            errors: {
              code: "MAX_ITERATIONS_REACHED",
              message: "Limite máximo de iterações atingido",
              interactionCount: interactionHistory.length,
              history: interactionHistory,
            },
          });
          
          throw new TRPCError({ 
            code: "BAD_REQUEST", 
            message: `Número máximo de iterações atingido (5/5). O memorial descritivo precisa de mais detalhes para que o orçamento seja gerado corretamente.${historySummary}\nPor favor, edite o memorial descritivo adicionando mais informações técnicas (medidas, especificações, quantidades) e tente novamente.`
          });
        }
        
        // Atualizar execução com status running
        await db.updateAgentExecution(execution.id, { 
          status: "running", 
          startedAt: new Date(),
          userResponses: mergedResponses,
          iterationCount: newIterationCount,
        });
        
        try {
          // Construir input com respostas do usuário
          const agentInput = await buildAgentInput(
            input.agentType as AgentType,
            project,
            executions,
            ctx.user.id,
            mergedResponses // Passar respostas do usuário
          );
          (agentInput as any)._projectId = input.projectId;
          (agentInput as any)._agentExecutionId = execution.id;

          // Executar agente
          const agent = agents[input.agentType as AgentType];
          const output = await agent.execute(agentInput);
          
          // Verificar se o agente ainda precisa de mais informações
          const typedOutput = output as any;
          if (typedOutput.analysisStatus === "waiting_for_user_input" && 
              typedOutput.missingInfoRequests?.length > 0) {
            // Agente ainda precisa de mais dados
            await db.updateAgentExecution(execution.id, {
              status: "waiting_for_user_input",
              output: output as any,
              missingInfoRequests: typedOutput.missingInfoRequests,
              userResponses: mergedResponses,
              iterationCount: newIterationCount,
            });
            
            // === REGISTRAR NOVA INTERAÇÃO NO HISTÓRICO ===
            await db.createAgentInteraction({
              projectId: input.projectId,
              agentExecutionId: execution.id,
              agentType: input.agentType as AgentType,
              iterationNumber: newIterationCount,
              questions: typedOutput.missingInfoRequests,
              reasonForQuestions: `Iteração ${newIterationCount}: Agente ainda precisa de mais dados para completar a análise`,
            });
            
            return {
              success: true,
              status: "waiting_for_user_input",
              missingInfoRequests: typedOutput.missingInfoRequests,
              iterationCount: newIterationCount,
              message: "O agente ainda precisa de mais informações para continuar."
            };
          }
          
          // Agente completou com sucesso
          await db.updateAgentExecution(execution.id, {
            status: "completed",
            output: output as any,
            completedAt: new Date(),
            missingInfoRequests: null,
          });
          
          // Atualizar projeto para próximo agente e status para processing
          await db.updateProject(input.projectId, { 
            currentAgentId: AGENT_ORDER[input.agentType as AgentType] + 1,
            status: "processing"
          });
          
          // === CONTINUAR PIPELINE AUTOMATICAMENTE ===
          // Disparar execução dos agentes restantes em background
          const continueResult = await executeRemainingAgents(
            input.projectId, 
            input.agentType as AgentType, 
            ctx.user.id
          );
          
          return {
            success: true,
            status: "completed",
            output,
            pipelineStatus: continueResult.status,
            message: "Agente completou a análise e pipeline continua automaticamente!"
          };
          
        } catch (error) {
          await db.updateAgentExecution(execution.id, {
            status: "failed",
            errors: { message: error instanceof Error ? error.message : "Unknown error" } as any,
          });
          
          throw new TRPCError({ 
            code: "INTERNAL_SERVER_ERROR", 
            message: `Falha ao continuar agente: ${error instanceof Error ? error.message : "Erro desconhecido"}` 
          });
        }
      }),

    /**
     * Obter solicitações de informação pendentes de um agente.
     */
    getMissingInfoRequests: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        agentType: z.enum(["engenheiro_tecnico", "orcamentista", "logistica", "tributario", "comercial", "gestao_projetos", "financeiro", "juridico", "board", "auditor"]).optional(),
      }))
      .query(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        
        const executions = await db.getAgentExecutionsByProjectId(input.projectId);
        
        // Se agentType especificado, retornar apenas desse agente
        if (input.agentType) {
          const execution = executions.find(e => e.agentType === input.agentType);
          if (!execution) return null;
          
          return {
            agentType: execution.agentType,
            status: execution.status,
            missingInfoRequests: execution.missingInfoRequests || [],
            userResponses: execution.userResponses || {},
            iterationCount: execution.iterationCount || 0,
          };
        }
        
        // Retornar todos os agentes aguardando input
        const waitingAgents = executions
          .filter(e => e.status === "waiting_for_user_input")
          .map(e => ({
            agentType: e.agentType,
            status: e.status,
            missingInfoRequests: e.missingInfoRequests || [],
            userResponses: e.userResponses || {},
            iterationCount: e.iterationCount || 0,
          }));
        
        return waitingAgents;
      }),

    /**
     * Obter histórico completo de interações de um projeto.
     * Retorna todas as perguntas feitas pelo agente e respostas do usuário.
     */
    getInteractionHistory: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        agentType: z.enum(["engenheiro_tecnico", "orcamentista", "logistica", "tributario", "comercial", "gestao_projetos", "financeiro", "juridico", "board", "auditor"]).optional(),
      }))
      .query(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        
        // Buscar todas as interações do projeto
        const interactions = await db.getAgentInteractionsByProjectId(input.projectId);
        
        // Filtrar por agente se especificado
        const filteredInteractions = input.agentType 
          ? interactions.filter(i => i.agentType === input.agentType)
          : interactions;
        
        return filteredInteractions.map(i => ({
          id: i.id,
          agentType: i.agentType,
          iterationNumber: i.iterationNumber,
          questions: i.questions || [],
          responses: i.responses || {},
          reasonForQuestions: i.reasonForQuestions,
          questionedAt: i.questionedAt,
          respondedAt: i.respondedAt,
          isPending: !i.respondedAt,
        }));
      }),

    /**
     * Exportar histórico de interações em formato TXT ou PDF.
     * Gera um documento formatado com todas as perguntas e respostas.
     */
    exportInteractionHistory: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        format: z.enum(["txt", "pdf"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        
        // Buscar todas as interações do projeto
        const interactions = await db.getAgentInteractionsByProjectId(input.projectId);
        
        if (interactions.length === 0) {
          throw new TRPCError({ 
            code: "NOT_FOUND", 
            message: "Não há interações registradas para este projeto" 
          });
        }
        
        // Gerar conteúdo do documento
        const agentNames: Record<string, string> = {
          engenheiro_tecnico: "Engenheiro Técnico",
          orcamentista: "Orçamentista",
          logistica: "Logística",
          tributario: "Tributário",
          comercial: "Comercial",
          gestao_projetos: "Gestão de Projetos",
          financeiro: "Financeiro",
          juridico: "Jurídico",
          board: "Board",
          auditor: "Auditor",
        };
        
        let content = `HISTÓRICO DE INTERAÇÕES\n`;
        content += `${'='.repeat(50)}\n\n`;
        content += `Projeto: ${project.name}\n`;
        content += `Data de Exportação: ${new Date().toLocaleString('pt-BR')}\n`;
        content += `Total de Interações: ${interactions.length}\n\n`;
        content += `${'='.repeat(50)}\n\n`;
        
        for (const interaction of interactions) {
          const questions = interaction.questions as any[] || [];
          const responses = interaction.responses as Record<string, any> || {};
          const agentName = agentNames[interaction.agentType] || interaction.agentType;
          
          content += `ITERAÇÃO ${interaction.iterationNumber}\n`;
          content += `${'-'.repeat(30)}\n`;
          content += `Agente: ${agentName}\n`;
          content += `Data da Pergunta: ${new Date(interaction.questionedAt).toLocaleString('pt-BR')}\n`;
          if (interaction.respondedAt) {
            content += `Data da Resposta: ${new Date(interaction.respondedAt).toLocaleString('pt-BR')}\n`;
          }
          content += `Status: ${interaction.respondedAt ? 'Respondido' : 'Aguardando Resposta'}\n`;
          
          if (interaction.reasonForQuestions) {
            content += `\nMotivo: ${interaction.reasonForQuestions}\n`;
          }
          
          content += `\nPERGUNTAS DO AGENTE:\n`;
          for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            content += `  ${i + 1}. ${q.question}`;
            if (q.unit) content += ` (${q.unit})`;
            content += `\n`;
          }
          
          if (Object.keys(responses).length > 0) {
            content += `\nRESPOSTAS DO USUÁRIO:\n`;
            for (const q of questions) {
              const response = responses[q.fieldId];
              if (response !== undefined) {
                content += `  - ${q.question}: ${response}`;
                if (q.unit) content += ` ${q.unit}`;
                content += `\n`;
              }
            }
          }
          
          content += `\n${'='.repeat(50)}\n\n`;
        }
        
        content += `\n--- FIM DO RELATÓRIO ---\n`;
        content += `Gerado por RR-Engine em ${new Date().toLocaleString('pt-BR')}\n`;
        
        if (input.format === "txt") {
          // Retornar conteúdo TXT diretamente
          return {
            content,
            filename: `historico-interacoes-${project.id}-${Date.now()}.txt`,
            mimeType: "text/plain",
          };
        } else {
          // Para PDF, usar o storage para salvar e retornar URL
          const { storagePut } = await import("./storage");
          const pdfContent = content; // Por enquanto, texto simples
          const filename = `historico-interacoes-${project.id}-${Date.now()}.txt`;
          const { url } = await storagePut(
            `exports/${ctx.user.id}/${filename}`,
            Buffer.from(pdfContent, 'utf-8'),
            'text/plain'
          );
          
          return {
            url,
            filename,
            mimeType: "text/plain",
          };
        }
      }),
  }),

  // Budget Router
  // Company Settings Router - Configurações de Impostos e BDI por Empresa
  settings: router({
    get: protectedProcedure
      .query(async ({ ctx }) => {
        return db.getCompanySettingsOrDefault(ctx.user.id);
      }),

    // Verificar se o usuário já salvou configurações personalizadas
    hasCustomSettings: protectedProcedure
      .query(async ({ ctx }) => {
        return db.hasCustomCompanySettings(ctx.user.id);
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
        billingInstallments: z.string().optional(), // JSON string de parcelas
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
    getStats: adminProcedure
      .query(async ({ ctx }) => {
        const stats = await db.getAdminStats();
        return stats;
      }),

    getUsers: adminProcedure
      .query(async ({ ctx }) => {
        const users = await db.getAdminUsers();
        return users;
      }),

    getProjects: adminProcedure
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
        
        // Get gestao output to get the correct duration from schedule
        const gestaoExec = executions.find(e => e.agentType === "gestao_projetos");
        const gestaoOutput = gestaoExec?.output;
        
        const result = await generateProposalPDF(project, budgetItems, logisticsCosts, juridicaOutput, comercialOutput, companySettings, gestaoOutput);
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

// === FUNÇÃO PARA CONTINUAR PIPELINE APÓS INTERATIVIDADE ===
// Executa os agentes restantes após um agente completar via continueAgent
async function executeRemainingAgents(
  projectId: number,
  completedAgentType: AgentType,
  userId: number
): Promise<{ status: string; completedAgents: string[]; error?: string }> {
  const agentTypes: AgentType[] = [
    "engenheiro_tecnico", "orcamentista", "logistica", "tributario",
    "comercial", "gestao_projetos", "financeiro", "juridico", "board", "auditor"
  ];
  
  const completedAgentOrder = AGENT_ORDER[completedAgentType];
  const remainingAgents = agentTypes.filter(t => AGENT_ORDER[t] > completedAgentOrder);
  
  console.log(`[Pipeline] Continuando após ${completedAgentType}. Agentes restantes: ${remainingAgents.join(', ')}`);
  
  const project = await db.getProjectById(projectId);
  if (!project) {
    return { status: "error", completedAgents: [], error: "Projeto não encontrado" };
  }
  
  const completedAgents: string[] = [];
  
  // P0-2 FIX: Buscar BDI dinâmico do projeto/empresa
  const pipelineCompanySettings = await db.getCompanySettingsOrDefault(userId);
  const pipelineBdiValue = project.bdiPercentual ? parseFloat(project.bdiPercentual as string) / 100 : (parseFloat(pipelineCompanySettings.bdiPercentual as string) / 100 || 0.25);
  
  for (const agentType of remainingAgents) {
    const executions = await db.getAgentExecutionsByProjectId(projectId);
    const execution = executions.find(e => e.agentType === agentType);
    if (!execution) continue;
    
    await db.updateAgentExecution(execution.id, { status: "running", startedAt: new Date() });
    
    try {
      const agentInput = await buildAgentInput(agentType, project, executions, userId);
      (agentInput as any)._projectId = projectId;
      (agentInput as any)._agentExecutionId = execution.id;
      const agent = agents[agentType];
      let output = await agent.execute(agentInput);

      // Persistir dados derivados (uses shared service)
      output = await persistAgentOutput(agentType, projectId, output, {
        bdiPercent: pipelineBdiValue,
        executions,
        agentInput,
      });

      await db.updateAgentExecution(execution.id, {
        status: "completed",
        output: output as any,
        completedAt: new Date(),
      });
      
      await db.updateProject(projectId, { currentAgentId: AGENT_ORDER[agentType] + 1 });
      completedAgents.push(agentType);
      
      console.log(`[Pipeline] Agente ${agentType} completou com sucesso`);
      
    } catch (error) {
      console.error(`[Pipeline] Erro no agente ${agentType}:`, error);
      await db.updateAgentExecution(execution.id, {
        status: "failed",
        errors: { message: error instanceof Error ? error.message : "Unknown error" } as any,
      });
      await db.updateProject(projectId, { status: "review" });
      return { status: "error", completedAgents, error: `Falha no agente ${agentType}` };
    }
  }
  
  // Verificar resultado do Board para definir status final
  const finalExecutions = await db.getAgentExecutionsByProjectId(projectId);
  const boardExec = finalExecutions.find(e => e.agentType === 'board');
  const boardOutput = boardExec?.output as any;
  
  if (boardOutput?.blockProposal) {
    await db.updateProject(projectId, { status: "blocked" });
  } else {
    await db.updateProject(projectId, { status: "approved" });
  }
  
  console.log(`[Pipeline] Pipeline completo. ${completedAgents.length} agentes executados.`);
  return { status: "completed", completedAgents };
}

// Helper function to build agent input based on previous outputs
// userResponses: Respostas do usuário para interatividade (v2.1)
async function buildAgentInput(
  agentType: AgentType, 
  project: any, 
  executions: any[], 
  userId: number,
  userResponses?: Record<string, string | number>
): Promise<any> {
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
        // Respostas do usuário para interatividade (v2.1)
        userResponses: userResponses || {},
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
        // estimatedDuration removido (v2.11) - Agente Gestão calcula prazo real, Logística estima por quantitativos
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
      
      // ✅ VALIDAÇÃO #1: Orçamentista deve retornar custo direto válido
      if (!orcOutput || !orcOutput.totalDirectCost || orcOutput.totalDirectCost <= 0) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Orçamentista retornou custo direto inválido: ${orcOutput?.totalDirectCost}. Verifique se os itens foram precificados corretamente.`
        });
      }
      
      // ✅ VALIDAÇÃO #2: Logística deve retornar custo válido (pode ser zero em casos específicos)
      if (!logOutput || logOutput.totalLogisticsCost === undefined || logOutput.totalLogisticsCost < 0) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Logística retornou custo inválido: ${logOutput?.totalLogisticsCost}. Verifique o agente de logística.`
        });
      }
      
      // ✅ VALIDAÇÃO #3: Tributário deve retornar impostos válidos (pode ser zero em regimes especiais)
      if (!tribOutput || tribOutput.totalTaxes === undefined || tribOutput.totalTaxes < 0) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Tributário retornou impostos inválidos: ${tribOutput?.totalTaxes}. Verifique o agente tributário.`
        });
      }
      
      // IMPORTANTE: totalIndirectCost vem da Logística, não do Orçamentista
      const totalIndirectFromLogistics = logOutput.totalLogisticsCost;
      
      // ✅ LOG DE AUDITORIA: Registrar valores para rastreabilidade
      console.log(`[Comercial] Custo Direto: R$ ${orcOutput.totalDirectCost.toFixed(2)}`);
      console.log(`[Comercial] Custo Logística: R$ ${totalIndirectFromLogistics.toFixed(2)}`);
      console.log(`[Comercial] Impostos: R$ ${tribOutput.totalTaxes.toFixed(2)}`);
      
      // BDI: Prioridade é o BDI do projeto, depois o da empresa
      const projectBdi = project.bdiPercentual ? parseFloat(project.bdiPercentual as string) : null;
      const companyBdi = parseFloat(companySettings.bdiPercentual as string) || 25.0;
      const effectiveBdi = projectBdi ?? companyBdi;
      
      return {
        budgetItems: orcOutput.budgetItems || [],
        totalDirectCost: orcOutput.totalDirectCost || 0,
        totalIndirectCost: totalIndirectFromLogistics,
        totalTaxes: tribOutput.totalTaxes || 0,
        contractType: project.contractType,
        logisticsComplexity: logOutput.totalLogisticsCost > 50000 ? "high" : logOutput.totalLogisticsCost > 20000 ? "medium" : "low",
        fiscalRisk: tribOutput.alerts?.length > 2 ? "high" : tribOutput.alerts?.length > 0 ? "medium" : "low",
        // BDI efetivo do projeto (prioridade: projeto > empresa)
        projectBdi: effectiveBdi,
        bdiPreset: project.bdiPreset || "padrao",
        // Configurações de BDI e lucro da empresa (para referência)
        companyBdiSettings: {
          bdiPercentual: companyBdi,
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
      const orcamentistaOutputFin = getOutput("orcamentista");
      const logisticaOutputFin = getOutput("logistica");
      // P2-11 FIX: Usar parcelas dinâmicas do Comercial quando disponíveis
      const dynamicPaymentTerms = comercialOutput.paymentTerms || comercialOutput.paymentConditions || "30/60/90 dias após medição";
      
      // v2.10: Cálculo determinístico de custo total e fluxo de caixa
      const directCost = Number(orcamentistaOutputFin.totalDirectCost) || 0;
      const logisticsCostFin = Number(logisticaOutputFin.totalLogisticsCost ?? logisticaOutputFin.totalCost) || 0;
      const totalCostFin = directCost + logisticsCostFin;
      const totalPriceFin = Number(comercialOutput.finalPrice) || 0;
      
      // Calcular duração total em semanas
      const scheduleItemsFin = gestaoOutput.scheduleItems || [];
      const totalDurationFin = scheduleItemsFin.length > 0
        ? Math.max(...scheduleItemsFin.map((s: any) => {
            const endDay = s.endDay || s.endWeek || 4;
            return endDay > 52 ? Math.ceil(endDay / 7) : endDay;
          }))
        : 4;
      
      // Distribuir custos uniformemente por semana
      const weeklyExpenseFin = totalCostFin / totalDurationFin;
      
      // Receitas: 40% semana 1, 60% última semana
      const adiantamentoFin = totalPriceFin * 0.40;
      const saldoFinalFin = totalPriceFin * 0.60;
      
      // Calcular fluxo de caixa semanal determinístico
      const deterministicCashFlow: Array<{week: number, expense: number, income: number, balance: number}> = [];
      let cumulativeBalanceFin = 0;
      
      for (let week = 1; week <= totalDurationFin; week++) {
        const expense = Math.round(weeklyExpenseFin * 100) / 100;
        const income = week === 1 ? adiantamentoFin : (week === totalDurationFin ? saldoFinalFin : 0);
        cumulativeBalanceFin += income - expense;
        deterministicCashFlow.push({
          week,
          expense: Math.round(expense * 100) / 100,
          income: Math.round(income * 100) / 100,
          balance: Math.round(cumulativeBalanceFin * 100) / 100,
        });
      }
      
      console.log(`[Financeiro] Cálculo determinístico: Custo R$ ${totalCostFin.toFixed(2)}, Venda R$ ${totalPriceFin.toFixed(2)}, Duração ${totalDurationFin} semanas`);
      
      return {
        scheduleItems: scheduleItemsFin,
        budgetItems: orcamentistaOutputFin.budgetItems || [],
        totalPrice: totalPriceFin,
        totalCost: totalCostFin,
        paymentTerms: dynamicPaymentTerms,
        cashFlow: deterministicCashFlow,
      };
      
    case "juridico":
      const finOutput = getOutput("financeiro");
      const gestOutput = getOutput("gestao_projetos");
      const comOutput = getOutput("comercial");
      // P2-11 FIX: Usar parcelas dinâmicas do Comercial quando disponíveis
      const juridPaymentTerms = comOutput.paymentTerms || comOutput.paymentConditions || "30/60/90 dias após medição";
      return {
        projectName: project.name,
        contractType: project.contractType,
        totalPrice: comOutput.finalPrice || 0,
        paymentTerms: juridPaymentTerms,
        // CORRIGIDO: Usar totalDays do Gestão (em dias, não semanas)
        durationDays: gestOutput.totalDays || 30,
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
      
    case "auditor":
      // Auditor recebe todos os outputs para validação cruzada
      const projectBdiAuditor = project.bdiPercentual ? parseFloat(project.bdiPercentual as string) : 25;
      // P2-12 FIX: Usar BDI ajustado do Comercial (prioridade) em vez de apenas project.bdi
      const comercialOutputForAudit = getOutput("comercial");
      const adjustedBdiFromComercial = comercialOutputForAudit.adjustedBdi 
        ? (Number(comercialOutputForAudit.adjustedBdi) > 1 
            ? Number(comercialOutputForAudit.adjustedBdi) 
            : Number(comercialOutputForAudit.adjustedBdi) * 100)
        : null;
      const effectiveBdiForAudit = adjustedBdiFromComercial ?? projectBdiAuditor;
      // Verificar se o usuário já salvou configurações personalizadas
      const hasCustomSettings = await db.hasCustomCompanySettings(userId);
      return {
        allAgentOutputs: {
          engenheiro: getOutput("engenheiro_tecnico"),
          logistica: getOutput("logistica"),
          orcamentista: getOutput("orcamentista"),
          tributario: getOutput("tributario"),
          comercial: comercialOutputForAudit,
          gestao: getOutput("gestao_projetos"),
          financeiro: getOutput("financeiro"),
          juridico: getOutput("juridico"),
          board: getOutput("board"),
        },
        projectConfig: {
          name: project.name,
          bdiPercentual: effectiveBdiForAudit,
          bdiSource: adjustedBdiFromComercial ? 'comercial' : 'projeto',
          contractType: project.contractType,
        },
        hasCustomSettings,
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
  // P1-6 FIX: Aceitar ambos os nomes de campo (totalLogisticsCost ou totalCost)
  const totalLogisticsCost = Number(logistica.totalLogisticsCost ?? logistica.totalCost) || 0;
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
  // Filtrar itens PAI (isSummaryItem=true) para evitar duplicação na soma
  const budgetItems = orcamentista.budgetItems || [];
  const pricingItems = filterItemsForPricing(budgetItems);
  const sumBudgetItems = pricingItems.reduce((sum: number, item: any) => {
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
