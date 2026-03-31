import { ENV } from "./env";
import { getProviderCapabilities, detectProvider } from "./llm-providers";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  /** LLM model to use. Falls back to LLM_MODEL env or gemini-2.5-flash. */
  model?: string;
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

const resolveApiUrl = () =>
  ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
    ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`
    : "https://forge.manus.im/v1/chat/completions";

const assertApiKey = () => {
  if (!ENV.forgeApiKey) {
    throw new Error("BUILT_IN_FORGE_API_KEY is not configured");
  }
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;

  const payload: Record<string, unknown> = {
    model: params.model ?? process.env.LLM_MODEL ?? "gemini-2.5-flash",
    messages: messages.map(normalizeMessage),
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  // Adapter pattern: capabilities por provider
  const modelName = (payload.model as string) ?? "gemini-2.5-flash";
  const capabilities = getProviderCapabilities(modelName);

  // max_tokens respeitando limite do provider
  payload.max_tokens = params.maxTokens ?? params.max_tokens ?? capabilities.maxOutputTokens;

  // thinking apenas para providers que suportam (Claude)
  if (capabilities.supportsThinking) {
    payload.thinking = {
      type: "enabled",
      budget_tokens: 128,
    };
  }
  // Para Gemini e outros modelos: NÃO adicionar thinking

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  // ─── Routing: Direct Anthropic API when key is available and model is Claude ──
  const provider = detectProvider(modelName);
  const isClaudeModel = provider === 'claude-opus' || provider === 'claude-sonnet' || provider === 'claude';
  const hasAnthropicKey = ENV.anthropicApiKey && ENV.anthropicApiKey.length > 10;

  if (isClaudeModel && hasAnthropicKey) {
    return invokeAnthropicDirect(payload, modelName);
  }

  // If Claude model requested but no Anthropic key, fallback to default model via Forge
  // (Forge may not support claude-opus-4-6 or similar model names)
  if (isClaudeModel && !hasAnthropicKey) {
    const fallbackModel = process.env.LLM_MODEL ?? "gemini-2.5-flash";
    console.warn(`[LLM] No ANTHROPIC_API_KEY configured. Falling back from ${modelName} to ${fallbackModel} via Forge.`);
    payload.model = fallbackModel;
    // Recalculate capabilities for fallback model
    const fallbackCapabilities = getProviderCapabilities(fallbackModel);
    payload.max_tokens = params.maxTokens ?? params.max_tokens ?? fallbackCapabilities.maxOutputTokens;
    // Remove thinking param (not supported by Gemini/GPT)
    delete (payload as any).thinking;
  }

  // ─── Fallback: Forge proxy (Gemini, GPT, or Claude without direct key) ────────
  const response = await fetch(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[LLM] Request failed:', response.status, response.statusText, errorText);
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  const result = (await response.json()) as InvokeResult;
  console.log(`[LLM] Response received: model=${result.model}, finish_reason=${result.choices?.[0]?.finish_reason}, usage=${JSON.stringify(result.usage || {})}`);
  return result;
}

// ─── Direct Anthropic API Integration ─────────────────────────────────────────

/**
 * Call the Anthropic Messages API directly (api.anthropic.com/v1/messages).
 * Converts OpenAI-compatible payload → Anthropic format → back to InvokeResult.
 */
async function invokeAnthropicDirect(
  payload: Record<string, unknown>,
  modelName: string,
): Promise<InvokeResult> {
  console.log(`[LLM] Using Anthropic direct API for model: ${modelName}`);

  // 1. Extract system message from messages array (Anthropic uses separate "system" field)
  const messages = payload.messages as Array<{ role: string; content: unknown }>;
  const systemMsg = messages.find(m => m.role === 'system');
  const nonSystemMessages = messages.filter(m => m.role !== 'system');

  // 2. Build Anthropic-format payload (ONLY supported fields — no response_format, no thinking)
  const anthropicPayload: Record<string, unknown> = {
    model: modelName,
    max_tokens: (payload.max_tokens as number) ?? 32768,
    messages: nonSystemMessages,
  };

  // Extract system message content + inject JSON instruction
  // (Anthropic doesn't support response_format, so we tell the LLM to output JSON in the system prompt)
  let systemContent = '';
  if (systemMsg) {
    systemContent = typeof systemMsg.content === 'string'
      ? systemMsg.content
      : JSON.stringify(systemMsg.content);
  }
  if (payload.response_format) {
    systemContent += '\n\nIMPORTANT: You MUST respond with valid JSON only. No markdown, no code blocks, no explanatory text — ONLY the raw JSON object.';
  }
  if (systemContent) {
    anthropicPayload.system = systemContent;
  }

  // 3. Call Anthropic API
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ENV.anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(anthropicPayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[LLM] Anthropic API failed:', response.status, errorText);
    throw new Error(`Anthropic API failed: ${response.status} – ${errorText}`);
  }

  // 4. Convert Anthropic response → InvokeResult (OpenAI-compatible format)
  const anthropicResult = (await response.json()) as Record<string, unknown>;
  const result = convertAnthropicToInvokeResult(anthropicResult);
  console.log(`[LLM] Anthropic response: model=${result.model}, finish_reason=${result.choices?.[0]?.finish_reason}, usage=${JSON.stringify(result.usage || {})}`);
  return result;
}

/**
 * Convert Anthropic Messages API response to OpenAI-compatible InvokeResult.
 *
 * Anthropic format: { content: [{ type: "text", text: "..." }], stop_reason, usage: { input_tokens, output_tokens } }
 * OpenAI format:    { choices: [{ message: { content: "..." }, finish_reason }], usage: { prompt_tokens, completion_tokens } }
 */
function convertAnthropicToInvokeResult(r: Record<string, unknown>): InvokeResult {
  const content = r.content as Array<{ type: string; text?: string }> | undefined;
  const textContent = content?.find(c => c.type === 'text');

  const stopReason = r.stop_reason as string | undefined;
  const usage = r.usage as { input_tokens?: number; output_tokens?: number } | undefined;

  return {
    id: (r.id as string) ?? '',
    created: Math.floor(Date.now() / 1000),
    model: (r.model as string) ?? '',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: textContent?.text ?? '',
      },
      finish_reason: stopReason === 'end_turn' ? 'stop'
                   : stopReason === 'max_tokens' ? 'length'
                   : stopReason ?? 'stop',
    }],
    usage: {
      prompt_tokens: usage?.input_tokens ?? 0,
      completion_tokens: usage?.output_tokens ?? 0,
      total_tokens: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
    },
  };
}
