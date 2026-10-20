(() => {
  if (window.__achievements_system_v1 === true) return;
  window.__achievements_system_v1 = true;

  const Game = (window.Game ||= {});
  const STORE_KEY = "achievements_v1";
  const RUN_KEY = "achievement_run_v1";
  const META_KEY = "achievement_meta_v1";
  const ONLY_PROOF_VERSION = 1;
  const PHOTO_PROOF_VERSION = 1;
  const STORY_MANIFEST_PATH = "story/story_manifest.json";
  const ONLYFUN_CREATOR_FILES = [
    "assets/onlyfun/creators/neon_rose.json",
    "assets/onlyfun/creators/velvet_sin.json",
    "assets/onlyfun/creators/static_muse.json",
    "assets/onlyfun/creators/alphamana.json"
  ];
  const HAK_DEFINITIONS = window.HakSkillDefinitions;
  const CORE_SKILLS = HAK_DEFINITIONS.all.map((definition) => definition.id);
  const CORE_SKILL_SET = new Set(CORE_SKILLS);
  const BRANCH_SKILLS = Object.fromEntries(HAK_DEFINITIONS.BRANCHES.map((branch) => [branch, new Set(HAK_DEFINITIONS.byBranch[branch].map((definition) => definition.id))]));
  function sourceText(source){
    try { return Game.i18n?.sourceText?.(source) || String(source || ""); } catch { return String(source || ""); }
  }
  function uiText(key, source, vars = null){
    let text = source;
    try { text = Game.i18n?.ui?.(key, source) || source; } catch {}
    if (vars && typeof vars === "object") {
      Object.entries(vars).forEach(([name, value]) => {
        text = String(text).split("{{" + name + "}}").join(String(value));
      });
    }
    return text;
  }
  const ACHIEVEMENTS = [
    {
      id: "all_photos",
      title: "All Photos",
      badge: "PH",
      accent: "photo",
      description: "Discover every gallery photo in the game.",
      check: (ctx) => !!createPhotoProof(Date.now(), ctx.photoTotals),
      progress: (ctx) => ctx.photoTotals.ready
        ? uiText("achievements.progress_photos", "{{done}} / {{total}} photos", { done: ctx.photoTotals.discovered, total: ctx.photoTotals.total })
        : uiText("achievements.counting_gallery_photos", "Counting gallery photos...")
    },
    {
      id: "timeline_loader",
      title: "Timeline Loader",
      badge: "TL",
      accent: "timeline",
      description: "Use Timeline -> Replay from start at least once.",
      check: (ctx) => ctx.meta.timelineReplayUsedAt > 0,
      progress: (ctx) => ctx.meta.timelineReplayUsedAt > 0 ? "Replay used" : "Waiting for Replay from start"
    },
    {
      id: "hak_unlocked",
      title: "HAK Unlocked",
      badge: "HAK",
      accent: "timeline",
      description: "Unlock the HAK app.",
      check: (ctx) => ctx.milestones.hakUnlocked
    },
    ...["love", "ntr", "nts"].map((branch) => ({
      id: `${branch}_first_points`,
      title: `First ${branch.toUpperCase()} Points`,
      badge: branch.toUpperCase(),
      accent: branch,
      description: `Earn your first ${branch.toUpperCase()} skill points.`,
      check: (ctx) => ctx.milestones.pointsEarned[branch]
    })),
    {
      id: "all_three_paths",
      title: "All Three Paths",
      badge: "3X",
      accent: "timeline",
      description: "Unlock the first skill in each HAK tree: LOVE, NTR and NTS.",
      check: (ctx) => ctx.milestones.unlockedTrees === HAK_DEFINITIONS.BRANCHES.length,
      progress: (ctx) => uiText("achievements.progress_trees", "{{done}} / {{total}} skill trees unlocked", { done: ctx.milestones.unlockedTrees, total: HAK_DEFINITIONS.BRANCHES.length })
    },
    {
      id: "onlyfun_identity",
      title: "OnlyFun Identity",
      badge: "OF",
      accent: "photo",
      description: "Choose your account name and sign in to OnlyFun after installing the app.",
      check: (ctx) => ctx.milestones.onlyfunIdentity
    },
    {
      id: "ntr_only",
      title: "NTR Only",
      badge: "NTR",
      accent: "ntr",
      description: "Unlock every NTR skill and no other branch skills in one run.",
      check: (ctx) => isBranchOnly(ctx.run.skills, "ntr"),
      progress: (ctx) => branchProgress(ctx.run.skills, "ntr")
    },
    {
      id: "nts_only",
      title: "NTS Only",
      badge: "NTS",
      accent: "nts",
      description: "Unlock every NTS skill and no other branch skills in one run.",
      check: (ctx) => isBranchOnly(ctx.run.skills, "nts"),
      progress: (ctx) => branchProgress(ctx.run.skills, "nts")
    },
    {
      id: "love_only",
      title: "LOVE Only",
      badge: "LOVE",
      accent: "love",
      description: "Unlock every LOVE skill and no other branch skills in one run.",
      check: (ctx) => isBranchOnly(ctx.run.skills, "love"),
      progress: (ctx) => branchProgress(ctx.run.skills, "love")
    }
  ];

  const ACHIEVEMENT_THEME = {
    photo:   { accent: "rgba(104,216,255,0.96)", soft: "rgba(104,216,255,0.22)", glow: "rgba(104,216,255,0.40)" },
    timeline:{ accent: "rgba(255,181,107,0.96)", soft: "rgba(255,181,107,0.20)", glow: "rgba(255,181,107,0.38)" },
    ntr:     { accent: "rgba(121,201,255,0.96)", soft: "rgba(121,201,255,0.20)", glow: "rgba(121,201,255,0.38)" },
    nts:     { accent: "rgba(255,208,122,0.96)", soft: "rgba(255,208,122,0.20)", glow: "rgba(255,208,122,0.38)" },
    love:    { accent: "rgba(255,154,132,0.96)", soft: "rgba(255,154,132,0.20)", glow: "rgba(255,154,132,0.38)" }
  };

  const STATE = {
    photoTotalsPromise: null,
    photoTotals: { ready: false, discovered: 0, total: 0 },
    bannerQueue: [],
    bannerActive: false,
    bannerHost: null,
    bannerRecentUnlocks: new Map(),
    evaluateTimer: null,
    renderTimer: null,
    bannerRetryTimer: null,
    lastTrigger: null
  };

  function safeGetLS(k){ try { return localStorage.getItem(k); } catch { return null; } }
  function safeSetLS(k,v){ try { localStorage.setItem(k, v); } catch {} }
  function safeParse(raw, fallback){ try { const v = JSON.parse(raw); return v == null ? fallback : v; } catch { return fallback; } }
  function canonicalId(raw){ return String(raw || "").trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_:-]/g, ""); }
  function canonicalSkillId(raw){
    const sid = canonicalId(raw);
    if (sid === "love_guided_response_v1") return "love_risk_warning_v1";
    if (sid === "nts_ambiguity_indicator_v1") return "nts_opportunity_indicator_v1";
    return sid;
  }
  function normalizeSkillList(list){
    const out = [];
    const seen = new Set();
    (Array.isArray(list) ? list : []).forEach((id) => {
      const sid = canonicalSkillId(id);
      if (!sid || seen.has(sid)) return;
      seen.add(sid);
      out.push(sid);
    });
    return out;
  }
  function normalizeUnlockMap(raw){
    const source = (raw && typeof raw === "object" && raw.unlocked && typeof raw.unlocked === "object") ? raw.unlocked : {};
    const unlocked = {};
    Object.keys(source).forEach((id) => {
      const sid = canonicalSkillId(id);
      const at = Math.max(0, Number(source[id]?.at || 0) || 0);
      if (sid && at > 0) unlocked[sid] = { at: Math.floor(at) };
    });
    return { unlocked };
  }
  function readSkillsStore(){
    try {
      if (typeof Game.getHakSkillsStore === "function") return normalizeUnlockMap(Game.getHakSkillsStore());
    } catch {}
    return normalizeUnlockMap(safeParse(safeGetLS("hak_skills_v1"), null));
  }
  function readAchievementStore(){
    const raw = safeParse(safeGetLS(STORE_KEY), null);
    const base = (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw : {};
    const out = {};
    const archivedOnly = (base.archivedOnly && typeof base.archivedOnly === "object" && !Array.isArray(base.archivedOnly)) ? base.archivedOnly : {};
    const archivedPhotos = (base.archivedPhotos && typeof base.archivedPhotos === "object" && !Array.isArray(base.archivedPhotos)) ? base.archivedPhotos : {};
    let migrated = false;
    const unlocked = (base.unlocked && typeof base.unlocked === "object") ? base.unlocked : {};
    Object.keys(unlocked).forEach((id) => {
      const aid = canonicalId(id);
      const at = Math.max(0, Number(unlocked[id]?.at || 0) || 0);
      if (!aid || at <= 0) return;
      // Old Only receipts could reward mixed runs; All Photos could reward an
      // incomplete gallery using an undersized pool. Neither stored evidence.
      // Keep the original receipt recoverable, but count it only after the
      // strict rule is proved. This also handles later imports of old data.
      if ((onlyBranch(aid) && !hasValidOnlyProof(aid, unlocked[id])) || (aid === "all_photos" && !hasValidPhotoProof(unlocked[id]))) {
        const archiveMap = aid === "all_photos" ? archivedPhotos : archivedOnly;
        const archive = Array.isArray(archiveMap[aid]) ? archiveMap[aid] : [];
        const receipt = unlocked[id];
        if (!archive.some((entry) => JSON.stringify(entry?.receipt) === JSON.stringify(receipt))) {
          archive.push({ version: 1, archivedAt: Date.now(), reason: aid === "all_photos" ? "gallery_discovery_proof_missing_or_invalid" : "only_run_proof_missing_or_invalid", receipt });
        }
        archiveMap[aid] = archive;
        migrated = true;
        return;
      }
      out[aid] = {
        at: Math.floor(at),
        source: String(unlocked[id]?.source || "").trim(),
        reason: String(unlocked[id]?.reason || "").trim(),
        ...(onlyBranch(aid) || aid === "all_photos" ? { proof: unlocked[id].proof } : {})
      };
    });
    const result = { unlocked: out, ...(Object.keys(archivedOnly).length ? { archivedOnly } : {}), ...(Object.keys(archivedPhotos).length ? { archivedPhotos } : {}) };
    // One atomic write retains the archive before any old badge disappears.
    // Subsequent reads are byte-stable; migration emits no unlock banner.
    if (migrated) safeSetLS(STORE_KEY, JSON.stringify(result));
    return result;
  }
  function writeAchievementStore(store){
    safeSetLS(STORE_KEY, JSON.stringify(readAchievementStoreFrom(store)));
    try { window.dispatchEvent(new CustomEvent("game:achievements-updated")); } catch {}
    return readAchievementStore();
  }
  function readAchievementStoreFrom(store){
    const base = readAchievementStore();
    const input = (store && typeof store === "object") ? store : {};
    const unlocked = (input.unlocked && typeof input.unlocked === "object") ? input.unlocked : {};
    Object.keys(unlocked).forEach((id) => {
      const aid = canonicalId(id);
      const at = Math.max(0, Number(unlocked[id]?.at || 0) || 0);
      if (!aid || at <= 0) return;
      if (onlyBranch(aid) && !hasValidOnlyProof(aid, unlocked[id])) return;
      if (aid === "all_photos" && !hasValidPhotoProof(unlocked[id])) return;
      base.unlocked[aid] = {
        at: Math.floor(at),
        source: String(unlocked[id]?.source || "").trim(),
        reason: String(unlocked[id]?.reason || "").trim(),
        ...(onlyBranch(aid) || aid === "all_photos" ? { proof: unlocked[id].proof } : {})
      };
    });
    return base;
  }
  function readRunStore(){
    const raw = safeParse(safeGetLS(RUN_KEY), null);
    const base = (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw : {};
    const resetSource = String(base.resetSource || "").trim();
    const seededAt = Math.max(0, Number(base.seededAt || 0) || 0);
    const updatedAt = Math.max(0, Number(base.updatedAt || 0) || 0);
    let startedAt = Math.max(0, Number(base.startedAt || 0) || 0);
    const skills = readSkillsStore();
    const unlocked = (skills && typeof skills.unlocked === "object" && skills.unlocked) ? skills.unlocked : {};
    let baselineSkills = Array.isArray(base.baselineSkills) ? normalizeSkillList(base.baselineSkills) : null;
    if (!startedAt) {
      const times = Object.values(skills.unlocked || {}).map((row) => Math.max(0, Number(row?.at || 0) || 0)).filter((v) => v > 0);
      startedAt = times.length ? Math.min(...times) : Date.now();
      baselineSkills = [];
      safeSetLS(RUN_KEY, JSON.stringify({
        startedAt,
        resetSource: "seed",
        seededAt: Date.now(),
        updatedAt: Date.now(),
        baselineSkills
      }));
    } else if (resetSource === "seed" && baselineSkills && baselineSkills.length) {
      baselineSkills = [];
      safeSetLS(RUN_KEY, JSON.stringify({
        startedAt,
        resetSource,
        seededAt,
        updatedAt: Date.now(),
        baselineSkills
      }));
    } else if (baselineSkills == null) {
      // Migration for legacy run store entries: snapshot baseline skills once.
      if (resetSource === "seed" || !resetSource) {
        baselineSkills = [];
      } else {
        const beforeStart = [];
        Object.keys(unlocked).forEach((id) => {
          const sid = canonicalSkillId(id);
          const at = Math.max(0, Number(unlocked[id]?.at || 0) || 0);
          if (sid && at > 0 && at < startedAt) beforeStart.push(sid);
        });
        baselineSkills = normalizeSkillList(beforeStart);
      }
      safeSetLS(RUN_KEY, JSON.stringify({
        startedAt,
        resetSource,
        seededAt,
        updatedAt: Date.now(),
        baselineSkills
      }));
    }
    return {
      startedAt,
      resetSource,
      seededAt,
      updatedAt,
      baselineSkills: normalizeSkillList(baselineSkills || [])
    };
  }
  function writeRunStore(store){
    const startedAt = Math.max(0, Number(store?.startedAt || 0) || 0) || Date.now();
    const baselineSkills = normalizeSkillList(store?.baselineSkills);
    const payload = {
      startedAt,
      resetSource: String(store?.resetSource || "").trim(),
      seededAt: Math.max(0, Number(store?.seededAt || Date.now()) || Date.now()),
      updatedAt: Date.now(),
      baselineSkills
    };
    safeSetLS(RUN_KEY, JSON.stringify(payload));
    return payload;
  }
  function resetRunStore(reason){
    const skills = readSkillsStore();
    return writeRunStore({
      startedAt: Date.now(),
      resetSource: String(reason || "run_reset").trim() || "run_reset",
      seededAt: Date.now(),
      baselineSkills: Object.keys(skills.unlocked || {})
    });
  }
  function readMetaStore(){
    const raw = safeParse(safeGetLS(META_KEY), null);
    const base = (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw : {};
    return {
      timelineReplayUsedAt: Math.max(0, Number(base.timelineReplayUsedAt || 0) || 0),
      lastTimelineReplay: String(base.lastTimelineReplay || "").trim(),
      updatedAt: Math.max(0, Number(base.updatedAt || 0) || 0)
    };
  }
  function writeMetaStore(patch){
    const next = readMetaStore();
    const input = (patch && typeof patch === "object") ? patch : {};
    if (input.timelineReplayUsedAt != null) next.timelineReplayUsedAt = Math.max(0, Number(input.timelineReplayUsedAt || 0) || 0);
    if (input.lastTimelineReplay != null) next.lastTimelineReplay = String(input.lastTimelineReplay || "").trim();
    next.updatedAt = Date.now();
    safeSetLS(META_KEY, JSON.stringify(next));
    return next;
  }

  function normalizePhotoUrl(raw){
    return String(raw || "").trim().toLowerCase().replace(/\\/g, "/").split("#")[0].split("?")[0];
  }
  function isExcludedPhotoUrl(raw){
    const url = normalizePhotoUrl(raw);
    if (!url) return true;
    const normalized = "/" + url.replace(/^\/+/, "");
    return normalized.endsWith("/assets/avatars/default.jpg") || normalized.includes("/pictures/onlyfun/avatars/") || normalized.includes("/onlyfun/avatars/");
  }
  function readGalleryPhotos(){
    const out = [];
    const seen = new Set();
    [safeParse(safeGetLS("gallery_photos"), []), safeParse(safeGetLS("savedPhotos"), [])].forEach((list) => {
      (Array.isArray(list) ? list : []).forEach((row) => {
        if (!row || typeof row !== "object") return;
        const url = String(row.url || row.src || row.photo || "").trim();
        if (!url || isExcludedPhotoUrl(url)) return;
        const key = normalizePhotoUrl(url);
        if (!key || seen.has(key)) return;
        seen.add(key);
        out.push(row);
      });
    });
    return out;
  }

  function normalizeStoryPath(raw){
    const path = String(raw || "").trim().replace(/\\/g, "/").replace(/^\.\//, "");
    if (!path || /^https?:\/\//i.test(path)) return "";
    if (path.startsWith("story/")) return path;
    if (path.endsWith(".json")) return `story/${path.replace(/^\/+/, "")}`;
    return "";
  }
  function collectStoryPhotoUrls(step, urls){
    if (!step || typeof step !== "object") return;
    const type = String(step.type || "").trim().toLowerCase();
    const add = (raw) => {
      const url = String(raw || "").trim();
      if (url && !isExcludedPhotoUrl(url)) urls.add(url);
    };
    if (type === "if") {
      collectStoryPhotos(step.then, urls);
      collectStoryPhotos(step.else, urls);
      return;
    }
    if (type === "image" || type === "photo") add(step.image || step.src || step.url || "");
    if (type === "instagram_post" || type === "snapgram_post" || type === "story" || type === "instagram_story") add(step.image || step.photo || step.url || "");
    if (type === "gallery_add") add((step.photo && step.photo.url) || step.url || step.src || "");
    if (type === "onlyfun_post") {
      add(step.image || step.url || step.photo || step.src || "");
      const variant = (step.imageVariant && typeof step.imageVariant === "object") ? step.imageVariant : (step.imageFromChoice && typeof step.imageFromChoice === "object" ? step.imageFromChoice : null);
      if (variant) {
        add(variant.fallback || variant.default || "");
        const mapObj = (variant.map && typeof variant.map === "object") ? variant.map : (variant.images && typeof variant.images === "object" ? variant.images : null);
        if (mapObj) Object.values(mapObj).forEach((value) => add(value));
      }
    }
    collectStoryPhotos(step.then, urls);
    collectStoryPhotos(step.else, urls);
    collectStoryPhotos(step.steps, urls);
  }
  function collectStoryPhotos(steps, urls){
    (Array.isArray(steps) ? steps : []).forEach((step) => collectStoryPhotoUrls(step, urls));
  }
  async function loadStoryManifestPaths(){
    try {
      if (window.ConvoRuntime && typeof window.ConvoRuntime.loadStoryManifest === "function") {
        const manifest = await window.ConvoRuntime.loadStoryManifest();
        const entries = Array.isArray(manifest?.sortedEntries) ? manifest.sortedEntries : (Array.isArray(manifest?.entries) ? manifest.entries : []);
        return entries.map((entry) => normalizeStoryPath(entry?.path || "")).filter(Boolean);
      }
    } catch {}
    try {
      const res = await fetch(STORY_MANIFEST_PATH, { cache: "no-store" });
      if (!res.ok) return [];
      const raw = await res.json();
      const entries = Array.isArray(raw) ? raw : (Array.isArray(raw?.sortedEntries) ? raw.sortedEntries : (Array.isArray(raw?.entries) ? raw.entries : []));
      return entries.map((entry) => normalizeStoryPath(entry?.path || entry || "")).filter(Boolean);
    } catch {
      return [];
    }
  }
  async function loadJsonFile(path){
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }
  async function computeGalleryTotals(){
    try {
      const canonical = await window.GalleryStore?.getCanonicalEligibility?.();
      if (canonical) return { total: canonical.total, canonical };
    } catch {}
    const urls = new Set();
    const paths = await loadStoryManifestPaths();
    for (const path of paths) {
      const json = await loadJsonFile(path);
      if (json && typeof json === "object") collectStoryPhotos(json.steps, urls);
    }
    for (const path of ONLYFUN_CREATOR_FILES) {
      const json = await loadJsonFile(path);
      const posts = Array.isArray(json?.seedPosts) ? json.seedPosts : (Array.isArray(json?.posts) ? json.posts : []);
      posts.forEach((post) => {
        if (!post || typeof post !== "object") return;
        const url = String(post.image || post.url || post.photo || "").trim();
        if (url && !isExcludedPhotoUrl(url)) urls.add(url);
      });
    }
    return { total: urls.size };
  }
  async function ensurePhotoTotals(){
    let discoveredNow = readGalleryPhotos().length;
    try {
      const shared = await window.GalleryStore?.canonicalProgress?.(readGalleryPhotos());
      if (shared) {
        STATE.photoTotals = { ready: true, discovered: shared.discovered, total: shared.total,
          eligibleIds: shared.eligibleIds, discoveredIds: shared.discoveredIds };
        return STATE.photoTotals;
      }
    } catch {}
    if (STATE.photoTotals.ready) {
      STATE.photoTotals.discovered = discoveredNow;
      return STATE.photoTotals;
    }
    if (!STATE.photoTotalsPromise) STATE.photoTotalsPromise = computeGalleryTotals();
    try {
      const totals = await STATE.photoTotalsPromise;
      STATE.photoTotals = { ready: true, discovered: discoveredNow, total: Math.max(0, Number(totals?.total || 0) || 0) };
    } catch {
      STATE.photoTotals = { ready: true, discovered: discoveredNow, total: 0 };
    }
    return STATE.photoTotals;
  }

  window.addEventListener("gallery:canonical-eligibility-changed", () => {
    STATE.photoTotalsPromise = null;
    STATE.photoTotals = { ready: false, discovered: 0, total: 0 };
    try { scheduleEvaluate?.("gallery_canonical_eligibility_changed"); } catch {}
  });

  function getCurrentRunSkills(){
    const run = readRunStore();
    const skills = readSkillsStore();
    const baseline = new Set(normalizeSkillList(run.baselineSkills));
    const out = new Set();
    Object.keys(skills.unlocked || {}).forEach((id) => {
      const sid = canonicalSkillId(id);
      const at = Math.max(0, Number(skills.unlocked[id]?.at || 0) || 0);
      if (!sid || !CORE_SKILL_SET.has(sid) || baseline.has(sid)) return;
      if (at >= run.startedAt) out.add(sid);
    });
    return out;
  }
  function isBranchOnly(skillSet, branch){
    const allowed = BRANCH_SKILLS[branch];
    if (!allowed) return false;
    const unique = new Set(
      Array.from(skillSet || new Set())
        .map((id) => canonicalSkillId(id))
        .filter(Boolean)
    );
    return Array.from(allowed).every((id) => unique.has(id)) &&
      Array.from(unique).every((id) => allowed.has(id));
  }
  function onlyBranch(id){
    return HAK_DEFINITIONS.BRANCHES.find((branch) => id === `${branch}_only`) || "";
  }
  function validPhotoIds(ids, total){
    return Array.isArray(ids) && Number.isInteger(total) && total > 0 && ids.length === total &&
      ids.every((id) => typeof id === "string" && id.trim().length > 0) && new Set(ids).size === total;
  }
  function hasValidPhotoProof(receipt){
    const proof = receipt?.proof;
    if (!proof || proof.version !== PHOTO_PROOF_VERSION || proof.verifiedAt !== Number(receipt.at) || !Number.isFinite(proof.verifiedAt) || proof.verifiedAt <= 0) return false;
    if (!validPhotoIds(proof.eligibleIds, proof.total) || !validPhotoIds(proof.earnedIds, proof.total)) return false;
    const earned = new Set(proof.earnedIds);
    if (!proof.eligibleIds.every((id) => earned.has(id))) return false;
    // A rewind preserves a genuinely earned reward. Added game content must
    // be discovered too; an old, smaller pool cannot certify the current pool.
    const current = STATE.photoTotals;
    return !current.ready || !Array.isArray(current.eligibleIds) || current.eligibleIds.every((id) => earned.has(id));
  }
  function createPhotoProof(at, totals = STATE.photoTotals){
    if (!totals.ready || totals.discovered !== totals.total || !validPhotoIds(totals.eligibleIds, totals.total) || !validPhotoIds(totals.discoveredIds, totals.total)) return null;
    const proof = { version: PHOTO_PROOF_VERSION, verifiedAt: at, total: totals.total,
      eligibleIds: totals.eligibleIds.slice().sort(), earnedIds: totals.discoveredIds.slice().sort() };
    return hasValidPhotoProof({ at, proof }) ? proof : null;
  }
  function hasValidOnlyProof(id, receipt){
    const branch = onlyBranch(id), proof = receipt?.proof;
    if (!branch || !proof || proof.version !== ONLY_PROOF_VERSION || proof.branch !== branch) return false;
    if (!Number.isFinite(proof.runStartedAt) || proof.runStartedAt <= 0 || !Number.isFinite(proof.verifiedAt) || proof.verifiedAt < proof.runStartedAt || proof.verifiedAt !== Number(receipt.at)) return false;
    if (!Array.isArray(proof.skills) || proof.skills.length !== BRANCH_SKILLS[branch].size) return false;
    if (!proof.skills.every((skill) => Number.isFinite(skill?.at) && skill.at >= proof.runStartedAt && skill.at <= proof.verifiedAt)) return false;
    return isBranchOnly(new Set(proof.skills.map((skill) => skill.id)), branch);
  }
  function createOnlyProof(id, at){
    const branch = onlyBranch(id);
    const run = readRunStore(), skills = getCurrentRunSkills();
    if (!isBranchOnly(skills, branch)) return null;
    const owned = readSkillsStore().unlocked;
    const proof = {
      version: ONLY_PROOF_VERSION,
      branch,
      runStartedAt: run.startedAt,
      verifiedAt: at,
      skills: Array.from(skills).sort().map((skillId) => ({ id: skillId, at: owned[skillId].at }))
    };
    return hasValidOnlyProof(id, { at, proof }) ? proof : null;
  }
  function branchProgress(skillSet, branch){
    const allowed = BRANCH_SKILLS[branch];
    const list = Array.from(skillSet || new Set()).map((id) => canonicalSkillId(id)).filter(Boolean);
    if (list.some((id) => !allowed.has(id))) return uiText("achievements.branch_run_mixed", "Unavailable this run: skills from another branch unlocked.");
    if (!list.length) return uiText("achievements.waiting_branch_skill", "Waiting for the first {{branch}} skill", { branch: branch.toUpperCase() });
    const branchCount = list.filter((id) => allowed.has(id)).length;
    return uiText("achievements.current_branch_run", "Current run: {{branch}} {{done}} / {{total}}", { branch: branch.toUpperCase(), done: branchCount, total: allowed.size });
  }
  function readMilestones(){
    let state = null;
    try { state = window.GameStateEngine?.getState?.() || null; } catch {}
    const hak = state?.hak;
    const skills = hak ? normalizeUnlockMap(hak.skills) : readSkillsStore();
    const points = hak?.routePoints || safeParse(safeGetLS("route_points_v1"), {});
    const pointsEarned = {};
    let unlockedTrees = 0;
    for (const branch of HAK_DEFINITIONS.BRANCHES) {
      const definitions = HAK_DEFINITIONS.byBranch[branch];
      const starter = definitions.find((skill) => !skill.requires?.length);
      if (starter && skills.unlocked[starter.id]) unlockedTrees++;
      // Existing saves may have already spent their first points on a skill.
      pointsEarned[branch] = Number(points?.[branch]) > 0 || definitions.some((skill) => !!skills.unlocked[skill.id]);
    }
    let nametag = "";
    if (typeof window.PlayerIdentity?.getStoredNametag === "function") {
      try { nametag = String(window.PlayerIdentity.getStoredNametag() || "").trim(); } catch {}
    } else {
      const profile = safeParse(safeGetLS("player_social_nametag_v1"), {});
      if (profile?.version === 1 && typeof profile.nametag === "string") nametag = profile.nametag.trim();
    }
    const onlyfun = state?.onlyfun;
    const onlyfunUnlocked = onlyfun ? onlyfun.unlocked === true : safeGetLS("feature_onlyfun_unlocked") === "1";
    const onlyfunSignedIn = onlyfun ? onlyfun.signedIn === true : safeGetLS("onlyfun_signed_in") === "1";
    return {
      hakUnlocked: hak ? hak.unlocked === true : safeGetLS("feature_hak_unlocked") === "1",
      pointsEarned,
      unlockedTrees,
      onlyfunIdentity: onlyfunUnlocked && onlyfunSignedIn && !!nametag
    };
  }
  function buildContext(){
    const meta = readMetaStore();
    const run = readRunStore();
    const skills = getCurrentRunSkills();
    return {
      meta,
      run: { ...run, skills },
      milestones: readMilestones(),
      photoTotals: STATE.photoTotals
    };
  }
  function buildRow(def, ctx, store){
    const unlocked = !!store.unlocked[def.id];
    const at = unlocked ? Math.max(0, Number(store.unlocked[def.id]?.at || 0) || 0) : 0;
    return {
      ...def,
      title: sourceText(def.title),
      description: sourceText(def.description),
      unlocked,
      unlockedAt: at,
      progressText: typeof def.progress === "function" ? String(def.progress(ctx) || "").trim() : "",
      earnedText: at ? new Date(at).toLocaleString([], { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""
    };
  }
  function escapeHtml(text){
    return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function getViewModel(){
    const store = readAchievementStore();
    const ctx = buildContext();
    const rows = ACHIEVEMENTS.map((def) => buildRow(def, ctx, store));
    const unlockedRows = rows.filter((row) => row.unlocked).sort((a, b) => b.unlockedAt - a.unlockedAt);
    const lockedRows = rows.filter((row) => !row.unlocked);
    return {
      total: rows.length,
      unlockedCount: unlockedRows.length,
      lockedCount: lockedRows.length,
      gallery: { discovered: ctx.photoTotals.discovered, total: ctx.photoTotals.ready ? ctx.photoTotals.total : null, ready: ctx.photoTotals.ready },
      unlockedRows,
      lockedRows
    };
  }
  function renderScene(view){
    const root = document.querySelector(".achievements[data-scene='achievements']");
    if (!root || !view) return false;
    const unlockedCount = root.querySelector("[data-achievements-unlocked-count]");
    const totalCount = root.querySelector("[data-achievements-total-count]");
    const lockedCount = root.querySelector("[data-achievements-locked-count]");
    const photoProgress = root.querySelector("[data-achievements-photo-progress]");
    const unlockedGrid = root.querySelector("[data-achievements-unlocked-grid]");
    const lockedGrid = root.querySelector("[data-achievements-locked-grid]");
    const unlockedEmpty = root.querySelector("[data-achievements-unlocked-empty]");
    const lockedEmpty = root.querySelector("[data-achievements-locked-empty]");
    if (!unlockedCount || !totalCount || !lockedCount || !photoProgress || !unlockedGrid || !lockedGrid) return false;
    unlockedCount.textContent = String(view.unlockedCount);
    totalCount.textContent = String(view.total);
    lockedCount.textContent = String(view.lockedCount);
    photoProgress.textContent = uiText("achievements.progress_photos", "{{done}} / {{total}} photos", { done: view.gallery.discovered, total: view.gallery.total == null ? "..." : view.gallery.total });
    unlockedGrid.innerHTML = "";
    lockedGrid.innerHTML = "";
    if (unlockedEmpty) {
      unlockedEmpty.hidden = !!view.unlockedRows.length;
      unlockedEmpty.textContent = view.unlockedRows.length ? "" : uiText("achievements.no_unlocked", "No achievements unlocked yet.");
    }
    if (lockedEmpty) {
      lockedEmpty.hidden = !!view.lockedRows.length;
      lockedEmpty.textContent = view.lockedRows.length ? "" : uiText("achievements.nothing_left", "Nothing left to unlock.");
    }
    const makeCard = (row) => {
      const card = document.createElement("article");
      card.className = `achievement-card is-${row.unlocked ? "unlocked" : "locked"} theme-${row.accent}`;
      card.dataset.achievementId = row.id;
      card.dataset.state = row.unlocked ? "unlocked" : "locked";
      card.innerHTML = `
        <div class="achievement-badge">${escapeHtml(row.badge)}</div>
        <div class="achievement-copy">
          <div class="achievement-top">
            <div class="achievement-title">${escapeHtml(row.title)}</div>
            <div class="achievement-state">${escapeHtml(row.unlocked ? uiText("common.unlocked", "Unlocked") : uiText("common.locked", "Locked"))}</div>
          </div>
          <div class="achievement-desc">${escapeHtml(row.description)}</div>
          <div class="achievement-progress">${escapeHtml(row.progressText || (row.unlocked ? uiText("common.unlocked", "Unlocked") : uiText("common.locked", "Locked")))}</div>
          ${row.unlocked && row.earnedText ? `<div class="achievement-earned">${escapeHtml(uiText("achievements.earned", "Earned {{text}}", { text: row.earnedText }))}</div>` : ""}
        </div>
      `;
      return card;
    };
    view.unlockedRows.forEach((row) => unlockedGrid.appendChild(makeCard(row)));
    view.lockedRows.forEach((row) => lockedGrid.appendChild(makeCard(row)));
    return true;
  }
  async function refreshScene(){
    if (String(Game.currentScene || "").toLowerCase() !== "achievements") return;
    renderScene(getViewModel());
  }
  function canShowBannerNow(){
    if (!document.body) return false;
    if (Game._hakOverlayOpen) return false;
    if (Game._cinematicLock === true) return false;
    if (typeof Game.isCinematicLocked === "function") {
      try { if (Game.isCinematicLocked() === true) return false; } catch {}
    }
    return true;
  }
  function ensureBannerHost(){
    if (STATE.bannerHost && STATE.bannerHost.isConnected) return STATE.bannerHost;
    STATE.bannerHost = document.getElementById("achievement-host");
    return STATE.bannerHost;
  }
  function applyBannerTheme(card, accent) {
    const theme = ACHIEVEMENT_THEME[accent] || ACHIEVEMENT_THEME.skill;
    card.style.setProperty("--achievement-accent", theme.accent);
    card.style.setProperty("--achievement-soft", theme.soft);
    card.style.setProperty("--achievement-glow", theme.glow);
    return theme;
  }
  function processBannerQueue(){
    if (STATE.bannerActive || !STATE.bannerQueue.length) return;
    if (!canShowBannerNow()) {
      clearTimeout(STATE.bannerRetryTimer);
      STATE.bannerRetryTimer = setTimeout(processBannerQueue, 300);
      return;
    }
    const host = ensureBannerHost();
    if (!host) return;
    const next = STATE.bannerQueue.shift();
    if (!next) return;
    STATE.bannerActive = true;
    const card = document.createElement("div");
    card.className = `achievement-banner theme-${next.accent}`;
    card.setAttribute("role", "status");
    card.setAttribute("aria-live", "polite");
    applyBannerTheme(card, next.accent);
    card.innerHTML = `
      <div class="achievement-banner-ribbon"></div>
      <div class="achievement-banner-badge">${escapeHtml(next.badge)}</div>
      <div class="achievement-banner-copy">
        <div class="achievement-banner-topline">
          <div class="achievement-banner-kicker">${escapeHtml(uiText("achievements.unlocked_banner", "Achievement unlocked"))}</div>
          <div class="achievement-banner-state">${escapeHtml(uiText("common.unlocked", "Unlocked"))}</div>
        </div>
        <div class="achievement-banner-title">${escapeHtml(next.title)}</div>
        <div class="achievement-banner-desc">${escapeHtml(next.description)}</div>
        <div class="achievement-banner-foot">
          <div class="achievement-banner-chip">${escapeHtml(uiText("achievements.reward_saved", "Reward saved to your profile"))}</div>
        </div>
      </div>
    `;
    host.appendChild(card);
    requestAnimationFrame(() => card.classList.add("show"));
    try { Game.audio?.play?.("skill_unlock", { category: "sfx", cooldownKey: "achievement_unlock" }); } catch {}
    setTimeout(() => {
      card.classList.remove("show");
      setTimeout(() => {
        card.remove();
        STATE.bannerActive = false;
        processBannerQueue();
      }, 220);
    }, Math.max(2800, Number(next.holdMs || 0) || 0));
  }
  function queueBanner(def, holdMs = 0){
    const now = Date.now();
    const lastAt = STATE.bannerRecentUnlocks.get(def.id) || 0;
    if (now - lastAt < 1000) return;
    STATE.bannerRecentUnlocks.set(def.id, now);
    if (STATE.bannerRecentUnlocks.size > 40) {
      for (const [id, at] of STATE.bannerRecentUnlocks) {
        if (now - at > 30000) STATE.bannerRecentUnlocks.delete(id);
      }
    }
    STATE.bannerQueue.push({ id: def.id, title: sourceText(def.title), description: sourceText(def.description), badge: def.badge, accent: def.accent, holdMs });
    processBannerQueue();
  }
  function unlockAchievement(id, info = {}){
    const aid = canonicalId(id);
    const def = ACHIEVEMENTS.find((row) => row.id === aid);
    if (!aid || !def) return false;
    const store = readAchievementStore();
    if (store.unlocked[aid]) return false;
    const at = Date.now();
    const proof = onlyBranch(aid) ? createOnlyProof(aid, at) : aid === "all_photos" ? createPhotoProof(at) : null;
    if ((onlyBranch(aid) || aid === "all_photos") && !proof) return false;
    store.unlocked[aid] = { at, source: String(info.source || "").trim(), reason: String(info.reason || "").trim(), ...(proof ? { proof } : {}) };
    writeAchievementStore(store);
    queueBanner(def, Number(info.holdMs || 0) || 0);
    return true;
  }
  async function evaluateAchievements(trigger = {}){
    STATE.lastTrigger = trigger && typeof trigger === "object" ? { ...trigger } : null;
    await ensurePhotoTotals();
    const ctx = buildContext();
    const store = readAchievementStore();
    let changed = false;
    for (const def of ACHIEVEMENTS) {
      if (store.unlocked[def.id]) continue;
      let ok = false;
      try { ok = !!def.check(ctx); } catch {}
      if (ok && unlockAchievement(def.id, { source: String(trigger?.source || "evaluate").trim(), reason: String(trigger?.reason || "").trim() })) changed = true;
    }
    await refreshScene();
    return changed;
  }
  function scheduleEvaluate(trigger = {}){
    STATE.lastTrigger = trigger && typeof trigger === "object" ? { ...trigger } : null;
    clearTimeout(STATE.evaluateTimer);
    STATE.evaluateTimer = setTimeout(() => {
      evaluateAchievements(trigger).catch((err) => {
        try { console.warn("[Achievements] evaluate failed", err); } catch {}
      });
    }, 40);
  }
  function scheduleRender(){
    clearTimeout(STATE.renderTimer);
    STATE.renderTimer = setTimeout(() => refreshScene().catch(() => {}), 24);
  }
  function handleTimelineReplayUsed(detail = {}){
    writeMetaStore({
      timelineReplayUsedAt: Date.now(),
      lastTimelineReplay: String(detail?.storyPath || detail?.nodeId || detail?.source || "timeline_replay").trim() || "timeline_replay"
    });
    scheduleEvaluate({ source: "timeline_replay", reason: "timeline_replay" });
  }
  function openAchievementsScene(){
    if (typeof window.navigateToScene === "function") {
      window.navigateToScene("achievements");
      return true;
    }
    return false;
  }
  function initPublicApi(){
    Game.Achievements = Game.Achievements || {};
    Game.Achievements.getStore = () => readAchievementStore();
    Game.Achievements.getRunStore = () => readRunStore();
    Game.Achievements.getMetaStore = () => readMetaStore();
    Game.Achievements.getDefs = () => ACHIEVEMENTS.slice();
    Game.Achievements.getViewModel = () => getViewModel();
    Game.Achievements.evaluate = (trigger = {}) => evaluateAchievements(trigger);
    Game.Achievements.unlock = (id, info = {}) => unlockAchievement(id, info);
    Game.Achievements.noteTimelineReplayUsed = (detail = {}) => handleTimelineReplayUsed(detail);
    Game.Achievements.resetRun = (reason = "") => resetRunStore(reason);
    Game.Achievements.open = () => openAchievementsScene();
    Game.Achievements.refreshScene = () => refreshScene();
    Game.getAchievementsState = () => readAchievementStore();
    Game.getAchievementsRunState = () => readRunStore();
    Game.getAchievementsMetaState = () => readMetaStore();
    Game.hasAchievement = (id) => !!readAchievementStore().unlocked[canonicalId(id)];
    Game.unlockAchievement = (id, info = {}) => unlockAchievement(id, info);
    Game.evaluateAchievements = (trigger = {}) => evaluateAchievements(trigger);
    Game.openAchievements = () => openAchievementsScene();
  }
  function bindEvents(){
    window.GameStateEngine?.subscribe?.((events) => {
      let relevant = false;
      for (const event of events || []) {
        if (event?.type === "hak:progress-added" && event.reused !== true && Number(event.amount) > 0 && Number(event.balance) > 0 && HAK_DEFINITIONS.BRANCHES.includes(event.branch)) {
          // Commit before a subsequent spend can consume the balance, or a
          // debounced evaluation can be replaced by another branch's event.
          unlockAchievement(`${event.branch}_first_points`, { source: "hak_progress", reason: "first_points" });
        }
        if (["hak:unlocked", "hak:progress-added", "hak:skill-unlocked", "onlyfun:unlocked", "onlyfun:account-unlocked", "onlyfun:sign-in-changed", "save:restored", "save:resumed", "initialization:committed"].includes(event?.type)) relevant = true;
      }
      if (relevant) scheduleEvaluate({ source: "canonical_milestone" });
    });
    window.addEventListener("scene:mounted", (ev) => {
      const name = String(ev?.detail?.name || ev?.detail?.id || ev?.detail?.scene || "").toLowerCase();
      if (name === "achievements") {
        scheduleRender();
        scheduleEvaluate({ source: "scene_mounted", scene: "achievements" });
        return;
      }
      if (name) scheduleEvaluate({ source: "scene_mounted", scene: name });
    });
    window.addEventListener("game:saves-updated", () => scheduleEvaluate({ source: "saves_updated" }));
    window.addEventListener("game:story-replays-updated", () => scheduleEvaluate({ source: "story_replays_updated" }));
    window.addEventListener("hak:skillsChanged", () => scheduleEvaluate({ source: "skills_changed" }));
    window.addEventListener("hak:skill-unlocked", () => scheduleEvaluate({ source: "skill_unlocked" }));
    window.addEventListener("route:points-changed", () => scheduleEvaluate({ source: "route_points_changed" }));
    window.addEventListener("social-identity:changed", () => scheduleEvaluate({ source: "social_identity_changed" }));
    window.addEventListener("gallery:add", () => scheduleEvaluate({ source: "gallery_add" }));
    window.addEventListener("achievement:timeline-replay-used", (ev) => handleTimelineReplayUsed(ev?.detail || {}));
    window.addEventListener("game:story-restarted", (ev) => {
      resetRunStore(String(ev?.detail?.source || "story_restart").trim() || "story_restart");
      scheduleEvaluate({ source: "story_restarted" });
    });
    window.addEventListener("game:achievements-updated", () => scheduleRender());
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) scheduleEvaluate({ source: "visibilitychange" });
    });
  }
  function bootstrap(){
    initPublicApi();
    bindEvents();
    readRunStore();
    ensurePhotoTotals().then(() => scheduleEvaluate({ source: "boot" })).catch(() => scheduleEvaluate({ source: "boot" }));
    setTimeout(() => scheduleEvaluate({ source: "boot_late" }), 300);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
