// scripts/contact-status.js
//
// ARCHITECTURE -- Contact display identity is TWO separate fields, never one
// concatenated string:
//
//   customName  -> player-editable. Persisted in localStorage["player_identity_v1"]
//                  (see index.html Game.setIdentity/getIdentity/tpl, the
//                  "Name this contact" rename overlay in index.html, and
//                  scenes/settings.html's contact rename editor). Unchanged
//                  by this file -- it already stores exactly one name string
//                  per contact.
//
//   statusLabel -> canonical, NOT player-editable, NOT persisted in the save
//                  at all. Source of truth is STATUS_BY_ID below, in code.
//                  Being a code constant (not save data) means it is
//                  identical on every entry path -- fresh game, Start From,
//                  New Update, Save/Load, relaunch -- with nothing to seed or
//                  migrate for the status half specifically.
//
// ROOT CAUSE this file fixes: story/DAY1/*_INTRO.json used to author the
// rename overlay's defaultName as a single concatenated string, e.g.
// "Lena (girlfriend)" or "Evelyn (LandLady)". That string flowed straight
// into the overlay's label AND its editable input, and -- the moment a
// player accepted the default or edited around it -- into
// player_identity_v1 as the customName, permanently baking the status word
// into the player's chosen name. The story JSON now authors the name alone;
// this module is the single place status labels live, and
// migrateIdentityObject()/runIdentityMigration() below is the deterministic,
// idempotent, exactly-once repair for saves that already have the old
// concatenated string stored.
//
// Consumers:
//  - index.html: rename overlay label, Game.tpl() {{status:id}} tag
//  - scripts/convo-runtime.js: {{status:id}} tag for OUTSIDE-conversation text
//  - scenes/messages.html: {{status:id}} tag in the Messages list
//  - scenes/conversation.html: conversation header status subtitle
//  - scenes/settings.html: contact rename editor status subtitle (read-only)
(function (root, factory) {
  "use strict";
  var isNode = typeof module === "object" && !!module.exports;
  var api = factory();
  if (isNode) module.exports = api;
  if (typeof root !== "undefined") root.ContactStatus = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Single source of truth for canonical relationship/status labels.
  // Player-facing customName is a completely separate field (see above) --
  // this map is never written to by the player and never persisted per-save.
  var STATUS_BY_ID = Object.freeze({
    evelyn: "Landlady",
    mason: "Roommate",
    hailey: "Roommate",
    lena: "Girlfriend",
    aiden: "Best Friend"
  });

  // Legacy concatenated-status words as they actually appear in already-
  // authored/already-saved data (lowercase, any original casing normalizes
  // here), keyed by character id. Used ONLY by the migration below to
  // recognize a safe-to-strip "(status)" suffix on an existing save value --
  // never used to invent or display a status. Audited directly against the
  // 5 story/DAY1/*_INTRO.json rename steps that ever authored this pattern.
  var LEGACY_STATUS_WORDS = Object.freeze({
    evelyn: ["landlady"],
    mason: ["roommate"],
    hailey: ["roommate"],
    lena: ["girlfriend"],
    aiden: ["bestfriend", "best friend"]
  });

  // Two independent stores can each hold a player-chosen contact name,
  // depending on which UI wrote it: scenes/settings.html's contact editor
  // writes player_identity_v1 (via Game.setIdentity); the in-conversation
  // "Name this contact" overlay (scenes/conversation.html openRenameOverlay)
  // writes the separate, flat contact_names_v1 map (via setContactName).
  // scenes/conversation.html's own resolveDisplayName() already reads
  // player_identity_v1 first and falls back to contact_names_v1, so both
  // are equally real sources of a possibly-still-concatenated legacy name
  // and both must be migrated. This module does not unify the two stores
  // (that dual-store fallback is pre-existing, load-bearing architecture
  // well beyond this fix's scope) -- it only cleans whatever each already
  // contains.
  var IDENTITY_KEY = "player_identity_v1";
  var CONTACT_NAMES_KEY = "contact_names_v1";
  var MIGRATION_FLAG_KEY = "identity_status_split_migrated_v1";

  function canonicalId(raw) {
    return String(raw == null ? "" : raw).trim().toLowerCase().replace(/[\s-]+/g, "_");
  }

  function getStatusLabel(id) {
    return STATUS_BY_ID[canonicalId(id)] || "";
  }

  function hasCanonicalStatus(id) {
    return Object.prototype.hasOwnProperty.call(STATUS_BY_ID, canonicalId(id));
  }

  // Pure function. Given a character id and a raw stored name string,
  // returns the name with a trailing "(status)" suffix stripped IF -- and
  // only if -- the parenthesized text matches that exact character's own
  // canonical or known-legacy status word. Returns null when nothing should
  // change: no parentheses, already name-only, or a parenthetical that does
  // NOT match a known status word for this id (which means it is real
  // player-authored content, e.g. "Alex (nickname)", and must be preserved
  // byte-for-byte). Deliberately NOT a generic "(...)" stripper -- see
  // memory of prior fragile-parser bugs in this codebase.
  function stripLegacyStatusSuffix(id, rawValue) {
    var s = String(rawValue == null ? "" : rawValue).trim();
    if (!s) return null;
    var match = s.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
    if (!match) return null;
    var namePart = match[1].trim();
    var statusPart = match[2].trim().toLowerCase();
    if (!namePart) return null;
    var cid = canonicalId(id);
    var canonical = getStatusLabel(cid).toLowerCase();
    var legacyWords = LEGACY_STATUS_WORDS[cid] || [];
    var isKnownStatusWord = (!!canonical && statusPart === canonical) || legacyWords.indexOf(statusPart) !== -1;
    if (!isKnownStatusWord) return null;
    return namePart;
  }

  // Pure function. Applies stripLegacyStatusSuffix across every shape
  // player_identity_v1 has ever been observed in: root-map, {contacts:{}},
  // {names:{}} -- string value or {name|displayName|alias} object value
  // (matches index.html readIdentity/lookupIdentityName and
  // scenes/conversation.html readIdentityAnyShape/getIdentityName, which
  // already tolerate all three). Mutates identityObj in place and returns a
  // report. Does not touch localStorage -- kept pure so it is unit-testable
  // with a plain object and reusable from tools/qa.
  function migrateIdentityObject(identityObj) {
    var report = { changed: false, stripped: [] };
    if (!identityObj || typeof identityObj !== "object") return report;

    var shapes = [identityObj, identityObj.contacts, identityObj.names]
      .filter(function (m) { return m && typeof m === "object"; });

    Object.keys(STATUS_BY_ID).forEach(function (id) {
      shapes.forEach(function (map) {
        if (!Object.prototype.hasOwnProperty.call(map, id)) return;
        var v = map[id];
        var cur = typeof v === "string" ? v
          : (v && typeof v === "object" ? String(v.name || v.displayName || v.alias || "") : "");
        if (!cur) return;
        var stripped = stripLegacyStatusSuffix(id, cur);
        if (stripped == null || stripped === cur) return;
        if (typeof v === "string") map[id] = stripped;
        else map[id] = Object.assign({}, v, { name: stripped });
        report.changed = true;
        report.stripped.push({ id: id, before: cur, after: stripped });
      });
    });

    return report;
  }

  // Runs the exactly-once, idempotent save migration against a storage
  // object shaped like localStorage (getItem/setItem), across every known
  // storage key that can hold a legacy concatenated contact name. Safe to
  // call every boot: short-circuits instantly once MIGRATION_FLAG_KEY is
  // set, and is a pure no-op on any key that is missing/malformed/already
  // clean.
  function runIdentityMigration(storage) {
    var ls = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!ls) return { ran: false, reason: "no_storage" };

    try {
      if (ls.getItem(MIGRATION_FLAG_KEY) === "1") return { ran: false, reason: "already_migrated" };
    } catch (_) {
      return { ran: false, reason: "storage_unavailable" };
    }

    var changed = false;
    var stripped = [];
    [IDENTITY_KEY, CONTACT_NAMES_KEY].forEach(function (storageKey) {
      try {
        var raw = ls.getItem(storageKey);
        var obj = raw ? JSON.parse(raw) : null;
        if (obj && typeof obj === "object") {
          var report = migrateIdentityObject(obj);
          if (report.changed) {
            ls.setItem(storageKey, JSON.stringify(obj));
            changed = true;
            stripped = stripped.concat(report.stripped.map(function (r) {
              return Object.assign({ storageKey: storageKey }, r);
            }));
          }
        }
      } catch (_) { /* malformed blob at this key: leave untouched, other keys still processed */ }
    });

    try { ls.setItem(MIGRATION_FLAG_KEY, "1"); } catch (_) {}
    try {
      ls.setItem(MIGRATION_FLAG_KEY + "_report", JSON.stringify({ at: Date.now(), stripped: stripped }));
    } catch (_) {}

    return { ran: true, changed: changed, stripped: stripped };
  }

  // Second phase of the same migration: the conversations store (localStorage
  // "conversations", accessed only via the sanctioned Game.readConversationStore
  // / writeConversationStoreRaw primitives -- see notify-adapter.js and the
  // "Group 6 protected-write elimination" convention already used throughout
  // this codebase) can independently carry a copy of the same contaminated
  // string in its .name/.displayName/.contactName fields, mirrored there by
  // scenes/settings.html's patchConversationsName whenever a player has
  // pressed Save while the underlying identity value was still dirty. This
  // patches only fields that still literally match the exact pre-migration
  // value for that id -- never a blind rewrite -- so it is idempotent and
  // cannot touch a field a player customized independently.
  function mirrorMigrationIntoConversations(strippedList) {
    if (!Array.isArray(strippedList) || !strippedList.length) return { patched: 0 };
    if (typeof window === "undefined" || !window.Game || typeof window.Game.readConversationStore !== "function") {
      return { patched: 0, reason: "conversation_store_not_ready" };
    }

    var patched = 0;
    try {
      var store = window.Game.readConversationStore();
      if (!store) return { patched: 0 };

      var beforeById = {};
      strippedList.forEach(function (r) { beforeById[r.id] = r; });

      function patchOne(entry, id) {
        if (!entry || typeof entry !== "object") return;
        var r = beforeById[id];
        if (!r) return;
        ["name", "displayName", "contactName"].forEach(function (field) {
          if (typeof entry[field] === "string" && entry[field].trim() === r.before) {
            entry[field] = r.after;
            patched += 1;
          }
        });
      }

      if (Array.isArray(store)) {
        store.forEach(function (entry) {
          var id = canonicalId(entry && (entry.id || entry.key || entry.with || entry.contactId));
          patchOne(entry, id);
        });
      } else if (typeof store === "object") {
        Object.keys(store).forEach(function (id) { patchOne(store[id], canonicalId(id)); });
      }

      if (patched) window.Game.writeConversationStoreRaw(store);
    } catch (_) {}

    return { patched: patched };
  }

  var api = {
    version: 1,
    STATUS_BY_ID: STATUS_BY_ID,
    canonicalId: canonicalId,
    getStatusLabel: getStatusLabel,
    hasCanonicalStatus: hasCanonicalStatus,
    stripLegacyStatusSuffix: stripLegacyStatusSuffix,
    migrateIdentityObject: migrateIdentityObject,
    runIdentityMigration: runIdentityMigration,
    mirrorMigrationIntoConversations: mirrorMigrationIntoConversations
  };

  // Auto-run in the browser only. This script loads early and synchronously
  // (see index.html, right after character-routes.js) -- well before the
  // deferred scripts/notify-adapter.js that defines Game.readConversationStore
  // -- so the identity-string half of the migration runs immediately, and the
  // conversations-store mirror is deferred to DOMContentLoaded, matching the
  // exact same late-binding pattern index.html's own
  // readConversationStoreV2/writeConversationStoreV2 already use for the
  // same reason.
  if (typeof window !== "undefined") {
    try {
      var result = runIdentityMigration();
      if (result && result.ran && result.changed && result.stripped.length) {
        var applyMirror = function () {
          try { mirrorMigrationIntoConversations(result.stripped); } catch (_) {}
        };
        if (typeof document !== "undefined" && document.readyState === "loading") {
          window.addEventListener("DOMContentLoaded", applyMirror, { once: true });
        } else {
          setTimeout(applyMirror, 0);
        }
      }
    } catch (_) {}
  }

  return api;
});
