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
  schedule:        { lead: 1, assistant: 1, office: 0, management: 1 },
  admin:           { lead: 0, assistant: 0, office: 0, management: 1 },
} as const;

export type ScreenId = keyof typeof PERMISSIONS;

export function canSee(role: Role | null, screenId: ScreenId): boolean {
  if (!role) return false;
  return PERMISSIONS[screenId][role] === 1;
}
