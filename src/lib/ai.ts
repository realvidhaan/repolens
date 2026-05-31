/**
 * AI client — OpenAI-compatible, with two zero-cost backends:
 *
 *   • Groq  (hosted)  — set GROQ_API_KEY. Free tier, very fast. This is the
 *                       production / public live-demo path (e.g. on Vercel).
 *   • Ollama (local)  — the default when no key is set. Free and private,
 *                       ideal for development. Run `ollama serve` + pull a model.
 *
 * Because both speak the OpenAI API, switching is just a base URL + key.
 */

import OpenAI from "openai";

const GROQ_API_KEY = process.env.GROQ_API_KEY;

/** True when a hosted Groq key is configured (production / live demo). */
export const USING_GROQ = Boolean(GROQ_API_KEY);

const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1";

export const AI_BASE_URL = USING_GROQ
  ? "https://api.groq.com/openai/v1"
  : OLLAMA_BASE_URL;

/** Model to use. Override with AI_MODEL for either backend. */
export const MODEL =
  process.env.AI_MODEL ?? (USING_GROQ ? "llama-3.3-70b-versatile" : "mistral");

/** OpenAI-compatible client pointing at Groq (hosted) or Ollama (local). */
export const ai = new OpenAI({
  baseURL: AI_BASE_URL,
  apiKey: GROQ_API_KEY ?? "ollama", // Ollama requires a value but ignores it
});

/**
 * Health check. For Groq we just confirm a key is present (real errors surface
 * on the first call). For local Ollama we verify the server is reachable and
 * the chosen model is installed. Returns null on success, else an error string.
 */
export async function checkAI(): Promise<string | null> {
  if (USING_GROQ) return null;
  try {
    const res = await fetch(
      `${OLLAMA_BASE_URL.replace("/v1", "")}/api/tags`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return "Ollama is running but returned an unexpected response.";
    const data = (await res.json()) as { models?: { name: string }[] };
    const models = data.models ?? [];
    const installed = models.some(
      (m) => m.name === MODEL || m.name.startsWith(MODEL + ":"),
    );
    if (!installed) {
      const list = models.map((m) => m.name).join(", ") || "none";
      return `Model "${MODEL}" is not installed. Run: ollama pull ${MODEL}\n(Installed models: ${list})`;
    }
    return null;
  } catch {
    return `Cannot reach Ollama at ${OLLAMA_BASE_URL}. Make sure it's running: ollama serve`;
  }
}

/**
 * Wrap an async string iterable as a UTF-8 ReadableStream suitable for a
 * Route Handler Response body.
 */
export function streamToResponse(
  stream: AsyncIterable<string>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown streaming error";
        controller.enqueue(
          encoder.encode(`\n\n> ⚠️ Stream interrupted: ${message}`),
        );
      } finally {
        controller.close();
      }
    },
  });
}

export const STREAM_HEADERS: HeadersInit = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "X-Content-Type-Options": "nosniff",
};
