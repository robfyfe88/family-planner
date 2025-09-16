import * as React from "react";

const BRAND = "#7C3AED";   
const BRAND_ACCENT = "#F59E0B"; 

export default function HearthPlanLogo({
  size = 28,
  withWordmark = true,
  variant = "grid",
}: {
  size?: number;
  withWordmark?: boolean;
  variant?: "grid" | "app";
}) {
  const fontSize = Math.round(size * 0.62);

  return (
    <span className="inline-flex items-center gap-2" aria-label="HearthPlan">
      {variant === "grid" ? <GridMark size={size} /> : <AppMark size={size} />}
      {withWordmark && (
        <span
          className="font-semibold tracking-tight"
          style={{ fontSize, lineHeight: 1, color: BRAND }}
        >
          HearthPlan
        </span>
      )}
    </span>
  );
}

function GridMark({ size }: { size: number }) {
  const stroke = 3;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="6"
        width="58"
        height="55"
        rx="12"
        fill="white"
        stroke={BRAND}
        strokeWidth={stroke}
      />
      <g stroke={BRAND} strokeWidth={stroke} opacity="0.35">
        <line x1="22" y1="18" x2="22" y2="58" strokeLinecap="round" />
        <line x1="42" y1="18" x2="42" y2="58" strokeLinecap="round" />
        <line x1="6"  y1="36" x2="58" y2="36" strokeLinecap="round" />
      </g>
      <g stroke={BRAND} strokeWidth={stroke + 1} strokeLinecap="round">
        <line x1="16.5" y1="22" x2="16.5" y2="52" />
        <line x1="31.5" y1="22" x2="31.5" y2="52" />
        <line x1="16.5" y1="37" x2="31.5" y2="37" />
      </g>
      <rect x="45" y="41" width="12" height="12" rx="3" fill={BRAND_ACCENT} />
      <rect x="6" y="10" width="52" height="6" rx="3" fill={BRAND} opacity=".25" />
    </svg>
  );
}

function AppMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-hidden="true">
      <rect x="2" y="2" width="60" height="60" rx="14" fill={BRAND} />
      <g stroke="white" strokeWidth="7" strokeLinecap="round">
        <line x1="22" y1="18" x2="22" y2="46" />
        <line x1="42" y1="18" x2="42" y2="46" />
        <line x1="22" y1="32" x2="42" y2="32" />
      </g>
      <rect x="44" y="44" width="12" height="12" rx="3" fill={BRAND_ACCENT} />
    </svg>
  );
}
