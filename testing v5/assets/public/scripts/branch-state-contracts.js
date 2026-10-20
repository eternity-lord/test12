(function initBranchStateContracts(root) {
  "use strict";

  const CONTRACTS = Object.freeze([
    Object.freeze({ id: "d8_05_hailey_outfit_choice", createdDay: 8, character: "hailey", routes: ["love", "ntr", "nts"], values: ["cute", "bold", "older"], canonicalDefault: "older", storyOnceKey: "d8_05_hailey_shopping_advice_v1", sourceStory: "story/DAY8/DAY8_06_HAILEY_SHOPPING_ADVICE.json", sourceStoryId: "story/DAY8/DAY8_06_HAILEY_SHOPPING_ADVICE.json", sourceStepKey: "24", ledgerImpact: {}, dependsWhen: { minDay: 9, activeCharacter: "hailey" }, resolution: { type: "configured_or_default" }, restore: { start_from: true, new_update: true, timeline: "preserve", save_load: "preserve" } }),
    Object.freeze({ id: "d9_mason_nts_coach_identity_v1", createdDay: 9, character: "mason", routes: ["nts"], values: ["aiden", "chris"], storyOnceKey: "d9_07_mason_afternoon_nts_v1", sourceStory: "story/DAY9/nts/DAY9_06_MASON_AFTERNOON_NTS.json", sourceStoryId: "story/DAY9/nts/DAY9_06_MASON_AFTERNOON_NTS.json", sourceStepKey: "3", ledgerImpact: { nts: 1 }, dependsWhen: { minDay: 10, activeCharacter: "mason", route: "nts" }, resolution: { type: "aiden_active", trueValue: "aiden", falseValue: "chris" }, restore: { start_from: true, new_update: true, timeline: "preserve", save_load: "preserve" } }),
    Object.freeze({ id: "d14_mason_day15_activity_choice", createdDay: 14, character: "mason", routes: ["love"], values: ["pool", "yoga"], canonicalDefault: "yoga", storyOnceKey: "d14_05_mason_afternoon_love_v1", sourceStory: "story/DAY14/love/DAY14_01_MASON_AFTERNOON_LOVE.json", sourceStoryId: "story/DAY14/love/DAY14_01_MASON_AFTERNOON_LOVE.json", sourceStepKey: "16", ledgerImpact: { love: 1 }, dependsWhen: { minDay: 15, activeCharacter: "mason", route: "love" }, resolution: { type: "configured_or_default" }, restore: { start_from: true, new_update: false, timeline: "preserve", save_load: "preserve" } }),
    Object.freeze({ id: "d2_lena_outfit_choice_v1", createdDay: 2, character: "lena", routes: [], values: ["outfit1", "outfit2", "outfit3"], canonicalDefault: "outfit1", storyOnceKey: "d2_12_lena_night_v1", sourceStory: "story/DAY2/DAY2_12_LENA_NIGHT.json", sourceStoryId: "story/DAY2/DAY2_12_LENA_NIGHT.json", sourceStepKey: "39", ledgerImpact: {}, dependsWhen: { minDay: 3, activeCharacter: "lena" }, resolution: { type: "configured_or_default" }, restore: { start_from: true, new_update: true, timeline: "preserve", save_load: "preserve" } }),
    Object.freeze({ id: "d14_nts_want_to_know_choice", createdDay: 14, character: "lena", routes: ["nts"], values: ["know_and_receive", "know_only", "not_know_right_away"], canonicalDefault: "know_and_receive", storyOnceKey: "d14_03_lena_night_nts_v1", sourceStory: "story/DAY14/nts/DAY14_03_LENA_NIGHT.NTS.json", sourceStoryId: "story/DAY14/nts/DAY14_03_LENA_NIGHT.NTS.json", sourceStepKey: "38", ledgerImpact: { nts: 2 }, ledgerImpactByValue: { know_and_receive: { nts: 2 }, know_only: { nts: 1 }, not_know_right_away: { nts: 2 } }, dependsWhen: { minDay: 15, activeCharacter: "lena", route: "nts" }, resolution: { type: "configured_or_default" }, restore: { start_from: true, new_update: true, timeline: "preserve", save_load: "preserve" } }),
    Object.freeze({ id: "d15_nts_target_choice", createdDay: 15, character: "lena", routes: ["nts"], values: ["random_guy", "aiden"], canonicalDefault: "random_guy", storyOnceKey: "d15_01_lena_afternoon_nts_v1", sourceStory: "story/DAY15/nts/DAY15_02_LENA_EVENING_NTS.json", sourceStoryId: "story/DAY15/nts/DAY15_02_LENA_EVENING_NTS.json", sourceStepKey: "44", ledgerImpact: { nts: 2 }, dependsWhen: { minDay: 16, activeCharacter: "lena", route: "nts" }, resolution: { type: "configured_or_default" }, restore: { start_from: true, new_update: true, timeline: "preserve", save_load: "preserve" } }),
    Object.freeze({ id: "d16_lena_nts_information_scope_v1", createdDay: 16, character: "lena", routes: ["nts"], values: ["surprise_within_limits", "talk_afterward"], canonicalDefault: "talk_afterward", storyOnceKey: "d16_02_lena_evening_nts_v1", sourceStory: "story/DAY16/nts/DAY16_02_LENA_EVENING_NTS.json", sourceStoryId: "d16_02_lena_evening_nts", sourceStepKey: "65", ledgerImpact: {}, dependsWhen: { minDay: 17, activeCharacter: "lena", route: "nts" }, resolution: { type: "configured_or_default" }, restore: { start_from: true, new_update: true, timeline: "preserve", save_load: "preserve" } }),
    Object.freeze({ id: "d17_lena_nts_first_date_reaction_v1", createdDay: 17, character: "lena", routes: ["nts"], values: ["excited", "nervous_but_willing"], canonicalDefault: "excited", storyOnceKey: "d17_02_lena_evening_nts_v1", sourceStory: "story/DAY17/nts/DAY17_02_LENA_EVENING_NTS.json", sourceStoryId: "d17_02_lena_evening_nts", sourceStepKey: "74", ledgerImpact: { nts: 2 }, dependsWhen: { minDay: 18, activeCharacter: "lena", route: "nts" }, resolution: { type: "configured_or_default" }, restore: { start_from: true, new_update: true, timeline: "preserve", save_load: "preserve" } })
  ]);

  const token = (value) => String(value == null ? "" : value).trim().toLowerCase();
  const route = (value) => ["nts", "nts1", "nts2", "nts_coach"].includes(token(value)) ? "nts" : token(value);

  function applies(contract, scenario) {
    const day = Number(scenario.day || 0) || 0;
    const active = new Set((scenario.activeCharacters || []).map(token));
    const when = contract.dependsWhen || {};
    if (scenario.character && token(scenario.character) !== contract.character) return false;
    if (day < Number(when.minDay || contract.createdDay + 1)) return false;
    if (when.activeCharacter && !active.has(token(when.activeCharacter))) return false;
    if (when.route && route(scenario.route) !== route(when.route)) return false;
    return !contract.routes.length || contract.routes.map(route).includes(route(scenario.route));
  }

  function resolveValue(contract, scenario) {
    const configured = scenario.historicalChoices && token(scenario.historicalChoices[contract.id]);
    if (configured) {
      if (!contract.values.includes(configured)) throw new Error(`Invalid historical choice ${contract.id}:${configured}`);
      return configured;
    }
    if (contract.resolution.type === "aiden_active") {
      return scenario.aidenActive === false ? contract.resolution.falseValue : contract.resolution.trueValue;
    }
    if (contract.canonicalDefault) return contract.canonicalDefault;
    throw new Error(`Historical choice ${contract.id} requires an entry-point value`);
  }

  function resolveScenario(scenario) {
    return CONTRACTS.filter((contract) => applies(contract, scenario)).map((contract) => {
      const optionId = resolveValue(contract, scenario);
      return {
      choiceKey: contract.id, optionId,
      storyOnceKey: contract.storyOnceKey,
      storyPath: contract.sourceStory,
      contactId: contract.character,
      points: { ...(contract.ledgerImpactByValue?.[optionId] || contract.ledgerImpact) }
    }; });
  }

  function mergeChoices(existing, resolved, now) {
    const byKey = new Map((Array.isArray(existing) ? existing : []).map((row) => [token(row && row.choiceKey), row]));
    resolved.forEach((row) => byKey.set(token(row.choiceKey), { at: now || Date.now(), ...row, text: row.optionId }));
    return Array.from(byKey.values());
  }

  function seedCheckpoint(state, input = {}) {
    const choices = state.world.choices;
    const explicit = { ...choices, ...(input.historicalChoices || {}) };
    if (!explicit.d9_mason_nts_coach_identity_v1 && ["aiden", "chris"].includes(token(state.world.coachIdentity))) explicit.d9_mason_nts_coach_identity_v1 = token(state.world.coachIdentity);
    const seeded = [];
    for (const contract of CONTRACTS) {
      const scenario = { day: state.world.day, character: contract.character, route: state.world.routes[contract.character], activeCharacters: state.world.activeCharacters, aidenActive: input.aidenActive ?? state.world.activeCharacters.includes("aiden"), historicalChoices: explicit };
      if (!applies(contract, scenario)) continue;
      const value = resolveValue(contract, scenario);
      const old = state.progression.choiceReceipts[contract.id];
      if (old && old.selectedOptionId !== value) throw new Error(`Historical choice conflicts with receipt ${contract.id}`);
      const points = { ...(contract.ledgerImpactByValue?.[value] || contract.ledgerImpact) };
      choices[contract.id] = value;
      if (!old) state.progression.choiceReceipts[contract.id] = { choiceGroupId: contract.id, storyId: contract.sourceStoryId, sourceStepKey: contract.sourceStepKey, selectedOptionId: value, resultValue: value, options: contract.values.map(id => ({ id, value: id })), reconstructed: true, reconstructionSource: "historical_branch_entry_contract", committedRevision: Number(state.revision) || 0 };
      seeded.push({ choiceKey: contract.id, optionId: value, storyOnceKey: contract.storyOnceKey, storyPath: contract.sourceStory, contactId: contract.character, points });
      if (!state.progression.onceKeys.includes(contract.storyOnceKey)) state.progression.onceKeys.push(contract.storyOnceKey);
    }
    // Entry point route points are the caller's cumulative selection. Record
    // the historical choice without awarding those points a second time.
    state.progression.choicesLog = mergeChoices(state.progression.choicesLog, seeded, Number(state.revision) + 1);
    return seeded;
  }

  const api = Object.freeze({ version: 2, contracts: CONTRACTS, applies, resolveValue, resolveScenario, mergeChoices, seedCheckpoint });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.BranchStateContracts = api;
})(typeof window !== "undefined" ? window : globalThis);
