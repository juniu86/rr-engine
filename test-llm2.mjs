import { config } from 'dotenv';
config({ quiet: true });

const ENV = {
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL,
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY,
};

const payload = {
  model: "gemini-2.5-flash",
  messages: [
    { role: "system", content: "Você é um engenheiro técnico especializado em obras civis." },
    { role: "user", content: "Analise este memorial: Conexão caixa separadora de agua e óleo com a caixa de esgoto. Retorne os itens identificados." }
  ],
  max_tokens: 4000,
  thinking: { budget_tokens: 128 },
  response_format: {
    type: "json_schema",
    json_schema: {
      name: "engenheiro_tecnico_output",
      strict: true,
      schema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                code: { type: "string" },
                description: { type: "string" },
                unit: { type: "string" },
                quantity: { type: "number" },
                category: { type: "string" },
                nbrReference: { type: "string" }
              },
              required: ["code", "description", "unit", "quantity", "category", "nbrReference"],
              additionalProperties: false
            }
          },
          pendingItems: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                reason: { type: "string" }
              },
              required: ["description", "reason"],
              additionalProperties: false
            }
          },
          technicalNotes: { type: "string" },
          normativeReferences: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["items", "pendingItems", "technicalNotes", "normativeReferences"],
        additionalProperties: false
      }
    }
  }
};

const url = `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`;
console.log('Sending request...');

const response = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${ENV.forgeApiKey}`,
  },
  body: JSON.stringify(payload),
});

console.log('Response status:', response.status);
const result = await response.json();
console.log('Full response:', JSON.stringify(result, null, 2));
