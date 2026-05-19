-- Proposta: tabelas para o app proposta.rres.com.br persistir propostas
-- geradas pelo time interno da RR.
--
-- Decisão (12/05/2026, founder):
--   * Pool global — sem userId. Todo vendedor RR vê todas as propostas.
--   * Seq inicial = 69; próxima alocação retorna 70.
--   * Formato exibido pelo frontend: RR-070/2026 (zero-pad 3 dígitos).
--   * Auth via Clerk (mesmo do engine.rres.com.br).
--
-- O endpoint /proposta/seq/:year/consume incrementa atomicamente com
-- SELECT ... FOR UPDATE dentro de transação, então `value` armazena
-- o ÚLTIMO número consumido (não o próximo). Logo default 69 → +1 = 70.

CREATE TABLE IF NOT EXISTS `proposals` (
  `id`               VARCHAR(36)   NOT NULL,
  `numero`           VARCHAR(100)  NOT NULL,
  `cliente_nome`     VARCHAR(255)  NOT NULL,
  `total`            DECIMAL(15, 2) NOT NULL DEFAULT 0,
  `created_at`       DATETIME      NOT NULL,
  `updated_at`       DATETIME      NOT NULL,
  `data`             JSON          NOT NULL,
  `show_line_prices` TINYINT(1)    NOT NULL DEFAULT 1,
  `status`           VARCHAR(30)   NOT NULL DEFAULT 'rascunho',
  `motivo_perda`     TEXT          NULL,
  `revisao`          INT           NULL,
  `parent_id`        VARCHAR(36)   NULL,
  PRIMARY KEY (`id`),
  KEY `idx_proposals_status` (`status`),
  KEY `idx_proposals_created_at` (`created_at`),
  KEY `idx_proposals_parent_id` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `seq_counters` (
  `year`  INT NOT NULL,
  `value` INT NOT NULL,
  PRIMARY KEY (`year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Inicializa o contador de 2026 começando do 69 (próxima = 70).
-- Em outros anos o /consume vai inserir on-the-fly com value=1 antes
-- de incrementar (resultando em 1 alocado), comportamento padrão de
-- ano novo. Reginaldo pode pré-popular 2027+ se quiser começar diferente.
INSERT INTO `seq_counters` (`year`, `value`) VALUES (2026, 69)
  ON DUPLICATE KEY UPDATE `value` = `value`;
