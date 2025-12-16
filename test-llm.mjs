import { config } from 'dotenv';
config();

const ENV = {
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL,
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY,
};

console.log('API URL:', ENV.forgeApiUrl);
console.log('API Key:', ENV.forgeApiKey ? 'SET' : 'NOT SET');

const payload = {
  model: "gemini-2.5-flash",
  messages: [
    { role: "system", content: "You are a helpful assistant that outputs JSON." },
    { role: "user", content: "Return a simple JSON object with a greeting field." }
  ],
  max_tokens: 1000,
  response_format: {
    type: "json_schema",
    json_schema: {
      name: "test_output",
      strict: true,
      schema: {
        type: "object",
        properties: {
          greeting: { type: "string" }
        },
        required: ["greeting"],
        additionalProperties: false
      }
    }
  }
};

const url = ENV.forgeApiUrl ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions` : "https://forge.manus.im/v1/chat/completions";
console.log('Request URL:', url);

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
