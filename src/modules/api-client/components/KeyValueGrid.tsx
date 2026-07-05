import { useState, useCallback } from "react";
import { parseBulkPaste } from "../utils";

interface Props {
  entries: Record<string, string>;
  disabledEntries: Record<string, string>;
  onChange: (entries: Record<string, string>) => void;
  onDisabledChange: (entries: Record<string, string>) => void;
  placeholder: string;
}

export function KeyValueGrid({
  entries,
  disabledEntries,
  onChange,
  onDisabledChange,
  placeholder,
}: Props) {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const allEntries = [
    ...Object.entries(entries).map(([k, v]) => ({
      key: k,
      value: v,
      enabled: true,
    })),
    ...Object.entries(disabledEntries).map(([k, v]) => ({
      key: k,
      value: v,
      enabled: false,
    })),
  ];

  const addEntry = useCallback(() => {
    if (!newKey.trim()) return;
    onChange({ ...entries, [newKey.trim()]: newValue });
    setNewKey("");
    setNewValue("");
  }, [newKey, newValue, entries, onChange]);

  const removeEntry = (key: string, enabled: boolean) => {
    if (enabled) {
      onChange(Object.fromEntries(Object.entries(entries).filter(([k]) => k !== key)));
    } else {
      onDisabledChange(Object.fromEntries(Object.entries(disabledEntries).filter(([k]) => k !== key)));
    }
  };

  const toggleEntry = (key: string, value: string, currentlyEnabled: boolean) => {
    if (currentlyEnabled) {
      onChange(Object.fromEntries(Object.entries(entries).filter(([k]) => k !== key)));
      onDisabledChange({ ...disabledEntries, [key]: value });
    } else {
      onDisabledChange(Object.fromEntries(Object.entries(disabledEntries).filter(([k]) => k !== key)));
      onChange({ ...entries, [key]: value });
    }
  };

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const text = e.clipboardData.getData("text");
      const pairs = parseBulkPaste(text);
      if (pairs.length > 1) {
        e.preventDefault();
        const added: Record<string, string> = {};
        for (const [k, v] of pairs) {
          added[k] = v;
        }
        onChange({ ...entries, ...added });
      }
    },
    [entries, onChange],
  );

  return (
    <div className="space-y-1" onPaste={handlePaste}>
      {allEntries.map(({ key, value, enabled }) => (
        <div key={`${key}-${enabled}`} className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={enabled}
            onChange={() => toggleEntry(key, value, enabled)}
            className="h-3 w-3 accent-adaka-gold"
          />
          <input
            type="text"
            className={`flex-1 rounded border border-adaka-border bg-adaka-bg px-2 py-1 text-xs ${
              enabled ? "text-adaka-text" : "text-adaka-faint line-through"
            } focus:border-adaka-gold focus:outline-none`}
            value={key}
            readOnly
          />
          <input
            type="text"
            className={`flex-1 rounded border border-adaka-border bg-adaka-bg px-2 py-1 text-xs ${
              enabled ? "text-adaka-text" : "text-adaka-faint"
            } focus:border-adaka-gold focus:outline-none`}
            value={value}
            readOnly
          />
          <button
            className="text-adaka-faint hover:text-red-400"
            onClick={() => removeEntry(key, enabled)}
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>
      ))}

      <div className="flex items-center gap-1 pt-1">
        <div className="w-3" />
        <input
          type="text"
          className="flex-1 rounded border border-adaka-border bg-adaka-bg px-2 py-1 text-xs text-adaka-text placeholder:text-adaka-faint focus:border-adaka-gold focus:outline-none"
          placeholder="Key"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addEntry();
          }}
        />
        <input
          type="text"
          className="flex-1 rounded border border-adaka-border bg-adaka-bg px-2 py-1 text-xs text-adaka-text placeholder:text-adaka-faint focus:border-adaka-gold focus:outline-none"
          placeholder={placeholder}
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addEntry();
          }}
        />
        <button
          className="text-adaka-muted hover:text-adaka-text"
          onClick={addEntry}
          disabled={!newKey.trim()}
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
