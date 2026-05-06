import { storagePut } from "../storage";
import { createGeneratedDocument } from "../db";
import type { Project, BudgetItem } from "../../drizzle/schema";
import * as XLSX from "xlsx";
import {
  decomposeUnitCosts,
  type DecomposedItem,
} from "./xlsx/itemDecomposition";
import { splitBudgetAndLogistics } from "./xlsx/budgetLogisticsSplit";

/** Escape HTML special characters to prevent XSS in generated documents */
function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Interface para item com preço proporcional (sem mostrar custo aberto)
interface ProportionalItem {
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number; // Preço unitário de venda (não custo)
  totalPrice: number; // Preço total de venda
}

// Calcular preços proporcionais para proposta (esconde custos, mostra apenas preços de venda)
// O preço de venda total é distribuído proporcionalmente entre os itens com base no custo de cada um
// A logística é embutida proporcionalmente em cada item
function calculateProportionalPrices(
  budgetItems: BudgetItem[], 
  totalSalePrice: number,
  totalBaseCost: number // Custo base total (direto + logística) - usado apenas para validação
): ProportionalItem[] {
  // Calcular custo direto total de todos os itens
  const totalDirectCost = budgetItems.reduce((sum, item) => {
    return sum + (Number(item.quantity || 0) * Number(item.unitCostTotal || 0));
  }, 0);
  
  if (totalDirectCost === 0) return [];
  
  // O markup é calculado sobre o custo DIRETO para distribuir o preço de venda total
  // Isso garante que a soma dos preços dos itens = totalSalePrice
  // A logística e BDI são embutidos proporcionalmente em cada item
  const markupFactor = totalSalePrice / totalDirectCost;
  
  return budgetItems.map(item => {
    const quantity = Number(item.quantity || 0);
    const unitCost = Number(item.unitCostTotal || 0);
    
    // Preço unitário de venda = custo unitário * fator de markup
    // O fator de markup já inclui logística + BDI distribuídos proporcionalmente
    const unitPrice = unitCost * markupFactor;
    const totalPrice = quantity * unitPrice;
    
    return {
      description: item.description,
      unit: item.unit || "un",
      quantity,
      unitPrice,
      totalPrice,
    };
  });
}

// Interface para configurações da empresa
interface CompanySettings {
  companyName?: string | null;
  cnpj?: string | null;
  priceRegion?: string | null;
  bdiPercentual?: string | null;
  lucroPercentual?: string | null;
  taxaLeisSociais?: string | null;
}

