(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PlayerIdentity = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  const IDENTITY_KEY = "player_identity_v1";
  const CONFIRMATION_KEY = "player_name_setup_v1";
  const NAMETAG_KEY = "player_social_nametag_v1";
  const DEFAULT_NAME = "Theo";
  let waiting = null;
  let resolveWaiting = null;
  let dialog = null;
  let nametagDialog = null;

  function read(key) {
    try {
      const value = JSON.parse(root.localStorage.getItem(key));
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch { return {}; }
  }
  function normalizeName(value) {
    // Braces are story-template syntax, never part of a display-name token.
    return Array.from(String(value ?? "").replace(/[\u0000-\u001f\u007f{}]/g, " ").replace(/\s+/g, " ").trim()).slice(0, 24).join("").trim();
  }
  function entryName(value) {
    return normalizeName(typeof value === "string" ? value : value?.name || value?.displayName || value?.alias || "");
  }
  function getStoredName() {
    const identity = read(IDENTITY_KEY);
    return entryName(identity.player) || entryName(identity.contacts?.player) || entryName(identity.names?.player) || entryName(read("contact_names_v1").player);
  }
  function getName() { return getStoredName() || DEFAULT_NAME; }
  // Social identity belongs to the profile, like the player's name. Loading
  // an older story checkpoint must not revert a later nametag change.
  function getStoredNametag() {
    const record = read(NAMETAG_KEY);
    return record.version === 1 && typeof record.nametag === "string" ? normalizeName(record.nametag) : "";
  }
  function getNametag() { return getStoredNametag() || getName(); }
  function setNametag(value) {
    const nametag = normalizeName(value) || getName();
    let previous;
    try {
      previous = root.localStorage.getItem(NAMETAG_KEY);
      root.localStorage.setItem(NAMETAG_KEY, JSON.stringify({ version: 1, nametag }));
      if (getStoredNametag() !== nametag) throw new Error("PLAYER_NAMETAG_WRITE_FAILED");
    } catch (error) {
      try {
        if (previous === null) root.localStorage.removeItem(NAMETAG_KEY);
        else if (previous !== undefined) root.localStorage.setItem(NAMETAG_KEY, previous);
      } catch {}
      return { ok: false, error: String(error?.message || error) };
    }
    emit("social-identity:changed", { nametag });
    return { ok: true, nametag };
  }
  function isPending() {
    const name = getStoredName();
    const record = read(CONFIRMATION_KEY);
    return !name || record.version !== 1 || record.confirmed !== true || record.name !== name;
  }
  function ready() {
    if (!isPending()) return Promise.resolve(getName());
    if (!waiting) waiting = new Promise(resolve => { resolveWaiting = resolve; });
    return waiting;
  }
  function emit(event, detail) {
    try { root.dispatchEvent(new root.CustomEvent(event, { detail })); } catch {}
  }
  function finish(name) {
    if (dialog) { dialog.close(); dialog.remove(); dialog = null; }
    const resolve = resolveWaiting;
    waiting = null;
    resolveWaiting = null;
    if (resolve) resolve(name);
    emit("player-name:confirmed", { name });
  }
  function setName(value, options = {}) {
    const name = normalizeName(value) || DEFAULT_NAME;
    const confirmed = options.confirm === true || !isPending();
    const identity = read(IDENTITY_KEY);
    identity.player = name;
    // Existing profiles can use either of these containers. Keep their
    // player entry aligned so the Settings editor cannot revive an old name.
    for (const field of ["contacts", "names"]) {
      if (identity[field] && typeof identity[field] === "object" && !Array.isArray(identity[field])) identity[field].player = name;
    }
    let previousIdentity, previousConfirmation;
    try {
      previousIdentity = root.localStorage.getItem(IDENTITY_KEY);
      previousConfirmation = root.localStorage.getItem(CONFIRMATION_KEY);
      root.localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
      if (confirmed) root.localStorage.setItem(CONFIRMATION_KEY, JSON.stringify({ version: 1, confirmed: true, name }));
      if (getStoredName() !== name || (confirmed && isPending())) throw new Error("PLAYER_NAME_WRITE_FAILED");
    } catch (error) {
      // A failed second write must not claim that an unpersisted choice was
      // accepted. Keep the prompt open and retain the previous profile data.
      for (const [key, previous] of [[IDENTITY_KEY, previousIdentity], [CONFIRMATION_KEY, previousConfirmation]]) {
        if (previous === undefined) continue;
        try {
          if (previous === null) root.localStorage.removeItem(key);
          else root.localStorage.setItem(key, previous);
        } catch {}
      }
      return { ok: false, error: String(error?.message || error) };
    }
    emit("identity:changed", { key: "player", name });
    if (confirmed) finish(name);
    return { ok: true, name };
  }
  function confirm(value) { return setName(value, { confirm: true }); }
  function ui(key, fallback) { return root.Game?.i18n?.ui?.("player." + key, fallback) || fallback; }
  function translateNametagDialog() {
    if (!nametagDialog) return;
    const strings = {
      "player-nametag-title": ["nametag_edit", "Edit nametag"],
      "player-nametag-description": ["nametag_description", "This name appears on your OnlyFun and Snapgram comments. You can change it anytime."],
      "player-nametag-label": ["nametag_label", "Your nametag"],
      "player-nametag-save": ["nametag_save", "Save nametag"],
      "player-nametag-cancel": ["nametag_cancel", "Cancel"],
      "player-nametag-error": ["nametag_error", "Your nametag could not be saved. Please try again."]
    };
    for (const [id, [key, fallback]] of Object.entries(strings)) nametagDialog.querySelector("#" + id).textContent = ui(key, fallback);
  }
  function closeNametagEditor() {
    if (!nametagDialog) return;
    const closing = nametagDialog;
    nametagDialog = null;
    closing.close();
    closing.remove();
  }
  function showNametagEditor() {
    if (nametagDialog) { nametagDialog.querySelector("input").focus(); return; }
    nametagDialog = root.document.createElement("dialog");
    nametagDialog.id = "player-nametag-overlay";
    nametagDialog.setAttribute("aria-labelledby", "player-nametag-title");
    nametagDialog.setAttribute("aria-describedby", "player-nametag-description");
    nametagDialog.innerHTML = '<form><h2 id="player-nametag-title"></h2><p id="player-nametag-description"></p><label id="player-nametag-label" for="player-nametag-input"></label><input id="player-nametag-input" type="text" maxlength="48" dir="auto" autocomplete="off" autocapitalize="off" spellcheck="false"><p id="player-nametag-error" role="alert" hidden></p><div class="nametag-actions"><button id="player-nametag-cancel" type="button"></button><button id="player-nametag-save" type="submit"></button></div></form>';
    const input = nametagDialog.querySelector("input");
    input.value = getNametag();
    translateNametagDialog();
    nametagDialog.addEventListener("keydown", event => event.stopPropagation());
    nametagDialog.addEventListener("cancel", event => { event.preventDefault(); closeNametagEditor(); });
    nametagDialog.querySelector("#player-nametag-cancel").addEventListener("click", closeNametagEditor);
    nametagDialog.querySelector("form").addEventListener("submit", event => {
      event.preventDefault();
      if (setNametag(input.value).ok) closeNametagEditor();
      else { nametagDialog.querySelector("#player-nametag-error").hidden = false; input.focus(); }
    });
    root.document.body.appendChild(nametagDialog);
    nametagDialog.showModal();
    input.focus();
    input.select();
  }
  function bindNametagButton(button) {
    if (!button) return () => {};
    // An empty i18n key keeps user-entered names out of auto translation.
    button.setAttribute("data-i18n", "");
    const name = root.document.createElement("bdi");
    name.className = "social-nametag-name";
    name.dir = "auto";
    const icon = root.document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("focusable", "false");
    icon.classList.add("social-nametag-icon");
    icon.innerHTML = '<path d="m15 5 4 4M4 20l4.5-1L20 7.5a2.8 2.8 0 0 0-4-4L4.5 15Z"/>';
    button.replaceChildren(name, icon);
    const refresh = () => {
      name.textContent = getNametag();
      button.title = ui("nametag_edit", "Edit nametag");
      button.setAttribute("aria-label", button.title);
    };
    const events = ["identity:changed", "social-identity:changed", "i18n:language-ready"];
    events.forEach(event => root.addEventListener(event, refresh));
    button.addEventListener("click", showNametagEditor);
    refresh();
    return () => {
      events.forEach(event => root.removeEventListener(event, refresh));
      button.removeEventListener("click", showNametagEditor);
      closeNametagEditor();
    };
  }
  function translateDialog() {
    if (!dialog) return;
    const strings = {
      "player-name-title": ["name_setup_title", "What’s your name?"],
      "player-name-description": ["name_setup_description", "Choose your name, or confirm Theo to keep the default. You can change it later in Settings."],
      "player-name-label": ["name_setup_label", "Your name"],
      "player-name-confirm": ["name_setup_confirm", "Confirm name"],
      "player-name-error": ["name_setup_error", "Your name could not be saved. Please try again."]
    };
    for (const [id, [key, fallback]] of Object.entries(strings)) dialog.querySelector("#" + id).textContent = ui(key, fallback);
  }
  function ensureSetup() {
    if (!isPending()) return Promise.resolve(getName());
    const promise = ready();
    if (dialog) return promise;
    dialog = root.document.createElement("dialog");
    dialog.id = "player-name-overlay";
    dialog.setAttribute("aria-labelledby", "player-name-title");
    dialog.setAttribute("aria-describedby", "player-name-description");
    dialog.setAttribute("aria-modal", "true");
    dialog.innerHTML = '<form id="player-name-form"><div class="player-name-symbol" aria-hidden="true">✦</div><h1 id="player-name-title"></h1><p id="player-name-description"></p><label id="player-name-label" for="player-name-input"></label><input id="player-name-input" type="text" maxlength="48" autocomplete="off" autocapitalize="words" spellcheck="false"><p id="player-name-error" role="alert" hidden></p><button id="player-name-confirm" type="submit"></button></form>';
    const input = dialog.querySelector("#player-name-input");
    input.value = getName();
    input.placeholder = DEFAULT_NAME;
    translateDialog();
    // Acknowledging the default is an explicit submit, never Escape or an
    // outside click. Native modal focus also keeps the game underneath inert.
    dialog.addEventListener("cancel", event => event.preventDefault());
    dialog.addEventListener("keydown", event => { event.stopPropagation(); });
    dialog.querySelector("form").addEventListener("submit", event => {
      event.preventDefault();
      if (!confirm(input.value).ok) {
        dialog.querySelector("#player-name-error").hidden = false;
        input.focus();
      }
    });
    root.document.body.appendChild(dialog);
    dialog.showModal();
    input.focus();
    input.select();
    root.Game?.i18n?.loadLanguage?.().then(translateDialog).catch(() => {});
    return promise;
  }
  root.addEventListener?.("i18n:language-ready", translateDialog);
  root.addEventListener?.("i18n:language-ready", translateNametagDialog);
  return Object.freeze({ DEFAULT_NAME, IDENTITY_KEY, CONFIRMATION_KEY, NAMETAG_KEY, normalizeName, getStoredName, getName, isPending, ready, ensureSetup, setName, confirm, getStoredNametag, getNametag, setNametag, showNametagEditor, bindNametagButton });
});
