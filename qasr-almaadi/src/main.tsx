import React, {useEffect} from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/cairo";
import App from "./App";
import "./style.css";
import "./typography.css";
import {useLanguage} from './i18n';
import "./system-design.css";

function OfflineShellSupport() {
  const language = useLanguage();
  useEffect(() => {
    let manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!manifest) {
      manifest = document.createElement('link');
      manifest.rel = 'manifest';
      document.head.append(manifest);
    }
    manifest.href = language === 'en' ? '/manifest.en.webmanifest' : '/manifest.webmanifest';
    if (!document.querySelector('link[rel="icon"]')) {
      const icon = document.createElement('link');
      icon.rel = 'icon';
      icon.type = 'image/png';
      icon.href = '/hospital-logo.png';
      document.head.append(icon);
    }
  }, [language]);
  useEffect(() => {
    if (!import.meta.env.PROD || !window.isSecureContext || !('serviceWorker' in navigator)) return;
    let active = true;
    navigator.serviceWorker.register('/sw.js', {scope: '/', updateViaCache: 'none'})
      .then(registration => {if (active) void registration.update().catch(() => {});})
      .catch(() => {
        // The online application remains available if storage is blocked or
        // installation fails. No clinical operation depends on this cache.
      });
    return () => {active = false;};
  }, []);
  return null;
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <OfflineShellSupport/>
    <App />
  </React.StrictMode>,
);
