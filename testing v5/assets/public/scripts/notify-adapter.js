// scripts/notify-adapter.js
// SINGLE SOURCE OF TRUTH for:
// - conversations store (messages[], unread, last, name, avatar)
// - badges (messages = sum unread)
// - popup pipeline via "inbox:new"
//
// POPUP RULE (simple):
// - show popup for incoming messages everywhere
// - EXCEPT: scene is messages OR splash OR warning
// - EXCEPT: scene is conversation AND it's the same thread
//
// PLUS SnapGram:
// - listen to ig:post / ig:story events (StoryBus + window)
// - bump snapgram badge + popup even if player is in a conversation
// - ✅ ALSO persist IG items into localStorage (igFeed_v1 / igStories_v1)
//
// ✅ UNIVERSAL FIX:
// - Adds alias registry contact_aliases_v1
// - Learns alias: displayName -> stableId automatically
// - Resolves ids (rawId/fromName/openConversationId) through alias registry
// - Normalizes conversations store to stable ids to prevent split threads.

(() => {
  if (window.__notify_adapter_v50 === true) return;
  window.__notify_adapter_v50 = true;

  if (!window.Game) window.Game = {};
  const Game = window.Game;
  Game._cinematicQueue = Array.isArray(Game._cinematicQueue) ? Game._cinematicQueue : [];

  const BADGE_KEY = "app_badges_v1";
  const DEFAULT_AVATAR = "assets/avatars/default.jpg";
  const CINEMATIC_LOCK_KEY = "__cinematic_lock_v1";
  // ✅ NEW: action-required hint for Messages list
  const TODO_KEY = "todo_hint_v1";
  const GUIDED_CUES_KEY = "guided_cues_v1";
  const PENDING_OUTBOUND_KEY = "pending_outbound_v1";

  // ✅ SnapGram stores (must be written even when SnapGram scene not loaded)
  const IG_FEED_KEY  = "igFeed_v1";
  const IG_STORY_KEY = "igStories_v1";
  const IG_NOTIFY_SEEN_PREFIX = "ig_notified_v1_";

  function shouldFilterNotificationSender(app, rawId) {
    // HAK is an application/system sender, not a selectable story character.
    if (canonicalId(app || "") === "hak") return false;
    return shouldHideCharacterFromUI(rawId);
  }

  // ✅ avatar unlock key (first reveal only)
  const REVEAL_PREFIX = "contact_avatar_unlocked_";
  const NAME_REVEAL_PREFIX = "contact_name_unlocked_";

  // ✅ special/fixed avatars
  const SPECIAL_AVATAR = {
    antagonist: DEFAULT_AVATAR
  };

  const CONTACT_NAME_MAP = {
    mother: "Mother",
    brother: "Mason",
    lilsis: "Hailey",
    girlfriend: "Lena",
    antagonist: "Aiden"
  };

  function safeGetLS(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function safeSetLS(k, v) { try { localStorage.setItem(k, v); } catch {} }
  function safeDelLS(k) { try { localStorage.removeItem(k); } catch {} }
  function safeParse(raw, fallback) { try { return JSON.parse(raw); } catch { return fallback; } }
  // A completed Day 1 thread plus the first Day 2 episode already exceeds
  // 100 transcript rows. The former cap therefore dropped step 0 (usually
  // the notification-backed opening line) while keeping the rest of the
  // episode. Keep enough rebuildable projection history for the full chapter.
  const MAX_CONVERSATION_MESSAGES = 5000;

  function isTranscriptMessage(row) {
    const kind = String(row?.kind || row?.type || "").trim().toLowerCase();
    if (kind === "divider" || kind === "note" || kind === "hak_hint") return false;
    return canonicalId(row?.from || row?.fromId || "") !== "system";
  }

  function trimConversationMessages(rows, maxMessages = MAX_CONVERSATION_MESSAGES) {
    const source = Array.isArray(rows) ? rows.filter(Boolean) : [];
    const max = Math.max(1, Number(maxMessages || MAX_CONVERSATION_MESSAGES) || MAX_CONVERSATION_MESSAGES);
    let seen = 0;
    let start = 0;
    for (let i = source.length - 1; i >= 0; i -= 1) {
      if (!isTranscriptMessage(source[i])) continue;
      seen += 1;
      if (seen > max) {
        start = i + 1;
        break;
      }
    }
    const out = start > 0 ? source.slice(start) : source.slice();
    while (out.length && String(out[0]?.kind || out[0]?.type || "").toLowerCase() === "divider") out.shift();
    return out;
  }

  function getPendingOutboundMessageText(rawObj) {
    const raw = (rawObj && typeof rawObj === "object") ? rawObj : {};
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

  function getPendingOutboundPromptText(rawObj, fallback = "") {
    const raw = (rawObj && typeof rawObj === "object") ? rawObj : {};
    const promptText = String(raw.promptText || raw.prompt || "").trim();
    return promptText || String(fallback || "").trim();
  }

  function normalizePendingOutbound(rawObj) {
    const raw = (rawObj && typeof rawObj === "object") ? rawObj : {};
    const contactId = resolveContactId(raw.contactId || raw.id || "", raw.contactName || raw.name || "");
    const storyPath = String(raw.storyPath || raw.story || raw.path || "").trim();
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
    const normalized = normalizePendingOutbound(raw ? safeParse(raw, null) : null);
    if (normalized) {
      if (shouldHideCharacterFromUI(normalized.contactId)) return null;
      return normalized;
    }

    const legacyRaw = safeGetLS("pending_story_v1");
    const legacy = legacyRaw ? safeParse(legacyRaw, null) : null;
    if (!legacy || typeof legacy !== "object") return null;
    if (canonicalId(legacy.kind || "") !== "player_first") return null;

    const migrated = normalizePendingOutbound({
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

    if (shouldHideCharacterFromUI(migrated.contactId)) return null;

    safeSetLS(PENDING_OUTBOUND_KEY, JSON.stringify(migrated));
    return migrated;
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

  // =========================================================
  // ✅ UNIVERSAL ALIAS REGISTRY
  // =========================================================
  const ALIAS_KEY = "contact_aliases_v1";

  function normToken(s) {
    return String(s || "").trim().toLowerCase().replace(/\s+/g, "_");
  }

  // keep old name for compatibility in code
  const canonicalId = (raw) => normToken(raw);

  function normalizeStoryPath(raw) {
    return String(raw || "").trim().replace(/\\/g, "/");
  }

  function normalizeConversationUnfinished(rawValue) {
    const raw = (rawValue && typeof rawValue === "object") ? rawValue : null;
    if (!raw) return null;
    const active = raw.active === true || Number(raw.active || 0) === 1;
    if (!active) return null;
    return {
      active: 1,
      reason: String(raw.reason || "unfinished_exit").trim() || "unfinished_exit",
      storyPath: normalizeStoryPath(String(raw.storyPath || raw.story || raw.path || "").trim()),
      episodeId: String(raw.episodeId || raw.episode || "").trim(),
      onceKey: canonicalId(raw.onceKey || raw.episodeOnceKey || ""),
      at: Number(raw.at || Date.now()) || Date.now()
    };
  }

  function readAliases() {
    const raw = safeGetLS(ALIAS_KEY);
    const obj = raw ? safeParse(raw, {}) : {};
    return obj && typeof obj === "object" ? obj : {};
  }

  function writeAliases(obj) {
    safeSetLS(ALIAS_KEY, JSON.stringify(obj || {}));
  }

  // id resolver (raw id OR provided display name) -> stable id if known
  function resolveContactId(rawId, providedName) {
    const base = normToken(rawId);
    if (!base) return "";

    const aliases = readAliases();

    // 1) rawId is an alias
    if (aliases[base] && !isBadAliasToken(aliases[base])) return normToken(aliases[base]);

    // 2) providedName is an alias
    const n = normToken(providedName);
    if (n && aliases[n] && !isBadAliasToken(aliases[n])) return normToken(aliases[n]);

    return base;
  }

  function isCharacterStorageTruthy(rawValue) {
    const v = normToken(rawValue);
    return v === "1" || v === "true" || v === "on" || v === "yes" || v === "active";
  }

  function isCharacterActiveLocal(rawId) {
    const cid = normToken(rawId);
    if (!cid) return false;
    if (cid === "aiden") return true;
    if (cid === "tutor") {
      // Tutor (Ethan) is NOT one of the five main-cast contacts and never
      // has its own active_character:tutor key explicitly written by any
      // real code path -- the generic "unset key defaults to active"
      // fallback below (correct for the five main-cast contacts, whose
      // own key IS always explicitly initialized) made Tutor visible/
      // actionable in EVERY playthrough regardless of route. Tutor is
      // Hailey's own NTS-exclusive subplot; consult the SAME single
      // canonical eligibility authority story admission itself now uses
      // (GameStateEngine.isTutorEligible(), see game-state-engine.js's
      // own admissionBlockReason) rather than a second, independently-
      // drifting notion of "is Tutor active". Live-confirmed 2026-09-06:
      // a real tester saw Tutor appear on Day10 while playing Hailey
      // LOVE -- the exact class of gap this closes.
      try { return window.GameStateEngine?.isTutorEligible?.(window.GameStateEngine.getState()) === true; } catch { return false; }
    }
    try {
      const raw = localStorage.getItem("active_character:" + cid);
      if (raw == null) return true;
      return isCharacterStorageTruthy(raw);
    } catch {
      return true;
    }
  }

  function shouldHideCharacterFromUI(rawId) {
    const cid = canonicalId(resolveContactId(rawId || "", ""));
    if (!cid) return false;
    if (cid === "player" || cid === "system") return false;
    try {
      if (typeof Game.shouldHideCharacterFromUI === "function") {
        return Game.shouldHideCharacterFromUI(cid) === true;
      }
    } catch {}
    return !isCharacterActiveLocal(cid);
  }

  function isBadAliasToken(nameToken) {
    const n = normToken(nameToken);
    if (!n) return true;
    if (n === "you" || n === "player" || n === "me") return true;
    if (n === "unknown" || n === "unk" || n === "???") return true;
    if (n === "antagonist" || n === "badguy" || n === "villain") return true;
    if (n === "system" || n === "messages") return true;
    return false;
  }

  // Learn alias "displayName -> stableId"
  function learnAlias(stableId, displayName) {
    const id = normToken(stableId);
    const nameTok = normToken(displayName);

    if (!id || !nameTok || isBadAliasToken(id)) return;
    if (isBadAliasToken(nameTok)) return;
    if (nameTok === id) return;

    const aliases = readAliases();

    // don't overwrite another mapping (avoid collisions)
    if (aliases[nameTok] && normToken(aliases[nameTok]) !== id) return;

    aliases[nameTok] = id;
    writeAliases(aliases);
  }

  // =========================================================
  // ✅ TODO / ACTION REQUIRED API (Messages list non-red indicator)
  // =========================================================
  function readTodo() {
    const raw = safeGetLS(TODO_KEY);
    const parsed = raw ? safeParse(raw, null) : null;
    const cid = resolveContactId(parsed?.contactId || "", "");
    if (cid && shouldHideCharacterFromUI(cid)) return null;
    return parsed;
  }

  function writeTodo(obj) {
    if (!obj) { safeDelLS(TODO_KEY); return; }
    safeSetLS(TODO_KEY, JSON.stringify(obj));
  }

  function isSameTodoFor(id) {
    const t = readTodo();
    if (!t?.contactId) return false;
    return canonicalId(resolveContactId(t.contactId, "")) === canonicalId(resolveContactId(id, ""));
  }

  function setTodo(contactId, message) {
    const cid = resolveContactId(contactId, "");
    if (!cid) return;
    if (shouldHideCharacterFromUI(cid)) {
      clearTodo(cid);
      return;
    }

    const payload = {
      contactId: cid,
      text: String(message || "Open Messages to continue").trim() || "Open Messages to continue",
      at: Date.now()
    };

    writeTodo(payload);

    // force UI refresh if Messages is open
    try { window.dispatchEvent(new Event("game:conversations-updated")); } catch {}
  }

  function clearTodo(contactId) {
    const cur = readTodo();
    if (!cur) return;

    if (contactId) {
      const cid = resolveContactId(contactId, "");
      if (!cid) return;
      if (canonicalId(resolveContactId(cur.contactId, "")) !== canonicalId(cid)) return;
    }

    writeTodo(null);

    try { window.dispatchEvent(new Event("game:conversations-updated")); } catch {}
  }

  Game.Todo = Game.Todo || {};
  Game.Todo.set = (contactId, message) => setTodo(contactId, message);
  Game.Todo.clear = (contactId) => clearTodo(contactId);
  Game.Todo.get = () => readTodo();

  // =========================================================
  // Guided cues (separate from unread + todos)
  // =========================================================
  function normalizeGuidedCues(rawObj) {
    const raw = (rawObj && typeof rawObj === "object") ? rawObj : {};
    const conversations = {};
    const apps = {};

    const rawConversations =
      (raw.conversations && typeof raw.conversations === "object")
        ? raw.conversations
        : {};

    for (const key of Object.keys(rawConversations)) {
      const cid = resolveContactId(key, "");
      if (!cid) continue;
      if (shouldHideCharacterFromUI(cid)) continue;
      const row = rawConversations[key];
      if (!row || typeof row !== "object") continue;
      conversations[cid] = {
        kind: String(row.kind || "rainbow").trim() || "rainbow",
        reason: String(row.reason || "").trim(),
        story: String(row.story || row.storyPath || "").trim(),
        label: String(row.label || "").trim(),
        at: Number(row.at || Date.now()) || Date.now()
      };
    }

    const rawApps = (raw.apps && typeof raw.apps === "object") ? raw.apps : {};
    for (const appKey of Object.keys(rawApps)) {
      apps[canonicalId(appKey)] = !!rawApps[appKey];
    }

    return { conversations, apps };
  }

  function readGuidedCues() {
    const raw = safeGetLS(GUIDED_CUES_KEY);
    const parsed = raw ? safeParse(raw, null) : null;
    return normalizeGuidedCues(parsed);
  }

  function writeGuidedCues(obj) {
    const normalized = normalizeGuidedCues(obj);
    safeSetLS(GUIDED_CUES_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function emitGuidedCuesChanged(detail = {}) {
    const payload = { ...detail, at: Date.now() };
    try { window.dispatchEvent(new CustomEvent("guided:cues-changed", { detail: payload })); } catch {}
    try { window.StoryBus?.emit?.("guided:cues-changed", payload); } catch {}
    try { window.dispatchEvent(new Event("game:conversations-updated")); } catch {}
  }

  function getGuidedCue(contactId) {
    const cid = resolveContactId(contactId || "", "");
    if (!cid) return null;
    if (shouldHideCharacterFromUI(cid)) return null;
    const data = readGuidedCues();
    return data.conversations[cid] || null;
  }

  function hasGuidedCue(contactId) {
    return !!getGuidedCue(contactId);
  }

  function setGuidedCue(contactId, payload = {}) {
    const cid = resolveContactId(contactId || "", "");
    if (!cid) return null;
    if (shouldHideCharacterFromUI(cid)) return null;

    const data = readGuidedCues();
    data.conversations[cid] = {
      kind: String(payload.kind || "rainbow").trim() || "rainbow",
      reason: String(payload.reason || "guided").trim(),
      story: String(payload.story || payload.storyPath || "").trim(),
      label: String(payload.label || "").trim(),
      at: Number(payload.at || Date.now()) || Date.now()
    };
    data.apps.messages = true;

    writeGuidedCues(data);
    emitGuidedCuesChanged({ action: "set", contactId: cid });
    return data.conversations[cid];
  }

  function clearGuidedCue(contactId) {
    const data = readGuidedCues();

    if (contactId) {
      const cid = resolveContactId(contactId, "");
      if (!cid) return false;
      delete data.conversations[cid];
    } else {
      data.conversations = {};
    }

    data.apps.messages = Object.keys(data.conversations).length > 0;
    writeGuidedCues(data);
    emitGuidedCuesChanged({
      action: "clear",
      contactId: contactId ? resolveContactId(contactId, "") : ""
    });
    return true;
  }

  Game.getGuidedCues = function getGuidedCues() { return readGuidedCues(); };
  Game.getGuidedCue = function getGuidedCuePublic(contactId) { return getGuidedCue(contactId); };
  Game.hasGuidedCue = function hasGuidedCuePublic(contactId) { return hasGuidedCue(contactId); };
  Game.setGuidedCue = function setGuidedCuePublic(contactId, payload = {}) { return setGuidedCue(contactId, payload); };
  Game.clearGuidedCue = function clearGuidedCuePublic(contactId) { return clearGuidedCue(contactId); };

  function getRestoredConversationCue(contactId = "") {
    const execution = window.GameStateEngine?.getExecutionState?.();
    const lease = execution?.lease;
    const cursor = execution?.cursor;
    const cid = resolveContactId(execution?.activeContactId || "", "");
    const storyPath = normalizeStoryPath(execution?.activeStoryPath || "");
    // Load deliberately waits for the player to open the restored thread.
    // Its saved cursor may precede the first notification/player intent, so
    // neither an unread count nor a pending outbound message has to exist.
    // Derive the cue from that exact owner; old guided/todo cache entries may
    // belong to a later day and must not manufacture a resume indication.
    if (!lease?.id || !String(lease.initializationToken || "").startsWith("restore:") ||
        !cid || ["player", "you", "me", "system", "__global_story__"].includes(cid) ||
        shouldHideCharacterFromUI(cid) || !storyPath || !execution.activeStoryId ||
        lease.storyId !== execution.activeStoryId || !cursor || cursor.completion === "completed" ||
        cursor.storyId !== execution.activeStoryId || normalizeStoryPath(cursor.storyPath) !== storyPath ||
        cursor.leaseId !== lease.id || resolveContactId(cursor.contactId || "", "") !== cid) return null;
    if (contactId && resolveContactId(contactId, "") !== cid) return null;
    return { contactId: cid, storyPath, color: "rainbow" };
  }

  Game.getRestoredConversationCue = getRestoredConversationCue;

  // =========================================================
  // Names
  // =========================================================
  function prettyNameFromId(id) {
    const cid = canonicalId(id);
    if (CONTACT_NAME_MAP[cid]) return CONTACT_NAME_MAP[cid];

    const s = String(id || "").trim();
    if (!s) return "Unknown";
    return s
      .split("_")
      .filter(Boolean)
      .map(w => w ? (w[0].toUpperCase() + w.slice(1).toLowerCase()) : "")
      .join(" ");
  }

  function isBadDisplayName(name, threadId) {
    const n = String(name || "").trim().toLowerCase();
    const tid = canonicalId(threadId);

    if (!n) return true;
    if (n === "you" || n === "player" || n === "me") return true;
    if (n === "unknown" || n === "unk" || n === "???") return true;
    if (n === "antagonist" || n === "badguy" || n === "villain") return true;
    if (tid && n === tid) return true;
    return false;
  }

  function chooseBestName(threadId, providedName, existingName) {
    const tid = canonicalId(threadId);

    const mapName = CONTACT_NAME_MAP[tid] || "";
    const prov = String(providedName || "").trim();
    const exist = String(existingName || "").trim();

    const existingGood = !!exist && !isBadDisplayName(exist, tid);
    const mappingGood = !!mapName && !isBadDisplayName(mapName, tid);
    const providedGood = !!prov && !isBadDisplayName(prov, tid);

    const locked = safeGetLS(NAME_REVEAL_PREFIX + tid) === "1";
    if (locked && existingGood) return exist;

    if (providedGood) {
      if (!existingGood) return prov;
      if (prov.toLowerCase() !== exist.toLowerCase()) return prov;
      return exist;
    }

    if (existingGood) return exist;
    if (mappingGood) return mapName;
    return prettyNameFromId(tid);
  }

  function resolveVariantAvatar(id, avatar = "") {
    const cid = canonicalId(id || "");
    const raw = String(avatar || "").trim();
    try {
      if (typeof Game.resolveCharacterVariantAvatar === "function") {
        const resolved = String(Game.resolveCharacterVariantAvatar(cid, raw) || "").trim();
        if (resolved) return resolved;
      }
    } catch {}
    if (cid !== "mason" && !/\/?assets\/avatars\/mason(?:_female)?\.jpg(?:[?#].*)?$/i.test(raw.replace(/\\/g, "/"))) {
      const normalized = raw.replace(/\\/g, "/").toLowerCase();
      const official = ["aiden", "evelyn", "hailey", "lena"].includes(cid) ? `assets/avatars/${cid}.jpg` : "";
      if (official && (!normalized || normalized.includes("/default.") || /(^|\/)default\.(?:png|jpe?g|webp)(?:[?#].*)?$/i.test(normalized))) return official;
      if (official && normalized.includes("assets/avatars/") && !normalized.endsWith(`assets/avatars/${cid}.jpg`)) return official;
      return raw || official || DEFAULT_AVATAR;
    }
    return safeGetLS("character_variant_mason") === "female"
      ? "assets/avatars/female_mason.jpg"
      : "assets/avatars/male_mason.jpg";
  }

  function resolveVariantImage(src, ownerId = "") {
    const raw = String(src || "").trim();
    if (!raw) return "";
    try {
      if (typeof Game.resolveCharacterVariantImage === "function") {
        const resolved = String(Game.resolveCharacterVariantImage(raw, ownerId) || "").trim();
        if (resolved) return resolved;
      }
    } catch {}
    return raw;
  }

  // =========================================================
  // LIVE UI EVENTS
  // =========================================================
  function emitAvatarUpdated(id, avatar) {
    const cid = canonicalId(id);
    const url = String(avatar || "").trim();
    if (!cid || !url) return;
    try { window.dispatchEvent(new CustomEvent("contact:avatar-updated", { detail: { id: cid, avatar: url } })); } catch {}
    try { window.StoryBus?.emit?.("contact:avatar-updated", { id: cid, avatar: url }); } catch {}
  }

  function emitConversationsUpdated() {
    try { window.dispatchEvent(new Event("game:conversations-updated")); } catch {}
  }

  function emitConversationsChanged(detail = {}) {
    const payload = {
      id: canonicalId(detail.id || detail.contactId || ""),
      contactId: canonicalId(detail.contactId || detail.id || ""),
      needsPlayer: (detail.needsPlayer === true || detail.needsPlayer === 1) ? 1 : 0,
      playerDraft: String(detail.playerDraft || detail.draftText || "").trim(),
      at: Date.now()
    };
    try { window.dispatchEvent(new CustomEvent("conversations:changed", { detail: payload })); } catch {}
  }

  function emitBadgeChanged(app, value) {
    try { window.dispatchEvent(new CustomEvent("app:badge-changed", { detail: { app, value } })); } catch {}
  }

  function emitSnapgramUpdated() {
    try { window.dispatchEvent(new Event("snapgram:updated")); } catch {}
  }

  function isAvatarUnlocked(id) {
    const cid = canonicalId(id);
    if (!cid) return false;
    if (safeGetLS(REVEAL_PREFIX + cid) === "1") return true;

    // Backfill for state that predates this explicit flag entirely (old
    // saves), or that never runs the live story trigger at all (Start From /
    // New Update checkpoints, built by CheckpointStateBuilder from a day
    // threshold, not by replaying steps). Both populate
    // progression.onceKeys/completedStoryIds identically to real play (see
    // game-state-engine.js's complete()), so deriving from that canonical
    // signal -- never from a save-version check -- covers every entry path
    // the same way. See scripts/protected-media-resolver.js's
    // AVATAR_REVEAL_ONCE_KEY for which story proves each character's reveal.
    const onceKey = window.ProtectedMediaResolver?.AVATAR_REVEAL_ONCE_KEY?.[cid];
    if (!onceKey) return false;
    try {
      const state = window.GameStateEngine?.getState?.();
      const onceKeys = state?.progression?.onceKeys;
      const completed = state?.progression?.completedStoryIds;
      const derived =
        (Array.isArray(onceKeys) && onceKeys.includes(onceKey)) ||
        (Array.isArray(completed) && completed.includes(onceKey));
      if (derived) {
        // Same mutation the live contact:reveal trigger performs -- fixes
        // both the flag and the stored conversation avatar in one exactly-
        // once step, so this branch is never consulted again for this id.
        unlockAvatar(cid, `assets/avatars/${cid}.jpg`);
        return true;
      }
    } catch {}
    return false;
  }

  function unlockAvatar(id, avatarUrl) {
    const cid = canonicalId(id);
    const url = resolveVariantAvatar(cid, avatarUrl);
    if (!cid) return;

    safeSetLS(REVEAL_PREFIX + cid, "1");

    if (url) {
      const convos = readConversations();
      const existing = convos[cid] || {};
      const bestName = chooseBestName(cid, existing?.name, existing?.name);

      const c = ensureConversation(convos, cid, bestName, DEFAULT_AVATAR);
      const prev = String(c.avatar || "").trim();

      c.avatar = resolveVariantAvatar(cid, url);

      convos[cid] = c;
      writeConversations(convos);
      recomputeMessagesBadge(convos);

      if (prev !== url) emitAvatarUpdated(cid, url);
    }
  }

  // keep Game.currentScene updated
  Game.currentScene = Game.currentScene || "unknown";
  window.addEventListener("scene:mounted", (e) => {
    Game.currentScene = e?.detail?.name || e?.detail?.id || Game.currentScene;
  });

  function getSceneName() {
    const fromGame = String(Game.currentScene || "").trim();
    if (fromGame && fromGame !== "unknown") return fromGame;
    const el = document.querySelector("[data-scene]");
    return el ? String(el.getAttribute("data-scene") || "") : "unknown";
  }

  function getOpenConversationId() {
    const a = safeGetLS("activeConversationId") || "";
    const o = safeGetLS("openConversationId") || "";
    // resolve potential alias stored in LS
    return resolveContactId(a || o, "");
  }

  // Canonical presence contract: a contact counts as "already being shown to
  // the player" the instant navigation toward it is committed (mountState
  // "opening"), not only once the DOM has actually mounted. This is what
  // closes the timing window where a message committed between navigation
  // start and scene mount could still produce a popup for a conversation the
  // player is already looking at (or about to be looking at, deterministically).
  function isContactCanonicallyPresent(threadId) {
    try {
      const engine = window.GameStateEngine;
      const presence = engine?.getConversationPresence ? engine.getConversationPresence() : engine?.getState?.()?.presence;
      if (!presence || !presence.contactId || !presence.mountState) return null;
      if (presence.mountState !== "opening" && presence.mountState !== "mounted") return null;
      if (canonicalId(presence.contactId) !== canonicalId(threadId)) return false;
      // A "mounted" presence only describes an actual UI mount for the
      // SPECIFIC story instance active when it was dispatched (see
      // game-state-engine.js's own SET_CONVERSATION_PRESENCE/contactIsOpen
      // comment) -- a same-contact background admission that supersedes
      // that story (e.g. a same-day hand-off) leaves presence.storyId
      // stale/mismatched against the now-current activeStoryId, and must
      // not be read as "the player is looking at this new content".
      const activeStoryId = engine?.getExecutionState?.()?.activeStoryId || null;
      if (presence.storyId != null && activeStoryId != null && String(presence.storyId) !== String(activeStoryId)) return false;
      return true;
    } catch {
      return null;
    }
  }

  function shouldSuppressPopupForMessages(threadId) {
    if (shouldHideCharacterFromUI(threadId)) return true;

    const presencePresent = isContactCanonicallyPresent(threadId);
    if (presencePresent === true) return true;

    const scene = canonicalId(getSceneName());
    if (scene === "messages" || scene === "splash" || scene === "warning") return true;

    // Fall back to the legacy DOM/localStorage signal only when canonical
    // presence has no opinion (e.g. engine not yet initialized) -- never to
    // override a canonical "not present" with a stale legacy "present".
    if (presencePresent === null && scene === "conversation") {
      const openId = getOpenConversationId();
      if (openId && canonicalId(threadId) === canonicalId(openId)) return true;
    }
    return false;
  }

  function shouldSuppressUnreadForMessages(threadId, isPlayer) {
    if (isPlayer) return true;
    if (shouldHideCharacterFromUI(threadId)) return true;

    const presencePresent = isContactCanonicallyPresent(threadId);
    if (presencePresent === true) return true;
    if (presencePresent === false) return false;

    const scene = canonicalId(getSceneName());
    if (scene === "conversation") {
      const openId = getOpenConversationId();
      if (openId && canonicalId(threadId) === canonicalId(openId)) return true;
    }
    return false;
  }

  // -------------------------
  // Conversations store
  // -------------------------
  function normalizeAndMergeConversation(target, incoming) {
    const t = target || {};
    const c = incoming || {};
    const now = Date.now();

    if (!Array.isArray(t.messages)) t.messages = [];
    if (!Array.isArray(c.messages)) c.messages = [];

    // merge last
    const tAt = Number(t.last?.at || 0) || 0;
    const cAt = Number(c.last?.at || 0) || 0;
    t.last = (cAt >= tAt) ? (c.last || { text: "", at: now }) : (t.last || { text: "", at: now });

    // merge avatar/name safely (prefer existing revealed name/avatar)
    if (!t.name) t.name = c.name || "";
    if (!t.avatar) t.avatar = resolveVariantAvatar(t.id || c.id || "", c.avatar || DEFAULT_AVATAR);

    // sum unread (best effort)
    t.unread = Number(t.unread || 0) + Number(c.unread || 0);

    // concat messages and dedup lightweight
    const combined = t.messages.concat(c.messages);

    // lightweight dedup key
    const seen = new Set();
    const out = [];
    for (const m of combined) {
      if (!m) continue;
      const at = Number(m.at || m.ts || 0) || 0;
      const from = String(m.from || "");
      const kind = String(m.kind || "");
      const text = String(m.text || "");
      const img = String(m.image || m.src || "");
      const k = `${at}|${from}|${kind}|${text}|${img}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(m);
    }

    // sort by time
    out.sort((a, b) => (Number(a.at || 0) - Number(b.at || 0)));

    // keep cap
    if (out.length > MAX_CONVERSATION_MESSAGES) out.splice(0, out.length - MAX_CONVERSATION_MESSAGES);
    t.messages = out;

    const tUnfinished = normalizeConversationUnfinished(t.unfinished);
    const cUnfinished = normalizeConversationUnfinished(c.unfinished);
    if (cUnfinished && (!tUnfinished || Number(cUnfinished.at || 0) >= Number(tUnfinished.at || 0))) {
      t.unfinished = cUnfinished;
    } else if (tUnfinished) {
      t.unfinished = tUnfinished;
    } else {
      delete t.unfinished;
    }

    return t;
  }

  // Group 6 (protected-write elimination): canonical storage substrate
  // (progression.conversationsCache via SET_CONVERSATIONS_CACHE) -- the
  // actual localStorage write for this store now happens exclusively inside
  // scripts/engine/engine-storage.js's generic state serialization, the same
  // way progression.pendingStory's root migration works. This function's own
  // read-repair/normalize-and-write-back logic is unchanged, only the
  // storage substrate underneath it moved.
  let pendingListenerConversationsCache = null;
  let pendingListenerConversationsPlaythroughId = "";
  let listenerCacheFlushScheduled = false;
  let listenerCacheIdleUnsubscribe = null;
  // Only adapter-owned, fully repaired contacts enter this memo. Legacy/raw
  // writers and Save/Load still take the full canonical repair path.
  const repairedConversationContacts = new WeakMap();
  function conversationCacheOwnerKey(identity) {
    return `${String(identity?.playthroughId || "")}|${Number(identity?.operationEpoch || 0)}`;
  }
  function retireStaleConversationCacheProjection(identity) {
    if (!pendingListenerConversationsCache || !identity || conversationCacheOwnerKey(identity) === pendingListenerConversationsPlaythroughId) return;
    pendingListenerConversationsCache = null;
    pendingListenerConversationsPlaythroughId = "";
  }
  // Capture this at adapter startup. If this process began on a legacy
  // profile, leave projection rebuilding to the next clean launch even if
  // SaveSystem completes migration later in the same event turn.
  let deferConversationCacheForLegacyStartup = false;
  try { deferConversationCacheForLegacyStartup = window.__SAVE_INTERNAL_SNAPSHOT_MIGRATED_THIS_LAUNCH === true || localStorage.getItem("save_internal_snapshot_migration_v1") !== "1"; } catch {}
  function commitConversationsCache(obj) {
    if (window.__QA_FIXED_STATE_NO_PRESENCE_COMMITS === true) return false;
    // Legacy profiles can start with almost no quota headroom. SaveSystem owns
    // the one-time internal-slot compaction, so do not race that migration by
    // rebuilding this reconstructible projection during startup.
    if (deferConversationCacheForLegacyStartup || localStorage.getItem("save_internal_snapshot_migration_v1") !== "1") return false;
    const engine = window.GameStateEngine;
    if (!engine) return false;
    const identity = typeof engine.getConversationCacheFlushIdentity === "function"
      ? engine.getConversationCacheFlushIdentity()
      : (() => { const state = engine.getGameplayState(); return { revision: state.revision, hasActiveLease: !!state.execution?.lease }; })();
    // This cache is reconstructible from canonical events. Do not create a
    // second canonical transaction while a story lease is active; doing so
    // puts a compatibility projection ahead of the actual message command
    // under quota pressure and makes one player click consume two revisions.
    // It may be checkpointed later when execution is idle.
    if (identity.hasActiveLease) return false;
    const result = engine.dispatch({
      type: "SET_CONVERSATIONS_CACHE",
      commandId: `conversations-cache:${identity.revision}`,
      expectedRevision: identity.revision,
      payload: { store: obj || {} }
    });
    return result?.ok !== false;
  }
  function armConversationCacheIdleFlush() {
    const engine = window.GameStateEngine;
    if (!engine?.subscribe || listenerCacheIdleUnsubscribe) return;
    listenerCacheIdleUnsubscribe = engine.subscribe(() => {
      if (!pendingListenerConversationsCache) return;
      const identity = engine.getConversationCacheFlushIdentity
        ? engine.getConversationCacheFlushIdentity()
        : (() => { const state = engine.getGameplayState(); return { revision: state.revision, playthroughId: state.playthrough?.id || "", operationEpoch: state.execution?.operationEpoch || 0, hasActiveLease: !!state.execution?.lease }; })();
      if (identity.hasActiveLease) return;
      const store = pendingListenerConversationsCache;
      const playthroughId = pendingListenerConversationsPlaythroughId;
      pendingListenerConversationsCache = null;
      pendingListenerConversationsPlaythroughId = "";
      if (conversationCacheOwnerKey(identity) !== playthroughId) {
        try { listenerCacheIdleUnsubscribe?.(); } catch {}
        listenerCacheIdleUnsubscribe = null;
        return;
      }
      if (!commitConversationsCache(store)) {
        pendingListenerConversationsCache = store;
        pendingListenerConversationsPlaythroughId = playthroughId;
        return;
      }
      try { listenerCacheIdleUnsubscribe?.(); } catch {}
      listenerCacheIdleUnsubscribe = null;
    });
  }
  function persistConversationsCache(obj) {
    const engine = window.GameStateEngine;
    if (!engine) return;
    // A quota recovery deliberately prunes this reconstructible projection.
    // Do not rebuild it on the very message that consumed the emergency
    // reserve; canonical conversation events remain authoritative. The
    // pressure marker is cleared only by a later launch that can safely
    // recreate the reserve (SaveSystem's headroom contract).
    try { if (localStorage.getItem("intercepted_storage_pressure_compaction_v1") != null) return; } catch {}
    // conversationsCache is a compatibility projection of already-committed
    // canonical conversation events, not the semantic commit itself. Several
    // adapters update name/last/unread/messages during one visible message;
    // dispatching each intermediate projection serialized the whole engine
    // state repeatedly on the click-to-paint path. Keep the latest projection
    // immediately readable below, but flush it once at the microtask boundary.
    const identity = engine.getConversationCacheFlushIdentity
      ? engine.getConversationCacheFlushIdentity()
      : (() => { const state = engine.getGameplayState(); return { playthroughId: state.playthrough?.id || "", operationEpoch: state.execution?.operationEpoch || 0 }; })();
    pendingListenerConversationsCache = obj || {};
    pendingListenerConversationsPlaythroughId = conversationCacheOwnerKey(identity);
    if (listenerCacheFlushScheduled) return;
    listenerCacheFlushScheduled = true;
    const enqueue = typeof queueMicrotask === "function" ? queueMicrotask : (fn) => Promise.resolve().then(fn);
    enqueue(() => {
      listenerCacheFlushScheduled = false;
      const latestIdentity = engine.getConversationCacheFlushIdentity
        ? engine.getConversationCacheFlushIdentity()
        : (() => { const state = engine.getGameplayState(); return { playthroughId: state.playthrough?.id || "", operationEpoch: state.execution?.operationEpoch || 0 }; })();
      const store = pendingListenerConversationsCache;
      const playthroughId = pendingListenerConversationsPlaythroughId;
      pendingListenerConversationsCache = null;
      pendingListenerConversationsPlaythroughId = "";
      // A reset replaces playthrough identity atomically. Never let a queued
      // projection from the prior generation cross that boundary.
      if (!store || conversationCacheOwnerKey(latestIdentity) !== playthroughId) return;
      if (!commitConversationsCache(store)) {
        pendingListenerConversationsCache = store;
        pendingListenerConversationsPlaythroughId = playthroughId;
        armConversationCacheIdleFlush();
      }
    });
  }

  function conversationPreviewLabel(event) {
    const kind = String(event?.kind || event?.type || "").trim().toLowerCase();
    const text = String(event?.text || "").trim();
    if (kind === "message" || kind === "text") return text;
    const ui = (key, fallback) => { try { return Game.i18n?.ui?.(key, fallback) || fallback; } catch { return fallback; } };
    if (kind === "image" || kind === "photo") return ui("conversation.preview.sent_photo", "Photo");
    if (kind === "audio" || kind === "voice" || kind === "voice_note") return ui("conversation.preview.sent_audio", "Audio");
    if (kind === "video") return ui("conversation.preview.sent_video", "Video");
    if (kind === "file" || kind === "attachment") return ui("conversation.preview.sent_attachment", "Attachment");
    return text;
  }

  function getLatestDurableConversationPreview(contactId, suppliedState) {
    const id = resolveContactId(contactId, "");
    const engine = window.GameStateEngine;
    const state = suppliedState || (typeof engine?.getConversationsState === "function"
      ? { conversations: engine.getConversationsState() }
      : engine?.getState?.());
    const events = Array.isArray(state?.conversations?.eventsByContact?.[id])
      ? state.conversations.eventsByContact[id]
      : [];
    const eligible = events.filter((event) => event && event.visible !== false && String(event.eventId || "").trim() &&
      !["player", "mc", "system"].includes(String(event.from || event.fromId || "").toLowerCase()) &&
      !["note", "divider", "hak_transcript"].includes(String(event.kind || event.type || "").toLowerCase()));
    if (!eligible.length) return null;
    const latestId = String(state?.conversations?.latestEventByContact?.[id] || "").trim();
    const event = (latestId && eligible.find((row) => String(row.eventId || "") === latestId)) || eligible[eligible.length - 1];
    const text = conversationPreviewLabel(event);
    if (!text) return null;
    return { event, eventId: String(event.eventId), kind: String(event.kind || event.type || ""), text, at: Number(event.at || event.timestamp || event.revision || 0) || 0 };
  }

  Game.getLatestDurableConversationPreview = getLatestDurableConversationPreview;

  function readConversations(opts) {
    const skipSelfHealPersist = !!(opts && opts.skipSelfHealPersist);
    const engine = window.GameStateEngine;
    retireStaleConversationCacheProjection(engine?.getConversationCacheFlushIdentity?.());
    const targetId = resolveContactId(opts && opts.contactId || "", "");
    if (targetId && engine && typeof engine.getConversationProjectionContact === "function") {
      const base = pendingListenerConversationsCache && typeof pendingListenerConversationsCache === "object" && !Array.isArray(pendingListenerConversationsCache)
        ? pendingListenerConversationsCache
        : (typeof engine.getConversationsCache === "function" ? engine.getConversationsCache() : {});
      const rebuilt = { ...(base || {}) };
      const projection = engine.getConversationProjectionContact(targetId);
      const events = Array.isArray(projection?.events) ? projection.events.filter((event) => event && event.visible !== false) : [];
      const prior = rebuilt[targetId] && typeof rebuilt[targetId] === "object" ? rebuilt[targetId] : {};
      const previewState = { conversations: { eventsByContact: { [targetId]: events }, latestEventByContact: { [targetId]: projection?.latestEventId || "" }, unreadByContact: { [targetId]: projection?.unread || 0 } } };
      const preview = getLatestDurableConversationPreview(targetId, previewState);
      rebuilt[targetId] = {
        ...prior,
        id: targetId,
        name: chooseBestName(targetId, prior.name || "", prior.name || ""),
        avatar: resolveVariantAvatar(targetId, prior.avatar || DEFAULT_AVATAR),
        last: preview ? { text: preview.text, at: preview.at, eventId: preview.eventId, kind: preview.kind } : null,
        unread: Math.max(0, Number(projection?.unread ?? prior.unread ?? 0) || 0),
        messages: events.slice(-MAX_CONVERSATION_MESSAGES).map((event) => ({ id:event.eventId, eventId:event.eventId, from:event.from, kind:event.kind === "message" ? "text" : event.kind, ...(event.presentation === "player_thought" ? { presentation:"player_thought", speaker:"player" } : {}), text:event.text || "", image:event.assetId || undefined, link:normalizeMessageLink(event.link) || undefined, storyPath:event.storyPath || undefined, sourceStepIndex:Number.isFinite(Number(event.stepIndex)) ? Number(event.stepIndex) : undefined, at:Number(event.revision || 0), committed:true }))
      };
      return rebuilt;
    }
    // FINAL PERFORMANCE BLOCKER (2026-08-20): this function runs on EVERY
    // single message via Game.notify() below -- previously called
    // engine.getGameplayState() (a full multi-domain deep clone: hak/onlyfun/
    // cardVault/gallery/execution/world/conversations/notifications/
    // presence/recovery/progression) just to read one field,
    // progression.conversationsCache. getConversationsCache() (mirrors the
    // already-established getWorldActiveCharacters()/getOperationEpoch()
    // narrow-accessor pattern) deep-clones only that one domain, preserving
    // the identical "fully independent, safe to mutate" contract this
    // function's own read-repair/merge logic below already depends on.
    // A pending listener projection is not necessarily complete. Canonical
    // story commits can land between the projection being queued and a scene
    // transition (notably conversation -> OnlyFun). Returning it directly
    // allowed the next metadata write to persist that older snapshot and
    // genuinely roll a thread back to Day 1. It remains the starting value,
    // but must always pass through the canonical reconciliation below before
    // any caller is allowed to write it back.
    let parsed = pendingListenerConversationsCache || (engine ? (typeof engine.getConversationsCache === "function" ? engine.getConversationsCache() : engine.getGameplayState().progression.conversationsCache) : {});
    const state = engine ? (typeof engine.getConversationsState === "function"
      ? { conversations: engine.getConversationsState() }
      : (typeof engine.getState === "function" ? engine.getState() : engine.getGameplayState())) : null;
    const unreadByContact = state?.conversations?.unreadByContact;
    // conversationsCache is rebuildable and is intentionally pruned during
    // quota recovery. An empty projection must never hide canonical threads.
    if (engine && parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      // conversations.eventsByContact belongs to the full canonical state;
      // getGameplayState() intentionally omits that journal. Reading the
      // reduced view here made every repair see an empty event map and left
      // Day 2+ messages absent from conversationsCache.
      const eventsByContact = state?.conversations?.eventsByContact || {};
      const rebuilt = { ...parsed };
      for (const [rawId, rawEvents] of Object.entries(eventsByContact)) {
        const id = resolveContactId(rawId, "");
        const events = Array.isArray(rawEvents) ? rawEvents.filter((event) => event && event.visible !== false) : [];
        if (!id || !events.length || shouldHideCharacterFromUI(id)) continue;
        const messages = events.slice(-MAX_CONVERSATION_MESSAGES).map((event) => ({ id:event.eventId, eventId:event.eventId, from:event.from, kind:event.kind === "message" ? "text" : event.kind, ...(event.presentation === "player_thought" ? { presentation:"player_thought", speaker:"player" } : {}), text:event.text || "", image:event.assetId || undefined, link:normalizeMessageLink(event.link) || undefined, storyPath:event.storyPath || undefined, sourceStepIndex:Number.isFinite(Number(event.stepIndex)) ? Number(event.stepIndex) : undefined, at:Number(event.revision || 0), committed:true }));
        const preview = getLatestDurableConversationPreview(id, state);
        const prior=rebuilt[id]&&typeof rebuilt[id]==="object"?rebuilt[id]:{};
        rebuilt[id] = { ...prior, id, name:chooseBestName(id, prior.name || "", prior.name || ""), avatar:resolveVariantAvatar(id, prior.avatar || DEFAULT_AVATAR), last:preview ? { text:preview.text, at:preview.at, eventId:preview.eventId, kind:preview.kind } : null, unread:Math.max(0, Number(state?.conversations?.unreadByContact?.[id] ?? prior.unread ?? 0) || 0), messages };
      }
      // Admission is navigation authority before the first interpreted step.
      // A save at rootIndex 0 has no notify/message to rebuild this row from,
      // and restoring correctly retires any uncommitted in-memory cache.
      // Derive the admitted owner as an empty, openable thread instead of
      // requiring a message event or a pending-resume record to reveal it.
      // This projection neither opens the thread nor fabricates story output.
      const execution = engine.getExecutionState?.() || {};
      const owner = resolveContactId(execution.activeContactId || "", "");
      if (owner && !["player", "you", "me", "system", "__global_story__"].includes(owner) &&
          execution.activeStoryId && execution.activeStoryPath && execution.lease?.id &&
          execution.lease.storyId === execution.activeStoryId &&
          execution.cursor?.completion !== "completed" && !shouldHideCharacterFromUI(owner) && !rebuilt[owner]) {
        rebuilt[owner] = {
          id: owner, name: chooseBestName(owner, "", ""), avatar: resolveVariantAvatar(owner, DEFAULT_AVATAR),
          last: { text: "", at: 0 }, unread: Math.max(0, Number(state.conversations?.unreadByContact?.[owner]) || 0), messages: []
        };
      }
      if (Object.keys(rebuilt).length) parsed = rebuilt;
    }
    if (!parsed || typeof parsed !== "object") return {};

    const now = Date.now();

    // v0 array -> object
    if (Array.isArray(parsed)) {
      const obj = {};
      for (const c0 of parsed) {
        if (!c0) continue;
        const rawId = c0.id || c0.name;
        const id = resolveContactId(rawId, c0.name || "");
        if (!id) continue;

        const bestName = chooseBestName(id, c0.name, c0.name);
        const incoming = {
          id,
          name: bestName,
          avatar: resolveVariantAvatar(id, c0.avatar || c0.avatarUrl || c0.photo || DEFAULT_AVATAR),
          last: c0.last || { text: c0.lastMessage || "", at: c0.updatedAt || now },
          unread: Number(c0.unread || 0),
          messages: Array.isArray(c0.messages) ? c0.messages : [],
          unfinished: normalizeConversationUnfinished(c0.unfinished)
        };

        obj[id] = normalizeAndMergeConversation(obj[id], incoming);
      }
      let hiddenChanged = false;
      for (const id of Object.keys(obj)) {
        // Aliases describe one thread, so their cached unread values cannot
        // be added back after its canonical count has already been cleared.
        if (unreadByContact) obj[id].unread = Math.max(0, Number(unreadByContact[id]) || 0);
        if (!shouldHideCharacterFromUI(id)) continue;
        delete obj[id];
        hiddenChanged = true;
      }
      persistConversationsCache(obj);
      if (hiddenChanged) {
        const openId = resolveContactId(safeGetLS("openConversationId") || "", "");
        const activeId = resolveContactId(safeGetLS("activeConversationId") || "", "");
        if (openId && shouldHideCharacterFromUI(openId)) safeDelLS("openConversationId");
        if (activeId && shouldHideCharacterFromUI(activeId)) safeDelLS("activeConversationId");
      }
      return obj;
    }

    // object -> normalize keys (merge aliases)
    const obj = {};
    for (const k in parsed) {
      const c0 = parsed[k];
      if (!c0 || typeof c0 !== "object") continue;

      const rawId = c0.id || k;
      const id = resolveContactId(rawId, c0.name || "");
      if (!id) continue;

      const incoming = {
        id,
        name: chooseBestName(id, c0.name, c0.name),
        avatar: resolveVariantAvatar(id, c0.avatar || DEFAULT_AVATAR),
        last: (c0.last && typeof c0.last === "object") ? c0.last : { text: "", at: now },
        unread: Number(c0.unread || 0),
        messages: Array.isArray(c0.messages) ? c0.messages : [],
        unfinished: normalizeConversationUnfinished(c0.unfinished)
      };

      obj[id] = normalizeAndMergeConversation(obj[id], incoming);
    }

    // ensure minimum structure + stable names
    for (const id in obj) {
      const c = obj[id];
      c.id = canonicalId(id);
      if (!Array.isArray(c.messages)) c.messages = [];
      if (!c.last || typeof c.last !== "object") c.last = { text: "", at: now };
      if (unreadByContact) c.unread = Math.max(0, Number(unreadByContact[id]) || 0);
      else if (c.unread == null) c.unread = 0;
      c.avatar = resolveVariantAvatar(id, c.avatar || DEFAULT_AVATAR);
      c.name = chooseBestName(id, c.name, c.name);
      const normalizedUnfinished = normalizeConversationUnfinished(c.unfinished);
      if (normalizedUnfinished) c.unfinished = normalizedUnfinished;
      else delete c.unfinished;

      // ✅ learn alias from good names
      learnAlias(id, c.name);
    }

    for (const id of Object.keys(obj)) {
      if (!shouldHideCharacterFromUI(id)) continue;
      delete obj[id];
    }

    // Read repair must be idempotent. Persist only when normalization actually
    // changed the canonical projection; an unconditional write here makes an
    // engine listener recursively dispatch SET_CONVERSATIONS_CACHE while it is
    // merely reading the cache after a message commit.
    //
    // skipSelfHealPersist (FINAL PERFORMANCE BLOCKER, 2026-08-20): this
    // check itself -- two full JSON.stringify() calls over the ENTIRE
    // rebuilt conversation store, scaling with total accumulated history --
    // is pure waste for a caller (Game.notify(), the exact per-message hot
    // path) that is about to mutate `obj` further and call
    // writeConversations()/persistConversationsCache() again unconditionally
    // right after anyway (see notify()'s own writeConversations(convos)
    // call). Whatever this check would have decided gets superseded by that
    // guaranteed later write before the microtask-batched
    // commitConversationsCache() flush ever runs (persistConversationsCache
    // just overwrites pendingListenerConversationsCache with the newer
    // value). Every OTHER call site (which does not necessarily write
    // afterward) keeps the exact original self-healing behavior unchanged.
    let normalizationChanged = true;
    if (!skipSelfHealPersist) {
      try { normalizationChanged = JSON.stringify(obj) !== JSON.stringify(parsed); } catch {}
      if (normalizationChanged) persistConversationsCache(obj);
    }
    const openId = resolveContactId(safeGetLS("openConversationId") || "", "");
    const activeId = resolveContactId(safeGetLS("activeConversationId") || "", "");
    if (openId && shouldHideCharacterFromUI(openId)) safeDelLS("openConversationId");
    if (activeId && shouldHideCharacterFromUI(activeId)) safeDelLS("activeConversationId");
    return obj;
  }

  function cloneConversationValue(value) {
    if (value == null) return value;
    try { if (typeof structuredClone === "function") return structuredClone(value); } catch {}
    try { return JSON.parse(JSON.stringify(value)); } catch { return null; }
  }

  function conversationContactMetadata(source) {
    if (!source || typeof source !== "object") return cloneConversationValue(source);
    return cloneConversationValue({ name:source.name, avatar:source.avatar, last:source.last, unread:source.unread, unfinished:source.unfinished });
  }

  function selectConversationContactSource(cid, metadataOnly = false) {
    const engine = window.GameStateEngine;
    const identity = engine?.getConversationCacheFlushIdentity?.();
    retireStaleConversationCacheProjection(identity);
    let pendingSource = null;
    if (pendingListenerConversationsCache && typeof pendingListenerConversationsCache === "object" && !Array.isArray(pendingListenerConversationsCache)) {
      pendingSource = pendingListenerConversationsCache[cid];
    }
    const summary = engine?.getConversationCacheContactSummary?.(cid);
    const committedSource = !summary
      ? (engine && typeof engine.getConversationCacheContact === "function"
        ? engine.getConversationCacheContact(cid)
        : cloneConversationValue(engine?.getConversationsCache?.()?.[cid]))
      : null;

    // The listener projection is microtask-batched. During a scene switch it
    // can therefore still describe the previous render tick while the engine
    // already contains messages committed by a background/notification story.
    // Preferring it unconditionally made hydration paint the shorter history;
    // the subsequent flush repaired storage but never repainted the DOM. Pick
    // the candidate with the most complete transcript. On equal cardinality,
    // keep the pending candidate because it may contain newer metadata that is
    // intentionally waiting for its canonical cache commit.
    const pendingCount = Array.isArray(pendingSource?.messages) ? pendingSource.messages.length : -1;
    const committedCount = summary ? summary.messageCount : (Array.isArray(committedSource?.messages) ? committedSource.messages.length : -1);
    if (committedCount > pendingCount || !pendingSource) {
      if (metadataOnly) return summary ? summary.metadata : conversationContactMetadata(committedSource);
      // The engine getter already returns independently mutable rows.
      return summary ? engine.getConversationCacheContact(cid) : committedSource;
    }
    return metadataOnly ? conversationContactMetadata(pendingSource) : cloneConversationValue(pendingSource);
  }

  function readConversationContactNarrow(rawId) {
    const cid = resolveContactId(rawId || "", "");
    if (!cid || shouldHideCharacterFromUI(cid)) return null;
    const engine = window.GameStateEngine;
    retireStaleConversationCacheProjection(engine?.getConversationCacheFlushIdentity?.());
    const cached = pendingListenerConversationsCache?.[cid];
    const repaired = cached && repairedConversationContacts.get(cached);
    if (repaired && repaired.messages === cached.messages && engine?.getConversationProjectionDelta) {
      const delta = engine.getConversationProjectionDelta(cid, repaired.identity);
      if (delta) {
        const removed = new Set(delta.dropEventIds);
        const event = delta.summary.previewEvent;
        const preview = event ? conversationPreviewLabel(event) : '';
        const metadata = {
          ...conversationContactMetadata(cached),
          unread:Math.max(0, Number(delta.summary.unread || 0)),
          last:preview ? {text:preview,at:Number(event.at || event.timestamp || event.revision || 0),eventId:String(event.eventId),kind:String(event.kind || event.type || '')} : null
        };
        // Historical compatibility rows are read-only here. Copy the array;
        // only new canonical events need new row objects and normalization.
        metadata.messages = cached.messages.filter(row=>!removed.has(String(row?.eventId || row?.id || ''))).concat(delta.events.map(event=>({id:event.eventId,eventId:event.eventId,from:event.from,kind:event.kind==='message'?'text':event.kind,...(event.presentation==='player_thought'?{presentation:'player_thought',speaker:'player'}:{}),text:event.text||'',image:event.assetId||undefined,link:normalizeMessageLink(event.link)||undefined,storyPath:event.storyPath||undefined,sourceStepIndex:Number.isFinite(Number(event.stepIndex))?Number(event.stepIndex):undefined,at:Number(event.revision||0),committed:true})));
        const contact = normalizeConversationContactSource(cid, metadata);
        if (contact.messages.length === delta.summary.visibleCount) repairedConversationContacts.set(contact,{identity:delta.identity,messages:contact.messages,canonicalOnly:repaired.canonicalOnly===true});
        return contact;
      }
    }
    let source = selectConversationContactSource(cid);
    // A pending cache can lag a canonical commit or have the same capped row
    // count but an older final event. Repair only this contact from authority;
    // never read or normalize every other thread to display one new message.
    const projection = engine?.getConversationProjectionContact?.(cid);
    const events = Array.isArray(projection?.events) ? projection.events.filter((event) => event && event.visible !== false) : [];
    if (events.length) {
      const prior = source && typeof source === "object" ? source : {};
      const previous = new Map((prior.messages || []).map((row) => [String(row?.eventId || row?.id || ""), row]));
      const state = { conversations: { eventsByContact: { [cid]: events }, latestEventByContact: { [cid]: projection.latestEventId } } };
      const preview = getLatestDurableConversationPreview(cid, state);
      source = {
        ...prior,
        id: cid,
        unread: Math.max(0, Number(projection.unread || 0)),
        last: preview ? { text: preview.text, at: preview.at, eventId: preview.eventId, kind: preview.kind } : null,
        messages: events.map((event) => ({ ...previous.get(String(event.eventId || "")), id:event.eventId, eventId:event.eventId, from:event.from, kind:event.kind === "message" ? "text" : event.kind, ...(event.presentation === "player_thought" ? { presentation:"player_thought", speaker:"player" } : {}), text:event.text || "", image:event.assetId || undefined, link:normalizeMessageLink(event.link) || undefined, storyPath:event.storyPath || undefined, sourceStepIndex:Number.isFinite(Number(event.stepIndex)) ? Number(event.stepIndex) : undefined, at:Number(event.revision || 0), committed:true }))
      };
    }
    // A pruned/legacy cache can outlive its visible journal window. Missing
    // events do not authorize replacing a known canonical zero with its badge.
    if (projection && source && typeof source === "object") source = { ...source, unread: Math.max(0, Number(projection.unread) || 0) };
    const contact = normalizeConversationContactSource(cid, source);
    if (contact && events.length && contact.messages.length === events.length && engine?.getConversationJournalIdentity) repairedConversationContacts.set(contact,{identity:engine.getConversationJournalIdentity(cid),messages:contact.messages});
    return contact;
  }

  function normalizeConversationContactSource(cid, source, metadataOnly = false) {
    if (!source || typeof source !== "object") return null;
    const now = Date.now();
    const incoming = {
      id: cid,
      name: chooseBestName(cid, source.name, source.name),
      avatar: resolveVariantAvatar(cid, source.avatar || DEFAULT_AVATAR),
      last: (source.last && typeof source.last === "object") ? source.last : { text: "", at: now },
      unread: Number(source.unread || 0),
      messages: !metadataOnly && Array.isArray(source.messages) ? source.messages : [],
      unfinished: normalizeConversationUnfinished(source.unfinished)
    };
    const conv = normalizeAndMergeConversation(null, incoming);
    conv.id = cid;
    conv.name = chooseBestName(cid, conv.name, conv.name);
    conv.avatar = resolveVariantAvatar(cid, conv.avatar || DEFAULT_AVATAR);
    if (!Array.isArray(conv.messages)) conv.messages = [];
    if (!conv.last || typeof conv.last !== "object") conv.last = { text: "", at: now };
    if (conv.unread == null) conv.unread = 0;
    const unfinished = normalizeConversationUnfinished(conv.unfinished);
    if (unfinished) conv.unfinished = unfinished;
    else delete conv.unfinished;
    learnAlias(cid, conv.name);
    if (metadataOnly) delete conv.messages;
    return conv;
  }

  function readConversationMetaNarrow(rawId) {
    const cid = resolveContactId(rawId || "", "");
    if (!cid || shouldHideCharacterFromUI(cid)) return null;
    const engine = window.GameStateEngine;
    if (!engine?.getConversationProjectionSummary) {
      const conv = readConversationContactNarrow(cid);
      if (conv) delete conv.messages;
      return conv;
    }
    let source = selectConversationContactSource(cid, true);
    const projection = engine.getConversationProjectionSummary(cid);
    if (projection.visibleCount > 0) {
      const event = projection.previewEvent;
      const text = event ? conversationPreviewLabel(event) : "";
      source = {
        ...(source && typeof source === "object" ? source : {}),
        unread: Math.max(0, Number(projection.unread || 0)),
        last: text ? { text, at:Number(event.at || event.timestamp || event.revision || 0) || 0, eventId:String(event.eventId), kind:String(event.kind || event.type || "") } : null
      };
    }
    if (source && typeof source === "object") source = { ...source, unread: Math.max(0, Number(projection.unread) || 0) };
    return normalizeConversationContactSource(cid, source, true);
  }

  function readConversationForEpisodeStamp(rawId) {
    const cid = resolveContactId(rawId || "", "");
    const fallback = () => readConversations()[cid] || null;
    const engine = window.GameStateEngine;
    retireStaleConversationCacheProjection(engine?.getConversationCacheFlushIdentity?.());
    if (!cid || canonicalId(rawId) !== cid || shouldHideCharacterFromUI(cid) || !engine?.getConversationReadShape || !engine?.getConversationFullReadProjectionContact) return fallback();
    const shape = engine.getConversationReadShape();
    const pending = pendingListenerConversationsCache;
    const objectStore = pending ? typeof pending === "object" && !Array.isArray(pending) : shape.objectStore;
    const cacheRows = pending && objectStore
      ? Object.entries(pending).map(([key,row]) => ({ key, objectRow:!!row && typeof row === "object" && !Array.isArray(row), id:row?.id, name:row?.name }))
      : shape.cacheRows;
    // Alias merging, hidden-contact cleanup and legacy migration stay owned
    // by the full reader. Ordinary canonical-key stores need no peer history.
    if (!objectStore || cacheRows.some(row => !row.objectRow || canonicalId(row.key) !== row.key || resolveContactId(row.id || row.key, row.name || "") !== row.key || shouldHideCharacterFromUI(row.key)) || shape.eventKeys.some(key => canonicalId(key) !== key || resolveContactId(key, "") !== key)) return fallback();
    const projection = engine.getConversationFullReadProjectionContact(cid);
    if (!Array.isArray(projection?.events) || !projection.events.length) return fallback();
    const prior = pending ? conversationContactMetadata(pending[cid]) : engine.getConversationCacheContactSummary(cid).metadata;
    const event = projection.previewEvent;
    const preview = getLatestDurableConversationPreview(cid, { conversations:{ eventsByContact:{ [cid]:event ? [event] : [] }, latestEventByContact:{ [cid]:event?.eventId || "" } } });
    const source = {
      ...(prior && typeof prior === "object" ? prior : {}),
      id:cid,
      name:chooseBestName(cid, prior?.name || "", prior?.name || ""),
      avatar:resolveVariantAvatar(cid, prior?.avatar || DEFAULT_AVATAR),
      last:preview ? { text:preview.text, at:preview.at, eventId:preview.eventId, kind:preview.kind } : null,
      unread:Math.max(0, Number(projection.unread ?? prior?.unread ?? 0) || 0),
      messages:projection.events.map(event => ({ id:event.eventId, eventId:event.eventId, from:event.from, kind:event.kind === "message" ? "text" : event.kind, ...(event.presentation === "player_thought" ? { presentation:"player_thought", speaker:"player" } : {}), text:event.text || "", image:event.assetId || undefined, link:normalizeMessageLink(event.link) || undefined, storyPath:event.storyPath || undefined, sourceStepIndex:Number.isFinite(Number(event.stepIndex)) ? Number(event.stepIndex) : undefined, at:Number(event.revision || 0), committed:true }))
    };
    return normalizeConversationContactSource(cid, source);
  }

  function writeConversationContactValue(cid, conversation, ownedDetached = false) {
    retireStaleConversationCacheProjection(window.GameStateEngine?.getConversationCacheFlushIdentity?.());
    const base = pendingListenerConversationsCache || window.GameStateEngine?.getConversationsCache?.() || {};
    persistConversationsCache({ ...base, [cid]:ownedDetached ? conversation : cloneConversationValue(conversation) });
  }

  function writeConversations(obj) {
    persistConversationsCache(obj);
    emitConversationsUpdated();
  }

  function canonicalCommittedMessage(conversation) {
    const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
    let latest = null;
    for (let index = 0; index < messages.length; index += 1) {
      const row = messages[index];
      if (!row || row.deleted === true || row.temporary === true || row.committed === false) continue;
      const kind = String(row.kind || "text").toLowerCase();
      if (kind === "system" || kind === "typing" || kind === "placeholder") continue;
      const at = Number(row.at || row.ts || 0) || 0;
      if (!latest || at > latest.at || (at === latest.at && index > latest.index)) latest = { row, at, index };
    }
    if (!latest) return null;
    const row = latest.row;
    const kind = String(row.kind || "text").toLowerCase();
    const text = (kind === "image" || kind === "photo") ? "Photo" : String(row.text || row.preview || "").trim();
    return {
      eventId: String(row.eventId || row.__eventId || row.id || "").trim(),
      contactId: canonicalId(conversation?.contactId || conversation?.id || ""),
      text: text || "New message",
      at: latest.at
    };
  }

  function reconcileCanonicalLast(conversation, candidate = null) {
    const committed = canonicalCommittedMessage(conversation);
    const next = candidate && typeof candidate === "object" ? candidate : null;
    if (committed && (!next || committed.at >= (Number(next.at || 0) || 0))) {
      conversation.last = { text: committed.text, at: committed.at, eventId: committed.eventId || undefined };
      return committed;
    }
    if (next) conversation.last = {
      text: String(next.text || "New message").trim() || "New message",
      at: Number(next.at || Date.now()),
      eventId: String(next.eventId || "").trim() || undefined
    };
    return next || committed;
  }

  // Canonical-first: window.Game.onceDone already checks progression.onceKeys
  // (populated by every real COMPLETE_STORY dispatch, not just Start From)
  // before falling back to the legacy once_/__once:/conv_done_ keys this
  // function used to check exclusively -- a real completion via normal
  // gameplay was invisible here otherwise, since COMPLETE_STORY's own
  // engine-side handler has never written those legacy keys.
  function continuationIsAlreadyCompleted(open) {
    const meta = open && typeof open === "object" ? open : {};
    const onceKey = String(meta.onceKey || "").trim();
    if (onceKey) {
      if (window.Game && typeof window.Game.onceDone === "function" && window.Game.onceDone(onceKey) === true) return true;
      if (
        safeGetLS(`once_${onceKey}`) === "1" ||
        safeGetLS(`__once:${onceKey}`) === "1" ||
        safeGetLS(onceKey) === "1"
      ) return true;
    }
    const storyPath = normalizeStoryPath(meta.storyPath || "");
    if (!storyPath) return false;
    const contactId = canonicalId(meta.contactId || meta.id || "");
    return !!contactId && safeGetLS(`conv_done_${contactId}_${storyPath}`) === "1";
  }

  function ensureConversation(convos, id, name, avatar) {
    const now = Date.now();
    const bestName = chooseBestName(id, name, convos[id]?.name);

    if (!convos[id]) {
      convos[id] = {
        id,
        name: bestName,
        avatar: resolveVariantAvatar(id, avatar || DEFAULT_AVATAR),
        last: { text: "", at: now },
        unread: 0,
        messages: []
      };
    } else {
      if (!Array.isArray(convos[id].messages)) convos[id].messages = [];
      if (!convos[id].last || typeof convos[id].last !== "object") convos[id].last = { text: "", at: now };
      if (convos[id].unread == null) convos[id].unread = 0;

      convos[id].name = chooseBestName(id, name, convos[id].name);

      convos[id].avatar = resolveVariantAvatar(id, convos[id].avatar || avatar || DEFAULT_AVATAR);
    }

    // learn alias from bestName (universal)
    learnAlias(id, bestName);

    return convos[id];
  }

  function setConversationNeedsPlayerValue(convos, id, needs, draftText = "") {
    const cid = resolveContactId(id || "", "");
    if (!cid) return false;
    const conv = ensureConversation(convos, cid, "", "");
    const next = needs ? 1 : 0;
    const prev = Number(conv.needsPlayer || 0) ? 1 : 0;
    const prevDraft = String(conv.playerDraft || "").trim();
    conv.needsPlayer = next;
    conv.playerDraft = next ? String(draftText || "").trim() : "";
    convos[cid] = conv;
    return prev !== next || prevDraft !== String(conv.playerDraft || "").trim();
  }

  // Group 6 (protected-write elimination): this file already declares
  // itself "SINGLE SOURCE OF TRUTH" for the conversations store (message
  // content specifically is already a proper derived projection --
  // installCanonicalMessageBridge in convo-runtime.js subscribes to every
  // canonical COMMIT_MESSAGE_EVENT and calls Game.Inbox.pushMessage, which
  // dedups by eventId before ever appending -- see the eventId check right
  // before the c.messages.push(...) below). What was NOT yet true is that
  // every OTHER file with its own conversations-store read/write pair
  // (index.html, scenes/conversation.html, scripts/convo-runtime.js,
  // scenes/settings.html) actually used this one. Exporting the raw
  // primitives -- deliberately WITHOUT readConversations' normalization
  // side effects folded into behavior callers don't expect, and WITHOUT
  // writeConversations' emitConversationsUpdated so callers that already
  // fire their own conversations:changed/game:conversations-updated events
  // don't double-fire -- lets those files redirect their existing
  // read-modify-write logic through this single implementation with zero
  // behavior change, the same pattern already proven for pending_story_v1's
  // root migration.
  Game.readConversationStore = function readConversationStorePublic() {
    return readConversations();
  };
  Game.readConversationContact = function readConversationContactPublic(id) {
    return readConversationContactNarrow(id);
  };
  Game.readConversationMessages = function readConversationMessagesPublic(id) {
    const conv = readConversationContactNarrow(id);
    return conv ? conv.messages : [];
  };
  Game.readConversationMeta = function readConversationMetaPublic(id) {
    return readConversationMetaNarrow(id);
  };
  Game.readConversationForEpisodeStamp = readConversationForEpisodeStamp;
  Game.canSkipConversationHistoryTrim = function canSkipConversationHistoryTrimPublic(id, limit = MAX_CONVERSATION_MESSAGES) {
    const cid = resolveContactId(id || "", "");
    const max = Number(limit);
    if (!cid || shouldHideCharacterFromUI(cid) || !Number.isFinite(max) || max < 1) return false;
    const projection = window.GameStateEngine?.getConversationProjectionSummary?.(cid);
    // A visible canonical window replaces compatibility rows before the
    // existing normalizer deduplicates, sorts and caps them. Without that
    // proof (including cache-only history), retain the normal trim path.
    return !!projection && projection.visibleCount > 0 && projection.visibleCount <= max && projection.hasDivider === false;
  };
  Game.readConversationCursor = function readConversationCursorPublic(id) {
    const execution = window.GameStateEngine?.getExecutionState?.() || {};
    const cid = resolveContactId(id || "", "");
    if (!cid || canonicalId(execution.activeContactId || execution.cursor?.contactId || "") !== cid) return null;
    return cloneConversationValue(execution.cursor || null);
  };
  Game.writeConversationStoreRaw = function writeConversationStoreRawPublic(obj) {
    persistConversationsCache(obj);
  };
  Game.writeConversationContactRaw = function writeConversationContactRawPublic(id, conversation) {
    const cid = resolveContactId(id || "", "");
    if (!cid || !conversation || typeof conversation !== "object") return;
    writeConversationContactValue(cid, conversation);
  };

  // Public so scripts/protected-media-resolver.js's avatarPath (and any
  // other surface deciding whether to show a contact's real photo) reads
  // the SAME authority convo-runtime.js's live contact:reveal trigger
  // writes to, instead of re-deriving its own copy.
  Game.isAvatarUnlocked = isAvatarUnlocked;
  Game.unlockAvatar = unlockAvatar;

  Game.ensureConversation = function ensureConversationPublic(id, opts = {}) {
    const cid = resolveContactId(id || opts?.id || opts?.contactId || "", opts?.name || opts?.contactName || "");
    if (!cid) return null;
    if (shouldHideCharacterFromUI(cid)) return null;
    const convos = readConversations();
    const conv = ensureConversation(
      convos,
      cid,
      String(opts?.name || opts?.contactName || "").trim(),
      String(opts?.avatar || opts?.avatarUrl || "").trim()
    );
    writeConversations(convos);
    return conv;
  };

  Game.setConversationNeedsPlayer = function setConversationNeedsPlayerPublic(id, needs, draftText = "") {
    const cid = resolveContactId(id || "", "");
    if (!cid) return false;
    if (shouldHideCharacterFromUI(cid)) return false;
    const convos = readConversations();
    ensureConversation(convos, cid, "", "");
    const nextDraft = needs ? String(draftText || "").trim() : "";
    const changed = setConversationNeedsPlayerValue(convos, cid, !!needs, nextDraft);
    writeConversations(convos);
    emitConversationsChanged({ id: cid, needsPlayer: !!needs, playerDraft: nextDraft });
    return changed;
  };

  Game.getConversationNeedsPlayer = function getConversationNeedsPlayerPublic(id) {
    const cid = resolveContactId(id || "", "");
    if (!cid) return false;
    if (shouldHideCharacterFromUI(cid)) return false;
    const convos = readConversations();
    const conv = convos && convos[cid] ? convos[cid] : null;
    return Number(conv?.needsPlayer || 0) === 1;
  };

  Game.getConversationPlayerDraft = function getConversationPlayerDraftPublic(id) {
    const cid = resolveContactId(id || "", "");
    if (!cid) return "";
    if (shouldHideCharacterFromUI(cid)) return "";
    const convos = readConversations();
    const conv = convos && convos[cid] ? convos[cid] : null;
    return String(conv?.playerDraft || "").trim();
  };

  Game.setConversationUnfinished = function setConversationUnfinishedPublic(id, payload = {}) {
    const cid = resolveContactId(id || "", "");
    if (!cid) return null;
    if (shouldHideCharacterFromUI(cid)) return null;
    const convos = readConversations();
    const conv = ensureConversation(convos, cid, "", "");
    const next = normalizeConversationUnfinished({
      ...(conv?.unfinished && typeof conv.unfinished === "object" ? conv.unfinished : {}),
      ...(payload && typeof payload === "object" ? payload : {}),
      active: 1,
      at: Number(payload?.at || Date.now()) || Date.now()
    });
    if (!next) return null;
    conv.unfinished = next;
    convos[cid] = conv;
    writeConversations(convos);
    emitConversationsChanged({ id: cid, unfinished: true, unfinishedReason: String(next.reason || "") });
    return next;
  };

  Game.clearConversationUnfinished = function clearConversationUnfinishedPublic(id, payload = {}) {
    const cid = resolveContactId(id || "", "");
    if (!cid) return false;
    if (shouldHideCharacterFromUI(cid)) return false;
    const convos = readConversations();
    const conv = convos[cid];
    if (!conv || typeof conv !== "object") return false;
    const cur = normalizeConversationUnfinished(conv.unfinished);
    if (!cur) return false;

    const expectedStory = normalizeStoryPath(String(payload?.storyPath || payload?.story || payload?.path || "").trim());
    if (expectedStory && cur.storyPath && normalizeStoryPath(cur.storyPath) !== expectedStory) return false;

    const expectedEpisode = canonicalId(payload?.episodeId || payload?.episode || "");
    if (expectedEpisode && canonicalId(cur.episodeId || "") && canonicalId(cur.episodeId || "") !== expectedEpisode) return false;

    const expectedOnce = canonicalId(payload?.onceKey || payload?.episodeOnceKey || "");
    if (expectedOnce && canonicalId(cur.onceKey || "") && canonicalId(cur.onceKey || "") !== expectedOnce) return false;

    delete conv.unfinished;
    convos[cid] = conv;
    writeConversations(convos);
    emitConversationsChanged({ id: cid, unfinished: false });
    return true;
  };

  Game.getConversationUnfinished = function getConversationUnfinishedPublic(id) {
    const cid = resolveContactId(id || "", "");
    if (!cid) return null;
    if (shouldHideCharacterFromUI(cid)) return null;
    const convos = readConversations();
    return normalizeConversationUnfinished(convos?.[cid]?.unfinished);
  };

  Game.hasAnyConversationUnfinished = function hasAnyConversationUnfinishedPublic() {
    const convos = readConversations();
    for (const id of Object.keys(convos || {})) {
      if (shouldHideCharacterFromUI(id)) continue;
      if (normalizeConversationUnfinished(convos[id]?.unfinished)) return true;
    }
    return false;
  };

  Game.getPendingOutbound = function getPendingOutboundPublic() {
    return readPendingOutbound();
  };

  Game.getPendingOutboundForContact = function getPendingOutboundForContactPublic(id) {
    const cid = resolveContactId(id || "", "");
    if (cid && shouldHideCharacterFromUI(cid)) return null;
    const pending = readPendingOutbound();
    if (!cid || !pending) return null;
    return canonicalId(pending.contactId || "") === cid ? pending : null;
  };

  // -------------------------
  // Badges
  // -------------------------
  function readBadges() {
    const raw = safeGetLS(BADGE_KEY);
    const data = raw ? safeParse(raw, {}) : {};
    return data && typeof data === "object" ? data : {};
  }

  function writeBadges(obj) { safeSetLS(BADGE_KEY, JSON.stringify(obj || {})); }

  function recomputeMessagesBadge(convos) {
    let total = 0;
    for (const k in convos) {
      if (shouldHideCharacterFromUI(k)) continue;
      total += Number(convos[k]?.unread || 0);
    }
    // A command-scoped cache may contain only one contact or stale aliases.
    // The engine owns the total across every durably delivered conversation.
    const canonicalTotal = window.GameStateEngine?.getMessagesUnreadTotal?.();
    if (Number.isFinite(Number(canonicalTotal))) total = Math.max(0, Number(canonicalTotal));
    const badges = readBadges();
    badges.messages = total;
    writeBadges(badges);
    emitBadgeChanged("messages", total);
    return total;
  }

  function purgeHiddenConversationPresence() {
    const convos = readConversations();
    recomputeMessagesBadge(convos);

    const openId = resolveContactId(safeGetLS("openConversationId") || "", "");
    const activeId = resolveContactId(safeGetLS("activeConversationId") || "", "");
    if (openId && shouldHideCharacterFromUI(openId)) safeDelLS("openConversationId");
    if (activeId && shouldHideCharacterFromUI(activeId)) safeDelLS("activeConversationId");
  }

  Game.clearAppBadge = function clearAppBadge(app) {
    const badges = readBadges();
    badges[app] = 0;
    writeBadges(badges);
    emitBadgeChanged(app, 0);
  };

  // -------------------------
  // Dedup (store-level)
  // -------------------------
  const _recentWrites = new Map();
  const WRITE_DEDUP_TTL = 1400;
  const WRITE_EVENT_DEDUP_TTL = 120000;

  function makeWriteKey(app, threadId, now, kind, text, src, isPlayer, eventId) {
    const ev = String(eventId || "").trim();
    if (ev) return `${app}|${threadId}|event|${isPlayer ? "p" : "n"}|${ev}`;
    const t = String(text || "");
    const s = String(src || "");
    return `${app}|${threadId}|${kind}|${isPlayer ? "p" : "n"}|${t}|${s}`;
  }

  function isDuplicateWrite(key) {
    if (!key) return false;
    const now = Date.now();
    const last = _recentWrites.get(key) || 0;
    const ttl = key.includes("|event|") ? WRITE_EVENT_DEDUP_TTL : WRITE_DEDUP_TTL;
    if (now - last < ttl) return true;
    _recentWrites.set(key, now);
    if (_recentWrites.size > 600) {
      for (const [k, t] of _recentWrites) {
        if (now - t > WRITE_EVENT_DEDUP_TTL) _recentWrites.delete(k);
      }
    }
    return false;
  }

  function isCinematicLockActive() {
    if ((window.Game || {})._cinematicLock === true) return true;
    return safeGetLS(CINEMATIC_LOCK_KEY) === "1";
  }

  function getCinematicQueue() {
    if (!Array.isArray(Game._cinematicQueue)) Game._cinematicQueue = [];
    return Game._cinematicQueue;
  }

  const _cinematicQueueSeen = new Map();
  const CINEMATIC_QUEUE_TTL = 120000;

  function makeCinematicQueueKey(payload, app, threadId, text, isPlayer) {
    const ev = String(payload?.__eventId || payload?.eventId || payload?.messageId || payload?.notifId || "").trim();
    if (ev) return `${app}|${threadId}|event|${ev}`;
    const photo = !!(payload?.__isPhoto || payload?.src || payload?.url || payload?.image);
    const src = String(payload?.src || payload?.url || payload?.image || "").trim();
    return `${app}|${threadId}|${photo ? "image" : "text"}|${isPlayer ? "p" : "n"}|${String(text || "")}|${src}`;
  }

  function queueCinematicPayload(payload, meta = {}) {
    const app = String(meta.app || payload?.app || "messages");
    const threadId = canonicalId(meta.threadId || payload?.open?.id || payload?.fromId || payload?.id || "unknown");
    if (app === "messages" && shouldHideCharacterFromUI(threadId)) return;
    if (app !== "messages" && shouldFilterNotificationSender(app, payload?.fromId || payload?.id || "")) return;
    const text = String(meta.text || payload?.text || payload?.preview || "").trim();
    const isPlayer = !!meta.isPlayer;
    const now = Date.now();

    const key = makeCinematicQueueKey(payload, app, threadId, text, isPlayer);
    const seenAt = _cinematicQueueSeen.get(key) || 0;
    if (now - seenAt < WRITE_EVENT_DEDUP_TTL) return;
    _cinematicQueueSeen.set(key, now);

    if (_cinematicQueueSeen.size > 700) {
      for (const [k, t] of _cinematicQueueSeen) {
        if (now - t > CINEMATIC_QUEUE_TTL) _cinematicQueueSeen.delete(k);
      }
    }

    const q = getCinematicQueue();
    q.push({
      type: "notify",
      payload: {
        ...payload,
        __fromCinematicQueue: true
      },
      ts: now,
      key
    });
    if (q.length > 300) q.shift();
  }

  function flushCinematicQueue() {
    if (isCinematicLockActive()) return false;
    const q = getCinematicQueue();
    if (!q.length) return false;

    const list = q.splice(0, q.length);
    const keep = [];
    const deliver = [];

    for (const row of list) {
      if (row && typeof row === "object" && row.type === "notify" && row.payload && typeof row.payload === "object") {
        deliver.push(row);
        continue;
      }
      keep.push(row);
    }

    if (keep.length) q.push(...keep);
    if (!deliver.length) return false;

    deliver.forEach((row, idx) => {
      setTimeout(() => {
        if (isCinematicLockActive()) {
          q.push(row);
          return;
        }
        if (row?.payload?.app === "messages") {
          const threadId = resolveContactId(
            row?.payload?.open?.id || row?.payload?.contactId || row?.payload?.fromId || row?.payload?.id || "",
            row?.payload?.fromName || row?.payload?.name || ""
          );
          if (threadId && shouldHideCharacterFromUI(threadId)) return;
        } else {
          const senderId = resolveContactId(
            row?.payload?.fromId || row?.payload?.id || "",
            row?.payload?.fromName || row?.payload?.name || ""
          );
          if (senderId && shouldFilterNotificationSender(row?.payload?.app, senderId)) return;
        }
        try { Game.notify({ ...row.payload, __fromCinematicQueue: true }); } catch {}
      }, idx * 20);
    });
    return true;
  }

  // -------------------------
  // Dedup (event-level) for ig:post / ig:story
  // -------------------------
  const _recentIg = new Map();
  const IG_TTL = 1500;
  function normalizeIgToken(detail) {
    const onceKey = canonicalId(String(detail?.onceKey || detail?.id || ""));
    if (onceKey) return onceKey;

    const authorId = resolveContactId(
      detail?.authorId || detail?.fromId || detail?.id || detail?.user || detail?.authorName || "",
      detail?.authorName || detail?.user || ""
    );
    const img = canonicalId(String(detail?.image || detail?.url || detail?.photo || ""));
    return [canonicalId(authorId), img].filter(Boolean).join("|");
  }
  function igKey(kind, d) {
    const author = resolveContactId(d?.authorId || d?.fromId || d?.id || d?.user || d?.authorName || "", d?.authorName || d?.user || "");
    const img = String(d?.image || d?.url || d?.photo || "");
    const id = String(d?.id || d?.onceKey || "");
    return `${kind}|${author}|${id}|${img}`;
  }
  function igNotifyKey(kind, detail) {
    const token = normalizeIgToken(detail);
    if (!token) return "";
    return `${IG_NOTIFY_SEEN_PREFIX}${kind}_${token}`;
  }
  function wasIgNotified(kind, detail) {
    const key = igNotifyKey(kind, detail);
    if (!key) return false;
    return safeGetLS(key) === "1";
  }
  function markIgNotified(kind, detail) {
    const key = igNotifyKey(kind, detail);
    if (!key) return;
    safeSetLS(key, "1");
  }
  function igSeen(kind, detail) {
    const k = igKey(kind, detail);
    const now = Date.now();
    if (wasIgNotified(kind, detail)) return true;
    const last = _recentIg.get(k) || 0;
    if (now - last < IG_TTL) return true;
    _recentIg.set(k, now);
    if (_recentIg.size > 250) {
      for (const [kk, t] of _recentIg) {
        if (now - t > 10_000) _recentIg.delete(kk);
      }
    }
    markIgNotified(kind, detail);
    return false;
  }

  // ✅ SnapGram avatar resolver (special map -> convos -> default)
  function resolveAvatarForSnap(authorId, providedAvatar) {
    const a = String(providedAvatar || "").trim();
    if (a) return resolveVariantAvatar(authorId, a);

    const id = canonicalId(authorId);
    if (id && SPECIAL_AVATAR[id]) return resolveVariantAvatar(id, SPECIAL_AVATAR[id]);

    try {
      const convos = readConversations();
      const c = convos[id] || null;
      const av = String(c?.avatar || "").trim();
      if (av) return resolveVariantAvatar(id, av);
    } catch {}

    return resolveVariantAvatar(id, DEFAULT_AVATAR);
  }

  // -------------------------
  // ✅ SnapGram persistence helpers (CRITICAL FIX)
  // -------------------------
  function readArr(key) {
    const raw = safeGetLS(key);
    const v = raw ? safeParse(raw, []) : [];
    return Array.isArray(v) ? v : [];
  }
  function writeArr(key, arr) {
    const clean = (value) => {
      if (Array.isArray(value)) return value.map(clean);
      if (!value || typeof value !== "object") {
        const text = String(value || "");
        return /^(data:|blob:)/i.test(text) && text.length > 1024 ? "" : value;
      }
      const out = {};
      Object.entries(value).forEach(([k, v]) => {
        if (typeof v === "string" && /^(data:|blob:)/i.test(v) && v.length > 1024) out[k] = "";
        else out[k] = clean(v);
      });
      return out;
    };
    safeSetLS(key, JSON.stringify(Array.isArray(arr) ? clean(arr) : []));
  }

  function upsertIgPost(detail, resolvedName, resolvedAvatar) {
    const onceKey = String(detail?.onceKey || detail?.id || "").trim();
    const authorId = resolveContactId(detail?.authorId || detail?.fromId || detail?.user || detail?.authorName || "snapgram", resolvedName);
    const id = String(detail?.id || onceKey || (authorId + "-" + Date.now()));

    const visible = (value) => {
      const source = String(value == null ? "" : value);
      try { return window.Game?.tpl?.(window.Game?.i18n?.sourceText?.(source) || source) || source; } catch { return source; }
    };
    const post = {
      id,
      onceKey: onceKey || id,
      authorId,
      user: String(resolvedName || "Unknown"),
      avatar: resolveVariantAvatar(authorId, resolvedAvatar || DEFAULT_AVATAR),
      image: resolveVariantImage(detail?.image || detail?.photo || detail?.url || "", authorId) || null,
      video: detail?.video || null,
      caption: visible(detail?.caption || detail?.text || ""),
      likes: (detail?.likes ?? 0),
      time: visible(detail?.time || ""),
      gameTime: window.GameTimeService?.resolveStamp?.(detail, { kind: "snapgram", id, onceKey, storyPath: detail?.storyPath }) || null,
      seen: false
    };

    const arr = readArr(IG_FEED_KEY);

    const i = arr.findIndex(x =>
      (x.onceKey && post.onceKey && x.onceKey === post.onceKey) ||
      (x.id && x.id === post.id) ||
      (x.image && post.image && x.image === post.image && x.user === post.user)
    );

    if (i >= 0) {
      const prevSeen = !!arr[i].seen;
      arr[i] = { ...arr[i], ...post, gameTime: window.GameTimeService?.normalizeStamp?.(arr[i].gameTime) || post.gameTime, seen: prevSeen };
    } else {
      arr.unshift(post);
    }

    writeArr(IG_FEED_KEY, arr);
  }

  function upsertIgStory(detail, resolvedName, resolvedAvatar) {
    const onceKey = String(detail?.onceKey || detail?.id || "").trim();
    const authorId = resolveContactId(detail?.authorId || detail?.fromId || detail?.user || detail?.authorName || "snapgram", resolvedName);
    const id = String(detail?.id || onceKey || (authorId + "-" + Date.now()));

    const story = {
      id,
      onceKey: onceKey || id,
      authorId,
      user: String(resolvedName || "Unknown"),
      avatar: resolveVariantAvatar(authorId, resolvedAvatar || DEFAULT_AVATAR),
      image: resolveVariantImage(detail?.image || detail?.url || "", authorId) || null,
      seen: false,
      triggerStart: detail?.onSeenStartStory || null,
      gameTime: window.GameTimeService?.resolveStamp?.(detail, { kind: "snapgram", id, onceKey, storyPath: detail?.storyPath }) || null
    };

    const arr = readArr(IG_STORY_KEY);

    // one ring per authorId
    const i = arr.findIndex(x => String(x.authorId||"") === String(authorId||""));
    if (i >= 0) {
      const prevSeen = !!arr[i].seen;
      const prevTrig = arr[i].triggerStart || null;
      arr[i] = { ...arr[i], ...story, gameTime: (arr[i].id === story.id && window.GameTimeService?.normalizeStamp?.(arr[i].gameTime)) || story.gameTime, seen: prevSeen, triggerStart: story.triggerStart || prevTrig };
    } else {
      arr.unshift(story);
    }

    writeArr(IG_STORY_KEY, arr);
  }

  // -------------------------
  // Gallery helper (messages photos)
  // -------------------------
  const GALLERY_KEY = "gallery_photos";

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

  function readGalleryList() {
    let arr = [];
    try { arr = safeParse(safeGetLS(GALLERY_KEY), []); } catch { arr = []; }
    return Array.isArray(arr) ? arr : [];
  }

  function galleryHasItem(arr, stableId, url) {
    const sid = String(stableId || "").trim();
    const u = String(url || "").trim();
    return arr.some((p) => {
      const pid = String(p?.id || "").trim();
      const purl = String(p?.url || p?.src || "").trim();
      return (sid && pid === sid) || (u && purl === u);
    });
  }

  function galleryFindIndex(arr, stableId, url) {
    const sid = String(stableId || "").trim();
    const u = String(url || "").trim();
    return (Array.isArray(arr) ? arr : []).findIndex((p) => {
      const pid = String(p?.id || "").trim();
      const purl = String(p?.url || p?.src || "").trim();
      return (sid && pid === sid) || (u && purl === u);
    });
  }

  function mergeGalleryOwnerMeta(existing, incoming) {
    const prev = (existing && typeof existing === "object") ? { ...existing } : {};
    const next = (incoming && typeof incoming === "object") ? incoming : {};
    const incomingOwnerId = canonicalId(next.ownerId || next.owner || "");
    const prevOwnerId = canonicalId(prev.ownerId || prev.owner || "");
    if (!prevOwnerId && incomingOwnerId && incomingOwnerId !== "unknown" && incomingOwnerId !== "snapgram") {
      prev.ownerId = incomingOwnerId;
    }

    const prevOwnerName = String(prev.ownerName || prev.characterName || prev.contactName || "").trim();
    if (!prevOwnerName) {
      const nextOwnerName = String(next.ownerName || next.characterName || next.contactName || "").trim();
      if (nextOwnerName) prev.ownerName = nextOwnerName;
    }

    if (!String(prev.src || "").trim() && String(next.src || "").trim()) {
      prev.src = String(next.src || "").trim();
    }

    return prev;
  }

  function upsertGalleryPhoto(photo, stableId, url) {
    if (window.GalleryStore && typeof window.GalleryStore.upsert === "function") {
      const result = window.GalleryStore.upsert(photo, { emit: false });
      if (result?.changed) emitGalleryAdded(result.photo || photo);
      return;
    }

    const arr = readGalleryList();
    const idx = galleryFindIndex(arr, stableId, url);
    if (idx >= 0) {
      const merged = mergeGalleryOwnerMeta(arr[idx], photo);
      const changed =
        JSON.stringify(arr[idx] || {}) !== JSON.stringify(merged || {});
      if (changed) {
        arr[idx] = merged;
        try { safeSetLS(GALLERY_KEY, JSON.stringify(arr)); } catch {}
        emitGalleryAdded(merged);
      }
      return;
    }

    arr.unshift(photo);
    try { safeSetLS(GALLERY_KEY, JSON.stringify(arr)); } catch {}
    emitGalleryAdded(photo);
  }

  function emitGalleryAdded(photo) {
    try { window.StoryBus?.emit?.("gallery:add", photo); } catch {}
    try { window.StoryBus?.emit?.("photo:new", photo); } catch {}
    try { window.dispatchEvent(new CustomEvent("gallery:add", { detail: photo })); } catch {}
  }

  function addToGalleryIfMissing(url, originId) {
    const u = resolveVariantImage(url, originId);
    if (!u) return;
    if (isGalleryExcludedImagePath(u)) return;
    const origin = canonicalId(originId) || "unknown";
    const ownerId = (origin && origin !== "unknown") ? origin : "";
    const ownerName = ownerId ? chooseBestName(ownerId, "", null) : "";

    const photo = {
      id: (crypto?.randomUUID ? crypto.randomUUID() : (`p_${Date.now()}_${Math.random().toString(16).slice(2)}`)),
      url: u,
      w: 0,
      h: 0,
      at: Date.now(),
      src: `msg:${origin}`,
      ownerId,
      ownerName
    };
    upsertGalleryPhoto(photo, "", u);
  }

  function addSnapgramToGallery(detail, authorId) {
    const image = resolveVariantImage(detail?.image || detail?.url || detail?.photo || "", authorId);
    if (!image) return;
    if (isGalleryExcludedImagePath(image)) return;

    const rawStable = String(detail?.id || detail?.onceKey || "").trim();
    const stableId = rawStable ? ("ig_" + rawStable) : "";
    const origin = canonicalId(authorId) || "snapgram";
    const ownerId = (origin && origin !== "snapgram" && origin !== "unknown") ? origin : "";
    const ownerName = ownerId
      ? chooseBestName(ownerId, detail?.authorName || detail?.user || "", null)
      : "";

    const photo = {
      id: stableId || (crypto?.randomUUID ? crypto.randomUUID() : (`p_${Date.now()}_${Math.random().toString(16).slice(2)}`)),
      url: image,
      w: 0,
      h: 0,
      at: Date.now(),
      src: ownerId ? ("snapgram:" + ownerId) : ("snapgram:" + origin),
      ownerId,
      ownerName
    };

    if (window.Gallery && typeof window.Gallery.addPhoto === "function") {
      try { window.Gallery.addPhoto(photo); } catch {}
    }
    upsertGalleryPhoto(photo, stableId, image);
  }

  function backfillAvatarGalleryFromConversations() {
    const convos = readConversations();
    const rows = (convos && typeof convos === "object") ? Object.entries(convos) : [];
    for (const [threadIdRaw, convoRaw] of rows) {
      const threadId = canonicalId(threadIdRaw);
      if (!threadId || shouldHideCharacterFromUI(threadId)) continue;
      const convo = (convoRaw && typeof convoRaw === "object") ? convoRaw : {};
      const avatar = resolveVariantAvatar(threadId, convo.avatar || "");
      if (avatar && isContactAvatarPath(avatar) && !isGalleryExcludedImagePath(avatar)) {
        addToGalleryIfMissing(avatar, threadId);
      }

      const messages = Array.isArray(convo.messages) ? convo.messages : [];
      for (const msg of messages) {
        if (!msg || typeof msg !== "object") continue;
        const msgImage = resolveVariantImage(msg.image || msg.src || msg.url || msg.photo || "", threadId);
        if (!msgImage) continue;
        if (!isContactAvatarPath(msgImage)) continue;
        if (isGalleryExcludedImagePath(msgImage)) continue;
        addToGalleryIfMissing(msgImage, threadId);
      }
    }
  }

  // -------------------------
  // Game.Inbox API (used by runtime)
  // -------------------------
  Game.Inbox = Game.Inbox || {};

  Game.Inbox.pushMessage = function pushMessage({
    contactId,
    contactName,
    avatar,
    from,
    kind,
    text,
    link,
    imageSrc,
    eventId,
    episodeId,
    storyPath,
    sourceStepIndex,
    transcript = false,
    ts,
    popup = true,
    bumpUnread = true
  }) {
    const id = resolveContactId(contactId, contactName);
    if (!id) return;
    if (shouldHideCharacterFromUI(id)) return;

    const isPlayer = (String(from || "").toLowerCase() === "player");
    const now = Number(ts || Date.now());

    const notifyPayload = {
      app: "messages",
      fromId: id,
      fromName: chooseBestName(id, contactName, null),
      avatar: avatar || "",
      text: kind === "image" ? "[photo]" : String(text || ""),
      link: kind === "image" ? null : normalizeMessageLink(link),
      target: "conversation",
      open: { id },

      __isPlayer: isPlayer,
      __isPhoto: (kind === "image"),
      src: imageSrc || "",
      url: imageSrc || "",
      image: imageSrc || "",
      __forceTimestamp: now,
      __eventId: String(eventId || "").trim() || undefined,
      episodeId: String(episodeId || "").trim() || undefined,
      // Forwarded so Game.notify can tag the stored row with the SAME
      // storyPath+sourceStepIndex identity conversation.html's live render
      // path (makeConversationStepEventId) uses -- see the caller in
      // installCanonicalMessageBridge for why this must not be dropped.
      storyPath: String(storyPath || "").trim() || undefined,
      sourceStepIndex: Number.isFinite(Number(sourceStepIndex)) ? Number(sourceStepIndex) : undefined,
      __isHakTranscript: transcript === true || kind === "hak_transcript",
      __speakerId: (transcript === true || kind === "hak_transcript")
        ? (canonicalId(from || "") || id)
        : undefined,

      __wantPopup: !!popup,
      __wantUnread: !!bumpUnread
    };

    if (!isPlayer && isCinematicLockActive()) {
      queueCinematicPayload(notifyPayload, {
        app: "messages",
        threadId: id,
        text: kind === "image" ? "[photo]" : String(text || ""),
        isPlayer: false
      });
      return;
    }

    Game.notify(notifyPayload);
  };

  Game.Inbox.markRead = function markRead(contactId) {
    const id = resolveContactId(contactId, "");
    if (!id) return;
    if (shouldHideCharacterFromUI(id)) return;
    retireStaleConversationCacheProjection(window.GameStateEngine?.getConversationCacheFlushIdentity?.());
    const cached = pendingListenerConversationsCache?.[id];
    if (cached && repairedConversationContacts.has(cached)) {
      const contact = readConversationContactNarrow(id);
      if (contact) {
        const repaired = repairedConversationContacts.get(contact);
        // markRead's ordinary full projection discards legacy row extras.
        // Do that once for a repaired cache, rather than cloning the journal
        // at every subsequent bubble. New delta rows already have this shape.
        if (repaired && !repaired.canonicalOnly) {
          contact.messages = contact.messages.map(row=>({id:row.eventId,eventId:row.eventId,from:row.from,kind:row.kind,...(row.presentation==='player_thought'?{presentation:'player_thought',speaker:'player'}:{}),text:row.text||'',image:row.image||undefined,link:normalizeMessageLink(row.link)||undefined,storyPath:row.storyPath||undefined,sourceStepIndex:Number.isFinite(Number(row.sourceStepIndex))?Number(row.sourceStepIndex):undefined,at:Number(row.at||0),committed:true}));
          repairedConversationContacts.set(contact,{identity:repaired.identity,messages:contact.messages,canonicalOnly:true});
        }
        contact.unread = 0;
        const convos = {...pendingListenerConversationsCache,[id]:contact};
        writeConversations(convos);
        recomputeMessagesBadge(convos);
        return;
      }
    }
    const convos = readConversations({ skipSelfHealPersist: true, contactId: id });
    if (!convos[id]) return;
    convos[id].unread = 0;
    writeConversations(convos);
    recomputeMessagesBadge(convos);
  };

  Game.Inbox.notifyContinuation = function notifyContinuation({
    contactId,
    contactName,
    avatar,
    text,
    open,
    eventId,
    ts,
    popup = true,
    bumpUnread = true,
    persistent = false
  } = {}) {
    const id = resolveContactId(contactId, contactName);
    if (!id) return false;
    if (shouldHideCharacterFromUI(id)) return false;
    if (continuationIsAlreadyCompleted(open)) return true;

    const now = Number(ts || Date.now());
    const convos = readConversations({ skipSelfHealPersist: true, contactId: id });
    const displayName = chooseBestName(id, contactName, convos[id]?.name);
    const avatarFinal = resolveVariantAvatar(id, avatar || convos[id]?.avatar || DEFAULT_AVATAR);
    const c = ensureConversation(convos, id, displayName, avatarFinal);
    const preview = String(text || "New message").trim() || "New message";
    const canonicalEventId = String(eventId || "").trim() || `continuation_${id}_${now}`;
    const committed = canonicalCommittedMessage(c);
    if (committed && committed.eventId && committed.eventId === canonicalEventId) return true;

    reconcileCanonicalLast(c, { text: preview, at: now, eventId: canonicalEventId });
    c.name = displayName;
    if (avatarFinal) c.avatar = avatarFinal;
    if (bumpUnread) c.unread = Number(c.unread || 0) + 1;
    else c.unread = Number(c.unread || 0) || 0;

    convos[id] = c;
    writeConversations(convos);
    recomputeMessagesBadge(convos);

    if (popup) {
      const detail = {
        app: "messages",
        id,
        name: displayName,
        text: preview,
        avatar: avatarFinal,
        target: "conversation",
        open: (open && typeof open === "object") ? open : { id },
        eventId: canonicalEventId,
        allowCurrentConversationPopup: true,
        persistent: persistent === true
      };
      if (!isCinematicLockActive()) {
        try { window.dispatchEvent(new CustomEvent("inbox:new", { detail })); } catch {}
      }
    }

    return true;
  };

  // -------------------------
  // Game.notify (single writer)
  // -------------------------
  Game.notify = function notify(payload) {
    if (!payload || typeof payload !== "object") payload = {};

    const app = payload.app || "messages";

    const providedNameRaw = String(payload.fromName || payload.name || payload.displayName || payload.senderName || "").trim();

    const rawId =
      payload.id ||
      payload.contactId ||
      payload.senderId ||
      payload.fromId ||
      payload.name ||
      "unknown";

    const cid = resolveContactId(rawId, providedNameRaw);
    if (!cid) return;

    const isPlayer = (cid === "player" || payload.__isPlayer === true);
    const now = Number(payload.__forceTimestamp || Date.now());

    const rawThread =
      payload.open?.id || payload.open?.contactId || (isPlayer ? "" : cid) || cid;

    const threadId = resolveContactId(rawThread, providedNameRaw) || cid;
    if (app === "messages") {
      if (shouldHideCharacterFromUI(threadId) || shouldHideCharacterFromUI(cid)) return;
    } else if (shouldFilterNotificationSender(app, cid)) {
      return;
    }

    // Non-message notifications must not project the conversation store.
    // That projection parses and rebuilds every retained thread (up to 5,000
    // events per contact), which made an authored SnapGram popup visibly
    // freeze an active conversation on larger playthroughs. SnapGram,
    // OnlyFun, HAK and MeetAndGreet only need their own badge and banner.
    if (app !== "messages") {
      const displayName = chooseBestName(threadId, providedNameRaw, "");
      learnAlias(threadId, displayName);

      const text = String(payload.text || payload.preview || payload.lastText || "").trim();
      const eventId = String(payload.__eventId || payload.eventId || payload.messageId || payload.notifId || payload.notificationId || "").trim();
      const silentPopup = payload.silentPopup === true;
      const shouldQueueForCinematic =
        !payload.__fromCinematicQueue &&
        payload.__allowDuringCinematic !== true &&
        isCinematicLockActive();

      if (shouldQueueForCinematic) {
        queueCinematicPayload(payload, { app, threadId, text, isPlayer });
        return;
      }

      const badges = readBadges();
      badges[app] = Math.max(0, Number(badges[app] || 0) + 1);
      writeBadges(badges);
      emitBadgeChanged(app, badges[app]);

      if (!silentPopup && payload.__wantPopup !== false) {
        const detail = {
          app,
          id: payload.id || cid,
          name: displayName || prettyNameFromId(cid),
          text,
          avatar: resolveVariantAvatar(cid, payload.avatar || DEFAULT_AVATAR),
          target: payload.target || (app === "snapgram" ? "snapgram" : "home"),
          open: payload.open,
          profileId: payload.profileId,
          evidenceId: payload.evidenceId,
          evidenceIds: Array.isArray(payload.evidenceIds) ? payload.evidenceIds.slice() : undefined,
          eventId: eventId || undefined,
          notifId: String(payload.notifId || payload.notificationId || eventId || "").trim() || undefined,
          notificationId: String(payload.notificationId || payload.notifId || eventId || "").trim() || undefined
        };
        try { window.dispatchEvent(new CustomEvent("inbox:new", { detail })); } catch {}
      }
      return;
    }

    // skipSelfHealPersist: this function always mutates convos[threadId]
    // and calls writeConversations() unconditionally below regardless of
    // what readConversations()'s own internal self-heal check would have
    // decided -- see that flag's own comment in readConversations() for why
    // computing it here is pure waste.
    // Ordinary delivery only mutates one thread. Building/cloning the whole
    // compatibility cache here made every new message scale with the entire
    // campaign history even though canonical events already own every other
    // contact. Keep this projection command-scoped; full-list readers rebuild
    // the other contacts from canonical events when they actually need them.
    const existing = readConversationContactNarrow(threadId);
    const convos = existing ? { [threadId]: existing } : {};

    const displayName = chooseBestName(threadId, providedNameRaw, existing?.name);

    // ✅ learn universal alias early
    learnAlias(threadId, displayName);

    const providedAvatarRaw = resolveVariantAvatar(threadId, payload.avatar || payload.fromAvatar || payload.photo || payload.avatarUrl || "");
    let text = String(payload.text || payload.preview || payload.lastText || "").trim();
    const eventId = String(payload.__eventId || payload.eventId || payload.messageId || payload.notifId || payload.notificationId || "").trim();

    const silentPopup = payload.silentPopup === true;

    const suppressPopup = (app === "messages")
      ? shouldSuppressPopupForMessages(threadId)
      : false;

    const suppressUnread = (app === "messages")
      ? shouldSuppressUnreadForMessages(threadId, isPlayer)
      : false;

    // =========================================================
    // ✅ ACTION REQUIRED / TODO HOOK
    // If runtime emits a "todo" step (or equivalent), we persist it,
    // without creating unread red badges.
    // =========================================================
    const isTodo =
      payload.__todo === true ||
      payload.actionRequired === true ||
      String(payload.type || "").toLowerCase() === "todo";

    if (app === "messages" && isTodo) {
      // persist todo hint for this thread
      const todoText = text || "Open Messages to continue";
      setTodo(threadId, todoText);

      // no popup unless explicitly wanted
      // no unread red dot
      payload.__wantUnread = false;
      if (payload.__wantPopup == null) payload.__wantPopup = false;
    }

    const shouldQueueForCinematic =
      !payload.__fromCinematicQueue &&
      payload.__allowDuringCinematic !== true &&
      isCinematicLockActive() &&
      !(app === "messages" && isPlayer);

    if (shouldQueueForCinematic) {
      queueCinematicPayload(payload, { app, threadId, text, isPlayer });
      return;
    }

    // -------------------------
    // 0) Store write (messages)
    // -------------------------
    if (app === "messages") {
      const isPhoto = payload.__isPhoto === true || !!(payload.src || payload.url || payload.image);
      const src = resolveVariantImage(payload.src || payload.url || payload.image || "", threadId);
      const messageText = isPhoto ? "[photo]" : text;
      const messageLink = isPhoto ? null : normalizeMessageLink(payload.link);
      const episodeId = String(payload.episodeId || payload.episode || "").trim();
      const activeConversationId = canonicalId(safeGetLS("openConversationId") || safeGetLS("activeConversationId") || "");
      const activeConversationOwnsWrite = activeConversationId === canonicalId(threadId);
      let conversationDebug = null;
      if (activeConversationOwnsWrite) {
        try { conversationDebug = typeof window.__conversationDebugState === "function" ? window.__conversationDebugState() : null; } catch {}
      }
      const fallbackStoryPath = activeConversationOwnsWrite
        ? String(safeGetLS(`conv_story_${threadId}`) || window.__CURRENT_STORY_PATH__ || "")
        : "";
      const fallbackOnceKey = activeConversationOwnsWrite ? String(window.__CURRENT_STORY_ONCE_KEY__ || "") : "";
      const fallbackStepIndex = activeConversationOwnsWrite && Number.isFinite(Number(conversationDebug?.index))
        ? Number(conversationDebug.index)
        : undefined;
      const storyPath = normalizeStoryPath(String(payload.storyPath || payload.story || fallbackStoryPath || "").trim());
      const storyOnceKey = canonicalId(payload.storyOnceKey || payload.onceKey || fallbackOnceKey || "");
      const sourceStepIndexRaw = Number(payload.sourceStepIndex ?? payload.stepIndex ?? fallbackStepIndex);
      const sourceStepIndex = Number.isFinite(sourceStepIndexRaw) && sourceStepIndexRaw >= 0
        ? Math.floor(sourceStepIndexRaw)
        : null;

      const writeKey = makeWriteKey(
        "messages",
        threadId,
        now,
        isPhoto ? "image" : "text",
        messageText,
        src,
        isPlayer,
        eventId
      );
      if (isDuplicateWrite(writeKey)) return;

      const unlockedBefore = isAvatarUnlocked(threadId);

      const avatarFinal = unlockedBefore
        ? (providedAvatarRaw || existing?.avatar || DEFAULT_AVATAR)
        : DEFAULT_AVATAR;

      const c = ensureConversation(convos, threadId, displayName, avatarFinal);
      const prevAvatar = String(c.avatar || "").trim();

      // Two independent code paths can each commit the same logical step
      // (a canonical StoryInterpreter commit during background delivery,
      // and the interactive conversation.html legacy player-message path
      // on a later remount/replay) using DIFFERENT eventId generation
      // schemes -- so an eventId string-equality check alone can miss a
      // real duplicate of the exact same step. storyPath+sourceStepIndex
      // (already recorded on every row below) identify a step stably
      // regardless of which mechanism committed it or what eventId string
      // that mechanism happened to generate; treat a match on either
      // identity as the same message.
      const alreadyStored = c.messages.some((row) => {
        const sameSpeaker = (canonicalId(row?.from || row?.fromId || "") === "player") === isPlayer;
        if (!sameSpeaker) return false;
        if (eventId && String(row?.eventId || row?.__eventId || "").trim() === eventId) return true;
        if (
          storyPath &&
          sourceStepIndex != null &&
          String(row?.storyPath || "").trim() === storyPath &&
          Number.isFinite(Number(row?.sourceStepIndex)) &&
          Number(row.sourceStepIndex) === sourceStepIndex
        ) return true;
        return false;
      });
      // readConversations() rebuilds a missing/trimmed compatibility cache
      // from the canonical event store.  The canonical message bridge runs
      // after COMMIT_MESSAGE_EVENT, so the brand-new event can therefore be
      // present here already even though this is the first (and only)
      // presentation pass.  Treating that projection as a producer replay
      // returned before inbox:new, producing the exact bad state
      // "canonical unread + Home badge, but no first popup".  A projected
      // canonical row has already supplied persistence and unread; it still
      // needs the one transient presentation below.  A non-projected match
      // remains a genuine legacy/direct-writer duplicate and stays blocked.
      const canonicallyProjected = alreadyStored && !!c.messages.find((row) =>
        row?.committed === true && eventId && String(row?.eventId || row?.__eventId || "").trim() === eventId
      );
      if (alreadyStored && !canonicallyProjected) return;

      if (!canonicallyProjected) c.messages.push({
        id: `${now}_${Math.random().toString(16).slice(2)}`,
        at: now,
        from: payload.__isHakTranscript === true
          ? (canonicalId(payload.__speakerId || "") || (isPlayer ? "player" : threadId))
          : (isPlayer ? "player" : threadId),
        kind: isPhoto ? "image" : (payload.__isHakTranscript === true ? "hak_transcript" : "text"),
        type: payload.__isHakTranscript === true ? "hak_transcript" : undefined,
        text: isPhoto ? "[photo]" : String(messageText || ""),
        image: isPhoto ? src : "",
        link: messageLink || undefined,
        episodeId: episodeId || undefined,
        episode: episodeId || undefined,
        eventId: eventId || undefined,
        storyPath: storyPath || undefined,
        storyOnceKey: storyOnceKey || undefined,
        sourceStepIndex: sourceStepIndex == null ? undefined : sourceStepIndex
      });

      c.messages = trimConversationMessages(c.messages, MAX_CONVERSATION_MESSAGES);
      if (canonicallyProjected && repairedConversationContacts.get(c)?.messages.length === c.messages.length && window.GameStateEngine?.getConversationJournalIdentity) {
        const repaired = repairedConversationContacts.get(c);
        repairedConversationContacts.set(c,{identity:window.GameStateEngine.getConversationJournalIdentity(threadId),messages:c.messages,canonicalOnly:repaired.canonicalOnly===true});
      } else repairedConversationContacts.delete(c);

      reconcileCanonicalLast(c);
      c.name = chooseBestName(threadId, providedNameRaw, c.name);

      // learn alias from updated name too
      learnAlias(threadId, c.name);

      let didReveal = false;
      const revealAvatarCandidate = isContactAvatarPath(src);
      if (!isPlayer && isPhoto && src && !unlockedBefore && revealAvatarCandidate) {
        safeSetLS(REVEAL_PREFIX + canonicalId(threadId), "1");
        c.avatar = src;
        didReveal = true;
      } else {
        if (unlockedBefore) {
          if (providedAvatarRaw) c.avatar = resolveVariantAvatar(threadId, avatarFinal);
          if (!c.avatar) c.avatar = resolveVariantAvatar(threadId, DEFAULT_AVATAR);
        } else {
          c.avatar = resolveVariantAvatar(threadId, DEFAULT_AVATAR);
        }
      }

      // Canonical media has its own authored, per-step Gallery receipt.
      if (isPhoto && src && !isPlayer && !canonicallyProjected) {
        addToGalleryIfMissing(src, threadId);
      }

      const wantUnread = payload.__wantUnread !== false;
      if (!canonicallyProjected && wantUnread && !suppressUnread) {
        c.unread = Number(c.unread || 0) + 1;
      } else {
        c.unread = Number(c.unread || 0) || 0;
      }

      convos[threadId] = c;
      writeConversations(convos);
      recomputeMessagesBadge(convos);

      const newAvatar = String(c.avatar || "").trim();
      if (newAvatar && newAvatar !== prevAvatar) {
        emitAvatarUpdated(threadId, newAvatar);
      } else if (didReveal && newAvatar) {
        emitAvatarUpdated(threadId, newAvatar);
      }

      const popupAvatar = resolveVariantAvatar(threadId, c.avatar || DEFAULT_AVATAR);

      const wantPopup = payload.__wantPopup !== false;

      if (!silentPopup && wantPopup && !suppressPopup) {
        const detail = {
          app,
          id: threadId,
          name: displayName,
          text,
          avatar: popupAvatar,
          target: payload.target || "conversation",
          open: payload.open || { id: threadId },
          eventId: eventId || undefined
        };
        try { window.dispatchEvent(new CustomEvent("inbox:new", { detail })); } catch {}
      }

      return;
    }

  };

  Game.flushCinematicQueue = function flushCinematicQueuePublic() {
    return flushCinematicQueue();
  };

  window.addEventListener("cinematic:lock-changed", (ev) => {
    const locked = !!(ev?.detail?.locked);
    if (locked) return;
    setTimeout(() => { try { flushCinematicQueue(); } catch {} }, 20);
  });
  window.addEventListener("hak:overlay-closed", () => {
    setTimeout(() => { try { flushCinematicQueue(); } catch {} }, 24);
  });
  window.addEventListener("scene:mounted", () => {
    if (isCinematicLockActive()) return;
    setTimeout(() => { try { flushCinematicQueue(); } catch {} }, 30);
  });
  window.addEventListener("hak:watchlistChanged", () => {
    try { purgeHiddenConversationPresence(); } catch {}
  });
  try {
    window.StoryBus?.on?.("hak:watchlistChanged", () => {
      try { purgeHiddenConversationPresence(); } catch {}
    });
  } catch {}

  Game.updateConversationLast = function updateConversationLast(id, text) {
    const cid = resolveContactId(id, "");
    if (!cid) return;
    if (shouldHideCharacterFromUI(cid)) return;
    const convos = { [cid]: readConversationContactNarrow(cid) };
    const c = ensureConversation(convos, cid, prettyNameFromId(cid), DEFAULT_AVATAR);
    c.last = { text: String(text || ""), at: Date.now() };
    // c is a fresh detached value, retained only by this private call. The
    // public raw writer still copies external caller-owned values.
    writeConversationContactValue(cid, c, true);
    emitConversationsUpdated();
  };

  // contact reveal event
  function onContactReveal(ev) {
    const d = ev?.detail || ev || {};
    const stableId = resolveContactId(d.id, d.name || d.displayName || d.fromName || "");
    const avatar = resolveVariantAvatar(stableId, d.avatar || "");
    const name = String(d.name || d.displayName || d.fromName || "").trim();

    if (!stableId) return;
    if (shouldHideCharacterFromUI(stableId)) return;

    if (name && !isBadDisplayName(name, stableId)) {
      // learn alias on reveal
      learnAlias(stableId, name);

      const convos = readConversations({ skipSelfHealPersist: true });
      const c = ensureConversation(convos, stableId, name, convos[stableId]?.avatar || DEFAULT_AVATAR);
      c.name = chooseBestName(stableId, name, c.name);
      convos[stableId] = c;
      writeConversations(convos);
      safeSetLS(NAME_REVEAL_PREFIX + canonicalId(stableId), "1");
    }

    if (avatar) unlockAvatar(stableId, avatar);
  }
  window.addEventListener("contact:reveal", onContactReveal);
  window.StoryBus?.on?.("contact:reveal", onContactReveal);

  // =========================================================
  // SnapGram bridge: ig:post / ig:story
  // ✅ NOW also persists to localStorage so SnapGram shows after LOAD
  // =========================================================
  function onIgPost(detail) {
    if (!detail || typeof detail !== "object") detail = {};
    if (igSeen("post", detail)) return;

    const authorName =
      String(detail.authorName || detail.user || "").trim() ||
      prettyNameFromId(resolveContactId(detail.authorId || detail.fromId || "snapgram", ""));

    const authorId = resolveContactId(detail.authorId || detail.fromId || detail.id || detail.user || detail.authorName || "snapgram", authorName);
    const avatar = resolveAvatarForSnap(authorId, detail.avatar);

    // learn alias from author name
    learnAlias(authorId, authorName);

    // store post now
    upsertIgPost(detail, authorName, avatar);
    addSnapgramToGallery(detail, authorId);
    emitSnapgramUpdated();

    Game.notify({
      app: "snapgram",
      fromId: authorId,
      fromName: authorName,
      avatar,
      text: "New SnapGram post",
      target: "snapgram",
      __wantPopup: true,
      __wantUnread: true
    });
  }

  function onIgStory(detail) {
    if (!detail || typeof detail !== "object") detail = {};
    if (igSeen("story", detail)) return;

    const authorName =
      String(detail.authorName || detail.user || "").trim() ||
      prettyNameFromId(resolveContactId(detail.authorId || detail.fromId || "snapgram", ""));

    const authorId = resolveContactId(detail.authorId || detail.fromId || detail.id || detail.user || detail.authorName || "snapgram", authorName);
    const avatar = resolveAvatarForSnap(authorId, detail.avatar);

    learnAlias(authorId, authorName);

    upsertIgStory(detail, authorName, avatar);
    addSnapgramToGallery(detail, authorId);
    emitSnapgramUpdated();

    Game.notify({
      app: "snapgram",
      fromId: authorId,
      fromName: authorName,
      avatar,
      text: "New SnapGram story",
      target: "snapgram",
      __wantPopup: true,
      __wantUnread: true
    });
  }

  if (window.StoryBus?.on) {
    const sbPost = (e) => onIgPost(e?.detail || {});
    const sbStory = (e) => onIgStory(e?.detail || {});
    window.StoryBus.on("ig:post", sbPost);
    window.StoryBus.on("ig:story", sbStory);
  } else {
    window.addEventListener("ig:post", (e) => onIgPost(e?.detail || {}));
    window.addEventListener("ig:story", (e) => onIgStory(e?.detail || {}));
  }

  try { backfillAvatarGalleryFromConversations(); } catch {}
  try { purgeHiddenConversationPresence(); } catch {}
  console.log("[notify-adapter] v4.9 ready (hidden-character hard filter + TODO action hint + universal alias + SnapGram persistence)");
})();
