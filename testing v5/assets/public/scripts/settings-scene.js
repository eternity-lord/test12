// scripts/settings-scene.js
(function () {
  // Idempotent (évite doubles listeners si la scène est rechargée)
  if (window.__settings_scene_inited) return;
  window.__settings_scene_inited = true;

  const Game = (window.Game ||= {});

  const SPEED_KEY = "settings_textSpeed";

  // ✅ Ta galerie réelle du projet = gallery_photos (SnapGram/Gallery)
  // On garde aussi savedPhotos par sécurité si tu l’utilises ailleurs.
  const KEEP_GALLERY_KEYS = [
    "gallery_photos", "savedPhotos", "achievements_v1", "achievement_meta_v1",
    "card_vault_state_v1", "card_vault_state_backup_v1",
    "card_vault_support_tier_rank_v1", "entitlement_redemption_ledger_v1",
    "entitlement_redemption_ledger_backup_v1",
    "patreon_release_unlock_v1", "patreon_master_unlock_v1",
    "patreon_mason_day9_15_unlock_v1", "patreon_evelyn_day9_15_unlock_v1",
    "patreon_hailey_day16_20_unlock_v1", "patreon_lena_day16_20_unlock_v1",
    "gallery_full_unlock_v1", "dev_timeline_unlock_v1"
  ];
  const ACHIEVEMENT_RUN_KEY = "achievement_run_v1";
  const SAVE_KEYS = ["saves_v2", "saves_v1"];

  let pendingResetMode = null; // "keep" | "all"

  function safeParse(raw, fallback = null) {
    try {
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  function isManualSaveSlot(slot) {
    if (!slot || typeof slot !== "object") return false;
    const type = String(slot.type || "").trim().toLowerCase();
    return type === "manual" || !type;
  }

  function extractManualSavesPayload(raw) {
    const parsed = safeParse(raw, null);
    if (!parsed) return null;

    if (Array.isArray(parsed)) {
      const manualSlots = parsed.filter(isManualSaveSlot);
      return manualSlots.length ? JSON.stringify(manualSlots) : null;
    }

    if (typeof parsed === "object" && Array.isArray(parsed.slots)) {
      const manualSlots = parsed.slots.filter(isManualSaveSlot);
      if (!manualSlots.length) return null;
      return JSON.stringify({ ...parsed, slots: manualSlots });
    }

    return null;
  }

  function getRoot() {
    return (
      document.querySelector(".settings[data-scene='settings']") ||
      document.querySelector(".settings")
    );
  }

  function getCurrentSpeed() {
    const v = localStorage.getItem(SPEED_KEY);
    if (v === "slow" || v === "medium" || v === "fast") return v;
    return "medium";
  }

  function applySpeedSelection() {
    const root = getRoot();
    if (!root) return;

    const current = getCurrentSpeed();
    root.querySelectorAll(".speed-option").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.speed === current);
    });
  }

  function showConfirm(mode) {
    const root = getRoot();
    if (!root) return;

    const overlay = root.querySelector("#settings-confirm");
    const titleEl = root.querySelector("#confirm-title");
    const textEl = root.querySelector("#confirm-text");
    if (!overlay || !titleEl || !textEl) return;

    pendingResetMode = mode;

    if (mode === "keep") {
      titleEl.textContent = "Reset game (keep gallery)";
      textEl.textContent =
        "Are you sure? Story, messages and settings will be erased, but photos in the gallery will stay.";
    } else {
      titleEl.textContent = "Reset game (everything)";
      textEl.textContent =
        "Are you absolutely sure? All progress and all photos in the gallery will be deleted.";
    }

    overlay.hidden = false;
  }

  function hideConfirm() {
    const root = getRoot();
    if (!root) return;

    const overlay = root.querySelector("#settings-confirm");
    if (overlay) overlay.hidden = true;
    pendingResetMode = null;
  }

  function performReset(requestedMode) {
    const mode = requestedMode || pendingResetMode;
    if (!mode) return;
    pendingResetMode = null;

    try {
      if (mode === "keep") {
        try { window.GalleryStore?.migrateStorage?.({ includeLegacy: true }); } catch {}
        // ✅ on conserve toutes les clés galerie connues
        const kept = {};
        for (const k of KEEP_GALLERY_KEYS) {
          const v = localStorage.getItem(k);
          if (v !== null) kept[k] = v;
        }
        for (const k of SAVE_KEYS) {
          const payload = extractManualSavesPayload(localStorage.getItem(k));
          if (payload !== null) kept[k] = payload;
        }

        localStorage.clear();

        for (const k of Object.keys(kept)) {
          localStorage.setItem(k, kept[k]);
        }

        localStorage.setItem(ACHIEVEMENT_RUN_KEY, JSON.stringify({
          startedAt: Date.now(),
          resetSource: "settings_keep_reset",
          seededAt: Date.now(),
          updatedAt: Date.now()
        }));

        try {
          window.dispatchEvent(new CustomEvent("game:story-restarted", {
            detail: { source: "settings_keep_reset" }
          }));
        } catch {}
      } else {
        localStorage.clear();
      }
    } catch (e) {
      console.error("[settings] reset failed:", e);
    }

    location.reload();
  }

  // Init à la montée de scène
  window.addEventListener("scene:mounted", (evt) => {
    const name = (evt?.detail?.name || evt?.detail?.id || "").toLowerCase();
    if (name !== "settings") return;

    applySpeedSelection();

    const root = getRoot();
    if (!root) return;

    const overlay = root.querySelector("#settings-confirm");
    if (!overlay || overlay.__bound) return;
    overlay.__bound = true;

    const cancelBtn = overlay.querySelector(".confirm-cancel");
    const okBtn = overlay.querySelector(".confirm-ok");

    if (cancelBtn) cancelBtn.onclick = () => hideConfirm();
    if (okBtn) okBtn.onclick = () => {
      const mode = pendingResetMode;
      hideConfirm();
      performReset(mode);
    };

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) hideConfirm();
    });
  });

  // Délégation globale click (mais uniquement dans Settings)
  window.addEventListener("click", (e) => {
    const root = getRoot();
    if (!root) return;
    if (!root.contains(e.target)) return;

    const speedBtn = e.target.closest(".speed-option");
    if (speedBtn && root.contains(speedBtn)) {
      const v = speedBtn.dataset.speed;
      if (!v) return;

      try {
        localStorage.setItem(SPEED_KEY, v);
      } catch {}

      applySpeedSelection();

      window.dispatchEvent(
        new CustomEvent("settings:textSpeedChanged", { detail: { value: v } })
      );
      return;
    }

    const keepBtn = e.target.closest("#reset-keep-gallery");
    if (keepBtn && root.contains(keepBtn)) {
      showConfirm("keep");
      return;
    }

    const allBtn = e.target.closest("#reset-all");
    if (allBtn && root.contains(allBtn)) {
      showConfirm("all");
      return;
    }
  });
})();
