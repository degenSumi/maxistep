import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar.js";
import { Logo } from "./components/Logo.js";
import { ChatPane } from "./features/chat/ChatPane.js";
import { AGENT_LEGEND } from "./features/chat/constants.js";
import { useChatSession } from "./features/chat/useChatSession.js";

export default function App() {
  const session = useChatSession();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    // Without this the page scrolls underneath the open drawer on iOS.
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [navOpen]);

  // The drawer belongs to this layout, so closing it is wrapped here rather
  // than baked into the session.
  const selectConversation = useCallback(
    (id: string) => {
      setNavOpen(false);
      void session.openConversation(id);
    },
    [session],
  );

  const startNew = useCallback(() => {
    setNavOpen(false);
    session.startNew();
  }, [session]);

  return (
    <div className="flex h-full">
      {navOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
        />
      )}

      <div
        id="conversation-nav"
        className={`fixed inset-y-0 left-0 z-40 w-[min(20rem,85vw)] transition-transform duration-200 ease-out md:static md:z-auto md:w-auto md:translate-x-0 md:transition-none ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar
          conversations={session.conversations}
          activeId={session.conversationId}
          busy={session.busy}
          onSelect={selectConversation}
          onNew={startNew}
          onDelete={session.removeConversation}
        />
      </div>

      <ChatPane
        session={session}
        header={
          <header className="relative z-10 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line/70 px-4 backdrop-blur-sm md:px-6">
            {/* min-w-0 is what lets the title actually truncate inside a flex row. */}
            <div className="flex min-w-0 items-center gap-2 text-[13px] text-muted">
              <button
                type="button"
                onClick={() => setNavOpen(true)}
                aria-label="Open conversations"
                aria-expanded={navOpen}
                aria-controls="conversation-nav"
                className="-ml-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink/80 active:bg-surface-2 md:hidden"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>
              <Logo className="hidden h-4 w-4 shrink-0 text-brand md:block" />
              <span className="hidden shrink-0 text-ink/80 md:inline">MaxiStep</span>
              <span className="hidden shrink-0 text-line md:inline">/</span>
              <span className="truncate">{session.activeTitle}</span>
            </div>
            <div className="hidden items-center gap-3 md:flex">
              {AGENT_LEGEND.map(({ label, dot }) => (
                <span key={label} className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                  {label}
                </span>
              ))}
            </div>
          </header>
        }
      />
    </div>
  );
}
