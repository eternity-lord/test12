(function (root, factory) {
  'use strict';
  const common = typeof module === 'object' && module.exports;
  const api = factory(common ? require('./game-time-service') : root.GameTimeService);
  if (common) module.exports = api;
  root.CalendarHakMilestones = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (timeService) {
  'use strict';
  const BOOT_PATH = 'story/DAY2/DAY2_13_HAK_BOOT.json';
  const BOOT_IDS = Object.freeze(['d2_13_hak_boot_v2', BOOT_PATH]);
  const labels = Object.freeze({
    hak_surveillance: 'HAK surveillance activated',
    hak_skill_tree: 'HAK skill tree available'
  });
  function project(state = {}) {
    const today = timeService.readWorld(state.world || {}).day, rows = [];
    function add(labelId, stamp) {
      if (!stamp || stamp.day > today) return;
      const absoluteMinute = stamp.absoluteMinute ?? ((stamp.day - 1) * 1440 + stamp.minuteOfDay);
      rows.push({ id: 'milestone:' + labelId, kind: 'milestone', contactId: 'hak', labelId, label: labels[labelId],
        day: stamp.day, minuteOfDay: stamp.minuteOfDay, absoluteMinute, civilDay: Math.floor(absoluteMinute / 1440) + 1 });
    }
    // App availability and the current day are not evidence of an authored
    // introduction (checkpoints can expose HAK). Its durable unlock receipt or
    // completed boot once key proves the player reached the actual source.
    const boot = Object.values(state.hak?.receipts || {}).find(receipt => receipt?.kind === 'unlock' &&
      BOOT_IDS.includes(receipt.storyId) && Number(receipt.stepIndex) === 0);
    const completedBoot = (state.progression?.onceKeys || []).includes(BOOT_IDS[0]) ||
      (state.progression?.completedStoryIds || []).some(id => BOOT_IDS.includes(id));
    if (boot || completedBoot) {
      const stamp = timeService.normalizeStamp(boot?.gameTime);
      if (stamp) add('hak_surveillance', stamp);
      else if (today >= 2) rows.push({ id: 'milestone:hak_surveillance', kind: 'milestone', contactId: 'hak',
        labelId: 'hak_surveillance', label: labels.hak_surveillance, day: 2, civilDay: 2 });
    }
    // This introduction is emitted by the conversation presenter, so retain
    // its canonical acknowledgement time instead of assigning a fixed day.
    add('hak_skill_tree', timeService.normalizeStamp(state.hak?.tutorial?.announcedAt));
    return rows.sort((a, b) => a.day - b.day || (a.absoluteMinute ?? 0) - (b.absoluteMinute ?? 0) || a.id.localeCompare(b.id));
  }
  return Object.freeze({ project, BOOT_PATH, BOOT_IDS, labels });
});
