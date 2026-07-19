export function ComingSoon({ label }: { label: string }) {
  return (
    <div
      style={{
        minHeight: "calc(100vh - 44px - 64px)",
        background: "#0a0a0a",
        color: "#8f8f8f",
        fontFamily: "'Courier New', Courier, monospace",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 10,
        padding: 24,
      }}
    >
      <div style={{ color: "#7cff00", fontSize: 14, letterSpacing: 3, fontWeight: "bold" }}>{label}</div>
      <div style={{ fontSize: 13, letterSpacing: 2 }}>COMING SOON</div>
    </div>
  );
}
