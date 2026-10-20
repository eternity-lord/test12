(function initNewUpdateEntry() {
  "use strict";

  const ROUTES = Object.freeze(["love", "nts", "ntr"]);
  // A fresh update can buy one complete branch, including Live Transcription.
  const UPDATE_STARTING_POINTS = Math.max(...ROUTES.map(branch =>
    (window.HakSkillDefinitions?.byBranch?.[branch] || []).reduce((total, skill) => total + Math.max(0, Number(skill.cost) || 0), 0)
  )) || 12;
  const MASON_VARIANT_KEY = "character_variant_mason";

  const CHARACTER_CATALOG = Object.freeze({
    lena: { id: "lena", label: "{{name:lena}}", avatar: "assets/avatars/lena.jpg" },
    hailey: { id: "hailey", label: "{{name:hailey}}", avatar: "assets/avatars/hailey.jpg" },
    evelyn: { id: "evelyn", label: "{{name:evelyn}}", avatar: "assets/avatars/evelyn.jpg" },
    mason: { id: "mason", label: "{{name:mason}}", avatar: "assets/avatars/male_mason.jpg" },
    aiden: { id: "aiden", label: "{{name:aiden}}", avatar: "assets/avatars/aiden.jpg" }
  });

  const NEW_UPDATE_CONFIG = Object.freeze({
    id: "lena_day16_20_update",
    releaseId: "chapter1_v4",
    releaseVersion: "2.1.0",
    publicVersion: "2.1.0",
    chapterLabel: "Chapter 2 V2",
    label: "Lena LOVE / NTS / NTR Update",
    day: 16,
    targetDay: 16,
    requiredPremium: true,
    startStory: "story/DAY16/nts/DAY16_00_LENA_MORNING_NTS.json",
    startStoryByRoute: Object.freeze({
      love: "story/DAY16/love/DAY16_00_LENA_MORNING_LOVE.json",
      nts: "story/DAY16/nts/DAY16_00_LENA_MORNING_NTS.json",
      ntr: "story/DAY16/ntr/DAY16_00_LENA_MORNING_NTR.json"
    }),
    contactId: "lena",
    timeCardText: "DAY 16",
    characters: Object.freeze(["lena"]),
    routeCharacters: Object.freeze(["lena"]),
    routeSyncCharacters: Object.freeze(["lena"]),
    allCharacters: Object.freeze(["evelyn", "mason", "lena", "hailey", "aiden"]),
    startingPoints: UPDATE_STARTING_POINTS,
    defaultRoute: "nts",
    routeOptionsByCharacter: Object.freeze({ lena: Object.freeze(["love", "nts", "ntr"]) }),
    characterLocks: Object.freeze({ lena: "premium" }),
    activationOnceKeys: Object.freeze({ evelyn: "d8_00_evelyn_morning_route_lock_v1" }),
    routeAliases: Object.freeze({
      mason: Object.freeze({ nts: "nts_coach" }),
      hailey: Object.freeze({ nts: "nts1" })
    }),
    routeLockOnceKeys: Object.freeze({
      evelyn: Object.freeze({
        love: "d8_route_day9_love_locked_v1",
        nts: "d8_route_day9_nts_locked_v1",
        ntr: "d8_route_day9_ntr_locked_v1"
      }),
      mason: Object.freeze({
        love: "d8_route_day9_mason_love_locked_v1",
        nts: "d8_route_day9_mason_nts_coach_locked_v1",
        ntr: "d8_route_day9_mason_ntr_locked_v1"
      }),
      hailey: Object.freeze({
        love: "d8_route_day9_hailey_love_locked_v1",
        nts: "d8_route_day9_hailey_nts1_locked_v1",
        ntr: "d8_route_day9_hailey_ntr_locked_v1"
      })
    }),
    setupFlags: Object.freeze({
      "feature_hak_unlocked": "1",
      "feature_hak_unlocked_anim": "1",
      "feature_hak_visible": "1",
      "feature_hak_openable": "1",
      "hak_app_tutorial_done": "1",
      "conv_boot_done": "1",
      "story_prologue_done": "1"
    })
  });

  window.NEW_UPDATE_CONFIG = NEW_UPDATE_CONFIG;
  window.NEW_UPDATE_ENTRY_CONFIG = NEW_UPDATE_CONFIG;

  const EXACT_RESET_KEYS = new Set([
    "pending_story_v1",
    "pending_chain_story_v1",
    "pending_story_lock_v1",
    "pending_outbound_v1",
    "story_runtime_v1",
    "hak_tutorial_resume_target_v1",
    "premium_blocked_story_v1",
    "premium_pending_story_v1",
    "premium_gate_end_routed_v1",
    "__boot_from_save",
    "__boot_intent_v1",
    "__boot_dayload_v1",
    "__chapter_load_mode",
    "__cinematic_lock_v1",
    "conv_boot_done",
    "story_prologue_done",
    "story_play_history_v1",
    "achievement_run_v1",
    "route_points_v1",
    "route_point_awards_v1",
    "hak_skills_v1",
    "skills_unlocked_v1",
    "hak_ai_queue_v1",
    "hak_watchlist_v1",
    "hak_watchlist_v1_selected",
    "hak_targets_v1",
    "hak_characters_chosen_v1",
    "hak_character_selection_done_v1",
    "hak_photos_v1",
    "hak_evidence_v1",
    "hak_evidence_seen_v1",
    "hak_evidence_notified_v1",
    "hak_tree_booted_v1",
    "hak_last_unlock_v1",
    "guided_cues_v1",
    "app_badges_v1",
    "home_pop_app_v1",
    "feature_meetandgreet_unlocked",
    "meetandgreet_seen_v1",
    "openConversationId",
    "activeConversationId",
    "conversations",
    "new_update_setup_v1",
    MASON_VARIANT_KEY
  ]);

  const RESET_PREFIXES = [
    "conv_progress_",
    "conv_done_",
    "conv_episode_done_",
    "conv_episode_",
    "conv_episode_start_",
    "conv_story_",
    "conv_oncomplete_fired_",
    "conv_chain_fired_",
    "conv_lastEpisode_",
    "conv_if_decisions_v1_",
    "hint_player_starts_",
    "pending_player_first_done_v1::",
    "once_",
    "__once:",
    "active_character:"
  ];

  const STABLE_EXACT_KEYS = new Set([
    "saves_v2",
    "gallery_photos",
    "savedPhotos",
    "patreon_release_unlock_v1",
    "patreon_master_unlock_v1",
    "patreon_mason_day9_15_unlock_v1",
    "patreon_evelyn_day9_15_unlock_v1",
    "patreon_hailey_day16_20_unlock_v1",
    "patreon_lena_day16_20_unlock_v1",
    "patreon_no_code_evelyn_day9_15_v1",
    "gallery_full_unlock_v1",
    "dev_timeline_unlock_v1",
    "settings_language",
    "settings_v1",
    "audio_settings_v1",
    "choice_rewinds_v1",
    "story_replays_v1",
    "achievements_v1",
    "achievement_meta_v1",
    "card_vault_state_v1"
  ]);

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, String(value)); return true; } catch { return false; }
  }

  function safeRemove(key) {
    try { localStorage.removeItem(key); return true; } catch { return false; }
  }

  function safeJsonParse(raw, fallback) {
    try { return JSON.parse(raw); } catch { return fallback; }
  }

  let storyGraphManifestPromise = null;
  // Matches scripts/start-from-entry.js's identical fix: CheckpointStateBuilder
  // derives progression.onceKeys/completedStoryIds entirely from the `nodes`
  // list passed to its constructor, so a New Update landing on a day whose
  // entry story requires an earlier onceKey (e.g. a Day-9 route finale) needs
  // the real story manifest here, not an empty node list.
  async function loadStoryGraphManifest() {
    if (!storyGraphManifestPromise) {
      storyGraphManifestPromise = fetch("scripts/generated/story-graph.manifest.json", { cache: "no-store" })
        .then((res) => (res && res.ok) ? res.json() : null)
        .then((data) => (data && Array.isArray(data.stories)) ? data.stories : [])
        .catch(() => []);
    }
    return storyGraphManifestPromise;
  }

  function canonicalToken(raw) {
    return String(raw || "").trim().toLowerCase().replace(/\s+/g, "_");
  }

  function contactFromStoryPath(storyPath) {
    const match = String(storyPath || "").match(/_(aiden|evelyn|hailey|mason|lena|tutor)(?:_|\.)/i);
    return match ? canonicalToken(match[1]) : "";
  }

  function normalizeRoute(raw) {
    const route = canonicalToken(raw);
    return ROUTES.includes(route) ? route : "";
  }

  function uniqueTokens(list) {
    const out = [];
    const seen = new Set();
    (Array.isArray(list) ? list : []).forEach((raw) => {
      const token = canonicalToken(raw);
      if (!token || seen.has(token)) return;
      seen.add(token);
      out.push(token);
    });
    return out;
  }

  function configList(config, key, fallback) {
    const list = Array.isArray(config?.[key]) ? config[key] : fallback;
    return uniqueTokens(list);
  }

  function resolveCharacterAvatar(id, avatar) {
    const cid = canonicalToken(id);
    const raw = String(avatar || "").trim();
    try {
      if (window.Game && typeof window.Game.resolveCharacterVariantAvatar === "function") {
        const resolved = String(window.Game.resolveCharacterVariantAvatar(cid, raw) || "").trim();
        if (resolved) return resolved;
      }
    } catch {}
    if (cid === "mason" || /(?:^|\/)assets\/avatars\/mason(?:_female)?\.jpg(?:[?#].*)?$/i.test(raw)) {
      try {
        return localStorage.getItem("character_variant_mason") === "female"
          ? "assets/avatars/female_mason.jpg"
          : "assets/avatars/male_mason.jpg";
      } catch {}
    }
    return raw;
  }

  function characterRows(config) {
    return configList(config, "characters", []).map((id) => {
      const row = CHARACTER_CATALOG[id] || { id, label: id, avatar: "" };
      return { id, label: row.label || id, avatar: resolveCharacterAvatar(id, row.avatar || "") };
    });
  }

  function displayNameFor(id) {
    const row = CHARACTER_CATALOG[canonicalToken(id)] || { label: id };
    const label = String(row.label || id || "").trim();
    try {
      if (window.Game && typeof window.Game.tpl === "function") {
        return window.Game.tpl(label).replace(/\{\{[^}]+\}\}/g, "").trim() || String(id || "").trim();
      }
    } catch {}
    return label.replace(/\{\{[^}]+\}\}/g, "").trim() || String(id || "").trim();
  }

  function localizedSource(source) {
    try { return window.Game?.i18n?.sourceText?.(source) || source; } catch { return source; }
  }

  function isCharacterUnlockedForUpdate(config, characterId) {
    const locks = config?.characterLocks && typeof config.characterLocks === "object" ? config.characterLocks : {};
    const id = canonicalToken(characterId);
    const lockType = canonicalToken(locks[id] || "");
    if (!lockType) return true;
    if (lockType === "premium" || lockType === "patreon") {
      const entitlement = window.EntitlementService?.snapshot?.() || {};
      if (entitlement.developer === true) return true;
      if (id === "lena") return entitlement.lenaUpdate === true;
      if (id === "hailey") return entitlement.haileyUpdate === true;
      if (id === "mason") return entitlement.masonUpdate === true;
    }
    return false;
  }

  function routesForUpdateCharacter(config, characterId) {
    const configured = config?.routeOptionsByCharacter?.[canonicalToken(characterId)];
    return uniqueTokens(Array.isArray(configured) ? configured : ROUTES).map(normalizeRoute).filter(Boolean);
  }

  function validateUpdateSelection(config, setup) {
    const selected = uniqueTokens(setup.activeCharacters || []);
    const allowed = configList(config, "characters", []);
    if (!selected.length || selected.some((id) => !allowed.includes(id))) throw new Error(localizedSource("Select an available update character"));
    for (const id of selected) {
      if (!isCharacterUnlockedForUpdate(config, id)) throw new Error(localizedSource("This update requires the Lena code"));
      if (!routesForUpdateCharacter(config, id).includes(normalizeRoute(setup.routes?.[id]))) throw new Error(localizedSource("This route is not available in the update"));
    }
    if (Object.keys(setup.routes || {}).some((id) => !selected.includes(id))) throw new Error(localizedSource("Update routes must belong to selected characters"));
  }

  function isResetKey(key) {
    if (!key || STABLE_EXACT_KEYS.has(key)) return false;
    if (EXACT_RESET_KEYS.has(key)) return true;
    if (/^story_.+_done$/i.test(key)) return true;
    if (/^route_[a-z0-9_]+_locked_v1$/i.test(key)) return true;
    if (/^route_[a-z0-9_]+_lock_day_v1$/i.test(key)) return true;
    return RESET_PREFIXES.some((prefix) => key.startsWith(prefix));
  }

  function hasExistingProgress() {
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (isResetKey(key)) return true;
      }
    } catch {}
    return false;
  }

  // Canonical once-key authority (progression.onceKeys via MARK_ONCE) --
  // onceDone()'s own read order in convo-runtime.js already checks this
  // before falling back to the legacy once_/__once: keys, so dispatching
  // here makes those two legacy writes redundant rather than required.
  function setOnceDone(onceKey) {
    const key = canonicalToken(onceKey);
    if (!key) return;
    if (window.Game && typeof window.Game.markOnce === "function") {
      window.Game.markOnce(key);
    }
  }

  function resetProgressionForUpdate(config) {
    try { window.GalleryStore?.migrateStorage?.({ includeLegacy: true }); } catch {}
    const removed = [];
    try {
      for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const key = localStorage.key(i);
        if (!isResetKey(key)) continue;
        if (safeRemove(key)) removed.push(key);
      }
    } catch {}

    const flags = (config && config.setupFlags && typeof config.setupFlags === "object") ? config.setupFlags : {};
    Object.keys(flags).forEach((key) => safeSet(key, flags[key]));

    try {
      const Game = (window.Game ||= {});
      Game.history = [];
      Game.lastQuery = {};
      Game._pendingLoad = null;
      Game._pendingStory = null;
      Game.pendingStory = null;
      Game.__pendingStory = null;
      Game._activeRunner = null;
      Game._activeStoryPath = null;
      Game._storyRunId = 0;
      Game._timeCardBusy = false;
      Game._cinematicLock = false;
      Game.actionPending = false;
      Game.choicePending = false;
    } catch {}

    try {
      window.dispatchEvent(new CustomEvent("game:story-restarted", {
        detail: { source: "new_update_entry", updateId: String(config?.id || "") }
      }));
    } catch {}

    return removed;
  }

  function injectSetupStyles() {
    if (document.getElementById("new-update-setup-style-v1")) return;
    const style = document.createElement("style");
    style.id = "new-update-setup-style-v1";
    style.textContent = `
      .new-update-setup-overlay[hidden]{display:none!important}
      .new-update-setup-overlay{position:fixed;inset:0;z-index:99995;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(3,8,14,.82);backdrop-filter:blur(10px)}
      .new-update-setup-card{width:min(430px,100%);max-height:min(720px,calc(100vh - 24px));overflow:auto;border:1px solid rgba(127,232,255,.28);border-radius:8px;background:#081017;color:#e9fbff;box-shadow:0 24px 70px rgba(0,0,0,.55);padding:18px}
      .new-update-setup-title{font-size:18px;font-weight:800;letter-spacing:0;text-transform:uppercase;margin:0 0 8px}
      .new-update-setup-subtitle{font-size:13px;line-height:1.45;color:#a9c7d0;margin:0 0 16px}
      .new-update-character-list{display:grid;gap:8px}
      .new-update-character-entry{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px;border:1px solid rgba(127,232,255,.18);border-radius:8px;background:rgba(255,255,255,.035)}
      .new-update-character-entry>span{min-width:0;overflow-wrap:anywhere}
      .new-update-character-entry>button{flex-shrink:0;min-height:38px;padding:0 14px;border:1px solid rgba(127,232,255,.28);border-radius:8px;background:#0c1822;color:#e9fbff;font-weight:800}
      .new-update-character-entry>input{flex-shrink:0;width:20px;height:20px;accent-color:#7fe8ff}
      .new-update-point-total{display:flex;justify-content:space-between;gap:12px;padding:10px 12px;margin-bottom:12px;border:1px solid rgba(127,232,255,.18);border-radius:8px;background:rgba(127,232,255,.06);font-size:12px;text-transform:uppercase}
      .new-update-point-total strong{color:#fff}
      .new-update-point-row{display:grid;grid-template-columns:74px 1fr 70px;align-items:center;gap:10px;padding:10px 0;border-top:1px solid rgba(255,255,255,.08)}
      .new-update-point-row label{font-size:13px;font-weight:800;text-transform:uppercase}
      .new-update-point-row input[type=range]{width:100%;accent-color:#7fe8ff}
      .new-update-point-row input[type=number]{width:70px;min-height:40px;border-radius:8px;border:1px solid rgba(127,232,255,.28);background:#050a10;color:#fff;text-align:center;font-weight:800}
      .new-update-route-list{display:grid;gap:8px;margin:14px 0}
      .new-update-route-option{display:flex;align-items:center;gap:10px;border:1px solid rgba(127,232,255,.18);border-radius:8px;padding:12px;background:rgba(255,255,255,.035);font-size:14px;font-weight:800;text-transform:uppercase}
      .new-update-route-option input{width:18px;height:18px;accent-color:#7fe8ff}
      .new-update-setup-warning{min-height:18px;color:#ffb6b6;font-size:12px;line-height:1.35;margin-top:8px}
      .new-update-setup-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}
      .new-update-setup-actions button{min-height:38px;border-radius:8px;border:1px solid rgba(127,232,255,.28);background:#0c1822;color:#e9fbff;padding:0 14px;font-weight:800;text-transform:uppercase}
      .new-update-setup-actions button.primary{background:#7fe8ff;color:#051016;border-color:#7fe8ff}
      .new-update-setup-actions button:disabled{opacity:.45;cursor:not-allowed}
      @media (max-width:430px){.new-update-setup-overlay{padding:10px}.new-update-setup-card{padding:14px}.new-update-point-row{grid-template-columns:62px 1fr 60px}.new-update-point-row input[type=number]{width:60px}.new-update-setup-actions{justify-content:stretch}.new-update-setup-actions button{flex:1}}
    `;
    document.head.appendChild(style);
  }

  function createSetupOverlay(id, title, subtitle) {
    injectSetupStyles();
    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.className = "new-update-setup-overlay";
    overlay.setAttribute("aria-hidden", "false");
    const card = document.createElement("div");
    card.className = "new-update-setup-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    const h = document.createElement("h2");
    h.className = "new-update-setup-title";
    h.textContent = title;
    const p = document.createElement("p");
    p.className = "new-update-setup-subtitle";
    p.textContent = subtitle;
    card.appendChild(h);
    card.appendChild(p);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    return { overlay, card };
  }

  function closeSetupOverlay(overlay) {
    try { overlay.remove(); } catch {}
  }

  function normalizeSelectedCharacters(config, rawSelected) {
    const allowed = new Set(configList(config, "characters", []));
    const out = [];
    const seen = new Set();
    const list = Array.isArray(rawSelected) ? rawSelected : [];
    list.forEach((raw) => {
      const id = canonicalToken(raw);
      if (!id || !allowed.has(id) || seen.has(id)) return;
      seen.add(id);
      out.push(id);
    });
    return out;
  }

  async function askActiveCharactersForUpdate(config) {
    const rows = characterRows(config);
    const fallback = rows
      .map((row) => row.id)
      .filter((id) => id && isCharacterUnlockedForUpdate(config, id));
    const selected = new Set(fallback);
    return new Promise((resolve) => {
      const { overlay, card } = createSetupOverlay("new-update-character-setup-v1", "CHARACTERS", "Choose active conversations for the update.");
      const list = document.createElement("div");
      list.className = "new-update-character-list";
      card.appendChild(list);
      const warning = document.createElement("div");
      warning.className = "new-update-setup-warning";
      card.appendChild(warning);
      const actions = document.createElement("div");
      actions.className = "new-update-setup-actions";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Cancel";
      const next = document.createElement("button");
      next.type = "button";
      next.className = "primary";
      next.textContent = "Continue";
      actions.appendChild(cancel);
      actions.appendChild(next);
      card.appendChild(actions);
      function render() {
        list.replaceChildren();
        rows.forEach((row) => {
          const locked = !isCharacterUnlockedForUpdate(config, row.id);
          const entry = document.createElement("label");
          entry.className = "new-update-character-entry";
          entry.dataset.contactId = row.id;
          const name = document.createElement("span");
          name.textContent = displayNameFor(row.id);
          entry.appendChild(name);
          if (locked) {
            const unlock = document.createElement("button");
            unlock.type = "button";
            unlock.textContent = "Code";
            unlock.addEventListener("click", (event) => {
              event.preventDefault();
              overlay.hidden = true;
              const opened = window.Game?.openPatreonCodeModal?.({ context: "premium", title: displayNameFor(row.id), subtitle: localizedSource("Enter the Lena update code to unlock Day 16 onward."), cancelLabel: "Back", confirmLabel: "Unlock", onSuccess: () => { if (isCharacterUnlockedForUpdate(config, row.id)) selected.add(row.id); overlay.hidden = false; render(); }, onCancel: () => { overlay.hidden = false; render(); } });
              if (!opened) overlay.hidden = false;
            });
            entry.appendChild(unlock);
          } else {
            const input = document.createElement("input");
            input.type = "checkbox";
            input.checked = selected.has(row.id);
            input.addEventListener("change", () => { if (input.checked) selected.add(row.id); else selected.delete(row.id); render(); });
            entry.appendChild(input);
          }
          list.appendChild(entry);
        });
        warning.textContent = selected.size ? "" : "Select at least one character.";
        next.disabled = selected.size === 0;
      }
      cancel.addEventListener("click", () => { closeSetupOverlay(overlay); resolve([]); });
      next.addEventListener("click", () => { if (!selected.size) return; closeSetupOverlay(overlay); resolve(normalizeSelectedCharacters(config, [...selected]).filter((id) => isCharacterUnlockedForUpdate(config, id))); });
      render();
    });
  }

  function openSkillPointSetup(config) {
    return new Promise((resolve) => {
      const totalPoints = Math.max(0, Math.floor(Number(config?.startingPoints || 0) || 0));
      const state = { love: 0, nts: 0, ntr: 0 };
      const { overlay, card } = createSetupOverlay(
        "new-update-skill-setup-v1",
        "HAK SKILL SETUP",
        "Distribute exactly " + totalPoints + " total points."
      );

      const total = document.createElement("div");
      total.className = "new-update-point-total";
      total.innerHTML = '<span>Total: <strong data-total>0</strong> / ' + totalPoints + '</span><span>Remaining: <strong data-remaining>' + totalPoints + '</strong></span>';
      card.appendChild(total);

      const rows = {};
      ROUTES.forEach((route) => {
        const row = document.createElement("div");
        row.className = "new-update-point-row";
        const label = document.createElement("label");
        label.textContent = route.toUpperCase();
        const range = document.createElement("input");
        range.type = "range";
        range.min = "0";
        range.max = String(totalPoints);
        range.step = "1";
        range.value = "0";
        range.setAttribute("data-new-update-skill-range", route);
        const number = document.createElement("input");
        number.type = "number";
        number.min = "0";
        number.max = String(totalPoints);
        number.step = "1";
        number.value = "0";
        number.setAttribute("data-new-update-skill-input", route);
        row.appendChild(label);
        row.appendChild(range);
        row.appendChild(number);
        card.appendChild(row);
        rows[route] = { range, number };
      });

      const warning = document.createElement("div");
      warning.className = "new-update-setup-warning";
      warning.setAttribute("role", "status");
      card.appendChild(warning);

      const actions = document.createElement("div");
      actions.className = "new-update-setup-actions";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Cancel";
      const next = document.createElement("button");
      next.type = "button";
      next.className = "primary";
      next.textContent = "Continue";
      next.disabled = true;
      actions.appendChild(cancel);
      actions.appendChild(next);
      card.appendChild(actions);

      function sum() {
        return ROUTES.reduce((acc, route) => acc + (Number(state[route] || 0) || 0), 0);
      }

      function setValue(route, raw) {
        const value = Math.max(0, Math.min(totalPoints, Math.floor(Number(raw || 0) || 0)));
        state[route] = value;
        rows[route].range.value = String(value);
        rows[route].number.value = String(value);
      }

      function render() {
        const spent = sum();
        const remaining = totalPoints - spent;
        total.querySelector("[data-total]").textContent = String(spent);
        total.querySelector("[data-remaining]").textContent = String(Math.max(0, remaining));
        if (spent > totalPoints) warning.textContent = "Total cannot exceed " + totalPoints + ".";
        else if (spent < totalPoints) warning.textContent = "Spend all remaining points to continue.";
        else warning.textContent = "";
        next.disabled = spent !== totalPoints;
      }

      ROUTES.forEach((route) => {
        rows[route].range.addEventListener("input", () => { setValue(route, rows[route].range.value); render(); });
        rows[route].number.addEventListener("input", () => { setValue(route, rows[route].number.value); render(); });
      });

      cancel.addEventListener("click", () => {
        closeSetupOverlay(overlay);
        resolve(null);
      });
      next.addEventListener("click", () => {
        if (next.disabled) return;
        closeSetupOverlay(overlay);
        resolve({ love: state.love, nts: state.nts, ntr: state.ntr });
      });

      render();
    });
  }

  function openRouteSelection(config, characterId) {
    return new Promise((resolve) => {
      const name = displayNameFor(characterId).toUpperCase();
      const availableRoutes = routesForUpdateCharacter(config, characterId);
      const defaultRoute = availableRoutes.includes(normalizeRoute(config?.defaultRoute)) ? normalizeRoute(config.defaultRoute) : availableRoutes[0];
      const { overlay, card } = createSetupOverlay(
        "new-update-route-setup-v1",
        "SELECT " + name + " ROUTE",
        "Choose the route lock used by the Day " + (config?.day || config?.targetDay || 9) + " entry."
      );

      const list = document.createElement("div");
      list.className = "new-update-route-list";
      availableRoutes.forEach((route) => {
        const label = document.createElement("label");
        label.className = "new-update-route-option";
        const input = document.createElement("input");
        input.type = "radio";
        input.name = "new-update-route";
        input.value = route;
        input.checked = route === defaultRoute;
        input.setAttribute("data-new-update-route", route);
        label.appendChild(input);
        label.appendChild(document.createTextNode(route.toUpperCase()));
        list.appendChild(label);
      });
      card.appendChild(list);

      const actions = document.createElement("div");
      actions.className = "new-update-setup-actions";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Cancel";
      const next = document.createElement("button");
      next.type = "button";
      next.className = "primary";
      next.textContent = "Continue";
      actions.appendChild(cancel);
      actions.appendChild(next);
      card.appendChild(actions);

      cancel.addEventListener("click", () => {
        closeSetupOverlay(overlay);
        resolve(null);
      });
      next.addEventListener("click", () => {
        const selected = normalizeRoute(card.querySelector("input[name='new-update-route']:checked")?.value) || defaultRoute;
        closeSetupOverlay(overlay);
        resolve(selected);
      });
    });
  }

  async function askRouteSelectionsForUpdate(config, selectedCharacters) {
    const selected = new Set(uniqueTokens(selectedCharacters));
    const routeCharacters = configList(config, "routeCharacters", []);
    const routes = {};
    for (const characterId of routeCharacters) {
      if (!selected.has(characterId)) continue;
      const route = await openRouteSelection(config, characterId);
      if (!route) return null;
      routes[characterId] = route;
    }
    return routes;
  }

  function openMasonVariantSelection() {
    return new Promise((resolve) => {
      let selected = "";
      const { overlay, card } = createSetupOverlay(
        "new-update-mason-variant-v1",
        displayNameFor("mason").toUpperCase(),
        localizedSource("How do you want Mason to appear in this story?")
      );
      const list = document.createElement("div");
      list.className = "new-update-route-list";
      [
        { value: "male", label: localizedSource("Male Mason") },
        { value: "female", label: localizedSource("Female Mason") }
      ].forEach((option) => {
        const label = document.createElement("label");
        label.className = "new-update-route-option";
        const input = document.createElement("input");
        input.type = "radio";
        input.name = "new-update-mason-variant";
        input.value = option.value;
        input.addEventListener("change", () => { selected = option.value; next.disabled = false; });
        label.appendChild(input);
        label.appendChild(document.createTextNode(option.label));
        list.appendChild(label);
      });
      card.appendChild(list);

      const actions = document.createElement("div");
      actions.className = "new-update-setup-actions";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = localizedSource("Cancel");
      const next = document.createElement("button");
      next.type = "button";
      next.className = "primary";
      next.textContent = localizedSource("Continue");
      next.disabled = true;
      cancel.addEventListener("click", () => { closeSetupOverlay(overlay); resolve(null); });
      next.addEventListener("click", () => {
        if (!selected) return;
        closeSetupOverlay(overlay);
        resolve(selected);
      });
      actions.appendChild(cancel);
      actions.appendChild(next);
      card.appendChild(actions);
    });
  }

  function openMasonCoachSelection() {
    return new Promise((resolve) => {
      let selected = "";
      const { overlay, card } = createSetupOverlay(
        "new-update-mason-coach-v1",
        "MASON NTS COACH",
        "Choose who coached Mason before the Day 9 entry."
      );
      const list = document.createElement("div");
      list.className = "new-update-route-list";
      [{ value: "aiden", label: "Aiden" }, { value: "chris", label: "Chris" }].forEach((option) => {
        const label = document.createElement("label");
        label.className = "new-update-route-option";
        const input = document.createElement("input");
        input.type = "radio";
        input.name = "new-update-mason-coach";
        input.value = option.value;
        input.setAttribute("data-new-update-coach", option.value);
        input.addEventListener("change", () => { selected = option.value; next.disabled = false; });
        label.appendChild(input);
        label.appendChild(document.createTextNode(option.label));
        list.appendChild(label);
      });
      card.appendChild(list);
      const actions = document.createElement("div");
      actions.className = "new-update-setup-actions";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Cancel";
      const next = document.createElement("button");
      next.type = "button";
      next.className = "primary";
      next.textContent = "Continue";
      next.disabled = true;
      cancel.addEventListener("click", () => { closeSetupOverlay(overlay); resolve(null); });
      next.addEventListener("click", () => { if (!selected) return; closeSetupOverlay(overlay); resolve(selected); });
      actions.appendChild(cancel);
      actions.appendChild(next);
      card.appendChild(actions);
    });
  }

  function writeMasonVariant(rawVariant, activeCharacters) {
    const active = new Set(uniqueTokens(activeCharacters));
    if (!active.has("mason")) {
      safeRemove(MASON_VARIANT_KEY);
      return "";
    }
    const variant = canonicalToken(rawVariant);
    if (variant !== "male" && variant !== "female") {
      throw new Error("Mason requires an explicit story variant");
    }
    safeSet(MASON_VARIANT_KEY, variant);
    try { window.Game?.setCharacterVariant?.("mason", variant); } catch {}
    try { window.dispatchEvent(new CustomEvent("character-variant:changed", { detail: { id: "mason", value: variant } })); } catch {}
    return variant;
  }

  async function confirmProgressOverwrite(config) {
    if (!hasExistingProgress()) return true;
    const text = "Starting the new update will move your current story progress to the new update entry point. Your gallery and settings will be kept. Continue?";
    if (window.UIModal && typeof window.UIModal.confirm === "function") {
      return !!(await window.UIModal.confirm({
        title: localizedSource(String(config?.label || "New Update")),
        text,
        okText: "Continue",
        cancelText: "Cancel"
      }));
    }
    return false;
  }

  // Canonical active-character authority (world.activeCharacters via
  // SET_ACTIVE_CHARACTER) -- readCharacterActiveFlag() in convo-runtime.js
  // already checks this array FIRST and only falls back to the legacy
  // active_character:<id> key when the canonical array is absent.
  function dispatchActiveCharacter(cid, active) {
    const engine = window.GameStateEngine;
    if (!engine) return;
    const state = engine.getState();
    engine.dispatch({
      type: "SET_ACTIVE_CHARACTER",
      commandId: `new-update-active:${cid}:${state.revision}`,
      expectedRevision: state.revision,
      payload: { contactId: cid, active }
    });
  }

  function writeUpdateActiveCharacters(config, rawSelected) {
    const selected = normalizeSelectedCharacters(config, rawSelected);
    const active = new Set(selected);
    const allCharacters = configList(config, "allCharacters", Object.keys(CHARACTER_CATALOG));
    allCharacters.forEach((id) => {
      const isAiden = id === "aiden";
      dispatchActiveCharacter(id, isAiden ? true : active.has(id));
    });
    dispatchActiveCharacter("aiden", true);

    const nonAidenSelected = selected.filter((id) => id !== "aiden");
    const targets = {};
    allCharacters.forEach((id) => {
      if (id === "aiden") return;
      targets[id] = active.has(id);
    });
    const engine = window.GameStateEngine;
    if (engine) {
      const state = engine.getState();
      const committed = engine.dispatch({ type: "SET_HAK_WATCHLIST", commandId: `new-update-watchlist:${state.revision}`, expectedRevision: state.revision, payload: { operationId: `new-update-watchlist:${state.playthrough?.id || "playthrough"}`, selected: nonAidenSelected, targets, availableTargetIds: Object.keys(targets), syncActiveCharacters: true, visible: true } });
      if (!committed.ok && committed.status !== "DUPLICATE_COMMAND") throw new Error(committed.status);
    }
    return selected;
  }

  function writeRoutePoints(points) {
    const normalized = {
      love: Math.max(0, Math.floor(Number(points?.love || 0) || 0)),
      nts: Math.max(0, Math.floor(Number(points?.nts || 0) || 0)),
      ntr: Math.max(0, Math.floor(Number(points?.ntr || 0) || 0))
    };
    // Canonical checkpoint initialization consumes this exact value. The
    // engine's compatibility projection updates legacy consumers afterward.
    return normalized;
  }

  function routeAliasForCharacter(config, characterId, route) {
    const cleanRoute = normalizeRoute(route) || "love";
    const aliases = config?.routeAliases && typeof config.routeAliases === "object" ? config.routeAliases : {};
    const byCharacter = aliases[characterId] && typeof aliases[characterId] === "object" ? aliases[characterId] : {};
    return String(byCharacter[cleanRoute] || cleanRoute);
  }

  function routeOnceKeyForCharacter(config, characterId, route) {
    const cleanRoute = normalizeRoute(route) || "love";
    const map = config?.routeLockOnceKeys && typeof config.routeLockOnceKeys === "object" ? config.routeLockOnceKeys : {};
    const byCharacter = map[characterId] && typeof map[characterId] === "object" ? map[characterId] : {};
    return String(byCharacter[cleanRoute] || "");
  }

  function writeRouteLocks(config, selectedRoutes, activeCharacters) {
    const routeCharacters = configList(config, "routeCharacters", []);
    const syncCharacters = configList(config, "routeSyncCharacters", routeCharacters);
    const active = new Set(uniqueTokens(activeCharacters));
    const primaryRouteCharacter = routeCharacters.find((id) => selectedRoutes && selectedRoutes[id]) || routeCharacters[0] || "";
    const primaryRoute = normalizeRoute(selectedRoutes?.[primaryRouteCharacter]) || normalizeRoute(config?.defaultRoute) || "love";
    const applied = {};
    safeSet("route_global_locked_v1", primaryRoute);

    syncCharacters.forEach((characterId) => {
      if (!active.has(characterId)) {
        return;
      }
      const displayRoute = normalizeRoute(selectedRoutes?.[characterId]) || primaryRoute;
      const storedRoute = routeAliasForCharacter(config, characterId, displayRoute);
      safeSet("route_" + characterId + "_locked_v1", storedRoute);
      safeSet("route_" + characterId + "_lock_day_v1", "8");
      try { window.CharacterRoutes?.set?.(characterId, displayRoute, { storedRoute, lockDay: 8 }); } catch {}
      applied[characterId] = { displayRoute, storedRoute };
      const onceKey = routeOnceKeyForCharacter(config, characterId, displayRoute);
      if (onceKey) setOnceDone(onceKey);
    });
    const activationOnceKeys = config?.activationOnceKeys && typeof config.activationOnceKeys === "object" ? config.activationOnceKeys : {};
    Object.entries(activationOnceKeys).forEach(([characterId, onceKey]) => {
      if (active.has(canonicalToken(characterId)) && onceKey) setOnceDone(onceKey);
    });

    return { primaryRoute, applied };
  }

  function configuredUpdateEntry(config, routes) {
    const owner = canonicalToken(config?.contactId || "");
    const route = normalizeRoute(routes?.[owner]) || normalizeRoute(config?.defaultRoute);
    return String(config?.startStoryByRoute?.[route] || config?.startStory || "").trim();
  }

  async function reconstructNewUpdateRouteHistory(config, state) {
    // The graph contains story completion keys, but a selected route is a
    // nested authored consequence. Reconstruct only the configured selected
    // consequences; unselected alternatives must remain absent.
    const active = new Set(state.world.activeCharacters || []);
    const routes = state.world.routes || {};
    const routeKeys = config?.routeLockOnceKeys || {};
    const defaultRoute = normalizeRoute(config?.defaultRoute) || "love";
    const keys = new Set(state.progression.onceKeys || []);
    for (const [owner, byRoute] of Object.entries(routeKeys)) {
      if (!active.has(owner)) continue;
      const key = byRoute[normalizeRoute(routes[owner]) || defaultRoute];
      if (key) keys.add(key);
    }
    for (const [owner, key] of Object.entries(config?.activationOnceKeys || {})) {
      if (active.has(owner) && key) keys.add(key);
    }

    // A shared opener may require a historical route consequence belonging
    // to a character omitted from this update. Preserve that owner's default
    // historical witness only when the actual entry explicitly requires it.
    // This does not activate the owner, assign its live route, or waive any
    // unrelated story/condition/watchlist requirement.
    const response = await fetch(configuredUpdateEntry(config, routes), { cache: "no-store" });
    if (!response || !response.ok) throw new Error("New Update entry metadata unavailable");
    const entry = await response.json();
    const required = String(entry?.requireOnceKey || "").split("|").map(canonicalToken).filter(Boolean);
    if (required.length && !required.some((key) => keys.has(key))) {
      for (const [owner, byRoute] of Object.entries(routeKeys)) {
        if (active.has(owner)) continue;
        const key = byRoute[defaultRoute];
        if (key && required.includes(key)) { keys.add(key); break; }
      }
    }
    state.progression.onceKeys = [...keys];
  }

  let newUpdateSetupInFlight = null;
  function applyNewUpdateSetup(config, setup) {
    const signature = JSON.stringify([config, setup]);
    if (newUpdateSetupInFlight) {
      if (newUpdateSetupInFlight.signature === signature) return newUpdateSetupInFlight.promise;
      return Promise.reject(new Error("A different New Update setup is already committing"));
    }
    // Capture one command identity before asynchronous metadata reads. Reuse
    // that promise for duplicate activation of the same in-flight intent;
    // a later completed setup receives the next canonical revision identity.
    const revision = window.GameStateEngine.getRevision();
    const commandId = "new-update:" + String(config?.id || config?.day || "") + ":" + String(setup.masonVariant || "male") + ":" + revision;
    const attempt = { signature, promise: null };
    attempt.promise = commitNewUpdateSetup(config, setup, commandId).finally(() => {
      if (newUpdateSetupInFlight === attempt) newUpdateSetupInFlight = null;
    });
    newUpdateSetupInFlight = attempt;
    return attempt.promise;
  }

  async function commitNewUpdateSetup(config, setup, commandId) {
    validateUpdateSelection(config, setup);
    const canonicalDay = Math.max(1, Math.min(20, Number(config?.day || config?.targetDay || 1) || 1));
    const canonicalRoutes = setup.routes && typeof setup.routes === "object" ? { ...setup.routes } : {};
    const canonicalBuilder = new window.CheckpointStateBuilder({ nodes: await loadStoryGraphManifest() });
    const canonicalActiveCharacters = uniqueTokens([...(setup.activeCharacters || []), "aiden"]);
    const canonicalHakSelected = canonicalActiveCharacters.filter((id) => id !== "aiden");
    const canonicalState = canonicalBuilder.build({ day: canonicalDay, routes: canonicalRoutes, activeCharacters: canonicalActiveCharacters, masonVariant: setup.masonVariant, coachIdentity: setup.coachIdentity || setup.coach || null, hakPoints: Number(setup.points?.hak || 0), hakRoutePoints: setup.points || {}, hakWatchlist: { selected: canonicalHakSelected, targets: Object.fromEntries(canonicalHakSelected.map((id) => [id, true])), configured: canonicalDay >= 3 }, hakTutorial: { completed: canonicalDay >= 3, required: false, state: canonicalDay >= 3 ? "done" : "evidence" }, apps: canonicalDay >= 3 ? ["hak", "onlyfun"] : [], entitlements: window.EntitlementService?.snapshot?.() || {} });
    // Matches scripts/start-from-entry.js's identical fix/comment:
    // StoryInterpreter's conditionAccessor reads world.variables[key] only
    // (no legacy fallback) and resolveIfStepDecision treats that as the
    // authoritative decision -- world.routes/routeLocks and the
    // CharacterRoutes legacy mirror alone are not sufficient.
    {
      const activeSet = new Set(canonicalState.world.activeCharacters || []);
      for (const [cid, route] of Object.entries(canonicalRoutes)) {
        if (!activeSet.has(cid)) continue;
        const normalized = normalizeRoute(route);
        if (normalized) canonicalState.world.variables[`route_${cid}_locked_v1`] = normalized;
      }
    }
    let canonicalStartStory = configuredUpdateEntry(config, canonicalRoutes);
    canonicalState.execution.activeStoryPath = canonicalStartStory;
    canonicalState.execution.activeStoryId = canonicalStartStory;
    canonicalState.execution.activeContactId = canonicalToken(config?.contactId || "") || contactFromStoryPath(canonicalStartStory) || null;
    await reconstructNewUpdateRouteHistory(config, canonicalState);
    window.CheckpointStateBuilder.reconstructSelectionHistory(canonicalState,window.StoryAdmissionCatalog);
    const chronologicalEntry=window.CheckpointStateBuilder.selectCanonicalEntry(canonicalState,window.StoryAdmissionCatalog);
    if (!canonicalActiveCharacters.includes(canonicalToken(chronologicalEntry.contactId))) throw new Error(localizedSource("The update entry must belong to a selected character"));
    canonicalStartStory=String(chronologicalEntry.path);
    canonicalState.execution.activeStoryPath=canonicalStartStory;
    canonicalState.execution.activeStoryId=canonicalStartStory;
    canonicalState.execution.activeContactId=chronologicalEntry.contactId||contactFromStoryPath(canonicalStartStory)||null;
    canonicalState.world.gameTime = window.GameTimeService.initialClock(canonicalDay, canonicalStartStory, canonicalState);
    const canonicalBefore = window.GameStateEngine.getState();
    const canonicalCommit = window.GameStateEngine.dispatch({ type: "INITIALIZE_NEW_UPDATE", commandId, expectedRevision: canonicalBefore.revision, payload: { state: canonicalState, source: "new_update" } });
    if (!canonicalCommit.ok && canonicalCommit.status !== "DUPLICATE_COMMAND") throw new Error(canonicalCommit.error?.message || canonicalCommit.status);
    mirrorNewUpdateSelectionToLegacyStores(canonicalState.world.activeCharacters, canonicalRoutes);
    return { version: 2, id: String(config?.id || ""), day: canonicalDay, activeCharacters: uniqueTokens(setup.activeCharacters || []), routes: canonicalRoutes, masonVariant: setup.masonVariant === "female" ? "female" : "male", coachIdentity: setup.coachIdentity || null, startStory: canonicalStartStory, canonicalRevision: window.GameStateEngine.getState().revision };

  }

  // Matches scripts/start-from-entry.js's identical fix and comment: route-
  // gated story conditions (route_<id>_locked_v1:...) are read through
  // window.CharacterRoutes, a standalone localStorage-only store never wired
  // to canonical world.routes/routeLocks. Mirroring the already-committed
  // canonical selection into it (not a new authority -- it reflects what
  // INITIALIZE_NEW_UPDATE just decided) is what lets route-gated content
  // resolve correctly instead of silently falling through to LOVE.
  function mirrorNewUpdateSelectionToLegacyStores(activeCharacters, characterRoutes) {
    try {
      const active = new Set((Array.isArray(activeCharacters) ? activeCharacters : []).map((id) => String(id || "").trim().toLowerCase()));
      for (const id of ["lena", "hailey", "evelyn", "mason"]) {
        try { safeSet(`active_character:${id}`, active.has(id) ? "1" : "0"); } catch {}
        if (active.has(id) && window.CharacterRoutes?.set) {
          const route = normalizeRoute((characterRoutes && characterRoutes[id]) || "") || "love";
          window.CharacterRoutes.set(id, route);
        }
      }
    } catch {}
  }

  function startConfiguredUpdate(config, setupPayload) {
    const startStory = String(setupPayload?.startStory || "").trim();
    if (!startStory) return false;
    const opts = {
      goHome: true,
      startStory,
      startDelayMs: 200,
      reason: "new_update_entry",
      allowConversationInterrupt: true,
      allowInConversation: true,
      allowPlayerTurns: true,
      forceStoryRestart: true
    };
    if (typeof window.showTimeCard === "function") {
      window.showTimeCard(String(config?.timeCardText || "DAY " + (config?.targetDay || config?.day || "")), opts);
      return true;
    }
    return !!(window.Game ||= {}).startStory?.(startStory, {
      ...opts,
      __strictRequestedPath: true
    });
  }

  async function proceedAfterUpdateSetup(config) {
    const ok = await confirmProgressOverwrite(config);
    if (!ok) return false;

    const activeCharacters = await askActiveCharactersForUpdate(config);
    if (!activeCharacters.length) return false;
    const masonVariant = activeCharacters.includes("mason")
      ? await openMasonVariantSelection()
      : "";
    if (activeCharacters.includes("mason") && !masonVariant) return false;
    const points = await openSkillPointSetup(config);
    if (!points) return false;
    const routes = await askRouteSelectionsForUpdate(config, activeCharacters);
    if (!routes) return false;
    const coachIdentity = activeCharacters.includes("mason") && normalizeRoute(routes.mason) === "nts"
      ? await openMasonCoachSelection()
      : null;
    if (activeCharacters.includes("mason") && normalizeRoute(routes.mason) === "nts" && !coachIdentity) return false;

    const setupPayload = await applyNewUpdateSetup(config, { activeCharacters, masonVariant, coachIdentity, points, routes });
    safeRemove("premium_pending_story_v1");
    safeRemove("premium_blocked_story_v1");
    return startConfiguredUpdate(config, setupPayload);
  }

  function openNewUpdateAccess() {
    const config = window.NEW_UPDATE_CONFIG || window.NEW_UPDATE_ENTRY_CONFIG || NEW_UPDATE_CONFIG;
    void proceedAfterUpdateSetup(config).catch((err) => {
      try { console.warn("[NewUpdateEntry] launch failed", err); } catch {}
      try { window.UIModal?.alert?.({ title: "New Update", text: "Unable to start the update from here. Please try again." }); } catch {}
    });
    return true;
  }

  window.openNewUpdateAccess = openNewUpdateAccess;
  window.startNewUpdateEntry = openNewUpdateAccess;
  window.Game = window.Game || {};
  // Shared by the fresh-profile splash flow.  The picker owns presentation
  // only; callers still commit through the canonical engine command.
  window.Game.chooseMasonVariant = openMasonVariantSelection;
  window.Game.openNewUpdateAccess = openNewUpdateAccess;
  window.Game.getNewUpdateEntryConfig = () => window.NEW_UPDATE_CONFIG || window.NEW_UPDATE_ENTRY_CONFIG || NEW_UPDATE_CONFIG;
})();
