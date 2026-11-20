import {
  appStateSchema,
  emptyAppState,
  type AppState,
} from "@/features/pacepal/model";

export const pacePalStorageKey = "pacepal:app-state:v1";
export const pacePalStorageOwnerKey = "pacepal:app-state-owner:v1";

export function loadAppState(): AppState {
  try {
    const stored = window.localStorage.getItem(pacePalStorageKey);
    if (!stored) return emptyAppState;

    const parsed = appStateSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : emptyAppState;
  } catch {
    return emptyAppState;
  }
}

export function saveAppState(state: AppState) {
  window.localStorage.setItem(pacePalStorageKey, JSON.stringify(state));
}

export function clearAppState() {
  window.localStorage.removeItem(pacePalStorageKey);
}

export function loadAppStateOwner() {
  return window.localStorage.getItem(pacePalStorageOwnerKey);
}

export function saveAppStateOwner(userId: string) {
  window.localStorage.setItem(pacePalStorageOwnerKey, userId);
}

export function clearAppStateOwner() {
  window.localStorage.removeItem(pacePalStorageOwnerKey);
}
