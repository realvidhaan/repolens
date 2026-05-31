import {
  ai,
  MODEL,
  checkOllama,
  streamToResponse,
  STREAM_HEADERS,
} from "@/lib/ai";
import {
  fetchRepoContext,
  buildContextPrompt,
  GitHubError,
} from "@/lib/github";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const INSTRUCTIONS = `You are a senior software engineer answering questions about a specific GitHub repository.

STRICT RULES:
1. NEVER say "based on the files provided", "I was given", "it appears you've shared", or any meta-commentary. Just answer.
2. NEVER use filler like "it seems", "it appears", "I notice". Be direct.
3. Always reference specific file paths, function names, or directory names in your answers.
4. If something isn't in the provided code, say "I don't see that in the files I have — check X directory" and move on.
5. Keep answers concise. Use bullet points and code blocks with language tags.
6. When asked "where do I start", give a specific reading order with exact file paths.`;

const MAX_HISTORY = 8; // cap turns sent to keep the local model's context window happy

export async function POST(request: Request) {
  // Check Ollama is running and the model is available.
  const ollamaError = await checkOllama();
  if (ollamaError) {
    return Response.json({ error: ollamaError }, { status: 503 });
  }

  let url = "";
  let messages: ChatMessage[] = [];
  try {
    const body = await request.json();
    url = typeof body?.url === "string" ? body.url : "";
    if (Array.isArray(body?.messages)) {
      messages = body.messages
        .filter(
          (m: unknown): m is ChatMessage =>
            !!m &&
            typeof (m as ChatMessage).content === "string" &&
            ((m as ChatMessage).role === "user" ||
              (m as ChatMessage).role === "assistant"),
        )
        .slice(-MAX_HISTORY);
    }
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!url || messages.length === 0) {
    return Response.json(
      { error: "Missing repository URL or message." },
      { status: 400 },
    );
  }

  // Re-derive repo context (GitHub fetches are cached at the edge).
  let context;
  try {
    context = await fetchRepoContext(url);
  } catch (err) {
    if (err instanceof GitHubError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json(
      { error: "Failed to read the repository." },
      { status: 502 },
    );
  }

  const contextPrompt = buildContextPrompt(context);

  const systemContent = `${INSTRUCTIONS}\n\n===== REPOSITORY CONTEXT =====\n\n${contextPrompt}`;

  async function* tokens() {
    const stream = await ai.chat.completions.create({
      model: MODEL,
      stream: true,
      temperature: 0.2,
      max_tokens: 600,
      messages: [
        { role: "system", content: systemContent },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    });
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content ?? "";
      if (text) yield text;
    }
  }

  return new Response(streamToResponse(tokens()), {
    headers: new Headers(STREAM_HEADERS),
  });
}
