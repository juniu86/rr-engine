-- BDI NBR 12721: adiciona componentes Seguros e Garantias e override da
-- alíquota I em company_settings.
--
-- Fórmula: BDI = ((1 + AC + S + R + G) × (1 + DF) × (1 + L)) / (1 − I) − 1
-- Sem Seguros (S) e Garantias (G), o cálculo divergia do padrão setorial.

ALTER TABLE `company_settings`
  ADD COLUMN `seguroPercentual` DECIMAL(6, 2) NOT NULL DEFAULT 0.80,
  ADD COLUMN `garantiaPercentual` DECIMAL(6, 2) NOT NULL DEFAULT 0.40,
  ADD COLUMN `aliquotaTributosOverride` DECIMAL(6, 2) NULL;
