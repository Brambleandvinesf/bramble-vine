import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/messages")({
  head: () => ({
    meta: [
      { title: "Message Center" },
      { name: "description", content: "Unified inbox across Gmail and Quo." },
    ],
  }),
  component: MessagesPage,
});

type Message = {
  id: string;
  source: "gmail" | "quo";
  sender_name: string;
  content: string;
  received_at: string;
  status: "read" | "unread";
};

const PAGE_SIZE = 50;

function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Initial load — 50 most recent.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .order("received_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (cancelled) return;
      if (error) setError(error.message);
      else {
        setMessages((data ?? []) as Message[]);
        setHasMore((data?.length ?? 0) === PAGE_SIZE);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Realtime — new inserts, updates, deletes.
  useEffect(() => {
    const channel = supabase
      .channel("messages-inbox")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as Message;
          setMessages((cur) =>
            cur.some((m) => m.id === row.id) ? cur : [row, ...cur],
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as Message;
          setMessages((cur) => cur.map((m) => (m.id === row.id ? row : m)));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages" },
        (payload) => {
          const oldRow = payload.old as { id: string };
          setMessages((cur) => cur.filter((m) => m.id !== oldRow.id));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    const last = messages[messages.length - 1];
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .order("received_at", { ascending: false })
      .lt("received_at", last.received_at)
      .limit(PAGE_SIZE);
    if (error) setError(error.message);
    else {
      const rows = (data ?? []) as Message[];
      setMessages((cur) => {
        const seen = new Set(cur.map((m) => m.id));
        return [...cur, ...rows.filter((r) => !seen.has(r.id))];
      });
      setHasMore(rows.length === PAGE_SIZE);
    }
    setLoadingMore(false);
  }, [messages, hasMore, loadingMore]);

  // Infinite scroll sentinel.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "300px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  const toggleRead = useCallback(async (m: Message) => {
    const next: Message["status"] = m.status === "read" ? "unread" : "read";
    setMessages((cur) =>
      cur.map((x) => (x.id === m.id ? { ...x, status: next } : x)),
    );
    const { error } = await supabase
      .from("messages")
      .update({ status: next })
      .eq("id", m.id);
    if (error) {
      setMessages((cur) =>
        cur.map((x) => (x.id === m.id ? { ...x, status: m.status } : x)),
      );
    }
  }, []);

  return (
    <div style={PAGE}>
      <header style={HEADER}>
        <div style={{ color: LIME, fontSize: 20, fontWeight: "bold", letterSpacing: 2 }}>
          MESSAGE CENTER
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 4, letterSpacing: 1 }}>
          {messages.length} LOADED · LIVE
        </div>
      </header>

      {error && <div style={ERRBAR}>{error}</div>}

      {loading && <div style={STATE}>Loading…</div>}

      {!loading && messages.length === 0 && !error && (
        <div style={STATE}>Inbox is empty.</div>
      )}

      <div style={{ padding: "10px 12px 40px" }}>
        {messages.map((m) => {
          const unread = m.status === "unread";
          return (
            <div
              key={m.id}
              onClick={() => toggleRead(m)}
              style={{
                ...ITEM,
                borderLeft: `3px solid ${unread ? LIME : "transparent"}`,
                background: unread ? "#141914" : "#121212",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ ...BADGE, background: m.source === "gmail" ? "#4a7a1e" : "#1e5a7a" }}>
                  {m.source.toUpperCase()}
                </span>
                <span style={{
                  fontSize: 14,
                  fontWeight: unread ? "bold" : "normal",
                  color: unread ? TEXT : MUTED,
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {m.sender_name}
                </span>
                <span style={{ fontSize: 11, color: MUTED, letterSpacing: 1 }}>
                  {formatWhen(m.received_at)}
                </span>
              </div>
              <div style={{
                fontSize: 13,
                color: unread ? TEXT : MUTED,
                lineHeight: 1.4,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}>
                {m.content}
              </div>
            </div>
          );
        })}

        {hasMore && (
          <div ref={sentinelRef} style={STATE}>
            {loadingMore ? "Loading more…" : ""}
          </div>
        )}
        {!hasMore && messages.length >= PAGE_SIZE && (
          <div style={STATE}>End of inbox.</div>
        )}
      </div>
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return d.toLocaleDateString();
}

const LIME = "#7cff00";
const TEXT = "#e8e8e8";
const MUTED = "#8f8f8f";
const LINE = "#2a2a2a";
const RED = "#ff3b30";

const PAGE: React.CSSProperties = {
  background: "#0a0a0a",
  color: TEXT,
  fontFamily: "'Courier New', Courier, monospace",
  minHeight: "calc(100vh - 60px)",
};
const HEADER: React.CSSProperties = {
  position: "sticky",
  top: 44,
  zIndex: 10,
  background: "#0a0a0a",
  borderBottom: `1px solid ${LINE}`,
  padding: "14px 16px 10px",
};
const ERRBAR: React.CSSProperties = {
  margin: "10px 12px 0",
  padding: "10px 12px",
  background: "#1a0a0a",
  border: `1px solid ${RED}`,
  color: RED,
  borderRadius: 6,
  fontSize: 13,
};
const STATE: React.CSSProperties = {
  margin: "24px 20px",
  textAlign: "center",
  color: MUTED,
  fontSize: 13,
};
const ITEM: React.CSSProperties = {
  padding: "12px 14px",
  marginBottom: 8,
  border: `1px solid ${LINE}`,
  borderRadius: 8,
  cursor: "pointer",
  userSelect: "none",
};
const BADGE: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: 1,
  color: "#0a0a0a",
  fontWeight: "bold",
  borderRadius: 3,
  padding: "1px 6px",
};
