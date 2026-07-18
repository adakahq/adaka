/** The one boolean-setting switch used everywhere in Adaka — 36×20 track,
 * sliding thumb, gold when on. Stops propagation so it can sit inside a
 * clickable row (the row's own label click) without double-toggling. */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-adaka-gold focus-visible:ring-offset-2 focus-visible:ring-offset-adaka-chrome ${
        checked ? "bg-adaka-gold" : "bg-adaka-border-strong"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-adaka-bg transition-transform duration-150 ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
