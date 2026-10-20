(function(root){
  'use strict';
  if(root.EntitlementService?.__canonical){if(typeof module==='object'&&module.exports)module.exports=root.EntitlementService;return;}
  const key={mason:'patreon_mason_day9_15_unlock_v1',hailey:'patreon_hailey_day16_20_unlock_v1',lena:'patreon_lena_day16_20_unlock_v1',gallery:'gallery_full_unlock_v1',developer:'dev_timeline_unlock_v1'};
  const readFlag=name=>{try{return root.localStorage?.getItem(key[name])==='1';}catch{return false;}};
  function snapshot(){
    const vault=root.CardVaultSystem;
    const state=vault?.readState?.()||{};
    const ledger=vault?.hasValidRedemptionLedger?.()?vault.readRedemptionLedger():null;
    const ent=ledger?.entitlements||{};
    return Object.freeze({
      supporterTier:String(ent.supporterTier||state.supportTierId||'free'),
      supporterTierRank:Number(ent.supporterTierRank||state.supportTierRank||0),
      masonUpdate:ent.masonAccess===true||readFlag('mason'),
      haileyUpdate:ent.haileyAccess===true||readFlag('hailey'),
      lenaUpdate:ent.lenaAccess===true||readFlag('lena'),
      galleryFull:ent.galleryAccess===true||readFlag('gallery'),
      developer:ent.devAccess===true||readFlag('developer')
    });
  }
  function storyMeta(input){
    const raw=typeof input==='string'?{path:input}:(input||{}),path=String(raw.path||raw.storyPath||'').replace(/\\/g,'/');
    const day=Number(raw.day||path.match(/(?:^|\/)DAY(\d+)(?:\/|_|-)/i)?.[1]||0);
    const contact=String(raw.contactId||raw.characterId||raw.ownerId||raw.owner||path.match(/_(mason|evelyn|hailey|lena|aiden)(?:_|\.)/i)?.[1]||'').trim().toLowerCase();
    return {path,day,contact};
  }
  // Hailey and her associated Aiden scenes are now free. Lena's new update
  // has its own entitlement; historical update receipts never imply it.
  function requiredEntitlementForStory(input){const meta=storyMeta(input);return meta.day>=16&&meta.day<=20&&(meta.contact==='lena'||/_lena(?:_|\.)/i.test(meta.path))?'lenaUpdate':'';}
  function isPremiumStory(input){return requiredEntitlementForStory(input)==='lenaUpdate';}
  function canAccessStory(input){const required=requiredEntitlementForStory(input),entitlements=snapshot();return !required||entitlements[required]===true||entitlements.developer===true;}
  root.EntitlementService=Object.freeze({__canonical:true,snapshot,storyMeta,requiredEntitlementForStory,isPremiumStory,canAccessStory});
  if(typeof module==='object'&&module.exports)module.exports=root.EntitlementService;
})(typeof window!=='undefined'?window:globalThis);
