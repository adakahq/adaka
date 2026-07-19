import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

const MIN_RATIO = 0.25;
const MAX_RATIO = 0.75;
const STEP = 0.02;

export function clampSplitRatio(r: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, r));
}

export type SplitOrientation = "horizontal" | "vertical";

interface Props {
  ratio: number;
  onChange: (ratio: number) => void;
  top: ReactNode;
  bottom: ReactNode;
  orientation?: SplitOrientation;
}

export function StackedSplit({ ratio, onChange, top, bottom, orientation = "horizontal" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startPos: number; startRatio: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const isHorizontal = orientation === "horizontal";

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const container = containerRef.current;
      const drag = dragState.current;
      if (!container || !drag) return;
      const rect = container.getBoundingClientRect();
      const size = isHorizontal ? rect.height : rect.width;
      if (size <= 0) return;
      const clientPos = isHorizontal ? e.clientY : e.clientX;
      const deltaRatio = (clientPos - drag.startPos) / size;
      onChange(clampSplitRatio(drag.startRatio + deltaRatio));
    },
    [onChange, isHorizontal],
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
    const startPos = isHorizontal ? e.clientY : e.clientX;
    dragState.current = { startPos, startRatio: ratio };
    setDragging(true);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopDrag);
  };

  const shrinkKey = isHorizontal ? "ArrowUp" : "ArrowLeft";
  const growKey = isHorizontal ? "ArrowDown" : "ArrowRight";

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === shrinkKey) {
      e.preventDefault();
      onChange(clampSplitRatio(ratio - STEP));
    } else if (e.key === growKey) {
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

  if (isHorizontal) {
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

  // Vertical orientation = side by side
  return (
    <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
      <div
        className="flex min-w-0 flex-none flex-col overflow-hidden"
        style={{ flexBasis: `${ratio * 100}%` }}
      >
        {top}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={Math.round(MIN_RATIO * 100)}
        aria-valuemax={Math.round(MAX_RATIO * 100)}
        aria-label="Resize request and response panes"
        tabIndex={0}
        onMouseDown={startDrag}
        onKeyDown={onKeyDown}
        className={`group relative w-1.5 shrink-0 cursor-col-resize outline-none ${
          dragging ? "bg-adaka-gold/40" : "bg-adaka-border hover:bg-adaka-gold/30"
        } focus-visible:bg-adaka-gold/50`}
      >
        <div className="pointer-events-none absolute inset-y-0 left-1/2 my-auto h-8 w-0.5 -translate-x-1/2 rounded-full bg-adaka-border-strong group-hover:bg-adaka-gold/70 group-focus-visible:bg-adaka-gold" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{bottom}</div>
    </div>
  );
}
