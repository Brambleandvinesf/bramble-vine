import type { CSSProperties } from "react";

/**
 * Subtle inline "refreshing" indicator. Dim green pulse dot rendered
 * next to a screen title while a background fetch is in flight.
 */
export function RefreshDot({
  refreshing,
  offline,
  style,
}: {
  refreshing?: boolean;
  offline?: boolean;
  style?: CSSProperties;
}) {
  if (!refreshing && !offline) return null;
  const color = offline ? "#ffb03f" : "#4a7a1e";
  return (
    <>
      <style>{`
        @keyframes bvRefreshPulse {
          0%, 100% { opacity: .35; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.25); }
        }
      `}</style>
      <span
        aria-label={offline ? "offline — showing last data" : "refreshing"}
        title={offline ? "offline — showing last data" : "refreshing"}
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 6px ${color}`,
          animation: offline ? undefined : "bvRefreshPulse 1.1s ease-in-out infinite",
          verticalAlign: "middle",
          ...style,
        }}
      />
    </>
  );
}

/** Small "offline — showing last data" hint used alongside cached renders. */
export function OfflineNote({ style }: { style?: CSSProperties }) {
  return (
    <span
      style={{
        color: "#8f8f8f",
        fontSize: 11,
        letterSpacing: 1,
        textTransform: "uppercase",
        ...style,
      }}
    >
      offline — showing last data
    </span>
  );
}
