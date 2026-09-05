import "server-only";

/**
 * Groq access for the two interactive endpoints, with Gemini as a fallback.
 *
 * Both run on free tiers. Requests are small and use the fast model, because a
 * person is waiting. Everything heavy happens in the Python pipeline instead.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Groq retires models regularly, and a retired name returns 404 rather than
 * degrading, which is how generation broke silently before. Each name is tried
 * in order so one retirement costs quality instead of the whole feature.
 */
const GROQ_MODELS = [
  process.env.GROQ_MODEL_FAST,
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
].filter((name): name is string => Boolean(name));

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

const TIMEOUT_MS = 25_000;

export class AiUnavailableError extends Error {}

export function isAiConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY);
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```$/, "").trim();
}

function extractJson<T>(raw: string): T {
  const cleaned = stripFences(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    }
    throw new AiUnavailableError("The model did not return valid JSON.");
  }
}

async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function callGroqModel(
  system: string,
  user: string,
  maxTokens: number,
  model: string,
): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new AiUnavailableError("GROQ_API_KEY is not set.");

  const response = await withTimeout((signal) =>
    fetch(GROQ_URL, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    }),
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new AiUnavailableError(`Groq ${model} returned ${response.status}: ${detail.slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return payload.choices?.[0]?.message?.content ?? "";
}

async function callGroq(system: string, user: string, maxTokens: number): Promise<string> {
  let lastError: Error | null = null;
  for (const model of GROQ_MODELS) {
    try {
      return await callGroqModel(system, user, maxTokens, model);
    } catch (error) {
      lastError = error as Error;
      // A 404 means the model is gone; anything else is worth reporting as is.
      if (!lastError.message.includes("404")) throw lastError;
    }
  }
  throw lastError ?? new AiUnavailableError("No Groq model was available.");
}

async function callGemini(system: string, user: string, maxTokens: number): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AiUnavailableError("GEMINI_API_KEY is not set.");

  const response = await withTimeout((signal) =>
    fetch(`${GEMINI_URL}/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      signal,
      // Newer AQ. style keys are only accepted in this header, not as ?key=
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: maxTokens,
          responseMimeType: "application/json",
        },
      }),
    }),
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new AiUnavailableError(`Gemini returned ${response.status}: ${detail.slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

export async function completeJson<T>(
  system: string,
  user: string,
  maxTokens = 1600,
): Promise<T> {
  const errors: string[] = [];

  if (process.env.GROQ_API_KEY) {
    try {
      return extractJson<T>(await callGroq(system, user, maxTokens));
    } catch (error) {
      errors.push(`groq: ${(error as Error).message}`);
    }
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      return extractJson<T>(await callGemini(system, user, maxTokens));
    } catch (error) {
      errors.push(`gemini: ${(error as Error).message}`);
    }
  }

  throw new AiUnavailableError(
    errors.length
      ? `No AI provider responded. ${errors.join(" | ")}`
      : "No AI provider is configured.",
  );
}
