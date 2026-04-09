import { useEffect, useState } from 'react';

const NAVISAR_BASE = (import.meta.env.VITE_NAVISAR_URL || 'http://127.0.0.1:8765').replace(/\/$/, '');
const NAVISAR_DASHBOARD_URL = `${NAVISAR_BASE}/gui.html`;

export const NavisarDashboardPanel = () => {
  const [iframeSrc, setIframeSrc] = useState<string>(`${NAVISAR_DASHBOARD_URL}?t=${Date.now()}`);
  const [statusMessage, setStatusMessage] = useState<string | null>(
    `Loading NAVISAR from ${NAVISAR_DASHBOARD_URL}.`
  );

  useEffect(() => {
    setIframeSrc(`${NAVISAR_DASHBOARD_URL}?t=${Date.now()}`);
  }, []);

  return (
    <div className="relative h-full w-full bg-panel border-l border-panel-border">
      <iframe
        src={iframeSrc}
        title="NAVISAR Dashboard"
        className="h-full w-full border-0 bg-black"
        allow="clipboard-read; clipboard-write; fullscreen"
        referrerPolicy="no-referrer"
        onLoad={() => setStatusMessage(null)}
      />
      {statusMessage && (
        <div className="pointer-events-none absolute left-4 top-4 max-w-[560px] rounded-md border border-amber-400/40 bg-black/75 px-3 py-2 text-xs text-amber-100">
          {statusMessage}
        </div>
      )}
    </div>
  );
};
