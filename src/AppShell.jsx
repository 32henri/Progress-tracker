import { useEffect, useState } from "react";
import { watchAuth, login, register, logout } from "./lib/auth";
import { initStore } from "./lib/storage";
import { getDeviceMode, setDeviceMode } from "./lib/deviceMode";
import ProgressTracker from "./ProgressTracker";

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password);
    } catch (err) {
      setError(err.message.replace(/^Firebase:\s*/, ""));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0e14", color: "#cfe9f7", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Rajdhani, sans-serif" }}>
      <form onSubmit={submit} style={{ width: 320, padding: 24, border: "1px solid #2f6feb55", borderRadius: 8, background: "#10151f" }}>
        <h1 style={{ fontFamily: "Orbitron, sans-serif", fontSize: 20, marginBottom: 16, color: "#5eb3ff" }}>
          {mode === "login" ? "Sign In" : "Create Account"}
        </h1>
        <input
          type="email" placeholder="Email" value={email} required
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", padding: 10, marginBottom: 10, background: "#0a0e14", border: "1px solid #2f6feb55", borderRadius: 4, color: "#cfe9f7" }}
        />
        <input
          type="password" placeholder="Password" value={password} required
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", padding: 10, marginBottom: 10, background: "#0a0e14", border: "1px solid #2f6feb55", borderRadius: 4, color: "#cfe9f7" }}
        />
        {error && <div style={{ color: "#fb7185", fontSize: 13, marginBottom: 10 }}>{error}</div>}
        <button
          type="submit" disabled={busy}
          style={{ width: "100%", padding: 10, background: "#2f6feb", border: "none", borderRadius: 4, color: "#fff", fontWeight: 600, cursor: "pointer" }}
        >
          {busy ? "..." : mode === "login" ? "Sign In" : "Create Account"}
        </button>
        <button
          type="button" onClick={() => setMode(mode === "login" ? "register" : "login")}
          style={{ width: "100%", marginTop: 10, background: "none", border: "none", color: "#5eb3ff", fontSize: 13, cursor: "pointer" }}
        >
          {mode === "login" ? "First time? Create your account" : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}

function DeviceModePicker({ onPick }) {
  return (
    <div style={{ minHeight: "100vh", background: "#0a0e14", color: "#cfe9f7", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, fontFamily: "Rajdhani, sans-serif", padding: 24, textAlign: "center" }}>
      <h1 style={{ fontFamily: "Orbitron, sans-serif", fontSize: 18, color: "#5eb3ff" }}>What is this device?</h1>
      <p style={{ maxWidth: 320, fontSize: 14, opacity: 0.8 }}>
        This is set once per device and stays local — doesn't sync between phone and PC.
      </p>
      <div style={{ display: "flex", gap: 12 }}>
        <button onClick={() => onPick("edit")} style={{ padding: "12px 20px", background: "#2f6feb", border: "none", borderRadius: 6, color: "#fff", fontWeight: 600, cursor: "pointer" }}>
          My Phone (full editing)
        </button>
        <button onClick={() => onPick("dashboard")} style={{ padding: "12px 20px", background: "#10151f", border: "1px solid #2f6feb", borderRadius: 6, color: "#5eb3ff", fontWeight: 600, cursor: "pointer" }}>
          My PC (view only)
        </button>
      </div>
    </div>
  );
}

export default function AppShell() {
  const [user, setUser] = useState(undefined); // undefined = checking, null = signed out
  const [storeReady, setStoreReady] = useState(false);
  const [deviceMode, setDeviceModeState] = useState(getDeviceMode());

  useEffect(() => {
    const unsub = watchAuth(async (u) => {
      setUser(u);
      if (u) {
        setStoreReady(false);
        await initStore(u.uid);
        setStoreReady(true);
      }
    });
    return unsub;
  }, []);

  if (user === undefined) return null; // brief auth check, avoid flash
  if (user === null) return <LoginScreen />;
  if (!deviceMode) {
    return (
      <DeviceModePicker
        onPick={(m) => {
          setDeviceMode(m);
          setDeviceModeState(m);
        }}
      />
    );
  }
  if (!storeReady) return null; // brief data fetch

  return <ProgressTracker readOnly={deviceMode === "dashboard"} onLogout={logout} />;
}
