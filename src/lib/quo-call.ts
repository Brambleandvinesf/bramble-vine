/**
 * QUO DIAL INTENT — the ONE place that builds a call link. (CC-04 Item 9)
 *
 * WHY THIS EXISTS AT ALL, and why it is not Twilio.
 * Quo's REST API cannot place calls. Verified against the public OpenAPI spec:
 * every call endpoint is a GET (`/v1/calls`, call-recordings, call-summaries,
 * call-transcripts, call-voicemails) plus webhooks. There is no POST to
 * originate. The only way to dial on a B&V line without adding a second
 * telephony vendor is Quo's own mobile deep link — which is the standing
 * anti-sprawl principle in CLAUDE.md applied literally: extend what is already
 * installed rather than take on a new number estate and a new bill.
 *
 * THE CONTRACT (Quo deep-linking docs):
 *   openphone://dial?number=<n>&from=<line>&action=call
 *     number  REQUIRED, URL-encoded.
 *     from    OPTIONAL but we ALWAYS send it — it selects which Quo line places
 *             the call, i.e. the caller ID the client sees. Omit it and the app
 *             prompts the user to pick a line on every single call, which on a
 *             field phone mid-visit is exactly the friction this is meant to remove.
 *     action  'call' dials immediately. Without it the app only pre-fills.
 *
 * KNOWN LIMITS — all three are real, none are worked around here:
 *   1. MOBILE ONLY. Web and desktop are explicitly unsupported by Quo. Callers
 *      must gate on `canDeepLinkCall()` and fall back to `telHref()`.
 *   2. Quo must be installed, or the link redirects to the App/Play Store.
 *   3. Whether the call lands in Quo's own call log is NOT stated in Quo's docs.
 *      Unverified until the first real call — do not claim it does.
 */

/** The four Quo lines, per CLAUDE.md STACK MAP. E.164, matching quoFeedTokens_. */
export const QUO_LINES = {
  management: "+14152343695",
  office: "+14152343083",
  lead: "+16507105061",
  assistant: "+14152343696",
} as const;

export type CallRole = keyof typeof QUO_LINES;

/**
 * Which line places the call, for the SIGNED-IN role.
 *
 * Deliberately mirrors the backend's `quoFeedTokens_` defaults so a role calls
 * out on the same line it reads messages on — a client who calls the number back
 * reaches the thread it came from. If those two ever disagree, a returned call
 * lands on a line whose holder never saw the conversation.
 *
 * Unknown/absent role falls back to the office line, which is `QUO_NUMBER`
 * server-side and the safest default: it is the number already on the website.
 */
export function lineForRole(role: string | null | undefined): string {
  const key = String(role ?? "").trim().toLowerCase();
  return (QUO_LINES as Record<string, string>)[key] ?? QUO_LINES.office;
}

/**
 * Digits (plus a leading +) only. Quo wants a URL-encoded phone string, and the
 * numbers in Client Info are hand-entered — "(415) 234-3083", "415.234.3083",
 * and "+1 415 234 3083" all occur. Returns '' when nothing dialable is left, so
 * callers can hide the button rather than render one that dials nowhere.
 */
export function normalizeNumber(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const plus = s.startsWith("+");
  const digits = s.replace(/\D/g, "");
  if (!digits) return "";
  return plus ? `+${digits}` : digits;
}

/**
 * Build the dial link. Returns '' if there is no dialable number — never a
 * half-formed URL, because `openphone://dial?number=` with an empty number opens
 * the app to a blank dialer and looks like a bug to the crew.
 */
export function quoCallHref(to: string | null | undefined, role: string | null | undefined): string {
  const number = normalizeNumber(to);
  if (!number) return "";
  const from = normalizeNumber(lineForRole(role));
  return (
    "openphone://dial" +
    `?number=${encodeURIComponent(number)}` +
    `&from=${encodeURIComponent(from)}` +
    "&action=call"
  );
}

/** Plain-dialer fallback: personal caller ID, but it always works. */
export function telHref(to: string | null | undefined): string {
  const number = normalizeNumber(to);
  return number ? `tel:${number}` : "";
}

/**
 * Display form. Lives here rather than in a screen because the ONE place that
 * decides what will be dialled should also be the one place that says so out
 * loud — a button reading "(415) 234-3083" while the href carries a different
 * number is the exact failure this module is shaped to prevent.
 *
 * Mirrors the backend's fmtPhone_. Anything that is not a +1 ten-digit number
 * is returned as it came in: an unexpected shape is better shown raw than
 * reformatted into something that looks authoritative and is wrong.
 */
export function prettyNumber(to: string | null | undefined): string {
  const n = normalizeNumber(to);
  const m = n.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : n;
}

/**
 * Deep links are mobile-only. On desktop the scheme silently does nothing, which
 * reads as a dead button — so callers show the `tel:` fallback there instead.
 * Coarse on purpose: a false negative costs the business caller ID, a false
 * positive costs a button that does nothing at all.
 */
export function canDeepLinkCall(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * What a call button should actually do. One call site decides scheme AND label,
 * so a screen cannot show "CALL ON B&V LINE" while handing back a `tel:` link.
 */
export function callAction(
  to: string | null | undefined,
  role: string | null | undefined,
): { href: string; viaQuo: boolean; line: string } | null {
  const deep = canDeepLinkCall() ? quoCallHref(to, role) : "";
  if (deep) return { href: deep, viaQuo: true, line: lineForRole(role) };
  const tel = telHref(to);
  return tel ? { href: tel, viaQuo: false, line: "" } : null;
}
