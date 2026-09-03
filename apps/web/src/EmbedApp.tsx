import { useCallback } from "react";
import { Logo } from "./components/Logo.js";
import { ChatPane } from "./features/chat/ChatPane.js";
import { useChatSession } from "./features/chat/useChatSession.js";
import { useEmbedBridge } from "./features/embed/useEmbedBridge.js";

/**
 * The widget view: one thread, no sidebar, no conversation switching. Closing
 * is the host page's job, so the button asks rather than does.
 */
export default function EmbedApp() {
  const session = useChatSession();
  const requestClose = useEmbedBridge(useCallback(() => {}, []));

  return (
    <div className="flex h-full">
      <ChatPane
        session={session}
        compact
        header={
          <header className="relative z-10 flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line/70 px-3 backdrop-blur-sm">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-hi to-brand text-white">
                <Logo className="h-3.5 w-3.5" />
              </span>
              <span className="truncate text-[13px] font-medium text-ink/90">MaxiStep</span>
              <span className="hidden text-[11px] text-muted sm:inline">Support</span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={session.startNew}
                aria-label="Start a new conversation"
                title="New conversation"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
              <button
                type="button"
                onClick={requestClose}
                aria-label="Close chat"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          </header>
        }
      />
    </div>
  );
}
