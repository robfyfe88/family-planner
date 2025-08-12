import * as React from "react";
export function useSelectAllInputProps() {
  const onFocus = React.useCallback((e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.select(), []);
  const onMouseUp = React.useCallback((e: React.MouseEvent<HTMLInputElement>) => e.preventDefault(), []);
  const onTouchEnd = React.useCallback((e: React.TouchEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    if (el.selectionStart === el.selectionEnd) setTimeout(() => { try { el.select(); } catch {} }, 0);
  }, []);
  return { onFocus, onMouseUp, onTouchEnd };
}
