// scripts/i18n.js
// Runtime translation helper. English story JSON stays the source of truth.
(function () {
  if (window.Game && window.Game.i18n && window.Game.i18n.__v) return;

  const Game = (window.Game ||= {});
  const STORAGE_KEY = "settings_language";
  const FALLBACK_LANGUAGE = "en";
  const RTL_LANGUAGES = new Set(["ar"]);

  const LANGUAGES = Object.freeze([
    { code: "en", label: "English" },
    { code: "fr", label: "Français" },
    { code: "es", label: "Español" },
    { code: "pt", label: "Português" },
    { code: "de", label: "Deutsch" },
    { code: "it", label: "Italiano" },
    { code: "ru", label: "\u0420\u0443\u0441\u0441\u043a\u0438\u0439" },
    { code: "zh-CN", label: "\u7b80\u4f53\u4e2d\u6587" },
    { code: "ja", label: "\u65e5\u672c\u8a9e" },
    { code: "ko", label: "\ud55c\uad6d\uc5b4" },
    { code: "hi", label: "\u0939\u093f\u0928\u094d\u0926\u0940" },
    { code: "ar", label: "\u0627\u0644\u0639\u0631\u0628\u064a\u0629" }
  ]);

  const LANGUAGE_CODES = new Set(LANGUAGES.map((row) => row.code));
  const dictionaries = Object.create(null);
  const pendingLoads = Object.create(null);
  const sourceIndexes = Object.create(null);
  const autoTextSources = new WeakMap();
  const autoTextTranslations = new WeakMap();
  const autoAttrSources = new WeakMap();
  const autoObserverState = { observer: null, scheduled: false };
  dictionaries.en = null;

  const ENGLISH_SOURCE_REPAIRS = Object.freeze(new Map([
    ["Je souhaite que \u00e7a te gartte sous ton platre", "I hope it itches under your cast"],
    ["Je souhaite que \u00e7a te gratte sous ton platre", "I hope it itches under your cast"],
    ["Je souhaite que \u00e7a te gratte sous ton pl\u00e2tre", "I hope it itches under your cast"],
    ["Je souhaite que \u00c3\u00a7a te gartte sous ton platre", "I hope it itches under your cast"],
    ["Your reply here can have effect dans un futur proche", "Your reply here can have effect in the near future"],
    ["Either way, ne te pr\u00e9ocupe pas autant de lui, vas juste travailler normalement", "Either way, don't worry about him that much, just work normally"],
    ["Either way, ne te pr\u00e9occupe pas autant de lui, vas juste travailler normalement", "Either way, don't worry about him that much, just work normally"],
    ["Either way, ne te pr\u00c3\u00a9ocupe pas autant de lui, vas juste travailler normalement", "Either way, don't worry about him that much, just work normally"],
    ["Either way, ne te pr\u00c3\u00a9occupe pas autant de lui, vas juste travailler normalement", "Either way, don't worry about him that much, just work normally"],
    ["Passe du bon temps avec tes collegues en meme temps", "Have a good time with your colleagues too"],
    ["At least i enjoy working with my collegues ", "At least I enjoy working with my colleagues"]
  ]));

  function normalizeEnglishSource(raw) {
    const source = String(raw ?? "");
    if (!source) return source;
    const exact = ENGLISH_SOURCE_REPAIRS.get(source);
    if (exact) return exact;
    const compact = source.replace(/\s+/g, " ").trim();
    return ENGLISH_SOURCE_REPAIRS.get(compact) || source;
  }

  function safeGetLS(key) { try { return localStorage.getItem(key); } catch { return null; } }
  function safeSetLS(key, value) { try { localStorage.setItem(key, String(value)); } catch {} }

  function normalizeLanguage(raw) {
    const value = String(raw || "").trim();
    if (LANGUAGE_CODES.has(value)) return value;
    const lower = value.toLowerCase();
    if (lower === "zh" || lower === "zh-cn" || lower === "zh_hans" || lower === "zh-hans") return "zh-CN";
    for (const code of LANGUAGE_CODES) {
      if (code.toLowerCase() === lower) return code;
    }
    return FALLBACK_LANGUAGE;
  }

  function getLanguage() {
    return normalizeLanguage(safeGetLS(STORAGE_KEY) || FALLBACK_LANGUAGE);
  }

  function isRtl(lang = getLanguage()) {
    return RTL_LANGUAGES.has(normalizeLanguage(lang));
  }

  function applyDirection(root) {
    const lang = getLanguage();
    const dir = isRtl(lang) ? "rtl" : "ltr";
    const doc = document.documentElement;
    if (doc) {
      doc.setAttribute("lang", lang);
      doc.setAttribute("dir", dir);
      doc.classList.toggle("i18n-rtl", dir === "rtl");
    }
    if (document.body) {
      document.body.setAttribute("dir", dir);
      document.body.classList.toggle("i18n-rtl", dir === "rtl");
    }
    const target = root && root.nodeType === 1 ? root : null;
    if (target) {
      target.setAttribute("dir", dir);
      target.classList.toggle("i18n-rtl", dir === "rtl");
    }
  }

  function setLanguage(raw) {
    const lang = normalizeLanguage(raw);
    safeSetLS(STORAGE_KEY, lang);
    applyDirection();
    const load = loadLanguage(lang);
    try {
      window.dispatchEvent(new CustomEvent("settings:changed", { detail: { language: lang } }));
      window.dispatchEvent(new CustomEvent("i18n:language-changed", { detail: { language: lang } }));
    } catch {}
    Promise.resolve(load).then(() => {
      try {
        applyTo(document);
        window.dispatchEvent(new CustomEvent("i18n:language-ready", { detail: { language: lang } }));
      } catch {}
    });
    return load;
  }

  async function loadLanguage(rawLang = getLanguage()) {
    const lang = normalizeLanguage(rawLang);
    if (lang === FALLBACK_LANGUAGE) return null;
    if (Object.prototype.hasOwnProperty.call(dictionaries, lang)) return dictionaries[lang];
    if (pendingLoads[lang]) return pendingLoads[lang];

    pendingLoads[lang] = (async () => {
      try {
        const res = await fetch(`translations/${encodeURIComponent(lang)}.json`, { cache: "no-store" });
        if (!res || !res.ok) throw new Error(`HTTP ${res ? res.status : "0"}`);
        const json = await res.json();
        dictionaries[lang] = (json && typeof json === "object") ? json : null;
        delete sourceIndexes[lang];
      } catch (err) {
        dictionaries[lang] = null;
        try {
          window.reportGameRuntimeEvent?.("translation-load-failed", {
            language: lang,
            message: String(err && err.message ? err.message : err)
          });
        } catch {}
        try { console.warn("[i18n] missing/invalid language file, falling back to English", lang, err); } catch {}
      } finally {
        delete pendingLoads[lang];
      }
      return dictionaries[lang];
    })();

    return pendingLoads[lang];
  }

  function normalizeStoryPath(raw) {
    return String(raw || "").trim().replace(/\\/g, "/");
  }

  function storyStepPath(stepPath, field) {
    const parts = String(stepPath || "")
      .split(".")
      .map((part) => part.trim())
      .filter(Boolean);
    let out = "steps";
    for (const part of parts) {
      if (/^\d+$/.test(part)) out += `[${part}]`;
      else out += `.${part}`;
    }
    return `${out}.${field}`;
  }

  function storyKey(storyPath, stepPath, field) {
    const path = normalizeStoryPath(storyPath);
    if (!path || stepPath == null || !field) return "";
    return `${path}::${storyStepPath(stepPath, field)}`;
  }

  function resolveEntry(dict, key) {
    if (!dict || typeof dict !== "object" || !key) return "";
    const entry = dict[key];
    if (typeof entry === "string") return entry.trim();
    if (!entry || typeof entry !== "object") return "";
    return String(entry.translation || entry.text || "").trim();
  }

  function resolveSourceEntry(dict, source) {
    if (!dict || typeof dict !== "object") return "";
    const wanted = String(source ?? "");
    if (!wanted) return "";
    const lang = Object.keys(dictionaries).find((code) => dictionaries[code] === dict) || "";
    if (lang && !sourceIndexes[lang]) {
      const index = new Map();
      for (const entry of Object.values(dict)) {
        if (typeof entry === "string") continue;
        if (!entry || typeof entry !== "object") continue;
        const entrySource = String(entry.source ?? "");
        const translated = String(entry.translation || entry.text || "").trim();
        if (entrySource && translated && !index.has(entrySource)) index.set(entrySource, translated);
      }
      sourceIndexes[lang] = index;
    }
    if (lang && sourceIndexes[lang]) return sourceIndexes[lang].get(wanted) || "";
    for (const entry of Object.values(dict)) {
      if (typeof entry === "string") continue;
      if (!entry || typeof entry !== "object") continue;
      if (String(entry.source ?? "") !== wanted) continue;
      const translated = String(entry.translation || entry.text || "").trim();
      if (translated) return translated;
    }
    return "";
  }

  function isUsefulAutoSource(value) {
    const text = String(value ?? "");
    const compact = text.replace(/\s+/g, " ").trim();
    if (!compact) return false;
    if (compact.length < 2) return false;
    if (!/[A-Za-z]/.test(compact)) return false;
    if (/^[\d\s.,:;!?()[\]{}+\-/*%$€£#@|]+$/.test(compact)) return false;
    if (/^(assets|story|scripts|scenes|translations|tools)\//i.test(compact)) return false;
    if (/\.(png|jpe?g|gif|webp|mp3|wav|ogg|mp4|webm|json|html|js|css)$/i.test(compact)) return false;
    return true;
  }

  function shouldSkipAutoElement(element) {
    if (!element || element.nodeType !== 1) return false;
    const tag = String(element.tagName || "").toUpperCase();
    return tag === "SCRIPT" || tag === "STYLE" || tag === "TEMPLATE" || tag === "NOSCRIPT" || tag === "SVG" || tag === "CANVAS";
  }

  function translateAutoTextNode(node) {
    if (!node || node.nodeType !== 3) return;
    const parent = node.parentElement;
    if (shouldSkipAutoElement(parent)) return;
    if (parent && parent.closest?.('[data-i18n], [translate="no"]')) return;
    const current = String(node.nodeValue ?? "");
    const compactCurrent = current.replace(/\s+/g, " ").trim();
    if (!isUsefulAutoSource(compactCurrent) && !autoTextSources.has(node)) return;
    const previousTranslation = autoTextTranslations.get(node);
    if (!autoTextSources.has(node) || (previousTranslation != null && current !== previousTranslation)) {
      autoTextSources.set(node, compactCurrent);
    }
    const source = autoTextSources.get(node);
    if (!isUsefulAutoSource(source)) return;
    const translated = sourceText(source);
    autoTextTranslations.set(node, translated);
    if (current !== translated) node.nodeValue = translated;
  }

  function translateAutoAttribute(node, attr) {
    if (!node || node.nodeType !== 1 || shouldSkipAutoElement(node)) return;
    if (!node.hasAttribute(attr)) return;
    if (attr === "placeholder" && node.dataset?.i18nPlaceholder) return;
    if (attr === "title" && node.dataset?.i18nTitle) return;
    if (attr === "aria-label" && node.dataset?.i18nAriaLabel) return;
    const current = String(node.getAttribute(attr) ?? "");
    let record = autoAttrSources.get(node);
    if (!record) {
      record = Object.create(null);
      autoAttrSources.set(node, record);
    }
    const old = record[attr] || null;
    if (!old || (old.translated != null && current !== old.translated)) {
      record[attr] = { source: current, translated: current };
    }
    const source = record[attr].source;
    if (!isUsefulAutoSource(source)) return;
    const translated = sourceText(source);
    record[attr].translated = translated;
    if (current !== translated) node.setAttribute(attr, translated);
  }

  function applyAutoTo(root) {
    const target = root && root.nodeType === 1 ? root : document.body || document;
    if (target.nodeType === 3) {
      translateAutoTextNode(target);
      return;
    }
    if (target.nodeType !== 1 && target !== document) return;
    const elementRoot = target === document ? document.body : target;
    if (!elementRoot) return;

    if (elementRoot.nodeType === 1) {
      for (const attr of ["title", "aria-label", "placeholder", "alt"]) translateAutoAttribute(elementRoot, attr);
    }
    const walker = document.createTreeWalker(elementRoot, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || shouldSkipAutoElement(parent)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    for (const node of textNodes) translateAutoTextNode(node);
    elementRoot.querySelectorAll?.("[title],[aria-label],[placeholder],[alt]")?.forEach((node) => {
      for (const attr of ["title", "aria-label", "placeholder", "alt"]) translateAutoAttribute(node, attr);
    });
  }

  function t(key, source, lang = getLanguage()) {
    const fallback = normalizeEnglishSource(source);
    const normalized = normalizeLanguage(lang);
    if (!key || normalized === FALLBACK_LANGUAGE) return fallback;
    const dict = dictionaries[normalized];
    if (!Object.prototype.hasOwnProperty.call(dictionaries, normalized)) {
      loadLanguage(normalized);
      return fallback;
    }
    const translated = resolveEntry(dict, key);
    return translated || fallback;
  }

  function sourceText(source, lang = getLanguage()) {
    const fallback = normalizeEnglishSource(source);
    const normalized = normalizeLanguage(lang);
    if (normalized === FALLBACK_LANGUAGE) return fallback;
    const dict = dictionaries[normalized];
    if (!Object.prototype.hasOwnProperty.call(dictionaries, normalized)) {
      loadLanguage(normalized);
      return fallback;
    }
    return resolveSourceEntry(dict, fallback) || fallback;
  }

  function uiKey(rawKey) {
    const key = String(rawKey || "").trim();
    return key ? `ui.${key}` : "";
  }

  function ui(rawKey, source, lang = getLanguage()) {
    return t(uiKey(rawKey), source, lang);
  }

  function applyTo(root) {
    const target = root && root.nodeType === 1 ? root : document;
    applyDirection(target === document ? null : target);
    const nodes = [];
    if (target.nodeType === 1 && target.hasAttribute?.("data-i18n")) nodes.push(target);
    target.querySelectorAll?.("[data-i18n]")?.forEach((node) => nodes.push(node));
    for (const node of nodes) {
      const key = String(node.dataset.i18n || "").trim();
      if (node.dataset.i18nSource == null) {
        node.dataset.i18nSource = String(node.textContent ?? "");
      }
      const source = String(node.dataset.i18nSource ?? node.textContent ?? "");
      if (!key || !source) continue;
      node.textContent = ui(key, source);
    }
    const attrNodes = [];
    target.querySelectorAll?.("[data-i18n-placeholder],[data-i18n-title],[data-i18n-aria-label]")?.forEach((node) => attrNodes.push(node));
    for (const node of attrNodes) {
      const pairs = [
        ["placeholder", "i18nPlaceholder"],
        ["title", "i18nTitle"],
        ["aria-label", "i18nAriaLabel"]
      ];
      for (const [attr, dataName] of pairs) {
        const key = String(node.dataset[dataName] || "").trim();
        if (!key) continue;
        const sourceAttr = `data-i18n-${attr}-source`;
        if (!node.hasAttribute(sourceAttr)) {
          node.setAttribute(sourceAttr, String(node.getAttribute(attr) ?? ""));
        }
        const source = String(node.getAttribute(sourceAttr) ?? node.getAttribute(attr) ?? "");
        if (!source) continue;
        node.setAttribute(attr, ui(key, source));
      }
    }
    applyAutoTo(target);
  }

  function scheduleAutoApply(root) {
    if (autoObserverState.scheduled) return;
    autoObserverState.scheduled = true;
    const target = root && root.nodeType ? root : document;
    requestAnimationFrame(() => {
      autoObserverState.scheduled = false;
      try { applyTo(target === document ? document : target); } catch {}
    });
  }

  function startAutoObserver() {
    if (autoObserverState.observer || !document.body || typeof MutationObserver !== "function") return;
    autoObserverState.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList" && mutation.addedNodes && mutation.addedNodes.length) {
          scheduleAutoApply(document);
          return;
        }
        if (mutation.type === "characterData" || mutation.type === "attributes") {
          scheduleAutoApply(mutation.target && mutation.target.nodeType === 1 ? mutation.target : document);
          return;
        }
      }
    });
    autoObserverState.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["title", "aria-label", "placeholder", "alt"]
    });
  }

  async function tAsync(key, source, lang = getLanguage()) {
    const normalized = normalizeLanguage(lang);
    if (normalized !== FALLBACK_LANGUAGE) await loadLanguage(normalized);
    return t(key, source, normalized);
  }

  function storyText(storyPath, stepPath, field, source) {
    return t(storyKey(storyPath, stepPath, field), source);
  }

  const STRING_FIELDS = new Set([
    "text",
    "prompt",
    "promptText",
    "caption",
    "title",
    "message",
    "homePrompt",
    "notifyText",
    "notifyTitle",
    "button",
    "preview"
  ]);

  function cloneForTranslation(value) {
    if (Array.isArray(value)) return value.map(cloneForTranslation);
    if (value && typeof value === "object") {
      const out = {};
      for (const [key, child] of Object.entries(value)) out[key] = cloneForTranslation(child);
      return out;
    }
    return value;
  }

  function translateStep(step, storyPath, stepPath) {
    if (!step || typeof step !== "object") return;
    const meta = step.__i18n && typeof step.__i18n === "object" ? step.__i18n : {};

    for (const field of STRING_FIELDS) {
      if (typeof step[field] !== "string" || !step[field].trim()) continue;
      const key = storyKey(storyPath, stepPath, field);
      meta[field] = { key, source: step[field] };
      step[field] = t(key, step[field]);
    }
    if (Object.keys(meta).length) step.__i18n = meta;

    if (Array.isArray(step.messages)) {
      step.messages = step.messages.map((line, index) => {
        if (line && typeof line === "object" && !Array.isArray(line)) {
          translateStep(line, storyPath, `${stepPath}.messages.${index}`);
          return line;
        }
        if (typeof line !== "string" || !line.trim()) return line;
        return storyText(storyPath, `${stepPath}.messages.${index}`, "text", line);
      });
    }

    if (Array.isArray(step.evidences)) {
      step.evidences.forEach((evidence, index) => {
        if (!evidence || typeof evidence !== "object") return;
        for (const field of ["label", "title", "text", "time"]) {
          if (typeof evidence[field] !== "string" || !evidence[field].trim()) continue;
          const key = storyKey(storyPath, `${stepPath}.evidences.${index}`, field);
          evidence.__i18n = { ...(evidence.__i18n || {}), [field]: { key, source: evidence[field] } };
          evidence[field] = t(key, evidence[field]);
        }
      });
    }

    const options = Array.isArray(step.options) ? step.options : (Array.isArray(step.choices) ? step.choices : null);
    if (options) {
      options.forEach((option, index) => {
        if (!option || typeof option !== "object") return;
        if (typeof option.text === "string" && option.text.trim()) {
          const key = storyKey(storyPath, `${stepPath}.options.${index}`, "text");
          option.__i18n = { ...(option.__i18n || {}), text: { key, source: option.text } };
          option.text = t(key, option.text);
        }
      });
    }

    if (Array.isArray(step.then)) translateSteps(step.then, storyPath, `${stepPath}.then`);
    if (Array.isArray(step.else)) translateSteps(step.else, storyPath, `${stepPath}.else`);
    if (Array.isArray(step.steps)) translateSteps(step.steps, storyPath, `${stepPath}.steps`);
  }

  function translateSteps(steps, storyPath, prefix) {
    (Array.isArray(steps) ? steps : []).forEach((step, index) => {
      translateStep(step, storyPath, prefix ? `${prefix}.${index}` : String(index));
    });
  }

  async function translateStoryJson(json, storyPath) {
    if (!json || typeof json !== "object") return json;
    await loadLanguage();
    const out = cloneForTranslation(json);
    translateSteps(out.steps, storyPath, "");
    return out;
  }

  Game.i18n = {
    __v: "2026-05-01-story-dictionary-v1",
    storageKey: STORAGE_KEY,
    languages: LANGUAGES,
    fallbackLanguage: FALLBACK_LANGUAGE,
    normalizeLanguage,
    getLanguage,
    setLanguage,
    isRtl,
    applyDirection,
    loadLanguage,
    t,
    tAsync,
    storyKey,
    storyText,
    sourceText,
    normalizeEnglishSource,
    uiKey,
    ui,
    applyTo,
    applyAutoTo,
    translateStoryJson
  };

  applyDirection();
  loadLanguage();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      try {
        startAutoObserver();
        applyTo(document);
      } catch {}
    }, { once: true });
  } else {
    startAutoObserver();
    applyTo(document);
  }
  window.addEventListener("scene:mounted", (event) => {
    try {
      const root = document.getElementById("scene-root");
      applyTo(root);
    } catch {}
  });
  window.addEventListener("i18n:language-changed", () => {
    try { applyTo(document); } catch {}
  });
})();
