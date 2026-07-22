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
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
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
          style={INPUT}
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
      style={SELECT}
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