// Generate proposal PDF content with proportional prices (hiding costs)
export async function generateProposalPDF(
  project: Project,
  budgetItems: BudgetItem[],
  logisticsCosts: any[],
  juridicaOutput: any,
  comercialOutput?: any,
  companySettings?: CompanySettings,
  gestaoOutput?: any
): Promise<{ url: string; fileKey: string }> {
  // Calcular custo direto total (materiais + mão de obra)
  const totalDirectCost = budgetItems.reduce((sum, item) => {
    return sum + (Number(item.quantity || 0) * Number(item.unitCostTotal || 0));
  }, 0);
  
  // Calcular custo logístico total
  const totalLogisticsCost = logisticsCosts.reduce((sum, item) => sum + Number(item.totalCost || 0), 0);
  
  // Custo base total (direto + logística)
  const totalBaseCost = totalDirectCost + totalLogisticsCost;
  
  // Calcular preço de venda já salvo nos items (com BDI configurado)
  const totalFromItems = budgetItems.reduce((sum, item) => sum + Number(item.finalPrice || 0), 0);
  
  // Preço do agente comercial
  const comercialPrice = comercialOutput?.finalPrice || 0;
  
  // BDI do agente comercial (se disponível) ou BDI configurado pela empresa
  const bdiConfigurado = companySettings?.bdiPercentual ? parseFloat(companySettings.bdiPercentual) / 100 : 0.25;
  const comercialBdi = comercialOutput?.adjustedBdi || bdiConfigurado;
  
  console.log('[Proposta] Debug de valores:');
  console.log(`  - Custo base total: R$ ${totalBaseCost.toFixed(2)}`);
  console.log(`  - Preço dos items: R$ ${totalFromItems.toFixed(2)}`);
  console.log(`  - Preço do agente comercial: R$ ${comercialPrice.toFixed(2)}`);
  console.log(`  - BDI configurado pela empresa: ${(bdiConfigurado * 100).toFixed(1)}%`);
  console.log(`  - BDI do agente comercial: ${(comercialBdi * 100).toFixed(1)}%`);
  console.log(`  - Empresa: ${companySettings?.companyName || 'Não configurada'}`);
  
  // DETERMINAR O PREÇO DE VENDA CORRETO
  // Prioridade:
  // 1. Preço do agente comercial (se válido e dentro do range esperado)
  // 2. Preço dos items salvos (já com BDI de 55%)
  // 3. Recalcular com BDI padrão de 55%
  
  // P0-1 FIX: Usar BDI dinâmico (configurado pela empresa) em vez de hardcoded 30%/100%
  let totalSalePrice: number;
  const minExpectedPrice = totalBaseCost * (1 + bdiConfigurado); // BDI mínimo = BDI configurado
  const maxExpectedPrice = totalBaseCost * (1 + bdiConfigurado * 3); // Máximo = 3x o BDI configurado
  
  if (comercialPrice > 0 && comercialPrice >= minExpectedPrice && comercialPrice <= maxExpectedPrice) {
    // Preço comercial está dentro do range esperado - PRIORIDADE MÁXIMA
    totalSalePrice = comercialPrice;
    console.log(`  - Usando preço comercial (dentro do range): R$ ${totalSalePrice.toFixed(2)}`);
  } else if (comercialPrice > 0 && comercialPrice > maxExpectedPrice) {
    // Preço comercial muito alto (possível duplicação) - recalcular com BDI configurado
    totalSalePrice = totalBaseCost * (1 + bdiConfigurado);
    console.log(`  - ALERTA: Preço comercial muito alto (R$ ${comercialPrice.toFixed(2)}), recalculando com BDI ${(bdiConfigurado * 100).toFixed(1)}%: R$ ${totalSalePrice.toFixed(2)}`);
  } else if (comercialPrice > 0 && comercialPrice < minExpectedPrice) {
    // Preço comercial abaixo do BDI configurado - usar o preço comercial mesmo assim
    // O agente Comercial pode ter razões válidas para precificar abaixo (competitividade)
    totalSalePrice = comercialPrice;
    console.log(`  - AVISO: Preço comercial abaixo do BDI configurado (R$ ${comercialPrice.toFixed(2)} < R$ ${minExpectedPrice.toFixed(2)}), usando preço comercial mesmo assim`);
  } else if (totalFromItems > 0) {
    // Sem preço comercial válido - usar preço dos items
    totalSalePrice = totalFromItems;
    console.log(`  - Usando preço dos items: R$ ${totalSalePrice.toFixed(2)}`);
  } else {
    // Fallback: recalcular com BDI configurado
    totalSalePrice = totalBaseCost * (1 + bdiConfigurado);
    console.log(`  - Usando fallback (BDI ${(bdiConfigurado * 100).toFixed(1)}%): R$ ${totalSalePrice.toFixed(2)}`);
  }
  
  // Calculate proportional prices (hides cost breakdown)
  // Passa o totalBaseCost para que a distribuição proporcional inclua logística
  const proportionalItems = calculateProportionalPrices(budgetItems, totalSalePrice, totalBaseCost);
  
  // Generate HTML content for the proposal
  const htmlContent = generateProposalHTML(project, proportionalItems, totalSalePrice, juridicaOutput, companySettings, gestaoOutput);
  
  // Convert to PDF bytes
  const pdfBuffer = Buffer.from(htmlContent, "utf-8");
  
  const timestamp = Date.now();
  const fileName = `proposta_${project.name.replace(/\s+/g, "_")}_${timestamp}.html`;
  const fileKey = `proposals/${project.id}/${fileName}`;
  
  const { url } = await storagePut(fileKey, pdfBuffer, "text/html");
  
  // Save document reference
  await createGeneratedDocument({
    projectId: project.id,
    documentType: "proposta_comercial",
    fileName,
    fileUrl: url,
    fileKey,
    version: 1,
  });
  
  return { url, fileKey };
}

