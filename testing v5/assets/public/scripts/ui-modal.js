// scripts/ui-modal.js
(function initUIModal() {
  "use strict";

  if (window.UIModal && window.UIModal.__v1) return;

  const HOST_ID = "modal-host";
  const STYLE_ID = "ui-modal-style-v1";
  let chain = Promise.resolve();

  function ensureHost() {
    let host = document.getElementById(HOST_ID);
    if (host) return host;
    host = document.createElement("div");
    host.id = HOST_ID;
    if (document.body) document.body.appendChild(host);
    return host;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #modal-host{
        position:fixed;
        inset:0;
        z-index:12000;
        pointer-events:none;
      }
      #modal-host .ui-modal-overlay{
        position:absolute;
        inset:0;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:16px;
        pointer-events:auto;
        background:
          radial-gradient(circle at top, rgba(4,6,18,0.68), rgba(3,5,16,0.92)),
          rgba(0,0,0,0.38);
        backdrop-filter: blur(3px);
      }
      #modal-host .ui-modal-card{
        width:min(360px, 92vw);
        padding:16px 14px 12px;
        border-radius:18px;
        background: rgba(8,10,14,0.66);
        border:1px solid rgba(245,248,255,0.18);
        box-shadow:0 24px 60px rgba(0,0,0,0.85);
        color:#f0f5ff;
      }
      #modal-host .ui-modal-title{
        font-size:15px;
        font-weight:800;
        margin:0 0 6px;
        letter-spacing:0.03em;
      }
      #modal-host .ui-modal-text{
        font-size:13px;
        line-height:1.42;
        margin:0;
        color:rgba(240,245,255,0.76);
        white-space:pre-wrap;
      }
      #modal-host .ui-modal-input{
        width:100%;
        margin-top:12px;
        padding:9px 10px;
        border-radius:12px;
        border:1px solid rgba(245,248,255,0.2);
        background:rgba(8,10,14,0.62);
        color:#f0f5ff;
        font-size:14px;
        outline:none;
        box-shadow: inset 0 0 0 1px rgba(0,0,0,0.24);
      }
      #modal-host .ui-modal-input:focus{
        border-color:rgba(245,248,255,0.42);
        box-shadow:
          inset 0 0 0 1px rgba(0,0,0,0.24),
          0 0 0 3px rgba(112,220,255,0.14);
      }
      #modal-host .ui-modal-actions{
        margin-top:12px;
        display:flex;
        justify-content:flex-end;
        gap:10px;
      }
      #modal-host .ui-modal-btn{
        border:none;
        border-radius:999px;
        padding:7px 12px;
        font-size:13px;
        font-weight:800;
        letter-spacing:0.03em;
        cursor:pointer;
        border:1px solid rgba(245,248,255,0.22);
        background:rgba(6,7,10,0.52);
        color:#f5f9ff;
      }
      #modal-host .ui-modal-btn:hover{
        filter:brightness(1.06);
        border-color:rgba(245,248,255,0.46);
      }
      #modal-host .ui-modal-btn:focus-visible{
        outline:2px solid rgba(245,248,255,0.52);
        outline-offset:2px;
      }
      #modal-host .ui-modal-btn.primary{
        background:rgba(102,180,255,0.22);
        border-color:rgba(102,180,255,0.62);
      }
    `;
    document.head.appendChild(style);
  }

  function play(id) {
    try { window.Game?.audio?.play?.(id, { category: "sfx" }); } catch {}
  }

  function toText(value, fallback) {
    const raw = String(value == null ? "" : value);
    const txt = raw.trim();
    if (txt) return txt;
    return String(fallback || "");
  }

  function focusableEls(root) {
    if (!root || !root.querySelectorAll) return [];
    const nodes = root.querySelectorAll(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
    );
    return Array.from(nodes).filter((el) => {
      if (!el || el.disabled) return false;
      if (el.getAttribute("aria-hidden") === "true") return false;
      const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
      if (style && (style.display === "none" || style.visibility === "hidden")) return false;
      return true;
    });
  }

  function enqueue(task) {
    const run = () => Promise.resolve().then(task);
    const next = chain.then(run, run);
    chain = next.catch(() => {});
    return next;
  }

  function openModal(kind, opts = {}) {
    return new Promise((resolve) => {
      const host = ensureHost();
      ensureStyle();

      const titleText = toText(opts.title, kind === "alert" ? "Notice" : "Confirm");
      const bodyText = toText(opts.text, "");
      const okText = toText(opts.okText, "OK");
      const cancelText = toText(opts.cancelText, "Cancel");
      const placeholder = String(opts.placeholder || "");
      const defaultValue = String(opts.defaultValue == null ? "" : opts.defaultValue);

      const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      let closed = false;

      const overlay = document.createElement("div");
      overlay.className = "ui-modal-overlay";

      const card = document.createElement("div");
      card.className = "ui-modal-card";
      card.setAttribute("role", "dialog");
      card.setAttribute("aria-modal", "true");

      const title = document.createElement("h2");
      title.className = "ui-modal-title";
      title.textContent = titleText;
      card.appendChild(title);

      const text = document.createElement("p");
      text.className = "ui-modal-text";
      text.textContent = bodyText;
      card.appendChild(text);

      let input = null;
      if (kind === "prompt") {
        input = document.createElement("input");
        input.className = "ui-modal-input";
        input.type = "text";
        input.placeholder = placeholder;
        input.value = defaultValue;
        input.setAttribute("autocomplete", "off");
        card.appendChild(input);
      }

      const actions = document.createElement("div");
      actions.className = "ui-modal-actions";

      let cancelBtn = null;
      if (kind !== "alert") {
        cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "ui-modal-btn";
        cancelBtn.textContent = cancelText;
        cancelBtn.setAttribute("data-no-tap", "1");
        actions.appendChild(cancelBtn);
      }

      const okBtn = document.createElement("button");
      okBtn.type = "button";
      okBtn.className = "ui-modal-btn primary";
      okBtn.textContent = okText;
      okBtn.setAttribute("data-no-tap", "1");
      actions.appendChild(okBtn);
      card.appendChild(actions);

      overlay.appendChild(card);
      host.appendChild(overlay);

      function cleanup() {
        try { window.removeEventListener("keydown", onKeyDown, true); } catch {}
        try { overlay.remove(); } catch {}
        if (previousActive && previousActive.focus) {
          setTimeout(() => {
            try { previousActive.focus(); } catch {}
          }, 0);
        }
      }

      function close(value) {
        if (closed) return;
        closed = true;
        cleanup();
        resolve(value);
      }

      function onOk() {
        play("ui_confirm");
        if (kind === "prompt") close(input ? input.value : "");
        else close(kind === "confirm" ? true : undefined);
      }

      function onCancel() {
        play("ui_cancel");
        if (kind === "confirm") close(false);
        else if (kind === "prompt") close(null);
      }

      function onEscape() {
        if (kind === "alert") onOk();
        else onCancel();
      }

      function onBackdrop() {
        if (kind === "alert") onOk();
        else onCancel();
      }

      function onKeyDown(event) {
        if (!host.contains(overlay)) return;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onEscape();
          return;
        }
        if (event.key !== "Tab") {
          if (kind === "prompt" && event.key === "Enter" && event.target === input) {
            event.preventDefault();
            event.stopPropagation();
            onOk();
          }
          return;
        }

        const list = focusableEls(card);
        if (!list.length) {
          event.preventDefault();
          return;
        }
        const first = list[0];
        const last = list[list.length - 1];
        const current = document.activeElement;
        const shift = !!event.shiftKey;

        if (shift && (current === first || !card.contains(current))) {
          event.preventDefault();
          last.focus();
          return;
        }
        if (!shift && (current === last || !card.contains(current))) {
          event.preventDefault();
          first.focus();
        }
      }

      okBtn.addEventListener("click", onOk);
      if (cancelBtn) cancelBtn.addEventListener("click", onCancel);
      overlay.addEventListener("click", (event) => {
        if (event.target !== overlay) return;
        onBackdrop();
      });
      window.addEventListener("keydown", onKeyDown, true);

      play("ui_tap");
      setTimeout(() => {
        if (input) {
          try { input.focus(); input.select(); } catch {}
          return;
        }
        try { okBtn.focus(); } catch {}
      }, 0);
    });
  }

  window.UIModal = {
    __v1: true,
    alert(opts = {}) {
      return enqueue(() => openModal("alert", opts).then(() => undefined));
    },
    confirm(opts = {}) {
      return enqueue(() => openModal("confirm", opts).then((v) => !!v));
    },
    prompt(opts = {}) {
      return enqueue(() => openModal("prompt", opts).then((v) => (v == null ? null : String(v))));
    }
  };
})();
