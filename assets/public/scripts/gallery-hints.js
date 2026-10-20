(function(root) {
  "use strict";
  const SORT_KEY = "gallery_sort_v1";
  const SORT_MODES = ["newest", "oldest", "number_asc", "number_desc"];
  function sourceKey(raw) {
    return String(raw || "").replace(/\\/g, "/").toLowerCase().split(/[?#]/)[0]
      .replace(/\/(?:male|female)_mason\//g, "/{mason}/").replace(/\/mason_(?:male|female)\//g, "/{mason}/")
      .replace(/\/avatars\/(?:male_mason|female_mason|mason|mason_female)\.jpg$/, "/avatars/{mason}.jpg")
      .replace(/hailey_(?:male_mason|mason_female)_arrived/, "hailey_{mason}_arrived")
      .replace(/mason_fitness_first(?:_female)?_post/, "mason_fitness_first_{mason}_post");
  }
  function allSources(photo) {
    const rows = root.GalleryHintsData?.entries?.[sourceKey(photo?.__rawUrl || photo?.url || photo)] || [];
    return JSON.parse(JSON.stringify(rows));
  }
  function matchesRoute(photo, route = "all") {
    if (!route || route === "all") return true;
    return allSources(photo).some(row => !row.route || (route !== "shared" && row.route === route));
  }
  function sources(photo, route = "all") {
    const rows = allSources(photo).filter(row => route === "all" || !row.route || (route !== "shared" && row.route === route));
    // A common, unconditional source is sufficient; later reuses should not
    // turn a simple first-day unlock into a page of misleading prerequisites.
    const common = rows.find(row => !row.route && !row.choices.length && row.day > 0);
    return JSON.parse(JSON.stringify(common ? [common] : rows));
  }
  function getSort(storage = root.localStorage) { try { const value = storage?.getItem(SORT_KEY); return SORT_MODES.includes(value) ? value : "newest"; } catch { return "newest"; } }
  function setSort(value, storage = root.localStorage) { const mode = SORT_MODES.includes(value) ? value : "newest"; try { storage?.setItem(SORT_KEY, mode); } catch {} return mode; }
  function timestamp(value) {
    const time = Number(value) || (typeof value === "string" ? Date.parse(value) : 0);
    return Number.isFinite(time) && time > 1 ? time : 0;
  }
  function discoveryTime(photo) {
    if (Object.prototype.hasOwnProperty.call(photo, "__discoveryAt")) return timestamp(photo.__discoveryAt);
    const time = [photo.at, photo.timestamp, photo.addedAt, photo.unlockedAt, photo.createdAt].map(timestamp).find(Boolean) || 0;
    // Old OnlyFun reconciliation saved the post's original date in addedAt,
    // then supplied a fresh at when the Gallery was opened. Keep that existing
    // receipt useful without rewriting ownership or dating it on each visit.
    const original = /^onlyfun:/i.test(String(photo.src || "")) ? timestamp(photo.addedAt) : 0;
    return original && time ? Math.min(original, time) : time;
  }
  function projectDiscoveries(photos, gallery = {}) {
    const added = new Map();
    for (const receipt of Object.values(gallery.receipts || {})) {
      if (receipt?.added === true && !added.has(receipt.mediaId)) added.set(receipt.mediaId, receipt);
    }
    const bySource = new Map();
    for (const [id, photo] of Object.entries(gallery.owned || {})) {
      if (!photo || /^gallery_full/i.test(String(photo.src || "")) || photo.repairSource) continue;
      const receipt = added.get(photo.mediaId || id);
      // Only a first-acquisition receipt proves that unlockedAt is a real
      // discovery. Legacy import also fills that field, at migration time.
      // Social post dates and MeetAndGreet's day/step counter are not receipts.
      const time = receipt
        ? timestamp(photo.unlockedAt) || timestamp(receipt.committedAt)
        : /^(?:onlyfun|meetandgreet):/i.test(String(photo.src || "")) ? 0 : timestamp(photo.at) || timestamp(photo.timestamp) || timestamp(photo.addedAt);
      const key = sourceKey(photo.__rawUrl || photo.url);
      if (time && (!bySource.has(key) || time < bySource.get(key))) bySource.set(key, time);
    }
    return photos.map(photo => ({ ...photo, __discoveryAt: bySource.get(sourceKey(photo.__rawUrl || photo.url)) || 0 }));
  }
  function sortPhotos(photos, mode, registry = []) {
    const ranks = new Map(registry.map((photo, index) => [sourceKey(photo.__rawUrl || photo.url), index]));
    // Legacy photos keep their original `at` when migrated into the canonical
    // collection. Its migration-time unlockedAt is not a new discovery.
    const time = discoveryTime;
    const rank = photo => ranks.get(sourceKey(photo.__rawUrl || photo.url)) ?? Number.MAX_SAFE_INTEGER;
    const direction = mode === "oldest" ? 1 : -1;
    const numbered = (a,b) => rank(a)-rank(b) || String(a.mediaId || a.id || a.url).localeCompare(String(b.mediaId || b.id || b.url));
    if (mode === "number_asc" || mode === "number_desc") return photos.slice().sort((a,b) => (mode === "number_desc" ? -1 : 1) * numbered(a,b));
    return photos.slice().sort((a,b) => {
      const at = time(a), bt = time(b);
      // Unknown historical dates and code-only access never masquerade as
      // discoveries. Keep them last, with a stable photo-number tie-break.
      if (!!at !== !!bt) return at ? -1 : 1;
      return (at && bt ? direction * (at-bt) : 0) || numbered(a,b);
    });
  }
  function describe(source, options = {}) {
    const translate = options.translate || ((_key, text) => text), name = options.name || (id => id);
    const text = (key, fallback, values = {}) => String(translate(key, fallback)).replace(/\{(\w+)\}/g, (match, key) => values[key] == null ? match : values[key]);
    const day = value => value > 0 ? text("gallery.hints.day", "Day {day}", { day: value }) : "";
    const channel = text("gallery.hints.app." + source.channel, ({conversation:"Messages",onlyfun:"OnlyFun",hak:"HAK",meetandgreet:"MeetAndGreet",snapgram:"Snapgram"})[source.channel] || "Messages");
    const route = source.route ? text("gallery.hints.route", "{route} route", { route: source.route.toUpperCase() }) : "";
    const separateRoute = source.creator && source.creator !== source.contact;
    const lines = [[day(source.day), name(source.creator || source.contact), separateRoute ? "" : route, channel].filter(Boolean).join(" · ")];
    if (separateRoute && route) lines.push([name(source.contact), route].filter(Boolean).join(" · "));
    const sceneHints = { morning: "Read the full morning conversation.", afternoon: "Read the full afternoon conversation.", evening: "Read the full evening conversation.", night: "Read the full night conversation." };
    if (source.channel === "conversation" && sceneHints[source.slot]) lines.push(text("gallery.hints.scene." + source.slot, sceneHints[source.slot]));
    for (const choice of source.choices || []) {
      let label;
      if (choice.kind === "coach") label = text("gallery.hints.coach", "Coach: {name}", { name: choice.options.map(option => option.id === "aiden" ? name("aiden") : "Chris").join(" / ") });
      else if (choice.kind === "lena_partner") label = text("gallery.hints.partner", "Date partner: {name}", { name: choice.options.map(option => option.id === "aiden" ? name("aiden") : text("gallery.hints.new_partner", "Someone you don't know")).join(" / ") });
      else if (choice.kind === "photo_sharing" && choice.options.length === 1 && choice.options[0].id === "know_and_receive") label = text("gallery.hints.receive_photos", "Choose to know and receive the shared photos (option 1).");
      else if (choice.kind === "color" && choice.options.every(option => ["black", "white", "red"].includes(option.id))) label = text("gallery.hints.color", "Color choice: {color} (option {number})", { color: choice.options.map(option => text("gallery.hints.color." + option.id, ({black:"Black",white:"White",red:"Red"})[option.id])).join(" / "), number: choice.options.map(option => option.index).join(" / ") });
      else {
        const numbers = choice.options.map(option => option.index).join(" / ");
        label = choice.kind === "outfit" ? text("gallery.hints.outfit", "Outfit choice: option {number}", { number: numbers }) : text("gallery.hints.choice", "Choice: option {number}", { number: numbers });
      }
      lines.push([day(choice.day),name(choice.contact),label].filter(Boolean).join(" · "));
    }
    if (source.subscription) lines.push(text("gallery.hints.subscription", "Subscribe to this OnlyFun account to view its received post."));
    if (source.channel === "hak") lines.push(text("gallery.hints.evidence", "Unlock the corresponding HAK Evidence skill and open the received evidence."));
    return lines;
  }
  const api = { sourceKey, sources, allSources, matchesRoute, getSort, setSort, discoveryTime, projectDiscoveries, sortPhotos, describe, sortKey: SORT_KEY };
  root.GalleryHints = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
