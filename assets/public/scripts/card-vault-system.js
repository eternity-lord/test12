(function () {
  if (window.CardVaultSystem && window.CardVaultSystem.__v === "2026-07-card-vault-v3") return;

  const STORAGE_KEY = "card_vault_state_v1";
  const STORAGE_BACKUP_KEY = "card_vault_state_backup_v1";
  const SUPPORT_TIER_RANK_KEY = "card_vault_support_tier_rank_v1";
  const REDEMPTION_LEDGER_KEY = "entitlement_redemption_ledger_v1";
  const REDEMPTION_LEDGER_BACKUP_KEY = "entitlement_redemption_ledger_backup_v1";
  const REDEMPTION_LEDGER_VERSION = 1;
  // This is a tamper-evident checksum key, not a client-side secret. A determined
  // reverse engineer can recover it from a distributed build.
  const LOCAL_INTEGRITY_CONTEXT = "intercepted-redemption-ledger-v1:2026-07";
  const MASON_STORY_VARIANT_KEY = "character_variant_mason";
  const MASON_DISPLAY_VALUES = Object.freeze(["male", "female", "both"]);
  const CONFIG_ROOT = "assets/card-vault";
  const CONFIG_FILES = Object.freeze({
    rarities: `${CONFIG_ROOT}/rarities.json`,
    dropTables: `${CONFIG_ROOT}/drop_tables.json`,
    packs: `${CONFIG_ROOT}/packs.json`,
    cards: `${CONFIG_ROOT}/cards.json`,
    characters: `${CONFIG_ROOT}/characters.json`,
    rewardTiers: `${CONFIG_ROOT}/reward_tiers.json`,
    rewardCodes: `${CONFIG_ROOT}/reward_codes.json`,
    rewardSeasons: `${CONFIG_ROOT}/reward_seasons.json`,
    duplicatePolicy: `${CONFIG_ROOT}/duplicate_policy.json`
  });

  const MAX_BALANCE = 2147483647;
  let configPromise = null;
  let configCache = null;
  let dustExchangeLocked = false;
  const rewardClaimLocks = new Set();
  const presentedPointGrantTransactions = new Set();
  const pointFeedbackQueue = [];
  let pointFeedbackActive = false;

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
    try {
      localStorage.setItem(key, String(value));
      return true;
    } catch {
      return false;
    }
  }

  function token(raw) {
    return String(raw || "").trim().toLowerCase().replace(/\s+/g, "_");
  }

  const SUPPORT_TIER_RANKS = Object.freeze({
    free: 0,
    voyeur: 1,
    big_lover: 2,
    ntr_overlord: 3,
    full_support: 4
  });

  function canonicalSupportTierRank(tier, fallback = 0) {
    const id = token(tier);
    if (Object.prototype.hasOwnProperty.call(SUPPORT_TIER_RANKS, id)) return SUPPORT_TIER_RANKS[id];
    return clampInt(fallback ?? 0, 0, 4);
  }

  function getSelectedMasonGender() {
    try {
      const resolved = window.Game?.getCharacterVariant?.("mason");
      if (token(resolved) === "female") return "female";
      if (token(resolved) === "male") return "male";
    } catch {}
    return token(safeGet(MASON_STORY_VARIANT_KEY)) === "female" ? "female" : "male";
  }

  function sha256Hex(input) {
    const bytes = [];
    const str = String(input ?? "");
    for (let i = 0; i < str.length; i++) {
      let code = str.charCodeAt(i);
      if (code < 0x80) {
        bytes.push(code);
      } else if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code < 0xd800 || code >= 0xe000) {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      } else {
        const next = str.charCodeAt(++i);
        code = 0x10000 + (((code & 0x3ff) << 10) | (next & 0x3ff));
        bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      }
    }

    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while ((bytes.length % 64) !== 56) bytes.push(0);
    const high = Math.floor(bitLen / 0x100000000);
    const low = bitLen >>> 0;
    bytes.push((high >>> 24) & 255, (high >>> 16) & 255, (high >>> 8) & 255, high & 255);
    bytes.push((low >>> 24) & 255, (low >>> 16) & 255, (low >>> 8) & 255, low & 255);

    const k = [
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    ];
    const h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    const w = new Array(64);

    for (let offset = 0; offset < bytes.length; offset += 64) {
      for (let i = 0; i < 16; i++) {
        const j = offset + i * 4;
        w[i] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0;
      }
      for (let i = 16; i < 64; i++) {
        const s0 = (rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
        const s1 = (rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }

      let [a, b, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const s1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
        const ch = ((e & f) ^ (~e & g)) >>> 0;
        const temp1 = (hh + s1 + ch + k[i] + w[i]) >>> 0;
        const s0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
        const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
        const temp2 = (s0 + maj) >>> 0;
        hh = g;
        g = f;
        f = e;
        e = (d + temp1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) >>> 0;
      }
      h[0] = (h[0] + a) >>> 0;
      h[1] = (h[1] + b) >>> 0;
      h[2] = (h[2] + c) >>> 0;
      h[3] = (h[3] + d) >>> 0;
      h[4] = (h[4] + e) >>> 0;
      h[5] = (h[5] + f) >>> 0;
      h[6] = (h[6] + g) >>> 0;
      h[7] = (h[7] + hh) >>> 0;
    }

    return h.map((n) => n.toString(16).padStart(8, "0")).join("");
  }

  function statePayload(state) {
    const copy = clone(state && typeof state === "object" ? state : {});
    delete copy.integrity;
    delete copy.integritySeal;
    return JSON.stringify(copy);
  }

  function stateIntegrity(state) {
    return sha256Hex(`${LOCAL_INTEGRITY_CONTEXT}:card-vault-state\n${statePayload(state)}`);
  }

  function isSealedStateValid(state) {
    const seal = String(state?.integritySeal || "");
    return /^[a-f0-9]{64}$/.test(seal) && seal === stateIntegrity(state);
  }

  function defaultRedemptionLedger() {
    return {
      version: REDEMPTION_LEDGER_VERSION,
      entitlements: {
        supporterTier: "free",
        supporterTierRank: 0,
        masonAccess: false,
        haileyAccess: false,
        lenaAccess: false,
        galleryAccess: false,
        devAccess: false
      },
      redemptions: {},
      pending: {},
      integrity: ""
    };
  }

  function ledgerPayload(ledger) {
    const source = ledger && typeof ledger === "object" ? ledger : {};
    return JSON.stringify({
      version: REDEMPTION_LEDGER_VERSION,
      entitlements: source.entitlements && typeof source.entitlements === "object" ? source.entitlements : {},
      redemptions: source.redemptions && typeof source.redemptions === "object" ? source.redemptions : {},
      pending: source.pending && typeof source.pending === "object" ? source.pending : {}
    });
  }

  function ledgerIntegrity(ledger) {
    return sha256Hex(`${LOCAL_INTEGRITY_CONTEXT}\n${ledgerPayload(ledger)}`);
  }

  function normalizeLedger(raw) {
    const base = defaultRedemptionLedger();
    const source = raw && typeof raw === "object" ? raw : {};
    const ledger = {
      version: REDEMPTION_LEDGER_VERSION,
      entitlements: {
        supporterTier: token(source.entitlements?.supporterTier || "free") || "free",
        supporterTierRank: canonicalSupportTierRank(
          source.entitlements?.supporterTier,
          source.entitlements?.supporterTierRank
        ),
        masonAccess: source.entitlements?.masonAccess === true,
        haileyAccess: source.entitlements?.haileyAccess === true,
        lenaAccess: source.entitlements?.lenaAccess === true,
        galleryAccess: source.entitlements?.galleryAccess === true,
        devAccess: source.entitlements?.devAccess === true
      },
      redemptions: source.redemptions && typeof source.redemptions === "object" ? clone(source.redemptions) : {},
      pending: source.pending && typeof source.pending === "object" ? clone(source.pending) : {},
      integrity: String(source.integrity || "")
    };
    Object.keys(ledger.redemptions).forEach((id) => {
      const row = ledger.redemptions[id];
      if (!row || row.redeemed !== true || token(row.codeId) !== token(id)) delete ledger.redemptions[id];
    });
    Object.keys(ledger.pending).forEach((id) => {
      const row = ledger.pending[id];
      if (!row || token(row.codeId) !== token(id)) delete ledger.pending[id];
    });
    return { ...base, ...ledger };
  }

  function isLedgerValid(raw) {
    if (!raw || typeof raw !== "object" || Number(raw.version) !== REDEMPTION_LEDGER_VERSION) return false;
    const integrity = String(raw.integrity || "");
    return /^[a-f0-9]{64}$/.test(integrity) && integrity === ledgerIntegrity(raw);
  }

  function readRedemptionLedger() {
    const primary = safeParse(safeGet(REDEMPTION_LEDGER_KEY), null);
    if (isLedgerValid(primary)) return normalizeLedger(primary);
    const backup = safeParse(safeGet(REDEMPTION_LEDGER_BACKUP_KEY), null);
    if (isLedgerValid(backup)) {
      safeSet(REDEMPTION_LEDGER_KEY, JSON.stringify(backup));
      return normalizeLedger(backup);
    }
    return defaultRedemptionLedger();
  }

  function hasValidRedemptionLedger() {
    return isLedgerValid(safeParse(safeGet(REDEMPTION_LEDGER_KEY), null))
      || isLedgerValid(safeParse(safeGet(REDEMPTION_LEDGER_BACKUP_KEY), null));
  }

  function hasLedgerEntitlement(name) {
    if (!hasValidRedemptionLedger()) return false;
    const entitlements = readRedemptionLedger().entitlements || {};
    if (token(name) === "mason" || token(name) === "mason_access") return entitlements.masonAccess === true;
    if (token(name) === "hailey" || token(name) === "hailey_access") return entitlements.haileyAccess === true;
    if (token(name) === "lena" || token(name) === "lena_access") return entitlements.lenaAccess === true;
    if (token(name) === "gallery" || token(name) === "gallery_access") return entitlements.galleryAccess === true;
    if (token(name) === "dev" || token(name) === "developer" || token(name) === "dev_access") return entitlements.devAccess === true;
    return false;
  }

  function writeRedemptionLedger(raw) {
    const ledger = normalizeLedger(raw);
    ledger.integrity = ledgerIntegrity(ledger);
    const serialized = JSON.stringify(ledger);
    safeSet(REDEMPTION_LEDGER_KEY, serialized);
    safeSet(REDEMPTION_LEDGER_BACKUP_KEY, serialized);
    return clone(ledger);
  }

  function nowIso() {
    try { return new Date().toISOString(); } catch { return ""; }
  }

  function numberValue(raw, fallback = 0) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }

  function clampInt(raw, min = 0, max = Number.MAX_SAFE_INTEGER) {
    return Math.min(max, Math.max(min, Math.floor(numberValue(raw, min))));
  }

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch { return value; }
  }

  function emit(type, detail = {}) {
    try { window.dispatchEvent(new CustomEvent(`cardvault:${type}`, { detail })); } catch {}
  }

  function defaultState() {
    return {
      version: 4,
      catalogVersion: '',
      wallpaper: null,
      masonCardDisplayPreference: getSelectedMasonGender(),
      masonCardDisplayPreferenceSource: "story_default",
      points: 0,
      dust: 0,
      owned: {},
      duplicates: {
        total: 0,
        byCard: {},
        dustEarned: 0
      },
      claimedRewards: {},
      rewardHistory: [],
      pointGrantLedger: {},
      transactionReceipts: {},
      migration: { legacyImported: false, schemaVersion: 1 },
      supportTierRank: 0,
      supportTierId: "free",
      packHistory: [],
      seenCards: {},
      dustExchangeHistory: [],
      pendingReveal: null,
      orphanedCards: {},
      onboarding: {
        version: 1,
        tutorialSeen: false,
        tutorialCompleted: false,
        firstFreePackGranted: false,
        firstFreePackOpenedAt: ""
      },
      statistics: {
        packsOpened: 0,
        cardsCollected: 0,
        duplicates: 0,
        dustExchanges: 0,
        dustExchanged: 0,
        pointsFromDust: 0,
        luckHistory: [],
        pullsByRarity: {},
        favoriteRarity: ""
      }
    };
  }

  function normalizeOwnedRow(row) {
    if (!row || typeof row !== "object") return null;
    const count = clampInt(row.count || 0, 0);
    if (count <= 0) return null;
    return {
      count,
      firstUnlockedAt: String(row.firstUnlockedAt || row.unlockedAt || ""),
      lastPulledAt: String(row.lastPulledAt || row.updatedAt || row.firstUnlockedAt || ""),
      seenInCollection: row.seenInCollection === true || row.new === false,
      new: row.new === true || row.seenInCollection === false
    };
  }

  function normalizeState(raw) {
    const base = defaultState();
    const src = raw && typeof raw === "object" ? raw : {};
    const manualMasonPreference = token(src.masonCardDisplayPreferenceSource) === "manual"
      && MASON_DISPLAY_VALUES.includes(token(src.masonCardDisplayPreference));
    const out = {
      ...base,
      catalogVersion: String(src.catalogVersion || ''),
      wallpaper: src.wallpaper && typeof src.wallpaper === "object" ? clone(src.wallpaper) : null,
      masonCardDisplayPreference: manualMasonPreference
        ? token(src.masonCardDisplayPreference)
        : getSelectedMasonGender(),
      masonCardDisplayPreferenceSource: manualMasonPreference ? "manual" : "story_default",
      points: clampInt(src.points ?? src.collectionPoints ?? 0, 0, MAX_BALANCE),
      dust: clampInt(src.dust ?? src.collectionDust ?? 0, 0, MAX_BALANCE),
      owned: {},
      duplicates: {
        ...base.duplicates,
        ...(src.duplicates && typeof src.duplicates === "object" ? src.duplicates : {})
      },
      claimedRewards: src.claimedRewards && typeof src.claimedRewards === "object" ? { ...src.claimedRewards } : {},
      pointGrantLedger: src.pointGrantLedger && typeof src.pointGrantLedger === "object"
        ? Object.fromEntries(Object.entries(src.pointGrantLedger).slice(-300).map(([key, row]) => [token(key), {
            amount: clampInt(row?.amount || 0, 0, MAX_BALANCE),
            source: String(row?.source || "system"),
            at: String(row?.at || "")
          }]).filter(([key, row]) => key && row.amount > 0))
        : {},
      transactionReceipts: src.transactionReceipts && typeof src.transactionReceipts === "object"
        ? Object.fromEntries(Object.entries(src.transactionReceipts).slice(-500))
        : {},
      migration: { ...base.migration, ...(src.migration && typeof src.migration === "object" ? src.migration : {}) },
      rewardHistory: Array.isArray(src.rewardHistory) ? src.rewardHistory.slice(-200).map((row) => ({
        rewardId: token(row?.rewardId || row?.id || ""),
        amount: clampInt(row?.amount ?? row?.points ?? 0, 0, MAX_BALANCE),
        sourceType: token(row?.sourceType || row?.type || "reward") || "reward",
        timestamp: String(row?.timestamp || row?.at || ""),
        claimStatus: token(row?.claimStatus || row?.status || "claimed") || "claimed"
      })).filter((row) => row.rewardId && (row.amount > 0 || row.sourceType === "card_reward")) : [],
      supportTierId: token(src.supportTierId || "free") || "free",
      supportTierRank: canonicalSupportTierRank(
        src.supportTierId || "free",
        Math.max(clampInt(src.supportTierRank ?? 0, 0, 4), clampInt(safeGet(SUPPORT_TIER_RANK_KEY) ?? 0, 0, 4))
      ),
      packHistory: Array.isArray(src.packHistory) ? src.packHistory.slice(-200) : [],
      seenCards: src.seenCards && typeof src.seenCards === "object" ? { ...src.seenCards } : {},
      dustExchangeHistory: Array.isArray(src.dustExchangeHistory) ? src.dustExchangeHistory.slice(-200).map((row) => ({
        id: token(row?.id || ""),
        at: String(row?.at || ""),
        dustCost: clampInt(row?.dustCost || 0, 0),
        pointsReward: clampInt(row?.pointsReward || 0, 0),
        count: Math.max(1, clampInt(row?.count || 1, 1)),
        source: String(row?.source || "card_vault")
      })).filter((row) => row.id && row.dustCost > 0 && row.pointsReward > 0) : [],
      pendingReveal: normalizePendingReveal(src.pendingReveal),
      orphanedCards: src.orphanedCards && typeof src.orphanedCards === "object" ? clone(src.orphanedCards) : {},
      onboarding: {
        version: 1,
        tutorialSeen: src.onboarding?.tutorialSeen === true,
        tutorialCompleted: src.onboarding?.tutorialCompleted === true,
        firstFreePackGranted: src.onboarding?.firstFreePackGranted === true,
        firstFreePackOpenedAt: String(src.onboarding?.firstFreePackOpenedAt || "")
      },
      statistics: {
        ...base.statistics,
        ...(src.statistics && typeof src.statistics === "object" ? src.statistics : {})
      }
    };

    Object.entries(src.owned && typeof src.owned === "object" ? src.owned : {}).forEach(([id, row]) => {
      const cid = token(id);
      const normalized = normalizeOwnedRow(row);
      if (cid && normalized) {
        if (out.seenCards[cid] === true) {
          normalized.seenInCollection = true;
          normalized.new = false;
        } else if (normalized.seenInCollection === true) {
          out.seenCards[cid] = true;
          normalized.new = false;
        }
        out.owned[cid] = normalized;
      }
    });

    out.duplicates.total = clampInt(out.duplicates.total || 0, 0);
    out.duplicates.dustEarned = clampInt(out.duplicates.dustEarned || 0, 0);
    out.duplicates.byCard = out.duplicates.byCard && typeof out.duplicates.byCard === "object" ? { ...out.duplicates.byCard } : {};
    Object.keys(out.duplicates.byCard).forEach((id) => {
      out.duplicates.byCard[id] = clampInt(out.duplicates.byCard[id], 0);
    });

    out.statistics.packsOpened = clampInt(out.statistics.packsOpened || 0, 0);
    out.statistics.cardsCollected = Object.keys(out.owned).length;
    out.statistics.duplicates = clampInt(out.statistics.duplicates || out.duplicates.total || 0, 0);
    out.statistics.dustExchanges = clampInt(out.statistics.dustExchanges || 0, 0);
    out.statistics.dustExchanged = clampInt(out.statistics.dustExchanged || 0, 0);
    out.statistics.pointsFromDust = clampInt(out.statistics.pointsFromDust || 0, 0);
    out.statistics.luckHistory = Array.isArray(out.statistics.luckHistory) ? out.statistics.luckHistory.slice(-100) : [];
    out.statistics.pullsByRarity = out.statistics.pullsByRarity && typeof out.statistics.pullsByRarity === "object" ? { ...out.statistics.pullsByRarity } : {};
    out.statistics.favoriteRarity = String(out.statistics.favoriteRarity || "");
    if (out.claimedRewards.lover_july_2026 && !out.claimedRewards.big_lover_july_2026) {
      out.claimedRewards.big_lover_july_2026 = { ...out.claimedRewards.lover_july_2026, migratedFrom: "lover_july_2026" };
    }
    const legacyRanks = {
      voyeur_july_2026: 1,
      lover_july_2026: 2,
      big_lover_july_2026: 2,
      ntr_overlord_july_2026: 3,
      full_support_july_2026: 4
    };
    Object.keys(out.claimedRewards).forEach((id) => {
      out.supportTierRank = Math.max(out.supportTierRank, legacyRanks[token(id)] || 0);
    });
    return out;
  }

  function normalizePendingReveal(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = token(raw.id || raw.transactionId || "");
    const packId = token(raw.packId || "");
    const cards = Array.isArray(raw.cards) ? raw.cards.map((row, index) => ({
      cardId: token(row.cardId || row.id || ""),
      rarity: token(row.rarity || ""),
      duplicate: row.duplicate === true,
      isNew: row.isNew === true || row.duplicate !== true,
      dust: clampInt(row.dust || 0, 0),
      index: clampInt(row.index ?? index, 0)
    })).filter((row) => row.cardId) : [];
    if (!id || !packId || !cards.length) return null;
    return {
      id,
      packId,
      presentationType: token(raw.presentationType || "pack"),
      rewardId: token(raw.rewardId || ""),
      openedAt: String(raw.openedAt || ""),
      cost: clampInt(raw.cost || 0, 0),
      status: token(raw.status || "pending") || "pending",
      revealIndex: clampInt(raw.revealIndex || 0, 0),
      audioCueLedger: raw.audioCueLedger && typeof raw.audioCueLedger === "object"
        ? Object.fromEntries(Object.entries(raw.audioCueLedger)
          .filter(([key, played]) => token(key) && played === true)
          .map(([key]) => [token(key), true]))
        : {},
      cards
    };
  }

  function readStateSource() {
    // Compatibility mirrors can be stale or pruned under storage pressure.
    // Neither a repair nor a failed canonical read may import them over an
    // existing canonical domain, including an intentionally empty saved one.
    const engine = window.GameStateEngine;
    const hasCanonicalReader = typeof engine?.getCardVaultState === "function"
      || typeof engine?.getState === "function";
    if (hasCanonicalReader) {
      const canonical = typeof engine.getCardVaultState === "function"
        ? engine.getCardVaultState()
        : engine.getState()?.cardVault;
      if (canonical && typeof canonical === "object" && !Array.isArray(canonical)) return canonical;
      throw Object.assign(new Error("Card Vault canonical state is unavailable"), { code: "CARD_VAULT_STATE_UNAVAILABLE" });
    }
    const primaryRaw = safeGet(STORAGE_KEY);
    const backupRaw = safeGet(STORAGE_BACKUP_KEY);
    const primary = safeParse(primaryRaw, null);
    if (isSealedStateValid(primary)) return primary;
    const backup = safeParse(backupRaw, null);
    if (isSealedStateValid(backup)) {
      safeSet(STORAGE_KEY, JSON.stringify(backup));
      return backup;
    }
    const isLegacyState = value => value && typeof value === "object" && !Array.isArray(value) && !value.integritySeal;
    const source = isLegacyState(primary) ? primary : (isLegacyState(backup) ? backup : null);
    if (!source && (primaryRaw != null || backupRaw != null)) {
      // Preserve the evidence and last recoverable copies instead of silently
      // sealing an empty collection while the redemption ledger stays claimed.
      throw Object.assign(new Error("Card Vault saved state could not be recovered"), { code: "CARD_VAULT_STATE_UNRECOVERABLE" });
    }
    const normalized = normalizeState(source);
    normalized.integritySeal = stateIntegrity(normalized);
    const serialized = JSON.stringify(normalized);
    safeSet(STORAGE_KEY, serialized);
    safeSet(STORAGE_BACKUP_KEY, serialized);
    return normalized;
  }

  function readState() {
    return normalizeState(readStateSource());
  }

  function writeState(state, opts = {}) {
    const normalized = normalizeState(state);
    normalized.integritySeal = stateIntegrity(normalized);
    const engine = window.GameStateEngine;
    if (engine?.dispatch) {
      const type = String(opts.commandType || "UPDATE_CARD_VAULT_PRESENTATION");
      const transactionId = token(opts.transactionId || `${type}_${Date.now()}_${Math.floor(Math.random() * 1000000)}`);
      const result = engine.dispatch({
        type,
        commandId: `card-vault:${transactionId}`,
        expectedRevision: typeof engine.getRevision === "function" ? engine.getRevision() : engine.getState().revision,
        payload: { state: normalized, transactionId, result: opts.result || {} }
      });
      if (!result?.ok) throw Object.assign(new Error(result?.error?.message || result?.status || "Card Vault commit failed"), { code: result?.status });
      const committed = normalizeState(typeof engine.getCardVaultState === "function" ? engine.getCardVaultState() : engine.getState().cardVault);
      emit("state-changed", { state: clone(committed), transactionId, operation: type });
      return committed;
    }
    const serialized = JSON.stringify(normalized);
    safeSet(STORAGE_KEY, serialized);
    safeSet(STORAGE_BACKUP_KEY, serialized);
    safeSet(SUPPORT_TIER_RANK_KEY, normalized.supportTierRank);
    emit("state-changed", { state: clone(normalized) });
    return normalized;
  }

  function setMasonCardDisplayPreference(value) {
    const preference = token(value);
    if (!MASON_DISPLAY_VALUES.includes(preference)) {
      return { ok: false, reason: "invalid_preference", state: readState() };
    }
    const state = readState();
    if (state.masonCardDisplayPreference === preference && state.masonCardDisplayPreferenceSource === "manual") {
      return { ok: true, preference, source: "manual", state };
    }
    state.masonCardDisplayPreference = preference;
    state.masonCardDisplayPreferenceSource = "manual";
    // A later return to the same filter is a new user action, not a replay
    // of its first-ever transaction. writeState supplies a fresh identity.
    const saved = writeState(state, { commandType: "SET_CARD_VAULT_PREFERENCE" });
    emit("mason-display-preference-changed", { preference, source: "manual" });
    return { ok: true, preference, source: "manual", state: saved };
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res || !res.ok) throw new Error(`HTTP ${res ? res.status : 0} loading ${url}`);
    return res.json();
  }

  function normalizeConfig(raw) {
    const rarities = Array.isArray(raw.rarities?.rarities) ? raw.rarities.rarities : [];
    const cards = Array.isArray(raw.cards?.cards) ? raw.cards.cards : [];
    const characters = Array.isArray(raw.characters?.characters) ? raw.characters.characters : [];
    const packs = Array.isArray(raw.packs?.packs) ? raw.packs.packs : [];
    const dropTables = Array.isArray(raw.dropTables?.dropTables) ? raw.dropTables.dropTables : [];
    const rewardTiers = Array.isArray(raw.rewardTiers?.tiers) ? raw.rewardTiers.tiers : [];
    const rewardCodes = Array.isArray(raw.rewardCodes?.rewards) ? raw.rewardCodes.rewards : [];
    const accessCodes = Array.isArray(raw.rewardCodes?.accessCodes) ? raw.rewardCodes.accessCodes : [];
    const rewardSeasons = Array.isArray(raw.rewardSeasons?.seasons) ? raw.rewardSeasons.seasons : [];
    const duplicatePolicy = raw.duplicatePolicy?.policy && typeof raw.duplicatePolicy.policy === "object"
      ? raw.duplicatePolicy.policy
      : { rarityValues: {} };

    const rarityById = {};
    rarities.forEach((row) => {
      const id = token(row.id);
      if (!id) return;
      rarityById[id] = {
        ...row,
        id,
        sortOrder: clampInt(row.sortOrder ?? row.order ?? row.dropChance ?? 0, 0),
        borderColor: String(row.borderColor || row.color || "#d7e1f2"),
        glowColor: String(row.glowColor || row.color || "#d7e1f2"),
        glowStrength: clampInt(row.glowStrength ?? 8, 0),
        frameClass: token(row.frameClass || "frame-common"),
        framePattern: token(row.framePattern || "clean-metal"),
        cornerStyle: token(row.cornerStyle || "clean"),
        innerBorderColor: String(row.innerBorderColor || row.borderColor || row.color || "#d7e1f2"),
        outerBorderColor: String(row.outerBorderColor || row.borderColor || row.color || "#d7e1f2"),
        animationClass: token(row.animationClass || row.animation || ""),
        revealClass: token(row.revealClass || (row.specialReveal ? row.animation || "special_reveal" : "")),
        particleStyle: token(row.particleStyle || "none"),
        particleDensity: clampInt(row.particleDensity || 0, 0, 4),
        foilEffect: token(row.foilEffect || "none"),
        viewerFrameClass: token(row.viewerFrameClass || row.frameClass || "frame-common"),
        frameDetailLevel: clampInt(row.frameDetailLevel || 1, 1, 5)
      };
    });

    const characterAliasToId = {};
    const characterById = {};
    characters.forEach((row) => {
      const id = token(row.id);
      if (!id || token(row.folder) !== id) return;
      characterById[id] = {
        ...row,
        id,
        folder: id,
        displayNameKey: String(row.displayNameKey || ""),
        displayName: String(row.displayName || id),
        sortOrder: clampInt(row.sortOrder || 0, 0)
      };
      characterAliasToId[id] = id;
    });
    Object.entries(raw.characters?.migrationAliases || {}).forEach(([canonical, aliases]) => {
      const id = token(canonical);
      if (!characterById[id]) return;
      (Array.isArray(aliases) ? aliases : []).forEach((alias) => {
        const legacy = token(alias);
        if (legacy) characterAliasToId[legacy] = id;
      });
    });
    const ambiguousLegacyCharacterIds = (Array.isArray(raw.characters?.ambiguousLegacyIds) ? raw.characters.ambiguousLegacyIds : [])
      .map(token).filter(Boolean);

    const cardById = {};
    cards.forEach((row) => {
      const id = token(row.id);
      const rarity = token(row.rarity);
      const characterId = characterAliasToId[token(row.characterId || row.character)] || token(row.characterId || row.character);
      if (!id || !rarity || !rarityById[rarity] || !characterById[characterId]) return;
      cardById[id] = {
        ...row,
        id,
        rarity,
        characterId,
        character: characterById[characterId].displayName,
        characterNameKey: characterById[characterId].displayNameKey,
        tags: Array.isArray(row.tags) ? row.tags.map(token).filter(Boolean) : []
      };
    });

    const packById = {};
    packs.forEach((row) => {
      const id = token(row.id);
      if (!id) return;
      packById[id] = {
        ...row,
        id,
        cost: clampInt(row.cost || 0, 0),
        cardCount: Math.max(1, clampInt(row.cardCount || 3, 1)),
        guarantees: Array.isArray(row.guarantees) ? row.guarantees.map(normalizeGuarantee).filter(Boolean) : [],
        visual: normalizePackVisual(row.visual || row),
        enabled: row.enabled !== false
      };
    });

    const dropTableById = {};
    dropTables.forEach((row) => {
      const id = token(row.id);
      if (!id) return;
      const entries = Array.isArray(row.entries) ? row.entries.map((entry) => ({
        rarity: token(entry.rarity),
        weight: Math.max(0, numberValue(entry.weight, 0))
      })).filter((entry) => entry.rarity && rarityById[entry.rarity] && entry.weight > 0) : [];
      dropTableById[id] = { ...row, id, entries };
    });

    const rewardTierById = {};
    rewardTiers.forEach((row) => {
      const id = token(row.id);
      if (!id) return;
      rewardTierById[id] = {
        ...row,
        id,
        points: clampInt(row.points || 0, 0),
        tierRank: clampInt(row.tierRank ?? row.requiredTierRank ?? 0, 0, 4),
        requiredTierRank: clampInt(row.requiredTierRank ?? row.tierRank ?? 0, 0, 4),
        unlocksThroughTier: clampInt(row.unlocksThroughTier ?? row.tierRank ?? 0, 0, 4)
      };
    });

    const seasonById = {};
    rewardSeasons.forEach((row) => {
      const id = token(row.id);
      if (!id) return;
      seasonById[id] = {
        ...row,
        id,
        active: row.active !== false,
        rewardIds: Array.isArray(row.rewardIds) ? row.rewardIds.map(token).filter(Boolean) : [],
        exclusiveCards: Array.isArray(row.exclusiveCards) ? row.exclusiveCards.map(token).filter(Boolean) : [],
        exclusivePacks: Array.isArray(row.exclusivePacks) ? row.exclusivePacks.map(token).filter(Boolean) : [],
        visibility: token(row.visibility || "public") || "public"
      };
    });

    const rewardById = {};
    const legacyRewards = rewardCodes.length ? rewardCodes : rewardTiers.map((tier) => ({
      id: tier.id,
      tier: tier.id,
      name: tier.name,
      points: tier.points,
      active: true,
      claimOnce: token(tier.claimMode || "once") === "once",
      requireCode: false,
      code: ""
    }));
    legacyRewards.forEach((row) => {
      const id = token(row.id);
      if (!id) return;
      rewardById[id] = normalizeReward(row, id);
    });
    const accessCodeById = {};
    accessCodes.forEach((row) => {
      const id = token(row?.id);
      if (!id) return;
      const hashes = (Array.isArray(row.hashes) ? row.hashes : [])
        .map((value) => String(value || "").trim().toLowerCase())
        .filter((value) => /^[a-f0-9]{64}$/.test(value));
      accessCodeById[id] = {
        ...row,
        id,
        type: token(row.type || "entitlement") || "entitlement",
        active: row.active !== false,
        claimOnce: row.claimOnce !== false,
        hashes,
        entitlements: row.entitlements && typeof row.entitlements === "object" ? { ...row.entitlements } : {}
      };
    });

    duplicatePolicy.dustExchange = normalizeDustExchange(duplicatePolicy.dustExchange);

    return {
      catalogVersion: String(raw.cards?.catalogVersion || ''),
      rarities,
      rarityById,
      cards: Object.values(cardById),
      cardById,
      characters: Object.values(characterById).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
      characterById,
      characterAliasToId,
      ambiguousLegacyCharacterIds,
      packs: Object.values(packById),
      packById,
      dropTables,
      dropTableById,
      rewardTiers: Object.values(rewardTierById),
      rewardTierById,
      rewards: Object.values(rewardById),
      rewardById,
      accessCodes: Object.values(accessCodeById),
      accessCodeById,
      rewardSeasons: Object.values(seasonById),
      seasonById,
      duplicatePolicy,
      canonicalEntitlementKeys: raw.rewardCodes?.canonicalEntitlementKeys || {}
    };
  }

  function normalizePackVisual(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    return {
      backgroundImage: String(src.backgroundImage || src.background || src.artwork || ""),
      overlayImage: String(src.overlayImage || src.overlay || ""),
      emblem: String(src.emblem || ""),
      borderColor: String(src.borderColor || "#d7e1f2"),
      glowColor: String(src.glowColor || src.borderColor || "#d7e1f2"),
      openingAnimation: token(src.openingAnimation || src.openAnimation || src.effects?.openAnimation || "pack_open"),
      icon: String(src.icon || ""),
      frameStyle: token(src.frameStyle || "plain"),
      pattern: token(src.pattern || "grid"),
      finish: token(src.finish || "matte"),
      particleStyle: token(src.particleStyle || "none"),
      openingSequence: src.openingSequence && typeof src.openingSequence === "object"
        ? { ...src.openingSequence }
        : {}
    };
  }

  function normalizeReward(row, id) {
    const hashes = (Array.isArray(row.hashes) ? row.hashes : [row.hash || row.codeHash || ""])
      .map((value) => String(value || "").trim().toLowerCase())
      .filter((value) => /^[a-f0-9]{64}$/.test(value));
    const requiresCode = row.requireCode === true || row.requiresCode === true || hashes.length > 0;
    return {
      ...row,
      id,
      tier: token(row.tier || row.group || ""),
      rewardType: token(row.rewardType || row.type || "support_tier") || "support_tier",
      name: String(row.name || row.label || id),
      hashes,
      seasonId: token(row.seasonId || ""),
      points: clampInt(row.points || 0, 0),
      tierRank: clampInt(row.tierRank ?? row.requiredTierRank ?? 0, 0, 4),
      requiredTierRank: clampInt(row.requiredTierRank ?? row.tierRank ?? 0, 0, 4),
      unlocksThroughTier: clampInt(row.unlocksThroughTier ?? row.tierRank ?? 0, 0, 4),
      entitlements: row.entitlements && typeof row.entitlements === "object" ? { ...row.entitlements } : {},
      active: row.active !== false,
      claimOnce: row.claimOnce !== false,
      requireCode: requiresCode,
      availableFrom: String(row.availableFrom || row.startsAt || ""),
      expiresAt: String(row.expiresAt || row.expiration || "")
    };
  }

  function dateValue(raw) {
    const text = String(raw || "").trim();
    if (!text) return 0;
    const time = Date.parse(text);
    return Number.isFinite(time) ? time : 0;
  }

  function rewardAvailability(reward, at = Date.now()) {
    if (!reward || reward.active === false) return "inactive";
    const season = reward.seasonId && configCache?.seasonById ? configCache.seasonById[reward.seasonId] : null;
    if (reward.seasonId && (!season || season.active === false || season.visibility === "hidden")) return "inactive";
    if (season?.rewardIds?.length && !season.rewardIds.includes(reward.id)) return "inactive";
    const seasonFrom = dateValue(season?.startDate);
    const seasonUntil = dateValue(season?.endDate);
    if (seasonFrom && at < seasonFrom) return "future";
    if (seasonUntil && at > seasonUntil) return "expired";
    const from = dateValue(reward.availableFrom);
    const until = dateValue(reward.expiresAt);
    if (from && at < from) return "future";
    if (until && at > until) return "expired";
    return "available";
  }

  function supportTierRank(state = readState()) {
    return canonicalSupportTierRank(state?.supportTierId, state?.supportTierRank);
  }

  function rewardRequiredTierRank(reward) {
    return clampInt(reward?.requiredTierRank ?? reward?.tierRank ?? 0, 0, 4);
  }

  function hasSupportTierAccess(state, reward) {
    const rewardType = token(reward?.rewardType || reward?.type || "support_tier") || "support_tier";
    if (rewardType === "update_tier" && reward?.updateRewardFamily) {
      // Only receipts from the same update can unlock its lower tiers.
      const ledger = readRedemptionLedger();
      const ids = new Set([
        ...Object.keys(state?.claimedRewards || {}),
        ...Object.keys(ledger.redemptions || {}).filter((id) => ledger.redemptions[id]?.redeemed === true)
      ]);
      return [...ids].some((id) => {
        const claimed = configCache?.rewardById?.[id];
        return claimed?.updateRewardFamily === reward.updateRewardFamily
          && (claimed.unlocksThroughTier ?? claimed.tierRank ?? 0) >= rewardRequiredTierRank(reward);
      });
    }
    return rewardType === "support_tier"
      && supportTierRank(state) >= rewardRequiredTierRank(reward);
  }

  function rewardClaimEligibility(rewardOrId, state = readState()) {
    const reward = typeof rewardOrId === "string"
      ? configCache?.rewardById?.[token(rewardOrId)]
      : rewardOrId;
    if (!reward) {
      return {
        canClaim: false,
        claimed: false,
        entitled: false,
        requiresCode: false,
        reason: "reward_unavailable",
        playerTierRank: supportTierRank(state),
        requiredTierRank: 0
      };
    }
    const claimed = !!state?.claimedRewards?.[reward.id];
    const availability = rewardAvailability(reward);
    const entitled = hasSupportTierAccess(state, reward);
    const requiresCode = reward.requireCode === true && !entitled;
    return {
      canClaim: !claimed && availability === "available",
      claimed,
      entitled,
      requiresCode,
      reason: claimed ? "already_claimed" : (availability === "available" ? "" : availability),
      playerTierRank: supportTierRank(state),
      requiredTierRank: rewardRequiredTierRank(reward)
    };
  }

  function normalizeGuarantee(row) {
    if (!row || typeof row !== "object") return null;
    const count = Math.max(1, clampInt(row.count || 1, 1));
    return {
      ...row,
      count,
      rarity: token(row.rarity || ""),
      minimumRarity: token(row.minimumRarity || row.minRarity || ""),
      character: token(row.character || ""),
      tag: token(row.tag || ""),
      slot: Number.isFinite(Number(row.slot)) ? Math.max(0, Math.floor(Number(row.slot))) : null,
      requireNew: row.requireNew === true || row.guaranteedNew === true,
      dropTableId: token(row.dropTableId || "")
    };
  }

  function normalizeDustExchange(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    const dustCost = Number(src.dustCost);
    const pointsReward = Number(src.pointsReward);
    return {
      dustCost: Number.isFinite(dustCost) && dustCost > 0 ? Math.floor(dustCost) : 0,
      pointsReward: Number.isFinite(pointsReward) && pointsReward > 0 ? Math.floor(pointsReward) : 0,
      allowPartial: src.allowPartial === true
    };
  }

  function validateEconomyConfig(config) {
    const errors = [];
    const values = config?.duplicatePolicy?.rarityValues || {};
    const exchange = config?.duplicatePolicy?.dustExchange || {};
    const dustCost = Number(exchange.dustCost);
    const pointsReward = Number(exchange.pointsReward);
    const ratio = pointsReward / dustCost;
    (config?.rarities || []).forEach((rarity) => {
      if (!Object.prototype.hasOwnProperty.call(values, rarity.id)) errors.push(`missing duplicate Dust reward: ${rarity.id}`);
    });
    Object.entries(values).forEach(([rarity, raw]) => {
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) errors.push(`invalid duplicate Dust reward: ${rarity}`);
    });
    if (!Number.isFinite(dustCost) || dustCost <= 0 || !Number.isFinite(pointsReward) || pointsReward <= 0) errors.push("Dust exchange ratio must be finite and positive");

    const rarityOrder = config?.rarityById || {};
    const statsFor = (entries) => {
      const rows = (entries || []).map((entry) => ({ weight: Number(entry.weight || 0), dust: Number(values[token(entry.rarity)] || 0) }))
        .filter((row) => row.weight > 0 && Number.isFinite(row.dust));
      const total = rows.reduce((sum, row) => sum + row.weight, 0);
      return {
        expected: total > 0 ? rows.reduce((sum, row) => sum + row.weight * row.dust, 0) / total : 0,
        minimum: rows.length ? Math.min(...rows.map((row) => row.dust)) : 0,
        maximum: rows.length ? Math.max(...rows.map((row) => row.dust)) : 0
      };
    };
    const packs = (config?.packs || []).map((pack) => {
      const table = config.dropTableById[token(pack.dropTableId)];
      const baseEntries = table?.entries || [];
      const slots = Array.from({ length: pack.cardCount }, () => statsFor(baseEntries));
      const reserved = new Set();
      (pack.guarantees || []).forEach((rule) => {
        for (let n = 0; n < rule.count; n += 1) {
          const slot = Number.isInteger(rule.slot) && !reserved.has(rule.slot) ? rule.slot : slots.findIndex((_, index) => !reserved.has(index));
          if (slot < 0 || slot >= slots.length) continue;
          reserved.add(slot);
          const ruleTable = config.dropTableById[token(rule.dropTableId)] || table;
          const minimum = Number(rarityOrder[token(rule.minimumRarity)]?.sortOrder || 0);
          const eligible = (ruleTable?.entries || []).filter((entry) => {
            const id = token(entry.rarity);
            if (rule.rarity && id !== rule.rarity) return false;
            return !minimum || Number(rarityOrder[id]?.sortOrder || 0) >= minimum;
          });
          slots[slot] = statsFor(eligible.length ? eligible : baseEntries);
        }
      });
      const result = {
        id: pack.id,
        cost: pack.cost,
        expectedDust: slots.reduce((sum, row) => sum + row.expected, 0),
        minimumDust: slots.reduce((sum, row) => sum + row.minimum, 0),
        maximumDust: slots.reduce((sum, row) => sum + row.maximum, 0)
      };
      result.expectedPointReturn = result.expectedDust * ratio;
      result.maximumPointReturn = result.maximumDust * ratio;
      result.netExpectedPoints = result.expectedPointReturn - pack.cost;
      if (result.expectedPointReturn >= pack.cost || result.maximumPointReturn >= pack.cost) errors.push(`${pack.id} permits an unsafe Dust-to-points loop`);
      return result;
    });
    return { ok: errors.length === 0, errors, exchange: { dustCost, pointsReward, ratio }, packs };
  }
  async function loadConfig(opts = {}) {
    if (opts.force === true) configCache = null;
    if (configCache) return configCache;
    if (configPromise) return configPromise;
    configPromise = Promise.all(Object.entries(CONFIG_FILES).map(async ([key, url]) => [key, await fetchJson(url)]))
      .then((rows) => {
        configCache = normalizeConfig(Object.fromEntries(rows));
        configCache.economyAudit = validateEconomyConfig(configCache);
        try {
          console.log('[CardVaultCatalog] loaded', { catalogVersion: configCache.catalogVersion, cards: configCache.cards.length });
          if (window.__CARD_VAULT_VERBOSE_DIAGNOSTICS === true) {
            configCache.cards.forEach((card) => console.log('[CardVaultCatalog] card', {
              id: card.id, title: card.title, rarity: card.rarity, character: card.character,
              image: card.image, runtimeLoaded: true
            }));
          }
        } catch {}
        emit('catalog-loaded', { catalogVersion: configCache.catalogVersion, cards: configCache.cards.length });
        if (!configCache.economyAudit.ok) throw new Error("Unsafe Card Vault economy config: " + configCache.economyAudit.errors.join("; "));
        repairStateWithConfig(readStateSource(), configCache);
        return configCache;
      })
      .catch((error) => {
        configCache = null;
        throw error;
      })
      .finally(() => {
        configPromise = null;
      });
    return configPromise;
  }

  function normalizeRewardCode(rawCode) {
    return String(rawCode || "").trim().toUpperCase();
  }

  function validateRewardCodeInput(rawCode) {
    const code = normalizeRewardCode(rawCode);
    if (!code) return { ok: false, reason: "empty" };
    if (code.length > 128) return { ok: false, reason: "invalid_code" };
    if (!/^[A-Z0-9_-]+$/.test(code)) return { ok: false, reason: "invalid_code" };
    return { ok: true, code };
  }

  function resolveCode(rawCode) {
    const input = validateRewardCodeInput(rawCode);
    if (!input.ok || !configCache) {
      return { valid: false, reason: input.reason || "config_loading", codeRedacted: true };
    }
    const digest = sha256Hex(input.code);
    const accessCode = (configCache.accessCodes || []).find((row) => (
      Array.isArray(row.hashes) && row.hashes.includes(digest)
    ));
    if (accessCode) {
      if (accessCode.active === false || accessCode.type === "obsolete") {
        return {
          valid: false,
          recognized: true,
          reason: "obsolete_code",
          codeId: accessCode.id,
          codeRedacted: true
        };
      }
      return {
        valid: true,
        codeId: accessCode.id,
        entitlementId: accessCode.id,
        supporterTier: false,
        masonAccess: accessCode.entitlements?.masonUpdate === true,
        haileyAccess: accessCode.entitlements?.haileyUpdate === true,
        lenaAccess: accessCode.entitlements?.lenaUpdate === true,
        galleryAccess: accessCode.entitlements?.fullGallery === true,
        devAccess: accessCode.entitlements?.devTimeline === true,
        cardVaultPoints: 0,
        redemptionPolicy: "once_per_install",
        expiresAt: null,
        accessCode: clone(accessCode),
        codeRedacted: true
      };
    }
    const reward = (configCache.rewards || []).find((row) => (
      row.active !== false &&
      row.requireCode === true &&
      Array.isArray(row.hashes) &&
      row.hashes.includes(digest)
    ));
    if (!reward) return { valid: false, reason: "invalid_code", codeRedacted: true };
    return {
      valid: true,
      codeId: reward.id,
      entitlementId: reward.tier || null,
      supporterTier: reward.rewardType === "support_tier",
      cardReward: reward.rewardType === "card_reward",
      cardId: reward.rewardType === "card_reward" ? token(reward.cardId) : null,
      masonAccess: reward.entitlements?.masonUpdate === true,
      haileyAccess: reward.entitlements?.haileyUpdate === true,
      lenaAccess: reward.entitlements?.lenaUpdate === true,
      galleryAccess: reward.entitlements?.fullGallery === true,
      devAccess: false,
      cardVaultPoints: reward.points,
      redemptionPolicy: "once_per_install",
      expiresAt: reward.expiresAt || null,
      reward: clone(reward),
      codeRedacted: true
    };
  }

  function supportTierForCode(rawCode) {
    const resolved = resolveCode(rawCode);
    return resolved.valid && resolved.supporterTier ? configCache.rewardById[resolved.codeId] : null;
  }

  // gallery_full_unlock_v1 (canonicalEntitlementKeys.fullGallery) is a
  // legacy localStorage MIRROR, not the source of truth -- the canonical
  // flag is GameStateEngine's state.gallery.fullUnlock (see pictures.html
  // and convo-runtime.js's unlockFullGallery(), which both dispatch
  // SET_GALLERY_FULL_UNLOCK; engine-storage.js mirrors that flag back out to
  // this same localStorage key on every canonical commit). Every code path
  // here that grants fullGallery used to only safeSet() the mirror key
  // directly, leaving the canonical flag permanently false -- so
  // protected-media-resolver.js's authorize() (which reads ONLY the
  // canonical flag, no mirror fallback) kept denying gallery media, and a
  // resubmission of an already-claimed gallery code fell through to
  // "Invalid code" in the Patreon code modal (its entitlementMatches check
  // reads window.Game.hasGalleryFullUnlock(), which prefers the same
  // canonical flag). Dispatch the real command here too so every reader
  // agrees.
  function syncCanonicalGalleryUnlock(source) {
    try {
      const engine = window.GameStateEngine;
      const state = engine?.getState?.();
      if (state?.gallery && state.gallery.fullUnlock !== true) {
        engine.dispatch({
          type: "SET_GALLERY_FULL_UNLOCK",
          commandId: `card-vault-gallery-unlock:${token(source || "card_vault_code")}:${Date.now()}`,
          expectedRevision: state.revision,
          payload: { enabled: true, source: String(source || "card_vault_code") }
        });
      }
    } catch {}
  }

  function grantSupportTier(rawCode, opts = {}) {
    const reward = supportTierForCode(rawCode);
    if (!reward) return { ok: false, reason: configCache ? "invalid_code" : "config_loading" };
    const state = readState();
    const previousRank = state.supportTierRank;
    state.supportTierRank = Math.max(previousRank, reward.unlocksThroughTier || reward.tierRank || 1);
    if (state.supportTierRank > previousRank || !state.supportTierId) state.supportTierId = reward.tier;
    const saved = writeState(state, { commandType: "CLAIM_CARD_VAULT_REWARD", transactionId: `support-tier-${token(reward.id || reward.tier)}` });
    const keys = configCache.canonicalEntitlementKeys || {};
    const entitlements = reward.entitlements || {};
    if (entitlements.masonUpdate === true && keys.masonUpdate) safeSet(keys.masonUpdate, "1");
    if (entitlements.fullGallery === true) {
      if (keys.fullGallery) safeSet(keys.fullGallery, "1");
      syncCanonicalGalleryUnlock(opts.source || "support_tier_code");
    }
    if (entitlements.masonUpdate === true) {
      try { window.dispatchEvent(new CustomEvent("patreon:mason-unlock-changed", { detail: { unlocked: true, source: opts.source || "support_tier_code" } })); } catch {}
      try { window.dispatchEvent(new CustomEvent("patreon:unlock-changed", { detail: { unlocked: true, source: opts.source || "support_tier_code" } })); } catch {}
    }
    if (entitlements.fullGallery === true) {
      try { window.dispatchEvent(new CustomEvent("gallery:full-unlock-changed", { detail: { unlocked: true, source: opts.source || "support_tier_code" } })); } catch {}
    }
    emit("support-tier-changed", { tier: reward.tier, tierRank: saved.supportTierRank });
    return {
      ok: true,
      type: "support_tier",
      tier: reward.tier,
      tierRank: saved.supportTierRank,
      unlockedThroughTier: saved.supportTierRank,
      masonUnlocked: entitlements.masonUpdate === true || !!(keys.masonUpdate && safeGet(keys.masonUpdate) === "1"),
      galleryUnlocked: entitlements.fullGallery === true || !!(keys.fullGallery && safeGet(keys.fullGallery) === "1"),
      state: saved,
      reward: clone(reward)
    };
  }

  function repairStateWithConfig(rawState, config, opts = {}) {
    // A broken/missing catalog is not evidence that a player's collection is
    // invalid. Refuse the repair before touching state or redemption receipts.
    if (!Object.keys(config?.cardById || {}).length || !Object.keys(config?.packById || {}).length) {
      throw Object.assign(new Error("Card Vault catalog is incomplete"), { code: "CARD_VAULT_CATALOG_UNAVAILABLE" });
    }
    const source = rawState && typeof rawState === "object" ? rawState : {};
    const state = normalizeState(source);
    const issues = [];
    const note = (code, detail = {}) => issues.push({ code, ...detail });
    const rawMasonPreference = token(source.masonCardDisplayPreference);
    const rawMasonSource = token(source.masonCardDisplayPreferenceSource);
    if (!MASON_DISPLAY_VALUES.includes(rawMasonPreference) || !["story_default", "manual"].includes(rawMasonSource)) {
      note("mason_display_preference_initialized", {
        preference: state.masonCardDisplayPreference,
        source: state.masonCardDisplayPreferenceSource
      });
    } else if (rawMasonSource === "story_default" && rawMasonPreference !== state.masonCardDisplayPreference) {
      note("mason_display_story_default_refreshed", {
        from: rawMasonPreference,
        to: state.masonCardDisplayPreference
      });
    }
    if (state.catalogVersion !== String(config?.catalogVersion || '')) {
      note('catalog_version_changed', { from: state.catalogVersion, to: String(config?.catalogVersion || '') });
      state.catalogVersion = String(config?.catalogVersion || '');
    }
    if (Number(source.points ?? source.collectionPoints ?? 0) < 0 || Number(source.points ?? 0) > MAX_BALANCE) note("balance_points_repaired");
    if (Number(source.dust ?? source.collectionDust ?? 0) < 0 || Number(source.dust ?? 0) > MAX_BALANCE) note("balance_dust_repaired");

    const rewardById = config?.rewardById || {};
    Object.keys(state.claimedRewards).forEach((id) => {
      const reward = rewardById[token(id)];
      if (!reward) {
        delete state.claimedRewards[id];
        note("unknown_claim_removed", { id });
        return;
      }
      if (reward.rewardType === "support_tier" && state.supportTierRank < reward.requiredTierRank) {
        state.supportTierRank = reward.requiredTierRank;
        state.supportTierId = reward.tier || state.supportTierId;
        note("tier_raised_for_claim", { id, tierRank: state.supportTierRank });
      }
    });

    let ledger = readRedemptionLedger();
    if (!hasValidRedemptionLedger()) {
      Object.entries(state.claimedRewards).forEach(([rawId, claim]) => {
        const id = token(rawId);
        const reward = rewardById[id];
        if (!reward || reward.requireCode !== true) return;
        ledger.redemptions[id] = {
          redeemed: true,
          codeId: id,
          pointsGranted: clampInt(claim?.points || reward.points || 0, 0),
          redeemedAt: String(claim?.at || ""),
          migrated: true
        };
        if (reward.entitlements?.masonUpdate === true) ledger.entitlements.masonAccess = true;
        if (reward.entitlements?.haileyUpdate === true) ledger.entitlements.haileyAccess = true;
        if (reward.entitlements?.lenaUpdate === true) ledger.entitlements.lenaAccess = true;
        if (reward.entitlements?.fullGallery === true) ledger.entitlements.galleryAccess = true;
      });
      if (state.supportTierRank > 0) {
        ledger.entitlements.supporterTierRank = Math.min(4, state.supportTierRank);
        ledger.entitlements.supporterTier = state.supportTierId || "voyeur";
      }
      if (safeGet(config?.canonicalEntitlementKeys?.masonUpdate) === "1") ledger.entitlements.masonAccess = true;
      if (safeGet(config?.canonicalEntitlementKeys?.haileyUpdate) === "1") ledger.entitlements.haileyAccess = true;
      if (safeGet(config?.canonicalEntitlementKeys?.lenaUpdate) === "1") ledger.entitlements.lenaAccess = true;
      if (safeGet(config?.canonicalEntitlementKeys?.fullGallery) === "1") ledger.entitlements.galleryAccess = true;
      if (safeGet(config?.canonicalEntitlementKeys?.devTimeline) === "1") ledger.entitlements.devAccess = true;
      ledger = writeRedemptionLedger(ledger);
      note("redemption_ledger_migrated");
    } else {
      state.supportTierId = token(ledger.entitlements?.supporterTier || "free") || "free";
      state.supportTierRank = canonicalSupportTierRank(state.supportTierId, ledger.entitlements?.supporterTierRank);
    }

    // A historical receipt may derive Hailey access only when the receipt
    // itself belongs to the Hailey Day 16-20 update. Never infer a new
    // update entitlement from a generic supporter/Mason receipt merely
    // because a later registry revision broadened that reward definition.
    // This pass only repairs the entitlement bit; it never grants points.
    if (ledger.entitlements?.haileyAccess !== true) {
      const redeemedIds = new Set([
        ...Object.keys(ledger.redemptions || {}).filter((id) => ledger.redemptions[id]?.redeemed === true),
        ...Object.keys(state.claimedRewards || {}).map(token)
      ]);
      const grantsHailey = [...redeemedIds].some((id) => {
        const reward = rewardById[id];
        const accessCode = config?.accessCodeById?.[id];
        return (
          reward?.updateRewardFamily === "hailey_day16_20_2026" && reward?.entitlements?.haileyUpdate === true
        ) || (
          id === "hailey_day16_20_2026_v1" && accessCode?.entitlements?.haileyUpdate === true
        );
      });
      if (grantsHailey) {
        ledger.entitlements.haileyAccess = true;
        ledger = writeRedemptionLedger(ledger);
        note("hailey_entitlement_derived_from_receipt");
      }
    }

    // Only receipts issued for this update can restore its access. Keeping
    // old reward IDs and scopes prevents a historical Hailey/Mason claim
    // from silently acquiring Lena or granting the points a second time.
    if (ledger.entitlements?.lenaAccess !== true) {
      const redeemedIds = new Set([
        ...Object.keys(ledger.redemptions || {}).filter((id) => ledger.redemptions[id]?.redeemed === true),
        ...Object.keys(state.claimedRewards || {}).map(token)
      ]);
      const grantsLena = [...redeemedIds].some((id) => (
        rewardById[id]?.updateRewardFamily === "lena_day16_20_2026" && rewardById[id]?.entitlements?.lenaUpdate === true
      ) || (
        id === "lena_day16_20_2026_v1" && config?.accessCodeById?.[id]?.entitlements?.lenaUpdate === true
      ));
      if (grantsLena) {
        ledger.entitlements.lenaAccess = true;
        ledger = writeRedemptionLedger(ledger);
        note("lena_entitlement_derived_from_receipt");
      }
    }

    const validHistoryIds = new Set();
    state.rewardHistory = (state.rewardHistory || []).filter((row) => {
      const reward = rewardById[token(row?.rewardId || "")];
      const uniqueKey = `${token(row?.rewardId || "")}:${token(row?.claimStatus || "claimed")}`;
      const valid = !!reward && row.amount === reward.points && !validHistoryIds.has(uniqueKey);
      if (!valid) note("invalid_reward_history_removed", { id: token(row?.rewardId || "") });
      if (valid) validHistoryIds.add(uniqueKey);
      return valid;
    }).slice(-200);
    Object.entries(state.claimedRewards || {}).forEach(([rawId, claim]) => {
      const id = token(rawId);
      const reward = rewardById[id];
      if (!reward) return;
      if (clampInt(claim?.points || 0, 0, MAX_BALANCE) !== reward.points) {
        state.claimedRewards[rawId] = { ...(claim || {}), points: reward.points };
        note("reward_claim_metadata_repaired", { id });
      }
      if (!state.rewardHistory.some((row) => row.rewardId === id && row.claimStatus === "claimed")) {
        state.rewardHistory.push({
          rewardId: id,
          amount: reward.points,
          sourceType: reward.rewardType === "card_reward" ? "card_reward" : (reward.rewardType === "special_bonus" ? "special_bonus" : "reward"),
          timestamp: String(claim?.at || nowIso()),
          claimStatus: "claimed"
        });
        note("reward_history_restored", { id });
      }
    });
    state.rewardHistory = state.rewardHistory.slice(-200);

    const cardById = config?.cardById || {};
    const aliasToId = config?.characterAliasToId || {};
    const migrateCardId = (rawId) => {
      const oldId = token(rawId);
      if (cardById[oldId]) return oldId;
      for (const [legacy, canonical] of Object.entries(aliasToId)) {
        if (legacy === canonical) continue;
        for (const rarity of Object.keys(config?.rarityById || {})) {
          const prefix = `${rarity}_${legacy}_`;
          if (!oldId.startsWith(prefix)) continue;
          const candidate = `${rarity}_${canonical}_${oldId.slice(prefix.length)}`;
          if (cardById[candidate]) return candidate;
        }
      }
      return "";
    };
    const migrateKeyedRows = (rows, merge, issueCode) => {
      const output = {};
      Object.entries(rows || {}).forEach(([rawId, value]) => {
        const nextId = migrateCardId(rawId);
        if (!nextId) {
          note("unknown_owned_card_removed", { id: rawId });
          return;
        }
        output[nextId] = output[nextId] == null ? value : merge(output[nextId], value);
        if (nextId !== token(rawId)) note(issueCode, { from: rawId, to: nextId });
      });
      return output;
    };
    const isLegacyGenericMasonCard = (rawId) =>
      /^(?:common|rare|epic|legendary|mythic)_mason_(?!male_|female_)/.test(token(rawId));
    Object.keys(state.owned || {}).filter(isLegacyGenericMasonCard).forEach((rawId) => {
      const id = token(rawId);
      state.orphanedCards[id] = {
        ...(state.orphanedCards[id] || {}),
        legacyCardId: id,
        characterId: "mason",
        owned: clone(state.owned[rawId]),
        seen: state.seenCards?.[rawId] === true,
        duplicateCount: clampInt(state.duplicates?.byCard?.[rawId] || 0, 0, MAX_BALANCE),
        reason: "ambiguous_legacy_mason_variant",
        reviewStatus: "MANUAL_CREATOR_REVIEW_REQUIRED"
      };
      delete state.owned[rawId];
      delete state.seenCards[rawId];
      delete state.duplicates.byCard[rawId];
      note("ambiguous_mason_card_preserved_as_orphan", { id });
    });
    state.owned = migrateKeyedRows(state.owned, (a, b) => ({
      ...a,
      count: clampInt(a?.count || 0, 0, MAX_BALANCE) + clampInt(b?.count || 0, 0, MAX_BALANCE),
      firstUnlockedAt: String(a?.firstUnlockedAt || b?.firstUnlockedAt || ""),
      lastPulledAt: String(b?.lastPulledAt || a?.lastPulledAt || ""),
      seenInCollection: a?.seenInCollection === true || b?.seenInCollection === true,
      new: a?.new === true || b?.new === true
    }), "owned_card_alias_migrated");
    state.seenCards = migrateKeyedRows(state.seenCards, (a, b) => a || b, "seen_card_alias_migrated");
    state.duplicates.byCard = migrateKeyedRows(state.duplicates.byCard, (a, b) =>
      clampInt(a, 0, MAX_BALANCE) + clampInt(b, 0, MAX_BALANCE), "duplicate_card_alias_migrated");
    Object.keys(state.owned).forEach((id) => {
      if (cardById[token(id)]) return;
      delete state.owned[id];
      delete state.seenCards[id];
      note("unknown_owned_card_removed", { id });
    });
    Object.keys(state.duplicates.byCard || {}).forEach((id) => {
      if (cardById[token(id)]) return;
      delete state.duplicates.byCard[id];
      note("unknown_duplicate_card_removed", { id });
    });
    const orphanDuplicateTotal = Object.values(state.orphanedCards || {}).reduce(
      (sum, row) => sum + clampInt(row?.duplicateCount || 0, 0, MAX_BALANCE), 0);
    state.duplicates.total = Object.values(state.duplicates.byCard || {}).reduce(
      (sum, value) => sum + clampInt(value, 0, MAX_BALANCE), orphanDuplicateTotal);
    state.statistics.cardsCollected = Object.keys(state.owned).length;
    state.statistics.duplicates = state.duplicates.total;

    const packById = config?.packById || {};
    state.packHistory = (state.packHistory || []).filter((row) => {
      const packId = token(row?.packId || "");
      if (!packById[packId] || !Array.isArray(row?.cards)) {
        note("invalid_history_removed", { packId });
        return false;
      }
      row.cards = row.cards.filter((pull) => {
        const migratedId = migrateCardId(pull?.cardId || "");
        const valid = !!migratedId;
        if (!valid) note("invalid_history_card_removed", { cardId: token(pull?.cardId || "") });
        if (valid && migratedId !== token(pull?.cardId || "")) {
          note("history_card_alias_migrated", { from: pull.cardId, to: migratedId });
          pull.cardId = migratedId;
        }
        return valid;
      }).map((pull) => ({
        ...pull,
        cardId: token(pull.cardId),
        rarity: cardById[token(pull.cardId)]?.rarity || token(pull.rarity)
      }));
      return row.cards.length > 0;
    }).slice(-200);

    if (state.pendingReveal) {
      (state.pendingReveal.cards || []).filter((pull) => isLegacyGenericMasonCard(pull?.cardId)).forEach((pull) => {
        const id = token(pull.cardId);
        state.orphanedCards[id] = {
          ...(state.orphanedCards[id] || {}),
          legacyCardId: id,
          characterId: "mason",
          pendingPull: clone(pull),
          reason: "ambiguous_legacy_mason_variant",
          reviewStatus: "MANUAL_CREATOR_REVIEW_REQUIRED"
        };
        note("ambiguous_pending_mason_card_preserved_as_orphan", { id });
      });
      const pack = packForReveal(config, state.pendingReveal);
      const seenIndexes = new Set();
      const cards = (state.pendingReveal.cards || []).filter((pull) => {
        const index = clampInt(pull?.index, 0, 999);
        const migratedId = migrateCardId(pull?.cardId || "");
        const reward = rewardById[token(state.pendingReveal.rewardId)];
        const validRewardCard = state.pendingReveal.presentationType !== "code_reward"
          || (reward?.rewardType === "card_reward" && token(reward.cardId) === migratedId && !!state.claimedRewards[reward.id] && !!state.owned[migratedId]);
        const valid = !!pack && !!migratedId && validRewardCard && !seenIndexes.has(index);
        if (!valid) note("invalid_pending_card_removed", { cardId: token(pull?.cardId || ""), index });
        if (valid) {
          seenIndexes.add(index);
          if (migratedId !== token(pull?.cardId || "")) {
            note("pending_card_alias_migrated", { from: pull.cardId, to: migratedId });
            pull.cardId = migratedId;
          }
        }
        return valid;
      }).map((pull) => ({
        ...pull,
        cardId: token(pull.cardId),
        rarity: cardById[token(pull.cardId)].rarity,
        index: clampInt(pull.index, 0, 999)
      }));
      if (!pack || !cards.length) {
        state.pendingReveal = null;
        note("invalid_pending_reveal_cleared");
      } else {
        state.pendingReveal.cards = cards;
        state.pendingReveal.revealIndex = Math.min(clampInt(state.pendingReveal.revealIndex, 0, cards.length), cards.length);
      }
    }

    const entitlementKeys = config?.canonicalEntitlementKeys || {};
    if (ledger.entitlements?.masonAccess === true && entitlementKeys.masonUpdate && safeGet(entitlementKeys.masonUpdate) !== "1") {
      safeSet(entitlementKeys.masonUpdate, "1");
      note("mason_entitlement_restored");
    }
    if (ledger.entitlements?.haileyAccess === true && entitlementKeys.haileyUpdate && safeGet(entitlementKeys.haileyUpdate) !== "1") {
      safeSet(entitlementKeys.haileyUpdate, "1");
      note("hailey_entitlement_restored");
    }
    if (ledger.entitlements?.lenaAccess === true && entitlementKeys.lenaUpdate && safeGet(entitlementKeys.lenaUpdate) !== "1") {
      safeSet(entitlementKeys.lenaUpdate, "1");
      note("lena_entitlement_restored");
    }
    if (ledger.entitlements?.galleryAccess === true && entitlementKeys.fullGallery && safeGet(entitlementKeys.fullGallery) !== "1") {
      safeSet(entitlementKeys.fullGallery, "1");
      note("gallery_entitlement_restored");
    }
    if (ledger.entitlements?.devAccess === true && entitlementKeys.devTimeline && safeGet(entitlementKeys.devTimeline) !== "1") {
      safeSet(entitlementKeys.devTimeline, "1");
      note("dev_entitlement_restored");
    }

    if (issues.length) {
      state.integrity = { status: "repaired", repairedAt: nowIso(), issues: issues.slice(-100) };
      state.integritySeal = stateIntegrity(state);
      const committed = writeState(state, {
        // Repairs may recur after a story variant change or restored save.
        // A catalog/preference key would incorrectly deduplicate a new repair.
        commandType: "MIGRATE_CARD_VAULT_STATE"
      });
      Object.assign(state, committed);
      if (opts.log !== false) {
        try {
          const summary = issues.reduce((out, issue) => {
            const code = token(issue?.code || "unknown_repair");
            out[code] = (out[code] || 0) + 1;
            return out;
          }, {});
          console.warn("[CardVaultIntegrity] repaired state", JSON.stringify(summary));
        } catch {}
      }
      emit("integrity-repaired", { issues: clone(issues) });
    } else {
      state.integrity = { status: "pass", checkedAt: nowIso(), issues: [] };
    }
    return { state, issues, repaired: issues.length > 0, ok: issues.length === 0 };
  }

  async function getDiagnostics() {
    const config = await loadConfig();
    const result = repairStateWithConfig(readStateSource(), config);
    const state = result.state;
    const now = Date.now();
    const seasons = (config.rewardSeasons || []).filter((season) => {
      if (!season.active) return false;
      const start = dateValue(season.startDate);
      const end = dateValue(season.endDate);
      return (!start || now >= start) && (!end || now <= end);
    });
    const specialReward = config.rewardById?.card_vault_bonus_1000_2026_v1;
    const specialClaim = state.claimedRewards?.card_vault_bonus_1000_2026_v1;
    const specialHistory = (state.rewardHistory || []).filter((row) => row.rewardId === "card_vault_bonus_1000_2026_v1");
    const specialIntegrity = !specialClaim
      ? specialHistory.length === 0
      : specialClaim.points === specialReward?.points && specialHistory.length === 1 && specialHistory[0].amount === specialReward?.points;
    return {
      version: api.__v,
      catalogVersion: config.catalogVersion,
      catalogCards: config.cards.length,
      seasons: seasons.map((season) => ({ id: season.id, nameKey: season.nameKey, visibility: season.visibility })),
      tier: state.supportTierId,
      tierRank: state.supportTierRank,
      points: state.points,
      dust: state.dust,
      ownedCards: Object.keys(state.owned || {}).length,
      claimedRewards: Object.keys(state.claimedRewards || {}),
      specialBonus: {
        claimed: !!specialClaim,
        amountGranted: specialClaim ? clampInt(specialClaim.points || 0, 0, MAX_BALANCE) : 0,
        integrity: specialIntegrity ? "PASS" : "FAIL"
      },
      pendingReveal: state.pendingReveal ? { id: state.pendingReveal.id, packId: state.pendingReveal.packId, cards: state.pendingReveal.cards.length } : null,
      integrity: result.ok ? "PASS" : "REPAIRED",
      issues: result.issues
    };
  }

  function weightedPick(entries, rng = Math.random) {
    const rows = (Array.isArray(entries) ? entries : []).filter((entry) => numberValue(entry.weight, 0) > 0);
    const total = rows.reduce((sum, entry) => sum + numberValue(entry.weight, 0), 0);
    if (total <= 0) return null;
    let roll = rng() * total;
    for (const entry of rows) {
      roll -= numberValue(entry.weight, 0);
      if (roll <= 0) return entry;
    }
    return rows[rows.length - 1] || null;
  }

  function eligibleCardsForPack(config, pack) {
    const pool = pack?.cardPool && typeof pack.cardPool === "object" ? pack.cardPool : {};
    const includeTags = Array.isArray(pool.includeTags) ? pool.includeTags.map(token).filter(Boolean) : [];
    const excludeTags = Array.isArray(pool.excludeTags) ? pool.excludeTags.map(token).filter(Boolean) : [];
    const masonVariant = getSelectedMasonGender();
    return config.cards.filter((card) => {
      if (token(card.acquisitionType || card.acquisition) === "code_only") return false;
      const tags = Array.isArray(card.tags) ? card.tags : [];
      if (includeTags.length && !includeTags.some((tag) => tags.includes(tag))) return false;
      if (excludeTags.length && excludeTags.some((tag) => tags.includes(tag))) return false;
      const characterId = token(card.characterId || card.character);
      if (characterId === "mason_male" && masonVariant === "female") return false;
      if (characterId === "mason_female" && masonVariant === "male") return false;
      return true;
    });
  }

  function raritySortValue(config, rarityId) {
    const rarity = config?.rarityById?.[token(rarityId)];
    return clampInt(rarity?.sortOrder ?? 0, 0);
  }

  function rarityMatchesRule(config, rarityId, rule) {
    const id = token(rarityId);
    if (!id) return false;
    if (rule.rarity && id !== rule.rarity) return false;
    if (rule.minimumRarity && raritySortValue(config, id) < raritySortValue(config, rule.minimumRarity)) return false;
    return true;
  }

  function cardMatchesRule(config, card, rule, ownedMap) {
    if (!card) return false;
    if (!rarityMatchesRule(config, card.rarity, rule)) return false;
    if (rule.character && token(card.characterId || card.character) !== rule.character) return false;
    if (rule.tag && !(Array.isArray(card.tags) && card.tags.includes(rule.tag))) return false;
    if (rule.requireNew && ownedMap && ownedMap[card.id]) return false;
    return true;
  }

  function pickCard(config, pack, rarityId, rng = Math.random) {
    const eligible = eligibleCardsForPack(config, pack);
    const rarity = token(rarityId);
    const rarityPool = eligible.filter((card) => card.rarity === rarity);
    const pool = rarityPool.length ? rarityPool : eligible;
    if (!pool.length) return null;
    return pool[Math.floor(rng() * pool.length)] || pool[0];
  }

  function pickCardForGuarantee(config, pack, table, rule, state, rng = Math.random) {
    const eligible = eligibleCardsForPack(config, pack);
    const ownedMap = state?.owned || {};
    let pool = eligible.filter((card) => cardMatchesRule(config, card, rule, ownedMap));
    if (!pool.length && rule.requireNew) {
      pool = eligible.filter((card) => cardMatchesRule(config, card, { ...rule, requireNew: false }, null));
    }
    if (!pool.length) return null;

    const ruleTable = config.dropTableById[rule.dropTableId] || table;
    const entries = (ruleTable?.entries || []).filter((entry) => rarityMatchesRule(config, entry.rarity, rule));
    const rarityEntry = entries.length ? weightedPick(entries, rng) : null;
    const rarityPool = rarityEntry ? pool.filter((card) => card.rarity === token(rarityEntry.rarity)) : [];
    const finalPool = rarityPool.length ? rarityPool : pool;
    return finalPool[Math.floor(rng() * finalPool.length)] || finalPool[0];
  }

  function generatePackCards(config, pack, table, state, rng = Math.random) {
    const count = Math.max(1, clampInt(pack.cardCount || 3, 1));
    const slots = Array.from({ length: count }, () => null);
    const rules = Array.isArray(pack.guarantees) ? pack.guarantees : [];

    rules.forEach((rule) => {
      for (let n = 0; n < rule.count; n += 1) {
        let slot = Number.isInteger(rule.slot) && !slots[rule.slot] ? rule.slot : slots.findIndex((row) => !row);
        if (slot < 0 || slot >= count) return;
        slots[slot] = pickCardForGuarantee(config, pack, table, rule, state, rng);
      }
    });

    for (let i = 0; i < count; i += 1) {
      if (slots[i]) continue;
      const rarityEntry = weightedPick(table.entries, rng);
      slots[i] = pickCard(config, pack, rarityEntry?.rarity, rng);
    }

    return slots.filter(Boolean).slice(0, count);
  }

  function duplicateDustFor(config, rarityId) {
    const values = config.duplicatePolicy?.rarityValues || {};
    return clampInt(values[token(rarityId)] || 0, 0);
  }

  function packForReveal(config, pending) {
    if (pending?.presentationType === "code_reward" && token(pending.packId) === "code_reward") {
      const reward = config.rewardById[token(pending.rewardId)];
      if (reward?.rewardType !== "card_reward") return null;
      return { id: "code_reward", name: "Special Reward", nameKey: "cardvault.special_reward", presentationType: "code_reward", cost: 0, cardCount: 1, enabled: false, visual: {} };
    }
    return config.packById[token(pending?.packId)] || null;
  }

  function hydrateReveal(config, pending, state) {
    const row = normalizePendingReveal(pending);
    if (!row) return null;
    const pack = packForReveal(config, row);
    if (!pack) return null;
    const pulls = row.cards.map((pull) => {
      const card = config.cardById[pull.cardId] || { id: pull.cardId, rarity: pull.rarity };
      return {
        ...pull,
        packId: row.packId,
        card: clone(card),
        rarity: clone(config.rarityById[pull.rarity || card.rarity] || { id: pull.rarity || card.rarity, name: pull.rarity || card.rarity })
      };
    });
    return { ok: true, cardReward: row.presentationType === "code_reward", pack: clone(pack), pulls, pendingReveal: clone(row), state: clone(state || readState()) };
  }

  function updateFavoriteRarity(stats) {
    const pulls = stats.pullsByRarity && typeof stats.pullsByRarity === "object" ? stats.pullsByRarity : {};
    let best = "";
    let bestCount = -1;
    Object.entries(pulls).forEach(([id, count]) => {
      const n = clampInt(count, 0);
      if (n > bestCount) {
        best = id;
        bestCount = n;
      }
    });
    stats.favoriteRarity = best;
  }

  function recordCardPull(state, config, card, packId, index) {
    const id = token(card?.id);
    if (!id) return null;
    const rarity = token(card.rarity);
    const alreadyOwned = !!state.owned[id];
    const at = nowIso();
    let dust = 0;

    if (alreadyOwned) {
      dust = duplicateDustFor(config, rarity);
      state.owned[id].count += 1;
      state.owned[id].lastPulledAt = at;
      state.dust += dust;
      state.duplicates.total += 1;
      state.duplicates.dustEarned += dust;
      state.duplicates.byCard[id] = clampInt(state.duplicates.byCard[id] || 0, 0) + 1;
      state.statistics.duplicates += 1;
    } else {
      state.owned[id] = { count: 1, firstUnlockedAt: at, lastPulledAt: at, seenInCollection: false, new: true };
      state.statistics.cardsCollected = Object.keys(state.owned).length;
    }

    state.statistics.pullsByRarity[rarity] = clampInt(state.statistics.pullsByRarity[rarity] || 0, 0) + 1;
    const rarityDef = config.rarityById[rarity] || {};
    const statKey = String(rarityDef.statKey || "").trim().replace(/[^\w$]/g, "");
    if (statKey) state.statistics[statKey] = clampInt(state.statistics[statKey] || 0, 0) + 1;
    updateFavoriteRarity(state.statistics);

    return {
      cardId: id,
      packId,
      index,
      rarity,
      duplicate: alreadyOwned,
      dust,
      isNew: !alreadyOwned,
      pulledAt: at
    };
  }

  async function openPack(packId, opts = {}) {
    const config = await loadConfig();
    const id = token(packId || (config.packs.find((row) => row.enabled)?.id || ""));
    const pack = config.packById[id];
    if (!pack || !pack.enabled) return { ok: false, reason: "pack_unavailable" };
    const table = config.dropTableById[token(pack.dropTableId)];
    if (!table || !table.entries.length) return { ok: false, reason: "drop_table_unavailable" };

    const state = readState();
    const existingReveal = hydrateReveal(config, state.pendingReveal, state);
    if (existingReveal && !opts.forceNew) {
      return { ...existingReveal, resumed: true };
    }
    if (opts.introductoryFree === true && state.onboarding?.firstFreePackGranted === true) {
      return { ok: false, reason: "intro_pack_already_granted", state, pack };
    }
    if (!opts.free && state.points < pack.cost) {
      return { ok: false, reason: "not_enough_points", state, pack };
    }

    const rng = typeof opts.rng === "function" ? opts.rng : Math.random;
    const pulls = [];
    const historyCards = [];

    const generatedCards = generatePackCards(config, pack, table, state, rng);
    if (!generatedCards.length) {
      return { ok: false, reason: "card_pool_empty", state, pack };
    }
    if (!opts.free) state.points -= pack.cost;
    for (let i = 0; i < pack.cardCount; i += 1) {
      const card = generatedCards[i] || pickCard(config, pack, weightedPick(table.entries, rng)?.rarity, rng);
      if (!card) continue;
      const pull = recordCardPull(state, config, card, id, i);
      if (!pull) continue;
      pulls.push({
        ...pull,
        card: clone(card),
        rarity: clone(config.rarityById[pull.rarity] || { id: pull.rarity, name: pull.rarity })
      });
      historyCards.push({ cardId: pull.cardId, rarity: pull.rarity, duplicate: pull.duplicate, dust: pull.dust, isNew: pull.isNew });
    }

    const openedAt = nowIso();
    const transactionId = token(opts.transactionId || `${id}_${Date.now()}_${Math.floor(rng() * 1000000)}`);
    state.statistics.packsOpened += 1;
    if (opts.introductoryFree === true) {
      state.onboarding = {
        ...(state.onboarding || {}),
        version: 1,
        tutorialSeen: true,
        firstFreePackGranted: true,
        firstFreePackOpenedAt: openedAt
      };
    }
    state.statistics.luckHistory.push({
      packId: id,
      openedAt,
      rarities: historyCards.map((row) => row.rarity)
    });
    state.statistics.luckHistory = state.statistics.luckHistory.slice(-100);
    state.packHistory.push({
      id: transactionId,
      packId: id,
      openedAt,
      cost: opts.free ? 0 : pack.cost,
      cards: historyCards
    });
    state.packHistory = state.packHistory.slice(-200);
    state.pendingReveal = {
      id: transactionId,
      packId: id,
      openedAt,
      cost: opts.free ? 0 : pack.cost,
      status: "pending",
      revealIndex: 0,
      cards: historyCards.map((row, index) => ({ ...row, index }))
    };

    let saved;
    try {
      saved = writeState(state, { commandType: "OPEN_CARD_PACK", transactionId, result: { packId: id, cost: opts.free ? 0 : pack.cost, cards: historyCards } });
    } catch (error) {
      if (error?.code === "PERSISTENCE_STORAGE_FULL") return { ok: false, reason: "storage_full", code: error.code, state: readState() };
      throw error;
    }
    const result = { ok: true, pack: clone(pack), pulls, pendingReveal: clone(saved.pendingReveal), state: saved };
    emit("pack-opened", result);
    return result;
  }

  async function openIntroductoryPack() {
    const config = await loadConfig();
    const basic = config.packById.basic || config.packs.find((pack) => pack.enabled && token(pack.id).includes("basic"));
    if (!basic) return { ok: false, reason: "pack_unavailable" };
    return openPack(basic.id, { free: true, introductoryFree: true });
  }

  function updateOnboarding(patch = {}) {
    const state = readState();
    state.onboarding = {
      ...(state.onboarding || defaultState().onboarding),
      version: 1,
      tutorialSeen: patch.tutorialSeen == null ? state.onboarding?.tutorialSeen === true : patch.tutorialSeen === true,
      tutorialCompleted: patch.tutorialCompleted == null ? state.onboarding?.tutorialCompleted === true : patch.tutorialCompleted === true,
      firstFreePackGranted: state.onboarding?.firstFreePackGranted === true,
      firstFreePackOpenedAt: String(state.onboarding?.firstFreePackOpenedAt || "")
    };
    const completed = state.onboarding.tutorialCompleted === true;
    try {
      return { ok: true, state: writeState(state, { commandType: completed ? "COMPLETE_CARD_VAULT_TUTORIAL" : "COMPLETE_CARD_VAULT_TUTORIAL_STEP", transactionId: `tutorial-${completed ? "complete" : "seen"}` }) };
    } catch (error) {
      if (error?.code === "PERSISTENCE_STORAGE_FULL") return { ok: false, reason: "storage_full", code: error.code, state: readState() };
      throw error;
    }
  }

  async function getPendingReveal() {
    const config = await loadConfig();
    const state = readState();
    return hydrateReveal(config, state.pendingReveal, state) || { ok: false, reason: "no_pending_reveal", state };
  }

  function updatePendingReveal(progress = {}) {
    const state = readState();
    if (!state.pendingReveal) return { ok: false, reason: "no_pending_reveal", state };
    const id = token(progress.id || state.pendingReveal.id);
    if (id && id !== state.pendingReveal.id) return { ok: false, reason: "pending_reveal_mismatch", state };
    state.pendingReveal.revealIndex = clampInt(progress.revealIndex ?? state.pendingReveal.revealIndex, 0);
    state.pendingReveal.status = token(progress.status || state.pendingReveal.status || "pending");
    const saved = writeState(state, { commandType: "UPDATE_CARD_VAULT_PRESENTATION", transactionId: `reveal-progress-${state.pendingReveal.id}-${state.pendingReveal.revealIndex}-${state.pendingReveal.status}` });
    return { ok: true, pendingReveal: clone(saved.pendingReveal), state: saved };
  }

  function claimPendingRevealAudioCue(cueId, pendingRevealId = "") {
    const cue = token(cueId);
    const state = readState();
    if (!cue || !state.pendingReveal) return { ok: false, reason: "no_pending_reveal", state };
    const wanted = token(pendingRevealId || state.pendingReveal.id);
    if (wanted && wanted !== state.pendingReveal.id) return { ok: false, reason: "pending_reveal_mismatch", state };
    state.pendingReveal.audioCueLedger = state.pendingReveal.audioCueLedger && typeof state.pendingReveal.audioCueLedger === "object"
      ? state.pendingReveal.audioCueLedger
      : {};
    if (state.pendingReveal.audioCueLedger[cue] === true) {
      return { ok: false, reason: "already_claimed", state };
    }
    state.pendingReveal.audioCueLedger[cue] = true;
    const saved = writeState(state, { commandType: "UPDATE_CARD_VAULT_PRESENTATION", transactionId: `audio-${state.pendingReveal.id}-${cue}` });
    const persisted = readState();
    if (persisted.pendingReveal?.audioCueLedger?.[cue] !== true) {
      return { ok: false, reason: "persistence_failed", state: persisted };
    }
    return { ok: true, cueId: cue, pendingReveal: clone(saved.pendingReveal), state: persisted };
  }

  function collectPendingReveal(id = "") {
    const state = readState();
    if (!state.pendingReveal) return { ok: true, state };
    const wanted = token(id || state.pendingReveal.id);
    if (wanted && wanted !== state.pendingReveal.id) return { ok: false, reason: "pending_reveal_mismatch", state };
    state.pendingReveal = null;
    const saved = writeState(state, { commandType: "UPDATE_CARD_VAULT_PRESENTATION", transactionId: `collect-${wanted || "pending"}` });
    emit("reveal-collected", { state: clone(saved) });
    return { ok: true, state: saved };
  }

  function markCardSeen(cardId) {
    const id = token(cardId);
    if (!id) return { ok: false, reason: "missing_card_id", state: readState() };
    const state = readState();
    if (!state.owned[id]) return { ok: false, reason: "card_not_owned", state };
    state.owned[id].seenInCollection = true;
    state.owned[id].new = false;
    state.seenCards[id] = true;
    const saved = writeState(state, { commandType: "UPDATE_CARD_VAULT_PRESENTATION", transactionId: `seen-${id}` });
    return { ok: true, cardId: id, state: saved };
  }

  function localizedPointsFeedback(amount) {
    const language = String(window.Game?.i18n?.getLanguage?.() || "en");
    let formatted = String(amount);
    try { formatted = new Intl.NumberFormat(language).format(amount); } catch {}
    const translate = (key, fallback) => {
      try { return window.Game?.i18n?.ui?.(key, fallback) || fallback; } catch { return fallback; }
    };
    const label = translate("cardvault.collection_points", "Collection Points");
    const addedTemplate = translate("cardvault.points_added_announcement", "{amount} Collection Points added");
    return {
      formatted,
      label,
      amountText: translate("cardvault.points_gain", "+{amount} Collection Points")
        .replace(/\{amount\}/g, formatted),
      announcement: addedTemplate.replace(/\{amount\}/g, formatted)
    };
  }

  function ensurePointsFeedbackLayer() {
    if (typeof document === "undefined" || !document.body) return null;
    let layer = document.getElementById("card-vault-points-feedback-layer");
    if (layer) return layer;
    const style = document.createElement("style");
    style.id = "card-vault-points-feedback-style";
    style.textContent = `
      #card-vault-points-feedback-layer{position:fixed;inset:0;z-index:1850;display:grid;place-items:center;pointer-events:none;padding:24px}
      .card-vault-points-feedback{min-width:min(82vw,320px);padding:16px 22px;border:1px solid rgba(112,220,255,.64);border-radius:16px;background:rgba(5,9,18,.92);box-shadow:0 0 0 1px rgba(112,220,255,.12),0 16px 52px rgba(0,0,0,.64),0 0 30px rgba(112,220,255,.22);text-align:center;color:#f7fbff;animation:card-vault-points-gain 1.65s ease both}
      .card-vault-points-feedback strong{display:block;font-size:clamp(25px,7vw,42px);line-height:1;font-weight:950;letter-spacing:.02em;color:#b9efff;text-shadow:0 0 18px rgba(112,220,255,.62)}
      .card-vault-points-feedback span{display:block;margin-top:7px;font-size:12px;font-weight:850;letter-spacing:.12em;text-transform:uppercase}
      @keyframes card-vault-points-gain{0%{opacity:0;transform:translateY(18px) scale(.96)}16%,70%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-18px) scale(1.01)}}
      @media(prefers-reduced-motion:reduce){.card-vault-points-feedback{animation:card-vault-points-gain-reduced 1.65s linear both}@keyframes card-vault-points-gain-reduced{0%,100%{opacity:0}12%,82%{opacity:1}}}
    `;
    document.head?.appendChild(style);
    layer = document.createElement("div");
    layer.id = "card-vault-points-feedback-layer";
    layer.setAttribute("aria-live", "polite");
    layer.setAttribute("aria-atomic", "true");
    document.body.appendChild(layer);
    return layer;
  }

  function runNextPointsFeedback() {
    if (pointFeedbackActive || !pointFeedbackQueue.length) return;
    const item = pointFeedbackQueue.shift();
    const layer = item.showFeedback ? ensurePointsFeedbackLayer() : null;
    if (item.showFeedback && !layer) return;
    pointFeedbackActive = true;
    const text = localizedPointsFeedback(item.amount);
    let card = null;
    if (item.showFeedback) {
      card = document.createElement("div");
      card.className = "card-vault-points-feedback";
      card.setAttribute("role", "status");
      card.setAttribute("aria-label", text.announcement);
      const amountNode = document.createElement("strong");
      amountNode.textContent = `+${text.formatted}`;
      const labelNode = document.createElement("span");
      labelNode.textContent = text.label;
      card.append(amountNode, labelNode);
      layer.replaceChildren(card);
    }
    if (item.playSound) {
      try {
        window.Game?.audio?.play?.("cardVaultRewardPoint", {
          cooldownKey: `card_vault_points_${item.transactionId}`,
          bypassCooldown: true
        });
      } catch {}
    }
    setTimeout(() => {
      if (card?.isConnected) card.remove();
      pointFeedbackActive = false;
      runNextPointsFeedback();
    }, item.showFeedback ? 1720 : 40);
  }

  function presentCollectionPointsGrant(result, opts = {}) {
    if (!result?.ok || !(result.amount > 0)) return result;
    const transactionId = String(result.transactionId || "");
    if (transactionId && presentedPointGrantTransactions.has(transactionId)) return result;
    if (transactionId) presentedPointGrantTransactions.add(transactionId);
    const detail = {
      amount: result.amount,
      source: String(result.source || opts.source || "system"),
      transactionId,
      points: result.state?.points
    };
    emit("points-granted", detail);
    const showFeedback = opts.showFeedback !== false;
    const playSound = showFeedback && opts.playSound !== false;
    if (showFeedback || playSound) {
      pointFeedbackQueue.push({ ...detail, showFeedback, playSound });
      runNextPointsFeedback();
    }
    return result;
  }

  function commitCollectionPointsGrant(points, opts = {}) {
    const amount = clampInt(points, 0, MAX_BALANCE);
    if (amount <= 0) return { ok: false, reason: "invalid_amount", amount: 0, state: readState() };
    const idempotencyKey = token(opts.idempotencyKey || "");
    const state = opts.state ? normalizeState(opts.state) : readState();
    if (idempotencyKey && state.pointGrantLedger[idempotencyKey]) {
      return { ok: false, reason: "already_granted", amount: 0, state };
    }
    if (state.points > MAX_BALANCE - amount) {
      return { ok: false, reason: "balance_limit", amount: 0, state };
    }
    if (typeof opts.mutate === "function") {
      const mutationResult = opts.mutate(state);
      if (mutationResult === false) return { ok: false, reason: "mutation_rejected", amount: 0, state };
    }
    const at = nowIso();
    const transactionId = idempotencyKey || token(`points_${Date.now()}_${Math.floor(Math.random() * 1000000)}`);
    state.points += amount;
    if (idempotencyKey) {
      state.pointGrantLedger[idempotencyKey] = {
        amount,
        source: String(opts.source || "system"),
        at
      };
    }
    const saved = writeState(state, { commandType: "ADD_CARD_VAULT_POINTS", transactionId: transactionId, result: { amount, source: String(opts.source || "system") } });
    const persisted = readState();
    if (persisted.points !== saved.points || (idempotencyKey && !persisted.pointGrantLedger[idempotencyKey])) {
      return { ok: false, reason: "persistence_failed", amount: 0, state: persisted };
    }
    return {
      ok: true,
      amount,
      source: String(opts.source || "system"),
      transactionId,
      at,
      state: persisted
    };
  }

  function grantCollectionPoints(points, opts = {}) {
    const result = commitCollectionPointsGrant(points, opts);
    if (!result.ok) return result;
    return presentCollectionPointsGrant(result, opts);
  }

  async function exchangeDust(times = 1, opts = {}) {
    const config = await loadConfig();
    if (dustExchangeLocked) return { ok: false, reason: "exchange_in_progress", state: readState() };
    dustExchangeLocked = true;
    try {
      const exchange = config.duplicatePolicy?.dustExchange || normalizeDustExchange();
      const count = Math.max(1, clampInt(times || 1, 1));
      const dustCost = exchange.dustCost * count;
      const pointsReward = exchange.pointsReward * count;
      const state = readState();
      if (state.dust < dustCost) return { ok: false, reason: "not_enough_dust", state, exchange };
      const row = {
        id: token(`dust_exchange_${Date.now()}_${count}`),
        at: nowIso(),
        dustCost,
        pointsReward,
        count,
        source: String(opts.source || "card_vault")
      };
      const grant = grantCollectionPoints(pointsReward, {
        state,
        source: row.source,
        idempotencyKey: row.id,
        mutate(next) {
          next.dust -= dustCost;
          next.dustExchangeHistory.push(row);
          next.dustExchangeHistory = next.dustExchangeHistory.slice(-200);
          next.statistics.dustExchanges += 1;
          next.statistics.dustExchanged += dustCost;
          next.statistics.pointsFromDust += pointsReward;
        }
      });
      if (!grant.ok) return { ...grant, exchange };
      emit("dust-exchanged", { exchange: row, state: clone(grant.state) });
      return { ok: true, exchange: row, state: grant.state, config: exchange, amount: grant.amount };
    } finally {
      dustExchangeLocked = false;
    }
  }

  async function claimRewardTier(tierId, opts = {}) {
    const config = await loadConfig();
    const id = token(tierId);
    const reward = config.rewardById[id] || (config.rewards || []).find((row) => token(row.tier) === id) || config.rewardTierById[id];
    if (!reward) return { ok: false, reason: "tier_unavailable" };
    return claimReward(reward.id || id, opts.code || "", opts);
  }

  function claimCardReward(config, reward, rawCode, opts = {}) {
    const id = token(reward.id);
    const cardId = token(reward.cardId);
    const card = config.cardById[cardId];
    const state = readState();
    const input = validateRewardCodeInput(rawCode);
    // A bonus card is never entitled by a support tier or a force flag.
    if (!input.ok || !reward.hashes.includes(sha256Hex(input.code))) return { ok: false, reason: "invalid_code", codeRedacted: true };
    if (!card || token(card.acquisitionType || card.acquisition) !== "code_only") return { ok: false, reason: "reward_unavailable", codeRedacted: true };
    if (rewardClaimLocks.has(id)) return { ok: false, reason: "processing", codeRedacted: true };
    rewardClaimLocks.add(id);
    try {
      const ledger = readRedemptionLedger();
      if (state.claimedRewards[id] || ledger.redemptions[id]?.redeemed === true || state.owned[cardId]) {
        return { ok: false, reason: "already_claimed", cardReward: true, cardId, state, codeRedacted: true };
      }
      // An unfinished pack remains resumable; redemption never discards it.
      if (state.pendingReveal) return { ok: false, reason: "pending_reveal", state, codeRedacted: true };
      const claimedAt = nowIso();
      const source = String(opts.source || "card_vault");
      const transactionId = `card_reward_${id}`;
      const pull = recordCardPull(state, config, card, "code_reward", 0);
      state.claimedRewards[id] = { at: claimedAt, source, points: 0, cardId, rewardType: "card_reward", codeClaimed: true };
      state.rewardHistory.push({ rewardId: id, amount: 0, sourceType: "card_reward", timestamp: claimedAt, claimStatus: "claimed" });
      state.pendingReveal = {
        id: transactionId, packId: "code_reward", presentationType: "code_reward", rewardId: id,
        openedAt: claimedAt, cost: 0, status: "revealing", revealIndex: 1, cards: [pull]
      };
      let saved;
      try {
        saved = writeState(state, { commandType: "CLAIM_CARD_VAULT_REWARD", transactionId, result: { rewardId: id, cardId, amount: 0 } });
      } catch (error) {
        if (error?.code === "PERSISTENCE_STORAGE_FULL") return { ok: false, reason: "storage_full", code: error.code, codeRedacted: true };
        throw error;
      }
      const persisted = readState();
      if (!persisted.owned[cardId] || persisted.claimedRewards[id]?.at !== claimedAt || persisted.pendingReveal?.id !== transactionId) {
        return { ok: false, reason: "persistence_failed", codeRedacted: true };
      }
      ledger.redemptions[id] = { redeemed: true, codeId: id, pointsGranted: 0, cardId, redeemedAt: claimedAt, policy: "once_per_install" };
      delete ledger.pending[id];
      writeRedemptionLedger(ledger);
      const result = { ...hydrateReveal(config, saved.pendingReveal, saved), type: "card_reward", cardReward: true, cardId, reward: clone(reward), amount: 0, codeRedacted: true };
      emit("card-reward-claimed", result);
      return result;
    } finally {
      rewardClaimLocks.delete(id);
    }
  }

  async function claimReward(rewardId, code = "", opts = {}) {
    const config = await loadConfig();
    const id = token(rewardId);
    const reward = config.rewardById[id] || (config.rewards || []).find((row) => token(row.tier) === id);
    if (!reward) return { ok: false, reason: "reward_unavailable" };
    const availability = rewardAvailability(reward);
    if (availability !== "available" && !opts.force) {
      return { ok: false, reason: availability, reward };
    }
    if (reward.rewardType === "card_reward") {
      if (availability !== "available") return { ok: false, reason: availability, reward };
      return claimCardReward(config, reward, code, opts);
    }
    const state = readState();
    const enforceClaimOnce = reward.claimOnce && (reward.rewardType === "special_bonus" || !opts.force);
    if (enforceClaimOnce && state.claimedRewards[id]) {
      return { ok: false, reason: "already_claimed", state, reward };
    }
    if (rewardClaimLocks.has(id)) return { ok: false, reason: "processing", state, reward };
    rewardClaimLocks.add(id);
    try {
      const lockedState = readState();
      const ledger = readRedemptionLedger();
      const existingTierEntitlement = hasSupportTierAccess(lockedState, reward);
      // Exactly-once identity is the registry code/receipt ID. Entitlements
      // are idempotent projections, not mutual-exclusion keys: two distinct
      // rewards may grant the same update while each grants its own points.
      if (reward.requireCode && ledger.redemptions[id]?.redeemed === true) {
        return { ok: false, reason: "already_claimed", state: lockedState, reward };
      }
      if (enforceClaimOnce && lockedState.claimedRewards[id]) {
        if (reward.requireCode && !ledger.redemptions[id]) {
          ledger.redemptions[id] = {
            redeemed: true,
            codeId: id,
            pointsGranted: clampInt(lockedState.claimedRewards[id]?.points || reward.points || 0, 0),
            redeemedAt: String(lockedState.claimedRewards[id]?.at || ""),
            migrated: true
          };
          delete ledger.pending[id];
          writeRedemptionLedger(ledger);
        }
        return { ok: false, reason: "already_claimed", state: lockedState, reward };
      }
      if (reward.requireCode && !opts.force && !existingTierEntitlement) {
        const input = validateRewardCodeInput(code);
        if (!input.ok) return { ok: false, reason: "invalid_code", state: lockedState, reward };
        const digest = sha256Hex(input.code);
        if (!reward.hashes.includes(digest)) return { ok: false, reason: "invalid_code", state: lockedState, reward };
      }
      if (reward.rewardType === "support_tier" && reward.requireCode && !opts.force && !existingTierEntitlement) {
        const granted = grantSupportTier(code, { source: opts.source || "card_vault_claim" });
        if (!granted.ok) return { ok: false, reason: "invalid_code", state: lockedState, reward };
        if (token(granted.reward?.id) !== id) return { ok: false, reason: "invalid_code", state: lockedState, reward };
        Object.assign(lockedState, granted.state);
      }
      const amount = clampInt(reward.points || 0, 0);
      const claimedAt = nowIso();
      if (reward.requireCode) {
        ledger.pending[id] = { codeId: id, pointsPlanned: amount, startedAt: claimedAt };
        writeRedemptionLedger(ledger);
      }
      let grant;
      try {
        grant = commitCollectionPointsGrant(amount, {
        state: lockedState,
        source: String(opts.source || "card_vault").trim() || "card_vault",
        idempotencyKey: `reward_${id}`,
        mutate(next) {
          if (reward.rewardType === "update_tier" && reward.entitlements?.lenaUpdate === true) {
            const previousRank = supportTierRank(next);
            next.supportTierRank = Math.max(previousRank, reward.unlocksThroughTier ?? reward.tierRank ?? 0);
            if (next.supportTierRank > previousRank || !next.supportTierId) next.supportTierId = reward.tier;
          }
          next.claimedRewards[id] = {
            at: claimedAt,
            source: String(opts.source || "card_vault").trim() || "card_vault",
            points: amount,
            tier: reward.tier || "",
            rewardType: reward.rewardType,
            codeClaimed: reward.requireCode === true
          };
          next.rewardHistory = Array.isArray(next.rewardHistory) ? next.rewardHistory : [];
          next.rewardHistory.push({
            rewardId: id,
            amount,
            sourceType: reward.rewardType === "special_bonus" ? "special_bonus" : "reward",
            timestamp: claimedAt,
            claimStatus: "claimed"
          });
        }
        });
      } catch (error) {
        if (error?.code === "PERSISTENCE_STORAGE_FULL") {
          if (reward.requireCode) {
            const rollbackLedger = readRedemptionLedger();
            delete rollbackLedger.pending[id];
            writeRedemptionLedger(rollbackLedger);
          }
          return { ok: false, reason: "storage_full", code: error.code, state: readState(), reward };
        }
        throw error;
      }
      if (!grant.ok) {
        if (reward.requireCode) {
          const rollbackLedger = readRedemptionLedger();
          delete rollbackLedger.pending[id];
          writeRedemptionLedger(rollbackLedger);
        }
        return { ...grant, reward };
      }
      const persisted = grant.state;
      if (persisted.claimedRewards?.[id]?.at !== claimedAt) {
        return { ok: false, reason: "persistence_failed", state: persisted, reward };
      }
      if (reward.requireCode) {
        const finalLedger = readRedemptionLedger();
        finalLedger.redemptions[id] = {
          redeemed: true,
          codeId: id,
          pointsGranted: amount,
          redeemedAt: claimedAt,
          policy: "once_per_install"
        };
        delete finalLedger.pending[id];
        if (reward.rewardType === "support_tier" || (reward.rewardType === "update_tier" && reward.entitlements?.lenaUpdate === true)) {
          const previousRank = canonicalSupportTierRank(
            finalLedger.entitlements.supporterTier,
            finalLedger.entitlements.supporterTierRank
          );
          const nextRank = Math.max(previousRank, reward.unlocksThroughTier ?? reward.tierRank ?? 0);
          finalLedger.entitlements.supporterTierRank = nextRank;
          if (nextRank > previousRank || finalLedger.entitlements.supporterTier === "free") {
            finalLedger.entitlements.supporterTier = reward.tier;
          }
          finalLedger.entitlements.masonAccess =
            finalLedger.entitlements.masonAccess === true || reward.entitlements?.masonUpdate === true;
          finalLedger.entitlements.galleryAccess =
            finalLedger.entitlements.galleryAccess === true || reward.entitlements?.fullGallery === true;
        }
        if (reward.entitlements?.lenaUpdate === true) {
          finalLedger.entitlements.lenaAccess = true;
          const key = config.canonicalEntitlementKeys?.lenaUpdate;
          if (key) safeSet(key, "1");
        }
        if (reward.entitlements?.haileyUpdate === true) {
          finalLedger.entitlements.haileyAccess = true;
          const key = config.canonicalEntitlementKeys?.haileyUpdate;
          if (key) safeSet(key, "1");
        }
        if (reward.entitlements?.masonUpdate === true) {
          finalLedger.entitlements.masonAccess = true;
          const key = config.canonicalEntitlementKeys?.masonUpdate;
          if (key) safeSet(key, "1");
        }
        if (reward.entitlements?.fullGallery === true) {
          finalLedger.entitlements.galleryAccess = true;
          const key = config.canonicalEntitlementKeys?.fullGallery;
          if (key) safeSet(key, "1");
          syncCanonicalGalleryUnlock(opts.source || "card_vault_claim");
        }
        writeRedemptionLedger(finalLedger);
      }
      if (reward.entitlements?.lenaUpdate === true) {
        try { window.dispatchEvent(new CustomEvent("patreon:lena-unlock-changed", { detail: { unlocked:true, source:opts.source || "update_tier_code" } })); } catch {}
        try { window.dispatchEvent(new CustomEvent("patreon:unlock-changed", { detail: { unlocked:true, source:opts.source || "update_tier_code" } })); } catch {}
      }
      if (reward.entitlements?.haileyUpdate === true) {
        try { window.dispatchEvent(new CustomEvent("patreon:hailey-unlock-changed", { detail: { unlocked:true, source:opts.source || "update_tier_code" } })); } catch {}
        try { window.dispatchEvent(new CustomEvent("patreon:unlock-changed", { detail: { unlocked:true, source:opts.source || "update_tier_code" } })); } catch {}
      }
      if (reward.rewardType === "special_bonus") emit("special-bonus-claimed", { rewardId: id, amount, points: persisted.points });
      presentCollectionPointsGrant(grant, opts);
      return { ok: true, reward: clone(reward), tier: clone(reward), amount, state: persisted };
    } finally {
      rewardClaimLocks.delete(id);
    }
  }

  async function redeemCode(rawCode, opts = {}) {
    await loadConfig();
    const resolved = resolveCode(rawCode);
    if (!resolved.valid) {
      return { ok: false, reason: resolved.reason || "invalid_code", codeRedacted: true };
    }
    if (resolved.accessCode) {
      const id = token(resolved.codeId);
      if (rewardClaimLocks.has(id)) return { ok: false, reason: "processing", codeId: id, codeRedacted: true };
      rewardClaimLocks.add(id);
      try {
        const ledger = readRedemptionLedger();
        if (ledger.redemptions[id]?.redeemed === true) {
          return { ok: false, reason: "already_claimed", codeId: id, codeRedacted: true };
        }
        const keys = configCache.canonicalEntitlementKeys || {};
        const entitlements = resolved.accessCode.entitlements || {};
        if (entitlements.lenaUpdate === true) {
          ledger.entitlements.lenaAccess = true;
          if (keys.lenaUpdate) safeSet(keys.lenaUpdate, "1");
        }
        if (entitlements.haileyUpdate === true) {
          ledger.entitlements.haileyAccess = true;
          if (keys.haileyUpdate) safeSet(keys.haileyUpdate, "1");
        }
        if (entitlements.masonUpdate === true) {
          ledger.entitlements.masonAccess = true;
          if (keys.masonUpdate) safeSet(keys.masonUpdate, "1");
        }
        if (entitlements.fullGallery === true) {
          ledger.entitlements.galleryAccess = true;
          if (keys.fullGallery) safeSet(keys.fullGallery, "1");
          syncCanonicalGalleryUnlock(opts.source || "access_code");
        }
        if (entitlements.devTimeline === true) {
          ledger.entitlements.devAccess = true;
          if (keys.devTimeline) safeSet(keys.devTimeline, "1");
        }
        ledger.redemptions[id] = {
          redeemed: true,
          codeId: id,
          pointsGranted: 0,
          redeemedAt: nowIso(),
          policy: "once_per_install"
        };
        writeRedemptionLedger(ledger);
        if (entitlements.masonUpdate === true) {
          try { window.dispatchEvent(new CustomEvent("patreon:mason-unlock-changed", { detail: { unlocked: true, source: opts.source || "access_code" } })); } catch {}
        }
        if (entitlements.haileyUpdate === true) {
          try { window.dispatchEvent(new CustomEvent("patreon:hailey-unlock-changed", { detail: { unlocked: true, source: opts.source || "access_code" } })); } catch {}
        }
        if (entitlements.lenaUpdate === true) {
          try { window.dispatchEvent(new CustomEvent("patreon:lena-unlock-changed", { detail: { unlocked: true, source: opts.source || "access_code" } })); } catch {}
        }
        if (entitlements.masonUpdate === true || entitlements.haileyUpdate === true || entitlements.lenaUpdate === true || entitlements.devTimeline === true) {
          try { window.dispatchEvent(new CustomEvent("patreon:unlock-changed", { detail: { unlocked: true, source: opts.source || "access_code" } })); } catch {}
        }
        if (entitlements.fullGallery === true) {
          try { window.dispatchEvent(new CustomEvent("gallery:full-unlock-changed", { detail: { unlocked: true, source: opts.source || "access_code" } })); } catch {}
        }
        if (entitlements.devTimeline === true) {
          try { window.dispatchEvent(new CustomEvent("timeline:dev-unlock-changed", { detail: { unlocked: true, source: opts.source || "access_code" } })); } catch {}
        }
        return {
          ok: true,
          type: entitlements.devTimeline === true ? "developer" : (entitlements.fullGallery === true ? "gallery" : (entitlements.lenaUpdate === true ? "lena" : (entitlements.haileyUpdate === true ? "hailey" : "mason"))),
          codeId: id,
          entitlementId: id,
          unlocked: true,
          masonAccess: entitlements.masonUpdate === true,
          haileyAccess: entitlements.haileyUpdate === true,
          lenaAccess: entitlements.lenaUpdate === true,
          galleryAccess: entitlements.fullGallery === true,
          devAccess: entitlements.devTimeline === true,
          cardVaultPoints: 0,
          codeRedacted: true
        };
      } finally {
        rewardClaimLocks.delete(id);
      }
    }
    const result = await claimReward(resolved.codeId, rawCode, opts);
    return {
      ...result,
      codeId: resolved.codeId,
      entitlementId: resolved.entitlementId,
      masonAccess: resolved.masonAccess,
      haileyAccess: resolved.haileyAccess,
      lenaAccess: resolved.lenaAccess,
      galleryAccess: resolved.galleryAccess,
      devAccess: resolved.devAccess,
      cardVaultPoints: resolved.cardVaultPoints,
      codeRedacted: true
    };
  }

  function addPoints(points, source = "system") {
    const result = grantCollectionPoints(points, { source });
    return { ...result, points: result.amount || 0 };
  }

  function computeProgress(state, config) {
    const s = normalizeState(state || readState());
    const cards = (config?.cards || []).filter(card => token(card.acquisitionType || card.acquisition) !== "code_only" || !!s.owned[card.id]);
    const total = cards.length;
    const ownedIds = new Set(Object.keys(s.owned || {}));
    const owned = cards.filter((card) => ownedIds.has(card.id)).length;
    const byCharacter = {};
    const byRarity = {};
    cards.forEach((card) => {
      const character = token(card.characterId || card.character || "unknown") || "unknown";
      const rarity = token(card.rarity || "unknown");
      if (!byCharacter[character]) byCharacter[character] = { owned: 0, total: 0 };
      if (!byRarity[rarity]) byRarity[rarity] = { owned: 0, total: 0 };
      byCharacter[character].total += 1;
      byRarity[rarity].total += 1;
      if (ownedIds.has(card.id)) {
        byCharacter[character].owned += 1;
        byRarity[rarity].owned += 1;
      }
    });
    return {
      owned,
      total,
      percent: total ? Math.round((owned / total) * 1000) / 10 : 0,
      byCharacter,
      byRarity
    };
  }

  const api = {
    __v: "2026-07-card-vault-v3",
    STORAGE_KEY,
    STORAGE_BACKUP_KEY,
    CONFIG_FILES,
    SUPPORT_TIER_RANK_KEY,
    REDEMPTION_LEDGER_KEY,
    REDEMPTION_LEDGER_BACKUP_KEY,
    loadConfig,
    readState,
    writeState,
    getSelectedMasonGender,
    setMasonCardDisplayPreference,
    normalizeState,
    validateEconomyConfig,
    openPack,
    openIntroductoryPack,
    updateOnboarding,
    getPendingReveal,
    updatePendingReveal,
    claimPendingRevealAudioCue,
    collectPendingReveal,
    markCardSeen,
    exchangeDust,
    resolveCode,
    redeemCode,
    readRedemptionLedger,
    writeRedemptionLedger,
    hasValidRedemptionLedger,
    hasLedgerEntitlement,
    claimReward,
    claimRewardTier,
    rewardAvailability,
    supportTierRank,
    rewardRequiredTierRank,
    hasSupportTierAccess,
    rewardClaimEligibility,
    normalizeRewardCode,
    sha256Hex,
    supportTierForCode,
    grantSupportTier,
    grantCollectionPoints,
    repairStateWithConfig,
    getDiagnostics,
    addPoints,
    computeProgress,
    weightedPick,
    eligibleCardsForPack,
    generatePackCards
  };

  window.CardVaultSystem = api;
  window.Game = window.Game || {};
  window.Game.CardVaultSystem = api;
  loadConfig().catch(() => {});
})();
