import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import type React from "react";
import { useEffect, useState, type ReactNode, type ComponentType } from "react";
import {
  Home,
  Package,
  Truck,
  Calendar,
  MessageSquare,
  CheckSquare,
  ClipboardList,
  ClipboardCheck,
  FileText,
  Folder,
  Receipt,
  Shield,
  Settings,
  ShoppingCart,
  MoreVertical,
  Maximize2,
  Minimize2,
  Users,
  X,
} from "lucide-react";
import { Toaster } from "sonner";


import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider, useAuth } from "../lib/auth";
import { ViewAsProvider, useViewAs } from "../lib/view-as";
import { canSee, type ScreenId } from "../lib/permissions";
import { ReviewableTodayProvider } from "../lib/reviewable-today";
import { useBadge, useBadgePoller, BK } from "../lib/badges";
import { useAutoClockIn } from "../lib/auto-clock-in";
import { ConfirmModalHost } from "../components/ConfirmModal";
import { KioskScreensaver } from "../components/KioskScreensaver";
import { OfficeTeamSetup } from "../components/OfficeTeamSetup";
import { DayStateSpine, SPINE_RESERVE_CSS } from "../components/DayStateSpine";
import { ReportButton } from "../components/ReportButton";
/* Rendered inside the messages overlay below. Safe direction: messages.tsx
   imports nothing from __root, so this is not a cycle. */
