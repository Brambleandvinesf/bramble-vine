/* CC-45 Item 47 — the Invoice Queue.
 *
 * A genuinely separate screen with its own nav entry and its own badge, rather than
 * invoice drafts hiding behind an INVOICE chip on a screen called VISIT
 * CONFIRMATIONS. The name was describing half of what that screen showed.
 *
 * DELIBERATELY THIN. It renders the same VisitsPage component with only="invoice",
 * so the card, the edit box, SEND/SAVE/SKIP, the office-notes display (Item 46) and
 * the send path are literally the same code — there is nothing here to drift out of
 * step with /visits. What differs is the heading, the badge, and that the weekly
 * drafting gate and "+ NEW MESSAGE" are suppressed, all handled inside that
 * component.
 *
 * PERMISSION: the shared `visits` capability, so this inherits office + management
 * only. That keeps Item 41's hold intact — leads must not see invoice financials —
 * without adding a second rule someone has to remember to keep in sync.
 */
import { createFileRoute } from "@tanstack/react-router";
import { VisitsPage } from "./visits";

export const Route = createFileRoute("/invoices")({
  head: () => ({
    meta: [
      { title: "Bramble & Vine — Invoice Queue" },
      {
        name: "description",
        content: "Review and send client invoice messages drafted from debriefs.",
      },
    ],
  }),
  component: InvoiceQueuePage,
});

function InvoiceQueuePage() {
  return <VisitsPage only="invoice" />;
}
