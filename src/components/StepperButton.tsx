/**
 * StepperButton — the −/+ control, lifted out of PayrollConfirm.tsx (CC-23 26.3).
 *
 * It was `QuarterButton`, local to that file and hardcoded to the Hours screen's
 * quarter-hour increment right down to its aria-label ("add 15 minutes to
 * billing"). Items Used needs the same control at a step of 1, and copying it
 * would have produced two controls that drift apart — the twin-rule pattern this
 * codebase keeps paying for. So the increment and the thing being counted are
 * props now, and the visual treatment lives in exactly one place.
 *
 * `unitLabel` exists only for the accessible name: a screen reader should hear
 * what the button changes, not just "plus". Hours passes "15 minutes to billing",
 * Items Used passes "1 to the quantity".
 */
const LIME = "#7cff00";

export function StepperButton({
  dir,
  onClick,
  disabled,
  unitLabel,
}: {
  /** Which way this button steps. Drives both the glyph and the label. */
  dir: "up" | "down";
  onClick: () => void;
  disabled?: boolean;
  /** What one press changes, for the accessible name. */
  unitLabel: string;
}) {
  /* − is U+2212 MINUS SIGN, not a hyphen: it matches + optically at this size,
     which a hyphen does not. Carried over from QuarterButton deliberately. */
  const glyph = dir === "up" ? "+" : "−";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${dir === "up" ? "add" : "remove"} ${unitLabel}`}
      style={{
        width: 44,
        height: 44,
        background: "transparent",
        color: LIME,
        border: `1px dashed ${LIME}`,
        borderRadius: 8,
        fontFamily: "inherit",
        fontSize: 20,
        lineHeight: 1,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {glyph}
    </button>
  );
}
