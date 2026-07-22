import { useEffect, useState } from "react";

/* ============================================================
 * In-app confirmation modal — replaces window.confirm() so the
 * Pi kiosk never leaves fullscreen. Promise-based imperative API:
 *
 *   const ok = await confirmModal("Delete this?");
 *   const ok = await confirmModal({ message: "Trash?", destructive: true });
 * ============================================================ */

const LIME = "#7cff00";
const TEXT = "#e8e8e8";
const LINE = "#2a2a2a";

export type ConfirmOptions = {
  message: string;
  destructive?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
};

type PendingRequest = {
  id: number;
  options: ConfirmOptions;
  resolve: (ok: boolean) => void;
};

type Listener = (req: PendingRequest | null) => void;

let currentListener: Listener | null = null;
let seq = 0;

export function confirmModal(input: string | ConfirmOptions): Promise<boolean> {
  const options: ConfirmOptions =
    typeof input === "string" ? { message: input } : input;
  return new Promise<boolean>((resolve) => {
    const req: PendingRequest = { id: ++seq, options, resolve };
    if (currentListener) {
      currentListener(req);
    } else {
      // No host mounted — fall back so the flow never wedges.
      resolve(
        typeof window !== "undefined" ? window.confirm(options.message) : false,
      );
    }
  });
}

export function ConfirmModalHost() {
  const [req, setReq] = useState<PendingRequest | null>(null);

  useEffect(() => {
    currentListener = (next) => setReq(next);
    return () => {
      currentListener = null;
    };
  }, []);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        req.resolve(false);
        setReq(null);
      } else if (e.key === "Enter") {
        req.resolve(true);
        setReq(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [req]);

  if (!req) return null;

  const { message, destructive, confirmLabel, cancelLabel } = req.options;

  const answer = (ok: boolean) => {
    req.resolve(ok);
    setReq(null);
  };

  const confirmStyle: React.CSSProperties = destructive
    ? {
        background: "transparent",
        color: LIME,
        border: `2px solid ${LIME}`,
        fontWeight: 900,
      }
    : {
        background: LIME,
        color: "#0a0a0a",
        border: "none",
        fontWeight: "bold",
      };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => answer(false)}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.72)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        fontFamily: "'Courier New', Courier, monospace",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#121212",
          border: `1px solid ${LINE}`,
          borderRadius: 10,
          maxWidth: 420,
          width: "100%",
          padding: 20,
          color: TEXT,
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        }}
      >
        <div
          style={{
            fontSize: 15,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            marginBottom: 20,
          }}
        >
          {message}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={() => answer(false)}
            style={{
              background: "transparent",
              color: LIME,
              border: `1px solid ${LIME}`,
              borderRadius: 6,
              padding: "0 18px",
              minHeight: 48,
              fontFamily: "inherit",
              fontSize: 13,
              letterSpacing: 2,
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            {cancelLabel ?? "CANCEL"}
          </button>
          <button
            type="button"
            onClick={() => answer(true)}
            style={{
              ...confirmStyle,
              borderRadius: 6,
              padding: "0 22px",
              minHeight: 48,
              fontFamily: "inherit",
              fontSize: 13,
              letterSpacing: 2,
              cursor: "pointer",
            }}
          >
            {confirmLabel ?? "CONFIRM"}
          </button>
        </div>
      </div>
    </div>
  );
}
