import { useSyncExternalStore } from "react"

/**
 * The user's own TypeSafe API key, kept only in this browser: localStorage
 * when "remember on this device" is on, sessionStorage (gone when the tab
 * closes) when it's off. It's sent with each Jev request to this app's
 * server, which forwards it to TypeSafe and never stores or logs it.
 */

const STORAGE_KEY = "jevpdf:typesafe-key"
/** TypeSafe keys look like `apikey_<id>_<secret>`. */
const KEY_PATTERN = /^apikey_[A-Za-z0-9]+_[A-Za-z0-9]+$/

const listeners = new Set<() => void>()

function read(storage: () => Storage): string | null {
  try {
    return storage().getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function getApiKey(): string | null {
  return read(() => localStorage) ?? read(() => sessionStorage)
}

export function isRemembered(): boolean {
  return read(() => localStorage) !== null
}

export function isValidApiKey(key: string) {
  return KEY_PATTERN.test(key.trim())
}

export function setApiKey(key: string, remember: boolean) {
  clearApiKey(false)
  try {
    ;(remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, key.trim())
  } catch {
    // Storage blocked (private mode etc.): the key just won't persist.
  }
  listeners.forEach((l) => l())
}

export function clearApiKey(notify = true) {
  for (const storage of [() => localStorage, () => sessionStorage]) {
    try {
      storage().removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }
  if (notify) listeners.forEach((l) => l())
}

/** Masked for display: apikey_243f…ef61 */
export function maskApiKey(key: string) {
  return key.length > 16 ? `${key.slice(0, 11)}…${key.slice(-4)}` : "••••"
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && listener()
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

export function useApiKey() {
  return useSyncExternalStore(subscribe, getApiKey, () => null)
}
