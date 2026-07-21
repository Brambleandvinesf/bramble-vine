import { useState } from "react";
import { MessageSquare, X } from "lucide-react";
import { MessagesPage } from "../routes/messages";

/**
 * Floating Messages button for the guided field flow. Opens the Messages
 * screen as a full-screen overlay so the underlying page state is preserved.
 */
export function MessagesFab() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open messages"
        style={{
          position: "fixed",
          right: 14,
          bottom: "calc(72px + env(safe-area-inset-bottom, 0px))",
          width: 52,
          height: 52,
          borderRadius: 999,
          background: "#7cff00",
          color: "#0a0a0a",
          border: "none",
          zIndex: 120,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 18px rgba(0,0,0,.5), 0 0 0 2px rgba(124,255,0,.25)",
          cursor: "pointer",
        }}
      >
        <MessageSquare size={24} strokeWidth={2.2} />
      </button>
      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 300,
            background: "#0a0a0a",
            overflowY: "auto",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close messages"
            style={{
              position: "fixed",
              top: 10,
              right: 10,
              zIndex: 310,
              width: 40,
              height: 40,
              borderRadius: 999,
              background: "#121212",
              color: "#7cff00",
              border: "1px solid #2a2a2a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <X size={20} strokeWidth={2.2} />
          </button>
          <MessagesPage />
        </div>
      )}
    </>
  );
}
