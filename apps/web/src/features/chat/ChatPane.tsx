import { useEffect, useRef, type ReactNode } from "react";
import { MessageRow } from "../../components/Message.js";
import { StatusPill } from "../../components/Activity.js";
import { EmptyState } from "./EmptyState.js";
import { ThreadSkeleton } from "./ThreadSkeleton.js";
import type { ChatSession } from "./useChatSession.js";

interface ChatPaneProps {
  session: ChatSession;
  /** Rendered above the thread. The layout owns its own chrome. */
  header: ReactNode;
  /** Widget sizing: narrower gutters, reduced empty state, smaller controls. */
  compact?: boolean;
}

export function ChatPane({ session, header, compact = false }: ChatPaneProps) {
  const { messages, statusLabel, error, loadingThread, input, setInput, submit, busy, stop } =
    session;

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, statusLabel]);

  const gutter = compact ? "px-3" : "px-4 md:px-6";

  return (
    <main className="ambient relative flex min-w-0 flex-1 flex-col">
      {header}

      <div ref={scrollRef} className="grid-fade scroll-thin relative flex-1 overflow-y-auto">
        <div
          className={`relative z-10 mx-auto w-full ${compact ? "" : "max-w-3xl"} ${gutter} ${
            messages.length === 0 && !loadingThread
              ? `flex min-h-full items-center ${compact ? "py-6" : "py-10"}`
              : compact
                ? "py-5"
                : "py-8"
          }`}
        >
          {loadingThread ? (
            <ThreadSkeleton />
          ) : messages.length === 0 ? (
            <EmptyState onPick={submit} disabled={busy} compact={compact} />
          ) : (
            <div className="space-y-6">
              {messages.map((message) => (
                <MessageRow key={message.id} message={message} />
              ))}
            </div>
          )}

          {statusLabel && (
            <div className="mt-5 pl-10">
              <StatusPill label={statusLabel} />
            </div>
          )}

          {error && (
            <div className="mt-5 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-200">
              {error.message}
            </div>
          )}
        </div>
      </div>

      <div
        className={`relative z-10 border-t border-line/70 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${gutter} ${
          compact ? "" : "pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        }`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className={`mx-auto flex items-center gap-2 rounded-2xl border border-line bg-surface/80 p-1.5 shadow-lg shadow-black/30 backdrop-blur transition-colors focus-within:border-brand/45 ${
            compact ? "pl-3" : "max-w-3xl pl-4"
          }`}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={compact ? "Ask anything…" : "Ask about an order, a charge, or anything else…"}
            /* 16px minimum, or iOS zooms the whole page on focus. */
            className="min-w-0 flex-1 bg-transparent py-2.5 text-base outline-none placeholder:text-muted/70"
          />
          {busy ? (
            <button
              type="button"
              onClick={stop}
              className={`shrink-0 rounded-xl border border-line bg-surface-2 py-2.5 text-sm font-medium hover:bg-line active:bg-line ${
                compact ? "px-3" : "px-4 md:px-5"
              }`}
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={input.trim().length === 0}
              className={`shrink-0 rounded-xl bg-brand py-2.5 text-sm font-medium text-white transition-all hover:bg-brand-hi active:bg-brand-hi disabled:opacity-25 disabled:shadow-none ${
                compact ? "px-3" : "px-4 md:px-5"
              }`}
            >
              Send
            </button>
          )}
        </form>
      </div>
    </main>
  );
}
