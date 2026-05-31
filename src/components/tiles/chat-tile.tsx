"use client";

import { useEffect, useRef, useState } from "react";
import { MessagesSquare, ArrowUp, Bot, User } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "What should I read first?",
  "Explain the architecture",
  "How is state managed?",
  "Where's the entry point?",
];

export function ChatTile({
  repoUrl,
  ready,
}: {
  repoUrl: string | null;
  ready: boolean;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Reset the conversation whenever a new repo is analyzed.
  useEffect(() => {
    setMessages([]);
    setInput("");
  }, [repoUrl]);

  // Keep the view pinned to the latest message as content streams in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming || !repoUrl) return;

    const history: Msg[] = [...messages, { role: "user", content: trimmed }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: repoUrl, messages: history }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Chat request failed.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: acc };
          return next;
        });
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          role: "assistant",
          content: `> ⚠️ ${(err as Error).message}`,
        };
        return next;
      });
    } finally {
      setStreaming(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <Card className="flex h-full flex-col animate-tile-in [animation-delay:120ms]">
      <CardHeader>
        <MessagesSquare className="h-4 w-4 text-accent-2" strokeWidth={2} />
        <CardTitle>Ask the repo</CardTitle>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-0">
        <ScrollArea ref={scrollRef} className="min-h-0 flex-1 px-5 py-4">
          {empty ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div className="rounded-2xl border border-border bg-surface-2/50 p-3">
                <Bot className="h-6 w-6 text-accent-2" />
              </div>
              <p className="max-w-[14rem] text-[13px] leading-relaxed text-muted">
                Ask anything about this repository — its structure, patterns, or
                where to start reading.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex gap-2.5",
                    m.role === "user" && "flex-row-reverse",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border",
                      m.role === "user"
                        ? "border-accent/30 bg-accent/15 text-accent-2"
                        : "border-border bg-surface-2 text-muted",
                    )}
                  >
                    {m.role === "user" ? (
                      <User className="h-3.5 w-3.5" />
                    ) : (
                      <Bot className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div
                    className={cn(
                      "min-w-0 max-w-[85%] rounded-2xl px-3.5 py-2",
                      m.role === "user"
                        ? "bg-accent/15 text-[13.5px] leading-relaxed text-foreground"
                        : "border border-border bg-surface-2/40",
                    )}
                  >
                    {m.role === "user" ? (
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    ) : m.content.length === 0 ? (
                      <span className="text-[13px] text-muted-2 stream-caret" />
                    ) : (
                      <Markdown
                        className={cn(
                          streaming &&
                            i === messages.length - 1 &&
                            "stream-caret",
                        )}
                      >
                        {m.content}
                      </Markdown>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Suggested prompts (only before the first message) */}
        {empty && ready && (
          <div className="flex flex-wrap gap-2 px-5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-border bg-surface-2/50 px-3 py-1.5 text-[12px] text-muted transition-colors hover:border-accent/40 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 border-t border-border/70 p-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!ready || streaming}
            placeholder={ready ? "Ask about this repo…" : "Analyze a repo first…"}
            className="h-10 flex-1 rounded-xl border border-border bg-surface-2/40 px-3.5 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-2 focus:border-accent/50 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!ready || streaming || !input.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white transition-all hover:bg-accent-2 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
            aria-label="Send"
          >
            <ArrowUp className="h-4.5 w-4.5" strokeWidth={2.5} />
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
