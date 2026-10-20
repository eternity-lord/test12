// Central story continuation resolver for update-safe handoffs.
// Browser runtime and Node QA both use this module so disabled-character chains
// and manual continuation defaults stay aligned.
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    // Real product code path: scripts/start-from-entry.js's own
    // collectNaturalRouteProgressionOnceKeys (the "Start From Day N" premium
    // feature's natural-progression simulation) calls this exact module via
    // window.UpdateSafetyResolver in the browser; Node QA (e.g.
    // codex_all_days_chronological_order_live_check.js) requires it
    // directly. Both need the SAME generic-route-alias table the real
    // interpreter's own story-interpreter.js routeStoryPath() already uses
    // (scripts/generated/logical-story-routes.js's window.LogicalStoryRoutes)
    // -- that file assigns to window directly (not a CommonJS export), so
    // the Node side reads and parses its JSON payload directly here.
    let nodeLogicalRoutes = null;
    try {
      const fs = require("fs"), path = require("path");
      const src = fs.readFileSync(path.join(__dirname, "generated", "logical-story-routes.js"), "utf8");
      const match = src.match(/window\.LogicalStoryRoutes=Object\.freeze\((\{[\s\S]*?\})\);\r?\nwindow\.LogicalStoryCatalog/);
      if (match) nodeLogicalRoutes = JSON.parse(match[1]);
    } catch {}
    module.exports = factory(root, nodeLogicalRoutes);
  } else {
    root.UpdateSafetyResolver = factory(root, null);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root, nodeLogicalRoutes) {
  "use strict";

  const ROUTE_FOLDERS = new Set(["love", "ntr", "nts"]);
  const NON_CHARACTER_CONTACTS = new Set(["player", "system", "hak", "onlyfun", "gallery", "meetandgreet", "snapgram", "dev", "post", "text", "boot"]);
  const ROUTED_SEGMENT_CHARACTERS = Object.freeze(["mason", "hailey", "lena", "evelyn"]);
  const SEGMENTS = Object.freeze(["morning", "late_morning", "afternoon", "evening", "night"]);
  const MAX_HOPS = 64;
  const STORY_PATH_ALIASES = Object.freeze({
    "story/day9/love/day9_06_mason_afternoon_love.json": "story/DAY9/love/DAY9_05_MASON_AFTERNOON_LOVE.json",
    "story/day9/love/day9_03_evelyn_afternoon_love.json": "story/DAY9/love/DAY9_06_EVELYN_AFTERNOON_LOVE.json",
    "story/day9/love/day9_04_evelyn_evening_love.json": "story/DAY9/love/DAY9_07_EVELYN_EVENING_LOVE.json",
    "story/day9/love/day9_07_mason_evening_love.json": "story/DAY9/love/DAY9_08_MASON_EVENING_LOVE.json",
    "story/day9/love/day9_05_hailey_evening_love.json": "story/DAY9/love/DAY9_09_HAILEY_EVENING_LOVE.json",
    "story/day9/love/day9_04_lena_evening_love.json": "story/DAY9/love/DAY9_10_LENA_EVENING_LOVE.json",
    "story/day9/ntr/day9_04_lena_afternoon_ntr.json": "story/DAY9/ntr/DAY9_05_LENA_AFTERNOON_NTR.json",
    "story/day9/ntr/day9_03_evelyn_afternoon_ntr.json": "story/DAY9/ntr/DAY9_07_EVELYN_AFTERNOON_NTR.json",
    "story/day9/ntr/day9_04_evelyn_evening_ntr.json": "story/DAY9/ntr/DAY9_08_EVELYN_EVENING_NTR.json",
    "story/day9/ntr/day9_07_mason_evening_ntr.json": "story/DAY9/ntr/DAY9_09_MASON_EVENING_NTR.json",
    "story/day9/ntr/day9_05_hailey_evening_ntr.json": "story/DAY9/ntr/DAY9_10_HAILEY_EVENING_NTR.json",
    "story/day9/ntr/day9_05_lena_night_ntr.json": "story/DAY9/ntr/DAY9_11_LENA_NIGHT_NTR.json",
    "story/day9/nts/day9_01_evelyn_morning_nts.json": "story/DAY9/nts/DAY9_02_EVELYN_MORNING_NTS.json",
    "story/day9/nts/day9_04_lena_late_morning_nts.json": "story/DAY9/nts/DAY9_03_LENA_LATE_MORNING_NTS.json",
    "story/day9/nts/day9_04_tutor_search_nts.json": "story/DAY9/nts/DAY9_05_TUTOR_SEARCH_NTS.json",
    "story/day9/nts/day9_07_mason_afternoon_nts.json": "story/DAY9/nts/DAY9_06_MASON_AFTERNOON_NTS.json",
    "story/day9/nts/day9_05_lena_afternoon_nts.json": "story/DAY9/nts/DAY9_07_LENA_AFTERNOON_NTS.json",
    "story/day9/nts/day9_04_evelyn_afternoon_nts.json": "story/DAY9/nts/DAY9_08_EVELYN_AFTERNOON_NTS.json",
    "story/day9/nts/day9_05_evelyn_evening_nts.json": "story/DAY9/nts/DAY9_09_EVELYN_EVENING_NTS.json",
    "story/day9/nts/day9_08_mason_evening_nts.json": "story/DAY9/nts/DAY9_10_MASON_EVENING_NTS.json",
    "story/day9/nts/day9_05_hailey_evening_nts.json": "story/DAY9/nts/DAY9_11_HAILEY_EVENING_NTS.json",
    "story/day9/nts/day9_06_lena_night_nts.json": "story/DAY9/nts/DAY9_12_LENA_NIGHT_NTS.json"
  });

  function token(raw) {
    return String(raw || "").trim().toLowerCase().replace(/\s+/g, "_");
  }

  function normalizeStoryPath(raw) {
    const p = String(raw || "").trim().replace(/\\/g, "/").replace(/^\.\//, "");
    if (!p) return "";
    let normalized = p;
    if (!/^story\/.+\.json$/i.test(normalized)) {
      normalized = p.endsWith(".json") ? "story/" + p : "story/" + p + ".json";
    }
    return STORY_PATH_ALIASES[normalized.toLowerCase()] || chronologyFilenameAlias(normalized);
  }

  function chronologyFilenameAlias(normalized) {
    const match = String(normalized || "").match(/^(story\/DAY(10|11|12|13|14|15)\/(love|ntr|nts)\/DAY\2_)(\d{2})_(MASON_(MORNING|AFTERNOON|EVENING)|LENA_(EVENING|NIGHT))(_(?:LOVE|NTR|NTS)\.json)$/i);
    if (!match) return normalized;
    const day = Number(match[2]);
    const oldPrefix = match[4];
    const stem = match[5].toUpperCase();
    let newPrefix = "";
    if (stem === "MASON_MORNING") newPrefix = day >= 13 && day <= 14 ? (oldPrefix === "04" ? "00" : "") : (oldPrefix === "03" ? "00" : "");
    if (stem === "MASON_AFTERNOON") newPrefix = day >= 13 && day <= 14 ? (oldPrefix === "05" ? "01" : "") : (oldPrefix === "04" ? "01" : "");
    if (stem === "MASON_EVENING") newPrefix = day >= 13 && day <= 14 ? (oldPrefix === "06" ? "02" : "") : (oldPrefix === "05" ? "02" : "");
    if (stem === "LENA_EVENING" && [11, 12, 15].includes(day) && oldPrefix === "01") newPrefix = "02";
    if (stem === "LENA_NIGHT" && day === 11 && oldPrefix === "02") newPrefix = "03";
    return newPrefix ? `${match[1]}${newPrefix}_${match[5]}${match[8]}` : normalized;
  }

  function logicalRoutesTable() {
    return nodeLogicalRoutes || (root && root.LogicalStoryRoutes) || {};
  }

  // Authored content legitimately references a GENERIC, route-agnostic
  // "next in this character's day" path (e.g. story/DAY9/DAY9_HAILEY_
  // EVENING.json) rather than one specific route variant -- the real
  // interpreter resolves this via story-interpreter.js's own
  // routeStoryPath(), using window.LogicalStoryRoutes (the same generated
  // alias table). Found live (2026-09-06): update-safety-resolver.js had
  // no equivalent step, so any transition through one of these generic
  // paths returned "load_failed" here -- affecting both this resolver's
  // QA callers (codex_all_days_chronological_order_live_check.js) AND the
  // real "Start From Day N" premium feature (scripts/start-from-entry.js's
  // collectNaturalRouteProgressionOnceKeys, which silently stops its
  // natural-progression simulation early on the same failure, understating
  // which onceKeys should already read as complete). A generic alias's
  // owning character is inferred from one of its OWN route-specific
  // variant filenames (which already match inferContactIdFromPath's
  // naming convention), not the generic filename itself (which lacks the
  // route-specific numeric segment that convention expects).
  function resolveLogicalAlias(path, opts) {
    const clean = String(path || "").trim();
    if (!clean) return clean;
    const table = logicalRoutesTable();
    const variants = table[clean];
    if (!variants || typeof variants !== "object") return clean;
    const sample = Object.values(variants).find(Boolean) || "";
    const ownerId = token(inferContactIdFromPath(sample));
    if (!ownerId) return clean;
    const assigned = normalizeRoute(routeForContact(ownerId, opts || {}));
    return String(variants[assigned] || variants.love || clean);
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

  function inferContactIdFromPath(storyPath) {
    const normalized = normalizeStoryPath(storyPath);
    const file = normalized.split("/").pop() || "";
    const dayMatch = file.match(/^day\d+_\d+_([a-z0-9]+)(?:_|\.json)/i);
    if (dayMatch) {
      const owner = token(dayMatch[1] || "");
      if (owner && !NON_CHARACTER_CONTACTS.has(owner)) return owner;
    }
    return "";
  }

  function inferContactIdFromStory(storyJson, storyPath) {
    const json = storyJson && typeof storyJson === "object" ? storyJson : {};
    const explicit = token(json.contactId || json.contact || json.conversationId || json.characterId || json.ownerCharacterId || "");
    if (explicit && explicit !== "player" && explicit !== "system") return explicit;

    let fromMessage = "";
    let fromNotify = "";
    walkSteps(json.steps, (step) => {
      const type = token(step.type || "");
      if (type === "message" || type === "image" || type === "photo" || type === "video" || type === "media") {
        const from = token(step.from || step.fromId || "");
        if (from && !NON_CHARACTER_CONTACTS.has(from)) {
          fromMessage = from;
          return true;
        }
      }
      if (type === "notify") {
        const app = token(step.app || "messages") || "messages";
        const from = token(step.fromId || step.from || step.contactId || "");
        if (app === "messages" && from && !NON_CHARACTER_CONTACTS.has(from)) fromNotify = from;
      }
      return false;
    });
    return fromMessage || fromNotify || inferContactIdFromPath(storyPath);
  }

  function transitionFromStep(step, storyJson, opts) {
    const type = token(step && step.type);
    const resolved = (raw) => resolveLogicalAlias(normalizeStoryPath(raw), opts);
    if (type === "start_story") {
      return {
        type,
        goHome: step.goHome === true,
        startStory: resolved(step.startStory || step.storyPath || step.story || storyJson.onCompleteStartStory || "")
      };
    }
    if (type === "next_day") {
      return {
        type,
        goHome: true,
        startStory: resolved(step.startStory || step.storyPath || step.story || storyJson.onCompleteStartStory || "")
      };
    }
    if (type === "time_card" || type === "cutscene") {
      return {
        type,
        goHome: step.goHome === true,
        startStory: resolved(step.startStory || step.storyPath || step.story || storyJson.onCompleteStartStory || "")
      };
    }
    return null;
  }

  function firstTransition(storyJson) {
    const json = storyJson && typeof storyJson === "object" ? storyJson : {};
    let found = null;
    walkSteps(json.steps, (step) => {
      found = transitionFromStep(step, json);
      return !!found;
    });
    return found;
  }

  function isDisabledContact(contactId, options) {
    const id = token(contactId);
    if (!id || NON_CHARACTER_CONTACTS.has(id)) return false;
    // characterIds defines the availability-filter domain. Story actors such
    // as Aiden/tutor may own required global glue while not being selectable;
    // a broad callback must not accidentally classify them as disabled.
    const filteredIds = Array.isArray(options && options.characterIds)
      ? options.characterIds.map(token).filter(Boolean)
      : [];
    if (filteredIds.length && !filteredIds.includes(id)) return false;
    return !!(options && typeof options.isCharacterDisabled === "function" && options.isCharacterDisabled(id));
  }

  function requireOnceKeys(raw) {
    return String(raw || "")
      .split("|")
      .map(token)
      .filter(Boolean);
  }

  function requirementsMetByKeys(storyJson, completedKeys) {
    const keys = requireOnceKeys(storyJson && storyJson.requireOnceKey);
    if (!keys.length) return true;
    const done = completedKeys instanceof Set ? completedKeys : new Set();
    return keys.some((key) => done.has(key));
  }

  function routeForContact(contactId, opts) {
    const id = token(contactId);
    const fallback = token(opts.route || "") || "love";
    if (typeof opts.getRouteForCharacter === "function") {
      const resolved = token(opts.getRouteForCharacter(id) || "");
      if (resolved) return resolved;
    }
    const aliases = opts.routeAliases && typeof opts.routeAliases === "object" ? opts.routeAliases : {};
    const byContact = aliases[id] && typeof aliases[id] === "object" ? aliases[id] : null;
    return token(byContact && byContact[fallback] || fallback);
  }

  function routeMatches(wanted, actual) {
    const a = token(actual);
    const w = token(wanted);
    if (w === "nts") return a === "nts" || a === "nts1" || a === "nts_coach";
    if (w === "love") return !a || a === "love";
    return a === w;
  }

  function normalizeRoute(raw) {
    const value = token(raw);
    if (value === "nts" || value === "nts1" || value === "nts_coach") return "nts";
    if (value === "ntr") return "ntr";
    return "love";
  }

  function segmentFromPath(path) {
    const file = normalizeStoryPath(path).split("/").pop() || "";
    const lower = file.toLowerCase();
    if (lower.includes("late_morning")) return "late_morning";
    if (lower.includes("morning")) return "morning";
    if (lower.includes("afternoon") || lower.includes("break") || lower.includes("tutor")) return "afternoon";
    if (lower.includes("night")) return "night";
    if (lower.includes("evening")) return "evening";
    return "";
  }

  function segmentFromSequenceIndex(index, length) {
    const i = Number(index || 0) || 0;
    const count = Math.max(0, Number(length || 0) || 0);
    if (i <= 0) return "morning";
    if (count > 0 && i >= count - 1) return "evening";
    return "afternoon";
  }

  function segmentRank(segment) {
    const idx = SEGMENTS.indexOf(token(segment));
    return idx >= 0 ? idx : 999;
  }

  function activeCharacterIds(opts) {
    const listed = Array.isArray(opts.characterIds) && opts.characterIds.length
      ? opts.characterIds
      : ROUTED_SEGMENT_CHARACTERS;
    const activeSet = opts.activeSet instanceof Set ? opts.activeSet : activeSetForOptions(opts);
    const out = [];
    for (const rawId of listed) {
      const id = token(rawId);
      if (!id || NON_CHARACTER_CONTACTS.has(id)) continue;
      let active = activeSet.has(id);
      if (!active && typeof opts.isCharacterActive === "function") {
        try { active = opts.isCharacterActive(id) === true; } catch (_) {}
      }
      if (!active) continue;
      if (isDisabledContact(id, opts)) continue;
      out.push(id);
    }
    return out;
  }

  function isStoryComplete(storyJson, storyPath, opts) {
    const onceKey = token(storyJson && storyJson.onceKey || "");
    if (onceKey && opts.completedSet instanceof Set && opts.completedSet.has(onceKey)) return true;
    if (onceKey && typeof opts.isStoryComplete === "function") {
      try {
        if (opts.isStoryComplete(storyJson, storyPath, onceKey) === true) return true;
      } catch (_) {}
    }
    return false;
  }

  function canAccessStoryPath(storyJson, storyPath, contactId, opts) {
    if (typeof opts.canAccessStory !== "function") return true;
    try {
      return opts.canAccessStory({
        path: storyPath,
        storyPath,
        contactId: contactId || token(storyJson && storyJson.contactId || ""),
        characterId: contactId || token(storyJson && storyJson.contactId || ""),
        day: dayFromPath(storyPath)
      }) !== false;
    } catch (_) {
      return true;
    }
  }

  async function resolveSegmentScheduledPath(rawPath, opts) {
    const routeMap = opts.routeMap || opts.characterRouteMap || null;
    const sequences = routeMap && routeMap.sequences && typeof routeMap.sequences === "object" ? routeMap.sequences : null;
    if (!sequences) return "";

    const requestedPath = normalizeStoryPath(rawPath);
    const currentPath = normalizeStoryPath(opts.currentStoryPath || (Array.isArray(opts.skipTrail) ? opts.skipTrail[0] : ""));
    const requestedDay = dayFromPath(requestedPath);
    const currentDay = dayFromPath(currentPath);
    let day = requestedDay || currentDay;
    // Finish every eligible segment for the active characters before moving
    // into the next day. Non-selectable system actors are excluded from the
    // disabled filter by isDisabledContact, avoiding the former day-boundary
    // loop without dropping active-character evening/night episodes.
    if (currentDay >= 9 && currentDay <= 15 && (!requestedDay || requestedDay > currentDay || /\/DEV\//i.test(requestedPath))) {
      day = currentDay;
    }
    if (day < 9 || day > 15) return "";

    const activeIds = activeCharacterIds(opts);
    if (!activeIds.length) return "";

    const entries = [];
    for (const contactId of activeIds) {
      const route = normalizeRoute(routeForContact(contactId, opts));
      const sequence = sequences[`DAY${day}:${contactId}:${route}`];
      if (!Array.isArray(sequence) || !sequence.length) continue;
      for (let index = 0; index < sequence.length; index += 1) {
        const path = normalizeStoryPath(sequence[index]);
        if (!path) continue;
        let json = null;
        try {
          json = await opts.loadStoryJson(path);
        } catch (_) {
          continue;
        }
        const owner = token((opts.inferContactId && opts.inferContactId(json, path)) || inferContactIdFromStory(json, path) || contactId);
        const segment = segmentFromPath(path) || segmentFromSequenceIndex(index, sequence.length);
        if (!segment || !SEGMENTS.includes(segment)) continue;
        if (!canAccessStoryPath(json, path, owner || contactId, opts)) continue;
        entries.push({
          path,
          storyJson: json,
          contactId: owner || contactId,
          segment,
          segmentIndex: segmentRank(segment),
          complete: isStoryComplete(json, path, opts)
        });
      }
    }

    const pending = entries.filter((entry) => !entry.complete);
    if (!pending.length) {
      // When a continuation crosses a day boundary, we first keep the current
      // day selected so any remaining eligible episodes cannot be dropped.
      // If that day is genuinely exhausted, retry the requested day without
      // the current-story pin. This prevents an inaccessible raw target (for
      // example a gated character's morning episode) from leaking through
      // after the scheduler correctly filtered that character's prior day.
      if (day === currentDay && requestedDay > currentDay) {
        return resolveSegmentScheduledPath(requestedPath, {
          ...opts,
          currentStoryPath: "",
          skipTrail: []
        });
      }
      return "";
    }

    const requestedNormalized = requestedPath.toLowerCase();
    const requestedEntry = pending.find((entry) => entry.path.toLowerCase() === requestedNormalized) || null;
    const requestedSegmentIndex = requestedEntry
      ? requestedEntry.segmentIndex
      : (requestedDay === day ? segmentRank(segmentFromPath(requestedPath)) : 999);

    for (let segmentIndex = 0; segmentIndex < SEGMENTS.length; segmentIndex += 1) {
      const segmentPending = pending.filter((entry) => entry.segmentIndex === segmentIndex);
      if (!segmentPending.length) continue;
      if (requestedEntry && requestedEntry.segmentIndex === segmentIndex) return requestedEntry.path;
      if (requestedSegmentIndex > segmentIndex || !requestedEntry) return segmentPending[0].path;
      return "";
    }

    return "";
  }

  function activeSetForOptions(opts) {
    if (opts.activeSet instanceof Set) return opts.activeSet;
    const listed = Array.isArray(opts.activeCharacters) ? opts.activeCharacters : [];
    const active = new Set(listed.map(token).filter(Boolean));
    if (typeof opts.isCharacterActive === "function") {
      for (const id of (Array.isArray(opts.characterIds) ? opts.characterIds : [])) {
        try {
          if (opts.isCharacterActive(id)) active.add(id);
        } catch (_) {}
      }
    }
    return active;
  }

  function evaluateCondition(raw, opts) {
    const condition = String(raw || "").trim();
    if (!condition) return false;
    if (/^not\s+/i.test(condition)) return !evaluateCondition(condition.replace(/^not\s+/i, "").trim(), opts);
    const negated = condition.startsWith("!");
    const clean = negated ? condition.slice(1) : condition;
    const separator = clean.indexOf(":");
    const key = token(separator >= 0 ? clean.slice(0, separator) : clean);
    const tail = separator >= 0 ? clean.slice(separator + 1) : "";
    const expected = token(tail);
    let result = false;

    if (key === "all" || key === "any") {
      const conditions = tail.split(/[|,]/).map((part) => part.trim()).filter(Boolean);
      result = conditions.length > 0 && (key === "all"
        ? conditions.every((part) => evaluateCondition(part, opts))
        : conditions.some((part) => evaluateCondition(part, opts)));
    } else if (key === "once") {
      if (typeof opts.isOnceDone === "function") {
        try { result = opts.isOnceDone(expected) === true; } catch (_) {}
      }
    } else if (key === "active_character") {
      const id = expected;
      result = !!(id && opts.activeSet && opts.activeSet.has(id));
      if (!result && id && typeof opts.isCharacterActive === "function") {
        try { result = opts.isCharacterActive(id) === true; } catch (_) {}
      }
    } else {
      const routeMatch = key.match(/^route_([a-z0-9_]+)_locked_v1$/);
      if (routeMatch) {
        result = routeMatches(expected, routeForContact(routeMatch[1], opts));
      } else if (key === "choice") {
        result = false;
      }
    }

    return negated ? !result : result;
  }

  function firstReachableTransition(storyJson, opts) {
    const json = storyJson && typeof storyJson === "object" ? storyJson : {};
    function scan(steps) {
      const arr = Array.isArray(steps) ? steps : [];
      for (const step of arr) {
        if (!step || typeof step !== "object") continue;
        const type = token(step.type || "");
        if (type === "if") {
          const branch = evaluateCondition(step.condition, opts) ? step.then : step.else;
          const hit = scan(branch);
          if (hit) return hit;
          continue;
        }
        const transition = transitionFromStep(step, json, opts);
        if (transition) return transition;
      }
      return null;
    }
    return scan(json.steps);
  }

  function dayFromPath(path) {
    const m = String(path || "").match(/\/DAY(\d+)\//i) || String(path || "").match(/DAY(\d+)_/i);
    return m ? Number(m[1] || 0) || 0 : 0;
  }

  function canSeedPriorStory(meta, opts) {
    const contactId = token(meta && meta.contactId || "");
    if (!contactId) return false;
    if (contactId === "aiden" || contactId === "tutor") return true;
    if (opts.activeSet && opts.activeSet.has(contactId)) return true;
    return false;
  }

  async function simulateStartCandidate(candidate, opts, seedKeys) {
    const completed = new Set([...(opts.completedSet || []), ...(seedKeys || [])].map(token).filter(Boolean));
    const visited = new Set();
    let path = resolveLogicalAlias(normalizeStoryPath(candidate && candidate.path || ""), opts);
    let hops = 0;

    while (path && hops < MAX_HOPS) {
      hops += 1;
      if (visited.has(path)) return { ok: false, reason: "start_chain_loop", path };
      visited.add(path);

      let json = null;
      try {
        json = await opts.loadStoryJson(path);
      } catch (err) {
        return { ok: false, reason: "load_failed", path, error: String(err && err.message ? err.message : err) };
      }
      if (!json || typeof json !== "object") return { ok: false, reason: "invalid_json", path };

      const contactId = token((opts.inferContactId && opts.inferContactId(json, path)) || inferContactIdFromStory(json, path));
      if (isDisabledContact(contactId, opts)) {
        const resolved = await resolveContinuation(path, {
          ...opts,
          autoSwitch: true,
          markStoryComplete: (story, storyPath, ownerId) => {
            const onceKey = token(story && story.onceKey || "");
            if (onceKey) completed.add(onceKey);
            if (typeof opts.markStoryComplete === "function") opts.markStoryComplete(story, storyPath, ownerId);
          }
        });
        if (!resolved.ok || !resolved.path) return { ok: false, reason: resolved.reason || "disabled_resolution_failed", path, resolved };
        path = normalizeStoryPath(resolved.path);
        continue;
      }

      if (!requirementsMetByKeys(json, completed)) {
        return {
          ok: false,
          reason: "requirements_not_met",
          path,
          contactId,
          requireOnceKey: String(json.requireOnceKey || "").trim(),
          completedKeys: Array.from(completed).sort()
        };
      }

      const onceKey = token(json.onceKey || "");
      if (onceKey) completed.add(onceKey);

      const transition = firstReachableTransition(json, opts);
      const nextPath = transition && transition.startStory
        ? transition.startStory
        : resolveLogicalAlias(normalizeStoryPath(json.onCompleteStartStory || ""), opts);
      if (!nextPath) return { ok: true, completedKeys: Array.from(completed).sort(), endPath: path };
      if (nextPath.toLowerCase().includes("/dev/") || dayFromPath(nextPath) !== Number(opts.day || 0)) {
        return { ok: true, completedKeys: Array.from(completed).sort(), endPath: nextPath };
      }
      path = nextPath;
    }

    return { ok: false, reason: "start_chain_too_deep", path };
  }

  async function resolveStartEntry(rawOptions) {
    const opts = rawOptions && typeof rawOptions === "object" ? rawOptions : {};
    if (typeof opts.loadStoryJson !== "function") throw new Error("UpdateSafetyResolver requires loadStoryJson");

    const day = Number(opts.day || 0) || 0;
    const route = token(opts.route || "") || "love";
    const activeSet = new Set((Array.isArray(opts.activeCharacters) ? opts.activeCharacters : []).map(token).filter(Boolean));
    const completedSet = new Set((Array.isArray(opts.completedOnceKeys) ? opts.completedOnceKeys : []).map(token).filter(Boolean));
    const progression = (Array.isArray(opts.routeProgressionOnceKeys) ? opts.routeProgressionOnceKeys : []).map(token).filter(Boolean);
    const candidatesByOnceKey = opts.candidatesByOnceKey && typeof opts.candidatesByOnceKey === "object" ? opts.candidatesByOnceKey : {};
    const context = { ...opts, day, route, activeSet, completedSet };
    const choices = [];
    const consideredContacts = new Set();

    for (let index = 0; index < progression.length; index += 1) {
      const onceKey = progression[index];
      const meta = candidatesByOnceKey[onceKey] || null;
      const contactId = token(meta && meta.contactId || "");
      const path = normalizeStoryPath(meta && meta.path || "");
      if (!onceKey || !path || !contactId) continue;
      if (!activeSet.has(contactId)) continue;
      if (isDisabledContact(contactId, context)) continue;
      if (consideredContacts.has(contactId)) continue;
      consideredContacts.add(contactId);

      const seedKeys = [];
      let seedable = true;
      for (let priorIndex = 0; priorIndex < index; priorIndex += 1) {
        const priorKey = progression[priorIndex];
        const priorMeta = candidatesByOnceKey[priorKey] || null;
        if (!priorKey || completedSet.has(priorKey)) continue;
        const priorContactId = token(priorMeta && priorMeta.contactId || "");
        if (priorContactId && !activeSet.has(priorContactId)) continue;
        if (!canSeedPriorStory(priorMeta, context)) {
          seedable = false;
          break;
        }
        seedKeys.push(priorKey);
      }
      if (!seedable) {
        choices.push({
          contactId,
          onceKey,
          path,
          seedOnceKeys: seedKeys,
          disabled: true,
          reason: "prior_entry_not_seedable"
        });
        continue;
      }

      let json = null;
      try {
        json = await opts.loadStoryJson(path);
      } catch (_) {
        continue;
      }
      const candidateCompleted = new Set([...completedSet, ...seedKeys]);
      if (!requirementsMetByKeys(json, candidateCompleted)) {
        choices.push({
          contactId,
          onceKey,
          path,
          seedOnceKeys: seedKeys,
          disabled: true,
          reason: "requirements_not_met",
          requireOnceKey: String(json && json.requireOnceKey || "").trim()
        });
        continue;
      }

      const simulation = await simulateStartCandidate({ onceKey, path, contactId }, context, seedKeys);
      if (!simulation.ok) {
        choices.push({
          contactId,
          onceKey,
          path,
          seedOnceKeys: seedKeys,
          disabled: true,
          reason: simulation.reason || "unsafe_chain",
          detail: simulation
        });
        continue;
      }

      choices.push({
        contactId,
        onceKey,
        path,
        seedOnceKeys: seedKeys,
        disabled: false,
        reason: "",
        completedPreviewOnceKeys: simulation.completedKeys || []
      });
    }

    const available = choices.filter((choice) => !choice.disabled);
    const requested = token(opts.primaryCharacter || "");
    const selected = available.find((choice) => choice.contactId === requested) || available[0] || null;
    const fallback = normalizeStoryPath(opts.fallbackStory || "");
    return {
      ok: !!selected || !!fallback,
      choices,
      selected,
      path: selected ? selected.path : fallback,
      contactId: selected ? selected.contactId : "",
      seedOnceKeys: selected ? selected.seedOnceKeys.slice() : [],
      reason: selected ? "" : (available.length ? "primary_unavailable" : "no_safe_character_entry")
    };
  }

  // Mirrors a real, general, always-active guard in convo-runtime.js's own
  // Game.startStory() (the `json.onceKey && onceDone(json.onceKey)` branch):
  // that function NEVER replays a story whose onceKey is already complete --
  // it always resolves forward instead (findNextLogicalStoryAfterCompleted).
  // An authored same-day hand-off chain (e.g. "whichever active character
  // hasn't had their evening slot yet gets it next") can legitimately walk
  // back to a node this same call already visited, once every character on
  // that cycle has already taken their turn today -- that is not a genuine
  // dead end for a real player (the real guard above would silently resolve
  // it), only for a naive path-walker that doesn't know a node is "done".
  // Re-derive the cycle's own starting branch with every character
  // encountered on the cycle excluded from "active" consideration, so the
  // SAME authored if/else chain falls through to whatever it already does
  // when none of them are left to hand off to (its own genuine terminal
  // fallback), instead of hard-failing a walk a real player would never
  // actually get stuck on.
  function retryExhaustedRotation(cycleTrail, jsonByPath, context) {
    const rootPath = cycleTrail[0];
    const rootJson = jsonByPath.get(rootPath);
    if (!rootJson) return null;
    const excluded = new Set();
    for (const p of cycleTrail) {
      const owner = token(inferContactIdFromStory(jsonByPath.get(p), p));
      if (owner) excluded.add(owner);
    }
    if (!excluded.size) return null;
    const baseActive = context.activeSet instanceof Set ? context.activeSet : activeSetForOptions(context);
    const overriddenActiveSet = new Set(Array.from(baseActive).filter((id) => !excluded.has(id)));
    const overriddenIsCharacterActive = typeof context.isCharacterActive === "function"
      ? (id) => !excluded.has(token(id)) && context.isCharacterActive(id) === true
      : context.isCharacterActive;
    const overriddenContext = { ...context, activeSet: overriddenActiveSet, isCharacterActive: overriddenIsCharacterActive };
    const transition = firstReachableTransition(rootJson, overriddenContext);
    if (transition && transition.startStory) return transition.startStory;
    return resolveLogicalAlias(normalizeStoryPath(rootJson.onCompleteStartStory || ""), overriddenContext) || null;
  }

  async function resolveContinuation(rawPath, options) {
    const opts = options && typeof options === "object" ? options : {};
    const loadStoryJson = opts.loadStoryJson;
    if (typeof loadStoryJson !== "function") throw new Error("UpdateSafetyResolver requires loadStoryJson");

    const context = { ...opts, activeSet: activeSetForOptions(opts) };
    let path = resolveLogicalAlias(normalizeStoryPath(rawPath), context);
    let initialSideGlue = false;
    let initialNonRoutedActor = false;
    try {
      const initialJson = await loadStoryJson(path);
      const initialContactId = token((context.inferContactId && context.inferContactId(initialJson, path)) || inferContactIdFromStory(initialJson, path));
      initialSideGlue = initialContactId === "tutor" && !!normalizeStoryPath(initialJson && initialJson.onCompleteStartStory || "");
      const routedIds = new Set((Array.isArray(context.characterIds) ? context.characterIds : []).map(token).filter(Boolean));
      const requestedDay = dayFromPath(path);
      const currentDay = dayFromPath(context.currentStoryPath || "");
      initialNonRoutedActor = !!initialContactId && routedIds.size > 0 && !routedIds.has(initialContactId) && requestedDay > currentDay;
    } catch {}
    // A cross-day explicit shared/system-actor successor is the new day's
    // ordering boundary. Same-day shared actors still pass through segment
    // scheduling so remaining routed evening/night episodes are not skipped.
    if (!initialSideGlue) {
      const scheduledPath = await resolveSegmentScheduledPath(path, context);
      const scheduledDay = dayFromPath(scheduledPath);
      const currentDay = dayFromPath(context.currentStoryPath || "");
      if (scheduledPath && (!initialNonRoutedActor || (currentDay > 0 && scheduledDay <= currentDay))) path = scheduledPath;
    }
    const trail = [];
    const visited = new Set();
    const skipped = [];
    const jsonByPath = new Map();
    while (path) {
      if (trail.length >= MAX_HOPS) {
        return {
          ok: false,
          path: "",
          reason: "disabled_chain_loop_or_too_deep",
          trail,
          skipped
        };
      }
      if (visited.has(path)) {
        const cycleStartIndex = trail.indexOf(path);
        const cycleTrail = cycleStartIndex >= 0 ? trail.slice(cycleStartIndex) : trail.slice();
        const retried = cycleTrail.length ? retryExhaustedRotation(cycleTrail, jsonByPath, context) : null;
        if (retried && retried !== path && !visited.has(retried)) {
          path = retried;
        } else {
          return {
            ok: false,
            path: "",
            reason: "disabled_chain_loop_or_too_deep",
            trail,
            skipped
          };
        }
      }
      visited.add(path);
      trail.push(path);

      let json = null;
      try {
        json = await loadStoryJson(path);
      } catch (err) {
        return {
          ok: false,
          path,
          reason: "load_failed",
          trail,
          skipped,
          error: String(err && err.message ? err.message : err)
        };
      }
      if (!json || typeof json !== "object") {
        return { ok: false, path, reason: "invalid_json", trail, skipped };
      }
      jsonByPath.set(path, json);

      const contactId = token((context.inferContactId && context.inferContactId(json, path)) || inferContactIdFromStory(json, path));
      const disabled = isDisabledContact(contactId, context);
      // A 'tutor'-owned story is pure narrative-invisible routing glue
      // whether it hands off via its own top-level onCompleteStartStory
      // field OR (e.g. story/DAY15/DAY15_02_HAILEY_EVENING.json, and the
      // story/DEV/*ROUTER* file it in turn hands off to -- both real,
      // shipped content, live-confirmed 2026-09-06) an embedded if-chain
      // of start_story steps evaluated the same way firstReachableTransition
      // already resolves for every other story. Missing the second form
      // meant a route dispatcher like this was treated as genuine,
      // distinct, "eligible" content in its own right (contactId 'tutor'
      // played as though it were a character), which for a story/DEV/*
      // target then hard-stopped this exact QA check before Day16-20 were
      // ever reached -- a stale QA-side assumption, not a real dead end:
      // convo-runtime.js's own startStory() never gets stuck here either,
      // since the router's target is either fresh content or (per the
      // retryExhaustedRotation comment above) an already-done story it
      // already knows how to resolve past.
      const transition = firstReachableTransition(json, context);
      const routerHandoff = normalizeStoryPath((transition && transition.startStory) || json.onCompleteStartStory || "");
      const sideGlue = contactId === "tutor" && !!routerHandoff;
      const complete = isStoryComplete(json, path, context);
      const routedIds = new Set((Array.isArray(context.characterIds) ? context.characterIds : []).map(token).filter(Boolean));
      const folderRoute = token((path.match(/\/(love|ntr|nts)\//i) || [])[1] || json.route || "");
      const routeMismatch = routedIds.has(contactId) && !!folderRoute && !routeMatches(folderRoute, routeForContact(contactId, context));

      if (!disabled && !sideGlue && !complete && !routeMismatch) {
        return {
          ok: true,
          path,
          storyJson: json,
          contactId,
          onceKey: token(json.onceKey || ""),
          trail,
          skipped,
          mode: opts.autoSwitch === true ? "auto_start" : "manual_notification"
        };
      }

      // An unavailable character episode is bypassed for this scheduling pass;
      // it is deliberately not completed.  This keeps the save compatible with
      // enabling that character later and prevents fabricated route progress.
      if (!disabled && !routeMismatch && !complete && typeof context.markStoryComplete === "function") {
        try { context.markStoryComplete(json, path, contactId); } catch {}
      }

      // Disabled stories can contain route/active-character branches. Follow
      // the branch that this save would actually take; choosing the first
      // syntactic transition can hand off to a filtered contact or route.
      // (transition was already computed above, alongside the sideGlue check.)
      const nextRaw = transition && transition.startStory
        ? transition.startStory
        : resolveLogicalAlias(normalizeStoryPath(json.onCompleteStartStory || ""), context);
      const adjusted = nextRaw;
      skipped.push({
        path,
        contactId,
        reason: complete ? "already_complete" : (disabled ? "disabled_character" : (routeMismatch ? "route_mismatch" : "side_contact_glue")),
        nextPath: adjusted
      });
      if (!adjusted) {
        return {
          ok: false,
          path: "",
          reason: complete ? "completed_chain_ended" : (disabled ? "disabled_chain_ended" : "side_contact_chain_ended"),
          trail,
          skipped
        };
      }
      const scheduledNext = await resolveSegmentScheduledPath(adjusted, context);
      path = scheduledNext || adjusted;
    }

    return { ok: false, path: "", reason: "empty_target", trail, skipped };
  }

  function shouldAutoSwitch(meta) {
    const m = meta && typeof meta === "object" ? meta : {};
    if (m.timelineReplayChain === true) return true;
    if (m.replay === true || m.timelineReplay === true) return true;
    return m.autoSwitch === true;
  }

  function classifyHandoff(meta) {
    const via = token(meta && (meta.via || meta.reason || meta.chainSource || ""));
    const manualReasons = new Set([
      "oncompletestartstory",
      "conversation_on_complete",
      "start_story_step",
      "time_card",
      "next_day",
      "hak_unlock",
      "onlyfun_gate",
      "patreon_update_gate"
    ]);
    return {
      via,
      isContinuation: manualReasons.has(via),
      autoSwitch: shouldAutoSwitch(meta),
      mode: manualReasons.has(via) && !shouldAutoSwitch(meta) ? "manual_notification" : "auto_start"
    };
  }

  return {
    MAX_HOPS,
    normalizeStoryPath,
    token,
    inferContactIdFromPath,
    inferContactIdFromStory,
    firstTransition,
    firstReachableTransition,
    requirementsMetByKeys,
    classifyHandoff,
    resolveStartEntry,
    resolveContinuation
  };
});
