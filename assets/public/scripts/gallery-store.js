(function () {
  if (window.GalleryStore && window.GalleryStore.__v1 === true) return;

  const KEY = "gallery_photos";
  const LEGACY_KEYS = ["savedPhotos"];
  const GENERIC_OWNER_IDS = new Set(["", "unknown", "snapgram", "story", "post", "ig", "msg"]);
  let canonicalEligibilityProvider = null;
  let canonicalEligibilityPromise = null;
  let canonicalEligibilityCache = null;

  function canonicalOwner(raw) {
    const id = canonicalToken(raw);
    return id === "player" ? "mc" : id;
  }

  function safeParse(raw, fallback) {
    if (!raw) return fallback;
    try {
      const value = JSON.parse(raw);
      return value == null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch {}
    return null;
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch {}
    return false;
  }

  function canonicalToken(raw) {
    return String(raw || "").trim().toLowerCase().replace(/\s+/g, "_");
  }

  function normalizeImagePath(rawUrl) {
    return String(rawUrl || "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\.\//, "")
      .split("#")[0]
      .split("?")[0]
      .replace(/^\/+/, "")
      .toLowerCase();
  }

  function resolveVariantImage(rawUrl, ownerId = "") {
    const raw = String(rawUrl || "").trim();
    if (!raw) return "";
    try {
      if (window.Game && typeof window.Game.resolveCharacterVariantImage === "function") {
        const resolved = String(window.Game.resolveCharacterVariantImage(raw, ownerId) || "").trim();
        if (resolved) return resolved;
      }
    } catch {}
    return raw;
  }

  function isLargeInlineMedia(rawUrl) {
    const url = String(rawUrl || "");
    return /^(?:data:|blob:)/i.test(url) && url.length > 1024;
  }

  function isDefaultAvatarPath(rawUrl) {
    const url = normalizeImagePath(rawUrl);
    return !!url && ("/" + url).endsWith("/assets/avatars/default.jpg");
  }

  function isExcludedImagePath(rawUrl) {
    const url = normalizeImagePath(rawUrl);
    if (!url) return false;
    const normalized = "/" + url;
    return (
      normalized.endsWith("/assets/avatars/default.jpg") ||
      normalized.includes("/pictures/onlyfun/avatars/") ||
      normalized.includes("/onlyfun/avatars/")
    );
  }

  function urlFromEntry(entry) {
    if (!entry || typeof entry !== "object") return "";
    // Stored Gallery ownership is a durable viewed-media receipt. Never resolve
    // it again from the current story variant: doing so made an earned male
    // Mason path turn into its female counterpart after a later run changed
    // character_variant_mason (and vice versa).
    const direct = String(entry.url || entry.image || entry.photo || "").trim();
    if (direct) return direct;
    const src = String(entry.src || "").trim();
    if (/\.(?:jpe?g|png|webp|gif|mp4|webm|ogg|ogv|mov)(?:[?#].*)?$/i.test(src)) return src;
    return "";
  }

  function imageKeyFromEntry(entry) {
    const url = typeof entry === "string" ? entry : urlFromEntry(entry);
    const pathKey = normalizeImagePath(url);
    if (pathKey) return "path:" + pathKey;
    if (entry && typeof entry === "object") {
      const id = String(entry.imageId || entry.image_id || entry.hash || entry.imageHash || entry.galleryAssetId || entry.assetId || entry.id || "").trim();
      if (id) return "id:" + canonicalToken(id);
    }
    return "";
  }

  function canonicalSlotKey(entry) {
    const row = entry && typeof entry === "object" ? entry : { url: entry };
    const path = normalizeImagePath(urlFromEntry(row));
    if (!path) return imageKeyFromEntry(row);
    const owner = canonicalOwner(row.ownerId || row.owner || row.characterId || row.contactId || ownerFromSource(row.src || ""));
    if (!owner) return `path:${path}`;
    const escapedOwner = owner.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const variantSegment = new RegExp(`/(?:male|female)_${escapedOwner}/|/${escapedOwner}_(?:male|female)/`, "g");
    const pairedPath = path
      .replace(variantSegment, `/{variant}_${owner}/`)
      .replace(/\/avatars\/(?:male_mason|female_mason|mason|mason_female)\.jpg$/i, "/avatars/{mason_variant}.jpg")
      .replace(/\/hailey_(?:male_mason|mason_female)_arrived\.jpg$/i, "/hailey_{mason_variant}_arrived.jpg")
      .replace(/\/mason_fitness_first(?:_female)?_post\.jpg$/i, "/mason_fitness_first_{mason_variant}_post.jpg");
    return `owner:${owner}|path:${pairedPath}`;
  }

  function ownerFromSource(rawSource) {
    const source = String(rawSource || "").trim().toLowerCase();
    if (!source) return "";
    if (source.startsWith("msg:")) {
      const id = canonicalOwner(source.slice(4));
      return GENERIC_OWNER_IDS.has(id) ? "" : id;
    }
    if (source.startsWith("snapgram:")) {
      const id = canonicalToken(source.slice(9));
      return GENERIC_OWNER_IDS.has(id) ? "" : id;
    }
    if (source.startsWith("hak:")) {
      const id = canonicalToken(source.slice(4));
      return GENERIC_OWNER_IDS.has(id) ? "" : id;
    }
    if (source.startsWith("onlyfun:")) {
      const id = canonicalToken(source.slice(8));
      return GENERIC_OWNER_IDS.has(id) ? "" : id;
    }
    const plain = canonicalOwner(source);
    return GENERIC_OWNER_IDS.has(plain) ? "" : plain;
  }

  function timestampValue(entry) {
    const candidates = [entry?.at, entry?.timestamp, entry?.addedAt, entry?.unlockedAt, entry?.createdAt];
    for (const candidate of candidates) {
      const value = Number(candidate || 0) || (typeof candidate === "string" ? Date.parse(candidate) : 0);
      if (Number.isFinite(value) && value > 0) return value;
    }
    return 0;
  }

  function isOlderEntry(a, b, aIndex, bIndex) {
    const ta = timestampValue(a);
    const tb = timestampValue(b);
    if (ta > 0 && tb > 0 && ta !== tb) return ta < tb;
    if (ta > 0 && tb <= 0) return true;
    if (ta <= 0 && tb > 0) return false;
    return aIndex < bIndex;
  }

  function fillMissing(target, source) {
    const out = { ...(target && typeof target === "object" ? target : {}) };
    const incoming = source && typeof source === "object" ? source : {};
    const fields = [
      "id", "imageId", "image_id", "hash", "imageHash", "galleryAssetId", "assetId",
      "type", "mediaType", "label", "title", "src", "source", "app", "onceKey",
      "thumb", "thumbnail", "thumbnailSrc", "preview", "previewSrc", "poster",
      "characterId", "contactId", "kind", "route", "owner", "ownerId", "ownerName",
      "characterName", "contactName", "w", "h"
    ];
    fields.forEach((field) => {
      const current = out[field];
      const next = incoming[field];
      if ((current == null || current === "") && next != null && next !== "") out[field] = next;
    });
    if (incoming.evidenceAccessGranted === true) out.evidenceAccessGranted = true;
    const nextAccess = incoming.access;
    const priorSkill = String(out.access?.skillId || out.access?.id || "").trim();
    if (nextAccess && typeof nextAccess === "object" && !Array.isArray(nextAccess) &&
        (!out.access || (out.access.type === "skill" && (!priorSkill || priorSkill === "hak_audio_transcription_v1")))) {
      out.access = { ...out.access, ...nextAccess };
    }

    const prevOwner = canonicalOwner(out.ownerId || out.owner || out.characterId || out.contactId || "");
    const nextOwner = canonicalOwner(incoming.ownerId || incoming.owner || incoming.characterId || incoming.contactId || "");
    if ((!prevOwner || GENERIC_OWNER_IDS.has(prevOwner)) && nextOwner && !GENERIC_OWNER_IDS.has(nextOwner)) {
      out.ownerId = nextOwner;
    }
    if (!String(out.ownerName || out.characterName || out.contactName || "").trim()) {
      const nextName = String(incoming.ownerName || incoming.characterName || incoming.contactName || "").trim();
      if (nextName) out.ownerName = nextName;
    }
    if (!String(out.ownerId || "").trim()) {
      const fromSource = ownerFromSource(out.src || incoming.src || "");
      if (fromSource) out.ownerId = fromSource;
    }
    return out;
  }

  function normalizePhoto(photo) {
    if (!photo || typeof photo !== "object") return null;
    const ownerId = canonicalOwner(photo.ownerId || photo.owner || photo.characterId || photo.contactId || ownerFromSource(photo.src || ""));
    // Every new canonical Mason receipt is bound to the variant that is
    // authoritative at unlock time. Keeping a generic/male-authored source
    // path here let alternate ingestion paths (completion repair, replay,
    // legacy gallery_add) create male ownership on a Female Mason profile.
    // Stored rows are deliberately not re-resolved by normalizeStoredPhoto.
    const url = resolveVariantImage(urlFromEntry(photo), ownerId);
    if (!url || isLargeInlineMedia(url) || isExcludedImagePath(url)) return null;
    const imageKey = normalizeImagePath(url) ? `path:${normalizeImagePath(url)}` : imageKeyFromEntry({ ...photo, url });
    if (!imageKey) return null;
    const out = { ...photo, url, imageKey, ...(ownerId ? { ownerId } : {}) };
    out.at = timestampValue(out) || Date.now();
    return out;
  }

  function normalizeStoredPhoto(photo) {
    if (!photo || typeof photo !== "object") return null;
    let url = urlFromEntry(photo);
    const ownerId = canonicalOwner(photo.ownerId || photo.owner || photo.characterId || photo.contactId || ownerFromSource(photo.src || ""));
    // A stored row is a durable receipt for the exact asset that was earned.
    // Its canonical path must never be re-resolved through mutable character
    // state during read, migration, save/load, or a later application launch.
    if (/\/female_mason\/player_dick\.jpg(?:[?#].*)?$/i.test(url)) {
      url = url.replace(/\/female_mason\/player_dick\.jpg/i, "/male_mason/player_dick.jpg");
    }
    if (!url || isLargeInlineMedia(url) || isExcludedImagePath(url)) return null;
    const imageKey = normalizeImagePath(url) ? `path:${normalizeImagePath(url)}` : imageKeyFromEntry({ ...photo, url });
    if (!imageKey) return null;
    return { ...photo, url, imageKey, ...(ownerId ? { ownerId } : {}) };
  }

  function dedupeList(list) {
    const rows = Array.isArray(list) ? list : [];
    const byKey = new Map();
    let changed = !Array.isArray(list);
    let removedCount = 0;

    rows.forEach((raw, index) => {
      const row = normalizeStoredPhoto(raw);
      if (!row) {
        if (raw != null) changed = true;
        return;
      }
      const key = row.imageKey;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { row, firstIndex: index, lastIndex: index });
        if (JSON.stringify(raw) !== JSON.stringify(row)) changed = true;
        return;
      }

      removedCount += 1;
      changed = true;
      existing.lastIndex = index;
      if (isOlderEntry(row, existing.row, index, existing.firstIndex)) {
        existing.row = fillMissing(row, existing.row);
        existing.firstIndex = index;
      } else {
        existing.row = fillMissing(existing.row, row);
      }
      existing.row.imageKey = key;
    });

    const deduped = Array.from(byKey.values()).map((entry) => entry.row);
    deduped.sort((a, b) => {
      const tb = timestampValue(b);
      const ta = timestampValue(a);
      if (tb !== ta) return tb - ta;
      return String(a.url || "").localeCompare(String(b.url || ""));
    });

    if (!changed && deduped.length !== rows.length) changed = true;
    return { list: deduped, changed, removedCount };
  }

  function read(key = KEY) {
    if (key === KEY) {
      try {
        const owned = window.GameStateEngine?.getGalleryState?.()?.owned;
        if (owned && typeof owned === "object" && !Array.isArray(owned)) return Object.values(owned);
      } catch {}
    }
    const parsed = safeParse(safeGet(key), []);
    return Array.isArray(parsed) ? parsed : [];
  }

  function write(list, key = KEY) {
    const normalized = dedupeList(list).list;
    safeSet(key, JSON.stringify(normalized));
    return normalized;
  }

  function migrateStorage(options = {}) {
    const keys = options.includeLegacy === false ? [KEY] : [KEY, ...LEGACY_KEYS];
    const report = { changed: false, removedCount: 0, keys: {} };
    keys.forEach((key) => {
      const current = read(key);
      const result = dedupeList(current);
      if (result.changed) {
        safeSet(key, JSON.stringify(result.list));
        report.changed = true;
      }
      report.removedCount += result.removedCount;
      report.keys[key] = { before: current.length, after: result.list.length, removedCount: result.removedCount };
    });
    return report;
  }

  function emitAdded(photo, changed) {
    if (!changed) return;
    try { window.StoryBus?.emit?.("gallery:add", photo); } catch {}
    try { window.StoryBus?.emit?.("photo:new", photo); } catch {}
    try { window.dispatchEvent?.(new CustomEvent("gallery:add", { detail: photo })); } catch {}
  }

  function upsert(photo, options = {}) {
    const incoming = normalizePhoto(photo);
    if (!incoming) return { changed: false, inserted: false, photo: null, reason: "invalid" };

    // Canonical write-through. The legacy array below is retained solely for
    // pre-engine fixtures; production ownership is committed by the engine.
    try {
      const engine = window.GameStateEngine;
      const narrow = ["getGalleryMutationContext", "getGalleryMedia", "getGalleryReceipt"].every(name => typeof engine?.[name] === "function");
      const state = narrow ? engine.getGalleryMutationContext() : engine?.getState?.();
      if ((narrow ? state : state?.gallery) && typeof engine?.dispatch === "function") {
        const owned = mediaId => narrow ? engine.getGalleryMedia(mediaId) : state.gallery.owned?.[mediaId];
        const candidateId = String(incoming.mediaId || incoming.id || "").trim();
        const physicalPath = normalizeImagePath(incoming.url);
        let mediaId = (!/^p_[0-9]/.test(candidateId) && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidateId) && candidateId) || `gallery_${hashText(physicalPath)}`;
        // An authored evidence id is shared by both Mason variants. Load keeps
        // the earned collection, so that id must not swallow a second physical
        // asset. Preserve old ids/viewed markers; qualify only actual collisions.
        const initial = owned(mediaId);
        const idCollision = initial && normalizeImagePath(urlFromEntry(initial)) !== physicalPath;
        if (idCollision) mediaId += `:asset:${hashText(physicalPath)}`;
        let operationId = String(options.operationId || incoming.onceKey || incoming.receiptId || `gallery-unlock:${mediaId}`).trim();
        const priorReceipt = narrow ? engine.getGalleryReceipt(operationId) : state.gallery.receipts?.[operationId];
        if (idCollision || (priorReceipt && priorReceipt.mediaId !== mediaId)) operationId += `:asset:${hashText(physicalPath)}`;
        const previous = (idCollision ? owned(mediaId) : initial) || null;
        const existed = !!previous;
        // An app receipt is not a story step. Keep the complete execution
        // position, including a choice that is waiting for player input.
        const result = engine.dispatch({type:"UNLOCK_GALLERY_MEDIA",commandId:operationId,expectedRevision:state.revision,leaseId:state.execution?.lease?.id,payload:{operationId,mediaId,media:{...incoming,mediaId},nextStepIndex:state.execution.activeStepIndex}});
        if (!result?.ok && result?.status !== "DUPLICATE_COMMAND") return {changed:false,inserted:false,photo:null,reason:result?.status||"canonical_rejected"};
        const committed = (narrow ? engine.getGalleryMedia(mediaId) : engine.getGalleryState().owned?.[mediaId]) || {...incoming,mediaId};
        const ownerRepaired = existed && incoming.canonicalOwner === true && canonicalOwner(previous?.ownerId) !== canonicalOwner(committed?.ownerId);
        const accessRepaired = existed && ((previous?.evidenceAccessGranted !== true && committed?.evidenceAccessGranted === true) ||
          JSON.stringify(previous?.access || null) !== JSON.stringify(committed?.access || null));
        const reconciled = ownerRepaired || accessRepaired;
        emitAdded(committed, (!existed || reconciled) && options.emit !== false);
        return {changed:!existed || reconciled,inserted:!existed,photo:committed,canonical:true,reconciled};
      }
    } catch {}

    const arr = read(KEY);
    const key = incoming.imageKey;
    let idx = arr.findIndex((row) => imageKeyFromEntry(row) === key);
    if (idx < 0) {
      const incomingUrlKey = normalizeImagePath(incoming.url);
      idx = arr.findIndex((row) => normalizeImagePath(urlFromEntry(row)) === incomingUrlKey);
    }

    if (idx >= 0) {
      const previous = normalizeStoredPhoto(arr[idx]) || arr[idx];
      let merged = fillMissing(previous, incoming);
      if (incoming.canonicalOwner === true && canonicalOwner(incoming.ownerId) && canonicalOwner(previous.ownerId) !== canonicalOwner(incoming.ownerId)) {
        merged.ownerId = canonicalOwner(incoming.ownerId);
        merged.ownerName = String(incoming.ownerName || "").trim();
        merged.canonicalOwner = true;
      }
      merged.url = String(previous?.url || incoming.url || "").trim() || incoming.url;
      merged.imageKey = key;
      const prevAt = timestampValue(previous);
      const nextAt = timestampValue(incoming);
      if (nextAt > 0 && (prevAt <= 0 || nextAt < prevAt)) merged.at = nextAt;
      const changed = JSON.stringify(arr[idx]) !== JSON.stringify(merged);
      if (changed) {
        arr[idx] = merged;
        const cleaned = write(arr, KEY);
        const cleanedPhoto = cleaned.find((row) => imageKeyFromEntry(row) === key) || merged;
        emitAdded(cleanedPhoto, options.emit !== false);
        return { changed: true, inserted: false, photo: cleanedPhoto };
      }
      return { changed: false, inserted: false, photo: previous };
    }

    arr.unshift(incoming);
    write(arr, KEY);
    emitAdded(incoming, options.emit !== false);
    return { changed: true, inserted: true, photo: incoming };
  }

  function hashText(value) {
    let h = 2166136261;
    const text = String(value || "");
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16).padStart(8, "0");
  }

  function normalizeEligibility(raw) {
    const items = Array.isArray(raw?.items) ? raw.items : [];
    const byKey = new Map();
    items.forEach((entry) => {
      const row = normalizeStoredPhoto(entry);
      if (row && row.imageKey && !byKey.has(row.imageKey)) byKey.set(row.imageKey, row);
    });
    const normalizedItems = Array.from(byKey.values());
    // Category totals must be derived from the exact same normalized unique
    // registry as All and the card projection. Keeping the scanner's
    // pre-normalization byOwner map made aliases/variant slots disappear from
    // All while remaining in a category denominator (or vice versa).
    const byOwner = new Map();
    const labels = new Map();
    normalizedItems.forEach((row) => {
      const owners = [
        canonicalOwner(row?.ownerId || row?.owner || row?.characterId || row?.contactId || ""),
        ...(Array.isArray(row?.__extraOwnerIds) ? row.__extraOwnerIds.map(canonicalOwner) : [])
      ].filter((owner, index, list) => owner && !GENERIC_OWNER_IDS.has(owner) && list.indexOf(owner) === index);
      owners.forEach((owner) => {
        byOwner.set(owner, (byOwner.get(owner) || 0) + 1);
        if (!labels.has(owner)) labels.set(owner, String(row?.ownerName || row?.characterName || row?.contactName || "").trim());
      });
    });
    return {
      items: normalizedItems,
      ids: Array.from(byKey.keys()).sort(),
      total: byKey.size,
      byOwner,
      labels
    };
  }

  function registerCanonicalEligibilityProvider(provider) {
    if (typeof provider !== "function") return false;
    const alreadyRegistered = typeof canonicalEligibilityProvider === "function";
    canonicalEligibilityProvider = provider;
    // Scene scripts are remounted on every Gallery open. The content corpus is
    // immutable for this renderer, so keep the completed scan instead of
    // discarding it merely because the remount supplied a new function object.
    if (!alreadyRegistered) {
      canonicalEligibilityPromise = null;
      canonicalEligibilityCache = null;
      try { window.dispatchEvent(new CustomEvent("gallery:canonical-eligibility-changed")); } catch {}
    }
    return true;
  }

  async function getCanonicalEligibility() {
    if (!canonicalEligibilityProvider && typeof fetch !== "function") return null;
    if (!canonicalEligibilityPromise) {
      const provider = canonicalEligibilityProvider;
      // Achievements can open before Gallery mounts its scanner. Read the
      // same shipped registry so their denominator never depends on app order.
      const pending = Promise.resolve().then(async () => {
        if (provider) return provider();
        const response = await fetch("story/gallery_eligibility_registry.json", { cache: "no-store" });
        if (!response.ok) return null;
        const raw = await response.json();
        return raw?.schemaVersion === 1 && Array.isArray(raw.items) && raw.items.length > 0 && raw.total === raw.items.length ? raw : null;
      }).then((raw) => {
        const normalized = raw ? normalizeEligibility(raw) : null;
        if (canonicalEligibilityProvider === provider) canonicalEligibilityCache = normalized;
        if (!normalized && canonicalEligibilityPromise === pending) canonicalEligibilityPromise = null;
        return normalized;
      }).catch((error) => {
        if (canonicalEligibilityPromise === pending) canonicalEligibilityPromise = null;
        throw error;
      });
      canonicalEligibilityPromise = pending;
    }
    return canonicalEligibilityPromise;
  }

  async function canonicalProgress(earned = read(KEY)) {
    const eligibility = await getCanonicalEligibility();
    if (!eligibility) return null;
    const eligible = new Set(eligibility.ids);
    const eligibleSlots = new Set(eligibility.items.map(canonicalSlotKey).filter(Boolean));
    const countableRows = (Array.isArray(earned) ? earned : [])
      .map(normalizeStoredPhoto)
      .filter(Boolean)
      .filter((row) => eligible.has(row.imageKey) || eligibleSlots.has(canonicalSlotKey(row)));
    const bySlot = new Map();
    const canonicalBySlot = new Map(eligibility.items.map(row => [canonicalSlotKey(row), row.imageKey]));
    const discoveredCanonicalIds = new Set();
    countableRows.forEach((row) => {
      const slot = canonicalSlotKey(row) || row.imageKey;
      if (!bySlot.has(slot)) bySlot.set(slot, row);
      const id = eligible.has(row.imageKey) ? row.imageKey : canonicalBySlot.get(slot);
      if (id) discoveredCanonicalIds.add(id);
    });
    const earnedIds = Array.from(new Set(countableRows.map((row) => row.imageKey))).sort();
    return {
      discovered: discoveredCanonicalIds.size,
      discoveredIds: Array.from(discoveredCanonicalIds).sort(),
      total: eligibility.total,
      earnedIds,
      countableEarnedIds: earnedIds.slice(),
      earnedSlotIds: Array.from(bySlot.keys()).sort(),
      eligibleIds: eligibility.ids.slice()
    };
  }

  function isCountableEntry(entry) {
    const row = normalizeStoredPhoto(entry);
    if (!row || !canonicalEligibilityCache) return false;
    if (canonicalEligibilityCache.ids.includes(row.imageKey)) return true;
    const slots = new Set(canonicalEligibilityCache.items.map(canonicalSlotKey).filter(Boolean));
    return slots.has(canonicalSlotKey(row));
  }

  const api = {
    __v1: true,
    KEY,
    normalizeImagePath,
    imageKeyFromEntry,
    canonicalSlotKey,
    isExcludedImagePath,
    dedupeList,
    migrateStorage,
    read,
    write,
    upsert,
    registerCanonicalEligibilityProvider,
    getCanonicalEligibility,
    canonicalProgress,
    isCountableEntry
  };

  window.GalleryStore = api;
  window.Gallery = window.Gallery || {};
  if (typeof window.Gallery.addPhoto !== "function") {
    window.Gallery.addPhoto = function addPhoto(photo) {
      return api.upsert(photo);
    };
  }

  try { api.migrateStorage({ includeLegacy: true }); } catch {}
})();