// Generate calculation memory Excel content (XLSX format)
export async function generateMemoriaCalculo(
  project: Project,
  budgetItems: BudgetItem[],
  logisticsCosts: any[],
  cashFlowItems: any[],
  comercialOutput?: any
): Promise<{ url: string; fileKey: string }> {
  // Generate real XLSX using SheetJS library
  const xlsxBuffer = generateMemoriaXLSX(project, budgetItems, logisticsCosts, cashFlowItems, comercialOutput);
  
  const timestamp = Date.now();
  const fileName = `memoria_calculo_${project.name.replace(/\s+/g, "_")}_${timestamp}.xlsx`;
  const fileKey = `memorias/${project.id}/${fileName}`;
  
  const { url } = await storagePut(fileKey, xlsxBuffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  
  // Save document reference
  await createGeneratedDocument({
    projectId: project.id,
    documentType: "memoria_calculo",
    fileName,
    fileUrl: url,
    fileKey,
    version: 1,
  });
  
  return { url, fileKey };
}

// Generate HTML content for proposal with proportional prices
function generateProposalHTML(
  project: Project, 
  items: ProportionalItem[], 
  totalSalePrice: number,
  juridicaOutput: any,
  companySettings?: CompanySettings,
  gestaoOutput?: any
): string {
  const companyName = companySettings?.companyName || 'RR Engenharia';
  const companyCnpj = companySettings?.cnpj || '';
  
  // Calcular prazo correto a partir do cronograma (em dias úteis)
  const totalDays = gestaoOutput?.totalDays || gestaoOutput?.totalDuration * 5 || 0;
  const totalWeeks = totalDays > 0 ? Math.ceil(totalDays / 5) : null;
  const prazoExecucao = totalWeeks ? `${totalWeeks} semanas (${totalDays} dias úteis)` : (project.estimatedDuration ? `${project.estimatedDuration} semanas` : "A definir");
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proposta Comercial - ${project.name}</title>
  <style>
    @media print {
      body { margin: 0; padding: 20px; }
      .no-print { display: none; }
    }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
      background: #fff;
    }
    .header {
      text-align: center;
      border-bottom: 3px solid #d97706;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 {
      color: #1e293b;
      margin-bottom: 5px;
      font-size: 28px;
    }
    .header .subtitle {
      color: #64748b;
      font-size: 14px;
    }
    .header .logo {
      font-size: 24px;
      font-weight: bold;
      color: #d97706;
      margin-bottom: 10px;
    }
    .section {
      margin-bottom: 30px;
    }
    .section h2 {
      color: #d97706;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 10px;
      font-size: 18px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 14px;
    }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 10px;
      text-align: left;
    }
    th {
      background-color: #f8fafc;
      font-weight: 600;
    }
    .total-row {
      background-color: #fef3c7;
      font-weight: bold;
    }
    .price {
      text-align: right;
      font-family: 'Courier New', monospace;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      font-size: 12px;
      color: #64748b;
    }
    .clause {
      background-color: #f8fafc;
      padding: 15px;
      border-radius: 8px;
      margin: 10px 0;
      border-left: 4px solid #d97706;
    }
    .clause h4 {
      margin-top: 0;
      color: #1e293b;
      font-size: 14px;
    }
    .clause p {
      margin-bottom: 0;
      font-size: 13px;
    }
    .download-btn {
      background: #d97706;
      color: white;
      padding: 10px 20px;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-size: 14px;
      margin: 10px 5px;
    }
    .download-btn:hover {
      background: #b45309;
    }
  </style>
</head>
<body>
  <div class="no-print" style="text-align: center; margin-bottom: 20px;">
    <button class="download-btn" onclick="window.print()">Imprimir / Salvar PDF</button>
  </div>

  <div class="header">
    <div class="logo">${escapeHtml(companyName).toUpperCase()}</div>
    <h1>PROPOSTA COMERCIAL</h1>
    <p class="subtitle">Soluções em Construção Civil e Infraestrutura</p>
    ${companyCnpj ? `<p class="subtitle">CNPJ: ${escapeHtml(companyCnpj)}</p>` : ''}
  </div>

  <div class="section">
    <h2>1. IDENTIFICAÇÃO DO PROJETO</h2>
    <table>
      <tr>
        <th style="width: 30%;">Projeto</th>
        <td>${escapeHtml(project.name)}</td>
      </tr>
      <tr>
        <th>Tipo de Contrato</th>
        <td>${project.contractType === "obra" ? "Execução de Obra" : "Serviço de Manutenção"}</td>
      </tr>
      <tr>
        <th>Localização</th>
        <td>${escapeHtml(project.location) || "A definir em contrato"}</td>
      </tr>
      <tr>
        <th>Prazo de Execução</th>
        <td>${prazoExecucao}</td>
      </tr>
    </table>
  </div>

  <div class="section">
    <h2>2. ESCOPO DOS SERVIÇOS</h2>
    <p>${escapeHtml(project.description) || "Conforme memorial descritivo anexo à presente proposta."}</p>
  </div>

  <div class="section">
    <h2>3. PLANILHA DE PREÇOS</h2>
    <table>
      <thead>
        <tr>
          <th style="width: 5%;">Item</th>
          <th style="width: 45%;">Descrição do Serviço</th>
          <th style="width: 10%;">Unid.</th>
          <th style="width: 10%;">Qtd.</th>
          <th style="width: 15%;" class="price">Preço Unit.</th>
          <th style="width: 15%;" class="price">Total</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.description)}</td>
          <td>${item.unit}</td>
          <td style="text-align: center;">${item.quantity.toFixed(2)}</td>
          <td class="price">R$ ${item.unitPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td class="price">R$ ${item.totalPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>
        `).join("")}
        <tr class="total-row">
          <td colspan="5" style="text-align: right;">VALOR TOTAL DA PROPOSTA</td>
          <td class="price">R$ ${totalSalePrice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
        </tr>
      </tbody>
    </table>
  </div>

  ${juridicaOutput?.clauses ? `
  <div class="section">
    <h2>4. CONDIÇÕES GERAIS</h2>
    ${juridicaOutput.clauses.map((clause: any, index: number) => `
    <div class="clause">
      <h4>CLÁUSULA ${toRoman(index + 1)}: ${clause.title.toUpperCase()}</h4>
      <p>${clause.content}</p>
    </div>
    `).join("")}
  </div>
  ` : ""}

  <div class="section">
    <h2>5. VALIDADE DA PROPOSTA</h2>
    <p>Esta proposta tem validade de <strong>${juridicaOutput?.validityDays || 30} dias</strong> a partir da data de emissão.</p>
    <p>Após este prazo, os valores poderão ser reajustados conforme variação de custos de mercado.</p>
  </div>

  <div class="section">
    <h2>6. ACEITE</h2>
    <p>Para aceite desta proposta, favor devolver este documento assinado ou enviar confirmação por escrito.</p>
    <br>
    <table style="border: none;">
      <tr style="border: none;">
        <td style="border: none; width: 50%; text-align: center;">
          <br><br><br>
          _________________________________<br>
          <strong>RR Engenharia</strong><br>
          Contratada
        </td>
        <td style="border: none; width: 50%; text-align: center;">
          <br><br><br>
          _________________________________<br>
          <strong>Cliente</strong><br>
          Contratante
        </td>
      </tr>
    </table>
  </div>

  <div class="footer">
    <p><strong>RR Engenharia</strong></p>
    <p>CNPJ: XX.XXX.XXX/0001-XX | Telefone: (XX) XXXX-XXXX</p>
    <p>Documento gerado pelo sistema RR-Engine em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}</p>
  </div>
</body>
</html>
  `;
}

// Convert number to Roman numeral
function toRoman(num: number): string {
  const romanNumerals: [number, string][] = [
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]
  ];
  let result = "";
  for (const [value, symbol] of romanNumerals) {
    while (num >= value) {
      result += symbol;
      num -= value;
    }
  }
  return result;
}

