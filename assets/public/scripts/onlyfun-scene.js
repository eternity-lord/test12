(async function () {
  if (window.__onlyfun_cleanup) {
    try { window.__onlyfun_cleanup(); } catch {}
  }

  const SCENE_NAME = "onlyfun";
  const ONLYFUN_UNLOCK_KEY = "feature_onlyfun_unlocked";
  const ONLYFUN_SIGNED_IN_KEY = "onlyfun_signed_in";
  const ONLYFUN_BADGE_FLAG_KEY = "app_badge_onlyfun";
  const BADGE_KEY = "app_badges_v1";
  const ONLYFUN_CREATORS_KEY = "onlyfun_creators_v1";
  const ONLYFUN_SUBSCRIPTIONS_KEY = "onlyfun_subscriptions_v1";
  const ONLYFUN_SUBSCRIPTIONS_PUBLIC_KEY = "onlyfun_subscriptions";
  const ONLYFUN_POSTS_KEY = "onlyfun_posts_v1";
  const ONLYFUN_SEEN_POSTS_KEY = "onlyfun_seen_posts_v1";
  const ONLYFUN_SEEDED_KEY = "onlyfun_seeded_v1";
  const ONLYFUN_OPEN_CREATOR_KEY = "onlyfun_open_creator";
  const ONLYFUN_FOCUS_POST_KEY = "onlyfun_focus_post";
  const ONLYFUN_PENDING_GATES_KEY = "onlyfun_pending_gates_v1";
  const FALLBACK_AVATAR = "assets/pictures/OnlyFun/avatars/NeonRose.png";
  const REQUIRED_CREATOR_ID = "static_muse";
  const REQUIRED_CREATOR_DISPLAY_NAME = "Sexminator";
  const REQUIRED_CREATOR_AVATAR = "assets/pictures/OnlyFun/avatars/Sexminator.jpg";
  const REQUIRED_CREATOR_TAGLINE = "Male creator account. Subscribe to unlock the private route feed.";
  const CREATOR_CHARACTER_GATES = Object.freeze({
    static_muse: "evelyn",
    staticmuse: "evelyn",
    sexminator: "evelyn"
  });
  const CREATOR_ROUTE_GATES = Object.freeze({
    static_muse: { characterId: "evelyn", route: "ntr" },
    staticmuse: { characterId: "evelyn", route: "ntr" },
    sexminator: { characterId: "evelyn", route: "ntr" }
  });
  const FALLBACK_POST_IMAGE = (() => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1b1f33"/><stop offset="100%" stop-color="#2a314f"/></linearGradient></defs><rect width="720" height="900" fill="url(#g)"/><circle cx="360" cy="355" r="110" fill="rgba(255,255,255,0.15)"/><rect x="180" y="540" width="360" height="26" rx="13" fill="rgba(255,255,255,0.25)"/><rect x="250" y="580" width="220" height="20" rx="10" fill="rgba(255,255,255,0.18)"/></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  })();
  const ONLYFUN_AVATAR_PATH_HINTS = [
    "/assets/avatars/",
    "/pictures/onlyfun/avatars/",
    "/onlyfun/avatars/"
  ];
  const ONLYFUN_FEED_PATH_HINTS = [
    "/pictures/onlyfun/posts/",
    "/onlyfun/posts/",
    "/pictures/evidence/"
  ];
  const ONLYFUN_MEDIA_WARNED = new Set();
  const CREATOR_ID_ALIASES = {
    staticmuse: REQUIRED_CREATOR_ID,
    sexminator: REQUIRED_CREATOR_ID,
  };
  const CREATOR_AVATAR_BY_ID = {
    velvet: "assets/pictures/OnlyFun/avatars/Velvet.png",
    velvet_sin: "assets/pictures/OnlyFun/avatars/Velvet.png",
    neonrose: "assets/pictures/OnlyFun/avatars/NeonRose.png",
    neon_rose: "assets/pictures/OnlyFun/avatars/NeonRose.png",
    alphamana: "assets/pictures/OnlyFun/avatars/alphamana_avatar.jpg",
    staticmuse: REQUIRED_CREATOR_AVATAR,
    static_muse: REQUIRED_CREATOR_AVATAR,
    sexminator: REQUIRED_CREATOR_AVATAR,
  };

  const SUBSCRIPTION_ALIAS_TO_CREATOR = {
    velvet: "velvet_sin",
    neonrose: "neon_rose",
    sexminator: REQUIRED_CREATOR_ID,
    staticmuse: REQUIRED_CREATOR_ID,
  };
  const CREATOR_TO_SUBSCRIPTION_ALIASES = {
    velvet_sin: ["velvet"],
    neon_rose: ["neonrose"],
    static_muse: ["sexminator", "staticmuse"],
  };
  const CREATOR_FILES = [
    "assets/onlyfun/creators/neon_rose.json",
    "assets/onlyfun/creators/velvet_sin.json",
    "assets/onlyfun/creators/static_muse.json",
    "assets/onlyfun/creators/alphamana.json"
  ];
  const CREATOR_ORDER_HINT = CREATOR_FILES
    .map((path) => String(path || "").split("/").pop() || "")
    .map((name) => name.replace(/\.json$/i, ""))
    .map((token) => canonicalId(token))
    .filter(Boolean);

  const MASON_WARNING_STORY_PATH = "story/DAY1/DAY1_09_MASON_WARNING.json";
  const MASON_WARNING_ONCE_KEY = "once_d1_09_mason_warning_triggered";
  const MASON_WARNING_CANONICAL_ONCE_KEY = "d1_09_mason_warning_v1";
  const MASON_WARNING_PENDING_KEY = "onlyfun_d1_09_pending";
  const REQUIRED_CREATOR_BADGE = "Required";

  const onlyfunRoot = document.querySelector('.onlyfun[data-scene="onlyfun"]');
  const inOnlyfun = (selector) => onlyfunRoot?.querySelector(selector) || null;
  const ui = {
    root: onlyfunRoot,
    loginView: inOnlyfun("#onlyfun-login-view"),
    homeView: inOnlyfun("#onlyfun-home-view"),
    profileView: inOnlyfun("#onlyfun-profile-view"),
    subtitle: inOnlyfun("#onlyfun-subtitle"),
    backBtn: inOnlyfun("#onlyfun-back-btn"),
    loginBtn: inOnlyfun("#onlyfun-login-btn"),
    loginForm: inOnlyfun("#onlyfun-login-form"),
    nametagInput: inOnlyfun("#onlyfun-nametag-input"),
    nametagEdit: inOnlyfun("#onlyfun-nametag-edit"),
    loginSpinner: inOnlyfun("#onlyfun-login-spinner"),
    loginLabel: inOnlyfun("#onlyfun-login-label"),
    loginStatus: inOnlyfun("#onlyfun-login-status"),
    creatorStrip: inOnlyfun("#onlyfun-creator-strip"),
    feed: inOnlyfun("#onlyfun-feed"),
    profileAvatar: inOnlyfun("#onlyfun-profile-avatar"),
    profileName: inOnlyfun("#onlyfun-profile-name"),
    profileBio: inOnlyfun("#onlyfun-profile-bio"),
    profileMeta: inOnlyfun("#onlyfun-profile-meta"),
    profilePosts: inOnlyfun("#onlyfun-profile-posts"),
    subscribeBtn: inOnlyfun("#onlyfun-subscribe-btn"),
    lightbox: inOnlyfun("#onlyfun-lightbox"),
    lightboxImage: inOnlyfun("#onlyfun-lightbox-image"),
    toast: inOnlyfun("#onlyfun-toast")
  };

  const state = {
    view: "login",
    activeCreatorId: "",
    creators: {},
    creatorOrder: [],
    subs: {},
    posts: [],
    seenPosts: {},
    focusPostId: "",
    signInTimer: null,
    storyTimer: null,
    toastTimer: null,
    focusPulseTimer: null,
    listeners: [],
    busHandlers: [],
    winHandlers: [],
    mountedHandler: null,
    engineUnsubscribe: null,
    bootPromise: null,
    canonicalSnapshot: null
  };
  const openTrace = {
    startedAt: performance.now(),
    phases: {},
    catalogFiles: [],
    stateReads: 0,
    stateReadMs: 0
  };
  const markOpenPhase = (name) => { openTrace.phases[name] = performance.now() - openTrace.startedAt; };
  window.__onlyfunOpenTrace = openTrace;

  function safeGetLS(key) { try { return localStorage.getItem(key); } catch { return null; } }
  function safeSetLS(key, value) { try { localStorage.setItem(key, value); } catch {} }
  function safeRemLS(key) { try { localStorage.removeItem(key); } catch {} }
  function safeJsonParse(raw, fallback) { try { return JSON.parse(raw); } catch { return fallback; } }
  function canonicalState(refresh = false) {
    const started = performance.now();
    try {
      if (refresh || !state.canonicalSnapshot) state.canonicalSnapshot = window.GameStateEngine?.getState?.() || null;
      return state.canonicalSnapshot;
    }
    catch { return null; }
    finally { openTrace.stateReads += 1; openTrace.stateReadMs += performance.now() - started; }
  }
  function canonicalOnlyfun() { return canonicalState()?.onlyfun || null; }
  function dispatchOnlyfun(type, payload, commandId) {
    const engine = window.GameStateEngine;
    if (!engine) return { ok: false, status: "ENGINE_UNAVAILABLE" };
    const current = canonicalState(true);
    const result = engine.dispatch({ type, commandId, expectedRevision: current.revision, payload });
    state.canonicalSnapshot = null;
    return result;
  }
  function tr(key, source, vars = null) {
    let text = source;
    try { text = window.Game?.i18n?.ui?.(key, source) || source; } catch {}
    if (vars && typeof vars === "object") {
      Object.entries(vars).forEach(([name, value]) => {
        text = String(text).split("{{" + name + "}}").join(String(value));
      });
    }
    return text;
  }
  function sx(source) {
    try { return window.Game?.i18n?.sourceText?.(source) || source; } catch { return source; }
  }
  function canonicalId(raw) {
    return String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
  }
  function normalizeCreatorId(raw) {
    const id = canonicalId(raw);
    if (!id) return "";
    return CREATOR_ID_ALIASES[id] || id;
  }
  function normalizeLockedRoute(rawRoute) {
    const value = canonicalId(rawRoute);
    if (!value) return "";
    if (value === "love" || value.startsWith("love")) return "love";
    if (value === "nts" || value.startsWith("nts")) return "nts";
    if (value === "ntr" || value.startsWith("ntr")) return "ntr";
    return "";
  }
  function lockedRouteForCharacter(rawId) {
    const id = canonicalId(rawId);
    if (!id) return "";
    try {
      const world = canonicalState()?.world;
      const canonical = normalizeLockedRoute(world?.routeLocks?.[id] || world?.routes?.[id] || "");
      if (canonical) return canonical;
    } catch {}
    try {
      const fromRoutes = normalizeLockedRoute(window.CharacterRoutes?.get?.(id, { persistInherited: true }) || "");
      if (fromRoutes) return fromRoutes;
    } catch {}
    const explicit = normalizeLockedRoute(safeGetLS(`route_${id}_locked_v1`) || "");
    if (explicit) return explicit;
    return normalizeLockedRoute(safeGetLS("route_global_locked_v1") || "");
  }
  function isCharacterActive(rawId) {
    const id = canonicalId(rawId);
    if (!id) return true;
    try {
      const active = canonicalState()?.world?.activeCharacters;
      if (Array.isArray(active)) return active.includes(id);
    } catch {}
    try {
      if (typeof window.Game?.isCharacterActive === "function") return window.Game.isCharacterActive(id) === true;
    } catch {}
    return true;
  }
  function isCreatorAllowed(rawCreatorId) {
    const creatorId = normalizeCreatorId(rawCreatorId);
    if (!creatorId) return false;
    // A canonical pending gate is an explicit, temporary narrative grant.
    // It must win over the creator's later character/route visibility rules,
    // otherwise Day 1 can require a creator which the same filter removes
    // (static_muse is associated with Evelyn, who need not be active yet).
    const requiredByPendingGate = Object.values(canonicalOnlyfun()?.pendingGates || {}).some((gate) => {
      if (!gate || typeof gate !== "object") return false;
      if (normalizeCreatorId(gate.requiredCreatorId || gate.creatorId || "") !== creatorId) return false;
      if (onceDoneForGate(gate) || gateScopeExpired(gate)) return false;
      return !!normalizeStoryPathForGate(gate.startStory || gate.storyPath || gate.story || "");
    });
    if (requiredByPendingGate) return true;
    // The private AlphaMana account enters the feed through an authored
    // unlock. Catalog metadata alone is not an acquisition, including after
    // restoring a save made before that introduction.
    if (creatorId === "alphamana") {
      const acquired = canonicalOnlyfun() || {};
      return acquired.accounts?.[creatorId]?.unlocked === true
        || acquired.creators?.[creatorId]?.unlocked === true
        || acquired.subscriptions?.[creatorId] === true
        || (acquired.posts || []).some(post => normalizeCreatorId(post.creatorId || post.creator || "") === creatorId);
    }
    // Creator history is append-only player history. Character activity and
    // route gates own future authored unlocks; they must never retroactively
    // remove an acquired creator, subscription, or post from the projection.
    // In particular Evelyn LOVE/NTS stops later NTR story posts, while the
    // Day 1 Sexminator account and already-unlocked posts remain visible.
    return true;
  }
  function normalizeSubscriptionAlias(raw) {
    return canonicalId(raw).replace(/_/g, "");
  }
  function displayNameForCreatorId(raw) {
    const id = normalizeCreatorId(raw);
    if (!id) return "Creator";
    if (id === REQUIRED_CREATOR_ID) return REQUIRED_CREATOR_DISPLAY_NAME;
    return id
      .split("_")
      .filter(Boolean)
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(" ");
  }
  function isOnlyfunUnlocked() { return canonicalOnlyfun()?.unlocked === true; }
  function isSignedIn() { return canonicalOnlyfun()?.signedIn === true; }
  function isRequiredCreatorId(raw) { return normalizeCreatorId(raw) === REQUIRED_CREATOR_ID; }
  function isRequiredCreatorSubscribed() {
    if (!isCreatorAllowed(REQUIRED_CREATOR_ID)) return true;
    return !!state.subs[REQUIRED_CREATOR_ID];
  }

  function normalizeStoryPathForGate(raw) {
    return String(raw || "").trim().replace(/\\/g, "/").replace(/^\.\//, "");
  }

  function inferDayFromPath(raw) {
    const match = normalizeStoryPathForGate(raw).match(/(?:^|\/)DAY(\d+)(?:\/|_|$)/i);
    return match ? Math.max(0, Number(match[1] || 0) || 0) : 0;
  }

  function currentProgressDay() {
    try { return Math.max(1, Number(canonicalState()?.world?.day) || 1); } catch {}
    let maxDay = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (
          key === "storyPath" ||
          key === "path" ||
          key === "pending_story_v1" ||
          key === "pending_chain_story_v1" ||
          key === "story_runtime_v1" ||
          key.startsWith("conv_story_") ||
          key.startsWith("conv_episode_")
        ) {
          const value = localStorage.getItem(key);
          const day = inferDayFromPath(value);
          if (day > maxDay) maxDay = day;
        }
      }
    } catch {}
    try {
      const lastPath = String(window.Game?.lastQuery?.storyPath || window.Game?.lastQuery?.path || "").trim();
      const day = inferDayFromPath(lastPath);
      if (day > maxDay) maxDay = day;
    } catch {}
    return maxDay;
  }

  function readPendingOnlyfunGates() {
    const parsed = canonicalOnlyfun()?.pendingGates || {};
    return (parsed && typeof parsed === "object" && !Array.isArray(parsed)) ? parsed : {};
  }

  function writePendingOnlyfunGates(gates) {
    const next = {};
    const source = (gates && typeof gates === "object" && !Array.isArray(gates)) ? gates : {};
    Object.keys(source).forEach((key) => {
      const gate = source[key];
      if (!gate || typeof gate !== "object") return;
      const id = String(gate.id || key || "").trim();
      const requiredCreatorId = normalizeCreatorId(gate.requiredCreatorId || gate.creatorId || "");
      const startStory = normalizeStoryPathForGate(gate.startStory || gate.storyPath || gate.story || "");
      if (!id || !requiredCreatorId || !startStory) return;
      next[id] = {
        ...gate,
        id,
        requiredCreatorId,
        startStory,
        storyPath: startStory,
        contactId: canonicalId(gate.contactId || ""),
        onceKey: String(gate.onceKey || "").trim(),
        sourceOnceKey: String(gate.sourceOnceKey || "").trim(),
        sourceStoryPath: normalizeStoryPathForGate(gate.sourceStoryPath || ""),
        scopeMaxDay: Math.max(0, Math.floor(Number(gate.scopeMaxDay || 0) || 0)),
        createdAt: Number(gate.createdAt || Date.now()) || Date.now()
      };
    });
    throw new Error("OnlyFun pending-gate writes are canonical; legacy writer disabled");
    return next;
  }

  function removeOnlyfunGate(gateId) {
    const id = String(gateId || "").trim();
    if (!id) return;
    if (Object.prototype.hasOwnProperty.call(readPendingOnlyfunGates(), id)) dispatchOnlyfun("ACK_ONLYFUN_EVENT", { eventId: id }, `onlyfun-gate-ack:${id}`);
  }

  function onceDoneForGate(gate) {
    const onceKey = canonicalId(gate?.onceKey || "");
    if (!onceKey) return false;
    return safeGetLS("once_" + onceKey) === "1";
  }

  function gateScopeExpired(gate) {
    const maxDay = Math.max(0, Number(gate?.scopeMaxDay || 0) || 0);
    if (!maxDay) return false;
    const day = currentProgressDay();
    return day > maxDay;
  }

  function cleanupExpiredOnlyfunGates() {
    const gates = readPendingOnlyfunGates();
    Object.keys(gates).forEach((id) => {
      const gate = gates[id];
      if (onceDoneForGate(gate) || gateScopeExpired(gate)) {
        dispatchOnlyfun("ACK_ONLYFUN_EVENT", { eventId: id }, `onlyfun-gate-expire:${id}`);
      }
    });

    if (safeGetLS(MASON_WARNING_PENDING_KEY) === "1") {
      const day = currentProgressDay();
      if (masonWarningDone() || day > 2) {
      }
    }
  }

  function pendingGateForCreator(rawCreatorId) {
    cleanupExpiredOnlyfunGates();
    const creatorId = normalizeCreatorId(rawCreatorId);
    if (!creatorId) return null;
    const gates = readPendingOnlyfunGates();
    const candidates = Object.values(gates)
      .filter((gate) => normalizeCreatorId(gate?.requiredCreatorId || "") === creatorId)
      .filter((gate) => !onceDoneForGate(gate) && !gateScopeExpired(gate))
      .sort((a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0));
    return candidates[0] || null;
  }

  function syncRequiredCreatorGateState() {
    cleanupExpiredOnlyfunGates();
    if (masonWarningDone()) {
      return;
    }
    const day = currentProgressDay();
    if (!isRequiredCreatorSubscribed() || day > 2) {
      return;
    }
    if (pendingGateForCreator(REQUIRED_CREATOR_ID)) return;

    const canonical = window.GameStateEngine?.getState?.() || {};
    const activePath = normalizeStoryPathForGate(canonical.execution?.activeStoryPath || canonical.execution?.cursor?.storyPath || "");
    const pendingPath = normalizeStoryPathForGate(canonical.progression?.pendingStory?.path || canonical.progression?.pendingStory?.storyPath || "");
    const warningPath = normalizeStoryPathForGate(MASON_WARNING_STORY_PATH);
    if (activePath === warningPath || pendingPath === warningPath) return;

    // Upgrade repair for profiles produced before the Mason/OnlyFun gate was
    // durable. Those profiles can be subscribed while the gate, pending story
    // and completion onceKey are all absent, making the already-forced text
    // disappear permanently after leaving the conversation. Recreate only
    // the missing eligibility record; the normal admission path remains the
    // sole owner of starting/resuming the story.
    dispatchOnlyfun("SET_ONLYFUN_PENDING_GATE", {
      operationId: "onlyfun-mason-warning-gate-repair-v2",
      gateId: "onlyfun-mason-warning-gate-repair-v2",
      creatorId: REQUIRED_CREATOR_ID,
      gate: {
        id: "onlyfun-mason-warning-gate-repair-v2",
        requiredCreatorId: REQUIRED_CREATOR_ID,
        creatorId: REQUIRED_CREATOR_ID,
        startStory: MASON_WARNING_STORY_PATH,
        storyPath: MASON_WARNING_STORY_PATH,
        contactId: "mason",
        onceKey: MASON_WARNING_ONCE_KEY.replace(/^once_/, ""),
        scopeMaxDay: 2,
        createdAt: Date.now(),
        repair: "legacy_missing_gate_v2"
      }
    }, "onlyfun-mason-warning-gate-repair-v2");
  }

  function masonWarningDone() {
    const onceKeys = window.GameStateEngine?.getState?.()?.progression?.onceKeys;
    if (Array.isArray(onceKeys) && onceKeys.includes(MASON_WARNING_CANONICAL_ONCE_KEY)) return true;
    return safeGetLS(MASON_WARNING_ONCE_KEY) === "1";
  }

  function prettyNameFromKey(raw) {
    return displayNameForCreatorId(raw);
  }

  function resolveCreatorAvatar(creatorId, ...candidates) {
    const id = normalizeCreatorId(creatorId);
    const creatorFallback = CREATOR_AVATAR_BY_ID[id] || CREATOR_AVATAR_BY_ID[id.replace(/_/g, "")] || "";
    for (const candidate of candidates) {
      const avatar = String(candidate || "").trim();
      if (avatar) return avatar;
    }
    return creatorFallback || FALLBACK_AVATAR;
  }

  function logAvatarDebug(surface, creatorId, avatarPath) {
    if (safeGetLS("debug_onlyfun_avatar") !== "1") return;
    try {
      console.log(`[OnlyFunAvatar:${surface}]`, canonicalId(creatorId) || "", String(avatarPath || "").trim());
    } catch {}
  }

  function normalizePathForCheck(url) {
    return String(url || "")
      .trim()
      .toLowerCase()
      .replace(/\\/g, "/")
      .split("#")[0]
      .split("?")[0];
  }

  function isAvatarPath(url) {
    const path = normalizePathForCheck(url);
    if (!path) return false;
    return ONLYFUN_AVATAR_PATH_HINTS.some((hint) => path.includes(hint));
  }

  function isFeedPath(url) {
    const path = normalizePathForCheck(url);
    if (!path) return false;
    if (path.startsWith("data:image/") || path.startsWith("blob:")) return true;
    return ONLYFUN_FEED_PATH_HINTS.some((hint) => path.includes(hint));
  }

  function warnOnlyfunMedia(reason, meta = {}) {
    const token = [
      reason,
      canonicalId(meta?.creatorId || ""),
      canonicalId(meta?.postId || ""),
      normalizePathForCheck(meta?.image || "")
    ].join("|");
    if (!token || ONLYFUN_MEDIA_WARNED.has(token)) return;
    ONLYFUN_MEDIA_WARNED.add(token);
    try {
      console.warn("[OnlyFunMedia]", reason, JSON.stringify(meta));
    } catch {}
  }

  function sanitizePostImage(imagePath, meta = {}) {
    const image = String(imagePath || "").trim();
    if (!image) {
      warnOnlyfunMedia("missing_post_image", meta);
      return "";
    }
    if (isAvatarPath(image)) {
      warnOnlyfunMedia("blocked_avatar_path_for_post_image", { ...meta, image });
      return "";
    }
    if (!isFeedPath(image)) {
      warnOnlyfunMedia("unexpected_post_image_path", { ...meta, image });
    }
    return image;
  }

  function normalizeCreatorProfile(raw, fallbackId = "") {
    const id = normalizeCreatorId(raw?.id || raw?.creatorId || fallbackId);
    if (!id) return null;
    if (!isCreatorAllowed(id)) return null;
    const rawPrice = Number(raw?.priceEur ?? 0);
    const priceEur = Number.isFinite(rawPrice) ? Math.max(0, Math.round(rawPrice * 100) / 100) : 0;
    const rawAvatar = String(raw?.avatar || raw?.avatarUrl || raw?.photo || "").trim();
    const normalized = {
      id,
      displayName: String(raw?.displayName || raw?.name || prettyNameFromKey(id)).trim() || prettyNameFromKey(id),
      avatar: resolveCreatorAvatar(id, rawAvatar),
      banner: String(raw?.banner || "").trim(),
      priceEur,
      tagline: String(raw?.tagline || raw?.bio || "").trim()
    };
    if (isRequiredCreatorId(id)) {
      normalized.displayName = REQUIRED_CREATOR_DISPLAY_NAME;
      normalized.avatar = REQUIRED_CREATOR_AVATAR;
      normalized.tagline = REQUIRED_CREATOR_TAGLINE;
    }
    return normalized;
  }

  function normalizePost(raw, creatorsMap = {}) {
    const creatorId = normalizeCreatorId(raw?.creatorId || raw?.creator || raw?.authorId || "");
    if (!creatorId) return null;
    if (!isCreatorAllowed(creatorId)) return null;
    const creator = creatorsMap?.[creatorId] || {};
    const atRaw = Number(raw?.createdAt ?? raw?.at ?? 0);
    const createdAt = Number.isFinite(atRaw) && atRaw > 0 ? Math.round(atRaw) : 0;
    const fallbackId = `of_${creatorId}_${createdAt}`;
    const onceKey = String(raw?.onceKey || "").trim();
    const id = String(raw?.id || onceKey || fallbackId).trim() || fallbackId;
    const likesRaw = Number(raw?.likes ?? 0);
    const likes = Number.isFinite(likesRaw) ? Math.max(0, Math.round(likesRaw)) : 0;
    const dayRaw = Number(raw?.day ?? raw?.storyDay ?? raw?.unlockDay ?? 0);
    const day = Number.isFinite(dayRaw) && dayRaw > 0 ? Math.floor(dayRaw) : inferPostDay(raw);
    const orderRaw = Number(raw?.postOrder ?? raw?.order ?? raw?.stepIndex ?? raw?.sequence ?? 0);
    const postOrder = Number.isFinite(orderRaw) && orderRaw > 0 ? Math.floor(orderRaw) : 0;
    const image = sanitizePostImage(raw?.image || raw?.url || raw?.photo || "", {
      surface: "normalize",
      creatorId,
      postId: id
    });
    const normalized = {
      id,
      type: "post",
      creatorId,
      creatorDisplayName: String(
        creator?.displayName ||
        (isRequiredCreatorId(creatorId) ? REQUIRED_CREATOR_DISPLAY_NAME : raw?.creatorDisplayName) ||
        prettyNameFromKey(creatorId)
      ).trim() || prettyNameFromKey(creatorId),
      creatorAvatar: resolveCreatorAvatar(
        creatorId,
        creator?.avatar,
        raw?.creatorAvatar,
        raw?.avatar,
        raw?.avatarUrl,
        raw?.photo
      ),
      image,
      text: String(raw?.text || raw?.caption || "").trim(),
      likes,
      requiresSub: raw?.requiresSub !== false,
      // createdAt is retained only for the established feed ordering.
      createdAt,
      gameTime: window.GameTimeService?.resolveStamp?.(raw, { kind: "onlyfun", id, onceKey, storyPath: raw?.storyPath }) || null,
      day,
      postOrder
    };
    if (onceKey) normalized.onceKey = onceKey;
    return normalized;
  }

  function inferPostDay(raw) {
    const source = [
      raw?.id,
      raw?.onceKey,
      raw?.storyPath,
      raw?.sourceStoryPath,
      raw?.path,
      raw?.image
    ].map((value) => String(value || "")).join(" ");
    const match = source.match(/(?:^|[^a-z0-9])d(?:ay)?[_-]?(\d{1,2})(?:[^a-z0-9]|$)/i) ||
      source.match(/(?:^|\/)DAY(\d{1,2})(?:\/|_|$)/i);
    const day = match ? Number(match[1] || 0) : 0;
    return Number.isFinite(day) && day > 0 ? Math.floor(day) : 0;
  }

  function postToken(raw) {
    const idToken = canonicalId(raw?.id || "");
    if (idToken) return "id:" + idToken;
    return "";
  }

  function dedupePostsById(posts) {
    const list = Array.isArray(posts) ? posts : [];
    const map = new Map();
    list.forEach((post) => {
      if (!post || typeof post !== "object") return;
      const token = postToken(post);
      if (!token) return;
      const prev = map.get(token);
      map.set(token, prev ? { ...prev, ...post } : { ...post });
    });
    return Array.from(map.values());
  }

  function sortPosts(posts) {
    return [...posts].sort((a, b) => {
      const createdDiff = Number(b?.createdAt || 0) - Number(a?.createdAt || 0);
      if (createdDiff) return createdDiff;
      const dayDiff = Number(b?.day || 0) - Number(a?.day || 0);
      if (dayDiff) return dayDiff;
      const orderDiff = Number(b?.postOrder || 0) - Number(a?.postOrder || 0);
      if (orderDiff) return orderDiff;
      return String(b?.id || "").localeCompare(String(a?.id || ""));
    });
  }

  function upsertPosts(baseList, incomingList) {
    const next = dedupePostsById(baseList);
    const incoming = Array.isArray(incomingList) ? incomingList : [];
    incoming.forEach((post) => {
      if (!post || typeof post !== "object") return;
      const token = postToken(post);
      if (!token) return;
      const idx = token ? next.findIndex((item) => postToken(item) === token) : -1;
      if (idx >= 0) next[idx] = { ...next[idx], ...post };
      else next.push(post);
    });
    return sortPosts(dedupePostsById(next));
  }

  function readCreatorsMap() {
    const source = canonicalOnlyfun()?.creators;
    if (!source || typeof source !== "object") return {};
    const out = {};
    Object.keys(source).forEach((key) => {
      const profile = normalizeCreatorProfile(source[key], key);
      if (profile && isCreatorAllowed(profile.id)) out[profile.id] = profile;
    });
    return out;
  }

  function writeCreatorsMap(map) {
    const source = (map && typeof map === "object") ? map : {};
    const creators = {};
    Object.keys(source).forEach((key) => {
      const profile = normalizeCreatorProfile(source[key], key);
      if (profile && isCreatorAllowed(profile.id)) creators[profile.id] = profile;
    });
    throw new Error("OnlyFun creator writes are canonical; legacy writer disabled");
  }

  function normalizePublicSubsMap(rawObj) {
    const raw = (rawObj && typeof rawObj === "object") ? rawObj : {};
    const source = (raw.subs && typeof raw.subs === "object") ? raw.subs : raw;
    const out = {};
    Object.keys(source || {}).forEach((key) => {
      const alias = normalizeSubscriptionAlias(key);
      if (!alias) return;
      out[alias] = !!source[key];
    });
    return out;
  }

  function publicSubsToCreatorSubs(rawObj) {
    const raw = normalizePublicSubsMap(rawObj);
    const out = {};
    Object.keys(SUBSCRIPTION_ALIAS_TO_CREATOR).forEach((alias) => {
      const creatorId = SUBSCRIPTION_ALIAS_TO_CREATOR[alias];
      if (!isCreatorAllowed(creatorId)) return;
      if (raw[alias] === true) out[creatorId] = true;
    });
    return out;
  }

  function creatorSubsToPublicSubs(creatorSubs) {
    const src = (creatorSubs && typeof creatorSubs === "object") ? creatorSubs : {};
    const out = {};
    Object.keys(CREATOR_TO_SUBSCRIPTION_ALIASES).forEach((creatorIdRaw) => {
      const creatorId = normalizeCreatorId(creatorIdRaw);
      if (!creatorId || !src[creatorId]) return;
      if (!isCreatorAllowed(creatorId)) return;
      const aliases = Array.isArray(CREATOR_TO_SUBSCRIPTION_ALIASES[creatorIdRaw])
        ? CREATOR_TO_SUBSCRIPTION_ALIASES[creatorIdRaw]
        : [];
      aliases.forEach((aliasRaw) => {
        const alias = normalizeSubscriptionAlias(aliasRaw);
        if (!alias) return;
        out[alias] = true;
      });
    });
    return out;
  }

  function readSubsMap() {
    const source = canonicalOnlyfun()?.subscriptions || {};
    const legacy = (source && typeof source === "object") ? source : {};
    const mapped = {};
    const merged = { ...legacy, ...mapped };
    const out = {};
    Object.keys(merged).forEach((key) => {
      const id = normalizeCreatorId(key);
      if (!id) return;
      if (!isCreatorAllowed(id)) return;
      out[id] = !!merged[key] || !!out[id];
    });
    return out;
  }

  function writeSubsMap(map) {
    const source = (map && typeof map === "object") ? map : {};
    const subs = {};
    Object.keys(source).forEach((key) => {
      const id = normalizeCreatorId(key);
      if (!id || !isCreatorAllowed(id)) return;
      subs[id] = !!source[key];
    });
    throw new Error("OnlyFun subscription writes are canonical; legacy writer disabled");
  }

  function readPosts() {
    const source = canonicalOnlyfun()?.posts || [];
    const creators = readCreatorsMap();
    return sortPosts(dedupePostsById(source.map((post) => normalizePost(post, creators)).filter(Boolean)));
  }

  function writePosts(posts) {
    const creators = readCreatorsMap();
    const list = sortPosts(dedupePostsById((Array.isArray(posts) ? posts : [])
      .map((post) => normalizePost(post, creators))
      .filter(Boolean)));
    throw new Error("OnlyFun post writes are canonical; legacy writer disabled");
  }

  function readSeenPostsMap() {
    const root = canonicalOnlyfun()?.seenPosts || {};
    if (!root || typeof root !== "object") return {};
    const out = {};
    Object.keys(root).forEach((key) => {
      const id = String(key || "").trim();
      if (!id) return;
      out[id] = root[key] === true;
    });
    return out;
  }

  function writeSeenPostsMap(map) {
    const src = (map && typeof map === "object") ? map : {};
    const out = {};
    Object.keys(src).forEach((key) => {
      const id = String(key || "").trim();
      if (!id) return;
      if (src[key] === true) out[id] = true;
    });
    throw new Error("OnlyFun seen-post writes are canonical; legacy writer disabled");
  }

  function isPostSeen(postId) {
    const id = String(postId || "").trim();
    if (!id) return true;
    return state.seenPosts[id] === true;
  }

  function markPostSeen(postId, opts = {}) {
    const id = String(postId || "").trim();
    if (!id) return false;
    if (state.seenPosts[id] === true) return false;
    const post = state.posts.find(row => String(row?.id || "").trim() === id);
    if (isPostLockedForViewer(post)) return false;
    const result = dispatchOnlyfun("MARK_ONLYFUN_POST_VIEWED", { postId: id }, `onlyfun-view:${id}`);
    if (!result.ok && result.status !== "DUPLICATE_COMMAND") return false;
    state.seenPosts[id] = true;
    syncOnlyfunBadge();
    if (opts.rerender !== false) {
      if (state.view === "profile") renderProfile();
      renderFeed();
    }
    return true;
  }

  function countOnlyfunUnseenForSubscribed(posts, subs, seenMap) {
    const list = Array.isArray(posts) ? posts : [];
    const subMap = (subs && typeof subs === "object") ? subs : {};
    const seen = (seenMap && typeof seenMap === "object") ? seenMap : {};
    return list.reduce((count, post) => {
      const creatorId = normalizeCreatorId(post?.creatorId || "");
      const postId = String(post?.id || "").trim();
      if (!creatorId || !postId) return count;
      if (!isCreatorAllowed(creatorId)) return count;
      if (!subMap[creatorId]) return count;
      if (seen[postId] === true) return count;
      return count + 1;
    }, 0);
  }

  function setOnlyfunBadge(value) {
    const next = Math.max(0, Number(value || 0) || 0);
    // The engine projection derives app_badges_v1 from canonical posts,
    // subscriptions, and view receipts. This scene only announces the value.
    try { window.dispatchEvent(new CustomEvent("app:badge-changed", { detail: { app: "onlyfun", value: next } })); } catch {}
    try { window.dispatchEvent(new CustomEvent("game:badges-updated", { detail: { app: "onlyfun", value: next } })); } catch {}
  }

  function syncOnlyfunBadge() {
    const unseen = countOnlyfunUnseenForSubscribed(state.posts, state.subs, state.seenPosts);
    setOnlyfunBadge(unseen);
    return unseen;
  }

  function ensureSubsForCreators(subsMap, creatorsMap) {
    const next = { ...(subsMap || {}) };
    let changed = false;
    Object.keys(creatorsMap || {}).forEach((id) => {
      if (typeof next[id] !== "boolean") {
        next[id] = !!next[id];
        changed = true;
      }
    });
    return { subs: next, changed };
  }

  function orderCreatorIds(creatorsMap) {
    const ids = Object.keys(creatorsMap || {});
    return ids.sort((a, b) => {
      const aRequired = isRequiredCreatorId(a);
      const bRequired = isRequiredCreatorId(b);
      if (aRequired && !bRequired) return -1;
      if (!aRequired && bRequired) return 1;
      const ai = CREATOR_ORDER_HINT.indexOf(a);
      const bi = CREATOR_ORDER_HINT.indexOf(b);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.localeCompare(b);
    });
  }

  function hydrateFromStorage() {
    canonicalState(true);
    const creators = readCreatorsMap();
    const ensured = ensureSubsForCreators(readSubsMap(), creators);
    state.creators = creators;
    state.creatorOrder = orderCreatorIds(creators);
    state.subs = ensured.subs;
    state.posts = readPosts();
    state.seenPosts = readSeenPostsMap();
    syncRequiredCreatorGateState();
    if (!state.activeCreatorId && state.creatorOrder.length) {
      state.activeCreatorId = state.creatorOrder.find((id) => isRequiredCreatorId(id)) || state.creatorOrder[0];
    }
    syncOnlyfunBadge();
  }

  async function loadCreatorFile(path, prefetchedJson) {
    try {
      const started = performance.now();
      let json = prefetchedJson;
      if (!json) {
        const res = await fetch(path, { cache: "no-store" });
        if (!res.ok) return null;
        json = await res.json();
      }
      openTrace.catalogFiles.push({ path, ms: performance.now() - started });
      const fallbackId = canonicalId(
        String(path || "")
          .split("/")
          .pop()
          .replace(/\.json$/i, "")
      );
      const profile = normalizeCreatorProfile({
        ...json,
        id: json?.id || json?.creatorId || fallbackId,
        displayName: json?.displayName || json?.name || prettyNameFromKey(json?.id || json?.creatorId || fallbackId),
        name: json?.name || json?.displayName || prettyNameFromKey(json?.id || json?.creatorId || fallbackId)
      }, fallbackId);
      if (!profile) return null;
      const source = Array.isArray(json?.seedPosts) ? json.seedPosts : (Array.isArray(json?.posts) ? json.posts : []);
      const seedPosts = source
        .map((post, idx) => {
          const stableId = String(post?.id || "").trim();
          if (!stableId) return null;
          const normalized = normalizePost({
            ...post,
            id: stableId,
            onceKey: "",
            creatorId: profile.id,
            creatorDisplayName: profile.displayName,
            creatorAvatar: profile.avatar,
            createdAt: Number(post?.createdAt || 0) > 0
              ? Number(post.createdAt)
              : (Date.now() - ((source.length - idx) * 1000))
          }, { [profile.id]: profile });
          if (!normalized) return null;
          delete normalized.onceKey;
          normalized.id = stableId;
          normalized.creatorId = profile.id;
          normalized.creatorDisplayName = profile.displayName;
          normalized.creatorAvatar = profile.avatar;
          normalized.requiresSub = post?.requiresSub !== false;
          return normalized;
        })
        .filter(Boolean);
      return { profile, seedPosts };
    } catch {
      return null;
    }
  }

  function seedBasePostsOnce(seedPosts) {
    return Array.isArray(seedPosts) ? seedPosts : [];
  }

  async function repairArchivedTerminalPost() {
    // Older foreground renderers could finish Lena J14 after her final
    // message without committing the trailing OnlyFun post. Recover this
    // known omission only from both durable completion and dialogue proof.
    const storyPath = "story/DAY14/ntr/DAY14_02_LENA_EVENING_NTR.json";
    const onceKey = "d14_02_lena_evening_ntr_v1";
    const postId = "of_alphamana_day14_ntr_v1";
    const engine = window.GameStateEngine;
    if (!engine) return { repaired: false };
    const eligible = (snapshot) => snapshot?.progression?.onceKeys?.includes(onceKey)
      && !snapshot?.onlyfun?.posts?.some(post => post.id === postId)
      && snapshot?.conversations?.eventsByContact?.lena?.some(event =>
        event.storyPath === storyPath && event.kind === "message"
        && event.from === "player" && Number(event.stepIndex) === 41);
    if (!eligible(canonicalState(true))) return { repaired: false };
    const identity = JSON.stringify(engine.getRuntimeLifecycleIdentity());
    const response = await fetch(storyPath, { cache: "no-store" });
    if (!response.ok) return { repaired: false };
    const story = await response.json();
    const step = story.steps?.[42];
    if (story.onceKey !== onceKey || story.steps?.length !== 43
        || step?.type !== "onlyfun_post" || step.onceKey !== postId) return { repaired: false };
    if (window.GameStateEngine !== engine || JSON.stringify(engine.getRuntimeLifecycleIdentity()) !== identity) return { repaired: false, retired: true };
    const current = canonicalState(true);
    if (!eligible(current)) return { repaired: false };
    const operationId = "onlyfun-archived-terminal-post-v1:" + postId;
    const result = engine.dispatch({ type: "ADD_ONLYFUN_POST", commandId: operationId,
      expectedRevision: current.revision, leaseId: current.execution?.lease?.id,
      payload: { operationId, nextStepIndex: current.execution.activeStepIndex,
        post: { ...step, id: postId, notify: false, storyPath,
          gameTime: window.GameTimeService?.resolveStamp?.(step, { kind: "onlyfun", storyPath, onceKey: postId }) } } });
    state.canonicalSnapshot = null;
    return { repaired: result.ok === true, status: result.status };
  }

  async function bootstrapCreatorData() {
    try { await repairArchivedTerminalPost(); }
    catch (error) { console.warn("[OnlyFun] archived post recovery deferred", String(error?.message || error)); }
    const catalogStarted = performance.now();
    const storedCreators = readCreatorsMap();
    // The catalog is immutable for the lifetime of this renderer. Fetch all
    // independent files together and retain their parsed form across scene
    // remounts; route/character filtering is still re-evaluated below.
    if (!window.__onlyfunCreatorCatalogPromise) {
      window.__onlyfunCreatorCatalogPromise = Promise.all(CREATOR_FILES.map(async (path) => {
        const started = performance.now();
        try {
          const res = await fetch(path, { cache: "no-store" });
          if (!res.ok) return { path, json: null, ms: performance.now() - started, status: res.status };
          return { path, json: await res.json(), ms: performance.now() - started, status: res.status };
        } catch (error) {
          return { path, json: null, ms: performance.now() - started, error: String(error?.message || error) };
        }
      }));
    }
    const catalog = await window.__onlyfunCreatorCatalogPromise;
    openTrace.catalogFiles = catalog.map(({ path, ms, status, error }) => ({ path, ms, status, error }));
    const loaded = (await Promise.all(catalog.map(({ path, json }) => json ? loadCreatorFile(path, json) : null))).filter(Boolean);
    openTrace.phases.catalogMs = performance.now() - catalogStarted;

    const mergedCreators = { ...storedCreators };
    const seedPosts = [];
    loaded.forEach((item) => {
      mergedCreators[item.profile.id] = { ...(mergedCreators[item.profile.id] || {}), ...item.profile };
      if (item.seedPosts.length) seedPosts.push(...item.seedPosts);
    });

    // A catalog expansion must also reach profiles which seeded the old list.
    // The reducer deduplicates existing posts and retains their acquired state.
    const bootstrapId = `onlyfun-bootstrap-v2:${Object.keys(mergedCreators).sort().join(",")}:${seedPosts.map(post => post.id).sort().join(",")}`;
    dispatchOnlyfun("SEED_ONLYFUN_CONTENT", {
      operationId: bootstrapId,
      creators: Object.values(mergedCreators),
      posts: seedBasePostsOnce(seedPosts)
    }, bootstrapId);
    hydrateFromStorage();
    markOpenPhase("creatorDataAvailable");
  }

  async function ensureBootstrapped() {
    if (!state.bootPromise) {
      state.bootPromise = bootstrapCreatorData().finally(() => { state.bootPromise = null; });
    }
    return state.bootPromise;
  }

  function formatPostTime(post) {
    const stamp = window.GameTimeService?.resolveStamp?.(post, { kind: "onlyfun", id: post?.id, onceKey: post?.onceKey, storyPath: post?.storyPath }) || null;
    return window.GameTimeService?.formatStamp?.(stamp, (key, source) => tr(key, source)) || tr("game_time.unknown", "Time unknown");
  }

  function clearOnlyfunBadge() {
    safeRemLS(ONLYFUN_BADGE_FLAG_KEY);
    syncOnlyfunBadge();
  }

  function setLoginBusy(isBusy) {
    if (ui.loginBtn) ui.loginBtn.disabled = !!isBusy;
    if (ui.nametagInput) ui.nametagInput.disabled = !!isBusy;
    if (ui.loginSpinner) ui.loginSpinner.hidden = !isBusy;
    if (ui.loginLabel) ui.loginLabel.textContent = isBusy ? tr("onlyfun.connecting", "Connecting to NexaID") : tr("onlyfun.connect", "Connect with NexaID");
    if (ui.loginStatus) ui.loginStatus.textContent = isBusy ? tr("onlyfun.securing", "Securing channel") : "";
  }

  function setView(next) {
    state.view = next;
    if (ui.root) {
      ui.root.dataset.view = next;
      ui.root.dataset.ready = "1";
    }
    if (isLightboxOpen()) closeLightbox();
    if (ui.loginView) ui.loginView.hidden = next !== "login";
    if (ui.homeView) ui.homeView.hidden = next !== "home";
    if (ui.profileView) ui.profileView.hidden = next !== "profile";
    if (ui.backBtn) ui.backBtn.hidden = next !== "profile";
    if (ui.nametagEdit) ui.nametagEdit.hidden = next === "login" || !isOnlyfunUnlocked();
    if (!ui.subtitle) return;
    if (next === "login") ui.subtitle.textContent = tr("onlyfun.quick_connect", "Quick connect required");
    if (next === "home") ui.subtitle.textContent = isOnlyfunUnlocked() ? tr("onlyfun.creator_subscriptions", "Creator subscriptions") : tr("onlyfun.locked", "OnlyFun locked");
    if (next === "profile") ui.subtitle.textContent = tr("onlyfun.profile", "Creator profile");
    try { window.dispatchEvent(new CustomEvent("onlyfun:ready", { detail: { view: next } })); } catch {}
  }

  function imageWithFallback(src, alt, fallbackSrc = FALLBACK_AVATAR) {
    const img = document.createElement("img");
    const resolvedFallback = String(fallbackSrc || "").trim() || FALLBACK_AVATAR;
    const logical = String(src || "").trim() || resolvedFallback;
    if (window.ProtectedMediaResolver?.applyImage) {
      void window.ProtectedMediaResolver.applyImage(img, logical, { assetType:"avatar", surface:"onlyfun_avatar" }).catch(() => { img.src = resolvedFallback; });
    } else img.src = logical;
    img.alt = alt || "";
    img.loading = "lazy";
    img.decoding = "async";
    img.onerror = () => { img.onerror = null; img.src = resolvedFallback; };
    return img;
  }

  function postImageWithFallback(src, alt, meta = {}) {
    const img = document.createElement("img");
    const resolved = sanitizePostImage(src, { ...meta, surface: "render" });
    const logical = resolved || FALLBACK_POST_IMAGE;
    if (window.ProtectedMediaResolver?.applyImage) {
      void window.ProtectedMediaResolver.applyImage(img, logical, {
        assetType:"onlyfun_media", surface:"onlyfun_feed_image", profileId:meta.creatorId, postId:meta.postId
      }).catch(() => { img.src = FALLBACK_POST_IMAGE; });
    } else img.src = logical;
    img.alt = alt || "";
    img.loading = "lazy";
    img.decoding = "async";
    img.onerror = () => { img.onerror = null; img.src = FALLBACK_POST_IMAGE; };
    return img;
  }

  function isLightboxOpen() { return !!(ui.lightbox && !ui.lightbox.hidden); }
  function photoThought(post) {
    if (!post || normalizeCreatorId(post.creatorId) !== REQUIRED_CREATOR_ID || isPostLockedForViewer(post)) return "";
    const thoughts = {
      of_evelyn_seen_d7_v1: ["onlyfun.evelyn_photo_thought_d7", "Another photo of {{name:evelyn}}... What is happening at that bar that she hasn't told me?"],
      of_evelyn_seen_d8_v1: ["onlyfun.evelyn_photo_thought_d8", "That's {{name:evelyn}} again... I told her to keep working there, but I still don't know the whole story."]
    };
    const thought = thoughts[String(post.id || "")];
    if (!thought) return "";
    const text = tr(thought[0], thought[1]);
    return window.Game?.tpl?.(text) || text;
  }
  function openLightbox(src, alt, post) {
    if (!ui.lightbox || !ui.lightboxImage) return;
    const imageSrc = String(src || "").trim();
    if (!imageSrc) return;
    if (window.MediaViewer && typeof window.MediaViewer.open === "function") {
      try {
        window.MediaViewer.open(imageSrc, { title: String(alt || "OnlyFun media"), type: "image", playerThought: imageSrc === FALLBACK_POST_IMAGE ? "" : photoThought(post) });
        return;
      } catch {}
    }
    ui.lightboxImage.src = imageSrc;
    ui.lightboxImage.alt = String(alt || "Expanded post image");
    ui.lightbox.hidden = false;
    ui.lightbox.setAttribute("aria-hidden", "false");
    if (ui.root) ui.root.classList.add("onlyfun-lock-scroll");
    document.body.classList.add("onlyfun-lightbox-open");
  }
  function closeLightbox() {
    if (!ui.lightbox || !ui.lightboxImage) return;
    ui.lightbox.hidden = true;
    ui.lightbox.setAttribute("aria-hidden", "true");
    ui.lightboxImage.removeAttribute("src");
    if (ui.root) ui.root.classList.remove("onlyfun-lock-scroll");
    document.body.classList.remove("onlyfun-lightbox-open");
  }
  function bindPostImageLightbox(img, post) {
    if (!img) return;
    img.addEventListener("click", () => {
      if (isLightboxOpen()) { closeLightbox(); return; }
      openLightbox(img.currentSrc || img.src, img.alt || "Expanded post image", post);
    });
  }

  function activeCreator() {
    const id = normalizeCreatorId(state.activeCreatorId);
    return id ? (state.creators[id] || null) : null;
  }
  function isCreatorSubscribed(creatorId) { return !!state.subs[normalizeCreatorId(creatorId)]; }

  function dedupePostsForRender(posts) {
    return sortPosts(dedupePostsById(posts));
  }

  function isPostLockedForViewer(post, creatorId) {
    if (!post) return true;
    if (post.requiresSub === false) return false;
    return !isCreatorSubscribed(creatorId || post.creatorId);
  }

  function isPostNewForViewer(post) {
    const creatorId = normalizeCreatorId(post?.creatorId || "");
    if (!creatorId || !isCreatorSubscribed(creatorId)) return false;
    return !isPostSeen(post?.id || "");
  }

  function addNewBadge(card) {
    if (!card) return;
    card.style.position = "relative";
    card.style.boxShadow = "0 0 0 1px rgba(112,220,255,0.45), 0 0 22px rgba(112,220,255,0.26)";
    const badge = document.createElement("span");
    badge.textContent = "NEW";
    badge.style.position = "absolute";
    badge.style.top = "10px";
    badge.style.right = "10px";
    badge.style.zIndex = "3";
    badge.style.padding = "2px 8px";
    badge.style.borderRadius = "999px";
    badge.style.fontSize = "10px";
    badge.style.fontWeight = "800";
    badge.style.letterSpacing = "0.08em";
    badge.style.background = "rgba(112,220,255,0.22)";
    badge.style.border = "1px solid rgba(112,220,255,0.62)";
    badge.style.color = "rgba(230,249,255,0.98)";
    card.appendChild(badge);
  }

  function addLockedOverlay(card, creatorName) {
    if (!card) return;
    card.style.position = "relative";
    const overlay = document.createElement("div");
    overlay.style.position = "absolute";
    overlay.style.inset = "0";
    overlay.style.zIndex = "2";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.textAlign = "center";
    overlay.style.padding = "12px";
    overlay.style.fontSize = "12px";
    overlay.style.fontWeight = "700";
    overlay.style.letterSpacing = "0.06em";
    overlay.style.textTransform = "uppercase";
    overlay.style.background = "linear-gradient(180deg, rgba(3,8,22,0.20), rgba(3,8,22,0.72))";
    overlay.style.color = "rgba(242,246,255,0.9)";
    overlay.textContent = tr("onlyfun.subscribe_to_unlock_creator", "Subscribe to unlock {{creator}}", { creator: String(creatorName || sx("this creator")).trim() });
    card.appendChild(overlay);
  }

  function getCreatorPosts(creatorId) {
    if (!isOnlyfunUnlocked()) return [];
    const id = normalizeCreatorId(creatorId);
    if (!id) return [];
    if (!isCreatorAllowed(id)) return [];
    const persisted = state.posts.filter((post) => normalizeCreatorId(post?.creatorId) === id);
    return dedupePostsForRender(persisted);
  }

  function getFeedPosts() {
    if (!isOnlyfunUnlocked()) return [];
    const subscribedIds = Object.keys(state.subs || {}).filter((id) => !!state.subs[id] && isCreatorAllowed(id));
    if (!subscribedIds.length) return [];
    const set = new Set(subscribedIds);
    const persisted = state.posts.filter((post) => set.has(normalizeCreatorId(post?.creatorId)));
    return dedupePostsForRender(persisted);
  }

  function flashFocusedPostCard(card) {
    if (!card) return;
    card.style.transition = "box-shadow 160ms ease";
    card.style.boxShadow = "0 0 0 1px rgba(112,220,255,0.55), 0 0 26px rgba(112,220,255,0.34)";
    if (state.focusPulseTimer) {
      try { clearTimeout(state.focusPulseTimer); } catch {}
      state.focusPulseTimer = null;
    }
    state.focusPulseTimer = setTimeout(() => {
      state.focusPulseTimer = null;
      card.style.boxShadow = "";
    }, 1700);
  }

  function focusPostInProfile(postId, opts = {}) {
    const id = String(postId || "").trim();
    if (!id || !ui.profilePosts) return false;
    const escapedId = (window.CSS && typeof window.CSS.escape === "function")
      ? window.CSS.escape(id)
      : id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const card = ui.profilePosts.querySelector(`[data-post-id="${escapedId}"]`);
    if (!card) return false;
    try { card.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {}
    flashFocusedPostCard(card);
    if (opts.markSeen !== false) {
      setTimeout(() => { markPostSeen(id, { rerender: true }); }, 1200);
    }
    return true;
  }

  function appendEmptyCard(host, titleText, bodyText) {
    const card = document.createElement("article");
    card.className = "feed-empty";
    const title = document.createElement("h3");
    title.textContent = titleText;
    const body = document.createElement("p");
    body.textContent = bodyText;
    card.appendChild(title);
    card.appendChild(body);
    host.appendChild(card);
  }

  function renderCreatorsStrip() {
    const started = performance.now();
    const host = ui.creatorStrip;
    if (!host) return;
    host.innerHTML = "";
    state.creatorOrder.forEach((id) => {
      if (!isCreatorAllowed(id)) return;
      const creator = state.creators[id];
      if (!creator) return;
      const isSub = isCreatorSubscribed(id);
      const needsRequiredGate = isRequiredCreatorId(id) && !isSub;
      const bubble = document.createElement("button");
      bubble.type = "button";
      bubble.className = "creator-bubble";
      bubble.dataset.subscribed = isSub ? "1" : "0";
      bubble.dataset.required = needsRequiredGate ? "1" : "0";
      if (needsRequiredGate) {
        bubble.title = tr("onlyfun.subscribe_here", "Subscribe here to continue");
      } else if (isRequiredCreatorId(id) && isSub) {
        bubble.title = tr("onlyfun.subscribed", "Subscribed");
      }
      const ring = document.createElement("div");
      ring.className = "creator-ring";
      ring.appendChild(imageWithFallback(creator.avatar, creator.displayName + " avatar", resolveCreatorAvatar(id, creator.avatar)));
      const label = document.createElement("div");
      label.className = "creator-bubble-name";
      label.textContent = creator.displayName;
      bubble.appendChild(ring);
      bubble.appendChild(label);
      if (needsRequiredGate) {
        const badge = document.createElement("span");
        badge.className = "creator-badge";
        badge.textContent = REQUIRED_CREATOR_BADGE;
        bubble.appendChild(badge);
      }
      bubble.addEventListener("click", () => {
        try {
          window.__onlyfunLastProfileOpen = { id, at: Date.now(), ok: openProfile(id), error: "" };
        } catch (error) {
          window.__onlyfunLastProfileOpen = { id, at: Date.now(), ok: false, error: String(error && error.stack ? error.stack : error) };
          try { console.error("[OnlyFun] profile open failed", error); } catch {}
        }
      });
      host.appendChild(bubble);
    });
    openTrace.phases.creatorDomMs = (openTrace.phases.creatorDomMs || 0) + performance.now() - started;
    if (host.children.length && openTrace.phases.firstCreatorCard == null) markOpenPhase("firstCreatorCard");
  }

  function renderFeed() {
    const host = ui.feed;
    if (!host) return;
    host.innerHTML = "";
    if (!isOnlyfunUnlocked()) {
      appendEmptyCard(host, tr("onlyfun.locked", "OnlyFun locked"), tr("onlyfun.install_from_messages", "Install and unlock the app from messages first."));
      return;
    }
    const posts = getFeedPosts();
    const subscribedCount = Object.keys(state.subs || {}).filter((id) => !!state.subs[id] && isCreatorAllowed(id)).length;
    if (!isRequiredCreatorSubscribed()) {
      appendEmptyCard(host, tr("onlyfun.subscription_required", "Subscription required"), tr("onlyfun.tap_required_creator", "Tap the highlighted male creator and subscribe to continue."));
      return;
    }
    if (!subscribedCount) {
      appendEmptyCard(host, tr("onlyfun.no_subscriptions", "No subscriptions yet"), tr("onlyfun.tap_creator_to_view", "Tap a creator bubble and subscribe to view posts."));
      return;
    }
    if (!posts.length) {
      appendEmptyCard(host, tr("onlyfun.no_posts", "No posts yet"), tr("onlyfun.subscribed_empty", "Subscribed creators have not posted anything yet."));
      return;
    }

    posts.forEach((post) => {
      const card = document.createElement("article");
      card.className = "feed-post";
      card.dataset.postId = String(post?.id || "").trim();
      const head = document.createElement("header");
      head.className = "feed-post-header";
      const creatorId = normalizeCreatorId(post?.creatorId || "");
      if (!isCreatorAllowed(creatorId)) return;
      const displayName = String(
        state.creators[creatorId]?.displayName ||
        post?.creatorDisplayName ||
        prettyNameFromKey(creatorId)
      ).trim() || prettyNameFromKey(creatorId);
      const resolvedAvatar = resolveCreatorAvatar(creatorId, post?.creatorAvatar, state.creators[creatorId]?.avatar);
      logAvatarDebug("feed", creatorId, resolvedAvatar);
      const avatar = imageWithFallback(resolvedAvatar, displayName + " avatar", resolveCreatorAvatar(creatorId));
      const textWrap = document.createElement("div");
      textWrap.className = "feed-post-title";
      const name = document.createElement("strong");
      name.textContent = displayName;
      const time = document.createElement("span");
      time.textContent = formatPostTime(post);
      textWrap.appendChild(name);
      textWrap.appendChild(time);
      head.appendChild(avatar);
      head.appendChild(textWrap);

      const media = document.createElement("div");
      media.className = "feed-post-media";
      const mediaImage = postImageWithFallback(post.image, name.textContent + " post", {
        creatorId,
        postId: post?.id || post?.onceKey || ""
      });
      bindPostImageLightbox(mediaImage, post);
      mediaImage.addEventListener("click", () => {
        if (isPostNewForViewer(post)) markPostSeen(post.id, { rerender: true });
      });
      media.appendChild(mediaImage);

      const caption = document.createElement("div");
      caption.className = "feed-post-caption";
      const captionLine = document.createElement("p");
      captionLine.textContent = String(post.text || "");
      caption.appendChild(captionLine);

      card.appendChild(head);
      card.appendChild(media);
      card.appendChild(caption);
      window.SocialInteractions?.mount(card, "onlyfun", post.id);
      if (isPostNewForViewer(post)) addNewBadge(card);
      host.appendChild(card);
    });
  }

  function renderProfile() {
    const creator = activeCreator();
    if (!creator || !isCreatorAllowed(creator.id)) {
      showHomeView();
      return;
    }
    const unlocked = isOnlyfunUnlocked();
    const isSub = isCreatorSubscribed(creator.id);
    const profileAvatar = resolveCreatorAvatar(creator.id, creator.avatar);
    logAvatarDebug("profile", creator.id, profileAvatar);
    if (ui.profileAvatar) {
      if (window.ProtectedMediaResolver?.applyImage) {
        void window.ProtectedMediaResolver.applyImage(ui.profileAvatar, profileAvatar, {
          assetType:"avatar", surface:"onlyfun_profile_avatar", profileId:creator.id
        }).catch(() => { ui.profileAvatar.src = resolveCreatorAvatar(creator.id); });
      } else ui.profileAvatar.src = profileAvatar;
      ui.profileAvatar.alt = creator.displayName + " avatar";
      ui.profileAvatar.onerror = () => { ui.profileAvatar.onerror = null; ui.profileAvatar.src = resolveCreatorAvatar(creator.id); };
    }
    if (ui.profileName) ui.profileName.textContent = creator.displayName;
    if (ui.profileBio) ui.profileBio.textContent = sx(creator.tagline || "Private creator feed.");
    if (ui.profileMeta) {
      const priceLine = creator.priceEur > 0 ? tr("onlyfun.eur_per_month", "EUR {{price}} / month", { price: creator.priceEur.toFixed(2) }) : tr("onlyfun.free", "Free");
      ui.profileMeta.textContent = isRequiredCreatorId(creator.id)
        ? (isSub ? priceLine : tr("onlyfun.required_subscription_price", "{{price}} - required subscription", { price: priceLine }))
        : priceLine;
    }

    if (ui.subscribeBtn) {
      if (!unlocked) {
        ui.subscribeBtn.textContent = tr("common.locked", "Locked");
        ui.subscribeBtn.classList.remove("is-on");
        ui.subscribeBtn.disabled = true;
      } else {
        ui.subscribeBtn.textContent = isSub
          ? tr("onlyfun.subscribed", "Subscribed")
          : (isRequiredCreatorId(creator.id) ? tr("onlyfun.subscribe_to_continue", "Subscribe to continue") : tr("onlyfun.subscribe", "Subscribe"));
        ui.subscribeBtn.classList.toggle("is-on", isSub);
        ui.subscribeBtn.disabled = isSub;
      }
    }

    if (!ui.profilePosts) return;
    ui.profilePosts.innerHTML = "";
    if (!unlocked) {
      appendEmptyCard(ui.profilePosts, tr("onlyfun.locked", "OnlyFun locked"), tr("onlyfun.unlock_before_browsing", "Unlock the app before browsing creator content."));
      return;
    }
    const posts = getCreatorPosts(creator.id);
    if (!posts.length) {
      appendEmptyCard(ui.profilePosts, tr("onlyfun.no_posts", "No posts yet"), tr("onlyfun.creator_empty", "This creator has not posted anything yet."));
      return;
    }

    posts.forEach((post) => {
      const card = document.createElement("article");
      card.className = "profile-post-card";
      card.dataset.postId = String(post?.id || "").trim();
      const image = postImageWithFallback(post.image, creator.displayName + " post", {
        creatorId: creator.id,
        postId: post?.id || post?.onceKey || ""
      });
      const locked = isPostLockedForViewer(post, creator.id);
      if (!locked) {
        bindPostImageLightbox(image, post);
        image.addEventListener("click", () => {
          if (isPostNewForViewer(post)) markPostSeen(post.id, { rerender: true });
        });
      } else {
        image.style.filter = "blur(12px)";
        image.style.transform = "scale(1.04)";
      }
      const caption = document.createElement("div");
      caption.className = "profile-post-caption";
      caption.textContent = locked
        ? tr("onlyfun.locked_post", "Locked post. Subscribe to reveal this content.")
        : String(post.text || "");
      card.appendChild(image);
      card.appendChild(caption);
      if (!locked) window.SocialInteractions?.mount(card, "onlyfun", post.id);
      if (locked) {
        addLockedOverlay(card, creator.displayName);
      } else if (isPostNewForViewer(post)) {
        addNewBadge(card);
      }
      ui.profilePosts.appendChild(card);
    });

    if (state.focusPostId) {
      const wantedId = state.focusPostId;
      state.focusPostId = "";
      requestAnimationFrame(() => {
        focusPostInProfile(wantedId, { markSeen: true });
      });
    }
  }

  function showToast(message) {
    if (!ui.toast) return;
    ui.toast.textContent = String(message || "");
    ui.toast.hidden = false;
    if (state.toastTimer) { try { clearTimeout(state.toastTimer); } catch {} }
    state.toastTimer = setTimeout(() => {
      state.toastTimer = null;
      if (ui.toast) ui.toast.hidden = true;
    }, 1400);
  }

  function openProfile(creatorId, opts = {}) {
    const id = normalizeCreatorId(creatorId);
    if (!id || !isCreatorAllowed(id)) return false;
    state.activeCreatorId = id;
    state.focusPostId = String(opts?.postId || opts?.focusPostId || "").trim();
    setView("profile");
    renderProfile();
    return true;
  }

  function consumeOnlyfunDeepLink(query = {}) {
    const q = (query && typeof query === "object") ? query : {};
    let creatorId = normalizeCreatorId(q.creatorId || q.openCreator || q.id || safeGetLS(ONLYFUN_OPEN_CREATOR_KEY) || "");
    const postId = String(q.postId || q.focusPost || safeGetLS(ONLYFUN_FOCUS_POST_KEY) || "").trim();
    safeRemLS(ONLYFUN_OPEN_CREATOR_KEY);
    safeRemLS(ONLYFUN_FOCUS_POST_KEY);
    if (!creatorId && postId) {
      const found = state.posts.find((post) => String(post?.id || "").trim() === postId);
      creatorId = normalizeCreatorId(found?.creatorId || "");
    }
    if (creatorId && !isCreatorAllowed(creatorId)) creatorId = "";
    return { creatorId, postId };
  }

  function openFromDeepLink(route = {}) {
    const creatorId = normalizeCreatorId(route?.creatorId || "");
    const postId = String(route?.postId || "").trim();
    if (!creatorId) return false;
    if (!isCreatorAllowed(creatorId)) return false;
    if (!state.creators[creatorId]) return false;
    openProfile(creatorId, { postId });
    return true;
  }

  function showHomeView(opts = {}) {
    hydrateFromStorage();
    renderCreatorsStrip();
    renderFeed();
    setView("home");
    markOpenPhase("ready");
    try { console.info("[OnlyFunPerformance]", JSON.stringify({ ...openTrace, totalMs: performance.now() - openTrace.startedAt })); } catch {}
    if (openFromDeepLink(opts?.route || {})) return;
    const pendingGate = pendingGateForCreator(REQUIRED_CREATOR_ID);
    if (isOnlyfunUnlocked() && isRequiredCreatorSubscribed() && pendingGate) {
      // A subscribed gate is already eligible. Start reconciliation now so
      // leaving OnlyFun cannot cancel the only timer that knew about it.
      void tryTriggerPendingOnlyfunGate(REQUIRED_CREATOR_ID);
      return;
    }
    if (isOnlyfunUnlocked() && isRequiredCreatorSubscribed() && safeGetLS(MASON_WARNING_PENDING_KEY) === "1" && !masonWarningDone() && currentProgressDay() <= 2) {
      scheduleMasonWarningTrigger();
    }
  }

  function showLoginView() {
    if (ui.nametagInput && !ui.nametagInput.dataset.prefilled) {
      ui.nametagInput.value = window.PlayerIdentity?.getNametag?.() || window.PlayerIdentity?.getName?.() || "Theo";
      ui.nametagInput.dataset.prefilled = "1";
    }
    setView("login");
    setLoginBusy(false);
  }

  async function canLoadStory(path) {
    const storyPath = String(path || "").trim();
    if (!storyPath) return false;
    try {
      const res = await fetch(storyPath, { cache: "no-store" });
      if (!res.ok) return false;
      const json = await res.json();
      return !!json && typeof json === "object";
    } catch {
      return false;
    }
  }

  async function openGateStoryConversation(storyPath, contactId, source) {
    const normalizedPath = normalizeStoryPathForGate(storyPath);
    const cid = canonicalId(contactId || "mason");
    if (!normalizedPath || !cid) return false;
    if (typeof window.navigateToScene !== "function") return false;
    // Register the dispatch before mounting its conversation. The background
    // walker then pauses durably at the conversation boundary and the scene
    // adopts that exact pending dispatch. Starting it after scene:mounted
    // races the scene's own asynchronous loadStory runner: either runner can
    // bump the shared run id and silently invalidate the other before step 0.
    let startPromise;
    try {
      startPromise = Promise.resolve(window.Game?.startStory?.(normalizedPath, {
        contactId: cid,
        __strictRequestedPath: true,
        from: source || "onlyfun_gate",
        reason: source || "onlyfun_gate"
      }));
    } catch {
      return false;
    }
    // startStory loads the manifest before it publishes its durable dispatch.
    // Mount as soon as that dispatch/lease exists, while retaining its runId,
    // instead of waiting for the background promise to finish (too late) or
    // mounting before admission (too early).
    let admitted = false;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try {
        const execution = window.GameStateEngine?.getExecutionState?.() || {};
        const pending = window.Game?.readPendingStory?.() || null;
        admitted = (
          canonicalId(execution.activeContactId || execution.cursor?.contactId || "") === cid &&
          normalizeStoryPathForGate(execution.activeStoryPath || execution.cursor?.storyPath || "") === normalizedPath
        ) || (
          canonicalId(pending?.contactId || "") === cid &&
          normalizeStoryPathForGate(pending?.path || pending?.storyPath || "") === normalizedPath
        );
      } catch {}
      if (admitted) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (admitted) {
      window.navigateToScene("conversation", { id: cid, contactId: cid, storyPath: normalizedPath, from: source || "onlyfun_gate" });
    }
    const result = await startPromise;
    if (result === false) return false;
    if (!admitted) return false;
    return true;
  }

  async function tryTriggerMasonWarningStory() {
    syncRequiredCreatorGateState();
    if (masonWarningDone()) return;
    if (currentProgressDay() > 2) return;
    if (!isRequiredCreatorSubscribed()) return;
    if (!pendingGateForCreator(REQUIRED_CREATOR_ID)) return;
    if (!(await canLoadStory(MASON_WARNING_STORY_PATH))) return;
    try {
      await openGateStoryConversation(MASON_WARNING_STORY_PATH, "mason", "onlyfun_subscription");
    } catch {}
  }

  function scheduleMasonWarningTrigger() {
    if (state.storyTimer) return;
    const delay = 360 + Math.floor(Math.random() * 341);
    state.storyTimer = setTimeout(() => {
      state.storyTimer = null;
      tryTriggerMasonWarningStory();
    }, delay);
  }

  async function tryTriggerPendingOnlyfunGate(rawCreatorId) {
    const creatorId = normalizeCreatorId(rawCreatorId);
    if (!creatorId || !isCreatorSubscribed(creatorId)) return false;
    const gate = pendingGateForCreator(creatorId);
    if (!gate) return false;
    const storyPath = normalizeStoryPathForGate(gate.startStory || gate.storyPath || "");
    if (!storyPath || !(await canLoadStory(storyPath))) return false;
    const current = window.GameStateEngine?.getState?.() || {};
    const executionPath = normalizeStoryPathForGate(current.execution?.activeStoryPath || current.execution?.cursor?.storyPath || "");
    const pendingPath = normalizeStoryPathForGate(current.progression?.pendingStory?.path || current.progression?.pendingStory?.storyPath || "");
    // The gate has already done its job if this exact story is active or
    // durably paused. Do not throw the player back into Mason when they open
    // OnlyFun; reopening Mason later will adopt the existing cursor.
    if (executionPath === storyPath || pendingPath === storyPath) return true;
    try {
      const opened = await openGateStoryConversation(storyPath, gate.contactId || "mason", "onlyfun_subscription_gate");
      if (opened) {
        // Admission is not completion. Keep the durable gate and let
        // cleanupExpiredOnlyfunGates acknowledge it only after the story's
        // own onceKey is canonically completed. This makes leaving for
        // OnlyFun mid-dialogue resumable instead of silently truncating it.
        return true;
      }
      armPendingOnlyfunGateRetry(creatorId);
    } catch {
      armPendingOnlyfunGateRetry(creatorId);
    }
    return false;
  }

  function armPendingOnlyfunGateRetry(rawCreatorId) {
    const creatorId = normalizeCreatorId(rawCreatorId);
    const engine = window.GameStateEngine;
    if (!creatorId || !engine?.subscribe) return false;
    const watchers = (window.__onlyfunGateRetryWatchers ||= Object.create(null));
    if (watchers[creatorId]) return true;
    const wakeWhenIdle = () => {
      // Engine subscribers receive the committed event list, not the state.
      // Always read the fresh canonical snapshot after that notification.
      const execution = engine.getState()?.execution || {};
      if (execution.lease || execution.status !== "idle") return;
      try { unsubscribe(); } catch {}
      delete watchers[creatorId];
      Promise.resolve().then(() => tryTriggerPendingOnlyfunGate(creatorId));
    };
    const unsubscribe = engine.subscribe(wakeWhenIdle);
    watchers[creatorId] = unsubscribe;
    // The conflicting story may have completed during openGateStoryConversation's
    // bounded admission wait, before this observer was installed. Reconcile
    // that already-idle edge immediately instead of waiting for an unrelated
    // future engine mutation.
    wakeWhenIdle();
    return true;
  }

  function schedulePendingOnlyfunGate(rawCreatorId) {
    if (state.storyTimer) return;
    const creatorId = normalizeCreatorId(rawCreatorId);
    if (!creatorId) return;
    const delay = 360 + Math.floor(Math.random() * 341);
    state.storyTimer = setTimeout(() => {
      state.storyTimer = null;
      tryTriggerPendingOnlyfunGate(creatorId);
    }, delay);
  }

  function beginSignIn(event) {
    event?.preventDefault();
    if (!isOnlyfunUnlocked()) return;
    if (!ui.loginBtn || ui.loginBtn.disabled) return;
    const saved = window.PlayerIdentity?.setNametag?.(ui.nametagInput?.value);
    if (!saved?.ok) {
      if (ui.loginStatus) ui.loginStatus.textContent = tr("player.nametag_error", "Your nametag could not be saved. Please try again.");
      ui.nametagInput?.focus();
      return;
    }
    setLoginBusy(true);
    const delay = 900 + Math.floor(Math.random() * 501);
    state.signInTimer = setTimeout(() => {
      state.signInTimer = null;
      const result = dispatchOnlyfun("SET_ONLYFUN_SIGNED_IN", { signedIn: true }, `onlyfun-sign-in:${canonicalOnlyfun()?.signedIn ? "existing" : "player"}`);
      if (!result.ok && result.status !== "DUPLICATE_COMMAND") { setLoginBusy(false); return; }
      setLoginBusy(false);
      const route = consumeOnlyfunDeepLink(window.Game?.lastQuery || {});
      showHomeView({ route });
    }, delay);
  }

  function subscribeToActiveCreator() {
    const creator = activeCreator();
    if (!creator || !isOnlyfunUnlocked()) return;
    if (!isCreatorAllowed(creator.id)) return;
    if (isCreatorSubscribed(creator.id)) return;
    const result = dispatchOnlyfun("SET_ONLYFUN_SUBSCRIPTION", { creatorId: creator.id, subscribed: true }, `onlyfun-subscribe:${creator.id}`);
    if (!result.ok && result.status !== "DUPLICATE_COMMAND") return;
    state.subs[creator.id] = true;
    hydrateFromStorage();
    renderCreatorsStrip();
    renderFeed();
    renderProfile();
    syncOnlyfunBadge();
    const pendingGate = pendingGateForCreator(creator.id);
    if (pendingGate) {
      // Eligibility is durable and already true at this point. A delayed
      // scene-owned timer is unsafe because normal navigation tears this
      // scene down before it fires, leaving the canonical gate stranded.
      void tryTriggerPendingOnlyfunGate(creator.id);
      showToast(tr("onlyfun.subscribed_messages", "Subscribed. Messages unlocked."));
      return;
    }
    if (isRequiredCreatorId(creator.id) && !masonWarningDone() && currentProgressDay() <= 2) {
      dispatchOnlyfun("SET_ONLYFUN_PENDING_GATE", {
        operationId: "onlyfun-mason-warning-gate-v1",
        gateId: "onlyfun-mason-warning-gate-v1",
        creatorId: REQUIRED_CREATOR_ID,
        gate: { id: "onlyfun-mason-warning-gate-v1", requiredCreatorId: REQUIRED_CREATOR_ID, creatorId: REQUIRED_CREATOR_ID, startStory: MASON_WARNING_STORY_PATH, storyPath: MASON_WARNING_STORY_PATH, contactId: "mason", onceKey: MASON_WARNING_ONCE_KEY.replace(/^once_/, ""), scopeMaxDay: 2, createdAt: Date.now() }
      }, "onlyfun-mason-warning-gate-v1");
      void tryTriggerPendingOnlyfunGate(creator.id);
      showToast(tr("onlyfun.subscribed_messages", "Subscribed. Messages unlocked."));
      return;
    }
    showToast(tr("onlyfun.subscribed", "Subscribed"));
  }

  function handleOnlyfunPostEvent(detail) {
    const payload = detail?.post || detail || null;
    if (!payload || typeof payload !== "object") return;
    const normalized = normalizePost(payload, state.creators);
    if (normalized && !isCreatorAllowed(normalized.creatorId)) return;
    hydrateFromStorage();
    if (!isSignedIn()) return;
    if (state.view === "profile") renderProfile();
    renderCreatorsStrip();
    renderFeed();
    syncOnlyfunBadge();
  }

  function addListener(el, type, fn) {
    if (!el || !type || typeof fn !== "function") return;
    el.addEventListener(type, fn);
    state.listeners.push({ el, type, fn });
  }

  const unbindNametag = window.PlayerIdentity?.bindNametagButton?.(ui.nametagEdit);
  window.__onlyfun_cleanup = () => {
    unbindNametag?.();
    closeLightbox();
    if (state.signInTimer) { try { clearTimeout(state.signInTimer); } catch {} }
    if (state.storyTimer) { try { clearTimeout(state.storyTimer); } catch {} }
    if (state.toastTimer) { try { clearTimeout(state.toastTimer); } catch {} }
    if (state.focusPulseTimer) { try { clearTimeout(state.focusPulseTimer); } catch {} }
    state.signInTimer = null;
    state.storyTimer = null;
    state.toastTimer = null;
    state.focusPulseTimer = null;

    state.listeners.forEach(({ el, type, fn }) => { try { el.removeEventListener(type, fn); } catch {} });
    state.listeners = [];
    state.busHandlers.forEach(({ type, fn }) => { try { window.StoryBus?.off?.(type, fn); } catch {} });
    state.busHandlers = [];
    state.winHandlers.forEach(({ type, fn }) => { try { window.removeEventListener(type, fn); } catch {} });
    state.winHandlers = [];
    if (state.mountedHandler) {
      try { window.removeEventListener("scene:mounted", state.mountedHandler); } catch {}
      state.mountedHandler = null;
    }
    if (state.engineUnsubscribe) { try { state.engineUnsubscribe(); } catch {} state.engineUnsubscribe = null; }
  };

  addListener(ui.loginForm, "submit", beginSignIn);
  addListener(ui.backBtn, "click", showHomeView);
  addListener(ui.subscribeBtn, "click", subscribeToActiveCreator);
  addListener(ui.lightbox, "click", (event) => {
    if (!isLightboxOpen()) return;
    if (event.target === ui.lightbox || event.target === ui.lightboxImage) closeLightbox();
  });
  addListener(document, "keydown", (event) => {
    if (event.key === "Escape" && isLightboxOpen()) closeLightbox();
  });

  if (window.StoryBus && typeof window.StoryBus.on === "function") {
    const busFn = (payload) => handleOnlyfunPostEvent(payload);
    window.StoryBus.on("onlyfun:post", busFn);
    state.busHandlers.push({ type: "onlyfun:post", fn: busFn });
  }
  const winFn = (event) => handleOnlyfunPostEvent(event?.detail || {});
  window.addEventListener("onlyfun:post", winFn);
  state.winHandlers.push({ type: "onlyfun:post", fn: winFn });

  if (window.GameStateEngine?.subscribe) {
    state.engineUnsubscribe = window.GameStateEngine.subscribe((events) => {
      for (const event of events || []) {
        if (event?.type === "onlyfun:post-added") handleOnlyfunPostEvent({ post: event.post });
        else if (String(event?.type || "").startsWith("onlyfun:")) hydrateFromStorage();
      }
    });
  }

  addListener(window, "i18n:language-ready", () => {
    if (state.view === "profile") renderProfile();
    renderFeed();
  });

  state.mountedHandler = async (event) => {
    const name = String(event?.detail?.name || "").toLowerCase();
    if (name !== SCENE_NAME) return;
    const route = consumeOnlyfunDeepLink(event?.detail?.query || {});
    await ensureBootstrapped();
    clearOnlyfunBadge();
    hydrateFromStorage();
    if (!isOnlyfunUnlocked()) { showHomeView({ route }); return; }
    if (isSignedIn()) showHomeView({ route });
    else showLoginView();
  };
  window.addEventListener("scene:mounted", state.mountedHandler);

  // A progressed profile already has canonical creator content. Put that
  // useful structure on screen immediately; catalog reconciliation continues
  // concurrently and never gates the first meaningful paint.
  const hasCanonicalCreators = Object.keys(canonicalOnlyfun()?.creators || {}).length > 0;
  let renderedCanonicalEarly = false;
  if (hasCanonicalCreators) {
    hydrateFromStorage();
    const earlyRoute = consumeOnlyfunDeepLink(window.Game?.lastQuery || {});
    if (!isOnlyfunUnlocked() || isSignedIn()) showHomeView({ route: earlyRoute });
    else showLoginView();
    renderedCanonicalEarly = true;
  }
  await ensureBootstrapped();
  clearOnlyfunBadge();
  hydrateFromStorage();
  if (renderedCanonicalEarly) {
    renderCreatorsStrip();
    renderFeed();
    if (state.view === "profile") renderProfile();
  } else {
    const startupRoute = consumeOnlyfunDeepLink(window.Game?.lastQuery || {});
    if (!isOnlyfunUnlocked()) showHomeView({ route: startupRoute });
    else if (isSignedIn()) showHomeView({ route: startupRoute });
    else showLoginView();
  }
})();
