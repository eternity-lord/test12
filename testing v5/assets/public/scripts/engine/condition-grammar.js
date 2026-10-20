(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.ConditionGrammar=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  // Single shared production condition grammar. Every caller (live background
  // runner, live interactive renderer, StoryInterpreter, the static shadow
  // harness) parses and dispatches through evaluateCondition -- only the
  // *accessor* (how a domain's current value is read) differs between them.
  // This exists because the grammar was previously duplicated three times
  // (convo-runtime.js, conversation.html, StoryInterpreter.condition) and
  // once already silently diverged: none of the three understood "all:"/
  // "any:" compound conditions, which are real, shipped production syntax
  // (8 Day 11/13/14 files) -- every one of those conditions evaluated false
  // unconditionally until that was found and fixed. A single implementation
  // makes that class of bug structurally impossible to reintroduce: there is
  // only one place the grammar can be wrong.
  //
  // accessor interface (all required; throw {code:'CONDITION_NOT_YET_CANONICAL'}
  // for a domain the caller cannot yet answer canonically, e.g. choice:/
  // hak_target: before Groups 2/5 migrate):
  //   once(key) -> boolean
  //   activeCharacter(key) -> boolean
  //   choice(key, optionId) -> boolean
  //   hakTarget(key) -> boolean
  //   onlyfunSeen(postId) -> boolean (a viewed receipt, never publication)
  //   lookup(key) -> stored value or null/undefined if absent
  //   isTruthy(value, key) -> boolean
  //   compareEquals(storedValue, expectedTail) -> boolean
  //
  // Route locks still read through the generic canonical variable accessor.
  // Their shipped NTS aliases describe the same route family: both operands
  // must normalize here so foreground/background and interpreter decisions
  // agree even when an authored condition spells the subtype. Unknown values
  // and variables outside the exact route-lock key retain exact semantics.
  function routeFamily(value) {
    const token = String(value).trim().toLowerCase();
    return token === 'nts' || token === 'nts1' || token === 'nts_coach' ? 'nts' : token;
  }

  // ROUTE AUTHORITY FOR SUPPORT OWNERS -- the single canonical rule.
  //
  // Four characters own a route of their own (SELECTABLE_ROUTE_OWNERS). Every
  // other owning contact is a SUPPORT owner: it appears as a story's
  // contactId but never gets a route_<owner>_locked_v1 of its own. A support
  // owner's route-scoped content still belongs to exactly one selectable
  // character's route, and that character alone decides its eligibility.
  //
  // Tutor content is Hailey's NTS route. Lena/Mason/Evelyn routes must never
  // make a Tutor story eligible.
  //
  // Live tester defect this exists to prevent (packaged 2.0.0, Day10 with
  // Hailey=LOVE, Lena=NTS): story/DAY10/nts/DAY10_01_TUTOR_FIRST_MEETING_NTS
  // declares requireOnceKey "d10_01_lena_afternoon_nts_v1|d10_00_hailey_
  // morning_nts_v1" -- an OR. Lena being NTS satisfied it, and because the
  // route gate below only rejects when the OWNER itself is selectable, owner
  // "tutor" (no route lock of its own) skipped the route check entirely. The
  // NTS-only Tutor story was therefore selected as the next canonical story
  // under a LOVE Hailey, failed admission, and the idle-recovery loop
  // reselected it forever.
  //
  // Exported so the runtime's own candidate scans use this exact rule rather
  // than a second copy of it (scripts/convo-runtime.js:
  // logicalCandidateRouteMatches).
  const SELECTABLE_ROUTE_OWNERS = Object.freeze(['evelyn', 'hailey', 'mason', 'lena']);
  const SUPPORT_ROUTE_AUTHORITY = Object.freeze({ tutor: 'hailey' });
  function routeAuthorityOwner(ownerId) {
    const cid = String(ownerId == null ? '' : ownerId).trim().toLowerCase();
    return SUPPORT_ROUTE_AUTHORITY[cid] || cid;
  }

  function notYetCanonical(domain) {
    return Object.assign(new Error(`condition domain not yet canonical: ${domain}`), { code: 'CONDITION_NOT_YET_CANONICAL', domain });
  }

  function evaluateCondition(rawExpr, accessor) {
    const expr = String(rawExpr || '').trim();
    if (!expr) return false;

    if (/^not\s+/i.test(expr)) return !evaluateCondition(expr.replace(/^not\s+/i, '').trim(), accessor);
    if (expr.startsWith('!')) return !evaluateCondition(expr.slice(1), accessor);

    const sep = expr.indexOf(':');
    const rawHead = (sep >= 0 ? expr.slice(0, sep) : expr).trim();
    const head = rawHead.toLowerCase();
    const tail = (sep >= 0 ? expr.slice(sep + 1) : '').trim();

    if (head === 'all' || head === 'any') {
      const parts = tail.split(/[|,]/).map((p) => p.trim()).filter(Boolean);
      if (!parts.length) return false;
      return head === 'all'
        ? parts.every((p) => evaluateCondition(p, accessor))
        : parts.some((p) => evaluateCondition(p, accessor));
    }

    if (head === 'once') return !!accessor.once(tail);
    if (head === 'active_character') { if (!tail) return false; return !!accessor.activeCharacter(tail); }
    if (head === 'hak_target') return !!accessor.hakTarget(tail);
    if (head === 'onlyfun_seen') {
      if (!tail) return false;
      if (typeof accessor.onlyfunSeen !== 'function') throw notYetCanonical('onlyfun_seen');
      return accessor.onlyfunSeen(tail) === true;
    }
    if (head === 'choice') {
      const split = tail.indexOf(':');
      if (split < 0) return false;
      return !!accessor.choice(tail.slice(0, split).trim(), tail.slice(split + 1).trim());
    }

    if (sep >= 0) {
      const stored = accessor.lookup(rawHead);
      if (stored == null) return false;
      if (!tail) return !!accessor.isTruthy(stored, rawHead);
      if (/^route_[a-z0-9_]+_locked_v1$/i.test(rawHead)) return routeFamily(stored) === routeFamily(tail);
      return !!accessor.compareEquals(stored, tail);
    }

    const direct = accessor.lookup(rawHead);
    if (direct != null) return !!accessor.isTruthy(direct, rawHead);
    return !!accessor.once(rawHead);
  }

  // Static analysis helper: which accessor domains a condition expression
  // (including its nested all:/any: sub-parts) actually touches, without
  // evaluating it. Used by the batch harness to classify coverage and by
  // callers deciding whether a condition can be answered canonically yet.
  function extractDomains(rawExpr, into) {
    const domains = into || new Set();
    const expr = String(rawExpr || '').trim();
    if (!expr) return domains;
    if (/^not\s+/i.test(expr)) return extractDomains(expr.replace(/^not\s+/i, '').trim(), domains);
    if (expr.startsWith('!')) return extractDomains(expr.slice(1), domains);

    const sep = expr.indexOf(':');
    const rawHead = (sep >= 0 ? expr.slice(0, sep) : expr).trim();
    const head = rawHead.toLowerCase();
    const tail = (sep >= 0 ? expr.slice(sep + 1) : '').trim();

    if (head === 'all' || head === 'any') {
      const parts = tail.split(/[|,]/).map((p) => p.trim()).filter(Boolean);
      for (const p of parts) extractDomains(p, domains);
      return domains;
    }
    if (head === 'once') { domains.add('once'); return domains; }
    if (head === 'active_character') { domains.add('active_character'); return domains; }
    if (head === 'hak_target') { domains.add('hak_target'); return domains; }
    if (head === 'onlyfun_seen') { domains.add('onlyfun_seen'); return domains; }
    if (head === 'choice') { domains.add('choice'); return domains; }
    // Informational only -- route_<char>_locked_v1 keys are NOT a distinct
    // evaluation domain (see the header comment); they resolve through the
    // generic key/value path below like any other world.variables key. This
    // tag exists so the batch harness can report "how many conditions
    // reference route-lock-shaped keys" without implying a separate
    // accessor method is consulted for them.
    if (/^route_(.+)_locked_v1$/.test(head)) domains.add('route_lock_named_variable');
    domains.add(sep >= 0 ? 'generic_key_value' : 'generic_key');
    return domains;
  }

  function canonicalAccessor(state) {
    const world = state.world || {}, progression = state.progression || {};
    const onceKeys = progression.onceKeys || [];
    return {
      once: key => onceKeys.includes(key),
      activeCharacter: key => (world.activeCharacters || []).includes(key),
      choice: (key, option) => {
        const receipt = progression.choiceReceipts?.[String(key || '')];
        const wanted = String(option || '').trim().toLowerCase();
        return !!receipt && (String(receipt.selectedOptionId || '').trim().toLowerCase() === wanted || String(receipt.resultValue ?? '').trim().toLowerCase() === wanted);
      },
      hakTarget: key => {
        const id = String(key || '').trim().toLowerCase(), watchlist = state.hak?.watchlist || {};
        if (!id) return false;
        return Object.prototype.hasOwnProperty.call(watchlist.targets || {}, id) ? !!watchlist.targets[id] : (watchlist.selected || []).includes(id);
      },
      onlyfunSeen: key => !!key && state.onlyfun?.seenPosts?.[key] === true,
      lookup: key => Object.prototype.hasOwnProperty.call(world.variables || {}, key) ? world.variables[key] : Object.prototype.hasOwnProperty.call(world.choices || {}, key) ? world.choices[key] : onceKeys.includes(key) ? true : null,
      isTruthy: value => !!value,
      compareEquals: (stored, expected) => String(stored) === String(expected)
    };
  }

  function storyRequirements(story) {
    return Object.fromEntries(['requireOnceKey', 'requireCondition', 'requireWatched', 'requireWatchedAny', 'requireWatchedKey', 'requirePriorSameDayStories'].filter(key => story?.[key] != null).map(key => [key, Array.isArray(story[key]) ? [...story[key]] : story[key]]));
  }

  function requirementsMet(requirements, state) {
    if (!requirements) return true;
    const token = value => String(value || '').trim().toLowerCase();
    const alternatives = String(requirements.requireOnceKey || '').split('|').map(token).filter(Boolean);
    if (alternatives.length && !alternatives.some(key => (state.progression?.onceKeys || []).includes(key))) return false;
    const condition = String(requirements.requireCondition || '').trim();
    if (condition && !evaluateCondition(condition, canonicalAccessor(state))) return false;
    const selected = (state.hak?.watchlist?.selected || []).map(token), watched = token(requirements.requireWatched);
    if (watched && !selected.includes(watched)) return false;
    const any = (Array.isArray(requirements.requireWatchedAny) ? requirements.requireWatchedAny : []).map(token).filter(Boolean);
    return !any.length || any.some(key => selected.includes(key));
  }

  // Admission uses authored metadata only, and is evaluated against the
  // transaction state (including the source once key just completed). A
  // pending target never carries a cached eligibility decision across Load.
  function findRequiredPriorStoryLegacy(state, targetPath, catalog) {
    const path = String(targetPath || '').replace(/\\/g, '/').replace(/^\.\//, '');
    const targetDay = Number(path.match(/(?:^|\/)DAY(\d+)(?:\/|_)/i)?.[1] || 0);
    if (!Array.isArray(catalog)) return null;
    const normalizePath = value => String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
    const target = catalog.find(entry => normalizePath(entry.path) === path);
    const requestedSameDayPrefix = target?.requirements?.requirePriorSameDayStories === true &&
      Number(target.day) === targetDay && Number.isFinite(Number(target.order));
    if (targetDay <= 0 || (targetDay === 1 && !requestedSameDayPrefix)) return null;
    const token = value => String(value || '').trim().toLowerCase();
    const selectable = new Set(['evelyn', 'hailey', 'mason', 'lena']);
    const active = new Set((state.world?.activeCharacters || []).map(token));
    const once = new Set((state.progression?.onceKeys || []).map(token));
    // An authored same-day prefix applies only to a new admission. Older
    // saves can already own this episode at an exact nested cursor, and
    // completed episodes keep their original durable identity. These
    // exceptions do not bypass the existing checks for earlier days.
    let includeSameDayPrefix = false;
    if (requestedSameDayPrefix) {
      const execution = state.execution || {}, cursor = execution.cursor || {}, lease = execution.lease;
      const ownsTarget = !!(lease?.id && execution.activeStoryId &&
        normalizePath(execution.activeStoryPath) === path && normalizePath(cursor.storyPath) === path &&
        String(lease.storyId || '') === String(execution.activeStoryId) &&
        String(cursor.storyId || '') === String(execution.activeStoryId) &&
        String(cursor.leaseId || '') === String(lease.id) &&
        Number(lease.generation) === Number(execution.generation));
      const targetCompleted = target.onceKey ? once.has(token(target.onceKey)) :
        (state.progression?.completedStoryIds || []).includes(target.id || path);
      includeSameDayPrefix = !targetCompleted && !ownsTarget;
    }
    const world = state.world || {}, byOnce = new Map(), memo = new Map();
    for (const entry of catalog) {
      for (const key of new Set([entry.onceKey, ...(entry.authoredOnceKeys || [])].map(token).filter(Boolean))) {
        const rows = byOnce.get(key) || []; rows.push(entry); byOnce.set(key, rows);
      }
    }
    const classify = (entry, visiting = new Set()) => {
      if (once.has(token(entry.onceKey))) return { status: 'DONE' };
      if (memo.has(entry)) return memo.get(entry);
      if (visiting.has(entry)) return { status: 'UNRESOLVED', reason: 'prerequisite_cycle' };
      const owner = token(entry.contactId), route = token(entry.route);
      if (!owner && entry.ownerScope !== 'global') return { status: 'UNRESOLVED', reason: 'owner_unknown' };
      if (selectable.has(owner) && !active.has(owner)) return { status: 'INAPPLICABLE', reason: 'owner_inactive' };
      // A support owner (tutor) has no route of its own; its route-scoped
      // content is governed by the selectable character that owns that route.
      // See SUPPORT_ROUTE_AUTHORITY.
      const routeOwner = routeAuthorityOwner(owner);
      const rawRoute = world.variables?.[`route_${routeOwner}_locked_v1`] ?? world.routeLocks?.[routeOwner] ?? world.routes?.[routeOwner];
      const assigned = rawRoute == null || rawRoute === '' ? '' : routeFamily(rawRoute);
      if (route && route !== 'shared') {
        if (assigned && !['love', 'ntr', 'nts'].includes(assigned)) return { status: 'UNRESOLVED', reason: 'route_unknown' };
        if (assigned && assigned !== routeFamily(route)) return { status: 'INAPPLICABLE', reason: 'owner_route' };
        if (!assigned && selectable.has(routeOwner)) return { status: 'UNRESOLVED', reason: 'route_unassigned' };
      }
      const req = entry.requirements || {}, nonOnce = { ...req };
      delete nonOnce.requireOnceKey;
      try { if (!requirementsMet(nonOnce, state)) return { status: 'INAPPLICABLE', reason: 'authored_condition' }; }
      catch { return { status: 'UNRESOLVED', reason: 'condition_unresolved' }; }
      const alternatives = String(req.requireOnceKey || '').split('|').map(token).filter(Boolean);
      if (!alternatives.length || alternatives.some(key => once.has(key))) return { status: 'MISSING', reason: 'required_story' };
      const next = new Set(visiting); next.add(entry);
      const dependencies = alternatives.map(key => {
        const rows = byOnce.get(key) || [];
        if (!rows.length) return { status: 'UNRESOLVED', reason: 'prerequisite_unknown' };
        const states = rows.map(row => classify(row, next));
        if (states.every(row => row.status === 'INAPPLICABLE')) return { status: 'INAPPLICABLE' };
        if (rows.length > 1) return { status: 'UNRESOLVED', reason: 'prerequisite_ambiguous' };
        return states[0];
      });
      let result;
      if (!selectable.has(owner) && dependencies.every(row => row.status === 'INAPPLICABLE')) result = { status: 'INAPPLICABLE', reason: 'support_routes_inapplicable' };
      else if (dependencies.some(row => row.status === 'UNRESOLVED')) result = { status: 'UNRESOLVED', reason: dependencies.find(row => row.status === 'UNRESOLVED').reason };
      else result = { status: 'BLOCKED', reason: 'required_predecessor' };
      memo.set(entry, result);
      return result;
    };
    let blocked = null;
    for (const entry of catalog) {
      const entryDay = Number(entry.day);
      if (!(entryDay > 0 && (entryDay < targetDay ||
        (includeSameDayPrefix && entryDay === targetDay && Number(entry.order) < Number(target.order))))) continue;
      const result = classify(entry);
      if (result.status === 'MISSING') return { ...entry, ...result };
      if (!blocked && ['BLOCKED', 'UNRESOLVED'].includes(result.status)) blocked = { ...entry, ...result };
    }
    return blocked;
  }

  const chronologyIndexes = new WeakMap();
  const chronologyPath = value => String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').split(/[?#]/)[0];
  const chronologyToken = value => String(value || '').trim().toLowerCase();
  const selectableOwners = new Set(['evelyn', 'hailey', 'mason', 'lena']);
  const chronologicalClasses = ['morning', 'afternoon', 'evening', 'night'];
  const periodRank = time => {
    const declared = Number(time?.periodRank);
    if (Number.isInteger(declared) && declared >= 0 && declared < chronologicalClasses.length) return declared;
    const named = chronologicalClasses.indexOf(time?.chronologicalClass || time?.period || time?.broadPeriod);
    if (named >= 0) return named;
    const minute = Number(time?.minuteOfDay ?? (time?.startAbsoluteMinute % 1440));
    return minute >= 300 && minute < 720 ? 0 : minute >= 720 && minute < 1020 ? 1 : minute >= 1020 && minute < 1260 ? 2 : 3;
  };
  function chronologyService(options) {
    if (options?.service) return options.service;
    if (root.GameTimeService) return root.GameTimeService;
    return typeof module === 'object' && module.exports && typeof require === 'function' ? require('../game-time-service') : null;
  }
  // Only immutable authored metadata is cached. A restored world never
  // inherits eligibility, completion, route, clock or pending decisions.
  function chronologyIndex(catalog, service, suppliedManifest) {
    let manifest = suppliedManifest || (root.GameTimeService === service ? root.GameTimeManifest : null);
    if (!manifest && typeof module === 'object' && module.exports && typeof require === 'function' && service === require('../game-time-service'))
      manifest = require('../game-time-manifest');
    const previous = chronologyIndexes.get(catalog);
    if (previous?.service === service && previous.manifest === manifest) return previous;
    const index = {service, manifest, days: new Map(), paths: new Map(), byOnce: new Map(), byVariable: new Map(), conflicts: new Map(), knownTimes: 0, maxDay: 0};
    for (const conflict of manifest?.scheduleConflicts || []) {
      if (conflict.kind === 'TIME_WINDOW') continue; // Ordering classes allow serial overflow.
      const list = index.conflicts.get(Number(conflict.day)) || [];
      list.push(conflict); index.conflicts.set(Number(conflict.day), list);
    }
    for (const entry of catalog) {
      const path = chronologyPath(entry.path), time = service?.resolveStoryTime?.(path) || null;
      const day = Number(entry.day || time?.storyDay || time?.day || 0);
      if (!(day > 0)) continue;
      if (time) index.knownTimes++;
      index.maxDay = Math.max(index.maxDay, day);
      const row = {entry, path, time, day, logicalSlot: time?.logicalSlot || path};
      const timingMetadata = manifest?.slots?.[row.logicalSlot] || manifest?.slots?.[path];
      row.transportAnchorPaths = (timingMetadata?.evidence || [])
        .filter(evidence => evidence.kind === 'co_temporal_with_preceding_ordered_anchor')
        .map(evidence => chronologyPath(evidence.anchor));
      index.paths.set(path, row);
      let slots = index.days.get(day);
      if (!slots) index.days.set(day, slots = new Map());
      let slot = slots.get(row.logicalSlot);
      if (!slot) slots.set(row.logicalSlot, slot = {logicalSlot: row.logicalSlot, rows: [], time, order: Number(entry.order || 0)});
      slot.rows.push(row);
      slot.order = Math.min(slot.order, Number(entry.order || 0));
      const canonical = manifest?.canonicalSlots?.[row.logicalSlot];
      if (canonical) {
        slot.canonical = canonical;
        slot.order = Number(canonical.priority ?? slot.order);
        slot.time = {...time, chronologicalClass: canonical.chronologicalClass || canonical.period, periodRank: canonical.periodRank,
          startAbsoluteMinute: (Number(canonical.storyDay) - 1) * 1440 + Number(canonical.startMinute)};
        if (time?.preserveLiveTime !== true && (Number(time?.startAbsoluteMinute) !== slot.time.startAbsoluteMinute ||
            !canonical.physicalStories?.includes(path))) slot.inconsistentTime = true;
      } else if (manifest?.canonicalSlots && !time?.preserveLiveTime) slot.inconsistentTime = true;
      row.classRank = periodRank(canonical || time);
      for (const producer of entry.producers || []) if (producer.kind === 'variable') {
        const producers = index.byVariable.get(producer.key) || [];
        producers.push({row, producer}); index.byVariable.set(producer.key, producers);
      }
      if (slot.time && time && !time.preserveLiveTime && !slot.time.preserveLiveTime &&
          Number(slot.time.startAbsoluteMinute) !== Number(time.startAbsoluteMinute)) slot.inconsistentTime = true;
      for (const key of new Set([entry.onceKey, ...(entry.authoredOnceKeys || []), ...(entry.producers || []).filter(item => item.kind === 'once').map(item => item.key)].map(chronologyToken).filter(Boolean))) {
        const rows = index.byOnce.get(key) || [];
        rows.push(row); index.byOnce.set(key, rows);
      }
    }
    for (const [day, slots] of index.days) index.days.set(day, [...slots.values()].sort((a, b) => {
      const minute = slot => slot.time?.preserveLiveTime ? -Infinity : Number.isFinite(slot.time?.startAbsoluteMinute) ? slot.time.startAbsoluteMinute : -Infinity;
      return periodRank(a.time) - periodRank(b.time) || minute(a) - minute(b) || a.order - b.order || a.logicalSlot.localeCompare(b.logicalSlot);
    }));
    chronologyIndexes.set(catalog, index);
    return index;
  }
  function ownsChronologyRow(state, row) {
    const execution = state.execution || {}, cursor = execution.cursor || {}, lease = execution.lease;
    return !!(lease?.id && execution.activeStoryId && chronologyPath(execution.activeStoryPath) === row.path &&
      chronologyPath(cursor.storyPath) === row.path && String(lease.storyId || '') === String(execution.activeStoryId) &&
      String(cursor.storyId || '') === String(execution.activeStoryId) && String(cursor.leaseId || '') === String(lease.id) &&
      Number(lease.generation) === Number(execution.generation));
  }
  function chronologyResult(row, status, extra = {}) {
    return {...row.entry, path: row.path, day: row.day, logicalSlot: row.logicalSlot,
      startAbsoluteMinute: row.time?.startAbsoluteMinute ?? null, endAbsoluteMinute: row.time?.endAbsoluteMinute ?? null,
      periodRank: row.classRank, chronologicalClass: chronologicalClasses[row.classRank],
      preserveLiveTime: row.time?.preserveLiveTime === true, status, ...extra};
  }
  // The only next-global-story selector. Local interpreter operations keep
  // their owned lease; only completing that lease exposes another slot.
  // MISSING means an eligible unfinished story, not missing metadata.
  function getNextCanonicalStory(state, catalog, options = {}) {
    const day = Number(options.day ?? state.world?.day ?? 0);
    if (!Array.isArray(catalog) || !catalog.length || !(day > 0)) return {status: 'UNRESOLVED', reason: 'chronology_catalog_unavailable', day};
    const service = chronologyService(options), index = chronologyIndex(catalog, service, options.manifest), slots = index.days.get(day) || [];
    if (!slots.length && day <= index.maxDay) return {status: 'UNRESOLVED', reason: 'chronology_day_unknown', day};
    const world = state.world || {}, progression = state.progression || {}, once = new Set((progression.onceKeys || []).map(chronologyToken));
    const completed = new Set(progression.completedStoryIds || []), active = new Set((world.activeCharacters || []).map(chronologyToken));
    const accessor = canonicalAccessor(state), memo = new Map(), temporalModes = new Map();
    const temporalMode = row => {
      if (!row.time?.temporalCondition) return true;
      if (!temporalModes.has(row)) temporalModes.set(row, service?.isTemporalStoryActive?.(state, row.path) ?? null);
      return temporalModes.get(row);
    };
    const done = row => row.entry.onceKey ? once.has(chronologyToken(row.entry.onceKey)) : completed.has(row.entry.id || row.path);
    const routes = Object.fromEntries([...selectableOwners].map(owner => [owner, world.variables?.[`route_${owner}_locked_v1`] ?? world.routeLocks?.[owner] ?? world.routes?.[owner] ?? null]));
    const entitlementService = options.entitlementService || root.EntitlementService;
    const applicableOwner = row => {
      const owner = chronologyToken(row.entry.contactId), route = chronologyToken(row.entry.route);
      if (!owner && row.entry.ownerScope !== 'global') return {status: 'UNRESOLVED', reason: 'owner_unknown'};
      if (selectableOwners.has(owner) && !active.has(owner)) return {status: 'INAPPLICABLE', reason: 'owner_inactive'};
      // A locked update must not hold up another character's free episodes.
      // Direct admission still enforces the entitlement; this read-only
      // selection excludes it without marking its story or once key done.
      const meta = {...row.entry, path: row.path};
      if (entitlementService?.requiredEntitlementForStory?.(meta) && entitlementService.canAccessStory?.(meta) !== true)
        return {status: 'INAPPLICABLE', reason: 'premium_locked'};
      // Same support-owner route authority as classify() above -- both gates
      // must agree, or chronology and admission can disagree about whether a
      // Tutor slot exists at all. See SUPPORT_ROUTE_AUTHORITY.
      const routeOwner = routeAuthorityOwner(owner);
      const raw = world.variables?.[`route_${routeOwner}_locked_v1`] ?? world.routeLocks?.[routeOwner] ?? world.routes?.[routeOwner];
      const assigned = raw == null || raw === '' ? '' : routeFamily(raw);
      if (route && route !== 'shared') {
        if (assigned && !['love', 'ntr', 'nts'].includes(assigned)) return {status: 'UNRESOLVED', reason: 'route_unknown'};
        if (assigned && assigned !== routeFamily(route)) return {status: 'INAPPLICABLE', reason: 'owner_route'};
        if (!assigned && selectableOwners.has(routeOwner)) return {status: 'UNRESOLVED', reason: 'route_unassigned'};
      }
      return null;
    };
    const producerFeasibility = (row, producer) => {
      const owner = applicableOwner(row);
      if (owner) return owner.status;
      if (producer?.unresolved) return 'UNRESOLVED';
      if (producer?.onceKey && once.has(chronologyToken(producer.onceKey))) return 'SATISFIED';
      let unknown = false;
      for (const guard of producer?.guards || []) {
        if (guard.choiceGroupId) {
          const receipt = progression.choiceReceipts?.[guard.choiceGroupId];
          if (!receipt) { unknown = true; continue; }
          if (String(receipt.selectedOptionId) !== String(guard.selectedOptionId)) return 'INAPPLICABLE';
        } else {
          const receipt = progression.branchReceipts?.[guard.branchId];
          if (receipt) {
            if (String(receipt.selectedBranch) !== String(guard.selectedBranch)) return 'INAPPLICABLE';
          } else {
            const domains = [...extractDomains(guard.condition)];
            if (domains.some(domain => !['active_character', 'route_lock_named_variable', 'generic_key_value'].includes(domain)) ||
                (domains.includes('generic_key_value') && !domains.includes('route_lock_named_variable'))) { unknown = true; continue; }
            try { if (!evaluateCondition(guard.condition, accessor)) return 'INAPPLICABLE'; }
            catch { unknown = true; }
          }
        }
      }
      return unknown ? 'UNRESOLVED' : 'SATISFIED';
    };
    const scopedScheduleConflict = row => {
      for (const conflict of index.conflicts.get(day) || []) {
        if (chronologyPath(conflict.targetStory) !== row.path) continue;
        if (Object.entries(conflict.routes || {}).some(([owner, route]) => routes[owner] == null || routeFamily(routes[owner]) !== routeFamily(route))) continue;
        const required = (conflict.activeCharacters || []).map(chronologyToken).filter(owner => selectableOwners.has(owner));
        if (required.some(owner => !active.has(owner))) continue;
        if (conflict.activeMode !== 'required_subset' && [...active].filter(owner => selectableOwners.has(owner)).some(owner => !required.includes(owner))) continue;
        if ((conflict.requiredStories || []).some(path => {
          const candidate = index.paths.get(chronologyPath(path));
          return !candidate || applicableOwner(candidate) != null;
        })) continue;
        const conditions = typeof conflict.conditions === 'string' ? [conflict.conditions] : conflict.conditions || [];
        if (!Array.isArray(conditions) || conditions.some(value => typeof value !== 'string'))
          return {status: 'UNRESOLVED', reason: 'schedule_conflict_condition_unknown', conflictId: conflict.id || null};
        let matches;
        try { matches = conditions.every(condition => evaluateCondition(condition, accessor)); } catch { matches = false; }
        if (!matches) continue;
        return {...conflict, status: 'CHRONOLOGY_CAUSAL_CONFLICT', reason: conflict.kind || 'TIME_WINDOW',
          routeAssignment: routes, activeCharacters: [...active], conditions};
      }
      return null;
    };
    // A false mutable condition is not proof that an episode can be skipped.
    // Exact opposite route/active selection and a durable opposite choice
    // are final branch exclusions. Missing flags remain causal blockers.
    const conditionState = raw => {
      const expr = String(raw || '').trim();
      if (!expr) return {status: 'SATISFIED'};
      if (evaluateCondition(expr, accessor)) return {status: 'SATISFIED'};
      if (/^(?:!|not\s+)/i.test(expr)) {
        const positive = expr.replace(/^(?:!|not\s+)/i, '').trim();
        if (/^(?:once:|active_character:|route_[a-z0-9_]+_locked_v1:)/i.test(positive) ||
            (/^choice:/i.test(positive) && progression.choiceReceipts?.[positive.split(':')[1]]))
          return {status: 'INAPPLICABLE', reason: 'authored_condition', condition: expr};
        return {status: 'UNRESOLVED', reason: 'condition_producer_unresolved', condition: expr};
      }
      const sep = expr.indexOf(':'), head = (sep < 0 ? expr : expr.slice(0, sep)).trim(), tail = sep < 0 ? '' : expr.slice(sep + 1).trim();
      if (head === 'all' || head === 'any') {
        const parts = tail.split(/[|,]/).map(x => x.trim()).filter(Boolean).map(conditionState);
        if (head === 'all') return parts.find(x => x.status === 'INAPPLICABLE') || parts.find(x => x.status !== 'SATISFIED') || {status: 'SATISFIED'};
        return parts.find(x => x.status === 'SATISFIED') || parts.find(x => x.status !== 'INAPPLICABLE') || {status: 'INAPPLICABLE', reason: 'authored_condition', condition: expr};
      }
      if (head === 'active_character') return {status: 'INAPPLICABLE', reason: 'owner_inactive', condition: expr};
      if (/^route_[a-z0-9_]+_locked_v1$/i.test(head)) return accessor.lookup(head) == null
        ? {status: 'UNRESOLVED', reason: 'route_unassigned', condition: expr}
        : {status: 'INAPPLICABLE', reason: 'owner_route', condition: expr};
      if (head === 'choice') return progression.choiceReceipts?.[tail.split(':')[0]]
        ? {status: 'INAPPLICABLE', reason: 'durable_choice', condition: expr}
        : {status: 'UNRESOLVED', reason: 'choice_unresolved', condition: expr};
      if (head === 'once' || (sep < 0 && index.byOnce.has(chronologyToken(head)))) return {status: 'DEPENDENCY', keys: [chronologyToken(head === 'once' ? tail : head)], condition: expr};
      if (Object.prototype.hasOwnProperty.call(world.choices || {}, head) && progression.choiceReceipts?.[head]) return {status: 'INAPPLICABLE', reason: 'durable_choice', condition: expr};
      const writers = (index.byVariable.get(head) || []).filter(({producer}) => sep < 0 ? !!producer.value : String(producer.value) === tail);
      if (writers.length) {
        const possible = writers.map(item => ({...item, feasibility: producerFeasibility(item.row, item.producer)})).filter(item => item.feasibility !== 'INAPPLICABLE');
        if (!possible.length) return {status: 'INAPPLICABLE', reason: 'durable_producer_branch', condition: expr};
        return {status: 'DEPENDENCY', condition: expr, dependency: head, producerCandidates: possible};
      }
      return {status: 'UNRESOLVED', reason: head === 'hak_target' ? 'external_interaction' : 'condition_producer_unresolved', condition: expr, dependency: head};
    };
    const classify = (row, visiting = new Set()) => {
      if (done(row)) return {status: 'DONE'};
      if (memo.has(row)) return memo.get(row);
      if (visiting.has(row)) return {status: 'UNRESOLVED', reason: 'prerequisite_cycle'};
      const ownership = applicableOwner(row);
      if (ownership) return ownership;
      if (!row.time) return {status: 'UNRESOLVED', reason: 'chronology_time_unknown'};
      if (temporalMode(row) == null) return {status: 'UNRESOLVED', reason: 'chronology_temporal_condition_unknown', condition: row.time.temporalCondition};
      // An untimed control can still belong after an authored ordered slot.
      // Resolve its logical siblings with the same route/active classifier;
      // a disabled anchor owner must not skip the other preceding stories.
      // Unanchored entry routers and untimed conditional branches keep their
      // existing early transport behavior. No clock or completion is written.
      if (row.time.preserveLiveTime && row.transportAnchorPaths.length) {
        const anchoredVisit = new Set(visiting); anchoredVisit.add(row);
        for (const anchorPath of row.transportAnchorPaths) {
          const anchorLogical = index.paths.get(anchorPath)?.logicalSlot || service?.resolveStoryTime?.(anchorPath)?.logicalSlot;
          const anchorIndex = slots.findIndex(slot => slot.logicalSlot === anchorLogical);
          if (!anchorPath || anchorIndex < 0) return {status: 'UNRESOLVED', reason: 'transport_anchor_unknown', anchorPath};
          for (const precedingSlot of slots.slice(0, anchorIndex + 1)) {
            if (precedingSlot.time?.preserveLiveTime && precedingSlot.logicalSlot !== anchorLogical) continue;
            for (const predecessor of precedingSlot.rows) {
              const prior = classify(predecessor, anchoredVisit);
              if (['DONE', 'INAPPLICABLE'].includes(prior.status)) continue;
              return {status: ['UNRESOLVED', 'CHRONOLOGY_CAUSAL_CONFLICT'].includes(prior.status) ? prior.status : 'BLOCKED',
                reason: 'ordered_transport_anchor', anchorPath, predecessor: predecessor.path, predecessorResult: prior};
            }
          }
        }
      }
      let condition;
      try { condition = conditionState(row.entry.requirements?.requireCondition); }
      catch { return {status: 'UNRESOLVED', reason: 'condition_unresolved'}; }
      if (!['SATISFIED', 'DEPENDENCY'].includes(condition.status)) return condition;
      const requirements = row.entry.requirements || {}, alternatives = String(requirements.requireOnceKey || '').split('|').map(chronologyToken).filter(Boolean);
      if (condition.producerCandidates) {
        const possible = condition.producerCandidates;
        const producers = possible.map(item => ({producer: item.row.path, producerTime: item.row.time?.startAbsoluteMinute,
          sourceStepKey: item.producer.sourceStepKey, guards: item.producer.guards, feasibility: item.feasibility}));
        if (possible.every(item => item.feasibility === 'SATISFIED' && item.row.classRank > row.classRank))
          return {status: 'CHRONOLOGY_CAUSAL_CONFLICT', reason: 'later_required_producer', targetStory: row.path,
            sourceStory: options.targetPath || state.execution?.activeStoryPath || null, dependency: condition.dependency,
            producers, routeAssignment: routes, activeCharacters: [...active], conditions: requirements};
        return {status: possible.some(item => item.feasibility === 'UNRESOLVED') ? 'UNRESOLVED' : 'BLOCKED',
          reason: 'required_variable_producer', dependency: condition.dependency, producers};
      }
      const dependencyGroups = [...(alternatives.length ? [alternatives] : []), ...(condition.keys ? [condition.keys] : [])];
      const next = new Set(visiting); next.add(row);
      for (const keys of dependencyGroups) {
        if (keys.some(key => once.has(key))) continue;
        const dependencies = keys.map(key => {
          const producers = (index.byOnce.get(key) || []).filter(candidate => applicableOwner(candidate)?.status !== 'INAPPLICABLE');
          if (!producers.length) return {status: index.byOnce.has(key) ? 'INAPPLICABLE' : 'UNRESOLVED', reason: 'prerequisite_unknown', dependency: key};
          const candidates = producers.map(producer => {
            const writers = (producer.entry.producers || []).filter(item => item.kind === 'once' && chronologyToken(item.key) === key);
            const feasibility = writers.map(item => producerFeasibility(producer, item));
            const possible = !writers.length || feasibility.some(value => value !== 'INAPPLICABLE');
            return {producer, writers, feasibility, result: possible ? classify(producer, next) : {status: 'INAPPLICABLE'}};
          }).filter(item => item.result.status !== 'INAPPLICABLE');
          if (!candidates.length) return {status: 'INAPPLICABLE', dependency: key};
          if (candidates.length !== 1) return {status: 'UNRESOLVED', reason: 'prerequisite_ambiguous', dependency: key};
          const {producer, result, writers, feasibility} = candidates[0];
          if (result.status === 'UNRESOLVED' || result.status === 'CHRONOLOGY_CAUSAL_CONFLICT') return {...result, dependency: key, producer: producer.path};
          // A completion key is certain at story completion. Internal once
          // keys require branch-producer evidence before reordering.
          if (chronologyToken(producer.entry.onceKey) !== key && (!writers.length || !feasibility.includes('SATISFIED')))
            return {status: 'UNRESOLVED', reason: 'prerequisite_branch_unresolved', dependency: key, producer: producer.path};
          const later = producer.classRank > row.classRank;
          return {status: later ? 'LATER' : 'BLOCKED', reason: 'required_predecessor', dependency: key, producer: producer.path,
            producerTime: producer.time?.startAbsoluteMinute, producerRequirements: producer.entry.requirements || {}};
        });
        const possible = dependencies.filter(item => item.status !== 'INAPPLICABLE');
        if (!possible.length && !selectableOwners.has(chronologyToken(row.entry.contactId))) return {status: 'INAPPLICABLE', reason: 'support_routes_inapplicable'};
        if (possible.length && possible.every(item => item.status === 'LATER')) return {status: 'CHRONOLOGY_CAUSAL_CONFLICT', reason: 'later_required_producer',
          sourceStory: options.targetPath || state.execution?.activeStoryPath || null, targetStory: row.path,
          dependency: keys.join('|'), producers: possible, routeAssignment: routes, activeCharacters: [...active], conditions: requirements};
        const unknown = possible.find(item => item.status === 'UNRESOLVED' || item.status === 'CHRONOLOGY_CAUSAL_CONFLICT');
        if (unknown && !possible.some(item => item.status === 'BLOCKED')) return unknown;
        return {status: 'BLOCKED', reason: 'required_predecessor', dependencies};
      }
      if (!requirementsMet({...requirements, requireOnceKey: null, requireCondition: null}, state)) return {status: 'BLOCKED', reason: 'external_interaction'};
      const access = options.canAccessStory;
      if (access && access(row.entry) !== true) return {status: 'BLOCKED', reason: 'access_denied'};
      const interaction = options.blockingInteraction?.(row.path);
      if (interaction) return {status: 'BLOCKED', reason: 'external_interaction', blockingInteraction: interaction};
      const result = {status: 'MISSING', reason: 'required_story'};
      memo.set(row, result); return result;
    };
    if (options.respectActive !== false) {
      const activeRow = index.paths.get(chronologyPath(state.execution?.activeStoryPath));
      const completedByThisTransaction = activeRow && chronologyPath(options.completedStoryPath) === activeRow.path && done(activeRow);
      if (activeRow && activeRow.day === day && !completedByThisTransaction && ownsChronologyRow(state, activeRow)) return chronologyResult(activeRow, 'ACTIVE', {reason: 'owned_logical_story'});
    }
    let blocked = null, transportBlocked = null;
    // Conditional episodes whose selected branch has no timed content are
    // transport too. Resolve them before time buckets so a completed router
    // receipt can unlock Morning without pretending the clock reached its
    // other route's 16:00 or 23:00 scene.
    for (const slot of slots) for (const row of slot.rows) {
      if (!(row.time?.preserveLiveTime || temporalMode(row) === false)) continue;
      const result = classify(row);
      if (['DONE', 'INAPPLICABLE'].includes(result.status)) continue;
      if (result.status === 'MISSING') return chronologyResult(row, 'MISSING', {...result, preserveLiveTime: true});
      if (!transportBlocked) transportBlocked = chronologyResult(row, result.status, {...result, preserveLiveTime: true});
    }
    for (const slot of slots) {
      if (blocked && periodRank(slot.time) > blocked.periodRank) return blocked;
      for (const row of slot.rows) {
        if (row.time?.preserveLiveTime || temporalMode(row) === false) continue;
        if (slot.canonical?.physicalByRoute && selectableOwners.has(chronologyToken(slot.canonical.owner))) {
          const assigned = routes[chronologyToken(slot.canonical.owner)];
          const variant = assigned == null ? null : slot.canonical.physicalByRoute[routeFamily(assigned)] || slot.canonical.physicalByRoute.shared;
          if (assigned != null && ['love', 'ntr', 'nts'].includes(routeFamily(assigned)) && chronologyPath(variant) !== row.path) continue;
        }
        const result = classify(row);
        if (['DONE', 'INAPPLICABLE'].includes(result.status)) continue;
        if ((['UNRESOLVED', 'CHRONOLOGY_CAUSAL_CONFLICT'].includes(result.status) || ['external_interaction', 'access_denied'].includes(result.reason)) && !slot.time?.preserveLiveTime && temporalMode(row) !== false)
          return chronologyResult(row, result.status, result);
        // A zero-duration technical router is transport, not an earlier
        // narrative interval. Its later prerequisite cannot stop Morning
        // from running; an unresolved router still blocks day completion.
        const transport = slot.time?.preserveLiveTime === true || temporalMode(row) === false;
        if (transport && result.status !== 'MISSING') {
          if (!transportBlocked) transportBlocked = chronologyResult(row, result.status, result);
          continue;
        }
        if (slot.inconsistentTime) return chronologyResult(row, 'UNRESOLVED', {reason: 'route_dependent_logical_time'});
        if (result.status === 'MISSING') {
          const conflict = scopedScheduleConflict(row);
          return chronologyResult(row, conflict?.status || 'MISSING', {...(conflict || result), ...(transport ? {preserveLiveTime: true} : {})});
        }
        if (!blocked) blocked = chronologyResult(row, result.status, result);
      }
    }
    return blocked || transportBlocked || {status: 'DAY_COMPLETE', day};
  }

  function findRequiredPriorStory(state, targetPath, catalog, options = {}) {
    const path = chronologyPath(targetPath), day = Number(state.world?.day || 0);
    const service = chronologyService(options), time = service?.resolveStoryTime?.(path);
    if (!(day > 0) || !Array.isArray(catalog) || catalog.length === 0) return findRequiredPriorStoryLegacy(state, targetPath, catalog);
    const index = chronologyIndex(catalog, service, options.manifest), target = index.paths.get(path);
    if (!time) return index.knownTimes && target ? {status: 'UNRESOLVED', reason: 'chronology_time_unknown', path} : findRequiredPriorStoryLegacy(state, targetPath, catalog);
    if (!target && time.preserveLiveTime) {
      const remaining = getNextCanonicalStory(state, catalog, {...options, day, targetPath: path, service});
      return remaining.status === 'DAY_COMPLETE' ? null : remaining;
    }
    if (!target) return {status: 'UNRESOLVED', reason: 'chronology_target_unknown', path};
    // A restored owned episode is never reselected. Its actual completion
    // releases this exemption through the same transaction's once marker.
    if (ownsChronologyRow(state, target)) return null;
    if (target.day < day) return null; // Already-completed fallback is resolved by the global selector.
    const current = getNextCanonicalStory(state, catalog, {...options, day, targetPath: path, service});
    if (current.status !== 'DAY_COMPLETE') return current.path === path && current.status === 'MISSING' ? null : current;
    if (target.day === day) return null;
    // No direct continuation may leap over a narrative day. Only the next
    // day is inspected after the current day has been proven complete.
    const next = getNextCanonicalStory(state, catalog, {...options, day: day + 1, targetPath: path, service, respectActive: false});
    if (next.status === 'DAY_COMPLETE') return target.day === day + 1 ? null : {status: 'UNRESOLVED', reason: 'chronology_day_gap', day: day + 1, path};
    return next.path === path && next.status === 'MISSING' ? null : next;
  }

  return { evaluateCondition, extractDomains, notYetCanonical, canonicalAccessor, storyRequirements, requirementsMet, findRequiredPriorStory, getNextCanonicalStory, routeAuthorityOwner, routeFamily, SELECTABLE_ROUTE_OWNERS, SUPPORT_ROUTE_AUTHORITY };
});
