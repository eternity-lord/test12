(function initStartFromEntry() {
  "use strict";

  const ROUTES = Object.freeze(["love", "ntr", "nts"]);
  const SELECTABLE_CHARACTERS = Object.freeze(["lena", "hailey", "evelyn", "mason"]);
  const ALL_ACTIVE_CHARACTERS = Object.freeze(["lena", "evelyn", "mason", "hailey", "aiden"]);
  const MASON_VARIANT_KEY = "character_variant_mason";
  const STORY_MANIFEST_PATH = "story/story_manifest.json";
  const DEV_CHECKPOINTS_PATH = "story/dev_checkpoints.json";
  const STATE_KEY = "start_from_setup_v1";
  const ROUTE_POINT_CAPS = Object.freeze({ love: 16, ntr: 16, nts: 16 });

  function configuredCharacters(config, key, fallback) {
    const rows = config && Array.isArray(config[key]) ? config[key] : fallback;
    return unique(rows || []);
  }

  function routeCharactersFor(config) {
    return configuredCharacters(config, "routeLockCharacters", SELECTABLE_CHARACTERS);
  }

  function activeCharactersFor(config) {
    return configuredCharacters(config, "activeCharacters", ALL_ACTIVE_CHARACTERS);
  }

  // Audited from story JSON point-bearing choices and the route point cap.
  // Day 9+ NTS keeps the actual DAY9 Evelyn NTS award: it grants NTR points.
  const SKILL_POINT_AUDIT = Object.freeze({
    1: freezeRouteAudit({ love: {}, ntr: {}, nts: {} }),
    2: freezeRouteAudit({ love: {}, ntr: {}, nts: {} }),
    3: freezeRouteAudit({ love: {}, ntr: {}, nts: {} }),
    4: freezeRouteAudit({ love: { love: 4 }, ntr: { ntr: 4 }, nts: { nts: 4 } }),
    5: freezeRouteAudit({ love: { love: 4 }, ntr: { ntr: 4 }, nts: { nts: 4 } }),
    6: freezeRouteAudit({ love: { love: 4 }, ntr: { ntr: 4 }, nts: { nts: 4 } }),
    7: freezeRouteAudit({ love: { love: 6 }, ntr: { ntr: 6 }, nts: { nts: 6 } }),
    8: freezeRouteAudit({ love: { love: 8 }, ntr: { ntr: 8 }, nts: { nts: 8 } }),
    9: freezeRouteAudit({ love: { love: 16 }, ntr: { ntr: 16 }, nts: { nts: 16 } }),
    10: freezeRouteAudit({ love: { love: 16 }, ntr: { ntr: 16 }, nts: { nts: 16, ntr: 3 } }),
    11: freezeRouteAudit({ love: { love: 16 }, ntr: { ntr: 16 }, nts: { nts: 16, ntr: 3 } }),
    12: freezeRouteAudit({ love: { love: 16 }, ntr: { ntr: 16 }, nts: { nts: 16, ntr: 3 } }),
    13: freezeRouteAudit({ love: { love: 16 }, ntr: { ntr: 16 }, nts: { nts: 16, ntr: 3 } }),
    14: freezeRouteAudit({ love: { love: 16 }, ntr: { ntr: 16 }, nts: { nts: 16, ntr: 3 } }),
    15: freezeRouteAudit({ love: { love: 16 }, ntr: { ntr: 16 }, nts: { nts: 16, ntr: 3 } }),
    16: freezeRouteAudit({ love: { love: 16 }, ntr: { ntr: 16 }, nts: { nts: 16, ntr: 3 } }),
    17: freezeRouteAudit({ love: { love: 16 }, ntr: { ntr: 16 }, nts: { nts: 16, ntr: 3 } }),
    18: freezeRouteAudit({ love: { love: 16 }, ntr: { ntr: 16 }, nts: { nts: 16, ntr: 3 } }),
    19: freezeRouteAudit({ love: { love: 16 }, ntr: { ntr: 16 }, nts: { nts: 16, ntr: 3 } }),
    20: freezeRouteAudit({ love: { love: 16 }, ntr: { ntr: 16 }, nts: { nts: 16, ntr: 3 } })
  });

  const BASELINE_POINT_CHOICES = Object.freeze([
    { day: 3, onceKey: "d3_01_lena_tickets_v1", choiceKey: "d3_lena_tickets_choice_v2", byRoute: { love: { optionId: "love", points: { love: 2 } }, ntr: { optionId: "ntr", points: { ntr: 2 } }, nts: { optionId: "nts", points: { nts: 2 } } } },
    { day: 3, onceKey: "d3_00_lena_night_v1", choiceKey: "d3_lena_secret_choice", byRoute: { love: { optionId: "love", points: { love: 2 } }, ntr: { optionId: "ntr", points: { ntr: 2 } }, nts: { optionId: "nts", points: { nts: 2 } } } },
    { day: 6, onceKey: "d6_00_lena_lunch_aiden_charm_v1", choiceKey: "d6_lena_aiden_charm_choice_v1", byRoute: { love: { optionId: "love", points: { love: 2 } }, ntr: { optionId: "ntr", points: { ntr: 2 } }, nts: { optionId: "nts", points: { nts: 2 } } } },
    { day: 7, onceKey: "d7_00_lena_lunch_coworker_friend_v1", choiceKey: "d7_lena_weird_coworker_choice_v1", byRoute: { love: { optionId: "love", points: { love: 2 } }, ntr: { optionId: "ntr", points: { ntr: 2 } }, nts: { optionId: "nts", points: { nts: 2 } } } },
    { day: 8, onceKey: "d8_00_evelyn_morning_route_lock_v1", choiceKey: "d8_evelyn_route_lock_choice_v1", byRoute: { love: { optionId: "love", points: { love: 2 } }, ntr: { optionId: "ntr", points: { ntr: 2 } }, nts: { optionId: "nts", points: { nts: 2 } } } },
    { day: 8, onceKey: "d8_12_hailey_route_lock_outfits_choice_v1", choiceKey: "d8_hailey_route_lock_study_choice_v1", byRoute: { love: { optionId: "love", points: { love: 2 } }, ntr: { optionId: "ntr", points: { ntr: 2 } }, nts: { optionId: "nts", points: { nts: 2 } } } },
    { day: 8, onceKey: "d8_09_mason_route_lock_v1", choiceKey: "d8_mason_route_lock_choice_v1", byRoute: { love: { optionId: "love", points: { love: 2 } }, ntr: { optionId: "ntr", points: { ntr: 2 } }, nts: { optionId: "nts_coach", points: { nts: 2 } } } },
    { day: 8, onceKey: "d8_00_lena_route_lock_talk_v1", choiceKey: "d8_lena_route_lock_choice_v3", byRoute: { love: { optionId: "love", points: { love: 16 } }, ntr: { optionId: "ntr", points: { ntr: 16 } }, nts: { optionId: "nts", points: { nts: 16 } } } },
    { day: 9, route: "love", onceKey: "d9_00_evelyn_morning_love_v1", choiceKey: "d9_evelyn_morning_kiss_choice_v1", byRoute: { love: { optionId: "tease", points: { love: 1 } } } },
    { day: 9, route: "ntr", onceKey: "d9_00_evelyn_morning_ntr_v1", choiceKey: "d9_evelyn_dresscode_advice_v1", byRoute: { ntr: { optionId: "trust_manager", points: { ntr: 3 } } } },
    { day: 9, route: "nts", onceKey: "d9_00_evelyn_morning_nts_v1", choiceKey: "d9_evelyn_job_pitch_v1", byRoute: { nts: { optionId: "paid_date", points: { nts: 3 } } } },
    { day: 14, route: "nts", onceKey: "d14_03_lena_night_nts_v1", choiceKey: "d14_nts_want_to_know_choice", byRoute: { nts: { optionId: "know_and_receive", points: { nts: 2 } } } }
  ]);

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
    "story_play_current_v1",
    MASON_VARIANT_KEY,
    "choices_log_v1",
    "choice_rewinds_v1",
    "story_replays_v1",
    "route_points_v1",
    "route_point_awards_v1",
    "hak_skills_v1",
    "skills_unlocked_v1",
    "hak_ai_queue_v1",
    "hak_photos_v1",
    "hak_evidence_v1",
    "hak_evidence_seen_v1",
    "hak_evidence_notified_v1",
    "hak_tree_booted_v1",
    "hak_last_unlock_v1",
    "hak_watchlist_v1",
    "hak_watchlist_v1_selected",
    "hak_targets_v1",
    "hak_characters_chosen_v1",
    "hak_character_selection_done_v1",
    "guided_cues_v1",
    "app_badges_v1",
    "home_pop_app_v1",
    "feature_meetandgreet_unlocked",
    "meetandgreet_unlocked_v1",
    "meetandgreet_profiles_v1",
    "meetandgreet_photos_v1",
    "meetandgreet_comments_v1",
    "meetandgreet_tips_v1",
    "meetandgreet_tip_seen_v1",
    "meetandgreet_badge_v1",
    "meetandgreet_seen_v1",
    "meetandgreet_missing_art_debt_v1",
    "meetandgreet_open_intent_v1",
    "feature_onlyfun_unlocked",
    "onlyfun_signed_in",
    "onlyfun_seeded_v1",
    "app_badge_onlyfun",
    "onlyfun_creators_v1",
    "onlyfun_accounts_v1",
    "onlyfun_subscriptions_v1",
    "onlyfun_subscriptions",
    "onlyfun_posts_v1",
    "onlyfun_seen_posts_v1",
    "onlyfun_open_creator",
    "onlyfun_focus_post",
    "onlyfun_pending_gates_v1",
    "onlyfun_d1_09_pending",
    "openConversationId",
    "activeConversationId",
    "new_update_setup_v1",
    STATE_KEY
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
    "achievements_v1",
    "achievement_meta_v1",
    "card_vault_state_v1"
  ]);

  let manifestPromise = null;
  let devConfigPromise = null;
  let supportedStartDaysPromise = null;

  function freezeRouteAudit(map) {
    const out = {};
    ROUTES.forEach((route) => {
      const p = normalizePoints(map[route] || {});
      out[route] = Object.freeze({ ...p, total: p.love + p.ntr + p.nts });
    });
    return Object.freeze(out);
  }

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, String(value)); return true; } catch { return false; }
  }

  function safeRemove(key) {
    try { localStorage.removeItem(key); return true; } catch { return false; }
  }

  function parseJson(raw, fallback) {
    try { return JSON.parse(raw); } catch { return fallback; }
  }

  function token(raw) {
    return String(raw || "").trim().toLowerCase().replace(/\s+/g, "_");
  }

  function normalizeRoute(raw) {
    const route = token(raw);
    return ROUTES.includes(route) ? route : "";
  }

  function normalizeStoryPath(raw) {
    const p = String(raw || "").trim().replace(/\\/g, "/").replace(/^\.\//, "");
    if (!p) return "";
    if (/^story\/.+\.json$/i.test(p)) return p;
    if (p.endsWith(".json")) return "story/" + p;
    return "story/" + p + ".json";
  }

  function normalizePoints(points) {
    const src = points && typeof points === "object" ? points : {};
    return {
      love: clampPoint("love", src.love),
      ntr: clampPoint("ntr", src.ntr),
      nts: clampPoint("nts", src.nts)
    };
  }

  function normalizeMasonVariant(value) {
    return token(value) === "female" ? "female" : "male";
  }

  function clampPoint(route, value) {
    const max = Math.max(0, Number(ROUTE_POINT_CAPS[route] || 0) || 0);
    const n = Math.max(0, Math.floor(Number(value || 0) || 0));
    return max ? Math.min(max, n) : n;
  }

  function sumPoints(points) {
    return ROUTES.reduce((total, route) => total + (Number(points && points[route] || 0) || 0), 0);
  }

  function routeAuditFor(day, route) {
    const dayMap = SKILL_POINT_AUDIT[Math.max(1, Math.min(20, Number(day || 1) || 1))] || SKILL_POINT_AUDIT[1];
    return dayMap[normalizeRoute(route) || "love"] || dayMap.love;
  }

  function dayRequiresRoute(day) {
    return Number(day || 0) >= 4;
  }

  function dayRequiresCharacters(day) {
    return Number(day || 0) >= 3;
  }

  // Ask the canonical service for the selected owner's entitlement. Older
  // character codes and gallery access cannot grant the new Lena update.
  function hasCharacterPremiumUnlock(characterId) {
    const cid = token(characterId);
    try {
      const snapshot = window.EntitlementService?.snapshot?.();
      if (snapshot) {
        if (snapshot.developer === true) return true;
        if (cid === "lena") return snapshot.lenaUpdate === true;
        if (cid === "hailey") return snapshot.haileyUpdate === true;
        if (cid === "mason") return snapshot.masonUpdate === true;
        return false;
      }
    } catch {}
    return false;
  }

  function isCharacterLockedForDay(config, characterId, day) {
    const locks = config && config.characterLocks && typeof config.characterLocks === "object" ? config.characterLocks : {};
    const lock = locks[token(characterId)];
    if (!lock || typeof lock !== "object") return false;
    const startDay = Math.max(1, Number(lock.startDay || 1) || 1);
    const endDay = Math.max(startDay, Number(lock.endDay || 999) || 999);
    if (Number(day || 0) < startDay || Number(day || 0) > endDay) return false;
    const type = token(lock.type || "");
    if (type === "premium" || type === "patreon") return !hasCharacterPremiumUnlock(characterId);
    return type !== "";
  }

  function displayNameFor(id) {
    const clean = token(id);
    try {
      if (window.Game && typeof window.Game.tpl === "function") {
        const resolved = window.Game.tpl("{{name:" + clean + "}}");
        if (resolved && !/\{\{/.test(resolved)) return resolved;
      }
    } catch {}
    return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "";
  }

  let routeMapPromise = null;
  const storyMetaPromises = new Map();
  let routeSimulationPlayedPaths = null;
  let lastResolvedFetchPath = "";
  async function routedFetchPath(path) {
    const normalized = String(path || "").replace(/\\/g, "/");
    const catalog = window.LogicalStoryRoutes || {};
    if (catalog[normalized] || Object.values(catalog).some((variants) => Object.values(variants || {}).includes(normalized))) {
      // The generated catalog records the raw JSON owner, including HAK
      // episodes owned by Lena and auxiliary episodes without a route lock.
      return window.CharacterRoutes?.routeStoryPath?.(normalized) || normalized;
    }
    const owner = window.CharacterRoutes?.ownerFromStoryPath?.(normalized) || "";
    if (!owner || !SELECTABLE_CHARACTERS.includes(owner) || !/\/DAY(?:9|1[0-5])\//i.test(normalized)) return normalized;
    const route = window.CharacterRoutes?.get?.(owner, { persistInherited: false, explicitOnly: true }) || "";
    if (!route) return normalized;
    if (!routeMapPromise) {
      routeMapPromise = fetch("story/character_route_map.json", { cache: "no-store" })
        .then((res) => res && res.ok ? res.json() : null)
        .then((data) => data && typeof data === "object" ? data : { paths: {}, sequences: {} })
        .catch(() => ({ paths: {}, sequences: {} }));
    }
    const map = await routeMapPromise;
    const variants = map.paths && map.paths[normalized];
    if (variants && variants[route]) {
      const current = (normalized.match(/\/(love|ntr|nts)\//i) || [])[1];
      if (routeSimulationPlayedPaths && current && current.toLowerCase() !== route) {
        const ownerMatch = normalized.split("/").pop()?.match(/^DAY(\d+)_\d+_([A-Z0-9]+)_/i);
        const sequence = map.sequences && map.sequences[`DAY${Number(ownerMatch?.[1] || 0)}:${String(ownerMatch?.[2] || "").toLowerCase()}:${route}`];
        if (Array.isArray(sequence) && sequence.length) {
          return sequence.find((item) => !routeSimulationPlayedPaths.has(item)) || sequence[sequence.length - 1];
        }
      }
      return variants[route];
    }
    const current = (normalized.match(/\/(love|ntr|nts)\//i) || [])[1];
    if (!current || current.toLowerCase() === route) return normalized;
    throw new Error("No " + route + " route counterpart for " + normalized);
  }

  let storyGraphManifestPromise = null;
  // CheckpointStateBuilder's own progression.onceKeys/completedStoryIds are
  // derived ENTIRELY from the `nodes` list passed to its constructor (see
  // checkpoint-state-builder.js's build(): `eligible = this.nodes.filter(day
  // < target)`). Without a real manifest here, every Start From launch
  // synthesizes a state with progression.onceKeys permanently empty --
  // requirementsMet()'s requireOnceKey check (used by e.g.
  // DAY10_00_AIDEN_SHARED's Day-9-finale gate) then fails forever for any
  // target day whose entry story requires an earlier onceKey, since nothing
  // before the target day was ever marked done.
  async function loadStoryGraphManifest() {
    if (!storyGraphManifestPromise) {
      storyGraphManifestPromise = fetchJson("scripts/generated/story-graph.manifest.json", 10000, false)
        .then((data) => (data && Array.isArray(data.stories)) ? data.stories : [])
        .catch(() => []);
    }
    return storyGraphManifestPromise;
  }

  async function fetchJson(path, timeoutMs = 10000, routeAware = true) {
    const resolvedPath = routeAware ? await routedFetchPath(path) : path;
    lastResolvedFetchPath = String(resolvedPath || "");
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => { try { controller.abort(); } catch {} }, Math.max(1000, Number(timeoutMs || 10000) || 10000))
      : null;
    try {
      const res = await fetch(resolvedPath, { cache: "no-store", ...(controller ? { signal: controller.signal } : {}) });
      if (!res || !res.ok) throw new Error("Unable to load " + resolvedPath);
      return await res.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function loadManifest() {
    if (manifestPromise) return manifestPromise;
    manifestPromise = fetchJson(STORY_MANIFEST_PATH, 10000, false).then((rows) => Array.isArray(rows) ? rows : []);
    return manifestPromise;
  }

  async function loadDevConfig() {
    if (devConfigPromise) return devConfigPromise;
    devConfigPromise = fetchJson(DEV_CHECKPOINTS_PATH, 10000, false).catch(() => null);
    return devConfigPromise;
  }

  async function loadSupportedStartDays() {
    if (!supportedStartDaysPromise) supportedStartDaysPromise = Promise.all([loadManifest(), loadDevConfig()]).then(([rows, config]) => {
      const paths = new Set(rows.map((row) => normalizeStoryPath(row && row.path || "")).filter(Boolean));
      const checkpoints = config && config.checkpoints && typeof config.checkpoints === "object" ? config.checkpoints : {};
      return Object.keys(checkpoints).map(Number).filter((day) => {
        const entry = normalizeStoryPath(checkpoints[String(day)]?.entryStory || "");
        return day >= 1 && day <= 20 && entry && paths.has(entry) && rows.some((row) => Number(row && row.day || dayFromPath(row && row.path) || 0) === day);
      }).sort((a, b) => a - b);
    });
    return supportedStartDaysPromise;
  }

  async function storyMetaByOnceKey(opts = {}) {
    const maxDayInclusive = Math.max(0, Math.floor(Number(opts.maxDayInclusive || 0) || 0));
    const cleanRoute = normalizeRoute(opts.route || "") || "";
    const active = new Set(unique(opts.activeCharacters || []));
    const cacheKey = [maxDayInclusive || "all", cleanRoute || "all", Array.from(active).sort().join(",") || "all"].join("|");
    if (storyMetaPromises.has(cacheKey)) return storyMetaPromises.get(cacheKey);
    const promise = (async () => {
      const rows = await loadManifest();
      const out = Object.create(null);
      const candidates = rows.filter((row) => {
        const path = normalizeStoryPath(row && row.path || "");
        if (!path) return false;
        const entryDay = Number(row && row.day || dayFromPath(path) || 0) || 0;
        if (maxDayInclusive > 0 && (!entryDay || entryDay > maxDayInclusive)) return false;
        if (entryDay >= 9) {
          const storyRoute = routeFromPath(path);
          if (storyRoute && cleanRoute && storyRoute !== cleanRoute) return false;
          const owner = token(row && row.contactId || inferContactId(path));
          if (active.size && owner && owner !== "aiden" && owner !== "tutor" && !active.has(owner)) return false;
        }
        return true;
      });
      let cursor = 0;
      const workerCount = Math.min(4, Math.max(1, candidates.length));
      const workers = Array.from({ length: workerCount }, async () => {
        while (cursor < candidates.length) {
          const row = candidates[cursor++];
          const path = normalizeStoryPath(row && row.path || "");
          if (!path) continue;
          let json = null;
          for (let attempt = 0; attempt < 2 && !json; attempt += 1) {
            try { json = await fetchJson(path, 15000, false); } catch {}
          }
          const onceKey = token(json && json.onceKey || "");
          if (!onceKey) continue;
          out[onceKey] = {
            onceKey,
            path,
            contactId: token(row.contactId || json.contactId || inferContactId(path)),
            day: Number(row.day || dayFromPath(path) || 0) || 0,
            order: Number(row.order || 0) || 0,
            title: String(json.title || "").trim()
          };
        }
      });
      await Promise.all(workers);
      return out;
    })();
    storyMetaPromises.set(cacheKey, promise);
    try {
      const out = await promise;
      if (!Object.keys(out).length) storyMetaPromises.delete(cacheKey);
      return out;
    } catch (err) {
      storyMetaPromises.delete(cacheKey);
      throw err;
    }
  }

  function inferContactId(path) {
    const file = String(path || "").split("/").pop() || "";
    const match = file.match(/^DAY\d+_\d+_([A-Z0-9]+)(?:_|\.json)/i);
    return token(match && match[1] || "");
  }

  function dayFromPath(path) {
    const match = String(path || "").match(/DAY(\d+)/i);
    return match ? Number(match[1] || 0) || 0 : 0;
  }

  function routeFromPath(path) {
    const match = String(path || "").toLowerCase().replace(/\\/g, "/").match(/\/(love|ntr|nts)\//);
    return match ? match[1] : "";
  }

  function walkSteps(steps, visitor) {
    const arr = Array.isArray(steps) ? steps : [];
    for (const step of arr) {
      if (!step || typeof step !== "object") continue;
      const stop = visitor(step);
      if (stop === true) return true;
      if (walkSteps(step.then, visitor) === true) return true;
      if (walkSteps(step.else, visitor) === true) return true;
      if (walkSteps(step.steps, visitor) === true) return true;
    }
    return false;
  }

  function isPlayableConversationStory(json, path, contactId) {
    const cid = token(contactId);
    if (!cid || cid === "player" || cid === "system") return false;
    const p = normalizeStoryPath(path).toLowerCase();
    if (!p || p.includes("/dev/") || p.includes("/test/")) return false;

    let hasPlayerFacingConversation = false;
    walkSteps(json && json.steps, (step) => {
      const type = token(step.type || "");
      if (type === "message" || type === "choice" || type === "image" || type === "photo" || type === "video" || type === "media") {
        const from = token(step.from || step.fromId || step.contactId || "");
        if (!from || from === cid || from === "player") {
          hasPlayerFacingConversation = true;
          return true;
        }
      }
      if (type === "notify") {
        const app = token(step.app || step.target || "messages");
        const from = token(step.fromId || step.from || step.contactId || "");
        if ((!app || app === "messages" || app === "conversation") && (!from || from === cid)) {
          hasPlayerFacingConversation = true;
          return true;
        }
      }
      return false;
    });
    return hasPlayerFacingConversation;
  }

  async function resolveStartFromAvailability(setup) {
    const day = Math.max(1, Math.min(20, Number(setup && setup.day || 1) || 1));
    const [rows, config] = await Promise.all([loadManifest(), loadDevConfig()]);
    const selectableCharacters = routeCharactersFor(config || {});
    const configuredRoutes = configuredCharacters(config || {}, "routeOptions", ROUTES).map(normalizeRoute).filter(Boolean);
    const byId = Object.create(null);
    selectableCharacters.forEach((cid) => {
      byId[cid] = {
        id: cid,
        available: false,
        locked: isCharacterLockedForDay(config || {}, cid, day),
        routes: [],
        firstStoryByRoute: {},
        playablePaths: [],
        reason: "no_playable_story_on_selected_day"
      };
    });

    await Promise.all(rows.map(async (row) => {
      const path = normalizeStoryPath(row && row.path || "");
      if (!path) return;
      const entryDay = Number(row && row.day || dayFromPath(path) || 0) || 0;
      if (entryDay !== day) return;
      const entryRoute = routeFromPath(path);

      let json = null;
      try {
        json = await fetchJson(path, 10000, false);
      } catch {
        return;
      }
      const cid = token(row && row.contactId || json && json.contactId || inferContactId(path));
      const record = byId[cid];
      if (!record || !isPlayableConversationStory(json, path, cid)) return;
      const supportedRoutes = entryRoute ? [entryRoute] : (dayRequiresRoute(day) ? configuredRoutes : ["love"]);
      record.available = true;
      record.reason = "";
      record.playablePaths.push(path);
      supportedRoutes.forEach((route) => {
        if (!record.routes.includes(route)) record.routes.push(route);
        if (!record.firstStoryByRoute[route]) record.firstStoryByRoute[route] = path;
      });
    }));

    const available = selectableCharacters.filter((cid) => byId[cid] && byId[cid].available);
    const checkpoint = await resolveCheckpoint(day, setup && setup.route);
    const checkpointPath = normalizeStoryPath(checkpoint.entryStory || "");
    const checkpointListed = rows.some((row) => normalizeStoryPath(row && row.path || "") === checkpointPath);
    return {
      day,
      playable: !!checkpointPath && checkpointListed && (!dayRequiresCharacters(day) || available.length > 0),
      firstStory: checkpointPath,
      available,
      records: byId,
      updatedAt: Date.now()
    };
  }

  async function resolveCharacterAvailability(setup) {
    const matrix = await resolveStartFromAvailability(setup);
    const route = normalizeRoute(setup && setup.route) || "love";
    const available = matrix.available.filter((cid) => matrix.records[cid]?.routes?.includes(route));
    return { ...matrix, route, available, activeCharacters: unique(setup && setup.activeCharacters || []).filter((cid) => available.includes(cid)) };
  }

  async function validateStartFromSetup(setup) {
    const matrix = await resolveStartFromAvailability(setup);
    const activeCharacters = unique(setup && setup.activeCharacters || []);
    const routes = setup && setup.routes && typeof setup.routes === "object" ? setup.routes : {};
    const fallbackRoute = normalizeRoute(setup && setup.route) || "love";
    const invalid = [];
    if (!matrix.playable) invalid.push({ reason: "day_has_no_playable_checkpoint", day: matrix.day });
    if (dayRequiresCharacters(matrix.day) && !activeCharacters.length) invalid.push({ reason: "character_required", day: matrix.day });
    if (dayRequiresCharacters(matrix.day)) activeCharacters.forEach((cid) => {
      const cleanId = token(cid);
      const record = matrix.records[cleanId];
      const route = normalizeRoute(routes[cleanId] || fallbackRoute);
      if (!record || !record.available) invalid.push({ reason: "character_has_no_playable_story", character: cleanId, day: matrix.day });
      // Backend admission mirrors the UI gate (isCharacterLockedForDay):
      // the picker only ever offers a "Code" button for a locked character
      // instead of a checkbox, but that is presentation only. A caller that
      // reaches applyStartFromSetup() directly (or replays a stale/forged
      // selection) must be refused here too, or the UI gate is cosmetic.
      else if (record.locked) invalid.push({ reason: "character_requires_premium_unlock", character: cleanId, day: matrix.day });
      else if (dayRequiresRoute(matrix.day) && !record.routes.includes(route)) invalid.push({ reason: "route_has_no_playable_story", character: cleanId, route, day: matrix.day });
    });
    return { ok: invalid.length === 0, invalid, availability: matrix };
  }

  function isResetKey(key) {
    if (!key || STABLE_EXACT_KEYS.has(key)) return false;
    if (EXACT_RESET_KEYS.has(key)) return true;
    if (/^story_.+_done$/i.test(key)) return true;
    if (/^route_[a-z0-9_]+_locked_v1$/i.test(key)) return true;
    if (/^route_[a-z0-9_]+_lock_day_v1$/i.test(key)) return true;
    return RESET_PREFIXES.some((prefix) => String(key).startsWith(prefix));
  }

  function resetProgression() {
    const removed = [];
    try {
      for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const key = localStorage.key(i);
        if (!isResetKey(key)) continue;
        if (safeRemove(key)) removed.push(key);
      }
    } catch {}
    const game = window.Game || {};
    ["_pendingStory", "pendingStory", "__pendingStory", "_activeRunner", "_activeStoryPath"].forEach((key) => {
      try { delete game[key]; } catch { game[key] = null; }
    });
    try { game._storyRunId = Math.max(0, Number(game._storyRunId) || 0) + 1; } catch {}
    try { game._timeCardBusy = false; } catch {}
    try { game._cinematicLock = false; } catch {}
    return removed;
  }

  function markOnce(onceKey, metaByOnce) {
    const key = token(onceKey);
    if (!key) return false;
    // Canonical once-key authority (progression.onceKeys via MARK_ONCE) --
    // onceDone()'s own read order in convo-runtime.js already checks this
    // before falling back to the legacy once_/__once: keys, so dispatching
    // here makes those two legacy writes redundant rather than required.
    if (window.Game && typeof window.Game.markOnce === "function") {
      window.Game.markOnce(key);
    }
    safeSet("story_" + key + "_done", "1");
    const meta = metaByOnce && metaByOnce[key] ? metaByOnce[key] : null;
    const contactId = token(meta && meta.contactId || "");
    if (contactId) {
      // conv_done_<contactId>_<key> was the only production writer of this
      // key (every other match in the repo is QA test-fixture setup, not
      // real code). Its four independent readers (notify-adapter.js,
      // home.html, pictures.html, story.html) now all check canonical
      // progression.onceKeys first -- window.Game.markOnce(key) above already
      // records the exact same fact canonically, making this legacy write
      // redundant rather than required.
      safeSet("conv_episode_done_" + contactId + "_" + key, "1");
      if (meta.path) safeSet("conv_story_" + contactId, meta.path);
    }
    return true;
  }

  async function collectPreviousBaselineOnceKeys(day, metaByOnce) {
    const rows = await loadManifest();
    const keys = [];
    const metas = Object.values(metaByOnce || {});
    rows.forEach((row) => {
      const entryDay = Number(row && row.day || dayFromPath(row && row.path) || 0) || 0;
      if (!entryDay || entryDay >= day || entryDay >= 9) return;
      const path = normalizeStoryPath(row && row.path || "");
      const hit = metas.find((meta) => meta.path === path);
      if (hit && hit.onceKey) keys.push(hit.onceKey);
    });
    return unique(keys);
  }

  function routeAliasFor(config, cid, route) {
    const cleanRoute = normalizeRoute(route) || "love";
    const aliases = config && config.routeAliases && config.routeAliases[cid] ? config.routeAliases[cid] : null;
    return aliases && aliases[cleanRoute] ? String(aliases[cleanRoute]) : cleanRoute;
  }

  function routeDisplayFor(config, cid, stored) {
    const raw = token(stored || "");
    if (!raw || raw === "disabled") return raw || "love";
    const aliases = config && config.routeAliases && config.routeAliases[cid] ? config.routeAliases[cid] : null;
    if (aliases) {
      for (const route of Object.keys(aliases)) {
        if (token(aliases[route]) === raw) return token(route);
      }
    }
    if (raw.indexOf("nts") === 0) return "nts";
    if (raw === "ntr") return "ntr";
    return "love";
  }

  function collectRouteLockOnceKeys(config, route, routes, activeCharacters) {
    const map = config && config.routeLockOnceKeys && typeof config.routeLockOnceKeys === "object" ? config.routeLockOnceKeys : {};
    const keys = [];
    const active = new Set(unique(activeCharacters || []));
    const selectedRoutes = routes && typeof routes === "object" ? routes : {};
    Object.keys(map).forEach((cid) => {
      if (active.size && !active.has(cid)) return;
      const byRoute = map[cid] || {};
      const key = byRoute[normalizeRoute(selectedRoutes[cid]) || normalizeRoute(route) || "love"];
      if (key) keys.push(key);
    });
    return unique(keys);
  }

  function collectRouteProgressionOnceKeys(config, day, route) {
    const map = config && config.routeProgressionByDay && typeof config.routeProgressionByDay === "object" ? config.routeProgressionByDay : {};
    const cleanRoute = normalizeRoute(route) || "love";
    const keys = [];
    for (let d = 9; d < Number(day || 0); d += 1) {
      const rows = map[String(d)] || {};
      if (Array.isArray(rows[cleanRoute])) keys.push(...rows[cleanRoute]);
    }
    return unique(keys);
  }

  function collectConfiguredRouteProgressionOnceKeys(config, day, route, activeCharacters, metaByOnce) {
    const keys = collectRouteProgressionOnceKeys(config, day, route);
    const active = new Set(unique(activeCharacters || []));
    if (!active.size) return keys;
    return keys.filter((key) => {
      const meta = metaByOnce && metaByOnce[token(key)] ? metaByOnce[token(key)] : null;
      const cid = token(meta && meta.contactId || "");
      if (!cid || cid === "tutor") return true;
      return active.has(cid);
    });
  }

  async function collectNaturalRouteProgressionOnceKeys(config, day, route, activeCharacters, metaByOnce) {
    const targetDay = Number(day || 0) || 0;
    if (targetDay <= 9) return [];
    const resolver = window.UpdateSafetyResolver;
    if (!resolver || typeof resolver.firstReachableTransition !== "function" || typeof resolver.resolveContinuation !== "function") {
      return collectConfiguredRouteProgressionOnceKeys(config, targetDay, route, activeCharacters, metaByOnce);
    }

    const activeSet = new Set(unique(activeCharacters || []));
    const cleanRoute = normalizeRoute(route) || "love";
    const keys = [];
    const completed = new Set();
    const visited = new Set();
    let path = "story/DAY9/DAY9_00_AIDEN_CHECKIN.json";
    routeSimulationPlayedPaths = new Set();
    let routeMap = null;
    try {
      routeMap = await fetchJson("story/character_route_map.json");
    } catch {
      return collectConfiguredRouteProgressionOnceKeys(config, targetDay, cleanRoute, activeCharacters, metaByOnce);
    }

    const opts = {
      day: 9,
      route: cleanRoute,
      activeCharacters: Array.from(activeSet),
      activeSet,
      routeAliases: config && config.routeAliases || {},
      loadStoryJson: fetchJson,
      isCharacterDisabled: (id) => {
        const clean = token(id);
        if (isCharacterLockedForDay(config || {}, clean, targetDay)) return true;
        return !!clean && clean !== "tutor" && !activeSet.has(clean);
      },
      isCharacterActive: (id) => activeSet.has(token(id)),
      getRouteForCharacter: (id) => routeAliasFor(config, token(id), window.CharacterRoutes?.get?.(token(id), { persistInherited: false }) || cleanRoute),
      inferContactId: (json, storyPath) => token(json && json.contactId || inferContactId(storyPath))
    };

    for (let hops = 0; path && hops < 160; hops += 1) {
      path = normalizeStoryPath(path);
      if (!path) break;
      const currentDay = dayFromPath(path);
      if (currentDay >= targetDay) break;

      let json = null;
      try {
        json = await fetchJson(path);
      } catch {
        routeSimulationPlayedPaths = null;
        return collectConfiguredRouteProgressionOnceKeys(config, targetDay, cleanRoute, activeCharacters, metaByOnce);
      }
      const visitedPath = lastResolvedFetchPath || path;
      if (visited.has(visitedPath)) break;
      visited.add(visitedPath);
      if (lastResolvedFetchPath) routeSimulationPlayedPaths.add(lastResolvedFetchPath);
      const onceKey = token(json && json.onceKey || "");
      if (currentDay >= 9 && onceKey) {
        keys.push(onceKey);
        completed.add(onceKey);
      }

      const transition = resolver.firstReachableTransition(json, opts);
      const rawNext = normalizeStoryPath((transition && transition.startStory) || json.onCompleteStartStory || "");
      if (!rawNext) break;
      const resolved = await resolver.resolveContinuation(rawNext, {
        ...opts,
        routeMap,
        currentStoryPath: path,
        characterIds: SELECTABLE_CHARACTERS,
        isStoryComplete: (candidateJson) => completed.has(token(candidateJson && candidateJson.onceKey || "")),
        canAccessStory: () => true,
        markStoryComplete: (candidateJson) => {
          const key = token(candidateJson && candidateJson.onceKey || "");
          if (key) completed.add(key);
        }
      });
      if (!resolved || !resolved.ok || !resolved.path) break;
      path = normalizeStoryPath(resolved.path);
    }

    routeSimulationPlayedPaths = null;
    return unique(keys);
  }

  async function collectEntryRequirementOnceKeys(entryStory, route, completedOnceKeys) {
    const path = normalizeStoryPath(entryStory || "");
    if (!path) return [];
    let json = null;
    try {
      json = await fetchJson(path);
    } catch {
      return [];
    }
    const raw = String(json && json.requireOnceKey || "").trim();
    if (!raw) return [];
    const parts = unique(raw.split("|").map(token).filter(Boolean));
    if (!parts.length) return [];

    const done = new Set(unique(completedOnceKeys || []).map(token));
    if (parts.some((key) => done.has(key))) return [];

    const cleanRoute = normalizeRoute(route) || "love";
    const routeMatch = parts.find((key) => key.includes("_" + cleanRoute + "_") || key.endsWith("_" + cleanRoute + "_v1"));
    return [routeMatch || parts[0]];
  }

  function collectCurrentRouteProgressionOnceKeys(config, day, route) {
    const map = config && config.routeProgressionByDay && typeof config.routeProgressionByDay === "object" ? config.routeProgressionByDay : {};
    const cleanRoute = normalizeRoute(route) || "love";
    const rows = map[String(Number(day || 0) || 0)] || {};
    return unique(Array.isArray(rows[cleanRoute]) ? rows[cleanRoute] : []);
  }

  function unique(list) {
    const out = [];
    const seen = new Set();
    (Array.isArray(list) ? list : []).forEach((raw) => {
      const value = token(raw);
      if (!value || seen.has(value)) return;
      seen.add(value);
      out.push(value);
    });
    return out;
  }

  // Canonical active-character authority (world.activeCharacters via
  // SET_ACTIVE_CHARACTER) -- readCharacterActiveFlag() in convo-runtime.js
  // already checks this array FIRST and only falls back to the legacy
  // active_character:<id> key when the canonical array is absent, so the
  // legacy write becomes dead weight once this is dispatched.
  function dispatchActiveCharacter(cid, active) {
    const engine = window.GameStateEngine;
    if (!engine) return;
    const state = engine.getState();
    engine.dispatch({
      type: "SET_ACTIVE_CHARACTER",
      commandId: `start-from-active:${cid}:${state.revision}`,
      expectedRevision: state.revision,
      payload: { contactId: cid, active }
    });
  }

  function writeActiveCharacters(selected, config, aidenActive = true) {
    const set = new Set(unique(selected || []));
    if (aidenActive) set.add("aiden");
    const activeIds = [];
    activeCharactersFor(config || {}).forEach((cid) => {
      const active = cid === "aiden" ? aidenActive : set.has(cid);
      dispatchActiveCharacter(cid, active);
      if (active && cid !== "aiden") activeIds.push(cid);
    });
    dispatchActiveCharacter("aiden", aidenActive);
    const targets = {};
    activeCharactersFor(config || {}).forEach((cid) => {
      if (cid !== "aiden") targets[cid] = activeIds.includes(cid);
    });
    const engine = window.GameStateEngine;
    if (engine) {
      const state = engine.getState();
      const committed = engine.dispatch({ type: "SET_HAK_WATCHLIST", commandId: `start-from-watchlist:${state.revision}`, expectedRevision: state.revision, payload: { operationId: `start-from-watchlist:${state.playthrough?.id || "playthrough"}`, selected: activeIds, targets, availableTargetIds: Object.keys(targets), syncActiveCharacters: true, visible: true } });
      if (!committed.ok && committed.status !== "DUPLICATE_COMMAND") throw new Error(committed.status);
    }
    return activeIds;
  }

  function writeMasonVariant(value) {
    const raw = token(value);
    if (raw !== "male" && raw !== "female") throw new Error("Mason requires an explicit story variant");
    const variant = raw;
    try {
      if (window.Game && typeof window.Game.setCharacterVariant === "function") {
        const applied = window.Game.setCharacterVariant("mason", variant);
        if (applied) return normalizeMasonVariant(applied);
      }
    } catch {}
    safeSet(MASON_VARIANT_KEY, variant);
    const avatar = variant === "female" ? "assets/avatars/female_mason.jpg" : "assets/avatars/male_mason.jpg";
    try {
      // scripts/notify-adapter.js is the declared single source of truth for
      // the conversations store (progression.conversationsCache).
      const store = window.Game.readConversationStore();
      if (store && typeof store === "object") {
        const prev = store.mason && typeof store.mason === "object" ? store.mason : {};
        store.mason = { ...prev, id: "mason", contactId: "mason", avatar };
        window.Game.writeConversationStoreRaw(store);
      }
    } catch {}
    try { window.dispatchEvent(new CustomEvent("contact:avatar-updated", { detail: { id: "mason", avatar } })); } catch {}
    try { window.dispatchEvent(new Event("game:conversations-updated")); } catch {}
    try { window.dispatchEvent(new CustomEvent("character-variant:changed", { detail: { id: "mason", value: variant } })); } catch {}
    return variant;
  }

  function defaultContactName(id) {
    const cid = token(id);
    if (!cid) return "Unknown";
    return cid.split("_").filter(Boolean).map((part) => part ? (part[0].toUpperCase() + part.slice(1).toLowerCase()) : "").join(" ");
  }

  function defaultContactAvatar(id, masonVariant) {
    const cid = token(id);
    if (!cid) return "assets/avatars/default.jpg";
    if (cid === "mason") return normalizeMasonVariant(masonVariant) === "female" ? "assets/avatars/female_mason.jpg" : "assets/avatars/male_mason.jpg";
    return `assets/avatars/${cid}.jpg`;
  }

  function seedStartFromConversationMeta(ids, masonVariant) {
    const wanted = unique(ids || []).filter(Boolean);
    if (!wanted.length) return [];
    // scripts/notify-adapter.js is the declared single source of truth for
    // the conversations store (progression.conversationsCache).
    const store = window.Game.readConversationStore();
    const seeded = [];
    wanted.forEach((id) => {
      const cid = token(id);
      if (!cid) return;
      const prev = store && typeof store[cid] === "object" ? store[cid] : {};
      const avatar = defaultContactAvatar(cid, masonVariant);
      store[cid] = {
        ...prev,
        id: cid,
        contactId: cid,
        name: String(prev.name || "").trim() || defaultContactName(cid),
        avatar,
        messages: Array.isArray(prev.messages) ? prev.messages : []
      };
      seeded.push({ id: cid, avatar });
    });
    window.Game.writeConversationStoreRaw(store);
    try { window.dispatchEvent(new Event("game:conversations-updated")); } catch {}
    seeded.forEach((row) => {
      try { window.dispatchEvent(new CustomEvent("contact:avatar-updated", { detail: row })); } catch {}
    });
    return seeded;
  }

  function writeRouteLocks(config, routes, activeCharacters) {
    const selectedRoutes = routes && typeof routes === "object" ? routes : {};
    const active = new Set(unique(activeCharacters || []));
    const locked = {};
    const primary = normalizeRoute(selectedRoutes[Array.from(active)[0]]) || "love";
    safeSet("route_global_locked_v1", primary);
    ["lena", "evelyn", "mason", "hailey"].forEach((cid) => {
      if (!active.has(cid)) return;
      const cleanRoute = normalizeRoute(selectedRoutes[cid]) || primary;
      const stored = routeAliasFor(config, cid, cleanRoute);
      safeSet("route_" + cid + "_locked_v1", stored);
      safeSet("route_" + cid + "_lock_day_v1", "8");
      try { window.CharacterRoutes?.set?.(cid, cleanRoute, { storedRoute: stored, lockDay: 8 }); } catch {}
      locked[cid] = stored;
    });
    return locked;
  }

  function writeRoutePoints(points) {
    const normalized = normalizePoints(points || {});
    // CheckpointStateBuilder receives this exact object during initialization;
    // compatibility storage is projected afterward by EngineStorage.
    return normalized;
  }

  function makeAwardKey(row, selected) {
    const scope = token(row.onceKey || "");
    const choiceKey = token(row.choiceKey || "");
    const optionId = token(selected && selected.optionId || "");
    if (!choiceKey || !optionId) return "";
    return (scope || "global") + "::" + choiceKey + "::" + optionId;
  }

  function writeAssumedPointAwards(day, route, context = {}) {
    const awards = {};
    const choices = [];
    const cleanRoute = normalizeRoute(route) || "love";
    BASELINE_POINT_CHOICES.forEach((row) => {
      if (!row || Number(row.day || 0) >= Number(day || 0)) return;
      if (row.route && normalizeRoute(row.route) !== cleanRoute) return;
      const selected = row.byRoute && row.byRoute[cleanRoute];
      if (!selected) return;
      const key = makeAwardKey(row, selected);
      if (!key) return;
      const requested = normalizePoints(selected.points || {});
      awards[key] = {
        at: Date.now(),
        storyPath: "",
        storyOnceKey: String(row.onceKey || ""),
        contactId: "",
        choiceKey: String(row.choiceKey || ""),
        optionId: String(selected.optionId || ""),
        requested,
        applied: requested
      };
      choices.push({
        at: Date.now(),
        choiceKey: String(row.choiceKey || ""),
        optionId: String(selected.optionId || ""),
        text: String(selected.optionId || ""),
        storyOnceKey: String(row.onceKey || ""),
        points: requested
      });
    });
    const historical = window.BranchStateContracts?.resolveScenario?.({
      day,
      route: cleanRoute,
      activeCharacters: context.activeCharacters || [],
      aidenActive: context.aidenActive,
      historicalChoices: context.historicalChoices || {}
    }) || [];
    historical.forEach((resolved) => {
      const optionId = resolved.optionId;
      const choiceKey = resolved.choiceKey;
      const storyOnceKey = resolved.storyOnceKey;
      const requested = normalizePoints(resolved.points || {});
      const key = `${token(storyOnceKey)}::${token(choiceKey)}::${token(optionId)}`;
      if (requested.love || requested.ntr || requested.nts) awards[key] = {
        at: Date.now(),
        storyPath: resolved.storyPath,
        storyOnceKey,
        contactId: resolved.contactId,
        choiceKey,
        optionId,
        requested,
        applied: requested
      };
      choices.push({
        at: Date.now(),
        contactId: resolved.contactId,
        storyPath: resolved.storyPath,
        storyOnceKey,
        choiceKey,
        optionId,
        text: optionId,
        points: requested
      });
    });
    safeSet("route_point_awards_v1", JSON.stringify(awards));
    // Canonical, ordered choice-history authority (progression.choicesLog via
    // RECORD_CHOICE_LOG_ENTRY) -- one dispatch per simulated choice instead
    // of one bulk localStorage write, so "Start From" produces the exact
    // same canonical record shape a real playthrough would. Entries with no
    // identifiable choiceKey/optionId are skipped (the command itself
    // requires both -- such an entry could never be resolved by
    // wasChoicePicked/latestChoiceOptionId/buildChapterBranchKey anyway).
    const engine = window.GameStateEngine;
    if (engine) {
      choices.forEach((entry) => {
        const choiceKey = String(entry.choiceKey || "").trim();
        const optionId = String(entry.optionId || "").trim();
        if (!choiceKey || !optionId) return;
        const s = engine.getState();
        engine.dispatch({
          type: "RECORD_CHOICE_LOG_ENTRY",
          commandId: `start-from-choice-log:${choiceKey}:${optionId}:${s.revision}`,
          expectedRevision: s.revision,
          payload: {
            at: entry.at,
            contactId: entry.contactId || "",
            storyPath: entry.storyPath || "",
            storyOnceKey: entry.storyOnceKey || "",
            choiceKey,
            optionId,
            text: entry.text || "",
            points: entry.points || null
          }
        });
      });
    }
    return { awardCount: Object.keys(awards).length, choiceCount: choices.length };
  }

  function writeReplayEntries(completedOnceKeys, metaByOnce) {
    const now = Date.now();
    const rows = [];
    unique(completedOnceKeys).forEach((key) => {
      const meta = metaByOnce && metaByOnce[token(key)] ? metaByOnce[token(key)] : null;
      if (!meta || !meta.path || !meta.contactId) return;
      const slotId = "start_from_replay::" + meta.contactId + "::" + token(meta.onceKey);
      rows.push({
        id: slotId,
        slotId,
        contactId: meta.contactId,
        characterId: meta.contactId,
        storyPath: meta.path,
        storyOnceKey: meta.onceKey,
        title: meta.title || "Replay point",
        day: meta.day,
        order: meta.order,
        createdAt: now,
        updatedAt: now
      });
    });
    safeSet("story_replays_v1", JSON.stringify(rows));
    try { window.dispatchEvent(new Event("game:story-replays-updated")); } catch {}
    return rows.length;
  }

  async function reconstructMeetAndGreetFromCompletedStories(completedOnceKeys, metaByOnce, opts = {}) {
    const api = window.MeetAndGreetSystem;
    if (!api || typeof api.executeStep !== "function") return { actionCount: 0, storyCount: 0, skipped: true };
    try { api.clearState?.(); } catch {}

    const keys = unique(completedOnceKeys || []).map(token).filter(Boolean);
    const maxDayExclusive = Math.max(0, Math.floor(Number(opts.maxDayExclusive || 0) || 0));
    const sourceMetas = maxDayExclusive > 0
      ? Object.values(metaByOnce || {}).filter((meta) => (
          meta &&
          Number(meta.day || dayFromPath(meta.path) || 0) > 0 &&
          Number(meta.day || dayFromPath(meta.path) || 0) < maxDayExclusive
        ))
      : keys.map((key) => metaByOnce && metaByOnce[key] ? metaByOnce[key] : null);
    const metas = sourceMetas
      .filter((meta) => meta && normalizeStoryPath(meta.path) && routeFromPath(meta.path) === "nts")
      .filter((meta) => token(meta.contactId || inferContactId(meta.path)) === "evelyn")
      .sort((a, b) => {
        const dayDelta = (Number(a.day || dayFromPath(a.path) || 0) || 0) - (Number(b.day || dayFromPath(b.path) || 0) || 0);
        if (dayDelta) return dayDelta;
        const orderDelta = (Number(a.order || 0) || 0) - (Number(b.order || 0) || 0);
        if (orderDelta) return orderDelta;
        return String(a.path || "").localeCompare(String(b.path || ""));
      });

    let actionCount = 0;
    let storyCount = 0;
    for (const meta of metas) {
      let json = null;
      try { json = await fetchJson(normalizeStoryPath(meta.path)); } catch { continue; }
      let storyHadAction = false;
      walkSteps(json && json.steps, (step) => {
        const type = token(step && step.type || "");
        if (!type || !api.isActionType?.(type)) return false;
        api.executeStep(step, { reconstruct: true, allowReplayWrite: true, source: "start_from", storyPath: meta.path, onceKey: meta.onceKey });
        actionCount += 1;
        storyHadAction = true;
        return false;
      });
      if (storyHadAction) storyCount += 1;
    }
    return { actionCount, storyCount, skipped: false, maxDayExclusive };
  }

  function evaluateReplayCondition(raw, ctx = {}) {
    const condition = String(raw || "").trim();
    if (!condition) return false;
    if (/^not\s+/i.test(condition)) return !evaluateReplayCondition(condition.replace(/^not\s+/i, "").trim(), ctx);
    if (condition.startsWith("!")) return !evaluateReplayCondition(condition.slice(1), ctx);

    const sep = condition.indexOf(":");
    const head = token(sep >= 0 ? condition.slice(0, sep) : condition);
    const tail = token(sep >= 0 ? condition.slice(sep + 1) : "");
    const parts = tail.split(/[|,]/).map(token).filter(Boolean);
    if (head === "all") return parts.length > 0 && parts.every((part) => evaluateReplayCondition(part, ctx));
    if (head === "any") return parts.some((part) => evaluateReplayCondition(part, ctx));
    if (head === "active_character") return !!(tail && ctx.activeSet && ctx.activeSet.has(tail));

    const routeMatch = head.match(/^route_([a-z0-9_]+)_locked_v1$/);
    if (routeMatch) {
      const stored = token(ctx.routeLocks && ctx.routeLocks[routeMatch[1]] || "");
      if (!tail) return !!stored;
      if (tail === "nts") return stored === "nts" || stored.indexOf("nts") === 0;
      if (tail === "love") return !stored || stored === "love";
      return stored === tail;
    }

    return safeGet(head) === "1" || (!!tail && token(safeGet(head) || "") === tail);
  }

  function walkReachableSteps(steps, visitor, ctx = {}) {
    const arr = Array.isArray(steps) ? steps : [];
    for (const step of arr) {
      if (!step || typeof step !== "object") continue;
      const type = token(step.type || "");
      if (type === "if") {
        const branch = evaluateReplayCondition(step.condition, ctx) ? step.then : step.else;
        if (walkReachableSteps(branch, visitor, ctx) === true) return true;
        continue;
      }
      const stop = visitor(step);
      if (stop === true) return true;
      if (walkReachableSteps(step.steps, visitor, ctx) === true) return true;
    }
    return false;
  }

  function sortedCompletedMetas(completedOnceKeys, metaByOnce, opts = {}) {
    const keys = new Set(unique(completedOnceKeys || []).map(token));
    const maxDayExclusive = Math.max(0, Math.floor(Number(opts.maxDayExclusive || 0) || 0));
    const cleanRoute = normalizeRoute(opts.route || "") || "";
    return Object.values(metaByOnce || {})
      .filter((meta) => {
        if (!meta || !keys.has(token(meta.onceKey || ""))) return false;
        const metaDay = Number(meta.day || dayFromPath(meta.path) || 0) || 0;
        if (maxDayExclusive > 0 && (!metaDay || metaDay >= maxDayExclusive)) return false;
        const storyRoute = routeFromPath(meta.path || "");
        if (storyRoute && cleanRoute && storyRoute !== cleanRoute) return false;
        return true;
      })
      .sort((a, b) => {
        const dayDelta = (Number(a.day || dayFromPath(a.path) || 0) || 0) - (Number(b.day || dayFromPath(b.path) || 0) || 0);
        if (dayDelta) return dayDelta;
        const orderDelta = (Number(a.order || 0) || 0) - (Number(b.order || 0) || 0);
        if (orderDelta) return orderDelta;
        return String(a.path || "").localeCompare(String(b.path || ""));
      });
  }

  async function reconstructOnlyFunFromCompletedStories(day, route, completedOnceKeys, metaByOnce, activeIds, routeLocks) {
    const api = window.ConvoRuntime;
    if (!api || typeof api.installOnlyfunFromStory !== "function" || typeof api.executeOnlyfunStepForReconstruction !== "function") {
      return { installed: false, actionCount: 0, storyCount: 0, skipped: true };
    }

    const targetDay = Math.max(1, Math.min(20, Number(day || 1) || 1));
    if (targetDay <= 1) return { installed: false, actionCount: 0, storyCount: 0, skipped: false };

    await api.installOnlyfunFromStory({ source: "start_from", signedIn: true });

    const ctx = {
      route: normalizeRoute(route) || "love",
      activeSet: new Set(unique(activeIds || [])),
      routeLocks: routeLocks || {}
    };
    let actionCount = 0;
    let storyCount = 0;
    const postOnceKeys = [];
    const accountUnlocks = [];
    const metas = sortedCompletedMetas(completedOnceKeys, metaByOnce, { maxDayExclusive: targetDay, route: ctx.route });
    for (const meta of metas) {
      let json = null;
      try { json = await fetchJson(normalizeStoryPath(meta.path)); } catch { continue; }
      let storyHadAction = false;
      walkReachableSteps(json && json.steps, (step) => {
        const type = token(step && step.type || "");
        if (type !== "onlyfun_post" && type !== "onlyfun_account_unlock") return false;
        const result = api.executeOnlyfunStepForReconstruction(step, {
          source: "start_from",
          storyPath: meta.path,
          storyOnceKey: meta.onceKey,
          stepIndex: actionCount,
          reconstruct: true,
          suppressNotify: true
        }) || {};
        if (result.handled) {
          actionCount += 1;
          storyHadAction = true;
          if (type === "onlyfun_post" && step.onceKey) postOnceKeys.push(token(step.onceKey));
          if (type === "onlyfun_account_unlock") accountUnlocks.push(token(step.creatorId || step.creator || step.authorId || step.accountId || step.id));
        }
        return false;
      }, ctx);
      if (storyHadAction) storyCount += 1;
    }
    try { api.recomputeOnlyfunBadgeFromStorage?.(); } catch {}
    return {
      installed: safeGet("feature_onlyfun_unlocked") === "1",
      signedIn: safeGet("onlyfun_signed_in") === "1",
      actionCount,
      storyCount,
      postOnceKeys: unique(postOnceKeys),
      accountUnlocks: unique(accountUnlocks),
      skipped: false
    };
  }

  async function reconstructHakFromCompletedStories(day, route, completedOnceKeys, metaByOnce, activeIds, routeLocks) {
    const api = window.ConvoRuntime;
    if (!api || (typeof api.addHakEvidence !== "function" && typeof api.addHakPhoto !== "function")) {
      return { actionCount: 0, storyCount: 0, skipped: true };
    }
    const ctx = {
      route: normalizeRoute(route) || "love",
      activeSet: new Set(unique(activeIds || [])),
      routeLocks: routeLocks || {}
    };
    let actionCount = 0;
    let storyCount = 0;
    const metas = sortedCompletedMetas(completedOnceKeys, metaByOnce, { maxDayExclusive: day, route: ctx.route });
    for (const meta of metas) {
      let json = null;
      try { json = await fetchJson(normalizeStoryPath(meta.path)); } catch { continue; }
      let storyHadAction = false;
      walkReachableSteps(json && json.steps, (step) => {
        const type = token(step && step.type || "");
        if (type === "hak_add_evidence" && typeof api.addHakEvidence === "function") {
          api.addHakEvidence({ ...step, notifyText: "" });
          actionCount += 1;
          storyHadAction = true;
        } else if ((type === "hak_photo" || type === "hak_evidence") && typeof api.addHakPhoto === "function") {
          api.addHakPhoto(step);
          actionCount += 1;
          storyHadAction = true;
        }
        return false;
      }, ctx);
      if (storyHadAction) storyCount += 1;
    }
    return { actionCount, storyCount, skipped: false };
  }

  async function resolveCheckpoint(day, route) {
    const config = await loadDevConfig();
    const checkpoints = config && config.checkpoints && typeof config.checkpoints === "object" ? config.checkpoints : {};
    const entry = checkpoints[String(day)] || {};
    const cleanRoute = normalizeRoute(route || "") || "";
    const entryByRoute = entry.entryStoryByRoute && typeof entry.entryStoryByRoute === "object" ? entry.entryStoryByRoute : {};
    const requiredByRoute = entry.requiredRoutesByRoute && typeof entry.requiredRoutesByRoute === "object" ? entry.requiredRoutesByRoute : {};
    return {
      config,
      entryStory: normalizeStoryPath(entryByRoute[cleanRoute] || entry.entryStory || ("story/DAY" + day + "/DAY" + day + "_00_AIDEN_SHARED.json")),
      requiredActiveCharacters: unique(entry.requiredActiveCharacters || []),
      requiredRoutes: requiredByRoute[cleanRoute] && typeof requiredByRoute[cleanRoute] === "object"
        ? { ...requiredByRoute[cleanRoute] }
        : (entry.requiredRoutes && typeof entry.requiredRoutes === "object" ? { ...entry.requiredRoutes } : {})
    };
  }

  function startCandidateMap(metaByOnce) {
    const out = Object.create(null);
    Object.keys(metaByOnce || {}).forEach((key) => {
      const meta = metaByOnce[key];
      if (!meta || !meta.onceKey || !meta.path) return;
      out[token(meta.onceKey)] = {
        onceKey: token(meta.onceKey),
        path: normalizeStoryPath(meta.path),
        contactId: token(meta.contactId || inferContactId(meta.path)),
        day: Number(meta.day || dayFromPath(meta.path) || 0) || 0,
        order: Number(meta.order || 0) || 0
      };
    });
    return out;
  }

  async function resolveStartEntry(config, day, route, activeCharacters, primaryCharacter, fallbackStory, completedOnceKeys, metaByOnce) {
    const resolver = window.UpdateSafetyResolver;
    const activeSet = new Set(unique(activeCharacters || []));
    const cleanRoute = normalizeRoute(route) || "love";
    const skippedKeys = [];
    let path = normalizeStoryPath(fallbackStory || "");
    const primary = token(primaryCharacter || "");
    const activeList = Array.from(activeSet);
    const preferredContact = primary || (activeList.length === 1 ? activeList[0] : "");
    const fallbackOwner = token(inferContactId(path));
    const preserveSharedDayEntry = fallbackOwner === "aiden" && activeSet.has("aiden") && Number(day || 0) >= 10 && preferredContact !== "evelyn";

    if (Number(day || 0) < 9 && !preserveSharedDayEntry && preferredContact && activeSet.has(preferredContact)) {
      const direct = Object.values(metaByOnce || {})
        .filter((meta) => {
          if (!meta || token(meta.contactId || "") !== preferredContact) return false;
          if (Number(meta.day || 0) !== Number(day || 0)) return false;
          const storyRoute = routeFromPath(meta.path || "");
          return !storyRoute || storyRoute === cleanRoute;
        })
        .sort((a, b) => (Number(a.order || 0) || 0) - (Number(b.order || 0) || 0))[0];
      if (direct && direct.path) {
        const directPath = normalizeStoryPath(direct.path);
        return {
          ok: true,
          path: directPath,
          contactId: preferredContact,
          choices: [],
          selected: { path: directPath, contactId: preferredContact, onceKey: direct.onceKey || "", seedOnceKeys: [] },
          seedOnceKeys: [],
          reason: primary ? "primary_character_day_entry" : "single_active_character_day_entry"
        };
      }
    }

    if (resolver && typeof resolver.firstReachableTransition === "function") {
      const shouldFilterCharacters = dayRequiresCharacters(day);
      const opts = {
        day,
        route: cleanRoute,
        activeCharacters: Array.from(activeSet),
        activeSet,
        routeAliases: config && config.routeAliases || {},
        loadStoryJson: fetchJson,
        isCharacterDisabled: (id) => {
          if (!shouldFilterCharacters) return false;
          const clean = token(id);
          if (isCharacterLockedForDay(config || {}, clean, day)) return true;
          return !!clean && clean !== "tutor" && !activeSet.has(clean);
        },
        isCharacterActive: (id) => shouldFilterCharacters ? activeSet.has(token(id)) : true,
        getRouteForCharacter: (id) => routeAliasFor(config, token(id), window.CharacterRoutes?.get?.(token(id), { persistInherited: false }) || cleanRoute),
        inferContactId: (json, storyPath) => token(json && json.contactId || inferContactId(storyPath))
      };
      const seen = new Set();
      for (let hops = 0; path && hops < 64; hops += 1) {
        path = normalizeStoryPath(path);
        if (!path || seen.has(path)) break;
        seen.add(path);
        let json = null;
        try {
          json = await fetchJson(path);
        } catch {
          break;
        }
        const owner = token(json && json.contactId || inferContactId(path));
        const disabled = opts.isCharacterDisabled(owner);
        if (!disabled) break;
        const onceKey = token(json && json.onceKey || "");
        if (onceKey) skippedKeys.push(onceKey);
        const transition = resolver.firstReachableTransition(json, opts);
        path = normalizeStoryPath((transition && transition.startStory) || json.onCompleteStartStory || "");
      }
    }

    return {
      ok: !!path,
      path,
      contactId: "",
      choices: [],
      selected: { path, contactId: "", onceKey: "", seedOnceKeys: [] },
      seedOnceKeys: unique(skippedKeys),
      reason: skippedKeys.length ? "canonical_first_valid_after_disabled_skip" : "canonical_checkpoint"
    };
  }

  async function applyStartFromSetup(setup) {
    const canonicalDay = Math.max(1, Math.min(20, Number(setup.day || 1) || 1));
    const validation = await validateStartFromSetup({ ...setup, day: canonicalDay });
    if (!validation.ok) {
      const err = new Error("Invalid Start From selection: " + validation.invalid.map((row) => row.reason).join(", "));
      err.code = "INVALID_START_FROM_SELECTION";
      err.validation = validation;
      throw err;
    }
    // An explicit Start From reconstructs a new playthrough. Retire only
    // playthrough-scoped legacy projections left by old builds before the
    // new canonical checkpoint is installed. Save slots and account/meta
    // progression are deliberately outside resetProgression's key set.
    resetProgression();
    const selectedRoutes = Object.fromEntries(Object.entries(setup.routes && typeof setup.routes === "object" ? setup.routes : {}).map(([cid, route]) => [token(cid), normalizeRoute(route)]).filter(([, route]) => !!route));
    const requestedRoute = normalizeRoute(selectedRoutes.hailey) || normalizeRoute(setup.route) || Object.values(selectedRoutes).find(Boolean) || "love";
    const canonicalCheckpoint = await resolveCheckpoint(canonicalDay, requestedRoute);
    const canonicalRoutes = {
      ...(canonicalCheckpoint.requiredRoutes || {}),
      ...selectedRoutes
    };
    const canonicalRoute = normalizeRoute(canonicalRoutes.hailey) || requestedRoute || Object.values(canonicalRoutes).map(normalizeRoute).find(Boolean) || "love";
    let canonicalStartStory = normalizeStoryPath(canonicalCheckpoint.entryStory || "");
    const canonicalBefore = window.GameStateEngine.getState();
    const startFromGeneration = Math.max(1, Number(canonicalBefore.playthrough?.generation) || 1) + 1;
    const startFromResetAt = Date.now();
    const startFromTransactionId = `start-from:${canonicalDay}:${canonicalRoute}:${String(setup.masonVariant || "male")}:${startFromGeneration}:${startFromResetAt}`;
    const canonicalBuilder = new window.CheckpointStateBuilder({ nodes: await loadStoryGraphManifest() });
    const canonicalActiveCharacters = unique([...(setup.activeCharacters || []), ...(canonicalCheckpoint.requiredActiveCharacters || []), ...(setup.aidenActive === false ? [] : ["aiden"])]);
    const canonicalHakSelected = canonicalActiveCharacters.filter((id) => id !== "aiden");
    const canonicalState = canonicalBuilder.build({ day: canonicalDay, routes: canonicalRoutes, activeCharacters: canonicalActiveCharacters, historicalChoices: setup.historicalChoices || setup.choices || {}, aidenActive: setup.aidenActive, masonVariant: setup.masonVariant, coachIdentity: setup.coachIdentity || setup.coach || null, hakPoints: Number(setup.points?.hak || 0), hakRoutePoints: setup.points || {}, hakWatchlist: { selected: canonicalHakSelected, targets: Object.fromEntries(canonicalHakSelected.map((id) => [id, true])), configured: canonicalDay >= 3 }, hakTutorial: { completed: canonicalDay >= 3, required: false, state: canonicalDay >= 3 ? "done" : "evidence" }, apps: canonicalDay >= 3 ? ["hak", ...(canonicalDay > 1 ? ["onlyfun"] : [])] : [], entitlements: window.EntitlementService?.snapshot?.() || {} });
    canonicalState.playthrough = { id: `p-${canonicalDay}-${canonicalRoute}-${startFromGeneration}-${startFromResetAt.toString(36)}`, generation: startFromGeneration, resetAt: startFromResetAt };
    const haileyNtsPath = token(setup.haileyNtsPath || setup.haileyNtsBranch || "");
    if (canonicalDay >= 17 && canonicalRoutes.hailey === "nts") {
      if (haileyNtsPath !== "aiden" && haileyNtsPath !== "ethan") throw new Error("Hailey NTS requires an explicit Aiden or Ethan path from Day 17 onward");
      canonicalState.world.variables.hailey_nts_post15_path = haileyNtsPath;
      canonicalState.world.choices.hailey_nts_post15_path_choice_v1 = haileyNtsPath;
      canonicalState.progression.choiceReceipts.hailey_nts_post15_path_choice_v1 = { choiceGroupId: "hailey_nts_post15_path_choice_v1", storyId: canonicalState.execution.activeStoryId || canonicalStartStory, sourceStepKey: "start_from_checkpoint", options: [{ id: "aiden", value: "aiden" }, { id: "ethan", value: "ethan" }], selectedOptionId: haileyNtsPath, selectedOptionText: haileyNtsPath === "ethan" ? "Ethan" : "Aiden", choiceMessageEventId: null, resultValue: haileyNtsPath, consequences: { onceKeys: [], routePoints: null, effectEventId: null }, committedRevision: Number(canonicalState.revision || 0) };
    }
    // Route-gated production content's `if` conditions
    // ("route_lena_locked_v1:ntr") are decided by StoryInterpreter's OWN
    // conditionAccessor (scripts/engine/story-interpreter.js), which reads
    // ONLY state.world.variables[key] -- no legacy localStorage fallback at
    // all (unlike convo-runtime.js's runtime-compat liveConditionAccessor).
    // resolveIfStepDecision treats that interpreter decision as the SOURCE
    // of truth, not merely a comparison -- so world.routes/routeLocks
    // (structured canonical fields) and the CharacterRoutes legacy mirror
    // below are both necessary but NOT sufficient: without this, every
    // route-gated `if` in production content still silently decides LOVE
    // (world.variables[key] absent -> lookup() returns null -> no match ->
    // falls through every route branch to the unconditional default).
    // Confirmed live: DAY10_00_AIDEN_SHARED's onComplete chain committed a
    // continuation receipt targeting the LOVE variant for an NTR case even
    // after world.routeLocks/CharacterRoutes were verified correct, because
    // this field alone was still empty.
    const activeSet = new Set(canonicalState.world.activeCharacters || []);
    for (const [cid, route] of Object.entries(canonicalRoutes)) {
      if (!activeSet.has(cid)) continue;
      const normalized = normalizeRoute(route);
      if (normalized) canonicalState.world.variables[`route_${cid}_locked_v1`] = normalized;
    }
    window.CheckpointStateBuilder.reconstructSelectionHistory(canonicalState,window.StoryAdmissionCatalog);
    const chronologicalEntry=window.CheckpointStateBuilder.selectCanonicalEntry(canonicalState,window.StoryAdmissionCatalog);
    canonicalStartStory=normalizeStoryPath(chronologicalEntry.path);
    const builderSelectedPath = normalizeStoryPath(canonicalState.execution.activeStoryPath || "");
    canonicalState.execution.activeStoryPath = canonicalStartStory;
    if (!canonicalState.execution.activeStoryId || builderSelectedPath !== canonicalStartStory) {
      canonicalState.execution.activeStoryId = canonicalStartStory;
    }
    canonicalState.execution.activeContactId = chronologicalEntry.contactId || inferContactId(canonicalStartStory);
    canonicalState.world.gameTime = window.GameTimeService.initialClock(canonicalDay, canonicalStartStory, canonicalState);
    const canonicalCommit = window.GameStateEngine.dispatch({ type: "INITIALIZE_START_FROM", commandId: startFromTransactionId, expectedRevision: canonicalBefore.revision, payload: { state: canonicalState, source: "start_from" } });
    if (!canonicalCommit.ok && canonicalCommit.status !== "DUPLICATE_COMMAND") throw new Error(canonicalCommit.error?.message || canonicalCommit.status);
    // Start From reconstructs a playthrough checkpoint, not renderer/session
    // cosmetics. Card Vault ownership, points, receipts and supporter access
    // are deliberately preserved by the canonical engine transaction above;
    // the selected wallpaper is deliberately not. Reset both its canonical
    // field and its localStorage compatibility mirror through the one owning
    // service so a prior profile/session cannot bleed into this checkpoint.
    window.Game?.wallpaper?.restoreDefault?.({ source: "start_from_reconstruction" });
    mirrorStartFromSelectionToLegacyStores(canonicalState.world.activeCharacters, canonicalRoutes, canonicalRoute);
    return { version: 2, day: canonicalDay, route: canonicalRoute, characterRoutes: canonicalRoutes, haileyNtsPath: haileyNtsPath || null, startStory: canonicalStartStory, activeCharacters: unique(setup.activeCharacters || []), aidenActive: setup.aidenActive !== false, masonVariant: setup.masonVariant === "female" ? "female" : "male", canonicalRevision: window.GameStateEngine.getState().revision };

  }

  // Story content's own condition strings (`active_character:mason`,
  // `route_lena_locked_v1:ntr`, ...) are evaluated by
  // convo-runtime.js's liveConditionAccessor: canonical world.variables
  // first, legacy localStorage second (readCanonicalStoryVariable). Route
  // locking itself, though, was never migrated onto that canonical variable
  // seam -- window.CharacterRoutes.set()/get() (scripts/character-routes.js)
  // is a standalone localStorage-only store that every route-gated story
  // condition ultimately reads through resolveRouteFolder/liveConditionAccessor's
  // legacy fallback. CheckpointStateBuilder populates the STRUCTURED
  // canonical world.routes/routeLocks/activeCharacters fields (the Start
  // From transaction's actual source of truth), but nothing mirrored those
  // into CharacterRoutes' localStorage keys -- so every Start From/New
  // Update launch silently left route_<id>_locked_v1 unset, and every
  // route-gated `if` in production content fell through to its LOVE
  // default regardless of the route actually selected. This mirrors the
  // already-decided canonical selection into that one remaining
  // unmigrated store -- it does not make localStorage authoritative, it
  // keeps the pre-existing legacy reader consistent with what canonical
  // state just committed, exactly the "compatibility mirror reflects
  // canonical state" contract. active_character:<id> is mirrored too
  // because CharacterRoutes.get()'s own inheritance fallback (isActive())
  // reads that legacy flag directly, not canonical world.activeCharacters.
  function mirrorStartFromSelectionToLegacyStores(activeCharacters, characterRoutes, fallbackRoute) {
    try {
      const active = new Set((Array.isArray(activeCharacters) ? activeCharacters : []).map((id) => String(id || "").trim().toLowerCase()));
      for (const id of SELECTABLE_CHARACTERS) {
        try { safeSet(`active_character:${id}`, active.has(id) ? "1" : "0"); } catch {}
        if (active.has(id) && window.CharacterRoutes?.set) {
          const route = normalizeRoute((characterRoutes && characterRoutes[id]) || fallbackRoute) || "love";
          window.CharacterRoutes.set(id, route);
        }
      }
    } catch {}
  }

  function injectStyles() {
    if (document.getElementById("start-from-style-v1")) return;
    const style = document.createElement("style");
    style.id = "start-from-style-v1";
    style.textContent = `
      .start-from-overlay[hidden]{display:none!important}
      .start-from-overlay{position:fixed;inset:0;z-index:99996;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(3,8,14,.84);backdrop-filter:blur(10px);color:#eaf9ff;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial}
      .start-from-card{width:min(430px,100%);max-height:min(720px,calc(100vh - 24px));overflow:auto;border:1px solid rgba(127,232,255,.28);border-radius:8px;background:#081017;box-shadow:0 24px 70px rgba(0,0,0,.55);padding:16px}
      .start-from-title{margin:0 0 6px;font-size:18px;font-weight:800;letter-spacing:0;text-transform:uppercase}
      .start-from-sub{margin:0 0 14px;color:#a9c7d0;font-size:13px;line-height:1.4}
      .start-from-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0 14px}
      .start-from-choice{min-height:44px;border-radius:8px;border:1px solid rgba(127,232,255,.18);background:rgba(255,255,255,.04);color:#eaf9ff;font-weight:800;text-transform:uppercase}
      .start-from-choice.is-selected{border-color:#7fe8ff;background:rgba(127,232,255,.16)}
      .start-from-list{display:grid;gap:8px;margin:10px 0 14px}
      .start-from-subheading{margin:4px 0 8px;font-size:12px;font-weight:800;letter-spacing:.02em;text-transform:uppercase;color:#93b7c2}
      .start-from-subheading small{display:block;margin-top:2px;font-size:11px;font-weight:600;text-transform:none;color:#6f8f99}
      .start-from-supporting-list{border-top:1px solid rgba(127,232,255,.14);padding-top:10px}
      .start-from-character-entry{display:grid;gap:0}
      .start-from-row{display:grid;grid-template-columns:1fr auto;align-items:center;gap:10px;padding:10px 12px;border:1px solid rgba(127,232,255,.18);border-radius:8px;background:rgba(255,255,255,.035)}
      .start-from-row-label{font-size:14px;font-weight:800;text-transform:uppercase}
      .start-from-row small{display:block;margin-top:3px;color:#93b7c2;font-weight:600;text-transform:none}
      .start-from-toggle{width:20px;height:20px;accent-color:#7fe8ff}
      .start-from-mini{min-height:34px;border-radius:8px;border:1px solid rgba(127,232,255,.28);background:#0c1822;color:#eaf9ff;font-weight:800}
      .start-from-variant{margin:-2px 0 8px 12px;padding:8px 0 0 12px;border-left:1px solid rgba(127,232,255,.22)}
      .start-from-segment{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .start-from-segment button{min-height:36px;border-radius:8px;border:1px solid rgba(127,232,255,.22);background:rgba(255,255,255,.04);color:#eaf9ff;font-weight:800;text-transform:uppercase}
      .start-from-segment button.is-selected{border-color:#7fe8ff;background:rgba(127,232,255,.16)}
      body.start-from-code-open .start-from-overlay{pointer-events:none}
      body.start-from-code-open #patreon-code-modal-v1{z-index:100000!important;pointer-events:auto}
      .start-from-total{display:flex;justify-content:space-between;gap:12px;padding:10px 12px;margin:8px 0 12px;border:1px solid rgba(127,232,255,.18);border-radius:8px;background:rgba(127,232,255,.06);font-size:12px;text-transform:uppercase}
      .start-from-point-row{display:grid;grid-template-columns:70px 1fr 64px;gap:10px;align-items:center;padding:9px 0;border-top:1px solid rgba(255,255,255,.08)}
      .start-from-point-row label{font-size:13px;font-weight:800;text-transform:uppercase}
      .start-from-point-row input[type=range]{width:100%;accent-color:#7fe8ff}
      .start-from-point-row input[type=number]{width:64px;min-height:38px;border-radius:8px;border:1px solid rgba(127,232,255,.28);background:#050a10;color:#fff;text-align:center;font-weight:800}
      .start-from-warning{min-height:18px;color:#ffb6b6;font-size:12px;line-height:1.35;margin-top:8px}
      .start-from-summary{display:grid;gap:8px;margin:10px 0 14px;font-size:13px;color:#cfeaf2}
      .start-from-summary-row{display:flex;justify-content:space-between;gap:12px;padding:9px 10px;border-radius:8px;background:rgba(255,255,255,.04)}
      .start-from-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:14px}
      .start-from-actions button{min-height:38px;border-radius:8px;border:1px solid rgba(127,232,255,.28);background:#0c1822;color:#eaf9ff;padding:0 14px;font-weight:800;text-transform:uppercase}
      .start-from-actions button.primary{background:#7fe8ff;color:#051016;border-color:#7fe8ff}
      .start-from-actions button:disabled{opacity:.45}
      @media (max-width:430px){.start-from-overlay{padding:10px}.start-from-card{padding:14px}.start-from-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.start-from-point-row{grid-template-columns:58px 1fr 58px}.start-from-point-row input[type=number]{width:58px}.start-from-actions{justify-content:stretch}.start-from-actions button{flex:1}}
    `;
    document.head.appendChild(style);
  }

  function createOverlay() {
    injectStyles();
    const overlay = document.createElement("div");
    overlay.className = "start-from-overlay";
    const card = document.createElement("div");
    card.className = "start-from-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    return { overlay, card };
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function addHeader(card, title, sub) {
    const h = document.createElement("h2");
    h.className = "start-from-title";
    h.textContent = title;
    const p = document.createElement("p");
    p.className = "start-from-sub";
    p.textContent = sub;
    card.appendChild(h);
    card.appendChild(p);
  }

  function actions(card, onBack, onNext, nextLabel) {
    const wrap = document.createElement("div");
    wrap.className = "start-from-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = onBack ? "Back" : "Cancel";
    const next = document.createElement("button");
    next.type = "button";
    next.className = "primary";
    next.textContent = nextLabel || "Continue";
    cancel.addEventListener("click", onBack || closeStartFrom);
    next.addEventListener("click", onNext);
    wrap.appendChild(cancel);
    wrap.appendChild(next);
    card.appendChild(wrap);
    return { cancel, next };
  }

  let currentOverlay = null;
  function closeStartFrom() {
    if (currentOverlay) {
      try { currentOverlay.remove(); } catch {}
    }
    currentOverlay = null;
  }

  function openStartFromMenu() {
    closeStartFrom();
    const ui = createOverlay();
    currentOverlay = ui.overlay;
    const state = {
      step: "day",
      day: 1,
      route: "love",
      routes: { lena: "love", hailey: "love", evelyn: "love", mason: "love" },
      activeCharacters: ["lena", "hailey"],
      aidenActive: safeGet("active_character:aiden") !== "0",
      masonVariant: "",
      haileyNtsPath: "",
      points: { love: 0, ntr: 0, nts: 0 },
      availability: null,
      availabilityKey: "",
      availabilityLoading: false,
      supportedDays: null,
      supportedDaysLoading: false
    };

    function go(step) {
      state.step = step;
      render();
    }

    function availabilityKey() {
      return String(state.day);
    }

    function invalidateCharacterAvailability() {
      state.availability = null;
      state.availabilityKey = "";
      state.availabilityLoading = false;
    }

    function pruneActiveCharacters(availability) {
      const available = availability && Array.isArray(availability.available)
        ? availability.available.filter((id) => !availability.records?.[id]?.locked)
        : [];
      state.activeCharacters = unique(state.activeCharacters).filter((id) => available.includes(id));
      if (!state.activeCharacters.length && available.length) state.activeCharacters = [available[0]];
      state.activeCharacters.forEach((cid) => {
        const routes = availability.records?.[cid]?.routes || [];
        const current = normalizeRoute(state.routes[cid] || state.route);
        if (!routes.includes(current)) state.routes[cid] = routes[0] || "love";
      });
      const primary = state.activeCharacters[0];
      if (primary) state.route = normalizeRoute(state.routes[primary]) || availability.records?.[primary]?.routes?.[0] || "love";
    }

    function loadCharacterAvailability() {
      const key = availabilityKey();
      if (state.availability && state.availabilityKey === key) return state.availability;
      if (state.availabilityLoading) return null;
      state.availabilityLoading = true;
      resolveStartFromAvailability({ day: state.day })
        .then((availability) => {
          if (availabilityKey() !== key) return;
          state.availability = availability;
          state.availabilityKey = key;
          pruneActiveCharacters(availability);
          state.availabilityLoading = false;
          render();
        })
        .catch((err) => {
          console.warn("[StartFrom] character availability failed", err);
          if (availabilityKey() === key) {
            state.availability = { day: state.day, playable: false, available: [], records: {}, error: String(err && err.message ? err.message : err) };
            state.availabilityKey = key;
            state.availabilityLoading = false;
            render();
          }
        });
      return null;
    }

    function nextStepFromDay() {
      if (dayRequiresCharacters(state.day)) return "characters";
      if (dayRequiresRoute(state.day)) return "route";
      return "skills";
    }

    function render() {
      clear(ui.card);
      if (state.step === "day") return renderDay();
      if (state.step === "route") return renderRoute();
      if (state.step === "characters") return renderCharacters();
      if (state.step === "skills") return renderSkills();
      return renderConfirm();
    }

    function renderDay() {
      addHeader(ui.card, "Start From", "Choose a day.");
      if (!state.supportedDays) {
        if (!state.supportedDaysLoading) {
          state.supportedDaysLoading = true;
          loadSupportedStartDays().then((days) => {
            state.supportedDays = days;
            state.supportedDaysLoading = false;
            if (!days.includes(state.day)) state.day = days[0] || 1;
            if (state.step === "day") render();
          }).catch(() => {
            state.supportedDays = [];
            state.supportedDaysLoading = false;
            if (state.step === "day") render();
          });
        }
        const loading = document.createElement("div");
        loading.className = "start-from-warning";
        loading.textContent = "Loading playable days...";
        ui.card.appendChild(loading);
        const pending = actions(ui.card, null, () => {});
        pending.next.disabled = true;
        return;
      }
      const grid = document.createElement("div");
      grid.className = "start-from-grid";
      for (const day of state.supportedDays) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "start-from-choice" + (day === state.day ? " is-selected" : "");
        btn.textContent = "Day " + day;
        btn.addEventListener("click", () => {
          state.day = day;
          if (!dayRequiresRoute(day)) state.route = "love";
          invalidateCharacterAvailability();
          render();
        });
        grid.appendChild(btn);
      }
      ui.card.appendChild(grid);
      actions(ui.card, null, () => go(nextStepFromDay()));
    }

    function renderRoute() {
      const availability = loadCharacterAvailability();
      addHeader(ui.card, "Routes", dayRequiresCharacters(state.day) ? "Choose a route for each active character." : "Choose the route.");
      if (!availability) {
        const loading = document.createElement("div");
        loading.className = "start-from-warning";
        loading.textContent = "Loading available routes...";
        ui.card.appendChild(loading);
        const pending = actions(ui.card, () => go("characters"), () => {});
        pending.next.disabled = true;
        return;
      }
      const ids = dayRequiresCharacters(state.day) ? state.activeCharacters.slice() : ["lena"];
      ids.forEach((cid) => {
        const block = document.createElement("div");
        block.className = "start-from-variant";
        const label = document.createElement("div");
        label.className = "start-from-row-label";
        label.textContent = displayNameFor(cid);
        const grid = document.createElement("div");
        grid.className = "start-from-segment";
        const availableRoutes = dayRequiresCharacters(state.day) ? (availability.records?.[cid]?.routes || []) : ROUTES;
        availableRoutes.forEach((route) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = (state.routes[cid] || state.route) === route ? "is-selected" : "";
          btn.textContent = route.toUpperCase();
          btn.addEventListener("click", () => {
            state.routes[cid] = route;
            if (cid === "hailey" && route !== "nts") state.haileyNtsPath = "";
            if (cid === ids[0]) state.route = route;
            render();
          });
          grid.appendChild(btn);
        });
        block.appendChild(label);
        block.appendChild(grid);
        ui.card.appendChild(block);
        if (cid === "hailey" && state.day >= 17 && state.routes.hailey === "nts") {
          const pathBlock = document.createElement("div");
          pathBlock.className = "start-from-variant";
          pathBlock.dataset.variantFor = "hailey-nts-path";
          const pathLabel = document.createElement("div");
          pathLabel.className = "start-from-row-label";
          pathLabel.textContent = "Hailey NTS Path";
          const pathGrid = document.createElement("div");
          pathGrid.className = "start-from-segment";
          [{ id: "aiden", label: "Aiden" }, { id: "ethan", label: "Ethan" }].forEach((option) => {
            const pathButton = document.createElement("button");
            pathButton.type = "button";
            pathButton.dataset.haileyNtsPath = option.id;
            pathButton.className = state.haileyNtsPath === option.id ? "is-selected" : "";
            pathButton.textContent = option.label;
            pathButton.addEventListener("click", () => { state.haileyNtsPath = option.id; render(); });
            pathGrid.appendChild(pathButton);
          });
          pathBlock.appendChild(pathLabel);
          pathBlock.appendChild(pathGrid);
          ui.card.appendChild(pathBlock);
        }
      });
      const routeActions = actions(ui.card, () => go(dayRequiresCharacters(state.day) ? "characters" : "day"), () => go("skills"));
      routeActions.next.disabled = state.day >= 17 && state.activeCharacters.includes("hailey") && state.routes.hailey === "nts" && !["aiden", "ethan"].includes(state.haileyNtsPath);
    }

    function setCodeModalLayer(active) {
      try { document.body.classList.toggle("start-from-code-open", !!active); } catch {}
      const host = document.getElementById("patreon-code-modal-v1");
      if (!host) return;
      if (active) {
        host.style.zIndex = "100000";
        host.style.pointerEvents = "auto";
      } else {
        host.style.zIndex = "";
      }
    }

    function closeCodeModalLayer() {
      setCodeModalLayer(false);
      setTimeout(() => {
        const host = document.getElementById("patreon-code-modal-v1");
        if (host && !host.hidden) setCodeModalLayer(true);
      }, 0);
    }

    function renderCharacters() {
      addHeader(ui.card, "Characters", "Choose active conversations.");
      const availability = loadCharacterAvailability();
      if (!availability) {
        const loading = document.createElement("div");
        loading.className = "start-from-warning";
        loading.textContent = "Loading available conversations...";
        ui.card.appendChild(loading);
        const a = actions(ui.card, () => go("day"), () => {});
        a.next.disabled = true;
        return;
      }
      const availableCharacters = availability.available || [];
      const records = availability.records || {};
      pruneActiveCharacters(availability);
      const list = document.createElement("div");
      list.className = "start-from-list";
      availableCharacters.forEach((cid) => {
        const locked = !!(records[cid] && records[cid].locked);
        const entry = document.createElement("div");
        entry.className = "start-from-character-entry";
        entry.dataset.contactId = cid;
        // PRIMARY_ROUTE_CHARACTERS marker (see SELECTABLE_CHARACTERS above):
        // `cid` here always comes from `availableCharacters`, which is
        // derived from SELECTABLE_CHARACTERS-gated availability data, so this
        // is always a primary route character -- never Aiden/Chris. Kept as
        // an explicit, testable marker rather than an assumption.
        entry.dataset.role = "primary";
        const row = document.createElement("label");
        row.className = "start-from-row";
        const left = document.createElement("span");
        left.className = "start-from-row-label";
        left.textContent = displayNameFor(cid);
        if (locked) {
          const small = document.createElement("small");
          small.textContent = displayNameFor(cid) + " code required";
          left.appendChild(small);
        }
        const right = document.createElement("span");
        if (locked) {
          const unlock = document.createElement("button");
          unlock.type = "button";
          unlock.className = "start-from-mini";
          unlock.textContent = "Code";
          unlock.addEventListener("click", (event) => {
            event.preventDefault();
            const name = displayNameFor(cid);
            const opened = window.Game?.openPatreonCodeModal?.({
              context: "premium",
              title: name,
              subtitle: name + " requires the Patreon code.",
              cancelLabel: "No code",
              confirmLabel: "Unlock",
              onSuccess: () => {
                invalidateCharacterAvailability();
                if (hasCharacterPremiumUnlock(cid) && !state.activeCharacters.includes(cid)) state.activeCharacters.push(cid);
                closeCodeModalLayer();
                setTimeout(render, 0);
              },
              onCancel: () => {
                closeCodeModalLayer();
                setTimeout(render, 0);
              }
            });
            if (opened) {
              setCodeModalLayer(true);
              setTimeout(() => {
                try {
                  const input = document.querySelector("#patreon-code-modal-v1 .patreon-code-input");
                  input?.focus?.();
                  input?.select?.();
                } catch {}
              }, 0);
            }
            if (!opened) window.showToast?.("Patreon code unavailable.");
          });
          right.appendChild(unlock);
        } else {
          const input = document.createElement("input");
          input.type = "checkbox";
          input.className = "start-from-toggle";
          input.checked = state.activeCharacters.includes(cid);
          input.addEventListener("change", () => {
            const set = new Set(state.activeCharacters);
            if (input.checked) set.add(cid);
            else set.delete(cid);
            state.activeCharacters = availableCharacters.filter((id) => set.has(id));
            render();
          });
          right.appendChild(input);
        }
        row.appendChild(left);
        row.appendChild(right);
        entry.appendChild(row);
        if (cid === "mason" && !locked && state.activeCharacters.includes("mason")) {
          const variantWrap = document.createElement("div");
          variantWrap.className = "start-from-variant";
          variantWrap.dataset.variantFor = "mason";
          const variantLabel = document.createElement("div");
          variantLabel.className = "start-from-row-label";
          variantLabel.textContent = "Mason Variant";
          const segment = document.createElement("div");
          segment.className = "start-from-segment";
          [
            { id: "male", label: "Male" },
            { id: "female", label: "Female" }
          ].forEach((option) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.dataset.masonVariant = option.id;
            btn.className = state.masonVariant === option.id ? "is-selected" : "";
            btn.textContent = option.label;
            btn.addEventListener("click", () => {
              state.masonVariant = normalizeMasonVariant(option.id);
              render();
            });
            segment.appendChild(btn);
          });
          variantWrap.appendChild(variantLabel);
          variantWrap.appendChild(segment);
          entry.appendChild(variantWrap);
        }
        list.appendChild(entry);
      });
      ui.card.appendChild(list);
      if (!availableCharacters.length) {
        const empty = document.createElement("div");
        empty.className = "start-from-warning";
        empty.textContent = "No playable conversations are available from this day.";
        ui.card.appendChild(empty);
      }
      // Aiden is a supporting/background character, never a primary route
      // character (see SELECTABLE_CHARACTERS above -- this toggle only ever
      // affects world.activeCharacters participation, it never grants a
      // route or joins the primary `list` above). Rendered in its own
      // clearly-labeled section, with its own dataset.role, so it can never
      // read as an equivalent entry to Lena/Hailey/Evelyn/Mason above.
      const supportingHeading = document.createElement("div");
      supportingHeading.className = "start-from-subheading";
      supportingHeading.textContent = "Supporting cast";
      const supportingHint = document.createElement("small");
      supportingHint.textContent = "Background only -- not a playable route.";
      supportingHeading.appendChild(supportingHint);
      ui.card.appendChild(supportingHeading);
      const supportingList = document.createElement("div");
      supportingList.className = "start-from-list start-from-supporting-list";
      const aidenEntry = document.createElement("div");
      aidenEntry.className = "start-from-character-entry";
      aidenEntry.dataset.contactId = "aiden";
      aidenEntry.dataset.role = "supporting";
      const aidenRow = document.createElement("label");
      aidenRow.className = "start-from-row";
      const aidenLabel = document.createElement("span");
      aidenLabel.className = "start-from-row-label";
      aidenLabel.textContent = displayNameFor("aiden");
      const aidenToggleWrap = document.createElement("span");
      const aidenToggle = document.createElement("input");
      aidenToggle.type = "checkbox";
      aidenToggle.className = "start-from-toggle";
      aidenToggle.checked = state.aidenActive;
      aidenToggle.addEventListener("change", () => {
        state.aidenActive = aidenToggle.checked;
        render();
      });
      aidenToggleWrap.appendChild(aidenToggle);
      aidenRow.appendChild(aidenLabel);
      aidenRow.appendChild(aidenToggleWrap);
      aidenEntry.appendChild(aidenRow);
      supportingList.appendChild(aidenEntry);
      ui.card.appendChild(supportingList);
      const a = actions(ui.card, () => go("day"), () => {
        if (!state.activeCharacters.length) {
          window.showToast?.("Select at least one character.");
          return;
        }
        if (state.activeCharacters.includes("mason") && !["male", "female"].includes(state.masonVariant)) {
          return;
        }
        go(dayRequiresRoute(state.day) ? "route" : "skills");
      });
      a.next.disabled = !state.activeCharacters.length || (state.activeCharacters.includes("mason") && !["male", "female"].includes(state.masonVariant));
    }

    function renderSkills() {
      const audited = routeAuditFor(state.day, state.route);
      const totalPoints = Number(audited.total || 0) || 0;
      state.points = normalizePoints(state.points || audited);
      if (sumPoints(state.points) === 0 && totalPoints > 0) state.points = normalizePoints(audited);
      addHeader(ui.card, "Skill Points", "Allocate " + totalPoints + " point" + (totalPoints === 1 ? "" : "s") + ".");
      const total = document.createElement("div");
      total.className = "start-from-total";
      total.innerHTML = '<span>Total: <strong data-total>0</strong> / ' + totalPoints + '</span><span>Remaining: <strong data-remaining>' + totalPoints + '</strong></span>';
      ui.card.appendChild(total);
      const rows = {};
      ROUTES.forEach((route) => {
        const row = document.createElement("div");
        row.className = "start-from-point-row";
        const label = document.createElement("label");
        label.textContent = route.toUpperCase();
        const range = document.createElement("input");
        range.type = "range";
        range.min = "0";
        range.max = String(Math.min(ROUTE_POINT_CAPS[route], totalPoints));
        range.step = "1";
        const number = document.createElement("input");
        number.type = "number";
        number.min = "0";
        number.max = String(Math.min(ROUTE_POINT_CAPS[route], totalPoints));
        number.step = "1";
        row.appendChild(label);
        row.appendChild(range);
        row.appendChild(number);
        ui.card.appendChild(row);
        rows[route] = { range, number };
      });
      const warning = document.createElement("div");
      warning.className = "start-from-warning";
      warning.setAttribute("role", "status");
      ui.card.appendChild(warning);

      function setValue(route, value) {
        const max = Math.min(ROUTE_POINT_CAPS[route], totalPoints);
        const n = Math.max(0, Math.min(max, Math.floor(Number(value || 0) || 0)));
        state.points[route] = n;
        rows[route].range.value = String(n);
        rows[route].number.value = String(n);
      }

      function renderTotals() {
        ROUTES.forEach((route) => setValue(route, state.points[route]));
        const spent = sumPoints(state.points);
        const remaining = totalPoints - spent;
        total.querySelector("[data-total]").textContent = String(spent);
        total.querySelector("[data-remaining]").textContent = String(Math.max(0, remaining));
        if (spent > totalPoints) warning.textContent = "Total cannot exceed " + totalPoints + ".";
        else if (spent < totalPoints) warning.textContent = "Spend all remaining points to continue.";
        else warning.textContent = "";
        if (skillActions) skillActions.next.disabled = spent !== totalPoints;
      }

      ROUTES.forEach((route) => {
        rows[route].range.addEventListener("input", () => { setValue(route, rows[route].range.value); renderTotals(); });
        rows[route].number.addEventListener("input", () => { setValue(route, rows[route].number.value); renderTotals(); });
      });
      const skillActions = actions(ui.card, () => go(dayRequiresRoute(state.day) ? "route" : (dayRequiresCharacters(state.day) ? "characters" : "day")), () => go("confirm"));
      renderTotals();
    }

    function renderConfirm() {
      const points = normalizePoints(state.points);
      addHeader(ui.card, "Confirm", "Start the selected day.");
      const summary = document.createElement("div");
      summary.className = "start-from-summary";
      const rows = [
        ["Day", "Day " + state.day],
        ["Routes", dayRequiresRoute(state.day) ? state.activeCharacters.map((id) => displayNameFor(id) + " " + (state.routes[id] || state.route).toUpperCase()).join(" / ") : "None"],
        ["Characters", dayRequiresCharacters(state.day) ? (state.activeCharacters.map(displayNameFor).join(", ") || "None") : "Default"],
        ["Points", points.love + " LOVE / " + points.ntr + " NTR / " + points.nts + " NTS"]
      ];
      if (dayRequiresCharacters(state.day) && state.activeCharacters.includes("mason")) rows.splice(3, 0, ["Mason", state.masonVariant === "female" ? "Female" : "Male"]);
      if (state.day >= 17 && state.activeCharacters.includes("hailey") && state.routes.hailey === "nts") rows.splice(3, 0, ["Hailey NTS Path", state.haileyNtsPath === "ethan" ? "Ethan" : "Aiden"]);
      rows.forEach(([label, value]) => {
        const row = document.createElement("div");
        row.className = "start-from-summary-row";
        const a = document.createElement("span");
        a.textContent = label;
        const b = document.createElement("strong");
        b.textContent = value;
        row.appendChild(a);
        row.appendChild(b);
        summary.appendChild(row);
      });
      ui.card.appendChild(summary);
      const a = actions(ui.card, () => go("skills"), async () => {
        a.next.disabled = true;
        a.next.textContent = "Starting...";
        try {
          const payload = await applyStartFromSetup({
            day: state.day,
            route: state.route,
            routes: state.routes,
            activeCharacters: state.activeCharacters,
            masonVariant: state.masonVariant,
            haileyNtsPath: state.haileyNtsPath,
            points
          });
          closeStartFrom();
          launchStartFrom(payload);
        } catch (err) {
          a.next.disabled = false;
          a.next.textContent = "Start";
          console.warn("[StartFrom] failed", err && err.stack ? err.stack : err);
          window.UIModal?.alert?.({ title: "Start From", text: "Unable to start from this day. Please try again." });
        }
      }, "Start");
    }

    render();
    return true;
  }

  function launchStartFrom(payload) {
    const storyPath = normalizeStoryPath(payload && payload.startStory || "");
    if (!storyPath) return false;
    const opts = {
      goHome: true,
      startStory: storyPath,
      startDelayMs: 200,
      reason: "start_from",
      allowConversationInterrupt: true,
      // Start From admits the checkpoint while Home is active. Interactive
      // conversation/player turns remain pending until their owner is open.
      allowInConversation: false,
      allowPlayerTurns: false,
      forceStoryRestart: true,
      __strictRequestedPath: true
    };
    if (typeof window.showTimeCard === "function") {
      window.showTimeCard("DAY " + (payload.day || ""), opts);
      return true;
    }
    return !!(window.Game ||= {}).startStory?.(storyPath, opts);
  }

  const api = {
    open: openStartFromMenu,
    applyStartFromSetup,
    resolveStartFromAvailability,
    getSupportedDays: loadSupportedStartDays,
    resolveCharacterAvailability,
    validateStartFromSetup,
    getSkillPointAudit: () => SKILL_POINT_AUDIT,
    getRouteAudit: routeAuditFor
  };

  window.StartFromEntry = api;
  window.openStartFromMenu = openStartFromMenu;
  window.Game = window.Game || {};
  window.Game.openStartFromMenu = openStartFromMenu;
  window.Game.getStartFromSkillPointAudit = api.getSkillPointAudit;
})();