import { MessagesPage } from "./messages";
import { DayStateProvider } from "../lib/day-state";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" },
      { name: "theme-color", content: "#0a0a0a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "B&V" },
      { title: "Bramble & Vine" },
      { name: "description", content: "Crew dashboard: today's route, loading, receipts, messages." },
      { property: "og:title", content: "Bramble & Vine" },
      { property: "og:description", content: "Crew dashboard: today's route, loading, receipts, messages." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Bramble & Vine" },
      { name: "twitter:description", content: "Crew dashboard: today's route, loading, receipts, messages." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f1800725-c367-4e9d-8fd9-c41f53635dc3/id-preview-7d6ffd03--c1aae680-3a9e-42ff-b79d-5b3277257246.lovable.app-1784525174079.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f1800725-c367-4e9d-8fd9-c41f53635dc3/id-preview-7d6ffd03--c1aae680-3a9e-42ff-b79d-5b3277257246.lovable.app-1784525174079.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ViewAsProvider>
          <ReviewableTodayProvider>
            <DayStateProviderGate>
              <AppFrame />
            </DayStateProviderGate>
          </ReviewableTodayProvider>
        </ViewAsProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function DayStateProviderGate({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  return (
    <DayStateProvider enabled={ready && !!user}>{children}</DayStateProvider>
  );
}

function AppFrame() {
  const { user, email, role, name, ready } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();

  const onLogin = pathname === "/login";

  // Lives here rather than on a screen: the lead lands on /field but the
  // assistant lands on /schedule, so anything screen-local would miss one of
  // them or fire late.
  useAutoClockIn({ ready, email: user ? email : null, role, name });

  useBadgePoller({
    email: user ? email : null,
    canMessages: canSee(role, "messages"),
    canReceipts: canSee(role, "rcpt_designate") || canSee(role, "rcpt_invoice"),
    canVisits: canSee(role, "visits"),
    /* XX-05: was an inline lead||management check. Both queue screens now gate
       on one capability, so a role gaining access cannot end up with menu items
       that have no badge counts. */
    canApprovals: canSee(role, "route_queues"),
  });


  // Client-side gate. Legacy screens hit external endpoints and require identity;
  // we bounce unauthenticated visitors to /login. SSR renders nothing until ready.
  useEffect(() => {
    if (!ready) return;
    if (!user && !onLogin) {
      void router.navigate({ to: "/login" });
    }
  }, [ready, user, onLogin, router]);

  // Auto-recover from stale dynamic-import chunks after a redeploy.
  // Old index-*.js references code-split chunks that no longer exist;
  // a one-shot hard reload pulls the new build.
  useEffect(() => {
    const KEY = "__bv_chunk_reload_at";
    const isChunkError = (msg: string) =>
      /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(
        msg,
      );
    const maybeReload = (msg: string) => {
      if (!isChunkError(msg)) return;
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last < 10_000) return; // avoid reload loops
      sessionStorage.setItem(KEY, String(Date.now()));
      window.location.reload();
    };
    const onErr = (e: ErrorEvent) => maybeReload(e.message || String(e.error));
    const onRej = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      maybeReload(r instanceof Error ? r.message : String(r));
    };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, []);

  // Register the minimal service worker so Chrome/Android/iOS treat this as
  // an installable PWA. Network-first passthrough, no caching.
  // When a new worker activates and takes control, reload once so the page
  // runs under the latest version.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    let registration: ServiceWorkerRegistration | null = null;

    const promoteWaiting = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    };

    const watchForUpdates = (reg: ServiceWorkerRegistration) => {
      promoteWaiting(reg);
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) {
            // A new worker is waiting because an old one still controls the page.
            reg.waiting?.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
    };

    const checkForUpdate = () => {
      registration?.update().catch(() => {});
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((reg) => {
          registration = reg;
          watchForUpdates(reg);
          // Poll for updates every 60s while the tab is open.
          const interval = window.setInterval(checkForUpdate, 60_000);
          (window as unknown as { __bv_sw_interval?: number }).__bv_sw_interval = interval;
        })
        .catch((err) => {
          console.warn("SW registration failed", err);
        });
    };

    document.addEventListener("visibilitychange", onVisibility);
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => {
      window.removeEventListener("load", onLoad);
      document.removeEventListener("visibilitychange", onVisibility);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      const w = window as unknown as { __bv_sw_interval?: number };
      if (w.__bv_sw_interval) window.clearInterval(w.__bv_sw_interval);
    };
  }, []);



  return (
    <>
      <NavBar />
      {ready && user && !onLogin ? <HamburgerMenu /> : null}
      {ready && user && !onLogin ? <MessagesFab /> : null}
      {/* The bottom reservation comes from the spine itself so the two cannot
          drift. A flat 128 here matched only the spine's body, leaving its
          arrow tab and the safe-area inset sitting over the foot of every page
          - which is how Confirm Day's submit button ended up unreachable. */}
      {ready && (user || onLogin) ? (
        <div
          style={{
            paddingTop: user && !onLogin ? 56 : 0,
            paddingBottom: user && !onLogin ? SPINE_RESERVE_CSS : 0,
          }}
        >
          <Outlet />
        </div>
      ) : null}
      {ready && user && !onLogin ? <DayStateSpine /> : null}
      {/* OO (8/2): the "!" report button, on every signed-in screen. */}
      {ready && user && !onLogin ? <ReportButton /> : null}
      <Toaster position="top-center" richColors />
      <ConfirmModalHost />
      <OfficeTeamSetup />
      {/* (8/4) Wall display only, and mounted UNCONDITIONALLY on purpose: it
          gates itself on the device flag and on LA quiet hours, and the kiosk can
          be sitting on the login screen at 8pm — which still wants covering. */}
      <KioskScreensaver />
    </>
  );
}


