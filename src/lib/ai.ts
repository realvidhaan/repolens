/**
 * AI client — points at a local Ollama instance via its OpenAI-compatible API.
 * No API key needed. Free forever.
 *
 * Make sure Ollama is running (`ollama serve`) and you have pulled a model:
 *   ollama pull mistral
 */

import OpenAI from "openai";

export const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1";

/** Which model to use. Override with OLLAMA_MODEL in .env.local */
export const MODEL = process.env.OLLAMA_MODEL ?? "mistral";

/** OpenAI-compatible client pointing at local Ollama. */
export const ai = new OpenAI({
  baseURL: OLLAMA_BASE_URL,
  apiKey: "ollama", // required by the SDK but ignored by Ollama
});

/**
 * Quick check that Ollama is reachable and the chosen model is installed.
 * Returns null on success, or an error string to show the user.
 */
export async function checkOllama(): Promise<string | null> {
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
