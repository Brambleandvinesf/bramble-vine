import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Beta auth.oauth namespace — declare a local typed shape for the three methods.
type OAuthDetails = {
  client?: { name?: string; client_uri?: string; redirect_uris?: string[] };
  redirect_url?: string;
  redirect_to?: string;
  scope?: string;
};
type OAuthResult = { data: OAuthDetails | null; error: { message: string } | null };
type OAuthAPI = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
  approveAuthorization: (id: string) => Promise<OAuthResult>;
  denyAuthorization: (id: string) => Promise<OAuthResult>;
};
const oauth = () => (supabase.auth as unknown as { oauth: OAuthAPI }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/login", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={{ color: "#ff3b30", fontSize: 16, letterSpacing: 2 }}>AUTHORIZATION ERROR</h1>
        <p style={{ color: "#e8e8e8", fontSize: 13 }}>
          {String((error as Error)?.message ?? error)}
        </p>
      </div>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientName = details?.client?.name ?? "an app";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const result = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (result.error) {
      setBusy(false);
      setError(result.error.message);
      return;
    }
    const target = result.data?.redirect_url ?? result.data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={{ color: "#7cff00", fontSize: 18, letterSpacing: 2, marginBottom: 4 }}>
          CONNECT {clientName.toUpperCase()}
        </h1>
        <p style={{ color: "#8f8f8f", fontSize: 13, marginBottom: 20 }}>
          {clientName} will be able to use the Bramble &amp; Vine inbox tools while
          you are signed in. This does not bypass this app's policies.
        </p>
        {error && (
          <div role="alert" style={{ color: "#ff3b30", fontSize: 12, marginBottom: 12 }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            disabled={busy}
            onClick={() => decide(true)}
            style={{ ...btn, background: "#7cff00", color: "#0a0a0a", flex: 1 }}
          >
            {busy ? "..." : "APPROVE"}
          </button>
          <button
            disabled={busy}
            onClick={() => decide(false)}
            style={{ ...btn, background: "transparent", color: "#e8e8e8", border: "1px solid #2a2a2a" }}
          >
            DENY
          </button>
        </div>
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#0a0a0a",
  color: "#e8e8e8",
  fontFamily: "'Courier New', Courier, monospace",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "48px 16px",
};
const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 420,
  background: "#121212",
  border: "1px solid #2a2a2a",
  borderRadius: 10,
  padding: 24,
};
const btn: React.CSSProperties = {
  minHeight: 56,
  padding: "0 16px",
  border: "none",
  borderRadius: 6,
  fontFamily: "inherit",
  fontSize: 13,
  fontWeight: "bold",
  letterSpacing: 2,
  cursor: "pointer",
};
