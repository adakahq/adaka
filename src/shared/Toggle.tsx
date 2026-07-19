export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={[
        "group relative inline-flex h-[22px] w-[40px] shrink-0 cursor-pointer items-center rounded-[11px] transition-all duration-150 ease-in-out",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-adaka-gold focus-visible:ring-offset-2 focus-visible:ring-offset-adaka-chrome",
        checked
          ? "bg-adaka-gold"
          : "border border-adaka-border-strong bg-adaka-chrome",
        disabled ? "pointer-events-none opacity-40" : "",
      ].join(" ")}
    >
      <span
        className={[
          "absolute top-[3px] left-[3px] h-4 w-4 rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.4)] transition-all duration-150 ease-in-out",
          "group-hover:scale-110",
          checked
            ? "translate-x-[18px] bg-[#F5EFE4]"
            : "translate-x-0 bg-adaka-muted",
        ].join(" ")}
      >
        {checked && (
          <svg
            className="absolute inset-0 m-auto h-2.5 w-2.5 text-adaka-gold"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2.5 5.5 4.5 7.5 7.5 3" />
          </svg>
        )}
      </span>
    </button>
  );
}
