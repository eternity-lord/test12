(function (root, factory) {
  'use strict';
  const data = typeof module === 'object' && module.exports
    ? require('./generated/hak-evidence-thoughts-data') : root.HakEvidenceThoughtsData;
  const api = factory(data);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HakEvidenceThoughts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (data) {
  'use strict';
  const token = value => String(value || '').trim().toLowerCase();
  // Mason's selectable presentation may change the folder of the same asset.
  // All other filename/path changes must still match the acquired evidence.
  const assetKey = value => String(value || '').trim().replace(/\\/g, '/').replace(/^\.\//, '').split(/[?#]/)[0].toLowerCase()
    .replace(/\/(?:male|female)_mason\//g, '/{mason}/').replace(/\/mason_(?:male|female)\//g, '/{mason}/');
  const itemId = item => String(item?.id || item?.evidenceId || '').trim();
  const itemAsset = item => item?.url || item?.src || item?.image || '';
  const explicitOwner = item => token(item?.profileId || item?.targetId || item?.contactId || item?.characterId || item?.ownerId);

  function isOwned(state, item, link, profileId) {
    const id = itemId(item), asset = assetKey(itemAsset(item));
    if (!id || !asset || asset !== assetKey(link.asset)) return false;
    if (profileId && token(profileId) !== link.profileId) return false;
    if (explicitOwner(item) && explicitOwner(item) !== link.profileId) return false;
    const active = state.world?.activeCharacters;
    if (Array.isArray(active) && !active.includes(link.profileId)) return false;
    for (const [owner, profile] of Object.entries(state.hak?.evidenceProfiles || {})) {
      if (token(owner) !== link.profileId) continue;
      if ((profile?.evidences || []).some(owned => itemId(owned) === id && assetKey(itemAsset(owned)) === asset &&
        (!explicitOwner(owned) || explicitOwner(owned) === link.profileId))) return true;
    }
    return (state.hak?.photos || []).some(owned => itemId(owned) === id && assetKey(itemAsset(owned)) === asset &&
      (!explicitOwner(owned) || explicitOwner(owned) === link.profileId));
  }

  function hasReceipt(state, link) {
    const receipt = state.progression?.effectReceipts?.[link.receiptId];
    if (!receipt || receipt.eventId !== link.receiptId || receipt.effectType !== 'hak_overlay' ||
      receipt.storyId !== link.storyId || token(receipt.contactId) !== link.contactId ||
      Number(receipt.stepIndex) !== link.overlayStepIndex) return false;
    const transactionId = String(receipt.transactionId || '');
    const operationToken = ':' + link.operationId + ':COMMIT_STORY_EFFECT:';
    // A root-only receipt is sufficient for old root overlays. Nested steps
    // share root indices, so require their exact executed operation identity.
    if (link.overlayPath.includes('.') && !transactionId.includes(operationToken)) return false;
    if (transactionId.includes(':COMMIT_STORY_EFFECT:') && !transactionId.includes(operationToken)) return false;
    const execution = state.execution || {}, cursor = execution.cursor || {}, pending = cursor.pendingPresentationAck;
    if ((execution.activeStoryId === link.storyId || execution.activeStoryPath === link.storyPath ||
      cursor.storyId === link.storyId || cursor.storyPath === link.storyPath) &&
      (pending?.operationId === link.operationId ||
        (cursor.operationId === link.operationId && ['waiting_for_presentation', 'operation_committed'].includes(cursor.phase)))) return false;
    return true;
  }

  // Return source English only; the caller uses existing sourceText/template
  // translation. Never fetch or interpret a story while opening old evidence.
  function forEvidence(state = {}, item = {}, profileId = '') {
    const texts = [], seen = new Set();
    for (const link of data?.entries?.[itemId(item)] || []) {
      if (!isOwned(state, item, link, profileId) || !hasReceipt(state, link)) continue;
      for (const id of link.thoughtIds || []) {
        const text = data.thoughts[id];
        if (typeof text !== 'string' || !text.trim() || seen.has(text)) continue;
        seen.add(text); texts.push(text);
      }
    }
    return texts;
  }
  return Object.freeze({forEvidence});
});
