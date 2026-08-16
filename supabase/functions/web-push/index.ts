/**
 * CC-75 Item 62 — WEB PUSH RELAY (Supabase Edge Function).
 *
 * WHY THIS EXISTS AT ALL, so nobody removes it later as unnecessary indirection:
 * Apps Script CANNOT send Web Push. VAPID requires a JWT signed with ES256 (ECDSA over
 * P-256) and the message payload requires ECDH P-256 key agreement plus AES128GCM.
 * Apps Script's Utilities class offers RSA and HMAC signing and has NO ECDSA primitive
 * whatsoever — this is a hard platform gap, not a difficulty (CC-74). So the signing and
 * encryption have to happen somewhere else, and this is that somewhere.
 *
 * Supabase was chosen over Firebase Cloud Messaging because this project ALREADY has a
 * provisioned Supabase project wired into the app (src/integrations/supabase/, and the
 * migrations beside this file). FCM would have worked — Apps Script can mint a
 * service-account token because those JWTs use RS256, which it does support — but it
 * would have meant adding the Firebase SDK to a Lovable-managed frontend for no gain.
 *
 * CONTRACT — POST JSON:
 *   { subscriptions: [{ endpoint, p256dh, auth }, ...],
 *     title: string, body: string, url: string }
 * Replies 200 with { sent, failed, gone: [endpoint, ...] }.
 *
 * `gone` matters: 404 and 410 are the push service saying a subscription is permanently
 * dead (uninstalled, permission revoked, endpoint rotated). Those are reported back so
 * the caller can prune its registry rather than pushing at a corpse forever. Any other
 * failure is counted but NOT reported as gone — a transient 500 must never cause a live
 * subscription to be deleted.
 *
 * DEPLOY:
 *   supabase functions deploy web-push --no-verify-jwt
 *   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... \
 *                        VAPID_SUBJECT=mailto:info@brambleandvinesf.com \
 *                        BV_SHARED_KEY=<same value as the WEB_PUSH_KEY Script Property>
 *
 * --no-verify-jwt is required because Apps Script calls this with no Supabase user
 * session. That is exactly why the shared-key check below is not optional: without JWT
 * verification this endpoint is otherwise open to anyone who learns the URL, and it can
 * send notifications to every registered crew phone.
 *
 * Generate the key pair once, locally:  npx web-push generate-vapid-keys
 * The PUBLIC key also goes into the frontend as the pushManager applicationServerKey;
 * the PRIVATE key never leaves this function's secrets.
 */
import webpush from "npm:web-push@3.6.7";

type Sub = { endpoint: string; p256dh: string; auth: string };

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:info@brambleandvinesf.com";
const SHARED_KEY = Deno.env.get("BV_SHARED_KEY") ?? "";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("POST only", { status: 405 });
  }
  /* Fail CLOSED on a missing shared key. An unauthenticated endpoint that can notify
     every crew phone is not something to leave open because a secret was forgotten. */
  if (!SHARED_KEY || req.headers.get("X-BV-Key") !== SHARED_KEY) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return new Response(
      JSON.stringify({ error: "VAPID keys not configured on this function" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  let payload: {
    subscriptions?: Sub[];
    title?: string;
    body?: string;
    url?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const subs = Array.isArray(payload.subscriptions) ? payload.subscriptions : [];
  if (!subs.length) {
    return new Response(JSON.stringify({ sent: 0, failed: 0, gone: [] }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  /* The body the service worker receives. Kept small deliberately: push payloads have a
     ~4KB ceiling across services, and everything the notification needs to be useful is
     a title, a line of text and where to go. */
  const message = JSON.stringify({
    title: String(payload.title ?? "Bramble & Vine"),
    body: String(payload.body ?? ""),
    url: String(payload.url ?? "https://brambleandvinesf.lovable.app/messages"),
  });

  let sent = 0;
  let failed = 0;
  const gone: string[] = [];

  /* Sent in parallel: one slow push service must not hold up the others, and Apps
     Script is waiting on this response inside a user-facing request. */
  await Promise.all(
    subs.map(async (s) => {
      if (!s?.endpoint || !s?.p256dh || !s?.auth) {
        failed++;
        return;
      }
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          message,
          { TTL: 600 },
        );
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number })?.statusCode;
        /* ONLY 404/410 mean permanently dead. Everything else is transient and must not
           cause the caller to delete a working subscription. */
        if (code === 404 || code === 410) gone.push(s.endpoint);
        failed++;
      }
    }),
  );

  return new Response(JSON.stringify({ sent, failed, gone }), {
    headers: { "Content-Type": "application/json" },
  });
});