type TabDef = {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
};
const TABS: Record<string, TabDef> = {
  home:     { to: "/",         label: "HOME",          icon: Home },
  schedule: { to: "/schedule", label: "SCHEDULE",      icon: Calendar },
  confirm:  { to: "/confirm",  label: "CONFIRM LOAD",  icon: CheckSquare },
  loading:  { to: "/loading",  label: "LOADING",       icon: Package },
  field:    { to: "/field",    label: "FIELD",         icon: Truck },
  visits:   { to: "/visits",   label: "CONFIRM VISITS",icon: ClipboardList },
  /* CC-45 Item 47: its own entry — "CONFIRM VISITS" stopped describing half of what
     that screen showed once invoice drafts started landing in it. */
  invoices: { to: "/invoices", label: "INVOICE QUEUE", icon: FileText },
  messages: { to: "/messages", label: "MESSAGES",      icon: MessageSquare },
  projects: { to: "/projects", label: "PROJECTS",      icon: Folder },
  receipts: { to: "/receipts", label: "RECEIPTS",      icon: Receipt },
  shopping: { to: "/shopping", label: "SHOPPING LIST", icon: ShoppingCart },
  approvals:{ to: "/approvals",label: "APPROVAL QUEUE",icon: ClipboardCheck },
  /* (8/4) THE FAILSAFE. Reaches the debrief screens for a visit that has already
     happened, without depending on the day-state machine — which is why debriefs
     were routinely not happening at all. Lead + management only. */
  debriefq: { to: "/debrief-queue", label: "DEBRIEF QUEUE", icon: ClipboardList },
  admin:    { to: "/admin",    label: "ADMIN",         icon: Shield },
};

import type { Role } from "../lib/auth";

// Per-role bottom-bar layouts. `row` = icon-only tabs. `more` = items shown
// inside the ⋯ popover (rendered as second-to-last slot when non-empty).
// Messages is always last.
// Shopping List is visible to EVERY role (U, 8/2) — a shared list, no gating.
const LAYOUTS: Record<Role, { row: string[]; more: string[] }> = {
  lead:       { row: ["messages"], more: ["home","schedule","confirm","field","loading","projects","receipts","shopping","approvals","debriefq"] },
  assistant:  { row: ["messages"], more: ["home","schedule","field","loading","receipts","shopping"] },
  office:     { row: ["messages"], more: ["home","schedule","visits","invoices","projects","receipts","shopping","approvals","debriefq"] },
  management: { row: ["home","schedule","confirm","loading","field","visits","messages"], more: ["invoices","projects","receipts","shopping","approvals","debriefq","admin"] },
};

/* XX-05: which nav keys answer to a capability rather than to LAYOUTS alone.
   LAYOUTS is a hand-maintained list, so listing a key there is necessary but not
   sufficient — the capability decides. That way changing route_queues in
   permissions.ts moves the nav too, instead of leaving a fifth place to forget. */
const NAV_CAPABILITY: Record<string, ScreenId> = {
  approvals: "route_queues",
  debriefq: "route_queues",
  /* CC-45 Item 47: the Invoice Queue answers to the SAME capability as Confirm
     Visits, so it inherits office + management only and Item 41's hold (leads must
     not see invoice financials) needs no second rule. Listed here as well as in
     LAYOUTS for the reason stated above — LAYOUTS alone is necessary, not
     sufficient. */
  invoices: "visits",
};

const LIME_TAB = "#7cff00";
const DIM_TAB = "#4a7a1e";

