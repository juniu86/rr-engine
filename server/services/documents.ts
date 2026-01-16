import { storagePut } from "../storage";
import { createGeneratedDocument } from "../db";
import type { Project, BudgetItem } from "../../drizzle/schema";

// Interface para item com preço proporcional (sem mostrar custo aberto)
interface ProportionalItem {
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number; // Preço unitário de venda (não custo)
  totalPrice: number; // Preço total de venda
}

// Calcular preços proporcionais para proposta (esconde custos, mostra apenas preços de venda)
function calculateProportionalPrices(budgetItems: BudgetItem[], totalSalePrice: number): ProportionalItem[] {
  // Calcular custo total de todos os itens
  const totalCost = budgetItems.reduce((sum, item) => {
    return sum + (Number(item.quantity || 0) * Number(item.unitCostTotal || 0));
  }, 0);
  
  if (totalCost === 0) return [];
  
  // Fator de markup para distribuir o preço de venda proporcionalmente
  const markupFactor = totalSalePrice / totalCost;
  
  return budgetItems.map(item => {
    const quantity = Number(item.quantity || 0);
    const unitCost = Number(item.unitCostTotal || 0);
    const unitPrice = unitCost * markupFactor; // Preço unitário de venda
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
  juridicaOutput: any,
  comercialOutput?: any,
  companySettings?: CompanySettings
): Promise<{ url: string; fileKey: string }> {
  // Calcular custo base total (sem BDI)
  const totalBaseCost = budgetItems.reduce((sum, item) => {
    return sum + (Number(item.quantity || 0) * Number(item.unitCostTotal || 0));
  }, 0);
  
  // Calcular preço de venda já salvo nos items (com BDI de 55%)
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
  
  let totalSalePrice: number;
  const minExpectedPrice = totalBaseCost * 1.30; // Mínimo: BDI de 30%
  const maxExpectedPrice = totalBaseCost * 2.00; // Máximo: BDI de 100%
  
  if (comercialPrice >= minExpectedPrice && comercialPrice <= maxExpectedPrice) {
    // Preço comercial está dentro do range esperado
    totalSalePrice = comercialPrice;
    console.log(`  - Usando preço comercial (dentro do range): R$ ${totalSalePrice.toFixed(2)}`);
  } else if (totalFromItems >= minExpectedPrice && totalFromItems <= maxExpectedPrice) {
    // Preço dos items está dentro do range esperado
    totalSalePrice = totalFromItems;
    console.log(`  - Usando preço dos items (dentro do range): R$ ${totalSalePrice.toFixed(2)}`);
  } else if (comercialPrice > maxExpectedPrice) {
    // Preço comercial muito alto (possível duplicação) - recalcular com BDI configurado
    totalSalePrice = totalBaseCost * (1 + bdiConfigurado);
    console.log(`  - ALERTA: Preço comercial muito alto (R$ ${comercialPrice.toFixed(2)}), recalculando com BDI ${(bdiConfigurado * 100).toFixed(1)}%: R$ ${totalSalePrice.toFixed(2)}`);
  } else if (comercialPrice > 0 && comercialPrice < minExpectedPrice) {
    // Preço comercial muito baixo - recalcular com BDI configurado
    totalSalePrice = totalBaseCost * (1 + bdiConfigurado);
    console.log(`  - ALERTA: Preço comercial muito baixo (R$ ${comercialPrice.toFixed(2)}), recalculando com BDI ${(bdiConfigurado * 100).toFixed(1)}%: R$ ${totalSalePrice.toFixed(2)}`);
  } else {
    // Sem preço comercial válido - usar preço dos items ou recalcular com BDI configurado
    totalSalePrice = totalFromItems > 0 ? totalFromItems : totalBaseCost * (1 + bdiConfigurado);
    console.log(`  - Usando fallback (BDI ${(bdiConfigurado * 100).toFixed(1)}%): R$ ${totalSalePrice.toFixed(2)}`);
  }
  
  // Calculate proportional prices (hides cost breakdown)
  const proportionalItems = calculateProportionalPrices(budgetItems, totalSalePrice);
  
  // Generate HTML content for the proposal
  const htmlContent = generateProposalHTML(project, proportionalItems, totalSalePrice, juridicaOutput, companySettings);
  
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
  cashFlowItems: any[]
): Promise<{ url: string; fileKey: string }> {
  // Generate XLSX content using XML format (Excel 2003 XML)
  const xlsxContent = generateMemoriaXLSX(project, budgetItems, logisticsCosts, cashFlowItems);
  
  const xlsxBuffer = Buffer.from(xlsxContent, "utf-8");
  
  const timestamp = Date.now();
  const fileName = `memoria_calculo_${project.name.replace(/\s+/g, "_")}_${timestamp}.xls`;
  const fileKey = `memorias/${project.id}/${fileName}`;
  
  const { url } = await storagePut(fileKey, xlsxBuffer, "application/vnd.ms-excel");
  
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
  companySettings?: CompanySettings
): string {
  const companyName = companySettings?.companyName || 'RR Engenharia';
  const companyCnpj = companySettings?.cnpj || '';
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
    <div class="logo">${companyName.toUpperCase()}</div>
    <h1>PROPOSTA COMERCIAL</h1>
    <p class="subtitle">Soluções em Construção Civil e Infraestrutura</p>
    ${companyCnpj ? `<p class="subtitle">CNPJ: ${companyCnpj}</p>` : ''}
  </div>

  <div class="section">
    <h2>1. IDENTIFICAÇÃO DO PROJETO</h2>
    <table>
      <tr>
        <th style="width: 30%;">Projeto</th>
        <td>${project.name}</td>
      </tr>
      <tr>
        <th>Tipo de Contrato</th>
        <td>${project.contractType === "obra" ? "Execução de Obra" : "Serviço de Manutenção"}</td>
      </tr>
      <tr>
        <th>Localização</th>
        <td>${project.location || "A definir em contrato"}</td>
      </tr>
      <tr>
        <th>Prazo de Execução</th>
        <td>${project.estimatedDuration || "A definir"} semanas</td>
      </tr>
    </table>
  </div>

  <div class="section">
    <h2>2. ESCOPO DOS SERVIÇOS</h2>
    <p>${project.description || "Conforme memorial descritivo anexo à presente proposta."}</p>
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
          <td>${item.description}</td>
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

// Generate Excel 2003 XML format (compatible with Excel)
function generateMemoriaXLSX(
  project: Project,
  budgetItems: BudgetItem[],
  logisticsCosts: any[],
  cashFlowItems: any[]
): string {
  const escapeXml = (str: string) => str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  
  // Calculate totals
  const totalDirect = budgetItems.reduce((sum, item) => sum + Number(item.totalCost || 0), 0);
  const totalTax = budgetItems.reduce((sum, item) => sum + Number(item.taxAmount || 0), 0);
  const totalBdi = budgetItems.reduce((sum, item) => sum + Number(item.bdiAmount || 0), 0);
  const totalFinal = budgetItems.reduce((sum, item) => sum + Number(item.finalPrice || 0), 0);
  const totalLogistics = logisticsCosts.reduce((sum, cost) => sum + Number(cost.totalCost || 0), 0);
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  
  <Styles>
    <Style ss:ID="Header">
      <Font ss:Bold="1" ss:Size="12"/>
      <Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Center"/>
    </Style>
    <Style ss:ID="Title">
      <Font ss:Bold="1" ss:Size="14" ss:Color="#D97706"/>
    </Style>
    <Style ss:ID="Currency">
      <NumberFormat ss:Format="R$ #,##0.00"/>
      <Alignment ss:Horizontal="Right"/>
    </Style>
    <Style ss:ID="Total">
      <Font ss:Bold="1"/>
      <Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="R$ #,##0.00"/>
    </Style>
  </Styles>

  <!-- Planilha de Orçamento -->
  <Worksheet ss:Name="Orçamento Detalhado">
    <Table>
      <Column ss:Width="40"/>
      <Column ss:Width="80"/>
      <Column ss:Width="250"/>
      <Column ss:Width="60"/>
      <Column ss:Width="80"/>
      <Column ss:Width="100"/>
      <Column ss:Width="100"/>
      <Column ss:Width="100"/>
      <Column ss:Width="100"/>
      <Column ss:Width="100"/>
      <Column ss:Width="100"/>
      <Column ss:Width="100"/>
      <Column ss:Width="80"/>
      <Column ss:Width="100"/>
      
      <!-- Título -->
      <Row>
        <Cell ss:StyleID="Title"><Data ss:Type="String">MEMÓRIA DE CÁLCULO - ${escapeXml(project.name)}</Data></Cell>
      </Row>
      <Row>
        <Cell><Data ss:Type="String">Data: ${new Date().toLocaleDateString("pt-BR")}</Data></Cell>
      </Row>
      <Row/>
      
      <!-- Cabeçalho -->
      <Row>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Item</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Código</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Descrição</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Unid.</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Qtd.</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Custo Material</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Custo M.O.</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Custo Logística</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Custo Total</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Impostos</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">BDI</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Preço Final</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Fonte</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Cód. Fonte</Data></Cell>
      </Row>
      
      <!-- Dados -->
      ${budgetItems.map((item, index) => `
      <Row>
        <Cell><Data ss:Type="Number">${index + 1}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(item.code || "")}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(item.description)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(item.unit || "")}</Data></Cell>
        <Cell><Data ss:Type="Number">${Number(item.quantity || 0)}</Data></Cell>
        <Cell ss:StyleID="Currency"><Data ss:Type="Number">${Number(item.unitCostMaterial || 0)}</Data></Cell>
        <Cell ss:StyleID="Currency"><Data ss:Type="Number">${Number(item.unitCostLabor || 0)}</Data></Cell>
        <Cell ss:StyleID="Currency"><Data ss:Type="Number">${Number(item.unitCostLogistics || 0)}</Data></Cell>
        <Cell ss:StyleID="Currency"><Data ss:Type="Number">${Number(item.totalCost || 0)}</Data></Cell>
        <Cell ss:StyleID="Currency"><Data ss:Type="Number">${Number(item.taxAmount || 0)}</Data></Cell>
        <Cell ss:StyleID="Currency"><Data ss:Type="Number">${Number(item.bdiAmount || 0)}</Data></Cell>
        <Cell ss:StyleID="Currency"><Data ss:Type="Number">${Number(item.finalPrice || 0)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(item.source || "")}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(item.sourceCode || "")}</Data></Cell>
      </Row>
      `).join("")}
      
      <!-- Totais -->
      <Row/>
      <Row>
        <Cell ss:MergeAcross="7" ss:StyleID="Total"><Data ss:Type="String">TOTAL CUSTO DIRETO</Data></Cell>
        <Cell ss:StyleID="Total"><Data ss:Type="Number">${totalDirect}</Data></Cell>
      </Row>
      <Row>
        <Cell ss:MergeAcross="7" ss:StyleID="Total"><Data ss:Type="String">TOTAL IMPOSTOS</Data></Cell>
        <Cell ss:StyleID="Total"><Data ss:Type="Number">${totalTax}</Data></Cell>
      </Row>
      <Row>
        <Cell ss:MergeAcross="7" ss:StyleID="Total"><Data ss:Type="String">TOTAL BDI</Data></Cell>
        <Cell ss:StyleID="Total"><Data ss:Type="Number">${totalBdi}</Data></Cell>
      </Row>
      <Row>
        <Cell ss:MergeAcross="7" ss:StyleID="Total"><Data ss:Type="String">PREÇO FINAL DE VENDA</Data></Cell>
        <Cell ss:StyleID="Total"><Data ss:Type="Number">${totalFinal}</Data></Cell>
      </Row>
    </Table>
  </Worksheet>

  <!-- Planilha de Custos Logísticos -->
  <Worksheet ss:Name="Custos Logísticos">
    <Table>
      <Column ss:Width="120"/>
      <Column ss:Width="250"/>
      <Column ss:Width="80"/>
      <Column ss:Width="80"/>
      <Column ss:Width="100"/>
      <Column ss:Width="100"/>
      
      <Row>
        <Cell ss:StyleID="Title"><Data ss:Type="String">CUSTOS LOGÍSTICOS</Data></Cell>
      </Row>
      <Row/>
      
      <Row>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Categoria</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Descrição</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Qtd.</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Unid.</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Custo Unit.</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Custo Total</Data></Cell>
      </Row>
      
      ${logisticsCosts.map(cost => `
      <Row>
        <Cell><Data ss:Type="String">${escapeXml(cost.category || "")}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(cost.description || "")}</Data></Cell>
        <Cell><Data ss:Type="Number">${Number(cost.quantity || 0)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(cost.unit || "")}</Data></Cell>
        <Cell ss:StyleID="Currency"><Data ss:Type="Number">${Number(cost.unitCost || 0)}</Data></Cell>
        <Cell ss:StyleID="Currency"><Data ss:Type="Number">${Number(cost.totalCost || 0)}</Data></Cell>
      </Row>
      `).join("")}
      
      <Row/>
      <Row>
        <Cell ss:MergeAcross="4" ss:StyleID="Total"><Data ss:Type="String">TOTAL LOGÍSTICA</Data></Cell>
        <Cell ss:StyleID="Total"><Data ss:Type="Number">${totalLogistics}</Data></Cell>
      </Row>
    </Table>
  </Worksheet>

  <!-- Planilha de Fluxo de Caixa -->
  <Worksheet ss:Name="Fluxo de Caixa">
    <Table>
      <Column ss:Width="80"/>
      <Column ss:Width="120"/>
      <Column ss:Width="120"/>
      <Column ss:Width="120"/>
      <Column ss:Width="80"/>
      
      <Row>
        <Cell ss:StyleID="Title"><Data ss:Type="String">FLUXO DE CAIXA</Data></Cell>
      </Row>
      <Row/>
      
      <Row>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Semana</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Despesas</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Receitas</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Saldo Acumulado</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Alerta</Data></Cell>
      </Row>
      
      ${cashFlowItems.map(item => `
      <Row>
        <Cell><Data ss:Type="Number">${item.weekNumber}</Data></Cell>
        <Cell ss:StyleID="Currency"><Data ss:Type="Number">${Number(item.plannedExpense || 0)}</Data></Cell>
        <Cell ss:StyleID="Currency"><Data ss:Type="Number">${Number(item.plannedIncome || 0)}</Data></Cell>
        <Cell ss:StyleID="Currency"><Data ss:Type="Number">${Number(item.cashBalance || 0)}</Data></Cell>
        <Cell><Data ss:Type="String">${item.hasAlert ? "SIM" : ""}</Data></Cell>
      </Row>
      `).join("")}
    </Table>
  </Worksheet>

  <!-- Planilha de Resumo -->
  <Worksheet ss:Name="Resumo">
    <Table>
      <Column ss:Width="200"/>
      <Column ss:Width="150"/>
      
      <Row>
        <Cell ss:StyleID="Title"><Data ss:Type="String">RESUMO DO ORÇAMENTO</Data></Cell>
      </Row>
      <Row>
        <Cell><Data ss:Type="String">Projeto: ${escapeXml(project.name)}</Data></Cell>
      </Row>
      <Row>
        <Cell><Data ss:Type="String">Data: ${new Date().toLocaleDateString("pt-BR")}</Data></Cell>
      </Row>
      <Row/>
      
      <Row>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Descrição</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Valor</Data></Cell>
      </Row>
      
      <Row>
        <Cell><Data ss:Type="String">Custo Direto (Materiais + M.O.)</Data></Cell>
        <Cell ss:StyleID="Currency"><Data ss:Type="Number">${totalDirect}</Data></Cell>
      </Row>
      <Row>
        <Cell><Data ss:Type="String">Custos Logísticos</Data></Cell>
        <Cell ss:StyleID="Currency"><Data ss:Type="Number">${totalLogistics}</Data></Cell>
      </Row>
      <Row>
        <Cell><Data ss:Type="String">Impostos (ISS/ICMS)</Data></Cell>
        <Cell ss:StyleID="Currency"><Data ss:Type="Number">${totalTax}</Data></Cell>
      </Row>
      <Row>
        <Cell><Data ss:Type="String">BDI (Administração + Lucro)</Data></Cell>
        <Cell ss:StyleID="Currency"><Data ss:Type="Number">${totalBdi}</Data></Cell>
      </Row>
      <Row/>
      <Row>
        <Cell ss:StyleID="Total"><Data ss:Type="String">PREÇO FINAL DE VENDA</Data></Cell>
        <Cell ss:StyleID="Total"><Data ss:Type="Number">${totalFinal}</Data></Cell>
      </Row>
    </Table>
  </Worksheet>
</Workbook>`;
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