/** P2 XLSX refactor — round to 2 decimals (avoid IEEE 754 noise). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * P2 XLSX refactor — anota na coluna "Premissa" como o templater
 * decompôs Mat/MO/Log, para auditoria de procurement entender de
 * onde vem cada valor.
 */
function decompositionPremise(d: DecomposedItem): string {
  switch (d.source) {
    case "decomposed":
      return "";
    case "reconciled":
      return "Componentes reconciliados (delta absorvido em Logística)";
    case "synthesized-mat-mo":
      return "Componentes sintetizados (60% material / 40% M.O.)";
    case "synthesized-mat-mo-log":
      return "Componentes sintetizados (30% material / 30% M.O. / 40% logística)";
  }
}

// Generate real XLSX format using SheetJS library
function generateMemoriaXLSX(
  project: Project,
  budgetItems: BudgetItem[],
  logisticsCosts: any[],
  cashFlowItems: any[],
  comercialOutput?: any
): Buffer {
  // P2 XLSX refactor (P0.2 + P1.2 + P2.4) — separa itens logísticos do
  // orçamento detalhado. Itens de budgetItems que sobrepõem com
  // logisticsCosts (Jaccard ≥ 0.7) ou que têm cara de logística
  // (frete, caçamba, container, taxa horário, etc) são movidos pra
  // aba dedicada. Sem isso, a aba "Custos Logísticos" saía vazia e os
  // mesmos itens apareciam no Orçamento Detalhado — procurement não
  // conseguia renegociar por categoria.
  const split = splitBudgetAndLogistics(budgetItems, logisticsCosts);
  const cleanBudgetItems = split.cleanBudgetItems as typeof budgetItems;
  const consolidatedLogistics = split.consolidatedLogistics;
  if (split.stats.movedFromBudget > 0 || split.stats.duplicatesRemoved > 0) {
    console.log(
      `[Memória de Cálculo] Logística: ${split.stats.movedFromBudget} item(ns) movido(s) do orçamento, ` +
        `${split.stats.duplicatesRemoved} duplicata(s) removida(s) (${split.stats.originalLogisticsCount} → ${consolidatedLogistics.length})`
    );
  }

  // Calculate totals (após o split — totais refletem as listas corretas)
  const totalDirect = cleanBudgetItems.reduce(
    (sum, item) => sum + Number(item.totalCost || 0),
    0
  );
  const totalTax = cleanBudgetItems.reduce(
    (sum, item) => sum + Number(item.taxAmount || 0),
    0
  );
  const totalLogistics = consolidatedLogistics.reduce(
    (sum, cost) => sum + Number(cost.totalCost || 0),
    0
  );
  
  // CORREÇÃO CRÍTICA: Usar o preço final do agente Comercial como fonte única de verdade
  const custoBase = totalDirect + totalLogistics;
  const comercialFinalPrice = comercialOutput?.finalPrice || 0;
  const comercialBdi = comercialOutput?.adjustedBdi || 0.30;
  
  let totalFinal: number;
  let totalBdi: number;
  
  if (comercialFinalPrice > 0 && comercialFinalPrice >= custoBase) {
    totalFinal = comercialFinalPrice;
    totalBdi = totalFinal - custoBase;
  } else {
    totalBdi = custoBase * comercialBdi;
    totalFinal = custoBase + totalBdi;
  }
  
  // P2 XLSX refactor — markup que dilui BDI nos preços unitários.
  // Cada Mat/MO/Log unitário sai com BDI embutido; Custo Total da linha
  // = Qtd × (Mat + MO + Log) com fórmula nativa Excel. Procurement
  // consegue auditar célula a célula sem recalcular fora da planilha.
  const baseCost = totalDirect + totalLogistics;
  const markupFactor = baseCost > 0 ? totalFinal / baseCost : 1;

  // P2 XLSX refactor — normaliza decomposição por item antes de escrever.
  // decomposeUnitCosts garante mat+mo+log == totalUnit (caso "reconciled")
  // ou sintetiza split quando vieram zerados (caso "synthesized-*").
  const decomposed: Array<{
    item: BudgetItem;
    decomp: DecomposedItem;
    matUnitWithBdi: number;
    moUnitWithBdi: number;
    logUnitWithBdi: number;
    totalUnitWithBdi: number;
  }> = cleanBudgetItems.map(item => {
    const decomp = decomposeUnitCosts(item);
    return {
      item,
      decomp,
      matUnitWithBdi: round2(decomp.matUnit * markupFactor),
      moUnitWithBdi: round2(decomp.moUnit * markupFactor),
      logUnitWithBdi: round2(decomp.logUnit * markupFactor),
      totalUnitWithBdi: round2(decomp.totalUnit * markupFactor),
    };
  });

  const sourceCounts = decomposed.reduce(
    (acc, d) => {
      acc[d.decomp.source] = (acc[d.decomp.source] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  console.log("[Memória de Cálculo] Valores calculados:");
  console.log(`  - Custo Direto: R$ ${totalDirect.toFixed(2)}`);
  console.log(`  - Custo Logística: R$ ${totalLogistics.toFixed(2)}`);
  console.log(`  - Preço Final: R$ ${totalFinal.toFixed(2)}`);
  console.log(
    `  - Markup factor (BDI dilution): ${markupFactor.toFixed(4)} (${((markupFactor - 1) * 100).toFixed(1)}% sobre custo base)`
  );
  console.log(
    `  - Decomposição: ${JSON.stringify(sourceCounts)} (${decomposed.length} itens)`
  );

  // Criar workbook usando SheetJS
  const wb = XLSX.utils.book_new();

  // === Planilha 1: Orçamento Detalhado ===
  // Layout (BDI diluído — sem coluna BDI/Preço Final separadas, P1.3):
  //   A: Item | B: Código | C: Descrição | D: Unid. | E: Qtd. |
  //   F: Custo Material (unit, com BDI) | G: Custo M.O. (unit, com BDI) |
  //   H: Custo Logística (unit, com BDI) | I: Custo Total (=E*(F+G+H)) |
  //   J: Impostos | K: Fonte | L: Cód. Fonte | M: Premissa
  const HEADER_ROW_INDEX = 4; // 1-based (linha 4 = "Item, Código, ...")
  const orcamentoData = [
    [`MEMÓRIA DE CÁLCULO - ${project.name}`],
    [`Data: ${new Date().toLocaleDateString("pt-BR")}`],
    [],
    [
      "Item",
      "Código",
      "Descrição",
      "Unid.",
      "Qtd.",
      "Custo Material",
      "Custo M.O.",
      "Custo Logística",
      "Custo Total",
      "Impostos",
      "Fonte",
      "Cód. Fonte",
      "Premissa",
    ],
    ...decomposed.map((d, index) => [
      index + 1,
      d.item.code || "",
      d.item.description,
      d.item.unit || "",
      Number(d.item.quantity || 0),
      d.matUnitWithBdi,
      d.moUnitWithBdi,
      d.logUnitWithBdi,
      // I: total da linha — vai virar fórmula Excel após aoa_to_sheet.
      // O número fica como fallback caso o cliente não suporte recálculo.
      round2(Number(d.item.quantity || 0) * d.totalUnitWithBdi),
      Number(d.item.taxAmount || 0),
      d.item.source || "",
      d.item.sourceCode || "",
      decompositionPremise(d.decomp),
    ]),
    [],
    [
      "TOTAL CUSTO DIRETO (com BDI diluído)",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      totalDirect * markupFactor,
    ],
    [
      "TOTAL CUSTOS LOGÍSTICOS (com BDI diluído)",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      totalLogistics * markupFactor,
    ],
    [
      "PREÇO FINAL DE VENDA",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      totalFinal,
    ],
  ];
  const wsOrcamento = XLSX.utils.aoa_to_sheet(orcamentoData);

  // P2 XLSX refactor (P0.1 + P1.4) — substitui valor de Custo Total por
  // fórmula Excel nativa `=E_n * (F_n + G_n + H_n)`. Garante que mexer
  // em quantidade ou componente propaga via planilha. Mantém o número
  // calculado como fallback (cell.v) — clientes que não recalculam
  // ainda enxergam o valor.
  for (let i = 0; i < decomposed.length; i++) {
    const rowNum = HEADER_ROW_INDEX + 1 + i; // 1-based, primeira linha de item
    const totalCellAddr = XLSX.utils.encode_cell({ c: 8, r: rowNum - 1 }); // I
    const totalCell = wsOrcamento[totalCellAddr];
    if (totalCell) {
      totalCell.f = `E${rowNum}*(F${rowNum}+G${rowNum}+H${rowNum})`;
      totalCell.t = "n";
    }
  }

  wsOrcamento["!cols"] = [
    { wch: 6 }, // A: Item
    { wch: 14 }, // B: Código
    { wch: 70 }, // C: Descrição (P2.1 — antes 216,8 pt; agora ~70 chars)
    { wch: 8 }, // D: Unid.
    { wch: 8 }, // E: Qtd.
    { wch: 14 }, // F: Custo Material
    { wch: 14 }, // G: Custo M.O.
    { wch: 14 }, // H: Custo Logística
    { wch: 14 }, // I: Custo Total
    { wch: 12 }, // J: Impostos
    { wch: 12 }, // K: Fonte
    { wch: 14 }, // L: Cód. Fonte
    { wch: 30 }, // M: Premissa
  ];
  XLSX.utils.book_append_sheet(wb, wsOrcamento, "Orçamento Detalhado");
  
  // === Planilha 2: Custos Logísticos ===
  // P2 XLSX refactor (P0.2 + P2.4) — consolidated inclui itens
  // originalmente em logisticsCosts MAIS itens promovidos do orçamento
  // detalhado (frete, container, taxa horário aeroportuário etc).
  // Categoria padronizada via mapLogisticsCategory ou "outros".
  const LOG_HEADER_ROW_INDEX = 3; // 1-based — linha 3 = "Categoria, Descrição, ..."
  const logisticaData: any[][] = [
    ["CUSTOS LOGÍSTICOS"],
    [],
    ["Categoria", "Descrição", "Qtd.", "Unid.", "Custo Unit.", "Custo Total"],
    ...consolidatedLogistics.map(cost => [
      cost.category || "outros",
      cost.description || "",
      Number(cost.quantity || 0),
      cost.unit || "un",
      Number(cost.unitCost || 0),
      // Vai virar fórmula =Cn*En na pós-processamento abaixo.
      Number(cost.totalCost || 0),
    ]),
    [],
    ["TOTAL LOGÍSTICA", "", "", "", "", totalLogistics],
  ];
  const wsLogistica = XLSX.utils.aoa_to_sheet(logisticaData);

  // P2 XLSX refactor (P1.4) — Custo Total (col F) por linha = qty × unitCost.
  for (let i = 0; i < consolidatedLogistics.length; i++) {
    const rowNum = LOG_HEADER_ROW_INDEX + 1 + i;
    const totalAddr = XLSX.utils.encode_cell({ c: 5, r: rowNum - 1 });
    const cell = wsLogistica[totalAddr];
    if (cell) {
      cell.f = `C${rowNum}*E${rowNum}`;
      cell.t = "n";
    }
  }

  wsLogistica["!cols"] = [
    { wch: 18 },
    { wch: 60 },
    { wch: 8 },
    { wch: 8 },
    { wch: 14 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsLogistica, "Custos Logísticos");
  
  // === Planilha 3: Fluxo de Caixa ===
  const fluxoData = [
    ["FLUXO DE CAIXA"],
    [],
    ["Semana", "Despesas", "Receitas", "Saldo Acumulado", "Alerta"],
    ...cashFlowItems.map(item => [
      item.weekNumber,
      Number(item.plannedExpense || 0),
      Number(item.plannedIncome || 0),
      Number(item.cashBalance || 0),
      item.hasAlert ? "SIM" : "",
    ]),
  ];
  const wsFluxo = XLSX.utils.aoa_to_sheet(fluxoData);
  wsFluxo["!cols"] = [
    { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 8 },
  ];
  XLSX.utils.book_append_sheet(wb, wsFluxo, "Fluxo de Caixa");
  
  // === Planilha 4: Resumo ===
  const resumoData = [
    ["RESUMO DO ORÇAMENTO"],
    [`Projeto: ${project.name}`],
    [`Data: ${new Date().toLocaleDateString("pt-BR")}`],
    [],
    ["Descrição", "Valor"],
    ["Custo Direto (Materiais + M.O.)", totalDirect],
    ["Custos Logísticos", totalLogistics],
    ["CUSTO BASE (Direto + Logística)", custoBase],
    [],
    ["Impostos (para referência fiscal)", totalTax],
    ["BDI (Administração + Lucro + Tributos)", totalBdi],
    [],
    ["PREÇO FINAL DE VENDA", totalFinal],
  ];
  const wsResumo = XLSX.utils.aoa_to_sheet(resumoData);
  wsResumo["!cols"] = [{ wch: 35 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");
  
  // Gerar buffer XLSX real
  const xlsxBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(xlsxBuffer);
}

// Format currency for display
export function formatCurrency(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}


// Generate schedule PDF with Gantt chart
export async function generateSchedulePDF(
  project: Project,
  dailySchedule: any[],
  scheduleItems: any[],
  milestones: any[],
  totalDays: number,
  teamSummary: string,
  materialsSummary: string
): Promise<{ url: string; fileKey: string }> {
  const htmlContent = generateScheduleHTML(
    project,
    dailySchedule,
    scheduleItems,
    milestones,
    totalDays,
    teamSummary,
    materialsSummary
  );
  
  const pdfBuffer = Buffer.from(htmlContent, "utf-8");
  
  const timestamp = Date.now();
  const fileName = `cronograma_${project.name.replace(/\s+/g, "_")}_${timestamp}.html`;
  const fileKey = `schedules/${project.id}/${fileName}`;
  
  const { url } = await storagePut(fileKey, pdfBuffer, "text/html");
  
  // Save document reference
  await createGeneratedDocument({
    projectId: project.id,
    documentType: "cronograma",
    fileName,
    fileUrl: url,
    fileKey,
    version: 1,
  });
  
  return { url, fileKey };
}

// Generate HTML content for schedule with Gantt chart
function generateScheduleHTML(
  project: Project,
  dailySchedule: any[],
  scheduleItems: any[],
  milestones: any[],
  totalDays: number,
  teamSummary: string,
  materialsSummary: string
): string {
  // Generate Gantt chart bars
  const ganttBars = scheduleItems.map((item, index) => {
    const colors = ['#d97706', '#0ea5e9', '#10b981', '#8b5cf6', '#f43f5e', '#06b6d4', '#84cc16', '#f59e0b'];
    const color = colors[index % colors.length];
    const startPercent = ((item.startDay - 1) / totalDays) * 100;
    const widthPercent = (item.duration / totalDays) * 100;
    
    return `
      <div class="gantt-row">
        <div class="gantt-label">${item.phase}</div>
        <div class="gantt-bar-container">
          <div class="gantt-bar" style="left: ${startPercent}%; width: ${widthPercent}%; background-color: ${color};">
            <span class="gantt-bar-text">${item.duration}d</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  // Generate milestone markers
  const milestoneMarkers = milestones.map(m => {
    const position = ((m.day - 1) / totalDays) * 100;
    return `<div class="milestone-marker" style="left: ${position}%;" title="Dia ${m.day}: ${m.description}">◆</div>`;
  }).join('');
  
  // Generate daily schedule rows
  const dailyRows = dailySchedule.map(day => {
    const activitiesList = day.activities.map((act: any) => `
      <div class="activity-item">
        <strong>${act.description}</strong>
        <div class="activity-details">
          <span>👷 ${act.team}</span>
          <span>📦 ${act.materials}</span>
          <span>✅ ${act.deliverable}</span>
        </div>
      </div>
    `).join('');
    
    const dayClass = day.isWorkDay ? 'work-day' : 'rest-day';
    
    return `
      <tr class="${dayClass}">
        <td class="day-number">Dia ${day.day}</td>
        <td class="day-phase">${day.phase}</td>
        <td class="day-activities">${activitiesList}</td>
        <td class="day-notes">${day.notes || '-'}</td>
      </tr>
    `;
  }).join('');
  
  // Generate day headers for Gantt
  const dayHeaders = [];
  for (let i = 1; i <= totalDays; i += Math.ceil(totalDays / 10)) {
    const position = ((i - 1) / totalDays) * 100;
    dayHeaders.push(`<span class="day-marker" style="left: ${position}%;">D${i}</span>`);
  }
  
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cronograma - ${project.name}</title>
  <style>
    @media print {
      body { margin: 0; padding: 15px; font-size: 11px; }
      .no-print { display: none; }
      .page-break { page-break-before: always; }
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.5;
      color: #1e293b;
      max-width: 1200px;
      margin: 0 auto;
      padding: 30px;
      background: #fff;
    }
    .header {
      text-align: center;
      border-bottom: 3px solid #d97706;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 {
      color: #1e293b;
      margin-bottom: 5px;
      font-size: 24px;
    }
    .header .subtitle {
      color: #64748b;
      font-size: 14px;
    }
    .header .logo {
      font-size: 20px;
      font-weight: bold;
      color: #d97706;
      margin-bottom: 10px;
    }
    .section {
      margin-bottom: 30px;
    }
    .section h2 {
      color: #d97706;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 10px;
      font-size: 18px;
      margin-bottom: 15px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 20px;
    }
    .summary-card {
      background: #f8fafc;
      padding: 15px;
      border-radius: 8px;
      border-left: 4px solid #d97706;
    }
    .summary-card h4 {
      margin: 0 0 5px 0;
      color: #64748b;
      font-size: 12px;
      text-transform: uppercase;
    }
    .summary-card .value {
      font-size: 20px;
      font-weight: bold;
      color: #1e293b;
    }
    
    /* Gantt Chart Styles */
    .gantt-container {
      background: #f8fafc;
      border-radius: 8px;
      padding: 20px;
      overflow-x: auto;
    }
    .gantt-header {
      position: relative;
      height: 30px;
      border-bottom: 1px solid #e2e8f0;
      margin-bottom: 10px;
    }
    .day-marker {
      position: absolute;
      font-size: 10px;
      color: #64748b;
      transform: translateX(-50%);
    }
    .milestone-markers {
      position: relative;
      height: 20px;
      margin-bottom: 10px;
    }
    .milestone-marker {
      position: absolute;
      color: #f43f5e;
      font-size: 14px;
      transform: translateX(-50%);
      cursor: pointer;
    }
    .gantt-row {
      display: flex;
      align-items: center;
      margin-bottom: 8px;
    }
    .gantt-label {
      width: 150px;
      font-size: 12px;
      font-weight: 500;
      padding-right: 10px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .gantt-bar-container {
      flex: 1;
      height: 24px;
      background: #e2e8f0;
      border-radius: 4px;
      position: relative;
    }
    .gantt-bar {
      position: absolute;
      height: 100%;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 30px;
    }
    .gantt-bar-text {
      color: white;
      font-size: 10px;
      font-weight: bold;
    }
    
    /* Daily Schedule Table */
    .schedule-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .schedule-table th {
      background: #1e293b;
      color: white;
      padding: 12px 8px;
      text-align: left;
      font-weight: 600;
    }
    .schedule-table td {
      padding: 10px 8px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
    }
    .schedule-table .work-day {
      background: #fff;
    }
    .schedule-table .rest-day {
      background: #fef3c7;
    }
    .day-number {
      font-weight: bold;
      color: #d97706;
      width: 70px;
    }
    .day-phase {
      width: 120px;
      font-weight: 500;
    }
    .day-activities {
      min-width: 300px;
    }
    .day-notes {
      color: #64748b;
      font-style: italic;
    }
    .activity-item {
      margin-bottom: 8px;
      padding: 8px;
      background: #f8fafc;
      border-radius: 4px;
    }
    .activity-details {
      display: flex;
      gap: 15px;
      font-size: 11px;
      color: #64748b;
      margin-top: 4px;
    }
    
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      font-size: 11px;
      color: #64748b;
      text-align: center;
    }
    
    .download-btn {
      background: #d97706;
      color: white;
      padding: 10px 20px;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-size: 14px;
      margin: 10px 5px;
    }
    .download-btn:hover {
      background: #b45309;
    }
  </style>
</head>
<body>
  <div class="no-print" style="text-align: center; margin-bottom: 20px;">
    <button class="download-btn" onclick="window.print()">Imprimir / Salvar PDF</button>
  </div>

  <div class="header">
    <div class="logo">RR ENGENHARIA</div>
    <h1>CRONOGRAMA FÍSICO DE EXECUÇÃO</h1>
    <div class="subtitle">${project.name}</div>
  </div>

  <div class="section">
    <div class="summary-grid">
      <div class="summary-card">
        <h4>Duração Total</h4>
        <div class="value">${totalDays} dias</div>
      </div>
      <div class="summary-card">
        <h4>Semanas</h4>
        <div class="value">${Math.ceil(totalDays / 5)} semanas</div>
      </div>
      <div class="summary-card">
        <h4>Fases</h4>
        <div class="value">${scheduleItems.length} etapas</div>
      </div>
      <div class="summary-card">
        <h4>Marcos</h4>
        <div class="value">${milestones.length} entregas</div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>📊 Gráfico de Gantt</h2>
    <div class="gantt-container">
      <div class="gantt-header">
        ${dayHeaders.join('')}
      </div>
      <div class="milestone-markers">
        ${milestoneMarkers}
      </div>
      ${ganttBars}
    </div>
  </div>

  <div class="section">
    <h2>👷 Equipe</h2>
    <p>${teamSummary}</p>
  </div>

  <div class="section">
    <h2>📦 Materiais Principais</h2>
    <p>${materialsSummary}</p>
  </div>

  <div class="section page-break">
    <h2>📅 Cronograma Dia a Dia</h2>
    <table class="schedule-table">
      <thead>
        <tr>
          <th>Dia</th>
          <th>Fase</th>
          <th>Atividades</th>
          <th>Observações</th>
        </tr>
      </thead>
      <tbody>
        ${dailyRows}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>🎯 Marcos de Entrega</h2>
    <table class="schedule-table">
      <thead>
        <tr>
          <th>Dia</th>
          <th>Marco</th>
        </tr>
      </thead>
      <tbody>
        ${milestones.map(m => `
          <tr>
            <td class="day-number">Dia ${m.day}</td>
            <td>${m.description}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <div class="footer">
    <p>Documento gerado automaticamente pelo sistema RR-Engine</p>
    <p>Data de geração: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</p>
  </div>
</body>
</html>
  `;
}
