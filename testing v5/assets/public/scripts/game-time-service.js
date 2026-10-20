(function (root, factory) {
  'use strict';
  const manifest = typeof module === 'object' && module.exports
    ? require('./game-time-manifest') : root.GameTimeManifest;
  const api = factory(manifest);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GameTimeService = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createGameTimeService(manifest) {
  'use strict';
  if (!manifest || !manifest.slots) throw new Error('GAME_TIME_MANIFEST_REQUIRED');

  // Half-open intervals. This table is shared by current and historical time;
  // neither the clock nor its formatting consults the host date or timezone.
  const periods = Object.freeze([
    [0, 60, 'night', 'midnight'],
    [60, 300, 'night', 'small_hours'],
    [300, 480, 'morning', 'early_morning'],
    [480, 660, 'morning', 'morning'],
    [660, 720, 'morning', 'late_morning'],
    [720, 780, 'afternoon', 'noon'],
    [780, 900, 'afternoon', 'early_afternoon'],
    [900, 1020, 'afternoon', 'late_afternoon'],
    [1020, 1140, 'evening', 'early_evening'],
    [1140, 1260, 'evening', 'late_evening'],
    [1260, 1380, 'night', 'night'],
    [1380, 1440, 'night', 'late_night']
  ].map(([start, end, broadPeriod, precisePeriod]) => Object.freeze({start, end, broadPeriod, precisePeriod})));
  const validMinute = value => Number.isInteger(value) && value >= 0 && value < 1440;
  const validAbsolute = value => Number.isSafeInteger(value) && value >= 0;
  const validDay = value => Number.isInteger(value) && value >= 1;
  const token = value => typeof value === 'string' ? value : '';
  const dayBase = day => (day - 1) * 1440;
  const localMinute = absolute => absolute % 1440;
  function isStoredClock(clock) {
    if (!validMinute(clock?.minuteOfDay)) return false;
    if (clock.version === 1) return true;
    return clock.version === 2 && validAbsolute(clock.absoluteMinute) && localMinute(clock.absoluteMinute) === clock.minuteOfDay
      && validAbsolute(clock.slotStartAbsoluteMinute) && clock.slotStartAbsoluteMinute <= clock.absoluteMinute
      && (clock.anchorOffsetMinutes == null || validAbsolute(clock.anchorOffsetMinutes))
      && validAbsolute(clock.elapsedSeconds) && Array.isArray(clock.elapsedKeys) && clock.elapsedKeys.every(key => typeof key === 'string');
  }
  function classifyGameTime(minuteOfDay) {
    if (!validMinute(minuteOfDay)) throw new RangeError('INVALID_GAME_TIME_MINUTE');
    const row = periods.find(period => minuteOfDay >= period.start && minuteOfDay < period.end);
    return {broadPeriod: row.broadPeriod, precisePeriod: row.precisePeriod, description: row.precisePeriod};
  }
  function normalizePath(value) {
    const text = token(value).replace(/\\/g, '/').split(/[?#]/)[0];
    const storyIndex = text.search(/(?:^|\/)story\//i);
    return (storyIndex >= 0 ? text.slice(storyIndex).replace(/^\//, '') : text).replace(/^\.\//, '');
  }
  function progressionPath(value) {
    const path = normalizePath(value);
    return manifest.progressionAliases?.[path] || path;
  }
  function resolveStoryTime(pathOrId) {
    const path = normalizePath(pathOrId);
    const logicalSlot = manifest.aliases?.[path] || manifest.onceKeys?.[path] || (manifest.slots[path] ? path : null);
    const row = logicalSlot && manifest.slots[logicalSlot];
    if (row?.preserveLiveTime === true && (validDay(row.day) || row.day === null)) return {day: row.day, minuteOfDay: null, preserveLiveTime: true, logicalSlot, sourceStory: path};
    if (!row || !validDay(row.day) || !validMinute(row.minuteOfDay)) return null;
    const physical = manifest.progression?.[progressionPath(path)];
    const startMinute = validAbsolute(physical?.startMinute) ? physical.startMinute : validAbsolute(row.startMinute) ? row.startMinute : null;
    const endMinute = validAbsolute(physical?.endMinute) ? physical.endMinute : validAbsolute(row.endMinute) ? row.endMinute : startMinute;
    const startMinuteOfDay = startMinute != null ? startMinute % 1440 : validMinute(physical?.startMinuteOfDay) ? physical.startMinuteOfDay
      : validMinute(row.startMinuteOfDay) ? row.startMinuteOfDay : row.minuteOfDay;
    const endMinuteOfDay = endMinute != null ? endMinute % 1440 : validMinute(physical?.endMinuteOfDay) ? physical.endMinuteOfDay
      : validMinute(row.endMinuteOfDay) ? row.endMinuteOfDay : startMinuteOfDay;
    return {day: row.day, minuteOfDay: startMinuteOfDay, startMinuteOfDay, endMinuteOfDay,
      storyDay: row.day, startMinute: startMinute ?? startMinuteOfDay, endMinute: endMinute ?? endMinuteOfDay,
      startAbsoluteMinute: dayBase(row.day) + (startMinute ?? startMinuteOfDay), endAbsoluteMinute: dayBase(row.day) + (endMinute ?? endMinuteOfDay),
      ...(startMinute != null ? {absoluteMinute: dayBase(row.day) + startMinute} : {}),
      calendarOffset: Math.floor((startMinute ?? startMinuteOfDay) / 1440), absoluteTimeline: startMinute != null,
      ...(validAbsolute(row.windowStartMinute) && validAbsolute(row.windowEndMinute) ? {windowStartMinute:row.windowStartMinute,windowEndMinute:row.windowEndMinute} : {}),
      ...(typeof row.temporalCondition==='string'?{temporalCondition:row.temporalCondition}:{}),
      ...(typeof row.chronologicalClass === 'string' ? {chronologicalClass: row.chronologicalClass} : {}),
      ...(Number.isInteger(row.periodRank) ? {periodRank: row.periodRank} : {}),
      hour: Math.floor(startMinuteOfDay / 60), minute: startMinuteOfDay % 60,
      ...classifyGameTime(startMinuteOfDay), logicalSlot, sourceStory: path};
  }
  // Same address convention as StoryPosition.formatPath. The generated
  // weights are immutable; a clock update reads one position, never the story
  // corpus or accumulated conversation history.
  function cursorPositionKey(cursor) {
    if (!cursor || !Number.isInteger(cursor.rootIndex) || cursor.rootIndex < 0) return null;
    if (cursor.branchPath != null && !Array.isArray(cursor.branchPath)) return null;
    let key = String(cursor.rootIndex);
    for (const hop of cursor.branchPath || []) {
      if (!hop || !['then', 'else'].includes(hop.branch) || !Number.isInteger(hop.index) || hop.index < 0) return null;
      key += '.' + hop.branch + '.' + hop.index;
    }
    return key;
  }
  function elapsedAtCursor(storyPath, cursor, completed, state) {
    const data = manifest.progression?.[progressionPath(storyPath)], key = cursorPositionKey(cursor);
    const receipts = state?.progression?.branchReceipts;
    const selected = new Map();
    if (receipts) for (const receipt of Object.values(receipts)) {
      if (progressionPath(receipt?.storyId) === progressionPath(storyPath) || (progressionPath(state?.execution?.activeStoryPath) === progressionPath(storyPath) && receipt?.storyId === state?.execution?.activeStoryId)) {
        if (receipt.sourceStepKey && ['then', 'else'].includes(receipt.selectedBranch)) selected.set(receipt.sourceStepKey, receipt.selectedBranch);
      }
    }
    const current = key?.split('.'), elapsedKeys = [], consumed=[]; let elapsedSeconds = 0, anchorOffsetMinutes=0;
    for (const [stepKey, step] of Object.entries(data?.steps || {})) {
      if (!(validAbsolute(step?.explicitSeconds)&&step.explicitSeconds>0)&&!validAbsolute(step?.absoluteAnchorMinute)) continue;
      const address = stepKey.split('.');
      let passed = completed || (current && Number(address[0]) < Number(current[0]));
      if (!completed && current && address[0] === current[0]) {
        for (let i = 1; i < Math.min(address.length, current.length); i += 2) {
          if (address[i] !== current[i]) break;
          if (Number(address[i + 1]) < Number(current[i + 1])) { passed = true; break; }
          if (Number(address[i + 1]) > Number(current[i + 1])) break;
        }
      }
      if (!passed) continue;
      let applicable = true;
      for (let i = 1; i < address.length; i += 2) {
        const branchKey = address.slice(0, i).join('.');
        const activeBranch = current?.slice(0, i).join('.') === branchKey ? current[i] : null;
        if ((activeBranch || selected.get(branchKey)) !== address[i]) { applicable = false; break; }
      }
      if (applicable) consumed.push({stepKey,step,address});
    }
    consumed.sort((a,b)=>{for(let i=0;i<Math.min(a.address.length,b.address.length);i++){const difference=i%2===0?Number(a.address[i])-Number(b.address[i]):a.address[i].localeCompare(b.address[i]);if(difference)return difference;}return a.address.length-b.address.length;});
    const row=resolveStoryTime(storyPath);
    for(const {stepKey,step} of consumed){
      if(validAbsolute(step.explicitSeconds)&&step.explicitSeconds>0){elapsedSeconds+=step.explicitSeconds;elapsedKeys.push(stepKey);}
      if(validAbsolute(step.absoluteAnchorMinute)){
        const units=Math.min(data.totalUnits||0,(Number(data.positions?.[stepKey])||0)+(step.weight===0?0:1));
        const duration=validAbsolute(data.baseDurationMinutes)?data.baseDurationMinutes:0;
        const base=data.totalUnits>0?(units===data.totalUnits?duration:5*Math.floor(duration*units/data.totalUnits/5)):0;
        anchorOffsetMinutes=Math.max(anchorOffsetMinutes,step.absoluteAnchorMinute-row.startMinute-base-Math.floor(elapsedSeconds/60));
      }
    }
    // A recorded branch is the historical authority. No route is selected by
    // the clock, and no untaken branch is inferred from a maximum duration.
    if (!state && validAbsolute(data?.elapsedSecondsByPosition?.[key])) elapsedSeconds = data.elapsedSecondsByPosition[key];
    return {elapsedSeconds, elapsedKeys,...(anchorOffsetMinutes>0?{anchorOffsetMinutes}:{})};
  }
  function resolveStoryTimeAtCursor(storyPath, cursor, completed = false, historicalState = null) {
    const row = resolveStoryTime(storyPath);
    if (!row || row.preserveLiveTime) return row;
    let minuteOfDay = row.startMinuteOfDay;
    const data = manifest.progression?.[progressionPath(storyPath)];
    const key = cursorPositionKey(cursor);
    const units = key == null ? null : data?.positions?.[key];
    if (row.absoluteTimeline) {
      const bounded = completed ? data?.totalUnits || 0 : Math.max(0, Math.min(Number(units) || 0, data?.totalUnits || 0));
      const baseDuration = validAbsolute(data?.baseDurationMinutes) ? data.baseDurationMinutes : 0;
      const baseProgress = data?.totalUnits > 0 ? (completed || bounded === data.totalUnits ? baseDuration : 5 * Math.floor(baseDuration * bounded / data.totalUnits / 5)) : 0;
      // Cursor-only historical projection uses only a proven prefix. Live
      // duration contributions are committed from the exact consumed note.
      const elapsed = historicalState === false ? {elapsedSeconds: 0, elapsedKeys: []}
        : elapsedAtCursor(storyPath, cursor, completed, historicalState);
      const elapsedSeconds = elapsed.elapsedSeconds;
      const absoluteMinute = row.startAbsoluteMinute + baseProgress + Math.floor(elapsedSeconds / 60) + (elapsed.anchorOffsetMinutes||0);
      minuteOfDay = localMinute(absoluteMinute);
      return {...row, ...elapsed, minuteOfDay, absoluteMinute, baseProgress, elapsedSeconds, elapsedKeys: elapsed.elapsedKeys,
        calendarOffset: Math.floor(absoluteMinute / 1440) - (row.day - 1),
        hour: Math.floor(minuteOfDay / 60), minute: minuteOfDay % 60, ...classifyGameTime(minuteOfDay)};
    }
    if (completed) minuteOfDay = Math.max(minuteOfDay, row.endMinuteOfDay);
    else if (Number.isFinite(units) && units >= 0 && Number.isFinite(data?.totalUnits) && data.totalUnits > 0) {
      const bounded = Math.min(units, data.totalUnits);
      let fromUnits = 0, toUnits = data.totalUnits, fromMinute = row.startMinuteOfDay, toMinute = row.endMinuteOfDay;
      // Explicit authored timecards can define additional narrative segments.
      // Their unit coordinates are compiled once with the position weights.
      const anchors = data.anchors;
      if (Array.isArray(anchors) && anchors.length) {
        let lo = 0, hi = anchors.length;
        while (lo < hi) { const mid = (lo + hi) >>> 1; if (anchors[mid].units <= bounded) lo = mid + 1; else hi = mid; }
        const before = anchors[lo - 1], after = anchors[lo];
        if (before && Number.isFinite(before.units) && validMinute(before.minuteOfDay)) { fromUnits = before.units; fromMinute = before.minuteOfDay; }
        if (after && Number.isFinite(after.units) && validMinute(after.minuteOfDay)) { toUnits = after.units; toMinute = after.minuteOfDay; }
      }
      if (toUnits > fromUnits && toMinute >= fromMinute) {
        const fraction = Math.max(0, Math.min(1, (bounded - fromUnits) / (toUnits - fromUnits)));
        minuteOfDay = fraction === 1 ? toMinute : fromMinute + 5 * Math.floor((toMinute - fromMinute) * fraction / 5);
      } else minuteOfDay = fromMinute;
    }
    if (!validMinute(minuteOfDay)) minuteOfDay = row.startMinuteOfDay;
    return {...row, minuteOfDay, hour: Math.floor(minuteOfDay / 60), minute: minuteOfDay % 60, ...classifyGameTime(minuteOfDay)};
  }
  function storedClock(time) {
    if (time.version === 2 || time.absoluteTimeline) {
      const absoluteMinute = validAbsolute(time.absoluteMinute) ? time.absoluteMinute : time.startAbsoluteMinute;
      return {version: 2, minuteOfDay: localMinute(absoluteMinute), absoluteMinute,
        slotStartAbsoluteMinute: validAbsolute(time.slotStartAbsoluteMinute) ? time.slotStartAbsoluteMinute : time.startAbsoluteMinute,
        elapsedSeconds: validAbsolute(time.elapsedSeconds) ? time.elapsedSeconds : 0,
        elapsedKeys: Array.isArray(time.elapsedKeys) ? [...time.elapsedKeys] : [],
        ...(validAbsolute(time.anchorOffsetMinutes) && time.anchorOffsetMinutes > 0 ? {anchorOffsetMinutes: time.anchorOffsetMinutes} : {}),
        logicalSlot: token(time.logicalSlot), sourceStory: token(time.sourceStory)};
    }
    return {version: 1, minuteOfDay: time.minuteOfDay, logicalSlot: token(time.logicalSlot), sourceStory: token(time.sourceStory)};
  }
  function isTemporalStoryActive(state,storyPath){
    const condition=resolveStoryTime(storyPath)?.temporalCondition;if(!condition)return true;
    const grammar=typeof module==='object'&&module.exports?require('./engine/condition-grammar'):globalThis.ConditionGrammar;
    if(!grammar?.evaluateCondition||!grammar?.canonicalAccessor)return null;
    const access=grammar.canonicalAccessor(state),world=state?.world||{};
    try{return !!grammar.evaluateCondition(condition,{...access,lookup:key=>{if(!Object.hasOwn(world.variables||{},key)&&!Object.hasOwn(world.choices||{},key))throw new Error('TEMPORAL_CONDITION_UNRESOLVED');return access.lookup(key);}});}catch{return null;}
  }
  function initialClock(day, storyPath, state = null) {
    const selected = resolveStoryTime(storyPath);
    const temporal = state && selected?.day === day ? isTemporalStoryActive(state, storyPath) : true;
    if (temporal === null) throw new Error('TEMPORAL_CONDITION_UNRESOLVED: ' + storyPath);
    if (temporal && selected?.day === day && validMinute(selected.minuteOfDay)) return storedClock(selected);
    const initial = resolveStoryTime(manifest.dayStarts?.[String(day)]);
    if (initial?.day === day && validMinute(initial.minuteOfDay)
      && (!state || isTemporalStoryActive(state, initial.sourceStory) === true)) return storedClock(initial);
    // Unknown future/test days have no authored slot. This deterministic
    // fallback is never used by the validated playable Day 1–20 manifest.
    return {version: 1, minuteOfDay: 480, logicalSlot: '', sourceStory: ''};
  }
  function migrateClock(state) {
    const world = state?.world || {}, day = validDay(world.day) ? world.day : 1;
    if (isStoredClock(world.gameTime)) return JSON.parse(JSON.stringify(world.gameTime));
    // Only admitted execution or completed evidence may reconstruct old time.
    // A pending, gated or premium-deferred target has not advanced the story.
    const activePath = state?.execution?.cursor?.storyPath || state?.execution?.activeStoryPath;
    const active = isTemporalStoryActive(state, activePath) === true
      ? resolveStoryTimeAtCursor(activePath, state?.execution?.cursor, false, state) : null;
    if (active?.day === day && validMinute(active.minuteOfDay)) return storedClock(active);
    // Completion IDs retain the actual historical order of old saves. Migration
    // does not rewrite their past execution to simulate the new scheduler.
    for (const history of [state?.progression?.completedStoryIds || [], state?.progression?.onceKeys || []]) {
      for (let index = history.length - 1; index >= 0; index--) {
        if (isTemporalStoryActive(state, history[index]) !== true) continue;
        const row = resolveStoryTimeAtCursor(history[index], null, true, state);
        if (row?.day === day && validMinute(row.minuteOfDay)) return storedClock(row);
      }
    }
    return initialClock(day, null, state);
  }
  function clockForAdmission(state, storyPath) {
    const row = resolveStoryTime(storyPath);
    // Day admission is owned by the existing engine. Time cannot promote a
    // queued next-day story or admit a route/character on its own.
    const current = migrateClock(state);
    if (row?.day !== state?.world?.day || !validMinute(row.minuteOfDay)) return current;
    const temporal=isTemporalStoryActive(state,storyPath);
    if(temporal===false)return current;
    if(temporal===null)throw new Error('TEMPORAL_CONDITION_UNRESOLVED: '+storyPath);
    if (row.absoluteTimeline) {
      if (current.logicalSlot === row.logicalSlot) return current;
      const currentAbsolute = current.version === 2 ? current.absoluteMinute : dayBase(row.day) + current.minuteOfDay;
      if (row.startAbsoluteMinute < currentAbsolute) {
        // The selector owns chronological class order. A period is not a
        // deadline: serial authored durations may push every following story
        // into later hours or calendar days without resetting its live start.
        row.absoluteMinute = currentAbsolute;
        row.slotStartAbsoluteMinute = currentAbsolute;
      }
      return storedClock(row);
    }
    if (current.logicalSlot === row.logicalSlot) row.minuteOfDay = Math.max(current.minuteOfDay, row.minuteOfDay);
    return storedClock(row);
  }
  function clockForDayTransition(state, nextDay) {
    const initial = initialClock(nextDay, null, state), current = migrateClock(state);
    if (initial.version !== 2) return initial;
    const previousAbsolute = current.version === 2 ? current.absoluteMinute
      : dayBase(validDay(state?.world?.day) ? state.world.day : 1) + current.minuteOfDay;
    if (previousAbsolute > initial.absoluteMinute) {
      initial.absoluteMinute = previousAbsolute;
      initial.slotStartAbsoluteMinute = previousAbsolute;
      initial.minuteOfDay = localMinute(previousAbsolute);
    }
    return initial;
  }
  function clockForProgress(state, storyPath, cursor, completed = false, previousCursor = null) {
    const current = migrateClock(state), row = resolveStoryTimeAtCursor(storyPath, cursor, completed, false);
    if (!row || row.preserveLiveTime || row.day !== state?.world?.day || !validMinute(row.minuteOfDay)) return current;
    if (current.logicalSlot !== row.logicalSlot) return current;
    if (cursor?.storyPath && normalizePath(cursor.storyPath) !== normalizePath(storyPath)) return current;
    if(isTemporalStoryActive(state,storyPath)!==true)return current;
    if (row.absoluteTimeline) {
      const data = manifest.progression?.[progressionPath(storyPath)];
      const prefix = current.version === 2 ? null : elapsedAtCursor(storyPath, previousCursor || cursor, false, state);
      const clock = current.version === 2 ? storedClock(current) : storedClock({...row, ...prefix,
        absoluteMinute: dayBase(row.day) + current.minuteOfDay, slotStartAbsoluteMinute: row.startAbsoluteMinute});
      const consumedKey = cursorPositionKey(previousCursor), step = consumedKey == null ? null : data?.steps?.[consumedKey];
      if (validAbsolute(step?.explicitSeconds) && step.explicitSeconds > 0 && !clock.elapsedKeys.includes(consumedKey)) {
        clock.elapsedSeconds += step.explicitSeconds;
        clock.elapsedKeys.push(consumedKey);
      }
      let absoluteMinute = clock.slotStartAbsoluteMinute + row.baseProgress + Math.floor(clock.elapsedSeconds / 60) + (clock.anchorOffsetMinutes || 0);
      if (validAbsolute(step?.absoluteAnchorMinute) && dayBase(row.day) + step.absoluteAnchorMinute > absoluteMinute) {
        clock.anchorOffsetMinutes = (clock.anchorOffsetMinutes || 0) + dayBase(row.day) + step.absoluteAnchorMinute - absoluteMinute;
        absoluteMinute = dayBase(row.day) + step.absoluteAnchorMinute;
      }
      clock.absoluteMinute = Math.max(clock.absoluteMinute, absoluteMinute);
      clock.minuteOfDay = localMinute(clock.absoluteMinute);
      return clock;
    }
    // A cursor may revisit an earlier label or duplicate an acknowledged step.
    // Neither may rewind a clock already saved further into this same story.
    if (current.logicalSlot === row.logicalSlot) row.minuteOfDay = Math.max(current.minuteOfDay, row.minuteOfDay);
    return storedClock(row);
  }
  function readWorld(world) {
    const day = validDay(world?.day) ? world.day : 1;
    const clock = isStoredClock(world?.gameTime) ? world.gameTime : initialClock(day);
    return {day, minuteOfDay: clock.minuteOfDay, hour: Math.floor(clock.minuteOfDay / 60), minute: clock.minuteOfDay % 60,
      ...(clock.version === 2 ? {storyDay: day, absoluteMinute: clock.absoluteMinute, calendarOffset: Math.floor(clock.absoluteMinute / 1440) - (day - 1)} : {}),
      ...classifyGameTime(clock.minuteOfDay), logicalSlot: token(clock.logicalSlot), sourceStory: token(clock.sourceStory)};
  }
  function normalizeStamp(raw) {
    if (!raw || !validDay(raw.day) || !validMinute(raw.minuteOfDay)) return null;
    if (raw.absoluteMinute != null && (!validAbsolute(raw.absoluteMinute) || localMinute(raw.absoluteMinute) !== raw.minuteOfDay)) return null;
    const expected = readWorld({day: raw.day, gameTime: {version: 1, minuteOfDay: raw.minuteOfDay, logicalSlot: token(raw.logicalSlot), sourceStory: token(raw.sourceStory)}});
    if (raw.absoluteMinute != null) Object.assign(expected, {storyDay: raw.day, absoluteMinute: raw.absoluteMinute, calendarOffset: Math.floor(raw.absoluteMinute / 1440) - (raw.day - 1)});
    for (const key of ['hour', 'minute', 'broadPeriod', 'precisePeriod']) {
      if (raw[key] != null && raw[key] !== expected[key]) return null;
    }
    return expected;
  }
  function resolveStamp(raw, context = {}) {
    const saved = normalizeStamp(raw?.gameTime || raw);
    if (saved) return saved;
    const authored = manifest.posts?.[context.kind]?.[context.id] || manifest.posts?.[context.kind]?.[context.onceKey];
    const source = authored || context.storyPath || context.onceKey;
    const candidate = context.cursor ? resolveStoryTimeAtCursor(source, context.cursor) : resolveStoryTime(source);
    return candidate ? normalizeStamp(candidate) : null;
  }
  function captureStamp(raw) {
    const time = normalizeStamp(raw);
    // Historical rows already carry their authored event/post identity. Keep
    // only the two time scalars; derive periods and display labels on reading.
    return time ? {day: time.day, minuteOfDay: time.minuteOfDay, ...(validAbsolute(time.absoluteMinute) ? {absoluteMinute: time.absoluteMinute} : {})} : null;
  }
  function formatTime(time) {
    const minuteOfDay = typeof time === 'number' ? time : time?.minuteOfDay;
    if (!validMinute(minuteOfDay)) return '--:--';
    return String(Math.floor(minuteOfDay / 60)).padStart(2, '0') + ':' + String(minuteOfDay % 60).padStart(2, '0');
  }
  function formatStamp(stamp, translate) {
    const time = normalizeStamp(stamp);
    const t = typeof translate === 'function' ? translate : (_key, fallback) => fallback;
    if (!time) return t('game_time.unknown', 'Time unknown');
    return t('game_time.stamp', 'Day {{day}} · {{time}}').replace(/\{\{day\}\}/g, String(time.day)).replace(/\{\{time\}\}/g, formatTime(time));
  }
  return Object.freeze({version: 2, periods, classifyGameTime, isStoredClock, isTemporalStoryActive, resolveStoryTime, resolveStoryTimeAtCursor, cursorPositionKey, initialClock, migrateClock, clockForAdmission, clockForDayTransition, clockForProgress,
    readWorld, normalizeStamp, resolveStamp, captureStamp, formatTime, formatStamp, createGameTimeService});
});
