import { Toggle } from "../../../shared/Toggle";
import { useApiClientStore } from "../store";

const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 300000;

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
    <div className="space-y-4 overflow-auto p-3">
      {/* Network group */}
      <SettingsCard title="Network">
        <SettingsRow
          label="Timeout"
          description="Maximum time to wait for a response. Increase for slow endpoints, decrease for tight SLAs."
        >
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
        </SettingsRow>
        <SettingsRow
          label="Follow redirects"
          description="Automatically follow 3xx Location headers. Turn off to inspect redirect responses directly."
          onClick={() =>
            updateRequest({ settings: { ...settings, follow_redirects: !settings.follow_redirects } })
          }
        >
          <Toggle
            checked={settings.follow_redirects}
            onChange={(v) => updateRequest({ settings: { ...settings, follow_redirects: v } })}
            label="Follow redirects"
          />
        </SettingsRow>
      </SettingsCard>

      {/* Security group */}
      <SettingsCard title="Security">
        <SettingsRow
          label="Verify TLS certificates"
          description="Validates the server's certificate chain. Turn off only for local development against self-signed certs — never in production."
          onClick={() => updateRequest({ settings: { ...settings, verify_tls: !settings.verify_tls } })}
        >
          <Toggle
            checked={settings.verify_tls}
            onChange={(v) => updateRequest({ settings: { ...settings, verify_tls: v } })}
            label="Verify TLS certificates"
          />
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}

function SettingsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-adaka-border">
      <div className="border-b border-adaka-border px-3 py-1.5">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-adaka-faint">{title}</h3>
      </div>
      <div className="divide-y divide-adaka-border">{children}</div>
    </div>
  );
}

function SettingsRow({
  label,
  description,
  onClick,
  children,
}: {
  label: string;
  description: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 px-3 py-3 ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <div className="min-w-0">
        <p className="text-sm text-adaka-text">{label}</p>
        <p className="mt-0.5 text-xs text-adaka-faint">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
