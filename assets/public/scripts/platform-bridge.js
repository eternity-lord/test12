(function initPlatformBridge() {
  if (window.__platform_bridge_v1) return;
  window.__platform_bridge_v1 = true;

  const Game = (window.Game ||= {});
  const isElectron = !!(window?.process?.versions?.electron);

  function getCapacitorPlugin(name) {
    try {
      const plugins = window.Capacitor?.Plugins;
      if (plugins && plugins[name]) return plugins[name];
    } catch {}
    return null;
  }

  function normalizeExternalUrl(rawUrl) {
    const url = String(rawUrl || "").trim();
    if (!url) return "";
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
      return parsed.toString();
    } catch {
      return "";
    }
  }

  async function openExternalViaElectron(url) {
    try {
      if (window.electronAPI && typeof window.electronAPI.openExternal === "function") {
        const result = await window.electronAPI.openExternal(url);
        if (!result || result.ok !== false) return true;
      }
    } catch {}

    try {
      if (window.api && typeof window.api.openExternal === "function") {
        const result = await window.api.openExternal(url);
        if (!result || result.ok !== false) return true;
      }
    } catch {}

    try {
      if (isElectron && typeof require === "function") {
        const { shell } = require("electron");
        if (shell && typeof shell.openExternal === "function") {
          await shell.openExternal(url);
          return true;
        }
      }
    } catch {}

    return false;
  }

  async function openExternalViaCapacitor(url) {
    try {
      const Browser = getCapacitorPlugin("Browser");
      if (Browser && typeof Browser.open === "function") {
        await Browser.open({ url });
        return true;
      }
    } catch {}
    return false;
  }

  Game.openExternalUrl = async function openExternalUrl(rawUrl) {
    const url = normalizeExternalUrl(rawUrl);
    if (!url) return false;

    if (await openExternalViaElectron(url)) return true;
    if (await openExternalViaCapacitor(url)) return true;

    try {
      window.open(url, "_blank", "noopener,noreferrer");
      return true;
    } catch {}
    return false;
  };

  function bindAndroidBackButton() {
    if (Game.__cap_back_handler_bound) return;
    const App = getCapacitorPlugin("App");
    if (!App || typeof App.addListener !== "function") return;
    Game.__cap_back_handler_bound = true;

    App.addListener("backButton", () => {
      const scene = String(window.Game?.currentScene || "").toLowerCase();
      if (scene && scene !== "home" && typeof window.navigateBack === "function") {
        try { window.navigateBack(); } catch {}
        return;
      }
      try { App.exitApp?.(); } catch {}
    });
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", bindAndroidBackButton, { once: true });
  } else {
    bindAndroidBackButton();
  }
})();
