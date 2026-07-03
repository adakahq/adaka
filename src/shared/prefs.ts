import { invoke } from "@tauri-apps/api/core";

export async function getPref<T>(key: string): Promise<T | null> {
  const val = await invoke<T | null>("core_get_pref", { key });
  return val;
}

export async function setPref(key: string, value: unknown): Promise<void> {
  await invoke("core_set_pref", { key, value });
}
