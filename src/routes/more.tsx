import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { SCRIPT_URL } from "./confirm";

export const Route = createFileRoute("/more")({
  head: () => ({
    meta: [
      { title: "More — Bramble & Vine crew tools" },
      { name: "description", content: "Device settings for the Bramble & Vine crew app, including push notifications on this phone." },
      { property: "og:title", content: "More — Bramble & Vine crew tools" },
      { property: "og:description", content: "Device settings for the Bramble & Vine crew app, including push notifications on this phone." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MorePage,
});

/* Terminal palette — same values every other screen in this app uses.
   No yellow / orange / red anywhere. */
const BG = "#0a0a0a";
const PANEL = "#121212";
const LIME = "#7cff00";
const MUTED = "#8f8f8f";
const TEXT = "#e6e6e6";
const MONO = "'Courier New', Courier, monospace";
const BORDER = "1px solid #262626";

const PERSON_KEY = "bv.push.person";

/** Standard base64url -> Uint8Array for applicationServerKey. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function post(body: Record<string, unknown>) {
  await fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body),
  });
}

function PushPanel() {
  const { role } = useAuth();
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const [person, setPerson] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPerm("unsupported");
    } else {
      setPerm(Notification.permission);
    }
    try {
      setPerson(localStorage.getItem(PERSON_KEY) || "");
    } catch {}
  }, []);

  const vapid = import.meta.env["VITE_VAPID_PUBLIC_KEY"] as string | undefined;

  async function turnOn() {
    if (perm === "unsupported") return;
    const label = person.trim();
    if (!label) {
      setStatus("Type whose phone this is first.");
      return;
    }
    if (!vapid) {
      setStatus("Push key not configured on this build yet — nothing was registered.");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const granted = await Notification.requestPermission();
      setPerm(granted);
      if (granted !== "granted") {
        setStatus(
          granted === "denied"
            ? "Notifications are blocked for this app. Re-enable them in your browser's site settings for this page — the app can't ask again."
            : "Permission was dismissed. Nothing registered.",
        );
        return;
      }
      try {
        localStorage.setItem(PERSON_KEY, label);
      } catch {}
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      });
      const j = sub.toJSON() as { keys?: { p256dh?: string; auth?: string } };
      await post({
        action: "registerPush",
        person: label,
        role,
        endpoint: sub.endpoint,
        p256dh: j.keys?.p256dh ?? "",
        auth: j.keys?.auth ?? "",
        device: navigator.userAgent.slice(0, 120),
      });
      setStatus(`Registered — this phone will get notifications as ${label}.`);
    } catch (err) {
      setStatus("Couldn't register: " + String(err));
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setStatus("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        setStatus("This phone wasn't registered.");
        return;
      }
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await post({ action: "unregisterPush", endpoint });
      setStatus("Turned off on this phone.");
    } catch (err) {
      setStatus("Couldn't turn off: " + String(err));
    } finally {
      setBusy(false);
    }
  }

  const permLabel =
    perm === "unsupported"
      ? "NOT SUPPORTED ON THIS BROWSER"
      : perm === "granted"
        ? "ALLOWED"
        : perm === "denied"
          ? "BLOCKED"
          : "NOT ASKED YET";

  return (
    <div style={{ background: PANEL, border: BORDER, borderRadius: 6, padding: 14 }}>
      <div style={{ color: LIME, fontSize: 13, letterSpacing: 2, fontWeight: "bold" }}>
        NOTIFICATIONS ON THIS PHONE
      </div>
      <div style={{ color: MUTED, fontSize: 12, marginTop: 8 }}>
        Permission: <span style={{ color: TEXT }}>{permLabel}</span>
      </div>

      <label style={{ display: "block", color: MUTED, fontSize: 11, letterSpacing: 1, marginTop: 14 }}>
        WHOSE PHONE IS THIS?
      </label>
      <input
        value={person}
        onChange={(e) => setPerson(e.target.value)}
        placeholder="e.g. Miguel"
        disabled={busy || perm === "unsupported"}
        style={{
          width: "100%",
          marginTop: 6,
          background: BG,
          border: BORDER,
          color: TEXT,
          fontFamily: MONO,
          fontSize: 15,
          padding: "10px 12px",
          borderRadius: 4,
        }}
      />
      <div style={{ color: MUTED, fontSize: 11, marginTop: 6 }}>
        The crew shares one login, so this label is how the office knows which phone to reach.
      </div>

      {perm === "denied" ? (
        <div style={{ color: MUTED, fontSize: 12, marginTop: 14, lineHeight: 1.5 }}>
          Notifications are blocked for this app. Re-enable them in your browser's site settings
          for this page, then come back — the app can't ask again from here.
        </div>
      ) : (
        <button
          onClick={turnOn}
          disabled={busy || perm === "unsupported"}
          style={{
            width: "100%",
            marginTop: 14,
            background: "transparent",
            border: `1px solid ${LIME}`,
            color: LIME,
            fontFamily: MONO,
            fontSize: 14,
            letterSpacing: 2,
            fontWeight: "bold",
            padding: "12px 10px",
            borderRadius: 999,
            opacity: busy || perm === "unsupported" ? 0.5 : 1,
          }}
        >
          {busy ? "WORKING…" : "TURN ON NOTIFICATIONS"}
        </button>
      )}

      <button
        onClick={turnOff}
        disabled={busy || perm === "unsupported"}
        style={{
          width: "100%",
          marginTop: 8,
          background: "transparent",
          border: BORDER,
          color: MUTED,
          fontFamily: MONO,
          fontSize: 12,
          letterSpacing: 2,
          padding: "10px",
          borderRadius: 999,
          opacity: busy || perm === "unsupported" ? 0.5 : 1,
        }}
      >
        TURN OFF ON THIS PHONE
      </button>

      {status ? (
        <div style={{ color: TEXT, fontSize: 12, marginTop: 12, lineHeight: 1.5 }} role="status">
          {status}
        </div>
      ) : null}
    </div>
  );
}

function MorePage() {
  return (
    <div
      style={{
        minHeight: "calc(100vh - 44px - 64px)",
        background: BG,
        color: TEXT,
        fontFamily: MONO,
        padding: 16,
      }}
    >
      <h1 style={{ color: LIME, fontSize: 14, letterSpacing: 3, fontWeight: "bold", margin: "4px 0 16px" }}>
        MORE
      </h1>
      <PushPanel />
    </div>
  );
}
