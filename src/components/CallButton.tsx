import { useAuth } from "../lib/auth";
import { callAction, prettyNumber } from "../lib/quo-call";

/**
 * CALL BUTTON — CC-10 Item 9, the UI half of src/lib/quo-call.ts.
 *
 * ONE component for both call sites (the client-name tap panel and the Visit In
 * Progress screen) so a crew member sees the same affordance, the same wording
 * and the same caller-ID promise in both. quo-call.ts already insists that
 * scheme and label be decided together; this is where that decision is drawn.
 *
 * DESIGN — Quo's conventions, B&V's skin (Brandon's direction, CC-10).
 * What is borrowed from Quo is the BEHAVIOUR, not the brand: a handset glyph,
 * the number stated before the tap, the outbound line named underneath, and one
 * press that dials rather than pre-filling. What is not borrowed is any of Quo's
 * colour, typography or logo — this renders in the app's own Courier/lime idiom
 * like every other button here, because a crew phone should never look like it
 * has handed the user off to a second app before it actually has.
 *
 * NO NUMBER, NO BUTTON. It returns null rather than rendering a disabled or
 * dead control: `openphone://dial?number=` with nothing after it opens Quo on a
 * blank dialler, which reads as a bug. Nothing on this screen should imply a
 * call is possible when Client Info has no number on file.
 *
 * The fine print is not decoration. On a phone the call goes out on the B&V
 * line the signed-in role reads messages on, so a call-back lands in the thread
 * it came from; on desktop the deep link silently does nothing, so it degrades
 * to `tel:` with the personal caller ID — and says so. A crew member is
 * entitled to know which of their two numbers a client is about to see.
 */

const LIME = "#7cff00";
const LIME_DIM = "rgba(124,255,0,.35)";
const MUTED = "#b8b8b8";

export function CallButton({
  to,
  label,
  disabled = false,
  style,
}: {
  /** Raw Client Info number. Hand-entered formats are normalised downstream. */
  to: string | null | undefined;
  /** Who is being called, for the button text — usually the client name. */
  label: string;
  /** Management preview and other read-only contexts must not dial out. */
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  /* Real signed-in role, not the management view-as role: this picks the
     physical line that will place the call, so it has to follow the device, not
     the screen someone is previewing. */
  const { role } = useAuth();
  const action = callAction(to, role);
  if (!action) return null;

  const number = prettyNumber(to);
  const via = action.viaQuo
    ? `on the B&V line · ${prettyNumber(action.line)}`
    : "your own caller ID — Quo dialling is mobile only";

  return (
    <a
      href={disabled ? undefined : action.href}
      aria-disabled={disabled || undefined}
      style={{
        display: "block",
        textAlign: "center",
        textDecoration: "none",
        background: "transparent",
        color: LIME,
        border: `1px solid ${action.viaQuo ? LIME : LIME_DIM}`,
        borderRadius: 999,
        padding: "10px 14px",
        fontFamily: "'Courier New', Courier, monospace",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        boxSizing: "border-box",
        ...style,
      }}
    >
      <span
        style={{
          display: "block",
          fontSize: 13,
          fontWeight: "bold",
          letterSpacing: 2,
          textTransform: "uppercase",
          wordBreak: "break-word",
        }}
      >
        ☎ CALL {label}
      </span>
      <span style={{ display: "block", color: MUTED, fontSize: 11, marginTop: 3 }}>
        {number}
      </span>
      <span style={{ display: "block", color: MUTED, fontSize: 10, marginTop: 1 }}>
        {via}
      </span>
    </a>
  );
}
