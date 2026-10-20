// Canonical, global phone wallpaper preference. Stores only trusted game asset paths.
(() => {
  if (window.Game?.wallpaper?.__v === 2) return;

  const Game = (window.Game ||= {});
  const STORAGE_KEY = "phone_wallpaper_v1";
  const DEFAULT_SRC = "assets/pictures/backscreen.jpg";
  const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

  function cleanPath(raw) {
    return String(raw || "").trim().replace(/\\/g, "/").split("#")[0].split("?")[0].replace(/^\.\//, "");
  }

  function canonicalize(raw) {
    let src = cleanPath(raw);
    try { src = decodeURIComponent(src); } catch {}
    src = src.replace(/^\/+/, "");
    if (!src || !src.toLowerCase().startsWith("assets/")) return "";
    if (src.includes("..") || /[\0\r\n]/.test(src) || /^(?:https?:|data:|blob:|file:|capacitor:|android_asset:)/i.test(src)) return "";
    const ext = (src.split(".").pop() || "").toLowerCase();
    return IMAGE_EXTS.has(ext) ? src : "";
  }

  function readStored() {
    try {
      const engine = window.GameStateEngine;
      const vault = typeof engine?.getCardVaultState === "function" ? engine.getCardVaultState() : engine?.getState?.()?.cardVault;
      const canonical = vault?.wallpaper;
      const src = canonical?.type === "gameAsset" ? canonicalize(canonical.src) : "";
      if (src) return { ...canonical, version: 1, type: "gameAsset", src };
    } catch {}
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      const src = parsed?.version === 1 && parsed?.type === "gameAsset" ? canonicalize(parsed.src) : "";
      return src ? { version: 1, type: "gameAsset", src } : null;
    } catch { return null; }
  }

  async function resolveRuntimeAsset(src) {
    const trusted = canonicalize(src);
    if (!trusted) throw new Error("Invalid wallpaper asset");
    const resolver = window.ProtectedMediaResolver?.resolveRuntimeAsset;
    return typeof resolver === "function" ? resolver(trusted) : trusted;
  }

  async function imageExists(src) {
    const trusted = canonicalize(src);
    if (!trusted) return false;
    let runtimeSrc;
    try { runtimeSrc = await resolveRuntimeAsset(trusted); } catch { return false; }
    return new Promise((resolve) => {
      const img = new Image();
      const timer = setTimeout(() => { cleanup(); resolve(false); }, 9000);
      const cleanup = () => { clearTimeout(timer); img.onload = null; img.onerror = null; };
      img.onload = () => { const ok = img.naturalWidth > 0 && img.naturalHeight > 0; cleanup(); resolve(ok); };
      img.onerror = () => { cleanup(); resolve(false); };
      img.src = runtimeSrc;
    });
  }

  function get() { return readStored(); }
  function currentSrc() { return get()?.src || DEFAULT_SRC; }

  function emit(detail) {
    try { window.dispatchEvent(new CustomEvent("wallpaper:changed", { detail })); } catch {}
  }

  async function set(rawSrc, meta = {}) {
    const src = canonicalize(rawSrc);
    if (!src) {
      try { window.reportGameRuntimeEvent?.("wallpaper-set-rejected", { reason: "untrusted-source", source: String(rawSrc || ""), caller: String(meta.source || "") }); } catch {}
      return false;
    }
    if (!(await imageExists(src))) {
      try { window.reportGameRuntimeEvent?.("wallpaper-set-rejected", { reason: "missing-asset", source: src, caller: String(meta.source || "") }); } catch {}
      return false;
    }
    const cardId = String(meta.cardId || "").trim().toLowerCase();
    if (String(meta.source || "") === "cardVault") {
      const vault = window.GameStateEngine?.getState?.()?.cardVault;
      if (!cardId || !vault?.owned?.[cardId]) {
        try { window.reportGameRuntimeEvent?.("wallpaper-set-rejected", { reason: "card-not-owned", cardId, caller: "cardVault" }); } catch {}
        return false;
      }
    }
    const value = { version: 1, type: "gameAsset", src, cardId: cardId || null };
    const engine = window.GameStateEngine;
    if (engine?.dispatch && engine?.getState) {
      const state = engine.getState();
      state.cardVault.wallpaper = value;
      const transactionId = `wallpaper-${cardId || "asset"}-${Date.now()}`;
      const committed = engine.dispatch({type:"SET_CARD_WALLPAPER",commandId:`card-vault:${transactionId}`,expectedRevision:engine.getState().revision,payload:{state:state.cardVault,transactionId,result:{src,cardId:cardId||null}}});
      if (!committed?.ok) return false;
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch {
      try { window.reportGameRuntimeEvent?.("wallpaper-set-rejected", { reason: "persistence-failure", source: src, caller: String(meta.source || "") }); } catch {}
      return false;
    }
    emit({ wallpaper: value, src, source: String(meta.source || "mediaViewer") });
    return true;
  }

  function restoreDefault(meta = {}) {
    const engine = window.GameStateEngine;
    if (engine?.dispatch && engine?.getState) {
      const state = engine.getState();
      state.cardVault.wallpaper = null;
      const transactionId = `wallpaper-default-${Date.now()}`;
      engine.dispatch({type:"SET_CARD_WALLPAPER",commandId:`card-vault:${transactionId}`,expectedRevision:engine.getState().revision,payload:{state:state.cardVault,transactionId,result:{src:DEFAULT_SRC}}});
    }
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    emit({ wallpaper: null, src: DEFAULT_SRC, source: String(meta.source || "settings") });
    return true;
  }

  async function validateStored() {
    const stored = get();
    if (!stored) return true;
    if (await imageExists(stored.src)) return true;
    restoreDefault({ source: "invalid-stored-asset" });
    return false;
  }

  async function applyTo(element) {
    if (!element?.style) return DEFAULT_SRC;
    const logicalSrc = currentSrc();
    const src = await resolveRuntimeAsset(logicalSrc);
    element.style.setProperty("--phone-wallpaper-image", `url(${JSON.stringify(src)})`);
    element.dataset.wallpaperCustom = get() ? "1" : "0";
    element.dataset.wallpaperSrc = logicalSrc;
    element.dataset.wallpaperResolvedSrc = src;
    return logicalSrc;
  }

  async function applyGlobal() {
    const logicalSrc = currentSrc();
    const src = await resolveRuntimeAsset(logicalSrc);
    const encoded = `url(${JSON.stringify(src)})`;
    const doc = typeof document !== "undefined" ? document : null;
    doc?.documentElement?.style?.setProperty("--phone-wallpaper-image", encoded);
    doc?.body?.style?.setProperty("--phone-wallpaper-image", encoded);
    const layer = doc?.getElementById?.("phone-wallpaper");
    if (layer) {
      layer.style.setProperty("--phone-wallpaper-image", encoded);
      layer.dataset.wallpaperCustom = get() ? "1" : "0";
      layer.dataset.wallpaperSrc = logicalSrc;
      layer.dataset.wallpaperResolvedSrc = src;
    }
    return logicalSrc;
  }

  Game.wallpaper = Object.freeze({
    __v: 2, STORAGE_KEY, DEFAULT_SRC, canonicalize, canUse: (src) => !!canonicalize(src),
    resolveRuntimeAsset, imageExists, get, currentSrc, set, restoreDefault, validateStored, applyTo, applyGlobal
  });
  window.addEventListener?.("wallpaper:changed", applyGlobal);
  applyGlobal().catch(() => {});
  Promise.resolve(validateStored()).then(applyGlobal).catch(() => applyGlobal().catch(() => {}));
})();
