"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/** Shared prose styling for streamed Markdown (analysis + chat). */
const components: Components = {
  h2: ({ children }) => (
    <h2 className="mt-6 mb-2.5 flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground first:mt-0">
      <span className="h-3.5 w-[3px] rounded-full bg-accent" />
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 mb-1.5 text-sm font-semibold text-foreground/90">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="my-2 text-[13.5px] leading-relaxed text-muted">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="my-2 space-y-1.5 text-[13.5px] text-muted">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1.5 pl-5 text-[13.5px] text-muted">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="relative pl-5 leading-relaxed marker:text-accent">
      <span className="absolute left-0 top-[0.55em] h-1.5 w-1.5 rounded-full bg-accent/60" />
      {children}
    </li>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-accent-2 underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) {
      return (
        <code
          className={cn(
            "block overflow-x-auto rounded-lg border border-border bg-[#0a0a0f] p-3.5 font-mono text-[12.5px] leading-relaxed text-foreground/90 scroll-thin",
            className,
          )}
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code className="rounded-md border border-border/70 bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-accent-2">
        {children}
      </code>
    );
  },
  pre: ({ children }) => <pre className="my-3">{children}</pre>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-warning/60 bg-warning/[0.06] px-3 py-1.5 text-[13px] text-muted">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto scroll-thin">
      <table className="w-full border-collapse text-[12.5px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border bg-surface-2 px-2.5 py-1.5 text-left font-medium text-foreground">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-border px-2.5 py-1.5 text-muted">{children}</td>
  ),
};

export function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-none", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
