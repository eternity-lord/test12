(function () {
  if (window.AsyncLoadingOverlay && window.AsyncLoadingOverlay.__v === "2026-07-05-replay-loading-v1") return;

  var ROOT_ID = "async-loading-overlay";
  var STYLE_ID = "async-loading-overlay-style";
  var active = null;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".async-loading-overlay{position:fixed;inset:0;z-index:2147483600;display:grid;place-items:center;padding:24px;color:#f0f5ff;background:rgba(1,3,8,.58);opacity:0;pointer-events:none;transition:opacity .12s ease;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial}",
      ".async-loading-overlay.is-visible{opacity:1;pointer-events:auto}",
      ".async-loading-overlay[hidden]{display:none!important}",
      ".async-loading-card{width:min(360px,calc(100vw - 42px));border:1px solid rgba(245,248,255,.20);border-radius:18px;background:linear-gradient(180deg,rgba(13,18,29,.96),rgba(6,9,16,.94));box-shadow:0 22px 64px rgba(0,0,0,.62);padding:18px 18px 16px;text-align:center;overflow:hidden}",
      ".async-loading-label{font-size:.58rem;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:rgba(240,245,255,.62)}",
      ".async-loading-title{margin-top:6px;font-size:.96rem;font-weight:900;letter-spacing:.06em;line-height:1.25;overflow-wrap:anywhere}",
      ".async-loading-subtitle{margin-top:7px;min-height:1.1em;font-size:.78rem;line-height:1.35;color:rgba(240,245,255,.70)}",
      ".async-loading-progress{display:flex;align-items:center;justify-content:center;gap:7px;height:28px;margin-top:13px}",
      ".async-loading-dot{width:7px;height:7px;border-radius:999px;background:rgba(112,220,255,.86);animation:asyncLoadingDot .86s ease-in-out infinite}",
      ".async-loading-dot:nth-child(2){animation-delay:.11s}.async-loading-dot:nth-child(3){animation-delay:.22s}.async-loading-dot:nth-child(4){animation-delay:.33s}",
      ".async-loading-error .async-loading-dot{background:rgba(255,118,118,.88);animation:none}",
      ".async-loading-actions{display:none;margin-top:12px}.async-loading-error .async-loading-actions{display:block}",
      ".async-loading-close{appearance:none;border:1px solid rgba(245,248,255,.22);border-radius:999px;background:rgba(8,10,14,.62);color:#f0f5ff;padding:8px 13px;font-size:.66rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}",
      "@keyframes asyncLoadingDot{0%,100%{transform:translateY(0);opacity:.45}45%{transform:translateY(-6px);opacity:1}}",
      "@media (prefers-reduced-motion:reduce){.async-loading-overlay{transition:none}.async-loading-dot{animation:none}}",
      "html.android-webview .async-loading-overlay{background:rgba(1,3,8,.72)!important;transition:none!important}",
      "html.android-webview .async-loading-card{box-shadow:none!important;background:#080d16!important}",
      "html.android-webview .async-loading-dot{animation:none!important}"
    ].join("\n");
    document.head.appendChild(style);
  }

  function ensureRoot() {
    ensureStyle();
    var el = document.getElementById(ROOT_ID);
    if (el) return el;
    el = document.createElement("div");
    el.id = ROOT_ID;
    el.className = "async-loading-overlay";
    el.hidden = true;
    el.setAttribute("aria-live", "polite");
    el.setAttribute("aria-busy", "false");
    el.innerHTML = [
      '<div class="async-loading-card" role="alertdialog" aria-modal="true">',
      '<div class="async-loading-label" data-async-loading-label>Loading conversation...</div>',
      '<div class="async-loading-title" data-async-loading-title>Preparing replay</div>',
      '<div class="async-loading-subtitle" data-async-loading-subtitle>Opening Day 9...</div>',
      '<div class="async-loading-progress" aria-hidden="true"><span class="async-loading-dot"></span><span class="async-loading-dot"></span><span class="async-loading-dot"></span><span class="async-loading-dot"></span></div>',
      '<div class="async-loading-actions"><button class="async-loading-close" type="button" data-async-loading-close>Close</button></div>',
      "</div>"
    ].join("");
    document.body.appendChild(el);
    el.querySelector("[data-async-loading-close]").addEventListener("click", function () {
      hide("close");
    });
    return el;
  }

  function setText(el, selector, value) {
    var node = el.querySelector(selector);
    if (node) node.textContent = String(value || "");
  }

  function rememberEvent(type, detail) {
    var payload = {
      type: String(type || ""),
      at: Date.now(),
      detail: detail && typeof detail === "object" ? detail : {}
    };
    try { sessionStorage.setItem("async_loading_overlay_last_event_v1", JSON.stringify(payload)); } catch {}
    if (payload.type === "shown") {
      try { sessionStorage.setItem("async_loading_overlay_last_shown_v1", JSON.stringify(payload)); } catch {}
    }
    try { window.__asyncLoadingOverlayLastEvent = payload; } catch {}
    return payload;
  }

  function hide(reason) {
    if (!active) return false;
    var cur = active;
    active = null;
    if (cur.timeoutId) clearTimeout(cur.timeoutId);
    if (cur.rotateId) clearInterval(cur.rotateId);
    if (cur.errorHideId) clearTimeout(cur.errorHideId);
    var el = ensureRoot();
    el.classList.remove("is-visible", "async-loading-error");
    el.setAttribute("aria-busy", "false");
    rememberEvent("hidden", { reason: String(reason || "") });
    try {
      window.dispatchEvent(new CustomEvent("async-loading-overlay:hidden", { detail: { reason: String(reason || "") } }));
    } catch {}
    setTimeout(function () {
      if (active) return;
      el.hidden = true;
    }, 140);
    return true;
  }

  function update(opts) {
    if (!active) return false;
    opts = opts && typeof opts === "object" ? opts : {};
    var el = ensureRoot();
    if (opts.label != null) setText(el, "[data-async-loading-label]", opts.label);
    if (opts.title != null) setText(el, "[data-async-loading-title]", opts.title);
    if (opts.subtitle != null) setText(el, "[data-async-loading-subtitle]", opts.subtitle);
    return true;
  }

  function show(opts) {
    opts = opts && typeof opts === "object" ? opts : {};
    if (active) hide("replace");
    var el = ensureRoot();
    var messages = Array.isArray(opts.messages) && opts.messages.length
      ? opts.messages.map(function (msg) { return String(msg || "").trim(); }).filter(Boolean)
      : ["Preparing replay...", "Opening conversation...", "Loading messages..."];
    var title = String(opts.title || "Preparing replay").trim() || "Preparing replay";
    var label = String(opts.label || "Loading conversation...").trim() || "Loading conversation...";
    var subtitle = String(opts.subtitle || messages[0] || "Loading messages...").trim();
    active = {
      token: Date.now() + ":" + Math.random().toString(36).slice(2),
      timeoutId: null,
      rotateId: null,
      errorHideId: null,
      messages: messages,
      index: 0
    };
    el.hidden = false;
    el.classList.remove("async-loading-error");
    el.setAttribute("aria-busy", "true");
    update({ label: label, title: title, subtitle: subtitle });
    requestAnimationFrame(function () {
      el.classList.add("is-visible");
    });
    if (messages.length > 1) {
      active.rotateId = setInterval(function () {
        if (!active) return;
        active.index = (active.index + 1) % messages.length;
        update({ subtitle: messages[active.index] });
      }, Math.max(850, Number(opts.messageIntervalMs || 1300) || 1300));
    }
    var timeoutMs = Math.max(3000, Number(opts.timeoutMs || 15000) || 15000);
    active.timeoutId = setTimeout(function () {
      fail(String(opts.timeoutMessage || "Replay could not start. Please try again."));
    }, timeoutMs);
    var shownDetail = { label: label, title: title, subtitle: subtitle, source: String(opts.source || "") };
    rememberEvent("shown", shownDetail);
    try {
      window.dispatchEvent(new CustomEvent("async-loading-overlay:shown", {
        detail: shownDetail
      }));
    } catch {}
    return {
      hide: hide,
      update: update,
      success: function () { return hide("success"); },
      fail: fail
    };
  }

  function fail(message) {
    if (!active) {
      show({ title: "Unable to load", subtitle: message || "Replay could not start.", label: "Loading failed", timeoutMs: 5000 });
    }
    var cur = active;
    if (!cur) return false;
    if (cur.timeoutId) clearTimeout(cur.timeoutId);
    if (cur.rotateId) clearInterval(cur.rotateId);
    var el = ensureRoot();
    el.hidden = false;
    el.classList.add("is-visible", "async-loading-error");
    el.setAttribute("aria-busy", "false");
    update({
      label: "Loading failed",
      title: "Unable to load",
      subtitle: String(message || "Replay could not start. Please try again.")
    });
    rememberEvent("error", { message: String(message || "") });
    try {
      window.dispatchEvent(new CustomEvent("async-loading-overlay:error", { detail: { message: String(message || "") } }));
    } catch {}
    cur.errorHideId = setTimeout(function () {
      hide("error_timeout");
    }, 3200);
    return true;
  }

  window.addEventListener("scene:mounted", function () {
    if (!active) return;
    setTimeout(function () { hide("scene_mounted"); }, 80);
  });
  window.addEventListener("beforeunload", function () {
    if (active) hide("beforeunload");
  });

  window.AsyncLoadingOverlay = { __v: "2026-07-05-replay-loading-v1", show: show, hide: hide, update: update, fail: fail };
  window.Game = window.Game || {};
  window.Game.AsyncLoadingOverlay = window.AsyncLoadingOverlay;
})();
