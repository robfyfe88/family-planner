// src/components/HearthPlanLogo.tsx
import * as React from "react";

/**
 * HearthPlan logo
 * - variant="grid"  : calendar-grid with H + accent tile (default)
 * - variant="app"   : solid rounded square with H monogram (for favicon/PWA)
 * - size            : overall icon size in px
 * - withWordmark    : show "HearthPlan" next to the mark; auto-scales with size
 *
 * Colors use your design tokens. Tune in CSS:
 *  --brand:       var(--accent-2)
 *  --brand-2:     var(--accent)
 *  --brand-3:     var(--accent-3)
 */
export default function HearthPlanLogo({
  size = 28,
  withWordmark = true,
  variant = "grid",
}: {
  size?: number;
  withWordmark?: boolean;
  variant?: "grid" | "app";
}) {
  const fontSize = Math.round(size * 0.62); // scales wordmark with icon size

  return (
    <span className="inline-flex items-center gap-2" aria-label="HearthPlan">
      {variant === "grid" ? <GridMark size={size} /> : <AppMark size={size} />}
      {withWordmark && (
        <span
          className="font-semibold tracking-tight"
          style={{ fontSize, lineHeight: 1 }}
        >
          HearthPlan
        </span>
      )}
    </span>
  );
}

/** Calendar-grid mark with an H carved in and an accent tile */
function GridMark({ size }: { size: number }) {
  const stroke = 3; // looks crisp from 24–64px
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-hidden="true"
    >
      {/* outer rounded calendar frame */}
      <rect
        x="3"
        y="6"
        width="58"
        height="55"
        rx="12"
        fill="white"
        stroke="var(--brand, var(--accent-2))"
        strokeWidth={stroke}
      />

      {/* grid lines */}
      <g stroke="var(--brand, var(--accent-2))" strokeWidth={stroke} opacity="0.35">
        <line x1="22" y1="18" x2="22" y2="58" strokeLinecap="round" />
        <line x1="42" y1="18" x2="42" y2="58" strokeLinecap="round" />
        <line x1="6"  y1="36" x2="58" y2="36" strokeLinecap="round" />
      </g>

      {/* the H (two uprights + crossbar) */}
      <g stroke="var(--brand, var(--accent-2))" strokeWidth={stroke + 1} strokeLinecap="round">
        <line x1="16.5" y1="22" x2="16.5" y2="52" />
        <line x1="31.5" y1="22" x2="31.5" y2="52" />
        <line x1="16.5" y1="37" x2="31.5" y2="37" />
      </g>

      {/* accent “planned” tile in bottom-right */}
      <rect
        x="45"
        y="41"
        width="12"
        height="12"
        rx="3"
        fill="var(--brand-2, var(--accent))"
      />

      {/* subtle header bar */}
      <rect
        x="6"
        y="10"
        width="52"
        height="6"
        rx="3"
        fill="var(--brand-3, var(--accent-3))"
        opacity=".25"
      />
    </svg>
  );
}

/** Solid app icon (rounded square) with white H and a tiny check tile */
function AppMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-hidden="true">
      <rect x="2" y="2" width="60" height="60" rx="14" fill="var(--brand, var(--accent-2))" />
      {/* H */}
      <g stroke="white" strokeWidth="7" strokeLinecap="round">
        <line x1="22" y1="18" x2="22" y2="46" />
        <line x1="42" y1="18" x2="42" y2="46" />
        <line x1="22" y1="32" x2="42" y2="32" />
      </g>
      {/* corner accent tile */}
      <rect x="44" y="44" width="12" height="12" rx="3" fill="var(--brand-2, var(--accent))" />
    </svg>
  );
}
