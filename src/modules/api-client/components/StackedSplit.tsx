import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

const MIN_RATIO = 0.25;
const MAX_RATIO = 0.75;
const STEP = 0.02;

export function clampSplitRatio(r: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, r));
}

interface Props {
  ratio: number;
  onChange: (ratio: number) => void;
  top: ReactNode;
  bottom: ReactNode;
}

/** The Postman-style stacked layout: request editor above, response below,
 * a draggable (and keyboard-resizable — focus + arrow keys, per skill)
 * horizontal divider between them. Drag updates live; keyboard steps by 2%
 * per press, Home/End jump to the min/max bound. */
export function StackedSplit({ ratio, onChange, top, bottom }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startY: number; startRatio: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const container = containerRef.current;
      const drag = dragState.current;
      if (!container || !drag) return;
      const height = container.getBoundingClientRect().height;
      if (height <= 0) return;
      const deltaRatio = (e.clientY - drag.startY) / height;
      onChange(clampSplitRatio(drag.startRatio + deltaRatio));
    },
    [onChange],
  );

  const stopDrag = useCallback(() => {
    dragState.current = null;
    setDragging(false);
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", stopDrag);
  }, [handleMouseMove]);

  useEffect(() => stopDrag, [stopDrag]);

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    dragState.current = { startY: e.clientY, startRatio: ratio };
    setDragging(true);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopDrag);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      onChange(clampSplitRatio(ratio - STEP));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      onChange(clampSplitRatio(ratio + STEP));
    } else if (e.key === "Home") {
      e.preventDefault();
      onChange(MIN_RATIO);
    } else if (e.key === "End") {
      e.preventDefault();
      onChange(MAX_RATIO);
    }
  };

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className="flex min-h-0 flex-none flex-col overflow-hidden"
        style={{ flexBasis: `${ratio * 100}%` }}
      >
        {top}
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={Math.round(MIN_RATIO * 100)}
        aria-valuemax={Math.round(MAX_RATIO * 100)}
        aria-label="Resize request and response panes"
        tabIndex={0}
        onMouseDown={startDrag}
        onKeyDown={onKeyDown}
        className={`group relative h-1.5 shrink-0 cursor-row-resize outline-none ${
          dragging ? "bg-adaka-gold/40" : "bg-adaka-border hover:bg-adaka-gold/30"
        } focus-visible:bg-adaka-gold/50`}
      >
        <div className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto h-0.5 w-8 -translate-y-1/2 rounded-full bg-adaka-border-strong group-hover:bg-adaka-gold/70 group-focus-visible:bg-adaka-gold" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{bottom}</div>
    </div>
  );
}
