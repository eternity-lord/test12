// scripts/audio.js
// Drop-in audio assets:
// Put files at exactly these paths/names:
// SFX:
// - assets/sfx/ui_tap.mp3
// - assets/sfx/ui_back.mp3
// - assets/sfx/ui_home.mp3
// - assets/sfx/ui_confirm.mp3
// - assets/sfx/ui_cancel.mp3
// - assets/sfx/ui_toggle.mp3
// - assets/sfx/ui_slider.mp3
// - assets/sfx/msg_send.mp3
// - assets/sfx/msg_receive_in.mp3
// - assets/sfx/msg_receive_out.mp3
// - assets/sfx/msg_choice.mp3
// - assets/sfx/notif_generic.mp3 (legacy; generic notifications fall back to notif_snapgram on Android)
// - assets/sfx/notif_snapgram.mp3
// - assets/sfx/notif_generic.mp3
// - assets/sfx/fx_glitch.mp3
// - assets/sfx/fx_timecard.mp3
// - assets/sfx/hak_boot.mp3
// - assets/sfx/skill_unlock.mp3
// Card Vault:
// - assets/sfx/pack_oppening.mp3
// - assets/sfx/reward_point.mp3
// - assets/sfx/new_card.mp3
// - assets/sfx/cardDraw.mp3
// - assets/sfx/open_all.mp3
// - assets/sfx/Rare_card.mp3
// - assets/sfx/Epic_card.mp3
// - assets/sfx/Legendary_card.mp3
// - assets/sfx/Mythic_card.mp3
// Music:
// - assets/sfx/bgm_main.mp3
(function initAudioManager() {
  "use strict";

  window.Game = window.Game || {};
  const Game = window.Game;
  if (Game.audio && Game.audio.__audioManagerV1) return;

  const LS = {
    enabled: "audio_enabled",
    vol: {
      master: "audio_master",
      sfx: "audio_sfx",
      music: "audio_music",
      notif: "audio_notif"
    },
    muted: {
      master: "audio_muted_master",
      sfx: "audio_muted_sfx",
      music: "audio_muted_music",
      notif: "audio_muted_notif"
    }
  };

  const DEFAULTS = {
    // Default audio levels (first launch): master/sfx/notif 50%, music 20%
    enabled: true,
    vol: { master: 0.5, sfx: 0.5, music: 0.2, notif: 0.5 },
    muted: { master: false, sfx: false, music: false, notif: false }
  };

  const SOUND_REGISTRY = {
    ui_tap:           { src: "assets/sfx/ui_tap.mp3",           category: "sfx",   cooldownMs: 35 },
    ui_back:          { src: "assets/sfx/ui_back.mp3",          category: "sfx",   cooldownMs: 80 },
    ui_home:          { src: "assets/sfx/ui_home.mp3",          category: "sfx",   cooldownMs: 80 },
    ui_confirm:       { src: "assets/sfx/ui_confirm.mp3",       category: "sfx",   cooldownMs: 100 },
    ui_cancel:        { src: "assets/sfx/ui_cancel.mp3",        category: "sfx",   cooldownMs: 100 },
    ui_toggle:        { src: "assets/sfx/ui_toggle.mp3",        category: "sfx",   cooldownMs: 120 },
    ui_slider:        { src: "assets/sfx/ui_slider.mp3",        category: "sfx",   cooldownMs: 120 },

    msg_send:         { src: "assets/sfx/msg_send.mp3",         category: "sfx",   cooldownMs: 60 },
    msg_receive_in:   { src: "assets/sfx/msg_receive_in.mp3",   category: "sfx",   cooldownMs: 110 },
    msg_receive_out:  { src: "assets/sfx/msg_receive_out.mp3",  category: "sfx",   cooldownMs: 180 },
    msg_choice:       { src: "assets/sfx/msg_choice.mp3",       category: "sfx",   cooldownMs: 90 },

    notif_message:    { src: "assets/sfx/notif_snapgram.mp3",   category: "notif", cooldownMs: 160 },
    notif_snapgram:   { src: "assets/sfx/notif_snapgram.mp3",   category: "notif", cooldownMs: 160 },
    notif_generic:    { src: "assets/sfx/notif_snapgram.mp3",   category: "notif", cooldownMs: 160 },

    fx_glitch:        { src: "assets/sfx/fx_glitch.mp3",        category: "sfx",   cooldownMs: 140 },
    fx_timecard:      { src: "assets/sfx/fx_timecard.mp3",      category: "sfx",   cooldownMs: 350 },
    hak_boot:         { src: "assets/sfx/hak_boot.mp3",         category: "sfx",   cooldownMs: 450 },
    skill_unlock:     { src: "assets/sfx/skill_unlock.mp3",     category: "sfx",   cooldownMs: 350 },
    cardVaultPackOpening: { src: "assets/sfx/pack_oppening.mp3", category: "sfx", cooldownMs: 250 },
    cardVaultRewardPoint: { src: "assets/sfx/reward_point.mp3",  category: "sfx", cooldownMs: 120 },
    cardVaultNewCard:     { src: "assets/sfx/new_card.mp3",     category: "sfx", cooldownMs: 100 },
    cardVaultCardDraw:    { src: "assets/sfx/cardDraw.mp3",      category: "sfx", cooldownMs: 80 },
    cardVaultOpenAll:     { src: "assets/sfx/open_all.mp3",      category: "sfx", cooldownMs: 180 },
    cardVaultRareAccent:       { src: "assets/sfx/Rare_card.mp3",      category: "sfx", cooldownMs: 80 },
    cardVaultEpicAccent:       { src: "assets/sfx/Epic_card.mp3",      category: "sfx", cooldownMs: 80 },
    cardVaultLegendaryAccent:  { src: "assets/sfx/Legendary_card.mp3", category: "sfx", cooldownMs: 80 },
    cardVaultMythicAccent:     { src: "assets/sfx/Mythic_card.mp3",    category: "sfx", cooldownMs: 80 },

    bgm_main:         { src: "assets/sfx/bgm_main.mp3",       category: "music", loop: true }
  };

  const GLOBAL_MUSIC_ID = "bgm_main";
  const CINEMATIC_LOCK_KEY = "__cinematic_lock_v1";
  const CINEMATIC_SFX_ALLOW = new Set(["hak_boot", "fx_glitch", "fx_timecard"]);
  const GLITCH_SOUND_ID = "fx_glitch";
  const GLITCH_RESTORE_PAD_MS = 24;
  const LEGACY_MUSIC_IDS = new Set([
    "ambient_home",
    "ambient_apps",
    "ambient_conv",
    "ambient_suspense"
  ]);
  const warnedMissingBySrc = new Set();
  const warnedUnknownById = new Set();
  const elementPool = new Map();
  const lastPlayedAt = Object.create(null);
  const pendingQueue = new Map();
  let pendingMusic = null;
  let unlocked = false;
  let unlockBound = false;
  let currentMusic = null;
  let musicRequested = false;
  const cinematicDuckStack = [];
  const activeTransientNodes = new Set();
  let glitchUntil = 0;
  let glitchTimer = 0;
  let glitchActive = false;
  let glitchMixIntensity = 1;
  let glitchSnapshot = null;
  const VIEWER_SELECTOR = "#igViewer, #lightbox, #photoViewer, #avatarViewer, #mediaViewer, .ig-viewer, .lightbox, .photo-viewer, .avatar-viewer, .media-viewer-overlay";
  const viewerState = new WeakMap();
  let viewerObserver = null;
  const isAndroidWebView = (() => {
    try {
      const ua = String(navigator.userAgent || "");
      return /Android/i.test(ua) && (/; wv\)/i.test(ua) || /Version\/\d+\.\d+ Chrome\//i.test(ua) || location.protocol === "https:");
    } catch {
      return false;
    }
  })();
  const AUDIO_FAILURE_REASONS = Object.freeze({
    MISSING: "MISSING",
    UNREADABLE: "UNREADABLE",
    DECODE_ERROR: "DECODE_ERROR",
    LOAD_TIMEOUT: "LOAD_TIMEOUT",
    AUTOPLAY_BLOCKED: "AUTOPLAY_BLOCKED",
    NOT_YET_INITIALIZED: "NOT_YET_INITIALIZED"
  });

  function audioDiagnosticsEnabled() {
    try {
      return new URLSearchParams(location.search).has("qa")
        || localStorage.getItem("audio_debug_v1") === "1"
        || window.Game?.audioDebug === true;
    } catch {
      return false;
    }
  }

  function normalizedAssetPath(raw) {
    return String(raw || "").trim().replace(/\\/g, "/").replace(/^\.\/+/, "");
  }

  function resolveAssetUrl(raw) {
    const input = normalizedAssetPath(raw);
    const base = String(document.baseURI || location.href || "");
    let resolvedUrl = input;
    try {
      resolvedUrl = new URL(input, base).href;
    } catch {}
    let decodedUrl = resolvedUrl;
    try { decodedUrl = decodeURI(resolvedUrl); } catch {}
    let filesystemRelativePath = input;
    try {
      const url = new URL(resolvedUrl);
      filesystemRelativePath = decodeURIComponent(url.pathname || "")
        .replace(/^\/([A-Za-z]:\/)/, "$1")
        .replace(/\\/g, "/");
    } catch {}
    return {
      input,
      resolvedUrl,
      documentBaseURI: base,
      pageUrl: String(location.href || ""),
      decodedUrl,
      filesystemRelativePath,
      scheme: (() => { try { return new URL(resolvedUrl).protocol; } catch { return ""; } })(),
      runtime: isAndroidWebView ? "android" : (/Electron/i.test(String(navigator.userAgent || "")) ? "electron" : "web")
    };
  }

  function mediaFailureReason(mediaError) {
    const code = Number(mediaError?.code || 0);
    if (code === 3 || code === 4) return AUDIO_FAILURE_REASONS.DECODE_ERROR;
    if (code === 2) return AUDIO_FAILURE_REASONS.UNREADABLE;
    return AUDIO_FAILURE_REASONS.UNREADABLE;
  }

  const state = readState();
  persistAll();

  function safeGetLS(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  function safeSetLS(key, value) {
    try { localStorage.setItem(key, String(value)); } catch {}
  }

  function clamp01(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
  }

  function toBool(raw, fallback) {
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
    return !!fallback;
  }

  function readVol(key, fallback) {
    const raw = safeGetLS(key);
    if (raw == null || raw === "") return clamp01(fallback);
    const n = Number(raw);
    return Number.isFinite(n) ? clamp01(n) : clamp01(fallback);
  }

  function readState() {
    const mutedMaster = toBool(safeGetLS(LS.muted.master), DEFAULTS.muted.master);
    const enabled = toBool(safeGetLS(LS.enabled), !mutedMaster);
    return {
      enabled,
      vol: {
        master: readVol(LS.vol.master, DEFAULTS.vol.master),
        sfx: readVol(LS.vol.sfx, DEFAULTS.vol.sfx),
        music: readVol(LS.vol.music, DEFAULTS.vol.music),
        notif: readVol(LS.vol.notif, DEFAULTS.vol.notif)
      },
      muted: {
        master: mutedMaster || !enabled,
        sfx: toBool(safeGetLS(LS.muted.sfx), DEFAULTS.muted.sfx),
        music: toBool(safeGetLS(LS.muted.music), DEFAULTS.muted.music),
        notif: toBool(safeGetLS(LS.muted.notif), DEFAULTS.muted.notif)
      }
    };
  }

  function persistAll() {
    safeSetLS(LS.enabled, state.enabled ? "1" : "0");
    safeSetLS(LS.vol.master, state.vol.master);
    safeSetLS(LS.vol.sfx, state.vol.sfx);
    safeSetLS(LS.vol.music, state.vol.music);
    safeSetLS(LS.vol.notif, state.vol.notif);
    safeSetLS(LS.muted.master, state.muted.master ? "1" : "0");
    safeSetLS(LS.muted.sfx, state.muted.sfx ? "1" : "0");
    safeSetLS(LS.muted.music, state.muted.music ? "1" : "0");
    safeSetLS(LS.muted.notif, state.muted.notif ? "1" : "0");
  }

  function reportAssetFailure(id, meta, reason, mediaError, extra = {}) {
    if (!meta || !meta.src) return;
    const resolution = resolveAssetUrl(meta.src);
    const key = `${resolution.resolvedUrl}:${reason}`;
    if (warnedMissingBySrc.has(key)) return;
    warnedMissingBySrc.add(key);
    if (!audioDiagnosticsEnabled()) return;
    console.warn("[audio] asset load failed", JSON.stringify({
      id: String(id || ""),
      source: resolution.resolvedUrl,
      input: resolution.input,
      reason: String(reason || AUDIO_FAILURE_REASONS.UNREADABLE),
      mediaErrorCode: Number(mediaError?.code || 0) || null,
      ...extra,
      runtime: resolution.runtime
    }));
  }

  function warnUnknown(id) {
    const key = String(id || "");
    if (!key || warnedUnknownById.has(key)) return;
    warnedUnknownById.add(key);
    console.warn("[audio] unknown sound id:", key);
  }

  function registryEntry(id) {
    const rawKey = String(id || "").trim();
    const key = LEGACY_MUSIC_IDS.has(rawKey) ? GLOBAL_MUSIC_ID : rawKey;
    const meta = SOUND_REGISTRY[key];
    if (!meta) warnUnknown(id);
    return meta || null;
  }

  function ensureElement(id) {
    const key = String(id || "");
    const meta = registryEntry(key);
    if (!meta) return null;
    if (elementPool.has(key)) return elementPool.get(key);

    const resolution = resolveAssetUrl(meta.src);
    const el = new Audio(resolution.resolvedUrl);
    el.preload = "auto";
    el.loop = !!meta.loop;
    el.dataset.audioSoundId = key;
    el.dataset.audioSource = resolution.resolvedUrl;
    el.addEventListener("error", () => {
      reportAssetFailure(key, meta, mediaFailureReason(el.error), el.error);
    }, { once: true });
    const loadTimer = setTimeout(() => {
      if (el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        reportAssetFailure(key, meta, AUDIO_FAILURE_REASONS.LOAD_TIMEOUT, el.error, {
          readyState: el.readyState,
          networkState: el.networkState
        });
      }
    }, isAndroidWebView ? 8000 : 12000);
    el.addEventListener("canplaythrough", () => {
      try { clearTimeout(loadTimer); } catch {}
    }, { once: true });
    el.addEventListener("loadeddata", () => {
      try { clearTimeout(loadTimer); } catch {}
    }, { once: true });
    elementPool.set(key, el);
    return el;
  }

  function isMuted(cat) {
    if (!state.enabled) return true;
    if (state.muted.master) return true;
    if (!cat) return false;
    return !!state.muted[cat];
  }

  function masterGain() {
    if (!state.enabled || state.muted.master) return 0;
    return clamp01(state.vol.master);
  }

  function categoryGlitchScalar(cat) {
    if (!glitchActive) return 1;
    if (cat === "sfx" || cat === "music" || cat === "notif") return 0;
    return 1;
  }

  function categoryGain(cat) {
    if (isMuted(cat)) return 0;
    const master = masterGain();
    const local = clamp01(state.vol[cat] == null ? 1 : state.vol[cat]);
    return clamp01(master * local * categoryGlitchScalar(cat));
  }

  function resolveCategory(id, opts) {
    const meta = registryEntry(id);
    if (!meta) return "sfx";
    const requested = String(opts?.category || "").trim().toLowerCase();
    if (requested === "sfx" || requested === "music" || requested === "notif") return requested;
    return meta.category || "sfx";
  }

  function readCooldownMs(id, opts) {
    const meta = registryEntry(id);
    const explicit = Number(opts?.cooldownMs ?? opts?.cooldown);
    if (Number.isFinite(explicit) && explicit >= 0) return explicit;
    const fallback = Number(meta?.cooldownMs || 0);
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
  }

  function isCinematicLockActive() {
    try {
      if ((window.Game || {})._cinematicLock === true) return true;
    } catch {}
    return safeGetLS(CINEMATIC_LOCK_KEY) === "1";
  }

  function clearGlitchTimer() {
    if (!glitchTimer) return;
    try { clearTimeout(glitchTimer); } catch {}
    glitchTimer = 0;
  }

  function glitchBoost(intensity) {
    const n = Number(intensity);
    const safe = Number.isFinite(n) ? n : 1;
    return Math.max(0.9, Math.min(1.4, 0.9 + (safe * 0.6)));
  }

  function captureGlitchSnapshot() {
    if (glitchSnapshot) return glitchSnapshot;
    const baseMusicGain = isMuted("music")
      ? 0
      : clamp01(masterGain() * clamp01(state.vol.music == null ? 1 : state.vol.music));
    const activeMusicVol = currentMusic?.el ? clamp01(Number(currentMusic.el.volume || 0)) : 0;
    const musicScalar = baseMusicGain > 0 ? clamp01(activeMusicVol / baseMusicGain) : 1;
    const nodeVolumes = new Map();
    activeTransientNodes.forEach((node) => {
      if (!node || node.ended) return;
      nodeVolumes.set(node, clamp01(Number(node.volume || 0)));
    });
    glitchSnapshot = {
      at: Date.now(),
      musicScalar,
      musicWasPlaying: !!(currentMusic?.el && !currentMusic.el.paused && !currentMusic.el.ended),
      nodeVolumes
    };
    return glitchSnapshot;
  }

  function applyGlitchMixNow() {
    activeTransientNodes.forEach((node) => {
      if (!node || node.ended) return;
      if (String(node.__audioSoundId || "") === GLITCH_SOUND_ID) return;
      try { node.volume = 0; } catch {}
    });
    const musicEl = currentMusic?.el;
    if (musicEl) {
      try { musicEl.volume = 0; } catch {}
    }
  }

  function restoreAfterGlitch(snapshot) {
    if (!snapshot) return;
    activeTransientNodes.forEach((node) => {
      if (!node || node.ended) return;
      if (String(node.__audioSoundId || "") !== GLITCH_SOUND_ID) return;
      try { node.volume = 0; } catch {}
    });
    if (snapshot.nodeVolumes instanceof Map) {
      snapshot.nodeVolumes.forEach((vol, node) => {
        if (!node || node.ended) return;
        if (String(node.__audioSoundId || "") === GLITCH_SOUND_ID) return;
        try { node.volume = clamp01(vol); } catch {}
      });
    }
    if (isCinematicLockActive()) return;
    const musicEl = currentMusic?.el;
    if (!musicEl) return;
    const scalar = clamp01(Number(snapshot.musicScalar));
    const restoreScalar = scalar > 0 ? scalar : 1;
    const target = categoryGain("music") * restoreScalar;
    if (snapshot.musicWasPlaying && target > 0 && (musicEl.paused || musicEl.ended)) {
      try {
        const p = musicEl.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch {}
    }
    try { musicEl.volume = clamp01(target); } catch {}
  }

  function scheduleGlitchRestoreCheck() {
    clearGlitchTimer();
    if (!glitchActive) return;
    const waitMs = Math.max(16, (glitchUntil - Date.now()) + GLITCH_RESTORE_PAD_MS);
    glitchTimer = setTimeout(() => {
      glitchTimer = 0;
      if (!glitchActive) return;
      if (Date.now() < glitchUntil) {
        scheduleGlitchRestoreCheck();
        return;
      }
      exitGlitch();
    }, waitMs);
  }

  function queueUntilUnlock(id, opts) {
    const key = String(opts?.cooldownKey || id || "");
    if (!key) return;
    pendingQueue.set(key, { id, opts: { ...opts }, at: Date.now() });
  }

  function bindUnlock() {
    if (unlockBound) return;
    unlockBound = true;

    const onUnlock = () => {
      unlocked = true;
      for (const evt of ["pointerdown", "click", "keydown", "touchstart"]) {
        try { document.removeEventListener(evt, onUnlock, true); } catch {}
      }
      flushPending();
    };

    for (const evt of ["pointerdown", "click", "keydown", "touchstart"]) {
      document.addEventListener(evt, onUnlock, true);
    }
  }

  function flushPending() {
    if (!unlocked) return;
    const list = Array.from(pendingQueue.values()).sort((a, b) => a.at - b.at);
    pendingQueue.clear();
    list.forEach((item, idx) => {
      setTimeout(() => {
        play(item.id, { ...item.opts, __fromFlush: true });
      }, idx * 35);
    });
    if (pendingMusic && pendingMusic.id) {
      const next = pendingMusic;
      pendingMusic = null;
      playMusic(next.id, next.opts || {});
    }
  }

  function pushCinematicDuck() {
    const baseGain = categoryGain("music");
    const activeVol = currentMusic?.el ? clamp01(Number(currentMusic.el.volume || 0)) : clamp01(baseGain);
    const scalar = baseGain > 0 ? clamp01(activeVol / baseGain) : 1;
    cinematicDuckStack.push({ scalar, at: Date.now() });
    if (cinematicDuckStack.length > 1) return cinematicDuckStack.length;
    stopMusic({ fadeMs: 90, reset: false, keepRequested: true });
    return cinematicDuckStack.length;
  }

  function popCinematicDuck() {
    if (!cinematicDuckStack.length) return 0;
    const token = cinematicDuckStack.pop() || {};
    if (cinematicDuckStack.length > 0) return cinematicDuckStack.length;
    if (isCinematicLockActive()) return cinematicDuckStack.length;

    const baseGain = categoryGain("music");
    if (baseGain <= 0) return 0;

    const scalar = clamp01(Number(token.scalar));
    const restoreScalar = scalar > 0 ? scalar : 1;
    if (musicRequested || pendingMusic || currentMusic?.el) {
      ensureMusic({ fadeMs: 240, volume: restoreScalar });
    }
    return 0;
  }

  function enterGlitch(ms, intensity) {
    const duration = Math.max(0, Number(ms ?? 420) || 420);
    if (duration <= 0) return false;

    const now = Date.now();
    glitchUntil = Math.max(glitchUntil, now + duration);
    glitchMixIntensity = Number(intensity ?? 1) || 1;
    captureGlitchSnapshot();
    glitchActive = true;
    applyGlitchMixNow();

    play(GLITCH_SOUND_ID, {
      category: "sfx",
      cooldownKey: "fx_glitch_event",
      bypassCooldown: true,
      glitchPriority: true,
      intensity: glitchMixIntensity
    });

    scheduleGlitchRestoreCheck();
    return true;
  }

  function exitGlitch() {
    if (!glitchActive) return false;
    clearGlitchTimer();
    const snapshot = glitchSnapshot;
    glitchActive = false;
    glitchUntil = 0;
    glitchMixIntensity = 1;
    glitchSnapshot = null;
    restoreAfterGlitch(snapshot);
    return true;
  }

  function play(id, opts = {}) {
    const rawKey = String(id || "").trim();
    const key = LEGACY_MUSIC_IDS.has(rawKey) ? GLOBAL_MUSIC_ID : rawKey;
    const meta = registryEntry(key);
    if (!meta) return null;
    if (meta.category === "music") return playMusic(key, opts);

    const glitchPriority = key === GLITCH_SOUND_ID && (opts.glitchPriority === true || glitchActive);
    if (glitchActive && !glitchPriority) return null;
    if (isCinematicLockActive() && !CINEMATIC_SFX_ALLOW.has(key)) return null;

    const category = resolveCategory(key, opts);
    const cooldownMs = readCooldownMs(key, opts);
    const cooldownKey = String(opts.cooldownKey || key);
    const now = Date.now();
    const bypassCooldown = opts.bypassCooldown === true || glitchPriority;
    if (!bypassCooldown && cooldownMs > 0 && now - (lastPlayedAt[cooldownKey] || 0) < cooldownMs) return null;

    if (!unlocked) {
      queueUntilUnlock(key, { ...opts, category, cooldownMs, cooldownKey });
      return null;
    }

    const base = ensureElement(key);
    if (!base) return null;

    const userVol = clamp01(opts.volume == null ? 1 : opts.volume);
    const gain = glitchPriority
      ? clamp01(masterGain() * glitchBoost(opts.intensity ?? glitchMixIntensity) * userVol)
      : (categoryGain(category) * userVol);
    if (gain <= 0) return null;

    lastPlayedAt[cooldownKey] = now;

    const node = base.cloneNode(true);
    node.preload = "auto";
    node.loop = !!opts.loop;
    node.addEventListener("error", () => {
      reportAssetFailure(key, meta, mediaFailureReason(node.error), node.error);
    }, { once: true });
    try { node.currentTime = Math.max(0, Number(opts.seek || 0)); } catch {}
    try { node.playbackRate = Math.max(0.5, Math.min(2, Number(opts.rate || 1))); } catch {}
    try { node.volume = clamp01(gain); } catch {}

    try {
      const p = node.play();
      if (p && typeof p.catch === "function") p.catch((err) => {
        const reason = err?.name === "NotAllowedError"
          ? AUDIO_FAILURE_REASONS.AUTOPLAY_BLOCKED
          : AUDIO_FAILURE_REASONS.UNREADABLE;
        if (reason !== AUDIO_FAILURE_REASONS.AUTOPLAY_BLOCKED) {
          reportAssetFailure(key, meta, reason, node.error, { exceptionName: String(err?.name || "") });
        }
      });
    } catch (err) {
      reportAssetFailure(key, meta, AUDIO_FAILURE_REASONS.UNREADABLE, node.error, {
        exceptionName: String(err?.name || "")
      });
    }
    try { node.__audioSoundId = key; } catch {}
    activeTransientNodes.add(node);
    const forget = () => { activeTransientNodes.delete(node); };
    node.addEventListener("ended", forget, { once: true });
    node.addEventListener("error", forget, { once: true });
    return node;
  }

  function fadeVolume(el, target, ms, done) {
    if (!el) {
      if (typeof done === "function") done();
      return;
    }

    const duration = Math.max(0, Number(ms || 0));
    const from = clamp01(Number(el.volume || 0));
    const to = clamp01(target);

    try {
      if (el.__audioFadeTimer) clearInterval(el.__audioFadeTimer);
    } catch {}

    if (duration <= 0) {
      try { el.volume = to; } catch {}
      if (typeof done === "function") done();
      return;
    }

    const startedAt = Date.now();
    el.__audioFadeTimer = setInterval(() => {
      const p = Math.min(1, (Date.now() - startedAt) / duration);
      const nextVol = from + ((to - from) * p);
      try { el.volume = clamp01(nextVol); } catch {}
      if (p >= 1) {
        try { clearInterval(el.__audioFadeTimer); } catch {}
        el.__audioFadeTimer = 0;
        if (typeof done === "function") done();
      }
    }, 30);
  }

  function isMusicPlaying() {
    const el = currentMusic?.el;
    return !!(el && !el.paused && !el.ended);
  }

  function stopMusic(opts = {}) {
    const fadeMs = Math.max(0, Number(opts.fadeMs ?? opts.fade ?? 600) || 0);
    if (opts.keepRequested !== true) {
      musicRequested = false;
      pendingMusic = null;
    }
    const active = currentMusic?.el;
    if (!active) return;

    fadeVolume(active, 0, fadeMs, () => {
      try { active.pause(); } catch {}
      if (opts.reset === true) {
        try { active.currentTime = 0; } catch {}
      }
    });
  }

  function ensureMusic(opts = {}) {
    musicRequested = true;
    const fadeMs = Math.max(0, Number(opts.fadeMs ?? opts.fade ?? 600) || 0);
    if (isCinematicLockActive()) {
      pendingMusic = { id: GLOBAL_MUSIC_ID, opts: { ...opts, fadeMs } };
      return null;
    }
    if (!unlocked) {
      pendingMusic = { id: GLOBAL_MUSIC_ID, opts: { ...opts, fadeMs } };
      return null;
    }
    const target = categoryGain("music") * clamp01(opts.volume == null ? 1 : opts.volume);
    if (target <= 0) {
      stopMusic({ fadeMs, reset: false, keepRequested: true });
      return null;
    }
    return playMusic(GLOBAL_MUSIC_ID, { ...opts, fadeMs });
  }

  function playMusic(id, opts = {}) {
    musicRequested = true;
    const key = GLOBAL_MUSIC_ID;
    const meta = registryEntry(key);
    if (!meta) return null;
    if (meta.category !== "music") {
      return play(key, { ...opts, category: "sfx" });
    }

    const fadeMs = Math.max(0, Number(opts.fadeMs ?? opts.fade ?? 600) || 0);
    const targetVolume = categoryGain("music") * clamp01(opts.volume == null ? 1 : opts.volume);

    if (isCinematicLockActive()) {
      pendingMusic = { id: GLOBAL_MUSIC_ID, opts: { ...opts, fadeMs } };
      return null;
    }

    if (!unlocked) {
      pendingMusic = { id: GLOBAL_MUSIC_ID, opts: { ...opts } };
      return null;
    }

    if (targetVolume <= 0) {
      stopMusic({ fadeMs: Math.min(220, fadeMs), reset: false, keepRequested: true });
      return null;
    }

    const next = ensureElement(key);
    if (!next) return null;
    next.loop = opts.loop !== false;

    const currentId = String(currentMusic?.id || "");
    const sameTrack = currentMusic && currentMusic.el === next && currentId === key;
    if (sameTrack) {
      if (opts.restart === true) {
        try { next.currentTime = 0; } catch {}
      }
      try {
        const p = next.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch {}
      fadeVolume(next, targetVolume, Math.min(250, fadeMs));
      return next;
    }

    const previous = currentMusic;
    currentMusic = { id: key, el: next };
    try {
      if (opts.restart === true || !Number.isFinite(Number(next.currentTime))) next.currentTime = 0;
      next.volume = 0;
    } catch {}

    try {
      const p = next.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}

    fadeVolume(next, targetVolume, fadeMs);
    if (previous && previous.el && previous.el !== next) {
      fadeVolume(previous.el, 0, Math.max(120, fadeMs), () => {
        try { previous.el.pause(); } catch {}
      });
    }

    return next;
  }

  function setVolume(cat, value, opts = {}) {
    const key = String(cat || "").toLowerCase();
    if (!(key in state.vol)) return;
    state.vol[key] = clamp01(value);
    safeSetLS(LS.vol[key], state.vol[key]);
    if (key === "music" || key === "master") {
      if (categoryGain("music") <= 0) stopMusic({ fadeMs: 120, reset: false, keepRequested: true });
      else if (musicRequested || pendingMusic) ensureMusic({ fadeMs: 120 });
    }
    if (opts.emit !== false) emitChange("setVolume");
  }

  function setMuted(cat, value, opts = {}) {
    const key = String(cat || "").toLowerCase();
    if (!(key in state.muted)) return;
    const next = !!value;
    state.muted[key] = next;
    safeSetLS(LS.muted[key], next ? "1" : "0");

    if (key === "master") {
      state.enabled = !next;
      safeSetLS(LS.enabled, state.enabled ? "1" : "0");
    }

    if (key === "music" || key === "master") {
      if (categoryGain("music") <= 0) stopMusic({ fadeMs: 120, reset: false, keepRequested: true });
      else if (musicRequested || pendingMusic) ensureMusic({ fadeMs: 120 });
    }
    if (opts.emit !== false) emitChange("setMuted");
  }

  function setEnabled(value, opts = {}) {
    state.enabled = !!value;
    state.muted.master = !state.enabled;
    safeSetLS(LS.enabled, state.enabled ? "1" : "0");
    safeSetLS(LS.muted.master, state.muted.master ? "1" : "0");
    if (categoryGain("music") <= 0) stopMusic({ fadeMs: 120, reset: false, keepRequested: true });
    else if (musicRequested || pendingMusic) ensureMusic({ fadeMs: 120 });
    if (opts.emit !== false) emitChange("setEnabled");
  }

  function getState() {
    return {
      enabled: !!state.enabled,
      vol: { ...state.vol },
      muted: { ...state.muted }
    };
  }

  function emitChange(source) {
    try {
      window.dispatchEvent(new CustomEvent("audio:changed", {
        detail: {
          __fromAudioManager: true,
          source: String(source || "audio"),
          settings: getState()
        }
      }));
    } catch {}
  }

  function preload(ids) {
    const list = Array.isArray(ids) ? ids : Object.keys(SOUND_REGISTRY);
    list.forEach((id) => { ensureElement(id); });
  }

  function vibrate(_ms) {
    return false;
  }

  function isViewerOpen(el) {
    if (!el) return false;
    if (el.hidden) return false;
    const ariaHidden = String(el.getAttribute("aria-hidden") || "").toLowerCase();
    if (ariaHidden === "true") return false;
    const styleDisplay = String(el.style?.display || "").toLowerCase();
    if (styleDisplay === "none") return false;
    if (el.classList.contains("show")) return true;
    return !el.hidden;
  }

  function maybeTrackViewer(el) {
    if (!el || !el.matches || !el.matches(VIEWER_SELECTOR)) return;
    if (!viewerState.has(el)) viewerState.set(el, isViewerOpen(el));
  }

  function maybeNotifyViewerToggle(el) {
    if (!el || !el.matches || !el.matches(VIEWER_SELECTOR)) return;
    const prev = viewerState.has(el) ? viewerState.get(el) : isViewerOpen(el);
    const next = isViewerOpen(el);
    viewerState.set(el, next);
    if (prev !== next) {
      play("ui_toggle", { cooldownMs: 160, cooldownKey: "viewer_toggle" });
    }
  }

  function bindViewerObserver() {
    if (viewerObserver || !document.body) return;
    document.querySelectorAll(VIEWER_SELECTOR).forEach((el) => viewerState.set(el, isViewerOpen(el)));
    viewerObserver = new MutationObserver((records) => {
      for (const rec of records) {
        const target = rec.target;
        if (target && target.nodeType === 1) {
          maybeTrackViewer(target);
          maybeNotifyViewerToggle(target);
          const parentViewer = target.closest ? target.closest(VIEWER_SELECTOR) : null;
          if (parentViewer) maybeNotifyViewerToggle(parentViewer);
        }
        if (rec.type === "childList") {
          rec.addedNodes.forEach((node) => {
            if (!node || node.nodeType !== 1) return;
            maybeTrackViewer(node);
            if (node.querySelectorAll) {
              node.querySelectorAll(VIEWER_SELECTOR).forEach((el) => maybeTrackViewer(el));
            }
          });
        }
      }
    });
    viewerObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "hidden", "aria-hidden", "style"]
    });
  }

  function bindUiDelegates() {
    document.addEventListener("click", (e) => {
      const target = e.target;
      if (!target || !target.closest) return;

      const explicit = target.closest("[data-sfx]");
      if (explicit) {
        if (explicit.closest("[data-no-sfx]")) return;
        const soundId = String(explicit.getAttribute("data-sfx") || "").trim();
        if (soundId) play(soundId);
        return;
      }
      if (target.closest("[data-no-tap]")) return;

      const btn = target.closest("button, [role='button'], .ui-pill, .choice, .action-send");
      if (!btn) return;
      if (btn.closest("[data-no-sfx]")) return;
      if (btn.closest("[data-no-tap]")) return;
      if (btn.closest("#phone-nav")) return;
      if (btn.disabled) return;
      play("ui_tap");
    }, true);

    document.addEventListener("input", (e) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement)) return;
      if (el.type !== "range") return;
      if (el.closest("[data-no-sfx]")) return;
      if (el.closest("[data-no-tap]")) return;
      const customId = String(el.getAttribute("data-sfx") || "").trim();
      play(customId || "ui_slider", { cooldownMs: 120, cooldownKey: "ui_slider" });
    }, true);
  }

  function bindRuntimeHooks() {
    window.addEventListener("scene:mounted", (e) => {
      ensureMusic({ fadeMs: 600 });

      if (document.body) {
        document.querySelectorAll(VIEWER_SELECTOR).forEach((el) => maybeTrackViewer(el));
      }
    });

    window.addEventListener("fx:glitch", (e) => {
      const d = e?.detail || {};
      const ms = Number(d.ms ?? d.duration ?? 420) || 420;
      const intensity = Number(d.intensity ?? 1) || 1;
      enterGlitch(ms, intensity);
    });

    window.addEventListener("hak:overlay-opened", () => {
      play("hak_boot", { cooldownMs: 420, cooldownKey: "hak_boot_event" });
    });

    window.addEventListener("cinematic:lock-changed", (e) => {
      const locked = !!(e?.detail?.locked);
      if (locked) {
        pushCinematicDuck();
      } else {
        popCinematicDuck();
      }
    });

    window.addEventListener("audio:changed", (e) => {
      const d = e?.detail || {};
      if (d.__fromAudioManager) return;
      const s = d.settings || d.audio || d;
      if (!s || typeof s !== "object") return;

      if (s.vol && typeof s.vol === "object") {
        if (s.vol.master != null) setVolume("master", s.vol.master, { emit: false });
        if (s.vol.sfx != null) setVolume("sfx", s.vol.sfx, { emit: false });
        if (s.vol.music != null) setVolume("music", s.vol.music, { emit: false });
        if (s.vol.notif != null) setVolume("notif", s.vol.notif, { emit: false });
      }
      if (s.muted && typeof s.muted === "object") {
        if (s.muted.master != null) setMuted("master", !!s.muted.master, { emit: false });
        if (s.muted.sfx != null) setMuted("sfx", !!s.muted.sfx, { emit: false });
        if (s.muted.music != null) setMuted("music", !!s.muted.music, { emit: false });
        if (s.muted.notif != null) setMuted("notif", !!s.muted.notif, { emit: false });
      }
      if (typeof s.enabled === "boolean") setEnabled(s.enabled, { emit: false });
      emitChange("external");
    });
  }

  Game.audio = {
    __audioManagerV1: true,
    registry: SOUND_REGISTRY,
    failureReasons: AUDIO_FAILURE_REASONS,
    resolveAssetUrl,
    preload,
    play,
    playMusic,
    ensureMusic,
    stopMusic,
    enterGlitch,
    exitGlitch,
    _pushCinematicDuck: pushCinematicDuck,
    _popCinematicDuck: popCinematicDuck,
    isMusicPlaying,
    setVolume,
    setMuted,
    setEnabled,
    getState,
    isUnlocked: () => unlocked,
    vibrate
  };

  bindUnlock();
  bindUiDelegates();
  bindRuntimeHooks();
  ensureMusic({ fadeMs: 600 });
  if (isCinematicLockActive()) pushCinematicDuck();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindViewerObserver, { once: true });
  } else {
    bindViewerObserver();
  }

  emitChange("init");
})();

// Testing checklist:
// 1) First click unlocks audio; music starts once and does not restart on scene change.
// 2) Back/Home navigation does not change the music or restart it.
// 3) Reload page: settings persist; music starts after first interaction.
// 4) Music volume slider affects bgm level live; mute stops music with fade.
// 5) No console errors if bgm file missing; warn once.
