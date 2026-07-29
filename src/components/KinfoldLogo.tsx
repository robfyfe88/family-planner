import * as React from "react";

export default function KinfoldLogo({
  size = 44,
  withWordmark = true,
  compact = false,
}: {
  size?: number;
  withWordmark?: boolean;
  compact?: boolean;
}) {
  return (
    <span className={`kinfold-logo ${compact ? "compact" : ""}`} aria-label="Kinfold">
      <span className="kinfold-mark" style={{ width: size, height: size }} aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      {withWordmark && (
        <span className="kinfold-wordmark">
          <strong>Kinfold</strong>
          {!compact && <small>family life, planned together</small>}
        </span>
      )}
    </span>
  );
}
