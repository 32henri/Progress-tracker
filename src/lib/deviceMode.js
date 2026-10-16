// Which role THIS browser/device plays — set once per install, stored
// locally (not in Firestore, it's a device property, not account data).
const KEY = "progress-tracker:device-mode";

export function getDeviceMode() {
  return localStorage.getItem(KEY); // "edit" | "dashboard" | null
}

export function setDeviceMode(mode) {
  localStorage.setItem(KEY, mode);
}
