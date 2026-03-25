import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installTerminalEventBridge } from "./lib/terminal-events";

installTerminalEventBridge();

// Register service worker for map tile caching
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/tile-cache-sw.js')
      .then((registration) => {
        console.log('Tile cache SW registered:', registration.scope);
      })
      .catch((error) => {
        console.log('Tile cache SW registration failed:', error);
      });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
