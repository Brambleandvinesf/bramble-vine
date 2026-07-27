import { useMemo, useState, type CSSProperties } from "react";

/**
 * Dropdown of existing distinct values (case-normalized to Title Case,
 * alphabetized) plus a trailing "+ New…" option that reveals a text
 * input for a custom value. Palette: black panel, lime text/border.
 */
export function ComboSelect({
  value,
  options,
  onChange,
  placeholder = "Select…",
  disabled = false,
  compact = false,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Match the inline pill styling of the Type selector, for a shared row. */
  compact?: boolean;
}) {
  const normalized = useMemo(() => {
    const map = new Map<string, string>();
    for (const raw of options) {
      const trimmed = String(raw ?? "").trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (!map.has(key)) map.set(key, titleCase(trimmed));
    }
    return [...map.values()].sort((a, b) => a.localeCompare(b));
  }, [options]);

  const trimmedValue = value.trim();
  const matchKey = trimmedValue.toLowerCase();
  const matchIdx = normalized.findIndex((o) => o.toLowerCase() === matchKey);
  const matchesOption = matchIdx >= 0;

  const [custom, setCustom] = useState<boolean>(
    () => !!trimmedValue && !normalized.some((o) => o.toLowerCase() === matchKey),
  );

  if (custom) {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          autoFocus
          placeholder="New value"
          style={compact ? { ...INPUT, minHeight: 36, padding: "0 8px", fontSize: 11, letterSpacing: 1, color: LIME } : INPUT}
        />
        <button
          type="button"
          onClick={() => {
            setCustom(false);
            onChange("");
          }}
          disabled={disabled}
          aria-label="Cancel new"
          style={CANCEL_BTN}
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <select
      value={matchesOption ? normalized[matchIdx] : ""}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "__NEW__") {
          setCustom(true);
          onChange("");
          return;
        }
        onChange(v);
      }}
      style={compact ? COMPACT_SELECT : SELECT}
    >
      <option value="" style={OPTION}>
        {placeholder}
      </option>
      {normalized.map((o) => (
        <option key={o} value={o} style={OPTION}>
          {o}
        </option>
      ))}
      <option value="__NEW__" style={OPTION_NEW}>
        + New…
      </option>
    </select>
  );
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase());
}

const LIME = "#7cff00";
const LINE = "#2a2a2a";
const TEXT = "#e8e8e8";
const PANEL = "#121212";

const SELECT: CSSProperties = {
  width: "100%",
  background: "#0a0a0a",
  color: TEXT,
  border: `1px solid ${LINE}`,
  borderRadius: 6,
  padding: "10px 10px",
  fontFamily: "inherit",
  fontSize: 13,
  boxSizing: "border-box",
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  backgroundImage:
    "linear-gradient(45deg, transparent 50%, #7cff00 50%), linear-gradient(135deg, #7cff00 50%, transparent 50%)",
  backgroundPosition: "calc(100% - 14px) 50%, calc(100% - 9px) 50%",
  backgroundSize: "5px 5px, 5px 5px",
  backgroundRepeat: "no-repeat",
  paddingRight: 28,
};

/**
 * Same visual weight as the Type selector in Confirm Day, so Type, Garden and
 * Category can share one row instead of stacking into a tall card.
 */
const COMPACT_SELECT: CSSProperties = {
  ...SELECT,
  // Sized to match the Type selector rather than stretching: flex:1 made these
  // two eat the whole row while Type stayed small, so the three read as one
  // big control and two little ones.
  width: 128,
  flex: "0 0 auto",
  minWidth: 0,
  textOverflow: "ellipsis",
  background: "transparent",
  color: LIME,
  border: `1px solid ${LIME}`,
  padding: "0 24px 0 8px",
  minHeight: 36,
  fontSize: 11,
  letterSpacing: 2,
  fontWeight: "bold",
  cursor: "pointer",
  textTransform: "uppercase",
};

const OPTION: CSSProperties = {
  background: PANEL,
  color: TEXT,
};

const OPTION_NEW: CSSProperties = {
  background: PANEL,
  color: LIME,
};

const INPUT: CSSProperties = {
  flex: 1,
  background: "#0a0a0a",
  color: TEXT,
  border: `1px solid ${LINE}`,
  borderRadius: 6,
  padding: "10px 10px",
  fontFamily: "inherit",
  fontSize: 13,
  boxSizing: "border-box",
};

const CANCEL_BTN: CSSProperties = {
  background: "transparent",
  color: LIME,
  border: `1px solid ${LIME}`,
  borderRadius: 6,
  width: 36,
  minHeight: 36,
  fontFamily: "inherit",
  fontSize: 16,
  cursor: "pointer",
};
