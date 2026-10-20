(() => {
  if (globalThis.HakActionableState) return;

  const skillAuthority = () => globalThis.HakSkillDefinitions || (typeof module !== "undefined" && module.exports ? require("./hak-skill-definitions") : null);
  const branchNames = ["ntr", "nts", "love"];
  const canonicalId = (value) => String(value || "").trim().toLowerCase();
  const asMap = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const evidenceKind = (item, profile) => [
    item?.kind, item?.route, item?.branch, item?.profileKind,
    profile?.kind, profile?.route, profile?.branch, profile?.profile?.kind, profile?.profile?.route
  ].map(canonicalId).find((kind) => branchNames.includes(kind)) || "";
  const evidenceSkill = (item, profile) => {
    const access = item?.access;
    if (access && canonicalId(access.type) === "skill") return String(access.skillId || access.id || "").trim();
    const kind = evidenceKind(item, profile);
    return branchNames.includes(kind) ? `${kind}_evidence_access` : "";
  };

  function project(state, definitions = globalThis.HakSkillDefinitions?.all || []) {
    const hak = asMap(state?.hak);
    const pendingUserIntent = asMap(state?.execution?.cursor?.pendingUserIntent);
    const unlocked = asMap(hak.skills?.unlocked);
    const points = asMap(hak.routePoints);
    const purchasableSkills = (Array.isArray(definitions) ? definitions : []).filter((skill) => {
      if (!skill?.id || unlocked[skill.id]) return false;
      if (skillAuthority()?.isAvailable(state, skill.id) === false) return false;
      const branch = canonicalId(skill.branch);
      if (!branchNames.includes(branch)) return false;
      if ((Array.isArray(skill.requires) ? skill.requires : []).some((id) => !unlocked[id])) return false;
      return Math.max(0, Number(points[branch]) || 0) >= Math.max(0, Number(skill.cost) || 0);
    }).map((skill) => skill.id);

    const profiles = Object.entries(asMap(hak.evidenceProfiles));
    const evidenceRows = [];
    for (const [profileId, profile] of profiles) {
      for (const item of Array.isArray(profile?.evidences) ? profile.evidences : []) evidenceRows.push({ item, profile, profileId });
    }
    for (const item of Array.isArray(hak.photos) ? hak.photos : []) evidenceRows.push({ item, profile: null });
    const seen = asMap(hak.evidenceSeen);
    const unreadEvidenceIds = evidenceRows.filter(({ item, profile, profileId }) => {
      const id = String(item?.id || "").trim();
      if (!id || seen[id] === true || item?.seen === true) return false;
      // Match HAK's existing evidence visibility rule: an explicit branch
      // belongs to its owner's current route; unknown routes stay neutral.
      const owner = canonicalId(item?.profileId || item?.targetId || item?.contactId || item?.characterId || item?.ownerId || profileId);
      const rawRoute = canonicalId(state?.world?.variables?.[`route_${owner}_locked_v1`] || state?.world?.routeLocks?.[owner] || state?.world?.routes?.[owner]);
      const route = ["nts1", "nts_coach"].includes(rawRoute) ? "nts" : rawRoute;
      const kind = evidenceKind(item, profile);
      if (kind && branchNames.includes(route) && kind !== route) return false;
      const required = evidenceSkill(item, profile);
      return !!required && !!unlocked[required] && skillAuthority()?.isAvailable(state, required) !== false;
    }).map(({ item }) => String(item.id));

    const tutorial = asMap(hak.tutorial);
    const hasTutorialAction = tutorial.required === true && tutorial.completed !== true;
    const hasRequiredInput = !!hak.pendingInteraction || !!hak.gate || canonicalId(pendingUserIntent.kind).startsWith("hak_");
    const reasons = {
      hasPurchasableSkill: purchasableSkills.length > 0,
      hasUnreadEvidence: unreadEvidenceIds.length > 0,
      hasUnreadTranscript: false,
      hasRequiredInput,
      hasTutorialAction
    };
    return Object.freeze({
      accessible: hak.visible === true && hak.openable === true,
      requiresAttention: Object.values(reasons).some(Boolean),
      actionableControlCount: purchasableSkills.length + unreadEvidenceIds.length + Number(hasRequiredInput) + Number(hasTutorialAction),
      badgeCount: unreadEvidenceIds.length,
      reasons: Object.freeze(reasons),
      purchasableSkills: Object.freeze(purchasableSkills),
      unreadEvidenceIds: Object.freeze(unreadEvidenceIds),
      availableSkillPoints: Object.freeze(Object.fromEntries(branchNames.map((branch) => [branch, Math.max(0, Number(points[branch]) || 0)])))
    });
  }

  const api = Object.freeze({ project });
  globalThis.HakActionableState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
