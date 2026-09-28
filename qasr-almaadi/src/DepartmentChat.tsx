import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  LoaderCircle,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";
import { getLanguage, useLanguage } from "./i18n";
import { date, fmt, labels, type Row } from "./shared";
import "./chat.css";

type Colleague = { id: string; name: string; role: string; active?: boolean };
type Conversation = {
  id: string;
  kind: "group" | "direct";
  title: string;
  participants: Colleague[];
  last_message_at: string | null;
  message_count: number;
  can_send: boolean;
  is_participant: boolean;
};
type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  text: string;
  created_at: string;
};
type Directory = {
  current_user_id: string;
  can_review: boolean;
  colleagues: Colleague[];
  conversations: Conversation[];
};
type MessagePage = {
  conversation: Conversation;
  messages: ChatMessage[];
  has_more: boolean;
  next_before: string | null;
};
async function request<T>(
  path: string,
  body?: Row,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const stop = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", stop, { once: true });
  const timeout = window.setTimeout(stop, 12000);
  try {
    const response = await fetch("/api/chat" + path, {
      method: body ? "POST" : "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Accept-Language": getLanguage(),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    if (!response.ok)
      throw Error(
        result.error ||
          (getLanguage() === "en"
            ? "The request could not be completed."
            : "تعذّر إتمام الطلب."),
      );
    return result;
  } catch (error) {
    if (
      !signal?.aborted &&
      (error instanceof TypeError ||
        error instanceof SyntaxError ||
        controller.signal.aborted)
    ) {
      throw new Error(
        getLanguage() === "en"
          ? "Cannot reach the chat server. Your draft is retained; please retry."
          : "تعذّر الوصول إلى خادم المحادثات. احتُفظ بالمسودة؛ أعد المحاولة.",
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", stop);
  }
}
function mergeMessages(previous: ChatMessage[], incoming: ChatMessage[]) {
  const messages = new Map(previous.map((message) => [message.id, message]));
  incoming.forEach((message) => messages.set(message.id, message));
  return [...messages.values()].sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
}
export default function DepartmentChat({ user }: { user: Row }) {
  const english = useLanguage() === "en";
  const [directory, setDirectory] = useState<Directory | null>(null),
    [directoryError, setDirectoryError] = useState(""),
    [directoryLoading, setDirectoryLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(""),
    [conversation, setConversation] = useState<Conversation | null>(null),
    [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false),
    [messageError, setMessageError] = useState(""),
    [olderLoading, setOlderLoading] = useState(false),
    [pagination, setPagination] = useState({
      more: false,
      before: null as string | null,
    });
  const [query, setQuery] = useState(""),
    [recipientId, setRecipientId] = useState(""),
    [starting, setStarting] = useState(false),
    [startError, setStartError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({}),
    [sending, setSending] = useState<Record<string, boolean>>({}),
    [sendErrors, setSendErrors] = useState<Record<string, string>>({});
  const [mobileThread, setMobileThread] = useState(false),
    [retry, setRetry] = useState(0),
    [newMessages, setNewMessages] = useState(false);
  const selectedRef = useRef(""),
    directoryReading = useRef(false),
    mounted = useRef(true),
    draftRef = useRef(drafts),
    messageKeys = useRef(new Map<string, { text: string; key: string }>()),
    startKeys = useRef(new Map<string, string>());
  const messageController = useRef<AbortController | null>(null),
    olderController = useRef<AbortController | null>(null),
    scroller = useRef<HTMLDivElement>(null),
    initialScroll = useRef(true),
    knownMessages = useRef(new Set<string>());
  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      if (scroller.current)
        scroller.current.scrollTop = scroller.current.scrollHeight;
      setNewMessages(false);
    });
  }, []);
  draftRef.current = drafts;
  const choose = useCallback((id: string) => {
    if (selectedRef.current !== id) {
      setConversation(null);
      setMessages([]);
      setLoading(true);
    }
    selectedRef.current = id;
    setSelectedId(id);
    setMobileThread(true);
    setMessageError("");
    setNewMessages(false);
  }, []);
  const refreshDirectory = useCallback(async (signal?: AbortSignal) => {
    if (directoryReading.current) return;
    directoryReading.current = true;
    try {
      const result = await request<Directory>("", undefined, signal);
      if (!mounted.current || signal?.aborted) return;
      setDirectory(result);
      setDirectoryError("");
      setSelectedId((previous) => {
        if (
          previous &&
          result.conversations.some((item) => item.id === previous)
        )
          return previous;
        const first =
          result.conversations.find((item) => item.kind === "group")?.id ||
          result.conversations[0]?.id ||
          "";
        selectedRef.current = first;
        return first;
      });
    } catch (error) {
      if (mounted.current && !signal?.aborted)
        setDirectoryError(
          error instanceof Error && error.name !== "AbortError"
            ? error.message
            : getLanguage() === "en"
              ? "Cannot reach chat. Retry when the server is available."
              : "تعذّر الوصول إلى المحادثات. أعد المحاولة عند توفر الخادم.",
        );
    } finally {
      directoryReading.current = false;
      if (mounted.current) setDirectoryLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    directoryReading.current = false;
    void refreshDirectory(controller.signal);
    const update = () => {
      if (document.visibilityState === "visible")
        void refreshDirectory(controller.signal);
    };
    const timer = window.setInterval(update, 5000);
    document.addEventListener("visibilitychange", update);
    return () => {
      mounted.current = false;
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      messageController.current?.abort();
      olderController.current?.abort();
    };
  }, [refreshDirectory, user.id]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (Object.values(draftRef.current).some((value) => value.trim())) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  useEffect(() => {
    if (!selectedId) return;
    selectedRef.current = selectedId;
    let active = true,
      pending = false;
    const controller = new AbortController();
    messageController.current = controller;
    olderController.current?.abort();
    setConversation(null);
    setMessages([]);
    setLoading(true);
    setMessageError("");
    setOlderLoading(false);
    setPagination({ more: false, before: null });
    initialScroll.current = true;
    knownMessages.current = new Set();
    const read = async () => {
      if (pending || !active) return;
      pending = true;
      try {
        const result = await request<MessagePage>(
          "/conversations/" +
            encodeURIComponent(selectedId) +
            "/messages?limit=50",
          undefined,
          controller.signal,
        );
        if (!active || selectedRef.current !== selectedId) return;
        const isInitial = initialScroll.current;
        const atEnd =
          !scroller.current ||
          scroller.current.scrollHeight -
            scroller.current.scrollTop -
            scroller.current.clientHeight <
            95;
        setConversation(result.conversation);
        setMessageError("");
        const incoming = result.messages.some(
          (message) => !knownMessages.current.has(message.id),
        );
        result.messages.forEach((message) =>
          knownMessages.current.add(message.id),
        );
        if (!isInitial && incoming && !atEnd) setNewMessages(true);
        setMessages((previous) => mergeMessages(previous, result.messages));
        if (isInitial)
          setPagination({ more: result.has_more, before: result.next_before });
        initialScroll.current = false;
        if (isInitial || atEnd) scrollToEnd();
      } catch (error) {
        if (active && !controller.signal.aborted)
          setMessageError(
            error instanceof Error && error.name !== "AbortError"
              ? error.message
              : getLanguage() === "en"
                ? "Messages could not be refreshed. Displayed messages may be outdated."
                : "تعذّر تحديث الرسائل. قد تكون الرسائل المعروضة قديمة.",
          );
      } finally {
        pending = false;
        if (active) setLoading(false);
      }
    };
    void read();
    const update = () => {
      if (document.visibilityState === "visible") void read();
    };
    const timer = window.setInterval(update, 5000);
    document.addEventListener("visibilitychange", update);
    return () => {
      active = false;
      controller.abort();
      olderController.current?.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [selectedId, retry, scrollToEnd]);
  async function older() {
    if (!pagination.before || olderLoading || !selectedId) return;
    const id = selectedId;
    const controller = new AbortController();
    olderController.current = controller;
    setOlderLoading(true);
    const previousHeight = scroller.current?.scrollHeight || 0,
      previousTop = scroller.current?.scrollTop || 0;
    try {
      const result = await request<MessagePage>(
        "/conversations/" +
          encodeURIComponent(id) +
          "/messages?limit=50&before=" +
          encodeURIComponent(pagination.before),
        undefined,
        controller.signal,
      );
      if (!mounted.current || selectedRef.current !== id) return;
      setMessages((previous) => mergeMessages(previous, result.messages));
      result.messages.forEach((message) =>
        knownMessages.current.add(message.id),
      );
      setPagination({ more: result.has_more, before: result.next_before });
      setMessageError("");
      requestAnimationFrame(() => {
        if (scroller.current && selectedRef.current === id)
          scroller.current.scrollTop =
            previousTop + scroller.current.scrollHeight - previousHeight;
      });
    } catch (error) {
      if (
        !controller.signal.aborted &&
        mounted.current &&
        selectedRef.current === id
      )
        setMessageError(
          error instanceof Error
            ? error.message
            : english
              ? "Could not load older messages."
              : "تعذّر تحميل الرسائل الأقدم.",
        );
    } finally {
      if (mounted.current && selectedRef.current === id) setOlderLoading(false);
    }
  }
  async function startDirect() {
    if (!recipientId || starting) return;
    setStarting(true);
    setStartError("");
    let key = startKeys.current.get(recipientId);
    if (!key) {
      key = crypto.randomUUID();
      startKeys.current.set(recipientId, key);
    }
    try {
      const result = await request<Conversation>("/conversations", {
        recipient_id: recipientId,
        idempotency_key: key,
      });
      if (!mounted.current) return;
      setDirectory((previous) =>
        previous
          ? {
              ...previous,
              conversations: [
                result,
                ...previous.conversations.filter(
                  (item) => item.id !== result.id,
                ),
              ],
            }
          : previous,
      );
      choose(result.id);
      setRecipientId("");
      void refreshDirectory();
    } catch (error) {
      if (mounted.current)
        setStartError(
          error instanceof Error && error.name !== "AbortError"
            ? error.message
            : english
              ? "Could not open the conversation. Please retry."
              : "تعذّر فتح المحادثة. أعد المحاولة.",
        );
    } finally {
      if (mounted.current) setStarting(false);
    }
  }
  async function send() {
    const id = selectedId;
    const text = (drafts[id] || "").trim();
    if (
      !id ||
      !conversation?.can_send ||
      sending[id] ||
      !text ||
      text.length > 4000
    )
      return;
    let attempt = messageKeys.current.get(id);
    if (!attempt || attempt.text !== text) {
      attempt = { text, key: crypto.randomUUID() };
      messageKeys.current.set(id, attempt);
    }
    setSending((previous) => ({ ...previous, [id]: true }));
    setSendErrors((previous) => ({ ...previous, [id]: "" }));
    try {
      const result = await request<ChatMessage>(
        "/conversations/" + encodeURIComponent(id) + "/messages",
        { text, idempotency_key: attempt.key },
      );
      if (!mounted.current) return;
      setDrafts((previous) =>
        (previous[id] || "").trim() === text
          ? { ...previous, [id]: "" }
          : previous,
      );
      if (selectedRef.current === id) {
        knownMessages.current.add(result.id);
        setMessages((previous) => mergeMessages(previous, [result]));
        scrollToEnd();
      }
      void refreshDirectory();
    } catch (error) {
      if (mounted.current)
        setSendErrors((previous) => ({
          ...previous,
          [id]:
            error instanceof Error && error.name !== "AbortError"
              ? error.message
              : getLanguage() === "en"
                ? "Delivery could not be confirmed. Your draft is kept; retry sends the same request safely."
                : "تعذّر تأكيد الإرسال. احتُفظ بالمسودة؛ إعادة المحاولة تستخدم الطلب نفسه.",
        }));
    } finally {
      if (mounted.current)
        setSending((previous) => ({ ...previous, [id]: false }));
    }
  }
  const title = (item: Conversation) =>
    item.kind === "group"
      ? english
        ? "Department room"
        : "محادثة القسم"
      : item.title;
  const visible = (directory?.conversations || []).filter((item) =>
    title(item).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const draft = drafts[selectedId] || "";
  const currentUser = directory?.current_user_id || user.id;
  const selected = conversation?.id === selectedId ? conversation : null;
  const listed = directory?.conversations.find(
    (item) => item.id === selectedId,
  );
  return (
    <section
      className="department-chat"
      aria-label={english ? "Internal staff chat" : "المحادثات الداخلية للفريق"}
    >
      <div className="chat-oversight">
        <ShieldCheck size={20} />
        <div>
          <strong>
            {english
              ? "Internal staff conversations"
              : "محادثات فريق العمل الداخلية"}
          </strong>
          <p>
            {english
              ? "All department and direct conversations can be reviewed by the department manager and system administrator. Reviewing someone else’s direct conversation is read-only."
              : "جميع محادثات القسم والمحادثات المباشرة قابلة للمراجعة بواسطة مدير القسم ومسؤول النظام. مراجعة المحادثات المباشرة للآخرين تكون للقراءة فقط."}
          </p>
        </div>
      </div>
      <div
        className={"chat-workspace " + (mobileThread ? "chat-thread-open" : "")}
      >
        <aside
          className="chat-directory"
          aria-label={english ? "Conversations" : "المحادثات"}
        >
          <div className="chat-directory-head">
            <div>
              <MessageCircle size={21} />
              <h3>{english ? "Conversations" : "المحادثات"}</h3>
            </div>
            <button
              className="icon-button"
              aria-label={english ? "Refresh conversations" : "تحديث المحادثات"}
              onClick={() => void refreshDirectory()}
            >
              <RefreshCw size={17} />
            </button>
          </div>
          <label className="chat-search">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={english ? "Find a conversation…" : "ابحث عن محادثة…"}
              aria-label={english ? "Search conversations" : "بحث المحادثات"}
            />
          </label>
          <div className="chat-start">
            <label htmlFor="chat-recipient">
              {english ? "Message a colleague" : "محادثة زميل"}
            </label>
            <div>
              <select
                id="chat-recipient"
                value={recipientId}
                onChange={(event) => setRecipientId(event.target.value)}
                disabled={starting || !directory}
              >
                <option value="">
                  {english ? "Choose a colleague" : "اختر زميلًا"}
                </option>
                {directory?.colleagues
                  .filter((person) => person.id !== currentUser)
                  .map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name} · {labels[person.role] || person.role}
                    </option>
                  ))}
              </select>
              <button
                className="button primary"
                disabled={!recipientId || starting}
                onClick={() => void startDirect()}
                aria-label={
                  english ? "Open direct conversation" : "فتح محادثة مباشرة"
                }
              >
                {starting ? (
                  <LoaderCircle size={18} className="spin" />
                ) : (
                  <Plus size={19} />
                )}
              </button>
            </div>
            {startError && (
              <p className="chat-inline-error" role="alert">
                {startError}
              </p>
            )}
          </div>
          {directoryError && (
            <div className="chat-inline-error" role="alert">
              {directoryError}
              <button
                className="text-button"
                onClick={() => void refreshDirectory()}
              >
                {english ? "Retry" : "إعادة المحاولة"}
              </button>
            </div>
          )}
          {directory?.can_review && (
            <div className="chat-review-caption">
              <Eye size={14} />
              {english
                ? "Includes conversations available for your review"
                : "تشمل المحادثات المتاحة لمراجعتك"}
            </div>
          )}
          <div className="chat-conversation-list">
            {directoryLoading ? (
              <div className="chat-empty">
                <LoaderCircle className="spin" size={25} />
                {english ? "Loading conversations…" : "تحميل المحادثات…"}
              </div>
            ) : visible.length ? (
              visible.map((item) => (
                <button
                  className={
                    "chat-conversation " +
                    (item.id === selectedId ? "selected" : "")
                  }
                  key={item.id}
                  onClick={() => choose(item.id)}
                  aria-current={item.id === selectedId ? "true" : undefined}
                >
                  <span
                    className={
                      "chat-avatar " + (item.kind === "group" ? "group" : "")
                    }
                  >
                    {item.kind === "group" ? (
                      <Users size={20} />
                    ) : (
                      title(item).slice(0, 1)
                    )}
                  </span>
                  <span className="chat-conversation-copy">
                    <strong>{title(item)}</strong>
                    <small>
                      {!item.is_participant
                        ? english
                          ? "Review only"
                          : "للمراجعة فقط"
                        : item.kind === "group"
                          ? english
                            ? "All staff"
                            : "جميع العاملين"
                          : english
                            ? "Direct conversation"
                            : "محادثة مباشرة"}
                    </small>
                    {item.last_message_at && (
                      <time dateTime={item.last_message_at}>
                        {date(item.last_message_at, true)}
                      </time>
                    )}
                  </span>
                  <span
                    className="chat-conversation-count"
                    title={english ? "Saved messages" : "الرسائل المحفوظة"}
                  >
                    {fmt(item.message_count)}
                  </span>
                </button>
              ))
            ) : (
              <div className="chat-empty">
                <MessageCircle size={27} />
                {english
                  ? "No matching conversations"
                  : "لا توجد محادثات مطابقة"}
              </div>
            )}
          </div>
        </aside>
        <div className="chat-thread">
          <header className="chat-thread-head">
            <button
              className="icon-button chat-back"
              aria-label={
                english ? "Back to conversations" : "العودة للمحادثات"
              }
              onClick={() => setMobileThread(false)}
            >
              {english ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
            </button>
            <span className="chat-avatar group">
              {listed?.kind === "group" ? (
                <Users size={21} />
              ) : (
                <MessageCircle size={21} />
              )}
            </span>
            <div>
              <h3>
                {listed
                  ? title(listed)
                  : english
                    ? "Select a conversation"
                    : "اختر محادثة"}
              </h3>
              <p>
                {selected
                  ? selected.can_send
                    ? english
                      ? "Messages are sent with your own account"
                      : "تُرسل الرسائل باسم حسابك فقط"
                    : english
                      ? "Read-only conversation"
                      : "محادثة للقراءة فقط"
                  : english
                    ? "Internal hospital communication"
                    : "تواصل داخلي بالمستشفى"}
              </p>
            </div>
            {selected && !selected.can_send && (
              <span className="chat-read-badge">
                <Eye size={15} />
                {english ? "Read only" : "قراءة فقط"}
              </span>
            )}
          </header>
          {messageError && (
            <div className="chat-message-error" role="alert">
              <span>{messageError}</span>
              <button
                className="text-button"
                onClick={() => setRetry((value) => value + 1)}
              >
                {english ? "Retry" : "إعادة المحاولة"}
              </button>
            </div>
          )}
          <div
            className="chat-messages"
            ref={scroller}
            onScroll={() => {
              if (
                scroller.current &&
                scroller.current.scrollHeight -
                  scroller.current.scrollTop -
                  scroller.current.clientHeight <
                  95
              )
                setNewMessages(false);
            }}
            aria-label={english ? "Saved messages" : "الرسائل المحفوظة"}
            aria-busy={loading}
          >
            {loading ? (
              <div className="chat-empty">
                <LoaderCircle size={27} className="spin" />
                {english ? "Loading messages…" : "تحميل الرسائل…"}
              </div>
            ) : (
              <>
                {pagination.more && (
                  <div className="chat-older">
                    <button
                      className="button small"
                      disabled={olderLoading}
                      onClick={() => void older()}
                    >
                      {olderLoading ? (
                        <LoaderCircle size={16} className="spin" />
                      ) : (
                        <Clock3 size={16} />
                      )}{" "}
                      {english ? "Load older messages" : "تحميل رسائل أقدم"}
                    </button>
                  </div>
                )}
                {messages.length ? (
                  messages.map((message) => (
                    <article
                      className={
                        "chat-message " +
                        (message.sender_id === currentUser ? "own" : "")
                      }
                      key={message.id}
                    >
                      <div className="chat-message-author">
                        <strong>{message.sender_name}</strong>
                        <span>
                          {labels[message.sender_role] || message.sender_role}
                        </span>
                        {message.sender_id === currentUser && (
                          <b>{english ? "You" : "أنت"}</b>
                        )}
                      </div>
                      <p dir="auto">{message.text}</p>
                      <time dateTime={message.created_at}>
                        {date(message.created_at, true)}
                      </time>
                    </article>
                  ))
                ) : (
                  <div className="chat-empty">
                    <MessageCircle size={34} />
                    <strong>
                      {selectedId
                        ? english
                          ? "No messages yet"
                          : "لا توجد رسائل بعد"
                        : english
                          ? "Choose a conversation to begin"
                          : "اختر محادثة للبدء"}
                    </strong>
                    <span>
                      {selected?.can_send
                        ? english
                          ? "Send the first message to your colleagues."
                          : "أرسل أول رسالة إلى زملائك."
                        : english
                          ? "Saved messages will appear here."
                          : "تظهر هنا الرسائل المحفوظة."}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
          {newMessages && (
            <button className="chat-new button small" onClick={scrollToEnd}>
              <ArrowDown size={16} />
              {english ? "New messages below" : "رسائل جديدة بالأسفل"}
            </button>
          )}
          {selected?.can_send ? (
            <form
              className="chat-composer"
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              {sendErrors[selectedId] && (
                <div className="chat-inline-error" role="alert">
                  {sendErrors[selectedId]}
                  <span>
                    {english
                      ? "Your draft is retained. Retry with Send."
                      : "المسودة محفوظة في هذه الشاشة. أعد المحاولة بزر الإرسال."}
                  </span>
                </div>
              )}
              <label htmlFor="chat-message-text">
                {english ? "Your message" : "رسالتك"}
              </label>
              <textarea
                id="chat-message-text"
                value={draft}
                onChange={(event) =>
                  setDrafts((previous) => ({
                    ...previous,
                    [selectedId]: event.target.value,
                  }))
                }
                maxLength={4000}
                rows={3}
                placeholder={
                  english ? "Write to your colleagues…" : "اكتب لزملائك…"
                }
                disabled={!!sending[selectedId]}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    (event.ctrlKey || event.metaKey)
                  ) {
                    event.preventDefault();
                    void send();
                  }
                }}
              />
              <div className="chat-composer-foot">
                <span>
                  {fmt(draft.length)} / {fmt(4000)}
                  <small>
                    {english
                      ? "Ctrl + Enter to send · Times in Cairo"
                      : "Ctrl + Enter للإرسال · التوقيت: القاهرة"}
                  </small>
                </span>
                <button
                  type="submit"
                  className="button primary"
                  disabled={!draft.trim() || !!sending[selectedId]}
                >
                  {sending[selectedId] ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    <Send size={17} />
                  )}{" "}
                  {sending[selectedId]
                    ? english
                      ? "Sending…"
                      : "جارٍ الإرسال…"
                    : english
                      ? "Send"
                      : "إرسال"}
                </button>
              </div>
            </form>
          ) : selected ? (
            <div className="chat-readonly">
              <Eye size={21} />
              <div>
                <strong>
                  {english ? "Read-only access" : "اطلاع للقراءة فقط"}
                </strong>
                <p>
                  {!selected.is_participant
                    ? english
                      ? "You are reviewing other colleagues’ conversation. You cannot send or reply in it."
                      : "أنت تراجع محادثة بين زملاء آخرين. لا يمكنك الإرسال أو الرد فيها."
                    : english
                      ? "Sending is unavailable for this conversation."
                      : "الإرسال غير متاح لهذه المحادثة."}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
