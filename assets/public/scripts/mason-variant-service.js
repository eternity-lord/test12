(function installMasonVariantService(root) {
  "use strict";

  const LEGACY_KEY = "character_variant_mason";
  const VALID = new Set(["male", "female"]);
  const MEDIA_VARIANT = Object.freeze({
    MALE_ONLY: "MALE_ONLY",
    FEMALE_ONLY: "FEMALE_ONLY",
    NOT_MASON_VARIANT: "NOT_MASON_VARIANT",
    INVALID_CONFLICT: "INVALID_CONFLICT"
  });

  // Paths whose earned-variant identity is NOT expressed via the standard
  // mason_male/male_mason/mason_female/female_mason marker convention --
  // e.g. Snapgram's own "mason_fitness_first_post.jpg" (male) /
  // "mason_fitness_first_female_post.jpg" (female) pair, where "_female"
  // is inserted mid-filename rather than as a mason_/_mason marker.
  // Live-found 2026-09-06 (tester report: Mason's Day5 Snapgram fitness
  // post still counts under "Mason Male" for a Female-variant player):
  // this exact pair is already special-cased in resolveImageForVariant()
  // below for DISPLAY resolution, but classifyMediaVariant() (the
  // separate function scenes/pictures.html's own Gallery filter actually
  // calls to bucket an already-earned/stored media row) had no matching
  // entry, so a stored row using either filename fell through to
  // NOT_MASON_VARIANT -- the "genuinely shared, belongs in both filters"
  // bucket -- instead of its own real, single, correct variant.
  const VARIANT_SUFFIX_PAIRS = [
    { male: /(?:^|\/)mason_fitness_first_post\.jpg(?:[?#].*)?$/i, female: /(?:^|\/)mason_fitness_first_female_post\.jpg(?:[?#].*)?$/i }
  ];

  function classifyMediaVariant(rawPath) {
    let value = String(rawPath || "").trim().replace(/\\/g, "/").toLowerCase();
    try { value = decodeURIComponent(value); } catch {}
    const male = /(?:^|[^a-z0-9])(?:mason_male|male_mason)(?:[^a-z0-9]|$)/.test(value);
    const female = /(?:^|[^a-z0-9])(?:mason_female|female_mason)(?:[^a-z0-9]|$)/.test(value);
    if (male && female) return MEDIA_VARIANT.INVALID_CONFLICT;
    if (male) return MEDIA_VARIANT.MALE_ONLY;
    if (female) return MEDIA_VARIANT.FEMALE_ONLY;
    for (const pair of VARIANT_SUFFIX_PAIRS) {
      const isMale = pair.male.test(value);
      const isFemale = pair.female.test(value);
      if (isMale && isFemale) return MEDIA_VARIANT.INVALID_CONFLICT;
      if (isMale) return MEDIA_VARIANT.MALE_ONLY;
      if (isFemale) return MEDIA_VARIANT.FEMALE_ONLY;
    }
    return MEDIA_VARIANT.NOT_MASON_VARIANT;
  }

  function normalize(value) {
    const variant = String(value || "").trim().toLowerCase();
    return VALID.has(variant) ? variant : "";
  }

  function canonicalVariant() {
    try {
      const authority = root.GameStateEngine?.getMasonVariantAuthority?.();
      if (authority) {
        const variant = normalize(authority.variant);
        if (variant && authority.narrativeStarted) return variant;
        return normalize(root.localStorage?.getItem?.(LEGACY_KEY));
      }
      const state = root.GameStateEngine?.getState?.();
      const variant = normalize(state?.world?.masonVariant);
      const initialization = state?.initialization;
      const narrativeStarted = initialization?.status === "READY" || initialization?.status === "READY_WITH_ACTIVE_STORY" ||
        !!initialization?.launchReceipt || !!state?.execution?.activeStoryId ||
        (Array.isArray(state?.progression?.completedStoryIds) && state.progression.completedStoryIds.length > 0) ||
        Object.keys(state?.progression?.choiceReceipts || {}).length > 0 ||
        Object.keys(state?.progression?.branchReceipts || {}).length > 0 ||
        Object.keys(state?.gallery?.owned || {}).length > 0;
      if (variant && narrativeStarted) return variant;
    } catch {}
    try { return normalize(root.localStorage?.getItem?.(LEGACY_KEY)); } catch {}
    return "";
  }

  function mirrorCanonicalVariant() {
    const variant = canonicalVariant();
    try {
      if (variant && root.localStorage?.getItem?.(LEGACY_KEY) !== variant) root.localStorage?.setItem?.(LEGACY_KEY, variant);
      if (!variant) root.localStorage?.removeItem?.(LEGACY_KEY);
    } catch {}
    return variant;
  }

  function setVariant(rawVariant, options = {}) {
    const variant = normalize(rawVariant);
    if (!variant) return "";
    const engine = root.GameStateEngine;
    const state = engine?.getState?.();
    if (state?.world && state.world.masonVariant !== variant && typeof engine?.dispatch === "function") {
      const result = engine.dispatch({
        type: "SET_MASON_VARIANT",
        commandId: String(options.commandId || `mason-variant:${variant}:${Number(state.revision || 0) + 1}`),
        expectedRevision: state.revision,
        payload: { variant, source: String(options.source || "variant_service") }
      });
      if (!result?.ok && result?.status !== "DUPLICATE_COMMAND") return "";
    }
    try { root.localStorage?.setItem?.(LEGACY_KEY, variant); } catch {}
    return variant;
  }

  function resolveImageForVariant(rawPath, rawOwnerId, rawVariant) {
    const path = String(rawPath || "").trim();
    if (!path) return "";
    const ownerId = String(rawOwnerId || "").trim().toLowerCase();
    const normalizedPath = path.replace(/\\/g, "/");
    const masonPath = /\/Conversation\/(?:male_mason|female_mason|mason)\//i.test(normalizedPath) ||
      /\/Conversation\/mason_[^/]+$/i.test(normalizedPath) ||
      /\/Conversation\/hailey_(?:male_mason|mason_female)_arrived\.jpg(?:[?#].*)?$/i.test(normalizedPath) ||
      /\/evidence\/(?:mason_male|mason_female)\//i.test(normalizedPath) ||
      /\/Snapgram\/mason_fitness_first(?:_female)?_post\.jpg(?:[?#].*)?$/i.test(normalizedPath);
    // Gallery ownership and depicted-character variant are independent.
    // A Hailey/Lena/etc. slot can still contain Mason, so a recognized
    // variantable Mason path must resolve regardless of the owning category.
    if (!masonPath && ownerId !== "mason") return path;
    // This file depicts the player and is intentionally shared; its historical
    // male_mason folder is not Mason ownership and must not be relabelled.
    if (/\/player_dick\.jpg(?:[?#].*)?$/i.test(normalizedPath)) return path;
    // Legacy/fresh states can legitimately predate an explicit chooser receipt.
    // Their established compatibility contract is Male; never manufacture the
    // invalid `_mason` / `mason_` paths that an empty variant used to produce.
    const variant = normalize(rawVariant) || canonicalVariant() || "male";
    const projected = normalizedPath
      .replace(/\/Conversation\/(?:male_mason|female_mason)\//i, `/Conversation/${variant}_mason/`)
      .replace(/\/Conversation\/mason\//i, `/Conversation/${variant}_mason/`)
      .replace(/\/Conversation\/(mason_[^/]+)$/i, `/Conversation/${variant}_mason/$1`)
      .replace(/\/evidence\/(?:mason_male|mason_female)\//i, `/evidence/mason_${variant}/`);
    return projected
      .replace(
        /\/Conversation\/hailey_(?:male_mason|mason_female)_arrived\.jpg(?:[?#].*)?$/i,
        `/Conversation/hailey_${variant === "female" ? "mason_female" : "male_mason"}_arrived.jpg`
      )
      .replace(
      /\/Snapgram\/mason_fitness_first(?:_female)?_post\.jpg(?:[?#].*)?$/i,
      `/Snapgram/mason_fitness_first${variant === "female" ? "_female" : ""}_post.jpg`
    );
  }

  function resolveImage(rawPath, rawOwnerId) {
    return resolveImageForVariant(rawPath, rawOwnerId, canonicalVariant());
  }

  function resolveAvatar(rawId, rawAvatar) {
    const id = String(rawId || "").trim().toLowerCase();
    const avatar = String(rawAvatar || "").trim();
    if (id !== "mason" && !/(?:^|\/)assets\/avatars\/(?:mason(?:_female)?|male_mason|female_mason)\.jpg(?:[?#].*)?$/i.test(avatar.replace(/\\/g, "/"))) {
      return avatar || (["aiden", "evelyn", "hailey", "lena"].includes(id) ? `assets/avatars/${id}.jpg` : "");
    }
    return canonicalVariant() === "female" ? "assets/avatars/female_mason.jpg" : "assets/avatars/male_mason.jpg";
  }

  const Game = (root.Game ||= {});
  Game.getCharacterVariant = (id) => String(id || "").trim().toLowerCase() === "mason" ? canonicalVariant() : "";
  Game.setCharacterVariant = (id, variant, options) => String(id || "").trim().toLowerCase() === "mason" ? setVariant(variant, options) : "";
  Game.resolveCharacterVariantAvatar = resolveAvatar;
  Game.resolveCharacterVariantImage = resolveImage;
  Game.resolveCharacterVariantImageForVariant = resolveImageForVariant;

  root.MasonVariantService = Object.freeze({ MEDIA_VARIANT, normalize, classifyMediaVariant, get: canonicalVariant, set: setVariant, mirrorCanonicalVariant, resolveAvatar, resolveImage, resolveImageForVariant });
  root.addEventListener?.("game-state:committed", mirrorCanonicalVariant);
})(typeof window !== "undefined" ? window : globalThis);
