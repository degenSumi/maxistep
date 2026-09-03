import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { SupportUIMessage } from "@repo/api";
import type { ConversationSummary } from "@repo/shared";
import { api, CHAT_ENDPOINT } from "../../lib/api.js";
import { toUIMessages } from "../../lib/messages.js";

export interface ChatSession {
  messages: SupportUIMessage[];
  conversations: ConversationSummary[];
  conversationId: string | null;
  activeTitle: string;
  input: string;
  setInput: (value: string) => void;
  busy: boolean;
  error: Error | undefined;
  statusLabel: string | null;
  loadingThread: boolean;
  submit: (text: string) => void;
  stop: () => void;
  openConversation: (id: string) => Promise<void>;
  startNew: () => void;
  removeConversation: (id: string) => Promise<void>;
}

/**
 * Owns every piece of chat state and none of the layout. Both the full
 * application and the embedded widget render from one of these.
 */
export function useChatSession(): ChatSession {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loadingThread, setLoadingThread] = useState(false);

  // The transport closure is created once, so it would otherwise capture the
  // conversation id from first render forever. A ref keeps it current.
  const conversationIdRef = useRef<string | null>(null);
  conversationIdRef.current = conversationId;

  // Loaded threads are kept so re-opening one is instant instead of a round trip.
  const messageCacheRef = useRef(new Map<string, SupportUIMessage[]>());

  const refreshConversations = useCallback(async () => {
    const response = await api.api.chat.conversations.$get({ query: {} });
    if (!response.ok) return;
    const data = await response.json();
    setConversations(data.conversations as ConversationSummary[]);
  }, []);

  const { messages, sendMessage, setMessages, status, error, stop } = useChat<SupportUIMessage>({
    transport: new DefaultChatTransport({
      api: CHAT_ENDPOINT,
      // The server owns history — context assembly and compaction read from the DB.
      prepareSendMessagesRequest: ({ messages: outgoing }) => {
        const last = outgoing.at(-1);
        const text =
          last?.parts
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("") ?? "";

        return {
          body: {
            ...(conversationIdRef.current ? { conversationId: conversationIdRef.current } : {}),
            message: text,
          },
        };
      },
    }),

    onData: (part) => {
      // Transient status parts exist only here — they never reach message.parts.
      if (part.type === "data-status") {
        setStatusLabel(part.data.label);
      }
      // A brand-new thread learns its id from the first part of the stream.
      if (part.type === "data-conversation") {
        setConversationId(part.data.id);
        conversationIdRef.current = part.data.id;
      }
    },
  });

  const busy = status === "submitted" || status === "streaming";
  const activeTitle =
    conversations.find((conversation) => conversation.id === conversationId)?.title ??
    "New conversation";

  // Clear the "working" pill and resync the sidebar once a turn settles.
  useEffect(() => {
    if (busy) return;
    setStatusLabel(null);
    if (conversationIdRef.current) messageCacheRef.current.delete(conversationIdRef.current);
    void refreshConversations();
  }, [busy, refreshConversations]);

  useEffect(() => {
    void refreshConversations();
  }, [refreshConversations]);

  const openConversation = useCallback(
    async (id: string) => {
      if (busy) stop();

      // Select first, fetch second — the caller's UI reacts immediately rather
      // than after the network settles.
      setConversationId(id);
      conversationIdRef.current = id;

      const cached = messageCacheRef.current.get(id);
      if (cached) {
        setMessages(cached);
        setLoadingThread(false);
        return;
      }

      setMessages([]);
      setLoadingThread(true);
      try {
        const response = await api.api.chat.conversations[":id"].$get({ param: { id } });
        if (!response.ok) return;
        const data = await response.json();
        const loaded = toUIMessages(data.messages as Parameters<typeof toUIMessages>[0]);
        messageCacheRef.current.set(id, loaded);
        // A newer click may have landed while this was in flight.
        if (conversationIdRef.current === id) setMessages(loaded);
      } finally {
        // A slower request for a thread the user has already navigated away from
        // must not clear the spinner belonging to the newer one.
        if (conversationIdRef.current === id) setLoadingThread(false);
      }
    },
    [busy, stop, setMessages],
  );

  const startNew = useCallback(() => {
    if (busy) stop();
    setConversationId(null);
    conversationIdRef.current = null;
    setMessages([]);
  }, [busy, stop, setMessages]);

  const removeConversation = useCallback(
    async (id: string) => {
      messageCacheRef.current.delete(id);
      await api.api.chat.conversations[":id"].$delete({ param: { id } });
      if (conversationIdRef.current === id) startNew();
      void refreshConversations();
    },
    [startNew, refreshConversations],
  );

  const submit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || busy) return;
      setInput("");
      void sendMessage({ text: trimmed });
    },
    [busy, sendMessage],
  );

  return {
    messages,
    conversations,
    conversationId,
    activeTitle,
    input,
    setInput,
    busy,
    error,
    statusLabel,
    loadingThread,
    submit,
    stop,
    openConversation,
    startNew,
    removeConversation,
  };
}