function HamburgerMenu() {
  const { effectiveRole } = useViewAs();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const inboxCount = useBadge(BK.inbox) ?? 0;
  const receiptsCount = useBadge(BK.receipts) ?? 0;
  const visitsCount = useBadge(BK.visits) ?? 0;
  const invoicesCount = useBadge(BK.invoices) ?? 0;      // CC-45 Item 47
  const approvalsCount = useBadge(BK.approvals) ?? 0;
  const debriefqCount = useBadge(BK.debriefq) ?? 0;


  if (!effectiveRole) return null;

  // Team assignment is office/lead/management (ARCHITECTURE §5 failsafe). The
  // spine's "Assign Teams" node only exists during HQ_LOADING, so this is the
  // way in for the rest of the day.
  const canAssignTeams =
    effectiveRole === "office" || effectiveRole === "lead" || effectiveRole === "management";

  const layout = LAYOUTS[effectiveRole];
  // All tabs the role can see, excluding messages (rendered as floating FAB).
  // XX-05: a key with a NAV_CAPABILITY must also pass it, so permissions.ts is
  // the single source of truth rather than one of several.
  const keys = [...layout.row, ...layout.more].filter(
    (k) =>
      k !== "messages" &&
      (!NAV_CAPABILITY[k] || canSee(effectiveRole, NAV_CAPABILITY[k])),
  );
  const tabs = keys.map((k) => TABS[k]).filter(Boolean);

  const isActive = (to: string) =>
    to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(to + "/");

  const badgeFor = (to: string): number => {
    if (to === "/messages") return inboxCount;
    if (to === "/receipts") return receiptsCount;
    if (to === "/visits") return visitsCount;
    if (to === "/invoices") return invoicesCount;      // CC-45 Item 47
    if (to === "/approvals") return approvalsCount;
    if (to === "/debrief-queue") return debriefqCount;

    return 0;
  };

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu"
        aria-expanded={open}
        style={{
          position: "fixed",
          top: 52,
          left: 10,
          zIndex: 110,
          width: 44,
          height: 44,
          borderRadius: 999,
          background: "#121212",
          border: `1px solid ${open ? LIME_TAB : "#2a2a2a"}`,
          color: open ? LIME_TAB : "#cfcfcf",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          padding: 0,
        }}
      >
        {open ? <X size={20} strokeWidth={2} /> : <MoreVertical size={22} strokeWidth={2} />}
      </button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.4)" }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: 104,
              left: 10,
              zIndex: 200,
              background: "#121212",
              border: "1px solid #2a2a2a",
              borderRadius: 6,
              minWidth: 200,
              boxShadow: "0 4px 16px rgba(0,0,0,.6)",
              fontFamily: "'Courier New', Courier, monospace",
              padding: "4px 0",
            }}
          >
            {tabs.map((t) => {
              const active = isActive(t.to);
              const color = active ? LIME_TAB : "#cfcfcf";
              const Icon = t.icon;
              const n = badgeFor(t.to);
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  onClick={() => setOpen(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 14px",
                    color,
                    textDecoration: "none",
                    fontSize: 12,
                    letterSpacing: 1.5,
                    fontWeight: "bold",
                    whiteSpace: "nowrap",
                  }}
                >
                  <Icon size={16} color={color} strokeWidth={2} />
                  <span style={{ flex: 1 }}>{t.label}</span>
                  {n >= 1 && (
                    <span
                      style={{
                        minWidth: 18,
                        height: 18,
                        padding: "0 5px",
                        borderRadius: 999,
                        background: LIME_TAB,
                        color: "#0a0a0a",
                        fontSize: 11,
                        lineHeight: "18px",
                        fontWeight: 700,
                        textAlign: "center",
                      }}
                    >
                      {n}
                    </span>
                  )}
                </Link>
              );
            })}
            {canAssignTeams && (
              <button
                onClick={() => {
                  setOpen(false);
                  try {
                    window.dispatchEvent(new CustomEvent("bv:open-team-setup"));
                  } catch {
                    /* ignore */
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 14px",
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  borderTop: tabs.length > 0 ? "1px solid #2a2a2a" : "none",
                  color: "#cfcfcf",
                  fontFamily: "inherit",
                  fontSize: 12,
                  letterSpacing: 1.5,
                  fontWeight: "bold",
                  whiteSpace: "nowrap",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <Users size={16} color="#cfcfcf" strokeWidth={2} />
                <span style={{ flex: 1 }}>EDIT TEAMS</span>
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}

/* The ONE messages control, for every role, on every signed-in page.
 *
 * There used to be two. This one sat top-right and NAVIGATED to /messages;
 * components/MessagesFab.tsx sat bottom-right and opened Messages as an overlay
 * so the page underneath kept its state. /schedule and /loading rendered the
 * second one on top of this one, so those screens showed two message icons with
 * two different behaviours.
 *
 * Consolidated (8/4): one icon, top-right, and it opens the OVERLAY — the
 * state-preserving behaviour is the one worth keeping. Navigating away from a
 * half-finished loading checklist to read a message, then having to find your
 * place again, is exactly what the overlay existed to avoid.
 *
 * The /messages ROUTE still exists and is still linked from the home tiles, so
 * the fab hides while you are on it: offering to open an overlay of the page you
 * are already looking at is nonsense, and hiding it keeps "one behaviour"
 * literally true.
 */
function MessagesFab() {
  const { effectiveRole } = useViewAs();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const inboxCount = useBadge(BK.inbox) ?? 0;
  const [open, setOpen] = useState(false);

  /* Escape closes it, as with every other overlay in the app. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const onMessagesRoute = pathname === "/messages" || pathname.startsWith("/messages/");
  if (!effectiveRole || onMessagesRoute) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={inboxCount >= 1 ? `Messages, ${inboxCount} awaiting` : "Messages"}
        aria-expanded={open}
        style={{
          position: "fixed",
          top: 52,
          right: 10,
          zIndex: 110,
          width: 44,
          height: 44,
          borderRadius: 999,
          background: open ? LIME_TAB : "#121212",
          border: `1px solid ${open ? LIME_TAB : "#2a2a2a"}`,
          color: open ? "#0a0a0a" : LIME_TAB,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,.5)",
        }}
      >
        <MessageSquare size={22} color={open ? "#0a0a0a" : LIME_TAB} strokeWidth={2} />
        {inboxCount >= 1 && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              minWidth: 18,
              height: 18,
              padding: "0 5px",
              borderRadius: 999,
              background: LIME_TAB,
              color: "#0a0a0a",
              fontSize: 11,
              lineHeight: "18px",
              fontWeight: 700,
              textAlign: "center",
              border: "1px solid #0a0a0a",
            }}
          >
            {inboxCount}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Messages"
          style={{
            position: "fixed",
            inset: 0,
            /* Above the fab (110) and the menu, below the kiosk screensaver
               (99000) — the wall display must still be able to cover this. */
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
              color: LIME_TAB,
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



function FullscreenButton() {
  const [isFs, setIsFs] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    onChange();
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };
  const Icon = isFs ? Minimize2 : Maximize2;
  return (
    <button
      onClick={toggle}
      title={isFs ? "Exit full screen" : "Full screen"}
      aria-label={isFs ? "Exit full screen" : "Full screen"}
      style={{
        background: "transparent",
        color: "#7cff00",
        border: "1px solid #2a2a2a",
        borderRadius: 4,
        width: 28,
        height: 28,
        padding: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
      }}
    >
      <Icon size={14} strokeWidth={2} />
    </button>
  );
}

function NavBar() {
  const { user, signOut } = useAuth();
  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "#0a0a0a",
        borderBottom: "1px solid #2a2a2a",
        padding: "8px 12px",
        fontFamily: "'Courier New', Courier, monospace",
        position: "sticky",
        top: 0,
        zIndex: 100,
        minHeight: 44,
      }}
    >
      <Link
        to="/"
        style={{
          color: "#7cff00",
          textDecoration: "none",
          fontSize: 13,
          letterSpacing: 2,
          fontWeight: "bold",
        }}
      >
        BRAMBLE &amp; VINE
      </Link>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        {user ? (
          <>
            <span
              title={user}
              style={{
                color: "#8f8f8f",
                fontSize: 11,
                letterSpacing: 1,
                textTransform: "uppercase",
                maxWidth: 200,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user}
            </span>
            <FullscreenButton />
            <button
              onClick={signOut}
              style={{
                background: "transparent",
                color: "#7cff00",
                border: "1px solid #7cff00",
                borderRadius: 4,
                padding: "4px 10px",
                fontFamily: "inherit",
                fontSize: 11,
                letterSpacing: 1,
                cursor: "pointer",
              }}
            >
              SIGN OUT
            </button>
          </>
        ) : (
          <FullscreenButton />
        )}
      </div>
    </nav>
  );
}
