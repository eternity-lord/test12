(function initMobileDebug() {
  if (window.__mobile_debug_v1) return;
  window.__mobile_debug_v1 = true;

  function isEnabled() {
    try { return localStorage.getItem("debug_mobile") === "1"; }
    catch { return false; }
  }

  function log(kind, payload) {
    if (!isEnabled()) return;
    try { console.warn("[mobile-debug]", kind, payload); } catch {}
  }

  const originalFetch = (typeof window.fetch === "function") ? window.fetch.bind(window) : null;
  if (originalFetch) {
    window.fetch = async function patchedFetch(input, init) {
      const reqUrl = typeof input === "string" ? input : String(input?.url || "");
      const watch = reqUrl.includes("scenes/") || reqUrl.includes("story/");
      try {
        const res = await originalFetch(input, init);
        if (watch && !res.ok) {
          log("fetch_not_ok", { url: reqUrl, status: res.status, statusText: res.statusText });
        }
        return res;
      } catch (err) {
        if (watch) {
          log("fetch_error", { url: reqUrl, error: String(err && err.message ? err.message : err) });
        }
        throw err;
      }
    };
  }

  window.addEventListener("error", (event) => {
    const target = event && event.target;
    if (!target || target === window) return;
    const tag = String(target.tagName || "").toLowerCase();
    if (!tag) return;
    if (tag !== "img" && tag !== "audio" && tag !== "video" && tag !== "source") return;
    const src =
      target.currentSrc ||
      target.src ||
      target.getAttribute?.("src") ||
      target.getAttribute?.("poster") ||
      "";
    log("media_error", { tag, src });
  }, true);

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event && event.reason;
    log("unhandledrejection", String(reason && reason.message ? reason.message : reason));
  });
})();
