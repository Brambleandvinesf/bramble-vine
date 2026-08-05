import type { Role } from "./auth";

export const PERMISSIONS = {
  dashboard:       { lead: 1, assistant: 1, office: 1, management: 1 },
  special_confirm: { lead: 1, assistant: 0, office: 0, management: 1 },
  loading:         { lead: 1, assistant: 1, office: 0, management: 1 },
  route_enroute:   { lead: 1, assistant: 1, office: 0, management: 1 },
  route_arrived:   { lead: 1, assistant: 1, office: 0, management: 1 },
  route_visit:     { lead: 1, assistant: 1, office: 0, management: 1 },
  route_debrief:   { lead: 1, assistant: 0, office: 0, management: 1 },
  route_next:      { lead: 1, assistant: 1, office: 0, management: 1 },
  visits:          { lead: 0, assistant: 0, office: 1, management: 1 },
  messages:        { lead: 1, assistant: 1, office: 1, management: 1 },
  rcpt_designate:  { lead: 1, assistant: 1, office: 1, management: 1 },
  rcpt_invoice:    { lead: 0, assistant: 0, office: 1, management: 1 },
  projects:        { lead: 1, assistant: 0, office: 1, management: 1 },
  schedule:        { lead: 1, assistant: 1, office: 1, management: 1 },
  /* XX-05: the back-office queues — Payroll Approval and Debrief Queue.
   *
   * ONE capability for both, because they gate identically. The rule used to be
   * an inline `role === "lead" || role === "management"` repeated in FOUR
   * places: the nav LAYOUTS, the badge poller, and each screen's own route
   * guard. Missing any one produced a broken half-state — a menu item with no
   * badge, or one that refuses to open. The rule lives here now.
   *
   * NOT to be confused with route_debrief, which governs the field DEBRIEF STEP
   * (field.tsx reads it as isLead) and deliberately excludes office. */
  route_queues:    { lead: 1, assistant: 0, office: 1, management: 1 },
  admin:           { lead: 0, assistant: 0, office: 0, management: 1 },
} as const;

export type ScreenId = keyof typeof PERMISSIONS;

export function canSee(role: Role | null, screenId: ScreenId): boolean {
  if (!role) return false;
  return PERMISSIONS[screenId][role] === 1;
}
