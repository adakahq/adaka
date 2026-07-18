import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactNode } from "react";

const SHOW_DELAY_MS = 400;
const GAP_PX = 6;
const EDGE_MARGIN_PX = 8;

type Side = "top" | "bottom";

interface Props {
  content: string;
  children: ReactNode;
  disabled?: boolean;
}

/** Themed replacement for the native title="" tooltip — same info, but
 * styled, positioned with an arrow, and announced via aria-describedby
 * instead of the browser's slow/unstyled/inaccessible default. Shows on
 * hover or focus (keyboard users get the same information mouse users do),
 * after a 400ms delay so it doesn't flash on every pointer pass-through. */
export function Tooltip({ content, children, disabled }: Props) {
  const [visible, setVisible] = useState(false);
  const [side, setSide] = useState<Side>("top");
  const [alignOffset, setAlignOffset] = useState(0);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  const scheduleShow = () => {
    if (disabled || !content) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
  };

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  };

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const anchor = wrapperRef.current;
    const tip = tooltipRef.current;
    if (!anchor || !tip) return;

    const anchorRect = anchor.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();

    const fitsAbove = anchorRect.top - tipRect.height - GAP_PX >= 0;
    setSide(fitsAbove ? "top" : "bottom");

    const centered = anchorRect.left + anchorRect.width / 2 - tipRect.width / 2;
    const maxLeft = window.innerWidth - tipRect.width - EDGE_MARGIN_PX;
    const clampedLeft = Math.min(Math.max(centered, EDGE_MARGIN_PX), Math.max(maxLeft, EDGE_MARGIN_PX));
    setAlignOffset(centered - clampedLeft);
  }, [visible, content]);

  if (!content) return <>{children}</>;

  return (
    <span
      ref={wrapperRef}
      className="relative inline-flex"
      onMouseEnter={scheduleShow}
      onMouseLeave={hide}
      onFocus={scheduleShow}
      onBlur={hide}
    >
      {isValidElement(children)
        ? cloneElement(children as React.ReactElement<{ "aria-describedby"?: string }>, {
            "aria-describedby": visible ? id : undefined,
          })
        : children}
      {visible && (
        <div
          ref={tooltipRef}
          role="tooltip"
          id={id}
          className={`pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded border border-adaka-border-strong bg-adaka-chrome px-2 py-1 text-[11px] text-adaka-text shadow-lg ${
            side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"
          }`}
          style={{ transform: `translateX(calc(-50% - ${alignOffset}px))` }}
        >
          {content}
          <div
            className={`absolute left-1/2 h-1.5 w-1.5 -translate-x-1/2 rotate-45 border-adaka-border-strong bg-adaka-chrome ${
              side === "top"
                ? "-bottom-[3.5px] border-b border-r"
                : "-top-[3.5px] border-l border-t"
            }`}
            style={{ marginLeft: alignOffset }}
          />
        </div>
      )}
    </span>
  );
}
