(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.HakSkillDefinitions = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {

  const BRANCHES = Object.freeze(["ntr", "nts", "love"]);
  const definitions = Object.freeze([
    { id:"ntr_passive_insight_v1", branch:"ntr", cost:2, thought:"Part of me wants to know more, even if I may not like what I find." },
    { id:"ntr_route_reveal_v2", branch:"ntr", cost:2, requires:["ntr_passive_insight_v1"], thought:"I can see which choice will bring me closer to the truth, even if it hurts." },
    { id:"ntr_evidence_access", branch:"ntr", cost:4, requires:["ntr_route_reveal_v2"], thought:"HAK kept a record. I need to see what I've been missing." },
    { id:"ntr_audio_transcription_v1", branch:"ntr", cost:4, requires:["ntr_evidence_access"], thought:"Now I can read their words for myself. What haven't they told me?" },
    { id:"nts_opportunity_indicator_v1", branch:"nts", cost:2, thought:"I don't know why, but this turns me on." },
    { id:"nts_route_reveal_v2", branch:"nts", cost:2, requires:["nts_opportunity_indicator_v1"], thought:"Now I can see the opening. I just have to take it." },
    { id:"nts_evidence_access", branch:"nts", cost:4, requires:["nts_route_reveal_v2"], thought:"There might be an opportunity in what HAK has recorded." },
    { id:"nts_audio_transcription_v1", branch:"nts", cost:4, requires:["nts_evidence_access"], thought:"Reading their conversations might tell me when to make my move." },
    { id:"love_risk_warning_v1", branch:"love", cost:2, thought:"I want to understand them better and be there for them." },
    { id:"love_route_reveal_v2", branch:"love", cost:2, requires:["love_risk_warning_v1"], thought:"I can see a way to show them I care." },
    { id:"love_evidence_access", branch:"love", cost:4, requires:["love_route_reveal_v2"], thought:"Maybe these moments will help me understand what they need." },
    { id:"love_audio_transcription_v1", branch:"love", cost:4, requires:["love_evidence_access"], thought:"Reading their words might help me understand what they can't say to me." }
  ].map(Object.freeze));
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const byBranch = Object.freeze(Object.fromEntries(BRANCHES.map((branch) => [branch, Object.freeze(definitions.filter((definition) => definition.branch === branch))])));
  const normalizeBranch = (raw) => BRANCHES.includes(String(raw || "").trim().toLowerCase()) ? String(raw).trim().toLowerCase() : "";
  const transcriptionSkillForBranch = (branch) => {
    const key = normalizeBranch(branch);
    return key ? `${key}_audio_transcription_v1` : "";
  };
  // Authored Day16 root announcements have durable effect receipts.
  // Reading that receipt also supports existing saves, without a new flag or
  // an assumed world day. Hailey's routes and solo Lena LOVE reveal the shared tier.
  const transcriptionAnnouncementStoryIds = new Set(BRANCHES.flatMap((branch) => [
    `day16_00_hailey_morning_${branch}`,
    `d16_00_hailey_morning_${branch}_v1`,
    `story/DAY16/${branch}/DAY16_00_HAILEY_MORNING_${branch.toUpperCase()}.json`
  ]));
  const lenaLoveTranscriptionAnnouncementStoryIds = new Set([
    "d16_00_lena_morning_love",
    "d16_00_lena_morning_love_v1",
    "story/DAY16/love/DAY16_00_LENA_MORNING_LOVE.json"
  ]);
  function isTranscriptionAnnouncementStory(storyId, contactId) {
    return (contactId === "hailey" && transcriptionAnnouncementStoryIds.has(storyId)) ||
      (contactId === "lena" && lenaLoveTranscriptionAnnouncementStoryIds.has(storyId));
  }
  function transcriptionAnnounced(state, exceptStoryId = '') {
    return Object.values(state?.progression?.effectReceipts || {}).some((receipt) =>
      receipt?.effectType === "hak_overlay" && receipt.storyId !== exceptStoryId && Number(receipt.stepIndex) === 0 &&
      isTranscriptionAnnouncementStory(receipt.storyId, receipt.contactId)
    );
  }
  function isAvailable(state, skillId) {
    const skill = byId.get(String(skillId || ""));
    return !skill || skill.id !== transcriptionSkillForBranch(skill.branch) || transcriptionAnnounced(state);
  }
  function isActive(state, skillId) {
    return !!state?.hak?.skills?.unlocked?.[skillId] && isAvailable(state, skillId);
  }
  return Object.freeze({ BRANCHES, all:definitions, byId, byBranch, normalizeBranch, transcriptionSkillForBranch, isTranscriptionAnnouncementStory, transcriptionAnnounced, isAvailable, isActive });
});
