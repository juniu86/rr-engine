-- Adiciona status 'cancelled' aos enums projects.status e agent_executions.status.
-- Permite ao usuário interromper a execução de um orçamento em andamento.
--
-- MySQL não tem ALTER TYPE — precisa fazer ALTER TABLE MODIFY na coluna inteira
-- com a nova lista de valores. Os dados existentes não são afetados.

ALTER TABLE `projects` MODIFY COLUMN `status` enum(
  'draft',
  'processing',
  'review',
  'approved',
  'rejected',
  'blocked',
  'pending_confirmation',
  'waiting_for_input',
  'cancelled'
) NOT NULL DEFAULT 'draft';

ALTER TABLE `agent_executions` MODIFY COLUMN `status` enum(
  'pending',
  'running',
  'completed',
  'failed',
  'needs_review',
  'waiting_for_user_input',
  'cancelled'
) NOT NULL DEFAULT 'pending';
