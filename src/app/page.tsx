"use client";

import { useCallback, useRef, useState } from "react";
import {
  Search,
  Loader2,
  Globe,
  ArrowLeft,
  ScanSearch,
  Boxes,
} from "lucide-react";
import type { RepoMeta } from "@/lib/github";
import { MetaTile } from "@/components/tiles/meta-tile";
import { AnalysisTile } from "@/components/tiles/analysis-tile";
import { ChatTile } from "@/components/tiles/chat-tile";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "vercel/next.js",
  "facebook/react",
  "honojs/hono",
  "tailwindlabs/tailwindcss",
];

// Lightweight client-side validation that mirrors the server parser.
const REPO_RE =
  /^(?:https?:\/\/)?(?:www\.)?github\.com\/[\w.-]+\/[\w.-]+(?:\/.*)?$|^[\w.-]+\/[\w.-]+$/i;

type View = "hero" | "dashboard";

export default function Home() {
  const [view, setView] = useState<View>("hero");
  const [input, setInput] = useState("");
  const [repoUrl, setRepoUrl] = useState<string | null>(null);

  const [meta, setMeta] = useState<RepoMeta | null>(null);
  const [partial, setPartial] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const valid = REPO_RE.test(input.trim());

  const analyze = useCallback(async (url: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setView("dashboard");
    setRepoUrl(url);
    setMeta(null);
    setPartial(false);
    setAnalysis("");
    setError(null);
    setStreaming(true);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Analysis failed. Please try again.");
      }

      // Metadata rides along in a header so Tile A paints immediately.
      const metaHeader = res.headers.get("X-Repo-Meta");
      if (metaHeader) {
        try {
          const parsed = JSON.parse(decodeURIComponent(metaHeader));
          setMeta(parsed.meta);
          setPartial(Boolean(parsed.partial));
        } catch {
          /* non-fatal */
        }
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setAnalysis(acc);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
    } finally {
      setStreaming(false);
    }
  }, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    analyze(input.trim());
  }

  function reset() {
    abortRef.current?.abort();
    setView("hero");
    setRepoUrl(null);
    setMeta(null);
    setAnalysis("");
    setError(null);
    setStreaming(false);
  }

  return (
    <main className="bg-mesh relative min-h-dvh">
      {/* ---- Top bar ---- */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <button
          onClick={reset}
          className="group flex items-center gap-2.5 text-left"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/15 ring-1 ring-accent/30">
            <ScanSearch className="h-[18px] w-[18px] text-accent-2" strokeWidth={2} />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            Repo<span className="text-accent-2">Lens</span>
          </span>
        </button>
        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1.5 text-[13px] text-muted transition-colors hover:text-foreground"
        >
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline">Public repos only</span>
        </a>
      </header>

      {view === "hero" ? (
        <HeroView
          input={input}
          setInput={setInput}
          valid={valid}
          onSubmit={onSubmit}
          onExample={(e) => {
            setInput(e);
            analyze(e);
          }}
        />
      ) : (
        <section className="mx-auto max-w-6xl px-5 pb-16">
          {/* Mini search to re-run on another repo */}
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              onClick={reset}
              className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-2 text-[13px] text-muted transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              New
            </button>
            <form
              onSubmit={onSubmit}
              className={cn(
                "flex h-11 flex-1 items-center gap-2 rounded-xl border bg-surface/70 px-3.5 transition-colors",
                input && !valid ? "border-danger/50" : "border-border",
              )}
            >
              <Search className="h-4 w-4 shrink-0 text-muted-2" />
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="owner/repo or github.com URL"
                className="h-full flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-2"
              />
              <button
                type="submit"
                disabled={!valid || streaming}
                className="rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-white transition-all hover:bg-accent-2 active:scale-95 disabled:opacity-40"
              >
                {streaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Analyze"
                )}
              </button>
            </form>
          </div>

          {/* ---- Bento grid ---- */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-12">
              {meta ? (
                <MetaTile meta={meta} />
              ) : (
                <MetaTileSkeleton error={error && !meta ? error : null} />
              )}
            </div>
            <div className="lg:col-span-7 lg:min-h-[34rem]">
              <AnalysisTile
                text={analysis}
                streaming={streaming}
                error={error}
                partial={partial}
              />
            </div>
            <div className="lg:col-span-5 lg:min-h-[34rem]">
              <ChatTile repoUrl={repoUrl} ready={Boolean(meta) && !error} />
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

/* -------------------------------------------------------------------------- */

function HeroView({
  input,
  setInput,
  valid,
  onSubmit,
  onExample,
}: {
  input: string;
  setInput: (v: string) => void;
  valid: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onExample: (e: string) => void;
}) {
  return (
    <section className="mx-auto flex max-w-3xl flex-col items-center px-5 pt-[12vh] text-center sm:pt-[16vh]">
      <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3.5 py-1.5 text-[12.5px] text-muted">
        <Boxes className="h-3.5 w-3.5 text-accent-2" />
        Understand any codebase in 60 seconds
      </span>

      <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-foreground sm:text-6xl">
        See any GitHub repo
        <br />
        <span className="bg-gradient-to-r from-accent-2 via-accent to-[#38bdf8] bg-clip-text text-transparent">
          through a clear lens
        </span>
      </h1>

      <p className="mt-5 max-w-xl text-balance text-[15px] leading-relaxed text-muted sm:text-base">
        Paste a public repository and get an instant architecture briefing, a
        live language breakdown, and a chat that actually knows the code.
      </p>

      <form
        onSubmit={onSubmit}
        className={cn(
          "mt-9 flex h-14 w-full max-w-xl items-center gap-2 rounded-2xl border bg-surface/80 px-3 backdrop-blur-sm transition-all",
          "shadow-[0_20px_60px_-25px_var(--accent-glow)]",
          input && !valid
            ? "border-danger/50"
            : "border-border focus-within:border-accent/50",
        )}
      >
        <Search className="ml-1.5 h-5 w-5 shrink-0 text-muted-2" />
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="vercel/next.js"
          className="h-full flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-2"
        />
        <button
          type="submit"
          disabled={!valid}
          className="flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-[14px] font-medium text-white transition-all hover:bg-accent-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Analyze
        </button>
      </form>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <span className="text-[12.5px] text-muted-2">Try:</span>
        {EXAMPLES.map((e) => (
          <button
            key={e}
            onClick={() => onExample(e)}
            className="rounded-full border border-border bg-surface/50 px-3 py-1.5 font-mono text-[12px] text-muted transition-colors hover:border-accent/40 hover:text-foreground"
          >
            {e}
          </button>
        ))}
      </div>
    </section>
  );
}

function MetaTileSkeleton({ error }: { error: string | null }) {
  if (error) {
    return (
      <div className="rounded-[var(--radius)] border border-danger/30 bg-danger/[0.06] px-5 py-4 text-[13.5px] text-danger">
        {error}
      </div>
    );
  }
  return (
    <div className="animate-tile-in rounded-[var(--radius)] border border-border bg-surface/80 px-5 py-5">
      <div className="space-y-4">
        <div className="h-5 w-56 animate-pulse rounded bg-surface-2" />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl bg-surface-2"
            />
          ))}
        </div>
        <div className="h-2 w-full animate-pulse rounded-full bg-surface-2" />
      </div>
    </div>
  );
}
