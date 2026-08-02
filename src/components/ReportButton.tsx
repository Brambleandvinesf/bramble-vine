import { useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import { useDayState } from "../lib/day-state";
import { captureScreenBase64 } from "../lib/capture";
import { SCRIPT_URL } from "../routes/confirm";

/**
 * OO (8/2): the "!" report button — present on every screen, deliberately
 * out of the way. Type what you saw, submit, done: the app captures its own
 * rendered DOM, files it to Drive and opens a GitHub issue. No categories,
 * no review step (Brandon reviews the issues list, not a gate in here).
 */

const LIME = "#7cff00";
const LIME_DIM = "#2f5f10";
const BG = "#0a0a0a";
const TEXT = "#e8e8e8";
const MUTED = "#8f8f8f";
const LINE = "#2a2a2a";

export function ReportButton() {
  const { user, role } = useAuth();
  const dayState = useDayState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // Only for signed-in crew — no point offering it on the login screen.
  if (!user || pathname === "/login") return null;

  const screenName = (() => {
    const base = pathname === "/" ? "Home" : pathname.replace(/^\//, "");
    const sub = dayState?.subStep;
    const pretty = base.charAt(0).toUpperCase() + base.slice(1);
    return sub ? `${pretty}/${sub}` : pretty;
  })();

  const submit = async () => {
    const text = note.trim();
    if (!text || busy) return;
    setBusy(true);
    // Hide the sheet first so the screenshot shows the screen being
    // reported, not the report form sitting on top of it.
    setOpen(false);
    await new Promise((r) => window.setTimeout(r, 180));
    let shot: string | null = null;
    try {
      shot = await captureScreenBase64();
    } catch {
      shot = null;
    }
    try {
      const stop = dayState?.client ? `${dayState.client} (${dayState.subStep ?? "-"})` : dayState?.subStep;
      const res = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          action: "reportIssue",
          note: text,
          screen: screenName,
          user: user ?? "",
          role: role ?? "",
          context: stop ?? "",
          imageBase64: shot ?? "",
          mime: "image/png",
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; issueNumber?: number };
      if (res.ok && json.ok !== false) {
        toast.success(
          json.issueNumber ? `Report filed — #${json.issueNumber}` : "Report filed",
        );
        setNote("");
      } else {
        toast.error(json.error ?? "Report failed — try again");
        setOpen(true);
      }
    } catch {
      toast.error("Report failed — try again");
      setOpen(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Report a problem"
        title="Report a problem"
        style={{
          position: "fixed",
          top: 52,
          right: 10,
          zIndex: 108,
          width: 28,
          height: 28,
          borderRadius: 999,
          background: "#121212",
          border: `1px solid ${LINE}`,
          color: MUTED,
          fontFamily: "'Courier New', Courier, monospace",
          fontSize: 15,
          fontWeight: "bold",
          lineHeight: 1,
          cursor: "pointer",
          padding: 0,
          opacity: 0.75,
        }}
      >
        !
      </button>

      {open && (
        <div
          onClick={() => !busy && setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.8)",
            zIndex: 320,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: BG,
              borderTop: `1px solid ${LINE}`,
              borderRadius: "12px 12px 0 0",
              width: "100%",
              maxWidth: 560,
              padding: "16px 14px calc(20px + env(safe-area-inset-bottom, 0px))",
              fontFamily: "'Courier New', Courier, monospace",
              color: TEXT,
            }}
          >
            <div style={{ color: LIME, fontSize: 13, letterSpacing: 2, fontWeight: "bold" }}>
              REPORT A PROBLEM
            </div>
            <div style={{ color: MUTED, fontSize: 11, marginTop: 4 }}>
              {screenName} · a screenshot of this screen is attached automatically.
            </div>
            <textarea
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you see?"
              rows={4}
              style={{
                width: "100%",
                boxSizing: "border-box",
                marginTop: 10,
                background: BG,
                color: TEXT,
                border: `1px solid ${LINE}`,
                borderRadius: 6,
                padding: 10,
                fontFamily: "inherit",
                fontSize: 14,
                resize: "vertical",
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || !note.trim()}
                style={{
                  flex: 1,
                  minHeight: 48,
                  background: LIME,
                  color: BG,
                  border: "none",
                  borderRadius: 6,
                  fontFamily: "inherit",
                  fontSize: 13,
                  letterSpacing: 2,
                  fontWeight: "bold",
                  cursor: "pointer",
                  opacity: busy || !note.trim() ? 0.5 : 1,
                }}
              >
                {busy ? "SENDING…" : "SEND REPORT"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                style={{
                  minHeight: 48,
                  background: "transparent",
                  color: LIME,
                  border: `1px solid ${LIME_DIM}`,
                  borderRadius: 6,
                  padding: "0 14px",
                  fontFamily: "inherit",
                  fontSize: 13,
                  letterSpacing: 2,
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
