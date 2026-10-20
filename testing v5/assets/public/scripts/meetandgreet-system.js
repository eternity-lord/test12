// scripts/meetandgreet-system.js
// JSON-driven MeetAndGreet state/actions.
(() => {
  "use strict";
  if (window.MeetAndGreetSystem && window.MeetAndGreetSystem.__v === "2026-09-28-mg-canonical-projection-v1") return;

  const KEYS = Object.freeze({
    unlocked: "meetandgreet_unlocked_v1",
    profiles: "meetandgreet_profiles_v1",
    photos: "meetandgreet_photos_v1",
    comments: "meetandgreet_comments_v1",
    tips: "meetandgreet_tips_v1",
    tipSeen: "meetandgreet_tip_seen_v1",
    badge: "meetandgreet_badge_v1",
    seen: "meetandgreet_seen_v1",
    missingArtDebt: "meetandgreet_missing_art_debt_v1",
    featureUnlocked: "feature_meetandgreet_unlocked",
    appBadges: "app_badges_v1",
    homePopApp: "home_pop_app_v1",
    openIntent: "meetandgreet_open_intent_v1"
  });

  const PLACEHOLDER_IMAGE = "assets/avatars/evelyn.jpg";
  const ACTION_TYPES = Object.freeze([
    "meetandgreet_unlock_app",
    "meetandgreet_notify",
    "meetandgreet_profile_unlock",
    "meetandgreet_photo_add",
    "meetandgreet_comment_add",
    "meetandgreet_tip",
    "meetandgreet_open",
    "meetandgreet_badge"
  ]);
  const ACTION_TYPE_SET = new Set(ACTION_TYPES);
  function sourceText(source) {
    return window.Game?.i18n?.sourceText?.(source) || String(source || "");
  }
  function uiText(key, source) {
    return window.Game?.i18n?.ui?.(key, source) || String(source || "");
  }
  function escHtml(value) {
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  const STORY_ACTION_FILES = [
    "story/DAY10/nts/DAY10_02_EVELYN_EVENING_NTS.json",
    "story/DAY11/nts/DAY11_01_EVELYN_AFTERNOON_NTS.json",
    "story/DAY11/nts/DAY11_02_EVELYN_EVENING_NTS.json",
    "story/DAY12/nts/DAY12_01_EVELYN_AFTERNOON_NTS.json",
    "story/DAY12/nts/DAY12_02_EVELYN_EVENING_NTS.json",
    "story/DAY13/nts/DAY13_02_EVELYN_EVENING_NTS.json",
    "story/DAY14/nts/DAY14_01_EVELYN_AFTERNOON_NTS.json",
    "story/DAY14/nts/DAY14_02_EVELYN_EVENING_NTS.json",
    "story/DAY15/nts/DAY15_01_EVELYN_AFTERNOON_NTS.json",
    "story/DAY15/nts/DAY15_02_EVELYN_EVENING_NTS.json"
  ];
  const STORY_ACTIONS_BY_ONCE = Object.freeze({
    d10_02_evelyn_evening_nts_v1: Object.freeze([
    ]),
    d11_01_evelyn_afternoon_nts_v1: Object.freeze([
    ]),
    d11_02_evelyn_evening_nts_v1: Object.freeze([
    ]),
    d12_01_evelyn_afternoon_nts_v1: Object.freeze([
    ]),
    d12_02_evelyn_evening_nts_v1: Object.freeze([
    ]),
    d13_02_evelyn_evening_nts_v1: Object.freeze([
    ]),
    d14_01_evelyn_afternoon_nts_v1: Object.freeze([
    ]),
    d14_02_evelyn_evening_nts_v1: Object.freeze([
    ]),
    d15_01_evelyn_afternoon_nts_v1: Object.freeze([
    ]),
    d15_02_evelyn_evening_nts_v1: Object.freeze([
    ])
  });

  const DEFAULT_PROFILES = Object.freeze({
    laurent: Object.freeze({
      profileId: "laurent",
      name: "Laurent",
      meta: "48 - Business consultant",
      portrait: 0,
      avatar: "assets/pictures/meetandgreet/laurent.jpg",
      blurb: "A reserved professional looking for calm company outside work.",
      tags: ["Coffee", "Conversation", "Public places"],
      about: "Laurent runs his own consulting firm and spends most of his time working. He values discretion, easy conversation, and a quiet hour without expectations."
    }),
    noah: Object.freeze({
      profileId: "noah",
      name: "Noah",
      meta: "34 - Creative director",
      portrait: 1,
      avatar: "assets/pictures/meetandgreet/noah.jpg",
      blurb: "Warm, sociable, and looking for an uncomplicated cinema date.",
      tags: ["Cinema", "Walks", "Hand-holding"],
      about: "Noah is relaxed and attentive. He prefers simple dates, clear boundaries, and someone who can make an ordinary afternoon feel special."
    }),
    lucas: Object.freeze({
      profileId: "lucas",
      name: "Lucas",
      meta: "27 - Product designer",
      portrait: 2,
      avatar: "assets/pictures/meetandgreet/lucas.png",
      blurb: "Confident and generous, with a taste for couple-style outings.",
      tags: ["Shopping", "Aquarium", "Dinner"],
      about: "Lucas likes planned full-day outings and affectionate couple roleplay. He is direct about expectations and agrees to ask before any physical contact."
    })
  });

  function canonicalId(raw) {
    return String(raw || "").trim().toLowerCase().replace(/\s+/g, "_");
  }

  function profileId(raw) {
    return canonicalId(raw).replace(/^profile_/, "");
  }

  function safeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
  function safeSet(key, value) { try { localStorage.setItem(key, String(value)); } catch {} }
  function safeRemove(key) { try { localStorage.removeItem(key); } catch {} }
  function parseJson(raw, fallback) { try { return JSON.parse(raw); } catch { return fallback; } }

  function readObject(key) {
    const parsed = parseJson(safeGet(key), {});
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  }

  function writeObject(key, value) {
    safeSet(key, JSON.stringify(value && typeof value === "object" && !Array.isArray(value) ? value : {}));
  }

  function readArray(key) {
    const parsed = parseJson(safeGet(key), []);
    return Array.isArray(parsed) ? parsed : [];
  }

  function writeArray(key, value) {
    safeSet(key, JSON.stringify(Array.isArray(value) ? value : []));
  }

  function clone(value) {
    return parseJson(JSON.stringify(value), value);
  }

  // Local keys are compatibility projections only. Save/Load owns received
  // content through canonical effect receipts and completed authored stories;
  // viewed content lives in a small canonical UI variable captured by saves.
  const authoredStories = new Map();
  const liveEffects = new Map();
  let projectionStamp = "", projectionIdentity = "", projectionBusy = false;
  let viewCommandSequence = 0, authoredVersion = 0;
  function canonicalProjection() {
    return window.GameStateEngine?.getMeetAndGreetProjectionState?.() || null;
  }
  function lifetime() {
    const engine = window.GameStateEngine;
    return { engine, identity: JSON.stringify(engine?.getRuntimeLifecycleIdentity?.() || canonicalProjection()?.identity || {}) };
  }
  function lifetimeCurrent(owner) {
    const current = lifetime();
    return current.engine === owner.engine && current.identity === owner.identity;
  }
  function writeProjected(key, value) {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    if (safeGet(key) !== text) safeSet(key, text);
  }
  function synchronizeCanonicalProjection() {
    if (projectionBusy) return;
    const engine = window.GameStateEngine;
    const stamp = JSON.stringify(engine?.getRuntimeLifecycleIdentity?.() || {}) + ":" + authoredVersion;
    if (projectionStamp === stamp && projectionEngine === engine) return;
    const authority = canonicalProjection();
    if (!authority) return;
    projectionBusy = true;
    try {
      const identity = JSON.stringify(authority.identity);
      if (projectionIdentity && identity !== projectionIdentity) {
        safeRemove(KEYS.openIntent);
        if (safeGet(KEYS.homePopApp) === "meetandgreet") safeRemove(KEYS.homePopApp);
        try { document.querySelectorAll?.(".mg-tip-pop").forEach(node => node.remove()); } catch {}
      }
      projectionIdentity = identity;
      const once = new Set(authority.onceKeys || []), effects = authority.effects || [];
      const actions = new Map();
      for (const [storyPath, story] of authoredStories) {
        const ids = new Set([story.id, story.onceKey, storyPath]);
        for (const entry of window.StoryAdmissionCatalog || []) if (entry.path === storyPath) ids.add(entry.id);
        (story.steps || []).forEach((step, index) => {
          if (!ACTION_TYPE_SET.has(step.type)) return;
          const receipt = effects.find(row => ids.has(row.storyId) && Number(row.stepIndex) === index && row.effectType === step.type);
          // Older canonical snapshots may have compacted receipts. A completed
          // onceKey authorizes this authored story, never another local timeline.
          const activePrefix = authority.execution?.activeStoryPath === storyPath &&
            Number(authority.execution?.cursor?.rootIndex) > index;
          if (!receipt && !once.has(story.onceKey) && !activePrefix) return;
          actions.set(storyPath + ":" + index, { step, order: Number(story.day || storyPath.match(/DAY(\d+)/)?.[1] || 0) * 10000 + index, receipt });
        });
      }
      for (const receipt of effects) {
        const live = liveEffects.get(receipt.eventId);
        if (!live || [...actions.values()].some(row => row.receipt?.eventId === receipt.eventId)) continue;
        actions.set(receipt.eventId, {step:live,order:Number(receipt.committedRevision)||0,receipt});
      }
      const profiles = {}, photos = {}, comments = {}, tips = [];
      const profile = (pid, step = {}, order = 1) => {
        const value = normalizeProfile({...step,profileId:pid,unlockedAt:order});
        if (value) profiles[value.profileId] = {...(profiles[value.profileId] || {}),...value};
      };
      for (const {step,order} of [...actions.values()].sort((a,b)=>a.order-b.order)) {
        const pid = profileId(step.profileId || step.profile || step.id);
        if (step.type === "meetandgreet_profile_unlock") profile(pid,step,order);
        if (step.type === "meetandgreet_photo_add") {
          const value = normalizePhoto({...step,addedAt:order});
          if (value) { profile(value.profileId,{},order); const list=photos[value.profileId] ||= []; if (!list.some(row=>row.photoId===value.photoId)) list.push(value); }
        }
        if (step.type === "meetandgreet_comment_add") {
          const value = normalizeComment({...step,addedAt:order});
          if (value) { profile(value.profileId,{},order); const list=comments[value.profileId] ||= []; if (!list.some(row=>row.commentId===value.commentId)) list.push(value); }
        }
        if (step.type === "meetandgreet_tip") {
          const value = normalizeTip({...step,receivedAt:order});
          if (value && !tips.some(row=>row.tipId===value.tipId)) { if(value.profileId)profile(value.profileId,{},order); tips.push(value); }
        }
      }
      const unlocked = authority.unlocked || once.has("d10_02_evelyn_evening_nts_v1");
      // A received photo/profile is canonical evidence of this app even in an
      // older mid-story save whose legacy unlock was not imported separately.
      const available = unlocked || Object.keys(profiles).length > 0;
      if (!available) {
        safeRemove(KEYS.openIntent);
        if (safeGet(KEYS.homePopApp) === "meetandgreet") safeRemove(KEYS.homePopApp);
      }
      for (const key of [KEYS.unlocked,KEYS.featureUnlocked]) {
        if (available) writeProjected(key,"1"); else safeRemove(key);
      }
      writeProjected(KEYS.profiles,profiles);writeProjected(KEYS.photos,photos);
      writeProjected(KEYS.comments,comments);writeProjected(KEYS.tips,tips);
      writeProjected(KEYS.seen,authority.view?.seen || []);writeProjected(KEYS.tipSeen,authority.view?.tipSeen || []);
      // Missing-art diagnostics are scoped to this app timeline as well.
      const images = new Set(Object.values(photos).flat().map(row=>row.image));
      writeProjected(KEYS.missingArtDebt,readArray(KEYS.missingArtDebt).filter(row=>images.has(row.intended || row.path)));
      projectionEngine = engine;
      projectionStamp = stamp;
    } finally { projectionBusy = false; }
  }
  let projectionEngine = null;
  function persistView(field, values) {
    if (isTimelineReplayContext({})) return false;
    const engine = window.GameStateEngine, authority = canonicalProjection();
    if (!authority) { writeArray(field === "seen" ? KEYS.seen : KEYS.tipSeen,values); return true; }
    const view = {seen:authority.view?.seen || [],tipSeen:authority.view?.tipSeen || [],[field]:values};
    const result = engine.dispatch({type:"SET_MEETANDGREET_VIEW_STATE",commandId:"meetandgreet:view:"+Date.now()+":"+(++viewCommandSequence),expectedRevision:engine.getRevision(),payload:view});
    if (!result.ok) return false;
    projectionStamp = "";synchronizeCanonicalProjection();return true;
  }

  function isTimelineReplayContext(opts = {}) {
    if (opts && (opts.replay === true || opts.timelineReplay === true)) return true;
    if (opts && (opts.reconstruct === true || opts.allowReplayWrite === true)) return false;
    try {
      const params = new URLSearchParams(location.search || "");
      if (canonicalId(params.get("mode")) === "timeline_replay") return true;
      const from = canonicalId(params.get("from") || params.get("source"));
      if (from === "story_route_tree_replay") return true;
    } catch {}
    try {
      const boot = parseJson(safeGet("__boot_from_save"), null);
      const q = boot && typeof boot === "object" ? (boot.query || boot.lastQuery || {}) : {};
      if (canonicalId(q.mode) === "timeline_replay") return true;
      if (canonicalId(q.from || q.source) === "story_route_tree_replay") return true;
    } catch {}
    return false;
  }

  function defaultProfile(rawProfileId) {
    const pid = profileId(rawProfileId);
    const src = DEFAULT_PROFILES[pid] || {};
    return {
      profileId: pid,
      name: src.name || (pid ? pid.charAt(0).toUpperCase() + pid.slice(1) : "Unknown"),
      meta: src.meta || "",
      portrait: Number(src.portrait || 0) || 0,
      avatar: src.avatar || "assets/avatars/default.jpg",
      blurb: src.blurb || "",
      tags: Array.isArray(src.tags) ? src.tags.slice() : [],
      about: src.about || ""
    };
  }

  function normalizeProfile(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    const pid = profileId(src.profileId || src.id || src.profile || "");
    if (!pid) return null;
    const base = defaultProfile(pid);
    return {
      ...base,
      ...src,
      profileId: pid,
      id: pid,
      name: String(src.name || base.name || pid).trim() || pid,
      meta: String(src.meta || src.subtitle || base.meta || "").trim(),
      portrait: Number(src.portrait ?? base.portrait ?? 0) || 0,
      avatar: String(src.avatar || base.avatar || "assets/avatars/default.jpg").trim(),
      blurb: String(src.blurb || src.description || base.blurb || "").trim(),
      tags: Array.isArray(src.tags) ? src.tags.map(String) : base.tags.slice(),
      about: String(src.about || base.about || "").trim(),
      unlockedAt: Number(src.unlockedAt || Date.now()) || Date.now()
    };
  }

  function itemId(prefix, pid, rawId) {
    const id = canonicalId(rawId);
    return id || (prefix + "_" + pid + "_" + Date.now());
  }

  function normalizePhoto(step) {
    const pid = profileId(step?.profileId || step?.profile || "");
    if (!pid) return null;
    const photoId = itemId("photo", pid, step?.photoId || step?.id);
    const image = String(step?.image || step?.url || step?.src || step?.photo || "").trim();
    if (!image) return null;
    return {
      id: photoId,
      photoId,
      profileId: pid,
      image,
      src: image,
      galleryOwnerId: canonicalId(step?.galleryOwnerId || step?.ownerId || ""),
      caption: String(step?.caption || step?.title || "").trim(),
      title: String(step?.title || step?.caption || "").trim(),
      day: String(step?.day || "").trim(),
      missingArtDebt: step?.missingArtDebt === true ? true : String(step?.missingArtDebt || "").trim(),
      addedAt: Number(step?.addedAt || step?.timestamp || step?.at || Date.now()) || Date.now()
    };
  }

  function normalizeComment(step) {
    const pid = profileId(step?.profileId || step?.profile || "");
    if (!pid) return null;
    const commentId = itemId("comment", pid, step?.commentId || step?.id);
    const text = String(step?.text || step?.comment || "").trim();
    if (!text) return null;
    return {
      id: commentId,
      commentId,
      profileId: pid,
      photoId: canonicalId(step?.photoId || step?.photo || ""),
      from: String(step?.from || step?.fromName || "MeetAndGreet").trim() || "MeetAndGreet",
      text,
      addedAt: Number(step?.addedAt || step?.timestamp || step?.at || Date.now()) || Date.now()
    };
  }

  function normalizeTip(step) {
    const src = step && typeof step === "object" ? step : {};
    const pid = profileId(src.profileId || src.profile || "");
    const amount = Math.max(0, Math.floor(Number(src.amount || src.value || 0) || 0));
    const tipId = itemId("tip", pid || "meetandgreet", src.tipId || src.paymentId || src.id || src.onceKey);
    if (!tipId || amount <= 0) return null;
    const profile = pid ? defaultProfile(pid) : null;
    const clientName = String(src.fromName || src.clientName || profile?.name || "").trim();
    const label = String(src.label || (src.kind === "payment" ? "PAYMENT" : "TIP")).trim() || "TIP";
    const text = String(src.text || src.message || (clientName ? (clientName + " sent you a tip") : "MeetAndGreet payment received")).trim();
    return {
      id: tipId,
      tipId,
      profileId: pid,
      amount,
      currency: String(src.currency || "$").trim() || "$",
      label,
      text,
      fromName: clientName,
      avatar: String(src.avatar || profile?.avatar || "").trim(),
      receivedAt: Number(src.receivedAt || src.timestamp || src.at || Date.now()) || Date.now()
    };
  }

  function readBadge() {
    return Math.max(0, Math.floor(Number(safeGet(KEYS.badge) || 0) || 0));
  }

  function emitBadge(value) {
    const count = Math.max(0, Math.floor(Number(value || 0) || 0));
    safeSet(KEYS.badge, String(count));
    const badges = readObject(KEYS.appBadges);
    if (count > 0) badges.meetandgreet = count;
    else delete badges.meetandgreet;
    writeObject(KEYS.appBadges, badges);
    try { window.dispatchEvent(new CustomEvent("app:badge-changed", { detail: { app: "meetandgreet", value: count } })); } catch {}
    try { window.dispatchEvent(new CustomEvent("game:badges-updated", { detail: { app: "meetandgreet", value: count } })); } catch {}
  }

  function bumpBadge(delta = 1) {
    emitBadge(readBadge() + Math.max(0, Math.floor(Number(delta || 0) || 0)));
  }

  function photoSeenId(rawProfileId, rawPhotoId) {
    const pid = profileId(rawProfileId);
    const id = canonicalId(rawPhotoId);
    return pid && id ? "photo:" + pid + ":" + id : "";
  }

  function readSeenSet() {
    synchronizeCanonicalProjection();
    return new Set(readArray(KEYS.seen).map(canonicalId).filter(Boolean));
  }

  function writeSeenSet(seen) {
    persistView("seen", Array.from(seen || []).map(canonicalId).filter(Boolean));
  }

  function unreadPhotoIdsForState(state = null) {
    const src = state || getState(false);
    const seen = readSeenSet();
    const ids = [];
    (src.profiles || []).forEach((profile) => {
      const pid = profileId(profile?.profileId || profile?.id);
      if (!pid) return;
      (src.photos?.[pid] || []).forEach((photo) => {
        const id = photoSeenId(pid, photo?.photoId || photo?.id);
        if (id && !seen.has(id)) ids.push(id);
      });
    });
    return ids;
  }

  function syncUnreadBadge() {
    const count = getState(false).badge;
    emitBadge(count);
    return count;
  }

  function unlockApp(opts = {}) {
    safeSet(KEYS.unlocked, "1");
    safeSet(KEYS.featureUnlocked, "1");
    if (opts.homePop !== false) safeSet(KEYS.homePopApp, "meetandgreet");
  }

  function isUnlocked() {
    synchronizeCanonicalProjection();
    return safeGet(KEYS.unlocked) === "1" || safeGet(KEYS.featureUnlocked) === "1";
  }

  function hasCompletedOnce(onceKey) {
    const key = String(onceKey || "").trim();
    if (!key) return false;
    if (window.GameStateEngine?.hasOnceKey) return window.GameStateEngine.hasOnceKey(key);
    return safeGet("once_" + key) === "1" || safeGet("__once:" + key) === "1" || safeGet("story_" + key + "_done") === "1";
  }

  function upsertProfile(rawProfile, opts = {}) {
    const normalized = normalizeProfile(rawProfile);
    if (!normalized) return { changed: false, profileId: "" };
    unlockApp({ homePop: opts.homePop });
    const profiles = readObject(KEYS.profiles);
    const prev = profiles[normalized.profileId] && typeof profiles[normalized.profileId] === "object" ? profiles[normalized.profileId] : null;
    profiles[normalized.profileId] = { ...(prev || {}), ...normalized, unlockedAt: prev?.unlockedAt || normalized.unlockedAt };
    writeObject(KEYS.profiles, profiles);
    const changed = !prev;
    if (changed && opts.bumpBadge !== false) syncUnreadBadge();
    return { changed, profileId: normalized.profileId, profile: profiles[normalized.profileId] };
  }

  function addPhoto(step, opts = {}) {
    const photo = normalizePhoto(step);
    if (!photo) return { changed: false, profileId: "", photoId: "" };
    upsertProfile({ profileId: photo.profileId }, { bumpBadge: false, homePop: false });
    const photos = readObject(KEYS.photos);
    const list = Array.isArray(photos[photo.profileId]) ? photos[photo.profileId] : [];
    const idx = list.findIndex((row) => canonicalId(row?.photoId || row?.id) === photo.photoId);
    const changed = idx < 0;
    if (idx >= 0) list[idx] = { ...list[idx], ...photo };
    else list.push(photo);
    photos[photo.profileId] = list;
    writeObject(KEYS.photos, photos);
    persistGalleryPhoto(photo);
    if (photo.missingArtDebt) registerMissingArtDebt(photo.image, photo.missingArtDebt, { profileId: photo.profileId, photoId: photo.photoId });
    if (changed && opts.bumpBadge !== false) syncUnreadBadge();
    return { changed, profileId: photo.profileId, photoId: photo.photoId, photo };
  }

  function persistGalleryPhoto(photo) {
    const ownerId = canonicalId(photo?.galleryOwnerId || photo?.profileId);
    if (!ownerId || !photo?.image) return null;
    return window.GalleryStore?.upsert?.({
      id: "meetandgreet:" + photo.profileId + ":" + photo.photoId,
      url: photo.image,
      ownerId,
      canonicalOwner: true,
      src: "meetandgreet:" + ownerId,
      caption: photo.caption || photo.title || "",
      addedAt: photo.addedAt
    });
  }

  async function reconcileGalleryPhotos() {
    if (isTimelineReplayContext({})) return [];
    const owner = lifetime();
    if (canonicalProjection()) await reconstructFromCompletedStories();
    if (!lifetimeCurrent(owner)) return [];
    synchronizeCanonicalProjection();
    const initial = readObject(KEYS.photos);
    if (!Object.values(initial).some(rows => Array.isArray(rows) && rows.length)) return [];
    const owners = new Map();
    if (Object.values(initial).some(rows => Array.isArray(rows) && rows.some(row => !row.galleryOwnerId))) {
      await Promise.all(STORY_ACTION_FILES.map(async storyPath => {
        const response = await fetch(storyPath, { cache: "no-store" });
        if (!response.ok && Number(response.status || 0) !== 0) return;
        const story = await response.json();
        for (const step of story.steps || []) {
          if (step.type !== "meetandgreet_photo_add") continue;
          const photo = normalizePhoto(step);
          if (photo?.galleryOwnerId) owners.set(photo.profileId + ":" + photo.photoId, photo.galleryOwnerId);
        }
      }));
    }
    // Read again after loading metadata: a save may have changed while awaiting fetch.
    if (!lifetimeCurrent(owner) || isTimelineReplayContext({})) return [];
    const photos = readObject(KEYS.photos), results = [];
    for (const [pid, rows] of Object.entries(photos)) {
      for (const row of Array.isArray(rows) ? rows : []) {
        const photo = normalizePhoto({ ...row, profileId: pid });
        if (!photo) continue;
        photo.galleryOwnerId ||= owners.get(photo.profileId + ":" + photo.photoId) || photo.profileId;
        row.galleryOwnerId = photo.galleryOwnerId;
        results.push(persistGalleryPhoto(photo));
      }
    }
    writeObject(KEYS.photos, photos);
    return results;
  }

  function addComment(step, opts = {}) {
    const comment = normalizeComment(step);
    if (!comment) return { changed: false, profileId: "", commentId: "" };
    upsertProfile({ profileId: comment.profileId }, { bumpBadge: false, homePop: false });
    const comments = readObject(KEYS.comments);
    const list = Array.isArray(comments[comment.profileId]) ? comments[comment.profileId] : [];
    const idx = list.findIndex((row) => canonicalId(row?.commentId || row?.id) === comment.commentId);
    const changed = idx < 0;
    if (idx >= 0) list[idx] = { ...list[idx], ...comment };
    else list.push(comment);
    comments[comment.profileId] = list;
    writeObject(KEYS.comments, comments);
    if (changed && opts.bumpBadge !== false) syncUnreadBadge();
    return { changed, profileId: comment.profileId, commentId: comment.commentId, comment };
  }

  function registerMissingArtDebt(path, reason, extra = {}) {
    const intended = String(path || "").trim();
    if (!intended || intended === PLACEHOLDER_IMAGE) return false;
    const debt = readArray(KEYS.missingArtDebt);
    const key = canonicalId(intended);
    if (debt.some((row) => canonicalId(row?.intended || row?.path) === key)) return false;
    debt.push({
      intended,
      placeholder: PLACEHOLDER_IMAGE,
      reason: typeof reason === "string" && reason.trim() ? reason.trim() : "Temporary MeetAndGreet art placeholder debt",
      ...extra,
      addedAt: Date.now()
    });
    writeArray(KEYS.missingArtDebt, debt);
    return true;
  }

  function notify(step = {}) {
    const text = sourceText(String(step.text || step.message || "New MeetAndGreet update available.").trim());
    if (!text) return false;
    const pid = profileId(step.profileId || step.profile || "");
    const profile = pid ? defaultProfile(pid) : null;
    const fromName = String(step.fromName || profile?.name || "MeetAndGreet").trim() || "MeetAndGreet";
    const avatar = String(step.avatar || profile?.avatar || "assets/avatars/default.jpg").trim() || "assets/avatars/default.jpg";
    try {
      window.Game?.notify?.({
        app: "meetandgreet",
        id: String(step.id || step.onceKey || ("meetandgreet_" + Date.now())).trim(),
        fromId: "meetandgreet",
        fromName,
        avatar,
        text,
        target: "meetandgreet",
        open: step.profileId ? { scene: "meetandgreet", profileId: profileId(step.profileId) } : { scene: "meetandgreet" },
        __eventId: String(step.__eventId || step.eventId || step.onceKey || "").trim() || undefined
      });
      return true;
    } catch {
      return false;
    }
  }

  function readTipSeenSet() {
    synchronizeCanonicalProjection();
    return new Set(readArray(KEYS.tipSeen).map(canonicalId).filter(Boolean));
  }

  function writeTipSeenSet(seen) {
    persistView("tipSeen", Array.from(seen || []).map(canonicalId).filter(Boolean));
  }

  function markTipSeen(rawTipId) {
    const id = canonicalId(rawTipId);
    if (!id) return false;
    if (!getState(false).tips.some(row => canonicalId(row.tipId || row.id) === id)) return false;
    const seen = readTipSeenSet();
    const before = seen.size;
    seen.add(id);
    if (seen.size !== before) writeTipSeenSet(seen);
    return seen.size !== before;
  }

  function injectTipStyles() {
    if (document.getElementById("meetandgreet-tip-style-v1")) return;
    const style = document.createElement("style");
    style.id = "meetandgreet-tip-style-v1";
    style.textContent = `
      .mg-tip-pop{position:fixed;inset:0;z-index:100040;display:grid;place-items:center;pointer-events:none;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial}
      .mg-tip-pop-card{min-width:min(280px,calc(100vw - 48px));max-width:min(360px,calc(100vw - 40px));padding:18px 20px;border:1px solid rgba(255,224,138,.72);border-radius:8px;background:linear-gradient(145deg,rgba(28,20,9,.96),rgba(8,10,14,.96));box-shadow:0 0 0 1px rgba(255,255,255,.08),0 24px 80px rgba(0,0,0,.55),0 0 42px rgba(255,194,74,.4);text-align:center;color:#fff;animation:mg-tip-pop-in 2.35s ease forwards}
      .mg-tip-pop-amount{font-size:34px;line-height:1;font-weight:950;letter-spacing:0;color:#ffe08a;text-shadow:0 0 22px rgba(255,205,92,.7)}
      .mg-tip-pop-text{margin-top:8px;font-size:13px;line-height:1.35;font-weight:800;color:rgba(255,255,255,.86)}
      @keyframes mg-tip-pop-in{0%{opacity:0;transform:translateY(16px) scale(.88)}12%{opacity:1;transform:translateY(0) scale(1.04)}22%{transform:scale(1)}78%{opacity:1;transform:scale(1)}100%{opacity:0;transform:translateY(-12px) scale(.97)}}
    `;
    document.head.appendChild(style);
  }

  function showTipPopup(tip) {
    if (!tip || typeof document === "undefined" || !document.body) return false;
    injectTipStyles();
    const wrap = document.createElement("div");
    wrap.className = "mg-tip-pop";
    wrap.setAttribute("aria-live", "polite");
    const amount = String(tip.currency || "$") + String(tip.amount || 0);
    const rawLabel = String(tip.label || "TIP").trim().toUpperCase();
    const label = sourceText(rawLabel);
    const tipWord = sourceText("TIP");
    const paymentText = uiText("meetandgreet.payment_received", "MeetAndGreet payment received");
    wrap.innerHTML =
      "<div class=\"mg-tip-pop-card\">" +
        "<div class=\"mg-tip-pop-amount\">+" + amount + (rawLabel === "TIP" ? " " + escHtml(tipWord) : " " + escHtml(label)) + "</div>" +
        "<div class=\"mg-tip-pop-text\">" + escHtml(sourceText(tip.text || paymentText)) + "</div>" +
      "</div>";
    document.body.appendChild(wrap);
    setTimeout(() => { try { wrap.remove(); } catch {} }, 2500);
    return true;
  }

  function addTip(step, opts = {}) {
    const tip = normalizeTip(step);
    if (!tip) return { changed: false, tipId: "" };
    if (tip.profileId) upsertProfile({ profileId: tip.profileId }, { bumpBadge: false, homePop: false });
    const tips = readArray(KEYS.tips);
    const idx = tips.findIndex((row) => canonicalId(row?.tipId || row?.id) === tip.tipId);
    const changed = idx < 0;
    if (idx >= 0) tips[idx] = { ...tips[idx], ...tip };
    else tips.push(tip);
    writeArray(KEYS.tips, tips);
    const suppressPopup = opts.reconstruct === true || opts.source === "start_from" || opts.source === "meetandgreet_reconstruct" || opts.source === "meetandgreet_reconstruct_sync" || step?.popup === false;
    const firstSeen = markTipSeen(tip.tipId);
    if (firstSeen && !suppressPopup) showTipPopup(tip);
    return { changed, profileId: tip.profileId, tipId: tip.tipId, tip, popupShown: firstSeen && !suppressPopup };
  }

  function getState(syncBadge = true) {
    synchronizeCanonicalProjection();
    const profilesMap = readObject(KEYS.profiles);
    const photosMap = readObject(KEYS.photos);
    const commentsMap = readObject(KEYS.comments);
    const tips = readArray(KEYS.tips);
    const seen = readArray(KEYS.seen).map(canonicalId).filter(Boolean);
    const ids = Object.keys(profilesMap).map(profileId).filter(Boolean);
    ids.sort((a, b) => {
      const ao = Number(DEFAULT_PROFILES[a]?.portrait ?? 999);
      const bo = Number(DEFAULT_PROFILES[b]?.portrait ?? 999);
      return ao - bo || a.localeCompare(b);
    });
    const profiles = ids.map((pid) => normalizeProfile({ ...defaultProfile(pid), ...(profilesMap[pid] || {}), profileId: pid })).filter(Boolean);
    const photos = {};
    const comments = {};
    ids.forEach((pid) => {
      photos[pid] = (Array.isArray(photosMap[pid]) ? photosMap[pid] : []).map((row) => ({ ...row, profileId: pid }));
      comments[pid] = (Array.isArray(commentsMap[pid]) ? commentsMap[pid] : []).map((row) => ({ ...row, profileId: pid }));
    });
    const state = {
      installed: isUnlocked(),
      unlocked: isUnlocked(),
      profiles,
      profileIds: profiles.map((row) => row.profileId),
      photos,
      comments,
      tips,
      seen,
      missingArtDebt: readArray(KEYS.missingArtDebt)
    };
    state.unreadEncounterIds = unreadPhotoIdsForState(state);
    state.unreadEncounterCount = state.unreadEncounterIds.length;
    state.unreadProfileIds = state.profileIds.filter(pid => !seen.includes("profile:" + pid));
    state.badge = state.unreadEncounterCount + state.unreadProfileIds.length;
    if (syncBadge) emitBadge(state.badge);
    return state;
  }

  function contentIdsForState(state = getState()) {
    const ids = [];
    (state.profiles || []).forEach((profile) => {
      const pid = profileId(profile?.profileId || profile?.id);
      if (!pid) return;
      ids.push("profile:" + pid);
      (state.photos?.[pid] || []).forEach((photo) => ids.push("photo:" + pid + ":" + canonicalId(photo.photoId || photo.id)));
      (state.comments?.[pid] || []).forEach((comment) => ids.push("comment:" + pid + ":" + canonicalId(comment.commentId || comment.id)));
    });
    return ids.filter(Boolean);
  }

  function markAllSeen() {
    const ids = Array.from(new Set(contentIdsForState()));
    persistView("seen", ids);
    emitBadge(0);
    return ids;
  }

  function markSeen(rawId) {
    const id = canonicalId(rawId);
    if (!id) return { changed: false, unreadCount: syncUnreadBadge() };
    if (!contentIdsForState(getState(false)).includes(id)) return {changed:false,unreadCount:syncUnreadBadge(),id};
    const seen = readSeenSet();
    const before = seen.size;
    seen.add(id);
    if (seen.size !== before) writeSeenSet(seen);
    return { changed: seen.size !== before, unreadCount: syncUnreadBadge(), id };
  }

  function markPhotoSeen(rawProfileId, rawPhotoId) {
    return markSeen(photoSeenId(rawProfileId, rawPhotoId));
  }

  function clearState() {
    Object.values(KEYS).forEach((key) => {
      if (key === KEYS.appBadges) return;
      safeRemove(key);
    });
    emitBadge(0);
  }

  function executeStep(step, opts = {}) {
    const type = canonicalId(step?.type || "");
    if (!ACTION_TYPE_SET.has(type)) return { handled: false };
    if (isTimelineReplayContext(opts)) {
      try { console.info("[MeetAndGreet] replay sandbox skipped permanent action", { type, step }); } catch {}
      return { handled: true, sandboxed: true, type };
    }

    let result = { handled: true, type, changed: false };
    if (type === "meetandgreet_unlock_app") {
      const was = isUnlocked();
      unlockApp({ homePop: step?.homePop !== false });
      result.changed = !was;
      if (result.changed && step?.badge !== false) syncUnreadBadge();
    } else if (type === "meetandgreet_profile_unlock") {
      result = { ...result, ...upsertProfile({ ...step, profileId: step?.profileId || step?.id }, { bumpBadge: step?.badge !== false }) };
    } else if (type === "meetandgreet_photo_add") {
      result = { ...result, ...addPhoto(step, { bumpBadge: step?.badge !== false }) };
    } else if (type === "meetandgreet_comment_add") {
      result = { ...result, ...addComment(step, { bumpBadge: step?.badge !== false }) };
    } else if (type === "meetandgreet_tip") {
      result = { ...result, ...addTip(step, opts) };
    } else if (type === "meetandgreet_badge") {
      emitBadge(Math.max(0, Math.floor(Number(step?.count || 0) || 0)));
      result.changed = true;
    } else if (type === "meetandgreet_notify") {
      notify(step);
    } else if (type === "meetandgreet_open") {
      const intent = { target: canonicalId(step?.target || "home"), profileId: profileId(step?.profileId || ""), at: Date.now() };
      safeSet(KEYS.openIntent, JSON.stringify(intent));
      if (step?.navigate !== false) {
        try { window.navigateToScene?.("meetandgreet", intent); } catch {}
      }
      result.changed = true;
    }
    projectionStamp = "";
    try { window.dispatchEvent(new CustomEvent("meetandgreet:state-changed", { detail: { type, result, state: getState() } })); } catch {}
    return result;
  }

  function executeSteps(steps, opts = {}) {
    const results = [];
    (Array.isArray(steps) ? steps : []).forEach((step) => {
      if (step && typeof step === "object" && ACTION_TYPE_SET.has(canonicalId(step.type))) {
        results.push(executeStep(step, opts));
      }
    });
    return results;
  }

  function reconstructFromCompletedStoriesSync() {
    if (canonicalProjection()) { synchronizeCanonicalProjection(); return []; }
    const results = [];
    Object.entries(STORY_ACTIONS_BY_ONCE).forEach(([onceKey, steps]) => {
      if (!hasCompletedOnce(onceKey)) return;
      (Array.isArray(steps) ? steps : []).forEach((step) => {
        results.push(executeStep({ ...step, badge: false, homePop: false }, { source: "meetandgreet_reconstruct_sync" }));
      });
    });
    return results;
  }

  let reconstructPromise = null;
  async function reconstructFromCompletedStories() {
    const owner = lifetime();
    if (reconstructPromise?.owner?.identity === owner.identity && reconstructPromise.owner.engine === owner.engine) return reconstructPromise.promise;
    const task = (async () => {
      const results = [];
      for (const storyPath of STORY_ACTION_FILES) {
        let json = authoredStories.get(storyPath);
        try {
          if (!json) {
            const res = await fetch(storyPath, { cache: "no-store" });
            if (!res || (!res.ok && Number(res.status || 0) !== 0)) continue;
            json = await res.json();
            authoredStories.set(storyPath,json);authoredVersion++;
          }
        } catch {
          continue;
        }
        if (!lifetimeCurrent(owner)) return [];
        if (canonicalProjection()) continue;
        if (!hasCompletedOnce(json && json.onceKey)) continue;
        (Array.isArray(json.steps) ? json.steps : []).forEach((step) => {
          const type = canonicalId(step && step.type);
          if (!ACTION_TYPE_SET.has(type)) return;
          if (type === "meetandgreet_notify" || type === "meetandgreet_open" || type === "meetandgreet_badge") return;
          results.push(executeStep({ ...step, badge: false, homePop: false }, { source: "meetandgreet_reconstruct" }));
        });
      }
      if (!lifetimeCurrent(owner)) return [];
      synchronizeCanonicalProjection();
      try { window.dispatchEvent(new CustomEvent("meetandgreet:state-changed", {detail:{type:"reconstructed",state:getState()}})); } catch {}
      return results;
    })();
    reconstructPromise = {owner,promise:task};
    try {
      return await task;
    } finally {
      if (reconstructPromise?.promise === task) reconstructPromise = null;
    }
  }

  function imageFallbackHandler(img, intended, reason, extra) {
    if (!img || img.dataset.mgFallbackApplied === "1") return;
    img.dataset.mgFallbackApplied = "1";
    registerMissingArtDebt(intended, reason || "Runtime image load failed; using safe placeholder", extra || {});
    img.src = PLACEHOLDER_IMAGE;
  }

  const api = {
    __v: "2026-09-28-mg-canonical-projection-v1",
    keys: KEYS,
    actionTypes: ACTION_TYPES.slice(),
    placeholderImage: PLACEHOLDER_IMAGE,
    defaultProfiles: clone(DEFAULT_PROFILES),
    isActionType: (type) => ACTION_TYPE_SET.has(canonicalId(type)),
    executeStep,
    executeSteps,
    reconcileGalleryPhotos,
    reconstructFromCompletedStoriesSync,
    reconstructFromCompletedStories,
    getState,
    markAllSeen,
    markSeen,
    markPhotoSeen,
    markTipSeen,
    photoSeenId,
    getUnreadEncounterIds: () => unreadPhotoIdsForState(),
    getUnreadEncounterCount: () => unreadPhotoIdsForState().length,
    syncUnreadBadge,
    clearState,
    registerMissingArtDebt,
    imageFallbackHandler,
    isTimelineReplayContext,
    readBadge,
    emitBadge
  };

  window.MeetAndGreetSystem = api;
  const Game = (window.Game ||= {});
  Game.getMeetAndGreetState = () => api.getState();
  Game.clearMeetAndGreetBadge = () => api.markAllSeen();
  window.GameStateEngine?.subscribe?.(events => {
    let changed = false, restored = false;
    for (const event of events || []) {
      if (event.type === "story:effect-committed" && ACTION_TYPE_SET.has(event.effectType)) {
        liveEffects.set(event.eventId,clone(event.payload));changed = true;
      }
      if (event.type === "save:restored" || event.type === "playthrough:reset") { changed = true;restored = true; }
      if (event.type === "progression:once-marked" || event.type === "story:completed") changed = true;
      if (event.type === "meetandgreet:view-changed" || event.type === "world:app-unlocked" && event.appId === "meetandgreet") changed = true;
    }
    if (!changed) return;
    projectionStamp = "";synchronizeCanonicalProjection();
    if (restored) reconstructFromCompletedStories().catch(()=>{});
  });
  try { api.syncUnreadBadge(); } catch {}
  if (canonicalProjection() && api.getState(false).unlocked) reconstructFromCompletedStories().catch(()=>{});
})();
