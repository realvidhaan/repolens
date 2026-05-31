import {
  ai,
  MODEL,
  checkAI,
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

const SYSTEM = `You are a senior software engineer. Your job is to write a sharp, direct architecture review of a GitHub repository.

STRICT RULES — violating any of these makes your response useless:
1. NEVER say "I was given files" or "based on the files provided" or "it appears you've shared" or any meta-commentary about receiving files. Just analyze.
2. NEVER use filler phrases like "it seems", "it appears", "I notice", "looking at the code". Be direct.
3. NEVER restate the repo name or include a top-level title.
4. Every bullet must be specific and name real files, directories, or technologies. No vague generalities.
5. Keep it tight — short bullets, no padding.

Write exactly these three sections in Markdown:

## Architecture Overview
2-3 sentences: what this project IS and how it's structured. Then 3-5 bullets naming the key entry points, core modules, and data flow.

## Key Technical Patterns
4-6 bullets on the actual frameworks, libraries, patterns, and conventions in use. Name specific technologies (e.g. "Uses Zustand for client state in src/store/", not "uses state management").

## Potential Bottlenecks
3-4 bullets on real risks, complexity hotspots, or things a new contributor should watch out for. Be constructive — if the code is clean, say what specifically makes it robust.`;

export async function POST(request: Request) {
  // Make sure the AI backend (Groq or local Ollama) is reachable.
  const aiError = await checkAI();
  if (aiError) {
    return Response.json({ error: aiError }, { status: 503 });
  }

  let url: string;
  try {
    const body = await request.json();
    url = typeof body?.url === "string" ? body.url : "";
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Fetch + filter repo (non-streamed). Errors return JSON the client can show.
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

  if (context.files.length === 0) {
    return Response.json(
      { error: "No analyzable source files were found in this repository." },
      { status: 422 },
    );
  }

  const contextPrompt = buildContextPrompt(context);

  // Stream the model's Markdown report straight to the client.
  async function* tokens() {
    const stream = await ai.chat.completions.create({
      model: MODEL,
      stream: true,
      temperature: 0.1,
      max_tokens: 800,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Analyze this repository:\n\n${contextPrompt}`,
        },
      ],
    });
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content ?? "";
      if (text) yield text;
    }
  }

  // Repo metadata travels in a header so the client can render Tile A
  // instantly while the analysis text streams into Tile B.
  const headers = new Headers(STREAM_HEADERS);
  headers.set(
    "X-Repo-Meta",
    encodeURIComponent(
      JSON.stringify({ meta: context.meta, partial: context.partial }),
    ),
  );

  return new Response(streamToResponse(tokens()), { headers });
}
