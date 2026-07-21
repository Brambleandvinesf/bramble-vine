import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useViewAs } from "../lib/view-as";
import { canSee } from "../lib/permissions";
import { sessionCache } from "../lib/session-cache";
import { RefreshDot } from "../components/RefreshDot";
import { useAuth } from "../lib/auth";
import { ensureAudioContext, playCrowShriek } from "../lib/crow-sound";

const CK = "messages:getInbox";

export const Route = createFileRoute("/messages")({
  head: () => ({
    meta: [
      { title: "Bramble & Vine — Message Center" },
      { name: "description", content: "Unified Gmail + Quo inbox for the Bramble & Vine crew." },
    ],
  }),
  component: MessagesPage,
});

/* ============ CONFIG (byte-identical to messages.html v24) ============ */
const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwZlJn9jKzzYfcFglDmVGV3l-FTYib0D3mNdILivsB1477aMym68NViDCwia26_JH4siQ/exec";
const POLL_MS = 300000;
const PING_MS = 10000;
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const CREW = ["+16507105061", "+14152343696"];
const MAX_FILE = 10 * 1024 * 1024;
const MAX_TOTAL = 18 * 1024 * 1024;

/* ============ Internal sender mapping (delta #2) ============ */
const INTERNAL_EMAILS: Record<string, string> = {
  "brandon@brambleandvinesf.com": "MANAGEMENT",
  "info@brambleandvinesf.com": "OFFICE ASSISTANT",
  "angel@brambleandvinesf.com": "FIELD LEAD",
  "thornsandtendrils@brambleandvinesf.com": "FIELD ASSISTANT",
};
const INTERNAL_PHONES: Record<string, string> = {
  "+14152343695": "MANAGEMENT",
  "+16507105061": "FIELD LEAD",
  "+14152343696": "FIELD ASSISTANT",
};
const INTERNAL_LOGO = "/bvlogo-card-128.png";

function internalRoleFor(it: InboxItem): string | null {
  if (it.source === "gmail") {
    const e = (it.fromEmail || "").trim().toLowerCase();
    if (e && INTERNAL_EMAILS[e]) return INTERNAL_EMAILS[e];
    return null;
  }
  const parts = it.participants || [];
  for (const p of parts) {
    const norm = String(p || "").replace(/[^\d+]/g, "");
    if (INTERNAL_PHONES[norm]) return INTERNAL_PHONES[norm];
  }
  return null;
}

/* ============ Types ============ */
type Attachment = { name: string; mime: string; data: string; size: number };
type ThreadAttachment = { name: string; mime: string; data?: string; size: number };
type ThreadMessage = { from?: string; body: string; date: string; attachments?: ThreadAttachment[] };
type QuoMessage = { direction: "incoming" | "outgoing"; body: string; date: string };

type InboxItem = {
  id: string;
  source: "gmail" | "quo";
  from: string;
  fromEmail?: string;
  subject?: string;
  snippet?: string;
  date: string;
  unread?: boolean;
  awaiting?: boolean;
  isClient?: boolean;
  confirmed?: boolean;
  threadId: string;
  conversationId?: string;
  participants?: string[];
  unknowns?: string[];
  ruleLabel?: string;
  line?: string;
};
type InboxResponse = {
  inbox?: InboxItem[];
  labels?: string[];
  contacts?: { r: string; n: string }[];
  clients?: string[];
  nextVisit?: { title: string; start: string } | null;
};
type Contact = { r: string; n: string };

const CONFIRMED_KEY = "bv-confirmed-visits";
function getConfirmedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(CONFIRMED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}
function saveConfirmedIds(ids: Set<string>) {
  try {
    localStorage.setItem(CONFIRMED_KEY, JSON.stringify([...ids]));
  } catch {}
}

