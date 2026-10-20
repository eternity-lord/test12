(function (root, factory) {
  'use strict';
  const common = typeof module === 'object' && module.exports;
  const api = factory(root, common ? require('./game-time-service') : root.GameTimeService,
    common ? require('./calendar-manifest') : root.CalendarManifest,
    common ? require('./calendar-hak-milestones') : root.CalendarHakMilestones);
  if (common) module.exports = api;
  root.CalendarService = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, timeService, manifest, hakMilestones) {
  'use strict';
  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  // Identify the subject from authored post identities, never the creator or
  // asset filename alone: Sexminator also publishes photos of other women.
  const evelynPostIds = new Set(['of_evelyn_seen_d6_v1', 'of_evelyn_seen_d7_v1', 'of_evelyn_seen_d8_v1',
    'of_evelyn_d13_comment_v1', 'of_evelyn_d14_comment_v1', 'of_evelyn_d15_comment_v1']);
  const cleanPath = value => String(value || '').replace(/\\/g, '/').replace(/^.*?(?=story\/)/i, '').toLowerCase();
  const positiveDay = value => Number.isInteger(value) && value > 0 ? value : 1;
  const interpolate = (text, values) => String(text).replace(/\{\{(\w+)\}\}/g, (_, key) => String(values[key] ?? ''));
  function tr(key, fallback) { return root.Game?.i18n?.ui?.(key, fallback) || fallback; }
  function formatPeriod(row, translate = tr) {
    const labels = {morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', all_day: 'All day', after_classes: 'After classes', after_lunch: 'After lunch', after_work: 'After work', until: 'Until {{time}}', around_end: 'Finishes around {{time}}', in_hour: 'In 1 hour'};
    const values = Number.isInteger(row.periodMinute) ? {time: timeService.formatTime(row.periodMinute)} : {};
    const period = labels[row?.periodId] ? interpolate(translate('calendar.period.' + row.periodId, labels[row.periodId]), values) : '';
    const duration = Number.isInteger(row?.durationMinutes) && row.durationMinutes > 0
      ? interpolate(translate('calendar.period.duration_hours', '{{hours}} hours'), {hours: row.durationMinutes / 60}) : '';
    return [period, duration].filter(Boolean).join(' · ') || (row?.kind === 'routine' ? translate('calendar.period.unspecified', 'Time not specified') : '');
  }
  function weekday(day, translate = tr) {
    const index = (manifest.firstWeekday + positiveDay(day) - 1) % 7;
    return translate('calendar.weekday.' + index, weekdays[index]);
  }
  function civilDay(stamp) {
    return Number.isSafeInteger(stamp?.absoluteMinute) && stamp.absoluteMinute >= 0
      ? Math.floor(stamp.absoluteMinute / 1440) + 1 : positiveDay(stamp?.day);
  }
  function formatDay(day, translate = tr) {
    return interpolate(translate('calendar.day', 'Day {{day}}'), {day});
  }
  function formatCurrent(time, translate = tr) {
    const day = positiveDay(time?.day), calendarDay = civilDay(time);
    const base = [formatDay(day, translate), weekday(day, translate), timeService.formatTime(time)].join(' · ');
    return calendarDay > day ? base + ' (' + interpolate(translate('calendar.after_midnight', 'After midnight · {{weekday}}'), {weekday: weekday(calendarDay, translate)}) + ')' : base;
  }
  function formatActivityTime(row, translate = tr) {
    if (!Number.isInteger(row?.recordedMinuteOfDay)) return translate('game_time.unknown', 'Time unknown');
    const time = timeService.formatTime(row.recordedMinuteOfDay);
    const recorded = row.recordedDay !== row.day
      ? interpolate(translate('calendar.recorded_on', 'Recorded on {{day}} at {{time}}'), {day: formatDay(row.recordedDay, translate), time})
      : interpolate(translate('calendar.recorded_at', 'Recorded at {{time}}'), {time});
    return recorded + (row.recordedCivilDay > row.recordedDay ? ' · ' + interpolate(translate('calendar.after_midnight', 'After midnight · {{weekday}}'), {weekday: weekday(row.recordedCivilDay, translate)}) : '');
  }
  function projectOnlyfun(state = {}) {
    const today = timeService.readWorld(state.world || {}).day, rows = [], seen = new Set();
    const active = state.world?.activeCharacters;
    if (Array.isArray(active) && !active.includes('evelyn')) return rows;
    for (const post of state.onlyfun?.posts || []) {
      if (!post || !['static_muse', 'staticmuse', 'sexminator'].includes(String(post.creatorId || '').trim().toLowerCase())) continue;
      const authoredId = [post.onceKey, post.id].find(id => evelynPostIds.has(id));
      const postId = String(post.id || post.onceKey || '');
      if (!authoredId || !postId || seen.has(authoredId)) continue;
      const stamp = timeService.resolveStamp(post, {kind: 'onlyfun', id: authoredId, onceKey: authoredId});
      if (!stamp || stamp.day > today) continue;
      seen.add(authoredId);
      const absoluteMinute = stamp.absoluteMinute ?? ((stamp.day - 1) * 1440 + stamp.minuteOfDay);
      rows.push({id: 'onlyfun:' + authoredId, kind: 'onlyfun', contactId: 'evelyn', creatorId: 'static_muse', postId,
        day: stamp.day, minuteOfDay: stamp.minuteOfDay, absoluteMinute, civilDay: civilDay(stamp)});
    }
    return rows;
  }
  function project(state = {}) {
    const time = timeService.readWorld(state.world || {}), today = time.day;
    const groups = new Map(), committed = new Map(), stats = {};
    for (const [contact, rows] of Object.entries(state.conversations?.eventsByContact || {})) {
      if (!Array.isArray(rows) || ['player', '__global_story__'].includes(contact)) continue;
      const summary = {messages: 0, receivedPhotos: 0, conversationDays: 0}, photoIds = new Set(), days = new Set(), seen = new Set();
      stats[contact] = summary;
      for (const event of rows) {
        if (!event || event.visible === false || !['message', 'text', 'image', 'photo', 'media', 'video', 'audio', 'note', 'hak_transcript'].includes(event.kind || 'message')) continue;
        if (event.eventId && seen.has(event.eventId)) continue;
        if (event.eventId) seen.add(event.eventId);
        const source = cleanPath(event.storyPath);
        if (!source) continue;
        const stamp = timeService.resolveStamp(event, {storyPath: event.storyPath, cursor: {rootIndex: event.stepIndex}});
        if (!stamp) continue;
        const day = stamp.day;
        if (day > today) continue;
        const key = source + ':' + Number(event.stepIndex);
        if (!committed.has(key)) committed.set(key, []);
        committed.get(key).push({event, contact, stamp});
        // In-person narration can prove an activity happened, but never adds
        // messages or a phantom chat to the conversation history/statistics.
        if (event.kind === 'note' || (event.kind === 'hak_transcript' && !String(event.text || '').trim())) continue;
        // Acquired audio belongs to the same recorded episode as its phone
        // messages. Use its saved visibility, never a newly purchased skill.
        if (['message', 'text', 'hak_transcript'].includes(event.kind || 'message')) summary.messages++;
        if (['image', 'photo', 'media'].includes(event.kind) && event.from !== 'player' && event.assetId && !/\.(?:mp4|webm|mov|mp3|ogg|wav)(?:[?#]|$)/i.test(event.assetId)) photoIds.add(cleanPath(event.assetId));
        days.add(stamp.day);
        const groupId = contact + ':' + source + ':' + day;
        if (!groups.has(groupId)) groups.set(groupId, {id: groupId, day, contactId: contact, storyPath: event.storyPath, kind: 'conversation', minuteOfDay: stamp.minuteOfDay, absoluteMinute: stamp.absoluteMinute ?? ((day - 1) * 1440 + stamp.minuteOfDay), civilDay: civilDay(stamp), count: 0});
        const group = groups.get(groupId);
        group.count++;
        const absoluteMinute = stamp.absoluteMinute ?? ((day - 1) * 1440 + stamp.minuteOfDay);
        if (absoluteMinute < group.absoluteMinute) {
          group.absoluteMinute = absoluteMinute; group.minuteOfDay = stamp.minuteOfDay; group.civilDay = civilDay(stamp);
        }
      }
      summary.receivedPhotos = photoIds.size;
      summary.conversationDays = days.size;
    }
    const plans = [];
    const matching = anchor => (committed.get(cleanPath(anchor.storyPath) + ':' + anchor.stepIndex) || [])
      .filter(row => row.event.from === anchor.from && (anchor.expectedKind
        ? (row.event.kind || 'message') === anchor.expectedKind : ['message', 'text'].includes(row.event.kind || 'message')) &&
        (!anchor.requireExpectedText || row.event.text === anchor.expectedText));
    const announced = anchor => matching(anchor)[0];
    const confirmed = anchor => anchor && announced({...anchor, requireExpectedText: true}) &&
      (anchor.requiredAnnouncements || []).every(required => announced({...required, requireExpectedText: true}));
    for (const entry of manifest.plans) {
      const announcement = [entry, ...(entry.alsoAnnouncedBy || [])].find(anchor => announced(anchor));
      const trigger = announcement && announced(announcement);
      if (!trigger && !entry.knownAtStart) continue;
      const route = announcement?.storyPath.match(/\/(love|nts|ntr)\//i)?.[1];
      const routeContact = entry.routeContactId || trigger?.contact || entry.contactId;
      const currentRoute = state.world?.variables?.['route_' + routeContact + '_locked_v1'] || state.world?.routeLocks?.[routeContact] || state.world?.routes?.[routeContact];
      const normalizedRoute = typeof currentRoute === 'string' ? currentRoute.trim().toLowerCase().replace(/^nts(?:1|_coach|_aiden|_ethan)$/, 'nts') : null;
      if (entry.day > today && route && normalizedRoute && normalizedRoute !== route) continue;
      const postponed = entry.postponedBy && announced({...entry.postponedBy, requireExpectedText: true});
      const rescheduled = !!(entry.rescheduledBy && announced(entry.rescheduledBy));
      const timeKnown = !rescheduled && Number.isInteger(entry.minuteOfDay) && (!entry.timeAnnouncedBy || announced(entry.timeAnnouncedBy));
      const periodKnown = !entry.periodAnnouncedBy || confirmed(entry.periodAnnouncedBy);
      plans.push({id: entry.id, kind: 'plan', day: entry.day, contactId: entry.contactId || trigger?.contact, labelId: entry.labelId, label: entry.label, postponed: !!postponed,
        ...(timeKnown ? {minuteOfDay: entry.minuteOfDay} : {}), ...(entry.periodId && periodKnown ? {periodId: entry.periodId} : {}),
        ...(rescheduled ? {rescheduled: true, periodId: entry.rescheduledPeriodId} : {})});
    }
    const activities = [];
    for (const entry of manifest.plans) {
      if (entry.day > today) continue;
      // Keep the original announcement. A separate historical entry requires
      // exact committed evidence, never just a passed date or completed story.
      const occurrences = (entry.occurredBy || []).flatMap(anchor => {
        if (!(anchor.requiredAnnouncements || []).every(required => confirmed(required))) return [];
        return matching({...anchor, requireExpectedText: true}).map(row => ({...row, savedStamp: timeService.normalizeStamp(row.event.gameTime || row.event)}));
      }).sort((a, b) => {
        const recordedMinute = row => row.stamp.absoluteMinute ?? ((row.stamp.day - 1) * 1440 + row.stamp.minuteOfDay);
        return Number(!a.savedStamp) - Number(!b.savedStamp) || recordedMinute(a) - recordedMinute(b);
      });
      const occurrence = occurrences[0];
      if (!occurrence) continue;
      // Message history intentionally omits redundant clock fields. Resolve its
      // authored step time exactly as for chat entries; a saved stamp wins when
      // one exists. Neither the current clock nor the PC date supplies history.
      const stamp = occurrence.stamp;
      const recordedAbsoluteMinute = stamp && (stamp.absoluteMinute ?? ((stamp.day - 1) * 1440 + stamp.minuteOfDay));
      activities.push({id: 'activity:' + entry.id, planId: entry.id, kind: 'activity', day: entry.day,
        contactId: entry.contactId || (entry.from === 'player' ? occurrence.contact : entry.from), labelId: entry.labelId, label: entry.label,
        absoluteMinute: recordedAbsoluteMinute ?? (entry.day * 1440 - 1),
        ...(stamp ? {recordedDay: stamp.day, recordedMinuteOfDay: stamp.minuteOfDay, recordedAbsoluteMinute, recordedCivilDay: civilDay(stamp), civilDay: civilDay(stamp),
          ...(stamp.day === entry.day ? {minuteOfDay: stamp.minuteOfDay} : {})} : {})});
    }
    const routines = [];
    const activeCharacters = Array.isArray(state.world?.activeCharacters) ? new Set(state.world.activeCharacters) : null;
    for (const entry of manifest.routines || []) {
      // Player routines can belong to the route of the contact disclosing them.
      if (activeCharacters && !activeCharacters.has(entry.routeContactId || entry.contactId)) continue;
      const announcement = [entry, ...(entry.alsoAnnouncedBy || [])].find(anchor => announced({...anchor, requireExpectedText: true}) && (anchor.requiredAnnouncements || []).every(required => announced({...required, requireExpectedText: true})));
      if (!announcement) continue;
      const route = entry.route || announcement.storyPath.match(/\/(love|nts|ntr)\//i)?.[1];
      const routeContact = entry.routeContactId || entry.contactId;
      const currentRoute = state.world?.variables?.['route_' + routeContact + '_locked_v1'] || state.world?.routeLocks?.[routeContact] || state.world?.routes?.[routeContact];
      const normalizedRoute = typeof currentRoute === 'string' ? currentRoute.trim().toLowerCase().replace(/^nts(?:1|_coach|_aiden|_ethan)$/, 'nts') : null;
      if (route && normalizedRoute && normalizedRoute !== route) continue;
      const periodKnown = !entry.periodAnnouncedBy || confirmed(entry.periodAnnouncedBy);
      const periodId = periodKnown ? entry.periodId : entry.initialPeriodId;
      routines.push({id: entry.id, kind: 'routine', day: entry.day, contactId: entry.contactId, labelId: entry.labelId, label: entry.label,
        ...(periodId ? {periodId} : {}), ...(periodKnown && Number.isInteger(entry.periodMinute) ? {periodMinute: entry.periodMinute} : {}),
        ...(Number.isInteger(entry.durationMinutes) && confirmed(entry.durationAnnouncedBy) ? {durationMinutes: entry.durationMinutes} : {}),
        ...(entry.cancelledBy && announced({...entry.cancelledBy, requireExpectedText: true}) ? {cancelled: true} : {})});
    }
    const events = [...groups.values(), ...activities, ...(hakMilestones?.project?.(state) || []), ...projectOnlyfun(state)].sort((a, b) => a.day - b.day || (a.absoluteMinute ?? 0) - (b.absoluteMinute ?? 0) || a.id.localeCompare(b.id));
    const maxDay = Math.max(today + 6, ...plans.map(plan => plan.day), ...routines.map(row => row.day));
    return {today, storyDay: time.day, time, events, plans, routines, stats, maxDay};
  }
  function read() {
    const engine = root.GameStateEngine;
    return project(engine?.getCalendarProjectionState?.() || engine?.getState?.() || {});
  }
  function contactName(id) {
    const fallback = String(id || '').replace(/^./, letter => letter.toUpperCase());
    if (id === 'player' && root.PlayerIdentity?.getName) return root.PlayerIdentity.getName();
    const resolved = root.Game?.resolveDisplayName?.(id, fallback);
    if (resolved && !resolved.includes('{{')) return resolved;
    const tpl = root.Game?.tpl?.('{{name:' + id + '}}');
    return tpl && !tpl.includes('{{') ? tpl : fallback;
  }
  function displayText(text) {
    const expanded = root.Game?.tpl?.(String(text)) || String(text);
    return expanded.replace(/\{\{\s*name:([^}]+)\s*\}\}/gi, (_, id) => contactName(id.trim().toLowerCase()));
  }
  const TRANSCRIPT_PAGE_SIZE = 100;
  function transcriptMedia(event) {
    if (!event || !['image', 'photo', 'media', 'video'].includes(event.kind)) return null;
    const src = String(event.assetId || '').trim().replace(/\\/g, '/');
    if (!src) return null;
    if (event.kind === 'video' || /\.(?:mp4|webm|mov|ogv|ogg)(?:[?#]|$)/i.test(src)) return {src, type: 'video'};
    if (/\.(?:mp3|wav|m4a|aac)(?:[?#]|$)/i.test(src)) return null;
    return {src, type: 'image'};
  }
  function projectTranscript(rows, entry = {}) {
    const source = cleanPath(entry.storyPath), seen = new Set();
    if (!source || !Number.isInteger(entry.day)) return [];
    return (Array.isArray(rows) ? rows : []).filter(event => {
      if (!event || event.visible === false) return false;
      const text = ['message', 'text', 'note', 'hak_transcript'].includes(event.kind || 'message') && String(event.text || '').trim();
      if (!text && !transcriptMedia(event)) return false;
      if (cleanPath(event.storyPath) !== source) return false;
      const stamp = timeService.resolveStamp(event, {storyPath: event.storyPath, cursor: {rootIndex: event.stepIndex}});
      if (!stamp || stamp.day !== entry.day) return false;
      const id = String(event.eventId || '');
      if (id && seen.has(id)) return false;
      if (id) seen.add(id);
      return true;
    });
  }
  function transcriptPage(rows, requestedPage = 0) {
    const items = Array.isArray(rows) ? rows : [], pages = Math.max(1, Math.ceil(items.length / TRANSCRIPT_PAGE_SIZE));
    const page = Math.max(0, Math.min(pages - 1, Math.floor(Number(requestedPage) || 0)));
    return {page, pages, total: items.length, rows: items.slice(page * TRANSCRIPT_PAGE_SIZE, (page + 1) * TRANSCRIPT_PAGE_SIZE)};
  }
  function mount(element) {
    if (!element) return () => {};
    root.__calendarCleanup?.();
    let active = true, frame = null, model = read(), selected = model.today, archive = null, archivePage = 0, archiveFocus = null, calendarScroll = 0;
    let mediaSession = null, archiveRenderPending = false;
    let week = Math.floor((selected + manifest.firstWeekday - 1) / 7);
    const el = selector => element.querySelector(selector);
    function node(tag, className, text) { const n = document.createElement(tag); n.className = className; if (text != null) n.textContent = text; return n; }
    function releaseThumbnails() {
      for (const mount of element.querySelectorAll('[data-cal-media]')) mount.__mediaViewerThumbCleanup?.();
    }
    function restoreMediaReader() {
      const session = mediaSession; mediaSession = null;
      if (!session || !active || !archive || !element.isConnected) return;
      if (archiveRenderPending) { archiveRenderPending = false; renderArchive(); }
      const trigger = [...element.querySelectorAll('[data-cal-media]')].find(button => button.dataset.calMedia === session.id);
      trigger?.focus({preventScroll: true}); element.scrollTop = session.scroll;
    }
    function openMedia(media, trigger) {
      if (!active || !archive || mediaSession || !root.MediaViewer?.open) return;
      const session = {id: trigger.dataset.calMedia, scroll: element.scrollTop}; mediaSession = session;
      // This is a read-only view of delivered conversation events. Do not mark
      // gallery items viewed or offer actions that modify the player's save.
      Promise.resolve(root.MediaViewer.open(media.src, {type: media.type, title: contactName(archive.entry.contactId), canSetAsWallpaper: false}))
        .then(opened => {
          if (mediaSession !== session) return;
          if (!opened) { restoreMediaReader(); return; }
          if (active && mediaSession) document.getElementById('mediaViewerClose')?.focus({preventScroll: true});
        }).catch(() => { if (mediaSession === session) restoreMediaReader(); });
    }
    function renderArchive() {
      if (!archive || !active || !element.isConnected) return;
      if (mediaSession) { archiveRenderPending = true; return; }
      const page = transcriptPage(archive.rows, archivePage); archivePage = page.page;
      el('[data-cal-reader-title]').textContent = contactName(archive.entry.contactId) + ' · ' + formatDay(archive.entry.day);
      el('[data-cal-reader-note]').textContent = tr('calendar.reader.note', 'Read your recorded chat. Choices and progress stay as they were.');
      el('[data-cal-reader-back]').textContent = tr('calendar.reader.back', 'Back to calendar');
      el('[data-cal-reader-page]').textContent = interpolate(tr('calendar.reader.page', 'Page {{page}} of {{pages}}'), {page: page.page + 1, pages: page.pages});
      el('[data-cal-reader-prev]').textContent = tr('calendar.reader.previous', 'Previous messages');
      el('[data-cal-reader-next]').textContent = tr('calendar.reader.next', 'Next messages');
      el('[data-cal-reader-pages]').setAttribute('aria-label', tr('calendar.reader.pages', 'Chat pages'));
      el('[data-cal-reader-prev]').disabled = page.page === 0; el('[data-cal-reader-next]').disabled = page.page + 1 === page.pages;
      const list = el('[data-cal-reader-messages]'); releaseThumbnails(); list.replaceChildren();
      for (const [index, event] of page.rows.entries()) {
        const thought = root.PlayerThoughts?.isThought?.(event) === true, system = event.kind === 'note' && !thought;
        const captured = event.kind === 'hak_transcript';
        const message = node('article', 'cal-message' + (!captured && (event.from === 'player' || thought) ? ' is-player' : '') + (thought ? ' is-thought' : '') + (system ? ' is-note' : '') + (captured ? ' is-hak-transcript' : ''));
        message.dataset.eventId = String(event.eventId || '');
        if (captured) {
          message.dataset.kind = 'hak_transcript';
          message.setAttribute('role', 'group');
          message.setAttribute('aria-label', tr('hak.audio_capture_aria', 'HAK audio capture — {speaker}').replace('{speaker}', contactName(event.from || archive.entry.contactId)));
          message.append(node('div', 'cal-hak-header', tr('hak.audio_capture', 'HAK // AUDIO CAPTURE')));
        }
        if (!system) message.append(node('div', 'cal-message-sender', thought ? root.PlayerThoughts.label() : contactName(event.from || archive.entry.contactId)));
        // Use the recorded text alone. Source-based translation also handles
        // committed choice replies without interpreting a branch or its prompt.
        const media = transcriptMedia(event);
        if (media) {
          message.classList.add('has-media');
          const label = media.type === 'video' ? tr('calendar.reader.video', 'Play video') : tr('calendar.reader.photo', 'View photo');
          const thumbnail = node('button', 'cal-message-media', label); thumbnail.type = 'button';
          thumbnail.dataset.calMedia = String(page.page * TRANSCRIPT_PAGE_SIZE + index);
          thumbnail.setAttribute('aria-label', label); thumbnail.setAttribute('aria-haspopup', 'dialog');
          thumbnail.addEventListener('click', () => openMedia(media, thumbnail));
          message.append(thumbnail);
          root.MediaViewer?.mountThumbnail?.(thumbnail, media.src, {type: media.type, alt: label, surfaceOwner: 'calendar', storyPath: event.storyPath,
            stepIndex: event.stepIndex, presentationEpisodeId: 'calendar:' + String(event.eventId || media.src), skipPrepared: true, resolveRuntimeAsset: true});
        }
        const recordedText = String(event.text || '');
        if (recordedText.trim() && (!media || !/^\[(?:photo|image|media|video)\]$/i.test(recordedText.trim()))) {
          const translated = root.Game?.i18n?.sourceText?.(recordedText) || recordedText;
          message.append(node('p', '', displayText(translated)));
        }
        list.append(message);
      }
      if (!page.total) list.append(node('p', 'cal-reader-empty', tr('calendar.reader.empty', 'No recorded text for this chat.')));
    }
    function openArchive(entry, trigger) {
      if (!active || entry.kind !== 'conversation') return;
      const rows = root.GameStateEngine?.getConversationEvents?.(entry.contactId) || [];
      archive = {entry, rows: projectTranscript(rows, entry)}; archivePage = 0; archiveFocus = entry.id; calendarScroll = element.scrollTop;
      el('[data-cal-overview]').hidden = true; el('[data-cal-reader]').hidden = false;
      renderArchive(); element.scrollTop = 0; el('[data-cal-reader-back]').focus();
    }
    function closeArchive() {
      if (!archive) return;
      if (mediaSession) { root.MediaViewer?.close?.(); return; }
      releaseThumbnails(); el('[data-cal-reader-messages]').replaceChildren();
      archive = null; el('[data-cal-reader]').hidden = true; el('[data-cal-overview]').hidden = false;
      render(); element.scrollTop = calendarScroll;
      [...element.querySelectorAll('[data-cal-read-chat]')].find(button => button.dataset.calReadChat === archiveFocus)?.focus?.({preventScroll: true}); archiveFocus = null;
    }
    function handleSceneBack() {
      if (!active || !element.isConnected || !archive || String(root.Game?.currentScene || '').toLowerCase() !== 'calendar') return false;
      closeArchive();
      return true;
    }
    function render() {
      if (!active || !element.isConnected) return;
      if (archive) { renderArchive(); return; }
      const next = read();
      if (next.today !== model.today || next.storyDay !== model.storyDay) {
        selected = next.today; week = Math.floor((selected + manifest.firstWeekday - 1) / 7);
      }
      model = next;
      selected = Math.min(selected, model.maxDay);
      el('[data-cal-current]').textContent = formatCurrent(model.time);
      el('[data-cal-selected]').textContent = weekday(selected) + ' · ' + formatDay(selected);
      el('[data-cal-week-label]').textContent = interpolate(tr('calendar.week', 'Week {{week}}'), {week: week + 1});
      el('[data-cal-prev]').disabled = week === 0;
      el('[data-cal-next]').disabled = (week + 1) * 7 - manifest.firstWeekday + 1 > model.maxDay;
      const grid = el('[data-cal-grid]'); grid.replaceChildren();
      for (let index = 0; index < 7; index++) {
        const day = week * 7 + index - manifest.firstWeekday + 1;
        const cell = node('button', 'cal-day'); cell.type = 'button';
        cell.append(node('span', 'cal-day-name', tr('calendar.weekday_short.' + index, weekdays[index].slice(0, 3))), node('strong', '', day > 0 ? String(day) : '·'));
        const mark = node('span', 'cal-day-mark');
        if (model.events.some(row => row.day === day)) mark.classList.add('has-history');
        if (model.plans.some(row => row.day === day) || model.routines.some(row => row.day === day)) mark.classList.add('has-plan');
        cell.append(mark); cell.disabled = day < 1 || day > model.maxDay;
        cell.classList.toggle('is-today', day === model.today); cell.classList.toggle('is-selected', day === selected);
        cell.setAttribute('aria-pressed', String(day === selected));
        if (day === model.today) cell.setAttribute('aria-current', 'date');
        cell.setAttribute('aria-label', weekday(Math.max(1, day)) + ', ' + formatDay(day));
        cell.addEventListener('click', () => { selected = day; render(); }); grid.append(cell);
      }
      const list = el('[data-cal-events]'); list.replaceChildren();
      const plans = model.plans.filter(row => row.day === selected), routines = model.routines.filter(row => row.day === selected), history = model.events.filter(row => row.day === selected);
      for (const row of plans.concat(routines, history)) {
        const card = node('article', 'cal-event ' + (row.kind === 'plan' ? 'is-plan' : row.kind === 'routine' ? 'is-routine' : row.kind === 'activity' ? 'is-activity' : row.kind === 'milestone' ? 'is-milestone' : row.kind === 'onlyfun' ? 'is-onlyfun' : ''));
        const badge = node('div', 'cal-event-icon', row.kind === 'plan' ? '◷' : row.kind === 'routine' ? '≡' : row.kind === 'activity' ? '✓' : row.kind === 'milestone' ? '◇' : row.kind === 'onlyfun' ? '▧' : '↗');
        const copy = node('div', 'cal-event-copy');
        const shared = row.kind === 'plan' || row.kind === 'routine', period = formatPeriod(row);
        const status = row.kind === 'routine' ? (row.cancelled ? tr('calendar.skipped', 'Skipped') : tr('calendar.routine', 'Daily activity'))
          : row.postponed ? tr('calendar.postponed', 'Postponed') : row.rescheduled ? tr('calendar.rescheduled', 'Rescheduled') : tr('calendar.announced', 'Plans shared');
        const recordedTime = Number.isInteger(row.minuteOfDay) ? timeService.formatTime(row.minuteOfDay) + (row.civilDay > row.day ? ' · ' + interpolate(tr('calendar.after_midnight', 'After midnight · {{weekday}}'), {weekday: weekday(row.civilDay)}) : '') : 'HAK';
        copy.append(node('div', 'cal-event-meta', row.kind === 'activity' ? tr('calendar.event', 'Event') + ' · ' + formatActivityTime(row) : shared ? status + (Number.isInteger(row.minuteOfDay) ? ' · ' + timeService.formatTime(row.minuteOfDay) : '') + (period ? ' · ' + period : '') : recordedTime));
        const postLabel = row.kind === 'onlyfun' ? tr('calendar.onlyfun.evelyn_post', 'Sexminator posted a photo of {{name:evelyn}}') : '';
        copy.append(node('h3', '', row.kind === 'onlyfun' ? displayText(postLabel) : row.kind === 'milestone' ? tr('calendar.milestone.' + row.labelId, row.label) : shared || row.kind === 'activity' ? tr('calendar.' + (row.kind === 'routine' ? 'routine.' : 'plan.') + row.labelId, row.label) : contactName(row.contactId)));
        copy.append(node('p', '', row.kind === 'onlyfun' ? tr('calendar.onlyfun.published', 'Published on OnlyFun') : row.kind === 'milestone' ? 'HAK' : shared || row.kind === 'activity' ? contactName(row.contactId) : interpolate(tr('calendar.messages_count', '{{count}} messages'), {count: row.count})));
        if (row.kind === 'conversation') {
          const open = node('button', 'cal-read-chat', tr('calendar.reader.open', 'Read chat')); open.type = 'button';
          open.dataset.calReadChat = row.id; open.addEventListener('click', () => openArchive(row, open)); copy.append(open);
        }
        if (row.kind === 'onlyfun') {
          const open = node('button', 'cal-read-chat', tr('calendar.onlyfun.open', 'View post')); open.type = 'button';
          open.dataset.calOpenPost = row.postId;
          // OnlyFun owns login, subscription and view acknowledgement. Opening
          // Calendar alone neither reveals the image nor marks the post seen.
          open.addEventListener('click', () => root.navigateToScene?.('onlyfun', {creatorId: row.creatorId, postId: row.postId})); copy.append(open);
        }
        card.append(badge, copy); list.append(card);
      }
      if (!plans.length && !routines.length && !history.length) {
        const empty = node('div', 'cal-empty');
        empty.append(node('div', 'cal-empty-icon', '◇'), node('h3', '', selected > model.today ? tr('calendar.nothing_planned', 'A little room for possibility') : tr('calendar.no_history', 'A quiet page')),
          node('p', '', selected > model.today ? tr('calendar.future_empty', 'New plans appear here as they come up in your conversations.') : tr('calendar.history_empty', 'Your conversations and shared plans will appear here.')));
        list.append(empty);
      }
      for (const n of element.querySelectorAll('[data-cal-label]')) n.textContent = tr(n.dataset.calLabel, n.dataset.calFallback);
      el('[data-cal-prev]').setAttribute('aria-label', tr('calendar.previous_week', 'Previous week'));
      el('[data-cal-next]').setAttribute('aria-label', tr('calendar.next_week', 'Next week'));
      element.dataset.ready = '1';
    }
    function schedule() { if (!active || frame != null) return; frame = requestAnimationFrame(() => { frame = null; render(); }); }
    el('[data-cal-prev]').addEventListener('click', () => { week = Math.max(0, week - 1); render(); });
    el('[data-cal-next]').addEventListener('click', () => { week++; render(); });
    el('[data-cal-today]').addEventListener('click', () => { selected = read().today; week = Math.floor((selected + manifest.firstWeekday - 1) / 7); render(); });
    el('[data-cal-reader-back]').addEventListener('click', closeArchive);
    el('[data-cal-reader-prev]').addEventListener('click', () => { archivePage--; renderArchive(); element.scrollTop = 0; });
    el('[data-cal-reader-next]').addEventListener('click', () => { archivePage++; renderArchive(); element.scrollTop = 0; });
    const onKey = event => {
      if (event.key !== 'Escape' || !archive) return;
      if (mediaSession) { event.preventDefault(); event.stopImmediatePropagation(); root.MediaViewer?.close?.(); return; }
      if (!event.defaultPrevented && !root.MediaViewer?.isOpen?.()) { event.preventDefault(); closeArchive(); }
    };
    root.addEventListener?.('keydown', onKey, true);
    root.addEventListener?.('media-viewer:close', restoreMediaReader);
    const unsubscribe = root.GameStateEngine?.subscribe?.(schedule);
    root.addEventListener?.('i18n:language-ready', schedule);
    root.addEventListener?.('identity:changed', schedule);
    // The shell removes scene nodes during navigation; release engine callbacks
    // immediately, including when another app opens without remounting Calendar.
    const observer = new MutationObserver(() => { if (!element.isConnected) cleanup(); });
    // The shell removes the scene wrapper, rather than its Calendar child.
    // Observe the stable scene root so that removal also releases the archive.
    observer.observe(element.closest('#scene-root') || element.parentNode, {childList: true});
    function cleanup() {
      if (!active) return; active = false; unsubscribe?.(); observer.disconnect();
      if (mediaSession) root.MediaViewer?.close?.();
      releaseThumbnails(); mediaSession = null;
      archive = null; archiveFocus = null;
      if (frame != null) cancelAnimationFrame(frame);
      root.removeEventListener?.('i18n:language-ready', schedule); root.removeEventListener?.('identity:changed', schedule);
      root.removeEventListener?.('keydown', onKey, true);
      root.removeEventListener?.('media-viewer:close', restoreMediaReader);
      if (root.Game?.handleSceneBack === handleSceneBack) root.Game.handleSceneBack = null;
      if (root.__calendarCleanup === cleanup) root.__calendarCleanup = null;
    }
    if (root.Game) root.Game.handleSceneBack = handleSceneBack;
    root.__calendarCleanup = cleanup; render(); return cleanup;
  }
  return Object.freeze({project, projectOnlyfun, read, weekday, civilDay, formatDay, formatCurrent, formatPeriod, formatActivityTime, projectTranscript, transcriptMedia, transcriptPage, TRANSCRIPT_PAGE_SIZE, mount});
});
