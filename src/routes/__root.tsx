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
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider, useAuth } from "../lib/auth";
import { ViewAsProvider, useViewAs } from "../lib/view-as";
import { canSee, type ScreenId } from "../lib/permissions";

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
          <AppFrame />
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
    </>
  );
}

type TabDef = { to: string; label: string; screens: ScreenId[] };
const TABS: TabDef[] = [
  { to: "/", label: "HOME", screens: ["dashboard"] },
  { to: "/loading", label: "LOADING", screens: ["loading"] },
  { to: "/confirm", label: "CONFIRM lOAD", screens: ["special_confirm"] },
  {
    to: "/field",
    label: "FIELD",
    screens: ["route_enroute", "route_arrived", "route_visit", "route_debrief", "route_next"],
  },
  { to: "/schedule", label: "SCHEDULE", screens: ["schedule"] },
  { to: "/visits", label: "CONFIRM VISITS", screens: ["visits"] },
  { to: "/projects", label: "PROJECTS", screens: ["projects"] },
  { to: "/messages", label: "MESSAGES", screens: ["messages"] },
  { to: "/receipts", label: "RECEIPTS", screens: ["rcpt_designate", "rcpt_invoice"] },
  { to: "/admin", label: "ADMIN", screens: ["admin"] },
];

function BottomTabBar() {
  const { effectiveRole } = useViewAs();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const visible = TABS.filter((t) => t.screens.some((s) => canSee(effectiveRole, s)));
  return (
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
      }}
    >
      {visible.map((t) => {
        const active = t.to === "/" ? pathname === "/" : pathname === t.to || pathname.startsWith(t.to + "/");
        return (
          <Link
            key={t.to}
            to={t.to}
            style={{
              flex: 1,
              minHeight: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: active ? "#7cff00" : "#4a7a1e",
              textDecoration: "none",
              fontSize: 11,
              letterSpacing: 2,
              fontWeight: "bold",
              textAlign: "center",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
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
        ) : null}
      </div>
    </nav>
  );
}
