// Tiny pub-sub so any component can see which AI path last ran, without
// threading a prop through every classify call site.
let status = { provider: null, detail: null, at: null };
const listeners = new Set();

export function setAIStatus(provider, detail = null) {
  status = { provider, detail, at: Date.now() };
  listeners.forEach((fn) => fn(status));
}

export function getAIStatus() {
  return status;
}

export function subscribeAIStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
