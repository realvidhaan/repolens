# RepoLens

**Understand any public GitHub repository in 60 seconds.**

Paste a repo URL and RepoLens returns an instant, streaming AI architecture
briefing, a live language/stats breakdown, and a chat that actually knows the
code — all in a polished dark bento dashboard.

The AI is **free** either way you run it: **Groq's** free hosted tier for a
public live demo, or a **local [Ollama](https://ollama.com)** model for fully
private, on-device use. No paid API keys, no usage bills.

## Features

- **Instant architecture briefing** — streams a structured Markdown report
  (Architecture Overview · Key Technical Patterns · Potential Bottlenecks)
  straight from the model.
- **Live repo metadata** — stars, forks, watchers, issues, language breakdown,
  topics, and license.
- **Repo-aware chat** — ask "where do I start?" and get answers grounded in the
  actual files, not vague guesses.
- **Aggressive token guardrails** — lockfiles, binaries, and generated output
  are stripped; files are prioritized (READMEs, entry points, configs, top-level
  source) and capped so even large repos fit the model's context window.

## Stack

- **Next.js 16** (App Router) + **TypeScript**
- **Tailwind CSS** + **lucide-react**
- **Groq** (hosted, free) or **Ollama** (local) via the **OpenAI-compatible
  SDK** (`openai`) — streaming
- **GitHub REST API** (public repos, no user auth)

Zero database, zero auth, zero stored state.

## Getting started (local, with Ollama)

```bash
# 1. Install Ollama (https://ollama.com), then pull a model:
ollama pull mistral

# 2. Start Ollama (if it isn't already running):
ollama serve

# 3. Install dependencies and run the app:
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No env file needed — it
talks to Ollama on `localhost` by default.

## Deploy a free live demo (with Groq)

So anyone can try it without installing Ollama, deploy with Groq's free hosted
API:

1. Get a free API key at **[console.groq.com/keys](https://console.groq.com/keys)**.
2. Import this repo into **[Vercel](https://vercel.com/new)** (free).
3. In the Vercel project's **Environment Variables**, add:
   `GROQ_API_KEY = gsk_...`
4. Deploy. That's it — RepoLens auto-detects the key and routes the AI through
   Groq. (Locally, with no key set, it keeps using Ollama.)

### Environment

Everything is **optional** — set nothing to run locally on Ollama.

| Variable          | Default                     | Purpose                                                 |
| ----------------- | --------------------------- | ------------------------------------------------------- |
| `GROQ_API_KEY`    | _(none)_                    | Enables Groq's free hosted AI (the live-demo path).     |
| `OLLAMA_BASE_URL` | `http://localhost:11434/v1` | Where local Ollama is listening.                        |
| `AI_MODEL`        | `mistral` / `llama-3.3-70b-versatile` | Override the model for either backend.        |
| `GITHUB_TOKEN`    | _(none)_                    | Raises GitHub rate limit 60 → 5,000 req/hr.             |

## How it works

```
src/
  lib/
    github.ts      -> parse URL, fetch + filter repo, build the context prompt
    ai.ts          -> AI client (Groq or Ollama), model, stream helper
  app/api/
    analyze/route.ts -> POST url -> stream Markdown report (+ meta in a header)
    chat/route.ts    -> POST url + messages -> stream repo-aware answers
  components/
    tiles/         -> MetaTile (A) · AnalysisTile (B) · ChatTile (C)
    markdown.tsx   -> themed GFM renderer for streamed output
    ui/            -> Card · Button · Input · ScrollArea · Skeleton
  app/page.tsx     -> hero input + bento dashboard orchestration
```

The repo metadata is sent in the `X-Repo-Meta` response header so Tile A paints
instantly while the analysis text streams into Tile B.

## Scope

Public repositories only. Private repos (OAuth), an editable diagram view, and
saved sessions are intentionally out of scope to keep the surface tight.
