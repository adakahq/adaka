import { Toggle } from "../../../shared/Toggle";
import { useApiClientStore } from "../store";

const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 300000;

/** [settings] has been format-only since M1 — RequestFile always carried
 * timeout_ms/follow_redirects/verify_tls and send.rs already reads them,
 * there was just no UI to edit them. This is that UI. */
export function RequestSettingsTab() {
  const activeRequest = useApiClientStore((s) => s.activeRequest);
  const updateRequest = useApiClientStore((s) => s.updateRequest);

  if (!activeRequest) return null;
  const { settings } = activeRequest;

  const setTimeoutMs = (value: number) => {
    const clamped = Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, value));
    updateRequest({ settings: { ...settings, timeout_ms: clamped } });
  };

  return (
    <div className="max-w-sm divide-y divide-adaka-border">
      <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
        <div className="min-w-0">
          <p className="text-sm text-adaka-text">Timeout</p>
          <p className="mt-0.5 text-xs text-adaka-faint">
            How long to wait for a response before giving up
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <input
            type="number"
            min={MIN_TIMEOUT_MS}
            max={MAX_TIMEOUT_MS}
            step={1000}
            value={settings.timeout_ms}
            onChange={(e) => {
              const parsed = Number(e.target.value);
              if (!Number.isNaN(parsed)) setTimeoutMs(parsed);
            }}
            className="w-20 rounded border border-adaka-border bg-adaka-bg px-2 py-1 text-right text-xs text-adaka-text focus:border-adaka-gold focus:outline-none"
          />
          <span className="text-xs text-adaka-faint">ms</span>
        </div>
      </div>

      <div
        className="flex cursor-pointer items-center justify-between gap-4 py-3"
        onClick={() =>
          updateRequest({ settings: { ...settings, follow_redirects: !settings.follow_redirects } })
        }
      >
        <div className="min-w-0">
          <p className="text-sm text-adaka-text">Follow redirects</p>
          <p className="mt-0.5 text-xs text-adaka-faint">
            Automatically follow 3xx Location headers
          </p>
        </div>
        <Toggle
          checked={settings.follow_redirects}
          onChange={(v) => updateRequest({ settings: { ...settings, follow_redirects: v } })}
          label="Follow redirects"
        />
      </div>

      <div
        className="flex cursor-pointer items-center justify-between gap-4 py-3"
        onClick={() => updateRequest({ settings: { ...settings, verify_tls: !settings.verify_tls } })}
      >
        <div className="min-w-0">
          <p className="text-sm text-adaka-text">Verify TLS certificates</p>
          <p className="mt-0.5 text-xs text-adaka-faint">
            Turn off only for local development against self-signed certs
          </p>
        </div>
        <Toggle
          checked={settings.verify_tls}
          onChange={(v) => updateRequest({ settings: { ...settings, verify_tls: v } })}
          label="Verify TLS certificates"
        />
      </div>
    </div>
  );
}
