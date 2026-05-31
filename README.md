# RepoLens

**Understand any public GitHub repository in 60 seconds.**

Paste a repo URL and RepoLens returns an instant, streaming AI architecture
briefing, a live language/stats breakdown, and a chat that actually knows the
code — all in a polished dark bento dashboard.

The AI runs **locally via [Ollama](https://ollama.com)**, so every analysis is
**completely free** — no API keys, no usage limits, no data leaving your machine.

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
  source) and capped so even large repos fit a local model's context window.

## Stack

- **Next.js 16** (App Router) + **TypeScript**
- **Tailwind CSS** + **lucide-react**
- **Ollama** via the **OpenAI-compatible SDK** (`openai`), default model
  `mistral` — runs locally, streaming
- **GitHub REST API** (public repos, no user auth)

Zero database, zero auth, zero stored state.

## Getting started

You need [Ollama](https://ollama.com) installed and running.

```bash
# 1. Install Ollama (https://ollama.com), then pull a model:
ollama pull mistral

# 2. Start Ollama (if it isn't already running):
ollama serve

# 3. Install dependencies and run the app:
npm install
cp .env.example .env.local   # optional — defaults work out of the box
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment

Everything works with zero configuration. All variables are **optional**:

| Variable          | Default                       | Purpose                                       |
| ----------------- | ----------------------------- | --------------------------------------------- |
| `OLLAMA_MODEL`    | `mistral`                     | Which local model to use.                     |
| `OLLAMA_BASE_URL` | `http://localhost:11434/v1`   | Where Ollama is listening.                    |
| `GITHUB_TOKEN`    | _(none)_                      | Raises GitHub rate limit 60 → 5,000 req/hr.   |

## How it works

```
src/
  lib/
    github.ts      -> parse URL, fetch + filter repo, build the context prompt
    ai.ts          -> Ollama client (OpenAI-compatible), model, stream helper
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

## Note on hosting

Because the AI runs on a local Ollama instance, RepoLens is designed to **run on
your own machine** — there's no live public demo, since a cloud deploy couldn't
reach the model running on `localhost`. Clone it, run Ollama, and you're set.
