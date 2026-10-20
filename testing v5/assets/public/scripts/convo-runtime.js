// scripts/convo-runtime.js
// SIMPLE "real phone" runtime (OUTSIDE conversation):
// - Runs ONLY NPC prelude (before first player turn), pauses at first player-first step into pending_outbound_v1
// - Handles time cards (next_day / time_card)
// - Deferred chaining after goHome timecard via pending_chain_story_v1 (JSON-driven)
// - ✅ Supports SnapGram-only stories (no contactId) => runs IG steps normally
// - ✅ snapgram_gate -> chain starts ONLY after player viewed required IG items
//
// ✅ UNIVERSAL FIX:
// - Uses same contact_aliases_v1 registry as notify-adapter
// - Resolves contact ids through alias registry everywhere it matters
// - Learns alias from fromName/name when possible (safe)
//
// ✅ HAK PHOTO EVIDENCE:
// - Add JSON step: { "type":"hak_photo", "id":"evidence_01", "title":"EVIDENCE//01", "image":"...", "text":"..." }
// - Stores into localStorage["hak_photos_v1"] and bumps badge app_badges_v1.hak
// - Add JSON step: { "type":"hak_add_evidence", "profileId":"lena", "evidences":[{ "id":"...", "url":"..." }] }
//   Stores into localStorage["hak_evidence_v1"] (profile + evidence list, dedup by evidence id)
// - Add JSON step: { "type":"hak_overlay", "title":"HAK", "messages":["..."] }
//   Uses the global #hak-overlay queue from index.html and blocks until closed.
//
// ✅ DEV MESSAGE (DEMO END):
// - Add JSON step: { "type":"dev_message", "text":"...", "button":"( CONTINUE )", "goHome": true }
// - Uses global #dev-overlay from index.html (same idea as HAK)
//
// ✅ HAK GATE (like SnapGram gate):
// - Add JSON step: { "type":"hak_gate", "required":["evidence_01"], "startStory":"story/DEMO/demo_end.json" }
// - Triggers ONLY after required evidence is SEEN inside HAK (scene emits hak:seen)
//
// ✅ NEW: BRANCHING SUPPORT (for later use in conversation scene)
// - label: { "type":"label", "name":"some_label" }
// - goto : { "type":"goto",  "label":"some_label" }
// - choice (pause point in OUTSIDE runtime; can be processed if opts.allowPlayerTurns=true):
//   { "type":"choice", "key":"my_choice_1", "prompt":"...", "options":[ { "id":"a", "text":"...", "set":["route_a"], "goto":"label_a" } ] }
// - Logs choices into localStorage["choices_log_v1"]
// - Applies option.set as once_<flag>=1

(() => {
  if (window.ConvoRuntime && window.ConvoRuntime.__v === "2026-03-22-disabled-char-autoskip-v1") return;

  // -------------------------
  // Presentation vs semantic timer domains (workflow rule: "QA-fast mode
  // must never alter semantic lease age"). Captured at module load, which
  // always runs before any QA harness's timer clamp (installHooks()-style
  // monkey-patch of window.setTimeout) can install -- harnesses only patch
  // timers AFTER waiting for this file's runtime to already be ready. Any
  // wait that is a genuine retry/backoff/cooldown decision (canonical
  // commit retry spacing, lease-wait backoff, admission retry) must go
  // through NATIVE_SET_TIMEOUT/semanticRetryDelay so QA-fast presentation
  // mode -- which is allowed to compress authored/cosmetic delays only --
  // can never distort it. Plain `setTimeout` calls elsewhere in this file
  // (typing waits, cosmetic transition waits) are the presentation domain
  // and are meant to be compressible; presentationDelay() names that intent
  // for new code without requiring every existing call site to migrate.
  // See feature4-max-qa-efficiency-mode / feature4-day15-love-evelyn-lease-
  // unavailable-stall memory.
  // Guard against environments where `window` exists but doesn't carry its
  // own `setTimeout` property (e.g. run_qa_pipeline.js's minimal in-Node VM
  // mock `window`, which relies on the VM sandbox's bare global `setTimeout`
  // instead) -- `window.setTimeout.bind` would throw immediately at module
  // load there ("Cannot read properties of undefined (reading 'bind')"),
  // taking down every test that depends on convo-runtime.js loading at all.
  // Falls back to the bare global `setTimeout`, matching this file's
  // pre-fix behavior in exactly those environments; real browser/Electron
  // renderers always have window.setTimeout, so the QA-fast-immune capture
  // this exists for is unaffected there.
  const NATIVE_SET_TIMEOUT = (typeof window !== "undefined" && typeof window.setTimeout === "function")
    ? window.setTimeout.bind(window)
    : setTimeout;
  function presentationDelay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function semanticRetryDelay(ms) {
    return new Promise((resolve) => NATIVE_SET_TIMEOUT(resolve, ms));
  }

  // "player" (and the global-story lease sentinel, literal here rather than
  // referencing GLOBAL_STORY_LEASE_CONTACT_ID -- that const isn't declared
  // until later in this file and this set is used by top-level module
  // state, not only inside functions) are canonical ACTOR ids, not real
  // Messages/conversation-thread contacts. pendingStory.contactId /
  // execution.activeContactId legitimately read "player" while a story is
  // paused on a CHOICE (the player, not an NPC, is who must act next) --
  // see resumePendingResume's own use below and
  // feature4-day15-love-evelyn-lease-unavailable-stall memory for the live
  // repro (DAY15_02_EVELYN_EVENING_LOVE.json) that found this.
  const NON_CONTACT_ACTOR_IDS = new Set(["player", "__global_story__"]);

  // ==== Architecture invariant (feature4-day15-love-evelyn-lease-
  // unavailable-stall): four identity roles must always be tracked
  // SEPARATELY and never collapsed into one another --
  //   1. actor identity        -- who must act next (may legitimately be
  //                                "player", e.g. a pending choice)
  //   2. owning contact        -- the NPC (or "system"/"tutor") this
  //                                pendingStory/execution record belongs to
  //   3. story owner           -- the character a given story FILE belongs
  //                                to (StoryInterpreter.ownerFromPath)
  //   4. open conversation target -- which thread the renderer is
  //                                currently showing / about to navigate to
  // "player" may correctly answer (1). It must NEVER be used to answer
  // (2)/(3)/(4) unless a story is genuinely player-scoped (no such story
  // type exists in this game today -- every story belongs to an NPC/system
  // thread). Three call sites collapsed this distinction and produced the
  // original LEASE_UNAVAILABLE bug: the QA harness's own pending-resume
  // navigation heuristic, resumePendingResume()'s nav target, and
  // ensureCanonicalStoryLease()'s same-story reuse check (the last one
  // legitimately widens to accept the sentinel, but ONLY because
  // storyPathsEqual already proves it's role (1) on the SAME story already
  // answering role (2) correctly -- it never lets the sentinel answer (2)
  // on its own).
  //
  // assertRealContactIdentity() is the shared, soft (non-throwing)
  // enforcement primitive for roles (2)/(3)/(4): call it wherever a value
  // is about to be used as an owning-contact/story-owner/open-conversation
  // target, never where a value is legitimately just an actor. It reports
  // loudly (console.error, visible to QA console capture and to
  // GameStateEngine's own error channel if wired) but never throws --
  // a defensive tripwire must not be able to crash a real player's session
  // by itself. Exposed on window.ConvoRuntime so non-module scene scripts
  // (conversation.html et al) can call it too.
  function assertRealContactIdentity(candidateId, context = {}) {
    const normalized = String(candidateId || "").trim().toLowerCase();
    if (!normalized) {
      try { console.error("[Feature4][identity-invariant] empty/missing contact identity where a real owning contact was required", context); } catch {}
      return false;
    }
    if (NON_CONTACT_ACTOR_IDS.has(normalized)) {
      try { console.error("[Feature4][identity-invariant] actor sentinel used where a real owning-contact/story-owner/open-conversation identity was required", { candidateId, ...context }); } catch {}
      return false;
    }
    return true;
  }

  // -------------------------
  // Safe helpers
  // -------------------------
  function safeJsonParse(raw, fallback) {
    try { return JSON.parse(raw); } catch { return fallback; }
  }
  function safeGetLS(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function safeSetLS(k, v) { try { localStorage.setItem(k, v); } catch {} }
  function safeRemLS(k) { try { return localStorage.removeItem(k); } catch {} }
  function normalizeComparableText(raw) {
    return String(raw ?? "")
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n+/g, "\n")
      .trim();
  }

  const ROUTE_FOLDER_SET = new Set(["love", "nts", "ntr"]);
  const SELECTABLE_CHARACTER_IDS = Object.freeze(["evelyn", "hailey", "mason", "lena"]);
  const SELECTABLE_CHARACTER_ID_SET = new Set(SELECTABLE_CHARACTER_IDS);
  const PATH_INFERRED_CONTACT_OWNER_IDS = new Set([
    "aiden",
    "evelyn",
    "hailey",
    "lena",
    "mason"
  ]);
  const MAX_DISABLED_SKIP_CHAIN_HOPS = 64;

  function routeToken(raw) {
    return String(raw || "").trim().toLowerCase().replace(/\s+/g, "_");
  }

  function isCharacterStorageTruthy(rawValue) {
    const v = routeToken(rawValue);
    if (v === "1" || v === "true" || v === "on" || v === "yes" || v === "active") return true;
    return false;
  }

  function isSelectionMapTruthy(rawValue) {
    if (rawValue === true) return true;
    if (rawValue === false) return false;
    if (typeof rawValue === "number") return rawValue > 0;
    return isCharacterStorageTruthy(rawValue);
  }

  function addSelectedIdsFromValue(rawValue, selectedSet) {
    if (!selectedSet || typeof selectedSet.add !== "function") return false;
    const parsed = (typeof rawValue === "string") ? safeJsonParse(rawValue, null) : rawValue;
    let hasData = false;

    if (Array.isArray(parsed)) {
      hasData = true;
      for (const raw of parsed) {
        const id = routeToken(raw);
        if (!id || !SELECTABLE_CHARACTER_ID_SET.has(id)) continue;
        selectedSet.add(id);
      }
      return hasData;
    }

    if (parsed && typeof parsed === "object") {
      if (Array.isArray(parsed.selected)) {
        hasData = true;
        for (const raw of parsed.selected) {
          const id = routeToken(raw);
          if (!id || !SELECTABLE_CHARACTER_ID_SET.has(id)) continue;
          selectedSet.add(id);
        }
      }

      for (const [rawKey, rawMapValue] of Object.entries(parsed)) {
        const id = routeToken(rawKey);
        if (!id || !SELECTABLE_CHARACTER_ID_SET.has(id)) continue;
        hasData = true;
        if (isSelectionMapTruthy(rawMapValue)) selectedSet.add(id);
      }
    }

    return hasData;
  }

  function inferCharacterActiveFromSelection(rawId) {
    const cid = routeToken(rawId);
    if (!cid || !SELECTABLE_CHARACTER_ID_SET.has(cid)) return null;

    const selectedSet = new Set();
    let hasData = false;

    hasData = addSelectedIdsFromValue(safeGetLS("hak_targets_v1"), selectedSet) || hasData;
    hasData = addSelectedIdsFromValue(safeGetLS("hak_watchlist_v1"), selectedSet) || hasData;
    hasData = addSelectedIdsFromValue(safeGetLS("hak_watchlist_v1_selected"), selectedSet) || hasData;

    if (!hasData) return null;
    return selectedSet.has(cid);
  }

  // Measured live (CDP JS profiler, 50-click rapid-input burst): this
  // function alone accounted for ~700ms of self-time out of a 10.7s
  // window, because getState() deep-clones the ENTIRE multi-domain
  // canonical state just to read one small, rarely-changing array. Called
  // from shouldHideCharacterFromUI, itself called from 60+ sites across
  // the message/notification pipeline -- effectively every step of every
  // story walk pays a full-state-clone cost for this one check.
  // getWorldActiveCharacters() shallow-copies only world.activeCharacters.
  function canonicalActiveCharacterIds() {
    try {
      const engine = window.GameStateEngine;
      const list = typeof engine?.getWorldActiveCharacters === "function"
        ? engine.getWorldActiveCharacters()
        : engine?.getState?.()?.world?.activeCharacters;
      return Array.isArray(list) ? list : null;
    } catch {
      return null;
    }
  }

  function readCharacterActiveFlag(cid) {
    const canonical = canonicalActiveCharacterIds();
    if (canonical) return canonical.includes(cid);
    const v = safeGetLS(`active_character:${cid}`);
    if (v === null || v === undefined) {
      const inferred = inferCharacterActiveFromSelection(cid);
      if (typeof inferred === "boolean") return inferred;
      return true;
    }
    return isCharacterStorageTruthy(v);
  }

  function ensureGameCharacterActiveHelper() {
    const Game = (window.Game ||= {});
    if (typeof Game.isCharacterActive !== "function") {
      Game.isCharacterActive = function isCharacterActivePublic(rawId) {
        const cid = routeToken(rawId);
        if (!cid) return false;
        if (cid === "aiden") return true;
        return readCharacterActiveFlag(cid);
      };
    }
    if (typeof Game.shouldHideCharacterFromUI !== "function") {
      Game.shouldHideCharacterFromUI = function shouldHideCharacterFromUIPublic(rawId) {
        return shouldHideCharacterFromUI(rawId);
      };
    }
  }

  function isTransportOnlyStory(story) {
    if (String(story?.contactId || "").trim().toLowerCase() !== "tutor" || !Array.isArray(story.steps) || !story.steps.length) return false;
    let hasTransition = false;
    const walk = (steps) => steps.every(step => {
      if (step?.type === "start_story" && String(step.startStory || step.storyPath || step.story || "").trim()) {
        hasTransition = true;
        return true;
      }
      if (step?.type !== "if") return false;
      return walk(Array.isArray(step.then) ? step.then : []) && walk(Array.isArray(step.else) ? step.else : []);
    });
    return walk(story.steps) && hasTransition;
  }

  function isCharacterActive(rawId) {
    const cid = routeToken(rawId);
    if (!cid) return false;
    if (cid === "aiden") return true;
    return readCharacterActiveFlag(cid);
  }
  ensureGameCharacterActiveHelper();

  function shouldHideCharacterFromUI(rawId) {
    const cid = routeToken(rawId);
    if (!cid) return false;
    if (!SELECTABLE_CHARACTER_ID_SET.has(cid)) return false;
    return !isCharacterActive(cid);
  }

  function normalizeLockedRoute(rawRoute) {
    const v = routeToken(rawRoute);
    if (!v) return "";
    if (v === "love" || v.startsWith("love")) return "love";
    if (v === "nts" || v.startsWith("nts")) return "nts";
    if (v === "ntr" || v.startsWith("ntr")) return "ntr";
    return "";
  }

  function readCanonicalLockedRoute(characterId) {
    const cid = routeToken(characterId);
    if (!cid) return "";
    try {
      const engine = window.GameStateEngine;
      if (typeof engine?.getWorldRoute === "function") return normalizeLockedRoute(engine.getWorldRoute(cid));
      const world = engine?.getState?.()?.world || {};
      return normalizeLockedRoute(world.variables?.[`route_${cid}_locked_v1`] || world.routeLocks?.[cid] || world.routes?.[cid] || "");
    } catch {
      return "";
    }
  }

  function repairCanonicalRoutesFromChoiceLog() {
    const engine = window.GameStateEngine;
    if (!engine?.getState || !engine?.dispatch) return false;
    let state = engine.getState();
    const rows = Array.isArray(state.progression?.choicesLog) ? state.progression.choicesLog : [];
    let changed = false;
    for (const cid of ["lena", "hailey", "mason", "evelyn"]) {
      if (normalizeLockedRoute(state.world?.routes?.[cid] || state.world?.routeLocks?.[cid])) continue;
      const row = [...rows].reverse().find((entry) => {
        const key = canonicalId(entry?.choiceKey || entry?.key || "");
        return key.includes(cid) && key.includes("route_lock");
      });
      const route = normalizeLockedRoute(row?.optionId || row?.choiceId || row?.value || "");
      if (!route) continue;
      const result = engine.dispatch({
        type: "SET_ROUTE",
        commandId: `repair-route-from-choice:${state.playthrough?.id || state.sessionId}:${cid}:${route}`,
        expectedRevision: state.revision,
        payload: { contactId: cid, route }
      });
      if (!result?.ok && result?.status !== "DUPLICATE_COMMAND") continue;
      changed = true;
      state = engine.getState();
    }
    return changed;
  }

  function resolveRouteFolder(characterId, dayFolder) {
    const cid = routeToken(characterId);
    if (!cid) return "love";

    if (shouldHideCharacterFromUI(cid)) return "love";

    const lockedRoute = readCanonicalLockedRoute(cid) || normalizeLockedRoute(safeGetLS(`route_${cid}_locked_v1`));
    if (lockedRoute) return lockedRoute;
    return "love";
  }

  function toDisplayCharacterName(characterId) {
    const cid = routeToken(characterId);
    if (!cid) return "Unknown";
    return cid.split("_").filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
  }

  function buildRoutedStoryCandidates(path) {
    const normalized = normalizeStoryPath(path);
    const resolved = resolveCanonicalRouteStoryPath(normalized);
    const dayFolder = String(resolved.match(/(?:^|\/)DAY\d+(?=\/)/i)?.[0] || "").replace(/^\//, "").toUpperCase();
    const folder = String(resolved.match(/\/(love|ntr|nts)\//i)?.[1] || "").toLowerCase();
    const catalog = window.LogicalStoryRoutes || {};
    const logicalPath = catalog[normalized] ? normalized : Object.keys(catalog).find((key) => Object.values(catalog[key] || {}).includes(resolved));
    const characterId = String(window.LogicalStoryCatalog?.[logicalPath]?.ownerId || window.StoryInterpreter?.prototype?.ownerFromPath(resolved) || "");
    // Access checks, JSON loading and canonical admission must name the same
    // physical story. A failed canonical target never falls back across routes.
    return { candidates: [resolved], routeInfo: dayFolder && folder ? { dayFolder, characterId, folder } : null };
  }

  async function loadJson(path) {
    const resolved = buildRoutedStoryCandidates(path);
    const candidates = Array.isArray(resolved?.candidates) ? resolved.candidates : [String(path || "").trim()];
    const routeInfo = resolved?.routeInfo || null;

    if (routeInfo) {
      try {
        console.info(`[RouteResolver] ${routeInfo.dayFolder} ${toDisplayCharacterName(routeInfo.characterId)} → ${routeInfo.folder}`);
      } catch {}
    }

    for (const candidate of candidates) {
      let res = null;
      try {
        res = await fetch(candidate, { cache: "no-store" });
      } catch {
        continue;
      }
      if (!res || !res.ok) continue;
      const json = await res.json();
      try {
        if (window.Game?.i18n?.translateStoryJson) {
          return await window.Game.i18n.translateStoryJson(json, candidate);
        }
      } catch (err) {
        try { console.warn("[ConvoRuntime] i18n translation failed; using English", candidate, err); } catch {}
      }
      return json;
    }

    throw new Error(`Failed to load JSON: ${path}`);
  }

  function uiAlert(text, opts = {}) {
    const message = String(text || "").trim();
    if (!message) return Promise.resolve();
    const title = String(opts.title || "Notice");
    try {
      if (window.UIModal?.alert) {
        return Promise.resolve(window.UIModal.alert({ title, text: message }));
      }
    } catch {}
    try { window.showToast?.(message); } catch {}
    return Promise.resolve();
  }

  function getTextSpeedFactor() {
    const speed = (safeGetLS("settings_textSpeed") || "").toLowerCase();
    if (speed === "slow") return 1.35;
    if (speed === "fast") return 0.75;
    return 1.0;
  }
// -------------------------
// ✅ Templating helper (dynamic names, etc.)
// Uses Game.tpl() from your index baseline.
// -------------------------
  const CONTACT_NAMES_KEY = "contact_names_v1";
  const IDENTITY_KEY = "player_identity_v1";

  function nameToken(raw) {
    return String(raw || "").trim().toLowerCase().replace(/\s+/g, "_");
  }

  function prettyNameFromKey(raw) {
    const key = nameToken(raw);
    if (!key) return "Unknown";
    return key
      .split("_")
      .filter(Boolean)
      .map((w) => w ? (w[0].toUpperCase() + w.slice(1).toLowerCase()) : "")
      .join(" ");
  }

  function identityValueToName(v) {
    if (typeof v === "string") return v.trim();
    if (v && typeof v === "object") {
      return String(v.name || v.displayName || v.alias || "").trim();
    }
    return "";
  }

  function readIdentityAnyShape() {
    const parsed = safeJsonParse(safeGetLS(IDENTITY_KEY), null);
    return (parsed && typeof parsed === "object") ? parsed : null;
  }

  function getIdentityName(key) {
    const k = nameToken(key);
    if (!k) return "";

    const ident = readIdentityAnyShape();
    if (!ident) return "";

    const direct = identityValueToName(ident[k]);
    if (direct) return direct;

    const contacts = (ident.contacts && typeof ident.contacts === "object") ? ident.contacts : null;
    if (contacts) {
      const fromContacts = identityValueToName(contacts[k]);
      if (fromContacts) return fromContacts;
    }

    const names = (ident.names && typeof ident.names === "object") ? ident.names : null;
    if (names) {
      const fromNames = identityValueToName(names[k]);
      if (fromNames) return fromNames;
    }

    return "";
  }

  function getContactStoredName(key) {
    const k = nameToken(key);
    if (!k) return "";
    const parsed = safeJsonParse(safeGetLS(CONTACT_NAMES_KEY), {});
    if (!parsed || typeof parsed !== "object") return "";
    return identityValueToName(parsed[k]);
  }

  function resolveDisplayName(key, fallback = "") {
    const k = nameToken(key);
    const fb = String(fallback || "").trim();
    if (!k) return fb || "Unknown";

    const fromIdentity = getIdentityName(k);
    if (fromIdentity) return fromIdentity;

    const fromContacts = getContactStoredName(k);
    if (fromContacts) return fromContacts;

    return fb || prettyNameFromKey(k);
  }

  function replaceNameTags(raw) {
    return String(raw ?? "").replace(/\{\{\s*name:([^}]+)\s*\}\}/gi, (_, keyRaw) => {
      const key = nameToken(keyRaw);
      return resolveDisplayName(key, prettyNameFromKey(key));
    });
  }

  // ✅ {{status:key}} -- canonical, non-editable status/relationship label
  // (see scripts/contact-status.js). A SEPARATE tag from {{name:key}}: the
  // name tag must keep returning only the player's customName, never with a
  // status concatenated back onto it. Delegates to window.ContactStatus,
  // loaded early by index.html alongside every other shared identity module.
  function replaceStatusTags(raw) {
    return String(raw ?? "").replace(/\{\{\s*status:([^}]+)\s*\}\}/gi, (m, keyRaw) => {
      try {
        const out = window.ContactStatus?.getStatusLabel?.(keyRaw) || "";
        return out || m;
      } catch { return m; }
    });
  }

  function resolveStepDisplayName(stableId, rawName) {
    const fallback = String(replaceNameTags(rawName || "")).trim();
    return resolveDisplayName(stableId, fallback || prettyNameFromKey(stableId));
  }

  function tplText(s) {
    const raw = String(s ?? "");
    let out = raw;
    try {
      if (window.Game && typeof window.Game.tpl === "function") {
        out = window.Game.tpl(raw);
      }
    } catch {}
    // Game.tpl() above already resolves {{status:key}} when available;
    // replaceStatusTags is the same fallback role replaceNameTags already
    // plays below for {{name:key}} when Game.tpl was unavailable.
    return replaceNameTags(replaceStatusTags(out));
  }

  const CHAPTERS_KEY_V2 = "chapters_v2";
  const CHAPTERS_KEY_V1 = "chapters_v1";
  const CHAPTER_BRANCH_WINDOW = 8;

  function normalizeChapterTitle(raw) {
    const base = String(raw || "").replace(/\r\n?/g, "\n");
    const lines = base.split("\n").map((line) => line.replace(/\s+/g, " ").trim());

    let first = 0;
    let last = lines.length - 1;
    while (first <= last && !lines[first]) first++;
    while (last >= first && !lines[last]) last--;

    const kept = first <= last ? lines.slice(first, last + 1) : [];
    const joined = kept.join("\n").trim();
    return joined || "Chapter checkpoint";
  }

  function chapterDayLabelFromStoryPath(storyPath) {
    const raw = String(storyPath || "").trim();
    const m = raw.match(/[\\/](day)(\d+)[\\/]/i);
    if (!m) return "DAY ?";
    const dayNum = Number(m[2]);
    if (!Number.isFinite(dayNum) || dayNum <= 0) return "DAY ?";
    return `DAY ${Math.floor(dayNum)}`;
  }

  function chapterDayNumberFromStoryPath(storyPath) {
    const raw = String(storyPath || "").trim();
    const m = raw.match(/[\\/](day)(\d+)[\\/]/i);
    if (!m) return 0;
    const dayNum = Number(m[2]);
    return Number.isFinite(dayNum) && dayNum > 0 ? Math.floor(dayNum) : 0;
  }

  function normalizeExplicitChapterDayTitle(raw) {
    const text = String(raw || "").trim().replace(/\s+/g, " ");
    const m = text.match(/^day\s+(\d+)$/i);
    if (!m) return "";
    const dayNum = Number(m[1]);
    if (!Number.isFinite(dayNum) || dayNum <= 0) return "";
    return `DAY ${Math.floor(dayNum)}`;
  }

  function explicitChapterDayNumber(raw) {
    const title = normalizeExplicitChapterDayTitle(raw);
    if (!title) return 0;
    const m = title.match(/(\d+)/);
    const dayNum = Number(m?.[1] || 0);
    return Number.isFinite(dayNum) && dayNum > 0 ? Math.floor(dayNum) : 0;
  }

  function buildChapterCheckpointFromTransition({
    currentStoryPath,
    transitionTitle,
    targetStoryPath,
    fallbackStoryPath,
    allowSameDayExplicitDay,
    at
  } = {}) {
    const currentPath = normalizeStoryPath(currentStoryPath || "");
    const targetPath = normalizeStoryPath(targetStoryPath || fallbackStoryPath || "");
    const explicitTitle = normalizeExplicitChapterDayTitle(transitionTitle);
    const explicitDay = explicitChapterDayNumber(transitionTitle);
    const currentDay = chapterDayNumberFromStoryPath(currentPath);
    const targetDay = chapterDayNumberFromStoryPath(targetPath);
    const resolvedDay = targetDay || explicitDay;

    if (!targetPath || resolvedDay <= 0) return null;
    const allowSameDayDayLabel = !!allowSameDayExplicitDay && explicitDay > 0 && resolvedDay === currentDay;
    if (currentDay > 0 && resolvedDay <= currentDay && !allowSameDayDayLabel) return null;

    const chapterTitle = explicitTitle || chapterDayLabelFromStoryPath(targetPath);
    return {
      title: chapterTitle,
      storyPath: targetPath,
      startStory: targetPath,
      nextStory: targetPath,
      startIndex: 0,
      at: Number(at || Date.now()) || Date.now()
    };
  }

  function normalizeChapterNode(node, fallbackId) {
    const id = String(node?.id || fallbackId || "").trim();
    const storyPath = String(node?.storyPath || "").trim();
    if (!id || !storyPath) return null;

    const parentIdRaw = String(node?.parentId || "").trim();
    const normalized = {
      id,
      title: normalizeChapterTitle(node?.title),
      dayLabel: String(node?.dayLabel || chapterDayLabelFromStoryPath(storyPath)).trim() || chapterDayLabelFromStoryPath(storyPath),
      storyPath,
      startStory: String(node?.startStory || node?.nextStory || "").trim() || null,
      nextStory: String(node?.nextStory || node?.startStory || "").trim() || null,
      startIndex: Math.max(0, Number(node?.startIndex || 0) || 0),
      at: Number(node?.at || Date.now()) || Date.now(),
      slotId: String(node?.slotId || "").trim() || null,
      parentId: parentIdRaw || null,
      branchKey: String(node?.branchKey || "root").trim() || "root"
    };
    const proof = node?.pendingBoundary;
    if (proof?.version === 1 && String(proof.playthroughId || "").trim() && Number.isInteger(proof.playthroughGeneration) && proof.playthroughGeneration > 0 && Number.isInteger(proof.revision) && proof.revision >= 0 && String(proof.leaseId || "").trim()) {
      normalized.pendingBoundary = {version: 1, playthroughId: String(proof.playthroughId), playthroughGeneration: Number(proof.playthroughGeneration),
        revision: proof.revision, leaseId: String(proof.leaseId), storyId: String(proof.storyId || "")};
    }

    return normalized;
  }

  function chapterBoundaryProof(snapshot, storyPath, startIndex = 0) {
    const state = snapshot?.canonicalState, execution = state?.execution, cursor = execution?.cursor;
    const day = chapterDayNumberFromStoryPath(storyPath);
    if (!state || !day || state.world?.day !== day || startIndex !== 0 || !execution?.lease ||
        normalizeStoryPath(execution.activeStoryPath) !== normalizeStoryPath(storyPath) ||
        normalizeStoryPath(cursor?.storyPath) !== normalizeStoryPath(storyPath) || cursor?.rootIndex !== 0 ||
        cursor.branchPath?.length !== 0 || cursor.phase !== "ready_to_interpret" || cursor.pendingUserIntent || cursor.pendingPresentationAck ||
        !state.playthrough?.id || !Number.isInteger(state.playthrough.generation) || state.playthrough.generation <= 0 || !execution.lease.id || !Number.isInteger(state.revision)) return null;
    const sourceDay = row => Number(row?.gameTime?.day) || chapterDayNumberFromStoryPath(typeof row === "string" ? row : row?.storyPath || row?.sourceStoryPath || row?.storyId) || Number(String(row?.storyId || row || "").match(/^d(\d+)_/i)?.[1]) || 0;
    // A root cursor alone is not a day beginning after replay/reconstruction.
    // Require the absence of committed activity from this day as well.
    if (Object.values(state.conversations?.eventsByContact || {}).some(rows => Array.isArray(rows) && rows.some(row => sourceDay(row) === day)) ||
        [state.progression?.choiceReceipts, state.progression?.effectReceipts].some(receipts => Object.values(receipts || {}).some(row => sourceDay(row) === day)) ||
        [state.progression?.onceKeys, state.progression?.completedStoryIds].some(ids => (ids || []).some(id => sourceDay(id) === day))) return null;
    return {version: 1, playthroughId: state.playthrough.id, playthroughGeneration: Number(state.playthrough.generation),
      revision: state.revision, leaseId: String(execution.lease.id), storyId: String(execution.activeStoryId || "")};
  }

  function naturalChapterBoundaryReceipt(snapshot, proof) {
    const state = snapshot?.canonicalState, execution = state?.execution, day = Number(state?.world?.day);
    if (!proof || day < 2 || execution?.lease?.initializationToken ||
        Number(execution?.lease?.createdRevision) !== proof.revision) return null;
    const sourceDay = id => chapterDayNumberFromStoryPath(id) || Number(String(id || "").match(/^d(?:ay)?(\d+)_/i)?.[1]) ||
      Number(window.StoryAdmissionCatalog?.find(row => [row.id, row.onceKey, row.path].includes(id))?.day) || 0;
    // Saved snapshots compact receipt events. Read their exact command from
    // the engine's hydrated durable receipt authority, at the same revision.
    const receipts = Object.entries(state.progression?.commandReceipts || {}).filter(([, receipt]) => receipt?.nextRevision === proof.revision)
      .map(([commandId]) => window.GameStateEngine?.getCommandReceipt?.(commandId));
    return receipts.find(receipt => {
      if (receipt?.ok !== true || receipt.status !== "COMMITTED" || receipt.nextRevision !== proof.revision ||
          !Array.isArray(receipt.events)) return false;
      const events = receipt.events;
      if (events.some(event => ["initialization:committed", "save:restored", "save:resumed", "playthrough:reset"].includes(event.type))) return false;
      return events.some(event => event.type === "world:day-changed" && Number(event.day) === day) &&
        events.some(event => event.type === "story:completed" && sourceDay(event.storyId) === day - 1 &&
          (state.progression?.completedStoryIds || []).includes(event.storyId)) &&
        events.some(event => event.type === "story:continuation-activated" && event.storyId === proof.storyId);
    }) || null;
  }

  function normalizeChaptersState(rawState) {
    const source = (rawState && typeof rawState === "object") ? rawState : {};
    const inputNodes = (source.nodes && typeof source.nodes === "object") ? source.nodes : {};
    const inputHeads = (source.heads && typeof source.heads === "object") ? source.heads : {};
    const nodes = {};
    const heads = {};

    Object.keys(inputNodes).forEach((rawId) => {
      const normalizedNode = normalizeChapterNode(inputNodes[rawId], rawId);
      if (!normalizedNode) return;
      nodes[normalizedNode.id] = normalizedNode;
    });

    Object.keys(inputHeads).forEach((rawBranchKey) => {
      const branchKey = String(rawBranchKey || "").trim();
      const headId = String(inputHeads[rawBranchKey] || "").trim();
      if (!branchKey || !headId || !nodes[headId]) return;
      heads[branchKey] = headId;
    });

    return { nodes, heads };
  }

  function migrateChaptersV1ToV2() {
    const legacy = safeJsonParse(safeGetLS(CHAPTERS_KEY_V1), null);
    if (!legacy || !Array.isArray(legacy.items) || !legacy.items.length) return null;

    const nodes = {};
    const heads = {};
    let previousId = null;

    const sorted = legacy.items.slice().sort((a, b) => (Number(a?.at || 0) || 0) - (Number(b?.at || 0) || 0));
    for (const item of sorted) {
      const storyPath = String(item?.storyPath || "").trim();
      const startIndex = Math.max(0, Number(item?.startIndex || 0) || 0);
      if (!storyPath) continue;

      const branchKey = "legacy";
      const id = `${storyPath}::${startIndex}::${branchKey}`;
      const normalizedNode = normalizeChapterNode({
        ...item,
        id,
        parentId: previousId,
        branchKey
      }, id);

      if (!normalizedNode) continue;
      nodes[id] = normalizedNode;
      previousId = id;
    }

    if (previousId) heads.legacy = previousId;
    return normalizeChaptersState({ nodes, heads });
  }

  function readChaptersState() {
    const parsedV2 = safeJsonParse(safeGetLS(CHAPTERS_KEY_V2), null);
    if (parsedV2 && typeof parsedV2 === "object") {
      const normalized = normalizeChaptersState(parsedV2);
      if (Object.keys(normalized.nodes).length || Object.keys(normalized.heads).length) return normalized;
    }

    const migrated = migrateChaptersV1ToV2();
    if (migrated) {
      writeChaptersState(migrated);
      return migrated;
    }

    return { nodes: {}, heads: {} };
  }

  function writeChaptersState(state) {
    const payload = normalizeChaptersState(state);
    safeSetLS(CHAPTERS_KEY_V2, JSON.stringify(payload));
    try { window.dispatchEvent(new Event("game:chapters-updated")); } catch {}
  }

  function chapterChoiceToken(raw) {
    return String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_.-]/g, "");
  }

  function buildChapterBranchKey(maxItems = CHAPTER_BRANCH_WINDOW) {
    const limit = Math.max(1, Number(maxItems || CHAPTER_BRANCH_WINDOW) || CHAPTER_BRANCH_WINDOW);
    const picks = getChoicesLog();

    const parts = picks
      .map((entry) => {
        const choiceKey = chapterChoiceToken(entry?.choiceKey || "");
        const optionId = chapterChoiceToken(entry?.optionId || "");
        if (!choiceKey || !optionId) return "";
        return `${choiceKey}:${optionId}`;
      })
      .filter(Boolean);

    // Recent dialogue choices converge again after a route lock. Keep the
    // complete choice identity and the saved route configuration even when
    // the readable tail no longer contains the Day 8 selection.
    const engine = window.GameStateEngine;
    const routes = ["lena", "hailey", "evelyn", "mason"].map(cid => `${cid}:${chapterChoiceToken(engine?.getWorldRoute?.(cid) || "")}`).join("|");
    const active = (engine?.getWorldActiveCharacters?.() || []).map(chapterChoiceToken).sort().join(",");
    const variant = chapterChoiceToken(engine?.getMasonVariantAuthority?.()?.variant || "");
    const history = parts.join("|");
    let hash = 2166136261;
    for (let i = 0; i < history.length; i++) { hash ^= history.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    const prefix = `routes:${routes};active:${active};mason:${variant};choices:${(hash >>> 0).toString(16)}:${history.length};`;
    const tail = parts.slice(-limit).join("|") || "root";
    return prefix + tail.slice(-Math.max(0, 320 - prefix.length));
  }

  async function upsertChapterCheckpoint({ title, storyPath, startStory, nextStory, startIndex, at, allowCompletedDayTransition = false }) {
    if (chapterTransitionIsFuture(title, {startStory: startStory || nextStory || storyPath})) {
      const engine = window.GameStateEngine;
      const state = allowCompletedDayTransition ? engine?.getStoryDecisionState?.() : null;
      const next = state && !state.execution?.lease ? window.ConditionGrammar?.getNextCanonicalStory?.(state, window.StoryAdmissionCatalog, {day: state.world?.day, service: window.GameTimeService}) : null;
      if (next?.status !== "DAY_COMPLETE") return null;
    }
    const chapterEngine = window.GameStateEngine, chapterIdentity = chapterEngine?.getRuntimeLifecycleIdentity?.();
    const chapterGeneration = Number(window.Game?.__chapterDayBoundaryGeneration || 0);
    const path = String(storyPath || "").trim();
    const indexNum = Number(startIndex);
    if (!path || !Number.isFinite(indexNum) || indexNum < 0) return null;

    const index = Math.max(0, Math.floor(indexNum));
    const branchKey = buildChapterBranchKey(CHAPTER_BRANCH_WINDOW);
    const id = `${path}::${index}::${branchKey}`;
    const now = Number(at || Date.now()) || Date.now();
    const chapterTitle = normalizeChapterTitle(title);
    const dayLabel = chapterDayLabelFromStoryPath(path);

    const state = readChaptersState();
    const nodes = { ...(state.nodes || {}) };
    const heads = { ...(state.heads || {}) };
    const existing = nodes[id] || null;

    let parentId = String(heads[branchKey] || "").trim() || null;
    if (parentId === id) parentId = String(existing?.parentId || "").trim() || null;

    let slotId = String(existing?.slotId || "").trim() || "";
    const ss = window.SaveSystem;
    let snapshot, captureError = null;
    try {
      // Capture before any asynchronous save readiness. Only small identity
      // scalars go into the synchronous index; no history is duplicated there.
      if (typeof ss?.captureSnapshot === "function") snapshot = ss.captureSnapshot({forceScene: "home"});
    } catch (err) { captureError = err; }
    const pendingBoundary = !slotId ? chapterBoundaryProof(snapshot, path, index) : null;
    const entry = {
      id,
      title: chapterTitle,
      dayLabel,
      storyPath: path,
      startStory: String(startStory || nextStory || "").trim() || null,
      nextStory: String(nextStory || startStory || "").trim() || null,
      startIndex: index,
      at: now,
      slotId: slotId || null,
      parentId,
      branchKey,
      ...(pendingBoundary ? {pendingBoundary} : {})
    };

    // The chapter index is the durable player-facing checkpoint. Persist it
    // before the asynchronous snapshot write: a day transition may navigate
    // or reload the document while SaveSystem is still opening IndexedDB.
    // Losing that race previously produced gaps such as DAY 1, DAY 2, DAY 4.
    nodes[id] = { ...(existing || {}), ...entry };
    heads[branchKey] = id;
    writeChaptersState({ nodes, heads });

    try {
      // Failed frozen capture must not fall back to capturing after ready,
      // when the same timeline may already contain later player events.
      if (captureError) throw captureError;
      if (ss && typeof ss.createChapterSlot === "function") {
        // Freeze the committed canonical authority before SaveSystem.ready
        // yields; a Load must never turn this old callback into a new save.
        const createdSlotId = await ss.createChapterSlot({
          chapterId: id,
          slotId,
          chapterTitle,
          dayLabel,
          storyPath: path,
          startIndex: index,
          forceScene: "home",
          snapshot,
          isCurrent: () => chapterLifecycleCurrent(chapterEngine, chapterIdentity, chapterGeneration)
        });
        if (String(createdSlotId || "").trim()) slotId = String(createdSlotId).trim();
      } else {
        console.warn("[Chapters] SaveSystem.createChapterSlot unavailable", { id, storyPath: path, startIndex: index });
      }
    } catch (err) {
      console.warn("[Chapters] unable to create chapter save slot", { id, storyPath: path, startIndex: index, err });
    }
    if (!chapterLifecycleCurrent(chapterEngine, chapterIdentity, chapterGeneration)) return null;
    if (slotId) {
      // Merge into the latest state rather than the pre-await copy, otherwise
      // two close day transitions can overwrite one another on completion.
      const latest = readChaptersState();
      if (latest.nodes?.[id]) {
        latest.nodes[id] = { ...latest.nodes[id], slotId };
        delete latest.nodes[id].pendingBoundary;
        writeChaptersState(latest);
      }
    }
    return readChaptersState().nodes?.[id] || nodes[id];
  }

  async function retryPendingChapterBoundary() {
    const engine = window.GameStateEngine, identity = engine?.getRuntimeLifecycleIdentity?.();
    const generation = Number(window.Game?.__chapterDayBoundaryGeneration || 0), ss = window.SaveSystem;
    if (!engine || !ss?.captureSnapshot || !ss?.createChapterSlot) return null;
    const indexed = Object.values(readChaptersState().nodes || {}), hasPending = indexed.some(node => node.pendingBoundary);
    const execution = engine.getExecutionState?.(), cursor = execution?.cursor;
    // A process can die after the natural day commit but before its first
    // index write. Keep ordinary boots cheap; only that untouched fresh lease
    // can seek persisted transition provenance without an indexed proof.
    const mayHaveUnindexedBoundary = !!execution?.lease && !execution.lease.initializationToken &&
      Number(execution.lease.createdRevision) === Number(engine.getRevision?.()) &&
      chapterDayNumberFromStoryPath(execution.activeStoryPath) === Number(engine.getWorldDay?.()) &&
      cursor?.rootIndex === 0 && cursor.branchPath?.length === 0 && cursor.phase === "ready_to_interpret";
    if (!hasPending && !mayHaveUnindexedBoundary) return null;
    await ss.ready;
    if (!chapterLifecycleCurrent(engine, identity, generation)) return null;
    const snapshot = ss.captureSnapshot({forceScene: "home"}), state = snapshot.canonicalState;
    const path = normalizeStoryPath(state.execution?.activeStoryPath), proof = chapterBoundaryProof(snapshot, path);
    if (!proof) return null;
    const branchKey = buildChapterBranchKey(CHAPTER_BRANCH_WINDOW), slots = (ss.getSlots?.() || []).filter(slot => slot.type === "chapter"), acquired = new Set(slots.map(slot => String(slot.id)));
    const node = Object.values(readChaptersState().nodes || {}).find(row => {
      const expected = row.pendingBoundary;
      return expected && row.branchKey === branchKey && normalizeStoryPath(row.storyPath) === path && !acquired.has(String(row.slotId || "")) &&
        ["playthroughId", "playthroughGeneration", "revision", "leaseId", "storyId"].every(key => expected[key] === proof[key]);
    });
    if (!node) {
      if (hasPending) return null;
      // Existing unproven legacy entries and already earned slots retain
      // their bytes. A fresh natural boundary can create its missing index,
      // but advanced state must never fill an earlier historical day.
      const id = `${path}::0::${branchKey}`;
      if (Object.values(readChaptersState().nodes || {}).some(row => row.branchKey === branchKey && normalizeStoryPath(row.storyPath) === path) ||
          slots.some(slot => slot.chapterId === id) || !naturalChapterBoundaryReceipt(snapshot, proof)) return null;
      return upsertChapterCheckpoint({title: "DAY " + state.world.day, storyPath: path, startStory: path, nextStory: path, startIndex: 0, at: Date.now()});
    }
    // A crash may occur after the slot commits but before its ID reaches the
    // index. Reattach that exact earned slot without rewriting its bytes.
    const committed = slots.find(slot => slot.chapterId === node.id && (() => {
      const savedProof = chapterBoundaryProof(slot.snapshot, path);
      return savedProof && ["playthroughId", "playthroughGeneration", "revision", "leaseId", "storyId"].every(key => savedProof[key] === proof[key]);
    })());
    if (committed) {
      const latest = readChaptersState();
      latest.nodes[node.id] = {...latest.nodes[node.id], slotId: committed.id};
      delete latest.nodes[node.id].pendingBoundary;
      writeChaptersState(latest);
      return latest.nodes[node.id];
    }
    // This is still the exact durable boundary that first queued this node.
    // Later gameplay, a Load, a different playthrough or an old index without
    // proof cannot manufacture an earlier day's choices/history.
    return upsertChapterCheckpoint({title: node.title, storyPath: path, startStory: path, nextStory: path, startIndex: 0, at: node.at});
  }

  function listChapters() {
    const state = readChaptersState();
    const items = Object.values(state.nodes || {});
    return items.sort((a, b) => (Number(b?.at || 0) || 0) - (Number(a?.at || 0) || 0));
  }

  // -------------------------
  // ✅ UNIVERSAL ALIAS REGISTRY (same key as notify-adapter)
  // -------------------------
  const ALIAS_KEY = "contact_aliases_v1";

  function normToken(s) {
    return String(s || "").trim().toLowerCase().replace(/\s+/g, "_");
  }

  function keyToken(raw) {
    return String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.-]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  // keep "canonicalId" name for internal ids
  const canonicalId = (raw) => normToken(raw);

  function readAliases() {
    const raw = safeGetLS(ALIAS_KEY);
    const obj = raw ? safeJsonParse(raw, {}) : {};
    return obj && typeof obj === "object" ? obj : {};
  }

  function writeAliases(obj) {
    safeSetLS(ALIAS_KEY, JSON.stringify(obj || {}));
  }

  function isBadAliasToken(nameToken) {
    const n = normToken(nameToken);
    if (!n) return true;
    if (n === "you" || n === "player" || n === "me") return true;
    if (n === "unknown" || n === "unk" || n === "???") return true;
    if (n === "system" || n === "messages") return true;
    return false;
  }

  function resolveContactId(rawId, providedName) {
    const base = normToken(rawId);
    if (!base) return "";

    const aliases = readAliases();

    if (aliases[base] && !isBadAliasToken(aliases[base])) return normToken(aliases[base]);

    const n = normToken(providedName);
    if (n && aliases[n] && !isBadAliasToken(aliases[n])) return normToken(aliases[n]);

    return base;
  }

  function learnAlias(stableId, displayName) {
    const id = normToken(stableId);
    const nameTok = normToken(displayName);

    if (!id || !nameTok || isBadAliasToken(id)) return;
    if (isBadAliasToken(nameTok)) return;
    if (nameTok === id) return;

    const aliases = readAliases();
    if (aliases[nameTok] && normToken(aliases[nameTok]) !== id) return;

    aliases[nameTok] = id;
    writeAliases(aliases);
  }

  // -------------------------
  // onceKey helpers (priority: conv_done_*==1 then once_*)
  // (do NOT apply contact aliasing here!)
  // -------------------------
  function convDoneIsTrueForOnceKey(onceKey) {
    const ok = canonicalId(onceKey);
    if (!ok) return false;
    const suffix = "_" + ok;

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (!k.startsWith("conv_done_")) continue;
        if (!k.endsWith(suffix)) continue;
        if (safeGetLS(k) === "1") return true;
      }
    } catch {}
    return false;
  }

  function hasAnyDay9RouteFlagSet() {
    const keys = [
      "route_evelyn_locked_v1",
      "route_mason_locked_v1",
      "route_hailey_locked_v1",
      "route_lena_locked_v1"
    ];
    for (const key of keys) {
      if (canonicalId(safeGetLS(key) || "")) return true;
    }
    return false;
  }

  function isNtsLikeRoute(raw) {
    const v = canonicalId(raw || "");
    return v === "nts" || v === "nts1" || v === "nts_coach";
  }

  function isLoveLikeRoute(raw) {
    const v = canonicalId(raw || "");
    return !v || v === "love";
  }

  function routeFlagFallbackMatchesDay9Lock(onceKey) {
    const key = canonicalId(onceKey);
    if (!key) return false;
    if (!hasAnyDay9RouteFlagSet()) return false;

    const evelynRoute = canonicalId(safeGetLS("route_evelyn_locked_v1") || "");
    const masonRoute = canonicalId(safeGetLS("route_mason_locked_v1") || "");
    const haileyRoute = canonicalId(safeGetLS("route_hailey_locked_v1") || "");

    if (key === "d8_route_day9_love_locked_v1") return isLoveLikeRoute(evelynRoute);
    if (key === "d8_route_day9_nts_locked_v1") return isNtsLikeRoute(evelynRoute);
    if (key === "d8_route_day9_ntr_locked_v1") return evelynRoute === "ntr";

    if (key === "d8_route_day9_mason_love_locked_v1") return isLoveLikeRoute(masonRoute);
    if (key === "d8_route_day9_mason_nts_coach_locked_v1") return isNtsLikeRoute(masonRoute);
    if (key === "d8_route_day9_mason_ntr_locked_v1") return masonRoute === "ntr";

    if (key === "d8_route_day9_hailey_love_locked_v1") return isLoveLikeRoute(haileyRoute);
    if (key === "d8_route_day9_hailey_nts1_locked_v1") return isNtsLikeRoute(haileyRoute);
    if (key === "d8_route_day9_hailey_ntr_locked_v1") return haileyRoute === "ntr";

    return false;
  }

  function canonicalOnceKeyDone(key) {
    try {
      const engine = window.GameStateEngine;
      if (typeof engine?.hasOnceKey === "function") return engine.hasOnceKey(key);
      const state = engine?.getGameplayState?.() || engine?.getState?.();
      const list = state?.progression?.onceKeys;
      return Array.isArray(list) && list.includes(key);
    } catch {
      return false;
    }
  }

  function onceDone(onceKey) {
    const key = canonicalId(onceKey);
    if (!key) return false;
    // The canonical decision includes false. Old completion mirrors cannot
    // resurrect a future story after a Load, or force a storage-key scan for
    // every prospective slot in a long playthrough.
    const engine = window.GameStateEngine;
    if (typeof engine?.hasOnceKey === "function") return engine.hasOnceKey(key);
    if (convDoneIsTrueForOnceKey(key)) return true;
    if (canonicalOnceKeyDone(key)) return true;
    if (safeGetLS("once_" + key) === "1" || safeGetLS("__once:" + key) === "1") return true;
    return routeFlagFallbackMatchesDay9Lock(key);
  }

  function markOnce(onceKey) {
    const key = canonicalId(onceKey);
    if (!key) return;
    const engine = window.GameStateEngine;
    if (!engine || typeof engine.dispatch !== "function") return;
    const state = engine.getGameplayState();
    engine.dispatch({
      type: "MARK_ONCE",
      commandId: `mark-once:${key}:${state.revision}`,
      expectedRevision: state.revision,
      payload: { key }
    });
  }

  const HAK_SKILLS_KEY = "hak_skills_v1";
  const SKILL_NTR_PASSIVE_INSIGHT = "ntr_passive_insight_v1";
  const SKILL_LOVE_GUIDED_RESPONSE = "love_guided_response_v1";
  const SKILL_LOVE_RISK_WARNING = "love_risk_warning_v1";
  const SKILL_NTS_AMBIGUITY_INDICATOR = "nts_ambiguity_indicator_v1";
  const SKILL_NTS_OPPORTUNITY_INDICATOR = "nts_opportunity_indicator_v1";
  const SKILL_NTR_ROUTE_REVEAL_V2 = "ntr_route_reveal_v2";
  const SKILL_NTS_ROUTE_REVEAL_V2 = "nts_route_reveal_v2";
  const SKILL_LOVE_ROUTE_REVEAL_V2 = "love_route_reveal_v2";
  const SKILL_NTR_EVIDENCE_ACCESS = "ntr_evidence_access";
  const SKILL_NTS_EVIDENCE_ACCESS = "nts_evidence_access";
  const SKILL_LOVE_EVIDENCE_ACCESS = "love_evidence_access";
  const LEGACY_SKILL_HAK_AUDIO_TRANSCRIPTION = "hak_audio_transcription_v1";
  const transcriptionSkillForBranch = (branch) => window.HakSkillDefinitions?.transcriptionSkillForBranch?.(branch) || "";
  const SKILL_ALIAS_TO_CANONICAL = Object.freeze({
    [SKILL_NTR_PASSIVE_INSIGHT]: SKILL_NTR_PASSIVE_INSIGHT,
    [SKILL_LOVE_GUIDED_RESPONSE]: SKILL_LOVE_RISK_WARNING,
    [SKILL_LOVE_RISK_WARNING]: SKILL_LOVE_RISK_WARNING,
    [SKILL_NTS_AMBIGUITY_INDICATOR]: SKILL_NTS_OPPORTUNITY_INDICATOR,
    [SKILL_NTS_OPPORTUNITY_INDICATOR]: SKILL_NTS_OPPORTUNITY_INDICATOR
  });
  const HAK_SKILL_PARENT_BY_SKILL = Object.freeze({
    [SKILL_NTR_ROUTE_REVEAL_V2]: SKILL_NTR_PASSIVE_INSIGHT,
    [SKILL_NTS_ROUTE_REVEAL_V2]: SKILL_NTS_OPPORTUNITY_INDICATOR,
    [SKILL_LOVE_ROUTE_REVEAL_V2]: SKILL_LOVE_RISK_WARNING,
    [SKILL_NTR_EVIDENCE_ACCESS]: SKILL_NTR_ROUTE_REVEAL_V2,
    [SKILL_NTS_EVIDENCE_ACCESS]: SKILL_NTS_ROUTE_REVEAL_V2,
    [SKILL_LOVE_EVIDENCE_ACCESS]: SKILL_LOVE_ROUTE_REVEAL_V2
  });
  const HAK_SKILL_CHILDREN_BY_PARENT = Object.freeze({
    [SKILL_NTR_PASSIVE_INSIGHT]: [SKILL_NTR_ROUTE_REVEAL_V2],
    [SKILL_NTR_ROUTE_REVEAL_V2]: [SKILL_NTR_EVIDENCE_ACCESS],
    [SKILL_NTS_OPPORTUNITY_INDICATOR]: [SKILL_NTS_ROUTE_REVEAL_V2],
    [SKILL_NTS_ROUTE_REVEAL_V2]: [SKILL_NTS_EVIDENCE_ACCESS],
    [SKILL_LOVE_RISK_WARNING]: [SKILL_LOVE_ROUTE_REVEAL_V2],
    [SKILL_LOVE_ROUTE_REVEAL_V2]: [SKILL_LOVE_EVIDENCE_ACCESS]
  });

  function canonicalSkillId(rawSkillId) {
    const sid = String(rawSkillId || "").trim();
    if (!sid) return "";
    return SKILL_ALIAS_TO_CANONICAL[sid] || sid;
  }

  function backfillHakSkillParents(unlocked) {
    const map = (unlocked && typeof unlocked === "object") ? unlocked : {};
    let changed = false;
    Object.keys(HAK_SKILL_PARENT_BY_SKILL).forEach((childId) => {
      const parentId = HAK_SKILL_PARENT_BY_SKILL[childId];
      if (!map[childId] || !parentId || map[parentId]) return;
      const at = Number(map[childId]?.at || 0) || Date.now();
      map[parentId] = { at: Math.max(1, Math.floor(at)) };
      changed = true;
    });
    return changed;
  }

  function normalizeHakSkillsStore(raw) {
    if (Array.isArray(raw)) {
      const unlocked = {};
      raw.map((x) => String(x || "").trim()).filter(Boolean).forEach((id) => {
        unlocked[id] = { at: Date.now() };
      });
      backfillHakSkillParents(unlocked);
      return { unlocked };
    }

    const base = (raw && typeof raw === "object") ? raw : {};
    const unlockedIn = (base.unlocked && typeof base.unlocked === "object") ? base.unlocked : {};
    const unlocked = {};
    Object.keys(unlockedIn).forEach((id) => {
      const sid = String(id || "").trim();
      if (!sid) return;
      const at = Number(unlockedIn[id]?.at || 0) || Date.now();
      unlocked[sid] = { at: Math.max(1, Math.floor(at)) };
    });
    backfillHakSkillParents(unlocked);
    return { unlocked };
  }

  function readHakSkillsStore() {
    const raw = safeGetLS(HAK_SKILLS_KEY);
    const parsed = raw ? safeJsonParse(raw, null) : null;
    return normalizeHakSkillsStore(parsed);
  }

  function skillIdsToCheck(skillId) {
    const raw = String(skillId || "").trim();
    const canonical = canonicalSkillId(raw);
    const ids = [canonical, raw];
    if (canonical === SKILL_LOVE_RISK_WARNING) ids.push(SKILL_LOVE_GUIDED_RESPONSE);
    if (canonical === SKILL_NTS_OPPORTUNITY_INDICATOR) ids.push(SKILL_NTS_AMBIGUITY_INDICATOR);
    const childByCanonical = HAK_SKILL_CHILDREN_BY_PARENT[canonical] || [];
    const childByRaw = HAK_SKILL_CHILDREN_BY_PARENT[raw] || [];
    ids.push(...childByCanonical, ...childByRaw);
    return ids.filter((v, i, arr) => v && arr.indexOf(v) === i);
  }

  function hasHakSkill(skillId) {
    const ids = skillIdsToCheck(skillId);
    if (!ids.length) return false;

    try {
      if (typeof window.Game?.hasSkill === "function") {
        return ids.some((sid) => window.Game.hasSkill(sid) === true);
      }
    } catch {}

    const unlocked = readHakSkillsStore().unlocked || {};
    return ids.some((sid) => !!unlocked[sid]);
  }

  function requiredSkillForHakHintKind(kind) {
    const k = canonicalId(kind);
    if (k === "ntr") return SKILL_NTR_PASSIVE_INSIGHT;
    if (k === "love") return SKILL_LOVE_RISK_WARNING;
    if (k === "nts") return SKILL_NTS_OPPORTUNITY_INDICATOR;
    return "";
  }

  const HAK_WATCHLIST_DEFAULT_KEY = "hak_watchlist_v1";
  const HAK_TARGETS_KEY = "hak_targets_v1";
  const HAK_SELECTION_DONE_KEY = "hak_character_selection_done_v1";
  const HAK_TUTORIAL_REQUIRED_KEY = "hak_tutorial_required";
  const HAK_TUTORIAL_DONE_KEY = "hak_app_tutorial_done";
  const HAK_CHARACTERS_CHOSEN_KEY = "hak_characters_chosen_v1";
  const HAK_SELECTION_CONFIG_KEY = "hak_character_selection_config_v1";
  const IF_DECISION_PREFIX = "conv_if_decisions_v1_";
  const HAK_AI_QUEUE_KEY = "hak_ai_queue_v1";
  const HOME_POP_APP_KEY = "home_pop_app_v1";
  const HAK_VISIBLE_KEY = "feature_hak_visible";
  const HAK_OPENABLE_KEY = "feature_hak_openable";
  const HAK_SELECTION_DONE_ALIASES = Object.freeze([
    HAK_SELECTION_DONE_KEY,
    "hak_characters_selected_v1",
    "hak_characters_selected",
    "hak_selection_done",
    "hak_selection_done_v1",
    "hak_onboarding_done",
    "hak_pick_done"
  ]);

  const DEFAULT_HAK_CHARACTER_TARGETS = Object.freeze([
    { id: "evelyn", label: "{{name:evelyn}}", avatar: "assets/avatars/evelyn.jpg" },
    { id: "hailey", label: "{{name:hailey}}", avatar: "assets/avatars/hailey.jpg" },
    { id: "mason",  label: "{{name:mason}}",  avatar: "assets/avatars/male_mason.jpg"  },
    { id: "lena",   label: "{{name:lena}}",   avatar: "assets/avatars/lena.jpg"   }
  ]);

  function ensureCharacterActiveDefaults(ids = []) {
    void ids;
    ensureGameCharacterActiveHelper();
  }

  function normalizeWatchlistKey(rawKey) {
    const key = String(rawKey || "").trim();
    return key || HAK_WATCHLIST_DEFAULT_KEY;
  }

  function normalizeWatchlistIds(input) {
    const arr = Array.isArray(input) ? input : [];
    const out = [];
    const seen = new Set();
    for (const raw of arr) {
      const id = canonicalId(raw);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  function sanitizeWatchlistSelectionForPatreon(input) {
    // HAK surveillance selects characters, not premium story ranges.
    // Story admission keeps enforcing the Lena Day 16-20 entitlement.
    return normalizeWatchlistIds(input);
  }

  function readWatchlistState(storeKey) {
    const key = normalizeWatchlistKey(storeKey);
    try {
      const hak = window.GameStateEngine?.getState?.()?.hak;
      if (hak?.watchlist?.configured) {
        return { selected: normalizeWatchlistIds(hak.watchlist.selected), updatedAt: 0, hasPersisted: true };
      }
    } catch {}
    const rawMain = safeGetLS(key);
    const parsedMain = rawMain ? safeJsonParse(rawMain, null) : null;

    if (Array.isArray(parsedMain)) {
      return {
        selected: normalizeWatchlistIds(parsedMain),
        updatedAt: Date.now(),
        hasPersisted: true
      };
    }

    if (parsedMain && typeof parsedMain === "object") {
      const selected = normalizeWatchlistIds(parsedMain.selected);
      const updatedAt = Number(parsedMain.updatedAt || Date.now()) || Date.now();
      return {
        selected,
        updatedAt,
        hasPersisted: true
      };
    }

    const rawSecondary = safeGetLS(key + "_selected");
    const parsedSecondary = rawSecondary ? safeJsonParse(rawSecondary, null) : null;
    if (Array.isArray(parsedSecondary)) {
      return {
        selected: normalizeWatchlistIds(parsedSecondary),
        updatedAt: Date.now(),
        hasPersisted: true
      };
    }

    return {
      selected: [],
      updatedAt: 0,
      hasPersisted: false
    };
  }

  function writeWatchlistState(storeKey, selectedIds) {
    const selected = sanitizeWatchlistSelectionForPatreon(selectedIds);
    return selected;
  }

  function emitWatchlistChanged(storeKey, selected) {
    const detail = {
      storeKey: normalizeWatchlistKey(storeKey),
      selected: normalizeWatchlistIds(selected)
    };
    try { sanitizeDisabledCharacterConversationState({ source: "hak_watchlist_changed" }); } catch {}
    try { window.StoryBus?.emit?.("hak:watchlistChanged", detail); } catch {}
    try {
      if (!window.StoryBus || typeof window.StoryBus.emit !== "function") {
        window.dispatchEvent(new CustomEvent("hak:watchlistChanged", { detail }));
      }
    } catch {}
  }

  function isIfDebugLogsEnabled() {
    return safeGetLS("debug_if_logs") === "1";
  }

  function ifDebugLog(eventName, detail) {
    if (!isIfDebugLogsEnabled()) return;
    try { console.info("[IFDebug] " + String(eventName || "event"), detail || {}); } catch {}
  }

  function listLocalStorageKeys() {
    const keys = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) keys.push(String(k));
      }
    } catch {}
    return keys;
  }

  function removeKeys(keys) {
    const removed = [];
    const unique = Array.from(new Set(Array.isArray(keys) ? keys.filter(Boolean).map(String) : []));
    for (const k of unique) {
      if (safeGetLS(k) == null) continue;
      safeRemLS(k);
      removed.push(k);
    }
    return removed;
  }

  function clearIfDecisionCacheKeys(opts = {}) {
    const cid = canonicalId(opts.contactId || "");
    const storyToken = keyToken(opts.storyToken || "");
    const keys = listLocalStorageKeys();
    const matched = [];

    for (const key of keys) {
      if (!String(key || "").startsWith(IF_DECISION_PREFIX)) continue;
      if (cid && !String(key).startsWith(`${IF_DECISION_PREFIX}${cid}_`)) continue;
      if (storyToken && !String(key).endsWith("_" + storyToken)) continue;
      matched.push(key);
    }

    return removeKeys(matched);
  }

  function buildDefaultHakCharacterSelectionStep() {
    return {
      type: "hak_watchlist",
      key: HAK_WATCHLIST_DEFAULT_KEY,
      storeKey: HAK_WATCHLIST_DEFAULT_KEY,
      revealApp: true,
      title: "HAK//SURVEILLANCE TARGETS",
      hint: "Select or deselect targets.",
      allowAll: true,
      allowNone: false,
      defaultSelected: DEFAULT_HAK_CHARACTER_TARGETS.map((t) => t.id),
      targets: DEFAULT_HAK_CHARACTER_TARGETS.map((t) => ({ ...t }))
    };
  }

  function normalizeHakCharacterSelectionStep(rawStep) {
    const base = buildDefaultHakCharacterSelectionStep();
    const hasSource = !!(rawStep && typeof rawStep === "object");
    const src = hasSource ? rawStep : {};
    const targets = normalizeWatchlistTargets(hasSource ? src.targets : base.targets);
    const hasAllowNone = Object.prototype.hasOwnProperty.call(src, "allowNone");
    const hasAllowAll = Object.prototype.hasOwnProperty.call(src, "allowAll");
    const hasRevealApp = Object.prototype.hasOwnProperty.call(src, "revealApp");
    const hasRevealHakApp = Object.prototype.hasOwnProperty.call(src, "revealHakApp");
    const hasDefaultSelected = Object.prototype.hasOwnProperty.call(src, "defaultSelected");
    const defaultSelected = normalizeWatchlistIds(
      hasDefaultSelected
        ? src.defaultSelected
        : (hasSource ? [] : base.defaultSelected)
    );
    const allowedDefault = new Set(targets.map((t) => t.id));
    const filteredDefaultSelected = defaultSelected.filter((id) => allowedDefault.has(id));

    return {
      ...base,
      ...src,
      key: String(src.key || src.storeKey || base.key || HAK_WATCHLIST_DEFAULT_KEY).trim() || HAK_WATCHLIST_DEFAULT_KEY,
      storeKey: String(src.storeKey || src.key || base.storeKey || HAK_WATCHLIST_DEFAULT_KEY).trim() || HAK_WATCHLIST_DEFAULT_KEY,
      title: String(src.title || base.title || "").trim() || base.title,
      hint: String(src.hint || base.hint || "").trim() || base.hint,
      allowAll: hasAllowAll ? (src.allowAll !== false) : (hasSource ? true : (base.allowAll !== false)),
      allowNone: hasAllowNone ? !!src.allowNone : (hasSource ? true : !!base.allowNone),
      revealApp: (hasRevealApp || hasRevealHakApp)
        ? (src.revealApp === true || src.revealHakApp === true)
        : (hasSource ? false : base.revealApp === true),
      targets: hasSource
        ? targets
        : (targets.length ? targets : normalizeWatchlistTargets(base.targets)),
      defaultSelected: hasSource
        ? filteredDefaultSelected
        : (filteredDefaultSelected.length ? filteredDefaultSelected : normalizeWatchlistIds(base.defaultSelected))
    };
  }

  function readStoredHakCharacterSelectionStep() {
    const raw = safeGetLS(HAK_SELECTION_CONFIG_KEY);
    const parsed = raw ? safeJsonParse(raw, null) : null;
    if (!parsed || typeof parsed !== "object") return null;
    const normalized = normalizeHakCharacterSelectionStep(parsed);
    if (!Array.isArray(normalized.targets) || normalized.targets.length === 0) return null;
    return normalized;
  }

  async function openHakCharacterSelection(opts = {}) {
    const sourceToken = canonicalId(opts?.source || "");
    const forceDefault = opts?.forceDefault === true || sourceToken === "settings_rechoose_hak";
    const fromStored = forceDefault ? null : readStoredHakCharacterSelectionStep();
    const sourceStep = (opts && typeof opts.step === "object") ? opts.step : null;
    const step = normalizeHakCharacterSelectionStep(sourceStep || fromStored || buildDefaultHakCharacterSelectionStep());
    const selected = await runHakWatchlist(step);
    const engine = window.GameStateEngine;
    if (!engine) return selected;
    const state = engine.getGameplayState();
    const interactionId = `hak-watchlist-ui:${state.playthrough?.id || "playthrough"}:${Date.now()}`;
    const targets = Object.fromEntries(normalizeWatchlistTargets(step.targets).map((target) => [target.id, selected.includes(target.id)]));
    const result = engine.dispatch({
      type: "SET_HAK_WATCHLIST",
      commandId: interactionId,
      expectedRevision: state.revision,
      payload: {
        operationId: interactionId,
        selected,
        targets,
        availableTargetIds: Object.keys(targets),
        allowNone: step.allowNone !== false,
        config: step,
        visible: step.revealApp === true || step.revealHakApp === true ? true : undefined
      }
    });
    if (!result.ok) throw new Error(`HAK watchlist commit failed: ${result.status}`);
    emitWatchlistChanged(step.storeKey, selected);
    return selected;
  }

  function getWatchlistSelection(storeKey = HAK_WATCHLIST_DEFAULT_KEY, fallbackDefaultSelected = []) {
    const state = readWatchlistState(storeKey);
    if (state.hasPersisted) return sanitizeWatchlistSelectionForPatreon(state.selected);
    return sanitizeWatchlistSelectionForPatreon(fallbackDefaultSelected);
  }

  function hasWatchlistSelection(storeKey = HAK_WATCHLIST_DEFAULT_KEY) {
    const key = normalizeWatchlistKey(storeKey);
    return safeGetLS(key) != null || safeGetLS(key + "_selected") != null;
  }

  function isWatchedInStore(id, storeKey = HAK_WATCHLIST_DEFAULT_KEY) {
    const wanted = canonicalId(id);
    if (!wanted) return false;
    const selected = getWatchlistSelection(storeKey, []);
    return selected.includes(wanted);
  }

  const HAK = (window.HAK ||= {});
  HAK.getWatchlist = function getWatchlistPublic(storeKey = HAK_WATCHLIST_DEFAULT_KEY, fallbackDefaultSelected = []) {
    return getWatchlistSelection(storeKey, fallbackDefaultSelected);
  };
  HAK.isWatched = function isWatchedPublic(id, storeKey = HAK_WATCHLIST_DEFAULT_KEY) {
    return isWatchedInStore(id, storeKey);
  };
  HAK.hasWatchlist = function hasWatchlistPublic(storeKey = HAK_WATCHLIST_DEFAULT_KEY) {
    return hasWatchlistSelection(storeKey);
  };

  function requirementsMet(requirementInput) {
    const isObj = !!requirementInput && typeof requirementInput === "object";
    const requireOnceKey = isObj ? requirementInput.requireOnceKey : requirementInput;

    if (requireOnceKey) {
      const parts = String(requireOnceKey)
        .split("|")
        .map((s) => canonicalId(s))
        .filter(Boolean);
      if (parts.length && !parts.some((k) => onceDone(k))) return false;
    }

    if (!isObj) return true;

    // Root-level admission gates use the same centralized condition grammar
    // as authored `if` steps, so route and active-character eligibility is
    // decided before a lease is requested and never by presentation state.
    const requireCondition = String(requirementInput.requireCondition || "").trim();
    if (requireCondition && !evalIfConditionExpr(requireCondition)) return false;

    const watchStoreKey = normalizeWatchlistKey(requirementInput.requireWatchedKey || HAK_WATCHLIST_DEFAULT_KEY);
    const requireWatched = canonicalId(requirementInput.requireWatched || "");
    const requireWatchedAny = normalizeWatchlistIds(requirementInput.requireWatchedAny);

    if (requireWatched && !isWatchedInStore(requireWatched, watchStoreKey)) return false;
    if (requireWatchedAny.length && !requireWatchedAny.some((id) => isWatchedInStore(id, watchStoreKey))) return false;

    return true;
  }

  // -------------------------
  // ✅ NEW: Choice logging + flag applying (used by conversation later)
  // -------------------------
  // Group 6 (protected-write elimination): canonical, ordered choice history
  // (progression.choicesLog via RECORD_CHOICE_LOG_ENTRY) -- not lease-gated,
  // same rationale as SET_CONTACT_PROGRESS (plain append-only bookkeeping,
  // not exclusive story state a differently-leased story could conflict with).
  function getChoicesLog() {
    const engine = window.GameStateEngine;
    if (!engine) return [];
    const log = engine.getGameplayState().progression.choicesLog;
    return Array.isArray(log) ? log : [];
  }

  function normalizePointsMap(points) {
    const out = { ntr: 0, nts: 0, love: 0 };
    if (!points || typeof points !== "object") return out;
    out.ntr = Number(points.ntr || 0) || 0;
    out.nts = Number(points.nts || 0) || 0;
    out.love = Number(points.love || 0) || 0;
    return out;
  }

  function logChoice({ key, picked, choiceKey, optionId, text, points, storyPath, storyOnceKey, contactId }) {
    const ck = String(choiceKey || key || "").trim();
    const oid = String(optionId || picked || "").trim();
    if (!ck || !oid) return;

    const engine = window.GameStateEngine;
    if (!engine) return;
    const s = engine.getGameplayState();
    engine.dispatch({
      type: "RECORD_CHOICE_LOG_ENTRY",
      commandId: `choice-log:${ck}:${oid}:${s.revision}`,
      expectedRevision: s.revision,
      payload: {
        at: Date.now(),
        contactId: canonicalId(contactId || ""),
        storyPath: String(storyPath || "").trim(),
        storyOnceKey: String(storyOnceKey || ""),
        choiceKey: ck,
        optionId: oid,
        text: String(text || ""),
        points: normalizePointsMap(points)
      }
    });
  }

  function applyChoiceSetFlags(option) {
    const set = Array.isArray(option?.set) ? option.set : [];
    for (const f of set) {
      const kk = canonicalId(f);
      if (!kk) continue;
      markOnce(kk);
    }
  }

  // Label index, built once per distinct steps array and reused across every
  // goto in that run instead of re-scanning on each lookup ("do not keep
  // linear scans in convo-runtime.js"). steps is mutated in place by if-branch
  // expansion (materializeIfStepsUpToIndex splices resolved branches into it
  // as the walk reaches them), so a label defined inside a not-yet-reached
  // branch genuinely does not exist in the array yet -- the cache key is the
  // array's own identity plus its current length, so a splice that changes
  // length invalidates the cache and the next lookup rebuilds it complete
  // with whatever labels are now materialized, rather than serving a stale
  // partial index or missing newly-spliced-in labels.
  const labelIndexCache = new WeakMap();
  function buildLabelIndex(steps) {
    const map = new Map();
    const duplicates = [];
    for (let idx = 0; idx < steps.length; idx++) {
      const s = steps[idx] || {};
      if (String(s.type || "").toLowerCase() !== "label") continue;
      const n = String(s.name || s.id || s.label || "").trim().toLowerCase();
      if (!n) continue;
      if (map.has(n)) duplicates.push({ label: n, firstIndex: map.get(n), duplicateIndex: idx });
      else map.set(n, idx);
    }
    if (duplicates.length) {
      try { console.error("[ERROR][label-index] duplicate label definitions in story runtime", { duplicates }); } catch {}
    }
    return { length: steps.length, map };
  }

  function jumpToLabelIndex(steps, labelName) {
    const name = String(labelName || "").trim();
    if (!name) return -1;
    const want = name.toLowerCase();
    let cached = labelIndexCache.get(steps);
    if (!cached || cached.length !== steps.length) {
      cached = buildLabelIndex(steps);
      labelIndexCache.set(steps, cached);
    }
    return cached.map.has(want) ? cached.map.get(want) : -1;
  }

  function cloneStoryStepsWithMeta(inputSteps, pathPrefix = "") {
    const src = Array.isArray(inputSteps) ? inputSteps : [];
    const out = [];

    for (let idx = 0; idx < src.length; idx++) {
      const raw = src[idx];
      if (!raw || typeof raw !== "object") continue;

      const path = pathPrefix ? `${pathPrefix}.${idx}` : String(idx);
      const step = { ...raw, __ifPath: path };

      if (Array.isArray(raw.then)) {
        step.then = cloneStoryStepsWithMeta(raw.then, `${path}.then`);
      }
      if (Array.isArray(raw.else)) {
        step.else = cloneStoryStepsWithMeta(raw.else, `${path}.else`);
      }

      out.push(step);
    }

    return out;
  }

  function readHakTargetsState() {
    try {
      const targets = window.GameStateEngine?.getState?.()?.hak?.watchlist?.targets;
      if (targets && typeof targets === "object" && !Array.isArray(targets)) return { ...targets };
    } catch {}
    const parsed = safeJsonParse(safeGetLS(HAK_TARGETS_KEY), {});
    return parsed && typeof parsed === "object" ? parsed : {};
  }

  function isHakTargetActive(rawTargetId) {
    const wanted = canonicalId(rawTargetId || "");
    if (!wanted) return false;

    const state = readHakTargetsState();
    if (!state || typeof state !== "object") return false;
    if (Object.prototype.hasOwnProperty.call(state, wanted)) return !!state[wanted];

    for (const [k, v] of Object.entries(state)) {
      if (canonicalId(k) === wanted) return !!v;
    }
    return false;
  }

  function isStoredTruthy(rawValue, expectedId = "") {
    const v = routeToken(rawValue);
    if (!v) return false;
    const expected = routeToken(expectedId);
    if (v === "1" || v === "true" || v === "yes" || v === "on" || v === "active") return true;
    if (expected && v === expected) return true;
    if (v === "0" || v === "false" || v === "no" || v === "off") return false;
    return true;
  }

  function wasChoicePicked(rawChoiceKey, rawOptionId) {
    const wantedChoice = chapterChoiceToken(rawChoiceKey);
    const wantedOption = chapterChoiceToken(rawOptionId);
    if (!wantedChoice || !wantedOption) return false;

    const rows = getChoicesLog();
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i] || {};
      const rowChoice = chapterChoiceToken(row.choiceKey || row.key || "");
      const rowOption = chapterChoiceToken(row.optionId || row.picked || "");
      if (rowChoice === wantedChoice && rowOption === wantedOption) return true;
    }
    return false;
  }

  function latestChoiceOptionId(rawChoiceKey) {
    const wantedChoice = chapterChoiceToken(rawChoiceKey);
    if (!wantedChoice) return "";

    const rows = getChoicesLog();
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i] || {};
      const rowChoice = chapterChoiceToken(row.choiceKey || row.key || "");
      if (rowChoice !== wantedChoice) continue;
      const rowOption = String(row.optionId || row.picked || "").trim();
      if (rowOption) return rowOption;
    }

    return "";
  }

  function normalizeMappedVariantMap(rawMap) {
    const src = (rawMap && typeof rawMap === "object") ? rawMap : null;
    const out = {};
    if (!src) return out;

    for (const [rawOptionId, rawImagePath] of Object.entries(src)) {
      const optionToken = chapterChoiceToken(rawOptionId);
      const imagePath = String(rawImagePath || "").trim();
      if (!optionToken || !imagePath) continue;
      out[optionToken] = imagePath;
    }
    return out;
  }

  function readMappedVariantFromStorage(rawStorageKey) {
    const storageKey = String(rawStorageKey || "").trim();
    if (!storageKey) return "";
    const stored = safeGetLS(storageKey);
    if (stored == null) return "";
    return String(stored || "").trim();
  }

  function resolveChoiceMappedImage(rawConfig, rawFallback = "") {
    const fallback = String(rawFallback || "").trim();
    const cfg = (rawConfig && typeof rawConfig === "object") ? rawConfig : null;
    if (!cfg) return fallback;

    const rawMap =
      (cfg.map && typeof cfg.map === "object") ? cfg.map :
      ((cfg.images && typeof cfg.images === "object") ? cfg.images : null);
    const mappedByOption = normalizeMappedVariantMap(rawMap);
    const fallbackImage = String(cfg.fallback || cfg.default || fallback).trim();
    if (!Object.keys(mappedByOption).length) return fallbackImage;

    const candidates = [];
    const explicitVariant = String(cfg.variant || cfg.optionId || cfg.value || "").trim();
    if (explicitVariant) candidates.push(explicitVariant);

    const storageVariant = readMappedVariantFromStorage(cfg.storageKey || cfg.storeKey || cfg.flagKey || "");
    if (storageVariant) candidates.push(storageVariant);

    const choiceKey = String(cfg.choiceKey || cfg.key || "").trim();
    if (choiceKey) {
      const pickedOption = latestChoiceOptionId(choiceKey);
      if (pickedOption) candidates.push(pickedOption);
    }

    for (const rawCandidate of candidates) {
      const token = chapterChoiceToken(rawCandidate);
      if (!token) continue;
      if (mappedByOption[token]) return mappedByOption[token];
    }

    return fallbackImage;
  }

  function resolveOnlyfunPostImage(step) {
    const s = step || {};
    const fallbackImage = String(s.image || s.url || s.photo || "").trim();
    const mapCfg =
      (s.imageVariant && typeof s.imageVariant === "object") ? s.imageVariant :
      (s.imageFromChoice && typeof s.imageFromChoice === "object") ? s.imageFromChoice :
      ((s.imageByChoice && typeof s.imageByChoice === "object") ? s.imageByChoice : null);

    if (!mapCfg) return fallbackImage;
    return resolveChoiceMappedImage(mapCfg, fallbackImage);
  }

  // Feature 4 / set_flag migration: generic (non-once/non-choice/non-route)
  // condition keys are exactly the domain set_flag now writes canonically to
  // (world.variables -- see commitCanonicalVariable). Canonical state is
  // checked first; a key absent there falls back to raw localStorage so
  // values written before this migration (or by any writer not yet routed
  // through commitCanonicalVariable) still resolve. Once every writer of a
  // given key is canonical, its legacy value simply stops being read because
  // the canonical map always has it -- no separate cutover flag needed.
  function readCanonicalStoryVariable(key) {
    try {
      const engine = window.GameStateEngine;
      const vars = engine?.getWorldVariables ? engine.getWorldVariables() : engine?.getState?.()?.world?.variables;
      if (vars && Object.prototype.hasOwnProperty.call(vars, key)) return { present: true, value: vars[key] };
    } catch {}
    return { present: false, value: undefined };
  }

  // Single shared grammar (scripts/engine/condition-grammar.js) -- this used
  // to be an independent parser/dispatcher, duplicated across this file,
  // conversation.html, and StoryInterpreter.condition(). That duplication is
  // exactly what let "all:"/"any:" compound conditions (real, shipped Day
  // 11/13/14 content) go unsupported everywhere until found by shadow
  // validation. Only the accessor below is specific to this runtime: canonical
  // state first, legacy localStorage fallback second, matching exactly what
  // this function did before the grammar was extracted (values written
  // before this migration, or by any writer not yet routed through
  // commitCanonicalVariable, still resolve).
  function liveConditionAccessor() {
    return {
      once: (k) => onceDone(k),
      activeCharacter: (k) => {
        const cid = canonicalId(k);
        return !!cid && isCharacterActive(cid);
      },
      choice: (key, optionId) => wasChoicePicked(key, optionId),
      hakTarget: (k) => isHakTargetActive(k),
      onlyfunSeen: (postId) => {
        const engine = window.GameStateEngine;
        if (typeof engine?.getOnlyfunPostSeen === 'function') return engine.getOnlyfunPostSeen(postId);
        const canonical = engine?.getState?.()?.onlyfun || engine?.getGameplayState?.()?.onlyfun;
        if (canonical) return canonical.seenPosts?.[postId] === true;
        try { return JSON.parse(safeGetLS("onlyfun_seen_posts_v1") || "{}")?.[postId] === true; } catch { return false; }
      },
      lookup: (k) => {
        const canonical = readCanonicalStoryVariable(k);
        if (canonical.present) return canonical.value;
        const routeMatch = String(k || "").match(/^route_([a-z0-9_]+)_locked_v1$/i);
        if (routeMatch) {
          const canonicalRoute = readCanonicalLockedRoute(routeMatch[1]);
          if (canonicalRoute) return canonicalRoute;
        }
        return safeGetLS(k);
      },
      isTruthy: (v, k) => isStoredTruthy(v, k),
      compareEquals: (stored, tail) => canonicalId(stored) === canonicalId(tail) || String(stored).trim() === tail
    };
  }

  function evalIfConditionExpr(rawExpr) {
    return window.ConditionGrammar.evaluateCondition(rawExpr, liveConditionAccessor());
  }

  function runtimeIfDecisionStoreKey(storyPath, storyJson, contactId) {
    const cid = canonicalId(contactId || "") || "global";
    const storyToken =
      canonicalId(storyJson?.onceKey || "") ||
      keyToken(storyPath || "") ||
      "story";
    return `${IF_DECISION_PREFIX}${cid}_${storyToken}`;
  }

  // Read-only: old-save compatibility for a decision map written before the
  // canonical branchReceipts migration existed. Nothing writes to this key
  // anymore (see resolveIfStepDecision).
  function readRuntimeIfDecisionMap(ctx) {
    const key = runtimeIfDecisionStoreKey(ctx?.storyPath, ctx?.storyJson, ctx?.contactId);
    const parsed = safeJsonParse(safeGetLS(key), {});
    return (parsed && typeof parsed === "object") ? parsed : {};
  }

  // Feature 4 / StoryInterpreter cutover, control-flow group: a branch
  // decision must be made exactly once per story position and then survive
  // save/load and relaunch even if the world state the condition originally
  // read has since changed -- otherwise resuming mid-story could silently
  // walk a different branch than the player actually saw. The canonical
  // receipt (progression.branchReceipts, RECORD_BRANCH_DECISION) is now the
  // primary record of that decision. The pre-existing per-story localStorage
  // cache below remains only as a fallback for the rare case the canonical
  // lease genuinely cannot be acquired (see ensureCanonicalStoryLease) --
  // not a second source of truth, and instrumented the same way every other
  // migrated step type's fallback is, so its use is measurable and expected
  // to be zero in practice.
  function makeBranchDecisionId(storyToken, token, condition) {
    return `${storyToken}|${token}|${String(condition || "").trim()}`;
  }

  function resolveIfStepDecision(step, ctx) {
    const token = keyToken(step?.__ifPath || step?.ifPath || "");
    if (!token) return !!evalIfConditionExpr(step?.condition || "");

    const engine = window.GameStateEngine;
    const storyToken = canonicalId(ctx?.storyJson?.onceKey || "") || keyToken(ctx?.storyPath || "") || "story";
    const condition = String(step?.condition || "");
    const branchId = makeBranchDecisionId(storyToken, token, condition);

    if (engine) {
      const existing = engine.getBranchDecisionReceipt
        ? engine.getBranchDecisionReceipt(branchId)
        : engine.getGameplayState().progression.branchReceipts[branchId];
      if (existing) return !!existing.result;

      const state = engine.getStoryDecisionState ? engine.getStoryDecisionState() : engine.getGameplayState();
      const legacyDecision = !!evalIfConditionExpr(condition);
      // StoryInterpreter's OWN condition() (same ConditionGrammar, same
      // conditionAccessor the canonical seam uses) is the decision SOURCE --
      // not just a shadow comparison against it. condition() is a pure,
      // synchronous read (no lease/dispatch), so this needs no async
      // boundary the way a real command commit would. Only a condition
      // domain that genuinely has no canonical home yet (hak_target: --
      // Group 5, throws CONDITION_NOT_YET_CANONICAL) falls back to the
      // legacy evaluator; every other domain (including choice:, canonical
      // since Group 2) is decided by the interpreter, matching the executed-
      // through-the-seam background case above where StoryInterpreter always
      // decides first. The legacy decision is still computed and compared so
      // a genuine divergence is still caught and logged, exactly like before.
      let interpreterDecision, notYetCanonical = false;
      try {
        interpreterDecision = window.CanonicalStoryRuntime?.shadowEvaluateCondition?.(condition, state);
        notYetCanonical = interpreterDecision && typeof interpreterDecision === "object" && interpreterDecision.__code === "CONDITION_NOT_YET_CANONICAL";
        window.CanonicalStoryRuntime?.recordShadowComparison?.({
          kind: "condition", storyPath: ctx?.storyPath, contactId: ctx?.contactId || null,
          sourceStepKey: token, expr: condition, mode: "background",
          legacyDecision, interpreterDecision, canonicalRevision: state.revision
        });
      } catch {}
      const decided = (interpreterDecision !== undefined && !notYetCanonical && typeof interpreterDecision !== "object")
        ? !!interpreterDecision
        : legacyDecision;
      // Resolving a display/resume projection must not freeze a decision
      // for an operation the interpreter has not reached.
      if (ctx?.projectionOnly === true) return decided;
      const committed = commitCanonicalBranchDecision({
        storyPath: ctx?.storyPath, contactId: ctx?.contactId || null,
        branchId, sourceStepKey: token, condition, result: decided, mode: "background"
      });
      if (committed.ok) return decided;
      // Canonical commit failed with the engine genuinely present -- proven
      // zero-frequency in production (see manual_if_branch_canonical_check.js's
      // zeroFallbackForIfStepType and the migration-diagnostics fallback
      // counters this file's own callers assert against). No silent legacy
      // write happens here anymore: only a pre-existing (old-save) entry may
      // still be read below; a genuinely new decision with no canonical
      // record is a "no silent write" no-op fall-through -- the caller
      // (executeCanonicalProgressionStep's result) is what actually decides
      // to pause the run, this just must not fabricate a NEW parallel record
      // of authority the canonical engine doesn't have.
      try { console.error("[ERROR][if-decision] canonical branch commit failed, no legacy write", { branchId, condition, status: committed.status, reason: committed.reason }); } catch {}
    }

    // Old-save compatibility only: a decision map written before this
    // migration existed. Never written to anymore (see above) -- read-only.
    const map = readRuntimeIfDecisionMap(ctx);
    if (Object.prototype.hasOwnProperty.call(map, token)) return !!map[token];
    return !!evalIfConditionExpr(String(step?.condition || ""));
  }

  function expandIfStepAt(steps, index, decisionCtx) {
    const step = steps[index];
    if (!step || String(step.type || "").toLowerCase() !== "if") return false;

    const chooseThen = resolveIfStepDecision(step, decisionCtx);
    const branch = chooseThen ? step.then : step.else;
    const branchSteps = Array.isArray(branch) ? branch.map((s) => ({ ...s })) : [];
    steps.splice(index, 1, ...branchSteps);
    // Truthy object (not a bare boolean) so the main runSteps loop can read
    // chooseThen/sourceStep back to mirror this decision onto the canonical
    // execution cursor without re-deciding it -- existing callers that only
    // check truthiness (materializeIfStepsUpToIndex, resolveFirstManualPlayerTurn)
    // are unaffected, since {} is truthy the same way `true` was.
    return { chooseThen, sourceStep: step };
  }

  function materializeIfStepsUpToIndex(steps, targetIndex, decisionCtx) {
    let cursor = 0;
    const limit = Math.max(0, Math.floor(Number(targetIndex || 0) || 0));
    let guard = 0;

    while (cursor < limit && cursor < steps.length) {
      if (guard++ > 50000) {
        try { console.warn("[ConvoRuntime][if] expansion guard tripped", { targetIndex: limit }); } catch {}
        break;
      }
      const step = steps[cursor];
      if (step && String(step.type || "").toLowerCase() === "if") {
        const expanded = expandIfStepAt(steps, cursor, { ...decisionCtx, projectionOnly: true });
        if (!expanded) cursor++;
        continue;
      }
      cursor++;
    }
  }

  // --- SnapGram events only (StoryBus is source of truth)
  function normalizeIgPayload(step, kind){
    const s = step || {};
    const onceKey = String(s.onceKey || "").trim();
    const id = String(s.id || onceKey || (kind + "_" + Date.now())).trim();
    const authorId = resolveContactId(
      s.authorId || s.fromId || s.contactId || s.user || s.authorName || "",
      s.authorName || s.user || s.fromName || ""
    );
    const authorName = resolveStepDisplayName(authorId || "snapgram", s.authorName || s.user || s.fromName || "");
    return {
      ...s,
      id,
      onceKey: onceKey || id,
      authorId: authorId || s.authorId || s.fromId || s.contactId || "",
      authorName,
      user: authorName
    };
  }

  function withCommittedIgTime(step, exec, storyPath) {
    const type = String(step?.type || "").toLowerCase();
    const postKey = String(step?.onceKey || step?.id || "");
    const event = exec?.result?.ok === true && exec.result.events?.find?.(row => row?.type === "story:effect-committed" && String(row.effectType || "").toLowerCase() === type && (!postKey || String(row.payload?.onceKey || row.payload?.id || "") === postKey));
    const stamp = window.GameTimeService?.normalizeStamp?.(event?.payload?.gameTime || event?.gameTime);
    return stamp ? { ...step, gameTime: stamp, storyPath } : { ...step, storyPath };
  }

  function writeIgPost(step) {
    const payload = normalizeIgPayload(step, "post");
    persistIgMediaToGallery(payload, "post");
    window.StoryBus?.emit?.("ig:post", payload);
  }

  function writeIgStory(step) {
    const payload = normalizeIgPayload(step, "story");
    persistIgMediaToGallery(payload, "story");
    window.StoryBus?.emit?.("ig:story", payload);
  }

  const GALLERY_GENERIC_OWNER_IDS = new Set(["", "unknown", "snapgram", "story", "post", "ig", "msg"]);

  function canonicalGalleryOwnerId(rawId, rawName = "") {
    const id = resolveContactId(rawId || "", rawName || "");
    const cid = canonicalId(id || "");
    if (cid === "player") return "mc";
    if (!cid || GALLERY_GENERIC_OWNER_IDS.has(cid)) return "";
    return cid;
  }

  function ownerIdFromGallerySource(rawSource) {
    const source = String(rawSource || "").trim().toLowerCase();
    if (!source) return "";
    if (source.startsWith("msg:")) return canonicalGalleryOwnerId(source.slice(4), "");
    if (source.startsWith("snapgram:")) return canonicalGalleryOwnerId(source.slice(9), "");
    if (source.startsWith("onlyfun:")) return canonicalGalleryOwnerId(source.slice(8), "");
    if (source.startsWith("hak:")) return canonicalGalleryOwnerId(source.slice(4), "");
    return canonicalGalleryOwnerId(source, "");
  }

  function normalizeGalleryPath(rawUrl) {
    return String(rawUrl || "")
      .trim()
      .toLowerCase()
      .replace(/\\/g, "/")
      .split("#")[0]
      .split("?")[0];
  }

  function isDefaultAvatarPath(rawUrl) {
    const url = normalizeGalleryPath(rawUrl);
    if (!url) return false;
    const normalized = "/" + url.replace(/^\/+/, "");
    return normalized.endsWith("/assets/avatars/default.jpg");
  }

  function isContactAvatarPath(rawUrl) {
    const url = normalizeGalleryPath(rawUrl);
    if (!url) return false;
    const normalized = "/" + url.replace(/^\/+/, "");
    return normalized.includes("/assets/avatars/") && !isDefaultAvatarPath(normalized);
  }

  function isGalleryExcludedImagePath(rawUrl) {
    const url = normalizeGalleryPath(rawUrl);
    if (!url) return false;
    const normalized = "/" + url.replace(/^\/+/, "");
    return (
      isDefaultAvatarPath(normalized) ||
      normalized.includes("/pictures/onlyfun/avatars/") ||
      normalized.includes("/onlyfun/avatars/")
    );
  }

  function normalizeGalleryPhotoEntry(photo, fallbackOwnerId = "", fallbackOwnerName = "") {
    const base = (photo && typeof photo === "object") ? { ...photo } : {};
    const ownerId = canonicalGalleryOwnerId(
      base.ownerId || base.owner || base.characterId || base.contactId || fallbackOwnerId || ownerIdFromGallerySource(base.src || ""),
      base.ownerName || base.characterName || base.contactName || fallbackOwnerName || ""
    );
    if (ownerId) {
      const ownerNameRaw = String(base.ownerName || base.characterName || base.contactName || fallbackOwnerName || "").trim();
      base.ownerId = ownerId;
      base.ownerName = resolveStepDisplayName(ownerId, ownerNameRaw);
    }
    return base;
  }

  function mergeGalleryOwnerMeta(existing, incoming) {
    const out = (existing && typeof existing === "object") ? { ...existing } : {};
    const nextOwnerId = canonicalGalleryOwnerId(incoming?.ownerId || incoming?.owner || "", incoming?.ownerName || "");
    if (!nextOwnerId) return out;

    const hasOwnerId = canonicalGalleryOwnerId(out.ownerId || out.owner || "", out.ownerName || "");
    if (!hasOwnerId) out.ownerId = nextOwnerId;

    const hasOwnerName = String(out.ownerName || out.characterName || out.contactName || "").trim();
    if (!hasOwnerName) {
      const nextName = String(incoming?.ownerName || "").trim() || resolveStepDisplayName(nextOwnerId, "");
      if (nextName) out.ownerName = nextName;
    }
    return out;
  }

  // ✅ gallery schema (matches scenes/pictures.html reference)
  function saveToGallery(photo) {
    if (window.Gallery && typeof window.Gallery.addPhoto === "function") {
      try { return window.Gallery.addPhoto(photo); } catch {}
    }
    const key = "gallery_photos";
    let arr = safeJsonParse(safeGetLS(key), []);
    if (!Array.isArray(arr)) arr = [];

    const normalizedPhoto = normalizeGalleryPhotoEntry(photo);
    const url = String(normalizedPhoto?.url || "").trim();
    if (!url) return;
    if (isGalleryExcludedImagePath(url)) return;

    const stableId = String(normalizedPhoto?.id || "").trim();
    let existingIdx = stableId
      ? arr.findIndex((p) => String(p?.id || "").trim() === stableId)
      : -1;
    if (existingIdx < 0) {
      existingIdx = arr.findIndex((p) => String(p?.url || "").trim() === url);
    }
    if (existingIdx >= 0) {
      const prev = arr[existingIdx];
      let merged = mergeGalleryOwnerMeta(prev, normalizedPhoto);
      if (stableId && String(merged?.url || "").trim() !== url) merged.url = url;
      if (stableId && !String(merged?.id || "").trim()) merged.id = stableId;
      ["type", "mediaType", "label", "title", "src", "source", "app", "onceKey", "characterId", "contactId", "kind", "route"].forEach((keyName) => {
        const incoming = normalizedPhoto?.[keyName];
        if (incoming == null || incoming === "") return;
        if (!String(merged?.[keyName] ?? "").trim() || keyName === "type" || keyName === "mediaType") {
          merged = { ...merged, [keyName]: incoming };
        }
      });
      const prevAt = Number(prev?.at || 0) || 0;
      const nextAt = Number(normalizedPhoto?.at || 0) || 0;
      if (nextAt > prevAt) merged.at = nextAt;
      const changed = JSON.stringify(prev) !== JSON.stringify(merged);
      if (changed) {
        arr[existingIdx] = merged;
        safeSetLS(key, JSON.stringify(arr));
        try { window.StoryBus?.emit?.("gallery:add", merged); } catch {}
        try { window.dispatchEvent?.(new CustomEvent("gallery:add", { detail: merged })); } catch {}
      }
      return;
    }

    arr.unshift(normalizedPhoto);
    safeSetLS(key, JSON.stringify(arr));
    try { window.StoryBus?.emit?.("gallery:add", normalizedPhoto); } catch {}
    try { window.dispatchEvent?.(new CustomEvent("gallery:add", { detail: normalizedPhoto })); } catch {}
    try { window.StoryBus?.emit?.("photo:new", normalizedPhoto); } catch {}
  }

  function persistIgMediaToGallery(payload, kind) {
    const rawUrl = String(payload?.image || payload?.photo || payload?.url || "").trim();
    if (!rawUrl) return;

    const stable = String(payload?.id || payload?.onceKey || "").trim();
    const ownerId = canonicalGalleryOwnerId(
      payload?.authorId || payload?.fromId || payload?.contactId || payload?.user || payload?.authorName || "",
      payload?.authorName || payload?.user || payload?.fromName || ""
    );
    const ownerName = ownerId
      ? resolveStepDisplayName(ownerId, payload?.authorName || payload?.user || payload?.fromName || "")
      : "";
    // Resolve to the actual Mason-variant-specific asset ONCE, now, at the
    // moment this media is earned -- matching every other Mason-variant
    // surface's own established resolveCharacterVariantImage() contract
    // (see scripts/mason-variant-service.js). A Snapgram/Instagram post's
    // authored `image` field is a single hardcoded path with no per-
    // variant branching in the story JSON itself (unlike route-specific
    // story content); Gallery persistence is the one place this earned
    // media's own durable identity gets fixed, so resolving here (not
    // later, not dynamically on read) is what keeps it stable even if the
    // player later changes/replays with a different Mason variant.
    const url = (typeof window.MasonVariantService?.resolveImage === "function")
      ? window.MasonVariantService.resolveImage(rawUrl, ownerId)
      : rawUrl;
    const photo = {
      id: stable ? ("ig_" + stable) : (crypto?.randomUUID ? crypto.randomUUID() : (`p_${Date.now()}_${Math.random().toString(16).slice(2)}`)),
      url,
      w: 0,
      h: 0,
      at: Date.now(),
      src: ownerId ? ("snapgram:" + ownerId) : ("snapgram:" + String(kind || "ig")),
      ownerId,
      ownerName
    };

    saveToGallery(photo);
  }

  function photoFromMessage(src, fromId) {
    const url = String(src || "").trim();
    const from = canonicalGalleryOwnerId(fromId, "") || "unknown";
    const ownerId = from !== "unknown" ? from : "";
    const ownerName = ownerId ? resolveStepDisplayName(ownerId, "") : "";
    if (!url) return null;

    return {
      id: (crypto?.randomUUID ? crypto.randomUUID() : (`p_${Date.now()}_${Math.random().toString(16).slice(2)}`)),
      url,
      w: 0,
      h: 0,
      at: Date.now(),
      src: `msg:${from}`,
      ownerId,
      ownerName
    };
  }

  function normalizeMessageLink(raw) {
    if (!raw || typeof raw !== "object") return null;
    const label = String(raw.label || "").trim();
    if (!label) return null;

    const appId = canonicalId(String(raw.appId || "").trim());
    const appName = String(raw.appName || "").trim();
    const icon = String(raw.icon || "").trim();
    const ms = Number(raw.downloadMs || 0);
    const downloadMs = (Number.isFinite(ms) && ms > 0) ? Math.round(ms) : 2400;

    return {
      label,
      appId,
      appName,
      icon,
      downloadMs,
      glitch: raw.glitch,
      onlyfunGate: (raw.onlyfunGate && typeof raw.onlyfunGate === "object")
        ? { ...raw.onlyfunGate }
        : null
    };
  }

  // -------------------------
  // ✅ HAK PHOTO / EVIDENCE STORE
  // -------------------------
  const HAK_PHOTOS_KEY = "hak_photos_v1";
  const HAK_EVIDENCE_KEY = "hak_evidence_v1";

  function getHakPhotos() {
    try {
      const photos = window.GameStateEngine?.getState?.()?.hak?.photos;
      if (Array.isArray(photos)) return photos;
    } catch {}
    const arr = safeJsonParse(safeGetLS(HAK_PHOTOS_KEY), []);
    return Array.isArray(arr) ? arr : [];
  }

  function setHakPhotos(arr) {
    void arr;
    throw new Error("HAK photos are canonical; renderer writes are disabled");
  }

  function defaultEvidenceProfileName(profileId) {
    const pid = canonicalId(profileId || "");
    if (!pid) return "Unknown";
    const resolved = resolveStepDisplayName(pid, "");
    return String(resolved || prettyNameFromKey(pid)).trim() || "Unknown";
  }

  function defaultEvidenceAvatar(profileId) {
    const pid = canonicalId(profileId || "");
    if (!pid) return "assets/avatars/default.jpg";
    return `assets/avatars/${pid}.jpg`;
  }

  const HAK_VIDEO_MEDIA_EXT_RE = /\.(mp4|webm|ogg|ogv|mov)(?:[?#].*)?$/i;
  const HAK_IMAGE_MEDIA_EXT_RE = /\.(jpe?g|png|webp|gif)(?:[?#].*)?$/i;

  function mediaTypeFromEvidenceUrl(url, fallback = "") {
    const explicit = canonicalId(fallback || "");
    if (explicit === "video" || explicit === "image") return explicit;
    const clean = String(url || "").trim().split("#")[0].split("?")[0];
    if (HAK_VIDEO_MEDIA_EXT_RE.test(clean)) return "video";
    if (HAK_IMAGE_MEDIA_EXT_RE.test(clean)) return "image";
    return "";
  }

  function normalizeHakEvidenceKind(rawKind) {
    const kind = canonicalId(rawKind || "");
    return (kind === "love" || kind === "nts" || kind === "ntr") ? kind : "";
  }

  function evidenceKindForStep(rawEvidence, step, fallbackRow) {
    return normalizeHakEvidenceKind(
      rawEvidence?.kind ||
      rawEvidence?.route ||
      step?.kind ||
      step?.route ||
      fallbackRow?.kind ||
      fallbackRow?.route ||
      fallbackRow?.profile?.kind ||
      fallbackRow?.profile?.route ||
      ""
    );
  }

  function normalizeHakEvidenceOwner(rawEvidence, step, profileId) {
    const rawName = String(
      rawEvidence?.ownerName ||
      rawEvidence?.characterName ||
      rawEvidence?.contactName ||
      step?.ownerName ||
      step?.characterName ||
      step?.contactName ||
      step?.profile?.name ||
      step?.profileName ||
      step?.name ||
      ""
    ).trim();
    return canonicalGalleryOwnerId(
      rawEvidence?.ownerId ||
      rawEvidence?.characterId ||
      rawEvidence?.contactId ||
      rawEvidence?.targetId ||
      step?.ownerId ||
      step?.characterId ||
      step?.contactId ||
      step?.targetId ||
      step?.profileId ||
      profileId ||
      "",
      rawName
    );
  }

  function hakEvidenceGalleryAccess(item, normalizedStep) {
    const kind = evidenceKindForStep(item, normalizedStep, null);
    const explicit = canonicalId(item?.access?.type || "") === "skill";
    let skillId = explicit ? String(item.access.skillId || item.access.id || "").trim() : (kind ? `${kind}_evidence_access` : "");
    if (skillId === "hak_audio_transcription_v1") {
      skillId = kind ? `${kind}_audio_transcription_v1` : "";
    }
    let granted = false;
    if (skillId) {
      try {
        const engine = window.GameStateEngine;
        granted = typeof engine?.hasActiveHakSkill === "function"
          ? engine.hasActiveHakSkill(skillId) === true
          : window.Game?.hasSkill?.(skillId) === true;
      } catch {}
    }
    return {
      allowed: !explicit || granted,
      granted,
      access: explicit ? { ...item.access, type: "skill", skillId } : null
    };
  }

  function persistHakEvidenceToGallery(item, normalizedStep, ownedByAsset = null) {
    const authorization = hakEvidenceGalleryAccess(item, normalizedStep);
    if (!authorization.allowed) return;
    const rawUrl = String(item?.url || item?.src || item?.image || "").trim();
    const url = String(window.Game?.resolveCharacterVariantImage?.(rawUrl, item?.characterId || item?.contactId || normalizedStep?.profileId || "") || rawUrl).trim();
    if (!url) return;
    const ownerId = canonicalGalleryOwnerId(item?.characterId || item?.contactId || normalizedStep?.profileId || "", item?.characterName || normalizedStep?.profileName || "");
    const ownerName = ownerId ? resolveStepDisplayName(ownerId, item?.characterName || normalizedStep?.profileName || "") : "";
    const evidenceId = String(item?.id || "").trim();
    const photo = {
      id: evidenceId ? `hak_${ownerId || normalizedStep?.profileId || "evidence"}_${evidenceId}` : `hak_${url}`,
      url,
      w: 0,
      h: 0,
      at: Math.max(1, Number(item?.timestamp || item?.at || item?.addedAt || 1) || 1),
      src: ownerId ? `hak:${ownerId}` : "hak:evidence",
      source: "hak",
      app: "hak",
      onceKey: evidenceId || "",
      type: mediaTypeFromEvidenceUrl(url, item?.type || ""),
      mediaType: mediaTypeFromEvidenceUrl(url, item?.type || ""),
      title: String(item?.title || item?.label || "Evidence").trim() || "Evidence",
      label: String(item?.label || item?.title || "Evidence").trim() || "Evidence",
      kind: normalizeHakEvidenceKind(item?.kind || item?.route || normalizedStep?.kind || normalizedStep?.route || ""),
      route: normalizeHakEvidenceKind(item?.route || item?.kind || normalizedStep?.route || normalizedStep?.kind || ""),
      ownerId,
      ownerName,
      characterId: ownerId || "",
      contactId: ownerId || ""
    };
    if (authorization.access) photo.access = authorization.access;
    const physicalPath = window.GalleryStore?.normalizeImagePath?.(url) || url;
    const assetKey = JSON.stringify([physicalPath, ownerId]);
    const existing = ownedByAsset?.get(assetKey);
    if (existing && (!authorization.granted || (existing.evidenceAccessGranted === true &&
        (!authorization.access || (existing.access?.type === "skill" && existing.access?.skillId === authorization.access.skillId))))) {
      return { changed: false, inserted: false, photo: existing };
    }
    if (authorization.granted) {
      photo.evidenceAccessGranted = true;
      if (typeof window.GalleryStore?.upsert === "function") {
        const result = window.GalleryStore.upsert(photo, {
          operationId: `hak-gallery-access-v1:${evidenceId || url}:${physicalPath}`
        });
        if (result?.photo) ownedByAsset?.set(assetKey, result.photo);
        return result;
      }
    }
    const result = saveToGallery(photo);
    if (result?.photo) ownedByAsset?.set(assetKey, result.photo);
    return result;
  }

  function reconcileCanonicalHakEvidenceGallery() {
    const engine = window.GameStateEngine;
    if (!engine || typeof window.GalleryStore?.upsert !== "function") return { checked: 0, changed: 0 };
    const hak = engine.getHakState?.();
    const report = { checked: 0, changed: 0 };
    if (!hak) return report;
    const ownedByAsset = new Map(Object.values(engine.getGalleryState?.()?.owned || {}).map(row => [
      JSON.stringify([
        window.GalleryStore.normalizeImagePath?.(row?.url || row?.image || row?.photo || "") || row?.url || "",
        canonicalGalleryOwnerId(row?.ownerId || row?.characterId || row?.contactId || "", row?.ownerName || "")
      ]), row
    ]));
    const persist = (item, step) => {
      report.checked++;
      const result = persistHakEvidenceToGallery(item, step, ownedByAsset);
      if (result?.changed) report.changed++;
    };
    // Only acquired canonical evidence proves discovery. Neither story
    // completion nor the eligibility registry may grant an unseen deposit.
    for (const [profileId, row] of Object.entries(hak.evidenceProfiles || {})) {
      const step = { profileId, profileName: row?.profile?.name || "", kind: row?.kind || row?.profile?.kind || "", route: row?.route || row?.profile?.route || "" };
      for (const item of (Array.isArray(row?.evidences) ? row.evidences : [])) persist(item, step);
    }
    for (const item of (Array.isArray(hak.photos) ? hak.photos : [])) {
      persist(item, { profileId: item?.profileId || item?.characterId || item?.contactId || item?.ownerId || "", kind: item?.kind || "", route: item?.route || "" });
    }
    return report;
  }

  function normalizeHakEvidenceStore(rawStore) {
    const src = Array.isArray(rawStore)
      ? { __flat: { evidences: rawStore } }
      : ((rawStore && typeof rawStore === "object") ? rawStore : {});
    if (Array.isArray(src.evidences)) {
      src.__flat = { evidences: src.evidences, profile: src.profile || {} };
      delete src.evidences;
    }
    const out = {};
    const bucketFlatEvidence = (rawEvidence, fallbackProfileId = "") => {
      if (!rawEvidence || typeof rawEvidence !== "object") return;
      const profileId = canonicalId(
        rawEvidence.profileId ||
        rawEvidence.targetId ||
        rawEvidence.contactId ||
        rawEvidence.characterId ||
        rawEvidence.ownerId ||
        fallbackProfileId ||
        "evidence"
      );
      if (!profileId) return;
      if (!src[profileId] || typeof src[profileId] !== "object" || Array.isArray(src[profileId])) {
        src[profileId] = { profile: { name: defaultEvidenceProfileName(profileId) }, evidences: [] };
      }
      if (!Array.isArray(src[profileId].evidences)) src[profileId].evidences = [];
      src[profileId].evidences.push(rawEvidence);
    };

    Object.keys(src).forEach((rawKey) => {
      const row = src[rawKey];
      if (rawKey === "__flat" && row && typeof row === "object" && Array.isArray(row.evidences)) {
        row.evidences.forEach((item) => bucketFlatEvidence(item, ""));
        delete src[rawKey];
        return;
      }
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        bucketFlatEvidence(row, rawKey);
        delete src[rawKey];
        return;
      }
      if (row.id && (row.url || row.src || row.image)) {
        bucketFlatEvidence(row, rawKey);
        delete src[rawKey];
        return;
      }
      if (Array.isArray(row.evidence) && !Array.isArray(row.evidences)) row.evidences = row.evidence;
    });

    Object.keys(src).forEach((rawProfileId) => {
      const profileId = canonicalId(rawProfileId);
      if (!profileId) return;

      const row = (src[rawProfileId] && typeof src[rawProfileId] === "object") ? src[rawProfileId] : {};
      const profileRaw = (row.profile && typeof row.profile === "object") ? row.profile : {};
      const evidencesRaw = Array.isArray(row.evidences) ? row.evidences : [];
      const seenIds = new Set();
      const evidences = [];

      evidencesRaw.forEach((rawEvidence) => {
        const id = String(rawEvidence?.id || "").trim();
        const url = String(rawEvidence?.url || rawEvidence?.image || rawEvidence?.src || "").trim();
        if (!id || !url || seenIds.has(id)) return;
        seenIds.add(id);
        const rawTs = Number(rawEvidence?.timestamp ?? rawEvidence?.at ?? Date.now());
        const timestamp = Number.isFinite(rawTs) && rawTs > 0 ? Math.floor(rawTs) : Date.now();
        const ownerId = normalizeHakEvidenceOwner(rawEvidence, row, profileId);
        const label = String(rawEvidence?.label || rawEvidence?.title || "").trim();
        const item = {
          id,
          url,
          src: String(rawEvidence?.src || url).trim(),
          type: mediaTypeFromEvidenceUrl(url, rawEvidence?.type || ""),
          kind: evidenceKindForStep(rawEvidence, row, row),
          route: evidenceKindForStep(rawEvidence, row, row),
          timestamp
        };
        if (label) {
          item.label = label;
          item.title = String(rawEvidence?.title || label).trim();
        }
        if (ownerId) {
          item.characterId = ownerId;
          item.contactId = ownerId;
        }
        const category = String(rawEvidence?.category || row?.category || "").trim();
        if (category) item.category = category;
        evidences.push(item);
      });

      evidences.sort((a, b) => (Number(b?.timestamp || 0) || 0) - (Number(a?.timestamp || 0) || 0));

      const profileName = String(profileRaw.name || "").trim() || defaultEvidenceProfileName(profileId);
      const profileAvatar = String(profileRaw.avatar || "").trim() || defaultEvidenceAvatar(profileId);

      out[profileId] = {
        profile: {
          name: profileName,
          avatar: profileAvatar,
          kind: normalizeHakEvidenceKind(profileRaw?.kind || row?.kind || row?.route || ""),
          route: normalizeHakEvidenceKind(profileRaw?.route || row?.route || row?.kind || "")
        },
        kind: normalizeHakEvidenceKind(row?.kind || row?.route || profileRaw?.kind || profileRaw?.route || ""),
        route: normalizeHakEvidenceKind(row?.route || row?.kind || profileRaw?.route || profileRaw?.kind || ""),
        evidences
      };
    });

    return out;
  }

  function readHakEvidenceStore() {
    try {
      const store = window.GameStateEngine?.getState?.()?.hak?.evidenceProfiles;
      if (store && typeof store === "object" && !Array.isArray(store)) return normalizeHakEvidenceStore(store);
    } catch {}
    const parsed = safeJsonParse(safeGetLS(HAK_EVIDENCE_KEY), {});
    return normalizeHakEvidenceStore(parsed);
  }

  function writeHakEvidenceStore(store) {
    void store;
    throw new Error("HAK evidence is canonical; renderer writes are disabled");
  }

  function normalizeHakEvidenceStep(step) {
    const s = (step && typeof step === "object") ? step : {};
    const now = Date.now();
    let rawEvidences = Array.isArray(s.evidences)
      ? s.evidences
      : (Array.isArray(s.items) ? s.items : []);
    const firstEvidence = rawEvidences.find((row) => row && typeof row === "object") || {};
    const firstEvidenceOwner =
      firstEvidence.characterId ||
      firstEvidence.contactId ||
      firstEvidence.ownerId ||
      firstEvidence.targetId ||
      "";
    const profileId = canonicalId(
      s.profileId ||
      s.targetId ||
      s.contactId ||
      s.characterId ||
      s.fromId ||
      s.profile?.id ||
      firstEvidenceOwner ||
      s.target ||
      "unknown"
    );
    if (!profileId) return null;

    const profileName =
      String(s.profile?.name || s.profileName || s.name || "").trim() ||
      defaultEvidenceProfileName(profileId);
    const profileAvatar =
      String(s.profile?.avatar || s.profileAvatar || s.avatar || "").trim() ||
      defaultEvidenceAvatar(profileId);

    if (!rawEvidences.length) {
      const singleUrl = String(s.url || s.image || s.src || "").trim();
      if (singleUrl) {
        rawEvidences = [{
          id: String(s.id || `${profileId}_evidence_${now}`).trim(),
          url: singleUrl,
          src: singleUrl,
          type: s.type || "",
          label: s.label || s.title || "",
          title: s.title || s.label || "",
          characterId: s.characterId || s.contactId || profileId,
          contactId: s.contactId || s.characterId || profileId,
          category: s.category || "",
          kind: s.kind || s.route || "",
          route: s.route || s.kind || "",
          timestamp: Number(s.timestamp ?? s.at ?? now) || now
        }];
      }
    }

    const evidences = [];
    const seenIds = new Set();
    rawEvidences.forEach((rawEvidence, idx) => {
      const fallbackId = `${profileId}_evidence_${idx + 1}`;
      const id = String(rawEvidence?.id || rawEvidence?.evidenceId || fallbackId).trim();
      const url = String(rawEvidence?.url || rawEvidence?.image || rawEvidence?.src || "").trim();
      if (!id || !url || seenIds.has(id)) return;
      seenIds.add(id);
      const rawTs = Number(rawEvidence?.timestamp ?? rawEvidence?.at ?? s.timestamp ?? s.at ?? now);
      const timestamp = Number.isFinite(rawTs) && rawTs > 0 ? Math.floor(rawTs) : now;
      const ownerId = normalizeHakEvidenceOwner(rawEvidence, s, profileId);
      const label = String(rawEvidence?.label || rawEvidence?.title || "").trim();
      const item = {
        id,
        url,
        src: String(rawEvidence?.src || url).trim(),
        type: mediaTypeFromEvidenceUrl(url, rawEvidence?.type || s.type || ""),
        kind: evidenceKindForStep(rawEvidence, s, null),
        route: evidenceKindForStep(rawEvidence, s, null),
        timestamp,
        access: (rawEvidence?.access && typeof rawEvidence.access === "object")
          ? { ...rawEvidence.access }
          : ((s.access && typeof s.access === "object") ? { ...s.access } : undefined)
      };
      if (label) {
        item.label = label;
        item.title = String(rawEvidence?.title || label).trim();
      }
      if (ownerId) {
        item.characterId = ownerId;
        item.contactId = ownerId;
        item.characterName = resolveStepDisplayName(ownerId, rawEvidence?.characterName || rawEvidence?.contactName || profileName || "");
      }
      const category = String(rawEvidence?.category || s.category || "").trim();
      if (category) item.category = category;
      evidences.push(item);
    });

    return {
      profileId,
      profileName,
      profileAvatar,
      kind: normalizeHakEvidenceKind(s.kind || s.route || ""),
      route: normalizeHakEvidenceKind(s.route || s.kind || ""),
      evidences
    };
  }

  function addHakEvidence(step) {
    const normalized = normalizeHakEvidenceStep(step);
    if (!normalized || !normalized.profileId || !normalized.evidences.length) {
      return { addedCount: 0, profileId: "", evidenceIds: [] };
    }

    const store = readHakEvidenceStore();
    const profileId = normalized.profileId;
    const existingRow = (store[profileId] && typeof store[profileId] === "object") ? store[profileId] : {};
    const existingProfile = (existingRow.profile && typeof existingRow.profile === "object") ? existingRow.profile : {};
    const existingEvidenceList = Array.isArray(existingRow.evidences) ? existingRow.evidences.slice() : [];
    const evidenceById = new Map();
    existingEvidenceList.forEach((item) => {
      const id = String(item?.id || "").trim();
      if (id && !evidenceById.has(id)) evidenceById.set(id, item);
    });

    const insertedIds = [];
    const updatedIds = [];
    normalized.evidences.forEach((item) => {
      const id = String(item.id || "").trim();
      const url = String(item.url || "").trim();
      if (!id || !url) return;

      const existingItem = evidenceById.get(id);
      if (existingItem) {
        const existingUrl = String(existingItem?.url || "").trim();
        if (existingUrl !== url) {
          existingItem.url = url;
          existingItem.src = String(item.src || url).trim() || url;
          updatedIds.push(id);
        }
        ["type", "label", "title", "characterId", "contactId", "characterName", "category", "kind", "route", "access"].forEach((keyName) => {
          const incoming = item?.[keyName];
          if (incoming == null || incoming === "") return;
          if (!String(existingItem?.[keyName] ?? "").trim() || keyName === "type") {
            existingItem[keyName] = incoming;
            if (!updatedIds.includes(id)) updatedIds.push(id);
          }
        });
        return;
      }

      evidenceById.set(id, item);
      insertedIds.push(id);
      existingEvidenceList.push({
        ...item,
        id,
        url,
        src: String(item.src || url).trim() || url,
        timestamp: Number(item.timestamp || Date.now()) || Date.now()
      });
    });

    normalized.evidences.forEach((item) => {
      try { persistHakEvidenceToGallery(item, normalized); } catch {}
    });

    if (!insertedIds.length && !updatedIds.length) {
      return { addedCount: 0, profileId, evidenceIds: [], updatedIds: [] };
    }

    existingEvidenceList.sort((a, b) => (Number(b?.timestamp || 0) || 0) - (Number(a?.timestamp || 0) || 0));
    store[profileId] = {
      profile: {
        name: String(normalized.profileName || existingProfile.name || "").trim() || defaultEvidenceProfileName(profileId),
        avatar: String(normalized.profileAvatar || existingProfile.avatar || "").trim() || defaultEvidenceAvatar(profileId),
        kind: normalizeHakEvidenceKind(normalized.kind || normalized.route || existingProfile.kind || existingProfile.route || ""),
        route: normalizeHakEvidenceKind(normalized.route || normalized.kind || existingProfile.route || existingProfile.kind || "")
      },
      kind: normalizeHakEvidenceKind(normalized.kind || normalized.route || existingRow.kind || existingRow.route || ""),
      route: normalizeHakEvidenceKind(normalized.route || normalized.kind || existingRow.route || existingRow.kind || ""),
      evidences: existingEvidenceList
    };
    writeHakEvidenceStore(store);

    const payload = {
      profileId,
      addedCount: insertedIds.length,
      evidenceIds: insertedIds.concat(updatedIds),
      updatedIds: updatedIds.slice(),
      at: Date.now()
    };
    try { window.StoryBus?.emit?.("hak:evidence-added", payload); } catch {}
    try { window.dispatchEvent(new CustomEvent("hak:evidence-added", { detail: payload })); } catch {}

    return {
      addedCount: insertedIds.length,
      profileId,
      evidenceIds: insertedIds,
      updatedIds: updatedIds.slice()
    };
  }

  function bumpAppBadge(app, delta) {
    const raw = safeGetLS("app_badges_v1");
    const badges = safeJsonParse(raw, {});
    const cur = Number(badges?.[app] || 0) || 0;
    const next = Math.max(0, cur + (Number(delta || 0) || 0));
    if (next) badges[app] = next;
    else delete badges[app];
    safeSetLS("app_badges_v1", JSON.stringify(badges));
    try { window.dispatchEvent(new CustomEvent("game:badges-updated", { detail: { app, value: next } })); } catch {}
  }

  const ONLYFUN_UNLOCK_KEY = "feature_onlyfun_unlocked";
  const ONLYFUN_CREATORS_KEY = "onlyfun_creators_v1";
  const ONLYFUN_ACCOUNTS_KEY = "onlyfun_accounts_v1";
  const ONLYFUN_SUBSCRIPTIONS_KEY = "onlyfun_subscriptions_v1";
  const ONLYFUN_SUBSCRIPTIONS_PUBLIC_KEY = "onlyfun_subscriptions";
  const ONLYFUN_POSTS_KEY = "onlyfun_posts_v1";
  const ONLYFUN_SEEN_POSTS_KEY = "onlyfun_seen_posts_v1";
  const ONLYFUN_REQUIRED_CREATOR_ID = "static_muse";
  const ONLYFUN_REQUIRED_CREATOR_DISPLAY_NAME = "Sexminator";
  const ONLYFUN_REQUIRED_CREATOR_AVATAR = "assets/pictures/OnlyFun/avatars/Sexminator.jpg";
  const ONLYFUN_CREATOR_CHARACTER_GATES = Object.freeze({
    static_muse: "evelyn",
    staticmuse: "evelyn",
    sexminator: "evelyn"
  });
  const ONLYFUN_CREATOR_ID_ALIASES = {
    staticmuse: ONLYFUN_REQUIRED_CREATOR_ID,
    sexminator: ONLYFUN_REQUIRED_CREATOR_ID,
  };
  const ONLYFUN_SUB_ALIAS_TO_CREATOR = {
    velvet: "velvet_sin",
    neonrose: "neon_rose",
    staticmuse: ONLYFUN_REQUIRED_CREATOR_ID,
    sexminator: ONLYFUN_REQUIRED_CREATOR_ID,
  };
  const ONLYFUN_CREATOR_AVATAR_BY_ID = {
    velvet: "assets/pictures/OnlyFun/avatars/Velvet.png",
    velvet_sin: "assets/pictures/OnlyFun/avatars/Velvet.png",
    neonrose: "assets/pictures/OnlyFun/avatars/NeonRose.png",
    neon_rose: "assets/pictures/OnlyFun/avatars/NeonRose.png",
    alphamana: "assets/pictures/OnlyFun/avatars/alphamana_avatar.jpg",
    staticmuse: ONLYFUN_REQUIRED_CREATOR_AVATAR,
    static_muse: ONLYFUN_REQUIRED_CREATOR_AVATAR,
    sexminator: ONLYFUN_REQUIRED_CREATOR_AVATAR,
  };
  const ONLYFUN_AVATAR_PATH_HINTS = [
    "/assets/avatars/",
    "/pictures/onlyfun/avatars/",
    "/onlyfun/avatars/"
  ];
  const ONLYFUN_FEED_PATH_HINTS = [
    "/pictures/onlyfun/posts/",
    "/onlyfun/posts/",
    "/pictures/evidence/"
  ];
  const ONLYFUN_MEDIA_WARNED = new Set();

  function isOnlyfunUnlocked() {
    return safeGetLS(ONLYFUN_UNLOCK_KEY) === "1";
  }

  function normalizeOnlyfunCreatorId(raw) {
    const id = canonicalId(raw);
    if (!id) return "";
    return ONLYFUN_CREATOR_ID_ALIASES[id] || id;
  }

  function isOnlyfunCreatorAllowed(rawCreatorId) {
    const creatorId = normalizeOnlyfunCreatorId(rawCreatorId);
    if (!creatorId) return false;
    // OnlyFun records are acquired history. Story routing decides whether a
    // future post is authored; inactive characters do not erase old records.
    return true;
  }

  function runtimeIndexFromCanonicalCursor(storyPath, steps) {
    const execution = window.GameStateEngine?.getExecutionState?.();
    const cursor = execution?.cursor;
    const position = window.StoryPosition;
    if (!cursor || !execution?.lease || !position || !storyPathsEqual(execution.activeStoryPath, storyPath)) return null;
    const wanted = position.formatPath(cursor.rootIndex, cursor.branchPath || []);
    // Expand only ancestors of the persisted position. Previous/future
    // branches are not execution and may not acquire receipts or a cursor.
    for (let guard = 0; guard < 128; guard++) {
      const exact = steps.findIndex(step => String(step.__ifPath || "") === wanted);
      if (exact >= 0) return exact;
      const ancestor = steps.findIndex(step => step.type === "if" && wanted.startsWith(String(step.__ifPath) + "."));
      if (ancestor < 0) break;
      const step = steps[ancestor], suffix = wanted.slice(String(step.__ifPath).length + 1);
      const selectedBranch = suffix.split(".")[0];
      if (selectedBranch !== "then" && selectedBranch !== "else") return null;
      const branch = Array.isArray(step[selectedBranch]) ? step[selectedBranch] : [];
      steps.splice(ancestor, 1, ...branch.map(row => ({ ...row })));
    }
    const next = steps.findIndex(step => {
      const candidate = position.parsePath(String(step.__ifPath || ""));
      return position.comparePosition(candidate.rootIndex, candidate.branchPath, cursor.rootIndex, cursor.branchPath) > 0;
    });
    return next < 0 ? steps.length : next;
  }

  function onlyfunDisplayNameFromCreatorId(raw) {
    const id = normalizeOnlyfunCreatorId(raw);
    if (!id) return "Creator";
    if (id === ONLYFUN_REQUIRED_CREATOR_ID) return ONLYFUN_REQUIRED_CREATOR_DISPLAY_NAME;
    return prettyNameFromKey(id);
  }

  function resolveOnlyfunCreatorAvatar(creatorId, ...candidates) {
    const id = normalizeOnlyfunCreatorId(creatorId);
    const mapped = ONLYFUN_CREATOR_AVATAR_BY_ID[id] || ONLYFUN_CREATOR_AVATAR_BY_ID[id.replace(/_/g, "")] || "";
    for (const candidate of candidates) {
      const avatar = String(candidate || "").trim();
      if (avatar) return avatar;
    }
    return mapped;
  }

  function normalizeOnlyfunPathForCheck(url) {
    return String(url || "")
      .trim()
      .toLowerCase()
      .replace(/\\/g, "/")
      .split("#")[0]
      .split("?")[0];
  }

  function isOnlyfunAvatarPath(url) {
    const path = normalizeOnlyfunPathForCheck(url);
    if (!path) return false;
    return ONLYFUN_AVATAR_PATH_HINTS.some((hint) => path.includes(hint));
  }

  function isOnlyfunFeedPath(url) {
    const path = normalizeOnlyfunPathForCheck(url);
    if (!path) return false;
    if (path.startsWith("data:image/") || path.startsWith("blob:")) return true;
    return ONLYFUN_FEED_PATH_HINTS.some((hint) => path.includes(hint));
  }

  function warnOnlyfunMediaIssue(reason, meta = {}) {
    const token = [
      reason,
      canonicalId(meta?.creatorId || ""),
      canonicalId(meta?.postId || ""),
      normalizeOnlyfunPathForCheck(meta?.image || "")
    ].join("|");
    if (!token || ONLYFUN_MEDIA_WARNED.has(token)) return;
    ONLYFUN_MEDIA_WARNED.add(token);
    try {
      console.warn("[OnlyFunMedia]", reason, JSON.stringify(meta));
    } catch {}
  }

  function sanitizeOnlyfunPostImage(imagePath, meta = {}) {
    const image = String(imagePath || "").trim();
    if (!image) {
      warnOnlyfunMediaIssue("missing_post_image", meta);
      return "";
    }
    if (isOnlyfunAvatarPath(image)) {
      warnOnlyfunMediaIssue("blocked_avatar_path_for_post_image", { ...meta, image });
      return "";
    }
    if (!isOnlyfunFeedPath(image)) {
      warnOnlyfunMediaIssue("unexpected_post_image_path", { ...meta, image });
    }
    return image;
  }

  function readOnlyfunCreatorsMap() {
    const raw = safeJsonParse(safeGetLS(ONLYFUN_CREATORS_KEY), {});
    const source = raw?.creators;
    if (!source || typeof source !== "object") return {};
    const out = {};
    Object.keys(source).forEach((key) => {
      const row = source[key];
      if (!row || typeof row !== "object") return;
      const id = normalizeOnlyfunCreatorId(row.id || row.creatorId || key);
      if (!id) return;
      if (!isOnlyfunCreatorAllowed(id)) return;
      out[id] = {
        ...row,
        id,
        creatorId: id,
        displayName: id === ONLYFUN_REQUIRED_CREATOR_ID
          ? ONLYFUN_REQUIRED_CREATOR_DISPLAY_NAME
          : String(row.displayName || row.name || onlyfunDisplayNameFromCreatorId(id)).trim() || onlyfunDisplayNameFromCreatorId(id),
        name: id === ONLYFUN_REQUIRED_CREATOR_ID
          ? ONLYFUN_REQUIRED_CREATOR_DISPLAY_NAME
          : String(row.name || row.displayName || onlyfunDisplayNameFromCreatorId(id)).trim() || onlyfunDisplayNameFromCreatorId(id),
        avatar: resolveOnlyfunCreatorAvatar(id, row.avatar, row.avatarUrl, row.photo)
      };
    });
    return out;
  }

  function writeOnlyfunCreatorsMap(creators) {
    const next = {};
    const source = (creators && typeof creators === "object") ? creators : {};
    Object.keys(source).forEach((key) => {
      const row = source[key];
      if (!row || typeof row !== "object") return;
      const id = normalizeOnlyfunCreatorId(row.id || row.creatorId || key);
      if (!id) return;
      if (!isOnlyfunCreatorAllowed(id)) return;
      next[id] = {
        ...row,
        id,
        creatorId: id,
        displayName: String(row.displayName || row.name || onlyfunDisplayNameFromCreatorId(id)).trim() || onlyfunDisplayNameFromCreatorId(id),
        name: String(row.name || row.displayName || onlyfunDisplayNameFromCreatorId(id)).trim() || onlyfunDisplayNameFromCreatorId(id),
        avatar: resolveOnlyfunCreatorAvatar(id, row.avatar, row.avatarUrl, row.photo)
      };
    });
    throw new Error("OnlyFun creator writes are canonical; legacy writer disabled");
    return next;
  }

  function readOnlyfunAccountsMap() {
    const raw = safeJsonParse(safeGetLS(ONLYFUN_ACCOUNTS_KEY), {});
    const source = raw?.accounts || raw?.creators || raw;
    return (source && typeof source === "object" && !Array.isArray(source)) ? source : {};
  }

  function writeOnlyfunAccountsMap(accounts) {
    const next = {};
    const source = (accounts && typeof accounts === "object") ? accounts : {};
    Object.keys(source).forEach((key) => {
      const row = source[key];
      if (!row || typeof row !== "object") return;
      const id = normalizeOnlyfunCreatorId(row.id || row.creatorId || row.authorId || key);
      if (!id) return;
      if (!isOnlyfunCreatorAllowed(id)) return;
      next[id] = { ...row, id, creatorId: id, unlocked: row.unlocked !== false };
    });
    throw new Error("OnlyFun account writes are canonical; legacy writer disabled");
    return next;
  }

  function readOnlyfunSubscriptionsMap() {
    const raw = safeJsonParse(safeGetLS(ONLYFUN_SUBSCRIPTIONS_KEY), {});
    const subs = raw?.subs;
    const src = (subs && typeof subs === "object") ? subs : {};
    const publicRaw = safeJsonParse(safeGetLS(ONLYFUN_SUBSCRIPTIONS_PUBLIC_KEY), {});
    const publicSrc = (publicRaw?.subs && typeof publicRaw.subs === "object")
      ? publicRaw.subs
      : ((publicRaw && typeof publicRaw === "object") ? publicRaw : {});
    const out = {};
    Object.keys(src).forEach((key) => {
      const id = normalizeOnlyfunCreatorId(key);
      if (!id) return;
      if (!isOnlyfunCreatorAllowed(id)) return;
      out[id] = !!src[key] || !!out[id];
    });
    Object.keys(publicSrc).forEach((key) => {
      const alias = canonicalId(key).replace(/_/g, "");
      if (!alias) return;
      const id = ONLYFUN_SUB_ALIAS_TO_CREATOR[alias] || normalizeOnlyfunCreatorId(alias);
      if (!id) return;
      if (!isOnlyfunCreatorAllowed(id)) return;
      out[id] = !!publicSrc[key] || !!out[id];
    });
    return out;
  }

  function writeOnlyfunSubscriptionsMap(subs) {
    const next = {};
    const source = (subs && typeof subs === "object") ? subs : {};
    Object.keys(source).forEach((key) => {
      const id = normalizeOnlyfunCreatorId(key);
      if (!id) return;
      if (!isOnlyfunCreatorAllowed(id)) return;
      next[id] = !!source[key];
    });
    throw new Error("OnlyFun subscription writes are canonical; legacy writer disabled");
    return next;
  }

  function unlockOnlyfunAccount(step) {
    const s = step || {};
    const creatorId = normalizeOnlyfunCreatorId(s.creatorId || s.creator || s.authorId || s.accountId || s.id || "");
    if (!creatorId) return false;
    if (!isOnlyfunCreatorAllowed(creatorId)) return false;
    const displayName = String(s.displayName || s.name || s.authorName || s.creatorDisplayName || onlyfunDisplayNameFromCreatorId(creatorId)).trim() || onlyfunDisplayNameFromCreatorId(creatorId);
    const avatar = resolveOnlyfunCreatorAvatar(creatorId, s.avatar, s.avatarUrl, s.photo);
    const now = Date.now();
    const profile = {
      id: creatorId,
      creatorId,
      displayName,
      name: displayName,
      avatar,
      priceEur: Number.isFinite(Number(s.priceEur)) ? Math.max(0, Number(s.priceEur)) : 0,
      tagline: String(s.tagline || s.bio || "Private creator feed.").trim() || "Private creator feed.",
      unlocked: true,
      unlockedAt: now
    };

    throw new Error("OnlyFun unlock writes are canonical; legacy writer disabled");

    const accounts = readOnlyfunAccountsMap();
    writeOnlyfunAccountsMap({ ...accounts, [creatorId]: { ...(accounts[creatorId] || {}), ...profile } });

    const creators = readOnlyfunCreatorsMap();
    writeOnlyfunCreatorsMap({ ...creators, [creatorId]: { ...(creators[creatorId] || {}), ...profile } });

    if (s.subscribe !== false && s.subscribed !== false) {
      const subs = readOnlyfunSubscriptionsMap();
      writeOnlyfunSubscriptionsMap({ ...subs, [creatorId]: true });
    }

    try { window.StoryBus?.emit?.("onlyfun:account-unlocked", { creatorId, profile }); } catch {}
    try { window.dispatchEvent(new CustomEvent("onlyfun:account-unlocked", { detail: { creatorId, profile } })); } catch {}
    recomputeOnlyfunBadgeFromStorage();
    return true;
  }

  function isOnlyfunSubscribed(creatorId) {
    const cid = normalizeOnlyfunCreatorId(creatorId);
    if (!cid) return false;
    const subs = readOnlyfunSubscriptionsMap();
    return !!subs[cid];
  }

  function readOnlyfunPosts() {
    const raw = safeJsonParse(safeGetLS(ONLYFUN_POSTS_KEY), {});
    const posts = raw?.posts;
    return dedupeOnlyfunPostsById(Array.isArray(posts) ? posts : []);
  }

  function writeOnlyfunPosts(posts) {
    const list = dedupeOnlyfunPostsById(Array.isArray(posts) ? posts : []);
    throw new Error("OnlyFun post writes are canonical; legacy writer disabled");
  }

  function readOnlyfunSeenPostsMap() {
    const raw = safeJsonParse(safeGetLS(ONLYFUN_SEEN_POSTS_KEY), {});
    if (!raw || typeof raw !== "object") return {};
    const out = {};
    Object.keys(raw).forEach((key) => {
      const id = String(key || "").trim();
      if (!id) return;
      out[id] = raw[key] === true;
    });
    return out;
  }

  function normalizeOnlyfunPostPayload(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = String(raw?.id || "").trim();
    if (!id) return null;
    const creatorId = normalizeOnlyfunCreatorId(raw?.creatorId || raw?.creator || raw?.authorId || "");
    if (!creatorId) return null;
    if (!isOnlyfunCreatorAllowed(creatorId)) return null;
    const creatorDisplayName = (creatorId === ONLYFUN_REQUIRED_CREATOR_ID)
      ? ONLYFUN_REQUIRED_CREATOR_DISPLAY_NAME
      : String(raw?.creatorDisplayName || "").trim();
    return {
      ...raw,
      id,
      creatorId,
      creatorDisplayName: creatorDisplayName || onlyfunDisplayNameFromCreatorId(creatorId),
      creatorAvatar: resolveOnlyfunCreatorAvatar(
        creatorId,
        raw?.creatorAvatar,
        raw?.avatar,
        raw?.avatarUrl,
        raw?.photo
      )
    };
  }

  function dedupeOnlyfunPostsById(posts) {
    const list = Array.isArray(posts) ? posts : [];
    const map = new Map();
    list.forEach((item) => {
      const normalized = normalizeOnlyfunPostPayload(item);
      if (!normalized) return;
      const token = canonicalId(normalized.id);
      if (!token) return;
      const prev = map.get(token);
      map.set(token, prev ? { ...prev, ...normalized } : normalized);
    });
    return Array.from(map.values()).sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0));
  }

  function setOnlyfunBadgeCount(value) {
    const next = Math.max(0, Number(value || 0) || 0);
    const raw = safeGetLS("app_badges_v1");
    const badges = safeJsonParse(raw, {});
    if (next > 0) badges.onlyfun = next;
    else delete badges.onlyfun;
    safeSetLS("app_badges_v1", JSON.stringify(badges));
    try { window.dispatchEvent(new CustomEvent("app:badge-changed", { detail: { app: "onlyfun", value: next } })); } catch {}
    try { window.dispatchEvent(new CustomEvent("game:badges-updated", { detail: { app: "onlyfun", value: next } })); } catch {}
  }

  function recomputeOnlyfunBadgeFromStorage() {
    const posts = readOnlyfunPosts();
    const subs = readOnlyfunSubscriptionsMap();
    const seen = readOnlyfunSeenPostsMap();
    const unseen = posts.reduce((count, post) => {
      const creatorId = normalizeOnlyfunCreatorId(post?.creatorId || "");
      const postId = String(post?.id || "").trim();
      if (!creatorId || !postId) return count;
      if (!isOnlyfunCreatorAllowed(creatorId)) return count;
      if (!subs[creatorId]) return count;
      if (seen[postId] === true) return count;
      return count + 1;
    }, 0);
    setOnlyfunBadgeCount(unseen);
    return unseen;
  }

  function normalizeOnlyfunPost(step) {
    const s = step || {};
    const creatorId = normalizeOnlyfunCreatorId(s.creatorId || s.creator || s.authorId || s.author || "");
    if (creatorId && !isOnlyfunCreatorAllowed(creatorId)) return null;
    const onceKey = String(s.onceKey || "").trim();
    const rawImage = resolveOnlyfunPostImage(s);
    if (!creatorId || !onceKey || !rawImage) {
      try {
        console.warn("[ConvoRuntime] onlyfun_post ignored: missing required fields", {
          creatorId,
          onceKey,
          image: rawImage
        });
      } catch {}
      return null;
    }

    const now = Date.now();
    const creators = readOnlyfunCreatorsMap();
    const creator = creators?.[creatorId] || {};
    const authoredName = String(s.creatorDisplayName || s.authorName || s.name || "").trim();
    const displayName = String(creator?.displayName || creator?.name || authoredName || onlyfunDisplayNameFromCreatorId(creatorId)).trim() || onlyfunDisplayNameFromCreatorId(creatorId);
    const likesRaw = Number(s.likes ?? 0);
    const likes = Number.isFinite(likesRaw) ? Math.max(0, Math.round(likesRaw)) : 0;
    const atRaw = Number(s.createdAt ?? s.at ?? 0);
    const createdAt = Number.isFinite(atRaw) && atRaw > 0 ? Math.round(atRaw) : now;

    const id = onceKey;
    const image = sanitizeOnlyfunPostImage(rawImage, {
      creatorId,
      postId: id
    });
    if (!image) {
      try {
        console.warn("[ConvoRuntime] onlyfun_post ignored: missing/invalid image", {
          creatorId,
          onceKey,
          image: rawImage
        });
      } catch {}
      return null;
    }

    return {
      id,
      onceKey,
      type: "post",
      creatorId,
      creatorDisplayName: displayName,
      creatorAvatar: resolveOnlyfunCreatorAvatar(
        creatorId,
        creator?.avatar,
        s.creatorAvatar,
        s.avatar,
        s.avatarUrl,
        s.photo
      ),
      image,
      text: tplText(s.text || s.caption || ""),
      likes,
      requiresSub: s.requiresSub !== false,
      createdAt
    };
  }

  function upsertOnlyfunPost(post) {
    const payload = normalizeOnlyfunPostPayload(post);
    if (!payload) return { inserted: false, post: null };

    const list = readOnlyfunPosts();
    const idToken = canonicalId(payload.id || "");
    const idx = list.findIndex((item) => canonicalId(item?.id || "") === idToken);

    if (idx >= 0) {
      list[idx] = { ...list[idx], ...payload };
      writeOnlyfunPosts(list);
      return { inserted: false, post: list[idx] };
    }

    writeOnlyfunPosts([payload, ...list]);
    return { inserted: true, post: payload };
  }

  function pushOnlyfunNotification(post, ctx = {}) {
    const creatorId = normalizeOnlyfunCreatorId(post?.creatorId || "");
    if (!creatorId || !isOnlyfunCreatorAllowed(creatorId) || !isOnlyfunSubscribed(creatorId)) return false;

    const text = String(ctx.notifyText || post?.text || `${post?.creatorDisplayName || "Creator"} posted`).trim() || "New post";
    const avatar = String(post?.creatorAvatar || "").trim();
    const fromName = String(post?.creatorDisplayName || onlyfunDisplayNameFromCreatorId(creatorId)).trim() || "Creator";
    const eventId = makeRuntimeEventId(
      ctx.storyPath || "",
      ctx.episodeId || "",
      ctx.stepIndex || 0,
      "onlyfun_post_notify",
      creatorId,
      text,
      post?.image || ""
    );

    if (typeof Game.notify === "function") {
      Game.notify({
        app: "onlyfun",
        fromId: creatorId,
        fromName,
        avatar,
        title: "ONLYFUN",
        text,
        target: "onlyfun",
        creatorId,
        postId: post?.id || "",
        open: { scene: "onlyfun", creatorId, postId: post?.id || "" },
        __eventId: eventId
      });
      recomputeOnlyfunBadgeFromStorage();
      return true;
    }

    try {
      window.dispatchEvent(new CustomEvent("inbox:new", {
        detail: {
          app: "onlyfun",
          id: creatorId,
          name: fromName,
          text,
          avatar,
          creatorId,
          postId: post?.id || "",
          target: "onlyfun",
          open: { scene: "onlyfun", creatorId, postId: post?.id || "" }
        }
      }));
    } catch {}
    recomputeOnlyfunBadgeFromStorage();
    return true;
  }

  function writeOnlyfunPost(step, ctx = {}) {
    const normalized = normalizeOnlyfunPost(step);
    if (!normalized) return null;

    const onceKey = String(step?.onceKey || normalized.onceKey || normalized.id || "").trim();
    if (onceKey && onceDone(onceKey)) return null;

    const upsert = upsertOnlyfunPost(normalized);
    if (onceKey) markOnce(onceKey);
    if (!upsert.post) return null;

    if (upsert.inserted) {
      try { window.StoryBus?.emit?.("onlyfun:post", { post: upsert.post }); } catch {}
      try { window.dispatchEvent(new CustomEvent("onlyfun:post", { detail: { post: upsert.post } })); } catch {}

      if (step?.notify === true) {
        pushOnlyfunNotification(upsert.post, {
          ...ctx,
          notifyText: tplText(step?.notifyText || step?.preview || upsert.post.text || "")
        });
      }
    }

    recomputeOnlyfunBadgeFromStorage();
    return upsert.post;
  }

  function addHakPhoto(step) {
    const s = step || {};
    const image = String(s.image || s.url || s.src || "").trim();
    if (!image) return;

    const now = Date.now();
    const id = String(s.id || s.onceKey || (`evidence_${now}`)).trim();

    const item = {
      id,
      title: String(s.title || "EVIDENCE").trim() || "EVIDENCE",
      text: String(s.text || s.caption || "").trim(),
      image,
      at: now,
      seen: false
    };

    const list = getHakPhotos();

    // dedup: same id OR same image
    const exists = list.some(x =>
      x && (String(x.id || "") === id || String(x.image || "").trim() === image)
    );
    if (!exists) {
      list.unshift(item);
      setHakPhotos(list);
      bumpAppBadge("hak", 1);
    }

    try { window.StoryBus?.emit?.("hak:photo", item); } catch {}
    try { window.dispatchEvent(new CustomEvent("hak:photo", { detail: item })); } catch {}
  }

  // -------------------------
  // ✅ HAK GATE (wait until evidence is SEEN)
  // -------------------------
  const HAK_GATE_KEY = "hak_gate_v1";

  function setHakGate(step, storyJson) {
    void step;
    void storyJson;
    throw new Error("HAK gates are canonical; renderer writes are disabled");
  }

  function checkHakGateAndMaybeStart() {
    let gate = null;
    try { gate = window.GameStateEngine?.getState?.()?.hak?.gate || null; } catch {}
    if (!gate) {
      const raw = safeGetLS(HAK_GATE_KEY);
      gate = raw ? safeJsonParse(raw, null) : null;
    }
    if (!gate || !gate.startStory) return false;

    const required = Array.isArray(gate.required) ? gate.required : [];
    if (!required.length) return false;

    const list = getHakPhotos();
    let seenMap = {};
    try { seenMap = window.GameStateEngine?.getState?.()?.hak?.evidenceSeen || {}; } catch {}

    const ok = required.every((rid) => {
      const id = String(rid || "").trim();
      if (!id) return true;
      const item = list.find(x => String(x?.id || "") === id);
      return (!!item && item.seen === true) || seenMap[id] === true;
    });

    if (!ok) return false;

    const engine = window.GameStateEngine;
    if (engine && gate.gateId) {
      const state = engine.getGameplayState();
      const ack = engine.dispatch({
        type: "ACK_HAK_EVENT",
        commandId: `hak-gate-ack:${gate.gateId}`,
        expectedRevision: state.revision,
        payload: { eventId: gate.gateId }
      });
      if (!ack.ok && ack.status !== "DUPLICATE_COMMAND") return false;
    } else {
      safeRemLS(HAK_GATE_KEY);
    }

    if (typeof (window.Game ||= {}).startStory === "function") {
      window.Game.startStory(String(gate.startStory), {});
    }
    return true;
  }

  function waitMs(ms) {
    const dur = Math.max(0, Number(ms || 0) || 0);
    return new Promise((resolve) => setTimeout(resolve, dur));
  }

  function hasHakQueueItems() {
    const q = safeJsonParse(safeGetLS(HAK_AI_QUEUE_KEY), []);
    return Array.isArray(q) && q.length > 0;
  }

  function canonicalHakPresentationPayload(payload) {
    const execution = window.GameStateEngine?.getExecutionState?.();
    const pending = execution?.cursor?.pendingPresentationAck;
    if (pending?.kind !== "hak_overlay") return payload;
    return { ...payload, __canonicalPresentation: {
      operationId: pending.operationId,
      leaseId: execution.lease?.id,
      operationEpoch: Number(execution.operationEpoch || 0)
    } };
  }

  function skipRepeatedHakSkillAnnouncement(step) {
    const engine = window.GameStateEngine;
    const state = engine?.getGameplayState?.();
    const execution = state?.execution;
    const pending = execution?.cursor?.pendingPresentationAck;
    if (pending?.kind !== "hak_overlay" || !pending.operationId || !execution.lease?.id ||
        pending.operationId !== execution.cursor.operationId || execution.cursor.operationType !== "hak_overlay" ||
        execution.cursor.rootIndex !== 1 ||
        !window.HakSkillDefinitions?.isTranscriptionAnnouncementStory?.(execution.activeStoryId, execution.activeContactId)) return false;
    // Older saved payloads omitted skillId; the exact authored root operation
    // above still identifies them without matching visible text.
    const skillId = String(step?.skillId || "");
    if (skillId && !/^(love|ntr|nts)_audio_transcription_v1$/.test(skillId)) return false;
    // Lena's solo entry and Hailey's entry announce the same shared tier.
    // Each authored step still commits; another story's durable receipt is
    // the only authority for omitting its repeated presentation.
    if (!execution?.activeStoryId || !window.HakSkillDefinitions?.transcriptionAnnounced?.(state, execution.activeStoryId)) return false;
    return window.CanonicalStoryRuntime?.get?.().acknowledgePresentation?.({
      operationId: pending.operationId,
      leaseId: execution.lease.id,
      operationEpoch: Number(execution.operationEpoch || 0)
    })?.ok === true;
  }

  async function presentRestoredHakInteraction() {
    const interpreter = window.CanonicalStoryRuntime?.get?.();
    await interpreter?.restoreLegacyHakPresentation?.();
    const pending = window.GameStateEngine?.getExecutionState?.()?.cursor?.pendingPresentationAck;
    if (pending?.kind !== "hak_overlay") return false;
    if (skipRepeatedHakSkillAnnouncement(pending.payload)) return true;
    const closed = waitForHakOverlayClosed();
    if (!window.Game?._hakOverlayOpen) {
      window.Game?.showHakOverlay?.(canonicalHakPresentationPayload(pending.payload));
    }
    await closed;
    return true;
  }

  async function runHakOverlayStep(step = {}) {
    if (skipRepeatedHakSkillAnnouncement(step)) return;
    const payload = canonicalHakPresentationPayload({
      title: String(step.title || "HAK").trim() || "HAK",
      presentation: step.presentation,
      speaker: step.speaker,
      message: step.message || "",
      messages: Array.isArray(step.messages) ? step.messages : []
    });

    const q = safeJsonParse(safeGetLS(HAK_AI_QUEUE_KEY), []);
    const nextQueue = Array.isArray(q) ? q : [];
    nextQueue.push(payload);
    safeSetLS(HAK_AI_QUEUE_KEY, JSON.stringify(nextQueue));

    const overlayWaiter =
      (step?.waitForOverlay === false)
        ? null
        : waitForHakOverlayClosed(Number(step.overlayTimeoutMs || 180000) || 180000);
    const overlayDelay = Math.max(0, Number(step.overlayDelayMs ?? 40) || 0);
    if (overlayDelay > 0) await waitMs(overlayDelay);

    try { (window.Game ||= {}).showHakOverlayFromQueue?.(); } catch {}

    if (overlayWaiter) {
      const overlayTimeoutMs = Number(step.overlayTimeoutMs || 180000) || 180000;
      let closed = await overlayWaiter;
      while (!closed && (window.Game ||= {})._hakOverlayOpen) {
        closed = await waitForHakOverlayClosed(overlayTimeoutMs);
      }
    }
  }

  function normalizeHakUnlockGlitch(step = {}) {
    const input = (step?.glitch && typeof step.glitch === "object") ? step.glitch : step;
    const has =
      Object.prototype.hasOwnProperty.call(input || {}, "ms") ||
      Object.prototype.hasOwnProperty.call(input || {}, "duration") ||
      Object.prototype.hasOwnProperty.call(input || {}, "intensity");
    if (!has) return null;

    return {
      ms: Number(input.ms ?? input.duration ?? 1200) || 1200,
      intensity: Number(input.intensity ?? 2.2) || 2.2
    };
  }

  function getCurrentSceneName() {
    const Game = (window.Game ||= {});
    if (Game.currentScene) return String(Game.currentScene);
    const el = document.querySelector("[data-scene]");
    return el ? String(el.getAttribute("data-scene") || "") : "";
  }

  function waitForScene(targetScene, timeoutMs = 3200) {
    const wanted = canonicalId(targetScene || "");
    if (!wanted) return Promise.resolve(false);
    if (canonicalId(getCurrentSceneName()) === wanted) return Promise.resolve(true);

    return new Promise((resolve) => {
      let done = false;
      let timeoutId = null;

      const finish = (ok) => {
        if (done) return;
        done = true;
        try { window.removeEventListener("scene:mounted", onMounted); } catch {}
        if (timeoutId) {
          try { clearTimeout(timeoutId); } catch {}
        }
        resolve(!!ok);
      };

      const onMounted = (ev) => {
        const name = canonicalId(
          ev?.detail?.name || ev?.detail?.id || ev?.detail?.scene || getCurrentSceneName()
        );
        if (name === wanted) finish(true);
      };

      try { window.addEventListener("scene:mounted", onMounted); } catch {}
      timeoutId = setTimeout(() => finish(false), Math.max(300, Number(timeoutMs || 3200) || 3200));

      if (canonicalId(getCurrentSceneName()) === wanted) finish(true);
    });
  }

  function waitForHakOverlayClosed(timeoutMs = 180000) {
    return new Promise((resolve) => {
      const Game = (window.Game ||= {});
      let seenOpen = !!Game._hakOverlayOpen;
      let done = false;
      let pollId = null;
      let timeoutId = null;
      let startupId = null;

      const finish = (ok) => {
        if (done) return;
        done = true;
        try { window.removeEventListener("hak:overlay-opened", onOpen); } catch {}
        try { window.removeEventListener("hak:overlay-closed", onClose); } catch {}
        try { window.removeEventListener("hak:overlay-retired", onRetired); } catch {}
        if (pollId) {
          try { clearInterval(pollId); } catch {}
        }
        if (timeoutId) {
          try { clearTimeout(timeoutId); } catch {}
        }
        if (startupId) {
          try { clearTimeout(startupId); } catch {}
        }
        resolve(!!ok);
      };

      const onOpen = () => { seenOpen = true; };
      const onClose = () => finish(true);
      const onRetired = () => finish(false);

      const tick = () => {
        if (Game._hakOverlayOpen) {
          seenOpen = true;
          return;
        }
        if (seenOpen) {
          finish(true);
        }
      };

      try { window.addEventListener("hak:overlay-opened", onOpen); } catch {}
      try { window.addEventListener("hak:overlay-closed", onClose); } catch {}
      try { window.addEventListener("hak:overlay-retired", onRetired); } catch {}

      pollId = setInterval(tick, 120);
      timeoutId = setTimeout(() => finish(false), Math.max(1500, Number(timeoutMs || 180000) || 180000));
      startupId = setTimeout(() => {
        if (!seenOpen && !hasHakQueueItems() && !Game._hakOverlayOpen) finish(true);
      }, 1400);

      tick();
    });
  }

  function primeHakUnlockState(level, step = {}) {
    try {
      safeSetLS("feature_hak_unlocked_anim", "1");
    } catch {}
  }

  async function runHakUnlockStep(step = {}) {
    const wantsCinematicLock = step?.cinematicLock !== false;
    if (wantsCinematicLock) setGlobalCinematicLock(true, "hak_unlock");
    try {
      const preDelay = Math.max(0, Number(step.preDelayMs ?? step.preDelay ?? 0) || 0);
      if (preDelay > 0) await waitMs(preDelay);

      const payload = canonicalHakPresentationPayload({
        level: step.level || 1,
        title: step.title || "HAK",
        presentation: step.presentation,
        speaker: step.speaker,
        message: step.message || "",
        messages: Array.isArray(step.messages) ? step.messages : []
      });

      const q = safeJsonParse(safeGetLS(HAK_AI_QUEUE_KEY), []);
      const nextQueue = Array.isArray(q) ? q : [];
      nextQueue.push(payload);
      safeSetLS(HAK_AI_QUEUE_KEY, JSON.stringify(nextQueue));

      primeHakUnlockState(payload.level, step);

      const glitch = normalizeHakUnlockGlitch(step);
      if (glitch) {
        playGlitchStep(glitch);
        if (step?.waitForGlitch !== false) {
          await waitMs((Number(glitch.ms) || 1200) + 70);
        }
      }

      const goHomeDelay = Number(
        step.goHomeDelayMs ??
        (glitch ? 90 : 1100)
      ) || 0;
      if (goHomeDelay > 0) await waitMs(goHomeDelay);

      if (typeof window.navigateToScene === "function") {
        try { window.navigateToScene("home", { glitch: 1, from: "hak_unlock" }); } catch {
          try { window.navigateToScene("home"); } catch {}
        }
      }

      await waitForScene("home", Number(step.sceneWaitMs || 3500) || 3500);

      const overlayWaiter =
        (step?.waitForOverlay === false)
          ? null
          : waitForHakOverlayClosed(Number(step.overlayTimeoutMs || 180000) || 180000);
      const overlayDelay = Math.max(0, Number(step.overlayDelayMs ?? 140) || 0);
      if (overlayDelay > 0) await waitMs(overlayDelay);

      try { (window.Game ||= {}).showHakOverlayFromQueue?.(); } catch {}

      if (overlayWaiter) {
        // Do not advance past HAK unlock while the cinematic overlay is still open.
        // Timeout windows are treated as keep-waiting chunks to prevent idle overrun.
        const overlayTimeoutMs = Number(step.overlayTimeoutMs || 180000) || 180000;
        let closed = await overlayWaiter;
        while (!closed && (window.Game ||= {})._hakOverlayOpen) {
          closed = await waitForHakOverlayClosed(overlayTimeoutMs);
        }
      }
    } finally {
      if (wantsCinematicLock) {
        setTimeout(() => {
          const g = (window.Game ||= {});
          if (!g._hakOverlayOpen) setGlobalCinematicLock(false, "hak_unlock_done");
        }, 40);
      }
    }
  }

  function revealHakAppOnHome() {
    let alreadyVisible = false;
    try { alreadyVisible = window.GameStateEngine?.getState?.()?.hak?.visible === true; } catch {}

    if (!alreadyVisible) {
      safeSetLS("feature_hak_unlocked_anim", "1");
      safeSetLS(HOME_POP_APP_KEY, "hak");
    }

    try {
      window.dispatchEvent(new CustomEvent("hak:visibility-changed", {
        detail: {
          visible: true,
          firstReveal: !alreadyVisible,
          at: Date.now()
        }
      }));
    } catch {}
  }

  // -------------------------
  // ✅ DEV OVERLAY helpers (uses #dev-overlay from index.html)
  // -------------------------
  const PATREON_URL_PLACEHOLDER = "<PUT_YOUR_PATREON_TIER_URL_HERE>";
  const PATREON_FALLBACK_URL = "https://www.patreon.com/cw/FreNchTR";
  const SUBSCRIBESTAR_URL = "https://subscribestar.art/frenchtr";
  const DEV_PATREON_TIERS = [
    {
      "id": "voyeur",
      "name": "VOYEUR",
      "priceLabel": "5",
      "priceEur": 5,
      "benefits": [
        {
          "key": "game_access",
          "text": "Full game access"
        },
        {
          "key": "discord_selected",
          "text": "Access to selected Discord channels"
        },
        {
          "key": "early_builds",
          "text": "Early access to new releases"
        },
        {
          "key": "dev_updates",
          "text": "Development updates and progress posts"
        }
      ],
      "points": {
        "key": "points_voyeur",
        "text": "+30 Card Vault points"
      },
      "url": "<PUT_YOUR_PATREON_TIER_URL_HERE>",
      "banner": "assets/pictures/Patreon/voyeur.jpg"
    },
    {
      "id": "big_lover",
      "name": "BIG LOVER",
      "priceLabel": "10",
      "priceEur": 10,
      "benefits": [
        {
          "key": "all_voyeur",
          "text": "All Voyeur benefits"
        },
        {
          "key": "discord_full",
          "text": "Full Discord access and community discussions"
        },
        {
          "key": "story_votes",
          "text": "Vote on selected story elements"
        },
        {
          "key": "vote_one",
          "text": "Voting power: 1 vote counts as 1"
        }
      ],
      "points": {
        "key": "points_big_lover",
        "text": "+100 Card Vault points"
      },
      "url": "<PUT_YOUR_PATREON_TIER_URL_HERE>",
      "banner": "assets/pictures/Patreon/big_lover.jpg"
    },
    {
      "id": "ntr_overlord",
      "name": "NTR OVERLORD",
      "priceLabel": "20",
      "priceEur": 20,
      "benefits": [
        {
          "key": "all_big_lover",
          "text": "All Big Lover benefits"
        },
        {
          "key": "test_builds",
          "text": "Play test builds and unfinished versions earlier, while the next update is still in development",
          "highlight": true
        },
        {
          "key": "previews",
          "text": "Exclusive previews of upcoming content"
        },
        {
          "key": "vote_two",
          "text": "Voting power: 1 vote counts as 2"
        }
      ],
      "points": {
        "key": "points_ntr_overlord",
        "text": "+500 Card Vault points"
      },
      "url": "<PUT_YOUR_PATREON_TIER_URL_HERE>",
      "banner": "assets/pictures/Patreon/ntr_overlord.jpg"
    },
    {
      "id": "full_support",
      "name": "ULTIMATE SUPPORTER",
      "priceLabel": "49,99",
      "priceEur": 49.99,
      "benefits": [
        {
          "key": "all_overlord",
          "text": "All NTR Overlord benefits, including early test builds"
        },
        {
          "key": "custom_five",
          "text": "Request 5 custom images",
          "highlight": true
        },
        {
          "key": "badge",
          "text": "Exclusive supporter badge"
        },
        {
          "key": "vote_four",
          "text": "Voting power: 1 vote counts as 4"
        }
      ],
      "points": {
        "key": "points_full_support",
        "text": "+1,000 Card Vault points"
      },
      "url": "<PUT_YOUR_PATREON_TIER_URL_HERE>",
      "banner": "assets/pictures/Patreon/ultimate_supporter.jpg"
    }
  ];
  const DEV_SUBSCRIBESTAR_TIERS = DEV_PATREON_TIERS.map((tier) => ({
    ...tier,
    url: SUBSCRIBESTAR_URL
  }));
  let devPatreonUiBound = false;

  function euroToUsd(eur) {
    const rate = 1.10;
    return (eur * rate).toFixed(2);
  }

  function parseEuroValue(raw) {
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    const normalized = String(raw || "").replace(",", ".").replace(/[^\d.]/g, "");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  }

  function resolveExternalUrl(rawUrl) {
    const url = String(rawUrl || "").trim();
    if (!url || url === PATREON_URL_PLACEHOLDER) return PATREON_FALLBACK_URL;
    return url;
  }

  async function openExternalUrl(rawUrl) {
    const url = resolveExternalUrl(rawUrl);
    if (!url) return false;
    const isElectron = !!(window?.process?.versions?.electron);

    try {
      if (window.Game && typeof window.Game.openExternalUrl === "function") {
        const ok = await window.Game.openExternalUrl(url);
        if (ok) return true;
      }
    } catch {}

    try {
      if (window.electronAPI && typeof window.electronAPI.openExternal === "function") {
        const result = await window.electronAPI.openExternal(url);
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

    try {
      window.open(url, "_blank", "noopener,noreferrer");
      return true;
    } catch {}

    return false;
  }

  function setDevSupportText(element, key, source) {
    element.setAttribute("data-i18n", `dev_support.${key}`);
    element.setAttribute("data-i18n-source", source);
    element.textContent = window.Game?.i18n?.ui?.(`dev_support.${key}`, source) || source;
  }

  function createDevTierCard(tier, provider) {
    const providerClass = provider ? ` dev-tier-card--${String(provider).trim()}` : "";
    const card = document.createElement("article");
    card.className = `dev-tier-card${providerClass}`;
    card.setAttribute("role", "listitem");
    card.dataset.tier = tier.id;

    const banner = document.createElement("div");
    banner.className = "dev-tier-banner";
    const bannerPath = String(tier?.banner || "").trim();
    if (bannerPath) {
      const img = document.createElement("img");
      img.alt = `${String(tier?.name || "Tier")} banner`;
      img.loading = "lazy";
      img.src = bannerPath;
      img.addEventListener("error", () => {
        card.classList.add("dev-tier-no-image");
        try { img.remove(); } catch {}
      }, { once: true });
      banner.appendChild(img);
    } else {
      card.classList.add("dev-tier-no-image");
    }
    card.appendChild(banner);

    const body = document.createElement("div");
    body.className = "dev-tier-body";

    const nameEl = document.createElement("div");
    nameEl.className = "dev-tier-name";
    nameEl.textContent = String(tier?.name || "").toUpperCase();
    body.appendChild(nameEl);

    const priceEl = document.createElement("div");
    priceEl.className = "dev-tier-price";
    const eurValue = parseEuroValue(tier?.priceEur ?? tier?.priceLabel);
    const usd = euroToUsd(eurValue);
    const eurLabel = String(tier?.priceLabel || eurValue).trim();
    priceEl.appendChild(document.createTextNode(`${eurLabel} € `));
    const periodEl = document.createElement("span");
    setDevSupportText(periodEl, "per_month", "/ month");
    priceEl.appendChild(periodEl);
    const usdEl = document.createElement("span");
    usdEl.className = "price-usd";
    usdEl.textContent = `(≈ $${usd})`;
    priceEl.appendChild(usdEl);
    body.appendChild(priceEl);

    const pointsEl = document.createElement("div");
    pointsEl.className = "dev-tier-points";
    setDevSupportText(pointsEl, tier.points.key, tier.points.text);
    body.appendChild(pointsEl);

    const listEl = document.createElement("ul");
    listEl.className = "dev-tier-benefits";
    const benefits = Array.isArray(tier?.benefits) ? tier.benefits : [];
    for (const entry of benefits) {
      const li = document.createElement("li");
      if (entry.highlight) li.className = "dev-tier-benefit-highlight";
      setDevSupportText(li, entry.key, entry.text);
      listEl.appendChild(li);
    }
    body.appendChild(listEl);

    const joinBtn = document.createElement("button");
    joinBtn.type = "button";
    joinBtn.className = "dev-tier-join";
    setDevSupportText(joinBtn, "join", "Join");
    joinBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void openExternalUrl(tier?.url);
    });
    joinBtn.addEventListener("pointerdown", (event) => event.stopPropagation());
    body.appendChild(joinBtn);

    card.appendChild(body);
    return card;
  }

  function renderDevTierGrid(gridId, tiers, provider) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.tabIndex = 0;

    if (grid.dataset.rendered !== "1") {
      grid.innerHTML = "";
      const frag = document.createDocumentFragment();
      for (const tier of tiers) {
        frag.appendChild(createDevTierCard(tier, provider));
      }
      grid.appendChild(frag);
      grid.dataset.rendered = "1";
    }
  }

  function ensureDevMembershipUi() {
    renderDevTierGrid("patreon-tier-grid", DEV_PATREON_TIERS, "patreon");
    renderDevTierGrid("subscribestar-tier-grid", DEV_SUBSCRIBESTAR_TIERS, "subscribestar");
    window.Game?.i18n?.applyTo?.(document.getElementById("dev-card"));

    if (!devPatreonUiBound) {
      const card = document.getElementById("dev-card");
      if (card) {
        const swallow = (event) => event.stopPropagation();
        card.addEventListener("click", swallow);
        card.addEventListener("pointerdown", swallow);
      }
      devPatreonUiBound = true;
    }
  }

  function ensureDevPatreonUi() {
    ensureDevMembershipUi();
  }

  function showDevOverlay(step) {
    const overlay = document.getElementById("dev-overlay");
    const textEl  = document.getElementById("dev-text");
    const titleEl = document.getElementById("dev-title");
    const btn     = document.getElementById("dev-end");
    if (!overlay || !textEl || !btn) return false;

    ensureDevMembershipUi();

    const title  = String(step?.title || "DEVELOPER").trim();
    const text   = tplText(step?.text || "").trim();
    const button = String(step?.button || "( CONTINUE )").trim();

    if (titleEl) titleEl.textContent = title || "DEVELOPER";
    textEl.textContent = text;
    btn.textContent = button || "( CONTINUE )";

    overlay.classList.add("show");
    overlay.setAttribute("aria-hidden", "false");
    try { document.body.classList.add("overlay-open"); } catch {}

    const onClose = () => {
      overlay.classList.remove("show");
      overlay.setAttribute("aria-hidden", "true");
      try { document.body.classList.remove("overlay-open"); } catch {}
      btn.removeEventListener("click", onClose);

      try { window.StoryBus?.emit?.("dev:closed", { at: Date.now() }); } catch {}
      try { window.dispatchEvent(new CustomEvent("dev:closed", { detail: { at: Date.now() } })); } catch {}

      if (step?.goHome && typeof window.navigateToScene === "function") {
        window.navigateToScene("home");
      }
    };

    btn.addEventListener("click", onClose);
    return true;
  }

  let hakWatchlistUi = null;

  function ensureHakWatchlistOverlay() {
    if (
      hakWatchlistUi &&
      hakWatchlistUi.overlay &&
      hakWatchlistUi.overlay.isConnected
    ) {
      return hakWatchlistUi;
    }

    let overlay = document.getElementById("hak-watchlist-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "hak-watchlist-overlay";
      overlay.setAttribute("aria-hidden", "true");
      overlay.innerHTML = [
        '<div id="hak-watchlist-card" role="dialog" aria-label="HAK watchlist">',
        '  <div id="hak-watchlist-head">',
        '    <div id="hak-watchlist-title">HAK//SURVEILLANCE TARGETS</div>',
        '    <div id="hak-watchlist-hint">Select or deselect targets.</div>',
        "  </div>",
        '  <div id="hak-watchlist-info" role="note" aria-label="HAK watchlist notice">',
        '    <div id="hak-watchlist-info-title">HAK//NOTICE</div>',
        '    <div id="hak-watchlist-info-text">Unchecked targets will be excluded from progression. You will no longer receive messages or story events from them.</div>',
        "  </div>",
        '  <div id="hak-watchlist-list"></div>',
        '  <div id="hak-watchlist-warning" role="status" aria-live="polite"></div>',
        '  <div id="hak-watchlist-actions">',
        '    <button type="button" id="hak-watchlist-select-all">Select all</button>',
        '    <button type="button" id="hak-watchlist-clear">Clear</button>',
        '    <button type="button" id="hak-watchlist-confirm">Confirm</button>',
        "  </div>",
        "</div>"
      ].join("");
      document.body.appendChild(overlay);
    }

    hakWatchlistUi = {
      overlay,
      titleEl: document.getElementById("hak-watchlist-title"),
      hintEl: document.getElementById("hak-watchlist-hint"),
      listEl: document.getElementById("hak-watchlist-list"),
      warningEl: document.getElementById("hak-watchlist-warning"),
      btnSelectAll: document.getElementById("hak-watchlist-select-all"),
      btnClear: document.getElementById("hak-watchlist-clear"),
      btnConfirm: document.getElementById("hak-watchlist-confirm")
    };
    return hakWatchlistUi;
  }

  function normalizeWatchlistTargets(rawTargets) {
    const input = Array.isArray(rawTargets) ? rawTargets : [];
    const out = [];
    const seen = new Set();
    for (const t of input) {
      const id = canonicalId(t?.id || t?.key || t?.name || "");
      if (!id || seen.has(id) || !SELECTABLE_CHARACTER_ID_SET.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        label: tplText(t?.label || t?.name || id),
        avatar: String(t?.avatar || t?.image || t?.src || "").trim()
      });
    }
    return out;
  }

  function showHakWatchlistOverlay(step = {}, authority = null) {
    const ui = ensureHakWatchlistOverlay();
    const overlay = ui?.overlay;
    if (!overlay || !ui.listEl || !ui.btnConfirm) {
      return Promise.resolve(
        sanitizeWatchlistSelectionForPatreon(Array.isArray(step.defaultSelected) ? step.defaultSelected : [])
      );
    }

    const storeKey = normalizeWatchlistKey(step.storeKey || step.key || HAK_WATCHLIST_DEFAULT_KEY);
    const targets = normalizeWatchlistTargets(step.targets);
    const allowNone = Object.prototype.hasOwnProperty.call(step, "allowNone") ? !!step.allowNone : true;
    const title = tplText(step.title || "HAK//SURVEILLANCE TARGETS");
    const rawHint = tplText(step.hint || "Select or deselect targets.");
    const hint = window.Game?.formatHakNoticeText?.(rawHint) || rawHint;
    const defaultSelected = sanitizeWatchlistSelectionForPatreon(step.defaultSelected)
      .filter((id) => SELECTABLE_CHARACTER_ID_SET.has(id));
    ensureCharacterActiveDefaults(targets.map((t) => t.id));
    const allowedIds = new Set(targets.map((t) => t.id));
    const storedState = readWatchlistState(storeKey);
    const initialSelected = storedState.hasPersisted
      ? sanitizeWatchlistSelectionForPatreon(storedState.selected)
      : defaultSelected;
    const selected = new Set(initialSelected.filter((id) => allowedIds.has(id)));

    if (!targets.length) {
      const fallbackSelected = sanitizeWatchlistSelectionForPatreon(defaultSelected);
      return Promise.resolve(fallbackSelected);
    }

    return new Promise((resolve, reject) => {
      const Game = (window.Game ||= {});
      const wasOpen = !!Game._hakOverlayOpen;
      let closed = false;

      function cleanup() {
        ui.btnConfirm.removeEventListener("click", onConfirm);
        ui.btnSelectAll?.removeEventListener("click", onSelectAll);
        ui.btnClear?.removeEventListener("click", onClear);
        overlay.removeEventListener("click", onOverlayClick, true);
        window.removeEventListener("keydown", onKeyDown, true);
        window.removeEventListener("patreon:master-unlock-changed", onPatreonUnlockChanged);
      }

      if (authority) authority.cancel = () => {
        if (closed) return;
        closed = true;
        cleanup();
        if (authority.owns()) {
          overlay.classList.remove("show");
          overlay.setAttribute("aria-hidden", "true");
          try { document.body.classList.remove("overlay-open"); } catch {}
          Game._hakOverlayOpen = !!wasOpen;
        }
        reject(Object.assign(new Error("HAK watchlist presentation retired"), { code: "STALE_HAK_WATCHLIST_PRESENTATION" }));
      };

      function closeWithCurrentSelection() {
        if (authority && !authority.current()) { authority.cancel(); return; }
        if (closed) return;
        closed = true;
        cleanup();
        overlay.classList.remove("show");
        overlay.setAttribute("aria-hidden", "true");
        try { document.body.classList.remove("overlay-open"); } catch {}
        Game._hakOverlayOpen = !!wasOpen;

        const ordered = targets
          .map((t) => t.id)
          .filter((id) => selected.has(id));
        resolve(ordered);
      }

      function syncValidation() {
        const invalid = !allowNone && selected.size === 0;
        if (ui.warningEl) {
          ui.warningEl.textContent = invalid ? "Select at least one target." : "";
          ui.warningEl.style.display = invalid ? "block" : "none";
        }
        ui.btnConfirm.disabled = invalid;
        ui.btnConfirm.setAttribute("aria-disabled", invalid ? "true" : "false");
      }

      function onToggle(id, checked) {
        if (checked) selected.add(id);
        else selected.delete(id);
        syncValidation();
      }

      function onPatreonUnlockChanged() {
        const sanitized = sanitizeWatchlistSelectionForPatreon(Array.from(selected));
        selected.clear();
        sanitized.forEach((id) => selected.add(id));
        renderRows();
        syncValidation();
      }

      function getAvatarInitials(rawLabel, fallbackId = "") {
        const clean = String(rawLabel || "")
          .replace(/\{\{[^}]+\}\}/g, "")
          .trim();
        const parts = clean.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
          return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
        }
        if (parts.length === 1) {
          return parts[0].slice(0, 2).toUpperCase();
        }
        return String(fallbackId || "?").slice(0, 2).toUpperCase();
      }

      function createAvatarNode(target) {
        const avatar = document.createElement("span");
        avatar.className = "hak-watchlist-avatar";

        const img = document.createElement("img");
        img.className = "hak-watchlist-avatar-img";
        img.alt = "";

        const fallback = document.createElement("span");
        fallback.className = "hak-watchlist-avatar-fallback";
        fallback.textContent = getAvatarInitials(target.label, target.id);

        avatar.appendChild(img);
        avatar.appendChild(fallback);

        const src = String(target.avatar || "").trim();
        if (src) {
          img.addEventListener("load", () => {
            avatar.classList.add("has-image");
          }, { once: true });
          img.addEventListener("error", () => {
            try { img.removeAttribute("src"); } catch {}
            avatar.classList.remove("has-image");
          }, { once: true });
          img.src = src;
          if (img.complete && img.naturalWidth > 0) {
            avatar.classList.add("has-image");
          }
        }

        return avatar;
      }

      function syncToggleButton(toggleEl, isOn) {
        const on = !!isOn;
        toggleEl.classList.toggle("is-on", on);
        toggleEl.setAttribute("aria-pressed", on ? "true" : "false");
      }

      function renderRows() {
        ui.listEl.innerHTML = "";

        for (const target of targets) {
          const row = document.createElement("div");
          row.className = "hak-watchlist-row";
          row.setAttribute("data-target-id", target.id);

          const avatar = createAvatarNode(target);

          const label = document.createElement("div");
          label.className = "hak-watchlist-label";
          const displayLabel = String(target.label || target.id);
          label.textContent = displayLabel;
          const toggle = document.createElement("button");
          toggle.type = "button";
          toggle.className = "hak-watchlist-toggle";
          toggle.setAttribute("aria-label", `Monitor ${displayLabel}`);

          const knob = document.createElement("span");
          knob.className = "hak-watchlist-toggle-knob";
          knob.setAttribute("aria-hidden", "true");
          toggle.appendChild(knob);
          syncToggleButton(toggle, selected.has(target.id));
          toggle.addEventListener("click", (e) => {
            e.preventDefault();
            const nextState = !selected.has(target.id);
            onToggle(target.id, nextState);
            syncToggleButton(toggle, nextState);
          });

          row.addEventListener("click", (e) => {
            const withinToggle = e?.target?.closest?.(".hak-watchlist-toggle");
            if (withinToggle) return;
            toggle.click();
          });

          row.appendChild(avatar);
          row.appendChild(label);
          row.appendChild(toggle);
          ui.listEl.appendChild(row);
        }
      }

      function onSelectAll(e) {
        e.preventDefault();
        for (const t of targets) {
          selected.add(t.id);
        }
        renderRows();
        syncValidation();
      }

      function onClear(e) {
        e.preventDefault();
        selected.clear();
        renderRows();
        syncValidation();
      }

      function onConfirm(e) {
        e.preventDefault();
        if (!allowNone && selected.size === 0) {
          syncValidation();
          return;
        }
        closeWithCurrentSelection();
      }

      function onOverlayClick(e) {
        if (e.target === overlay) {
          e.preventDefault();
          e.stopPropagation();
        }
      }

      function onKeyDown(e) {
        const target = e.target;
        if (target && target.closest && target.closest("input, textarea, button, select, [contenteditable]")) return;
        if (e.key === "Enter") {
          if (ui.btnConfirm.disabled) return;
          e.preventDefault();
          e.stopPropagation();
          closeWithCurrentSelection();
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
        }
      }

      if (ui.titleEl) ui.titleEl.textContent = title;
      if (ui.hintEl) ui.hintEl.textContent = hint;

      renderRows();
      syncValidation();

      ui.btnConfirm.addEventListener("click", onConfirm);
      ui.btnSelectAll?.addEventListener("click", onSelectAll);
      ui.btnClear?.addEventListener("click", onClear);
      overlay.addEventListener("click", onOverlayClick, true);
      window.addEventListener("keydown", onKeyDown, true);
      window.addEventListener("patreon:master-unlock-changed", onPatreonUnlockChanged);

      Game._hakOverlayOpen = true;
      try { document.body.classList.add("overlay-open"); } catch {}
      overlay.classList.add("show");
      overlay.setAttribute("aria-hidden", "false");
    });
  }

  let activeHakWatchlistPresentation = null;

  function hakWatchlistPresentationScope(engine) {
    const identity = engine?.getRuntimeLifecycleIdentity?.() || {};
    const execution = engine?.getExecutionState?.() || {};
    const cursor = execution.cursor || {};
    // INPUT_REQUIRED can be committed between two resume callers. The
    // position, rather than the presence of pendingUserIntent, owns this UI.
    return JSON.stringify({ identity, storyId: execution.activeStoryId || "", storyPath: execution.activeStoryPath || "", generation: execution.generation || 0, leaseId: execution.lease?.id || "", leaseGeneration: execution.lease?.generation || 0, rootIndex: cursor.rootIndex || 0, branchPath: cursor.branchPath || [] });
  }

  function runHakWatchlist(step = {}) {
    const normalizedStep = normalizeHakCharacterSelectionStep(step);
    const engine = window.GameStateEngine;
    const scope = hakWatchlistPresentationScope(engine);
    const config = JSON.stringify({ storeKey: normalizedStep.storeKey, key: normalizedStep.key, title: normalizedStep.title, hint: normalizedStep.hint, allowAll: normalizedStep.allowAll, allowNone: normalizedStep.allowNone, revealApp: normalizedStep.revealApp, defaultSelected: normalizedStep.defaultSelected, targets: normalizedStep.targets.map(target => ({ id: target.id, label: target.label, avatar: target.avatar })) });
    const existing = activeHakWatchlistPresentation;
    if (existing && existing.current() && existing.config === config) return existing.promise;
    existing?.cancel?.();

    const owner = { engine, scope, config, promise: null, cancel: null, unsubscribe: null };
    owner.owns = () => activeHakWatchlistPresentation === owner;
    owner.current = () => owner.owns() && window.GameStateEngine === engine && hakWatchlistPresentationScope(engine) === scope;
    activeHakWatchlistPresentation = owner;
    let resolveOwned, rejectOwned;
    owner.promise = new Promise((resolve, reject) => { resolveOwned = resolve; rejectOwned = reject; });
    const finish = () => {
      owner.unsubscribe?.();
      owner.unsubscribe = null;
      if (owner.owns()) activeHakWatchlistPresentation = null;
    };
    try {
      const presentation = showHakWatchlistOverlay(normalizedStep, owner);
      owner.unsubscribe = engine?.subscribe?.((events) => {
        const reconstructed = (events || []).some(event => ["save:restored", "save:resumed", "playthrough:reset", "initialization:committed"].includes(event.type));
        if (reconstructed || !owner.current()) owner.cancel?.();
      });
      presentation.then(selected => {
        if (!owner.current()) { finish(); rejectOwned(Object.assign(new Error("HAK watchlist presentation retired"), { code: "STALE_HAK_WATCHLIST_PRESENTATION" })); return; }
        finish();
        const storeKey = normalizeWatchlistKey(normalizedStep.storeKey || normalizedStep.key || HAK_WATCHLIST_DEFAULT_KEY);
        const saved = writeWatchlistState(storeKey, selected);
        ifDebugLog("hak_watchlist_saved", { storeKey, selected: saved, targetsKey: HAK_TARGETS_KEY });
        resolveOwned(saved);
      }, error => { finish(); rejectOwned(error); }).catch(error => { finish(); rejectOwned(error); });
    } catch (error) { finish(); rejectOwned(error); }
    return owner.promise;
  }
  HAK.openWatchlistStep = function openWatchlistStepPublic(step = {}) {
    return runHakWatchlist(step);
  };

  function getOpenConversationId() {
    const o = safeGetLS("openConversationId") || "";
    const a = safeGetLS("activeConversationId") || "";
    return resolveContactId(o || a, "");
  }

  function chapterTransitionIsFuture(text, opts = {}) {
    const requested = Number(opts.dayNumber || opts.day) || explicitChapterDayNumber(text) || chapterDayNumberFromStoryPath(opts.startStory || opts.targetStoryPath || "");
    const current = Number(window.GameStateEngine?.getWorldDay?.() || 0);
    return current > 0 && requested > current;
  }

  function chapterLifecycleCurrent(engine, identity, generation = null) {
    if (window.GameStateEngine !== engine) return false;
    if (generation !== null && Number(window.Game?.__chapterDayBoundaryGeneration || 0) !== generation) return false;
    if (!identity) return true;
    const current = engine?.getRuntimeLifecycleIdentity?.();
    return !!current && current.playthroughId === identity.playthroughId && current.playthroughGeneration === identity.playthroughGeneration && current.operationEpoch === identity.operationEpoch;
  }

  function inferConversationChapterCheckpoint(text, opts = {}) {
    if (opts.reason === "canonical_day_completion") {
      // The canonical day subscriber captures the committed boundary even
      // when there is no authored card. The card remains presentation only.
      if (window.Game?.__chapterDayBoundaryEngine === window.GameStateEngine) return null;
      if (!opts.sourceStoryPath || !opts.targetStoryPath) return null;
      return buildChapterCheckpointFromTransition({currentStoryPath: opts.sourceStoryPath, transitionTitle: text, targetStoryPath: opts.targetStoryPath, at: Date.now()});
    }
    const scene = canonicalId(getCurrentSceneName());
    if (scene !== "conversation") return null;

    const cid = canonicalId(getOpenConversationId());
    if (!cid) return null;

    const storyPath = String(safeGetLS("conv_story_" + cid) || "").trim();
    const targetStoryPath = normalizeStoryPath(opts?.startStory || opts?.storyPath || opts?.story || "");
    if (!storyPath) return null;

    return buildChapterCheckpointFromTransition({
      currentStoryPath: storyPath,
      transitionTitle: text,
      targetStoryPath,
      at: Date.now()
    });
  }

  // Every day-boundary read the subscriber below needs is a narrow field, and
  // getState() clones the entire canonical state on each engine commit -- the
  // exact cost tools/qa/codex_engine_subscriber_getstate_hotpath_scan.js
  // polices. Only the chronology fallback genuinely needs the whole state
  // (ConditionGrammar evaluates world/progression/hak together), and it runs
  // only when no committed path already names the new day, so it is kept here
  // as a named, reviewable read instead of a per-commit clone in the callback.
  function resolveCanonicalDayBoundaryTarget(engine, day) {
    const state = engine?.getState?.();
    if (!state) return "";
    const next = window.ConditionGrammar?.getNextCanonicalStory?.(state, window.StoryAdmissionCatalog, {day, service: window.GameTimeService});
    return chapterDayNumberFromStoryPath(next?.path) === day ? normalizeStoryPath(next.path) : "";
  }

  function installChapterDayTransitionHook() {
    const engine = window.GameStateEngine;
    const game = (window.Game ||= {});
    if (!engine?.subscribe || game.__chapterDayBoundaryEngine === engine) return false;
    game.__chapterDayBoundaryUnsubscribe?.();
    game.__chapterDayBoundaryEngine = engine;
    game.__chapterDayBoundaryGeneration = Number(game.__chapterDayBoundaryGeneration || 0) + 1;
    let observedDay = Number(engine.getWorldDay?.()) || 0;
    game.__chapterDayBoundaryUnsubscribe = engine.subscribe(events => {
      if (window.GameStateEngine !== engine) return;
      if (events.some(event => ["save:restored", "save:resumed", "playthrough:reset", "initialization:committed"].includes(event.type))) {
        // A checkpoint initialization can preserve every numeric engine ID.
        // Retire only this runtime's pending chapter work, not earned slots.
        game.__chapterDayBoundaryGeneration++;
        observedDay = Number(engine.getWorldDay?.()) || 0;
        return;
      }
      const changed = events.find(event => event.type === "world:day-changed" && Number(event.day) > observedDay);
      observedDay = Number(engine.getWorldDay?.()) || observedDay;
      if (!changed) return;
      const day = Number(changed.day);
      if (Number(engine.getWorldDay?.()) !== day) return;
      const pending = engine.getPendingStory?.();
      const paths = [
        ...events.filter(event => event.type === "story:time-card-committed").map(event => event.targetStoryPath),
        engine.getExecutionState?.()?.activeStoryPath,
        pending?.path,
        pending?.storyPath
      ];
      let target = paths.map(normalizeStoryPath).find(path => chapterDayNumberFromStoryPath(path) === day);
      if (!target) target = resolveCanonicalDayBoundaryTarget(engine, day);
      if (!target) return;
      // upsert freezes the actual committed snapshot synchronously, before
      // SaveSystem.ready yields. Its lifetime guard retires old Load callbacks.
      const saving = upsertChapterCheckpoint({title: "DAY " + day, storyPath: target, startStory: target, nextStory: target, startIndex: 0, at: Date.now()});
      game.__chapterDayBoundarySave = saving;
      game.__chapterDayBoundaryPending = {day, storyPath: target, engine, identity: engine.getRuntimeLifecycleIdentity?.(),
        generation: game.__chapterDayBoundaryGeneration, promise: saving};
      Promise.resolve(saving).catch(error => console.warn("[Chapters] canonical day checkpoint failed", {day, target, error}));
    });
    return true;
  }

  function installChapterTimeCardHook() {
    const fn = window.showTimeCard;
    if (typeof fn !== "function") return false;
    if (fn.__chapterHooked === true) return true;

    const wrapped = async function chapterAwareShowTimeCard(text, opts = {}) {
      const engine = window.GameStateEngine, identity = engine?.getRuntimeLifecycleIdentity?.();
      const generation = Number(window.Game?.__chapterDayBoundaryGeneration || 0);
      if (chapterTransitionIsFuture(text, opts)) return;
      if (opts.reason === "canonical_day_completion") {
        // The shell's subscriber runs first. Let this same committed batch's
        // checkpoint subscriber publish its matching save before presenting.
        await Promise.resolve();
        const pending = window.Game?.__chapterDayBoundaryPending;
        const day = Number(opts.dayNumber || opts.day) || explicitChapterDayNumber(text);
        const dispatch = engine?.getPendingStory?.();
        const target = normalizeStoryPath(opts.targetStoryPath || engine?.getExecutionState?.()?.activeStoryPath || dispatch?.path || dispatch?.storyPath || "");
        if (pending?.engine === engine && pending.day === day && pending.generation === generation &&
            target === normalizeStoryPath(pending.storyPath) && chapterLifecycleCurrent(engine, pending.identity, generation)) await pending.promise;
      }
      try {
        const goHome = !!opts?.goHome;
        if (goHome || opts.reason === "canonical_day_completion") {
          const inferred = inferConversationChapterCheckpoint(text, opts);
          if (inferred) await upsertChapterCheckpoint(inferred);
        }
      } catch {}
      if (!chapterLifecycleCurrent(engine, identity, generation)) return;
      return fn.call(this, text, opts);
    };
    wrapped.__chapterHooked = true;
    wrapped.__originalShowTimeCard = fn;
    window.showTimeCard = wrapped;
    return true;
  }

  function isConversationSceneOpenFor(contactId) {
    const scene = canonicalId(getCurrentSceneName());
    if (scene !== "conversation") return false;
    const openId = getOpenConversationId();
    return !!openId && canonicalId(contactId) === canonicalId(openId);
  }

  // SAME CONTACT IS NOT THE SAME CONVERSATION INSTANCE.
  //
  // isConversationSceneOpenFor above answers only "is contact X's thread the
  // one on screen". That is the right question for "may I render into this
  // thread", and the WRONG question for "has the player been given a chance
  // to act on THIS story". A story handoff whose target shares the source's
  // contact (story A: lena -> story B: lena) leaves story A's renderer
  // mounted; treating that mount as authority over story B silently walks
  // story B past its own first player-required step.
  //
  // Live-reproduced (tester report, 2026-09-07): DAY3_12_LENA_NIGHT ends with
  // onCompleteStartStory -> DAY4_00_LENA_MORNING, whose step[1] is a
  // player-authored message. With the contact-only check, the background
  // runner walked all 13 steps of the Day4 story to completion with zero
  // player input while the player was still reading the Day3 thread -- the
  // tester saw Day4's final line ("Talk to you later") sitting unread in the
  // Messages list without ever having opened it. The unread badge was
  // CORRECT (story-scoped presence never marked those events read); the
  // progression was not. Corpus-wide this shape exists on 276 authored
  // handoff edges (218 same-day, 58 cross-day) -- see
  // tools/qa/same_contact_handoff_corpus_audit.js -- so it is fixed here at
  // the shared lifecycle level rather than per story or per day.
  //
  // The ONLY accepted proof is getConversationRunnerOwner: the conversation
  // renderer itself currently holds the walk for THIS exact story. Nothing
  // weaker qualifies, and in particular "the renderer happens to be showing
  // this story" does not.
  //
  // Why nothing weaker: runSteps (this file) is the BACKGROUND walker -- it is
  // reached only through Game.startStory, and the renderer drives its own
  // steps through conversation.html's showNext/renderStep, never through
  // here. So a mounted renderer is not going to present this walker's player
  // turn; recording the boundary and stopping is what actually surfaces the
  // compose/send control (pause -> player_first cue / paused_turn record,
  // which is exactly what conversation.html's getPendingPlayerFirstState and
  // the Load-boundary invariant already read).
  //
  // A weaker "is the renderer mounted on this story" proof was tried and
  // measured live to defeat the fix: at the Day3->Day4 boundary the renderer
  // adopts the new same-contact story into the already-open thread WITHOUT
  // any player action, so that proof reported story B as displayed and the
  // background runner walked all 13 steps of Day4's Lena story with zero
  // input (rootIndex 0 -> 12, 12 events, scene still `conversation` on the
  // Day3 mount). Adopting a story is not the player acting on it.
  //
  // The conv_story_<id> localStorage mirror is rejected for the same reason
  // and one more: setContactProgress rewrites it to whatever the BACKGROUND
  // runner is walking.
  function rendererOwnsStoryForPlayerTurn(contactId, storyPath) {
    if (!isConversationSceneOpenFor(contactId)) return false;
    let owner = null;
    try { owner = (window.Game ||= {}).getConversationRunnerOwner?.() || null; } catch { owner = null; }
    return !!owner &&
      storyPathsEqual(owner.storyPath, storyPath) &&
      canonicalId(owner.contactId || "") === canonicalId(contactId);
  }

  const PENDING_KEY = "pending_story_v1";
  const CHAIN_KEY   = "pending_chain_story_v1";
  const CHAPTER_LOAD_MODE_KEY = "__chapter_load_mode";
  const GUIDED_CUES_KEY = "guided_cues_v1";
  const PENDING_OUTBOUND_KEY = "pending_outbound_v1";
  const PENDING_LOCK_KEY = "pending_story_lock_v1";
  const STORY_RUNTIME_KEY = "story_runtime_v1";
  const PENDING_PLAYER_FIRST_DONE_PREFIX = "pending_player_first_done_v1::";
  const CINEMATIC_LOCK_KEY = "__cinematic_lock_v1";
  const PENDING_LOCK_TTL = 5_000;
  const STORY_MANIFEST_PATH = "story/story_manifest.json";
  const PATREON_UNLOCK_KEY = "patreon_release_unlock_v1";
  const PATREON_MASTER_UNLOCK_KEY = "patreon_master_unlock_v1";
  const GALLERY_FULL_UNLOCK_KEY = "gallery_full_unlock_v1";
  const DEV_TIMELINE_UNLOCK_KEY = "dev_timeline_unlock_v1";
  const PREMIUM_BLOCKED_STORY_KEY = "premium_blocked_story_v1";
  const PATREON_CODE_MODAL_ID = "patreon-code-modal-v1";
  const PATREON_CODE_MODAL_STYLE_ID = "patreon-code-modal-style-v1";
  const PATREON_CODE_MODAL_DEFAULT_TITLE = "Patreon Code";
  const PATREON_CODE_MODAL_DEFAULT_SUBTITLE = "Enter your Patreon code to unlock premium content";
  const BUILD_RELEASE = 4;
  const CONTENT_ACCESS_CONFIG = Object.freeze({
    freeUntil: {
      day: 9,
      label: "Day 9 morning entry",
      storyPaths: Object.freeze(["story/DAY9/DAY9_00_AIDEN_CHECKIN.json"])
    },
    premiumCharacter: "lena",
    premiumRange: Object.freeze({ startDay: 16, endDay: 20 }),
    premiumRequiresPatreon: true,
    premiumPathIncludes: Object.freeze([
      "_lena_"
    ])
  });
  try { sanitizeDisabledCharacterConversationState({ source: "runtime_boot" }); } catch {}
  let pendingResumeBusy = false;
  let pendingResumeAttemptOwner = null;
  let pendingRetryTimer = 0;
  let storyManifestPromise = null;
  let storyManifestCache = {
    loaded: false,
    failed: false,
    entries: [],
    sortedEntries: [],
    byPath: new Map()
  };

  // --- Deferred-dispatch failure classification -----------------------
  // General contract for "why did Game.startStory(path) just return false"
  // that resumePendingDispatch's retry policy relies on -- deliberately
  // reason-driven, never path-driven (no per-story special-casing here).
  // Every logChainError(reason, ...) call below funnels through
  // recordDispatchFailure, so this stays a single source of truth no
  // matter which of the many startStory failure sites produced the
  // reason. See resumePendingDispatch for how each classification is
  // actually acted on.
  //
  //   TRANSIENT              -- read/parse-layer failure, worth a few
  //                             quick bounded retries (e.g. load_json_failed).
  //   WAITING_FOR_REQUIREMENT-- deterministic block on some OTHER piece of
  //                             state (entitlement not granted yet,
  //                             requireOnceKey not satisfied yet) that can
  //                             legitimately become true later. Must NOT
  //                             be tight-polled -- wait for a relevant
  //                             event, with only a slow safety-net poll.
  //   STALE                   -- pending target can provably never start
  //                             again from here (already completed, no
  //                             accessible successor in this release) --
  //                             reconcile (clear) through the canonical
  //                             pending-story command, don't retry.
  //   TERMINAL                -- structural failure (loop guard, exception)
  //                             that will not resolve itself -- clear and
  //                             stop, don't retry.
  //   UNKNOWN                 -- reason not classified above. Treated as a
  //                             conservative bounded retry, never infinite.
  const DISPATCH_FAILURE_LOG_COOLDOWN_MS = 8_000;
  const WAITING_FOR_REQUIREMENT_POLL_MS = 4_000;
  const TRANSIENT_DISPATCH_RETRY_LIMIT = 3;
  // Structural "another lease/story is genuinely still active" contention
  // (resumePendingResume's keepFor* cases) resolves on its own timeline,
  // not a fixed handful of ticks -- generous, but still finite so a truly
  // stuck case eventually surfaces a diagnostic instead of retrying forever.
  const ACTIVE_CONTENTION_RETRY_LIMIT = 40;
  const dispatchFailureByPath = new Map();
  let waitingRequirementWakeListenerAttached = false;
  let pendingRequirementWait = null;
  let pendingRequirementDecisionCache = null;
  let premiumGateCommunicationOwner = "";

  function pendingRequirementOwner(pending, path) {
    const identity = window.GameStateEngine?.getConversationCacheFlushIdentity?.();
    if (!identity) return "";
    // Retry diagnostics do not create a new pending operation. Its durable
    // target/options and restoration owner do.
    const { attempts, lastAttemptAt, lastSource, updatedAt, ...operation } = pending || {};
    return JSON.stringify([identity.playthroughId, identity.operationEpoch, path, operation]);
  }

  function pendingRequirementObservation(pending, path, requirements) {
    const engine = window.GameStateEngine;
    const owner = pendingRequirementOwner(pending, path);
    if (!owner || !engine?.getStoryRequirementState) return null;
    const identity = engine.getConversationCacheFlushIdentity();
    const revisionKey = JSON.stringify([identity.playthroughId, identity.operationEpoch, engine.getRevision()]);
    if (pendingRequirementDecisionCache?.revisionKey !== revisionKey) {
      pendingRequirementDecisionCache = { revisionKey, value: JSON.stringify(engine.getStoryRequirementState()) };
    }
    return {
      owner,
      decisions: pendingRequirementDecisionCache.value,
      accessible: canAccessStory({ path }),
      // The live grammar also supports absent-key legacy variables and
      // watchlists. Recheck them even when the canonical revision is stable.
      requirementsMet: requirements ? requirementsMet(requirements) : null
    };
  }

  function rememberPendingRequirementWait(pending, path, failure) {
    const current = readPendingStory();
    if (pendingRequirementOwner(current, path) !== pendingRequirementOwner(pending, path)) return;
    // Failure to create either communication surface is still retriable.
    if (failure?.premiumBlocked && !canAccessStory({ path }) && premiumGateCommunicationOwner !== pendingRequirementOwner(current, path)) return;
    const requirements = failure?.extra?.requirements || null;
    const observation = pendingRequirementObservation(current, path, requirements);
    if (observation) pendingRequirementWait = { path, requirements, observation };
  }

  function deferUnchangedPendingRequirement(pending, path) {
    const waiting = pendingRequirementWait;
    if (!waiting) return false;
    const observation = pendingRequirementObservation(pending, path, waiting.requirements);
    if (!observation || waiting.path !== path || JSON.stringify(observation) !== JSON.stringify(waiting.observation)) {
      pendingRequirementWait = null;
      return false;
    }
    armWaitingForRequirementWake();
    schedulePendingRetry("waiting_for_requirement", WAITING_FOR_REQUIREMENT_POLL_MS);
    return true;
  }

  function canWakePendingRequirementFromScene(pending, path, source) {
    const waiting = pendingRequirementWait;
    const knownBlocked = waiting?.path === path && waiting.observation.owner === pendingRequirementOwner(pending, path) && waiting.observation.accessible === false;
    return (knownBlocked || source === "requirement_wake_entitlement") && isPremiumStory({ path }) && canAccessStory({ path });
  }

  function classifyDispatchFailureReason(reason, ctx = {}) {
    const r = String(reason || "").trim();
    if (r === "load_json_failed") return "TRANSIENT";
    if (r === "not_accessible_in_release" || r === "no_accessible_story") {
      // Both reasons fire for a story this release's manifest/day-gate
      // logic won't start right now. Only the entitlement-gated (premium)
      // case can legitimately become true later without a new build --
      // everything else genuinely has no path to ever succeed here.
      return ctx.premiumBlocked ? "WAITING_FOR_REQUIREMENT" : "STALE";
    }
    if (r === "requirements_not_met") return "WAITING_FOR_REQUIREMENT";
    if (r === "active_story_conflict" && ctx.requiredPriorStory?.status === "ACTIVE") return "WAITING_FOR_REQUIREMENT";
    if (r === "onceKey_already_completed") return "STALE";
    if (r === "disabled_skip_loop_guard") return "TERMINAL";
    // An uncaught exception mid-execution already tears down its own
    // dispatch marker/lease (see the runSteps catch block) -- nothing a
    // blind retry of the same call would fix, so treat it as terminal
    // rather than silently retrying a call whose pending record is
    // already gone.
    if (r === "runtime_exception") return "TERMINAL";
    if (r.startsWith("start_admission_")) {
      // Mirrors the classification requestStartAdmission already uses
      // internally (see its own retriable check) -- kept in sync here so
      // callers reading dispatchFailureByPath see the same verdict.
      return (r === "start_admission_active_story_conflict" || r === "start_admission_stale_recoverable_state")
        ? "TRANSIENT"
        : "TERMINAL";
    }
    return "UNKNOWN";
  }

  function describeDispatchFailureReason(reason) {
    const messages = {
      load_json_failed: "Story JSON failed to fetch or parse.",
      not_accessible_in_release: "Story is gated (premium/entitlement or release day-range) and not currently accessible.",
      no_accessible_story: "No accessible manifest entry resolved for this path.",
      requirements_not_met: "Story's requireOnceKey/requireWatchedAny prerequisite is not satisfied yet.",
      active_story_conflict: "A required chronological story is still active; this target waits for its completion.",
      onceKey_already_completed: "Story's onceKey was already completed -- this target is stale.",
      disabled_skip_loop_guard: "Disabled-character auto-skip chain looped without reaching a startable story.",
      runtime_exception: "Unexpected exception while loading/running the story."
    };
    if (messages[reason]) return messages[reason];
    if (String(reason || "").startsWith("start_admission_")) {
      return "Canonical start-admission rejected this dispatch (lease/lock conflict).";
    }
    return "Unclassified startStory failure.";
  }

  function recordDispatchFailure(path, reason, extra = {}) {
    const p = normalizeStoryPath(String(path || "").trim()) || String(path || "").trim();
    if (!p) return null;
    let premiumBlocked = false;
    try { premiumBlocked = isPremiumStory({ path: p }); } catch {}
    const classification = classifyDispatchFailureReason(reason, { premiumBlocked, requiredPriorStory: extra.requiredPriorStory });
    const now = Date.now();
    const prev = dispatchFailureByPath.get(p) || null;
    const sameReason = !!prev && prev.reason === String(reason || "").trim();
    const entry = {
      path: p,
      reason: String(reason || "").trim(),
      classification,
      premiumBlocked,
      count: sameReason ? (prev.count + 1) : 1,
      firstAt: sameReason ? prev.firstAt : now,
      lastAt: now,
      lastLoggedAt: prev ? prev.lastLoggedAt : 0,
      extra: extra || {}
    };
    dispatchFailureByPath.set(p, entry);
    return entry;
  }

  function getDispatchFailure(path) {
    const p = normalizeStoryPath(String(path || "").trim()) || String(path || "").trim();
    return dispatchFailureByPath.get(p) || null;
  }

  function clearDispatchFailure(path) {
    const p = normalizeStoryPath(String(path || "").trim()) || String(path || "").trim();
    dispatchFailureByPath.delete(p);
  }

  function shouldPrintDispatchFailureLog(entry, field = "lastLoggedAt") {
    if (!entry) return true;
    // Always print the first occurrence of a given failure and any
    // reason change; otherwise rate-limit repeats of the IDENTICAL
    // failure so a blocked/stale pending story can no longer spam the
    // console once per retry tick -- only first-occurrence, state
    // transitions, and periodic (cooldown-gated) reminders print. Two
    // independent call sites (the [CHAIN][ERROR] log and the
    // [ConvoRuntime][pending] blocked-dispatch log) track their own
    // cooldown via a distinct `field` so silencing one doesn't silence
    // the other's first occurrence.
    if (entry.count <= 1) return true;
    const lastLoggedAt = Number(entry[field] || 0);
    if (lastLoggedAt && (entry.lastAt - lastLoggedAt) < DISPATCH_FAILURE_LOG_COOLDOWN_MS) return false;
    return true;
  }

  // WAITING_FOR_REQUIREMENT wake-up: a single delegated listener (armed
  // lazily, once) that re-attempts the deferred dispatch the moment the
  // most common blocking requirement (premium/patreon entitlement) actually
  // changes, instead of tight-polling. schedulePendingRetry's own
  // "one timer at a time" guard makes it safe to also arm a slow safety-net
  // poll alongside this for requirement classes with no dedicated event
  // (e.g. requireOnceKey) -- see resumePendingDispatch.
  function armWaitingForRequirementWake() {
    if (waitingRequirementWakeListenerAttached) return;
    waitingRequirementWakeListenerAttached = true;
    try {
      const resumeForEntitlement = () => {
        try { (window.Game || {}).resumePendingStory?.({ source: "requirement_wake_entitlement", auto: true }); } catch {}
      };
      window.addEventListener("patreon:master-unlock-changed", resumeForEntitlement);
      window.addEventListener("patreon:unlock-changed", resumeForEntitlement);
    } catch {}
  }

  function normalizeStoryRuntimeState(rawState = {}) {
    const raw = (rawState && typeof rawState === "object") ? rawState : {};
    return {
      version: 1,
      activeStoryPath: normalizeStoryPath(String(raw.activeStoryPath || raw.storyPath || "").trim()),
      activeCharacterId: canonicalId(raw.activeCharacterId || raw.contactId || raw.characterId || ""),
      expectedNextStory: normalizeStoryPath(String(raw.expectedNextStory || raw.nextStoryPath || "").trim()),
      turnOwner: canonicalId(raw.turnOwner || raw.expectedContactId || ""),
      externalChainInProgress: raw.externalChainInProgress === true,
      transitionLock: raw.transitionLock === true,
      timelineReplayChain: raw.timelineReplayChain === true,
      activeRunner: String(raw.activeRunner || "").trim(),
      lastCompletedStory: normalizeStoryPath(String(raw.lastCompletedStory || "").trim()),
      lastSource: String(raw.lastSource || "").trim(),
      updatedAt: Number(raw.updatedAt || Date.now()) || Date.now()
    };
  }

  function readStoryRuntimeState() {
    const parsed = safeJsonParse(safeGetLS(STORY_RUNTIME_KEY), null);
    return normalizeStoryRuntimeState(parsed);
  }

  function patchStoryRuntimeState(patch = {}, source = "") {
    const current = readStoryRuntimeState();
    const next = normalizeStoryRuntimeState({
      ...current,
      ...(patch && typeof patch === "object" ? patch : {}),
      lastSource: String(source || patch?.lastSource || current.lastSource || "").trim(),
      updatedAt: Date.now()
    });
    safeSetLS(STORY_RUNTIME_KEY, JSON.stringify(next));
    return next;
  }

  function rememberRuntimeTurnOwner(storyPath, contactId, extra = {}, source = "runtime_start") {
    const normalizedStory = normalizeStoryPath(String(storyPath || "").trim());
    const cid = canonicalId(contactId || "");
    return patchStoryRuntimeState({
      activeRunner: "background",
      activeStoryPath: normalizedStory,
      activeCharacterId: cid,
      turnOwner: cid,
      expectedNextStory: cid ? normalizedStory : "",
      externalChainInProgress: false,
      transitionLock: false,
      ...(extra && typeof extra === "object" ? extra : {})
    }, source);
  }

  function queueRuntimeTurn(path, meta = {}, source = "runtime_queue") {
    const normalizedStory = normalizeStoryPath(String(path || "").trim());
    const current = readStoryRuntimeState();
    const via = canonicalId(String(meta?.via || meta?.reason || "").trim());
    const targetContactId = canonicalId(
      meta?.targetContactId ||
      meta?.contactId ||
      meta?.opts?.__chainTargetContactId ||
      ""
    );
    const startWhenScene = canonicalId(String(meta?.startWhenScene || "").trim());
    const shouldLock =
      meta?.transitionLock === true ||
      startWhenScene === "home" ||
      shouldDelayDispatchToHome(via);
    return patchStoryRuntimeState({
      activeRunner: shouldLock ? "transition" : (current.activeRunner || "background"),
      expectedNextStory: normalizedStory,
      turnOwner: shouldLock ? targetContactId : (targetContactId || current.turnOwner || ""),
      externalChainInProgress: !!normalizedStory,
      transitionLock: shouldLock
    }, source);
  }

  function clearRuntimeTurnForStory(storyPath, contactId = "", source = "runtime_clear") {
    const normalizedStory = normalizeStoryPath(String(storyPath || "").trim());
    const cid = canonicalId(contactId || "");
    const current = readStoryRuntimeState();
    const sameOwner = !!cid && current.turnOwner === cid;
    const sameStory =
      !!normalizedStory &&
      (
        normalizeStoryPath(String(current.expectedNextStory || "").trim()) === normalizedStory ||
        normalizeStoryPath(String(current.activeStoryPath || "").trim()) === normalizedStory
      );
    if (!sameOwner && !sameStory) return current;
    return patchStoryRuntimeState({
      activeRunner: "",
      activeStoryPath: "",
      activeCharacterId: "",
      expectedNextStory: "",
      turnOwner: "",
      externalChainInProgress: false,
      transitionLock: false,
      timelineReplayChain: false
    }, source);
  }

  // Canonical replacement for the old story_runtime_v1 turn-lock
  // (getActiveConversationTurnLock/findConversationOwnerConflict/
  // findStoryStartConflict, removed here). "Who owns the conversation
  // right now" has exactly one answer once Group 3's canonical completion
  // transaction is the only thing that ever moves the lease:
  // GameStateEngine.getExecutionState().activeContactId. No renderer-side
  // record can disagree with it, so there is nothing left for a separate
  // lock to track.
  function canonicalActiveOwnerConflict(ownerId) {
    const cid = resolveContactId(ownerId || "", "");
    if (!cid) return null;
    const exec = window.GameStateEngine?.getExecutionState?.();
    if (!exec || !exec.lease) return null;
    const lockOwnerId = exec.activeContactId || null;
    if (!lockOwnerId || lockOwnerId === cid) return null;
    return { ownerId: cid, lockOwnerId, lockStoryPath: exec.activeStoryPath || null };
  }

  // Group 6 (protected-write elimination): canonical single-record
  // pending-story slot (progression.pendingStory via SET_PENDING_STORY /
  // CLEAR_PENDING_STORY). Only the storage substrate moved here -- every
  // surrounding piece of business logic (queuePendingStoryStart's
  // dispatch/resume merge rules, touchPendingDispatch, schedulePendingRetry,
  // resumePendingDispatch, resumePendingResume, sanitizePendingStoryForDisabledCharacters,
  // ...) is unchanged and keeps calling exactly these three functions.
  function readPendingStory() {
    const engine = window.GameStateEngine;
    const obj = engine ? (engine.getPendingStory ? engine.getPendingStory() : engine.getGameplayState().progression.pendingStory) : null;
    if (!obj || typeof obj !== "object") return null;
    const path = String(obj.path || obj.storyPath || "").trim();
    if (!path) return obj;
    return {
      ...obj,
      path,
      storyPath: String(obj.storyPath || path).trim() || path
    };
  }

  function writePendingStory(payload) {
    if (!payload || typeof payload !== "object") return;
    const engine = window.GameStateEngine;
    if (!engine) return;
    const revision = engine.getRevision();
    engine.dispatch({
      type: "SET_PENDING_STORY",
      commandId: `pending-story-set:${revision}`,
      expectedRevision: revision,
      payload: { record: payload }
    });
  }

  function setPendingStory(payload) {
    if (!payload || typeof payload !== "object") return;
    const path = String(payload.path || payload.storyPath || "").trim();
    const runId = Math.max(0, Number(payload.runId || (window.Game || {})._storyRunId || 0) || 0);
    const playerDraft = String(payload.playerDraft || payload.draftText || "").trim();
    const kind = String(payload.kind || "resume").trim().toLowerCase() || "resume";
    writePendingStory({
      kind,
      ...payload,
      path,
      storyPath: String(payload.storyPath || path).trim() || path,
      runId,
      playerDraft,
      draftText: playerDraft,
      ts: Number(payload.ts || Date.now()) || Date.now()
    });
  }

  function clearPendingStory() {
    const engine = window.GameStateEngine;
    if (!engine) return;
    const revision = engine.getRevision();
    engine.dispatch({
      type: "CLEAR_PENDING_STORY",
      commandId: `pending-story-clear:${revision}`,
      expectedRevision: revision,
      payload: {}
    });
  }

  // Generic canonical/persisted "player-facing interaction boundary" slot
  // (progression.pendingInteraction via SET_PENDING_INTERACTION /
  // CLEAR_PENDING_INTERACTION) -- same single-record-replace contract as
  // pendingStory just above. For any scene overlay whose answer is NOT
  // itself a canonical interpreter step (story-interpreter.js has nothing
  // to pause on for it -- e.g. conversation.html's rename overlay, which
  // fires as a side effect after an `image` step already committed), this
  // is the durable record that lets the overlay be reconstructed on
  // remount/Save-Load/restart instead of depending on renderer-only state
  // a scene teardown would silently drop.
  function readPendingInteraction() {
    const engine = window.GameStateEngine;
    const obj = engine ? (engine.getPendingInteraction ? engine.getPendingInteraction() : engine.getGameplayState().progression.pendingInteraction) : null;
    return (obj && typeof obj === "object") ? obj : null;
  }

  function writePendingInteraction(payload) {
    if (!payload || typeof payload !== "object") return;
    const engine = window.GameStateEngine;
    if (!engine) return;
    const revision = engine.getRevision();
    engine.dispatch({
      type: "SET_PENDING_INTERACTION",
      commandId: `pending-interaction-set:${revision}`,
      expectedRevision: revision,
      payload: { record: payload }
    });
  }

  function clearPendingInteraction() {
    const engine = window.GameStateEngine;
    if (!engine) return;
    const revision = engine.getRevision();
    engine.dispatch({
      type: "CLEAR_PENDING_INTERACTION",
      commandId: `pending-interaction-clear:${revision}`,
      expectedRevision: revision,
      payload: {}
    });
  }

  function makePendingPlayerFirstOnceId(storyPath, stepIndex) {
    const rawPath = String(storyPath || "").trim();
    const path = normalizeStoryPath(rawPath) || rawPath;
    const idx = Number.isFinite(Number(stepIndex)) ? Math.max(0, Math.floor(Number(stepIndex))) : 0;
    return `${path}#${idx}`;
  }

  function pendingPlayerFirstDoneKey(onceId) {
    return `${PENDING_PLAYER_FIRST_DONE_PREFIX}${String(onceId || "").trim()}`;
  }

  function clearPendingForChapterStart() {
    clearPendingStory();
    safeRemLS(CHAIN_KEY);
    safeRemLS(PENDING_LOCK_KEY);
    safeRemLS(STORY_RUNTIME_KEY);
    pendingResumeBusy = false;
    pendingResumeAttemptOwner = null;
    if (pendingRetryTimer) {
      clearTimeout(pendingRetryTimer);
      pendingRetryTimer = 0;
    }
    try { (window.Game ||= {})._pendingStory = null; } catch {}
  }

  function isPendingDispatch(payload) {
    if (!payload || typeof payload !== "object") return false;
    return payload.kind === "dispatch" && !!String(payload.path || "").trim();
  }

  function isPendingResume(payload) {
    if (!payload || typeof payload !== "object") return false;
    const kind = String(payload.kind || "resume").trim().toLowerCase();
    if (kind && kind !== "resume") return false;
    return !!String(payload.path || payload.storyPath || "").trim();
  }

  function dispatchId(path) {
    const p = String(path || "").trim();
    return `pd_${Date.now()}_${Math.random().toString(16).slice(2)}_${p}`;
  }

  // A queued dispatch's eventual Game.startStory(...) call (from
  // resumePendingDispatch) reads ONLY payload.opts -- top-level meta fields
  // like allowConversationInterrupt are read HERE, at queue time, for the
  // ownerConflict pre-check, and then never again. Three independent
  // callers (convo-runtime.js's own onCompleteStartStory and start_story
  // step handlers, and conversation.html's start_story step handler) have
  // each, separately, passed allowConversationInterrupt as a top-level meta
  // field expecting it to carry through -- the natural, intuitive way to
  // call this function -- and each silently lost it, since nothing folded
  // it into opts. Rather than patch every future caller the same way,
  // make the shared queuing function itself honor the top-level field so
  // this class of bug cannot recur at a fourth call site.
  function resolveDispatchOpts(meta, existingOpts) {
    const opts = (meta?.opts && typeof meta.opts === "object")
      ? { ...meta.opts }
      : { ...(existingOpts && typeof existingOpts === "object" ? existingOpts : {}) };
    if (meta?.allowConversationInterrupt === true && opts.allowConversationInterrupt !== true) {
      opts.allowConversationInterrupt = true;
    }
    if (meta?.strictRequestedPath === true && !opts.__strictRequestedPath) {
      opts.__strictRequestedPath = true;
    }
    return opts;
  }

  // A chronological redirect changes the target, not the permission already
  // granted to dispatch from a completed conversation. Drop old owner/lease
  // identities while preserving explicit playback and dispatch options.
  function retargetPendingDispatchOpts(pending, contactId) {
    const opts = { ...(pending?.opts || {}), contactId: contactId || "", startIndex: 0 };
    for (const key of ["conversationId", "id", "contactName", "__chainFromContactId", "__chainTargetContactId", "__afterSourceCompletion", "__admissionClassification", "__admissionLeaseId"]) delete opts[key];
    return opts;
  }

  function storyCompletionSource(pending) {
    if (!pending || pending.kind !== "dispatch") return null;
    const stored = pending.opts?.__afterSourceCompletion;
    if (stored && typeof stored === "object") return stored;
    // Compatibility for an already persisted, pre-fix start_story dispatch.
    // Its actual owned source path and exact once key are both required.
    if (pending.via !== "start_story_step" && pending.reason !== "start_story_step") return null;
    const engine = window.GameStateEngine;
    const execution = engine?.getExecutionState?.();
    const entry = window.StoryAdmissionCatalog?.find(row => storyPathsEqual(row.path, execution?.activeStoryPath));
    if (!execution?.lease || !entry?.onceKey || canonicalId(pending.from) !== canonicalId(entry.onceKey)) return null;
    return {storyPath: execution.activeStoryPath, onceKey: entry.onceKey, storyId: execution.activeStoryId};
  }

  function getStoryCompletionIntent(sourcePath, sourceOnceKey) {
    const pending = readPendingStory();
    const source = storyCompletionSource(pending);
    if (!source || !storyPathsEqual(source.storyPath, sourcePath) || canonicalId(source.onceKey) !== canonicalId(sourceOnceKey)) return null;
    const identity = window.GameStateEngine?.getRuntimeLifecycleIdentity?.();
    if (source.playthroughId && (source.playthroughId !== identity?.playthroughId || source.playthroughGeneration !== identity?.playthroughGeneration)) return null;
    return pending;
  }

  function queueStoryCompletionIntent(targetPath, meta = {}) {
    const engine = window.GameStateEngine;
    const execution = engine?.getExecutionState?.();
    const sourcePath = normalizeStoryPath(meta.sourceStoryPath || "");
    const entry = window.StoryAdmissionCatalog?.find(row => storyPathsEqual(row.path, sourcePath));
    if (!execution?.lease || !storyPathsEqual(execution.activeStoryPath, sourcePath) || !entry?.onceKey || canonicalId(entry.onceKey) !== canonicalId(meta.sourceOnceKey)) return null;
    const identity = engine.getRuntimeLifecycleIdentity?.();
    return queuePendingStoryStart(targetPath, {
      ...meta, force: true, allowConversationInterrupt: true,
      from: entry.onceKey, reason: "start_story_step", via: "start_story_step",
      opts: {...(meta.opts || {}), __afterSourceCompletion: {
        storyPath: sourcePath, onceKey: entry.onceKey, storyId: execution.activeStoryId,
        playthroughId: identity?.playthroughId, playthroughGeneration: identity?.playthroughGeneration
      }}
    });
  }

  function pendingAwaitsSourceCompletion(pending) {
    const source = storyCompletionSource(pending);
    if (!source) return false;
    const engine = window.GameStateEngine;
    const execution = engine?.getExecutionState?.();
    const entry = window.StoryAdmissionCatalog?.find(row => storyPathsEqual(row.path, source.storyPath));
    const identity = engine?.getRuntimeLifecycleIdentity?.();
    if (!entry?.onceKey || canonicalId(entry.onceKey) !== canonicalId(source.onceKey)) return true;
    if (source.playthroughId && (source.playthroughId !== identity?.playthroughId || source.playthroughGeneration !== identity?.playthroughGeneration)) return true;
    if (execution?.lease && storyPathsEqual(execution.activeStoryPath, source.storyPath)) return true;
    return !engine.hasOnceKey?.(source.onceKey) || ![source.storyId, entry.id, source.onceKey, source.storyPath]
      .filter(Boolean).some(id => engine.hasCompletedStory?.(id));
  }

  function queuePendingStoryStart(path, meta = {}) {
    const p = String(path || "").trim();
    if (!p) return null;

    const queuedOwnerId = resolveContactId(
      meta?.targetContactId ||
      meta?.contactId ||
      meta?.opts?.contactId ||
      meta?.opts?.conversationId ||
      meta?.opts?.__chainTargetContactId ||
      "",
      meta?.contactName || meta?.opts?.contactName || ""
    );
    const ownerConflict = meta?.allowConversationInterrupt === true
      ? null
      : canonicalActiveOwnerConflict(queuedOwnerId);
    if (ownerConflict) {
      try {
        console.warn("[ConvoRuntime][queuePendingStoryStart] blocked by active conversation owner", {
          path: p,
          queuedOwnerId,
          lockOwnerId: ownerConflict.lockOwnerId,
          lockStoryPath: ownerConflict.lockStoryPath,
          reason: String(meta?.reason || "").trim()
        });
      } catch {}
      return null;
    }

    const force = meta?.force === true || meta?.replaceResume === true;
    const replaceResume = meta?.replaceResume === true;
    const startWhenScene = canonicalId(String(meta.startWhenScene || "").trim());
    const completionOrigin = !!meta?.opts?.__afterSourceCompletion ||
      [meta?.via, meta?.reason].some(value => ["oncompletestartstory", "on_complete", "conversation_on_complete"].includes(canonicalId(value || "")));
    const navigationPolicy = safeGetLS("settings_returnHomeAfterChat") === "1" && completionOrigin
      ? "preserve_current_scene"
      : String(meta.navigationPolicy || "").trim();
    const existing = readPendingStory();
    if (existing && existing.kind === "resume") {
      if (force) {
        if (!replaceResume) {
          const samePath = String(existing.path || "").trim() === p;
          if (samePath) return existing;
        }
      } else {
        return existing;
      }
    }
    if (isPendingDispatch(existing) && String(existing.path || "").trim() === p) {
      const mergedStartWhenScene = startWhenScene || String(existing.startWhenScene || "").trim();
      const merged = {
        ...existing,
        from: String(meta.from ?? existing.from ?? "").trim(),
        reason: String(meta.reason ?? existing.reason ?? "").trim() || "pending_dispatch",
        opts: resolveDispatchOpts(meta, existing.opts),
        startWhenScene: mergedStartWhenScene,
        // Completion still queues its successor, while the optional Home
        // landing keeps presentation under the player's control.
        navigationPolicy: navigationPolicy || (mergedStartWhenScene ? "auto_open" : (existing.navigationPolicy || "")),
        via: String(meta.via ?? existing.via ?? "").trim(),
        fireKey: String(meta.fireKey ?? existing.fireKey ?? "").trim(),
        updatedAt: Date.now()
      };
      if (Number.isFinite(Number(meta.index))) {
        merged.index = Math.max(0, Number(meta.index) || 0);
      }
      writePendingStory(merged);
      return merged;
    }

    const payload = {
      kind: "dispatch",
      id: dispatchId(p),
      contactId: queuedOwnerId || "",
      path: p,
      storyPath: p,
      index: Math.max(0, Number(meta.index || 0) || 0),
      opts: resolveDispatchOpts(meta, null),
      from: String(meta.from || "").trim(),
      reason: String(meta.reason || meta.via || "pending_dispatch").trim(),
      via: String(meta.via || "").trim(),
      startWhenScene,
      // index.html's Game.autoResumePendingStory -- the scene-mount-driven
      // "kick" that actually calls Game.resumePendingStory for a queued
      // dispatch -- refuses to fire unless pending.navigationPolicy is
      // exactly "auto_open" (see its normalizeNavigationPolicy gate), a
      // SEPARATE field from startWhenScene that nothing here used to set.
      // Existing authored transitions retain their auto-fire-on-scene-mount
      // default. The completion preference can keep Home visible; its
      // explicit completion wake still starts the ordinary NPC prefix.
      navigationPolicy: navigationPolicy || (startWhenScene ? "auto_open" : ""),
      fireKey: String(meta.fireKey || "").trim(),
      createdAt: Date.now(),
      attempts: 0
    };
    writePendingStory(payload);
    return payload;
  }

  function touchPendingDispatch(path, index, extra = {}) {
    const p = String(path || "").trim();
    if (!p) return;
    const cur = readPendingStory();
    if (!isPendingDispatch(cur)) return;
    if (String(cur.path || "").trim() !== p) return;
    const next = { ...cur, ...extra };
    if (Number.isFinite(Number(index))) next.index = Math.max(0, Number(index) || 0);
    writePendingStory(next);
  }

  function readPendingLock() {
    const raw = safeGetLS(PENDING_LOCK_KEY);
    const lock = raw ? safeJsonParse(raw, null) : null;
    return (lock && typeof lock === "object") ? lock : null;
  }

  function acquirePendingLock(path) {
    const p = String(path || "").trim();
    if (!p) return false;
    const now = Date.now();
    const lock = readPendingLock();
    if (lock && (now - Number(lock.startedAt || 0)) < PENDING_LOCK_TTL) {
      return false;
    }
    safeSetLS(PENDING_LOCK_KEY, JSON.stringify({ path: p, startedAt: now }));
    return true;
  }

  function releasePendingLock(path) {
    const p = String(path || "").trim();
    const lock = readPendingLock();
    if (!lock) return;
    const lockedPath = String(lock.path || "").trim();
    if (p && lockedPath && p !== lockedPath) return;
    safeRemLS(PENDING_LOCK_KEY);
  }

  function shouldDelayDispatchToHome(via) {
    const v = canonicalId(via);
    return v === "next_day" || v === "time_card" || v === "glitch_eject" || v === "boot";
  }

  function normalizeStoryPath(path) {
    // See scenes/conversation.html's normalizeStoryPath for the full
    // rationale -- this was the other of the two copies in the codebase
    // missing the leading-"./" strip that every other independent copy
    // already has.
    const p = String(path || "").trim().replace(/\\/g, "/").replace(/^\.\//, "");
    if (!p) return "";
    if (p.includes("/")) return p;
    if (p.endsWith(".json")) return "story/" + p;
    return "story/" + p + ".json";
  }

  function normalizeManifestPath(path) {
    return normalizeStoryPath(String(path || "").replace(/\\/g, "/"));
  }

  function stableStoryIdForPath(path) {
    const normalized = normalizeManifestPath(path);
    const manifestId = String(storyManifestCache.byPath.get(normalized)?.id || "").trim();
    if (manifestId) return manifestId;
    const filename = (normalized.split("/").pop() || "").replace(/\.json$/i, "");
    return filename ? filename.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") : normalized;
  }

  function normalizeManifestEntry(entry, index) {
    const normalizedPath = normalizeManifestPath(entry?.path || "");
    if (!normalizedPath) return null;

    const normalized = {
      id: String(entry?.id || `story_${index}`).trim() || `story_${index}`,
      path: normalizedPath,
      day: Math.max(0, Number(entry?.day || 0) || 0),
      order: Number(entry?.order || 0) || 0,
      premiumFrom: Math.max(0, Number(entry?.premiumFrom || 0) || 0),
      freeFrom: Math.max(0, Number(entry?.freeFrom || 0) || 0),
      contactId: canonicalId(entry?.contactId || entry?.characterId || entry?.ownerId || "")
    };
    return normalized;
  }

  function sortManifestEntries(a, b) {
    const dayDelta = (Number(a?.day || 0) || 0) - (Number(b?.day || 0) || 0);
    if (dayDelta !== 0) return dayDelta;
    const orderDelta = (Number(a?.order || 0) || 0) - (Number(b?.order || 0) || 0);
    if (orderDelta !== 0) return orderDelta;
    return String(a?.path || "").localeCompare(String(b?.path || ""));
  }

  function manifestLookupCandidates(path) {
    const normalized = normalizeManifestPath(path);
    if (!normalized) return [];
    const routed = buildRoutedStoryCandidates(normalized);
    const candidates = Array.isArray(routed?.candidates) ? routed.candidates : [normalized];
    const seen = new Set();
    return candidates
      .map((candidate) => normalizeManifestPath(candidate))
      .filter((candidate) => {
        if (!candidate || seen.has(candidate)) return false;
        seen.add(candidate);
        return true;
      });
  }

  async function loadStoryManifest(forceReload = false) {
    if (!forceReload && storyManifestPromise) return storyManifestPromise;

    storyManifestPromise = (async () => {
      try {
        const res = await fetch(STORY_MANIFEST_PATH, { cache: "no-store" });
        if (!res || !res.ok) throw new Error(`HTTP ${res ? res.status : "0"}`);
        const raw = await res.json();
        const entries = Array.isArray(raw)
          ? raw.map((entry, index) => normalizeManifestEntry(entry, index)).filter(Boolean)
          : [];
        const sortedEntries = entries.slice().sort(sortManifestEntries);
        const byPath = new Map();
        for (const entry of sortedEntries) {
          byPath.set(entry.path, entry);
        }
        storyManifestCache = {
          loaded: true,
          failed: false,
          entries,
          sortedEntries,
          byPath
        };
      } catch (err) {
        storyManifestCache = {
          loaded: false,
          failed: true,
          entries: [],
          sortedEntries: [],
          byPath: new Map()
        };
        try { console.warn("[StoryAccess] Manifest unavailable, allowing stories by default", { path: STORY_MANIFEST_PATH, err }); } catch {}
      }
      return storyManifestCache;
    })();

    return storyManifestPromise;
  }

  function findBlockingStoryInteraction(storyPath, state = window.GameStateEngine?.getStoryInteractionState?.()) {
    if (!state) return null;
    const routePath = (path) => {
      const normalized = normalizeStoryPath(path);
      const resolve = window.StoryInterpreter?.prototype?.routeStoryPath;
      return normalizeStoryPath(typeof resolve === "function" ? resolve.call(window.StoryInterpreter.prototype, normalized, state) : normalized);
    };
    const targetPath = routePath(storyPath);
    // Reattaching an existing lease must not re-run admission or strand an
    // older save whose app interaction has already handed off its story.
    if (state.execution?.lease && storyPathsEqual(state.execution.activeStoryPath, targetPath)) return null;
    const completed = new Set((state.progression?.onceKeys || []).map(canonicalId));
    const gates = [...Object.values(state.onlyfun?.pendingGates || {}), ...(state.conversationGates || [])];
    for (const gate of gates) {
      if (!gate || !storyPathsEqual(routePath(gate.startStory || gate.storyPath || gate.story), targetPath)) continue;
      if (gate.onceKey && completed.has(canonicalId(gate.onceKey))) continue;
      if (Number(gate.scopeMaxDay) > 0 && Number(state.world?.day) > Number(gate.scopeMaxDay)) continue;
      const creatorId = canonicalId(gate.requiredCreatorId || gate.creatorId || "");
      if (creatorId && !state.onlyfun?.subscriptions?.[creatorId]) {
        return { kind: "onlyfun_subscription", app: "onlyfun", gateId: String(gate.id || gate.gateId || ""), creatorId, targetPath };
      }
    }
    const gate = state.hak?.gate;
    if (gate && storyPathsEqual(routePath(gate.startStory), targetPath)) {
      const required = (Array.isArray(gate.required) ? gate.required : []).filter(Boolean);
      const unseen = required.filter(id => state.hak?.evidenceSeen?.[id] !== true && !(state.hak?.photos || []).some(row => String(row.id) === String(id) && row.seen === true));
      if (unseen.length) return { kind: "hak_evidence", app: "hak", gateId: String(gate.gateId || ""), required: unseen, targetPath };
    }
    return null;
  }

  function deferStoryForExternalInteraction(storyPath, interaction, logError) {
    if (!interaction) return false;
    logError("requirements_not_met", { storyPath, externalInteraction: interaction });
    return true;
  }

  // Route eligibility for a candidate story. Shared by every candidate scan in
  // this file (findMissingRequiredStory, findNextLogicalStoryAfterCompleted,
  // findIncompleteLogicalStoryForDay), so recovery and scheduling agree.
  //
  // The route is resolved through ConditionGrammar.routeAuthorityOwner -- the
  // SAME canonical rule the engine's own scheduler uses -- rather than a second
  // copy of it. A support owner (tutor) has no route_<owner>_locked_v1 of its
  // own, so asking for ITS route returned "" and made every route-scoped
  // support story eligible under every route. Live tester defect: with
  // Hailey=LOVE and Lena=NTS, story/DAY10/nts/DAY10_01_TUTOR_FIRST_MEETING_NTS
  // passed this filter, became the idle-recovery candidate, failed to start,
  // and was reselected on every 750ms recovery tick.
  function logicalCandidateRouteMatches(candidateJson, entry, ownerId) {
    const authoredRoute = canonicalId(candidateJson?.route || entry?.route || String(entry?.path || "").match(/\/+(love|ntr|nts)\//i)?.[1] || "");
    if (!authoredRoute) return true;
    const grammar = window.ConditionGrammar;
    const routeOwner = ownerId
      ? canonicalId(typeof grammar?.routeAuthorityOwner === "function" ? grammar.routeAuthorityOwner(ownerId) : ownerId)
      : "";
    const lockedRoute = routeOwner ? canonicalId(readCanonicalLockedRoute(routeOwner)) : "";
    if (!lockedRoute) {
      // A support owner whose governing character has no locked route yet
      // cannot be proven eligible; only genuinely route-less owners (no
      // governing character at all) stay permissive, exactly as before.
      const governed = !!routeOwner && routeOwner !== canonicalId(ownerId);
      return !governed;
    }
    return authoredRoute === lockedRoute;
  }

  // Admission scans need the authored metadata for this exact physical file.
  // loadJson intentionally routes and translates playable content; using it
  // here paired a LOVE path with an NTR onceKey and repeatedly cloned state.
  // These immutable, small records remain valid across playthrough restores.
  const storyAdmissionMetadata = new Map();
  async function loadStoryAdmissionMetadata(path) {
    const normalized = normalizeStoryPath(path);
    if (!storyAdmissionMetadata.has(normalized)) {
      const pending = (async () => {
        const response = await fetch(normalized, { cache: "no-store" });
        if (!response?.ok) throw new Error(`Failed to load story metadata: ${normalized}`);
        const json = await response.json();
        return Object.fromEntries(["onceKey", "contactId", "day", "route", "requireOnceKey", "requireCondition", "requireWatched", "requireWatchedAny", "requireWatchedKey"].map(key => [key, json[key]]));
      })();
      storyAdmissionMetadata.set(normalized, pending);
      pending.catch(() => { if (storyAdmissionMetadata.get(normalized) === pending) storyAdmissionMetadata.delete(normalized); });
    }
    return storyAdmissionMetadata.get(normalized);
  }

  async function findMissingRequiredStory(storyJson, targetPath) {
    const rawRequirement = String(storyJson?.requireOnceKey || "").trim();
    const targetDay = Number(storyJson?.day || String(targetPath || "").match(/(?:^|\/)DAY(\d+)(?:\/|_)/i)?.[1] || 0) || 0;
    if (!rawRequirement || targetDay < 2) return null;
    const requiredKeys = rawRequirement.split("|").map((key) => canonicalId(key)).filter(Boolean);
    const missingKeys = requiredKeys.filter((key) => !onceDone(key));
    if (!missingKeys.length) return null;
    const canonicalDay = Number(window.GameStateEngine?.getWorldDay?.() || targetDay);
    const canonical = window.ConditionGrammar?.getNextCanonicalStory && Array.isArray(window.StoryAdmissionCatalog) ? readCanonicalChronologyCandidate(canonicalDay) : undefined;
    if (canonical !== undefined) return canonical ? {...canonical, targetPath: normalizeStoryPath(targetPath), targetDay, missingKeys} : null;
    const manifest = await loadStoryManifest();
    const candidates = (manifest?.sortedEntries || []).filter((entry) => {
      const day = Number(entry?.day || 0);
      return day === targetDay || day === targetDay - 1;
    });
    for (const entry of candidates) {
      if (!logicalCandidateRouteMatches(null, entry, canonicalId(entry?.contactId || ""))) continue;
      let candidateJson = null;
      try { candidateJson = await loadStoryAdmissionMetadata(entry.path); } catch { continue; }
      const onceKey = canonicalId(candidateJson?.onceKey || "");
      if (!onceKey || !missingKeys.includes(onceKey)) continue;
      const ownerId = canonicalId(candidateJson?.contactId || entry?.contactId || "");
      if (ownerId && shouldHideCharacterFromUI(ownerId)) continue;
      if (!logicalCandidateRouteMatches(candidateJson, entry, ownerId)) continue;
      return {
        path: normalizeStoryPath(entry.path),
        blockingInteraction: findBlockingStoryInteraction(entry.path),
        contactId: ownerId,
        onceKey,
        targetPath: normalizeStoryPath(targetPath),
        targetDay,
        missingKeys
      };
    }
    return { path: "", contactId: "", onceKey: "", targetPath: normalizeStoryPath(targetPath), targetDay, missingKeys };
  }

  function readCanonicalChronologyCandidate(day) {
    const engine = window.GameStateEngine, grammar = window.ConditionGrammar;
    if (!grammar?.getNextCanonicalStory || !Array.isArray(window.StoryAdmissionCatalog)) return undefined;
    const state = engine?.getStoryDecisionState?.();
    if (!state) throw Object.assign(new Error('Canonical chronology state unavailable'), {code: 'CHRONOLOGY_STATE_UNAVAILABLE'});
    const result = grammar.getNextCanonicalStory(state, window.StoryAdmissionCatalog, {day: Number(day || state.world?.day), service: window.GameTimeService});
    if (result.status === 'DAY_COMPLETE' || result.status === 'ACTIVE') return null;
    if (result.status !== 'MISSING') {
      const code = result.status === 'CHRONOLOGY_CAUSAL_CONFLICT' ? result.status : 'CHRONOLOGY_REQUIRED_SLOT_BLOCKED';
      throw Object.assign(new Error(code + ': ' + (result.path || result.day)), {code, detail: result});
    }
    return {...result, blockingInteraction: findBlockingStoryInteraction(result.path)};
  }

  function resolveCompletedCanonicalChainTarget(targetPath, targetOnceKey, context = {}) {
    return resolveCanonicalChainSuccessor(targetPath, targetOnceKey, context, true);
  }

  function resolveCanonicalChainSuccessor(targetPath, targetOnceKey, context = {}, requireCompletedTarget = false) {
    const engine = window.GameStateEngine, grammar = window.ConditionGrammar;
    const catalog = window.StoryAdmissionCatalog;
    if (!engine?.hasCompletedStory || !grammar?.getNextCanonicalStory || !Array.isArray(catalog)) return null;
    const sourcePath = normalizeStoryPath(context.sourceStoryPath || "");
    const requestedPath = normalizeStoryPath(targetPath || "");
    const completed = (path, onceKey) => {
      const entry = catalog.find(row => storyPathsEqual(row.path, path));
      if (!entry || !onceKey || canonicalId(entry.onceKey) !== canonicalId(onceKey) || !engine.hasOnceKey?.(onceKey)) return false;
      // A step can set the story once flag before COMPLETE. Require the
      // separate completion authority, including established legacy IDs.
      return [stableStoryIdForPath(path), entry.id, onceKey, path]
        .filter(Boolean).some(id => engine.hasCompletedStory(id));
    };
    if (!completed(sourcePath, context.sourceOnceKey) || (requireCompletedTarget && !completed(requestedPath, targetOnceKey))) return null;
    const state = engine.getStoryDecisionState?.();
    if (!state) return null;
    if (state.execution?.lease && [sourcePath, requestedPath].some(path => storyPathsEqual(state.execution.activeStoryPath, path))) return null;
    if (!requireCompletedTarget) {
      const requestedEntry = catalog.find(row => storyPathsEqual(row.path, requestedPath));
      if (!requestedEntry) return null;
      if (requestedEntry.onceKey && engine.hasOnceKey?.(requestedEntry.onceKey)) return null;
      // The selector, not an old authored routing link, owns a post-completion
      // cross-story handoff. Keep the requested target when it is selected.
    }
    let result = grammar.getNextCanonicalStory(state, catalog, {day: state.world?.day, service: window.GameTimeService});
    if (!requireCompletedTarget && result.status === "MISSING" && storyPathsEqual(result.path, requestedPath)) return null;
    if (result.status === "ACTIVE") {
      // Canonical COMPLETE/recovery has already handed off. The renderer's
      // old continuation must not queue, clear pending, or replace this lease.
      return {status: "SATISFIED", reason: "canonical_successor_active", successor: result};
    }
    if (result.status === "DAY_COMPLETE") {
      result = grammar.getNextCanonicalStory(state, catalog, {day: Number(state.world.day) + 1, service: window.GameTimeService});
    }
    if (result.status === "MISSING") {
      const interaction = findBlockingStoryInteraction(result.path);
      return interaction
        ? {status: "BLOCKED", reason: "external_interaction", successor: result, blockingInteraction: interaction}
        : {status: "NEXT", path: result.path, successor: result};
    }
    if (result.status === "DAY_COMPLETE") return {status: "SATISFIED", reason: "canonical_required_stories_complete", successor: result};
    return {status: result.status, reason: result.reason || "canonical_successor_blocked", successor: result};
  }

  async function findNextLogicalStoryAfterCompleted(storyJson, completedPath) {
    // The final chapter card has no successor. Legacy saves can reach it
    // without a complete chronology prefix; do not reopen earlier scenes.
    if (storyPathsEqual(completedPath, "story/DEV/DAY20_END_CHAPTER.json")) return null;
    const completedDay = Number(storyJson?.day || String(completedPath || "").match(/(?:^|\/)DAY(\d+)(?:\/|_)/i)?.[1] || 0) || 0;
    if (!completedDay) return null;
    if (window.ConditionGrammar?.getNextCanonicalStory && Array.isArray(window.StoryAdmissionCatalog)) {
      const currentDay = Number(window.GameStateEngine?.getWorldDay?.() || completedDay);
      const current = readCanonicalChronologyCandidate(currentDay);
      if (current) return current;
      const state = window.GameStateEngine?.getStoryDecisionState?.();
      const complete = window.ConditionGrammar.getNextCanonicalStory(state, window.StoryAdmissionCatalog, {day: currentDay, service: window.GameTimeService});
      return complete.status === 'DAY_COMPLETE' ? readCanonicalChronologyCandidate(currentDay + 1) : null;
    }
    const manifest = await loadStoryManifest();
    for (const entry of (manifest?.sortedEntries || [])) {
      const day = Number(entry?.day || 0);
      if (day !== completedDay && day !== completedDay + 1) continue;
      if (!logicalCandidateRouteMatches(null, entry, canonicalId(entry?.contactId || ""))) continue;
      let candidateJson = null;
      try { candidateJson = await loadStoryAdmissionMetadata(entry.path); } catch { continue; }
      const onceKey = canonicalId(candidateJson?.onceKey || "");
      if (!onceKey || onceDone(onceKey) || !requirementsMet(candidateJson || {})) continue;
      const ownerId = canonicalId(candidateJson?.contactId || entry?.contactId || inferContactIdFromStory(candidateJson) || "");
      if (ownerId && shouldHideCharacterFromUI(ownerId)) continue;
      if (!logicalCandidateRouteMatches(candidateJson, entry, ownerId)) continue;
      // The manifest is already sorted by day, order, then physical path.
      // Keep its first eligible boundary, including an external app gate.
      return { path: normalizeStoryPath(entry.path), contactId: ownerId, onceKey, day, order: Number(entry?.order || 0), blockingInteraction: findBlockingStoryInteraction(entry.path) };
    }
    return null;
  }

  async function findIncompleteLogicalStoryForDay(day) {
    const targetDay = Number(day || 0) || 0;
    if (!targetDay) return null;
    const canonical = window.ConditionGrammar?.getNextCanonicalStory && Array.isArray(window.StoryAdmissionCatalog) ? readCanonicalChronologyCandidate(targetDay) : undefined;
    if (canonical !== undefined) return canonical;
    const manifest = await loadStoryManifest();
    for (const entry of (manifest?.sortedEntries || [])) {
      if (Number(entry?.day || 0) !== targetDay) continue;
      if (!logicalCandidateRouteMatches(null, entry, canonicalId(entry?.contactId || ""))) continue;
      let candidateJson = null;
      try { candidateJson = await loadStoryAdmissionMetadata(entry.path); } catch { continue; }
      const onceKey = canonicalId(candidateJson?.onceKey || "");
      if (!onceKey || onceDone(onceKey) || !requirementsMet(candidateJson || {})) continue;
      const ownerId = canonicalId(candidateJson?.contactId || entry?.contactId || inferContactIdFromStory(candidateJson) || "");
      if (ownerId && shouldHideCharacterFromUI(ownerId)) continue;
      if (!logicalCandidateRouteMatches(candidateJson, entry, ownerId)) continue;
      return { path: normalizeStoryPath(entry.path), blockingInteraction: findBlockingStoryInteraction(entry.path), contactId: ownerId, onceKey, day: targetDay, order: Number(entry?.order || 0) || 0 };
    }
    return null;
  }

  function getBuildRelease() {
    return BUILD_RELEASE;
  }

  function getPatreonUnlockRelease() {
    const parsed = Number.parseInt(String(safeGetLS(PATREON_UNLOCK_KEY) || "").trim(), 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  function setPatreonUnlockRelease(rawValue) {
    const next = Math.max(0, Number.parseInt(String(rawValue || "").trim(), 10) || 0);
    safeSetLS(PATREON_UNLOCK_KEY, String(next));
    return next;
  }

  function clearPatreonUnlockRelease() {
    safeRemLS(PATREON_UNLOCK_KEY);
  }

  function hasPatreonMasterUnlock() {
    return safeGetLS(PATREON_MASTER_UNLOCK_KEY) === "1";
  }

  function hasDevUnlock() {
    return safeGetLS(DEV_TIMELINE_UNLOCK_KEY) === "1";
  }

  function hasGalleryFullUnlock() {
    try { return window.GameStateEngine?.getState?.()?.gallery?.fullUnlock === true; } catch {}
    return safeGetLS(GALLERY_FULL_UNLOCK_KEY) === "1";
  }

  function hasPatreonUnlock() {
    return hasPatreonMasterUnlock();
  }

  function hasPremiumUnlock() {
    try {
      const entitlements = window.EntitlementService?.snapshot?.();
      if (entitlements) return entitlements.lenaUpdate === true || entitlements.developer === true || hasDevUnlock();
    } catch {}
    return safeGetLS("patreon_lena_day16_20_unlock_v1") === "1" || hasDevUnlock();
  }

  function storyDayFromPath(path) {
    const normalized = normalizeManifestPath(path);
    const match = normalized.match(/(?:^|\/)day(\d+)(?:\/|_|-)/i);
    return match ? Math.max(0, Number(match[1]) || 0) : 0;
  }

  function storyAccessMeta(input) {
    if (typeof input === "string") {
      const path = normalizeManifestPath(input);
      return { path, day: storyDayFromPath(path), order: 0, id: "", contactId: "" };
    }
    const raw = (input && typeof input === "object") ? input : {};
    const path = normalizeManifestPath(raw.path || raw.storyPath || raw.story || "");
    return {
      ...raw,
      id: String(raw.id || raw.manifestId || raw.storyId || "").trim(),
      path,
      storyPath: path,
      day: Math.max(0, Number(raw.day || storyDayFromPath(path) || 0) || 0),
      order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : 0,
      contactId: canonicalId(raw.contactId || raw.characterId || raw.ownerId || raw.owner || "")
    };
  }

  function inferPremiumCharacterFromMeta(meta) {
    const entry = storyAccessMeta(meta);
    const explicit = canonicalId(entry.contactId || entry.characterId || entry.ownerId || entry.owner || "");
    if (explicit) return explicit;
    const haystack = `${entry.id || ""} ${entry.path || ""}`.toLowerCase();
    const premiumCharacter = canonicalId(CONTENT_ACCESS_CONFIG.premiumCharacter);
    if (premiumCharacter && haystack.includes(`_${premiumCharacter}_`)) return premiumCharacter;
    if (premiumCharacter && haystack.includes(`/${premiumCharacter}/`)) return premiumCharacter;
    return "";
  }

  function isFreeStory(entryOrPath) {
    const entry = storyAccessMeta(entryOrPath);
    const day = Math.max(0, Number(entry.day || 0) || 0);
    if (day > 0 && day < Number(CONTENT_ACCESS_CONFIG.freeUntil.day || 0)) return true;
    const normalized = normalizeManifestPath(entry.path || "");
    return CONTENT_ACCESS_CONFIG.freeUntil.storyPaths.some((freePath) => normalizeManifestPath(freePath) === normalized);
  }

  function isPremiumStory(entryOrPath) {
    const entry = storyAccessMeta(entryOrPath);
    if (!CONTENT_ACCESS_CONFIG.premiumRequiresPatreon) return false;
    if (isFreeStory(entry)) return false;

    const day = Math.max(0, Number(entry.day || 0) || 0);
    const startDay = Math.max(0, Number(CONTENT_ACCESS_CONFIG.premiumRange.startDay || 0) || 0);
    const endDay = Math.max(startDay, Number(CONTENT_ACCESS_CONFIG.premiumRange.endDay || startDay) || startDay);
    if (!day || day < startDay || day > endDay) return false;

    const premiumCharacter = canonicalId(CONTENT_ACCESS_CONFIG.premiumCharacter);
    const inferredCharacter = inferPremiumCharacterFromMeta(entry);
    if (premiumCharacter && inferredCharacter === premiumCharacter) return true;

    const normalized = normalizeManifestPath(entry.path || "").toLowerCase();
    return CONTENT_ACCESS_CONFIG.premiumPathIncludes.some((needle) => {
      const token = String(needle || "").trim().toLowerCase();
      return token && normalized.includes(token);
    });
  }

  function clearPremiumBlockedStory() {
    safeRemLS(PREMIUM_BLOCKED_STORY_KEY);
  }

  function setPremiumBlockedStory(storyPath, opts = {}, source = "story_access") {
    const path = normalizeStoryPath(String(storyPath || "").trim());
    if (!path) return null;
    const payload = {
      path,
      storyPath: path,
      opts: (opts && typeof opts === "object") ? opts : {},
      source: String(source || "story_access").trim() || "story_access",
      at: Date.now()
    };
    safeSetLS(PREMIUM_BLOCKED_STORY_KEY, JSON.stringify(payload));
    return payload;
  }

  function isPremiumCodeModalOpenFor(path) {
    try {
      const host = document.getElementById(PATREON_CODE_MODAL_ID);
      if (!host || host.hidden !== false) return false;
      const raw = safeGetLS(PREMIUM_BLOCKED_STORY_KEY);
      const stored = raw ? safeJsonParse(raw, null) : null;
      return !!stored && normalizeStoryPath(String(stored.path || "")) === path;
    } catch { return false; }
  }

  function showPremiumStoryGate(storyPath, opts = {}, meta = {}) {
    const path = normalizeStoryPath(String(storyPath || "").trim());
    if (!path) return false;
    if (hasPremiumUnlock()) return false;
    const pending = readPendingStory();
    const pendingOwnsGate = normalizeStoryPath(pending?.path || pending?.storyPath || "") === path;
    const communicationPending = pendingOwnsGate ? pending : { kind: "direct", path };
    const communicationOwner = pendingRequirementOwner(communicationPending, path);
    if (communicationOwner && communicationOwner === premiumGateCommunicationOwner) return true;
    const blocked = setPremiumBlockedStory(path, opts || {}, meta?.source || "premium_gate");
    // Opening the singleton clears its input. An already delivered gate
    // belongs to this pending operation; Cancel must also let the player
    // use Save/Settings while access remains blocked.
    if (isPremiumCodeModalOpenFor(path)) {
      if (communicationOwner) premiumGateCommunicationOwner = communicationOwner;
      return true;
    }
    try {
      const opened = openPatreonCodeModal({
        title: "Latest Patreon Update",
        subtitle: "This part is included in the latest Patreon update. Enter your Patreon code to keep playing from here.",
        source: "premium_story_gate",
        onSuccess: () => {
          if (!canAccessStory(path)) return;
          clearPremiumBlockedStory();
          setTimeout(() => {
            try {
              // Redemption also emits the entitlement wake event. If that
              // listener already consumed this pending, there is nothing
              // to admit again. A Load/new pending also retires this callback.
              if (!pendingOwnsGate) {
                if (communicationOwner !== pendingRequirementOwner(communicationPending, path)) return;
              } else {
                if (communicationOwner !== pendingRequirementOwner(readPendingStory(), path)) return;
                (window.Game ||= {}).resumePendingStory?.({ source: "requirement_wake_entitlement", auto: true });
                return;
              }
              const resumeOpts = (blocked && blocked.opts && typeof blocked.opts === "object") ? blocked.opts : {};
              (window.Game ||= {}).startStory?.(path, {
                ...resumeOpts,
                reason: "premium_gate_unlocked",
                allowConversationInterrupt: true
              });
            } catch {}
          }, 0);
        }
      });
      if (opened && communicationOwner) premiumGateCommunicationOwner = communicationOwner;
      if (!opened && window.UIModal && typeof window.UIModal.alert === "function") {
        const alert = window.UIModal.alert({
          title: "Latest Patreon Update",
          text: "This part is included in the latest Patreon update. Enter a Patreon code from Settings to continue.",
          okText: "OK"
        });
        if (alert && communicationOwner) premiumGateCommunicationOwner = communicationOwner;
      }
    } catch {}
    return true;
  }

  function emitPatreonMasterUnlockChanged(source = "runtime") {
    try {
      window.dispatchEvent(new CustomEvent("patreon:master-unlock-changed", {
        detail: {
          unlocked: hasPatreonMasterUnlock(),
          devUnlocked: hasDevUnlock(),
          premiumUnlocked: hasPremiumUnlock(),
          source: String(source || "runtime").trim() || "runtime"
        }
      }));
    } catch {}
  }

  function emitGalleryFullUnlockChanged(source = "runtime") {
    try {
      window.dispatchEvent(new CustomEvent("gallery:full-unlock-changed", {
        detail: {
          unlocked: hasGalleryFullUnlock(),
          source: String(source || "runtime").trim() || "runtime"
        }
      }));
    } catch {}
  }

  function unlockPatreonMaster() {
    safeSetLS(PATREON_MASTER_UNLOCK_KEY, "1");
    // scripts/entitlement-service.js's canonical snapshot() reads Mason
    // access from a SEPARATE key ("patreon_mason_day9_15_unlock_v1", via
    // its own readFlag('mason')) or the card-vault reward ledger -- neither
    // of which this function (the actual handler for the "premium" code
    // both start-from-entry.js and new-update-entry.js use specifically to
    // unlock Mason) ever touched. Found live (Feature 4 Day1-15 final
    // certification, "New Update" family): Mason was correctly unlocked
    // and functionally accessible (canAccessStory()/hasPremiumUnlock()
    // read PATREON_MASTER_UNLOCK_KEY correctly), but the canonical
    // world.entitlements.masonUpdate snapshot -- built from entitlement-
    // service.js's own separate accounting -- never became true, a genuine
    // two-system desync (confirmed: nothing in scenes/*.html reads the
    // canonical field directly, so this had no player-visible gating
    // impact, but is a real state-consistency defect worth closing).
    safeSetLS("patreon_mason_day9_15_unlock_v1", "1");
    const unlocked = hasPatreonMasterUnlock();
    if (unlocked) emitPatreonMasterUnlockChanged("unlock");
    return unlocked;
  }

  function clearPatreonMasterUnlock() {
    const hadUnlock = hasPatreonMasterUnlock();
    safeRemLS(PATREON_MASTER_UNLOCK_KEY);
    const cleared = !hasPatreonMasterUnlock();
    if (hadUnlock || cleared) emitPatreonMasterUnlockChanged("clear");
    return cleared;
  }

  function unlockFullGallery(source = "gallery_code") {
    try {
      const engine=window.GameStateEngine,state=engine?.getState?.();
      if(state?.gallery&&!state.gallery.fullUnlock)engine.dispatch({type:"SET_GALLERY_FULL_UNLOCK",commandId:`gallery-full-unlock:${String(source||"code")}`,expectedRevision:state.revision,payload:{enabled:true,source}});
      else if(!state?.gallery)safeSetLS(GALLERY_FULL_UNLOCK_KEY, "1");
    } catch { safeSetLS(GALLERY_FULL_UNLOCK_KEY, "1"); }
    const unlocked = hasGalleryFullUnlock();
    if (unlocked) emitGalleryFullUnlockChanged(source);
    return unlocked;
  }

  function normalizeAccessCodeInput(rawCode) {
    return String(rawCode ?? "").trim().toUpperCase();
  }

  function normalizeAccessCodeContext(rawContext) {
    const context = String(rawContext || "").trim().toLowerCase();
    if (context === "gallery" || context.includes("gallery")) return "gallery";
    return "premium";
  }

  function getAccessCodes() {
    // Raw codes are never bundled or exposed by the runtime. The registry
    // stores hashes and redemption IDs; callers redeem through its API.
    return {};
  }

  async function applyAccessCode(rawCode, context = "premium") {
    const accessContext = normalizeAccessCodeContext(context);
    const code = normalizeAccessCodeInput(rawCode);
    if (!code) return { ok: false, reason: "empty", codeRedacted: true, context: accessContext, message: "Enter a code" };
    const vault = window.CardVaultSystem;
    if (typeof vault?.redeemCode !== "function") return { ok: false, reason: "config_loading", codeRedacted: true, context: accessContext, message: "Patreon code unavailable." };
    try {
      const redeemed = await vault.redeemCode(code, { source: "patreon_code_modal" });
      const alreadyClaimed = redeemed?.reason === "already_claimed";
      if (redeemed?.reason === "pending_reveal") return { ...redeemed, ok: false, codeRedacted: true, context: accessContext, message: window.Game?.i18n?.ui?.("cardvault.collect_pending_before_code", "Collect your pending Card Vault reveal before redeeming this reward.") || "Collect your pending Card Vault reveal before redeeming this reward." };
      if (redeemed?.ok !== true && !alreadyClaimed) return { ...redeemed, ok: false, codeRedacted: true, context: accessContext, message: "Invalid code" };
      // A repeated valid code keeps its original scope. An unrelated old
      // grant must never make a points/gallery code look like Lena access.
      const resolved = vault.resolveCode?.(code) || {};
      const lenaAccess = resolved.lenaAccess === true;
      const masonAccess = resolved.masonAccess === true;
      const haileyAccess = resolved.haileyAccess === true;
      const galleryAccess = resolved.galleryAccess === true;
      const devAccess = resolved.devAccess === true;
      const cardReward = resolved.cardReward === true;
      return {
        ...redeemed,
        ok: true,
        type: cardReward ? "card_reward" : (devAccess ? "developer" : (galleryAccess ? "gallery" : (lenaAccess ? "lena" : (resolved.supporterTier ? "support_tier" : "reward")))),
        cardReward,
        unlocked: lenaAccess || masonAccess || haileyAccess || galleryAccess || devAccess,
        lenaAccess, masonAccess, haileyAccess, galleryAccess, devAccess,
        codeRedacted: true,
        context: accessContext,
        reason: alreadyClaimed ? "already_claimed" : "granted",
        message: alreadyClaimed ? "Code already redeemed" : (cardReward ? (window.Game?.i18n?.ui?.("cardvault.special_card_unlocked", "Special card unlocked") || "Special card unlocked") : (devAccess ? "Developer access active" : (galleryAccess ? "Gallery unlocked" : (lenaAccess || masonAccess || haileyAccess ? "Premium content unlocked" : "Reward claimed"))))
      };
    } catch (err) {
      try { console.warn("[PatreonCode] canonical access-code redemption failed", String(err?.message || err)); } catch {}
      return { ok: false, reason: "redemption_failed", codeRedacted: true, context: accessContext, message: "Unable to save unlock on this device" };
    }
  }

  function submitPatreonCode(rawCode, context = "premium") {
    return applyAccessCode(rawCode, context);
  }

  function ensurePatreonCodeModalStyle() {
    if (typeof document === "undefined") return false;
    if (document.getElementById(PATREON_CODE_MODAL_STYLE_ID)) return true;
    const style = document.createElement("style");
    style.id = PATREON_CODE_MODAL_STYLE_ID;
    style.textContent = `
      #${PATREON_CODE_MODAL_ID}{
        position:fixed;
        inset:0;
        z-index:13000;
      }
      #${PATREON_CODE_MODAL_ID}[hidden]{
        display:none !important;
      }
      #${PATREON_CODE_MODAL_ID} .patreon-code-overlay{
        position:absolute;
        inset:0;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:18px;
        background:
          radial-gradient(circle at top, rgba(9,14,28,0.68), rgba(2,4,12,0.92)),
          rgba(0,0,0,0.42);
        backdrop-filter: blur(4px);
      }
      #${PATREON_CODE_MODAL_ID} .patreon-code-card{
        width:min(360px, 92vw);
        padding:18px 16px 14px;
        border-radius:22px;
        background:rgba(7,10,18,0.82);
        border:1px solid rgba(245,248,255,0.16);
        box-shadow:
          0 24px 60px rgba(0,0,0,0.82),
          0 0 28px rgba(255,188,102,0.08);
        color:#f0f5ff;
        position:relative;
        overflow:hidden;
      }
      #${PATREON_CODE_MODAL_ID} .patreon-code-card::before{
        content:"";
        position:absolute;
        inset:0;
        pointer-events:none;
        opacity:0.72;
        background:
          repeating-linear-gradient(
            to bottom,
            rgba(255,255,255,0.00) 0px,
            rgba(255,255,255,0.00) 3px,
            rgba(255,255,255,0.04) 4px
          ),
          radial-gradient(circle at top, rgba(255,188,102,0.12), rgba(0,0,0,0.00) 55%);
      }
      #${PATREON_CODE_MODAL_ID} .patreon-code-head,
      #${PATREON_CODE_MODAL_ID} .patreon-code-body,
      #${PATREON_CODE_MODAL_ID} .patreon-code-actions{
        position:relative;
        z-index:1;
      }
      #${PATREON_CODE_MODAL_ID} .patreon-code-title{
        margin:0 0 6px;
        font-size:16px;
        font-weight:800;
        letter-spacing:0.08em;
        text-transform:uppercase;
      }
      #${PATREON_CODE_MODAL_ID} .patreon-code-subtitle{
        margin:0 0 14px;
        font-size:13px;
        line-height:1.42;
        color:rgba(240,245,255,0.72);
      }
      #${PATREON_CODE_MODAL_ID} .patreon-code-input{
        width:100%;
        padding:12px 14px;
        border-radius:14px;
        border:1px solid rgba(245,248,255,0.16);
        background:rgba(4,6,12,0.72);
        color:#f0f5ff;
        font-size:15px;
        letter-spacing:0.08em;
        text-transform:uppercase;
        outline:none;
        box-shadow: inset 0 0 0 1px rgba(0,0,0,0.28);
      }
      #${PATREON_CODE_MODAL_ID} .patreon-code-input:focus{
        border-color:rgba(255,188,102,0.48);
        box-shadow:
          inset 0 0 0 1px rgba(0,0,0,0.28),
          0 0 0 3px rgba(255,188,102,0.12);
      }
      #${PATREON_CODE_MODAL_ID} .patreon-code-status{
        min-height:20px;
        margin-top:10px;
        font-size:13px;
        line-height:1.35;
        color:rgba(240,245,255,0.72);
      }
      #${PATREON_CODE_MODAL_ID} .patreon-code-status[data-tone="error"]{
        color:#ff9e9e;
      }
      #${PATREON_CODE_MODAL_ID} .patreon-code-status[data-tone="success"]{
        color:#9bffcf;
      }
      #${PATREON_CODE_MODAL_ID} .patreon-code-actions{
        display:flex;
        justify-content:flex-end;
        gap:10px;
        margin-top:14px;
      }
      #${PATREON_CODE_MODAL_ID} .patreon-code-btn{
        min-width:96px;
        border:none;
        border-radius:999px;
        padding:9px 14px;
        cursor:pointer;
        color:#f5f9ff;
        font-size:13px;
        font-weight:800;
        letter-spacing:0.04em;
        border:1px solid rgba(245,248,255,0.18);
        background:rgba(6,7,10,0.54);
      }
      #${PATREON_CODE_MODAL_ID} .patreon-code-btn:hover{
        filter:brightness(1.06);
        border-color:rgba(245,248,255,0.42);
      }
      #${PATREON_CODE_MODAL_ID} .patreon-code-btn:focus-visible{
        outline:2px solid rgba(245,248,255,0.52);
        outline-offset:2px;
      }
      #${PATREON_CODE_MODAL_ID} .patreon-code-btn.primary{
        background:rgba(255,188,102,0.16);
        border-color:rgba(255,188,102,0.58);
        box-shadow:0 0 20px rgba(255,188,102,0.08);
      }
    `;
    document.head?.appendChild(style);
    return true;
  }

  function ensurePatreonCodeModal() {
    if (typeof document === "undefined" || !document.body) return null;
    if (!ensurePatreonCodeModalStyle()) return null;

    let host = document.getElementById(PATREON_CODE_MODAL_ID);
    if (host && host.__patreonCodeUi) return host.__patreonCodeUi;

    host = document.createElement("div");
    host.id = PATREON_CODE_MODAL_ID;
    host.hidden = true;
    host.setAttribute("aria-hidden", "true");
    host.innerHTML = `
      <div class="patreon-code-overlay">
        <div class="patreon-code-card" role="dialog" aria-modal="true" aria-labelledby="patreon-code-title">
          <div class="patreon-code-head">
            <h2 class="patreon-code-title" id="patreon-code-title">${PATREON_CODE_MODAL_DEFAULT_TITLE}</h2>
            <p class="patreon-code-subtitle">${PATREON_CODE_MODAL_DEFAULT_SUBTITLE}</p>
          </div>
          <div class="patreon-code-body">
            <input class="patreon-code-input" type="text" maxlength="64" autocomplete="off" spellcheck="false" />
            <div class="patreon-code-status" aria-live="polite"></div>
          </div>
          <div class="patreon-code-actions">
            <button type="button" class="patreon-code-btn" data-action="cancel">Cancel</button>
            <button type="button" class="patreon-code-btn primary" data-action="confirm">Confirm</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(host);

    const overlay = host.querySelector(".patreon-code-overlay");
    const title = host.querySelector(".patreon-code-title");
    const subtitle = host.querySelector(".patreon-code-subtitle");
    const input = host.querySelector(".patreon-code-input");
    const status = host.querySelector(".patreon-code-status");
    const cancelBtn = host.querySelector('[data-action="cancel"]');
    const confirmBtn = host.querySelector('[data-action="confirm"]');
    const state = {
      activeElement: null,
      closeTimer: 0,
      generation: 0,
      opts: {}
    };

    function setStatus(message, tone = "") {
      if (!status) return;
      status.textContent = String(message || "");
      if (tone) status.setAttribute("data-tone", tone);
      else status.removeAttribute("data-tone");
    }

    function clearCloseTimer() {
      if (!state.closeTimer) return;
      try { clearTimeout(state.closeTimer); } catch {}
      state.closeTimer = 0;
    }

    function close(cancelled = true) {
      if (host.hidden) return;
      const onCancel = state.opts?.onCancel;
      state.generation += 1;
      clearCloseTimer();
      host.hidden = true;
      host.setAttribute("aria-hidden", "true");
      setStatus("");
      if (input) {
        input.disabled = false;
        input.value = "";
      }
      if (confirmBtn) confirmBtn.disabled = false;
      if (cancelBtn) cancelBtn.disabled = false;
      state.opts = {};
      const prev = state.activeElement;
      state.activeElement = null;
      if (prev && typeof prev.focus === "function") {
        setTimeout(() => {
          try { prev.focus(); } catch {}
        }, 0);
      }
      if (cancelled !== false && typeof onCancel === "function") {
        try { onCancel(); } catch (err) {
          try { console.warn("[PatreonCode] onCancel failed", err); } catch {}
        }
      }
    }

    async function submit() {
      if (host.hidden || confirmBtn?.disabled) return { ok: false, reason: "processing", codeRedacted: true };
      const generation = state.generation;
      const modalContext = state.opts?.context || state.opts?.source || "premium";
      const rawCode = input ? input.value : "";
      if (input) input.disabled = true;
      if (confirmBtn) confirmBtn.disabled = true;
      if (cancelBtn) cancelBtn.disabled = true;
      const result = await applyAccessCode(rawCode, modalContext);
      // Escape may dismiss this instance while its claim is being saved.
      // Never close or call a callback belonging to a newer open instance.
      if (host.hidden || state.generation !== generation) return result;
      if (input) input.disabled = false;
      if (confirmBtn) confirmBtn.disabled = false;
      if (cancelBtn) cancelBtn.disabled = false;
      setStatus(result.message, result.ok ? "success" : "error");
      if (!result.ok) return result;
      try { window.showToast?.(result.message); } catch {}
      try {
        if (typeof state.opts?.onSuccess === "function") state.opts.onSuccess(result);
      } catch (err) {
        try { console.warn("[PatreonCode] onSuccess failed", err); } catch {}
      }
      if (host.hidden || state.generation !== generation) return result;
      if (input) input.disabled = true;
      if (confirmBtn) confirmBtn.disabled = true;
      if (cancelBtn) cancelBtn.disabled = true;
      // Close immediately on success so the modal cannot block the next scene.
      if (state.generation === generation) close(false);
      if (result.cardReward && result.reason === "granted") {
        try { window.navigateToScene?.("cardvault", { from: "code_reward" }); } catch {}
      }
      return result;
    }

    cancelBtn?.addEventListener("click", close);
    confirmBtn?.addEventListener("click", submit);
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
        return;
      }
      if (event.key === "Escape" && !host.hidden) {
        event.preventDefault();
        close();
      }
    });
    overlay?.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    window.addEventListener("keydown", (event) => {
      if (host.hidden) return;
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
    }, true);

    host.__patreonCodeUi = { host, title, subtitle, input, status, cancelBtn, confirmBtn, setStatus, close, submit, state };
    return host.__patreonCodeUi;
  }

  function openPatreonCodeModal(opts = {}) {
    try {
      const ui = ensurePatreonCodeModal();
      if (!ui || !ui.host) return false;
      ui.host.hidden = false;
      ui.host.setAttribute("aria-hidden", "false");
      ui.state.generation += 1;
      ui.state.opts = (opts && typeof opts === "object") ? opts : {};
      ui.state.activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (ui.title) ui.title.textContent = String(opts?.title || PATREON_CODE_MODAL_DEFAULT_TITLE);
      if (ui.subtitle) ui.subtitle.textContent = String(opts?.subtitle || PATREON_CODE_MODAL_DEFAULT_SUBTITLE);
      const modalContext = normalizeAccessCodeContext(opts?.context || opts?.source || "premium");
      const alreadyMessage = modalContext === "gallery"
        ? (hasDevUnlock() ? "Developer unlock active" : (hasGalleryFullUnlock() ? "Gallery already unlocked" : ""))
        : (hasDevUnlock() ? "Developer unlock active" : (hasPremiumUnlock() ? "Premium already unlocked" : ""));
      ui.setStatus(
        alreadyMessage,
        alreadyMessage ? "success" : ""
      );
      if (ui.input) {
        ui.input.disabled = false;
        ui.input.value = String(opts?.defaultValue ?? "");
        ui.input.placeholder = "Enter code";
        setTimeout(() => {
          try {
            ui.input.focus();
            ui.input.select();
          } catch {}
        }, 0);
      }
      if (ui.confirmBtn) ui.confirmBtn.disabled = false;
      if (ui.cancelBtn) ui.cancelBtn.disabled = false;
      return true;
    } catch (err) {
      try { console.warn("[PatreonCode] Failed to open modal", err); } catch {}
      try { window.showToast?.("Patreon code unavailable."); } catch {}
      return false;
    }
  }

  function canAccessStory(entry, buildRelease = getBuildRelease(), patreonUnlock = getPatreonUnlockRelease()) {
    void buildRelease;
    void patreonUnlock;
    if (!entry) return true;
    if (hasPremiumUnlock()) return true;
    // The canonical entitlement service owns the current content policy:
    // Hailey is free through Day 20; only Lena Day 16-20 is premium. The older
    // runtime classifier remains as a boot fallback, configured to that same
    // boundary below. Delegate whenever the canonical service is available
    // so entry UI, checkpoint snapshots, and live admission share one rule.
    try {
      if (window.EntitlementService?.__canonical === true
        && typeof window.EntitlementService.canAccessStory === "function") {
        return window.EntitlementService.canAccessStory(entry) === true;
      }
    } catch {}
    return !isPremiumStory(entry);
  }

  async function findManifestEntryByPath(path) {
    const manifest = await loadStoryManifest();
    if (!manifest?.loaded || !manifest.byPath || manifest.byPath.size === 0) return null;

    const candidates = manifestLookupCandidates(path);
    for (const candidate of candidates) {
      const hit = manifest.byPath.get(candidate);
      if (hit) return hit;
    }
    return null;
  }

  function storyRouteGroup(path) {
    const normalized = normalizeManifestPath(path);
    const m = normalized.match(/^story\/DAY(\d+)\/([^/]+)\//i);
    if (!m) return "";
    const folder = routeToken(m[2]);
    if (!ROUTE_FOLDER_SET.has(folder)) return "";
    return `day${m[1]}/${folder}`;
  }

  async function findNextAccessibleStoryPath(currentEntry) {
    if (!currentEntry || typeof currentEntry !== "object") return null;

    const manifest = await loadStoryManifest();
    if (!manifest?.loaded || !Array.isArray(manifest.sortedEntries) || !manifest.sortedEntries.length) return null;

    const currentPath = normalizeManifestPath(currentEntry.path);
    const currentIndex = manifest.sortedEntries.findIndex((entry) => entry.path === currentPath);
    if (currentIndex < 0) return null;

    const buildRelease = getBuildRelease();
    const patreonUnlock = getPatreonUnlockRelease();
    const routeGroup = storyRouteGroup(currentPath);

    const findMatch = (predicate) => {
      for (let i = currentIndex + 1; i < manifest.sortedEntries.length; i += 1) {
        const candidate = manifest.sortedEntries[i];
        if (!candidate || candidate.path === currentPath) continue;
        if (typeof predicate === "function" && !predicate(candidate)) continue;
        if (!canAccessStory(candidate, buildRelease, patreonUnlock)) continue;
        return candidate.path;
      }
      return null;
    };

    if (routeGroup) {
      const sameRoutePath = findMatch((candidate) => storyRouteGroup(candidate.path) === routeGroup);
      if (sameRoutePath) return sameRoutePath;
    }

    return findMatch(() => true);
  }

  async function resolveAccessibleStoryPath(path) {
    const normalized = normalizeManifestPath(path);
    if (!normalized) return null;

    const manifestEntry = await findManifestEntryByPath(normalized);
    if (!manifestEntry) return canAccessStory({ path: normalized }) ? normalized : null;

    const buildRelease = getBuildRelease();
    const patreonUnlock = getPatreonUnlockRelease();
    if (canAccessStory(manifestEntry, buildRelease, patreonUnlock)) return manifestEntry.path;
    if (isPremiumStory(manifestEntry)) return null;

    const nextPath = await findNextAccessibleStoryPath(manifestEntry);
    if (nextPath && nextPath !== manifestEntry.path) {
      try {
        console.info(`[StoryAccess] Blocked by release gate, skipping to next accessible story: ${manifestEntry.path} -> ${nextPath}`);
      } catch {}
      return nextPath;
    }

    try { console.warn(`[StoryAccess] Blocked by release gate with no accessible successor: ${manifestEntry.path}`); } catch {}
    return null;
  }

  function getPendingOutboundMessageText(rawPayload = {}) {
    const raw = (rawPayload && typeof rawPayload === "object") ? rawPayload : {};
    return String(
      raw.messageText ||
      raw.heldMessageText ||
      raw.previewText ||
      raw.draftText ||
      raw.playerDraft ||
      raw.text ||
      raw.promptText ||
      raw.prompt ||
      ""
    ).trim();
  }

  function getPendingOutboundPromptText(rawPayload = {}, fallback = "") {
    const raw = (rawPayload && typeof rawPayload === "object") ? rawPayload : {};
    const promptText = String(raw.promptText || raw.prompt || "").trim();
    return promptText || String(fallback || "").trim();
  }

  function normalizePendingOutboundPayload(payload = {}) {
    const raw = (payload && typeof payload === "object") ? payload : {};
    const contactId = resolveContactId(
      raw.contactId || raw.id || "",
      raw.contactName || raw.name || ""
    );
    if (contactId && shouldHideCharacterFromUI(contactId)) return null;
    const storyPath = normalizeStoryPath(raw.storyPath || raw.story || raw.path || "");
    const messageText = getPendingOutboundMessageText(raw);
    const promptText = getPendingOutboundPromptText(raw, messageText);
    if (!contactId || !storyPath || !messageText) return null;

    const stepIndexRaw = Number(raw.stepIndex ?? raw.index ?? 0);
    const stepIndex = Number.isFinite(stepIndexRaw) ? Math.max(0, Math.floor(stepIndexRaw)) : 0;
    const resumeIndexRaw = Number(raw.resumeIndex);
    const resumeIndex = Number.isFinite(resumeIndexRaw)
      ? Math.max(0, Math.floor(resumeIndexRaw))
      : Math.max(0, stepIndex + 1);

    return {
      version: 2,
      kind: canonicalId(raw.kind || raw.reason || "outbound") || "outbound",
      contactId,
      contactName: String(raw.contactName || raw.name || "").trim(),
      storyPath,
      messageText,
      draftText: messageText,
      playerDraft: messageText,
      promptText,
      stepIndex,
      index: stepIndex,
      resumeIndex,
      onceId: String(raw.onceId || "").trim(),
      episodeOnceKey: canonicalId(raw.episodeOnceKey || raw.onceKey || ""),
      cueKind: String(raw.cueKind || "rainbow").trim() || "rainbow",
      at: Number(raw.at || Date.now()) || Date.now()
    };
  }

  function readPendingOutbound() {
    const raw = safeGetLS(PENDING_OUTBOUND_KEY);
    const parsed = raw ? safeJsonParse(raw, null) : null;
    const normalized = normalizePendingOutboundPayload(parsed);
    if (normalized) return normalized;

    const legacy = readPendingStory();
    if (!legacy || canonicalId(legacy.kind || "") !== "player_first") return null;

    const migrated = normalizePendingOutboundPayload({
      kind: "player_first",
      contactId: legacy.contactId || legacy.id || "",
      contactName: legacy.contactName || legacy.name || "",
      storyPath: legacy.storyPath || legacy.path || "",
      messageText: legacy.messageText || legacy.draftText || legacy.playerDraft || "",
      stepIndex: legacy.index,
      resumeIndex: legacy.resumeIndex,
      onceId: legacy.onceId || "",
      episodeOnceKey: legacy.opts?.__storyOnceKey || legacy.onceKey || "",
      cueKind: legacy.cueKind || "rainbow",
      at: legacy.ts || legacy.at || Date.now()
    });
    if (!migrated) return null;

    writePendingOutbound(migrated);
    clearPendingStory();
    safeRemLS(PENDING_LOCK_KEY);
    return migrated;
  }

  function writePendingOutbound(payload) {
    const normalized = normalizePendingOutboundPayload(payload);
    if (!normalized) return null;
    safeSetLS(PENDING_OUTBOUND_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function clearPendingOutbound(contactId = "") {
    const current = readPendingOutbound();
    if (!current) return false;
    if (contactId) {
      const wanted = resolveContactId(contactId || "", "");
      if (!wanted || canonicalId(wanted) !== canonicalId(current.contactId || "")) return false;
    }
    safeRemLS(PENDING_OUTBOUND_KEY);
    return true;
  }

  function readGuidedCues() {
    const raw = safeGetLS(GUIDED_CUES_KEY);
    const parsed = raw ? safeJsonParse(raw, null) : null;
    if (!parsed || typeof parsed !== "object") return { conversations: {}, apps: {} };
    const conversations = (parsed.conversations && typeof parsed.conversations === "object")
      ? parsed.conversations
      : {};
    const apps = (parsed.apps && typeof parsed.apps === "object") ? parsed.apps : {};
    return { conversations, apps };
  }

  function writeGuidedCues(data) {
    const payload = data && typeof data === "object" ? data : { conversations: {}, apps: {} };
    safeSetLS(GUIDED_CUES_KEY, JSON.stringify(payload));
    try { window.dispatchEvent(new Event("guided:cues-changed")); } catch {}
    try { window.StoryBus?.emit?.("guided:cues-changed", { at: Date.now() }); } catch {}
  }

  function setGuidedCue(contactId, payload = {}) {
    const cid = resolveContactId(contactId || "", "");
    if (!cid) return;
    if (shouldHideCharacterFromUI(cid)) return;
    const cues = readGuidedCues();
    cues.conversations[cid] = {
      kind: String(payload.kind || "rainbow").trim() || "rainbow",
      reason: String(payload.reason || "guided").trim(),
      story: String(payload.story || payload.storyPath || "").trim(),
      label: String(payload.label || "").trim(),
      at: Date.now()
    };
    cues.apps.messages = true;
    writeGuidedCues(cues);
  }

  function buildChainStartOpts(meta = {}) {
    // allowInConversation/allowPlayerTurns, when present, arrive already
    // inside meta.opts (see skipStoryForDisabledCharacter) and are kept as-is
    // by the spread above -- both must reach the chained Game.startStory
    // call, or a chained story that pauses at its first choice/player-turn
    // step never gets a chance to actually present it once opened.
    const opts = (meta?.opts && typeof meta.opts === "object") ? { ...meta.opts } : {};
    if (meta?.strictRequestedPath === true) opts.__strictRequestedPath = true;
    if (meta?.allowConversationInterrupt === true) opts.allowConversationInterrupt = true;

    const chainSource = String(meta?.chainSource || meta?.via || "").trim();
    if (chainSource) opts.__chainSource = chainSource;

    const sourceContactId = canonicalId(meta?.sourceContactId || meta?.fromContactId || "");
    if (sourceContactId) opts.__chainFromContactId = sourceContactId;

    const targetContactId = canonicalId(meta?.targetContactId || "");
    if (targetContactId) opts.__chainTargetContactId = targetContactId;

    return opts;
  }

  function setPendingChainStory(path, meta = {}) {
    const p = String(path || "").trim();
    if (!p) return;
    const via = String(meta?.via || "").trim();
    const hasStartWhenScene = Object.prototype.hasOwnProperty.call(meta || {}, "startWhenScene");
    const explicitScene = canonicalId(String(meta?.startWhenScene || "").trim());
    const startWhenScene = hasStartWhenScene
      ? explicitScene
      : (
        shouldDelayDispatchToHome(via)
          ? "home"
          : canonicalId(String(meta?.startWhenScene || "").trim())
      );
    const reason = String(meta?.reason || via || "chain").trim() || "chain";
    const startDelayMs = Math.max(0, Number(meta?.startDelayMs ?? meta?.delayMs ?? 0) || 0);
    const chainOpts = buildChainStartOpts({ ...meta, allowConversationInterrupt: true });
    queuePendingStoryStart(p, {
      from: String(meta?.from || "").trim(),
      reason,
      via,
      startWhenScene,
      force: true,
      allowConversationInterrupt: true,
      opts: chainOpts
    });
    safeSetLS(CHAIN_KEY, JSON.stringify({
      path: p,
      at: Date.now(),
      ...meta,
      reason,
      startWhenScene,
      startDelayMs,
      strictRequestedPath: meta?.strictRequestedPath === true,
      opts: chainOpts
    }));
    queueRuntimeTurn(p, {
      ...meta,
      via,
      startWhenScene,
      opts: chainOpts
    }, "runtime_set_pending_chain");
    try {
      console.info("[ConvoRuntime][chain] queued", {
        path: p,
        via,
        reason,
        startWhenScene,
        startDelayMs
      });
    } catch {}
  }

  function migrateLegacyChainToPending() {
    const raw = safeGetLS(CHAIN_KEY);
    if (!raw) return false;
    const obj = safeJsonParse(raw, null);
    const path = String(obj?.path || "").trim();
    if (!path) return false;
    const via = String(obj?.via || "").trim();
    const startWhenScene = shouldDelayDispatchToHome(via)
      ? "home"
      : canonicalId(String(obj?.startWhenScene || "").trim());
    const chainOpts = buildChainStartOpts(obj || {});
    const queued = queuePendingStoryStart(path, {
      from: String(obj?.from || "").trim(),
      reason: via || "legacy_chain",
      via,
      startWhenScene,
      force: true,
      opts: chainOpts
    });
    if (queued && queued.kind === "dispatch") {
      safeRemLS(CHAIN_KEY);
    }
    return true;
  }

  function schedulePendingRetry(source, ms = 160) {
    if (pendingRetryTimer) return;
    // Semantic retry/backoff spacing (lock-wait, canonical-commit-retry,
    // admission retry) -- NATIVE_SET_TIMEOUT so QA-fast presentation mode
    // can never compress it (see this file's header comment). clearTimeout
    // below still works on the returned id regardless of which setTimeout
    // created it.
    pendingRetryTimer = NATIVE_SET_TIMEOUT(() => {
      pendingRetryTimer = 0;
      try {
        const game = window.Game || {};
        if (typeof game.resumePendingStory === "function") {
          game.resumePendingStory({ source: source || "retry", auto: true });
        } else {
          resumePendingDispatch(source || "retry");
        }
      } catch {}
    }, Math.max(0, Number(ms) || 0));
  }

  function matchesPendingDispatchAttempt(current, attempted) {
    if (!isPendingDispatch(current) || !isPendingDispatch(attempted)) return false;
    const currentPath = normalizeStoryPath(current.path || current.storyPath || "");
    const attemptedPath = normalizeStoryPath(attempted.path || attempted.storyPath || "");
    if (!currentPath || currentPath !== attemptedPath) return false;
    return !current.id || !attempted.id || String(current.id) === String(attempted.id);
  }

  function capturePendingResumeAttemptOwner() {
    const engine = window.GameStateEngine;
    const identity = engine?.getConversationCacheFlushIdentity?.() || {};
    const execution = engine?.getExecutionState?.() || {};
    return {
      engine,
      playthroughId: String(identity.playthroughId || ""),
      operationEpoch: Number(identity.operationEpoch || 0),
      generation: Number(execution.generation || 0),
      pending: JSON.stringify(readPendingStory()),
      lock: JSON.stringify(readPendingLock())
    };
  }

  function pendingResumeAttemptLifetimeCurrent(owner, allowGenerationChange = false) {
    if (!owner || owner.engine !== window.GameStateEngine) return false;
    const identity = owner.engine?.getConversationCacheFlushIdentity?.() || {};
    if (owner.playthroughId !== String(identity.playthroughId || "") || owner.operationEpoch !== Number(identity.operationEpoch || 0)) return false;
    return allowGenerationChange || owner.generation === Number(owner.engine?.getExecutionState?.()?.generation || 0);
  }

  function pendingResumeAttemptContextCurrent(owner, allowGenerationChange = false) {
    return !isHistoricalConversationView() && pendingResumeAttemptOwner === owner && pendingResumeAttemptLifetimeCurrent(owner, allowGenerationChange);
  }

  function ownsPendingResumeAttempt(owner) {
    return pendingResumeAttemptContextCurrent(owner) && owner.pending === JSON.stringify(readPendingStory());
  }

  function finishPendingResumeAttempt(owner, path) {
    // Chapter replacement can start another attempt before an old Promise
    // settles. That old completion owns neither the busy flag nor its lock.
    if (pendingResumeAttemptOwner !== owner) return false;
    pendingResumeAttemptOwner = null;
    pendingResumeBusy = false;
    if (owner.lock === JSON.stringify(readPendingLock())) releasePendingLock(path);
    return true;
  }

  function isHistoricalConversationView() {
    if (canonicalId(getCurrentSceneName()) !== "conversation") return false;
    const query = window.Game?.lastQuery || {};
    const source = canonicalId(query.from || query.source || "");
    return source === "story_route_tree_history" || source === "story_route_tree_replay" ||
      String(query.timelineReplay || "").trim() === "1" || canonicalId(query.mode || "") === "timeline_replay";
  }

  function resumePendingDispatch(source = "") {
    if (isHistoricalConversationView()) return false;
    if (holdRestoredContactForPlayerOpen(source)) return false;
    migrateLegacyChainToPending();
    if (pendingAwaitsSourceCompletion(readPendingStory())) return false;
    try { repairPendingDay10LoveEvelynGap(); } catch {}
    try { repairPendingDay12MixedRouteNtsHandoff(); } catch {}
    try { repairPendingDay12LoveContinuationGap(); } catch {}
    try { repairPendingDay14LoveContinuationGap(); } catch {}
    try { repairPendingDay15LoveContinuationGap(); } catch {}
    if (isCinematicLocked()) return false;
    let pending = readPendingStory();
    if (!isPendingDispatch(pending)) return false;
    // COMPLETE can atomically select a different chronological successor
    // from an old time_card target. Drive that committed lease, never ask
    // the old target to compete with it. This is restricted to an unstarted
    // continuation and its exact source/target transaction receipt; ordinary
    // unrelated starts, active conversations and Replay remain untouched.
    const dispatchEngine = window.GameStateEngine;
    const dispatchExecution = dispatchEngine?.getExecutionState?.();
    const dispatchQuery = window.Game?.lastQuery || {};
    const dispatchQuerySource = canonicalId(dispatchQuery.from || dispatchQuery.source || "");
    const dispatchHistoricalView = canonicalId(getCurrentSceneName()) === "conversation" &&
      (["story_route_tree_history", "story_route_tree_replay"].includes(dispatchQuerySource) ||
        String(dispatchQuery.timelineReplay || "").trim() === "1" || canonicalId(dispatchQuery.mode) === "timeline_replay");
    if (!dispatchHistoricalView && dispatchExecution?.lease && dispatchExecution.cursor?.continuation === "activated" &&
        dispatchExecution.cursor?.phase === "ready_to_interpret" && dispatchExecution.cursor?.rootIndex === 0 &&
        dispatchExecution.activeStepIndex === 0 && !dispatchExecution.cursor.operationId &&
        Array.isArray(dispatchExecution.cursor.branchPath) && dispatchExecution.cursor.branchPath.length === 0 &&
        dispatchExecution.cursor?.leaseId === dispatchExecution.lease.id &&
        dispatchExecution.cursor?.storyId === dispatchExecution.activeStoryId &&
        dispatchExecution.cursor?.storyPath === dispatchExecution.activeStoryPath &&
        dispatchExecution.lease.storyId === dispatchExecution.activeStoryId &&
        dispatchExecution.lease.generation === dispatchExecution.generation &&
        !storyPathsEqual(pending.path || pending.storyPath, dispatchExecution.activeStoryPath) &&
        pending.timelineReplayChain !== true && pending.opts?.timelineReplayChain !== true) {
      const state = dispatchEngine.getGameplayState();
      const sourceToken = canonicalId(pending.from);
      const catalog = window.StoryAdmissionCatalog;
      const sourceEntry = Array.isArray(catalog) && catalog.find(row => sourceToken &&
        [row.onceKey, row.id, row.path].some(value => value && canonicalId(value) === sourceToken));
      const sourceIds = sourceEntry ? [sourceEntry.onceKey, sourceEntry.id, sourceEntry.path, stableStoryIdForPath(sourceEntry.path)].filter(Boolean) : [];
      const sourceComplete = sourceEntry?.onceKey && dispatchEngine.hasOnceKey(sourceEntry.onceKey) &&
        sourceIds.some(id => dispatchEngine.hasCompletedStory(id));
      const receipt = sourceComplete && Object.values(state.progression?.continuationReceipts || {}).find(row =>
        !row.deferred && !row.alreadyCompleted && sourceIds.includes(row.sourceStoryId) && row.targetStoryId === dispatchExecution.activeStoryId);
      const committed = receipt && dispatchEngine.getCommandReceipt?.(receipt.transactionId);
      if (committed?.ok && committed.nextRevision === dispatchExecution.lease.createdRevision &&
          committed.events?.some(event => event.type === "story:completed" && event.storyId === receipt.sourceStoryId) &&
          committed.events?.some(event => event.type === "story:continuation-activated" && event.receiptId === receipt.receiptId && event.storyId === dispatchExecution.activeStoryId)) {
        const opts = {...(pending.opts || {}), contactId: dispatchExecution.activeContactId || "", startIndex: 0};
        for (const key of ["conversationId", "id", "contactName", "__chainFromContactId", "__chainTargetContactId", "__afterSourceCompletion"]) delete opts[key];
        pending = {...pending, path: dispatchExecution.activeStoryPath, storyPath: dispatchExecution.activeStoryPath,
          contactId: dispatchExecution.activeContactId || "", index: 0, opts, attempts: 0,
          reason: "committed_continuation_dispatch", via: "canonical_continuation", updatedAt: Date.now()};
        writePendingStory(pending);
      }
    }
    const requestedPendingPath = String(pending.path || "").trim();
    const path = resolveCanonicalRouteStoryPath(requestedPendingPath);
    if (!path) {
      clearPendingStory();
      return false;
    }
    const requirementWake = canWakePendingRequirementFromScene(pending, path, source);
    const wasWaitingForRequirement = pendingRequirementWait?.observation.owner === pendingRequirementOwner(pending, path);
    if (deferUnchangedPendingRequirement(pending, path)) return false;
    const wantedScene = canonicalId(pending.startWhenScene || "");
    if (wantedScene) {
      const curScene = canonicalId(getCurrentSceneName());
      const allowConversationDispatchOverride =
        curScene === "conversation" &&
        wantedScene === "home" &&
        (
          pending?.allowConversationInterrupt === true ||
          (pending?.opts && pending.opts.allowConversationInterrupt === true)
        );
      if (curScene !== wantedScene && !allowConversationDispatchOverride && !requirementWake) return false;
    }
    if (pendingResumeBusy) return false;
    if (!acquirePendingLock(path)) {
      const lock = readPendingLock();
      const lockAge = Date.now() - Number(lock?.startedAt || 0);
      const wait = Math.max(120, Math.min(800, PENDING_LOCK_TTL - lockAge + 40));
      schedulePendingRetry("lock_wait", wait);
      return false;
    }

    pendingResumeBusy = true;
    const nextPending = {
      ...pending,
      path,
      storyPath: path,
      attempts: (wasWaitingForRequirement || requirementWake ? 0 : Math.max(0, Number(pending.attempts || 0) || 0)) + 1,
      lastAttemptAt: Date.now(),
      lastSource: String(source || "").trim()
    };
    // Known access denial is a read-only admission check. The pending was
    // already durably queued; persisting a retry counter on every boot
    // would change an otherwise idle Save/Load boundary.
    if (!isPremiumStory({ path }) || canAccessStory({ path })) writePendingStory(nextPending);
    else if (pending.path !== path || pending.storyPath !== path) writePendingStory({ ...pending, path, storyPath: path });
    // Capture the actual durable record: known premium denial intentionally
    // does not persist the temporary retry counter in nextPending.
    const attemptOwner = capturePendingResumeAttemptOwner();
    pendingResumeAttemptOwner = attemptOwner;

    const startOpts = {
      ...(nextPending.opts && typeof nextPending.opts === "object" ? nextPending.opts : {}),
      __fromPendingDispatch: true
    };
    // A prerequisite/logical redirect can change the target owner while its
    // inherited options still name the previous conversation.
    if (nextPending.contactId) startOpts.contactId = nextPending.contactId;
    const pendingIndex = Number(nextPending.index);
    if (Number.isFinite(pendingIndex) && pendingIndex >= 0) {
      startOpts.startIndex = pendingIndex;
    }
    try {
      console.info("[ConvoRuntime][pending] dispatch start", {
        kind: "dispatch",
        path,
        source,
        startIndex: Number(startOpts.startIndex ?? 0),
        startWhenScene: String(nextPending.startWhenScene || ""),
        attempts: Number(nextPending.attempts || 0)
      });
    } catch {}

    (async () => {
      let scheduleImmediateRecheck = true;
      try {
        const started = await (window.Game ||= {}).startStory?.(path, startOpts);
        try {
          console.info("[ConvoRuntime][pending] resume result", {
            path,
            source,
            started: !!started,
            attempts: nextPending.attempts || 0
          });
        } catch {}

        if (!pendingResumeAttemptContextCurrent(attemptOwner, true)) {
          scheduleImmediateRecheck = false;
          return;
        }
        if (started === false) {
          if (!ownsPendingResumeAttempt(attemptOwner)) {
            // startStory may durably redirect to an unmet logical slot.
            // Its old target/counter no longer owns failure classification.
            scheduleImmediateRecheck = pendingResumeAttemptContextCurrent(attemptOwner);
            return;
          }
          // General reason-driven retry policy (see classifyDispatchFailureReason)
          // -- deliberately NOT keyed off dispatchReason/via any more. A
          // deterministic failure (entitlement missing, stale target, ...)
          // must never be retried on a tight timer no matter which caller
          // queued it; a genuinely transient one gets a small bounded
          // number of retries and then a terminal diagnostic instead of
          // spinning forever.
          scheduleImmediateRecheck = false;
          const dispatchReason = canonicalId(nextPending.via || nextPending.reason || "");
          const failure = getDispatchFailure(path);
          const classification = failure?.classification || "UNKNOWN";
          const attempts = Number(nextPending.attempts || 0) || 0;

          const logPendingBlocked = (extra = {}) => {
            if (!shouldPrintDispatchFailureLog(failure, "lastPendingLoggedAt")) return;
            try {
              console.warn("[ConvoRuntime][pending] deferred dispatch blocked, keeping pending story queued", {
                path,
                source,
                dispatchReason,
                classification,
                errorCode: failure?.reason || "",
                attempts,
                repeatCount: failure?.count || 1,
                ...extra
              });
            } catch {}
            if (failure) failure.lastPendingLoggedAt = Date.now();
          };

          if (classification === "STALE" || classification === "TERMINAL") {
            // Provably can't ever start from here (already completed, no
            // accessible successor, structural loop guard, ...) --
            // reconcile through the canonical CLEAR_PENDING_STORY command
            // (never an ad hoc localStorage.removeItem) instead of
            // retrying, and only when the still-current pending record is
            // genuinely the one that just failed.
            logPendingBlocked({ resolution: "reconciled_" + classification.toLowerCase() });
            const cur = readPendingStory();
            if (matchesPendingDispatchAttempt(cur, nextPending)) {
              clearPendingStory();
            }
            safeRemLS(CHAIN_KEY);
            return;
          }

          if (classification === "WAITING_FOR_REQUIREMENT") {
            // Blocked on some OTHER piece of state (entitlement not
            // granted yet, a requireOnceKey not satisfied yet, ...) that
            // can legitimately become true later -- this is the Day16/
            // premium-gated case. Never tight-poll it: wake instantly on
            // the relevant event (entitlement change) and otherwise only
            // check back on a slow safety-net cadence, for requirement
            // classes with no dedicated event. The pending record itself
            // is left untouched so it survives Home/Save/Load/relaunch and
            // starts exactly once the requirement is actually satisfied.
            logPendingBlocked();
            rememberPendingRequirementWait(nextPending, path, failure);
            armWaitingForRequirementWake();
            schedulePendingRetry("waiting_for_requirement", WAITING_FOR_REQUIREMENT_POLL_MS);
            return;
          }

          // TRANSIENT (e.g. a JSON fetch blip) and UNKNOWN (defensive
          // default for any future unclassified reason) both get a small
          // bounded number of quick retries -- never infinite -- then a
          // single terminal diagnostic. The pending record is left in
          // place (not cleared) so a later boot-time reconciliation pass
          // or manual retry can still pick it up.
          if (attempts < TRANSIENT_DISPATCH_RETRY_LIMIT) {
            logPendingBlocked();
            schedulePendingRetry("dispatch_start_false", Math.min(900, 180 * attempts));
            return;
          }
          try {
            console.error("[ConvoRuntime][pending] deferred dispatch exhausted retry bound, stopping without clearing pending", {
              path,
              source,
              dispatchReason,
              classification,
              errorCode: failure?.reason || "",
              attempts
            });
          } catch {}
          try { window.showToast?.("Story failed to load after several attempts: " + path); } catch {}
          return;
        }
        if (started && String(nextPending.fireKey || "").trim()) {
          safeSetLS(String(nextPending.fireKey).trim(), "1");
        }
        const cur = readPendingStory();
        if (matchesPendingDispatchAttempt(cur, nextPending)) {
          clearPendingStory();
        }
        safeRemLS(CHAIN_KEY);
      } catch (err) {
        if (ownsPendingResumeAttempt(attemptOwner)) {
          try { console.error("[ConvoRuntime][pending] resume failed", { path, source, err }); } catch {}
        } else {
          scheduleImmediateRecheck = pendingResumeAttemptContextCurrent(attemptOwner);
        }
      }
      finally {
        const finishedOwnedAttempt = finishPendingResumeAttempt(attemptOwner, path);
        if (finishedOwnedAttempt && scheduleImmediateRecheck) {
          setTimeout(() => {
            try { if (pendingResumeAttemptLifetimeCurrent(attemptOwner, true)) resumePendingDispatch("post_resume_recheck"); } catch {}
          }, 0);
        }
      }
    })();

    return true;
  }

  // Make the owning contact visibly actionable on the Messages list WITHOUT
  // opening it and WITHOUT touching the canonical cursor, then leave the
  // pending record exactly as it is. This is the authorized alternative to
  // auto-navigating into a conversation that is waiting on a real player
  // action: the player can see where to go, and the boundary is still there
  // when they arrive. Purely presentational -- no canonical dispatch, so it
  // cannot advance the story or consume the required action.
  function surfaceRequiredPlayerConversation(contactId, pending, path, source) {
    const cid = resolveContactId(contactId || "", "");
    if (!cid) return false;
    const draftText = String(pending?.draftText || pending?.playerDraft || "").trim();
    try {
      setGuidedCue(cid, {
        kind: "rainbow",
        reason: "player_action_required",
        story: path,
        label: draftText
      });
    } catch {}
    try { setConversationNeedsPlayer(cid, true, { draftText }); } catch {}
    try {
      console.info("[ConvoRuntime][pending] player action required -- surfaced, not auto-opened", {
        contactId: cid,
        path,
        reason: String(pending?.reason || ""),
        scene: canonicalId(getCurrentSceneName()),
        source: String(source || "")
      });
    } catch {}
    return true;
  }

  function resumePendingResume(source = "", meta = {}) {
    if (isHistoricalConversationView()) return false;
    if (isCinematicLocked()) return false;
    const pending = readPendingStory();
    if (!isPendingResume(pending)) return false;
    const canonicalHakTutorialDone = (() => {
      if (String(pending.reason || "").trim() !== HAK_TUTORIAL_REQUIRED_KEY) return false;
      try { return window.GameStateEngine?.getHakState?.()?.tutorial?.completed === true; } catch { return false; }
    })();
    if (
      String(pending.reason || "").trim() === HAK_TUTORIAL_REQUIRED_KEY &&
      !canonicalHakTutorialDone &&
      safeGetLS(HAK_TUTORIAL_DONE_KEY) !== "1"
    ) {
      return false;
    }

    const path = normalizeStoryPath(String(pending.path || pending.storyPath || "").trim());
    if (!path) {
      clearPendingStory();
      return false;
    }
    const wasWaitingForRequirement = pendingRequirementWait?.observation.owner === pendingRequirementOwner(pending, path);
    const requirementWake = canWakePendingRequirementFromScene(pending, path, source);
    if (deferUnchangedPendingRequirement(pending, path)) return false;

    const rawPendingContact = resolveContactId(
      pending.contactId || pending.id || "",
      pending.contactName || pending.name || ""
    );
    // rawPendingContact reads "player" for a choice/player-turn pending
    // reason (see NON_CONTACT_ACTOR_IDS's header comment) -- that names WHO
    // must act next, not WHICH conversation thread the story belongs to.
    // Using it directly as a navigation/startStory contactId target below
    // reopens/switches to a nonexistent "player" conversation instead of
    // the real owning NPC thread (confirmed live, produced a 15-minute
    // stall previously misdiagnosed as a canonical lease/reclaim timing
    // bug -- see feature4-day15-love-evelyn-lease-unavailable-stall
    // memory). Fall back to the story's own owning contact -- the same
    // path-owner heuristic resolveContinuationTarget already uses
    // elsewhere in this file -- whenever the resolved id is a sentinel.
    const pendingContact = NON_CONTACT_ACTOR_IDS.has(rawPendingContact)
      ? (resolveContinuationTargetSync(path, "", null)?.contactId || "")
      : rawPendingContact;
    // Invariant tripwire: pendingContact is about to be used as a
    // navigation/startStory TARGET (role 4 / role 2), never as an actor
    // (role 1). If the resolveContinuationTarget fallback above somehow
    // still produced a sentinel or nothing, report it loudly here instead
    // of silently reopening/creating a bogus "player" conversation.
    const pendingReason = canonicalId(String(pending.reason || "").trim());
    const isHakWatchlistResume = pendingReason === "hak_watchlist_resume";
    // Global HAK interactions intentionally have no owning conversation.
    // Every other resume target must still resolve to a real contact.
    if (!isHakWatchlistResume) {
      assertRealContactIdentity(pendingContact, { source: "resumePendingResume", path, rawPendingContact, pendingReason: pending.reason || "" });
    }
    const scene = canonicalId(getCurrentSceneName());
    // RESTORE/RESUME MUST NOT CREATE AUTOPLAY.
    //
    // These three pending reasons all mean the walker stopped because a REAL
    // PLAYER must act next (a paused player turn, a player-first send, an
    // open choice). For them, *opening the owning conversation is itself the
    // required player action* -- so this function may never perform it.
    // A renderer that is merely absent is not consent.
    //
    // Live-reproduced 2026-09-07 (tester regression, Day10 + Day14, both
    // deterministic): a save taken at a `paused_turn` boundary, restored via
    // the real Load UI, landed on the home scene, and the block below
    // force-navigated into the owning conversation with zero player input.
    // conversation.html's mount then ran clearPendingForCurrentContact(),
    // which CONSUMED the boundary record -- so Load both synthesized
    // "the player opened the required conversation" and destroyed the
    // player's outstanding required action. Surfacing the contact as
    // actionable and leaving the record intact is the correct behavior:
    // the boundary survives until the player really opens the thread.
    const requiresPlayerConversation =
      pendingReason === "paused_turn" ||
      pendingReason === "player_first" ||
      pendingReason === "choice";
    if (scene === "conversation") {
      const activeConversation = resolveContactId(
        safeGetLS("openConversationId") || safeGetLS("activeConversationId") || "",
        ""
      );
      const shouldSwitchConversation =
        !!pendingContact &&
        pendingContact !== activeConversation &&
        typeof window.navigateToScene === "function";
      // Yanking the player out of the thread they are reading into a
      // different one is the same unauthorized "open a required
      // conversation" action as the home-scene case below.
      if (shouldSwitchConversation && requiresPlayerConversation) {
        surfaceRequiredPlayerConversation(pendingContact, pending, path, source);
        return false;
      }
      if (shouldSwitchConversation) {
        try {
          safeSetLS("openConversationId", pendingContact);
          safeSetLS("activeConversationId", pendingContact);
        } catch {}
        try {
          window.navigateToScene("conversation", {
            id: pendingContact,
            contactId: pendingContact,
            fromPendingResume: true,
            pendingReason
          });
          return true;
        } catch {}
      }
      // Already on the right scene, already showing the right contact (or
      // no specific contact to switch to, e.g. a global story). Whether
      // that alone is "resumed" depends on WHY the walker paused, derived
      // from the canonical cursor's own phase -- the same runtime contract
      // every step-type handler already respects, not a hardcoded reason
      // list. waiting_for_user_intent means the interpreter itself is
      // correctly positioned waiting for real UI input (a choice, HAK
      // watchlist selection, etc.) -- the existing DOM control for that
      // input is what resumes it, so returning false here (unchanged
      // behavior) is correct. Any OTHER phase means the step already
      // committed but nothing is driving the walker forward -- the exact
      // "canonically active, lease held, walker not attached" stranding
      // class this whole pending-resume path exists to recover from.
      //
      // Found live (Priority 3, HAK evidence lifecycle mission,
      // 2026-08-25): this branch always returns false here regardless of
      // phase, so a pending "resume" written while ALREADY in the target
      // conversation (e.g. a cinematic_lock pause taken while the overlay's
      // own conversation was open, restored via Save/Load) can never
      // actually restart the walker -- confirmed via a live pending record
      // stuck with reason:"cinematic_lock" indefinitely despite the overlay
      // being dismissed for real. Root cause understood (see the canonical
      // cursor's own phase for the correct general test: 'waiting_for_
      // user_intent' means real UI input is what resumes it, any other
      // phase means the step already committed but nothing is driving the
      // walker forward). TWO fix attempts were made and BOTH produced
      // repeated COMPLETE renderer hangs live (zero heartbeat progress for
      // the full test timeout, reproduced on both the Save/Load scenario
      // AND an unrelated control scenario that never touches Save/Load at
      // all): (1) falling through into this function's own nextPending/
      // writePendingStory/startOpts/async-IIFE restart mechanism, and (2)
      // the more minimal clearPendingStory()+attemptStrandedInterpreter
      // Recovery() delegation. Both attempts make a canonical dispatch
      // (SET_PENDING_STORY / CLEAR_PENDING_STORY respectively) from within
      // this exact call context (resumePendingResume, invoked from
      // index.html's overlay close() handler's own setTimeout) -- the
      // common factor across both hangs, and the strongest lead for a
      // future attempt, though NOT conclusively isolated under this
      // round's time budget. Given a complete renderer hang is a strictly
      // worse failure mode than the original bug (a stuck conversation the
      // player can still see and navigate away from), this was deliberately
      // NOT shipped -- reverted to the original, unconditional `return
      // false`. See [[feature4-priority3-evidence-lifecycle-scenario-b-
      // stranding]] for the full reproduction of both attempts and the
      // recommended next diagnostic step (reproduce in isolation with a
      // short timeout and a synchronous-dispatch-depth trace before
      // re-attempting, rather than the full 280s live scenario).
      return false;
    }
    // Was: force-navigate into the owning conversation from home. That is
    // exactly the prohibited synthesized player action (see the block
    // comment above). Surface the contact instead and hold the boundary.
    if (scene !== "conversation" && pendingContact && requiresPlayerConversation) {
      surfaceRequiredPlayerConversation(pendingContact, pending, path, source);
      return true;
    }
    if (pendingResumeBusy) return false;
    if (!acquirePendingLock(path)) {
      const lock = readPendingLock();
      const lockAge = Date.now() - Number(lock?.startedAt || 0);
      const wait = Math.max(120, Math.min(800, PENDING_LOCK_TTL - lockAge + 40));
      schedulePendingRetry("lock_wait_resume", wait);
      return false;
    }

    pendingResumeBusy = true;
    const nextPending = {
      ...pending,
      kind: "resume",
      path,
      storyPath: path,
      attempts: (wasWaitingForRequirement || requirementWake ? 0 : Math.max(0, Number(pending.attempts || 0) || 0)) + 1,
      lastAttemptAt: Date.now(),
      lastSource: String(source || "").trim()
    };
    if (!isPremiumStory({ path }) || canAccessStory({ path })) writePendingStory(nextPending);
    else if (pending.path !== path || pending.storyPath !== path) writePendingStory({ ...pending, path, storyPath: path });
    // Capture the actual durable record: known premium denial intentionally
    // does not persist the temporary retry counter in nextPending.
    const attemptOwner = capturePendingResumeAttemptOwner();
    pendingResumeAttemptOwner = attemptOwner;

    // A canonical HAK watchlist cursor is already at INPUT_REQUIRED. Replaying
    // the whole global story on relaunch races lease reclamation and can skip
    // the only UI capable of satisfying that input. Reconstruct the pending
    // interaction directly, then let the interpreter commit its resumed input.
    if (isHakWatchlistResume) {
      (async () => {
        try {
          const recovered = await resumeHakWatchlistFromPending(nextPending, source || "resume");
          if (recovered) {
            const cur = readPendingStory();
            const curPath = normalizeStoryPath(String(cur?.path || cur?.storyPath || "").trim());
            if (isPendingResume(cur) && curPath === path && String(cur?.reason || "") === "hak_watchlist_resume") {
              clearPendingStory();
            }
            safeRemLS(CHAIN_KEY);
          }
        } catch (err) {
          try { console.error("[ConvoRuntime][pending] HAK watchlist reconstruction failed", { path, source, err }); } catch {}
          schedulePendingRetry("hak_watchlist_reconstruct_failed", 260);
        } finally {
          finishPendingResumeAttempt(attemptOwner, path);
        }
      })();
      return true;
    }

    // Live-confirmed root cause (feature4-hak-tutorial-guide-hittest-abandon,
    // second finding): unlike its sibling resumePendingDispatch (the
    // kind:"dispatch" handler, which correctly sets __fromPendingDispatch:
    // true), this function never set it -- so Game.startStory's own "story
    // lock active" guard (scripts/convo-runtime.js, the
    // `!fromPendingDispatch && lockActive && lockPath === storyPath` check)
    // always saw fromPendingDispatch===false here. Since THIS function
    // itself acquires the pending lock for `path` a few lines above, every
    // single call was guaranteed to see its own just-acquired lock as
    // "blocking" and reject itself -- a 100%-reproducible self-deadlock,
    // confirmed live via a temporary diagnostic (27 consecutive
    // "blocked: story lock active" log lines, one per retry, for a
    // kind:"resume" HAK-tutorial resume target that could structurally
    // never succeed). Matching resumePendingDispatch's own flag here is the
    // exact, minimal, structural fix -- not a special case for HAK, since
    // this bug applies to EVERY kind:"resume" pending story, not just the
    // HAK tutorial's.
    const startOpts = {
      ...(nextPending.opts && typeof nextPending.opts === "object" ? nextPending.opts : {}),
      allowInConversation: false,
      allowPlayerTurns: false,
      __fromPendingDispatch: true
    };
    const pendingIndex = Number(nextPending.index);
    if (Number.isFinite(pendingIndex) && pendingIndex >= 0) {
      startOpts.startIndex = Math.max(0, pendingIndex);
    }
    if (pendingContact) startOpts.contactId = pendingContact;
    if (!startOpts.from) startOpts.from = String(meta?.from || "pending_resume").trim();
    if (!startOpts.reason) startOpts.reason = String(source || "pending_resume").trim() || "pending_resume";
    if (isHakWatchlistResume) {
      startOpts.forceStoryRestart = true;
      startOpts.allowConversationInterrupt = true;
      try {
        const game = (window.Game ||= {});
        game._activeRunner = null;
        game._activeStoryPath = null;
      } catch {}
      try { clearRuntimeTurnForStory(path, pendingContact || "", "hak_watchlist_resume_retry"); } catch {}
    }
    try {
      console.info("[ConvoRuntime][pending] dispatch start", {
        kind: "resume",
        path,
        source,
        contactId: String(pendingContact || ""),
        startIndex: Number(startOpts.startIndex ?? 0),
        attempts: Number(nextPending.attempts || 0)
      });
    } catch {}

    (async () => {
      let scheduleReplacementRecheck = false;
      try {
        const started = await (window.Game ||= {}).startStory?.(path, startOpts);
        if (!pendingResumeAttemptContextCurrent(attemptOwner, true)) return;
        if (started === false) {
          if (!ownsPendingResumeAttempt(attemptOwner)) {
            scheduleReplacementRecheck = pendingResumeAttemptContextCurrent(attemptOwner);
            return;
          }
          const game = (window.Game ||= {});
          const activeRunner = String(game._activeRunner || "").trim();
          const activePath = normalizeStoryPath(String(game._activeStoryPath || "").trim());
          const keepForSameActiveStory = !!activeRunner && activePath === path;
          const keepForHakWatchlistResume = String(nextPending.reason || "").trim() === "hak_watchlist_resume";
          const pendingResumeReason = canonicalId(
            nextPending.via ||
            nextPending.reason ||
            source ||
            ""
          );
          const keepForDeferredDispatch =
            pendingResumeReason === "time_card" ||
            pendingResumeReason === "next_day" ||
            pendingResumeReason === "boot" ||
            pendingResumeReason === "glitch_eject" ||
            pendingResumeReason === "timecard_overlay" ||
            pendingResumeReason === "timecard_overlay_fallback";
          const keepForConversationScene = canonicalId(getCurrentSceneName()) === "conversation";
          let recoveredHakWatchlist = false;
          if (keepForHakWatchlistResume && !keepForSameActiveStory) {
            try {
              recoveredHakWatchlist = await resumeHakWatchlistFromPending(nextPending, source || "resume");
            } catch {}
          }
          if (recoveredHakWatchlist) {
            const cur = readPendingStory();
            const curPath = normalizeStoryPath(String(cur?.path || cur?.storyPath || "").trim());
            const curReason = String(cur?.reason || "").trim();
            if (isPendingResume(cur) && curPath === path && curReason === "hak_watchlist_resume") {
              clearPendingStory();
            }
            safeRemLS(CHAIN_KEY);
            return;
          }

          // Same reason-driven classification contract resumePendingDispatch
          // uses (both funnel through startStory's shared logChainError/
          // recordDispatchFailure choke point) -- a deterministic failure
          // here (entitlement missing, stale target, ...) must not be kept
          // alive by the structural keepFor* retry below just because this
          // is a kind:"resume" pending, same as kind:"dispatch".
          const failure = getDispatchFailure(path);
          const classification = failure?.classification || "UNKNOWN";
          const attempts = Number(nextPending.attempts || 0) || 0;
          const logKept = (extra = {}) => {
            if (!shouldPrintDispatchFailureLog(failure, "lastPendingLoggedAt")) return;
            try {
              console.warn("[ConvoRuntime][pending] resume(kind=resume) start returned false; pending kept", {
                path,
                source,
                reason: pendingResumeReason,
                classification,
                errorCode: failure?.reason || "",
                attempts,
                repeatCount: failure?.count || 1,
                keepForSameActiveStory,
                keepForHakWatchlistResume,
                keepForDeferredDispatch,
                keepForConversationScene,
                ...extra
              });
            } catch {}
            if (failure) failure.lastPendingLoggedAt = Date.now();
          };

          if (classification === "STALE" || classification === "TERMINAL") {
            logKept({ resolution: "reconciled_" + classification.toLowerCase() });
            const cur = readPendingStory();
            const curPath = normalizeStoryPath(String(cur?.path || cur?.storyPath || "").trim());
            if (isPendingResume(cur) && curPath === path) clearPendingStory();
            safeRemLS(CHAIN_KEY);
            return;
          }
          if (classification === "WAITING_FOR_REQUIREMENT") {
            logKept();
            rememberPendingRequirementWait(nextPending, path, failure);
            armWaitingForRequirementWake();
            schedulePendingRetry("waiting_for_requirement_resume", WAITING_FOR_REQUIREMENT_POLL_MS);
            return;
          }

          // Keep pending resume entries when a start attempt returns false.
          // This prevents one transient blocked attempt from permanently dropping
          // a deferred handoff chain (for example Day 9 time-card resumes).
          // Bounded (never infinite): the structural keepFor* cases below cover
          // genuinely still-in-flux contention (another story/lease actively
          // finishing) and get a generous bound; anything else falls back to
          // the same small bound resumePendingDispatch uses.
          const structuralKeepRetrying = keepForDeferredDispatch || keepForConversationScene || keepForSameActiveStory || keepForHakWatchlistResume;
          const retryLimit = structuralKeepRetrying ? ACTIVE_CONTENTION_RETRY_LIMIT : TRANSIENT_DISPATCH_RETRY_LIMIT;
          if (attempts < retryLimit) {
            logKept();
            if (keepForDeferredDispatch) {
              schedulePendingRetry("resume_start_false_deferred", 180);
            } else if (keepForConversationScene) {
              schedulePendingRetry("resume_start_false_in_conversation", 180);
            } else if (keepForSameActiveStory || keepForHakWatchlistResume) {
              schedulePendingRetry("resume_start_false_retry_active", 220);
            } else {
              schedulePendingRetry("resume_start_false_retry", 260);
            }
            return;
          }
          try {
            console.error("[ConvoRuntime][pending] resume(kind=resume) exhausted retry bound, stopping without clearing pending", {
              path,
              source,
              reason: pendingResumeReason,
              classification,
              errorCode: failure?.reason || "",
              attempts
            });
          } catch {}
          try { window.showToast?.("Story failed to resume after several attempts: " + path); } catch {}
        }
      } catch (err) {
        if (ownsPendingResumeAttempt(attemptOwner)) {
          try { console.error("[ConvoRuntime][pending] resume(kind=resume) failed", { path, source, err }); } catch {}
        } else {
          scheduleReplacementRecheck = pendingResumeAttemptContextCurrent(attemptOwner);
        }
      } finally {
        const finishedOwnedAttempt = finishPendingResumeAttempt(attemptOwner, path);
        if (finishedOwnedAttempt && scheduleReplacementRecheck) {
          setTimeout(() => { try { if (pendingResumeAttemptLifetimeCurrent(attemptOwner, true)) (window.Game ||= {}).resumePendingStory?.({ source: "post_resume_recheck", auto: true }); } catch {} }, 0);
        }
      }
    })();

    return true;
  }

  async function resumeHakWatchlistFromPending(pendingPayload = {}, source = "") {
    const pending = (pendingPayload && typeof pendingPayload === "object") ? pendingPayload : {};
    const storyPath = normalizeStoryPath(String(pending.path || pending.storyPath || "").trim());
    const stepIndex = Number.isFinite(Number(pending.index)) ? Math.max(0, Math.floor(Number(pending.index))) : 0;
    if (!storyPath) return false;

    let storyJson = null;
    try {
      storyJson = await loadJson(storyPath);
    } catch {
      return false;
    }
    if (!storyJson || typeof storyJson !== "object") return false;
    const steps = Array.isArray(storyJson.steps) ? storyJson.steps : [];
    const watchStep = steps[stepIndex] || null;
    if (canonicalId(String(watchStep?.type || "")) !== "hak_watchlist") return false;

    const selected = await runHakWatchlist(watchStep || {});
    const committedHak = await executeCanonicalProgressionStep({
      storyPath,
      contactId: String(pending.contactId || "").trim().toLowerCase(),
      userIntent: { hakWatchlistSelected: selected },
      targetPath: canonicalPathKeyOf(watchStep),
      allowReclaim: true
    });
    if (
      committedHak.handled &&
      committedHak.result &&
      !committedHak.result.ok &&
      !isDuplicateCanonicalExec(committedHak)
    ) {
      return false;
    }
    clearIfDecisionCacheKeys({});
    emitWatchlistChanged(watchStep.storeKey || watchStep.key || HAK_WATCHLIST_DEFAULT_KEY, selected);
    try { window.dispatchEvent(new CustomEvent("hak:characters-chosen")); } catch {}
    if (watchStep?.revealApp === true || watchStep?.revealHakApp === true) revealHakAppOnHome();

    const nextStep = steps[stepIndex + 1] || null;
    const nextType = canonicalId(String(nextStep?.type || ""));
    let handledNext = false;
    if (nextType === "next_day") {
      const nextPath = normalizeStoryPath(nextStep?.startStory || nextStep?.storyPath || nextStep?.story || storyJson?.onCompleteStartStory || "");
      await showTimeCard(tplText(nextStep?.text || "THE NEXT DAY"), {
        goHome: true,
        startStory: nextPath,
        startDelayMs: Math.max(0, Number(nextStep?.startDelayMs ?? 0) || 0)
      });
      handledNext = true;
    } else if (nextType === "time_card") {
      const goHome = !!nextStep?.goHome;
      const title = tplText(nextStep?.text || "");
      const stepStartStory = normalizeStoryPath(nextStep?.startStory || nextStep?.storyPath || nextStep?.story || "");
      const fallbackChainPath = goHome ? normalizeStoryPath(storyJson?.onCompleteStartStory || "") : "";
      const chainPath = stepStartStory || fallbackChainPath;
      const startDelayMs = Math.max(0, Number(nextStep?.startDelayMs ?? nextStep?.chainDelayMs ?? 0) || 0);
      if (goHome) {
        const checkpoint = buildChapterCheckpointFromTransition({
          currentStoryPath: storyPath,
          transitionTitle: title,
          targetStoryPath: chainPath,
          at: Date.now()
        });
        try {
          if (checkpoint) await upsertChapterCheckpoint(checkpoint);
        } catch {}
      }
      await showTimeCard(title, {
        goHome,
        startStory: chainPath,
        startDelayMs
      });
      markTimeCardDone(storyPath, storyJson?.onceKey || "", "", stepIndex + 1);
      handledNext = true;
    }

    if (!handledNext) {
      const fallbackNext = normalizeStoryPath(storyJson?.onCompleteStartStory || "");
      if (fallbackNext) {
        setPendingChainStory(fallbackNext, {
          from: storyJson?.onceKey || storyPath,
          via: "hak_watchlist_resume",
          chainSource: "hak_watchlist_resume",
          strictRequestedPath: true,
          startWhenScene: "home"
        });
        setTimeout(() => {
          try { (window.Game ||= {}).resumePendingStory?.({ source: "hak_watchlist_resume_chain", auto: true }); } catch {}
        }, 0);
      }
    }

    if (storyJson?.onceKey) {
      try { markOnce(storyJson.onceKey); } catch {}
    }
    clearRuntimeTurnForStory(storyPath, "", String(source || "hak_watchlist_resume_manual").trim() || "hak_watchlist_resume_manual");
    return true;
  }

  // Group 6 (protected-write elimination): canonical resume bookmark for a
  // contact whose story is not the currently active/leased one (SET_CONTACT_PROGRESS
  // is deliberately not lease-gated -- see its engine-side comment). Best-effort:
  // this is a plain bookmark the background walker updates on every step, not a
  // receipt anything depends on for correctness, so a dropped write (engine
  // unavailable, a concurrent revision race) is not worth surfacing to callers
  // that have never checked this function's return value.
  function setContactProgress(contactId, storyPath, index) {
    const id = resolveContactId(contactId, "");
    if (!id) return;
    // conv_story_<id> is not a protected key (unlike conv_progress_<id>) --
    // it stays a plain localStorage write, read directly by conversation.html's
    // own STORY_KEY on scene open to know which story to load for this contact.
    safeSetLS("conv_story_" + id, String(storyPath || ""));
    if (window.__QA_FIXED_STATE_NO_PRESENCE_COMMITS === true) return;
    const engine = window.GameStateEngine;
    if (!engine) return;
    const normalizedIndex = Math.max(0, Math.floor(Number(index) || 0));
    const execution = engine.getExecutionState();
    // While this contact owns the active canonical cursor, a separate
    // compatibility bookmark is redundant and creates an extra full-state
    // transaction after every interactive step (especially harmful directly
    // after quota recovery). The cursor itself is the durable authority.
    if (String(execution.activeContactId || "") === id && String(execution.activeStoryPath || "") === String(storyPath || "")) return;
    const revision = engine.getRevision();
    engine.dispatch({
      type: "SET_CONTACT_PROGRESS",
      commandId: `contact-progress:${id}:${revision}`,
      expectedRevision: revision,
      payload: { contactId: id, storyPath: String(storyPath || ""), index: normalizedIndex }
    });
  }

  const MAX_THREAD_HISTORY = 5000;

  // Group 6 (protected-write elimination): scripts/notify-adapter.js is the
  // declared single source of truth for this store (installCanonicalMessageBridge
  // above feeds it committed message events directly). Routing through its
  // exported raw primitives matches the exact pattern already proven for
  // pending_story_v1's root migration (Game.markOnce, Game.setContactProgress,
  // Game.readPendingStory, ... are all already called unconditionally
  // throughout this file with zero regressions across dozens of call sites)
  // -- every one of this file's own callers (enforceThreadHistoryForContact,
  // stampLastPersistedMessageEpisode, clearConversationEpisodeRows,
  // sanitizeConversationStoreForDisabledCharacters's caller, ...) is fixed by
  // changing this ONE definition, not each call site.
  function readConversationStore() {
    return window.Game.readConversationStore();
  }

  function writeConversationStore(store) {
    window.Game.writeConversationStoreRaw(store);
  }

  function recomputeMessagesBadgeFromConversationStore(store) {
    const src = (store && typeof store === "object") ? store : {};
    let total = 0;
    for (const id of Object.keys(src)) {
      if (shouldHideCharacterFromUI(id)) continue;
      total += Number(src[id]?.unread || 0);
    }
    const raw = safeGetLS("app_badges_v1");
    const badges = raw ? safeJsonParse(raw, {}) : {};
    badges.messages = total;
    safeSetLS("app_badges_v1", JSON.stringify(badges));
    try { window.dispatchEvent(new CustomEvent("app:badge-changed", { detail: { app: "messages", value: total } })); } catch {}
    try { window.dispatchEvent(new CustomEvent("game:badges-updated", { detail: { app: "messages", value: total } })); } catch {}
    return total;
  }

  function sanitizeConversationStoreForDisabledCharacters(storeLike = null) {
    const source = (storeLike && typeof storeLike === "object") ? storeLike : readConversationStore();
    const next = {};
    let changed = false;

    for (const key of Object.keys(source || {})) {
      const row = source[key];
      const cid = resolveContactId(key || row?.id || "", row?.name || "");
      if (!cid) { changed = true; continue; }
      next[cid] = row;
      if (cid !== key) changed = true;
    }

    return { store: next, removedIds: [], changed };
  }

  function sanitizeGuidedCuesForDisabledCharacters() {
    const cues = readGuidedCues();
    const convs = (cues.conversations && typeof cues.conversations === "object") ? cues.conversations : {};
    return Object.keys(convs).some((id) => shouldHideCharacterFromUI(id));
  }

  function sanitizePendingOutboundForDisabledCharacters() {
    const pending = readPendingOutbound();
    if (!pending || typeof pending !== "object") return false;
    const cid = resolveContactId(pending.contactId || "", pending.contactName || pending.name || "");
    return !!(cid && shouldHideCharacterFromUI(cid));
  }

  function sanitizePendingStoryForDisabledCharacters() {
    const pending = readPendingStory();
    if (!pending || typeof pending !== "object") return false;
    const cid = resolveContactId(pending.contactId || "", pending.contactName || pending.name || "");
    return !!(cid && shouldHideCharacterFromUI(cid));
  }

  function sanitizeTodoHintForDisabledCharacters() {
    const raw = safeGetLS("todo_hint_v1");
    const todo = raw ? safeJsonParse(raw, null) : null;
    const cid = resolveContactId(todo?.contactId || "", "");
    return !!(cid && shouldHideCharacterFromUI(cid));
  }

  function sanitizeConversationSelectionForDisabledCharacters() {
    let changed = false;
    const openId = canonicalId(resolveContactId(safeGetLS("openConversationId") || "", ""));
    if (openId && shouldHideCharacterFromUI(openId)) {
      safeRemLS("openConversationId");
      changed = true;
    }
    const activeId = canonicalId(resolveContactId(safeGetLS("activeConversationId") || "", ""));
    if (activeId && shouldHideCharacterFromUI(activeId)) {
      safeRemLS("activeConversationId");
      changed = true;
    }
    return changed;
  }

  function sanitizeDisabledCharacterConversationState(opts = {}) {
    const details = {
      source: String(opts?.source || "runtime_sanitize").trim() || "runtime_sanitize",
      removedIds: [],
      changed: false
    };

    const convResult = sanitizeConversationStoreForDisabledCharacters();
    if (convResult.changed) {
      writeConversationStore(convResult.store);
      details.changed = true;
    }
    details.removedIds = convResult.removedIds || [];

    if (sanitizeConversationSelectionForDisabledCharacters()) details.changed = true;
    if (sanitizeGuidedCuesForDisabledCharacters()) details.changed = true;
    if (sanitizePendingOutboundForDisabledCharacters()) details.changed = true;
    if (sanitizePendingStoryForDisabledCharacters()) details.changed = true;
    if (sanitizeTodoHintForDisabledCharacters()) details.changed = true;

    recomputeMessagesBadgeFromConversationStore(convResult.store);
    if (details.changed) {
      try { window.dispatchEvent(new Event("game:conversations-updated")); } catch {}
      try { window.dispatchEvent(new CustomEvent("conversations:changed", { detail: { source: details.source, removedIds: details.removedIds, at: Date.now() } })); } catch {}
    }
    return details;
  }

  function makeEpisodeId(onceKey) {
    const ok = canonicalId(onceKey || "");
    return ok ? ("once:" + ok) : "";
  }

  function conversationMessageKind(msg) {
    const base = String(msg?.kind || msg?.type || "").toLowerCase();
    if (base === "divider") return "divider";
    if (base === "note") return "note";
    const hasImage = String(msg?.image || msg?.src || msg?.url || msg?.photo || "").trim() !== "";
    if (base === "image" || hasImage) return "image";
    return "text";
  }

  function trimThreadMessages(items, maxItems = MAX_THREAD_HISTORY) {
    const max = Math.max(1, Number(maxItems || MAX_THREAD_HISTORY) || MAX_THREAD_HISTORY);
    const src = Array.isArray(items) ? items.filter(Boolean) : [];
    let out = src;

    if (out.length > max) out = out.slice(out.length - max);
    while (out.length && conversationMessageKind(out[0]) === "divider") out.shift();
    return out;
  }

  function enforceThreadHistoryForContact(contactId) {
    const cid = canonicalId(contactId || "");
    if (!cid) return;
    if (window.Game.canSkipConversationHistoryTrim?.(cid, MAX_THREAD_HISTORY) === true) return;

    const conv = window.Game.readConversationContact?.(cid);
    if (!conv || !Array.isArray(conv.messages)) return;

    const before = conv.messages;
    const trimmed = trimThreadMessages(before, MAX_THREAD_HISTORY);
    const changed =
      before.length !== trimmed.length ||
      before[0] !== trimmed[0] ||
      before[before.length - 1] !== trimmed[trimmed.length - 1];

    if (!changed) return;
    conv.messages = trimmed;
    window.Game.writeConversationContactRaw?.(cid, conv);
  }

  function stampLastPersistedMessageEpisode(contactId, matchRule, episodeId) {
    const cid = canonicalId(contactId || "");
    const targetEpisodeId = String(episodeId || "").trim();
    if (!cid || !targetEpisodeId) return false;

    const rule = (matchRule && typeof matchRule === "object") ? matchRule : {};
    const wantKind = String(rule.kind || "").trim().toLowerCase();
    const wantFrom = canonicalId(rule.from || "");
    const wantText = String(rule.text || "");
    const wantTextNorm = normalizeComparableText(wantText);
    const wantImage = String(rule.image || "");
    const wantAt = Number(rule.at || 0) || 0;

    const targetOnly = typeof window.Game.readConversationForEpisodeStamp === "function"
      && typeof window.Game.writeConversationContactRaw === "function";
    const store = targetOnly ? null : readConversationStore();
    const conv = targetOnly ? window.Game.readConversationForEpisodeStamp(cid)
      : (store && store[cid] ? store[cid] : null);
    if (!conv || !Array.isArray(conv.messages)) return false;

    for (let i = conv.messages.length - 1; i >= 0; i--) {
      const m = conv.messages[i];
      if (!m) continue;
      if (conversationMessageKind(m) === "divider") continue;

      if (wantKind && conversationMessageKind(m) !== wantKind) continue;
      if (wantFrom && canonicalId(m.from || m.fromId || "") !== wantFrom) continue;
      if (wantAt) {
        const rowAt = Number(m.at || m.ts || m.time || 0) || 0;
        if (rowAt !== wantAt && Math.abs(rowAt - wantAt) > 1200) continue;
      }
      if (wantKind === "image" && wantImage && String(m.image || m.src || m.url || "").trim() !== wantImage) continue;
      if (wantKind !== "image" && wantTextNorm) {
        const rowTextNorm = normalizeComparableText(m.text || "");
        if (rowTextNorm !== wantTextNorm) continue;
      }

      m.episodeId = targetEpisodeId;
      m.episode = targetEpisodeId;
      conv.messages[i] = m;
      conv.messages = trimThreadMessages(conv.messages, MAX_THREAD_HISTORY);
      if (targetOnly) window.Game.writeConversationContactRaw(cid, conv);
      else {
        store[cid] = conv;
        writeConversationStore(store);
      }
      return true;
    }

    return false;
  }

  function getStoredProgress(contactId) {
    const id = resolveContactId(contactId, "");
    if (!id) return { story: "", index: 0 };
    const story = safeGetLS("conv_story_" + id) || "";
    const engine = window.GameStateEngine;
    const entry = engine ? (engine.getContactProgress ? engine.getContactProgress(id) : engine.getGameplayState().progression.contactProgress[id]) : null;
    // The compatibility path and canonical bookmark can belong to different
    // episodes after admission. Never combine a new path with an old index.
    const index = entry && storyPathsEqual(entry.storyPath, story) ? Number(entry.index || 0) || 0 : 0;
    return { story, index: Math.max(0, index) };
  }

  function timeCardEpisodeToken(onceKey, storyPath) {
    const ok = canonicalId(onceKey || "");
    if (ok) return ok;
    const storyTok = keyToken(storyPath || "");
    if (storyTok) return "story_" + storyTok;
    return "";
  }

  function timeCardDoneKey(storyPath, onceKey, contactId, stepIndex) {
    const token = timeCardEpisodeToken(onceKey, storyPath);
    if (!token) return "";
    const cid = canonicalId(contactId || "") || "global";
    const idxRaw = Number(stepIndex);
    const idx = Number.isFinite(idxRaw) ? Math.max(0, Math.floor(idxRaw)) : 0;
    return `once_timecard_${cid}_${token}_${idx}`;
  }

  function isTimeCardDone(storyPath, onceKey, contactId, stepIndex) {
    const key = timeCardDoneKey(storyPath, onceKey, contactId, stepIndex);
    if (!key) return false;
    return safeGetLS(key) === "1";
  }

  function markTimeCardDone(storyPath, onceKey, contactId, stepIndex) {
    const key = timeCardDoneKey(storyPath, onceKey, contactId, stepIndex);
    if (!key) return;
    safeSetLS(key, "1");
  }

  function parseChapterLoadModePayload(raw) {
    const v = String(raw || "").trim();
    if (!v) return null;
    if (v === "1") return { mode: "chapter_load", at: Date.now(), enabled: true };
    const parsed = safeJsonParse(v, null);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  }

  function consumeChapterLoadBypassForStory(storyPath, onceKey, opts = {}) {
    if (opts && opts.__chapterLoadMode === true) {
      try { safeRemLS(CHAPTER_LOAD_MODE_KEY); } catch {}
      return true;
    }

    const raw = safeGetLS(CHAPTER_LOAD_MODE_KEY);
    if (!raw) return false;
    const payload = parseChapterLoadModePayload(raw);
    try { safeRemLS(CHAPTER_LOAD_MODE_KEY); } catch {}
    if (!payload) return false;

    const mode = canonicalId(payload.mode || payload.reason || payload.source || "");
    const fromChapter = payload.fromChapter === true;
    const enabled = payload.enabled === true;
    if (!(enabled || fromChapter || mode === "chapter_load")) return false;

    const payloadStory = keyToken(payload.storyPath || payload.path || payload.story || "");
    const wantedStory = keyToken(storyPath || "");
    if (payloadStory && wantedStory && payloadStory !== wantedStory) return false;

    const payloadOnce = canonicalId(payload.onceKey || "");
    const wantedOnce = canonicalId(onceKey || "");
    if (payloadOnce && wantedOnce && payloadOnce !== wantedOnce) return false;

    return true;
  }

  function showTimeCard(text, opts = {}) {
    const label = String(text || "");
    const goHome = !!opts.goHome;
    const startStory = normalizeStoryPath(opts.startStory || opts.storyPath || opts.story || "");
    const startDelayMs = Math.max(0, Number(opts.startDelayMs ?? 0) || 0);
    const merged = { ...(opts || {}), goHome, startStory, startDelayMs };

    if (typeof window.showTimeCard === "function") {
      return Promise.resolve(window.showTimeCard(label, merged));
    }

    const launchFallbackStory = () => {
      if (!startStory) return;
      const game = (window.Game ||= {});
      const queueFallback = () => {
        if (typeof game.queuePendingStoryStart !== "function") return;
        try {
          game.queuePendingStoryStart(startStory, {
            force: true,
            reason: "timecard_fallback",
            via: "time_card",
            startWhenScene: goHome ? "home" : ""
          });
          game.resumePendingStory?.({ source: "timecard_fallback" });
        } catch {}
      };
      try {
        const res = game.startStory?.(startStory, { from: "timecard_fallback", reason: "timecard_fallback" });
        Promise.resolve(res)
          .then((started) => { if (started === false) queueFallback(); })
          .catch(() => queueFallback());
      } catch {
        queueFallback();
      }
    };

    return uiAlert(label || "THE NEXT DAY", { title: "Notice" }).then(() => {
      if (goHome && typeof window.navigateToScene === "function") window.navigateToScene("home");
      if (startStory) {
        if (startDelayMs > 0) setTimeout(launchFallbackStory, startDelayMs);
        else launchFallbackStory();
      }
    });
  }

  function isStoryStartDebugMode() {
    return (
      safeGetLS("debug_conversation_flow_v1") === "1" ||
      safeGetLS("debug_story_restore_v1") === "1" ||
      window.__DEBUG_CONVERSATION_FLOW__ === true
    );
  }

  function formatErrorMessage(err) {
    if (!err) return "unknown";
    if (typeof err === "string") return err;
    if (typeof err.message === "string" && err.message.trim()) return err.message.trim();
    try { return JSON.stringify(err); } catch {}
    return String(err);
  }

  async function tryStartStory(path, source = "direct", meta = {}) {
    const requestedPath = resolveCanonicalRouteStoryPath(normalizeStoryPath(path));
    if (!requestedPath) {
      try { console.warn("[ConvoRuntime][tryStartStory] blocked: invalid story path", { path, source, meta }); } catch {}
      try { window.showToast?.("Failed to start story: invalid path"); } catch {}
      return false;
    }

    const storyPath = await resolveAccessibleStoryPath(requestedPath);
    if (!storyPath) {
      try { console.warn("[ConvoRuntime][tryStartStory] blocked: no accessible story path", { path: requestedPath, source, meta }); } catch {}
      try { window.showToast?.("Failed to start story: unavailable in this release"); } catch {}
      return false;
    }

    const lock = readPendingLock();
    const lockAgeMs = lock ? (Date.now() - Number(lock.startedAt || 0)) : 0;
    const lockActive = !!(lock && lockAgeMs < PENDING_LOCK_TTL);
    const lockPath = String(lock?.path || "").trim();

    let loaded = null;
    try {
      loaded = await loadJson(storyPath);
    } catch (err) {
      try {
        console.error("[ConvoRuntime][tryStartStory] loadJson failed", {
          storyPath,
          source,
          scene: getCurrentSceneName(),
          lockActive,
          lockPath,
          pendingResumeBusy,
          err
        });
      } catch {}
      try { window.showToast?.("Failed to start story (loadJson failed): " + storyPath); } catch {}
      return false;
    }

    const onceKey = canonicalId(loaded?.onceKey || "");
    const requireOnceKey = String(loaded?.requireOnceKey || "").trim();
    const onceAlreadyDone = !!(onceKey && onceDone(onceKey));
    const requirementsOk = requirementsMet(loaded || {});

    try {
      console.info("[ConvoRuntime][tryStartStory] preflight", {
        source,
        storyPath,
        scene: getCurrentSceneName(),
        onceKey,
        requireOnceKey,
        onceAlreadyDone,
        requirementsOk,
        lockActive,
        lockPath,
        pendingResumeBusy
      });
    } catch {}

    if (isStoryStartDebugMode()) {
      try { window.showToast?.("Starting story: " + storyPath); } catch {}
    }

    if (!requirementsOk) {
      // Compatibility repair for saves produced by the former Day 11 LOVE
      // handoff graph. That graph could finish Mason's evening and persist an
      // Evelyn-evening dispatch while the intervening Lena/Hailey/Evelyn
      // conversations had never run. Rewind only that impossible authored
      // state to the first missing natural handoff; normal saves and premium
      // requirement gates remain untouched.
      const normalizedBlockedPath = normalizeStoryPath(storyPath).toLowerCase();
      if (!meta?.authoredGapRepair &&
          normalizedBlockedPath === "story/day11/love/day11_02_evelyn_evening_love.json" &&
          onceDone("d11_05_mason_evening_love_v1") &&
          !onceDone("d11_00_lena_morning_love_v1")) {
        const repairedPath = "story/DAY11/love/DAY11_00_LENA_MORNING_LOVE.json";
        const pending = readPendingStory();
        if (pending && normalizeStoryPath(pending.path || pending.storyPath).toLowerCase() === normalizedBlockedPath) {
          writePendingStory({
            ...pending,
            path: repairedPath,
            storyPath: repairedPath,
            from: String(pending.from || loaded?.onceKey || "day11_love_authored_gap_repair"),
            reason: "day11_love_authored_gap_repair",
            lastSource: "day11_love_authored_gap_repair",
            attempts: 0,
            lastAttemptAt: Date.now()
          });
        }
        try {
          console.warn("[ConvoRuntime][tryStartStory] repaired legacy Day 11 LOVE handoff", {
            blockedStoryPath: storyPath,
            repairedStoryPath: repairedPath,
            source
          });
        } catch {}
        return tryStartStory(repairedPath, source + ":authored_gap_repair", { ...meta, authoredGapRepair: true });
      }
      try {
        console.warn("[ConvoRuntime][tryStartStory] blocked: requireOnceKey not met", {
          storyPath,
          requireOnceKey,
          source
        });
      } catch {}
      try { window.showToast?.("Failed to start story (requirements): " + storyPath); } catch {}
      return false;
    }

    if (onceAlreadyDone) {
      try {
        console.warn("[ConvoRuntime][tryStartStory] blocked: onceKey already completed", {
          storyPath,
          onceKey,
          source
        });
      } catch {}
      try { window.showToast?.("Failed to start story (already completed): " + storyPath); } catch {}
      return false;
    }

    try {
      const started = await (window.Game ||= {}).startStory?.(storyPath, {
        from: String(meta?.from || "").trim(),
        reason: String(source || "direct").trim() || "direct"
      });
      if (!started) {
        try {
          console.warn("[ConvoRuntime][tryStartStory] blocked: Game.startStory returned false", {
            source,
            storyPath
          });
        } catch {}
        try { window.showToast?.("Failed to start story: " + storyPath); } catch {}
        return false;
      }
      return true;
    } catch (err) {
      const msg = formatErrorMessage(err);
      try {
        console.error("[ConvoRuntime][tryStartStory] exception: " + msg, {
          source,
          storyPath,
          err
        });
      } catch {}
      try { window.showToast?.("Failed to start story (exception): " + msg); } catch {}
      return false;
    }
  }

  function playGlitchStep(step = {}) {
    const payload = {
      ms: Number(step.ms ?? step.duration ?? 420) || 420,
      intensity: Number(step.intensity ?? 1) || 1
    };
    const audioApi = window.Game && window.Game.audio;
    if (audioApi && typeof audioApi.enterGlitch === "function") {
      try { audioApi.enterGlitch(payload.ms, payload.intensity); } catch {}
    }
    const fn =
      (window.Game && window.Game.playGlitch) ||
      (window.Game && window.Game.fxGlitch) ||
      window.playGlitch;
    if (typeof fn === "function") {
      try { fn(payload); } catch {}
      return;
    }
    if (!audioApi || typeof audioApi.enterGlitch !== "function") {
      try { window.dispatchEvent(new CustomEvent("fx:glitch", { detail: payload })); } catch {}
    }
  }
  function normalizeRuntimeSpeaker(rawSpeaker, rawName, fallbackSpeaker = "", fallbackContactId = "") {
    const explicit = resolveContactId(rawSpeaker || "", rawName || "");
    if (explicit === "player") return "player";
    if (explicit) return explicit;

    const fallback = resolveContactId(fallbackSpeaker || "", "");
    if (fallback === "player") return "player";
    if (fallback) return fallback;

    return resolveContactId(fallbackContactId || "", "") || "";
  }

  function resolveRuntimeStepSpeaker(step, fallbackSpeaker = "", fallbackContactId = "") {
    const s = (step && typeof step === "object") ? step : {};
    const type = String(s.type || "").toLowerCase();
    if (type === "send_to_continue") return "player";

    const explicit = resolveContactId(s.fromId || s.from || "", s.fromName || s.name || "");
    if (explicit === "player") return "player";
    if (explicit) return explicit;

    if (type === "image" || type === "photo" || type === "video" || type === "media") {
      return normalizeRuntimeSpeaker("", "", fallbackSpeaker, fallbackContactId);
    }

    if (type === "message") {
      return normalizeRuntimeSpeaker("", "", fallbackContactId, fallbackContactId);
    }

    return normalizeRuntimeSpeaker("", "", fallbackSpeaker, fallbackContactId);
  }

  function resolveRuntimeStepSenderId(step, fallbackContactId = "") {
    const s = (step && typeof step === "object") ? step : {};
    return resolveContactId(s.fromId || s.from || s.contactId || fallbackContactId || "", s.fromName || s.name || "");
  }

  function inferLastRuntimeSpeakerBeforeIndex(steps, endExclusive, fallbackContactId = "") {
    const arr = Array.isArray(steps) ? steps : [];
    const limit = Math.max(0, Math.floor(Number(endExclusive || 0) || 0));
    let lastSpeaker = normalizeRuntimeSpeaker("", "", fallbackContactId, fallbackContactId);

    for (let idx = 0; idx < limit && idx < arr.length; idx++) {
      const step = arr[idx] || {};
      const type = String(step.type || "").toLowerCase();
      if (type === "notify") {
        const app = String(step.app || "messages").toLowerCase();
        if (app !== "messages") continue;
        const notifyFrom = resolveRuntimeStepSenderId(step, "");
        if (notifyFrom && notifyFrom !== "player") lastSpeaker = notifyFrom;
        continue;
      }
      if (type !== "message" && type !== "image" && type !== "photo" && type !== "video" && type !== "media" && type !== "send_to_continue") continue;
      const speaker = resolveRuntimeStepSpeaker(step, lastSpeaker, fallbackContactId);
      if (speaker) lastSpeaker = speaker;
    }

    return lastSpeaker;
  }

  function walkStorySteps(steps, visitor) {
    const arr = Array.isArray(steps) ? steps : [];
    for (const step of arr) {
      if (!step || typeof step !== "object") continue;
      visitor(step);
      const t = String(step.type || "").toLowerCase();
      if (t === "if") {
        walkStorySteps(step.then, visitor);
        walkStorySteps(step.else, visitor);
      }
    }
  }

  function inferContactIdFromStory(storyJson) {
    const top = resolveContactId(
      storyJson?.contactId || storyJson?.contact || storyJson?.conversationId || "",
      storyJson?.contactName || storyJson?.fromName || storyJson?.name || ""
    );
    if (top) return top;

    let fromMessage = "";
    let fromNotify = "";
    walkStorySteps(storyJson?.steps, (step) => {
      if (fromMessage) return;
      const t = String(step?.type || "").toLowerCase();
      if (t === "message" || t === "image" || t === "photo" || t === "video" || t === "media") {
        const from = resolveContactId(step.from || step.fromId || "", step.fromName || step.name || "");
        if (from && from !== "player") fromMessage = from;
        return;
      }
      if (!fromNotify && t === "notify") {
        const app = String(step.app || "messages").toLowerCase();
        const id = resolveRuntimeStepSenderId(step, "");
        if (app === "messages" && id) fromNotify = id;
      }
    });
    return fromMessage || fromNotify || "";
  }

  function inferStoryOwnerIdFromPath(storyPath) {
    const normalized = normalizeStoryPath(String(storyPath || "").replace(/\\/g, "/"));
    if (!normalized) return "";
    const file = normalized.split("/").pop() || "";
    if (!file) return "";
    const dayMatch = file.match(/^day\d+_\d+_([a-z0-9]+)(?:_|\.json)/i);
    if (!dayMatch) return "";
    const ownerId = canonicalId(dayMatch[1] || "");
    return PATH_INFERRED_CONTACT_OWNER_IDS.has(ownerId) ? ownerId : "";
  }

  function getStoryOwnerId(storyJson, options = {}) {
    const json = (storyJson && typeof storyJson === "object") ? storyJson : {};
    const opts = (options && typeof options === "object") ? options : {};

    const explicitContact = resolveContactId(
      json.contactId || json.contact || json.conversationId || "",
      json.contactName || json.fromName || json.name || ""
    );
    if (explicitContact && explicitContact !== "player") return explicitContact;

    const explicitCharacter = resolveContactId(
      json.characterId || json.ownerCharacterId || "",
      json.characterName || json.contactName || ""
    );
    if (explicitCharacter && explicitCharacter !== "player") return explicitCharacter;

    const optionOwner = resolveContactId(
      opts.contactId || opts.characterId || opts.id || "",
      opts.contactName || opts.characterName || opts.name || ""
    );
    if (optionOwner && optionOwner !== "player") return optionOwner;

    const inferred = inferContactIdFromStory(json);
    if (inferred && inferred !== "player") return inferred;

    const fromPath = inferStoryOwnerIdFromPath(opts.storyPath || opts.path || "");
    if (fromPath && fromPath !== "player") return fromPath;

    return "";
  }

  function isStoryOwnedByDisabledCharacter(storyJson, options = {}) {
    const ownerId = getStoryOwnerId(storyJson, options);
    if (!ownerId) return { ownerId: "", disabled: false };
    return {
      ownerId,
      disabled: shouldHideCharacterFromUI(ownerId)
    };
  }

  function normalizeDisabledSkipTrail(rawTrail) {
    const src = Array.isArray(rawTrail)
      ? rawTrail
      : (typeof rawTrail === "string" ? rawTrail.split("|") : []);
    const out = [];
    const seen = new Set();
    for (const raw of src) {
      const normalized = normalizeStoryPath(String(raw || "").replace(/\\/g, "/"));
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(normalized);
    }
    return out;
  }

  function readDisabledSkipTransitionStep(storyJson, options = {}) {
    const json = (storyJson && typeof storyJson === "object") ? storyJson : {};
    const steps = cloneStoryStepsWithMeta(Array.isArray(json.steps) ? json.steps : []);
    if (!steps.length) return null;

    const decisionCtx = {
      storyPath: normalizeStoryPath(options.storyPath || ""),
      storyJson: json,
      contactId: canonicalId(options.contactId || ""),
      projectionOnly: true
    };

    function toTransition(step, topLevelIndex = -1) {
      const s = (step && typeof step === "object") ? step : {};
      const type = canonicalId(s.type || "");
      if (type === "next_day") {
        return {
          type,
          goHome: true,
          title: tplText(s.text || "THE NEXT DAY"),
          startStory: normalizeStoryPath(s.startStory || s.storyPath || s.story || json?.onCompleteStartStory || ""),
          startDelayMs: Math.max(0, Number(s.startDelayMs ?? 0) || 0),
          stepIndex: topLevelIndex
        };
      }
      if (type === "time_card" && s.goHome === true) {
        return {
          type,
          goHome: true,
          title: tplText(s.text || ""),
          startStory: normalizeStoryPath(s.startStory || s.storyPath || s.story || json?.onCompleteStartStory || ""),
          startDelayMs: Math.max(0, Number(s.startDelayMs ?? s.chainDelayMs ?? 0) || 0),
          stepIndex: topLevelIndex
        };
      }
      if (type === "start_story") {
        return {
          type,
          goHome: !!s.goHome,
          title: "",
          startStory: normalizeStoryPath(s.startStory || s.storyPath || s.story || json?.onCompleteStartStory || ""),
          startDelayMs: Math.max(0, Number(s.startDelayMs ?? s.chainDelayMs ?? 0) || 0),
          stepIndex: topLevelIndex
        };
      }
      return null;
    }

    function findTransitionInBranch(branchSteps, isTopLevel = false) {
      const arr = Array.isArray(branchSteps) ? branchSteps : [];
      for (let idx = 0; idx < arr.length; idx++) {
        const step = arr[idx] || {};
        const type = canonicalId(step.type || "");
        if (type === "if") {
          const branch = resolveIfStepDecision(step, decisionCtx) ? step.then : step.else;
          const nested = findTransitionInBranch(branch, false);
          if (nested) return nested;
          continue;
        }
        const topLevelIndex = isTopLevel ? idx : -1;
        const transition = toTransition(step, topLevelIndex);
        if (transition) return transition;
      }
      return null;
    }

    return findTransitionInBranch(steps, true);
  }

  async function resolveFirstEnabledStoryPath(path, skipTrail = []) {
    let normalized = normalizeStoryPath(path || "");
    if (!normalized) return "";

    const visited = new Set(normalizeDisabledSkipTrail(skipTrail));
    while (normalized) {
      if (visited.has(normalized) || visited.size >= MAX_DISABLED_SKIP_CHAIN_HOPS) return "";
      visited.add(normalized);

      let nextJson = null;
      try {
        nextJson = await loadJson(normalized);
      } catch {
        return normalized;
      }
      if (!nextJson || typeof nextJson !== "object") return normalized;

      const ownerState = isStoryOwnedByDisabledCharacter(nextJson, { storyPath: normalized });
      if (!ownerState.disabled) return normalized;
      normalized = normalizeStoryPath(nextJson.onCompleteStartStory || "");
    }

    return "";
  }

  async function skipStoryForDisabledCharacter(storyJson, options = {}) {
    const json = (storyJson && typeof storyJson === "object") ? storyJson : {};
    const storyPath = normalizeStoryPath(options.storyPath || options.path || "");
    const ownerId = canonicalId(options.ownerId || getStoryOwnerId(json, { storyPath }));
    const trail = normalizeDisabledSkipTrail(options.skipTrail);

    const normalizedCurrentPath = storyPath || "";
    const nextTrail = trail.slice();
    if (normalizedCurrentPath && !nextTrail.includes(normalizedCurrentPath)) {
      nextTrail.push(normalizedCurrentPath);
    }

    // This function's entire job is "this story will never actually run" --
    // if a canonical lease is currently held FOR THIS EXACT STORY (e.g. one
    // INITIALIZE_START_FROM/INITIALIZE_CHECKPOINT just established for a
    // checkpoint's entry story, ahead of discovering its owning character is
    // disabled), that lease must be relinquished here. Nothing else ever
    // will: the story holding it is deliberately never interpreted, so
    // completeCanonicalStory's normal release-on-completion path can't run
    // for it either. Leaving the lease dangling makes
    // canonicalActiveOwnerConflict see a permanent, unrelated "owner" for
    // every contact but this one -- silently pausing the very story this
    // skip is about to chain to, with nothing left to ever resume it.
    try {
      const engine = window.GameStateEngine;
      const state = engine && engine.getGameplayState();
      const exec = state && state.execution;
      if (exec && exec.lease && normalizedCurrentPath && exec.activeStoryPath === normalizedCurrentPath) {
        engine.dispatch({
          type: "RELEASE_LEASE",
          commandId: `disabled-skip-release:${exec.lease.id}:${normalizedCurrentPath}`,
          expectedRevision: state.revision,
          payload: {}
        });
      }
    } catch {}

    const onceKey = canonicalId(json.onceKey || "");
    if (onceKey && !onceDone(onceKey)) {
      markOnce(onceKey);
    }

    const nextPath = normalizeStoryPath(json.onCompleteStartStory || "");
    const transition = readDisabledSkipTransitionStep(json, { storyPath, contactId: ownerId });
    if (transition) {
      const rawStartStory = normalizeStoryPath(transition.startStory || nextPath || "");
      const resolvedStartStory = rawStartStory
        ? (await resolveFirstEnabledStoryPath(rawStartStory, nextTrail))
        : "";
      const chainedStartStory = resolvedStartStory || rawStartStory || "";

      if (transition.type === "start_story") {
        clearRuntimeTurnForStory(storyPath, ownerId, "disabled_character_skip_start_story");
        if (chainedStartStory) {
          setPendingChainStory(chainedStartStory, {
            from: String(json.onceKey || "").trim() || storyPath,
            via: "disabled_character_skip_start_story",
            chainSource: "disabled_character_skip_start_story",
            strictRequestedPath: true,
            sourceContactId: ownerId || "",
            startWhenScene: transition.goHome ? "home" : "",
            startDelayMs: transition.startDelayMs,
            opts: {
              ...(options.allowInConversation === true ? { allowInConversation: true } : {}),
              ...(options.allowPlayerTurns === true ? { allowPlayerTurns: true } : {})
            }
          });
          if (transition.goHome && typeof window.navigateToScene === "function") {
            try { window.navigateToScene("home"); } catch {}
          }
          const resumeDelayMs = Math.max(0, Number(transition.startDelayMs || 0) || 0);
          setTimeout(() => {
            try { (window.Game ||= {}).resumePendingStory?.({ source: "disabled_character_skip_start_story", auto: true }); } catch {}
          }, resumeDelayMs);
        }
        return {
          skipped: true,
          queued: !!chainedStartStory,
          blockedByLoopGuard: false,
          ownerId,
          nextPath: chainedStartStory
        };
      }

      const checkpointPath = resolvedStartStory || rawStartStory || nextPath || storyPath;

      if (storyPath && transition.type === "time_card" && Number.isFinite(transition.stepIndex) && transition.stepIndex >= 0) {
        try {
          markTimeCardDone(storyPath, json.onceKey || "", ownerId || "", transition.stepIndex);
        } catch {}
      }

      const checkpoint = buildChapterCheckpointFromTransition({
        currentStoryPath: storyPath,
        transitionTitle: transition.title,
        targetStoryPath: checkpointPath,
        allowSameDayExplicitDay: true,
        at: Date.now()
      });
      if (checkpoint) {
        try {
          await upsertChapterCheckpoint(checkpoint);
        } catch {}
      }

      clearRuntimeTurnForStory(storyPath, ownerId, "disabled_character_skip_transition");
      try {
        await showTimeCard(transition.title || "THE NEXT DAY", {
          goHome: true,
          startStory: resolvedStartStory || rawStartStory,
          startDelayMs: transition.startDelayMs
        });
      } catch {}

      return {
        skipped: true,
        queued: !!(resolvedStartStory || rawStartStory),
        blockedByLoopGuard: false,
        ownerId,
        nextPath: resolvedStartStory || rawStartStory || ""
      };
    }

    if (!nextPath) {
      clearRuntimeTurnForStory(storyPath, ownerId, "disabled_character_skip_end");
      return {
        skipped: true,
        queued: false,
        blockedByLoopGuard: false,
        ownerId,
        nextPath: ""
      };
    }

    if (
      nextTrail.includes(nextPath) ||
      nextTrail.length >= MAX_DISABLED_SKIP_CHAIN_HOPS
    ) {
      try {
        console.warn("[ConvoRuntime][disabled_skip] chain loop guard triggered", {
          ownerId,
          storyPath,
          nextPath,
          hops: nextTrail.length
        });
      } catch {}
      clearRuntimeTurnForStory(storyPath, ownerId, "disabled_character_skip_loop_guard");
      return {
        skipped: true,
        queued: false,
        blockedByLoopGuard: true,
        ownerId,
        nextPath
      };
    }

    clearRuntimeTurnForStory(storyPath, ownerId, "disabled_character_skip_chain");
    setPendingChainStory(nextPath, {
      from: String(json.onceKey || "").trim() || storyPath,
      via: "disabled_character_skip",
      chainSource: "disabled_character_skip",
      strictRequestedPath: true,
      sourceContactId: ownerId || "",
      opts: {
        __disabledSkipTrail: nextTrail,
        ...(options.allowInConversation === true ? { allowInConversation: true } : {}),
        ...(options.allowPlayerTurns === true ? { allowPlayerTurns: true } : {})
      }
    });
    try { (window.Game ||= {}).resumePendingStory?.({ source: "disabled_character_skip", auto: true }); } catch {}
    return {
      skipped: true,
      queued: true,
      blockedByLoopGuard: false,
      ownerId,
      nextPath
    };
  }

  function inferContactIdFromRemainingSteps(steps, startIndex = 0) {
    const begin = Math.max(0, Number(startIndex || 0) || 0);
    let fromMessage = "";
    let fromNotify = "";
    for (let idx = begin; idx < steps.length; idx++) {
      const s = steps[idx] || {};
      const t = String(s.type || "").toLowerCase();
      if (!fromMessage && (t === "message" || t === "image" || t === "photo" || t === "video" || t === "media")) {
        const from = resolveContactId(s.from || s.fromId || "", s.fromName || s.name || "");
        if (from && from !== "player") fromMessage = from;
      }
      if (!fromNotify && t === "notify") {
        const app = String(s.app || "messages").toLowerCase();
        const id = resolveContactId(s.fromId || s.contactId || "", s.fromName || s.name || "");
        if (app === "messages" && id) fromNotify = id;
      }
      if (fromMessage) break;
    }
    return fromMessage || fromNotify || "";
  }

  function isPlayerTurnStep(step, lastSpeaker = "", fallbackContactId = "") {
    const s = (step && typeof step === "object") ? step : {};
    const t = String(s.type || "").toLowerCase();
    if (t === "send_to_continue") return true;
    if (t === "message" || t === "image" || t === "photo" || t === "video" || t === "media") {
      return resolveRuntimeStepSpeaker(s, lastSpeaker, fallbackContactId) === "player";
    }
    return false;
  }

  function resolveContactIdForPlayerTurn(storyJson, steps, startIndex, currentContactId = "", step = null) {
    const fromStep = resolveContactId(
      step?.contactId || step?.to || step?.threadId || "",
      step?.contactName || step?.toName || step?.fromName || step?.name || ""
    );
    if (fromStep && fromStep !== "player") return fromStep;
    const fromRemaining = inferContactIdFromRemainingSteps(steps, startIndex);
    if (fromRemaining) return fromRemaining;
    const fromStory = inferContactIdFromStory(storyJson);
    if (fromStory) return fromStory;
    const current = resolveContactId(currentContactId || "", storyJson?.contactName || "");
    if (current && current !== "player") return current;
    return "";
  }

  function resolveFirstManualPlayerTurn(storyPath, storyJson, opts = {}) {
    const steps = cloneStoryStepsWithMeta(Array.isArray(storyJson?.steps) ? storyJson.steps : []);
    const ctx = {
      storyPath,
      storyJson,
      projectionOnly: true,
      contactId: resolveContactId(
        opts.contactId || storyJson?.contactId || storyJson?.contact || "",
        opts.contactName || storyJson?.contactName || storyJson?.fromName || ""
      )
    };

    let i = Math.max(0, Number(opts.startIndex || 0) || 0);
    let guard = 0;

    if (i > 0) materializeIfStepsUpToIndex(steps, i, ctx);
    const fallbackContactId = ctx.contactId || inferContactIdFromStory(storyJson);
    let lastSpeaker = inferLastRuntimeSpeakerBeforeIndex(steps, i, fallbackContactId);

    while (i < steps.length) {
      if (guard++ > 50000) {
        try { console.warn("[ConvoRuntime][outbound] resolution guard tripped", { storyPath, startIndex: i }); } catch {}
        break;
      }

      const step = steps[i] || {};
      if (!requirementsMet(step)) {
        i++;
        continue;
      }

      const type = String(step.type || "").toLowerCase();
      if (type === "if") {
        const expanded = expandIfStepAt(steps, i, ctx);
        if (!expanded) i++;
        continue;
      }
      if (type === "label") {
        i++;
        continue;
      }
      if (type === "goto") {
        const label = String(step.label || step.name || step.to || "").trim();
        const jumpIndex = jumpToLabelIndex(steps, label);
        if (jumpIndex >= 0) {
          i = jumpIndex + 1;
          continue;
        }
        i++;
        continue;
      }

      if (type === "notify") {
        const app = String(step.app || "messages").toLowerCase();
        const fromId = resolveRuntimeStepSenderId(step, "");
        if (app === "messages" && fromId && fromId !== "player") {
          lastSpeaker = fromId;
          if (!ctx.contactId) ctx.contactId = fromId;
          return null;
        }
        i++;
        continue;
      }

      if (type === "message" || type === "send_to_continue" || type === "image" || type === "photo" || type === "video" || type === "media") {
        const fromId = resolveRuntimeStepSpeaker(step, lastSpeaker, fallbackContactId);
        if (fromId !== "player" && type !== "send_to_continue") return null;

        const contactId = resolveContactIdForPlayerTurn(
          storyJson,
          steps,
          i,
          ctx.contactId || "",
          step
        ) || ctx.contactId || "";
        const draftText = tplText(step.text || step.promptText || step.prompt || "").trim();
        return {
          contactId,
          stepIndex: i,
          resumeIndex: Math.max(0, i + 1),
          stepType: type,
          draftText
        };
      }

      if (type === "choice" || type === "choices" || type === "player_choice") return null;

      i++;
    }

    return null;
  }

  async function preparePendingOutboundPayload(meta = {}) {
    const storyPath = normalizeStoryPath(meta.storyPath || meta.story || meta.path || "");
    if (!storyPath) return null;

    let storyJson = meta.storyJson;
    if (!storyJson || typeof storyJson !== "object") {
      try {
        storyJson = await loadJson(storyPath);
      } catch {
        storyJson = null;
      }
    }

    const resolved = storyJson
      ? resolveFirstManualPlayerTurn(storyPath, storyJson, {
          contactId: meta.contactId || meta.id || "",
          contactName: meta.contactName || meta.name || "",
          startIndex: meta.startIndex || 0
        })
      : null;

    const fallbackContactId =
      resolveContactId(meta.contactId || meta.id || "", meta.contactName || meta.name || "") ||
      (storyJson ? inferContactIdFromStory(storyJson) : "");
    const draftText = String(
      resolved?.draftText ||
      meta.draftText ||
      meta.playerDraft ||
      meta.promptText ||
      meta.prompt ||
      meta.text ||
      ""
    ).trim();
    const stepIndex = Number.isFinite(Number(resolved?.stepIndex))
      ? Math.max(0, Math.floor(Number(resolved.stepIndex)))
      : Math.max(0, Number(meta.stepIndex ?? meta.index ?? 0) || 0);
    const resumeIndex = Number.isFinite(Number(resolved?.resumeIndex))
      ? Math.max(0, Math.floor(Number(resolved.resumeIndex)))
      : Math.max(0, Number(meta.resumeIndex ?? (stepIndex + 1)) || (stepIndex + 1));
    const onceId =
      String(meta.onceId || "").trim() ||
      ((canonicalId(meta.kind || "") === "player_first")
        ? makePendingPlayerFirstOnceId(storyPath, stepIndex)
        : "");

    return normalizePendingOutboundPayload({
      kind: meta.kind || "outbound",
      contactId: resolved?.contactId || fallbackContactId,
      contactName: meta.contactName || meta.name || storyJson?.contactName || "",
      storyPath,
      messageText: draftText,
      draftText,
      promptText: meta.promptText || meta.prompt || meta.text || "",
      stepIndex,
      resumeIndex,
      onceId,
      episodeOnceKey: meta.episodeOnceKey || meta.onceKey || storyJson?.onceKey || "",
      cueKind: meta.cueKind || "rainbow",
      at: meta.at || Date.now()
    });
  }

  function syncPendingOutboundCue(payload) {
    const normalized = normalizePendingOutboundPayload(payload);
    if (!normalized) return null;
    writePendingOutbound(normalized);
    setGuidedCue(normalized.contactId, {
      kind: normalized.cueKind,
      reason: "send_first_message",
      story: normalized.storyPath,
      label: normalized.draftText
    });
    setConversationNeedsPlayer(normalized.contactId, true, {
      contactName: normalized.contactName,
      draftText: normalized.draftText
    });
    try {
      console.info("[ConvoRuntime][outbound] queued", {
        kind: String(normalized.kind || ""),
        contactId: String(normalized.contactId || ""),
        storyPath: String(normalized.storyPath || ""),
        stepIndex: Number(normalized.stepIndex ?? normalized.index ?? -1),
        resumeIndex: Number(normalized.resumeIndex ?? -1)
      });
    } catch {}
    return normalized;
  }

  function clearPendingOutboundCue(contactId = "") {
    const current = readPendingOutbound();
    const targetId = resolveContactId(contactId || current?.contactId || "", "");
    if (targetId) {
      try { clearGuidedCue(targetId); } catch {}
      try { setConversationNeedsPlayer(targetId, false, { draftText: "" }); } catch {}
    }
    clearPendingOutbound(targetId || "");
  }

  function setConversationNeedsPlayer(contactId, needs, context = {}) {
    const cid = resolveContactId(contactId || "", context.contactName || "");
    if (!cid) return;
    if (shouldHideCharacterFromUI(cid)) {
      clearPendingOutbound(cid);
      try { clearGuidedCue(cid); } catch {}
      return;
    }
    const Game = (window.Game ||= {});
    const desired = !!needs;
    const draftText = desired
      ? String(context.draftText || context.playerDraft || "").trim()
      : "";

    try {
      Game.ensureConversation?.(cid, {
        id: cid,
        contactId: cid,
        name: String(context.contactName || "").trim(),
        avatar: String(context.avatar || "").trim() || `assets/avatars/${cid}.jpg`
      });
      Game.setConversationNeedsPlayer?.(cid, desired, draftText);
      if (typeof Game.setConversationNeedsPlayer === "function") return;
    } catch {}

    const store = readConversationStore();
    const prev = (store[cid] && typeof store[cid] === "object") ? store[cid] : {};
    const conv = {
      id: cid,
      name: prev.name || resolveStepDisplayName(cid, context.contactName || "") || cid,
      avatar: prev.avatar || String(context.avatar || "").trim() || `assets/avatars/${cid}.jpg`,
      last: (prev.last && typeof prev.last === "object") ? prev.last : { text: "", at: Date.now() },
      unread: Number(prev.unread || 0),
      messages: Array.isArray(prev.messages) ? prev.messages : [],
      ...prev,
      needsPlayer: desired ? 1 : 0,
      playerDraft: draftText
    };
    store[cid] = conv;
    writeConversationStore(store);
    try {
      window.dispatchEvent(new CustomEvent("conversations:changed", {
        detail: { id: cid, contactId: cid, needsPlayer: desired ? 1 : 0, playerDraft: draftText, at: Date.now() }
      }));
    } catch {}
    try { window.dispatchEvent(new Event("game:conversations-updated")); } catch {}
  }

  function pause(Game, storyPath, contactId, i, opts, reason, meta = {}) {
    const cid = resolveContactId(contactId, opts?.contactName || "");
    const mode = String(opts?.mode || "conversation").trim() || "conversation";
    const runId = Math.max(0, Number(meta?.runId || opts?.__runId || Game?._storyRunId || 0) || 0);
    const draftText = String(meta?.draftText || meta?.playerDraft || "").trim();
    const normalizedReason = canonicalId(reason);
    const isPlayerFirst = normalizedReason === "player_first";
    const onceId = isPlayerFirst
      ? String(meta?.onceId || makePendingPlayerFirstOnceId(storyPath, i)).trim()
      : "";
    if (isPlayerFirst) {
      clearPendingStory();
      safeRemLS(PENDING_LOCK_KEY);
      Game._pendingStory = null;
    } else {
      setPendingStory({
        kind: "resume",
        path: storyPath,
        storyPath,
        index: i,
        contactId: cid,
        runId,
        playerDraft: draftText,
        draftText,
        onceId,
        mode,
        opts: { ...opts, contactId: cid },
        reason,
        ts: Date.now()
      });
      Game._pendingStory = {
        kind: "resume",
        path: storyPath,
        index: i,
        runId,
        playerDraft: draftText,
        draftText,
        onceId,
        opts: { ...opts, contactId: cid }
      };
    }
    if (cid) setContactProgress(cid, storyPath, i);
    if (cid && isPlayerFirst) {
      syncPendingOutboundCue({
        kind: "player_first",
        contactId: cid,
        contactName: String(opts?.contactName || "").trim(),
        storyPath,
        messageText: draftText,
        draftText,
        stepIndex: i,
        resumeIndex: i + 1,
        onceId,
        episodeOnceKey: opts?.__storyOnceKey || opts?.onceKey || "",
        cueKind: "rainbow"
      });
    }
    if (cid) {
      rememberRuntimeTurnOwner(storyPath, cid, {
        activeRunner: "background",
        activeStoryPath: normalizeStoryPath(String(storyPath || "").trim()),
        expectedNextStory: normalizeStoryPath(String(storyPath || "").trim())
      }, `pause_${normalizedReason || "resume"}`);
    }
  }

  function makeLocalDedupKey(contactId, kind, text, src) {
    return `${canonicalId(contactId)}|${kind}|${String(text || "")}|${String(src || "")}`;
  }

  function isCinematicLocked() {
    if (window.PlayerIdentity?.isPending?.()) return true;
    if ((window.Game || {})._cinematicLock === true) return true;
    return safeGetLS(CINEMATIC_LOCK_KEY) === "1";
  }

  function setGlobalCinematicLock(locked, source = "convo_runtime") {
    const on = !!locked;
    const Game = (window.Game ||= {});
    try {
      if (typeof Game.setCinematicLock === "function") {
        Game.setCinematicLock(on, { source, at: Date.now() });
        return on;
      }
    } catch {}

    Game._cinematicLock = on;
    if (on) safeSetLS(CINEMATIC_LOCK_KEY, "1");
    else safeRemLS(CINEMATIC_LOCK_KEY);
    try {
      window.dispatchEvent(new CustomEvent("cinematic:lock-changed", {
        detail: { locked: on, source, at: Date.now() }
      }));
    } catch {}
    return on;
  }

  function makeRuntimeEventId(storyPath, episodeId, stepIndex, type, contactId, text, src) {
    const path = normalizeStoryPath(String(storyPath || "").trim());
    const ep = canonicalId(episodeId || "");
    const idx = Math.max(0, Number(stepIndex || 0) || 0);
    const t = canonicalId(type || "");
    const cid = canonicalId(contactId || "");
    const msg = normalizeComparableText(text || "").slice(0, 180);
    const img = String(src || "").trim().slice(-180);
    return `${path}|${ep}|${idx}|${t}|${cid}|${msg}|${img}`;
  }

  const REVEAL_PREFIX = "contact_avatar_unlocked_";
  function isAvatarUnlocked(contactId) {
    const id = canonicalId(contactId);
    if (!id) return false;
    // notify-adapter.js's Game.isAvatarUnlocked is the authority (it also
    // derives/backfills this flag for saves and Start From/New Update
    // checkpoints that never ran the live contact:reveal trigger below) --
    // fall back to the bare flag only if that module somehow isn't loaded.
    try {
      if (typeof window.Game?.isAvatarUnlocked === "function") return window.Game.isAvatarUnlocked(id) === true;
    } catch {}
    return safeGetLS(REVEAL_PREFIX + id) === "1";
  }

  // -------------------------
  // Canonical message-commit bridge (Feature 4, step type 1: incoming text message)
  //
  // runSteps requests a lease + commit from GameStateEngine instead of writing the
  // legacy conversation store directly. The engine is the single authority for
  // whether/when a message event exists (dedup, revision, contact ownership). The
  // *rendering/legacy-store* side effect is a reaction to that committed event,
  // handled by the subscriber below, which reuses Game.Inbox.pushMessage exactly
  // as before -- no reimplementation of its avatar/dedup/cinematic-queue logic.
  // -------------------------
  // Global stories (isGlobalStepType steps like set_flag, notify, instagram_post,
  // ...) have no contactId at all, but every canonical progression command
  // still requires an active lease (see needsLease in game-state-engine.js) --
  // the lease models "an active story execution is driving this," not "a
  // conversation thread owns this." A stable sentinel lets global stories
  // participate in the exact same lease-acquire/reclaim contract as
  // contact-scoped ones instead of being permanently unable to acquire one.
  const GLOBAL_STORY_LEASE_CONTACT_ID = "__global_story__";

  function ensureCanonicalStoryLease(storyPath, rawContactId, allowReclaim = false) {
    const engine = window.GameStateEngine;
    if (!engine) return null;
    const contactId = rawContactId || GLOBAL_STORY_LEASE_CONTACT_ID;
    const normalizedPath = normalizeStoryPath(storyPath) || String(storyPath || "").trim();
    let state = engine.getExecutionSnapshot();
    let exec = state.execution;
    // Older central continuations recorded a null contact for catalogued
    // global stories. Preserve their exact lease/cursor while resuming that
    // global operation; a missing owner on a contact story is not equivalent.
    const legacyGlobalOwner = exec.activeContactId == null && contactId === GLOBAL_STORY_LEASE_CONTACT_ID &&
      window.StoryAdmissionCatalog?.some(row => row.ownerScope === "global" && storyPathsEqual(row.path, normalizedPath));
    // exec.activeContactId legitimately reads "player" (the
    // NON_CONTACT_ACTOR_IDS sentinel) while the SAME story is paused on a
    // choice/player-turn -- it names who must act next, not a different
    // party contending for the lease. Requiring an exact contactId match
    // here rejected every caller asking about the very story already
    // holding this lease (e.g. conversation.html re-rendering its own
    // already-committed messages) with LEASE_UNAVAILABLE whenever that
    // caller's contactId was the real NPC thread owner (e.g. "evelyn")
    // instead of the pending actor sentinel -- confirmed live on
    // DAY15_02_EVELYN_EVENING_LOVE.json (see feature4-day15-love-evelyn-
    // lease-unavailable-stall memory). Safe to widen: storyPathsEqual
    // already pins this to the SAME story instance, and the sentinel can
    // only appear here because THIS story (not an unrelated one) is
    // currently paused on a player-turn.
    if (
      exec.lease &&
      storyPathsEqual(exec.activeStoryPath, normalizedPath) &&
      (exec.activeContactId === contactId || legacyGlobalOwner || NON_CONTACT_ACTOR_IDS.has(String(exec.activeContactId || "").toLowerCase()))
    ) {
      const actorSentinel = NON_CONTACT_ACTOR_IDS.has(String(exec.activeContactId || "").toLowerCase());
      const realOwner = String(contactId || "").trim().toLowerCase();
      if (actorSentinel && realOwner && !NON_CONTACT_ACTOR_IDS.has(realOwner)) {
        const reassigned = engine.dispatch({
          type: "REASSIGN_ACTIVE_CONTACT",
          commandId: `reassign-active-contact:${exec.lease.id}:${realOwner}`,
          expectedRevision: state.revision,
          leaseId: exec.lease.id,
          payload: { contactId: realOwner, leaseId: exec.lease.id }
        });
        if (!reassigned?.ok) return null;
        state = engine.getExecutionSnapshot();
        exec = state.execution;
      }
      const storyDay = Number(String(normalizedPath || "").match(/(?:^|\/)DAY(\d{1,2})(?:\/|_)/i)?.[1]) || 0;
      if (storyDay >= 1 && storyDay <= 20 && Number(state.world?.day) !== storyDay) {
        const reconciled = engine.dispatch({
          type: "CHANGE_DAY",
          commandId: `reconcile-world-day:${exec.lease.id}:${storyDay}`,
          expectedRevision: state.revision,
          leaseId: exec.lease.id,
          payload: {
            day: storyDay,
            stepIndex: exec.activeStepIndex,
            nextStepIndex: exec.activeStepIndex,
            cursor: exec.cursor || undefined
          }
        });
        if (!reconciled?.ok && reconciled?.status !== "DUPLICATE_COMMAND") return null;
        state = engine.getExecutionSnapshot();
        exec = state.execution;
      }
      return exec.lease.id;
    }
    if (exec.lease) {
      // A different story/contact holds the canonical lease. Every real
      // completion path now goes through completeCanonicalStory, which
      // atomically releases or transfers the lease in the same dispatch as
      // completion (Group 3), and Game.startStory's canonical admission
      // contract (requestStartAdmission) already refuses to let a SECOND
      // conflicting story begin while this one holds the lease -- so an
      // unrelated story's own step commits reaching here with allowReclaim
      // false is a genuine, still-active conflict; refuse and let the
      // caller's existing blocked_retryable/pause handling wait it out.
      //
      // But a lease is not only held while a story is *executing* -- it
      // stays held through every ordinary pause (player-turn boundary,
      // conversation-scene gating, cinematic lock) too, since pausing is
      // not completion. allowReclaim is how a caller that explicitly opted
      // into interrupting whatever else is going on (Game.startStory's own
      // allowConversationInterrupt callers -- dev "start from", background
      // chain replacement, the same signal already used to skip the start-
      // admission check itself) tells this function the paused-vs-active
      // distinction has already been judged safe at the call site. No
      // renderer variable (Game._activeRunner et al) is read to make that
      // judgment here; it is the caller's own explicit, stated intent.
      if (!allowReclaim) return null;
      const catalog = window.StoryAdmissionCatalog;
      if (Array.isArray(catalog) && catalog.some(row => storyPathsEqual(row.path, exec.activeStoryPath)) && exec.cursor?.completion !== "completed") return null;
      const release = engine.dispatch({
        type: "RELEASE_LEASE",
        commandId: `canonical-lease-reclaim:${exec.lease.id}:${normalizedPath}:${contactId}`,
        expectedRevision: state.revision,
        payload: {}
      });
      if (!release.ok) return null;
      state = engine.getExecutionSnapshot();
      exec = state.execution;
    }
    const result = engine.dispatch({
      type: "START_STORY",
      commandId: `canonical-lease:${normalizedPath}:${contactId}:${state.revision}`,
      expectedRevision: state.revision,
      payload: {
        storyId: stableStoryIdForPath(normalizedPath),
        storyPath: normalizedPath,
        contactId,
        stepIndex: 0,
        consumePendingStoryId: (() => {
          const pending = state.progression?.pendingStory;
          if (!isPendingDispatch(pending)) return null;
          const pendingPath = normalizeStoryPath(String(pending.path || pending.storyPath || "").trim());
          return pendingPath === normalizedPath ? String(pending.id || "") || null : null;
        })()
      }
    });
    if (!result.ok) return null;
    return engine.getExecutionSnapshot().execution.lease?.id || null;
  }

  function repairPersistedPseudoContactEvents() {
    const engine = window.GameStateEngine;
    if (!engine?.dispatch) return false;
    const state = engine.getGameplayState();
    const conversations = state.conversations?.eventsByContact || {};
    if (!Array.isArray(conversations.player) && !Array.isArray(conversations[GLOBAL_STORY_LEASE_CONTACT_ID])) return true;
    const result = engine.dispatch({
      type: "REPAIR_PSEUDO_CONTACT_EVENTS",
      commandId: `repair-pseudo-contact-events:${state.sessionId}`,
      expectedRevision: state.revision,
      payload: {}
    });
    return result?.ok === true;
  }

  function repairIdleDay9LoveContinuationGap() {
    const engine = window.GameStateEngine;
    if (!engine?.getGameplayState) return false;
    if (engine.getExecutionState?.().lease) return false;
    const state = engine.getStoryContinuationState ? engine.getStoryContinuationState() : engine.getGameplayState();
    const existingPending = state.progression?.pendingStory;
    if (!state.execution?.lease && existingPending?.reason === "day9_love_authored_gap_repair") {
      writePendingStory({ ...existingPending, startWhenScene: "", navigationPolicy: "auto_open" });
      setTimeout(() => {
        try { (window.Game ||= {}).resumePendingStory?.({ source: "day9_love_authored_gap_repair_resume", auto: true }); } catch {}
      }, 0);
      return true;
    }
    if (state.execution?.lease || existingPending) return false;
    const completed = new Set((state.progression?.onceKeys || []).map((key) => canonicalId(key)));
    if (!completed.has("d9_02_evelyn_evening_love_v1") || completed.has("d9_06_mason_afternoon_love_v1")) return false;
    const route = canonicalId(state.world?.routeLocks?.mason || state.world?.routes?.mason || "love");
    if (route && route !== "love") return false;
    const repairedPath = "story/DAY9/love/DAY9_05_MASON_AFTERNOON_LOVE.json";
    setPendingChainStory(repairedPath, {
      from: "d9_02_evelyn_evening_love_v1",
      via: "day9_love_authored_gap_repair",
      chainSource: "day9_love_authored_gap_repair",
      strictRequestedPath: true
    });
    setTimeout(() => {
      try { (window.Game ||= {}).resumePendingStory?.({ source: "day9_love_authored_gap_repair", auto: true }); } catch {}
    }, 0);
    return true;
  }

  // The shared admission scan has already chosen the missing prerequisite.
  // Older day-specific fallbacks must let that target run; replacing it with
  // its dependent episode creates a pending loop with no story ever admitted.
  function isRequiredStoryRecoveryPending(pending) {
    return !!pending && (pending.reason === "required_day_slot_recovery" || pending.reason === "required_logical_slot_recovery");
  }

  function repairPendingDay10LoveEvelynGap() {
    const engine = window.GameStateEngine;
    if (!engine?.getGameplayState) return false;
    const state = engine.getGameplayState();
    if (state.execution?.lease) return false;
    const pending = state.progression?.pendingStory;
    if (isRequiredStoryRecoveryPending(pending)) return false;
    const pendingPath = normalizeStoryPath(pending?.path || pending?.storyPath || "").toLowerCase();
    const completed = new Set((state.progression?.onceKeys || []).map((key) => canonicalId(key)));
    const active = new Set((state.world?.activeCharacters || []).map((id) => canonicalId(id)));
    const evelynRoute = canonicalId(state.world?.variables?.route_evelyn_locked_v1 || state.world?.routeLocks?.evelyn || state.world?.routes?.evelyn || "love");
    if (!pending || !pendingPath.startsWith("story/day11/") || !active.has("evelyn") ||
        evelynRoute !== "love" ||
        !completed.has("d10_02_hailey_evening_love_v1") || completed.has("d10_02_evelyn_evening_love_v1")) return false;
    let repairedPath = "story/DAY10/love/DAY10_00_EVELYN_MORNING_LOVE.json";
    if (completed.has("d10_00_evelyn_morning_love_v1")) repairedPath = "story/DAY10/love/DAY10_01_EVELYN_AFTERNOON_LOVE.json";
    if (completed.has("d10_01_evelyn_afternoon_love_v1")) repairedPath = "story/DAY10/love/DAY10_02_EVELYN_EVENING_LOVE.json";
    writePendingStory({
      ...pending,
      path: repairedPath,
      storyPath: repairedPath,
      contactId: "evelyn",
      from: "d10_02_hailey_evening_love_v1",
      reason: "day10_love_evelyn_gap_repair",
      via: "day10_love_evelyn_gap_repair",
      startWhenScene: "",
      attempts: 0,
      updatedAt: Date.now()
    });
    setTimeout(() => {
      try { (window.Game ||= {}).resumePendingStory?.({ source: "day10_love_evelyn_gap_repair", auto: true }); } catch {}
    }, 0);
    return true;
  }

  function repairIdleDay11LoveContinuationGap() {
    const engine = window.GameStateEngine;
    if (!engine?.getGameplayState) return false;
    if (engine.getExecutionState?.().lease) return false;
    const state = engine.getStoryContinuationState ? engine.getStoryContinuationState() : engine.getGameplayState();
    if (state.execution?.lease || state.progression?.pendingStory) return false;
    const completed = new Set((state.progression?.onceKeys || []).map((key) => canonicalId(key)));
    if (!completed.has("d10_02_evelyn_evening_love_v1") || completed.has("d11_02_lena_night_love_v1")) return false;
    const active = new Set((state.world?.activeCharacters || []).map((id) => canonicalId(id)));
    const routeForOwner = (owner) => canonicalId(state.world?.variables?.[`route_${owner}_locked_v1`] || state.world?.routeLocks?.[owner] || state.world?.routes?.[owner] || "love");
    const sequence = [
      ["d11_03_mason_morning_love_v1", "story/DAY11/love/DAY11_00_MASON_MORNING_LOVE.json", "mason"],
      ["d11_00_lena_morning_love_v1", "story/DAY11/love/DAY11_00_LENA_MORNING_LOVE.json", "lena"],
      ["d11_00_hailey_morning_love_v1", "story/DAY11/love/DAY11_00_HAILEY_MORNING_LOVE.json", "hailey"],
      ["d11_00_evelyn_morning_love_v1", "story/DAY11/love/DAY11_00_EVELYN_MORNING_LOVE.json", "evelyn"],
      ["d11_01_evelyn_afternoon_love_v1", "story/DAY11/love/DAY11_01_EVELYN_AFTERNOON_LOVE.json", "evelyn"],
      ["d11_01_hailey_afternoon_love_v1", "story/DAY11/love/DAY11_01_HAILEY_AFTERNOON_LOVE.json", "hailey"],
      ["d11_04_mason_afternoon_love_v1", "story/DAY11/love/DAY11_01_MASON_AFTERNOON_LOVE.json", "mason"],
      ["d11_05_mason_evening_love_v1", "story/DAY11/love/DAY11_02_MASON_EVENING_LOVE.json", "mason"],
      ["d11_02_evelyn_evening_love_v1", "story/DAY11/love/DAY11_02_EVELYN_EVENING_LOVE.json", "evelyn"],
      ["d11_01_lena_evening_love_v1", "story/DAY11/love/DAY11_02_LENA_EVENING_LOVE.json", "lena"],
      ["d11_02_hailey_evening_love_v1", "story/DAY11/love/DAY11_02_HAILEY_EVENING_LOVE.json", "hailey"],
      ["d11_02_lena_night_love_v1", "story/DAY11/love/DAY11_03_LENA_NIGHT_LOVE.json", "lena"]
    ];
    // A missing LOVE receipt is expected for an inactive or differently routed
    // owner. Requeueing it would route back to an already completed variant.
    const missing = sequence.find(([onceKey, , owner]) => active.has(owner) && routeForOwner(owner) === "love" && !completed.has(onceKey));
    if (!missing) return false;
    setPendingChainStory(missing[1], {
      from: "d10_02_evelyn_evening_love_v1",
      via: "day11_love_authored_gap_repair",
      chainSource: "day11_love_authored_gap_repair",
      strictRequestedPath: true
    });
    setTimeout(() => {
      try { (window.Game ||= {}).resumePendingStory?.({ source: "day11_love_authored_gap_repair", auto: true }); } catch {}
    }, 0);
    return true;
  }

  function repairPendingDay12LoveContinuationGap() {
    const engine = window.GameStateEngine;
    if (!engine?.getGameplayState) return false;
    const state = engine.getGameplayState();
    if (state.execution?.lease) return false;
    const pending = state.progression?.pendingStory;
    if (isRequiredStoryRecoveryPending(pending)) return false;
    const pendingPath = normalizeStoryPath(pending?.path || pending?.storyPath || "").toLowerCase();
    const routeForOwner = (owner) => canonicalId(state.world?.variables?.[`route_${owner}_locked_v1`] || state.world?.routeLocks?.[owner] || state.world?.routes?.[owner] || "love");
    if (pending?.reason === "day12_love_authored_gap_repair") {
      if (pending.contactId && routeForOwner(canonicalId(pending.contactId)) !== "love") {
        clearPendingStory();
        return false;
      }
      setTimeout(() => {
        try { (window.Game ||= {}).resumePendingStory?.({ source: "day12_love_authored_gap_repair_resume", auto: true }); } catch {}
      }, 0);
      return true;
    }
    if (!pending || !pendingPath.startsWith("story/day12/love/")) return false;
    const completed = new Set((state.progression?.onceKeys || []).map((key) => canonicalId(key)));
    const sequence = [
      ["d12_03_mason_morning_love_v1", "story/DAY12/love/DAY12_00_MASON_MORNING_LOVE.json", "mason"],
      ["d12_00_lena_morning_love_v1", "story/DAY12/love/DAY12_00_LENA_MORNING_LOVE.json", "lena"],
      ["d12_00_hailey_morning_love_v1", "story/DAY12/love/DAY12_00_HAILEY_MORNING_LOVE.json", "hailey"],
      ["d12_00_evelyn_morning_love_v1", "story/DAY12/love/DAY12_00_EVELYN_MORNING_LOVE.json", "evelyn"],
      ["d12_01_evelyn_afternoon_love_v1", "story/DAY12/love/DAY12_01_EVELYN_AFTERNOON_LOVE.json", "evelyn"],
      ["d12_01_hailey_afternoon_love_v1", "story/DAY12/love/DAY12_01_HAILEY_AFTERNOON_LOVE.json", "hailey"],
      ["d12_04_mason_afternoon_love_v1", "story/DAY12/love/DAY12_01_MASON_AFTERNOON_LOVE.json", "mason"],
      ["d12_05_mason_evening_love_v1", "story/DAY12/love/DAY12_02_MASON_EVENING_LOVE.json", "mason"],
      ["d12_02_evelyn_evening_love_v1", "story/DAY12/love/DAY12_02_EVELYN_EVENING_LOVE.json", "evelyn"],
      ["d12_01_lena_evening_love_v1", "story/DAY12/love/DAY12_02_LENA_EVENING_LOVE.json", "lena"],
      ["d12_02_hailey_evening_love_v1", "story/DAY12/love/DAY12_02_HAILEY_EVENING_LOVE.json", "hailey"]
    ];
    const missing = sequence.find(([onceKey, , owner]) => routeForOwner(owner) === "love" && !completed.has(onceKey));
    if (!missing || normalizeStoryPath(missing[1]).toLowerCase() === pendingPath) return false;
    writePendingStory({ ...pending, path: missing[1], storyPath: missing[1], contactId: missing[2], reason: "day12_love_authored_gap_repair", via: "day12_love_authored_gap_repair", startWhenScene: "", attempts: 0, updatedAt: Date.now() });
    setTimeout(() => {
      try { (window.Game ||= {}).resumePendingStory?.({ source: "day12_love_authored_gap_repair", auto: true }); } catch {}
    }, 0);
    return true;
  }

  function repairPendingDay12MixedRouteNtsHandoff() {
    const engine = window.GameStateEngine;
    if (!engine?.getGameplayState) return false;
    const state = engine.getGameplayState();
    if (state.execution?.lease) return false;
    const pending = state.progression?.pendingStory;
    if (isRequiredStoryRecoveryPending(pending)) return false;
    const pendingPath = normalizeStoryPath(pending?.path || pending?.storyPath || "").toLowerCase();
    // A route-local terminal can reach Day 13 while another active owner's
    // Day 12 segments are still missing. This is especially visible in a
    // mixed profile (Evelyn NTS self-chains through evening before Mason
    // LOVE afternoon/evening). Never weaken Day 13's requireOnceKey and
    // never replay a completed owner: redirect the pending continuation to
    // the first missing active-owner segment, using that owner's canonical
    // route, until the complete Day 12 ordering contract is satisfied.
    if (pending && pendingPath.startsWith("story/day13/")) {
      const completed = new Set((state.progression?.onceKeys || []).map((key) => canonicalId(key)));
      const active = new Set((state.world?.activeCharacters || []).map((id) => canonicalId(id)));
      const routeForOwner = (owner) => {
        const raw = canonicalId(state.world?.variables?.[`route_${owner}_locked_v1`] || state.world?.routeLocks?.[owner] || state.world?.routes?.[owner] || "love");
        return normalizeLockedRoute(raw) || "love";
      };
      const row = (owner, fileStem, onceStem) => {
        const route = routeForOwner(owner);
        const lenaNtrEvening = owner === "lena" && fileStem === "DAY12_02_LENA_EVENING" && route === "ntr";
        const onceKey = lenaNtrEvening ? "d12_01_lena_late_night_ntr_v1" : `${onceStem}_${route}_v1`;
        return [onceKey, `story/DAY12/${route}/${fileStem}_${route.toUpperCase()}.json`, owner];
      };
      const sequence = [
        row("mason", "DAY12_00_MASON_MORNING", "d12_03_mason_morning"),
        row("lena", "DAY12_00_LENA_MORNING", "d12_00_lena_morning"),
        row("hailey", "DAY12_00_HAILEY_MORNING", "d12_00_hailey_morning"),
        row("evelyn", "DAY12_00_EVELYN_MORNING", "d12_00_evelyn_morning"),
        row("evelyn", "DAY12_01_EVELYN_AFTERNOON", "d12_01_evelyn_afternoon"),
        row("hailey", "DAY12_01_HAILEY_AFTERNOON", "d12_01_hailey_afternoon"),
        row("mason", "DAY12_01_MASON_AFTERNOON", "d12_04_mason_afternoon"),
        row("mason", "DAY12_02_MASON_EVENING", "d12_05_mason_evening"),
        row("evelyn", "DAY12_02_EVELYN_EVENING", "d12_02_evelyn_evening"),
        row("lena", "DAY12_02_LENA_EVENING", "d12_01_lena_evening"),
        row("hailey", "DAY12_02_HAILEY_EVENING", "d12_02_hailey_evening")
      ];
      const missing = sequence.find(([onceKey, , owner]) => active.has(owner) && !completed.has(onceKey));
      if (missing) {
        writePendingStory({ ...pending, path: missing[1], storyPath: missing[1], contactId: missing[2], reason: "day12_owner_completion_gap_repair", via: "day12_owner_completion_gap_repair", startWhenScene: "", attempts: 0, updatedAt: Date.now() });
        setTimeout(() => {
          try { (window.Game ||= {}).resumePendingStory?.({ source: "day12_owner_completion_gap_repair", auto: true }); } catch {}
        }, 0);
        return true;
      }
    }
    if (pendingPath !== "story/day12/nts/day12_01_tutor_study_update_nts.json" || canonicalId(pending?.from) !== "d12_02_evelyn_evening_nts_v1") return false;
    const haileyRoute = canonicalId(state.world?.variables?.route_hailey_locked_v1 || state.world?.routeLocks?.hailey || state.world?.routes?.hailey || "love");
    if (normalizeLockedRoute(haileyRoute) === "nts") return false;
    const masonActive = (state.world?.activeCharacters || []).some((id) => canonicalId(id) === "mason");
    const repairedPath = masonActive ? "story/DAY13/nts/DAY13_00_MASON_MORNING_NTS.json" : "story/DAY13/nts/DAY13_00_EVELYN_MORNING_NTS.json";
    writePendingStory({ ...pending, path: repairedPath, storyPath: repairedPath, contactId: masonActive ? "mason" : "evelyn", reason: "day12_mixed_route_nts_handoff_repair", via: "day12_mixed_route_nts_handoff_repair", startWhenScene: "", attempts: 0, updatedAt: Date.now() });
    setTimeout(() => {
      try { (window.Game ||= {}).resumePendingStory?.({ source: "day12_mixed_route_nts_handoff_repair", auto: true }); } catch {}
    }, 0);
    return true;
  }

  function repairIdleDay12OwnerCompletionGap() {
    const engine = window.GameStateEngine;
    if (!engine?.getGameplayState) return false;
    if (engine.getExecutionState?.().lease) return false;
    const state = engine.getStoryContinuationState ? engine.getStoryContinuationState() : engine.getGameplayState();
    if (state.execution?.lease || state.progression?.pendingStory) return false;
    const completed = new Set((state.progression?.onceKeys || []).map((key) => canonicalId(key)));
    if (![...completed].some((key) => key.startsWith("d12_")) || [...completed].some((key) => key.startsWith("d13_"))) return false;
    const active = new Set((state.world?.activeCharacters || []).map((id) => canonicalId(id)));
    const routeForOwner = (owner) => {
      const raw = canonicalId(state.world?.variables?.[`route_${owner}_locked_v1`] || state.world?.routeLocks?.[owner] || state.world?.routes?.[owner] || "love");
      return normalizeLockedRoute(raw) || "love";
    };
    const row = (owner, fileStem, onceStem) => {
      const route = routeForOwner(owner);
      const onceKey = owner === "lena" && fileStem === "DAY12_02_LENA_EVENING" && route === "ntr" ? "d12_01_lena_late_night_ntr_v1" : `${onceStem}_${route}_v1`;
      return [onceKey, `story/DAY12/${route}/${fileStem}_${route.toUpperCase()}.json`, owner];
    };
    const sequence = [
      row("mason", "DAY12_00_MASON_MORNING", "d12_03_mason_morning"),
      row("lena", "DAY12_00_LENA_MORNING", "d12_00_lena_morning"),
      row("hailey", "DAY12_00_HAILEY_MORNING", "d12_00_hailey_morning"),
      row("evelyn", "DAY12_00_EVELYN_MORNING", "d12_00_evelyn_morning"),
      row("evelyn", "DAY12_01_EVELYN_AFTERNOON", "d12_01_evelyn_afternoon"),
      row("hailey", "DAY12_01_HAILEY_AFTERNOON", "d12_01_hailey_afternoon"),
      row("mason", "DAY12_01_MASON_AFTERNOON", "d12_04_mason_afternoon"),
      row("mason", "DAY12_02_MASON_EVENING", "d12_05_mason_evening"),
      row("evelyn", "DAY12_02_EVELYN_EVENING", "d12_02_evelyn_evening"),
      row("lena", "DAY12_02_LENA_EVENING", "d12_01_lena_evening"),
      row("hailey", "DAY12_02_HAILEY_EVENING", "d12_02_hailey_evening")
    ];
    const missing = sequence.find(([onceKey, , owner]) => active.has(owner) && !completed.has(onceKey));
    if (!missing) return false;
    setPendingChainStory(missing[1], { from: "day12_owner_completion_idle_gap", via: "day12_owner_completion_idle_gap_repair", chainSource: "day12_owner_completion_idle_gap_repair", strictRequestedPath: true, contactId: missing[2] });
    setTimeout(() => {
      try { (window.Game ||= {}).resumePendingStory?.({ source: "day12_owner_completion_idle_gap_repair", auto: true }); } catch {}
    }, 0);
    return true;
  }

  function repairPendingDay14LoveContinuationGap() {
    const engine = window.GameStateEngine;
    if (!engine?.getGameplayState) return false;
    const state = engine.getGameplayState();
    if (state.execution?.lease) return false;
    const pending = state.progression?.pendingStory;
    if (isRequiredStoryRecoveryPending(pending)) return false;
    const pendingPath = normalizeStoryPath(pending?.path || pending?.storyPath || "").toLowerCase();
    const routeForStory = (storyPath) => { const owner=canonicalId((String(storyPath||"").match(/DAY\d+_\d+_(LENA|HAILEY|MASON|EVELYN)/i)||[])[1]||""); return canonicalId(state.world?.variables?.[`route_${owner}_locked_v1`] || state.world?.routeLocks?.[owner] || state.world?.routes?.[owner] || "love"); };
    if (pending?.reason === "day14_love_authored_gap_repair") {
      setTimeout(() => {
        try { (window.Game ||= {}).resumePendingStory?.({ source: "day14_love_authored_gap_repair_resume", auto: true }); } catch {}
      }, 0);
      return true;
    }
    if (!pending || !pendingPath.startsWith("story/day15/")) return false;
    const completed = new Set((state.progression?.onceKeys || []).map((key) => canonicalId(key)));
    if (!completed.has("d14_03_lena_night_love_v1") || completed.has("d14_02_evelyn_evening_love_v1")) return false;
    const sequence = [
      ["d14_04_mason_morning_love_v1", "story/DAY14/love/DAY14_00_MASON_MORNING_LOVE.json", "mason"],
      ["d14_00_lena_morning_love_v1", "story/DAY14/love/DAY14_00_LENA_MORNING_LOVE.json", "lena"],
      ["d14_00_hailey_morning_love_v1", "story/DAY14/love/DAY14_00_HAILEY_MORNING_LOVE.json", "hailey"],
      ["d14_00_evelyn_morning_love_v1", "story/DAY14/love/DAY14_00_EVELYN_MORNING_LOVE.json", "evelyn"],
      ["d14_01_evelyn_afternoon_love_v1", "story/DAY14/love/DAY14_01_EVELYN_AFTERNOON_LOVE.json", "evelyn"],
      ["d14_01_lena_noon_love_v1", "story/DAY14/love/DAY14_01_LENA_BREAK_LOVE.json", "lena"],
      ["d14_01_hailey_afternoon_love_v1", "story/DAY14/love/DAY14_01_HAILEY_AFTERNOON_LOVE.json", "hailey"],
      ["d14_05_mason_afternoon_love_v1", "story/DAY14/love/DAY14_01_MASON_AFTERNOON_LOVE.json", "mason"],
      ["d14_02_lena_evening_love_v1", "story/DAY14/love/DAY14_02_LENA_EVENING_LOVE.json", "lena"],
      ["d14_02_hailey_evening_love_v1", "story/DAY14/love/DAY14_02_HAILEY_EVENING_LOVE.json", "hailey"],
      ["d14_06_mason_evening_love_v1", "story/DAY14/love/DAY14_02_MASON_EVENING_LOVE.json", "mason"],
      ["d14_02_evelyn_evening_love_v1", "story/DAY14/love/DAY14_02_EVELYN_EVENING_LOVE.json", "evelyn"],
      ["d14_03_lena_night_love_v1", "story/DAY14/love/DAY14_03_LENA_NIGHT.LOVE.json", "lena"]
    ];
    const missing = sequence.find(([onceKey, storyPath]) => routeForStory(storyPath) === "love" && !completed.has(onceKey));
    if (!missing) return false;
    writePendingStory({ ...pending, path: missing[1], storyPath: missing[1], contactId: missing[2], reason: "day14_love_authored_gap_repair", via: "day14_love_authored_gap_repair", startWhenScene: "", attempts: 0, updatedAt: Date.now() });
    setTimeout(() => {
      try { (window.Game ||= {}).resumePendingStory?.({ source: "day14_love_authored_gap_repair", auto: true }); } catch {}
    }, 0);
    return true;
  }

  function repairPendingDay15LoveContinuationGap() {
    const engine = window.GameStateEngine;
    if (!engine?.getGameplayState) return false;
    let state = engine.getGameplayState();
    const obsoleteBoundary = normalizeStoryPath(state.execution?.activeStoryPath || "").toLowerCase() === "story/dev/day9_end_chapter.json" &&
      (state.progression?.onceKeys || []).map((key) => canonicalId(key)).includes("d15_05_mason_evening_love_v1") &&
      !(state.progression?.onceKeys || []).map((key) => canonicalId(key)).includes("d15_01_lena_afternoon_love_v1");
    if (state.execution?.lease && obsoleteBoundary) {
      const released = engine.dispatch({ type: "RELEASE_LEASE", commandId: `day15-obsolete-boundary-release:${state.execution.lease.id}`, expectedRevision: state.revision, payload: {} });
      if (!released?.ok) return false;
      state = engine.getGameplayState();
    }
    if (state.execution?.lease) return false;
    const pending = state.progression?.pendingStory;
    if (isRequiredStoryRecoveryPending(pending)) return false;
    const pendingPath = normalizeStoryPath(pending?.path || pending?.storyPath || "").toLowerCase();
    if (!pending || (!pendingPath.startsWith("story/day15/") && !pendingPath.includes("day15_router"))) return false;
    const completed = new Set((state.progression?.onceKeys || []).map((key) => canonicalId(key)));
    const active = new Set((state.world?.activeCharacters || []).map((id) => canonicalId(id)));
    const routeForOwner = (owner) => normalizeLockedRoute(state.world?.variables?.[`route_${owner}_locked_v1`] || state.world?.routeLocks?.[owner] || state.world?.routes?.[owner] || "love") || "love";
    const row = (owner, fileStem, onceStem) => {
      const route = routeForOwner(owner);
      const onceKey = owner === "lena" && fileStem === "DAY15_02_LENA_EVENING" && route === "ntr" ? "d15_01_lena_evening_ntr_v1" : `${onceStem}_${route}_v1`;
      return [onceKey, `story/DAY15/${route}/${fileStem}_${route.toUpperCase()}.json`, owner];
    };
    const sequence = [
      row("mason", "DAY15_00_MASON_MORNING", "d15_03_mason_morning"),
      row("lena", "DAY15_00_LENA_MORNING", "d15_00_lena_morning"),
      row("hailey", "DAY15_00_HAILEY_MORNING", "d15_00_hailey_morning"),
      row("evelyn", "DAY15_00_EVELYN_MORNING", "d15_00_evelyn_morning"),
      row("evelyn", "DAY15_01_EVELYN_AFTERNOON", "d15_01_evelyn_afternoon"),
      row("hailey", "DAY15_01_HAILEY_AFTERNOON", "d15_01_hailey_afternoon"),
      row("mason", "DAY15_01_MASON_AFTERNOON", "d15_04_mason_afternoon"),
      row("mason", "DAY15_02_MASON_EVENING", "d15_05_mason_evening"),
      row("lena", "DAY15_02_LENA_EVENING", "d15_01_lena_afternoon"),
      row("hailey", "DAY15_02_HAILEY_EVENING", "d15_02_hailey_evening"),
      row("evelyn", "DAY15_02_EVELYN_EVENING", "d15_02_evelyn_evening")
    ];
    const missing = sequence.find(([onceKey, , owner]) => active.has(owner) && !completed.has(onceKey));
    if (!missing) return false;
    if (normalizeStoryPath(missing[1]).toLowerCase() === pendingPath) return false;
    writePendingStory({ ...pending, path: missing[1], storyPath: missing[1], contactId: missing[2], reason: "day15_love_authored_gap_repair", via: "day15_love_authored_gap_repair", startWhenScene: "", attempts: 0, updatedAt: Date.now() });
    setTimeout(() => {
      try { (window.Game ||= {}).resumePendingStory?.({ source: "day15_love_authored_gap_repair", auto: true }); } catch {}
    }, 0);
    return true;
  }

  function repairIdleDay14LoveContinuationGap() {
    const engine = window.GameStateEngine;
    if (!engine?.getGameplayState) return false;
    if (engine.getExecutionState?.().lease) return false;
    const state = engine.getStoryContinuationState ? engine.getStoryContinuationState() : engine.getGameplayState();
    if (state.execution?.lease || state.progression?.pendingStory) return false;
    if (Number(state.world?.day) > 14) return false;
    const completed = new Set((state.progression?.onceKeys || []).map((key) => canonicalId(key)));
    const routeForStory = (storyPath) => { const owner=canonicalId((String(storyPath||"").match(/DAY\d+_\d+_(LENA|HAILEY|MASON|EVELYN)/i)||[])[1]||""); return canonicalId(state.world?.variables?.[`route_${owner}_locked_v1`] || state.world?.routeLocks?.[owner] || state.world?.routes?.[owner] || "love"); };
    const cursorStoryPath = normalizeStoryPath(state.execution?.cursor?.storyPath || state.execution?.activeStoryPath || "").toLowerCase();
    const enteredDay14 = [...completed].some((key) => key.startsWith("d14_")) || cursorStoryPath.startsWith("story/day14/");
    if (!enteredDay14) return false;
    const sequence = [
      ["d14_04_mason_morning_love_v1", "story/DAY14/love/DAY14_00_MASON_MORNING_LOVE.json"],
      ["d14_00_lena_morning_love_v1", "story/DAY14/love/DAY14_00_LENA_MORNING_LOVE.json"],
      ["d14_00_hailey_morning_love_v1", "story/DAY14/love/DAY14_00_HAILEY_MORNING_LOVE.json"],
      ["d14_00_evelyn_morning_love_v1", "story/DAY14/love/DAY14_00_EVELYN_MORNING_LOVE.json"],
      ["d14_01_evelyn_afternoon_love_v1", "story/DAY14/love/DAY14_01_EVELYN_AFTERNOON_LOVE.json"],
      ["d14_01_lena_noon_love_v1", "story/DAY14/love/DAY14_01_LENA_BREAK_LOVE.json"],
      ["d14_01_hailey_afternoon_love_v1", "story/DAY14/love/DAY14_01_HAILEY_AFTERNOON_LOVE.json"],
      ["d14_05_mason_afternoon_love_v1", "story/DAY14/love/DAY14_01_MASON_AFTERNOON_LOVE.json"],
      ["d14_02_lena_evening_love_v1", "story/DAY14/love/DAY14_02_LENA_EVENING_LOVE.json"],
      ["d14_02_hailey_evening_love_v1", "story/DAY14/love/DAY14_02_HAILEY_EVENING_LOVE.json"],
      ["d14_06_mason_evening_love_v1", "story/DAY14/love/DAY14_02_MASON_EVENING_LOVE.json"],
      ["d14_02_evelyn_evening_love_v1", "story/DAY14/love/DAY14_02_EVELYN_EVENING_LOVE.json"],
      ["d14_03_lena_night_love_v1", "story/DAY14/love/DAY14_03_LENA_NIGHT.LOVE.json"]
    ];
    const missing = sequence.find(([onceKey, storyPath]) => routeForStory(storyPath) === "love" && !completed.has(onceKey));
    if (!missing) {
      if (!(state.world?.activeCharacters || []).some(id => canonicalId(id) === "mason")) return false;
      const route = normalizeLockedRoute(state.world?.variables?.route_mason_locked_v1 || state.world?.routeLocks?.mason || state.world?.routes?.mason || "love");
      if (!route || completed.has(`d15_03_mason_morning_${route}_v1`)) return false;
      const day15Path = `story/DAY15/${route}/DAY15_00_MASON_MORNING_${route.toUpperCase()}.json`;
      setPendingChainStory(day15Path, { from: "d14_03_lena_night_love_v1", via: "day14_love_rejoin_day15", chainSource: "day14_love_rejoin_day15", strictRequestedPath: true });
      setTimeout(() => {
        try { (window.Game ||= {}).resumePendingStory?.({ source: "day14_love_rejoin_day15", auto: true }); } catch {}
      }, 0);
      return true;
    }
    setPendingChainStory(missing[1], { from: "day14_love_idle_gap", via: "day14_love_idle_gap_repair", chainSource: "day14_love_idle_gap_repair", strictRequestedPath: true });
    setTimeout(() => {
      try { (window.Game ||= {}).resumePendingStory?.({ source: "day14_love_idle_gap_repair", auto: true }); } catch {}
    }, 0);
    return true;
  }

  function repairKnownIdleContinuationGaps() {
    if (isHistoricalConversationView()) return false;
    return repairIdleDay9LoveContinuationGap() ||
      repairIdleDay11LoveContinuationGap() ||
      repairIdleDay12OwnerCompletionGap() ||
      repairIdleDay14LoveContinuationGap();
  }

  async function checkpointLogicalDayContinuation(completedPath, targetPath) {
    // A historical completed path is not the current chronology. Catching up
    // another slot inside the current day must not mint a new day-start save.
    const currentDay = Number(window.GameStateEngine?.getWorldDay?.()) || 0;
    const targetDay = chapterDayNumberFromStoryPath(targetPath);
    if (currentDay > 0 && targetDay > 0 && targetDay <= currentDay) return true;
    const checkpoint = buildChapterCheckpointFromTransition({ currentStoryPath: completedPath, targetStoryPath: targetPath, at: Date.now() });
    if (!checkpoint) return true;
    const engine = window.GameStateEngine;
    const before = engine?.getExecutionState?.() || {};
    const playthroughId = engine?.getConversationCacheFlushIdentity?.()?.playthroughId;
    if (before.lease) return false;
    const saved = await upsertChapterCheckpoint({...checkpoint, allowCompletedDayTransition: true});
    if (!saved?.slotId) throw new Error("CHAPTER_CHECKPOINT_NOT_DURABLE");
    const after = engine?.getExecutionState?.() || {};
    return !after.lease && before.generation === after.generation && before.operationEpoch === after.operationEpoch && playthroughId === engine?.getConversationCacheFlushIdentity?.()?.playthroughId;
  }

  // -------------------------
  // Deterministic-failure guard for logical idle recovery.
  //
  // repairLogicalIdleContinuationGap runs on a 750ms interval for the life of
  // the document. Its only precondition is "idle at a completed cursor with
  // nothing pending", so a candidate that is selected, fails to start, and
  // leaves the runtime idle again is reselected on the very next tick --
  // forever. Live tester report (packaged 2.0.0, Day10 Hailey=LOVE +
  // Lena=NTS): DAY10_01_TUTOR_FIRST_MEETING_NTS was chosen, failed with
  // interrupt_lease_unavailable, and the pair repeated until crash.log
  // rotated at ~250KB.
  //
  // The eligibility fix (logicalCandidateRouteMatches -> routeAuthorityOwner)
  // removes THAT candidate, but the loop shape is generic and would bite any
  // future story that deterministically fails to start. This guard is the
  // independent second invariant: the same candidate, selected again for the
  // same completed story with no canonical progress in between, is refused.
  //
  // "Canonical progress" is measured by the completed onceKey count plus the
  // committed conversation-event count -- both move on any real progression
  // and neither moves on a failed start, so a genuinely retryable transient
  // (a lease briefly held elsewhere) still gets its retries via the attempt
  // budget while a deterministic failure stops after it.
  // Budget shape: bounded in BOTH attempts and wall time, and the wall-time
  // bound is the generous one on purpose. Recovery ticks every 750ms, so an
  // attempts-only budget of 3 would give a transient (a lease briefly held by
  // an unmounting renderer, a slow asset fetch) barely two seconds to clear
  // before recovery gave up permanently -- turning a recoverable stall into a
  // dead session, which is a strictly worse failure than the loop this guards.
  // 30s / 40 attempts still bounds the reported loop hard (it ran until
  // crash.log rotated at ~250KB) while leaving real transients room to settle.
  const LOGICAL_IDLE_RECOVERY_MAX_ATTEMPTS = 40;
  const LOGICAL_IDLE_RECOVERY_MAX_MS = 30_000;
  const logicalIdleRecoveryAttempts = new Map();
  function logicalIdleRecoveryProgressToken() {
    const engine = window.GameStateEngine;
    try {
      const state = engine?.getGameplayState?.() || {};
      const onceCount = Array.isArray(state.progression?.onceKeys) ? state.progression.onceKeys.length : 0;
      const completedCount = Array.isArray(state.progression?.completedStoryIds) ? state.progression.completedStoryIds.length : 0;
      const events = Number(engine?.getConversationEventCount?.() || 0);
      return `${onceCount}|${completedCount}|${events}`;
    } catch {
      return "unknown";
    }
  }
  // Returns null when the candidate may be attempted, or a diagnostic when the
  // attempt budget for this exact (completed -> candidate @ unchanged state)
  // triple is exhausted.
  function claimLogicalIdleRecoveryAttempt(completedPath, candidatePath) {
    const key = `${normalizeStoryPath(completedPath)}->${normalizeStoryPath(candidatePath)}`;
    const progress = logicalIdleRecoveryProgressToken();
    const row = logicalIdleRecoveryAttempts.get(key);
    if (!row || row.progress !== progress) {
      logicalIdleRecoveryAttempts.set(key, { progress, attempts: 1, firstAt: Date.now(), reportedExhaustion: false });
      // Any real progress retires every other candidate's stale budget too, so
      // this map cannot grow across a long session.
      if (logicalIdleRecoveryAttempts.size > 64) {
        for (const [existingKey, existingRow] of logicalIdleRecoveryAttempts) {
          if (existingRow.progress !== progress) logicalIdleRecoveryAttempts.delete(existingKey);
        }
      }
      return null;
    }
    const elapsed = Date.now() - Number(row.firstAt || 0);
    if (row.attempts >= LOGICAL_IDLE_RECOVERY_MAX_ATTEMPTS || elapsed >= LOGICAL_IDLE_RECOVERY_MAX_MS) {
      if (!row.reportedExhaustion) {
        row.reportedExhaustion = true;
        try {
          console.error("[DAY_LOGICAL_IDLE_RECOVERY_EXHAUSTED] " + JSON.stringify({
            completedStory: normalizeStoryPath(completedPath),
            candidateStory: normalizeStoryPath(candidatePath),
            attempts: row.attempts,
            elapsedMs: elapsed,
            progressToken: progress,
            note: "same candidate failed deterministically with no canonical progress; recovery stopped to avoid an infinite retry loop"
          }));
        } catch {}
      }
      return { exhausted: true, attempts: row.attempts };
    }
    row.attempts += 1;
    return null;
  }

  let logicalIdleRepairBusy = false;
  let logicalIdleRepairDocumentRetired = false;
  const retireLogicalIdleRepairDocument = () => { logicalIdleRepairDocumentRetired = true; };
  window.addEventListener("beforeunload", retireLogicalIdleRepairDocument);
  window.addEventListener("pagehide", retireLogicalIdleRepairDocument);

  async function repairLogicalIdleContinuationGap() {
    if (isHistoricalConversationView()) return false;
    if (logicalIdleRepairBusy || logicalIdleRepairDocumentRetired) return false;
    const engine = window.GameStateEngine;
    const execution = engine?.getExecutionState?.() || {};
    if (execution.lease || execution.cursor?.completion !== "completed" || readPendingStory()) return false;
    const completedPath = normalizeStoryPath(execution.cursor?.storyPath || "");
    if (!completedPath) return false;
    const playthroughId = engine?.getConversationCacheFlushIdentity?.()?.playthroughId;
    const ownsExecution = () => {
      if (isHistoricalConversationView()) return false;
      if (logicalIdleRepairDocumentRetired || engine !== window.GameStateEngine) return false;
      const current = engine?.getExecutionState?.() || {};
      return !current.lease && current.generation === execution.generation && current.operationEpoch === execution.operationEpoch &&
        current.cursor?.completion === "completed" && normalizeStoryPath(current.cursor?.storyPath || "") === completedPath &&
        playthroughId === engine?.getConversationCacheFlushIdentity?.()?.playthroughId;
    };
    const ownsIdleBoundary = () => ownsExecution() && !readPendingStory();
    logicalIdleRepairBusy = true;
    try {
      const completedJson = await loadJson(completedPath);
      if (!ownsIdleBoundary() || !completedJson?.onceKey || !onceDone(completedJson.onceKey)) return false;
      const logicalContinuation = await findNextLogicalStoryAfterCompleted(completedJson, completedPath);
      if (!ownsIdleBoundary() || !logicalContinuation?.path || logicalContinuation.blockingInteraction) return false;
      // Refuse a candidate that has already failed deterministically from this
      // exact idle boundary with no canonical progress since.
      if (claimLogicalIdleRecoveryAttempt(completedPath, logicalContinuation.path)) return false;
      if (!await checkpointLogicalDayContinuation(completedPath, logicalContinuation.path) || !ownsIdleBoundary()) return false;
      try {
        console.warn("[DAY_LOGICAL_IDLE_RECOVERY] " + JSON.stringify({
          completedStory: completedPath,
          completedOnceKey: completedJson.onceKey,
          nextPhysicalStory: logicalContinuation.path,
          nextOnceKey: logicalContinuation.onceKey,
          owner: logicalContinuation.contactId || null,
          route: logicalContinuation.contactId ? readCanonicalLockedRoute(logicalContinuation.contactId) : null
        }));
      } catch {}
      setPendingChainStory(logicalContinuation.path, { from: completedJson.onceKey, via: "logical_day_slot_idle_recovery", chainSource: "logical_day_slot_idle_recovery", strictRequestedPath: true });
      setTimeout(() => {
        // A Load, another admission or another pending target retires this
        // continuation callback just as it retires the asynchronous lookup.
        const pending = readPendingStory();
        if (!ownsExecution() || normalizeStoryPath(pending?.path || pending?.storyPath || "") !== normalizeStoryPath(logicalContinuation.path) || pending?.from !== completedJson.onceKey) return;
        try { (window.Game ||= {}).resumePendingStory?.({ source: "logical_day_slot_idle_recovery", auto: true }); } catch {}
      }, 0);
      return true;
    } catch (err) {
      // Fetches from a retired document/restore epoch can be cancelled by
      // navigation. They no longer own recovery or its error reporting.
      // Failures belonging to the current idle boundary remain real errors.
      if (!ownsIdleBoundary()) return false;
      try { console.error("[DAY_LOGICAL_IDLE_RECOVERY_FAILED] " + JSON.stringify({ completedStory: completedPath, error: String(err?.stack || err?.message || err) })); } catch {}
      return false;
    } finally {
      logicalIdleRepairBusy = false;
    }
  }

  // -------------------------
  // Canonical START_STORY admission contract (Group 3 authority unification).
  // ONE decision, driven only by GameStateEngine canonical state (lease,
  // active story/contact, cursor.continuation) plus the engine's own native
  // START_STORY command, which already atomically detects a genuine
  // conflict (LEASE_CONFLICT, thrown synchronously against current state)
  // and already dedups an exact repeated request (commandReceipts /
  // DUPLICATE_COMMAND) -- no renderer variable (Game._activeRunner,
  // Game._activeStoryPath, the story_runtime_v1 turn-lock read by the old
  // findStoryStartConflict) is read here. Dispatching eagerly, as the FIRST
  // thing a start attempt does (before any await in the caller), is what
  // makes two near-simultaneous calls resolve deterministically:
  // GameStateEngine.dispatch is synchronous, so whichever call reaches this
  // function first always wins the lease and any call arriving after it
  // observes that outcome already reflected in canonical state. Nothing
  // here waits, retries, or times out.
  //
  // Returns one of: NEW_START_ALLOWED, SAME_OPERATION_DUPLICATE,
  // ALREADY_ACTIVE_NOOP, CONTINUATION_ALREADY_ACTIVATED,
  // ACTIVE_STORY_CONFLICT, STALE_RECOVERABLE_STATE, INVALID_TARGET,
  // TERMINAL_ERROR. (PENDING_COMPLETION_CONFLICT is handled upstream of
  // this call, by the existing onceKey-completion check in Game.startStory
  // -- a completed, non-continuing story is never holding a lease, per
  // complete()/releaseLease(), so this function has nothing left to add for
  // that case.)
  // -------------------------
  function requestStartAdmission(rawStoryPath, rawContactId, storyJson = null) {
    const engine = window.GameStateEngine;
    const normalizedPath = normalizeStoryPath(rawStoryPath) || String(rawStoryPath || "").trim();
    const authoredContactId = storyJson ? getStoryOwnerId(storyJson, { storyPath: normalizedPath }) : "";
    const contactId = String(authoredContactId || rawContactId || "").trim().toLowerCase() || GLOBAL_STORY_LEASE_CONTACT_ID;
    if (!engine) return { classification: "TERMINAL_ERROR", ok: false, reason: "ENGINE_UNAVAILABLE" };
    if (!normalizedPath) return { classification: "INVALID_TARGET", ok: false, reason: "EMPTY_STORY_PATH" };

    const classifyAgainstLease = (exec) => {
      const lease = exec.lease;
      if (!lease) return null;
      const sameStory = exec.activeStoryPath === normalizedPath;
      const sameContact = (exec.activeContactId || null) === contactId ||
        (exec.activeContactId == null && contactId === GLOBAL_STORY_LEASE_CONTACT_ID &&
          window.StoryAdmissionCatalog?.some(row => row.ownerScope === "global" && storyPathsEqual(row.path, normalizedPath)));
      if (sameStory && sameContact) {
        const activated = exec.cursor && exec.cursor.continuation === "activated";
        return {
          classification: activated ? "CONTINUATION_ALREADY_ACTIVATED" : "ALREADY_ACTIVE_NOOP",
          ok: true, leaseId: lease.id, startIndex: Number(exec.activeStepIndex) || 0
        };
      }
      if (!exec.activeStoryId) {
        // A lease with no owning story recorded is an invalid combination
        // that no canonical command in this file ever produces -- treat it
        // as recoverable rather than a permanent block, since refusing to
        // ever admit another story here would deadlock every future start.
        return {
          classification: "STALE_RECOVERABLE_STATE", ok: false,
          leaseId: lease.id, lockStoryPath: exec.activeStoryPath, lockContactId: exec.activeContactId
        };
      }
      return {
        classification: "ACTIVE_STORY_CONFLICT", ok: false,
        leaseId: lease.id, lockStoryPath: exec.activeStoryPath, lockContactId: exec.activeContactId
      };
    };

    let state = engine.getGameplayState();
    let exec = state.execution;
    const existing = classifyAgainstLease(exec);
    if (existing) return existing;

    const commandId = `start-story:${normalizedPath}:${contactId}:${state.revision}`;
    const result = engine.dispatch({
      type: "START_STORY",
      commandId,
      expectedRevision: state.revision,
      payload: { storyId: stableStoryIdForPath(normalizedPath), storyPath: normalizedPath, onceKey: storyJson?.onceKey || undefined, requirements: storyJson ? Object.fromEntries(["requireOnceKey", "requireCondition", "requireWatched", "requireWatchedAny", "requireWatchedKey"].filter(key => storyJson[key] != null).map(key => [key, storyJson[key]])) : undefined, contactId, stepIndex: 0 }
    });

    if (result.status === "DUPLICATE_COMMAND") {
      const freshLease = engine.getGameplayState().execution.lease;
      return { classification: "SAME_OPERATION_DUPLICATE", ok: true, leaseId: freshLease?.id || null, startIndex: 0 };
    }
    if (result.ok) {
      return { classification: "NEW_START_ALLOWED", ok: true, leaseId: engine.getGameplayState().execution.lease?.id || null, startIndex: 0 };
    }
    // The read-then-dispatch gap above is synchronous (no I/O in between),
    // so this only fires when this very call raced a lease that appeared
    // between the read and the dispatch a few lines later. Re-classify
    // against current state rather than guessing at the rejection reason.
    state = engine.getGameplayState();
    exec = state.execution;
    const afterConflict = classifyAgainstLease(exec);
    if (afterConflict) return afterConflict;
    return { classification: "TERMINAL_ERROR", ok: false, reason: result.error?.code || result.status || "UNKNOWN" };
  }

  function recordMigrationAttempt(stepType, mode, outcome, detail) {
    try { window.CanonicalStoryRuntime?.recordStepAttempt?.(stepType, mode, outcome, detail); } catch {}
  }

  // -------------------------
  // Shared commit-failure classification. A dispatch rejection is not one
  // failure mode: some are already-succeeded-under-another-name (dedup),
  // some are a narrow race that a single idempotent retry resolves, and some
  // are structural (nothing about retrying changes the outcome). Conflating
  // them is what produced the old "log and advance anyway" bug -- every
  // migrated step type must react the same way to the same class, not decide
  // per call site.
  //   duplicate         -> already canonical; treat as success.
  //   transient          -> revision/lease moved between the read and the
  //                         dispatch (another commit, a restore, a reclaim);
  //                         same eventId/commandId makes a same-tick retry
  //                         idempotent, so retry exactly once here.
  //   blocked_retryable  -> a still-actively-driven competing lease. Only the
  //                         caller (which owns the step-walk position) can
  //                         legitimately wait this out, bounded, without
  //                         losing its place -- see pauseForCanonicalRetry.
  //   blocked_terminal   -> a real contract violation (bad payload, engine
  //                         missing, retry exhausted). Retrying cannot help;
  //                         the caller must stop advancing and surface it.
  // -------------------------
  const TRANSIENT_DISPATCH_STATUSES = new Set(["REVISION_MISMATCH", "STALE_OPERATION"]);
  function classifyDispatchResult(result) {
    const status = String(result?.status || "").toUpperCase();
    const code = String(result?.error?.code || "").toUpperCase();
    // DUPLICATE_COMMAND replays the ORIGINAL successful receipt verbatim
    // (including its ok:true), so the duplicate check must run before the
    // ok check -- otherwise a same-commandId replay is misclassified as a
    // fresh "committed" rather than the already-committed event it is.
    if (status === "DUPLICATE_COMMAND" || code === "DUPLICATE_MESSAGE") return "duplicate";
    if (result.ok === true) return "committed";
    if (TRANSIENT_DISPATCH_STATUSES.has(status) || TRANSIENT_DISPATCH_STATUSES.has(code)) return "transient";
    return "blocked_terminal";
  }

  // Shared dispatcher behind every migrated step type's canonical commit: one
  // lease-acquire-then-dispatch-then-classify loop, so "how a blocked/transient
  // outcome is handled" is defined exactly once regardless of which command
  // type (message event, story variable, ...) a given step maps to.
  function dispatchCanonicalStep({ storyPath, contactId, commandType, commandId, payload, mode, stepType }) {
    const engine = window.GameStateEngine;
    if (!engine) return { ok: false, status: "blocked_terminal", reason: "ENGINE_UNAVAILABLE" };

    for (let attempt = 0; attempt < 2; attempt++) {
      const leaseId = ensureCanonicalStoryLease(storyPath, contactId);
      if (!leaseId) {
        recordMigrationAttempt(stepType, mode, "fallback", { story: storyPath, contactId, status: "LEASE_UNAVAILABLE" });
        return { ok: false, status: "blocked_retryable", reason: "LEASE_UNAVAILABLE" };
      }
      const state = engine.getGameplayState();
      const result = engine.dispatch({
        type: commandType,
        commandId,
        expectedRevision: state.revision,
        leaseId,
        payload
      });
      const cls = classifyDispatchResult(result);
      if (cls === "committed" || cls === "duplicate") {
        recordMigrationAttempt(stepType, mode, cls === "duplicate" ? "duplicate" : "committed", { story: storyPath, contactId, lease: leaseId });
        return { ok: true, status: cls, leaseId };
      }
      if (cls === "transient" && attempt === 0) continue;
      recordMigrationAttempt(stepType, mode, "fallback", { story: storyPath, contactId, lease: leaseId, status: result.status, error: result.error?.message });
      return { ok: false, status: "blocked_terminal", reason: result.status, error: result.error?.message };
    }
    return { ok: false, status: "blocked_terminal", reason: "RETRY_EXHAUSTED" };
  }

  // -------------------------
  // Canonical execution cursor (Group 1 authority cutover: GameStateEngine
  // must own cursor advancement). Every canonical Group 1 commit below now
  // threads a `cursor` payload computed from the SAME normalized story
  // representation StoryInterpreter and the static shadow harness use
  // (scripts/engine/story-position.js), read off each step's own __ifPath
  // (cloneStoryStepsWithMeta assigns this to every step, including ones
  // later spliced into a flat array by expandIfStepAt -- see its header
  // comment, and the spliced-in elements keep their ORIGINAL __ifPath from
  // when they were cloned as part of step.then/step.else) rather than the
  // flat, splice-mutated `i` this file's control flow still uses. This is
  // deliberately a read-only PARALLEL computation against storyJson.steps
  // (the pristine, never-spliced source passed to runSteps) -- it does not
  // participate in or change the existing i/steps control flow, only
  // mirrors the resulting position onto GameStateEngine.execution.cursor so
  // it is real, persisted, observable canonical state instead of existing
  // solely in this function's (or conversation.html's) local variables.
  // -------------------------
  const canonicalLabelIndexCache = new WeakMap();
  function canonicalLabelIndexFor(storyJson) {
    if (!window.StoryPosition || !storyJson) return { map: new Map(), duplicates: [] };
    let idx = canonicalLabelIndexCache.get(storyJson);
    if (!idx) {
      idx = window.StoryPosition.buildLabelIndex(Array.isArray(storyJson.steps) ? storyJson.steps : []);
      canonicalLabelIndexCache.set(storyJson, idx);
    }
    return idx;
  }
  function canonicalPositionOf(step) {
    if (!window.StoryPosition || !step) return null;
    // __ifPath: convo-runtime.js's own cloneStoryStepsWithMeta. ifPath: an
    // "if" entry from conversation.html's buildScriptFromStory. sourceStepKey:
    // every OTHER entry type from that same function (message/set_flag/...).
    // All three are the identical dot-path convention (see story-position.js).
    const path = step.__ifPath || step.ifPath || step.sourceStepKey;
    if (!path) return null;
    return window.StoryPosition.parsePath(path);
  }
  // Formatted-string form of canonicalPositionOf, directly comparable to
  // peekCurrentStep's own `path` field -- used as executeCanonicalProgressionStep's
  // targetPath so its catch-up loop knows exactly which step is "the real op"
  // versus backlog to silently resolve first.
  function canonicalPathKeyOf(step) {
    const pos = canonicalPositionOf(step);
    if (!pos || !window.StoryPosition) return null;
    return window.StoryPosition.formatPath(pos.rootIndex, pos.branchPath);
  }
  // opts.gotoLabel: resolve via label index (goto). opts.descendBranch:
  // "then"/"else" (if-branch selection). Neither set: plain sibling advance
  // (message/set_flag/label -> whatever comes next in document order).
  function canonicalNextPositionAfter(storyJson, step, opts = {}) {
    const pos = canonicalPositionOf(step);
    if (!pos || !window.StoryPosition) return null;
    const rawSteps = Array.isArray(storyJson?.steps) ? storyJson.steps : [];
    let target = null;
    if (opts.gotoLabel) {
      target = window.StoryPosition.resolveGotoTarget(rawSteps, canonicalLabelIndexFor(storyJson).map, opts.gotoLabel);
    } else if (opts.descendBranch) {
      const d = window.StoryPosition.descend(pos.rootIndex, pos.branchPath, opts.descendBranch);
      target = window.StoryPosition.normalize(rawSteps, d.rootIndex, d.branchPath);
    } else {
      const adv = window.StoryPosition.siblingAdvance(pos.rootIndex, pos.branchPath);
      target = window.StoryPosition.normalize(rawSteps, adv.rootIndex, adv.branchPath);
    }
    return target || { rootIndex: rawSteps.length, branchPath: [] };
  }
  function canonicalCursorPatch(storyPath, step, contactId, opType, nextTarget, extra = {}) {
    if (!nextTarget) return null;
    const normalizedPath = normalizeStoryPath(storyPath) || String(storyPath || "").trim();
    return {
      storyPath: normalizedPath,
      storyId: String(window.GameStateEngine?.getExecutionState?.()?.activeStoryId || stableStoryIdForPath(normalizedPath)),
      contactId: contactId || null,
      rootIndex: nextTarget.rootIndex,
      branchPath: nextTarget.branchPath,
      operationId: null,
      operationType: opType,
      branchReceiptId: null,
      gotoTarget: null,
      pendingUserIntent: null,
      pendingPresentationAck: null,
      phase: (opType === "label" || opType === "goto") ? "ready_to_advance" : "ready_to_interpret",
      completion: "in_progress",
      continuation: "none",
      leaseId: window.GameStateEngine?.getGameplayState()?.execution?.lease?.id || null,
      ...extra
    };
  }
  // Position-only canonical commit for label/goto -- these previously had
  // zero canonical footprint (pure local `i` jump). Reuses the same
  // dispatchCanonicalStep lease/retry/failure-classification contract as
  // every other migrated step type, so a blocked commit here is handled
  // identically (pause, not silently skipped).
  // Translates a canonical (root-level, branchPath-empty -- true of every
  // real label/goto target, see story-position.test.js's production-wide
  // scan) position into this run's OWN legacy `steps` array index, using
  // ONLY the stable __ifPath/sourceStepKey metadata every element already
  // carries (survives expandIfStepAt's splicing, which moves elements
  // around but never touches their own path). This is a metadata LOOKUP,
  // not a second "where does this label point" decision -- the interpreter
  // already made that decision; this only finds where its answer currently
  // lives in a possibly-already-partially-spliced local array, so
  // subsequent (not yet migrated) step types can keep reading `steps[i]`.
  function legacyIndexForCanonicalRoot(steps, rootIndex) {
    let firstDescendant = -1;
    for (let k = 0; k < steps.length; k++) {
      const raw = steps[k] && (steps[k].__ifPath || steps[k].ifPath);
      if (!raw) continue;
      const parsed = window.StoryPosition.parsePath(raw);
      if (parsed.rootIndex !== rootIndex) continue;
      if (parsed.branchPath.length === 0) return k;
      if (firstDescendant < 0) firstDescendant = k;
    }
    return firstDescendant >= 0 ? firstDescendant : steps.length;
  }

  // -------------------------
  // Canonical execution seam (Group 1: message/image/photo/media/set_flag/
  // if/label/goto -- Group 2: choice/choices/player_choice): StoryInterpreter,
  // via the shared canonical-story-runtime singleton, is the sole decision
  // authority for these types -- condition evaluation, branch/choice
  // selection, label/goto resolution, operation identity, and the next
  // canonical position. This function commits the operation atomically
  // (through GameStateEngine, as StoryInterpreter always does) and returns
  // its committed shape;
  //   progression request -> canonical-story-runtime -> StoryInterpreter ->
  //   normalized operation -> GameStateEngine atomic transaction ->
  //   committed presentation result -> renderer adapter (below).
  // Callers first check step.type against CANONICAL_SEAM_TYPES (via
  // peekCurrentStep) so an unmigrated type is never routed here -- this is
  // the ONE seam, not a second semantic switch duplicating StoryInterpreter's.
  // -------------------------
  // Types the interpreter can always resolve with an empty userIntent -- no
  // player input is meaningful for them (everything in CANONICAL_SEAM_TYPES
  // except choice/choices/player_choice/send_to_continue, which require a
  // real decision). A caller (either runtime) may reach this seam with the
  // canonical cursor genuinely lagging behind its OWN position by one or
  // more of these: conversation.html's if/label/goto handling still advances
  // its own `index` outside this seam, and its if-branch materialization
  // pipeline (materializeIfBranchesUpTo/materializeAtPlaybackPointer) renders
  // message/image bubbles synchronously, ahead of this seam, for the same
  // reason. Silently catching the canonical cursor up through ALL of them
  // FIRST is what makes that safe: without it, the real operation below
  // would run against whatever stale step the cursor happened to be stuck on
  // and report success for the WRONG step (measured live repeatedly: a
  // message rendered with no matching commit because the "successful" commit
  // underneath it was actually a goto's; an image never canonically
  // committed at all because the "successful" commit underneath it was
  // actually an unrelated, already-displayed message's; an image permanently
  // unreachable because a "note" step -- a system bubble conversation.html
  // still renders on its own unmigrated path -- sat in front of it).
  // Production stories freely interleave dozens of step types StoryInterpreter
  // already fully implements (note, wait/delay, notify, route_lock,
  // reward/points, app-unlock steps, every VISUAL_EFFECTS type -- see
  // story-interpreter.js's processOne switch) but this file's OWN renderers
  // don't route through this seam for yet -- an ALLOWLIST here has to be kept
  // in lockstep with that switch or it silently reintroduces this exact bug
  // for the next unmigrated type a real story happens to place in front of a
  // migrated one (measured: this already happened three times as new content
  // was walked). A DENYLIST of the types that genuinely need real player
  // input (a choice, or send_to_continue's `continue`) or that transition to
  // a DIFFERENT story entirely (start_story/time_card -- a boundary this
  // catch-up loop must never silently cross, since it exists to reach a
  // target position within the CURRENT story) is what the interpreter can
  // actually resolve with `{}`, matches how broad its switch already is, and
  // stays correct as that switch grows without this loop needing a matching
  // edit. A genuinely unsupported/typo'd type still can't crash this loop --
  // interpreter.process throws UNSUPPORTED_STEP synchronously, caught below.
  const MAX_CONTROL_FLOW_CATCHUP_STEPS = 50;
  // targetPath: the caller's OWN canonical position (canonicalPathKeyOf(step),
  // formatted the same way peekCurrentStep's `path` is), when known. Every
  // type in CONTROL_FLOW_CATCHUP_TYPES is also a type callers legitimately
  // want to BE "the real op" (not just backlog to skip past) -- message and
  // image steps are committed by addBubble/addPhotoBubble the same way if/
  // label/goto steps are committed by their own call sites. Without a target
  // to stop at, the catch-up loop cannot tell "this step is backlog" from
  // "this step is what the caller is asking to commit right now" and would
  // keep consuming forward past it, returning a result for whatever step it
  // happened to stop on next -- the exact same phantom-success shape this
  // loop exists to prevent, just shifted by one. When targetPath is omitted
  // (a caller with no step-level position, e.g. the legacy compat surface),
  // catch-up still runs but can only stop on a non-catchup type or `complete`.
  // A rejection whose ONLY problem is "this exact event already exists" --
  // DUPLICATE_MESSAGE/DUPLICATE_EFFECT/DUPLICATE_NOTIFICATION (domain-level,
  // keyed by content, thrown when a different commandId reaches the SAME
  // eventId) or DUPLICATE_COMMAND (engine-level, an identical retry) -- is
  // not a failure: the canonical domain already has exactly the record this
  // call wanted to produce. Every caller of executeCanonicalProgressionStep
  // (addBubble's commit-before-render, the choice handler, Group 5's
  // hak_*/onlyfun_*/instagram_*/gallery_add handlers, ...) needs this
  // normalized to ok:true, or a step the background walker already
  // committed once silently blocks the SAME step's interactive re-render
  // (a real, previously-latent gap this seam has had since message/if/goto
  // were first migrated -- normalizing it here fixes it for every caller at
  // once instead of requiring each one to special-case duplicate codes the
  // way the older, separate dispatchCanonicalStep/classifyDispatchResult
  // pair already did for its own callers).
  const CANONICAL_SEMANTIC_DUPLICATE_STATUSES = new Set(["DUPLICATE_COMMAND", "DUPLICATE_MESSAGE", "DUPLICATE_EFFECT", "DUPLICATE_NOTIFICATION", "DUPLICATE_CONTINUATION"]);
  function normalizeDuplicateResult(result) {
    if (!result || result.ok === true) return result;
    return isCanonicalSemanticDuplicate(result) ? { ...result, ok: true } : result;
  }

  function isCanonicalSemanticDuplicate(result) {
    const status = String(result?.status || "").toUpperCase();
    const code = String(result?.error?.code || "").toUpperCase();
    const duplicateStatus = CANONICAL_SEMANTIC_DUPLICATE_STATUSES.has(status) || CANONICAL_SEMANTIC_DUPLICATE_STATUSES.has(code);
    return duplicateStatus && result?.semanticDuplicateEvidence?.verified === true;
  }

  // Catch-up only ever walks FORWARD from the current canonical cursor to
  // targetPath. If a caller asks to commit a step the cursor has already
  // moved past (the background walker committed it while this exact
  // conversation wasn't open, and the interactive renderer is now replaying
  // it purely for display), catch-up can never reach targetPath by walking
  // forward -- it just keeps re-processing whatever step the cursor is
  // CURRENTLY at (e.g. a later choice) with an empty userIntent, forever
  // returning INPUT_REQUIRED, and the caller (addBubble's commit-before-
  // render gate) never renders anything past that point. Progression is
  // monotonic (the cursor only ever advances), so "target's root index is
  // behind the cursor's" is a sufficient, cheap proof the step was already
  // committed -- short-circuit to success rather than entering catch-up at
  // all. This is a pre-existing gap in the shared canonical seam (every
  // migrated step type since message/if/goto go through this same
  // function), not specific to any one caller; fixing it here fixes it for
  // all of them at once.
  function targetAlreadyBehindCursor(engine, targetPath) {
    if (!targetPath || !window.StoryPosition?.parsePath) return false;
    try {
      const cursor = engine.getExecutionState()?.cursor;
      if (!cursor || !Number.isFinite(cursor.rootIndex)) return false;
      const target = window.StoryPosition.parsePath(targetPath);
      if (!target || !Number.isFinite(target.rootIndex)) return false;
      if (typeof window.StoryPosition.comparePosition === "function") {
        return window.StoryPosition.comparePosition(
          target.rootIndex,
          target.branchPath || [],
          cursor.rootIndex,
          cursor.branchPath || []
        ) < 0;
      }
      return target.rootIndex < cursor.rootIndex;
    } catch {
      return false;
    }
  }

  async function executeCanonicalProgressionStep({ storyPath, contactId, userIntent = {}, mode = "background", targetPath = null, allowReclaim = false, maxVisibleCatchUp = null }) {
    const runtime = window.CanonicalStoryRuntime;
    const engine = window.GameStateEngine;
    if (!runtime || !engine) return { handled: false, reason: "RUNTIME_UNAVAILABLE" };
    const leaseId = ensureCanonicalStoryLease(storyPath, contactId, allowReclaim);
    if (!leaseId) return { handled: false, reason: "LEASE_UNAVAILABLE" };
    const interpreter = runtime.get();
    const attemptLifecycle = engine.getRuntimeLifecycleIdentity();
    const attemptRunId = Number(window.Game?._storyRunId || 0);
    let attemptExecution = null;
    // See targetAlreadyBehindCursor's own comment just below this function --
    // this call was written but never wired in (found live, Feature 4 Day1-15
    // final certification, Message cutover family: a background-committed
    // message step, re-visited by the interactive renderer purely for
    // display, made the catch-up loop below spin on the SAME later step
    // forever with an empty userIntent, so addBubble's commit-before-render
    // gate never rendered it -- confirmed via a live repro showing exactly 3
    // background-committed messages canonically present but never painted
    // until a full remount rebuilt the DOM from scratch). Progression is
    // monotonic, so this is a cheap, safe short-circuit, not a guess.
    if (targetAlreadyBehindCursor(engine, targetPath)) {
      return { handled: true, complete: false, alreadyCommitted: true, path: targetPath, cursor: engine.getExecutionState().cursor };
    }
    // caughtUpSteps: every ordinary step this call silently committed while
    // walking toward targetPath (or toward whatever it eventually stopped
    // at, if targetPath was absent/unresolvable). Purely additive -- every
    // return path below already existed; this only appends one new field
    // to each, so none of this seam's ~15 existing callers (none of which
    // read it) change behavior. Exists so an interactive caller whose OWN
    // step never got its own commit-before-render pass (found live, Feature
    // 4 Day1-15 final certification, Message cutover family: steps that
    // committed here as backlog, not as any caller's own explicit target,
    // previously vanished from the live view until a full remount) can
    // still render each one itself.
    // One cursor-driven reconciliation walk. Migration groups are diagnostics,
    // never execution boundaries: every operation is offered to the single
    // StoryInterpreter. The walk stops only at the caller's requested target,
    // story completion, or a real persisted player-input boundary.
    const caughtUpSteps = [];
    const reconciliationTrace = [];
    const visitedPositions = new Set();
    const cursorKey = (cursor) => JSON.stringify({ storyPath: cursor?.storyPath || null, leaseId: cursor?.leaseId || null, rootIndex: Number(cursor?.rootIndex) || 0, branchPath: cursor?.branchPath || [] });
    for (let guard = 0; guard < MAX_CONTROL_FLOW_CATCHUP_STEPS; guard++) {
      const iterationStartedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
      const before = { execution: engine.getExecutionState() };
      attemptExecution ||= before.execution;
      const peek = await interpreter.peekCurrentStep(before);
      if (peek.complete) return { handled: true, complete: true, peek, caughtUpSteps, cursor: before.execution.cursor, reconciliationTrace };

      const semanticPosition = `${before.execution.activeStoryPath || ""}|${before.execution.lease?.id || ""}|${peek.path}|${peek.type}`;
      if (visitedPositions.has(semanticPosition)) {
        return { handled: false, reason: "RECONCILIATION_POSITION_CYCLE", catchUpType: peek.type, caughtUpSteps, cursor: before.execution.cursor, reconciliationTrace };
      }
      visitedPositions.add(semanticPosition);

      const atTarget = !targetPath || peek.path === targetPath;
      let result;
      try {
        result = normalizeDuplicateResult(await interpreter.process({ ...(atTarget ? userIntent : {}), presentationMode: mode }));
      } catch (err) {
        return { handled: false, reason: "UNSUPPORTED_CANONICAL_STEP", catchUpType: peek.type, error: String(err && err.message || err), caughtUpSteps };
      }
      const isInputBoundary = result && (result.status === "INPUT_REQUIRED" || result.status === "CONTINUE_REQUIRED" || result.status === "INVALID_CHOICE");
      let after = { execution: engine.getExecutionState() };
      let receiptCursorRepair = null;
      // Any semantic duplicate means the domain receipt already exists. This
      // includes engine command retries AND domain-keyed duplicates such as a
      // notification committed earlier under another command id. If that
      // duplicate left the cursor behind, repair only the cursor using the
      // interpreter's intended next position; never replay the domain effect.
      // Without this shared repair a duplicate notification immediately before
      // a choice reports ok:true but makes no progress, so reconciliation exits
      // before installing pendingUserIntent and leaves visible stale buttons.
      if (!isInputBoundary && isCanonicalSemanticDuplicate(result) && cursorKey(after.execution.cursor) === cursorKey(before.execution.cursor) && result.intendedCursor && cursorKey(result.intendedCursor) !== cursorKey(before.execution.cursor)) {
        receiptCursorRepair = engine.reconcileSemanticDuplicate(
          result.semanticDuplicateCommand,
          result,
          result.intendedCursor,
          result.intendedNextStepIndex
        );
        after = { execution: engine.getExecutionState() };
      }
      recordMigrationAttempt(peek.type, mode, result.ok ? (result.status === "DUPLICATE_COMMAND" ? "duplicate" : "committed") : (isInputBoundary ? "input_boundary" : "fallback"), { story: storyPath, contactId, lease: leaseId, status: result.status, error: result.error?.message });

      const traceRow = {
        iteration: guard + 1,
        cursorBefore: before.execution.cursor,
        sourceStep: peek.path,
        normalizedType: peek.type,
        operationId: result?.intendedCursor?.operationId || null,
        operationResult: result?.status || null,
        receiptAlreadyExists: isCanonicalSemanticDuplicate(result),
        receiptCursorRepair: receiptCursorRepair?.status || null,
        cursorAfter: after.execution.cursor,
        visiblePresentationEmitted: !!((result?.events || []).find((event) => event?.type === "conversation:event-committed" || event?.type === "story:effect-committed")),
        playerBoundary: isInputBoundary,
        continuation: after.execution.cursor?.continuation || null,
        elapsedMs: (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - iterationStartedAt
      };
      reconciliationTrace.push(traceRow);
      try { const rows = window.__feature4ReconciliationTrace ||= []; rows.push(traceRow); if (rows.length > 500) rows.splice(0, rows.length - 500); } catch {}

      if (atTarget || isInputBoundary) {
        const outcome = { handled: true, complete: false, type: peek.type, step: peek.step, path: peek.path, result, cursor: after.execution.cursor, caughtUpSteps, inputBoundary: isInputBoundary, reconciliationTrace };
        if (!result.ok) {
          // The peek can describe an earlier step while an awaited process
          // encounters an input boundary already reached by the foreground.
          // Keep its actual post-process cursor and owner, not the old peek,
          // as the proof used by the background failure handler below.
          const boundaryCursor = JSON.stringify(after.execution.cursor || null);
          const boundaryStatus = String(result.status || "");
          const cursor = after.execution.cursor, intent = cursor?.pendingUserIntent;
          const required = (result.events || []).find(event => event.type ===
            (boundaryStatus === "CONTINUE_REQUIRED" ? "story:continue-required" : "story:choice-required"));
          const position = cursor && window.StoryPosition?.formatPath(cursor.rootIndex, cursor.branchPath || []);
          const pendingPresentation = cursor?.pendingPresentationAck;
          const presentationBoundary = boundaryStatus === "PRESENTATION_REQUIRED" &&
            pendingPresentation?.kind === "hak_overlay" && !!pendingPresentation.operationId &&
            pendingPresentation.operationId === cursor.operationId &&
            ["hak_overlay", "hak_unlock"].includes(cursor.operationType) &&
            cursor.phase === "waiting_for_presentation";
          const boundaryVerified = presentationBoundary || !!required &&
            Number(required.stepIndex) === Number(cursor?.rootIndex) &&
            (boundaryStatus === "CONTINUE_REQUIRED" && String(required.path || "") === position &&
              cursor.operationType === "send_to_continue" && intent?.kind === "continue" ||
              boundaryStatus === "INPUT_REQUIRED" && cursor.operationType === "choice" && intent?.kind === "choice" &&
              String(required.storyId || "") === String(after.execution.activeStoryId || "") &&
              String(required.contactId || "") === String(after.execution.activeContactId || "") &&
              intent.selectionOpen === true && intent.sourceStepKey === position &&
              String(intent.choiceGroupId || "") === String(required.choiceGroupId || "") &&
              JSON.stringify(intent.options) === JSON.stringify(required.options));
          Object.defineProperty(outcome, "canonicalFailureOwnership", { value: () => {
            const currentEngine = window.GameStateEngine;
            if (currentEngine !== engine) return { current: false };
            const current = engine.getExecutionState();
            const lifecycle = engine.getRuntimeLifecycleIdentity();
            const currentOwner = JSON.stringify(lifecycle) === JSON.stringify(attemptLifecycle) &&
              Number(window.Game?._storyRunId || 0) === attemptRunId &&
              String(current.lease?.id || "") === String(leaseId) &&
              Number(current.lease?.generation || 0) === Number(attemptExecution.lease?.generation || 0) &&
              Number(current.generation || 0) === Number(attemptExecution.generation || 0) &&
              storyPathsEqual(current.activeStoryPath, attemptExecution.activeStoryPath) &&
              storyPathsEqual(current.activeStoryPath, storyPath) &&
              String(current.activeContactId || "") === String(attemptExecution.activeContactId || "");
            return { current: currentOwner, execution: current, runId: attemptRunId,
              status: boundaryStatus, inputBoundary: isInputBoundary, presentationBoundary,
              boundaryVerified,
              sameBoundary: JSON.stringify(current.cursor || null) === boundaryCursor };
          } });
        }
        return outcome;
      }
      if (!result.ok) return { handled: false, reason: "CATCHUP_BLOCKED", catchUpType: peek.type, result, caughtUpSteps };
      if (cursorKey(after.execution.cursor) === cursorKey(before.execution.cursor)) {
        return { handled: false, reason: "RECONCILIATION_NO_PROGRESS", catchUpType: peek.type, result, caughtUpSteps, cursor: after.execution.cursor, reconciliationTrace };
      }

      const committedEvent = (result.events || []).find((e) => e.type === "conversation:event-committed") || null;
      caughtUpSteps.push({ type: peek.type, step: peek.step, path: peek.path, event: committedEvent, result });
      // Interactive presentation backpressure. A mounted conversation must
      // never let semantic reconciliation run arbitrarily far ahead of what
      // the player can actually see. The caller renders/paints this bounded
      // slice, then retries the SAME target. Background walkers deliberately
      // keep the old unbounded behavior because they own no visible DOM.
      const visibleCatchUpLimit = Number(maxVisibleCatchUp);
      const visibleCatchUpCount = caughtUpSteps.reduce((count, caught) => count + ((caught?.type === "message" || (["note", "image", "photo", "media"].includes(caught?.type) && caught.event?.eventId)) ? 1 : 0), 0);
      if (mode === "interactive" && targetPath && Number.isFinite(visibleCatchUpLimit) && visibleCatchUpLimit > 0 && visibleCatchUpCount >= visibleCatchUpLimit) {
        return {
          handled: false,
          deferredTarget: true,
          reason: "PRESENTATION_BACKPRESSURE",
          caughtUpSteps,
          cursor: after.execution.cursor,
          reconciliationTrace
        };
      }
      // A stale save can legitimately require many cursor-only receipt
      // repairs. Preserve strict semantic ordering, but yield after each
      // small chunk so Electron can paint and service its renderer loop. The
      // ordinary aligned path (one target operation, occasionally one extra)
      // never reaches this branch.
      if (caughtUpSteps.length % 4 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    return { handled: false, reason: "RECONCILIATION_SAFETY_LIMIT", caughtUpSteps, cursor: engine.getExecutionState().cursor, reconciliationTrace };
  }

  function commitCanonicalCursorStep({ storyPath, contactId, eventId, cursor, mode = "background", stepType }) {
    if (!eventId || !cursor) return { ok: false, status: "blocked_terminal", reason: "ENGINE_OR_EVENT_UNAVAILABLE" };
    const engine = window.GameStateEngine;
    const execution = engine?.getExecutionState?.();
    const capturedLeaseId = String(cursor.leaseId || "");
    if (!execution?.lease || !capturedLeaseId || capturedLeaseId !== String(execution.lease.id) ||
      !storyPathsEqual(execution.activeStoryPath, storyPath) ||
      String(execution.activeContactId || "") !== String(contactId || "")) {
      return { ok: false, status: "blocked_terminal", reason: "CURSOR_OWNER_RETIRED" };
    }
    // A local path such as if:33 repeats in unrelated stories. Capture the
    // owning lease, and never acquire another lease for an expired callback.
    const result = engine.dispatch({
      type: "COMMIT_STORY_STEP",
      commandId: `commit-cursor:${capturedLeaseId}:${normalizeStoryPath(storyPath)}:${eventId}`,
      expectedRevision: engine.getRevision(),
      leaseId: capturedLeaseId,
      payload: { eventId, cursor }
    });
    const outcome = classifyDispatchResult(result);
    recordMigrationAttempt(stepType, mode, outcome, { story: storyPath, contactId, status: result.status });
    return { ok: result.ok === true, status: outcome, result };
  }
  // Canonical blocked state (goto-loop budget exceeded, etc.) -- records
  // into GameStateEngine.execution.blocked (persisted, survives save/load
  // and relaunch) in ADDITION to this file's existing pending_story_v1-based
  // pause/resume mechanism, which remains the actual recovery path for now.
  // Best-effort: a failure here must never prevent the existing pause from
  // happening, so callers do not gate on this result.
  function recordCanonicalBlockedState({ storyPath, contactId, code, retryable = false, recoveryPolicy = "manual", detail = {}, mode = "background" }) {
    const engine = window.GameStateEngine;
    if (!engine) return { ok: false, status: "blocked_terminal", reason: "ENGINE_UNAVAILABLE" };
    const leaseId = ensureCanonicalStoryLease(storyPath, contactId);
    if (!leaseId) return { ok: false, status: "blocked_retryable", reason: "LEASE_UNAVAILABLE" };
    const state = engine.getGameplayState();
    const result = engine.dispatch({
      type: "RECORD_BLOCKED_STATE",
      commandId: `record-blocked:${leaseId}:${String(code || "BLOCKED")}`,
      expectedRevision: state.revision,
      leaseId,
      payload: { code, retryable, recoveryPolicy, detail }
    });
    return result;
  }

  function commitCanonicalMessage({ storyPath, contactId, from, text, kind, assetId, link, eventId, mode = "background", stepType = "message", cursor = null }) {
    if (!eventId) return { ok: false, status: "blocked_terminal", reason: "ENGINE_OR_EVENT_UNAVAILABLE" };
    // DUPLICATE_COMMAND (same commandId retried, e.g. cross-mode re-render) and
    // DUPLICATE_MESSAGE (same eventId under a different commandId) both mean the
    // canonical engine already owns this event -- that is success, not a reason
    // to fall back to a second, legacy-side write of the same message.
    return dispatchCanonicalStep({
      storyPath, contactId, mode, stepType,
      commandType: "COMMIT_MESSAGE_EVENT",
      commandId: `commit-message:${eventId}`,
      payload: { contactId, from, text, kind, assetId, link: link || null, eventId, cursor: cursor || undefined }
    });
  }

  // Canonical bridge for set_flag: the production read side (evalIfConditionExpr's
  // generic, non-once/non-choice fallback -- see the audit comment above it)
  // treats these as a plain mutable key/value store, distinct from onceKeys
  // (one-time boolean receipts) and world.choices (choice-step selections).
  // SET_STORY_VARIABLE is that domain. eventId here is the deterministic
  // per-step id (see makeRuntimeEventId/makeConversationStepEventId callers)
  // so a duplicate application of the same step is recognized the same way a
  // duplicate message commit is, not reapplied.
  function commitCanonicalVariable({ storyPath, contactId, key, value, remove = false, eventId, mode = "background", stepType = "set_flag", cursor = null }) {
    if (!eventId || !key) return { ok: false, status: "blocked_terminal", reason: "ENGINE_OR_EVENT_UNAVAILABLE" };
    return dispatchCanonicalStep({
      storyPath, contactId, mode, stepType,
      commandType: "SET_STORY_VARIABLE",
      commandId: `set-variable:${eventId}`,
      payload: { key, value, remove: !!remove, cursor: cursor || undefined }
    });
  }

  // Canonical bridge for if-branch decisions (StoryInterpreter cutover,
  // control-flow group). The ONLY place a branch decision is recorded --
  // both convo-runtime.js's own resolveIfStepDecision and conversation.html's
  // (structurally duplicate) resolveIfDecision call this instead of each
  // dispatching RECORD_BRANCH_DECISION independently, so branchId
  // construction, lease handling and failure classification exist in one
  // place, not two. branchId must be built identically by every caller
  // (storyToken|sourceStepKey|condition, see makeBranchDecisionId) so a
  // background pass and an interactive pass for the same story position
  // resolve to the same receipt instead of racing to create two.
  function commitCanonicalBranchDecision({ storyPath, contactId, branchId, sourceStepKey, condition, result, mode = "background", cursor = null }) {
    if (!branchId) return { ok: false, status: "blocked_terminal", reason: "ENGINE_OR_EVENT_UNAVAILABLE" };
    return dispatchCanonicalStep({
      storyPath, contactId, mode, stepType: "if",
      commandType: "RECORD_BRANCH_DECISION",
      commandId: `record-branch:${branchId}`,
      payload: { branchId, sourceStepKey, condition, result: !!result, cursor: cursor || undefined }
    });
  }

  // -------------------------
  // Caller-side bounded recovery for a blocked (not committed, not duplicate)
  // canonical message/media commit. The one invariant every migrated step
  // type must uphold: a failed commit NEVER advances the legacy step index
  // and never lets the renderer treat the step as delivered. What varies is
  // only whether it's worth automatically retrying:
  //   blocked_retryable -> a competing lease may free up shortly (the story
  //     holding it finishes and canonically releases it) -- pause at this
  //     exact step and schedule a small, strictly bounded number of retries.
  //   blocked_terminal  -> retrying cannot change the outcome -- pause at
  //     this exact step (so nothing is silently skipped and the position is
  //     recoverable) but do not keep re-attempting automatically.
  // Both cases leave the step unresolved rather than fabricating progress;
  // neither renders anything, since the bridge only reacts to a genuinely
  // committed event.
  // -------------------------
  const MAX_CANONICAL_COMMIT_RETRIES = 5;
  const CANONICAL_COMMIT_RETRY_DELAY_MS = 220;
  const canonicalCommitRetryCounts = new Map();

  // Group 5 (external-subsystem exactly-once adapters): a COMMIT_STORY_EFFECT
  // rejection is "this step already ran" (DUPLICATE_COMMAND -- identical
  // retry under the same commandId; DUPLICATE_EFFECT -- the effectReceipts
  // ledger already has this eventId under a different commandId), not a
  // genuine failure. Callers use this to gate the external write itself:
  // run it once on a real commit, skip it (without pausing) on either
  // duplicate shape, and only treat anything else as blocked_terminal.
  function isDuplicateCanonicalExec(exec) {
    const status = String(exec?.result?.status || "").toUpperCase();
    const code = String(exec?.result?.error?.code || "").toUpperCase();
    return exec?.alreadyCommitted === true || status === "DUPLICATE_COMMAND" || code === "DUPLICATE_EFFECT";
  }

  function pauseForCanonicalCommitFailure(Game, storyPath, contactId, i, opts, runId, eventId, commitResult) {
    const canonical = commitResult?.canonicalResult;
    const ownership = canonical?.canonicalFailureOwnership?.();
    // A retired asynchronous caller must not replace the new owner's pending
    // record with an obsolete failure. Results without a seam proof retain
    // the existing failure behavior.
    if (ownership && (!ownership.current || Number(runId || 0) !== ownership.runId)) return;
    if (ownership?.current && ownership.sameBoundary && ownership.boundaryVerified &&
        ownership.status === String(commitResult.reason || "")) {
      const execution = ownership.execution, intent = execution.cursor?.pendingUserIntent;
      const normalInput = ownership.status === "CONTINUE_REQUIRED" && intent?.kind === "continue" ||
        ownership.status === "INPUT_REQUIRED" && intent?.kind === "choice" && intent.selectionOpen === true;
      // The foreground can commit a HAK notice while this background caller
      // is awaiting its peek. Its durable END acknowledgement is normal
      // presentation backpressure, owned by the current conversation runner.
      const normalPresentation = ownership.presentationBoundary &&
        ownership.status === "PRESENTATION_REQUIRED";
      const presenter = Game.getConversationRunnerOwner?.();
      if ((normalInput && ownership.inputBoundary && execution.cursor?.phase === "waiting_for_user_intent" ||
          normalPresentation && execution.cursor?.phase === "waiting_for_presentation") && !execution.blocked &&
          isConversationSceneOpenFor(contactId) && presenter &&
          storyPathsEqual(presenter.storyPath, storyPath) &&
          String(presenter.contactId || "") === String(execution.activeContactId || "") &&
          String(presenter.leaseId || "") === String(execution.lease?.id || "") &&
          Number(presenter.generation || 0) === Number(execution.generation || 0) &&
          Number(presenter.operationEpoch || 0) === Number(execution.operationEpoch || 0) &&
          Number(presenter.runId || 0) === ownership.runId) return;
    }
    const attempts = (canonicalCommitRetryCounts.get(eventId) || 0) + 1;
    canonicalCommitRetryCounts.set(eventId, attempts);
    if (canonicalCommitRetryCounts.size > 500) {
      const oldestKey = canonicalCommitRetryCounts.keys().next().value;
      canonicalCommitRetryCounts.delete(oldestKey);
    }
    const willRetry = commitResult.status === "blocked_retryable" && attempts <= MAX_CANONICAL_COMMIT_RETRIES;
    try {
      console.error("[Feature4][commit-contract] canonical commit blocked, story paused (not advanced) " + JSON.stringify({
        storyPath, contactId, stepIndex: i, eventId, status: commitResult.status, reason: commitResult.reason, attempts, willRetry,
        execution: window.GameStateEngine?.getExecutionState?.(), pending: window.GameStateEngine?.getPendingStory?.()
      }));
    } catch {}
    pause(Game, storyPath, contactId, i, opts, "canonical_commit_failed", { runId });
    if (willRetry) {
      schedulePendingRetry("canonical_commit_failed_retry", CANONICAL_COMMIT_RETRY_DELAY_MS);
    } else {
      canonicalCommitRetryCounts.delete(eventId);
    }
  }

  // -------------------------
  // Canonical story-completion bridge.
  //
  // Lease lifecycle audit finding: ensureCanonicalStoryLease's stale-lease
  // reclamation (above) is a *reactive* safety net -- it only notices an
  // abandoned lease when the *next* story's first message tries to commit.
  // The canonical engine already has a purpose-built completion authority
  // (COMPLETE_STORY -> releaseLease/continuation in GameStateEngine), so the
  // correct owner for "release this lease" is the moment completion is
  // actually known, not the moment something downstream trips over its
  // absence. Every legacy chokepoint that decides a story's step-walk is
  // truly done (background runSteps and the conversation scene) calls this
  // so the canonical side hears about completion directly. This does not yet
  // thread the resolved next story into COMPLETE_STORY's `continuation`
  // payload (the legacy chain-target resolution is scattered across several
  // step-type handlers and step queuing paths) -- it dispatches a plain
  // completion, which canonically releases the lease immediately. The next
  // story then acquires a fresh lease through the normal (no pre-existing
  // lease) branch of ensureCanonicalStoryLease, with the stale-reclaim branch
  // left in place only as a fallback for completions this bridge cannot see
  // (e.g. a return path added later that forgets to call it).
  // -------------------------
  // Group 3 (continuation): resolves the canonical contactId for a chain
  // target. knownContactId is an ALREADY-CERTAIN target (e.g. an
  // outbound_task step names its own contact explicitly) and always wins.
  //
  // Otherwise the target story's OWN authored `contactId` field (read by
  // actually loading it, exactly like the canonical StoryInterpreter's own
  // targetDescriptor()) is the next source of truth -- NOT a filename guess.
  // Root cause of a real, live, permanent "chat no longer progresses" stall
  // (confirmed via story/DAY2/DAY2_10_MASON_REPLY.json -> DAY2_11_DINNER_SETUP.json,
  // mason -> evelyn): the previous version resolved the target's owner
  // WITHOUT ever reading the target JSON, relying only on
  // StoryInterpreter.prototype.ownerFromPath's filename regex
  // (`_evelyn_`/`_mason_`/etc.) which only matches when a character token
  // literally appears in the filename -- untrue for plenty of real content
  // (scene-titled files like DINNER_SETUP, HAK_BOOT, LANDLADY_INTRO, ...).
  // When that regex missed, it silently fell back to fallbackContactId --
  // the COMPLETING (previous) story's contact -- so execution.activeContactId
  // was committed as the WRONG owner. canonicalActiveOwnerConflict() then
  // permanently self-paused the very first step of the correctly-loaded next
  // story (its real owner disagreeing with the wrongly-committed canonical
  // owner), with no retry trigger ever able to clear it: a silent, total
  // progression deadlock. This is a general contract bug, not a Mason/Day2
  // special case -- every onCompleteStartStory/start_story/time_card/next_day
  // chain whose target's filename doesn't encode its owning character was
  // equally exposed. Filename heuristic and same-contact fallback remain as
  // best-effort safety nets only for the (now rare) case the target JSON
  // itself cannot be loaded. Best-effort: null is a legitimate "don't know
  // yet" result callers must tolerate.
  function resolveCanonicalRouteStoryPath(nextPath) {
    const normalized = normalizeStoryPath(nextPath) || String(nextPath || "").trim();
    if (!normalized) return normalized;
    try {
      const InterpreterClass = window.StoryInterpreter;
      const state = window.GameStateEngine?.getStoryDecisionState?.() || window.GameStateEngine?.getState?.() || window.GameStateEngine?.getGameplayState?.();
      if (state && InterpreterClass && typeof InterpreterClass.prototype.routeStoryPath === "function") {
        return normalizeStoryPath(InterpreterClass.prototype.routeStoryPath.call(InterpreterClass.prototype, normalized, state)) || normalized;
      }
    } catch {}
    return normalized;
  }

  async function resolveContinuationTarget(nextPath, fallbackContactId, knownContactId = null) {
    // Route folders belong to the TARGET owner, never to the story that is
    // handing off. The canonical interpreter already enforces this for its
    // own commands through routeStoryPath(); legacy interactive completion
    // must use that exact same resolver before loading/queuing the target.
    // Without it, Evelyn NTS Day 12 authored a Mason NTS Day 13 path even
    // when Mason's canonical route was LOVE, producing a retrying INVALID_
    // ROUTE dispatch instead of the next story.
    const normalized = resolveCanonicalRouteStoryPath(nextPath);
    if (!normalized) return null;
    const targetStoryId = stableStoryIdForPath(normalized);
    let targetOnceKey = "";
    let requirements = {};
    let contactId = String(knownContactId || "").trim().toLowerCase() || null;
    if (NON_CONTACT_ACTOR_IDS.has(String(contactId || ""))) contactId = null;
    {
      try {
        const targetJson = await loadJson(normalized);
        targetOnceKey = String(targetJson?.onceKey || "").trim();
        requirements = Object.fromEntries(["requireOnceKey", "requireCondition", "requireWatched", "requireWatchedAny", "requireWatchedKey"].filter(key => targetJson?.[key] != null).map(key => [key, targetJson[key]]));
        // A loaded control-only story has no conversation owner. Carry its
        // global lease identity through completion instead of inheriting the
        // previous speaker and reclaiming that lease when the target starts.
        if (!contactId) contactId = getStoryOwnerId(targetJson, {
          storyPath: normalized,
          contactId: targetJson?.owner || ""
        }) || GLOBAL_STORY_LEASE_CONTACT_ID;
      } catch {}
    }
    if (!contactId) {
      try {
        const InterpreterClass = window.StoryInterpreter;
        if (InterpreterClass && typeof InterpreterClass.prototype.ownerFromPath === "function") {
          contactId = InterpreterClass.prototype.ownerFromPath(normalized);
        }
      } catch {}
    }
    if (!contactId) contactId = String(fallbackContactId || "").trim().toLowerCase() || null;
    return { targetStoryId, targetStoryPath: normalized, targetOnceKey, requirements, contactId };
  }

  // Synchronous best-effort variant for the rare call site that cannot await
  // (resumePendingResume's display-only "which thread to switch to" nav
  // heuristic, invoked from Game.resumePendingStory's synchronous boolean
  // contract). Never used to decide canonical ownership/state -- only which
  // conversation thread the UI opens while an already-recorded pending story
  // (which already carries its own real contactId in the common case) is
  // being resumed.
  function resolveContinuationTargetSync(nextPath, fallbackContactId, knownContactId = null) {
    const normalized = resolveCanonicalRouteStoryPath(nextPath);
    if (!normalized) return null;
    const targetStoryId = stableStoryIdForPath(normalized);
    let contactId = String(knownContactId || "").trim().toLowerCase() || null;
    if (NON_CONTACT_ACTOR_IDS.has(String(contactId || ""))) contactId = null;
    if (!contactId) {
      try {
        const InterpreterClass = window.StoryInterpreter;
        if (InterpreterClass && typeof InterpreterClass.prototype.ownerFromPath === "function") {
          contactId = InterpreterClass.prototype.ownerFromPath(normalized);
        }
      } catch {}
    }
    if (!contactId) contactId = String(fallbackContactId || "").trim().toLowerCase() || null;
    return { targetStoryId, targetStoryPath: normalized, contactId };
  }

  function completeCanonicalStory(storyPath, contactId, onceKey, continuation = null, completedDay = 0, timeCard = null) {
    const engine = window.GameStateEngine;
    if (!engine) return false;
    const normalizedPath = normalizeStoryPath(storyPath) || String(storyPath || "").trim();
    const state = engine.getGameplayState();
    const exec = state.execution;
    if (!exec.lease || exec.activeStoryPath !== normalizedPath || (contactId && exec.activeContactId !== contactId)) {
      // This runner never held the canonical lease for this exact story (it
      // may never have committed a canonical step), or the lease already
      // moved on -- nothing for canonical completion to do here.
      return false;
    }
    // continuation, when given, must be resolved by the CALLER (see
    // resolveContinuationTarget) and passed in already-shaped -- continuation
    // identity (ACTIVATE_CONTINUATION's receipt/sourceStoryId) is derived
    // from execution.activeStoryId at the moment of THIS dispatch, so it can
    // only be correct while this exact lease/story is still active, never as
    // a separate later call once the lease has already been released.
    const payload = { storyId: exec.activeStoryId, onceKey: onceKey || undefined, continuation: null, day: Number(completedDay) || undefined, timeCard: timeCard || undefined, terminalStep: exec.activeStepIndex };
    if (continuation && continuation.targetStoryPath) {
      const requestedTargetId = String(continuation.targetStoryId || "").trim();
      const targetStoryId = requestedTargetId && requestedTargetId !== continuation.targetStoryPath
        ? requestedTargetId
        : stableStoryIdForPath(continuation.targetStoryPath);
      payload.continuation = {
        targetStoryId,
        targetStoryPath: continuation.targetStoryPath,
        targetOnceKey: continuation.targetOnceKey || undefined,
        requirements: continuation.requirements,
        contactId: continuation.contactId || null,
        terminalStep: exec.activeStepIndex
      };
    }
    const result = engine.dispatch({
      type: "COMPLETE_STORY",
      commandId: `complete-story:${exec.lease.id}:${normalizedPath}`,
      expectedRevision: state.revision,
      leaseId: exec.lease.id,
      payload
    });
    if (!result.ok && payload.continuation) {
      // Continuation resolution failing must never take down plain
      // completion -- fall back to the exact pre-existing behavior (release
      // the lease, no continuation receipt) rather than leaving the story
      // uncompleted canonically. The stale-lease reclamation safety net
      // (ensureCanonicalStoryLease) already covers whatever this fallback
      // leaves imperfect, same as it did before continuation existed.
      try { console.error("[Feature4][continuation] canonical continuation failed, falling back to plain completion", { storyPath: normalizedPath, continuation, status: result.status, error: result.error }); } catch {}
      const retry = engine.dispatch({
        type: "COMPLETE_STORY",
        commandId: `complete-story:${exec.lease.id}:${normalizedPath}:fallback`,
        expectedRevision: engine.getGameplayState().revision,
        leaseId: exec.lease.id,
        payload: { ...payload, continuation: null }
      });
      return !!retry.ok;
    }
    if (!result.ok) {
      // A renderer can reach the final painted step while a projection or
      // another bridge advances the revision. A failed first completion must
      // not leave the same story lease alive merely because its once receipt
      // was written separately; that state reopens the episode from step 0.
      const latest = engine.getGameplayState();
      if (latest.execution?.lease?.id === exec.lease.id && latest.execution?.activeStoryPath === normalizedPath) {
        const retry = engine.dispatch({
          type: "COMPLETE_STORY",
          commandId: `complete-story:${exec.lease.id}:${normalizedPath}:reconcile:${latest.revision}`,
          expectedRevision: latest.revision,
          leaseId: exec.lease.id,
          payload: { ...payload, continuation: null }
        });
        return !!retry.ok;
      }
    }
    return !!result.ok;
  }

  // -------------------------
  // Fail-closed continuation watchdog (story-system audit, Day16 Hailey LOVE
  // root cause -- see memory feature4-day16-love-dual-continuation-
  // authority-race.md).
  //
  // Every story with a declared onCompleteStartStory is supposed to either
  // start running that target, or leave a genuine resumable record behind
  // (progression.pendingStory / Game._pendingStory) that something will
  // resume later. Two independent mechanisms currently race to make that
  // happen (completeCanonicalStory's engine-level continuation activation
  // just above, and this file's own setPendingChainStory + resumePendingStory
  // background chain further below) -- live-reproduced (~1/6 real runs,
  // real Electron + real DOM clicks, Start From Day16 -> Hailey/LOVE)
  // losing BOTH races at once: the engine falls back to a plain completion
  // (continuation:null) AND the legacy chain's own pending-resume record
  // does not survive either, leaving execution fully idle with nothing
  // queued anywhere and no diagnostic of any kind -- the conversation
  // simply goes quiet forever. This watchdog is the fail-closed backstop:
  // a completed story that declared a continuation must EITHER visibly be
  // progressing it OR loudly say why not; it may never just go silent.
  // Purely additive -- it never blocks or alters the existing dispatch
  // paths, only observes their outcome after they have had a fair chance to
  // run, reports if none of them landed, and attempts one recovery retry
  // through the same chain path a fresh natural completion would use.
  // -------------------------
  const CONTINUATION_WATCHDOG_DELAY_MS = 2600;
  function scheduleContinuationWatchdog(sourceStoryPath, sourceOnceKey, continuation, sourceContactId) {
    if (!continuation || (!continuation.targetStoryId && !continuation.targetStoryPath)) return;
    const targetStoryPath = normalizeStoryPath(continuation.targetStoryPath || "") || String(continuation.targetStoryPath || "").trim();
    const targetStoryId = String(continuation.targetStoryId || "").trim() || stableStoryIdForPath(targetStoryPath);
    const targetContactId = canonicalId(continuation.contactId || "");
    const owner = window.GameStateEngine?.getConversationCacheFlushIdentity?.();
    const generation = window.GameStateEngine?.getExecutionState?.()?.generation;
    setTimeout(() => {
      try {
        const engine = window.GameStateEngine;
        if (!engine) return;
        const currentOwner = engine.getConversationCacheFlushIdentity();
        const exec = engine.getExecutionState();
        if (!owner || owner.playthroughId !== currentOwner.playthroughId || owner.operationEpoch !== currentOwner.operationEpoch || generation !== exec.generation) return;
        // Prerequisite recovery owns the continuation now. A retiring timer
        // must not replace any current canonical lease or pending dispatch.
        if (exec.lease) return;
        if (engine.hasCompletedStory(targetStoryId, continuation.targetOnceKey)) return;
        const canonicalPending = engine.getPendingStory();
        if (canonicalPending && ['dispatch', 'resume'].includes(canonicalPending.kind) && normalizeStoryPath(canonicalPending.storyPath || canonicalPending.path || '')) return;

        // Neither running nor resumable: this is the silent-death class the
        // audit exists to make impossible. Report loudly, then attempt one
        // recovery retry.
        try {
          console.error("[CANONICAL_CONTINUATION_FAILURE] " + JSON.stringify({
            sourceStory: sourceStoryPath,
            sourceOnceKey: sourceOnceKey || "",
            sourceContactId: sourceContactId || "",
            targetStoryId,
            targetStoryPath,
            targetContactId,
            executionSnapshot: { activeStoryId: exec.activeStoryId || null, status: exec.status || null, hasLease: !!exec.lease },
            canonicalPendingStory: canonicalPending || null,
            reason: "story completed with a declared continuation, but the target neither became active nor left a resumable record"
          }));
        } catch {}
        try {
          setPendingChainStory(targetStoryPath, {
            from: sourceOnceKey || sourceStoryPath || "",
            reason: "continuation_watchdog_recovery",
            via: "onCompleteStartStory",
            chainSource: "continuation_watchdog_recovery",
            allowConversationInterrupt: true,
            strictRequestedPath: true,
            contactId: targetContactId,
            sourceContactId: sourceContactId || "",
            opts: (targetContactId && targetContactId === canonicalId(sourceContactId || "")) ? { allowInConversation: true } : undefined
          });
          (window.Game ||= {}).resumePendingStory?.({ source: "continuation_watchdog_recovery" });
        } catch (err) {
          try { console.error("[CANONICAL_CONTINUATION_FAILURE][recovery-failed] " + JSON.stringify({ targetStoryPath, err: formatErrorMessage(err) })); } catch {}
        }
      } catch {}
    }, CONTINUATION_WATCHDOG_DELAY_MS);
  }

  function canonicalGallerySubjectVerificationId(mediaId, eventId, ownerId = "mc") {
    return `gallery-subject-v2:${mediaId}:${eventId}:${ownerId}`;
  }

  function importedStoryMediaProof(event, engine) {
    if (event?.transactionId !== "legacy-save-migration") return null;
    const sourceKey = row => {
      const raw = row?.sourceStepKey ?? row?.sourceStepIndex;
      if (raw == null || raw === "") return "";
      const key = String(raw);
      return /^(?:0|[1-9]\d*)(?:\.(?:then|else)\.(?:0|[1-9]\d*))*$/.test(key) ? key : "";
    };
    const proofFrom = row => ({ storyPath: normalizeStoryPath(String(row?.storyPath || "")),
      storyId: String(row?.storyId || row?.storyOnceKey || ""), sourceStepKey: sourceKey(row),
      assetId: String(row?.assetId || row?.image || row?.imageSrc || row?.url || row?.src || "").trim(),
      from: canonicalId(row?.from || ""), contactId: canonicalId(event.contactId) });
    const direct = proofFrom(event);
    let proof = direct;
    if (!direct.storyPath || !direct.sourceStepKey || !direct.assetId || !direct.from) {
      // Older imports kept the original cache but omitted source fields from
      // their canonical image. Join its exact persisted identity, never its
      // ordinal position, text, completed story or current route selection.
      const rows = engine.getConversationsCache?.()?.[event.contactId]?.messages;
      const matches = (Array.isArray(rows) ? rows : []).filter(row =>
        String(row?.eventId || row?.id || "") === String(event.eventId || ""));
      if (matches.length !== 1 || !["image", "photo", "media"].includes(String(matches[0].kind || "").toLowerCase())) return null;
      proof = proofFrom(matches[0]);
      if (matches[0].contactId && canonicalId(matches[0].contactId) !== proof.contactId) return null;
      for (const key of ["storyPath", "storyId", "sourceStepKey", "assetId", "from"])
        if (direct[key] && direct[key] !== proof[key]) return null;
    }
    if (!proof.storyPath || !proof.sourceStepKey || !proof.assetId || !proof.from || !proof.contactId) return null;
    // Load only an installed authored story; a legacy cache URL is not a new
    // story source. The loaded step must independently prove the exact image.
    if (!Array.isArray(window.StoryAdmissionCatalog) || !window.StoryAdmissionCatalog.some(row => normalizeStoryPath(row.path) === proof.storyPath)) return null;
    return proof;
  }

  async function persistCanonicalStoryMediaToGallery(event, options = {}) {
    const engine = window.GameStateEngine;
    if (!engine || !["image", "photo", "media"].includes(event?.kind)) return null;
    const identity = JSON.stringify(engine.getRuntimeLifecycleIdentity());
    const eventId = String(event.eventId || ""), contactId = String(event.contactId || "");
    const currentEvent = () => {
      if (window.GameStateEngine !== engine || JSON.stringify(engine.getRuntimeLifecycleIdentity()) !== identity) return null;
      return engine.getConversationEvents(contactId).find((row) => row.eventId === eventId && row.storyId === event.storyId && row.storyPath === event.storyPath && row.assetId === event.assetId && row.kind === event.kind && row.from === event.from && row.sourceStepKey === event.sourceStepKey && row.transactionId === event.transactionId) || null;
    };
    if (!eventId || !currentEvent()) return null;
    const legacyProof = importedStoryMediaProof(event, engine);
    if (event.transactionId === "legacy-save-migration" && !legacyProof && !/^msg-[a-z0-9]+$/.test(eventId)) return null;
    const sourceEvent = legacyProof || event;
    if (!sourceEvent.assetId || !sourceEvent.storyPath) return null;
    if (event.transactionId === "legacy-save-migration" && (!Array.isArray(window.StoryAdmissionCatalog) ||
        !window.StoryAdmissionCatalog.some(row => normalizeStoryPath(row.path) === normalizeStoryPath(sourceEvent.storyPath)))) return null;
    const interpreter = window.CanonicalStoryRuntime?.get?.();
    if (!interpreter || !window.StoryPosition?.walkNormalizedSteps) return null;
    // Live commits already loaded their raw authored story into this cache.
    // Historical repair fetches only a story referenced by a durable image;
    // the presentation loader translates/routes text and cannot prove identity.
    let story = interpreter.storyCache.get(sourceEvent.storyId || sourceEvent.storyPath);
    if (!story) {
      story = await interpreter.loadStory(sourceEvent.storyPath);
      if (!currentEvent()) return null;
      interpreter.storyCache.set(sourceEvent.storyId || sourceEvent.storyPath, story);
    }
    if (legacyProof && (canonicalId(story.contactId) !== contactId ||
        (legacyProof.storyId && ![story.onceKey, story.id, legacyProof.storyPath].includes(legacyProof.storyId)))) return null;
    let source = null;
    window.StoryPosition.walkNormalizedSteps(story.steps, "", (step, sourceStepKey) => {
      const kind = String(step.type || "message").toLowerCase();
      if (!["image", "photo", "media"].includes(kind)) return;
      // Explicit authored aliases preserve proof for images whose position moved
      // when a missing presentation was inserted. The exact asset/text/kind hash
      // must still match; unrelated historical events never grant a photo.
      const legacyKeys = Array.isArray(step.galleryLegacySourceStepKeys) ? step.galleryLegacySourceStepKeys : [];
      for (const key of [sourceStepKey, ...legacyKeys.map(String)]) {
        const value = JSON.stringify({ storyId: event.storyId, path: key, kind, text: step.text || step.message || "", src: step.src || step.image || step.url || null });
        let hash = 2166136261;
        for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
        if (!legacyProof && `msg-${(hash >>> 0).toString(36)}` === eventId) source = { step, sourceStepKey: key };
      }
      if (legacyProof && sourceStepKey === legacyProof.sourceStepKey && kind === event.kind &&
          String(step.src || step.image || step.url || "").trim() === legacyProof.assetId &&
          canonicalId(step.from || step.fromId || step.sender || "") === legacyProof.from)
        source = { step, sourceStepKey };
    });
    const durable = currentEvent();
    if (!source || !durable) return null;
    if (legacyProof && JSON.stringify(importedStoryMediaProof(durable, engine)) !== JSON.stringify(legacyProof)) return null;
    const ownerId = canonicalGalleryOwnerId(source.step.galleryOwnerId || source.step.ownerId || durable.from || contactId, "");
    const mediaId = `story_media_${canonicalId(story.onceKey || sourceEvent.storyPath)}_${source.sourceStepKey}`;
    const previous = engine.getGalleryState().owned?.[mediaId];
    // Never rewrite an earned physical image when the current variant changes.
    const previousOwnerId = canonicalGalleryOwnerId(previous?.ownerId, "");
    const verifySubject = ownerId === "mc" || previousOwnerId === "mc";
    const subjectVerificationId = canonicalGallerySubjectVerificationId(mediaId, eventId, ownerId);
    const subjectVerified = engine.getGalleryState().receipts?.[subjectVerificationId]?.mediaId === mediaId;
    if (previous && previousOwnerId === ownerId && (!verifySubject || subjectVerified) &&
        (!legacyProof || previous.canonicalContactId === contactId)) return previous;
    const rawUrl = String(sourceEvent.assetId || "").trim();
    const url = String(previous?.url || window.ProtectedMediaResolver?.canonicalMediaPath?.(rawUrl) || window.Game?.resolveCharacterVariantImage?.(rawUrl, ownerId) || rawUrl).trim();
    if (!url || isGalleryExcludedImagePath(url)) return null;
    const photo = photoFromMessage(url, ownerId);
    if (!photo) return null;
    Object.assign(photo, { id: mediaId, mediaId, onceKey: String(story.onceKey || ""), storyPath: sourceEvent.storyPath,
      stepIndex: legacyProof ? Number(source.sourceStepKey.split(".")[0]) : durable.stepIndex, sourceStepKey: source.sourceStepKey, canonicalEventId: eventId, canonicalContactId: contactId, canonicalOwner: true });
    // The cache proves receipt, not its acquisition time. Do not promote an
    // old photo to newest merely because Gallery first repaired it today.
    if (event.transactionId === "legacy-save-migration") Object.assign(photo, { at: 1, unlockedAt: 1, repairSource: "legacy_story_media_v1" });
    const execution = engine.getExecutionState();
    // GalleryStore's legacy onceKey operation coalesces multiple images, and
    // its default nextStepIndex advances execution. A receipt is per media and
    // leaves the current story cursor exactly where its message committed it.
    // The versioned canonical receipt also confirms legitimate player images.
    // It survives relaunch, so old MC acquisitions need source validation once.
    const operationId = verifySubject ? subjectVerificationId : legacyProof
      ? `legacy-gallery-contact-v1:${JSON.stringify([mediaId, eventId, contactId])}`
      : `gallery-unlock:${mediaId}:owner:${ownerId}`;
    const result = engine.dispatch({ type: "UNLOCK_GALLERY_MEDIA", commandId: operationId,
      expectedRevision: engine.getRevision(), leaseId: execution.lease?.id,
      payload: { operationId, mediaId, media: photo, nextStepIndex: execution.activeStepIndex } });
    if (!result?.ok) return null;
    const committed = engine.getGalleryState().owned?.[mediaId] || null;
    if (committed && options.emit !== false) {
      try { window.StoryBus?.emit?.("gallery:add", committed); } catch {}
      try { window.StoryBus?.emit?.("photo:new", committed); } catch {}
      try { window.dispatchEvent?.(new CustomEvent("gallery:add", { detail: committed })); } catch {}
    }
    return committed;
  }

  async function reconcileCanonicalStoryMediaGallery() {
    const engine = window.GameStateEngine;
    if (!engine) return { examined: 0, repaired: 0 };
    const identity = JSON.stringify(engine.getRuntimeLifecycleIdentity());
    const conversations = typeof engine.getGalleryConversationMedia === "function"
      ? engine.getGalleryConversationMedia()
      : (engine.getState().conversations.eventsByContact || {});
    const gallery = engine.getGalleryState();
    const acquired = new Set(Object.values(gallery.owned || {})
      .filter((row) => row.canonicalOwner === true && row.canonicalEventId && row.ownerId &&
        !(/\/home_pic_player[123]\.jpg$/i.test(String(row.url || "")) && canonicalGalleryOwnerId(row.ownerId, "") !== "mc") &&
        (canonicalGalleryOwnerId(row.ownerId, "") !== "mc" ||
          gallery.receipts?.[canonicalGallerySubjectVerificationId(row.mediaId || row.id, row.canonicalEventId)]?.mediaId === (row.mediaId || row.id)))
      .map((row) => `${row.storyPath}|${row.canonicalEventId}`));
    const acquiredImportedEvents = new Set(Object.values(gallery.owned || {})
      .filter(row => row.canonicalContactId && acquired.has(`${row.storyPath}|${row.canonicalEventId}`))
      .map(row => `${row.canonicalContactId}|${row.canonicalEventId}`));
    // An older acquired row may lack contact metadata. Its exact verified
    // contact receipt records the one-time source rescan without rewriting
    // earned image metadata or borrowing the photo's subject as its contact.
    for (const [key, receipt] of Object.entries(gallery.receipts || {})) {
      if (!key.startsWith("legacy-gallery-contact-v1:")) continue;
      try {
        const [mediaId, eventId, contactId] = JSON.parse(key.slice("legacy-gallery-contact-v1:".length));
        const row = gallery.owned?.[mediaId];
        if (receipt.mediaId === mediaId && contactId && row?.canonicalEventId === eventId && acquired.has(`${row.storyPath}|${eventId}`))
          acquiredImportedEvents.add(`${contactId}|${eventId}`);
      } catch {}
    }
    let examined = 0, repaired = 0;
    for (const [contactId, events] of Object.entries(conversations)) {
      for (const event of events || []) {
        if (!["image", "photo", "media"].includes(event.kind) || (!event.assetId && event.transactionId !== "legacy-save-migration")) continue;
        if (acquired.has(`${event.storyPath}|${event.eventId}`)) continue;
        if (event.transactionId === "legacy-save-migration" && acquiredImportedEvents.has(`${contactId}|${event.eventId}`)) continue;
        if (window.GameStateEngine !== engine || JSON.stringify(engine.getRuntimeLifecycleIdentity()) !== identity) return { examined, repaired, retired: true };
        const before = typeof engine.getGalleryOwnedCount === "function"
          ? engine.getGalleryOwnedCount() : Object.keys(engine.getGalleryState().owned || {}).length;
        examined++;
        // Gallery owns one authoritative first paint after this awaited repair.
        // Its gallery:add listener must not rebuild hidden rows per old image.
        await persistCanonicalStoryMediaToGallery({ ...event, contactId }, { emit: false });
        if (window.GameStateEngine !== engine || JSON.stringify(engine.getRuntimeLifecycleIdentity()) !== identity) return { examined, repaired, retired: true };
        const after = typeof engine.getGalleryOwnedCount === "function"
          ? engine.getGalleryOwnedCount() : Object.keys(engine.getGalleryState().owned || {}).length;
        repaired += Math.max(0, after - before);
      }
    }
    return { examined, repaired };
  }

  function installCanonicalMessageBridge() {
    const engine = window.GameStateEngine;
    if (!engine || typeof engine.subscribe !== "function") return;
    if (engine.__conversationBridgeInstalled) return;
    engine.__conversationBridgeInstalled = true;
    engine.subscribe((events) => {
      const notificationBackedMessageIds = new Set((events || [])
        .filter((event) => event?.type === "notification:committed")
        .map((event) => String(event.messageEventId || event.sourceEventId || ""))
        .filter(Boolean));
      for (const ev of events || []) {
        if (ev?.type !== "conversation:event-committed") continue;
        // game-state-engine.js's message() re-emits a conversation:event-
        // committed record (flagged duplicate:true) for content that was
        // ALREADY committed under an eventId collision, purely so
        // executeCanonicalProgressionStep's catch-up loop has something to
        // advance the cursor past and (if needed) hand to caughtUpSteps for
        // rendering -- see message()'s own header comment. The player has
        // already seen this exact message; re-running Inbox.pushMessage
        // here would show a spurious "new message" popup/unread-bump and
        // append a second row to conversationsCache for content that never
        // left the thread.
        if (["image", "photo", "media"].includes(ev?.kind)) {
          void persistCanonicalStoryMediaToGallery(ev).catch((error) => {
            try { console.warn("[gallery] canonical media acquisition deferred", error); } catch {}
          });
        }
        if (ev?.duplicate === true) continue;
        // Notes belong to canonical history, whose readers preserve their
        // note/system identity. They are not dialogue deliveries or alerts.
        if (ev?.kind === "note") continue;
        // Hidden HAK speech remains canonically consumed but has no phone
        // projection. The persisted event decision is never re-evaluated.
        if (ev?.kind === "hak_transcript" && ev?.visible !== true) continue;
        const cid = String(ev.contactId || "");
        if (!cid) continue;
        const isPlayer = String(ev.from || "").toLowerCase() === "player";
        const contactName = resolveStepDisplayName(cid, "");
        // storyPath/stepIndex identify the exact authored step StoryInterpreter
        // committed (see COMMIT_MESSAGE_EVENT's storyId+path+kind+text+src
        // fingerprint in story-interpreter.js for the eventId itself) --
        // forwarding them here is what lets Game.notify's stored row carry a
        // real storyPath/sourceStepIndex for EVERY canonically-committed
        // message, not just ones committed while their conversation happens
        // to already be open (Game.notify's own activeConversationOwnsWrite
        // fallback only applies then). Without this, a message delivered
        // while its conversation is closed is stored with no storyPath/
        // sourceStepIndex, so renderFromTranscript's remount-render can never
        // compute the same dataset.eventId the interactive live-render path
        // uses for that exact step -- the two tags silently diverge and
        // hasBubbleInDom's exact-once guard can't see they're the same step.
        // ev.storyPath is the engine's own s.execution.activeStoryPath at
        // commit time (game-state-engine.js's message() reducer), NOT
        // ev.storyId -- storyId is the story's short canonical/onceKey-based
        // identity (e.g. "d1_intro_hailey_v1"), never a normalizable file
        // path, and every consumer of a row's storyPath field (conversation.
        // html's makeConversationStepEventId, used by both transcript
        // hydration and interactive rendering) requires the real file path.
        // Passing storyId here silently produced a row whose storyPath could
        // never normalize to the same value the interactive render path
        // computes from STORY_KEY for the identical step -- a background-
        // delivered message and its own later interactive re-visit diverged
        // onto two different derived render identities. Confirmed live: the
        // very first Hailey conversation (auto-chained from Mason via
        // onCompleteStartStory, delivered while her thread was still closed).
        Game.Inbox?.pushMessage?.({
          contactId: cid,
          contactName,
          avatar: "",
          from: ev.from || cid,
          kind: ["image", "photo", "media"].includes(ev.kind) ? "image" : (ev.kind === "hak_transcript" ? "hak_transcript" : "text"),
          // Centralized template resolution, matching addBubble's own
          // "UI shows templated" contract (conversation.html, `finalText =
          // tplText(text)`) -- canonical committed events intentionally keep
          // the RAW {{name:x}}/{{status:x}} template (so a later contact
          // rename retroactively updates history) and every consumer that
          // turns a committed event into user-facing text is responsible for
          // resolving it itself. This bridge is the ONE choke point every
          // canonical message commit passes through on its way to the popup
          // toast AND the Messages list preview (Game.notify -> convos[id]
          // .text) -- addBubble only covers the interactive in-conversation
          // render. Root cause of a real, live, reported bug: a message
          // delivered while its OWN conversation is closed (the common case
          // for a background/chained story -- e.g. Hailey's DAY1_06 check-in
          // auto-starting right after Aiden's first chat) never passes
          // through addBubble at all, so ev.text reached the popup/list raw
          // and unresolved -- confirmed live via story/DAY1/DAY1_06_HAILEY_
          // CHECKIN.json's "{{name:evelyn}} is bringing you food soon" line,
          // shown verbatim in the notification card. General contract fix,
          // not a Hailey/Aiden special case: every one of the 310+ notify/
          // message steps across the story catalog that use a {{name:*}}
          // token was equally exposed whenever its conversation wasn't the
          // one currently open.
          text: tplText(ev.text || ""),
          link: ev.link || undefined,
          imageSrc: ["image", "photo", "media"].includes(ev.kind) ? String(window.Game?.resolveCharacterVariantImage?.(ev.assetId || "", ev.contactId || "") || ev.assetId || "") : "",
          eventId: ev.eventId,
          storyPath: ev.storyPath || "",
          sourceStepIndex: Number.isFinite(Number(ev.stepIndex)) ? Number(ev.stepIndex) : undefined,
          transcript: ev.kind === "hak_transcript",
          ts: Date.now(),
          // A notify target:"conversation" transaction emits both the
          // durable conversation event and its canonical notification in
          // the same receipt. Persist/project here, but leave the transient
          // card to CanonicalNotificationService so the hybrid event has
          // exactly one popup owner.
          popup: !notificationBackedMessageIds.has(String(ev.eventId || "")),
          bumpUnread: !isPlayer
        });
        // Game.notify (called by Inbox.pushMessage above) already learns the
        // alias; thread-history trimming is a separate housekeeping concern
        // that lived beside the old direct writes, so it belongs here now too.
        try { enforceThreadHistoryForContact(cid); } catch {}
      }
    });
  }

  // Group 1 (canonical StoryInterpreter) catch-up: executeCanonicalProgressionStep's
  // own reconciliation walk (see its header comment on caughtUpSteps) can
  // canonically commit a hak_add_evidence step -- via ADD_HAK_EVIDENCE --
  // as a side effect of resolving some LATER step's own targetPath, without
  // runSteps's per-type "if (type === 'hak_add_evidence')" branch (the ONLY
  // place that called persistHakEvidenceToGallery) ever running for that
  // specific step. Root cause of a real, live, reported bug (Gallery contact
  // photos "not showing / not counting"): confirmed live via
  // story/DAY18/love/DAY18_02_HAILEY_NIGHT_LOVE.json's kiss evidence --
  // hak.evidenceProfiles.hailey genuinely gained the evidence (the canonical
  // commit worked), but Gallery.addPhoto was never called at all, so the
  // photo never entered gallery_photos and permanently couldn't count toward
  // "discovered" or appear in the grid. This is a general contract gap --
  // any evidence-bearing step, not just Hailey/Day18 -- so the fix is a
  // single global listener on the canonical engine event itself (mirrors
  // installCanonicalMessageBridge's own "one choke point every commit passes
  // through" pattern) instead of a second caller-side call site that the
  // next reconciliation-walk edge case would just as easily bypass again.
  function installCanonicalHakEvidenceGalleryBridge() {
    const engine = window.GameStateEngine;
    if (!engine || typeof engine.subscribe !== "function") return;
    if (engine.__hakEvidenceGalleryBridgeInstalled) return;
    engine.__hakEvidenceGalleryBridgeInstalled = true;
    engine.subscribe((events) => {
      if ((events || []).some(ev => ["hak:skill-unlocked", "save:restored", "save:resumed", "initialization:committed"].includes(ev?.type))) {
        try { reconcileCanonicalHakEvidenceGallery(); } catch {}
        return;
      }
      for (const ev of events || []) {
        if (ev?.type !== "hak:evidence-added") continue;
        if (ev?.reused === true) continue;
        const evidenceIds = new Set((Array.isArray(ev.evidenceIds) ? ev.evidenceIds : []).map((id) => String(id || "")));
        if (!evidenceIds.size) continue;
        const profileId = String(ev.profileId || "").trim().toLowerCase();
        const row = engine.getHakState?.()?.evidenceProfiles?.[profileId];
        const evidences = Array.isArray(row?.evidences) ? row.evidences : [];
        const normalizedStep = { profileId, profileName: row?.profile?.name || "", kind: row?.kind || "", route: row?.route || "" };
        for (const item of evidences) {
          if (!evidenceIds.has(String(item?.id || ""))) continue;
          try { persistHakEvidenceToGallery(item, normalizedStep); } catch {}
        }
      }
    });
    try { reconcileCanonicalHakEvidenceGallery(); } catch {}
  }

  installCanonicalMessageBridge();
  installCanonicalHakEvidenceGalleryBridge();

  // ===== Persisted conversation story-identity self-heal =====
  // A profile saved before the storyId/storyPath identity-contract fix
  // (installCanonicalMessageBridge used to write ev.storyId -- a short
  // onceKey-based identity, e.g. "d1_intro_hailey_v1" -- into the storyPath
  // field) can already have conv.messages rows carrying that wrong value.
  // The engine must migrate that data deterministically, not require a
  // fresh save: a normalized real storyPath ALWAYS contains "/" (see
  // normalizeStoryPath's own contract, and every story file's own path,
  // e.g. "story/DAY1/DAY1_02_HAILEY_INTRO.json") -- any row whose storyPath
  // is non-empty and does NOT contain "/" is definitionally not a real
  // path and must be a legacy id needing repair. Resolves the real path via
  // the generated story-graph manifest's onceKey -> path index, the same
  // canonical registry start-from-entry.js/new-update-entry.js already use
  // for this exact lookup. Never invents a path: a row that can't be
  // resolved is left untouched and logged, not silently guessed. Idempotent
  // -- a row already repaired (storyPath now contains "/") no longer
  // matches the repair trigger on a later pass, and a store with nothing to
  // repair is never written back (no spurious revision bump).
  let storyGraphOnceKeyIndexPromise = null;
  function loadStoryGraphOnceKeyIndex() {
    if (storyGraphOnceKeyIndexPromise) return storyGraphOnceKeyIndexPromise;
    storyGraphOnceKeyIndexPromise = Promise.resolve()
      .then(() => fetch("scripts/generated/story-graph.manifest.json"))
      .then((res) => (res && res.ok ? res.json() : null))
      .then((manifest) => {
        const index = new Map();
        const stories = (manifest && Array.isArray(manifest.stories)) ? manifest.stories : [];
        for (const story of stories) {
          const onceKey = String(story?.onceKey || "").trim();
          const storyPath = String(story?.path || "").trim();
          if (onceKey && storyPath) index.set(onceKey, storyPath);
        }
        return index;
      })
      .catch(() => new Map());
    return storyGraphOnceKeyIndexPromise;
  }

  // Computes the repaired storyPath for one row, or null if the row needs
  // no change. Two independent legacy shapes, handled together so a row
  // carrying BOTH (unlikely but not impossible) is fixed in one pass:
  //   - a leading "./" -- purely a normalization gap (normalizeStoryPath
  //     itself now strips this on every read, so this is optional
  //     tidiness, not required for correctness, but the stored data should
  //     still reflect the one canonical form the contract now guarantees).
  //   - a bare short id with no "/" at all (e.g. "d1_intro_hailey_v1") --
  //     the real installCanonicalMessageBridge bug; requires the registry
  //     to resolve, since no amount of string normalization can recover a
  //     file path from a short id.
  function resolveRepairedStoryPath(rawStoryPath, onceKeyIndex) {
    const sp = String(rawStoryPath || "").trim();
    if (!sp) return null;
    const stripped = sp.replace(/^\.\//, "");
    if (stripped.includes("/")) return stripped !== sp ? stripped : null;
    const resolved = onceKeyIndex.get(stripped);
    return resolved || undefined; // undefined = suspect but unresolved
  }

  async function repairConversationStoryIdentity(reason) {
    const Game = (window.Game ||= {});
    try {
      const store = typeof Game.readConversationStore === "function" ? Game.readConversationStore() : null;
      if (!store || typeof store !== "object") return { repaired: 0 };

      // Cheap synchronous first pass (no registry needed to detect a
      // candidate) -- only pay for the manifest fetch if there is actually
      // something to look at.
      let suspectCount = 0;
      for (const cid of Object.keys(store)) {
        const rows = Array.isArray(store[cid]?.messages) ? store[cid].messages : [];
        for (const row of rows) {
          const sp = String(row?.storyPath || "").trim();
          if (sp && (sp.startsWith("./") || !sp.includes("/"))) suspectCount++;
        }
      }
      if (!suspectCount) return { repaired: 0 };

      const index = await loadStoryGraphOnceKeyIndex();
      let repaired = 0;
      const unresolved = [];
      const repairedByContact = {};
      for (const cid of Object.keys(store)) {
        const rows = Array.isArray(store[cid]?.messages) ? store[cid].messages : [];
        for (const row of rows) {
          if (!row || typeof row !== "object") continue;
          const next = resolveRepairedStoryPath(row.storyPath, index);
          if (next === null) continue; // nothing to do
          if (next === undefined) { unresolved.push(String(row.storyPath || "")); continue; } // suspect, couldn't resolve -- never invent a path
          row.storyPath = next;
          repaired++;
          repairedByContact[cid] = (repairedByContact[cid] || 0) + 1;
        }
      }
      if (repaired > 0) {
        Game.writeConversationStoreRaw?.(store);
        // Plain object args collapse to the useless literal "[object Object]"
        // through Electron's renderer->main console forwarding (found live,
        // Feature 4 Day1-15 final certification) -- JSON.stringify keeps
        // this actually readable in a real production log.
        try { console.warn("[StoryIdentityRepair] repaired legacy storyPath rows " + JSON.stringify({ reason, repaired, repairedByContact, unresolvedCount: unresolved.length })); } catch {}
      } else if (unresolved.length) {
        try { console.warn("[StoryIdentityRepair] found legacy storyPath rows but could not resolve them " + JSON.stringify({ reason, unresolved: unresolved.slice(0, 20) })); } catch {}
      }
      return { repaired, unresolvedCount: unresolved.length };
    } catch (err) {
      try { console.error("[StoryIdentityRepair] repair pass failed " + JSON.stringify({ reason, error: String(err && err.message || err) })); } catch {}
      return { repaired: 0, error: String(err && err.message || err) };
    }
  }

  // Run once shortly after this module wires up (covers a save already
  // restored before this subscription attached) and again whenever the
  // canonical engine reports a profile actually becoming active (load,
  // relaunch-restore, Start From / New Update / checkpoint init) -- a save
  // created on an older build must be caught the moment its data enters
  // memory, not only if/when a conversation happens to mount.
  try {
    const engine = window.GameStateEngine;
    if (engine && typeof engine.subscribe === "function") {
      let repairScheduled = false;
      const scheduleRepair = (reason) => {
        if (repairScheduled) return;
        repairScheduled = true;
        Promise.resolve().then(() => { repairScheduled = false; repairConversationStoryIdentity(reason); });
      };
      engine.subscribe((events) => {
        for (const ev of events || []) {
          const t = ev?.type;
          if (t === "save:restored" || t === "save:resumed" || t === "initialization:committed") {
            scheduleRepair(t);
            break;
          }
        }
      });
      scheduleRepair("module_init");
    }
  } catch {}

  function isGlobalStepType(type){
    const t = String(type || "").toLowerCase();
    return (
      t === "instagram_post" || t === "snapgram_post" ||
      t === "onlyfun_post" ||
      t === "onlyfun_account_unlock" ||
      t === "instagram_story" || t === "story" ||
      t === "snapgram_gate" ||
      t === "hak_gate" ||
      t === "hak_watchlist" ||
      t === "start_story" ||
      t === "time_card" || t === "next_day" ||
      t === "glitch" ||
      t === "hak_unlock" ||
      t === "hak_overlay" ||
      t === "hak_add_evidence" ||
      t === "hak_photo" || t === "hak_evidence" ||
      t === "hak_hint" ||
      t === "gallery_add" ||
      t === "dev_message" ||
      t === "notify" ||
      t === "note" ||
      t === "outbound_task" ||
      t === "set_flag" ||
      // branching meta can exist in global stories too
      t === "label" || t === "goto" || t === "choice" || t === "choices" || t === "player_choice" || t === "if"
    );
  }

  function presentCanonicalHakEvidence(step, exec) {
    const alreadyDone = isDuplicateCanonicalExec(exec);
    const committedEvent = exec.result?.events?.find?.((event) => event?.type === "hak:evidence-added") || null;
    const committedEvidenceIds = alreadyDone ? [] : (Array.isArray(committedEvent?.evidenceIds) ? committedEvent.evidenceIds : []);
    const normalizedEvidence = normalizeHakEvidenceStep(step);
    if (!alreadyDone && normalizedEvidence) {
      normalizedEvidence.evidences.forEach((item) => {
        try { persistHakEvidenceToGallery(item, normalizedEvidence); } catch {}
      });
      const detail = { profileId: normalizedEvidence.profileId, addedCount: committedEvidenceIds.length, evidenceIds: committedEvidenceIds.slice(), updatedIds: [], at: Date.now() };
      try { window.StoryBus?.emit?.("hak:evidence-added", detail); } catch {}
      try { window.dispatchEvent(new CustomEvent("hak:evidence-added", { detail })); } catch {}
    }
    const added = { addedCount: committedEvidenceIds.length, profileId: normalizedEvidence?.profileId || "", evidenceIds: committedEvidenceIds };
    if (added.addedCount > 0) {
      const notifyText = tplText(step.notifyText || `${added.addedCount} new evidences received`);
      const notifyPayload = {
        app: "hak",
        fromId: "hak",
        fromName: String(step.notifyTitle || "HAK").trim() || "HAK",
        avatar: String(step.notifyAvatar || "assets/avatars/default.jpg").trim() || "assets/avatars/default.jpg",
        text: notifyText,
        target: String(step.target || "hak").trim() || "hak",
        evidenceIds: added.evidenceIds.slice(),
        open: { scene: "hak", tab: "evidence", evidenceIds: added.evidenceIds.slice() },
        __eventId: `hak:evidence:${added.evidenceIds.slice().sort().join("+")}`
      };
      const engine = window.GameStateEngine;
      if (engine) {
        const notificationState = engine.getGameplayState();
        const notificationId = notifyPayload.__eventId;
        const notificationCommit = engine.dispatch({
          type: "COMMIT_NOTIFICATION_EVENT",
          commandId: `hak-notification:${notificationId}`,
          expectedRevision: notificationState.revision,
          leaseId: notificationState.execution?.lease?.id,
          payload: {
            notificationId,
            messageEventId: committedEvent?.operationId || notificationId,
            contactId: "hak",
            notificationType: "hak_evidence",
            text: notifyText,
            nextStepIndex: notificationState.execution?.activeStepIndex,
            payload: notifyPayload
          }
        });
        if (!notificationCommit.ok && notificationCommit.status !== "DUPLICATE_COMMAND" && notificationCommit.status !== "DUPLICATE_NOTIFICATION") {
          return false;
        }
      }
    }
    return true;
  }

  async function runSteps(storyPath, storyJson, opts = {}, ctx = null) {
    const Game = (window.Game ||= {});
    const speedFactor = getTextSpeedFactor();
    const runId = Math.max(0, Number(opts.__runId || Game._storyRunId || 0) || 0);
    const runCtx = (ctx && typeof ctx === "object")
      ? ctx
      : ((opts.__runCtx && typeof opts.__runCtx === "object")
        ? opts.__runCtx
        : { npcSpoke: false, playerSpoke: false });
    runCtx.npcSpoke = !!runCtx.npcSpoke;
    runCtx.playerSpoke = !!runCtx.playerSpoke;
    opts.__runCtx = runCtx;
    opts.__storyOnceKey = String(storyJson?.onceKey || opts.__storyOnceKey || "").trim();

    const steps = cloneStoryStepsWithMeta(Array.isArray(storyJson?.steps) ? storyJson.steps : []);
    let i = Number(opts.startIndex || 0) || 0;

    // ✅ optional flags (default: keep old behavior)
    const allowInConversation = !!opts.allowInConversation; // if true, won't pause when convo scene open
    // A restored background walker has no autoplay authority. Opening the
    // thread gives its renderer the normal input controls; resuming a saved
    // lease (including after a real HAK close) must still stop at player turns.
    const restoredExecution = window.GameStateEngine?.getExecutionState?.();
    const restoredContactLease = String(restoredExecution?.lease?.initializationToken || "").startsWith("restore:") &&
      normalizeStoryPath(restoredExecution?.activeStoryPath || "") === normalizeStoryPath(storyPath) &&
      !NON_CONTACT_ACTOR_IDS.has(String(restoredExecution?.activeContactId || ""));
    const allowPlayerTurns    = !!opts.allowPlayerTurns && !restoredContactLease;

    if (!requirementsMet(storyJson || {})) return;

    const requestedContactId = resolveContactId(
      opts.contactId || opts.conversationId || opts.id || "",
      opts.contactName || ""
    );
    const authoredContactId = getStoryOwnerId(storyJson, { storyPath });
    let contactId = NON_CONTACT_ACTOR_IDS.has(String(requestedContactId || "").toLowerCase())
      ? authoredContactId
      : (requestedContactId || authoredContactId);
    if (!contactId) contactId = inferContactIdFromStory(storyJson);
    const chapterLoadBypass = consumeChapterLoadBypassForStory(storyPath, storyJson?.onceKey || "", opts);
    const episodeId = makeEpisodeId(storyJson?.onceKey || "");
    const ifDecisionCtx = { storyPath, storyJson, contactId: contactId || "" };
    const canonicalStartIndex = runtimeIndexFromCanonicalCursor(storyPath, steps, ifDecisionCtx);
    if (canonicalStartIndex != null) i = canonicalStartIndex;
    else if (i > 0) materializeIfStepsUpToIndex(steps, i, ifDecisionCtx);
    let lastSpeaker = inferLastRuntimeSpeakerBeforeIndex(steps, i, contactId || "");

    const globalStory = !contactId;

    const recentLocal = new Map();
    const LOCAL_TTL = 1200;
    let queuedChainThisRun = false;
    let canonicalDayTransition = 0;
    let canonicalDayTimeCard = null;
    // Group 3 (continuation): whichever step-type handler ACTUALLY resolves
    // this run's real next-story target (start_story step, time_card step,
    // outbound_task) records it here so the single natural-completion
    // dispatch at the bottom of this function (which otherwise only knows
    // storyJson.onCompleteStartStory) uses the SAME target the legacy chain
    // is actually about to load -- one resolved decision, not two that could
    // silently diverge.
    let resolvedContinuationOverride = null;
    // Deterministic goto loop protection (control-flow group): a bounded
    // semantic-operation budget, not a timeout -- a story taking a legitimate
    // designed loop (e.g. "ask again until condition met") advances the same
    // way regardless of wall-clock speed, so timing it out would either fire
    // on slow machines under valid content or never fire on fast ones under
    // broken content. Every production story's total goto count is under 10;
    // this budget is generous for any real retry pattern while still failing
    // fast (not hanging the renderer) on a genuine unconditional cycle.
    const MAX_GOTO_JUMPS_PER_RUN = 500;
    // Every real jump within production content's own budget (<=10 total
    // per story) gets a genuine canonical dispatch through StoryInterpreter;
    // comfortably above that is definitionally the pathological case
    // MAX_GOTO_JUMPS_PER_RUN exists for, where a canonical dispatch per
    // remaining iteration would reintroduce the synchronous-hang this file
    // was already fixed for once (see the goto branch's own comment).
    const GOTO_CANONICAL_DISPATCH_LIMIT = 25;
    let gotoJumpCount = 0;
    const normalizedStoryPath = normalizeStoryPath(storyPath) || String(storyPath || "").trim();

    if (runId > 0) {
      const currentRunId = Math.max(0, Number(Game._storyRunId || 0) || 0);
      if (currentRunId > 0 && currentRunId !== runId) return;
      if (currentRunId < runId) Game._storyRunId = runId;
    }
    Game._activeRunner = "background";
    Game._activeStoryPath = normalizedStoryPath || Game._activeStoryPath || null;

    function localAlreadySent(key) {
      const now = Date.now();
      const last = recentLocal.get(key) || 0;
      if (now - last < LOCAL_TTL) return true;
      recentLocal.set(key, now);
      if (recentLocal.size > 200) {
        for (const [k, t] of recentLocal) {
          if (now - t > 10_000) recentLocal.delete(k);
        }
      }
      return false;
    }

    try {
    // A saved cursor can already point after an unacknowledged cinematic.
    // Restore that presentation before interpreting its successor.
    await presentRestoredHakInteraction();
    while (i < steps.length) {
      if (runId > 0 && Math.max(0, Number(Game._storyRunId || 0) || 0) !== runId) return;
      const step = steps[i] || {};
      const type = String(step.type || "").toLowerCase();
      touchPendingDispatch(storyPath, i, { lastStepType: type, updatedAt: Date.now() });

      if (!requirementsMet(step)) {
        i++;
        continue;
      }

      if (isCinematicLocked()) {
        pause(Game, storyPath, contactId, i, opts, "cinematic_lock", { runId });
        return;
      }

      // ---- GLOBAL vs CONVERSATION gating (unchanged by default)
      if (globalStory) {
        if (!isGlobalStepType(type)) {
          clearPendingStory();
          if (storyJson?.onceKey) markOnce(storyJson.onceKey);
          completeCanonicalStory(storyPath, null, storyJson?.onceKey || "");
          return;
        }
      } else {
        if (!allowInConversation && isConversationSceneOpenFor(contactId)) {
          pause(Game, storyPath, contactId, i, opts, "conversation_open");
          return;
        }
        const ownerConflict = allowInConversation
          ? null
          : canonicalActiveOwnerConflict(contactId);
        if (ownerConflict) {
          pause(Game, storyPath, contactId, i, opts, "conversation_owned_elsewhere", {
            runId,
            lockOwnerId: ownerConflict.lockOwnerId,
            lockStoryPath: ownerConflict.lockStoryPath
          });
          return;
        }
      }

      const delayRaw = Number(step.delay || 0) || 0;
      const delay = Math.max(0, Math.round(delayRaw * speedFactor));
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if (runId > 0 && Math.max(0, Number(Game._storyRunId || 0) || 0) !== runId) return;
      if (isCinematicLocked()) {
        pause(Game, storyPath, contactId, i, opts, "cinematic_lock", { runId });
        return;
      }

      const allowAvatar = (!globalStory) ? isAvatarUnlocked(contactId) : true;
      const safeAvatarForPrelude = allowAvatar ? String(step.avatar || "").trim() : "";

      // -------------------------
      // ✅ NEW: label / goto / choice
      // -------------------------
      if (type === "if") {
        // StoryInterpreter (via executeCanonicalProgressionStep) is the sole
        // decision authority: condition evaluation, branch selection, and
        // the resulting canonical cursor position all come from it.
        // expandIfStepAt below is NOT a second decision -- resolveIfStepDecision
        // finds the branch receipt the interpreter just committed and reuses
        // it verbatim (see its existing-receipt short-circuit); it only
        // performs the local splice this file's OWN steps array still needs
        // so not-yet-migrated (Group 2-6) step types keep working.
        const exec = await executeCanonicalProgressionStep({ storyPath, contactId, userIntent: {}, targetPath: canonicalPathKeyOf(step), allowReclaim: opts.allowConversationInterrupt === true });
        if (exec.handled && exec.result && !exec.result.ok) {
          pauseForCanonicalCommitFailure(Game, storyPath, contactId, i, opts, runId, exec.path || `if:${i}`, { ok: false, status: "blocked_terminal", reason: exec.result.status, canonicalResult: exec });
          return;
        }
        expandIfStepAt(steps, i, ifDecisionCtx);
        continue;
      }

      if (type === "label") {
        // Pure control-flow marker: StoryInterpreter still owns the
        // canonical commit (dedup, cursor); this file's own `i` is a plain
        // +1 the same way it always was for a no-op marker (no legacy
        // "resolution" of any kind happens here).
        await executeCanonicalProgressionStep({ storyPath, contactId, userIntent: {}, targetPath: canonicalPathKeyOf(step), allowReclaim: opts.allowConversationInterrupt === true });
        i++; continue;
      }

      if (type === "goto") {
        const label = String(step.label || step.name || step.to || "").trim();
        gotoJumpCount++;
        if (gotoJumpCount > MAX_GOTO_JUMPS_PER_RUN) {
          // Deterministic, reproducible failure -- not a timeout. Pausing
          // (not advancing) leaves the position recoverable and matches
          // the shared commit-failure contract's "block, don't fabricate
          // progress" outcome.
          try {
            console.error("[ERROR][goto-loop-guard] goto jump budget exceeded, story paused (not advanced)", {
              storyPath,
              onceKey: String(storyJson?.onceKey || "").trim(),
              label,
              stepIndex: i,
              gotoJumpCount,
              budget: MAX_GOTO_JUMPS_PER_RUN
            });
          } catch {}
          recordCanonicalBlockedState({
            storyPath, contactId, code: "GOTO_BUDGET_EXCEEDED", retryable: false, recoveryPolicy: "manual",
            detail: { label, stepIndex: i, gotoJumpCount, budget: MAX_GOTO_JUMPS_PER_RUN }
          });
          pause(Game, storyPath, contactId, i, opts, "goto_loop_guard_tripped", { runId });
          return;
        }
        // Resolution happens ONLY in normalized-story/interpreter code
        // (StoryPosition.resolveGotoTarget, the same module StoryInterpreter
        // itself uses -- see canonicalNextPositionAfter) -- never a second,
        // independent "find this label" implementation. The canonical
        // COMMIT (dedup, persisted cursor, "StoryInterpreter invoked") goes
        // through executeCanonicalProgressionStep for the first
        // GOTO_CANONICAL_DISPATCH_LIMIT jumps of this run -- comfortably
        // above any real production story's total goto count (verified: all
        // under 10) -- so every real jump is genuinely interpreter-driven;
        // beyond that this is, by construction, the pathological case the
        // budget above exists for, and a canonical dispatch per remaining
        // iteration is exactly the synchronous-hang risk measured and fixed
        // earlier in this file's history (see git blame) -- resolution
        // still stays canonical, only the extra per-jump commit is skipped.
        let exec = null;
        if (gotoJumpCount <= GOTO_CANONICAL_DISPATCH_LIMIT) {
          exec = await executeCanonicalProgressionStep({ storyPath, contactId, userIntent: {}, targetPath: canonicalPathKeyOf(step), allowReclaim: opts.allowConversationInterrupt === true });
        }
        const labelKnown = canonicalLabelIndexFor(storyJson).map.has(label.trim().toLowerCase());
        if (!labelKnown) {
          try {
            console.error("[ERROR] Missing goto label in story runtime", {
              storyPath,
              onceKey: String(storyJson?.onceKey || "").trim(),
              label
            });
          } catch {}
          i++;
          continue;
        }
        const nextTarget = (exec && exec.handled && exec.cursor)
          ? { rootIndex: exec.cursor.rootIndex, branchPath: exec.cursor.branchPath }
          : canonicalNextPositionAfter(storyJson, step, { gotoLabel: label });
        i = legacyIndexForCanonicalRoot(steps, nextTarget.rootIndex);
        continue;
      }

      if (type === "set_flag") {
        // StoryInterpreter is the sole write authority for world.variables
        // (see story-interpreter.js's set_flag case -- value default/
        // normalization there now byte-for-byte matches this file's own
        // "1"-string convention so canonical writes stay read-compatible).
        // markOnce/legacy-shadow-clear below are presentation-adjacent
        // bookkeeping this renderer still owns, not a second write of the
        // variable itself.
        const key = String(step.key || step.name || "").trim();
        if (key) {
          const remove = step.remove === true || step.clear === true;
          const exec = await executeCanonicalProgressionStep({ storyPath, contactId, userIntent: {}, targetPath: canonicalPathKeyOf(step), allowReclaim: opts.allowConversationInterrupt === true });
          if (exec.handled && exec.result && !exec.result.ok) {
            pauseForCanonicalCommitFailure(Game, storyPath, contactId, i, opts, runId, exec.path || `set_flag:${i}`, { ok: false, status: "blocked_terminal", reason: exec.result.status, canonicalResult: exec });
            return;
          }
          if (remove) { try { safeRemLS(key); } catch {} }
        }
        if (step.onceKey) markOnce(step.onceKey);
        i++;
        continue;
      }

      if (type === "hak_hint") {
        const kind = canonicalId(step.kind);
        const text = tplText(step.text || "").trim();
        const onceKey = canonicalId(step.onceKey || "");
        const requiredSkillId = requiredSkillForHakHintKind(kind);

        if (!requiredSkillId || !text) {
          i++;
          continue;
        }
        if (onceKey && onceDone(onceKey)) {
          i++;
          continue;
        }
        if (!hasHakSkill(requiredSkillId)) {
          i++;
          continue;
        }

        try {
          if (typeof window.Game?.appendHakHint === "function") {
            window.Game.appendHakHint(kind, text);
            if (onceKey) markOnce(onceKey);
          }
        } catch {}

        i++;
        continue;
      }

     if (type === "choice" || type === "choices" || type === "player_choice") {
  if (!allowPlayerTurns) {
    pause(Game, storyPath, contactId, i, opts, "choice");
    return;
  }

  const presenter = (window.Game ||= {}).presentChoice;
  if (typeof presenter !== "function") {
    pause(Game, storyPath, contactId, i, opts, "choice_no_presenter");
    return;
  }

  // Group 2: StoryInterpreter is the sole choice authority. This first call
  // establishes (or re-reads, idempotently) the canonical PENDING choice --
  // choiceGroupId, options, selectionOpen -- as real, persisted
  // execution.cursor.pendingUserIntent, not a value only this closure holds.
  const peekExec = await executeCanonicalProgressionStep({ storyPath, contactId, userIntent: {}, targetPath: canonicalPathKeyOf(step), allowReclaim: opts.allowConversationInterrupt === true });
  if (!peekExec.handled) {
    pause(Game, storyPath, contactId, i, opts, "choice_canonical_unavailable");
    return;
  }
  // `engine` was previously used below without ever being declared in this
  // scope -- a 100% deterministic ReferenceError ("engine is not defined")
  // on every background-runSteps-driven choice step, only surfaced now via
  // a Day1 targeted-replay smoke test (this exact path is rarely exercised
  // since most player choices happen through conversation.html's own
  // interactive walker, not the background queue). Matches the
  // `const engine = window.GameStateEngine;` pattern used everywhere else
  // in this file; peekExec.handled already proved the canonical engine was
  // reachable moments ago, so no extra guard is needed here.
  const engine = window.GameStateEngine;
  const pendingBefore = engine.getGameplayState().execution.cursor?.pendingUserIntent;
  if (!pendingBefore || pendingBefore.kind !== "choice") {
    // Already decided (e.g. a stale re-entrant call after the cursor moved
    // on) -- nothing to present, resync i and move on rather than re-opening
    // a committed choice.
    i = legacyIndexForCanonicalRoot(steps, (engine.getGameplayState().execution.cursor || {}).rootIndex ?? i);
    continue;
  }
  const choiceGroupId = pendingBefore.choiceGroupId;
  const prompt = tplText(step.prompt || "").trim();
  const options = Array.isArray(pendingBefore.options) ? pendingBefore.options : (Array.isArray(step.options) ? step.options : []);

  const optionsTpl = options.map(o => ({
    ...o,
    text: tplText(o?.text || o?.label || o?.id || "")
  }));

  let picking = false;
  let presentationCancelled = false;

  await new Promise((resolve) => {
    try {
      presenter({
        key: choiceGroupId,
        prompt,
        options: optionsTpl,
        storyPath,
        storyOnceKey: String(storyJson?.onceKey || "").trim(),
        contactId,
        day: Math.max(0, Number(storyJson?.day || 0) || 0),
        title: prompt || choiceGroupId,
        onCancel: () => {
          presentationCancelled = true;
          resolve();
        },
        onPick: async (opt) => {
          if (picking) return; // rapid double-click on a different option while the first commit is still in flight
          picking = true;
          const pickedId = String(opt?.id || "").trim();
          // The ONLY write: StoryInterpreter resolves branch/goto/onceKey/set
          // consequences and GameStateEngine commits the immutable receipt +
          // those consequences + the next cursor atomically (RECORD_CHOICE_DECISION).
          // A duplicate/repeat selection at this exact choiceGroupId returns
          // the ORIGINAL receipt (reused:true) rather than re-deciding.
          const pickExec = await executeCanonicalProgressionStep({ storyPath, contactId, userIntent: { choiceId: pickedId }, targetPath: canonicalPathKeyOf(step), allowReclaim: opts.allowConversationInterrupt === true });
          if (!pickExec.handled || !pickExec.result?.ok) {
            pauseForCanonicalCommitFailure(Game, storyPath, contactId, i, opts, runId, pickExec.path || `choice:${i}`, { ok: false, status: "blocked_terminal", reason: pickExec.result?.status, canonicalResult: pickExec });
            resolve();
            return;
          }
          // Route points are already part of RECORD_CHOICE_DECISION. This
          // renderer only observes the receipt; it must never apply effects.
          const cursorAfter = engine.getGameplayState().execution.cursor;
          i = legacyIndexForCanonicalRoot(steps, cursorAfter ? cursorAfter.rootIndex : i);
          resolve();
        }
      });
    } catch {
      pause(Game, storyPath, contactId, i, opts, "choice_presenter_error");
      resolve();
    }
  });

  if (presentationCancelled) {
    // Leaving/remounting the conversation must release this runSteps
    // invocation's pending presenter Promise. The canonical cursor remains
    // the sole durable owner of the unanswered choice and reconstructs it
    // on the next mount; do not loop and present it again while unmounted.
    // The foreground renderer may have claimed this same pending choice.
    // A retired walker must not publish an old resume cue or take ownership
    // back from the renderer that replaced its presentation.
    if (runId > 0 && Math.max(0, Number(Game._storyRunId || 0) || 0) !== runId) return;
    pause(Game, storyPath, contactId, i, opts, "choice_presenter_unmounted");
    return;
  }

  function storyRouteForHakAccess(storyPath, step = {}) {
    const explicit = canonicalId(step.route || step.evidenceRoute || step.hakRoute || "");
    if (["love", "ntr", "nts"].includes(explicit)) return explicit;
    const match = String(storyPath || "").replace(/\\/g, "/").match(/\/(love|ntr|nts)\//i);
    if (match) return match[1].toLowerCase();
    try {
      const contact = canonicalId(step.contactId || step.from || "");
      const routed = canonicalId(window.CharacterRoutes?.get?.(contact, { persistInherited:false }) || "");
      if (["love", "ntr", "nts"].includes(routed)) return routed;
    } catch {}
    return "";
  }

  continue;
}

      // -------------------------
      // Todo guidance steps
      // -------------------------
      if (type === "todo") {
        const todoId = String(step.id || "").trim();
        const cid = resolveContactId(
          step.contactId || step.fromId || contactId || "",
          step.contactName || step.fromName || step.name || ""
        );

        if (todoId && cid && typeof (window.Game ||= {}).addTodo === "function") {
          (window.Game ||= {}).addTodo({
            id: todoId,
            type: String(step.todoType || "text"),
            contactId: cid,
            app: String(step.app || "messages").toLowerCase(),
            color: String(step.color || "rainbow"),
            createdAt: Number(step.createdAt || Date.now()) || Date.now(),
            status: "open",
            autoClear: String(step.autoClear || "onSend")
          });
        }

        i++;
        continue;
      }

      if (type === "todo_clear") {
        const todoId = String(step.id || "").trim();
        const cid = resolveContactId(
          step.contactId || step.fromId || contactId || "",
          step.contactName || step.fromName || step.name || ""
        );
        const todoType = String(step.todoType || "text").trim() || "text";

        if (todoId && typeof (window.Game ||= {}).completeTodo === "function") {
          (window.Game ||= {}).completeTodo(todoId);
        } else if (cid && typeof (window.Game ||= {}).completeTodosForContact === "function") {
          (window.Game ||= {}).completeTodosForContact(cid, todoType);
        }

        i++;
        continue;
      }

      if (type === "outbound_task") {
        const cid = resolveContactId(
          step.contactId || step.fromId || contactId || "",
          step.contactName || step.fromName || step.name || ""
        );
        const outboundStoryPath = normalizeStoryPath(step.storyPath || step.story || step.startStory || "");
        const promptText = tplText(step.promptText || step.prompt || step.text || "").trim();
        const episodeOnceKey = canonicalId(step.episodeOnceKey || step.onceKey || "");

        if (cid && outboundStoryPath) {
          const pendingOutbound = await preparePendingOutboundPayload({
            kind: "outbound_task",
            contactId: cid,
            contactName: step.contactName || step.fromName || step.name || "",
            storyPath: outboundStoryPath,
            promptText,
            episodeOnceKey,
            cueKind: String(step.cueKind || "rainbow")
          });
          if (pendingOutbound) syncPendingOutboundCue(pendingOutbound);
        }

        clearPendingStory();
        if (storyJson?.onceKey) markOnce(storyJson.onceKey);
        completeCanonicalStory(
          storyPath, contactId || null, storyJson?.onceKey || "",
          (cid && outboundStoryPath) ? await resolveContinuationTarget(outboundStoryPath, contactId, cid) : null
        );
        return;
      }

      // -------------------------
      // Existing behavior
      // -------------------------
      if (type === "notify") {
        const notifyFromId = resolveRuntimeStepSenderId(step, "");
        if (notifyFromId && notifyFromId !== "player") {
          runCtx.npcSpoke = true;
        }
        const app = String(step.app || "messages").toLowerCase();

        const hinted = resolveRuntimeStepSenderId(step, "");
        // Sender identity is not conversation ownership. Player-authored
        // notifications in a character story must keep that character's
        // canonical lease/contact instead of switching it to the non-contact
        // `player` sentinel (which strands Start From on Home).
        if (hinted && hinted !== "player") contactId = hinted;

        // Canonical seam: the DECISION to record/deliver this notification
        // is GameStateEngine's (COMMIT_NOTIFICATION_EVENT -> CanonicalNotificationService),
        // not this file's direct Game.Inbox.pushMessage/Game.notify call --
        // Feature 1's popup pipeline stays presentation-only, now reacting
        // to a canonical commit instead of being invoked directly here. The
        // avatar-reveal gate (allowAvatar) is this renderer's own concern
        // (spoiler timing), not something the story JSON or engine encodes,
        // so it is passed through userIntent rather than re-derived in the
        // interpreter.
        if (app === "messages") {
          const authoredSenderId = resolveRuntimeStepSenderId(step, contactId);
          const cid = authoredSenderId === "player" ? contactId : authoredSenderId;
          if (cid && shouldHideCharacterFromUI(cid)) {
            i++;
            continue;
          }
          const contactName = resolveStepDisplayName(cid, step.fromName || step.name || "");
          const text = tplText(step.text || "");
          if (cid && text) {
            const next = steps[i + 1] || {};
            const nextIsSame =
              String(next.type || "").toLowerCase() === "message" &&
              canonicalId(next.from) !== "player" &&
              tplText(next.text || "") === text;

            // The canonical commit itself always happens (a skipped commit
            // here would just get filled in later by the interpreter's own
            // catch-up walk when a subsequent step commits -- see
            // canonical-notification-service.js's suppressPopup handling
            // for why); nextIsSame/localAlreadySent now decide only whether
            // this specific commit's DELIVERY to Feature 1's popup pipeline
            // is suppressed, preserving the original observable behavior
            // (no preview popup for text the very next step already shows
            // for real) without fighting the catch-up mechanism.
            let suppressPopup = nextIsSame;
            if (!nextIsSame) {
              const k = makeLocalDedupKey(cid, "text", text, "");
              if (localAlreadySent(k)) suppressPopup = true;
            }
            const exec = await executeCanonicalProgressionStep({
              storyPath, contactId: cid,
              userIntent: { avatar: safeAvatarForPrelude, suppressPopup },
              targetPath: canonicalPathKeyOf(step),
              allowReclaim: opts.allowConversationInterrupt === true
            });
            if (exec.handled && exec.result && !exec.result.ok) {
              pauseForCanonicalCommitFailure(Game, storyPath, contactId, i, opts, runId, exec.path || `notify:${i}`, { ok: false, status: "blocked_terminal", reason: exec.result.status, canonicalResult: exec });
              return;
            }
            if (exec.handled && !suppressPopup) {
              const nowTs = Date.now();
              stampLastPersistedMessageEpisode(cid, {
                kind: "text",
                from: cid,
                text,
                at: nowTs
              }, episodeId);
              enforceThreadHistoryForContact(cid);
              learnAlias(cid, contactName);
            }
            lastSpeaker = cid || lastSpeaker;
            setContactProgress(cid, storyPath, i + 1);
          }
          i++;
          continue;
        }

        {
          const fromId = resolveRuntimeStepSenderId(step, contactId) || contactId || "system";
          if (fromId && shouldHideCharacterFromUI(fromId)) {
            i++;
            continue;
          }
          const exec = await executeCanonicalProgressionStep({
            storyPath, contactId: fromId === "player" ? contactId : fromId,
            userIntent: { avatar: safeAvatarForPrelude },
            targetPath: canonicalPathKeyOf(step),
            allowReclaim: opts.allowConversationInterrupt === true
          });
          if (exec.handled && exec.result && !exec.result.ok) {
            pauseForCanonicalCommitFailure(Game, storyPath, contactId, i, opts, runId, exec.path || `notify:${i}`, { ok: false, status: "blocked_terminal", reason: exec.result.status, canonicalResult: exec });
            return;
          }
        }

        i++;
        continue;
      }

      // send_to_continue has no allowPlayerTurns:true auto-play path (unlike
      // "choice", which drives itself through Game.presentChoice right here
      // regardless of allowPlayerTurns -- see the type==="choice" block
      // below). allowPlayerTurns:true is now the DEFAULT opts shape for
      // every chain-driven story start this session (time_card,
      // queuePendingStoryStart, buildChainStartOpts all default it true
      // unless a caller explicitly opts out), so gating this pause on
      // !allowPlayerTurns silently orphans every send_to_continue step
      // reached that way: no pendingStory("player_first") ever gets set,
      // conversation.html's sendPendingPlayerFirst/getPendingPlayerFirstState
      // (the ONLY code that presents its compose/send UI) has nothing to
      // read, and the canonical cursor sits at this exact step forever --
      // measured live on DAY3_01_LENA_TICKETS.json: every later message in
      // the same conversation permanently rejected with CONTINUE_REQUIRED,
      // zero lena events ever committed, for the full life of the process.
      // send_to_continue must always reach this pause, independent of
      // allowPlayerTurns; every OTHER player-turn step type (a plain
      // player-authored message/image/photo/video/media) keeps its existing
      // allowPlayerTurns-gated behavior unchanged.
      //
      // TRIED AND REVERTED 2026-09-07: dropping the !allowPlayerTurns
      // exemption here (so every player-turn step pauses) as a candidate fix
      // for the same-contact auto-progression report. It changed nothing
      // live -- the Day3->Day4 case still advanced rootIndex 0 -> 12 with
      // zero input -- because at that boundary this BACKGROUND walker is not
      // the one advancing the story at all: the still-mounted conversation
      // renderer adopts the same-contact successor into the already-open
      // thread and drives it with its own showNext walker. Broadening this
      // gate therefore bought no fix while changing behaviour on every
      // chain-driven start (Start From / New Update / Timeline all launch
      // through those paths), so it was reverted. See
      // [[feature4-same-contact-player-boundary-and-day-home]].
      const isSendToContinueStep = String(step?.type || "").trim().toLowerCase() === "send_to_continue";
      if (!globalStory && (!allowPlayerTurns || isSendToContinueStep) && isPlayerTurnStep(step, lastSpeaker, contactId || "")) {
        const inferredCid = resolveContactIdForPlayerTurn(storyJson, steps, i, contactId || "", step);
        if (inferredCid) {
          contactId = inferredCid;
          ifDecisionCtx.contactId = inferredCid;
        }
        const targetContactId = inferredCid || contactId || "";
        // Story-scoped, not contact-scoped: only a renderer that actually owns
        // THIS story may be trusted to present this player turn itself. See
        // rendererOwnsStoryForPlayerTurn's header for the reproduced defect.
        const inConv = !!targetContactId && rendererOwnsStoryForPlayerTurn(targetContactId, storyPath);
        if (targetContactId && !inConv) {
          const draftText = tplText(step.text || "");
          // send_to_continue has exactly ONE working presentation path in
          // this codebase: the player_first pendingOutbound cue
          // (getPendingPlayerFirstState/sendPendingPlayerFirst in
          // conversation.html), which commits userIntent:{continue:true}
          // through Game.executeCanonicalProgressionStep on send. A
          // "paused_turn" (kind:"resume") pendingStory -- what
          // runCtx.npcSpoke/playerSpoke carried over from an EARLIER,
          // already-completed story in the same chain would otherwise
          // select here -- only knows how to resume generic index-based
          // rendering; nothing reads it to re-drive this specific commit,
          // so the canonical cursor parks here forever (measured live,
          // same DAY3_01_LENA_TICKETS.json symptom as the fix above).
          // Whether an unrelated NPC spoke in a PRIOR story earlier in this
          // chain has no bearing on whether THIS story's send_to_continue
          // step has a working presentation route -- it never does, so
          // always treat it as the player_first case.
          const truePlayerFirst = isSendToContinueStep || (!runCtx.npcSpoke && !runCtx.playerSpoke);
          if (truePlayerFirst) {
            const onceId = makePendingPlayerFirstOnceId(storyPath, i);
            const doneKey = pendingPlayerFirstDoneKey(onceId);
            // This presentation receipt survives older chapter/save restores.
            // It cannot authorize a SEND that the current canonical story has
            // not committed. Drop only the receipt for this exact pending turn
            // so the conversation's existing SEND presenter can rebuild it.
            const execution = window.GameStateEngine?.getExecutionState?.();
            const position = canonicalPathKeyOf(step);
            if (safeGetLS(doneKey) === "1" && execution?.lease && execution.cursor && position &&
                storyPathsEqual(execution.activeStoryPath, storyPath) &&
                canonicalId(execution.activeContactId || "") === canonicalId(targetContactId) &&
                !targetAlreadyBehindCursor(window.GameStateEngine, position)) {
              safeRemLS(doneKey);
            }
            if (safeGetLS(doneKey) !== "1") {
              pause(Game, storyPath, targetContactId, i, opts, "player_first", {
                runId,
                draftText,
                playerDraft: draftText,
                onceId
              });
              return;
            }
            clearPendingOutboundCue(targetContactId);
            runCtx.playerSpoke = true;
          } else {
            pause(Game, storyPath, targetContactId, i, opts, "paused_turn", {
              runId,
              draftText,
              playerDraft: draftText
            });
            return;
          }
        }
      }

  if (type === "message") {
  if (!contactId) { i++; continue; }
  if (shouldHideCharacterFromUI(contactId)) { i++; continue; }

  const from = resolveRuntimeStepSpeaker(step, lastSpeaker, contactId || "");
  if (from === "hak") {
    const text = tplText(step.text || step.message || "");
    await runHakOverlayStep({
      ...step,
      title: step.title || "HAK",
      message: step.message || "",
      messages: text ? [text] : []
    });
    lastSpeaker = "hak";
    setContactProgress(contactId, storyPath, i + 1);
    i++;
    continue;
  }
  const threadId = from || contactId;
  if (from !== "player" && shouldHideCharacterFromUI(threadId)) { i++; continue; }
  const contactName = resolveStepDisplayName(threadId, step.fromName || step.name || "");
  if (from === "player") runCtx.playerSpoke = true;
  else runCtx.npcSpoke = true;

  // ✅ apply templating here (only used for the local TTL-dedup key below --
  // the canonical commit reads step.text/step.link itself, via StoryInterpreter)
  const text = tplText(step.text || "");

  if (from !== "player" && Game.Inbox?.pushMessage) {
    const k = makeLocalDedupKey(contactId, "text", text, "");
    if (!localAlreadySent(k)) {
      // StoryInterpreter is the sole authority for this step now: semantic
      // type resolution, operation identity (eventId), and the canonical
      // commit itself all come from executeCanonicalProgressionStep, not
      // this file independently computing an eventId and calling
      // commitCanonicalMessage. GameStateEngine.dispatch (inside the
      // interpreter) is the only write; the canonical bridge
      // (installCanonicalMessageBridge, below) reacts to the committed event
      // and owns the legacy-compatible store write, popup, alias learning,
      // and thread-history trimming. A failed/blocked commit must not be
      // silently swallowed and must not let the legacy walk advance past it.
      const exec = await executeCanonicalProgressionStep({ storyPath, contactId, userIntent: {}, targetPath: canonicalPathKeyOf(step), allowReclaim: opts.allowConversationInterrupt === true });
      if (exec.handled && exec.result && !exec.result.ok) {
        pauseForCanonicalCommitFailure(Game, storyPath, contactId, i, opts, runId, exec.path || `message:${i}`, { ok: false, status: "blocked_terminal", reason: exec.result.status, canonicalResult: exec });
        return;
      }
    }
  }

  lastSpeaker = from || lastSpeaker;
  setContactProgress(contactId, storyPath, i + 1);
  i++;
  continue;
}

      if (type === "image" || type === "photo" || type === "video" || type === "media") {
        if (!contactId) { i++; continue; }
        if (shouldHideCharacterFromUI(contactId)) { i++; continue; }

        const from = resolveRuntimeStepSpeaker(step, lastSpeaker, contactId || "");
        const threadId = from || contactId;
        if (from !== "player" && shouldHideCharacterFromUI(threadId)) { i++; continue; }
        const contactName = resolveStepDisplayName(threadId, step.fromName || step.name || "");
        const rawSrc = String(step.image || step.video || step.src || step.url || "").trim();
        const mediaOwnerId = canonicalGalleryOwnerId(step.galleryOwnerId || step.ownerId || from, "");
        const src = String(window.Game?.resolveCharacterVariantImage?.(rawSrc, mediaOwnerId) || rawSrc).trim();

        if (from === "player") runCtx.playerSpoke = true;
        else runCtx.npcSpoke = true;

        try {
          if (from && from !== "player" && src && isContactAvatarPath(src)) {
            window.StoryBus?.emit?.("contact:reveal", { id: from, name: contactName, avatar: src });
            window.dispatchEvent?.(new CustomEvent("contact:reveal", { detail: { id: from, name: contactName, avatar: src } }));
          }
        } catch {}

        if ((!window.GameStateEngine || type === "video") && from && src) {
          const p = photoFromMessage(src, from);
          if (p) {
            p.id = `story_media_${canonicalId(storyJson?.onceKey || storyPath)}_${i}`;
            p.onceKey = String(storyJson?.onceKey || "");
            p.storyPath = storyPath;
            p.stepIndex = i;
            p.canonicalOwner = true;
            saveToGallery(p);
          }
        }

        if (window.GameStateEngine && type !== "video") {
          // The outer player-turn guard has already admitted this operation.
          // Every media sender commits first; the canonical event bridge owns
          // the stable Gallery receipt, including explicit player subjects.
          const exec = await executeCanonicalProgressionStep({ storyPath, contactId, userIntent: {}, targetPath: canonicalPathKeyOf(step), allowReclaim: opts.allowConversationInterrupt === true });
          if (!exec.handled || !exec.result?.ok) {
            pauseForCanonicalCommitFailure(Game, storyPath, contactId, i, opts, runId, exec.path || `image:${i}`, { ok: false, status: "blocked_terminal", reason: exec.result?.status || "canonical_unavailable", canonicalResult: exec });
            return;
          }
        } else if (from !== "player" && Game.Inbox?.pushMessage) {
          const k = makeLocalDedupKey(contactId, "image", "[photo]", src);
          if (!localAlreadySent(k)) {
            // Same authority shift as plain text: StoryInterpreter (via
            // executeCanonicalProgressionStep) owns type resolution, event
            // identity, and the canonical commit -- installCanonicalMessageBridge
            // already understands kind:"image" (imageSrc from the committed
            // event's assetId), so no separate write happens here.
            const exec = await executeCanonicalProgressionStep({ storyPath, contactId, userIntent: {}, targetPath: canonicalPathKeyOf(step), allowReclaim: opts.allowConversationInterrupt === true });
            if (exec.handled && exec.result && !exec.result.ok) {
              pauseForCanonicalCommitFailure(Game, storyPath, contactId, i, opts, runId, exec.path || `image:${i}`, { ok: false, status: "blocked_terminal", reason: exec.result.status, canonicalResult: exec });
              return;
            }
          }
        }

        lastSpeaker = from || lastSpeaker;
        setContactProgress(contactId, storyPath, i + 1);
        i++;
        continue;
      }

      if (type === "hak_add_evidence") {
        const exec = await executeCanonicalProgressionStep({
          storyPath, contactId, userIntent: {}, targetPath: canonicalPathKeyOf(step),
          allowReclaim: opts.allowConversationInterrupt === true
        });
        const alreadyDone = isDuplicateCanonicalExec(exec);
        if (exec.handled && exec.result && !exec.result.ok && !alreadyDone) {
          pauseForCanonicalCommitFailure(Game, storyPath, contactId, i, opts, runId, exec.path || `hak_add_evidence:${i}`, { ok: false, status: "blocked_terminal", reason: exec.result.status, canonicalResult: exec });
          return;
        }
        if (!presentCanonicalHakEvidence(step, exec)) {
          pauseForCanonicalCommitFailure(Game, storyPath, contactId, i, opts, runId, `hak-notification:${i}`, { ok: false, status: "blocked_terminal", reason: "HAK_NOTIFICATION_REJECTED" });
          return;
        }
        i++;
        continue;
      }

      if (type === "hak_photo" || type === "hak_evidence") {
        const exec = await executeCanonicalProgressionStep({
          storyPath, contactId, userIntent: {}, targetPath: canonicalPathKeyOf(step),
          allowReclaim: opts.allowConversationInterrupt === true
        });
        if (exec.handled && exec.result && !exec.result.ok && !isDuplicateCanonicalExec(exec)) {
          pauseForCanonicalCommitFailure(Game, storyPath, contactId, i, opts, runId, exec.path || `hak_photo:${i}`, { ok: false, status: "blocked_terminal", reason: exec.result.status, canonicalResult: exec });
          return;
        }
        if (!isDuplicateCanonicalExec(exec)) {
          const evidenceId = String(exec.result?.events?.find?.((event) => event?.type === "hak:photo-added")?.evidenceId || step.id || step.onceKey || "");
          const item = window.GameStateEngine?.getState?.()?.hak?.photos?.find?.((row) => String(row?.id || "") === evidenceId) || null;
          if (item) {
            bumpAppBadge("hak", 1);
            try { window.StoryBus?.emit?.("hak:photo", item); } catch {}
            try { window.dispatchEvent(new CustomEvent("hak:photo", { detail: item })); } catch {}
          }
        }
        i++;
        continue;
      }

      if (type === "hak_watchlist") {
        setPendingStory({
          kind: "resume",
          path: storyPath,
          storyPath,
          index: i,
          contactId: contactId || "",
          runId: Math.max(0, Number((window.Game || {})._storyRunId || 0) || 0),
          reason: "hak_watchlist_resume",
          forceIndex: true,
          ts: Date.now(),
          // Unlike a normal per-contact "paused_turn" resume (which is
          // deliberately only resumed when the player opens that specific
          // conversation), the HAK watchlist overlay has no owning
          // conversation to reopen -- it is a global, scene-agnostic
          // interruption. If the app is closed/reloaded while this overlay
          // is showing (a real save, relaunch, or crash), nothing else ever
          // re-presents it: the resume lifecycle IS the presentation.
          // Game.autoResumePendingStory's scene-mount "kick" is the only
          // mechanism that can fire this back up on cold boot, and it
          // requires navigationPolicy:"auto_open" + startWhenScene to pass
          // its gates (same opt-in contract queuePendingStoryStart's
          // "dispatch" entries use). This story always reaches
          // hak_watchlist after a goHome time_card transition, so "home" is
          // the correct, non-special-cased expected scene.
          navigationPolicy: "auto_open",
          startWhenScene: "home"
        });
        // First canonical pass persists the explicit pending HAK interaction
        // at this story position. A remount/save/restart can therefore
        // reconstruct the watchlist instead of relying on this renderer's
        // local overlay instance.
        const pendingHak = await executeCanonicalProgressionStep({
          storyPath, contactId, userIntent: {}, targetPath: canonicalPathKeyOf(step),
          allowReclaim: opts.allowConversationInterrupt === true
        });
        if (pendingHak.handled && pendingHak.result && pendingHak.result.status !== "INPUT_REQUIRED" && !pendingHak.result.ok && !isDuplicateCanonicalExec(pendingHak)) {
          pauseForCanonicalCommitFailure(Game, storyPath, contactId, i, opts, runId, pendingHak.path || `hak_watchlist:${i}`, { ok: false, status: "blocked_terminal", reason: pendingHak.result.status, canonicalResult: pendingHak });
          return;
        }
        const selected = await runHakWatchlist(step);
        const committedHak = await executeCanonicalProgressionStep({
          storyPath, contactId, userIntent: { hakWatchlistSelected: selected }, targetPath: canonicalPathKeyOf(step),
          allowReclaim: opts.allowConversationInterrupt === true
        });
        if (committedHak.handled && committedHak.result && !committedHak.result.ok && !isDuplicateCanonicalExec(committedHak)) {
          pauseForCanonicalCommitFailure(Game, storyPath, contactId, i, opts, runId, committedHak.path || `hak_watchlist:${i}`, { ok: false, status: "blocked_terminal", reason: committedHak.result.status, canonicalResult: committedHak });
          return;
        }
        clearIfDecisionCacheKeys({});
        emitWatchlistChanged(step.storeKey || step.key || HAK_WATCHLIST_DEFAULT_KEY, selected);
        try { window.dispatchEvent(new CustomEvent("hak:characters-chosen")); } catch {}
        if (step?.revealApp === true || step?.revealHakApp === true) revealHakAppOnHome();
        clearPendingStory();
        // The DAY2 HAK boot watchlist is presented on Home. Once the real
        // selection commits there is no conversation-scene runner left to
        // take another loop turn, so advance an immediately-following time
        // card through the same canonical interpreter before returning.
        // This is structural for any HAK watchlist -> time_card sequence.
        const followingStep = steps[i + 1] || null;
        const followingType = canonicalId(String(followingStep?.type || ""));
        if (canonicalId(getCurrentSceneName()) !== "conversation" && followingType === "time_card") {
          const nextExec = await executeCanonicalProgressionStep({
            storyPath, contactId, userIntent: {}, targetPath: canonicalPathKeyOf(followingStep),
            allowReclaim: opts.allowConversationInterrupt === true
          });
          if (nextExec.handled && nextExec.result && !nextExec.result.ok && !isDuplicateCanonicalExec(nextExec)) {
            pauseForCanonicalCommitFailure(Game, storyPath, contactId, i + 1, opts, runId, nextExec.path || `time_card:${i + 1}`, { ok: false, status: "blocked_terminal", reason: nextExec.result.status, canonicalResult: nextExec });
            return;
          }
          const title = tplText(followingStep.text || "");
          const goHome = !!followingStep.goHome;
          const chainPath = normalizeStoryPath(followingStep.startStory || followingStep.storyPath || followingStep.story || (goHome ? storyJson?.onCompleteStartStory || "" : ""));
          if (goHome) {
            const checkpoint = buildChapterCheckpointFromTransition({ currentStoryPath: storyPath, transitionTitle: title, targetStoryPath: chainPath, at: Date.now() });
            if (checkpoint) await upsertChapterCheckpoint(checkpoint);
          }
          await showTimeCard(title, { goHome, startStory: chainPath, startDelayMs: Math.max(0, Number(followingStep.startDelayMs ?? followingStep.chainDelayMs ?? 0) || 0) });
          markTimeCardDone(storyPath, storyJson?.onceKey || "", contactId, i + 1);
          return;
        }
        i++;
        continue;
      }

      // ✅ HAK GATE
      if (type === "hak_gate") {
        const exec = await executeCanonicalProgressionStep({
          storyPath, contactId, userIntent: {}, targetPath: canonicalPathKeyOf(step),
          allowReclaim: opts.allowConversationInterrupt === true
        });
        if (exec.handled && exec.result && !exec.result.ok && !isDuplicateCanonicalExec(exec)) {
          pauseForCanonicalCommitFailure(Game, storyPath, contactId, i, opts, runId, exec.path || `hak_gate:${i}`, { ok: false, status: "blocked_terminal", reason: exec.result.status, canonicalResult: exec });
          return;
        }
        clearPendingStory();
        if (storyJson?.onceKey) markOnce(storyJson.onceKey);
        // Canonical completion bridge (see the header comment above
        // completeCanonicalStory): a notification/evidence-gated target is
        // NOT a continuation the engine should activate now -- the target
        // story only gets a lease when checkHakGateAndMaybeStart's own later
        // Game.startStory call resolves it (by then acquiring a fresh lease
        // the normal way), potentially long after other conversations have
        // held and released their own leases in between. Activating it here
        // would leave this conversation's target claimed as "the" active
        // canonical story indefinitely, blocking every other lease
        // acquisition until the gate happens to clear -- continuation:null
        // (this story's own lease released now, same as dev_message/
        // snapgram_gate) is the correct canonical shape for this gate, same
        // as it was before this call existed; the deferred target itself
        // stays tracked in hak_gate_v1 (setHakGate above), the same
        // lease-independent record checkHakGateAndMaybeStart already reads.
        completeCanonicalStory(storyPath, contactId || null, storyJson?.onceKey || "");

        // if already seen (ex: load save after viewing), trigger immediately
        checkHakGateAndMaybeStart();
        return;
      }

      if (type === "dev_message") {
        clearPendingStory();
        if (storyJson?.onceKey) markOnce(storyJson.onceKey);
        completeCanonicalStory(storyPath, contactId || null, storyJson?.onceKey || "");

        const ok = showDevOverlay(step);
        if (!ok) {
          await uiAlert(String(step?.text || "Demo finished."), { title: "Notice" });
          if (step?.goHome && typeof window.navigateToScene === "function") window.navigateToScene("home");
        }
        return;
      }

      if (type === "snapgram_gate") {
        try {
          const gate = {
            required: Array.isArray(step.required) ? step.required : [],
            startStory: String(step.startStory || "").trim(),
            createdAt: Date.now(),
            from: String(storyJson?.onceKey || "").trim()
          };
          safeSetLS("ig_gate_v1", JSON.stringify(gate));
        } catch {}

        clearPendingStory();
        if (storyJson?.onceKey) markOnce(storyJson.onceKey);
        completeCanonicalStory(storyPath, contactId || null, storyJson?.onceKey || "");
        return;
      }

      if (type === "next_day") {
        canonicalDayTimeCard = { ...step };
        canonicalDayTransition = Number(step.day) || explicitChapterDayNumber(step.text) || Number(window.GameStateEngine?.getWorldDay?.() || 0) + 1;
        const nextDayStoryPath = normalizeStoryPath(step.startStory || step.storyPath || step.story || storyJson?.onCompleteStartStory || "");
        if (nextDayStoryPath) {
          resolvedContinuationOverride = await resolveContinuationTarget(nextDayStoryPath, contactId);
          queuedChainThisRun = true;
        }
        await showTimeCard(tplText(step.text || "THE NEXT DAY"), {
          goHome: true,
          startStory: nextDayStoryPath,
          startDelayMs: Math.max(0, Number(step.startDelayMs ?? 0) || 0)
        });
        i++;
        continue;
      }

      if (type === "start_story") {
        const goHome = !!step.goHome;
        const nextStoryPath = normalizeStoryPath(step.startStory || step.storyPath || step.story || "");
        if (nextStoryPath) {
          const queued = queueStoryCompletionIntent(nextStoryPath, {
            sourceStoryPath: storyPath, sourceOnceKey: storyJson?.onceKey || "",
            sourceContactId: contactId || "", startWhenScene: goHome ? "home" : "",
            opts: {allowInConversation: true}
          });
          if (!queued) {
            try { console.error("[CHAIN][ERROR] completion intent could not be recorded " + JSON.stringify({sourceStoryPath: storyPath, targetStoryPath: nextStoryPath, execution: window.GameStateEngine?.getExecutionState?.(), pending: window.GameStateEngine?.getPendingStory?.()})); } catch {}
            return;
          }
          queuedChainThisRun = true;
        }
        if (goHome && typeof window.navigateToScene === "function") {
          try { window.navigateToScene("home"); } catch {}
        }
        // start_story terminates the selected authored branch, as the canonical interpreter does.
        break;
      }

      if (type === "time_card") {
        const goHome = !!step.goHome;
        const title = tplText(step.text || "");
        const stepStartStory = normalizeStoryPath(step.startStory || step.storyPath || step.story || "");
        const fallbackChainPath = goHome ? normalizeStoryPath(storyJson?.onCompleteStartStory || "") : "";
        const chainPath = stepStartStory || fallbackChainPath;
        const stepTransitionDay = Number(step.day) || Number(String(title).match(/\bDAY\s*(\d{1,2})\b/i)?.[1]) || Number(String(chainPath).match(/(?:^|\/)DAY(\d{1,2})(?:\/|_)/i)?.[1]) || 0;
        if (stepTransitionDay > chapterDayNumberFromStoryPath(storyPath)) {
          canonicalDayTimeCard = { ...step };
          canonicalDayTransition = stepTransitionDay;
        }
        const startDelayMs = Math.max(0, Number(step.startDelayMs ?? step.chainDelayMs ?? 0) || 0);
        const alreadyDone = !chapterLoadBypass && isTimeCardDone(storyPath, storyJson?.onceKey || "", contactId, i);

        if (alreadyDone) {
          if (chainPath) {
            resolvedContinuationOverride = await resolveContinuationTarget(chainPath, contactId);
            queuedChainThisRun = true;
            if (goHome) {
              const checkpoint = buildChapterCheckpointFromTransition({
                currentStoryPath: storyPath,
                transitionTitle: title,
                targetStoryPath: chainPath,
                at: Date.now()
              });
              try {
                if (checkpoint) await upsertChapterCheckpoint(checkpoint);
              } catch {}
            }
            clearRuntimeTurnForStory(storyPath, contactId || "", "time_card_already_done");
            const deferredChainMeta = {
              from: storyJson?.onceKey || storyPath || "",
              via: "time_card",
              chainSource: "time_card_already_done",
              strictRequestedPath: true,
              sourceContactId: contactId || "",
              startWhenScene: goHome ? "home" : "",
              startDelayMs
            };
            setTimeout(() => {
              const game = (window.Game ||= {});
              const queueFallback = () => {
                setPendingChainStory(chainPath, deferredChainMeta);
                try { game.resumePendingStory?.({ source: "time_card_already_done_fallback", auto: true }); } catch {}
              };
              try {
                const startOpts = {
                  ...buildChainStartOpts(deferredChainMeta),
                  from: "time_card_already_done",
                  reason: "time_card_already_done"
                };
                const started = game.startStory?.(chainPath, startOpts);
                Promise.resolve(started)
                  .then((ok) => {
                    if (ok === false) queueFallback();
                  })
                  .catch(() => queueFallback());
              } catch {
                queueFallback();
              }
            }, startDelayMs);
          }
          i++;
          if (contactId) setContactProgress(contactId, storyPath, i);
          continue;
        }

        try {
          console.info("[ConvoRuntime][time_card] reached", {
            storyPath,
            index: i,
            title,
            goHome,
            stepStartStory,
            onCompleteStartStory: String(storyJson?.onCompleteStartStory || "").trim()
          });
        } catch {}

        if (goHome) {
          const checkpoint = buildChapterCheckpointFromTransition({
            currentStoryPath: storyPath,
            transitionTitle: title,
            targetStoryPath: chainPath,
            at: Date.now()
          });
          try {
            if (checkpoint) await upsertChapterCheckpoint(checkpoint);
          } catch {}
        }
        if (chainPath) {
          clearRuntimeTurnForStory(storyPath, contactId || "", "time_card_chain_handoff");
        }

        try {
          await showTimeCard(title, {
            goHome,
            startStory: chainPath,
            startDelayMs
          });
        } catch (err) {
          try { console.error("[ConvoRuntime][time_card] showTimeCard failed", { title, err }); } catch {}
        }

        markTimeCardDone(storyPath, storyJson?.onceKey || "", contactId, i);

        if (chainPath) {
          resolvedContinuationOverride = await resolveContinuationTarget(chainPath, contactId);
          queuedChainThisRun = true;
        }
        i++;
        if (contactId) setContactProgress(contactId, storyPath, i);
        continue;
      }

      if (type === "glitch") {
        playGlitchStep(step);
        if (step?.wait === true || step?.blocking === true || step?.await === true) {
          const waitForMs = Number(step.ms ?? step.duration ?? 420) || 420;
          await waitMs(waitForMs + 70);
        }
        i++;
        continue;
      }

      if (type === "hak_unlock") {
        const exec = await executeCanonicalProgressionStep({
          storyPath, contactId, userIntent: {}, targetPath: canonicalPathKeyOf(step),
          allowReclaim: opts.allowConversationInterrupt === true
        });
        if (exec.handled && exec.result && !exec.result.ok && !isDuplicateCanonicalExec(exec)) {
          pauseForCanonicalCommitFailure(Game, storyPath, contactId, i, opts, runId, exec.path || `hak_unlock:${i}`, { ok: false, status: "blocked_terminal", reason: exec.result.status, canonicalResult: exec });
          return;
        }
        if (isDuplicateCanonicalExec(exec)) { i++; continue; }
        await runHakUnlockStep(step);
        i++;
        continue;
      }

      if (type === "hak_overlay") {
        const exec = await executeCanonicalProgressionStep({
          storyPath, contactId, userIntent: {}, targetPath: canonicalPathKeyOf(step),
          allowReclaim: opts.allowConversationInterrupt === true
        });
        if (exec.handled && exec.result && !exec.result.ok && !isDuplicateCanonicalExec(exec)) {
          pauseForCanonicalCommitFailure(Game, storyPath, contactId, i, opts, runId, exec.path || `hak_overlay:${i}`, { ok: false, status: "blocked_terminal", reason: exec.result.status, canonicalResult: exec });
          return;
        }
        // The overlay queue itself has no dedup (pushing the same payload
        // twice would show it twice) -- the canonical commit above is what
        // makes this exactly-once now, gating the actual enqueue rather
        // than relying on the queue to self-protect.
        if (!isDuplicateCanonicalExec(exec)) await runHakOverlayStep(step);
        i++;
        continue;
      }

      if (type === "onlyfun_post") {
        const exec = await executeCanonicalProgressionStep({
          storyPath, contactId, userIntent: {}, targetPath: canonicalPathKeyOf(step),
          allowReclaim: opts.allowConversationInterrupt === true
        });
        if (exec.handled && exec.result && !exec.result.ok && !isDuplicateCanonicalExec(exec)) {
          pauseForCanonicalCommitFailure(Game, storyPath, contactId, i, opts, runId, exec.path || `onlyfun_post:${i}`, { ok: false, status: "blocked_terminal", reason: exec.result.status, canonicalResult: exec });
          return;
        }
        i++;
        continue;
      }

      if (type === "onlyfun_account_unlock") {
        const exec = await executeCanonicalProgressionStep({
          storyPath, contactId, userIntent: {}, targetPath: canonicalPathKeyOf(step),
          allowReclaim: opts.allowConversationInterrupt === true
        });
        if (exec.handled && exec.result && !exec.result.ok && !isDuplicateCanonicalExec(exec)) {
          pauseForCanonicalCommitFailure(Game, storyPath, contactId, i, opts, runId, exec.path || `onlyfun_account_unlock:${i}`, { ok: false, status: "blocked_terminal", reason: exec.result.status, canonicalResult: exec });
          return;
        }
        i++;
        continue;
      }

      if (
        type === "meetandgreet_unlock_app" || type === "meetandgreet_notify" ||
        type === "meetandgreet_profile_unlock" || type === "meetandgreet_photo_add" ||
        type === "meetandgreet_comment_add" || type === "meetandgreet_tip"
      ) {
        const exec = await executeCanonicalProgressionStep({
          storyPath, contactId, userIntent: {}, targetPath: canonicalPathKeyOf(step),
          allowReclaim: opts.allowConversationInterrupt === true
        });
        if (exec.handled && exec.result && !exec.result.ok && !isDuplicateCanonicalExec(exec)) {
          pauseForCanonicalCommitFailure(Game, storyPath, contactId, i, opts, runId, exec.path || `meetandgreet:${i}`, { ok: false, status: "blocked_terminal", reason: exec.result.status, canonicalResult: exec });
          return;
        }
        if (!isDuplicateCanonicalExec(exec) && window.MeetAndGreetSystem && typeof window.MeetAndGreetSystem.executeStep === "function") window.MeetAndGreetSystem.executeStep(step, { source: "convo_runtime_story" });
        i++;
        continue;
      }

      if (type === "instagram_post" || type === "snapgram_post") {
        const exec = await executeCanonicalProgressionStep({
          storyPath, contactId, userIntent: {}, targetPath: canonicalPathKeyOf(step),
          allowReclaim: opts.allowConversationInterrupt === true
        });
        if (exec.handled && exec.result && !exec.result.ok && !isDuplicateCanonicalExec(exec)) {
          pauseForCanonicalCommitFailure(Game, storyPath, contactId, i, opts, runId, exec.path || `ig_post:${i}`, { ok: false, status: "blocked_terminal", reason: exec.result.status, canonicalResult: exec });
          return;
        }
        if (!isDuplicateCanonicalExec(exec)) writeIgPost(withCommittedIgTime(step, exec, storyPath));
        i++;
        continue;
      }
      if (type === "instagram_story") {
        const exec = await executeCanonicalProgressionStep({
          storyPath, contactId, userIntent: {}, targetPath: canonicalPathKeyOf(step),
          allowReclaim: opts.allowConversationInterrupt === true
        });
        if (exec.handled && exec.result && !exec.result.ok && !isDuplicateCanonicalExec(exec)) {
          pauseForCanonicalCommitFailure(Game, storyPath, contactId, i, opts, runId, exec.path || `ig_story:${i}`, { ok: false, status: "blocked_terminal", reason: exec.result.status, canonicalResult: exec });
          return;
        }
        if (!isDuplicateCanonicalExec(exec)) writeIgStory(withCommittedIgTime(step, exec, storyPath));
        i++;
        continue;
      }
      // "story" (bare alias, distinct from the canonical "instagram_story"
      // type above) is NOT a recognized interpreter step type -- left on the
      // legacy path unchanged rather than risking a CATCHUP_UNSUPPORTED
      // throw for whatever real or historical content still uses it.
      if (type === "story") { writeIgStory(step); i++; continue; }

      if (type === "gallery_add") {
        const url = String(step?.photo?.url || step?.url || step?.src || "").trim();
        const ownerNameRaw = String(
          step?.photo?.ownerName ||
          step?.ownerName ||
          step?.photo?.characterName ||
          step?.characterName ||
          step?.photo?.contactName ||
          step?.contactName ||
          step?.fromName ||
          step?.name ||
          ""
        ).trim();
        const ownerId = canonicalGalleryOwnerId(
          step?.photo?.ownerId ||
          step?.ownerId ||
          step?.photo?.characterId ||
          step?.characterId ||
          step?.photo?.contactId ||
          step?.contactId ||
          step?.fromId ||
          step?.from ||
          "",
          ownerNameRaw
        );
        const source = String(step?.photo?.src || step?.src || "story").trim() || "story";
        const p = url ? {
          id: (crypto?.randomUUID ? crypto.randomUUID() : (`p_${Date.now()}_${Math.random().toString(16).slice(2)}`)),
          url,
          w: Number(step?.photo?.w || step?.w || 0) || 0,
          h: Number(step?.photo?.h || step?.h || 0) || 0,
          at: Date.now(),
          src: source,
          ownerId,
          ownerName: ownerId ? resolveStepDisplayName(ownerId, ownerNameRaw) : ""
        } : null;
        if (p) {
          const exec = await executeCanonicalProgressionStep({
            storyPath, contactId, userIntent: {}, targetPath: canonicalPathKeyOf(step),
            allowReclaim: opts.allowConversationInterrupt === true
          });
          if (exec.handled && exec.result && !exec.result.ok && !isDuplicateCanonicalExec(exec)) {
            pauseForCanonicalCommitFailure(Game, storyPath, contactId, i, opts, runId, exec.path || `gallery_add:${i}`, { ok: false, status: "blocked_terminal", reason: exec.result.status, canonicalResult: exec });
            return;
          }
          if (!isDuplicateCanonicalExec(exec)) saveToGallery(p);
        }
        i++;
        continue;
      }

      i++;
    }

    const completionIntent = getStoryCompletionIntent(storyPath, storyJson?.onceKey || "");
    const chainNextPath = String(completionIntent?.path || storyJson?.onCompleteStartStory || "").trim();
    const completionEngine = window.GameStateEngine;
    const completionIdentity = completionEngine?.getRuntimeLifecycleIdentity?.();
    const completionLeaseId = completionEngine?.getExecutionState?.().lease?.id;
    const chainContinuation = resolvedContinuationOverride || (chainNextPath ? await resolveContinuationTarget(chainNextPath, contactId) : null);
    const currentCompletionIdentity = completionEngine?.getRuntimeLifecycleIdentity?.();
    if (window.GameStateEngine !== completionEngine || JSON.stringify(completionIdentity) !== JSON.stringify(currentCompletionIdentity) || completionEngine?.getExecutionState?.().lease?.id !== completionLeaseId) return;
    if (completionIntent) queuedChainThisRun = true;
    clearPendingStory();
    if (storyJson?.onceKey) markOnce(storyJson.onceKey);
    completeCanonicalStory(storyPath, contactId || null, storyJson?.onceKey || "", chainContinuation, canonicalDayTransition, canonicalDayTimeCard);
    scheduleContinuationWatchdog(storyPath, storyJson?.onceKey || "", chainContinuation, contactId || "");
    // An in-script start_story can activate the target continuation while
    // its eager resume attempt still sees the source lease. Once this runner
    // unwinds, ensure the newly active target has a real walker attached.
    // The recovery is idempotent and exits immediately if the normal queued
    // resume already attached one.
    if (chainContinuation?.targetStoryPath) {
      setTimeout(() => {
        attemptStrandedInterpreterRecovery("continuation_activated").catch(() => {});
      }, 160);
      const activated = window.GameStateEngine?.getExecutionState?.();
      const activatedLeaseId = String(activated?.lease?.id || "");
      const activatedRootIndex = activated?.cursor?.rootIndex ?? null;
      setTimeout(() => {
        try {
          const current = window.GameStateEngine?.getExecutionState?.();
          const unchanged = activatedLeaseId
            && String(current?.lease?.id || "") === activatedLeaseId
            && (current?.cursor?.rootIndex ?? null) === activatedRootIndex
            && current?.cursor?.phase === "ready_to_interpret";
          if (!unchanged || getCurrentSceneName() !== "home" || readPendingStory()) return;
          if (window.Game?._activeRunner === "background" && window.Game?._activeStoryPath === current.activeStoryPath) {
            window.Game._activeRunner = null;
          }
          attemptStrandedInterpreterRecovery("continuation_activated").catch(() => {});
        } catch {}
      }, 900);
    }
    // Root cause of the confirmed Day16 Hailey LOVE silent-stall class: a
    // same-contact chain (target's own contactId equals the JUST-COMPLETED
    // story's contactId, i.e. it continues the exact conversation the
    // player is already reading) must not self-block on the
    // "conversation_open" guard inside this file's runSteps loop below --
    // that guard exists to protect a DIFFERENT contact's thread from being
    // force-rendered into while the player is looking elsewhere, not this
    // one. skipStoryForDisabledCharacter's chain already threads
    // allowInConversation through for exactly this reason (see
    // buildChainStartOpts' header comment); the plain onCompleteStartStory
    // chain below never did. See memory
    // feature4-day16-love-dual-continuation-authority-race.md.
    const sameContactContinuation = !!(
      contactId && chainContinuation?.contactId &&
      canonicalId(chainContinuation.contactId) === canonicalId(contactId)
    );

    const allowDirectChain = opts.timelineReplayChain === true;
    if (!queuedChainThisRun && storyJson?.onCompleteStartStory && typeof (window.Game ||= {}).startStory === "function") {
      const nextPath = chainNextPath;
      if (nextPath) {
        try {
          console.info(`[CHAIN] finishing story: ${storyPath || storyJson.onceKey || "(unknown)"}`, {
            onceKey: String(storyJson.onceKey || "").trim()
          });
          console.info(`[CHAIN] onCompleteStartStory target: ${nextPath}`);
          console.info("[ConvoRuntime][chain] onCompleteStartStory queued", {
            from: storyJson.onceKey || "",
            nextPath
          });
        } catch {}
        if (allowDirectChain) {
          setPendingChainStory(nextPath, {
            from: storyJson.onceKey || "",
            via: "on_complete",
            chainSource: "onCompleteStartStory",
            strictRequestedPath: true,
            sourceContactId: contactId || "",
            opts: sameContactContinuation ? { allowInConversation: true } : undefined
          });
          setTimeout(() => {
            try { (window.Game ||= {}).resumePendingStory?.({ source: "on_complete" }); } catch {}
          }, 120);
        } else {
          try {
            queuedChainThisRun = true;
            // setPendingChainStory/buildChainStartOpts read these UNPREFIXED
            // (chainSource/strictRequestedPath/sourceContactId -- see the
            // allowDirectChain branch above, which already uses this exact
            // convention). Double-underscore-prefixed keys here were silently
            // dropped by buildChainStartOpts, so a chained story lost its
            // strict-path resolution and __chainFromContactId bookkeeping on
            // every non-timeline-replay onComplete chain.
            setPendingChainStory(nextPath, {
              from: storyJson.onceKey || "",
              reason: "on_complete",
              via: "onCompleteStartStory",
              chainSource: "onCompleteStartStory",
              allowConversationInterrupt: true,
              strictRequestedPath: true,
              sourceContactId: contactId || "",
              opts: sameContactContinuation ? { allowInConversation: true } : undefined
            });
            setTimeout(() => {
              try { (window.Game ||= {}).resumePendingStory?.({ source: "conversation_on_complete" }); } catch {}
            }, 120);
          } catch (err) {
            try {
              console.error("[CHAIN][ERROR] background chain failed", {
                storyPath,
                nextPath,
                onceKey: String(storyJson.onceKey || "").trim(),
                err
              });
            } catch {}
          }
        }
      }
    }
    if (!queuedChainThisRun && !storyJson?.onCompleteStartStory) {
      clearRuntimeTurnForStory(storyPath, contactId || "", "runtime_story_complete");
    }
    } finally {
      if (runId === 0 || Math.max(0, Number(Game._storyRunId || 0) || 0) === runId) {
        if (Game._activeRunner === "background") Game._activeRunner = null;
        if (normalizeStoryPath(Game._activeStoryPath || "") === normalizedStoryPath) {
          Game._activeStoryPath = null;
        }
      }
    }
  }

  const Game = (window.Game ||= {});
  Game.resolveDisplayName = resolveDisplayName;
  Game.runHakWatchlist = function runHakWatchlistPublic(step = {}) {
    return runHakWatchlist(step);
  };
  Game.openHakCharacterSelection = function openHakCharacterSelectionPublic(opts = {}) {
    return openHakCharacterSelection(opts || {});
  };

  function activeConversationId() {
    return resolveContactId(safeGetLS("openConversationId") || safeGetLS("activeConversationId") || "", "");
  }

  function storyPathsEqual(a, b) {
    // Case-insensitive: multiple code paths this session have been found to
    // produce differently-cased (but otherwise identical) story path
    // strings for the exact same story (e.g. a fully-lowercased variant
    // reaching GameStateEngine.execution.activeStoryPath versus the
    // authored-case path conversation.html's choice handler reads back from
    // its own conv_story_<id> mirror) -- no two distinct authored stories
    // in this codebase are ever distinguished ONLY by case, so treating a
    // case difference as "a different story" is never correct and was the
    // root cause of every real choice-commit on DAY3_01_LENA_TICKETS being
    // rejected as LEASE_UNAVAILABLE (ensureCanonicalStoryLease's reuse check
    // used a strict === before this fix).
    return normalizeStoryPath(a).toLowerCase() === normalizeStoryPath(b).toLowerCase();
  }

  function clearConversationProgressByStory(storyKey) {
    const wanted = normalizeStoryPath(storyKey);
    if (!wanted) return [];

    const removed = [];
    const keys = listLocalStorageKeys();
    for (const key of keys) {
      if (!String(key).startsWith("conv_story_")) continue;
      const cid = String(key).slice("conv_story_".length).trim();
      if (!cid) continue;
      const storedStory = String(safeGetLS(key) || "").trim();
      if (!storyPathsEqual(storedStory, wanted)) continue;
      removed.push(...removeKeys([`conv_progress_${cid}`]));
    }
    return removed;
  }

  function clearConversationEpisodeRows(contactId, onceKey) {
    const cid = canonicalId(contactId || "");
    const ok = canonicalId(onceKey || "");
    if (!cid || !ok) return 0;

    const episodeId = makeEpisodeId(ok);
    if (!episodeId) return 0;

    const store = readConversationStore();
    const conv = store && store[cid] ? store[cid] : null;
    if (!conv || !Array.isArray(conv.messages)) return 0;

    const beforeLen = conv.messages.length;
    conv.messages = conv.messages.filter((row) => {
      const rowEpisode = String(row?.episodeId || row?.episode || "").trim();
      return rowEpisode !== episodeId;
    });
    const removed = Math.max(0, beforeLen - conv.messages.length);
    if (!removed) return 0;

    conv.messages = trimThreadMessages(conv.messages, MAX_THREAD_HISTORY);
    store[cid] = conv;
    writeConversationStore(store);
    return removed;
  }

  function debugResetConversationProgress(opts = {}) {
    // Keys cleared by this debug helper (targeted):
    // - conv_progress_<contactId> (or contacts matching storyKey if contactId omitted)
    // - conv_story_<contactId> only when opts.clearStoryPointer === true
    // - conv_if_decisions_v1_<contactId>_* (or narrowed to story token when available)
    // - conversation transcript rows tagged with episodeId "once:<onceKey>" when onceKey is provided
    const cid = resolveContactId(
      opts.contactId || opts.id || activeConversationId() || "",
      opts.contactName || ""
    );
    const requestedStory = normalizeStoryPath(opts.storyKey || opts.storyPath || "");
    const onceToken = canonicalId(opts.onceKey || "");
    const storyFromStorage = cid ? String(safeGetLS("conv_story_" + cid) || "").trim() : "";
    const chosenStory = requestedStory || normalizeStoryPath(storyFromStorage);
    const token = onceToken || keyToken(chosenStory || "");

    const clearedProgressKeys = [];
    if (cid) {
      clearedProgressKeys.push(...removeKeys(["conv_progress_" + cid]));
      if (opts.clearStoryPointer === true) {
        clearedProgressKeys.push(...removeKeys(["conv_story_" + cid]));
      }
    } else if (requestedStory) {
      clearedProgressKeys.push(...clearConversationProgressByStory(requestedStory));
    }

    const clearedIfDecisionKeys = clearIfDecisionCacheKeys({
      contactId: cid || "",
      storyToken: token || ""
    });
    const clearedTranscriptRows = (opts.clearTranscript === false)
      ? 0
      : clearConversationEpisodeRows(cid, onceToken);

    const report = {
      ok: true,
      contactId: cid || "",
      storyKey: chosenStory || "",
      clearedProgressKeys,
      clearedIfDecisionKeys,
      clearedTranscriptRows
    };
    ifDebugLog("debug_reset_conversation_progress", report);
    return report;
  }

  function resetHakCharacterSelection(opts = {}) {
    const scope = String(opts.scope || "selection_only").trim() || "selection_only";
    const storedCfg = readStoredHakCharacterSelectionStep();
    const altStoreKey = normalizeWatchlistKey(storedCfg?.storeKey || storedCfg?.key || HAK_WATCHLIST_DEFAULT_KEY);

    // Keys cleared by this reset helper:
    // - hak_targets_v1
    // - hak_watchlist_v1 + hak_watchlist_v1_selected
    // - any extra stored watchlist key from hak_character_selection_config_v1 (+ _selected)
    // - hak_character_selection_config_v1
    // - selection done flags:
    //   hak_character_selection_done_v1, hak_characters_selected_v1, hak_characters_selected,
    //   hak_selection_done, hak_selection_done_v1, hak_onboarding_done, hak_pick_done
    const selectionKeys = [
      HAK_TARGETS_KEY,
      HAK_WATCHLIST_DEFAULT_KEY,
      HAK_WATCHLIST_DEFAULT_KEY + "_selected",
      altStoreKey,
      altStoreKey + "_selected",
      HAK_SELECTION_CONFIG_KEY,
      ...HAK_SELECTION_DONE_ALIASES
    ];

    const clearedSelectionKeys = removeKeys(selectionKeys);
    const clearedIfDecisionKeys = clearIfDecisionCacheKeys({});

    let clearedProgressKeys = [];
    if (scope === "selection_with_active_progress") {
      const activeCid = activeConversationId();
      clearedProgressKeys = activeCid
        ? removeKeys(["conv_progress_" + activeCid])
        : [];
    }

    emitWatchlistChanged(HAK_WATCHLIST_DEFAULT_KEY, []);
    try {
      window.dispatchEvent(new CustomEvent("hak:targetsChanged", {
        detail: { selected: [], source: "reset_hak_character_selection", at: Date.now() }
      }));
    } catch {}

    const report = {
      ok: true,
      scope,
      clearedSelectionKeys,
      clearedIfDecisionKeys,
      clearedProgressKeys
    };
    ifDebugLog("reset_hak_character_selection", report);
    return report;
  }

  Game.resetHakCharacterSelection = function resetHakCharacterSelectionPublic(opts = {}) {
    return resetHakCharacterSelection(opts || {});
  };
  Game.debugResetConversationProgress = function debugResetConversationProgressPublic(opts = {}) {
    return debugResetConversationProgress(opts || {});
  };
  Game.getBuildRelease = function getBuildReleasePublic() {
    return getBuildRelease();
  };
  Game.getPatreonUnlockRelease = function getPatreonUnlockReleasePublic() {
    return getPatreonUnlockRelease();
  };
  Game.setPatreonUnlockRelease = function setPatreonUnlockReleasePublic(value) {
    return setPatreonUnlockRelease(value);
  };
  Game.clearPatreonUnlockRelease = function clearPatreonUnlockReleasePublic() {
    return clearPatreonUnlockRelease();
  };
  Game.getContentAccessConfig = function getContentAccessConfigPublic() {
    return CONTENT_ACCESS_CONFIG;
  };
  Game.hasPatreonUnlock = function hasPatreonUnlockPublic() {
    return hasPatreonUnlock();
  };
  Game.hasDevUnlock = function hasDevUnlockPublic() {
    return hasDevUnlock();
  };
  Game.hasGalleryFullUnlock = function hasGalleryFullUnlockPublic() {
    return hasGalleryFullUnlock();
  };
  Game.hasPremiumUnlock = function hasPremiumUnlockPublic() {
    return hasPremiumUnlock();
  };
  Game.hasPatreonMasterUnlock = function hasPatreonMasterUnlockPublic() {
    return hasPatreonMasterUnlock();
  };
  Game.unlockPatreonMaster = function unlockPatreonMasterPublic() {
    return unlockPatreonMaster();
  };
  Game.clearPatreonMasterUnlock = function clearPatreonMasterUnlockPublic() {
    return clearPatreonMasterUnlock();
  };
  Game.getAccessCodes = function getAccessCodesPublic() {
    return getAccessCodes();
  };
  Game.applyAccessCode = function applyAccessCodePublic(code, context = "premium") {
    return applyAccessCode(code, context);
  };
  Game.submitPatreonCode = function submitPatreonCodePublic(code, context = "premium") {
    return submitPatreonCode(code, context);
  };
  Game.openPatreonCodeModal = function openPatreonCodeModalPublic(opts = {}) {
    return openPatreonCodeModal(opts || {});
  };
  Game.isPremiumStory = function isPremiumStoryPublic(entryOrPath) {
    return isPremiumStory(entryOrPath);
  };
  Game.isFreeStory = function isFreeStoryPublic(entryOrPath) {
    return isFreeStory(entryOrPath);
  };
  Game.canAccessStory = function canAccessStoryPublic(entryOrPath) {
    return canAccessStory(entryOrPath);
  };
  Game.showPremiumStoryGate = function showPremiumStoryGatePublic(storyPath, opts = {}, meta = {}) {
    return showPremiumStoryGate(storyPath, opts || {}, meta || {});
  };
  Game.getStoryOwnerId = function getStoryOwnerIdPublic(storyJson, options = {}) {
    return getStoryOwnerId(storyJson, options || {});
  };
  Game.isStoryOwnedByDisabledCharacter = function isStoryOwnedByDisabledCharacterPublic(storyJson, options = {}) {
    return isStoryOwnedByDisabledCharacter(storyJson, options || {});
  };
  Game.shouldHideCharacterFromUI = function shouldHideCharacterFromUIPublic(rawId) {
    return shouldHideCharacterFromUI(rawId);
  };
  Game.sanitizeDisabledCharacterConversationState = function sanitizeDisabledCharacterConversationStatePublic(opts = {}) {
    return sanitizeDisabledCharacterConversationState(opts || {});
  };

  // expose gate checker + listen for HAK scene event
  Game.checkHakGate = checkHakGateAndMaybeStart;
  try { window.StoryBus?.on?.("hak:seen", checkHakGateAndMaybeStart); } catch {}
  try { window.addEventListener("hak:seen", checkHakGateAndMaybeStart); } catch {}
  try { installChapterDayTransitionHook(); } catch {}
  try { installChapterTimeCardHook(); } catch {}
  try {
    Game.__chapterDayBoundaryStartupSave = retryPendingChapterBoundary();
    Promise.resolve(Game.__chapterDayBoundaryStartupSave).catch(error => console.warn("[Chapters] pending boundary retry failed", error));
  } catch {}
  try { window.addEventListener("scene:mounted", installChapterTimeCardHook); } catch {}
  try {
    window.addEventListener("cinematic:lock-changed", (ev) => {
      const locked = !!(ev?.detail?.locked);
      if (locked) return;
      setTimeout(() => {
        try { (window.Game ||= {}).resumePendingStory?.({ source: "cinematic_unlock", auto: true }); } catch {}
      }, 0);
    });
  } catch {}

  Game.addChapterCheckpoint = function addChapterCheckpointPublic(payload = {}) {
    return upsertChapterCheckpoint({
      title: payload?.title,
      storyPath: payload?.storyPath,
      startStory: payload?.startStory,
      nextStory: payload?.nextStory,
      startIndex: payload?.startIndex,
      at: payload?.at
    });
  };

  Game.getChapters = function getChaptersPublic() {
    return listChapters();
  };

  Game.getChaptersTree = function getChaptersTreePublic() {
    return readChaptersState();
  };

  Game.startChapter = function startChapterPublic(chapterOrId) {
    const wantId = (typeof chapterOrId === "string") ? String(chapterOrId).trim() : "";
    const tree = readChaptersState();
    const fromTree = wantId ? tree?.nodes?.[wantId] : null;
    const chapter =
      (chapterOrId && typeof chapterOrId === "object")
        ? chapterOrId
        : fromTree || listChapters().find((it) => String(it?.id || "") === wantId);

    const storyPath = String(chapter?.storyPath || "").trim();
    const startIndex = Math.max(0, Number(chapter?.startIndex || 0) || 0);
    if (!storyPath || typeof Game.startStory !== "function") return false;
    clearPendingForChapterStart();
    return Game.startStory(storyPath, {
      startIndex,
      fromChapter: true,
      forceStoryRestart: true,
      allowConversationInterrupt: true,
      __strictRequestedPath: true,
      reason: "chapter_load"
    });
  };

  // Feature 4: shared canonical message-commit entry point so both the background
  // runSteps engine and the interactive conversation.html renderer commit through
  // the exact same GameStateEngine authority, using the same deterministic eventId
  // scheme (see makeConversationStepEventId in conversation.html), so the engine's
  // own duplicate-event rejection is what makes cross-mode "committed once" hold.
  Game.commitCanonicalMessage = commitCanonicalMessage;
  // Same sharing rationale as commitCanonicalMessage: the conversation scene's
  // own completion chokepoint (onConversationFinished) calls this so canonical
  // story completion -- and therefore lease release -- is owned by one place
  // regardless of which renderer (background or interactive) detects the
  // story finishing.
  Game.persistCanonicalStoryMediaToGallery = persistCanonicalStoryMediaToGallery;
  Game.reconcileCanonicalHakEvidenceGallery = reconcileCanonicalHakEvidenceGallery;
  Game.reconcileCanonicalStoryMediaGallery = reconcileCanonicalStoryMediaGallery;
  Game.completeCanonicalStory = completeCanonicalStory;
  Game.resolveContinuationTarget = resolveContinuationTarget;
  Game.resolveCompletedCanonicalChainTarget = resolveCompletedCanonicalChainTarget;
  Game.resolveCanonicalChainSuccessor = resolveCanonicalChainSuccessor;
  Game.queueStoryCompletionIntent = queueStoryCompletionIntent;
  Game.getStoryCompletionIntent = getStoryCompletionIntent;
  Game.requestStartAdmission = requestStartAdmission;
  // Group 6 (protected-write elimination): the canonical onceKey ledger
  // (progression.onceKeys, via MARK_ONCE) already exists and is already the
  // primary source markOnce/onceDone check first -- exposing them lets other
  // renderer surfaces (scenes/conversation.html) stop keeping their own
  // parallel once_<key>/__once:<key> localStorage writes as their ONLY
  // record of "did this already happen," instead of duplicating it locally.
  Game.markOnce = markOnce;
  Game.onceDone = onceDone;
  Game.setContactProgress = setContactProgress;
  Game.getStoredProgress = getStoredProgress;
  // Same sharing rationale: scenes/conversation.html has several of its own
  // pending-story write/clear sites (hak tutorial resume, post-conversation
  // tutorial queue, ...) that duplicated this exact PENDING_KEY storage
  // logic inline instead of going through the one implementation this file's
  // own boot-chain retry mechanism (queuePendingStoryStart, resumePendingStory,
  // schedulePendingRetry, ...) already uses and already has real test coverage
  // for. Exposing these lets conversation.html stop duplicating the write --
  // the underlying storage operation is unchanged, only where it is called from.
  Game.setPendingStory = setPendingStory;
  Game.writePendingStory = writePendingStory;
  Game.findNextLogicalStoryAfterCompleted = findNextLogicalStoryAfterCompleted;
  Game.repairLogicalIdleContinuationGap = repairLogicalIdleContinuationGap;
  Game.readPendingStory = readPendingStory;
  Game.clearPendingStory = clearPendingStory;
  // Generic pending-interaction slot (see the comment on readPendingInteraction
  // above) -- scenes/conversation.html's rename overlay is the first
  // consumer, but this is deliberately not rename-specific.
  Game.readPendingInteraction = readPendingInteraction;
  Game.writePendingInteraction = writePendingInteraction;
  Game.clearPendingInteraction = clearPendingInteraction;
  // Same sharing rationale: set_flag's interactive handler (conversation.html
  // renderStep) commits through this instead of a second, parallel
  // implementation of the world.variables write.
  Game.commitCanonicalVariable = commitCanonicalVariable;
  // Same sharing rationale: conversation.html's resolveIfDecision (the
  // interactive counterpart of resolveIfStepDecision here) commits through
  // this instead of independently dispatching RECORD_BRANCH_DECISION.
  Game.commitCanonicalBranchDecision = commitCanonicalBranchDecision;
  Game.makeBranchDecisionId = makeBranchDecisionId;
  // Canonical execution cursor helpers (see the header comment above
  // canonicalLabelIndexFor): conversation.html's interactive renderer shares
  // these instead of computing __ifPath-derived positions a second way.
  Game.commitCanonicalCursorStep = commitCanonicalCursorStep;
  Game.canonicalPositionOf = canonicalPositionOf;
  Game.canonicalPathKeyOf = canonicalPathKeyOf;
  Game.canonicalNextPositionAfter = canonicalNextPositionAfter;
  Game.canonicalCursorPatch = canonicalCursorPatch;
  Game.recordCanonicalBlockedState = recordCanonicalBlockedState;
  Game.legacyIndexForCanonicalRoot = legacyIndexForCanonicalRoot;
  Game.executeCanonicalProgressionStep = executeCanonicalProgressionStep;
  Game.getRuntimePerformanceSnapshot = function getRuntimePerformanceSnapshot(label = "") {
    const engine = window.GameStateEngine;
    const engineDiagnostics = engine?.getDiagnostics?.() || {};
    const memory = performance?.memory || null;
    const presentation = window.PresentationController?.getState?.() || null;
    const conversation = window.__conversationRuntimeDiagnostics?.() || null;
    return {
      label: String(label || ""),
      at: performance?.now?.() || Date.now(),
      memory: memory ? { usedJSHeapSize: Number(memory.usedJSHeapSize || 0), totalJSHeapSize: Number(memory.totalJSHeapSize || 0), jsHeapSizeLimit: Number(memory.jsHeapSizeLimit || 0) } : null,
      dom: { nodes: document.querySelectorAll("*").length, bubbles: document.querySelectorAll(".bubble").length, sceneViews: document.querySelectorAll("#scene-root > .scene-view").length },
      engine: engineDiagnostics,
      presentation: presentation ? { activeWait: !!presentation.activeWait, pendingAdvance: !!presentation.pendingAdvance, traceSize: Array.isArray(presentation.trace) ? presentation.trace.length : 0 } : null,
      conversation,
      advanceQueue: { ...(window.__feature4AdvanceQueueDiagnostics || {}) },
      reconciliationTraceSize: Array.isArray(window.__feature4ReconciliationTrace) ? window.__feature4ReconciliationTrace.length : 0,
      inputTraceSize: Array.isArray(window.__feature4AdvanceInputTrace) ? window.__feature4AdvanceInputTrace.length : 0
    };
  };

  Game.queueStoryStart = function queueStoryStartPublic(path, meta = {}) {
    return queuePendingStoryStart(path, { ...(meta || {}), force: true });
  };

  Game.queuePendingStoryStart = function queuePendingStoryStartPublic(path, meta = {}) {
    return queuePendingStoryStart(path, meta || {});
  };

  // Fail-closed recovery for a story that is canonically ACTIVE (a real
  // lease, a real activeStoryPath) but has nothing left driving it forward
  // -- found live via the total-audit mission's overlay-lifecycle Save/Load
  // investigation: SaveSystem.loadFromSlot({reload:false}) correctly
  // restores execution.cursor's POSITION (rootIndex/storyPath/branchPath
  // all verified intact), but the legacy background walker
  // (runSteps/ConvoRuntime) never reattaches to it -- confirmed by
  // Game._activeRunner/_activeStoryPath and ConvoRuntime's own diagnostics
  // staying unset even after re-invoking Game.startStory() on the exact
  // same already-active path (which correctly classifies as
  // ALREADY_ACTIVE_NOOP with the right startIndex, but that classification
  // alone does not by itself guarantee anything is actually walking the
  // steps). A real player's own taps route through the identical DOM path
  // this was reproduced with, so this is not a QA-only artifact -- the
  // conversation would look genuinely stuck to a real player in this exact
  // situation (Save/Load, or any other path that leaves a story canonically
  // active without the local walker attached, hitting a moment that calls
  // Game.resumePendingStory expecting it to restore forward progress -- the
  // hak_overlay close handler is the confirmed real trigger, but this is a
  // general contract, not overlay-specific). Directly proven live: calling
  // the canonical interpreter's own process() advances the cursor correctly
  // when the legacy walker does not (see scripts/canonical-story-runtime.js
  // -- window.CanonicalStoryRuntime.get() returns the same StoryInterpreter
  // instance StoryInterpreter-native dispatch already uses everywhere else
  // in this codebase, not a second/parallel authority). Bounded (mirrors
  // this file's own MAX_GOTO_JUMPS_PER_RUN-style guards elsewhere) and
  // self-terminating the moment the cursor reaches a real stopping phase
  // (waiting_for_user_intent/completed) or stops advancing at all.
  // ROOT-CAUSE HISTORY (Priority 3, HAK evidence lifecycle mission,
  // 2026-08-25): the first version of this function drove the canonical
  // interpreter directly via a bounded loop of raw
  // CanonicalStoryRuntime.get().process({}) calls -- a SEPARATE, parallel
  // mini-walker duplicating (incompletely) what the real per-step-type
  // authority already does. That approach correctly advances the CANONICAL
  // cursor for any step type, but it bypasses every step type's own
  // RENDERER-side side effects entirely -- confirmed live: a presentation-
  // required step (hak_overlay/hak_unlock, whose real handling in runSteps
  // is `await runHakOverlayStep(step)`/`await runHakUnlockStep(step)` --
  // pushing to the HAK overlay queue and calling
  // Game.showHakOverlayFromQueue(), then awaiting the real close()) got its
  // canonical commit applied by the raw process() loop with its
  // presentation NEVER triggered -- a step canonically "shown" that the
  // player never actually saw, which could then let the evidence behind it
  // commit before the overlay's own real dismissal.
  //
  // Root-caused to find the REAL authority normal gameplay uses to resume a
  // step before its commit: runSteps() (this file, the legacy background
  // walker) IS that authority -- its own step-type switch already handles
  // every real step type correctly (silent commit-and-continue for plain
  // types like notify/hak_add_evidence/hak_transcript/time_card, an awaited
  // presentation dispatch for hak_overlay/hak_unlock, a genuine pause for
  // input-required types like choice/hak_watchlist, and the existing
  // continuation/completion handling at start_story/end-of-steps
  // boundaries) -- there is no need for a second, parallel table of
  // per-type behavior here; delegating to runSteps via Game.startStory
  // inherits all of it for free, generically, for whatever step type the
  // restored position happens to be at.
  //
  // The reason Game.startStory alone did not visibly reattach the walker in
  // earlier testing (Priority 2) was a SEPARATE, now-fixed bug: when no
  // explicit startIndex is passed, startStory fell back to
  // progression.contactProgress[cid].index (a tracker not written by every
  // canonical step commit, and NOT guaranteed to match the true canonical
  // position after a direct state restore) instead of the admission-
  // derived index requestStartAdmission's own ALREADY_ACTIVE_NOOP/
  // CONTINUATION_ALREADY_ACTIVATED classification already computes from
  // execution.activeStepIndex (the SAME field every step handler's own
  // nextStepIndex keeps in sync on every real commit -- see
  // game-state-engine.js). See startStory's own comment on that branch for
  // the fix. With that fixed, re-invoking startStory for an
  // already-canonically-active session now genuinely reattaches runSteps at
  // the true position, through the real authority, not a substitute.
  let strandedRecoveryStartDepth = 0;
  let restoredPresentationResumeAuthority = "";
  let restoredContactSurfaceKey = "";
  function holdRestoredContactForPlayerOpen(source = "") {
    const engine = window.GameStateEngine;
    const execution = engine?.getExecutionState?.();
    const lease = execution?.lease;
    const contactId = resolveContactId(execution?.activeContactId || "", "");
    if (!lease?.id || !String(lease.initializationToken || "").startsWith("restore:") ||
        !execution.activeStoryPath || execution.cursor?.completion === "completed" || !contactId ||
        NON_CONTACT_ACTOR_IDS.has(contactId) || ["system", "you", "me"].includes(contactId)) return false;
    const identity = engine.getRuntimeLifecycleIdentity?.() || {};
    const key = [identity.playthroughId || "", Number(execution.operationEpoch || 0), lease.id].join("|");
    // Closing an already-restored HAK presentation is a real player action.
    // Let its ordinary walker finish that presentation; the restored-lease
    // player-turn gate in runSteps still prevents any synthetic player reply.
    if (source === "hak_overlay_closed") restoredPresentationResumeAuthority = key;
    if (restoredPresentationResumeAuthority === key) return false;
    const owner = window.Game?.getConversationRunnerOwner?.();
    const presence = engine.getConversationPresence?.();
    const freshlyMounted = presence?.contactId === contactId && presence?.mountState === "mounted" &&
      presence?.storyId === execution.activeStoryId && Number(presence.committedRevision) > Number(lease.createdRevision) &&
      owner?.contactId === contactId && owner?.storyPath === execution.activeStoryPath &&
      owner?.storyId === execution.activeStoryId && owner?.leaseId === lease.id &&
      owner?.generation === execution.generation && owner?.operationEpoch === Number(execution.operationEpoch || 0);
    if (freshlyMounted) return false;
    // Hold before pending retry counters/locks, restoration recovery, or story
    // admission can mutate the saved boundary. Presence saved in the snapshot
    // predates this lease and cannot stand in for opening this restored thread.
    if (restoredContactSurfaceKey !== key) {
      restoredContactSurfaceKey = key;
      surfaceRequiredPlayerConversation(contactId, readPendingStory(), execution.activeStoryPath, source || "restore_waiting_for_open");
    }
    return true;
  }
  // A process restart preserves a global lease but has no conversation mount
  // to reattach its walker. Resume only that boot lease, once Home is mounted.
  // Fresh admissions and ordinary Home navigation keep their existing owner.
  const bootGlobalLease = (() => {
    const execution = window.GameStateEngine?.getExecutionState?.();
    return execution?.activeContactId === "__global_story__" ? execution.lease?.id : null;
  })();
  if (bootGlobalLease) {
    const resumeBootGlobalStory = (event) => {
      if (String(event?.detail?.name || event?.detail?.scene || "").toLowerCase() !== "home") return;
      window.removeEventListener("scene:mounted", resumeBootGlobalStory);
      const execution = window.GameStateEngine?.getExecutionState?.();
      if (execution?.lease?.id !== bootGlobalLease) return;
      attemptStrandedInterpreterRecovery("process_boot_global").catch(() => {});
    };
    window.addEventListener("scene:mounted", resumeBootGlobalStory);
  }
  async function attemptStrandedInterpreterRecovery(source) {
    if (isHistoricalConversationView()) return false;
    const engine = window.GameStateEngine;
    if (!engine) return false;
    const before = engine.getState?.();
    const exec = before?.execution;
    if (!exec?.lease || !exec?.activeStoryPath) return false;
    // Only worth attempting when nothing is already synchronously mid-walk
    // for THIS story -- if Game._activeRunner already matches, a real
    // runSteps invocation is presumably already driving it, and starting a
    // second concurrent one would risk the exact out-of-order-step class of
    // bug the run-id dedup elsewhere in this file exists to prevent.
    if (window.Game?._activeRunner === "background" && window.Game?._activeStoryPath === exec.activeStoryPath) return false;
    // Closing a restored HAK also releases the conversation load that was
    // awaiting that presentation. Its renderer already owns the successor;
    // starting a background walker here would commit messages behind its UI.
    // A scene name alone is insufficient: stale or failed renderers must
    // still receive the existing stranded recovery after Load/relaunch.
    const rendererOwner = window.Game?.getConversationRunnerOwner?.();
    if (rendererOwner && rendererOwner.contactId === exec.activeContactId &&
        rendererOwner.storyPath === exec.activeStoryPath && rendererOwner.storyId === exec.activeStoryId &&
        rendererOwner.leaseId === exec.lease.id && rendererOwner.generation === exec.generation &&
        exec.lease.generation === exec.generation && exec.cursor?.leaseId === exec.lease.id &&
        exec.cursor?.storyId === exec.activeStoryId && exec.cursor?.storyPath === exec.activeStoryPath &&
        rendererOwner.operationEpoch === Number(exec.operationEpoch || 0)) return false;
    const rootIndexBefore = exec.cursor?.rootIndex ?? null;
    const storyIdBefore = exec.activeStoryId ?? null;
    let started = false;
    try {
      if (strandedRecoveryStartDepth > 0) {
        const context = { source, storyPath: exec.activeStoryPath, rootIndex: rootIndexBefore, depth: strandedRecoveryStartDepth };
        try { console.error("[STRANDED_INTERPRETER_REENTRANCY]", context); } catch {}
        throw new Error("STRANDED_INTERPRETER_REENTRANCY " + JSON.stringify(context));
      }
      strandedRecoveryStartDepth += 1;
      // Deliberately WITHOUT allowConversationInterrupt (that flag bypasses
      // requestStartAdmission entirely, which is exactly the admission-
      // derived startIndex resolution this recovery depends on) and WITHOUT
      // an explicit startIndex (so startStory's own ALREADY_ACTIVE_NOOP
      // branch supplies the true canonical position). allowInConversation/
      // allowPlayerTurns mirror what every other resume path in this file
      // already passes for a genuine mid-conversation resume.
      try {
        started = await window.Game.startStory(exec.activeStoryPath, {
          contactId: exec.activeContactId || undefined,
          allowInConversation: true,
          allowPlayerTurns: true,
          from: "stranded_interpreter_recovery",
          reason: source || "resume"
        });
      } finally {
        strandedRecoveryStartDepth = Math.max(0, strandedRecoveryStartDepth - 1);
      }
    } catch (err) {
      try { console.error("[STRANDED_INTERPRETER_RECOVERY] startStory reattach threw", { source, err: formatErrorMessage(err) }); } catch {}
      return false;
    }
    const after = engine.getState?.();
    const execAfter = after?.execution;
    const advanced = !!started && (
      execAfter?.activeStoryId !== storyIdBefore ||
      (execAfter?.cursor?.rootIndex ?? null) !== rootIndexBefore
    );
    if (advanced) {
      try {
        console.warn("[STRANDED_INTERPRETER_RECOVERY] " + JSON.stringify({
          source, storyPath: exec.activeStoryPath, contactId: exec.activeContactId || null,
          mechanism: "startStory_reattach", storyIdAfter: execAfter?.activeStoryId ?? null,
          rootIndexBefore, rootIndexAfter: execAfter?.cursor?.rootIndex ?? null,
          reason: "story was canonically active with a lease but nothing was driving it forward (legacy background walker not attached)"
        }));
      } catch {}
    }
    return advanced;
  }

  // resumePendingStory is called from dozens of sites across normal,
  // healthy gameplay (every tap handler, home-screen chain resumption,
  // etc. -- see the call-site survey this fix's own commit was audited
  // against), the overwhelming majority of which legitimately have nothing
  // "pending" (a mid-story tap is not a queued cross-story dispatch) WHILE
  // a real, correctly-attached local walker is already driving the story
  // between taps. attemptStrandedInterpreterRecovery's own _activeRunner
  // guard cannot reliably distinguish "genuinely stranded" from "walker
  // legitimately idle between two normal taps" from the outside -- live-
  // reproduced as a regression (2 consecutive real Electron runs newly
  // failing to reach a boundary they reached reliably before this change)
  // when the recovery attempt was wired as a general fallback for EVERY
  // caller. Scoped down to specific source strings proven safe instead --
  // every other caller keeps the exact prior behavior (a plain no-op return
  // false), zero risk of racing a healthy walker anywhere else in the app:
  //   - "hak_overlay_closed": index.html's hak_overlay close() handler, the
  //     originally confirmed trigger for the stranded-after-Save/Load class
  //     (Priority 2, HAK overlay lifecycle).
  //
  // "save_restore" (scripts/save-system.js's own restore(), the single
  // choke point every load path funnels through) is also admitted: a player using
  // the completely normal Save/Load UI at ANY position where the canonical
  // cursor sits in phase:'operation_committed' (reproduced at a plain
  // 'notify' step, not hak_overlay-specific) gets permanently stuck with no
  // recovery path (Priority 3, HAK evidence lifecycle mission,
  // 2026-08-25). attemptStrandedInterpreterRecovery itself (see its own
  // comment below) was fixed to delegate to Game.startStory -- the real
  // per-step-type authority -- instead of a parallel raw process({}) loop,
  // and DOES correctly resolve that case on its own. But enabling
  // "save_restore" changes WHEN the first recovery attempt happens (
  // immediately on Load, rather than only after a real hak_overlay_closed
  // event) -- and for a Load taken while a hak_overlay was ALREADY visually
  // showing (Priority 2's own certified Scenario A), that premature attempt
  // hits runSteps' own isCinematicLocked() gate (still genuinely set, since
  // the overlay hasn't been dismissed yet) and pauses with a
  // "resume"/reason:"cinematic_lock" pending record -- one written while
  // ALREADY inside the target conversation scene. resumePendingResume's own
  // scene==="conversation" branch unconditionally returns false without
  // restarting in that exact situation (a separate, real, root-caused bug
  // -- see that function's own comment), so the later real
  // hak_overlay_closed event can never actually consume that pending record
  // and finish the recovery, permanently stuck. The root fix does not
  // re-enter resumePendingResume: restore() captures presentation ownership
  // before teardown and passes that fact here. This path then defers and
  // coalesces recovery until the restored UI is stable. If presentation
  // owned the load, recovery waits for the real hak_overlay_closed event;
  // otherwise save_restore reattaches once after the teardown window. The
  // final P2 x3 and P3 B x3 live matrices prove both branches without
  // renderer hangs or duplicate commits.
  const STRANDED_RECOVERY_SOURCE_ALLOWLIST = new Set(["hak_overlay_closed", "save_restore"]);
  let saveRestoreRecoveryTimer = 0;
  let dayTransitionCueAttempt = null;
  function dayTransitionCueAttemptCurrent(attempt) {
    const engine = window.GameStateEngine;
    const execution = engine?.getExecutionState?.();
    return !!attempt && dayTransitionCueAttempt === attempt && engine === attempt.engine &&
      JSON.stringify(engine?.getRuntimeLifecycleIdentity?.() || {}) === attempt.identity &&
      execution?.lease?.id === attempt.leaseId && execution.generation === attempt.generation &&
      execution.activeStoryId === attempt.storyId && execution.activeStoryPath === attempt.storyPath;
  }
  let playerNameResumeWait = null;
  function isCompletedConversationCue(meta, execution) {
    if (meta?.source !== "conversation_finished") return false;
    const engine = window.GameStateEngine;
    const sourcePath = normalizeStoryPath(meta.sourceStoryPath || "");
    const entry = window.StoryAdmissionCatalog?.find(row => storyPathsEqual(row.path, sourcePath));
    const sourceContactId = resolveContactId(meta.sourceContactId || "", "");
    if (!entry?.onceKey || entry.onceKey !== meta.sourceOnceKey || !sourceContactId ||
        getCurrentSceneName() !== "conversation" || activeConversationId() !== sourceContactId ||
        resolveContactId(entry.contactId || "", "") !== sourceContactId ||
        execution?.activeContactId === sourceContactId ||
        Number(entry.day) !== Number(engine?.getWorldDay?.()) ||
        Number(String(execution?.activeStoryPath || "").match(/(?:^|\/)DAY(\d+)(?:\/|_)/i)?.[1]) !== Number(entry.day) ||
        !engine?.hasOnceKey?.(entry.onceKey)) return false;
    return [entry.id, entry.onceKey, entry.path, stableStoryIdForPath(entry.path)]
      .filter(Boolean).some(id => engine.hasCompletedStory?.(id));
  }
  Game.resumePendingStory = function resumePendingStoryPublic(meta = {}) {
    if (isHistoricalConversationView()) return false;
    if (window.PlayerIdentity?.isPending?.()) {
      // This public API returns a synchronous boolean. Keep that contract,
      // but retry once after setup without accumulating a callback for each
      // automatic continuation poll while the name dialog is open.
      const engine = window.GameStateEngine;
      const identity = JSON.stringify(engine?.getRuntimeLifecycleIdentity?.() || {});
      if (!playerNameResumeWait || playerNameResumeWait.engine !== engine || playerNameResumeWait.identity !== identity) {
        const waiting = { engine, identity, meta: { ...meta } };
        playerNameResumeWait = waiting;
        Promise.resolve(window.PlayerIdentity.ready()).then(() => {
          if (playerNameResumeWait !== waiting) return;
          playerNameResumeWait = null;
          if (window.GameStateEngine !== engine || JSON.stringify(engine?.getRuntimeLifecycleIdentity?.() || {}) !== identity) return;
          Game.resumePendingStory(waiting.meta);
        }).catch(() => {
          if (playerNameResumeWait === waiting) playerNameResumeWait = null;
        });
      } else if (meta?.tap === true) {
        playerNameResumeWait.meta = { ...meta };
      }
      return false;
    }
    const source = String(
      meta?.source ||
      meta?.reason ||
      (meta?.tap ? "tap" : (meta?.auto ? "auto" : "resume"))
    ).trim();
    if (holdRestoredContactForPlayerOpen(source)) return false;
    const pending = readPendingStory();
    // The completion presentation wake never consumes a transport record;
    // its existing owner already supplies the appropriate resume policy.
    if (source === "conversation_finished" && pending) return false;
    if (!pending || typeof pending !== "object") {
      // Canonical completion can admit the next contact without a transport
      // record. The completed day-to-Home landing or the still-open finished
      // conversation may attach its successor's normal NPC prefix here;
      // neither supplies player-turn authorization.
      const isHomeCompletionCue = source === "day_transition_home" || source === "conversation_return_home";
      if (isHomeCompletionCue || source === "conversation_finished") {
        const engine = window.GameStateEngine;
        const execution = engine?.getExecutionState?.();
        const contactId = resolveContactId(execution?.activeContactId || "", "");
        if ((isHomeCompletionCue ? getCurrentSceneName() !== "home" : !isCompletedConversationCue(meta, execution)) ||
            Game._dayTransitionPending || Game._timeCardBusy || isCinematicLocked() ||
            !execution?.lease?.id || !execution.activeStoryId || !execution.activeStoryPath ||
            execution.lease.storyId !== execution.activeStoryId || String(execution.lease.initializationToken || "").startsWith("restore:") ||
            execution.cursor?.rootIndex !== 0 || execution.cursor?.branchPath?.length !== 0 || execution.cursor?.phase !== "ready_to_interpret" ||
            execution.cursor?.pendingUserIntent || execution.cursor?.pendingPresentationAck || execution.cursor?.completion === "completed" ||
            !contactId || NON_CONTACT_ACTOR_IDS.has(contactId) || ["system", "you", "me"].includes(contactId)) return false;
        const renderer = Game.getConversationRunnerOwner?.();
        if (renderer && renderer.leaseId === execution.lease.id && renderer.storyId === execution.activeStoryId &&
            renderer.storyPath === execution.activeStoryPath && renderer.contactId === contactId &&
            renderer.generation === execution.generation && renderer.operationEpoch === Number(execution.operationEpoch || 0)) return false;
        if (dayTransitionCueAttemptCurrent(dayTransitionCueAttempt)) return false;
        const attempt = { engine, identity: JSON.stringify(engine.getRuntimeLifecycleIdentity?.() || {}),
          leaseId: execution.lease.id, generation: execution.generation, storyId: execution.activeStoryId, storyPath: execution.activeStoryPath };
        dayTransitionCueAttempt = attempt;
        const finish = () => { if (dayTransitionCueAttempt === attempt) dayTransitionCueAttempt = null; };
        try {
          Promise.resolve(Game.startStory(execution.activeStoryPath, {
            contactId, allowPlayerTurns: false, allowInConversation: false,
            from: source, reason: source
          })).catch(() => {}).finally(finish);
          return true;
        } catch { finish(); return false; }
      }
      if (!STRANDED_RECOVERY_SOURCE_ALLOWLIST.has(source)) return false;
      // A restored HAK overlay still owns presentation and must be closed by
      // the player before its walker resumes. Starting underneath that live
      // cinematic would create a synthetic pending resume and could commit
      // the presentation-required step without showing it. The real close
      // event calls this function again as hak_overlay_closed.
      if (source === "save_restore") {
        if (meta?.presentationWasActive === true) return false;
        if (saveRestoreRecoveryTimer) clearTimeout(saveRestoreRecoveryTimer);
        saveRestoreRecoveryTimer = setTimeout(() => {
          saveRestoreRecoveryTimer = 0;
          try {
            if (isCinematicLocked() || !!document.querySelector?.("#hak-overlay.show")) return;
            if (window.GameStateEngine?.getExecutionState?.()?.lease) attemptStrandedInterpreterRecovery("save_restore").catch(() => {});
          } catch {}
        }, 120);
        return true;
      }
      let attempted = false;
      try {
        attempted = !!(window.GameStateEngine?.getExecutionState?.()?.lease);
        if (attempted) attemptStrandedInterpreterRecovery(source || "resume").catch(() => {});
      } catch {}
      return attempted;
    }

    if (isPendingDispatch(pending)) {
      return resumePendingDispatch(source || "resume");
    }

    if (!isPendingResume(pending)) return false;
    if (meta?.tap === true) return false;
    return resumePendingResume(source || "resume", meta || {});
  };

  Game.startStory = async function startStory(path, opts = {}) {
    if (!path) {
      try { console.warn("[ConvoRuntime][startStory] blocked: invalid path", { path }); } catch {}
      return false;
    }
    const requestedStoryPath = String(path || "").trim();
    if (!requestedStoryPath) {
      try { console.warn("[ConvoRuntime][startStory] blocked: invalid path", { path }); } catch {}
      return false;
    }
    if (holdRestoredContactForPlayerOpen(String(opts?.reason || opts?.from || ""))) return false;
    // Asset/catalog reads can settle after a public Load has replaced this
    // document's canonical state, before the old document finishes unloading.
    // Such a start owns neither the restored pending dispatch nor its retries.
    const startCueAttempt = ["day_transition_home", "conversation_return_home", "conversation_finished"].includes(opts?.from) ? dayTransitionCueAttempt : null;
    const startEngine = window.GameStateEngine;
    const readStartLifetime = () => {
      const identity = startEngine?.getRuntimeLifecycleIdentity?.();
      if (identity) return [identity.playthroughId, identity.playthroughGeneration, identity.operationEpoch];
      const state = startEngine?.getState?.();
      return [state?.playthrough?.id || '', Number(state?.playthrough?.generation || 0), Number(state?.execution?.operationEpoch || 0)];
    };
    const startLifetime = readStartLifetime();
    const startLifetimeCurrent = () => {
      // A recovery/cue may already be awaiting assets when the player opens
      // a completed Timeline conversation. It no longer owns that reader.
      if ((opts.__fromPendingDispatch === true || opts.from === "stranded_interpreter_recovery" || startCueAttempt) && isHistoricalConversationView()) return false;
      if (startCueAttempt && !dayTransitionCueAttemptCurrent(startCueAttempt)) return false;
      if (window.GameStateEngine !== startEngine) return false;
      const current = readStartLifetime();
      return current.every((value, index) => Object.is(value, startLifetime[index]));
    };
    if (window.PlayerIdentity?.isPending?.()) {
      await window.PlayerIdentity.ready();
      if (!startLifetimeCurrent()) return false;
    }
    repairPersistedPseudoContactEvents();
    try { repairCanonicalRoutesFromChoiceLog(); } catch {}
    try { sanitizeDisabledCharacterConversationState({ source: "start_story" }); } catch {}

    const runOpts = { ...(opts || {}) };
    // Computed once, immediately, from the caller's ORIGINAL opts -- before
    // either forceStoryRestart block below (this one, and the later one
    // guarding the runSteps() call) has a chance to overwrite
    // runOpts.startIndex itself, which would make a same-object
    // hasOwnProperty check on runOpts always true afterward regardless of
    // what the caller actually supplied. See both call sites' own comments.
    const callerProvidedStartIndex = Object.prototype.hasOwnProperty.call(opts || {}, "startIndex");
    const forceStoryRestart = runOpts.forceStoryRestart === true;
    const fromChapter = runOpts.fromChapter === true;
    const devChapterBypass = fromChapter && hasDevUnlock();
    const disabledSkipTrail = normalizeDisabledSkipTrail(runOpts.__disabledSkipTrail);
    runOpts.__chapterLoadMode = (runOpts.__chapterLoadMode === true) || fromChapter;
    delete runOpts.__disabledSkipTrail;
    delete runOpts.fromChapter;
    const fromPendingDispatch = runOpts.__fromPendingDispatch === true;
    delete runOpts.__fromPendingDispatch;
    const strictRequestedPath = runOpts.__strictRequestedPath === true;
    const chainSource = String(runOpts.__chainSource || "").trim();
    // Logical cross-owner targets must be materialized before every access,
    // strict-path, lock and load check. Otherwise strict continuations bypass
    // resolveAccessibleStoryPath and attempt to fetch the logical identifier
    // as though it were a physical JSON file.
    const requestedNormalizedStoryPath = resolveCanonicalRouteStoryPath(normalizeStoryPath(requestedStoryPath) || requestedStoryPath);
    // DEV route routers contain control flow only. They can inherit the
    // source conversation id through a continuation dispatch, but must not
    // then pause behind that open conversation as though they were authored
    // chat content. Their sole job is to select the canonical owner route.
    if (/^story\/dev\/.*router/i.test(requestedNormalizedStoryPath)) {
      runOpts.allowInConversation = true;
    }
    const logChainError = (reason, extra = {}) => {
      if (!startLifetimeCurrent()) return;
      // Classification is recorded for EVERY failure regardless of
      // strictRequestedPath/chainSource -- resumePendingDispatch reads it
      // for any deferred dispatch, not only chain-sourced ones. Only the
      // console.error print itself stays gated + rate-limited.
      const failure = recordDispatchFailure(requestedNormalizedStoryPath, reason, extra);
      if (strictRequestedPath || chainSource) {
        if (shouldPrintDispatchFailureLog(failure)) {
          try {
            const pendingSnapshot = readPendingStory();
            const detail = {
              path: requestedNormalizedStoryPath,
              storyId: stableStoryIdForPath(requestedNormalizedStoryPath),
              errorCode: reason,
              classification: failure?.classification || "UNKNOWN",
              message: describeDispatchFailureReason(reason),
              cause: extra,
              repeatCount: failure?.count || 1,
              chainSource,
              entitlementState: {
                lenaUpdate: (() => { try { return window.EntitlementService?.snapshot?.().lenaUpdate === true; } catch { return null; } })(),
                devUnlock: hasDevUnlock(),
                patreonMasterUnlock: hasPatreonMasterUnlock()
              },
              pendingSource: pendingSnapshot ? {
                kind: pendingSnapshot.kind || "",
                via: pendingSnapshot.via || "",
                reason: pendingSnapshot.reason || "",
                from: pendingSnapshot.from || "",
                attempts: pendingSnapshot.attempts || 0
              } : null
            };
            const waiting = failure?.classification === "WAITING_FOR_REQUIREMENT";
            const message = waiting
              ? "[CHAIN][WAITING_FOR_REQUIREMENT] "
              : `[CHAIN][ERROR] target failed to load: ${requestedNormalizedStoryPath} `;
            (waiting ? console.info : console.error).call(console, message + JSON.stringify(detail));
          } catch {}
          if (failure) failure.lastLoggedAt = Date.now();
        }
      }
      clearRuntimeTurnForStory(requestedNormalizedStoryPath, canonicalId(runOpts.__chainTargetContactId || ""), `chain_error_${reason}`);
    };

    // Direct starts and canonical continuations share the same authored
    // prefix rule. Resolve missing free episodes before presenting a gate
    // for the requested premium target. The canonical reducer rechecks
    // against its transaction state when a lease is actually acquired.
    if (!devChapterBypass && window.StoryAdmissionCatalog) {
      const admissionState = window.GameStateEngine?.getStoryDecisionState?.();
      const prior = admissionState && window.ConditionGrammar.findRequiredPriorStory(admissionState, requestedNormalizedStoryPath, window.StoryAdmissionCatalog);
      if (prior) {
        if (prior.status !== 'MISSING') {
          logChainError(prior.status === 'ACTIVE' ? 'active_story_conflict' : prior.status === 'CHRONOLOGY_CAUSAL_CONFLICT' ? 'CHRONOLOGY_CAUSAL_CONFLICT' : 'prior_day_incomplete', { requiredPriorStory: prior });
          return false;
        }
        const interaction = findBlockingStoryInteraction(prior.path);
        if (deferStoryForExternalInteraction(requestedNormalizedStoryPath, interaction, logChainError)) return false;
        const current = readPendingStory();
        const pending = { ...(current || {}), kind: 'dispatch', id: current?.id || dispatchId(prior.path), path: prior.path, storyPath: prior.path, contactId: prior.contactId, index: 0, reason: 'required_logical_slot_recovery', via: 'required_logical_slot_recovery', startWhenScene: 'home', navigationPolicy: 'auto_open', attempts: 0, updatedAt: Date.now(), blockedNextStory: { path: requestedNormalizedStoryPath }, opts: retargetPendingDispatchOpts(current, prior.contactId) };
        writePendingStory(pending);
        console.warn('[REQUIRED_LOGICAL_SLOT_MISSING] ' + JSON.stringify({ day: prior.day, owner: prior.contactId, logicalSlot: prior.onceKey, manifestPosition: prior.order, blockedNextDayStory: requestedNormalizedStoryPath }));
        setTimeout(() => { if (!startLifetimeCurrent()) return; try { (window.Game ||= {}).resumePendingStory?.({ source: 'required_logical_slot_recovery', auto: true }); } catch {} }, 0);
        return false;
      }
    }
    let resolvedStoryPath = null;
    if (strictRequestedPath) {
      const manifestEntry = await findManifestEntryByPath(requestedNormalizedStoryPath);
      if (!startLifetimeCurrent()) return false;
      if (manifestEntry) {
        const buildRelease = getBuildRelease();
        const patreonUnlock = getPatreonUnlockRelease();
        if (!canAccessStory(manifestEntry, buildRelease, patreonUnlock)) {
          logChainError("not_accessible_in_release");
          if (isPremiumStory(manifestEntry)) {
            showPremiumStoryGate(manifestEntry.path, runOpts, {
              source: chainSource || "strict_story_start"
            });
          }
          return false;
        }
        resolvedStoryPath = manifestEntry.path;
      } else {
        if (!canAccessStory({ path: requestedNormalizedStoryPath })) {
          logChainError("not_accessible_in_release");
          if (isPremiumStory({ path: requestedNormalizedStoryPath })) {
            showPremiumStoryGate(requestedNormalizedStoryPath, runOpts, {
              source: chainSource || "strict_story_start"
            });
          }
          return false;
        }
        resolvedStoryPath = requestedNormalizedStoryPath;
      }
    } else {
      resolvedStoryPath = await resolveAccessibleStoryPath(requestedNormalizedStoryPath);
      if (!startLifetimeCurrent()) return false;
    }
    if (!resolvedStoryPath) {
      try {
        console.warn("[ConvoRuntime][startStory] blocked: no accessible story", {
          storyPath: requestedNormalizedStoryPath,
          fromChapter,
          fromPendingDispatch
        });
      } catch {}
      logChainError("no_accessible_story");
      if (isPremiumStory({ path: requestedNormalizedStoryPath })) {
        showPremiumStoryGate(requestedNormalizedStoryPath, runOpts, {
          source: fromPendingDispatch ? "pending_dispatch" : (chainSource || "start_story")
        });
      }
      return false;
    }

    const storyPath = resolvedStoryPath;
    const normalizedStoryPath = normalizeStoryPath(storyPath) || storyPath;
    const storyPathChanged = normalizedStoryPath !== requestedNormalizedStoryPath;
    if (storyPathChanged || forceStoryRestart) {
      // storyPathChanged (the resolved/accessible path differs from what was
      // requested, e.g. a premium-gate redirect) always means "start that
      // DIFFERENT file from its own top" -- an explicit startIndex the
      // caller computed against the ORIGINAL requested path would be
      // meaningless against a different file's steps, so it is correctly
      // discarded in that case. forceStoryRestart alone must NOT discard a
      // caller-supplied startIndex the same way (see the later
      // forceStoryRestart block's own comment for the two real callers this
      // was confirmed live to break: index.html's Save/Load boot-restore,
      // which loses a pending choice's exact saved position and replays the
      // whole conversation from step 0 instead of resuming it, and
      // Game.startChapter's configured non-zero chapter start).
      if (storyPathChanged || !callerProvidedStartIndex) runOpts.startIndex = 0;
      if (storyPathChanged) {
        delete runOpts.contactId;
        delete runOpts.conversationId;
        delete runOpts.id;
        delete runOpts.contactName;
      }
      try {
        console.info("[StoryAccess] Starting resolved accessible story", {
          requestedPath: requestedNormalizedStoryPath,
          resolvedPath: normalizedStoryPath
        });
      } catch {}
    }
    try {
      console.info("[ConvoRuntime][startStory] invoked", {
        storyPath,
        requestedStoryPath: requestedNormalizedStoryPath,
        fromChapter,
        fromPendingDispatch
      });
    } catch {}

    const lock = readPendingLock();
    const lockPath = String(lock?.path || "").trim();
    const lockAgeMs = lock ? (Date.now() - Number(lock.startedAt || 0)) : 0;
    const lockActive = !!(lock && lockAgeMs < PENDING_LOCK_TTL);
    if (!fromPendingDispatch && lockActive && lockPath && lockPath === storyPath) {
      try {
        console.warn("[ConvoRuntime][startStory] blocked: story lock active " + JSON.stringify({
          storyPath,
          lockPath,
          lockAgeMs
        }));
      } catch {}
      return false;
    }

    // Game._activeRunner / Game._activeStoryPath are no longer read here --
    // see requestStartAdmission below for the canonical replacement. The
    // run-id counter itself is assigned further down, only once this call
    // is actually admitted (see the comment there for why: bumping a
    // GLOBAL counter for a call that is about to be rejected would corrupt
    // the dedup check of a completely different story's already-running
    // runSteps loop).
    if (fromChapter) {
      clearPendingForChapterStart();
    }

    let dispatchMarker = null;
    if (fromPendingDispatch) {
      const cur = readPendingStory();
      if (isPendingDispatch(cur) && String(cur.path || "").trim() === storyPath) {
        dispatchMarker = cur;
      }
    } else if (!fromChapter) {
      const cur = readPendingStory();
      if (!cur || cur.kind !== "resume") {
        const keep = { ...runOpts };
        dispatchMarker = queuePendingStoryStart(storyPath, {
          opts: keep,
          from: String(runOpts.from || "").trim(),
          reason: String(runOpts.reason || "direct_start").trim() || "direct_start",
          allowConversationInterrupt: runOpts.allowConversationInterrupt === true
        });
      }
    }

    function clearDispatchMarkerIfCurrent() {
      if (!startLifetimeCurrent()) return;
      const cur = readPendingStory();
      if (matchesPendingDispatchAttempt(cur, dispatchMarker)) {
        clearPendingStory();
      }
    }

    let json = null;
    try {
      json = await loadJson(storyPath);
      if (!startLifetimeCurrent()) return false;
    } catch (err) {
      if (!startLifetimeCurrent()) return false;
      try { console.error("[ConvoRuntime][startStory] loadJson failed", { storyPath, err }); } catch {}
      logChainError("load_json_failed", { storyPath, err });
      try { window.showToast?.("Story load failed: " + storyPath); } catch {}
      if (dispatchMarker) clearPendingStory();
      safeRemLS(CHAIN_KEY);
      return false;
    }
    if (strictRequestedPath || chainSource) {
      try {
        console.info(`[CHAIN] target loaded successfully: ${storyPath}`, {
          chainSource,
          onceKey: String(json?.onceKey || "").trim()
        });
      } catch {}
    }
    // Pure route wrappers retain their canonical owner but have no player
    // conversation to open. Let their control flow run behind the source UI.
    if (isTransportOnlyStory(json)) runOpts.allowInConversation = true;
    // JSON loaded (past every gating check above that can produce a
    // classified failure) -- this target is no longer WAITING_FOR_REQUIREMENT/
    // STALE/TRANSIENT from this file's point of view, so drop any stale
    // record instead of letting a later unrelated failure inherit its count.
    clearDispatchFailure(requestedNormalizedStoryPath);
    clearDispatchFailure(storyPath);

    const ownerState = isStoryOwnedByDisabledCharacter(json, { storyPath });
    if (ownerState.disabled) {
      const skipResult = await skipStoryForDisabledCharacter(json, {
        storyPath,
        ownerId: ownerState.ownerId,
        skipTrail: disabledSkipTrail,
        // The story being skipped never runs, so its OWN allowInConversation/
        // allowPlayerTurns intent must carry over to whatever it chains to --
        // otherwise a chained story always starts as if from the background
        // walker (both flags default false), pausing at its first choice/
        // player-turn step and never getting a chance to actually present it
        // even once the player opens the conversation (nothing re-drives
        // canonical interpretation with allowPlayerTurns:true afterward).
        allowInConversation: runOpts.allowInConversation === true,
        allowPlayerTurns: runOpts.allowPlayerTurns === true
      });
      if (!startLifetimeCurrent()) return false;
      try {
        console.info("[ConvoRuntime][startStory] skipped disabled-character story", {
          storyPath,
          ownerId: ownerState.ownerId,
          nextPath: skipResult.nextPath || "",
          queued: skipResult.queued === true
        });
      } catch {}
      if (skipResult.blockedByLoopGuard) {
        logChainError("disabled_skip_loop_guard", {
          storyPath,
          ownerId: ownerState.ownerId,
          nextPath: skipResult.nextPath || ""
        });
        if (dispatchMarker) clearPendingStory();
        safeRemLS(CHAIN_KEY);
        return false;
      }
      clearDispatchMarkerIfCurrent();
      return true;
    }

    // Optional episodes can declare at JSON root:
    // { "requireWatched":"lena" } or { "requireWatchedAny":["lena","aiden"] }.
    const requestedDay = Number(json?.day || String(storyPath || "").match(/(?:^|\/)DAY(\d+)(?:\/|_)/i)?.[1] || 0) || 0;
    if (!devChapterBypass && deferStoryForExternalInteraction(storyPath, findBlockingStoryInteraction(storyPath), logChainError)) return false;
    if (!devChapterBypass && dispatchMarker && requestedDay > 1) {
      const missingPriorDaySlot = await findIncompleteLogicalStoryForDay(requestedDay - 1);
      if (!startLifetimeCurrent()) return false;
      if (missingPriorDaySlot?.path) {
        if (deferStoryForExternalInteraction(storyPath, missingPriorDaySlot.blockingInteraction, logChainError)) return false;
        try {
          console.warn("[REQUIRED_LOGICAL_SLOT_MISSING] " + JSON.stringify({
            day: missingPriorDaySlot.day,
            owner: missingPriorDaySlot.contactId || null,
            route: missingPriorDaySlot.contactId ? readCanonicalLockedRoute(missingPriorDaySlot.contactId) : null,
            logicalSlot: missingPriorDaySlot.onceKey,
            manifestPosition: missingPriorDaySlot.order,
            blockedNextDayStory: storyPath
          }));
        } catch {}
        writePendingStory({ ...dispatchMarker, path: missingPriorDaySlot.path, storyPath: missingPriorDaySlot.path, contactId: missingPriorDaySlot.contactId, index: 0, opts: retargetPendingDispatchOpts(dispatchMarker, missingPriorDaySlot.contactId), reason: "required_logical_slot_recovery", via: "required_logical_slot_recovery", startWhenScene: "home", navigationPolicy: "auto_open", attempts: 0, updatedAt: Date.now() });
        safeRemLS(CHAIN_KEY);
        setTimeout(() => {
          if (!startLifetimeCurrent()) return;
          try { (window.Game ||= {}).resumePendingStory?.({ source: "required_logical_slot_recovery", auto: true }); } catch {}
        }, 0);
        return false;
      }
    }
    if (!devChapterBypass && !requirementsMet(json || {})) {
      const missingRequiredStory = await findMissingRequiredStory(json, storyPath);
      if (!startLifetimeCurrent()) return false;
      if (missingRequiredStory?.path && dispatchMarker) {
        if (deferStoryForExternalInteraction(storyPath, missingRequiredStory.blockingInteraction, logChainError)) return false;
        try {
          console.warn("[DAY_REQUIRED_SLOT_RECOVERY] " + JSON.stringify({
            owner: missingRequiredStory.contactId || null,
            route: missingRequiredStory.contactId ? readCanonicalLockedRoute(missingRequiredStory.contactId) : null,
            expectedPhysicalStory: missingRequiredStory.path,
            expectedOnceKey: missingRequiredStory.onceKey,
            blockedNextDayStory: storyPath,
            missingKeys: missingRequiredStory.missingKeys
          }));
        } catch {}
        writePendingStory({
          ...dispatchMarker,
          path: missingRequiredStory.path,
          storyPath: missingRequiredStory.path,
          contactId: missingRequiredStory.contactId,
          reason: "required_day_slot_recovery",
          via: "required_day_slot_recovery",
          startWhenScene: "home",
          navigationPolicy: "auto_open",
          attempts: 0,
          updatedAt: Date.now()
        });
        safeRemLS(CHAIN_KEY);
        setTimeout(() => {
          if (!startLifetimeCurrent()) return;
          try { (window.Game ||= {}).resumePendingStory?.({ source: "required_day_slot_recovery", auto: true }); } catch {}
        }, 0);
        return false;
      }
      if (missingRequiredStory && !missingRequiredStory.path) {
        try {
          console.error("[DAY_REQUIRED_SLOT_MISSING] " + JSON.stringify({
            code: "DAY_REQUIRED_SLOT_MISSING",
            blockedNextDayStory: storyPath,
            targetDay: missingRequiredStory.targetDay,
            missingKeys: missingRequiredStory.missingKeys,
            completedOnceKeys: window.GameStateEngine?.getState?.()?.progression?.onceKeys || []
          }));
        } catch {}
      }
      try {
        console.warn("[ConvoRuntime][startStory] blocked: requireOnceKey not met", {
          storyPath,
          requireOnceKey: String(json?.requireOnceKey || "").trim(),
          onceKey: String(json?.onceKey || "").trim()
        });
      } catch {}
      logChainError("requirements_not_met", {
        storyPath,
        requireOnceKey: String(json?.requireOnceKey || "").trim(),
        onceKey: String(json?.onceKey || "").trim(),
        requirements: {
          requireOnceKey: json?.requireOnceKey,
          requireCondition: json?.requireCondition,
          requireWatched: json?.requireWatched,
          requireWatchedAny: json?.requireWatchedAny,
          requireWatchedKey: json?.requireWatchedKey
        }
      });
      // Deliberately does NOT clear the dispatch marker here, matching the
      // not_accessible_in_release/no_accessible_story branches above: a
      // not-yet-satisfied requireOnceKey/requireCondition is exactly the
      // WAITING_FOR_REQUIREMENT class (classifyDispatchFailureReason) --
      // it can legitimately become true later (the prerequisite story
      // completing), so the caller's classification-based retry policy
      // (resumePendingDispatch/resumePendingResume), not this function,
      // owns whether/when to give up on it. Unconditionally clearing here
      // used to silently drop a legitimately-deferred pending on its very
      // first attempt.
      safeRemLS(CHAIN_KEY);
      return false;
    }
    if (!devChapterBypass && json?.onceKey && onceDone(json.onceKey)) {
      try {
        console.info("[ConvoRuntime][startStory] continuation already satisfied", {
          storyPath,
          onceKey: String(json.onceKey || "").trim(),
          classification: "ALREADY_COMPLETED"
        });
      } catch {}
      const logicalContinuation = dispatchMarker ? await findNextLogicalStoryAfterCompleted(json, storyPath) : null;
      if (!startLifetimeCurrent()) return false;
      if (logicalContinuation?.path) {
        if (deferStoryForExternalInteraction(storyPath, logicalContinuation.blockingInteraction, logChainError)) return false;
        if (!await checkpointLogicalDayContinuation(storyPath, logicalContinuation.path)) return false;
        if (!startLifetimeCurrent()) return false;
        try {
          console.warn("[DAY_LOGICAL_SLOT_CONTINUATION] " + JSON.stringify({
            completedStory: storyPath,
            completedOnceKey: String(json.onceKey || "").trim(),
            nextPhysicalStory: logicalContinuation.path,
            nextOnceKey: logicalContinuation.onceKey,
            owner: logicalContinuation.contactId || null,
            route: logicalContinuation.contactId ? readCanonicalLockedRoute(logicalContinuation.contactId) : null
          }));
        } catch {}
        writePendingStory({ ...dispatchMarker, path: logicalContinuation.path, storyPath: logicalContinuation.path, contactId: logicalContinuation.contactId, reason: "logical_day_slot_continuation", via: "logical_day_slot_continuation", startWhenScene: "home", navigationPolicy: "auto_open", attempts: 0, updatedAt: Date.now() });
      } else if (dispatchMarker) {
        clearPendingStory();
      }
      clearRuntimeTurnForStory(requestedNormalizedStoryPath, canonicalId(runOpts.__chainTargetContactId || ""), "already_completed");
      safeRemLS(CHAIN_KEY);
      setTimeout(() => {
          if (!startLifetimeCurrent()) return;
        try {
          if (logicalContinuation?.path) (window.Game ||= {}).resumePendingStory?.({ source: "logical_day_slot_continuation", auto: true });
          else repairKnownIdleContinuationGaps();
        } catch {}
      }, 0);
      return true;
    }

    const hasStartIndex = Object.prototype.hasOwnProperty.call(runOpts || {}, "startIndex");
    const requestedRuntimeContactId = resolveContactId(runOpts.contactId || runOpts.conversationId || runOpts.id || "", runOpts.contactName || "");
    const authoredRuntimeContactId = getStoryOwnerId(json, { storyPath });
    let runtimeContactId = authoredRuntimeContactId || (
      NON_CONTACT_ACTOR_IDS.has(String(requestedRuntimeContactId || "").toLowerCase()) ? "" : requestedRuntimeContactId
    );
    if (!runtimeContactId) runtimeContactId = inferContactIdFromStory(json);
    if (runtimeContactId) runOpts.contactId = runtimeContactId;
    if (dispatchMarker && !dispatchMarker.contactId && runtimeContactId) {
      dispatchMarker = { ...dispatchMarker, contactId: runtimeContactId };
      touchPendingDispatch(storyPath, undefined, { contactId: runtimeContactId });
    }
    // Canonical start-admission contract (replaces both the legacy
    // Game._activeRunner/_activeStoryPath guard removed above and the old
    // findStoryStartConflict/story_runtime_v1 turn-lock check this block
    // used to run): a single decision driven only by GameStateEngine's
    // canonical lease/cursor state and its own native START_STORY command.
    // allowConversationInterrupt callers (the engine's own chain/continuation
    // handoff paths -- see buildChainStartOpts and the dispatch-marker resume
    // flow) still bypass this: they are resuming a lease-holding operation
    // this same file already owns, not requesting a fresh admission decision.
    let admission = null;
    if (runOpts.allowConversationInterrupt !== true) {
      admission = requestStartAdmission(storyPath, runtimeContactId, json);
      if (!admission.ok) {
        try {
          console.warn("[ConvoRuntime][startStory] blocked by canonical start admission", {
            storyPath,
            contactId: runtimeContactId,
            classification: admission.classification,
            lockStoryPath: admission.lockStoryPath,
            lockContactId: admission.lockContactId,
            reason: admission.reason
          });
        } catch {}
        logChainError("start_admission_" + String(admission.classification || "rejected").toLowerCase(), {
          storyPath,
          contactId: runtimeContactId,
          classification: admission.classification,
          lockStoryPath: admission.lockStoryPath,
          lockContactId: admission.lockContactId
        });
        // ACTIVE_STORY_CONFLICT/STALE_RECOVERABLE_STATE are genuinely
        // retriable: the lease holder will eventually complete or release
        // (every real completion path is canonical now -- Group 3/4), and
        // this exact call is what a boot-time default-character intro, a
        // deferred time_card/next_day dispatch, etc. looks like. Clearing
        // the pending dispatch marker here (the old behavior, inherited
        // from the legacy turn-lock rejection this replaced) throws away
        // the ONLY record resumePendingDispatch's own retry loop
        // (schedulePendingRetry) needs to try again once the lease frees
        // up -- silently losing the start forever instead of deferring it.
        // The legacy Game._activeRunner guard rarely hit this path in
        // practice (it cleared on the OTHER story's first pause, not just
        // completion, so it usually let a competing start through before
        // ever reaching this rejection); this canonical guard is
        // deliberately stricter and correct, so it hits this path far more
        // often -- making the marker-preserving retry below load-bearing
        // now in a way it effectively wasn't before.
        const retriable = admission.classification === "ACTIVE_STORY_CONFLICT" || admission.classification === "STALE_RECOVERABLE_STATE";
        if (retriable && dispatchMarker) {
          schedulePendingRetry("start_admission_" + String(admission.classification || "").toLowerCase(), 220);
        } else {
          clearDispatchMarkerIfCurrent();
          safeRemLS(CHAIN_KEY);
        }
        return false;
      }
      runOpts.__admissionClassification = admission.classification;
      runOpts.__admissionLeaseId = admission.leaseId;
    } else {
      // Chain handoffs bypass ordinary conflict admission, but still need to
      // establish the target story canonically before an initial player turn
      // is presented. Otherwise those taps can advance the previous story's
      // cursor until the target reaches its first background-only step.
      const beforeInterrupt = window.GameStateEngine?.getGameplayState?.()?.execution;
      const sameActiveStory = !!(
        beforeInterrupt?.lease &&
        storyPathsEqual(beforeInterrupt.activeStoryPath, normalizedStoryPath) &&
        (beforeInterrupt.activeContactId === runtimeContactId ||
          NON_CONTACT_ACTOR_IDS.has(String(beforeInterrupt.activeContactId || "").toLowerCase()))
      );
      const interruptLeaseId = ensureCanonicalStoryLease(normalizedStoryPath, runtimeContactId, true);
      if (!interruptLeaseId) {
        logChainError("interrupt_lease_unavailable", { storyPath: normalizedStoryPath, contactId: runtimeContactId });
        clearDispatchMarkerIfCurrent();
        safeRemLS(CHAIN_KEY);
        return false;
      }
      const interruptExec = window.GameStateEngine?.getGameplayState?.()?.execution;
      admission = {
        ok: true,
        classification: sameActiveStory ? "ALREADY_ACTIVE_NOOP" : "NEW_START_ALLOWED",
        leaseId: interruptLeaseId,
        startIndex: sameActiveStory ? (Number(interruptExec?.activeStepIndex) || 0) : 0
      };
      runOpts.__admissionClassification = admission.classification;
      runOpts.__admissionLeaseId = admission.leaseId;
    }
    // Run-id counter: a separate, already-safe internal dedup used inside
    // runSteps' own step loop (guards against two concurrently-executing
    // walks of the SAME lease writing steps out of order), not a
    // progression/admission authority itself. Assigned only now, after
    // admission has actually accepted this call -- bumping it earlier
    // (before knowing whether this call would be admitted or rejected)
    // would let a rejected call for a completely different, unrelated
    // story silently invalidate the run-id another story's already-running
    // runSteps loop is still comparing against on its next step, aborting
    // that unrelated execution mid-story.
    const nextRunId = Math.max(0, Number(Game._storyRunId || 0) || 0) + 1;
    Game._storyRunId = nextRunId;
    Game._activeStoryPath = normalizedStoryPath || null;
    runOpts.__runId = nextRunId;
    if (forceStoryRestart) {
      // forceStoryRestart means "discard any stale in-progress tracking and
      // (re)acquire this story fresh" -- it does NOT mean "always start at
      // step 0". Two real callers explicitly pass BOTH forceStoryRestart:true
      // AND their own non-zero startIndex: index.html's bootstrapFromSave()
      // (the real Save/Load UI's boot-time resume, restoring the exact
      // canonical cursor position the save was taken at -- including a
      // pending choice's own step) and Game.startChapter (the chapter-select/
      // dev jump feature, using a chapter's configured startIndex). This
      // branch used to unconditionally overwrite runOpts.startIndex to 0
      // regardless, silently discarding both callers' explicit position and
      // restarting the whole story from the top -- confirmed live: saving
      // mid-conversation (including with a choice still pending) and then
      // using the real in-game Load UI reopened the story at rootIndex 0
      // instead of the saved position. Only default to 0 when the caller
      // did not already supply an explicit startIndex, matching the same
      // hasStartIndex contract the ALREADY_ACTIVE_NOOP branch below uses.
      if (runtimeContactId) {
        setContactProgress(runtimeContactId, storyPath, hasStartIndex ? Math.max(0, Number(runOpts.startIndex) || 0) : 0);
        runOpts.contactId = runtimeContactId;
      }
      if (!hasStartIndex) runOpts.startIndex = 0;
    } else if (admission && admission.ok &&
      (admission.classification === "ALREADY_ACTIVE_NOOP" || admission.classification === "CONTINUATION_ALREADY_ACTIVATED") &&
      !hasStartIndex) {
      // Resuming a story the canonical engine ALREADY considers active for
      // this exact lease -- requestStartAdmission's own ALREADY_ACTIVE_NOOP/
      // CONTINUATION_ALREADY_ACTIVATED classification already read the true
      // resume position straight from canonical state
      // (`Number(exec.activeStepIndex)||0`, the same field every step
      // handler advances via its own `nextStepIndex` on commit -- see
      // game-state-engine.js's per-command cases). That IS the authoritative
      // "where does the interpreter actually stand" answer for an
      // already-active session. The `!hasStartIndex` branch below instead
      // asks progression.contactProgress[cid].index -- a SEPARATE tracker
      // (SET_CONTACT_PROGRESS) that is not written by every canonical step
      // commit and can legitimately be stale relative to the real cursor
      // (e.g. immediately after a Save/Load restore, which repopulates
      // execution.activeStepIndex/cursor directly via RESTORE_SAVE without
      // necessarily touching contactProgress in lockstep). Using the stale
      // tracker here was the root cause of a real, confirmed defect
      // (Priority 3, HAK evidence lifecycle mission, 2026-08-25): re-
      // invoking startStory to resume a canonically-active-but-undriven
      // session (the real fix for a Save/Load-stranded interpreter) could
      // silently start the legacy walker from the WRONG index whenever the
      // two trackers diverged, rather than genuinely reattaching it at the
      // true position. Prefer the canonical admission-derived index; only
      // fall through to contactProgress if admission didn't run at all
      // (allowConversationInterrupt callers, which bypass admission
      // entirely and already own their own resume contract).
      runOpts.startIndex = Number(admission.startIndex) || 0;
      if (runtimeContactId) runOpts.contactId = runtimeContactId;
    } else if (!hasStartIndex) {
      let cid = runtimeContactId;

      if (cid) {
        const stored = getStoredProgress(cid);
        if (stored.story === storyPath) {
          runOpts.startIndex = stored.index || 0;
        } else {
          setContactProgress(cid, storyPath, 0);
          runOpts.startIndex = 0;
        }
        runOpts.contactId = cid;
      }
    }

    rememberRuntimeTurnOwner(storyPath, runtimeContactId, {
      activeRunner: "background",
      activeStoryPath: normalizedStoryPath,
      expectedNextStory: runtimeContactId ? normalizedStoryPath : "",
      timelineReplayChain: runOpts.timelineReplayChain === true
    }, String(runOpts.reason || chainSource || "start_story"));

    try {
      await runSteps(storyPath, json, runOpts);
      if (!startLifetimeCurrent()) return false;
    } catch (err) {
      if (!startLifetimeCurrent()) return false;
      const msg = formatErrorMessage(err);
      try { console.error("[ConvoRuntime][startStory] exception: " + msg, { storyPath, err }); } catch {}
      try { window.showToast?.("Story start failed (exception): " + msg); } catch {}
      recordDispatchFailure(requestedNormalizedStoryPath, "runtime_exception", { storyPath, err: msg });
      // No-abandoned-lease invariant: if this exact call is the one that
      // just canonically minted the lease (NEW_START_ALLOWED) and no step
      // has advanced it since, an unhandled exception here means the lease
      // will never be released by the normal completion path -- release it
      // now rather than leaving every future story start deadlocked behind
      // a lease nothing will ever free. A legitimate pause/retry (blocked
      // canonical commit, cinematic lock, etc.) is handled internally by
      // runSteps and does not throw, so this only fires on genuine failure.
      if (admission && admission.classification === "NEW_START_ALLOWED" && admission.leaseId) {
        try {
          const engine = window.GameStateEngine;
          const cur = engine?.getState?.();
          if (engine && cur?.execution?.lease?.id === admission.leaseId) {
            engine.dispatch({
              type: "RELEASE_LEASE",
              commandId: `start-story-exception-release:${admission.leaseId}`,
              expectedRevision: cur.revision,
              payload: {}
            });
          }
        } catch {}
      }
      if (dispatchMarker) clearPendingStory();
      safeRemLS(CHAIN_KEY);
      return false;
    }
    try { console.info("[ConvoRuntime][startStory] completed", { storyPath }); } catch {}

    clearDispatchMarkerIfCurrent();
    return true;
  };

  window.ConvoRuntime = {
    __v: "2026-03-22-disabled-char-autoskip-v1",
    isTransportOnlyStory,
    repairConversationStoryIdentity,
    canonicalHakPresentationPayload,
    skipRepeatedHakSkillAnnouncement,
    presentCanonicalHakEvidence,
    presentRestoredHakInteraction,
    loadJson,
    loadStoryManifest,
    onceDone,
    markOnce,
    requirementsMet,
    getBuildRelease,
    getPatreonUnlockRelease,
    getContentAccessConfig: () => CONTENT_ACCESS_CONFIG,
    hasPatreonUnlock,
    hasDevUnlock,
    hasGalleryFullUnlock,
    hasPremiumUnlock,
    hasPatreonMasterUnlock,
    unlockPatreonMaster,
    clearPatreonMasterUnlock,
    getAccessCodes,
    applyAccessCode,
    submitPatreonCode,
    openPatreonCodeModal,
    isPremiumStory,
    isFreeStory,
    canAccessStory,
    showPremiumStoryGate,
    findManifestEntryByPath,
    findNextAccessibleStoryPath,
    resolveAccessibleStoryPath,
    getStoryOwnerId,
    isStoryOwnedByDisabledCharacter,
    skipStoryForDisabledCharacter,
    shouldHideCharacterFromUI,
    isCharacterActive,

    // ✅ identity invariant (feature4-day15-love-evelyn-lease-unavailable-
    // stall) -- exposed so non-module scene scripts can enforce it too.
    assertRealContactIdentity,
    NON_CONTACT_ACTOR_IDS,

    // ✅ branching helpers (for conversation scene)
    getChoicesLog,
    logChoice,
    resolveOnlyfunPostImage,
    applyChoiceSetFlags,
    jumpToLabelIndex,
    resolveFirstManualPlayerTurn,
    preparePendingOutboundPayload,
    clearIfDecisionCacheKeys,
    debugResetConversationProgress,
    resetHakCharacterSelection,
    cancel: clearPendingForChapterStart,
    getDiagnostics: function getDiagnosticsPublic() {
      return {
        instanceCount: 1,
        activeInterpreterId: "convo-runtime-legacy",
        activeLeaseId: (window.GameStateEngine?.getExecutionState?.()?.lease?.id) || null,
        currentStory: String((window.Game && window.Game._activeStoryPath) || ""),
        currentStep: 0,
        pendingOperationCount: pendingResumeBusy ? 1 : 0,
        ownedResourceCount: pendingRetryTimer ? 1 : 0
      };
    }
  };
  setTimeout(() => {
    if (isHistoricalConversationView()) return;
    try {
      repairPersistedPseudoContactEvents();
      repairPendingDay10LoveEvelynGap();
      repairIdleDay9LoveContinuationGap();
      repairIdleDay11LoveContinuationGap();
      repairPendingDay12LoveContinuationGap();
      repairIdleDay12OwnerCompletionGap();
      repairPendingDay14LoveContinuationGap();
      repairPendingDay15LoveContinuationGap();
      repairIdleDay14LoveContinuationGap();
      repairLogicalIdleContinuationGap();
    } catch {}
  }, 0);
  // Save restoration occurs after this script's initial zero-delay repair
  // pass. Re-evaluate only the tightly-gated known idle gaps on a short
  // cadence so a restored completed cursor cannot remain inert for minutes.
  // The repair functions are idempotent and return immediately while a lease
  // or pending continuation exists.
  if (!window.__knownIdleContinuationRepairTimer) {
    window.__knownIdleContinuationRepairTimer = setInterval(() => {
      if (isHistoricalConversationView()) return;
      try { repairKnownIdleContinuationGaps(); } catch {}
      try { repairLogicalIdleContinuationGap(); } catch {}
    }, 750);
  }
})();
