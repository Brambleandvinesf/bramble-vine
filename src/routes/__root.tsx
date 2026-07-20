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
import { useEffect, useState, type ReactNode, type ComponentType } from "react";
import {
  Home,
  Package,
  Truck,
  Calendar,
  MessageSquare,
  CheckSquare,
  ClipboardList,
  Folder,
  Receipt,
  Shield,
  MoreHorizontal,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import { Toaster } from "sonner";


import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider, useAuth } from "../lib/auth";
import { ViewAsProvider, useViewAs } from "../lib/view-as";
import { canSee, type ScreenId } from "../lib/permissions";
import { ReviewableTodayProvider, useReviewableToday } from "../lib/reviewable-today";

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
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
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
            <AppFrame />
          </ReviewableTodayProvider>
        </ViewAsProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function AppFrame() {
  const { user, ready } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();

  const onLogin = pathname === "/login";

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
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("SW registration failed", err);
      });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);


  return (
    <>
      <NavBar />
      {ready && (user || onLogin) ? <Outlet /> : null}
      {ready && user && !onLogin ? <BottomTabBar /> : null}
      <Toaster position="top-center" richColors />
    </>
  );
}

type TabDef = {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  screens: ScreenId[];
};
const PRIMARY_TABS: TabDef[] = [
  { to: "/", label: "HOME", icon: Home, screens: ["dashboard"] },
  { to: "/loading", label: "LOADING", icon: Package, screens: ["loading"] },
  {
    to: "/field",
    label: "FIELD",
    icon: Truck,
    screens: ["route_enroute", "route_arrived", "route_visit", "route_debrief", "route_next"],
  },
  { to: "/schedule", label: "SCHEDULE", icon: Calendar, screens: ["schedule"] },
  { to: "/messages", label: "MESSAGES", icon: MessageSquare, screens: ["messages"] },
];
const OVERFLOW_TABS: TabDef[] = [
  { to: "/confirm", label: "CONFIRM LOAD", icon: CheckSquare, screens: ["special_confirm"] },
  { to: "/visits", label: "CONFIRM VISITS", icon: ClipboardList, screens: ["visits"] },
  { to: "/projects", label: "PROJECTS", icon: Folder, screens: ["projects"] },
  { to: "/receipts", label: "RECEIPTS", icon: Receipt, screens: ["rcpt_designate", "rcpt_invoice"] },
  { to: "/admin", label: "ADMIN", icon: Shield, screens: ["admin"] },
];

const LIME_TAB = "#7cff00";
const DIM_TAB = "#4a7a1e";

function BottomTabBar() {
  const { effectiveRole } = useViewAs();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [sheetOpen, setSheetOpen] = useState(false);
  const reviewable = useReviewableToday();

  const gateReviewable = (t: TabDef) => {
    // Hide loading & confirm-load surfaces when there's nothing to review today.
    if (reviewable === false && (t.to === "/loading" || t.to === "/confirm")) return false;
    return true;
  };
  const primary = PRIMARY_TABS.filter(
    (t) => t.screens.some((s) => canSee(effectiveRole, s)) && gateReviewable(t),
  );
  const overflow = OVERFLOW_TABS.filter(
    (t) => t.screens.some((s) => canSee(effectiveRole, s)) && gateReviewable(t),
  );

  // Cap to 5 slots. If overflow exists, reserve one slot for MORE.
  const slots: TabDef[] = overflow.length > 0 ? primary.slice(0, 4) : primary.slice(0, 5);
  const bumped = primary.slice(slots.length);
  const overflowAll = [...bumped, ...overflow];
  const showMore = overflowAll.length > 0;

  const isActive = (to: string) =>
    to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(to + "/");
  const moreActive = overflowAll.some((t) => isActive(t.to));

  return (
    <>
      <nav
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 100,
          display: "flex",
          background: "#121212",
          borderTop: "1px solid #222",
          fontFamily: "'Courier New', Courier, monospace",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {slots.map((t) => {
          const active = isActive(t.to);
          const color = active ? LIME_TAB : DIM_TAB;
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              style={{
                flex: 1,
                minHeight: 56,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
                color,
                textDecoration: "none",
                textAlign: "center",
              }}
            >
              <Icon size={20} color={color} strokeWidth={2} />
              <span style={{ fontSize: 10, letterSpacing: 1, fontWeight: "bold" }}>{t.label}</span>
            </Link>
          );
        })}
        {showMore && (
          <button
            onClick={() => setSheetOpen(true)}
            style={{
              flex: 1,
              minHeight: 56,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              background: "transparent",
              border: "none",
              color: moreActive ? LIME_TAB : DIM_TAB,
              fontFamily: "inherit",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <MoreHorizontal size={20} color={moreActive ? LIME_TAB : DIM_TAB} strokeWidth={2} />
            <span style={{ fontSize: 10, letterSpacing: 1, fontWeight: "bold" }}>MORE</span>
          </button>
        )}
      </nav>
      {sheetOpen && showMore && (
        <MoreSheet
          tabs={overflowAll}
          isActive={isActive}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  );
}

function MoreSheet({
  tabs,
  isActive,
  onClose,
}: {
  tabs: TabDef[];
  isActive: (to: string) => boolean;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,.65)",
        display: "flex",
        alignItems: "flex-end",
        fontFamily: "'Courier New', Courier, monospace",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          background: "#121212",
          borderTop: "1px solid #2a2a2a",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "12px 14px 6px",
            borderBottom: "1px solid #1e1e1e",
          }}
        >
          <span style={{ color: LIME_TAB, fontSize: 12, letterSpacing: 2, fontWeight: "bold" }}>
            MORE
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: "none",
              color: DIM_TAB,
              cursor: "pointer",
              padding: 6,
            }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: "6px 0 4px" }}>
          {tabs.map((t) => {
            const active = isActive(t.to);
            const color = active ? LIME_TAB : "#cfcfcf";
            const Icon = t.icon;
            return (
              <Link
                key={t.to}
                to={t.to}
                onClick={onClose}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 18px",
                  color,
                  textDecoration: "none",
                  fontSize: 13,
                  letterSpacing: 2,
                  fontWeight: "bold",
                }}
              >
                <Icon size={20} color={color} strokeWidth={2} />
                <span>{t.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
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
