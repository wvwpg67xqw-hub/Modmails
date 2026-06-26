import { useEffect, useState } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function getPingUrl() {
  return `${window.location.origin}${BASE}/api/ping`.replace(/([^:])\/\//, "$1/");
}

function useStatus() {
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");
  const [uptime, setUptime] = useState<number | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  async function check() {
    try {
      const res = await fetch(`${BASE}/api/ping`.replace(/([^:])\/\//, "$1/"));
      if (res.ok) {
        const data = await res.json();
        setStatus("online");
        setUptime(data.uptime);
      } else {
        setStatus("offline");
      }
    } catch {
      setStatus("offline");
    }
    setLastChecked(new Date());
  }

  useEffect(() => {
    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, []);

  return { status, uptime, lastChecked, check };
}

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function App() {
  const { status, uptime, lastChecked, check } = useStatus();
  const [copied, setCopied] = useState(false);

  const pingUrl = typeof window !== "undefined" ? getPingUrl() : "";

  function copy() {
    navigator.clipboard.writeText(pingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isOnline = status === "online";
  const isChecking = status === "checking";

  return (
    <div style={{ minHeight: "100vh", background: "#1a1b2e", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', system-ui, sans-serif", color: "#e2e3ff", padding: "2rem" }}>

      {/* Discord bot icon */}
      <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#5865f2", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1.5rem", boxShadow: "0 0 32px rgba(88,101,242,0.5)" }}>
        <svg width="44" height="44" viewBox="0 0 24 24" fill="white">
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
        </svg>
      </div>

      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: "0 0 0.25rem", letterSpacing: "-0.02em" }}>
        Modmail Bot
      </h1>
      <p style={{ color: "#8b8fa8", margin: "0 0 2rem", fontSize: "0.95rem" }}>Status Dashboard</p>

      {/* Status card */}
      <div style={{ background: "#16213e", border: "1px solid #2a2d47", borderRadius: "1rem", padding: "2rem", width: "100%", maxWidth: 480, marginBottom: "1.5rem", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
          <div style={{ position: "relative" }}>
            <div style={{
              width: 16, height: 16, borderRadius: "50%",
              background: isChecking ? "#faa61a" : isOnline ? "#3ba55d" : "#ed4245",
              boxShadow: isChecking ? "0 0 8px #faa61a" : isOnline ? "0 0 8px #3ba55d" : "0 0 8px #ed4245"
            }} />
            {isOnline && (
              <div style={{
                position: "absolute", top: 0, left: 0,
                width: 16, height: 16, borderRadius: "50%",
                background: "#3ba55d", opacity: 0.4,
                animation: "ping 1.5s cubic-bezier(0,0,.2,1) infinite"
              }} />
            )}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>
              {isChecking ? "Checking…" : isOnline ? "Online" : "Offline"}
            </div>
            <div style={{ color: "#8b8fa8", fontSize: "0.8rem" }}>
              {lastChecked ? `Last checked ${lastChecked.toLocaleTimeString()}` : "Checking…"}
            </div>
          </div>
          <button onClick={check} style={{ marginLeft: "auto", background: "transparent", border: "1px solid #2a2d47", borderRadius: "0.5rem", color: "#8b8fa8", cursor: "pointer", padding: "0.4rem 0.75rem", fontSize: "0.8rem", transition: "all .15s" }}
            onMouseOver={e => (e.currentTarget.style.borderColor = "#5865f2")}
            onMouseOut={e => (e.currentTarget.style.borderColor = "#2a2d47")}>
            Refresh
          </button>
        </div>

        {uptime !== null && (
          <div style={{ display: "flex", gap: "1rem" }}>
            <div style={{ flex: 1, background: "#0f1728", borderRadius: "0.75rem", padding: "1rem", textAlign: "center" }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#5865f2" }}>{formatUptime(uptime)}</div>
              <div style={{ fontSize: "0.75rem", color: "#8b8fa8", marginTop: "0.25rem" }}>Uptime</div>
            </div>
            <div style={{ flex: 1, background: "#0f1728", borderRadius: "0.75rem", padding: "1rem", textAlign: "center" }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#3ba55d" }}>Active</div>
              <div style={{ fontSize: "0.75rem", color: "#8b8fa8", marginTop: "0.25rem" }}>Bot Status</div>
            </div>
          </div>
        )}
      </div>

      {/* UptimeRobot setup */}
      <div style={{ background: "#16213e", border: "1px solid #2a2d47", borderRadius: "1rem", padding: "2rem", width: "100%", maxWidth: 480, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5865f2" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
          <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>UptimeRobot Setup</span>
        </div>

        <p style={{ color: "#8b8fa8", fontSize: "0.85rem", margin: "0 0 1rem", lineHeight: 1.6 }}>
          Add this URL to <a href="https://uptimerobot.com" target="_blank" rel="noreferrer" style={{ color: "#5865f2", textDecoration: "none" }}>UptimeRobot</a> as an <strong style={{ color: "#c4c6de" }}>HTTP(S)</strong> monitor with a <strong style={{ color: "#c4c6de" }}>5-minute</strong> interval to keep the bot online 24/7.
        </p>

        <div style={{ background: "#0f1728", borderRadius: "0.6rem", padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: "0.75rem", border: "1px solid #2a2d47" }}>
          <code style={{ flex: 1, fontSize: "0.8rem", color: "#a5b4fc", wordBreak: "break-all", fontFamily: "monospace" }}>{pingUrl}</code>
          <button onClick={copy} style={{
            flexShrink: 0, background: copied ? "#3ba55d" : "#5865f2",
            border: "none", borderRadius: "0.4rem", color: "white",
            cursor: "pointer", padding: "0.4rem 0.8rem", fontSize: "0.8rem",
            fontWeight: 600, transition: "background .2s"
          }}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        <div style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {[
            ["1", "Go to uptimerobot.com and create a free account"],
            ["2", 'Click "Add New Monitor"'],
            ["3", 'Select "HTTP(S)" as monitor type'],
            ["4", "Paste the URL above and set interval to 5 minutes"],
            ["5", "Save — your bot will now stay online 24/7"],
          ].map(([n, step]) => (
            <div key={n} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#5865f2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700, flexShrink: 0 }}>{n}</div>
              <span style={{ color: "#c4c6de", fontSize: "0.85rem", lineHeight: 1.5, paddingTop: 2 }}>{step}</span>
            </div>
          ))}
        </div>
      </div>

      <p style={{ color: "#4a4d6a", fontSize: "0.75rem", marginTop: "1.5rem" }}>
        Auto-refreshes every 30 seconds
      </p>

      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
