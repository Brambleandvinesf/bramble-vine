/**
 * One place that knows how a receipt line is shaped, and one place that decides
 * whether it still needs designating.
 *
 * WHY THIS FILE EXISTS (CC-11, 8/4). receipts.tsx read the sheet's
 * "Final Designation" (capital D); the badge poller kept its OWN copy of that
 * logic and read "Final designation" (lowercase d), a key that does not exist.
 * So the designation half of the badge's filter never matched anything and the
 * badge counted every un-invoiced line: it read 30 while the Designate tab
 * showed the 1 line genuinely waiting. Two implementations of the same rule,
 * disagreeing silently, over one character.
 *
 * Both callers now import from here. The header names live in exactly one place
 * — which matters more than usual in this codebase, where sheet headers are
 * already known to carry trailing spaces and inconsistent casing.
 */

export type Line = {
  row: number;
  receiptId: string;
  date: string;
  vendor: string;
  description: string;
  quantity: string;
  unitPrice: string;
  total: string;
  notes: string;
  sentToOffice: string;
  invoiced: string;
  specificDesignation: string;
  finalDesignation: string;
  plantSize: string;
  plantFloor: number | null;
  plantAskBG: boolean;
  costFlag: string;
  multiplier: number;
  productMatched: boolean;
  masterPrice: number | null;
};

function s(v: unknown): string {
  return String(v ?? "").trim();
}

/** Raw getReceipts row -> Line. Sheet header names appear ONLY here. */
export function normLine(l: Record<string, unknown>): Line {
  return {
    row: Number(l.row ?? 0),
    receiptId: s(l["Receipt_ID"]),
    date: s(l["Date"]),
    vendor: s(l["Vendor"]),
    description: s(l["Item_Description"]),
    quantity: s(l["Quantity"]),
    unitPrice: s(l["Unit_Price"]),
    total: s(l["Total_Amount"]),
    notes: s(l["Notes"]),
    sentToOffice: s(l["Sent to office"]),
    invoiced: s(l["Invoiced"]),
    specificDesignation: s(l["Specific_Designation"]),
    finalDesignation: s(l["Final Designation"]),
    plantSize: s(l["plantSize"]),
    plantFloor: l["plantFloor"] == null ? null : Number(l["plantFloor"]),
    plantAskBG: Boolean(l["plantAskBG"]),
    costFlag: s(l["costFlag"]),
    multiplier: Number(l["multiplier"] ?? 1.15) || 1.15,
    productMatched: Boolean(l["productMatched"]),
    masterPrice: l["masterPrice"] == null ? null : Number(l["masterPrice"]),
  };
}

/**
 * Is this line still waiting to be designated?
 *
 * BACKEND TWIN: receiptsPendingCount_ in Code.js applies the identical rule so
 * the nav badge can be a cheap count-only call instead of a 167KB download
 * (item 11). A rule cannot literally be shared across the Apps Script/browser
 * boundary, so these two must be changed together — CC-11 was this exact rule
 * implemented twice and disagreeing, and the badge read 30 against a real 1.
 */
export function isPendingDesignation(l: Line): boolean {
  return !l.finalDesignation && !l.invoiced;
}
