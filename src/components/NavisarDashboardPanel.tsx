import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_CHAOX_API_BASE || 'http://localhost:9000';
const NAVISAR_URL = import.meta.env.VITE_NAVISAR_URL ?? 'http://127.0.0.1:8765/';

export const NavisarDashboardPanel = () => {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const checkStatus = async () => {
      try {
        const response = await fetch(`${API_BASE}/integrations/navisar/status`);
        const payload = await response.json();
        if (!alive) return;
        if (!response.ok || !payload?.available) {
          setStatusMessage('NAVISAR runtime is not reachable. Start navisar.main and keep backend running on :9000.');
          return;
        }
        setStatusMessage(null);
      } catch {
        if (!alive) return;
        setStatusMessage('Backend unavailable on :9000. Start this app with `npm run dev:all`.');
      }
    };
    void checkStatus();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="relative h-full w-full bg-panel border-l border-panel-border">
      <iframe
        src={NAVISAR_URL}
        title="NAVISAR Dashboard"
        className="h-full w-full border-0 bg-black"
        allow="clipboard-read; clipboard-write; fullscreen"
        referrerPolicy="no-referrer"
      />
      {statusMessage && (
        <div className="pointer-events-none absolute left-4 top-4 max-w-[560px] rounded-md border border-amber-400/40 bg-black/75 px-3 py-2 text-xs text-amber-100">
          {statusMessage}
        </div>
      )}
    </div>
  );
};
