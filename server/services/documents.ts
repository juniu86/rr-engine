import { storagePut } from "../storage";
import { createGeneratedDocument } from "../db";
import type { Project, BudgetItem } from "../../drizzle/schema";

// Generate proposal PDF content
export async function generateProposalPDF(
  project: Project,
  budgetItems: BudgetItem[],
  juridicaOutput: any
): Promise<{ url: string; fileKey: string }> {
  // Generate HTML content for the proposal
  const htmlContent = generateProposalHTML(project, budgetItems, juridicaOutput);
  
  // Convert to PDF bytes (simplified - in production use puppeteer or similar)
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

// Generate calculation memory Excel content
export async function generateMemoriaCalculo(
  project: Project,
  budgetItems: BudgetItem[],
  logisticsCosts: any[],
  cashFlowItems: any[]
): Promise<{ url: string; fileKey: string }> {
  // Generate CSV content (Excel-compatible)
  const csvContent = generateMemoriaCSV(project, budgetItems, logisticsCosts, cashFlowItems);
  
  const csvBuffer = Buffer.from(csvContent, "utf-8");
  
  const timestamp = Date.now();
  const fileName = `memoria_calculo_${project.name.replace(/\s+/g, "_")}_${timestamp}.csv`;
  const fileKey = `memorias/${project.id}/${fileName}`;
  
  const { url } = await storagePut(fileKey, csvBuffer, "text/csv");
  
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

// Generate HTML content for proposal
function generateProposalHTML(project: Project, budgetItems: BudgetItem[], juridicaOutput: any): string {
  const totalPrice = budgetItems.reduce((sum, item) => sum + Number(item.finalPrice || 0), 0);
  
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proposta Comercial - ${project.name}</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
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
    }
    .header .subtitle {
      color: #64748b;
      font-size: 14px;
    }
    .section {
      margin-bottom: 30px;
    }
    .section h2 {
      color: #d97706;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 12px;
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
      font-family: monospace;
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
    }
    .clause h4 {
      margin-top: 0;
      color: #1e293b;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>PROPOSTA COMERCIAL</h1>
    <p class="subtitle">RR Engenharia - Soluções em Construção Civil</p>
  </div>

  <div class="section">
    <h2>1. IDENTIFICAÇÃO DO PROJETO</h2>
    <table>
      <tr>
        <th>Projeto</th>
        <td>${project.name}</td>
      </tr>
      <tr>
        <th>Tipo de Contrato</th>
        <td>${project.contractType === "obra" ? "Obra" : "Manutenção"}</td>
      </tr>
      <tr>
        <th>Localização</th>
        <td>${project.location || "A definir"}</td>
      </tr>
      <tr>
        <th>Prazo Estimado</th>
        <td>${project.estimatedDuration || "A definir"} semanas</td>
      </tr>
    </table>
  </div>

  <div class="section">
    <h2>2. ESCOPO DOS SERVIÇOS</h2>
    <p>${project.description || "Conforme memorial descritivo anexo."}</p>
  </div>

  <div class="section">
    <h2>3. PLANILHA DE PREÇOS</h2>
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>Descrição</th>
          <th>Unid.</th>
          <th>Qtd.</th>
          <th class="price">Preço Unit.</th>
          <th class="price">Total</th>
        </tr>
      </thead>
      <tbody>
        ${budgetItems.map((item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${item.description}</td>
          <td>${item.unit || "-"}</td>
          <td>${Number(item.quantity || 0).toFixed(2)}</td>
          <td class="price">R$ ${Number(item.unitCostTotal || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
          <td class="price">R$ ${Number(item.finalPrice || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
        </tr>
        `).join("")}
        <tr class="total-row">
          <td colspan="5">VALOR TOTAL</td>
          <td class="price">R$ ${totalPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
        </tr>
      </tbody>
    </table>
  </div>

  ${juridicaOutput?.clauses ? `
  <div class="section">
    <h2>4. CONDIÇÕES GERAIS</h2>
    ${juridicaOutput.clauses.map((clause: any) => `
    <div class="clause">
      <h4>${clause.title}</h4>
      <p>${clause.content}</p>
    </div>
    `).join("")}
  </div>
  ` : ""}

  <div class="section">
    <h2>5. VALIDADE DA PROPOSTA</h2>
    <p>Esta proposta tem validade de <strong>${juridicaOutput?.validityDays || 30} dias</strong> a partir da data de emissão.</p>
  </div>

  <div class="footer">
    <p><strong>RR Engenharia</strong></p>
    <p>CNPJ: XX.XXX.XXX/0001-XX</p>
    <p>Documento gerado automaticamente pelo sistema RR-Engine em ${new Date().toLocaleDateString("pt-BR")}</p>
  </div>
</body>
</html>
  `;
}

// Generate CSV content for calculation memory
function generateMemoriaCSV(
  project: Project,
  budgetItems: BudgetItem[],
  logisticsCosts: any[],
  cashFlowItems: any[]
): string {
  const lines: string[] = [];
  
  // Header
  lines.push("MEMÓRIA DE CÁLCULO - " + project.name);
  lines.push("Data de Geração: " + new Date().toLocaleDateString("pt-BR"));
  lines.push("");
  
  // Budget Items
  lines.push("ITENS DO ORÇAMENTO");
  lines.push("Item;Código;Descrição;Unidade;Quantidade;Custo Material;Custo M.O.;Custo Logística;Custo Total;Impostos;BDI;Preço Final;Fonte;Código Fonte");
  
  budgetItems.forEach((item, index) => {
    lines.push([
      index + 1,
      item.code || "",
      `"${item.description}"`,
      item.unit || "",
      Number(item.quantity || 0).toFixed(4),
      Number(item.unitCostMaterial || 0).toFixed(2),
      Number(item.unitCostLabor || 0).toFixed(2),
      Number(item.unitCostLogistics || 0).toFixed(2),
      Number(item.totalCost || 0).toFixed(2),
      Number(item.taxAmount || 0).toFixed(2),
      Number(item.bdiAmount || 0).toFixed(2),
      Number(item.finalPrice || 0).toFixed(2),
      item.source || "",
      item.sourceCode || "",
    ].join(";"));
  });
  
  lines.push("");
  
  // Logistics Costs
  if (logisticsCosts.length > 0) {
    lines.push("CUSTOS LOGÍSTICOS");
    lines.push("Categoria;Descrição;Quantidade;Unidade;Custo Unitário;Custo Total");
    
    logisticsCosts.forEach((cost) => {
      lines.push([
        cost.category || "",
        `"${cost.description}"`,
        Number(cost.quantity || 0).toFixed(2),
        cost.unit || "",
        Number(cost.unitCost || 0).toFixed(2),
        Number(cost.totalCost || 0).toFixed(2),
      ].join(";"));
    });
    
    lines.push("");
  }
  
  // Cash Flow
  if (cashFlowItems.length > 0) {
    lines.push("FLUXO DE CAIXA");
    lines.push("Semana;Despesa Planejada;Receita Planejada;Saldo;Alerta");
    
    cashFlowItems.forEach((item) => {
      lines.push([
        item.weekNumber,
        Number(item.plannedExpense || 0).toFixed(2),
        Number(item.plannedIncome || 0).toFixed(2),
        Number(item.cashBalance || 0).toFixed(2),
        item.hasAlert ? "SIM" : "",
      ].join(";"));
    });
    
    lines.push("");
  }
  
  // Summary
  lines.push("RESUMO");
  const totalDirect = budgetItems.reduce((sum, item) => sum + Number(item.totalCost || 0), 0);
  const totalTax = budgetItems.reduce((sum, item) => sum + Number(item.taxAmount || 0), 0);
  const totalBdi = budgetItems.reduce((sum, item) => sum + Number(item.bdiAmount || 0), 0);
  const totalFinal = budgetItems.reduce((sum, item) => sum + Number(item.finalPrice || 0), 0);
  
  lines.push(`Custo Direto Total;${totalDirect.toFixed(2)}`);
  lines.push(`Total Impostos;${totalTax.toFixed(2)}`);
  lines.push(`Total BDI;${totalBdi.toFixed(2)}`);
  lines.push(`PREÇO FINAL;${totalFinal.toFixed(2)}`);
  
  return lines.join("\n");
}

// Format currency for display
export function formatCurrency(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