/* ============ Icons (line art via SVG) ============ */
function IconSmile() {
  return (
    <svg viewBox="0 0 24 24" width="1.3em" height="1.3em" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5c.9 1.2 2.1 1.9 3.5 1.9s2.6-.7 3.5-1.9" />
      <circle cx="9" cy="9.6" r=".7" fill="currentColor" stroke="none" />
      <circle cx="15" cy="9.6" r=".7" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconClip() {
  return (
    <svg viewBox="0 0 24 24" width="1.3em" height="1.3em" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
function IconPoo() {
  return (
    <svg viewBox="0 0 24 24" width="1.3em" height="1.3em" fill="currentColor">
      <path d="M12 2c-.6 1.6.4 2.4 1.5 3.1.9.6 1.8 1.3 1.6 2.8 1.9.2 3.2 1.5 3.2 3.2 0 .6-.2 1.2-.5 1.7 1.4.5 2.2 1.5 2.2 2.9 0 2.1-1.9 3.5-4.6 3.5H8.6C5.9 19.2 4 17.8 4 15.7c0-1.4.8-2.4 2.2-2.9-.3-.5-.5-1.1-.5-1.7 0-1.7 1.3-3 3.2-3.2-.1-1.8 1.1-2.5 2.1-3.2.9-.6 1.4-1.4 1-2.7z" />
    </svg>
  );
}
function IconFs() {
  return (
    <svg viewBox="0 0 24 24" width="1.3em" height="1.3em" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 10l6-6M20 4v5M20 4h-5M10 14l-6 6M4 20v-5M4 20h5M14 14l6 6M20 20v-5M20 20h-5M10 10L4 4M4 4v5M4 4h5" />
    </svg>
  );
}
function IconRcpt() {
  return (
    <svg viewBox="0 0 24 24" width="1.3em" height="1.3em" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 2h14v20l-2.5-1.8L14 22l-2-1.6L10 22l-2.5-1.8L5 22zM9 7h6M9 11h6M13 15h2" />
    </svg>
  );
}
function IconConf() {
  return (
    <svg viewBox="0 0 24 24" width="1.3em" height="1.3em" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="17" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18M9 16l2 2 4-4" />
    </svg>
  );
}
function IconHandset() {
  return (
    <svg viewBox="0 0 24 24" width="1.1em" height="1.1em" fill="currentColor" style={{ verticalAlign: -2 }}>
      <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
    </svg>
  );
}
function SrcIcon({ source }: { source: string }) {
  if (source === "quo") return <IconHandset />;
  if (source === "gmail") return <>{"\u2709"}</>;
  return <>{"\u2022"}</>;
}

/* ============ Utils ============ */
function rel(iso?: string) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  return Math.floor(s / 86400) + "d";
}
function fmtSize(n: number) {
  return n > 1048576 ? (n / 1048576).toFixed(1) + "MB" : Math.max(1, Math.round(n / 1024)) + "KB";
}
async function postAction(body: Record<string, unknown>): Promise<any> {
  try {
    const r = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(body),
    });
    return await r.json();
  } catch {
    return null;
  }
}

/* ============ Emoji ============ */
const EMOJI_FAVES = [
  "\u{1F60A}", "\u{1F44D}", "\u{1F64F}", "\u2705", "\u{1F389}", "\u{1F49A}",
  "\u{1F331}", "\u{1F33F}", "\u{1F338}", "\u{1F33B}", "\u{1FAB4}", "\u{1F333}",
  "\u2600\uFE0F", "\u{1F327}\uFE0F", "\u{1F4A7}", "\u{1F41B}", "\u{1F41D}", "\u{1F98B}",
  "\u{1F4C5}", "\u{1F550}", "\u{1F4F8}", "\u{1F4CD}", "\u{1F69A}", "\u{1F9F0}",
  "\u2702\uFE0F", "\u2757", "\u2753", "\u{1F91D}", "\u{1F604}", "\u{1F970}",
];
function emojiRange(a: number, b: number, vs?: boolean) {
  const out: string[] = [];
  for (let c = a; c <= b; c++) out.push(String.fromCodePoint(c) + (vs ? "\uFE0F" : ""));
  return out;
}
const EMOJI: string[] = ([] as string[]).concat(
  EMOJI_FAVES,
  emojiRange(0x1F600, 0x1F64F),
  emojiRange(0x1F900, 0x1F9FF),
  emojiRange(0x1FA70, 0x1FAF8),
  emojiRange(0x1F300, 0x1F5FF),
  emojiRange(0x1F680, 0x1F6FC),
  emojiRange(0x1F947, 0x1F94F),
  emojiRange(0x2600, 0x26FF, true),
  emojiRange(0x2700, 0x27BF, true),
);

/* ============ Theme ============ */
const T = {
  bg: "#0a0a0a",
  panel: "#121212",
  panel2: "#181818",
  lime: "#7cff00",
  brightLime: "#bfff3c",
  dim: "#4a7a1e",
  muted: "#8f8f8f",
  border: "#2a2a2a",
  red: "#ff3b30",
};
const fontStack = "'Courier New', Courier, monospace";

/* ============ Component ============ */
function MessagesPage() {
  const { effectiveRole } = useViewAs();
  const { email } = useAuth();
  const navigate = useNavigate();
  const allowed = canSee(effectiveRole, "messages");
  const showReceipt = effectiveRole === "lead" || effectiveRole === "management";
  const showLineBadge = effectiveRole === "management";

  useEffect(() => {
    if (!allowed) void navigate({ to: "/" });
  }, [allowed, navigate]);
  if (!allowed) return null;
  if (!email) return null;

  return <MessagesInner showReceipt={showReceipt} showLineBadge={showLineBadge} email={email} />;
}

function MessagesInner({ showReceipt, showLineBadge, email }: { showReceipt: boolean; showLineBadge: boolean; email: string }) {
  const cached = sessionCache.get<InboxResponse>(CK);
  // Feed state
  const [items, setItems] = useState<InboxItem[]>(() => cached?.inbox ?? []);
  const [labels, setLabels] = useState<string[]>(() => cached?.labels ?? []);
  const [contacts, setContacts] = useState<Contact[]>(() => cached?.contacts ?? []);
  const [clients, setClients] = useState<string[]>(() => cached?.clients ?? []);
  const [nextVisit, setNextVisit] = useState<{ title: string; start: string } | null>(
    () => cached?.nextVisit ?? null,
  );
  const [feedError, setFeedError] = useState(false);
  const [feedLoaded, setFeedLoaded] = useState<boolean>(() => !!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);

  // Optimistic
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [awaitingOverride, setAwaitingOverride] = useState<Record<string, boolean>>({});
  const [staged, setStaged] = useState<Record<string, Attachment[]>>({});
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(getConfirmedIds);

  // Default view filters to threads awaiting our reply; "Show all" reveals everything
  const [showAll, setShowAll] = useState(false);

  // Crow shriek on new messages
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Compose (new outbound message)
  const [compose, setCompose] = useState<{
    q: string;
    picked: { phone: string; name: string } | null;
    manual: string;
    text: string;
  } | null>(null);

  // Flash / new-client green flash
  const [flashMsg, setFlashMsg] = useState<{ text: string; warn: boolean } | null>(null);
  const flashTimer = useRef<number | null>(null);
  const flash = useCallback((text: string, warn = false) => {
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    setFlashMsg({ text, warn });
    flashTimer.current = window.setTimeout(() => setFlashMsg(null), 6000);
  }, []);
  const [greenFlash, setGreenFlash] = useState(0);
  const seenClientIdsRef = useRef<string[] | null>(null);

  // Viewer
  const [openItem, setOpenItem] = useState<InboxItem | null>(null);
  const [viewerBody, setViewerBody] = useState<
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "gmail"; messages: ThreadMessage[] }
    | { kind: "quo"; messages: QuoMessage[]; from: string }
    | null
  >(null);
  const [vReply, setVReply] = useState("");

  // Search
  const [searchQ, setSearchQ] = useState("");
  const [foundId, setFoundId] = useState<string | null>(null);

  // Pickers
  const [labelPick, setLabelPick] = useState<{ item: InboxItem; q: string } | null>(null);
  const labelResolveRef = useRef<((v: string) => void) | null>(null);
  const [emojiTarget, setEmojiTarget] = useState<{ apply: (e: string) => void } | null>(null);
  const [acState, setAcState] = useState<{ queue: string[]; phone: string | null; q: string } | null>(null);
  const [fwdPick, setFwdPick] = useState<{ item: InboxItem; text: string; err?: string } | null>(null);
  const [apPick, setApPick] = useState<{
    item: InboxItem;
    action: string;
    items: { name: string; qty: string; size: string; notes: string }[];
    type: "" | "SPECIAL" | "RECURRING";
    notes: string;
    err?: string;
  } | null>(null);
  const [rcPick, setRcPick] = useState<{
    threadId: string;
    vendor: string;
    date: string;
    subtotal: string;
    tax: string;
    total: string;
    items: { description: string; qty: string; amount: string }[];
    msg?: { text: string; warn: boolean };
  } | null>(null);

  // Attach file input
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachCtxRef = useRef<{ threadId: string } | null>(null);

  // Countdown tick
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  /* ---- helpers referencing state ---- */
  const uiQuiet = useCallback(() => {
    return !openItem && !labelPick && !emojiTarget && !acState && !fwdPick && !apPick && !rcPick;
  }, [openItem, labelPick, emojiTarget, acState, fwdPick, apPick, rcPick]);

  // Detect new awaiting client -> green flash
  const detectNew = useCallback((its: InboxItem[]) => {
    const ids = its.filter((i) => i.awaiting && i.unread && i.isClient).map((i) => i.id);
    if (seenClientIdsRef.current !== null && ids.some((id) => seenClientIdsRef.current!.indexOf(id) < 0)) {
      setGreenFlash((n: number) => n + 1);
    }
    seenClientIdsRef.current = ids;
  }, []);

  const loadInbox = useCallback(async () => {
    setRefreshing(true);
    try {
      const r: InboxResponse = await fetch(SCRIPT_URL + "?action=getInbox&email=" + encodeURIComponent(email)).then((x) => x.json());
      sessionCache.set(CK, r);
      const its = r.inbox || [];
      setItems(its);
      setLabels(r.labels || []);
      if (r.contacts) setContacts(r.contacts);
      if (r.clients) setClients(r.clients);
      setNextVisit(r.nextVisit || null);
      setFeedError(false);
      setFeedLoaded(true);
      setOffline(false);
      // clear optimistic sets on fresh load: rows that are actually gone stay gone,
      // rows the server still sends are visible again
      setHidden(new Set());
      setRemoved(new Set());
      setAwaitingOverride({});
      detectNew(its);
    } finally {
      setRefreshing(false);
    }
  }, [detectNew, email]);

  const safeLoad = useCallback(async () => {
    try {
      await loadInbox();
    } catch {
      if (sessionCache.has(CK)) setOffline(true);
      else setFeedError(true);
      setFeedLoaded(true);
    }
  }, [loadInbox]);

  // Initial + ping loop
  const lastFingerRef = useRef<string>("");
  const lastFullRef = useRef<number>(0);
  useEffect(() => {
    void safeLoad();
    lastFullRef.current = Date.now();
    const t = window.setInterval(async () => {
      try {
        const r = await fetch(SCRIPT_URL + "?action=ping").then((x) => x.json());
        const f = (r.q || "") + "|" + (r.g || "");
        const stale = Date.now() - lastFullRef.current > POLL_MS;
        if ((lastFingerRef.current && f !== lastFingerRef.current) || stale) {
          if (uiQuiet()) {
            lastFingerRef.current = f;
            lastFullRef.current = Date.now();
            void safeLoad();
          }
        } else if (!lastFingerRef.current) {
          lastFingerRef.current = f;
          lastFullRef.current = Date.now();
        }
      } catch {
        /* ignore */
      }
    }, PING_MS);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- derived items with optimistic patches ---- */
  const visibleItems = useMemo(
    () =>
      items
        .filter((i) => !removed.has(i.id))
        .map((i) => ({
          ...i,
          awaiting: i.id in awaitingOverride ? awaitingOverride[i.id] : i.awaiting,
        })),
    [items, removed, awaitingOverride],
  );
  const awaitingItems = useMemo(
    () => visibleItems.filter((i) => i.awaiting && !hidden.has(i.id)),
    [visibleItems, hidden],
  );
  const displayItems = useMemo(
    () => (showAll ? visibleItems : awaitingItems),
    [showAll, visibleItems, awaitingItems],
  );
  const badgeCount = awaitingItems.length;

  /* ---- optimistic helpers ---- */
  const hideId = useCallback((id: string) => setHidden((s) => new Set(s).add(id)), []);
  const unhideId = useCallback(
    (id: string) =>
      setHidden((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      }),
    [],
  );
  const removeId = useCallback((id: string) => setRemoved((s) => new Set(s).add(id)), []);

  /* ---- reply ---- */
  const sendReply = useCallback(
    async (it: InboxItem, text: string, opts?: { fromViewer?: boolean; onClearField?: () => void }) => {
      const t = String(text || "").trim();
      if (!t) {
        flash("Write a reply first.", true);
        return false;
      }
      const attachments = it.source === "quo" ? [] : (staged[it.threadId] || []);
      const wasAwaiting = !!it.awaiting;
      // optimistic
      opts?.onClearField?.();
      setAwaitingOverride((s) => ({ ...s, [it.id]: false }));
      setStaged((s) => {
        const n = { ...s };
        delete n[it.threadId];
        return n;
      });
      flash(
        "Replied to " + it.from +
          (attachments.length ? " with " + attachments.length + " attachment" + (attachments.length > 1 ? "s" : "") : "") +
          " \u2713",
      );
      const res = await postAction(
        it.source === "quo"
          ? { action: "replyQuo", participants: it.participants, text: t, conversationId: it.conversationId, email, ...(it.line ? { from: it.line } : {}) }
          : { action: "replyThread", threadId: it.threadId, fromName: it.from, text: t, attachments, email },
      );
      if (res && res.ok && res.sent) {
        if (res.warning) flash("Replied to " + it.from + " \u2713 (" + res.warning + ")", true);
        return true;
      }
      // rollback
      setAwaitingOverride((s) => ({ ...s, [it.id]: wasAwaiting }));
      if (attachments.length) setStaged((s) => ({ ...s, [it.threadId]: attachments }));
      if (opts?.fromViewer) setVReply(t);
      flash("Message NOT sent to " + it.from + "!", true);
      return false;
    },
    [flash, staged, email],
  );

  /* ---- compose new outbound (Quo only) ---- */
  const normalizePhone = useCallback((raw: string): string | null => {
    const digits = String(raw || "").replace(/\D/g, "");
    if (digits.length === 10) return "+1" + digits;
    if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
    if (digits.length > 11 && raw.trim().startsWith("+")) return "+" + digits;
    return null;
  }, []);

  const sendCompose = useCallback(async () => {
    if (!compose) return;
    const phone = compose.picked?.phone || normalizePhone(compose.manual);
    const text = compose.text.trim();
    if (!phone) {
      flash("Pick a recipient or enter a valid phone number.", true);
      return;
    }
    if (!text) {
      flash("Write a message first.", true);
      return;
    }
    const name = compose.picked?.name || phone;
    const optimisticId = `optim-${Date.now()}`;
    const optimistic: InboxItem = {
      id: optimisticId,
      source: "quo",
      from: name,
      date: new Date().toISOString(),
      threadId: optimisticId,
      participants: [phone],
      awaiting: false,
      isClient: false,
      snippet: text,
    };
    setItems((prev) => [optimistic, ...prev]);
    setCompose(null);
    flash("Message sent to " + name + " \u2713");
    const res = await postAction({ action: "replyQuo", participants: [phone], text, email });
    if (!(res && res.ok && res.sent)) {
      setItems((prev) => prev.filter((x) => x.id !== optimisticId));
      flash("Message NOT sent to " + name + "!", true);
    }
  }, [compose, normalizePhone, flash, email]);


  /* ---- file / trash / done / spam / confirm ---- */
  const pickLabel = useCallback((it: InboxItem): Promise<string> => {
    return new Promise((resolve) => {
      labelResolveRef.current = resolve;
      setLabelPick({ item: it, q: "" });
    });
  }, []);
  const finishLabel = useCallback((val: string) => {
    setLabelPick(null);
    const r = labelResolveRef.current;
    labelResolveRef.current = null;
    if (r) r(val);
  }, []);

  const fileWith = useCallback(
    async (it: InboxItem, label: string): Promise<boolean> => {
      hideId(it.id);
      flash("Filed: " + it.from + " \u2713");
      const res = await postAction({
        action: "fileThread",
        threadId: it.threadId,
        fromEmail: it.fromEmail,
        label,
      });
      if (res && res.ok && res.needsLabel) {
        unhideId(it.id);
        const chosen = await pickLabel(it);
        if (!chosen) return false;
        return fileWith(it, chosen);
      }
      if (res && res.ok && res.filed) {
        setLabels((L) => (L.indexOf(res.label) < 0 ? [...L, res.label].sort() : L));
        removeId(it.id);
        flash("Filed \u2192 " + res.label);
        return true;
      }
      unhideId(it.id);
      flash("NOT filed: " + it.from + " — card restored, try again.", true);
      return false;
    },
    [flash, hideId, unhideId, removeId, pickLabel],
  );

  const fileItem = useCallback(
    async (it: InboxItem) => {
      if (!it.ruleLabel) {
        const label = await pickLabel(it);
        if (!label) return;
        return fileWith(it, label);
      }
      return fileWith(it, "");
    },
    [pickLabel, fileWith],
  );

  const doneItem = useCallback(
    async (it: InboxItem) => {
      hideId(it.id);
      flash("Marked done.");
      const res = await postAction({ action: "quoDone", conversationId: it.conversationId });
      if (res && res.ok && res.done) {
        removeId(it.id);
        return true;
      }
      unhideId(it.id);
      flash("NOT marked done: " + it.from + " — card restored.", true);
      return false;
    },
    [flash, hideId, unhideId, removeId],
  );

  const trashItem = useCallback(
    async (it: InboxItem) => {
      if (!window.confirm("Trash this thread from " + it.from + "?")) return;
      hideId(it.id);
      flash("Trashed.");
      const res = await postAction({ action: "trashThread", threadId: it.threadId });
      if (res && res.ok && res.trashed) {
        removeId(it.id);
        return true;
      }
      unhideId(it.id);
      flash("NOT trashed: " + it.from + " — card restored.", true);
      return false;
    },
    [flash, hideId, unhideId, removeId],
  );

  const confirmVisit = useCallback(
    async (it: InboxItem) => {
      if (confirmedIds.has(it.id) || it.confirmed) {
        flash("Already confirmed \u2713");
        return true;
      }
      flash("Confirming visit for " + it.from + "\u2026");
      const body: Record<string, unknown> = { action: "confirmVisit" };
      if (it.source === "quo") body.participants = it.participants;
      else body.fromEmail = it.fromEmail;
      const res = await postAction(body);
      if (res && res.ok && !res.error) {
        flash("Confirmed: " + res.event + " (" + rel(res.start) + ")");
        setConfirmedIds((prev) => {
          const next = new Set(prev);
          next.add(it.id);
          saveConfirmedIds(next);
          return next;
        });
        setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, confirmed: true } : x)));
        return true;
      }
      flash((res && res.error) || "Couldn't confirm — try again.", true);
      return false;
    },
    [confirmedIds, flash],
  );

  const spamItem = useCallback(
    async (it: InboxItem) => {
      if (!window.confirm("Mark " + it.from + " as spam? You'll never see this number again.")) return;
      hideId(it.id);
      flash("Marked as spam \u{1F4A9}");
      let ok = true;
      for (const p of it.participants || []) {
        const r = await postAction({ action: "addContact", phone: p, name: "zzz-spam \u{1F4A9}" });
        if (!r || !r.ok) ok = false;
      }
      const d = await postAction({ action: "quoDone", conversationId: it.conversationId });
      if (!d || !d.ok) ok = false;
      if (ok) {
        removeId(it.id);
        return true;
      }
      unhideId(it.id);
      flash("Spam-marking FAILED: " + it.from + " — card restored.", true);
      return false;
    },
    [flash, hideId, unhideId, removeId],
  );

  /* ---- attachments ---- */
  const openAttach = useCallback((it: InboxItem) => {
    attachCtxRef.current = { threadId: it.threadId };
    fileInputRef.current?.click();
  }, []);
  const onFilesPicked = useCallback(
    async (files: FileList | null) => {
      if (!files || !attachCtxRef.current) return;
      const threadId = attachCtxRef.current.threadId;
      const current = staged[threadId] ? [...staged[threadId]] : [];
      for (const f of Array.from(files)) {
        if (f.size > MAX_FILE) {
          flash(f.name + " is over 10MB — skipped.", true);
          continue;
        }
        const total = current.reduce((a, x) => a + x.size, 0);
        if (total + f.size > MAX_TOTAL) {
          flash("Attachment limit reached — " + f.name + " skipped.", true);
          break;
        }
        const data: string = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result).split(",")[1]);
          r.onerror = rej;
          r.readAsDataURL(f);
        });
        current.push({ name: f.name, mime: f.type || "application/octet-stream", data, size: f.size });
      }
      setStaged((s) => ({ ...s, [threadId]: current }));
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [flash, staged],
  );
  const removeStaged = useCallback(
    (threadId: string, idx: number) => {
      setStaged((s) => {
        const list = (s[threadId] || []).slice();
        list.splice(idx, 1);
        return { ...s, [threadId]: list };
      });
    },
    [],
  );

  /* ---- viewer ---- */
  const openViewer = useCallback(async (it: InboxItem) => {
    setOpenItem(it);
    setVReply("");
    setViewerBody({ kind: "loading" });
    try {
      if (it.source === "quo") {
        const r = await fetch(
          SCRIPT_URL + "?action=getQuoThread&participants=" + encodeURIComponent((it.participants || []).join(",")) +
            "&email=" + encodeURIComponent(email) +
            (it.line ? "&line=" + encodeURIComponent(it.line) : ""),
        ).then((x) => x.json());
        if (r.error) throw new Error(r.error);
        setViewerBody({ kind: "quo", messages: r.messages || [], from: it.from });
      } else {
        const r = await fetch(
          SCRIPT_URL + "?action=getMessage&threadId=" + encodeURIComponent(it.threadId) +
            "&email=" + encodeURIComponent(email),
        ).then((x) => x.json());
        if (r.error) throw new Error(r.error);
        setViewerBody({ kind: "gmail", messages: r.messages || [] });
      }
    } catch {
      setViewerBody({ kind: "error" });
    }
  }, [email]);
  const closeViewer = useCallback(() => {
    setOpenItem(null);
    setViewerBody(null);
    setVReply("");
  }, []);

  /* ---- forward ---- */
  const openForward = useCallback((it: InboxItem) => {
    const s = it.snippet || "";
    const i = s.indexOf(": ");
    const name = i > 0 ? s.slice(0, i) : it.from;
    const text = (i > 0 ? s.slice(i + 2) : s).trim();
    const compiled = (name + ": " + text).slice(0, 1500);
    setFwdPick({ item: it, text: compiled });
  }, []);
  const submitForward = useCallback(async () => {
    if (!fwdPick) return;
    const text = fwdPick.text.trim();
    if (!text) {
      setFwdPick((p) => (p ? { ...p, err: "Nothing to send." } : p));
      return;
    }
    const saved = fwdPick;
    setFwdPick(null);
    flash("Forwarded to crew \u2713");
    const res = await postAction({ action: "replyQuo", participants: CREW, text, email });
    if (res && res.ok && res.sent) return;
    setFwdPick({ ...saved, err: "Forward failed — try again." });
    flash("Message NOT sent to crew!", true);
  }, [fwdPick, flash, email]);

  /* ---- add project ---- */
  const openProject = useCallback((it: InboxItem) => {
    const s = it.snippet || "";
    const i = s.indexOf(": ");
    const name = i > 0 ? s.slice(0, i) : it.from;
    const text = (i > 0 ? s.slice(i + 2) : s).trim();
    setApPick({
      item: it,
      action: name + ": " + text,
      items: [],
      type: "",
      notes: "",
    });
  }, []);
  const submitProject = useCallback(async () => {
    if (!apPick) return;
    const act = apPick.action.trim();
    if (!act) return setApPick({ ...apPick, err: "Project Action is required." });
    if (!apPick.type) return setApPick({ ...apPick, err: "Pick SPECIAL or RECURRING." });
    const it = apPick.item;
    const body: Record<string, unknown> = {
      action: "addProject",
      projectAction: act,
      type: apPick.type,
      notes: apPick.notes.trim(),
      items: apPick.items
        .map((r) => ({ name: r.name.trim(), qty: r.qty.trim(), size: r.size.trim(), notes: r.notes.trim() }))
        .filter((i) => i.name),
    };
    if (it.source === "quo") body.participants = it.participants;
    else body.fromEmail = it.fromEmail;
    const saved = apPick;
    setApPick(null);
    flash("Adding " + apPick.type + " project for " + it.from + "\u2026");
    const res = await postAction(body);
    if (res && res.ok && res.projectId) {
      flash(
        "Added " +
          res.projectId +
          " for " +
          res.client +
          (res.items ? " (" + res.items + " item" + (res.items > 1 ? "s" : "") + ")" : "") +
          (res.webhook === 200 ? " \u2713 calendar updating" : " \u2713 (calendar kick failed: " + res.webhook + ")"),
        res.webhook !== 200,
      );
    } else {
      setApPick({ ...saved, err: (res && res.error) || "Couldn't add project — try again." });
      flash("Project NOT saved — see panel.", true);
    }
  }, [apPick, flash]);

  /* ---- receipt ---- */
  const startReceipt = useCallback(async () => {
    if (!openItem || openItem.source !== "gmail") return;
    flash("Reading receipt\u2026");
    const res = await postAction({ action: "extractReceipt", threadId: openItem.threadId });
    if (!res || !res.ok || !res.receipt) {
      flash((res && res.error) || "Couldn't extract a receipt.", true);
      return;
    }
    const r = res.receipt;
    setRcPick({
      threadId: openItem.threadId,
      vendor: r.vendor || "",
      date: r.date || res.emailDate || "",
      subtotal: r.subtotal || "",
      tax: r.tax || "",
      total: r.total || "",
      items: (r.items && r.items.length ? r.items : [{ description: "", qty: "", amount: "" }]).map((it: any) => ({
        description: it?.description || "",
        qty: it?.qty || "",
        amount: it?.amount || "",
      })),
      msg: r.vendor ? undefined : { text: "No obvious receipt found — fill in manually or Cancel.", warn: true },
    });
  }, [openItem, flash]);
  const saveReceipt = useCallback(async () => {
    if (!rcPick) return;
    const vendor = rcPick.vendor.trim();
    if (!vendor) return setRcPick({ ...rcPick, msg: { text: "Vendor is required.", warn: true } });
    const saved = rcPick;
    setRcPick(null);
    flash("Saving receipt — " + vendor + "\u2026");
    const res = await postAction({
      action: "saveReceipt",
      vendor,
      date: rcPick.date.trim(),
      subtotal: rcPick.subtotal.trim(),
      tax: rcPick.tax.trim(),
      total: rcPick.total.trim(),
      items: rcPick.items
        .map((r) => ({ description: r.description.trim(), qty: r.qty.trim(), amount: r.amount.trim() }))
        .filter((i) => i.description),
    });
    if (res && res.ok && res.saved) {
      flash(
        res.webhook === 200
          ? "Receipt saved & processing \u2713 " + res.name
          : "Receipt saved, but the scan webhook returned " + res.webhook + " — check Make.",
        res.webhook !== 200,
      );
    } else {
      setRcPick({ ...saved, msg: { text: (res && res.error) || "Save failed — try again.", warn: true } });
      flash("Receipt NOT saved — see panel.", true);
    }
  }, [rcPick, flash]);

  /* ---- add contact queue ---- */
  const openAddContact = useCallback((it: InboxItem) => {
    setAcState({ queue: (it.unknowns || []).slice(), phone: null, q: "" });
  }, []);
  useEffect(() => {
    if (!acState) return;
    if (acState.phone === null) {
      const q = [...acState.queue];
      const next = q.shift() || null;
      if (!next) {
        setAcState(null);
        void safeLoad();
        return;
      }
      setAcState({ queue: q, phone: next, q: "" });
    }
  }, [acState, safeLoad]);
  const saveContact = useCallback(
    async (sel: { name?: string; resourceName?: string }) => {
      if (!acState || !acState.phone) return;
      const phone = acState.phone;
      const body: Record<string, unknown> = { action: "addContact", phone };
      if (sel.resourceName) body.resourceName = sel.resourceName;
      if (sel.name) body.name = sel.name;
      flash("Saved: " + (sel.name || "contact"));
      // advance
      setAcState((s) => (s ? { queue: s.queue, phone: null, q: "" } : s));
      const res = await postAction(body);
      if (res && res.ok) return;
      setAcState((s) => (s ? { queue: [...s.queue, phone], phone: s.phone, q: s.q } : s));
      flash("Contact NOT saved: " + (sel.name || "") + " (" + phone + ") — it will come around again.", true);
    },
    [acState, flash],
  );

  /* ---- search ---- */
  const searchHits = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return [];
    const digits = q.replace(/\D/g, "");
    return displayItems
      .filter((it) => {
        if ((it.from || "").toLowerCase().indexOf(q) >= 0) return true;
        if ((it.fromEmail || "").toLowerCase().indexOf(q) >= 0) return true;
        if (digits) return (it.participants || []).some((p) => p.replace(/\D/g, "").indexOf(digits) >= 0);
        return false;
      })
      .slice(0, 8);
  }, [searchQ, displayItems]);
  const jumpTo = useCallback((id: string) => {
    setSearchQ("");
    const el = document.querySelector<HTMLElement>(`[data-item-id="${id}"]`);
    if (!el) {
      flash("Conversation not in the current feed.", true);
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFoundId(id);
    window.setTimeout(() => setFoundId((cur) => (cur === id ? null : cur)), 2500);
  }, [flash]);

  /* ---- countdown text ---- */
  const countdownEl = useMemo(() => {
    if (!nextVisit) return null;
    const ms = new Date(nextVisit.start).getTime() - now;
    const late = ms < 0;
    const a = Math.abs(ms);
    const h = Math.floor(a / 3600000);
    const m = Math.floor((a % 3600000) / 60000);
    const s = Math.floor((a % 60000) / 1000);
    const t = (h ? h + "h " : "") + m + "m " + (h ? "" : s + "s");
    return (
      <div style={{ marginLeft: "auto", textAlign: "right", fontSize: ".9rem", lineHeight: 1.35, color: T.lime }}>
        NEXT: {nextVisit.title}
        <br />
        <span style={{ fontSize: "1.15rem", fontWeight: "bold", color: late ? "#ffb03f" : T.lime }}>
          {late ? t + " AGO" : "in " + t}
        </span>
      </div>
    );
  }, [nextVisit, now]);

  /* ---- fullscreen ---- */
  const toggleFs = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  }, []);

  /* ---- new-client green flash effect ---- */
  useEffect(() => {
    if (!greenFlash) return;
    document.body.style.transition = "background .12s";
    let step = 0;
    const iv = window.setInterval(() => {
      document.body.style.background = step % 2 ? T.bg : "rgba(124, 255, 0, 0.25)";
      step++;
      if (step >= 12) {
        window.clearInterval(iv);
        document.body.style.background = T.bg;
      }
    }, 80);
    return () => window.clearInterval(iv);
  }, [greenFlash]);

  /* ============================================================ */
  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.bg,
        color: T.lime,
        fontFamily: fontStack,
        padding: 16,
        paddingBottom: 96,
        boxSizing: "border-box",
      }}
    >
      {/* header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          borderBottom: `1px solid ${T.lime}`,
          paddingBottom: 10,
          marginBottom: 6,
        }}
      >
        <h1 style={{ fontSize: "1.2rem", margin: 0 }}>Message Center</h1>
        <span
          style={{
            background: badgeCount ? T.brightLime : "transparent",
            color: badgeCount ? "#0a0a0a" : T.dim,
            borderRadius: 12,
            padding: "2px 10px",
            fontWeight: "bold",
            fontSize: ".9rem",
            border: badgeCount ? `2px solid ${T.brightLime}` : `1px solid ${T.border}`,
            animation: badgeCount ? "bvNewPulse 1.2s ease-in-out infinite" : undefined,
          }}
        >
          {badgeCount}
        </span>
        {countdownEl}
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <RefreshDot refreshing={refreshing} offline={offline} />
          {offline && <span style={{ color: T.dim, fontSize: 10 }}>offline — last data</span>}
        </span>
      </header>

      {/* controls row */}
      <div style={{ display: "flex", gap: 8, margin: "10px 0", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search recipients…"
            autoComplete="off"
            style={{ ...inputStyle, width: "100%", minHeight: 48, boxSizing: "border-box" }}
          />
          {searchHits.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                zIndex: 65,
                background: T.panel,
                border: `1px solid ${T.lime}`,
                borderRadius: "0 0 8px 8px",
                maxHeight: "50vh",
                overflowY: "auto",
              }}
            >
              {searchHits.map((it) => (
                <div
                  key={it.id}
                  onMouseDown={() => jumpTo(it.id)}
                  style={{
                    padding: "14px 16px",
                    borderBottom: `1px solid ${T.border}`,
                    cursor: "pointer",
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <span><SrcIcon source={it.source} /></span>
                  <span>{it.from}</span>
                  <span style={{ marginLeft: "auto", fontSize: ".8rem", opacity: 0.6, whiteSpace: "nowrap" }}>
                    {rel(it.date)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <button style={ghostBtn} onClick={() => void safeLoad()}>Reload</button>
        <button style={ghostBtn} title="Fullscreen" onClick={toggleFs}>
          <IconFs />
        </button>
      </div>

      {/* filter toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 14px" }}>
        <button
          style={{
            background: "transparent",
            border: "none",
            color: T.lime,
            fontFamily: fontStack,
            fontWeight: "bold",
            fontSize: ".95rem",
            textDecoration: "underline",
            cursor: "pointer",
            padding: 0,
          }}
          onClick={() => setShowAll((s) => !s)}
        >
          {showAll ? "Show replies only" : "Show all"}
        </button>
        <span style={{ color: T.dim, fontSize: ".85rem" }}>
          {showAll
            ? "Showing all threads"
            : `Showing ${badgeCount} thread${badgeCount === 1 ? "" : "s"} awaiting reply`}
        </span>
      </div>

      {/* list */}
      <div id="list">
        {!feedLoaded ? (
          <span>Loading<Dots /></span>
        ) : feedError ? (
          <span>Couldn't reach the inbox — check connection and Reload.</span>
        ) : displayItems.length === 0 ? (
          <span>{showAll ? "Inbox is quiet. ✓" : "No threads awaiting reply. ✓"}</span>
        ) : (
          displayItems.map((it) => (
            <FeedCard
              key={it.id}
              it={it}
              hidden={hidden.has(it.id)}
              found={foundId === it.id}
              staged={staged[it.threadId] || []}
              showLineBadge={showLineBadge}
              onOpen={() => openViewer(it)}
              onSend={(text, clear) => sendReply(it, text, { onClearField: clear })}
              onFile={() => (it.source === "quo" ? doneItem(it) : fileItem(it))}
              onTrash={() => trashItem(it)}
              onSpam={() => spamItem(it)}
              onConfirm={() => confirmVisit(it)}
              onAttach={() => openAttach(it)}
              onEmoji={(apply) => setEmojiTarget({ apply })}
              onProject={() => openProject(it)}
              onForward={() => openForward(it)}
              onAddContact={() => openAddContact(it)}
              onRemoveStaged={(idx) => removeStaged(it.threadId, idx)}
            />
          ))
        )}
      </div>

      {/* status flash */}
      <div style={{ fontSize: ".85rem", minHeight: "1.2em", marginTop: 6 }}>
        {flashMsg && (
          <span style={{ color: flashMsg.warn ? "#ffb03f" : T.lime }}>{flashMsg.text}</span>
        )}
      </div>

      {/* hidden file picker */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={(e) => void onFilesPicked(e.target.files)}
      />

      {/* viewer */}
      {openItem && (
        <Viewer
          it={openItem}
          body={viewerBody}
          reply={vReply}
          setReply={setVReply}
          chips={staged[openItem.threadId] || []}
          onClose={closeViewer}
          onSend={() => {
            const it = openItem;
            const t = vReply;
            void sendReply(it, t, { fromViewer: true, onClearField: () => setVReply("") });
          }}
          onFile={() => {
            const it = openItem;
            closeViewer();
            if (it.source === "quo") void doneItem(it);
            else void fileItem(it);
          }}
          onTrash={() => {
            const it = openItem;
            closeViewer();
            void trashItem(it);
          }}
          onSpam={() => {
            const it = openItem;
            closeViewer();
            void spamItem(it);
          }}
          onConfirm={() => confirmVisit(openItem)}
          onProject={() => openProject(openItem)}
          onForward={() => openForward(openItem)}
          onAttach={() => openAttach(openItem)}
          onEmoji={() => setEmojiTarget({ apply: (e) => setVReply((v) => v + e) })}
          onReceipt={showReceipt ? startReceipt : null}
          onRemoveStaged={(idx) => removeStaged(openItem.threadId, idx)}
        />
      )}

      {/* label picker */}
      {labelPick && (
        <ModalOverlay>
          <ModalPanel>
            <h3 style={{ margin: 0 }}>File under label…</h3>
            <div style={{ fontSize: ".85rem", opacity: 0.75 }}>
              {labelPick.item.from} ‹{labelPick.item.fromEmail}›
            </div>
            <input
              autoFocus
              value={labelPick.q}
              onChange={(e) => setLabelPick({ ...labelPick, q: e.target.value })}
              placeholder="Search labels…"
              style={{ ...inputStyle, minHeight: 48 }}
            />
            <div style={{ overflowY: "auto", flex: 1, borderTop: `1px solid ${T.border}`, minHeight: 120 }}>
              {(() => {
                const ql = labelPick.q.trim().toLowerCase();
                const hits = labels.filter((l) => l.toLowerCase().indexOf(ql) >= 0);
                const exact = labels.some((l) => l.toLowerCase() === ql);
                return (
                  <>
                    {hits.map((l) => (
                      <div key={l} onClick={() => finishLabel(l)} style={pickRowStyle}>
                        {l}
                      </div>
                    ))}
                    {labelPick.q.trim() && !exact && (
                      <div onClick={() => finishLabel(labelPick.q.trim())} style={{ ...pickRowStyle, color: "#ffb03f" }}>
                        + Create “{labelPick.q.trim()}”
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            <button style={ghostBtn} onClick={() => finishLabel("")}>Cancel</button>
          </ModalPanel>
        </ModalOverlay>
      )}

      {/* emoji picker */}
      {emojiTarget && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            bottom: 16,
            transform: "translateX(-50%)",
            background: T.panel,
            border: `1px solid ${T.lime}`,
            borderRadius: 8,
            padding: 10,
            zIndex: 70,
            maxWidth: 440,
            width: "calc(100% - 32px)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(8,1fr)",
              gap: 2,
              maxHeight: "45vh",
              overflowY: "auto",
            }}
          >
            {EMOJI.map((e, i) => (
              <button
                key={i}
                onClick={() => {
                  emojiTarget.apply(e);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "1.6rem",
                  minHeight: 52,
                  padding: 0,
                  color: T.lime,
                  cursor: "pointer",
                  fontFamily: "'Segoe UI Emoji','Noto Color Emoji','Apple Color Emoji',sans-serif",
                }}
              >
                {e}
              </button>
            ))}
          </div>
          <button style={{ ...ghostBtn, width: "100%", marginTop: 8, minHeight: 44 }} onClick={() => setEmojiTarget(null)}>
            Close
          </button>
        </div>
      )}

      {/* add contact */}
      {acState && acState.phone && (
        <ModalOverlay>
          <ModalPanel>
            <h3 style={{ margin: 0 }}>Add to Google Contacts</h3>
            <div style={{ fontSize: ".85rem", opacity: 0.75 }}>{acState.phone}</div>
            <input
              autoFocus
              value={acState.q}
              onChange={(e) => setAcState({ ...acState, q: e.target.value })}
              placeholder="Name…"
              style={{ ...inputStyle, minHeight: 48 }}
            />
            <div style={{ overflowY: "auto", flex: 1, borderTop: `1px solid ${T.border}`, minHeight: 120 }}>
              {acState.q.trim() && (
                <div
                  onClick={() => void saveContact({ name: acState.q.trim() })}
                  style={{ ...pickRowStyle, color: "#ffb03f" }}
                >
                  + New contact: “{acState.q.trim()}”
                </div>
              )}
              {contacts
                .filter((c) => !acState.q.trim() || c.n.toLowerCase().indexOf(acState.q.trim().toLowerCase()) >= 0)
                .slice(0, 40)
                .map((c) => (
                  <div key={c.r} onClick={() => void saveContact({ resourceName: c.r, name: c.n })} style={pickRowStyle}>
                    {c.n}
                  </div>
                ))}
            </div>
            <button
              style={ghostBtn}
              onClick={() => {
                setAcState(null);
              }}
            >
              Cancel
            </button>
          </ModalPanel>
        </ModalOverlay>
      )}

      {/* forward */}
      {fwdPick && (
        <ModalOverlay>
          <ModalPanel wide>
            <h3 style={{ margin: 0 }}>Forward to crew</h3>
            <div style={{ fontSize: ".85rem", opacity: 0.75 }}>
              Texts +1 (650) 710-5061 and +1 (415) 234-3696 as one group message
            </div>
            <textarea
              value={fwdPick.text}
              onChange={(e) => setFwdPick({ ...fwdPick, text: e.target.value })}
              style={{ ...inputStyle, minHeight: 140, resize: "vertical" }}
            />
            {fwdPick.err && <div style={{ color: T.red, fontSize: ".9rem" }}>{fwdPick.err}</div>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button style={limeBtn} onClick={() => void submitForward()}>Send</button>
              <button style={ghostBtn} onClick={() => setFwdPick(null)}>Cancel</button>
            </div>
          </ModalPanel>
        </ModalOverlay>
      )}

      {/* add project */}
      {apPick && (
        <ModalOverlay>
          <ModalPanel wide>
            <h3 style={{ margin: 0 }}>Add project</h3>
            <div style={{ fontSize: ".85rem", opacity: 0.75 }}>
              Client: {apPick.item.from} (matched via Client Info on save)
            </div>
            <label style={labelStyle}>Project Action</label>
            <textarea
              value={apPick.action}
              onChange={(e) => setApPick({ ...apPick, action: e.target.value })}
              style={{ ...inputStyle, minHeight: 150, resize: "vertical", fontWeight: "bold", fontSize: "1.15rem" }}
            />
            <label style={labelStyle}>Items (Project Tools &amp; Materials)</label>
            <div>
              {apPick.items.map((row, idx) => (
                <div
                  key={idx}
                  style={{ display: "grid", gridTemplateColumns: "2fr 64px 90px 2fr 48px", gap: 6, marginBottom: 6 }}
                >
                  {(["name", "qty", "size", "notes"] as const).map((k) => (
                    <input
                      key={k}
                      value={row[k]}
                      onChange={(e) => {
                        const items = apPick.items.slice();
                        items[idx] = { ...row, [k]: e.target.value };
                        setApPick({ ...apPick, items });
                      }}
                      placeholder={k[0].toUpperCase() + k.slice(1)}
                      style={{ ...inputStyle, minHeight: 44, minWidth: 0 }}
                    />
                  ))}
                  <button
                    style={{ ...ghostBtn, minHeight: 44, padding: 0 }}
                    onClick={() => {
                      const items = apPick.items.slice();
                      items.splice(idx, 1);
                      setApPick({ ...apPick, items });
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              style={{ ...ghostBtn, alignSelf: "flex-start" }}
              onClick={() =>
                setApPick({ ...apPick, items: [...apPick.items, { name: "", qty: "", size: "", notes: "" }] })
              }
            >
              + Add Item
            </button>
            <label style={labelStyle}>Type</label>
            <div style={{ display: "flex", gap: 10 }}>
              {(["SPECIAL", "RECURRING"] as const).map((t) => (
                <button
                  key={t}
                  style={{
                    ...(apPick.type === t ? limeBtn : ghostBtn),
                    flex: 1,
                  }}
                  onClick={() => setApPick({ ...apPick, type: t })}
                >
                  {t}
                </button>
              ))}
            </div>
            <label style={labelStyle}>Notes (optional)</label>
            <input
              value={apPick.notes}
              onChange={(e) => setApPick({ ...apPick, notes: e.target.value })}
              style={{ ...inputStyle, minHeight: 44 }}
            />
            {apPick.err && <div style={{ color: T.red, fontSize: ".9rem" }}>{apPick.err}</div>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button style={limeBtn} onClick={() => void submitProject()}>Save project</button>
              <button style={ghostBtn} onClick={() => setApPick(null)}>Cancel</button>
            </div>
          </ModalPanel>
        </ModalOverlay>
      )}

      {/* receipt */}
      {rcPick && (
        <ModalOverlay>
          <ModalPanel wide>
            <h3 style={{ margin: 0 }}>Receipt</h3>
            <div style={{ fontSize: ".85rem", opacity: 0.75 }}>
              Confirm the details — saves a PDF to Drive → "receipt drop"
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 8, alignItems: "center" }}>
              <label style={labelStyle}>Vendor</label>
              <input value={rcPick.vendor} onChange={(e) => setRcPick({ ...rcPick, vendor: e.target.value })} style={{ ...inputStyle, minHeight: 44 }} />
              <label style={labelStyle}>Date</label>
              <input value={rcPick.date} onChange={(e) => setRcPick({ ...rcPick, date: e.target.value })} placeholder="YYYY-MM-DD" style={{ ...inputStyle, minHeight: 44 }} />
            </div>
            <label style={labelStyle}>Items</label>
            <div>
              {rcPick.items.map((row, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 64px 100px 48px", gap: 6, marginBottom: 6 }}>
                  {(["description", "qty", "amount"] as const).map((k) => (
                    <input
                      key={k}
                      value={row[k]}
                      onChange={(e) => {
                        const its = rcPick.items.slice();
                        its[idx] = { ...row, [k]: e.target.value };
                        setRcPick({ ...rcPick, items: its });
                      }}
                      placeholder={k[0].toUpperCase() + k.slice(1)}
                      style={{ ...inputStyle, minHeight: 44, minWidth: 0 }}
                    />
                  ))}
                  <button
                    style={{ ...ghostBtn, minHeight: 44, padding: 0 }}
                    onClick={() => {
                      const its = rcPick.items.slice();
                      its.splice(idx, 1);
                      setRcPick({ ...rcPick, items: its });
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              style={{ ...ghostBtn, alignSelf: "flex-start" }}
              onClick={() => setRcPick({ ...rcPick, items: [...rcPick.items, { description: "", qty: "", amount: "" }] })}
            >
              + Add Item
            </button>
            <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 8, alignItems: "center" }}>
              <label style={labelStyle}>Subtotal</label>
              <input value={rcPick.subtotal} onChange={(e) => setRcPick({ ...rcPick, subtotal: e.target.value })} style={{ ...inputStyle, minHeight: 44 }} />
              <label style={labelStyle}>Tax</label>
              <input value={rcPick.tax} onChange={(e) => setRcPick({ ...rcPick, tax: e.target.value })} style={{ ...inputStyle, minHeight: 44 }} />
              <label style={labelStyle}>Total</label>
              <input value={rcPick.total} onChange={(e) => setRcPick({ ...rcPick, total: e.target.value })} style={{ ...inputStyle, minHeight: 44, fontWeight: "bold" }} />
            </div>
            {rcPick.msg && (
              <div style={{ color: rcPick.msg.warn ? "#ffb03f" : T.lime, fontSize: ".9rem" }}>{rcPick.msg.text}</div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button style={limeBtn} onClick={() => void saveReceipt()}>Confirm &amp; Save PDF</button>
              <button style={ghostBtn} onClick={() => setRcPick(null)}>Cancel</button>
            </div>
          </ModalPanel>
        </ModalOverlay>
      )}

      {/* Compose FAB */}
      <button
        aria-label="New message"
        onClick={() =>
          setCompose({ q: "", picked: null, manual: "", text: "" })
        }
        style={{
          position: "fixed",
          right: 16,
          bottom: 72,
          width: 56,
          height: 56,
          borderRadius: 28,
          background: T.lime,
          color: T.bg,
          border: "none",
          fontSize: 30,
          fontWeight: "bold",
          cursor: "pointer",
          zIndex: 60,
          boxShadow: "0 4px 14px rgba(124,255,0,.35)",
          fontFamily: fontStack,
        }}
      >
        +
      </button>

      {/* Compose modal */}
      {compose && (
        <ModalOverlay>
          <ModalPanel>
            <h3 style={{ margin: 0 }}>New message</h3>
            {compose.picked ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  border: `1px solid ${T.lime}`,
                  borderRadius: 6,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: "bold" }}>{compose.picked.name}</div>
                  <div style={{ fontSize: ".8rem", opacity: 0.7 }}>{compose.picked.phone}</div>
                </div>
                <button
                  style={ghostBtn}
                  onClick={() => setCompose({ ...compose, picked: null })}
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <input
                  autoFocus
                  value={compose.q}
                  onChange={(e) => setCompose({ ...compose, q: e.target.value, manual: e.target.value })}
                  placeholder="Search contacts or type phone…"
                  style={{ ...inputStyle, minHeight: 48 }}
                />
                <div
                  style={{
                    overflowY: "auto",
                    maxHeight: "35vh",
                    borderTop: `1px solid ${T.border}`,
                  }}
                >
                  {(() => {
                    const ql = compose.q.trim().toLowerCase();
                    const digits = ql.replace(/\D/g, "");
                    const hits = contacts
                      .filter((c) => {
                        if (!ql) return false;
                        if (c.n.toLowerCase().indexOf(ql) >= 0) return true;
                        if (digits && c.r.replace(/\D/g, "").indexOf(digits) >= 0) return true;
                        return false;
                      })
                      .slice(0, 40);
                    const normalized = normalizePhone(compose.manual);
                    return (
                      <>
                        {hits.map((c) => (
                          <div
                            key={c.r + c.n}
                            onClick={() =>
                              setCompose({
                                ...compose,
                                picked: { phone: c.r, name: c.n },
                                q: "",
                                manual: "",
                              })
                            }
                            style={pickRowStyle}
                          >
                            <div style={{ fontWeight: "bold" }}>{c.n}</div>
                            <div style={{ fontSize: ".8rem", opacity: 0.7 }}>{c.r}</div>
                          </div>
                        ))}
                        {normalized && !hits.some((c) => c.r === normalized) && (
                          <div
                            onClick={() =>
                              setCompose({
                                ...compose,
                                picked: { phone: normalized, name: normalized },
                                q: "",
                                manual: "",
                              })
                            }
                            style={{ ...pickRowStyle, color: "#ffb03f" }}
                          >
                            + Send to {normalized}
                          </div>
                        )}
                        {ql && hits.length === 0 && !normalized && (
                          <div style={{ padding: 12, fontSize: ".85rem", opacity: 0.6 }}>
                            No matches. Enter a 10-digit US phone number.
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </>
            )}
            <textarea
              value={compose.text}
              onChange={(e) => setCompose({ ...compose, text: e.target.value })}
              placeholder="Message…"
              rows={4}
              style={{ ...inputStyle, resize: "vertical", minHeight: 96 }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button style={ghostBtn} onClick={() => setCompose(null)}>
                Cancel
              </button>
              <button
                style={limeBtn}
                disabled={!(compose.picked || normalizePhone(compose.manual)) || !compose.text.trim()}
                onClick={() => void sendCompose()}
              >
                Send
              </button>
            </div>
          </ModalPanel>
        </ModalOverlay>
      )}
    </div>
  );
}

/* ============ Sub-components ============ */
function Dots() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setN((x) => (x + 1) % 4), 300);
    return () => window.clearInterval(t);
  }, []);
  return <span>{".".repeat(n)}</span>;
}

function ModalOverlay({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.75)",
        zIndex: 250,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      {children}
    </div>
  );
}
function ModalPanel({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div
      style={{
        background: T.panel,
        border: `1px solid ${T.lime}`,
        borderRadius: 8,
        width: "100%",
        maxWidth: wide ? 560 : 440,
        maxHeight: "90vh",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 16,
        overflowY: "auto",
        color: T.lime,
        fontFamily: fontStack,
      }}
    >
      {children}
    </div>
  );
}

const inputStyle: CSSProperties = {
  background: T.bg,
  color: T.lime,
  border: `1px solid ${T.dim}`,
  borderRadius: 4,
  fontFamily: fontStack,
  fontSize: ".95rem",
  padding: 8,
  boxSizing: "border-box",
};
const limeBtn: CSSProperties = {
  background: T.lime,
  color: "#000",
  border: "none",
  borderRadius: 4,
  padding: "14px 18px",
  fontFamily: fontStack,
  fontWeight: "bold",
  fontSize: ".95rem",
  minHeight: 56,
  cursor: "pointer",
};
const ghostBtn: CSSProperties = {
  background: "transparent",
  color: T.lime,
  border: `1px solid ${T.lime}`,
  borderRadius: 4,
  padding: "14px 18px",
  fontFamily: fontStack,
  fontWeight: "bold",
  fontSize: ".95rem",
  minHeight: 56,
  cursor: "pointer",
};
const iconBtn: CSSProperties = {
  ...ghostBtn,
  minWidth: 56,
  minHeight: 56,
  padding: 0,
  fontSize: "1.3rem",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};
const labelStyle: CSSProperties = { fontSize: ".85rem", opacity: 0.8, color: T.lime };
const pickRowStyle: CSSProperties = {
  padding: "14px 16px",
  borderBottom: `1px solid ${T.border}`,
  cursor: "pointer",
  minHeight: 28,
};

function SparkleBurst({ active }: { active: boolean }) {
  const [particles, setParticles] = useState<Array<{ dx: string; dy: string; size: number; delay: number }>>([]);
  useEffect(() => {
    if (!active) return;
    const count = 12;
    const next = Array.from({ length: count }).map(() => {
      const angle = Math.random() * Math.PI * 2;
      const dist = 24 + Math.random() * 28;
      return {
        dx: `${Math.cos(angle) * dist}px`,
        dy: `${Math.sin(angle) * dist}px`,
        size: 2 + Math.random() * 4,
        delay: Math.random() * 0.12,
      };
    });
    setParticles(next);
    const t = window.setTimeout(() => setParticles([]), 700);
    return () => window.clearTimeout(t);
  }, [active]);
  if (!active || particles.length === 0) return null;
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible", zIndex: 20 }}>
      {particles.map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: T.brightLime,
            boxShadow: `0 0 ${p.size * 2}px ${T.brightLime}, 0 0 ${p.size * 4}px ${T.lime}`,
            animation: "bvSparkle 0.55s ease-out forwards",
            animationDelay: `${p.delay}s`,
            ["--dx" as string]: p.dx,
            ["--dy" as string]: p.dy,
          }}
        />
      ))}
    </div>
  );
}

function ConfirmButton({
  confirmed,
  onConfirm,
  iconOnly,
  style,
}: {
  confirmed?: boolean;
  onConfirm: () => Promise<boolean>;
  iconOnly?: boolean;
  style?: CSSProperties;
}) {
  const [phase, setPhase] = useState<"idle" | "confirming" | "popping" | "popped">("idle");
  const already = confirmed || phase === "popped";

  const onClick = useCallback(async () => {
    if (already || phase === "confirming" || phase === "popping") return;
    setPhase("confirming");
    const ok = await onConfirm();
    if (ok) {
      setPhase("popping");
      window.setTimeout(() => setPhase("popped"), 420);
    } else {
      setPhase("idle");
    }
  }, [already, onConfirm, phase]);

  const base = iconOnly
    ? iconBtn
    : { ...ghostBtn, minWidth: 64, minHeight: 44, padding: "6px 10px", fontSize: "1rem", gap: 6 };

  if (already) {
    return (
      <div
        style={{
          ...base,
          opacity: 0.85,
          borderColor: T.lime,
          color: T.lime,
          cursor: "default",
          ...style,
        }}
      >
        {iconOnly ? "✓" : "✓ Confirmed"}
      </div>
    );
  }

  const popping = phase === "popping";
  const btnStyle: CSSProperties = {
    ...base,
    position: "relative",
    color: T.lime,
    borderColor: T.lime,
    ...(phase === "confirming" ? { opacity: 0.6, cursor: "wait" } : {}),
    ...(popping ? { animation: "bvConfirmPop 0.4s ease-out forwards", color: T.brightLime, borderColor: T.brightLime } : {}),
    ...style,
  };

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        style={btnStyle}
        title={iconOnly ? "Mark visit confirmed" : "Mark visit confirmed"}
        onClick={onClick}
        disabled={phase === "confirming"}
      >
        {iconOnly ? <IconConf /> : (
          <>
            <IconConf /> Confirm
          </>
        )}
      </button>
      <SparkleBurst active={popping} />
    </div>
  );
}

/* ---- feed card ---- */
function FeedCard({
  it,
  hidden,
  found,
  staged,
  showLineBadge,
  onOpen,
  onSend,
  onFile,
  onTrash,
  onSpam,
  onConfirm,
  onAttach,
  onEmoji,
  onProject,
  onForward,
  onAddContact,
  onRemoveStaged,
}: {
  it: InboxItem;
  hidden: boolean;
  found: boolean;
  staged: Attachment[];
  showLineBadge: boolean;
  onOpen: () => void;
  onSend: (text: string, clearField: () => void) => void;
  onFile: () => void;
  onTrash: () => void;
  onSpam: () => void;
  onConfirm: () => Promise<boolean>;
  onAttach: () => void;
  onEmoji: (apply: (e: string) => void) => void;
  onProject: () => void;
  onForward: () => void;
  onAddContact: () => void;
  onRemoveStaged: (idx: number) => void;
}) {
  const [reply, setReply] = useState("");
  const quo = it.source === "quo";
  const role = internalRoleFor(it);
  const isInternal = !!role;
  const showClientTag = !!it.isClient && !isInternal;
  const lineLast4 = quo && showLineBadge && it.line ? String(it.line).replace(/\D/g, "").slice(-4) : "";
  const isNew = it.unread && it.awaiting;

  return (
    <div
      data-item-id={it.id}
      style={{
        display: hidden ? "none" : "flex",
        background: it.unread ? T.panel2 : T.panel,
        border: `2px solid ${isNew ? T.brightLime : T.lime}`,
        borderRadius: 6,
        padding: 12,
        margin: "20px 0",
        gap: 12,
        alignItems: "flex-start",
        boxShadow: found ? `0 0 0 4px ${T.lime}` : "none",
        transition: "box-shadow .3s",
        animation: isNew && !found ? "bvNewPulse 1.2s ease-in-out infinite" : undefined,
      }}
    >
      <div
        style={{
          fontSize: "1.3rem",
          lineHeight: 1,
          padding: 8,
          borderRadius: "50%",
          alignSelf: "flex-start",
          color: T.lime,
          flex: "none",
        }}
      >
        {isInternal ? (
          <img
            src={INTERNAL_LOGO}
            alt="B&V"
            width={40}
            height={40}
            style={{ display: "block", borderRadius: "50%" }}
            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
          />
        ) : (
          <SrcIcon source={it.source} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "baseline",
            flexWrap: "wrap",
            justifyContent: "center",
            position: "relative",
            paddingRight: 56,
          }}
        >
          {isInternal && (
            <div style={{ width: "100%", fontSize: ".75rem", letterSpacing: 1.5, color: T.dim, marginBottom: 2 }}>
              {role}
            </div>
          )}
          <span style={{ fontWeight: "bold" }}>{it.from}</span>
          {quo && it.unknowns && it.unknowns.length > 0 && (
            <button
              onClick={(ev) => {
                ev.stopPropagation();
                onAddContact();
              }}
              title="Add contact"
              style={{
                background: "transparent",
                color: T.lime,
                border: `1px solid ${T.dim}`,
                borderRadius: 4,
                padding: "2px 10px",
                fontSize: "1rem",
                marginLeft: 8,
                cursor: "pointer",
              }}
            >
              +
            </button>
          )}
          {showClientTag && (
            <span style={{ border: `1px solid ${T.lime}`, color: T.lime, borderRadius: 4, padding: "0 6px", fontSize: ".7rem" }}>
              CLIENT
            </span>
          )}
          {lineLast4 && (
            <span
              title={it.line}
              style={{ border: `1px solid ${T.dim}`, color: T.dim, borderRadius: 4, padding: "0 6px", fontSize: ".7rem" }}
            >
              {"\u2026" + lineLast4}
            </span>
          )}
          <span style={{ position: "absolute", right: 0, top: 0, fontSize: ".8rem", opacity: 0.75, whiteSpace: "nowrap" }}>
            {rel(it.date)}
          </span>
        </div>
        {!quo && (
          <div
            style={{
              marginTop: 2,
              fontWeight: it.unread ? "bold" : "normal",
            }}
          >
            {it.subject || "(no subject)"}
          </div>
        )}
        {it.snippet && (
          <div
            style={{
              marginTop: 4,
              fontSize: ".95rem",
              opacity: 0.95,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {it.snippet}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button style={{ ...iconBtn, minHeight: 44, minWidth: 44 }} onClick={(ev) => { ev.stopPropagation(); onEmoji((e) => setReply((v) => v + e)); }}>
            <IconSmile />
          </button>
          {!quo && (
            <button style={{ ...iconBtn, minHeight: 44, minWidth: 44 }} onClick={(ev) => { ev.stopPropagation(); onAttach(); }}>
              <IconClip />
            </button>
          )}
          <textarea
            rows={1}
            placeholder="Reply…"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onClick={(ev) => ev.stopPropagation()}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
                ev.preventDefault();
                if (reply.trim()) onSend(reply, () => setReply(""));
              }
            }}
            style={{ ...inputStyle, flex: 1, minHeight: 44, maxHeight: 120, resize: "none" }}
          />
          <button
            disabled={!reply.trim()}
            style={{ ...ghostBtn, minHeight: 44, padding: "8px 14px", opacity: reply.trim() ? 1 : 0.4 }}
            onClick={(ev) => {
              ev.stopPropagation();
              onSend(reply, () => setReply(""));
            }}
          >
            Send
          </button>
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 8 }}>
          <button style={{ ...ghostBtn, minHeight: 44, padding: "8px 18px" }} onClick={(ev) => { ev.stopPropagation(); onProject(); }}>
            + Project
          </button>
          <button style={{ ...ghostBtn, minHeight: 44, padding: "8px 18px" }} onClick={(ev) => { ev.stopPropagation(); onForward(); }}>
            → Crew
          </button>
        </div>
        {staged.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            {staged.map((a, i) => (
              <span
                key={i}
                style={{
                  border: `1px solid ${T.dim}`,
                  color: T.dim,
                  borderRadius: 4,
                  padding: "6px 8px",
                  fontSize: ".8rem",
                  display: "inline-flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                📎 {a.name} ({fmtSize(a.size)})
                <b style={{ cursor: "pointer", color: T.red, fontSize: "1rem" }} onClick={() => onRemoveStaged(i)}>
                  ✕
                </b>
              </span>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignSelf: "stretch", justifyContent: "flex-end" }}>
        <button style={iconBtn} title="Open full screen" onClick={onOpen}>
          <IconFs />
        </button>
        {it.isClient && (
          <ConfirmButton confirmed={it.confirmed} onConfirm={onConfirm} iconOnly />
        )}
        {quo
          ? it.unknowns && it.unknowns.length > 0 && (
              <button style={iconBtn} title="Mark as spam" onClick={onSpam}>
                <IconPoo />
              </button>
            )
          : (
            <button style={iconBtn} title="Trash" onClick={onTrash}>
              ✕
            </button>
          )}
        <button style={iconBtn} title={quo ? "Done" : "File"} onClick={onFile}>
          ✓
        </button>
      </div>
    </div>
  );
}

/* ---- viewer ---- */
function Viewer({
  it,
  body,
  reply,
  setReply,
  chips,
  onClose,
  onSend,
  onFile,
  onTrash,
  onSpam,
  onConfirm,
  onProject,
  onForward,
  onAttach,
  onEmoji,
  onReceipt,
  onRemoveStaged,
}: {
  it: InboxItem;
  body:
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "gmail"; messages: ThreadMessage[] }
    | { kind: "quo"; messages: QuoMessage[]; from: string }
    | null;
  reply: string;
  setReply: (s: string) => void;
  chips: Attachment[];
  onClose: () => void;
  onSend: () => void;
  onFile: () => void;
  onTrash: () => void;
  onSpam: () => void;
  onConfirm: () => Promise<boolean>;
  onProject: () => void;
  onForward: () => void;
  onAttach: () => void;
  onEmoji: () => void;
  onReceipt: (() => void) | null;
  onRemoveStaged: (idx: number) => void;
}) {
  const quo = it.source === "quo";
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: T.bg,
        display: "flex",
        flexDirection: "column",
        zIndex: 300,
        fontFamily: fontStack,
        color: T.lime,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          padding: "12px 16px",
          borderBottom: `1px solid ${T.lime}`,
        }}
      >
        <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
          <div style={{ fontSize: "1.05rem", fontWeight: "bold" }}>{it.from}</div>
          <div style={{ fontSize: ".9rem", opacity: 0.8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {quo ? "Text conversation" : it.subject || "(no subject)"}
          </div>
        </div>
        <button
          style={{
            ...ghostBtn,
            minWidth: 80,
            padding: "10px 14px",
            fontSize: "1rem",
            letterSpacing: 1,
          }}
          onClick={onClose}
        >
          ✕ CLOSE
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {!body || body.kind === "loading" ? (
          <span>Loading thread<Dots /></span>
        ) : body.kind === "error" ? (
          <span>Couldn't load the thread — Close and try again.</span>
        ) : body.kind === "quo" ? (
          body.messages.length === 0 ? (
            <span>No messages found.</span>
          ) : (
            body.messages.map((m, i) => {
              const inc = m.direction === "incoming";
              const who = inc ? body.from : "Bramble & Vine";
              return (
                <div
                  key={i}
                  style={{
                    border: `1px solid ${T.border}`,
                    borderRadius: 6,
                    background: T.panel,
                    padding: 12,
                    marginBottom: 12,
                    borderLeft: `3px solid ${inc ? T.lime : T.border}`,
                    opacity: inc ? 1 : 0.75,
                  }}
                >
                  <div style={{ fontSize: ".85rem", opacity: 0.8, marginBottom: 8, borderBottom: `1px solid ${T.border}`, paddingBottom: 6, textAlign: "center" }}>
                    <b>{who}</b> — {new Date(m.date).toLocaleString()}
                  </div>
                  <div style={{ whiteSpace: "pre-wrap", wordWrap: "break-word", fontSize: "1.05rem", textAlign: "center" }}>
                    {m.body}
                  </div>
                </div>
              );
            })
          )
        ) : (
          body.messages.map((m, i) => (
            <div key={i} style={{ border: `1px solid ${T.border}`, borderRadius: 6, background: T.panel, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: ".85rem", opacity: 0.8, marginBottom: 8, borderBottom: `1px solid ${T.border}`, paddingBottom: 6, textAlign: "center" }}>
                <b>{m.from || ""}</b> — {new Date(m.date).toLocaleString()}
              </div>
              <div style={{ whiteSpace: "pre-wrap", wordWrap: "break-word", fontSize: "1.05rem", textAlign: "center" }}>
                {m.body}
              </div>
              {(m.attachments || []).map((a, j) => (
                <AttView key={j} a={a} />
              ))}
            </div>
          ))
        )}
      </div>
      {chips.length > 0 && (
        <div style={{ padding: "0 16px", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {chips.map((a, i) => (
            <span
              key={i}
              style={{
                border: `1px solid ${T.dim}`,
                color: T.dim,
                borderRadius: 4,
                padding: "6px 8px",
                fontSize: ".8rem",
                display: "inline-flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              📎 {a.name} ({fmtSize(a.size)})
              <b style={{ cursor: "pointer", color: T.red }} onClick={() => onRemoveStaged(i)}>✕</b>
            </span>
          ))}
        </div>
      )}
      <div
        style={{
          borderTop: `1px solid ${T.lime}`,
          padding: "10px 16px",
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
          background: T.bg,
        }}
      >
        <button style={{ ...iconBtn, minWidth: 44, minHeight: 44 }} onClick={onEmoji}><IconSmile /></button>
        {!quo && <button style={{ ...iconBtn, minWidth: 44, minHeight: 44 }} onClick={onAttach}><IconClip /></button>}
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Reply… (greeting + signature added automatically)"
          onKeyDown={(ev) => {
            if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
              ev.preventDefault();
              if (reply.trim()) onSend();
            }
          }}
          style={{ ...inputStyle, flex: 1, minHeight: 72, maxHeight: 160, resize: "vertical" }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button style={{ ...ghostBtn, minWidth: 64, minHeight: 44, padding: 6 }} disabled={!reply.trim()} onClick={onSend}>
            Send
          </button>
          <button style={{ ...ghostBtn, minWidth: 64, minHeight: 44, padding: 6 }} onClick={onFile}>
            {quo ? "✓ Done" : "✓ File"}
          </button>
          {it.isClient && (
            <ConfirmButton confirmed={it.confirmed} onConfirm={onConfirm} />
          )}
          {onReceipt && !quo && (
            <button style={{ ...ghostBtn, minWidth: 64, minHeight: 44, padding: 6 }} onClick={onReceipt}>
              <IconRcpt /> Receipt
            </button>
          )}
          {!quo && (
            <button style={{ ...ghostBtn, minWidth: 64, minHeight: 44, padding: 6 }} onClick={onTrash}>
              ✕ Trash
            </button>
          )}
          {quo && (
            <button style={{ ...ghostBtn, minWidth: 64, minHeight: 44, padding: 6 }} onClick={onSpam}>
              <IconPoo /> Spam
            </button>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", padding: "8px 16px 12px", background: T.bg }}>
        <button style={{ ...ghostBtn, minHeight: 44, padding: "8px 18px" }} onClick={onProject}>+ Project</button>
        <button style={{ ...ghostBtn, minHeight: 44, padding: "8px 18px" }} onClick={onForward}>→ Crew</button>
      </div>
    </div>
  );
}

function AttView({ a }: { a: ThreadAttachment }) {
  const pdfRef = useRef<HTMLDivElement | null>(null);
  const [pdfErr, setPdfErr] = useState(false);
  useEffect(() => {
    if (a.data && a.mime === "application/pdf" && pdfRef.current) {
      renderPdfInto(pdfRef.current, a.data).catch(() => setPdfErr(true));
    }
  }, [a]);
  if (a.data && a.mime.indexOf("image/") === 0) {
    return (
      <div style={{ marginTop: 10 }}>
        <img src={"data:" + a.mime + ";base64," + a.data} style={{ maxWidth: "100%", border: `1px solid ${T.border}`, borderRadius: 4, display: "block" }} alt={a.name} />
        <div style={{ fontSize: ".8rem", opacity: 0.7, margin: "4px 0 8px" }}>{a.name}</div>
      </div>
    );
  }
  if (a.data && a.mime === "application/pdf") {
    return (
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: ".8rem", opacity: 0.7, margin: "4px 0 8px" }}>{a.name}</div>
        <div ref={pdfRef} />
        {pdfErr && <div style={{ color: "#ffb03f", fontSize: ".8rem" }}>Couldn't render this PDF here — view in Gmail.</div>}
      </div>
    );
  }
  return (
    <div style={{ marginTop: 10 }}>
      <span style={{ display: "inline-block", border: `1px solid ${T.dim}`, color: T.dim, borderRadius: 4, padding: "6px 10px", fontSize: ".85rem" }}>
        📎 {a.name} ({fmtSize(a.size || 0)}) — view in Gmail
      </span>
    </div>
  );
}

/* PDF.js lazy loader */
let PDFJS_READY: Promise<void> | null = null;
function ensurePdfJs(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject();
  if ((window as any).pdfjsLib) return Promise.resolve();
  if (PDFJS_READY) return PDFJS_READY;
  PDFJS_READY = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = PDFJS;
    s.onload = () => {
      (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      res();
    };
    s.onerror = rej;
    document.head.appendChild(s);
  });
  return PDFJS_READY;
}
async function renderPdfInto(box: HTMLElement, b64: string) {
  await ensurePdfJs();
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const pdfjs = (window as any).pdfjsLib;
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const width = Math.min(box.clientWidth || 600, 900);
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: width / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = vp.width;
    canvas.height = vp.height;
    canvas.style.maxWidth = "100%";
    canvas.style.border = `1px solid ${T.border}`;
    canvas.style.borderRadius = "4px";
    canvas.style.display = "block";
    canvas.style.marginBottom = "6px";
    box.appendChild(canvas);
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
  }
}
