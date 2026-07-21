/**
 * Session-scoped team resolution. After joinRoster we call resolveTeam(id) once,
 * which fetches getTeams, finds the employee's assigned team, and caches it in
 * sessionStorage under TEAM_KEY. All subsequent getField / getSchedule reads
 * append &team=<value> via appendTeamParam(url).
 */

const TEAM_KEY = "field.team";
const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwZlJn9jKzzYfcFglDmVGV3l-FTYib0D3mNdILivsB1477aMym68NViDCwia26_JH4siQ/exec";

export type TeamName = string; // typically "Alpha" | "Bravo"

export type TeamsEmployee = { id: string; name?: string; team?: TeamName };
export type TeamAssignment = { match: string; team: TeamName };
export type GetTeamsResponse = {
  employees?: TeamsEmployee[];
  assignments?: TeamAssignment[];
};

export function getTeam(): TeamName | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(TEAM_KEY) || null;
  } catch {
    return null;
  }
}

export function setTeam(t: TeamName | null) {
  if (typeof window === "undefined") return;
  try {
    if (t) window.sessionStorage.setItem(TEAM_KEY, t);
    else window.sessionStorage.removeItem(TEAM_KEY);
  } catch {
    /* ignore */
  }
}

export function appendTeamParam(url: string): string {
  const t = getTeam();
  if (!t) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}team=${encodeURIComponent(t)}`;
}

export async function fetchTeams(): Promise<GetTeamsResponse | null> {
  try {
    const res = await fetch(`${SCRIPT_URL}?action=getTeams`);
    if (!res.ok) return null;
    return (await res.json()) as GetTeamsResponse;
  } catch {
    return null;
  }
}

export async function resolveTeam(userId: string): Promise<TeamName | null> {
  const j = await fetchTeams();
  const emp = j?.employees?.find((e) => e.id === userId);
  const t = emp?.team || null;
  setTeam(t);
  return t;
}
