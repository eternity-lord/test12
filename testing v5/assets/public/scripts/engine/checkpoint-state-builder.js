(function(root,factory){const api=factory(root,typeof module==='object'&&module.exports?require('../game-time-service'):root.GameTimeService);if(typeof module==='object'&&module.exports)module.exports=api;root.CheckpointStateBuilder=api.CheckpointStateBuilder;})(typeof globalThis!=='undefined'?globalThis:this,function(root,GameTimeService){
  'use strict';
  const clone=v=>JSON.parse(JSON.stringify(v));
  const ONLYFUN_TUTORIAL_CREATOR=Object.freeze({id:'static_muse',creatorId:'static_muse',displayName:'Sexminator',name:'Sexminator',avatar:'assets/pictures/OnlyFun/avatars/Sexminator.jpg',priceEur:7.99,tagline:'Male creator account. Subscribe to unlock the private route feed.',unlocked:true,unlockedAt:1});
  // Historical entry points do not replay UI interactions.  These are the
  // cumulative, route-independent consequences which natural progression has
  // necessarily committed before the first story of a day can run.
  function historicalConsequences(day){
    const d=Math.max(1,Math.min(20,Number(day)||1)),onlyfunComplete=d>=2,hakComplete=d>=3;
    return {apps:[...(onlyfunComplete?['onlyfun']:[]),...(hakComplete?['hak']:[])],onlyfun:onlyfunComplete?{unlocked:true,signedIn:true,creators:{static_muse:clone(ONLYFUN_TUTORIAL_CREATOR)},accounts:{static_muse:clone(ONLYFUN_TUTORIAL_CREATOR)},subscriptions:{static_muse:true},receipts:{'checkpoint:onlyfun:download':{operationId:'checkpoint:onlyfun:download',kind:'unlock'},'checkpoint:onlyfun:static_muse':{operationId:'checkpoint:onlyfun:static_muse',kind:'account-unlock'},'checkpoint:onlyfun:subscription':{operationId:'checkpoint:onlyfun:subscription',kind:'subscription'}},seeded:false,onboarding:{required:false,completed:true,state:'done'}}:{unlocked:false,signedIn:false,creators:{},accounts:{},subscriptions:{},receipts:{},seeded:false,onboarding:{required:false,completed:false,state:'locked'}},hak:{unlocked:hakComplete,completed:hakComplete}};
  }
  // Kept in lockstep with game-state-engine.js's own fallback state shape --
  // INITIALIZE_START_FROM/INITIALIZE_NEW_UPDATE/INITIALIZE_CHECKPOINT apply
  // this object onto the LIVE engine state via a full Object.assign(s,built),
  // so any canonical progression/execution/presence sub-field missing here
  // is not merely absent from the checkpoint -- it is DELETED from the real
  // running state (undefined), even though the engine's own migrate()/
  // fallbackBase() guarantee it always exists on a normal boot or save load.
  // A reader that assumes that guarantee (e.g. getStoredProgress indexing
  // progression.contactProgress[id]) throws, and every caller upstream of
  // that read silently swallows the exception -- so this drift previously
  // surfaced only as an unrelated-looking stall, never as a visible error.
  const baseState=(o={})=>({schemaVersion:4,profileId:o.profileId||'default',sessionId:o.sessionId||'',revision:0,transactionId:null,world:{day:1,gameTime:GameTimeService.initialClock(1),routes:{},routeLocks:{},activeCharacters:[],choices:{},variables:{},masonVariant:'male',coachIdentity:null,appUnlocks:[],entitlements:{},hakPoints:0,rewards:[]},hak:{schemaVersion:1,unlocked:false,visible:false,openable:false,level:0,evidenceProfiles:{},photos:[],evidenceSeen:{},watchlist:{selected:[],targets:{},configured:false,config:null},skills:{unlocked:{}},routePoints:{nts:0,ntr:0,love:0},tutorial:{required:false,completed:false,state:'evidence',resumeTarget:null},gate:null,pendingInteraction:null,receipts:{},migration:{legacyImported:true}},execution:{activeStoryId:null,activeStoryPath:null,activeContactId:null,activeStepIndex:0,activeBranchId:null,status:'idle',lease:null,generation:0,operationEpoch:0,cursor:null,blocked:null},progression:{completedStoryIds:[],onceKeys:[],continuationReceipts:{},commandReceipts:{},pendingStoryQueue:[],branchReceipts:{},choiceReceipts:{},effectReceipts:{},contactProgress:{},choicesLog:[],pendingStory:null,pendingInteraction:null,conversationsCache:{}},conversations:{eventsByContact:{},latestEventByContact:{},unreadByContact:{}},notifications:{committedEvents:{},displayedEventIds:[]},presence:{contactId:null,mountState:null,navigationTransactionId:null,committedRevision:0},recovery:{transactionStatus:'stable',previousStableRevision:0,pendingCommand:null,lastError:null},operation:null});
  class CheckpointStateBuilder{
    constructor(manifest={nodes:[]}){this.manifest=manifest;this.nodes=Array.isArray(manifest.nodes)?manifest.nodes:(Array.isArray(manifest.stories)?manifest.stories:[]);}
    build(input={}){const s=baseState(input);const day=Math.max(1,Math.min(20,Number(input.day)||1)),history=historicalConsequences(day);s.world.day=day;s.world.routes=clone(input.routes||{});s.world.activeCharacters=[...new Set(input.activeCharacters||[])].map(v=>String(v||'').trim().toLowerCase()).filter(Boolean).sort();s.world.routeLocks=day>=9?Object.fromEntries(s.world.activeCharacters.filter(id=>id!=='aiden').map(id=>[id,s.world.routes[id]||'love'])):{};s.world.choices=clone(input.choices||{});s.world.masonVariant=input.masonVariant==='female'?'female':'male';s.world.coachIdentity=input.coachIdentity||input.coach||null;s.world.entitlements=clone(input.entitlements||{});s.world.appUnlocks=[...new Set([...(history.apps||[]),...(input.apps||input.appUnlocks||[])])].sort();s.world.hakPoints=Number(input.hakPoints)||0;s.hak.unlocked=s.world.appUnlocks.includes('hak');s.hak.visible=s.hak.unlocked;s.hak.openable=s.hak.unlocked;s.hak.level=s.hak.unlocked?Math.max(1,Number(input.hakLevel)||1):0;s.hak.routePoints={...s.hak.routePoints,...clone(input.hakRoutePoints||input.routePoints||{})};s.hak.skills={unlocked:clone(input.hakSkills?.unlocked||input.hakSkills||{})};s.hak.evidenceProfiles=clone(input.hakEvidence||{});s.hak.photos=clone(input.hakPhotos||[]);s.hak.evidenceSeen=clone(input.hakEvidenceSeen||{});s.hak.watchlist={...s.hak.watchlist,...clone(input.hakWatchlist||{})};s.hak.tutorial={...s.hak.tutorial,...clone(input.hakTutorial||{}),completed:input.hakTutorial?.completed??history.hak.completed,required:input.hakTutorial?.required??false};
      // The first point choices occur on Day 3. Later entry points already
      // include that introduction; Day 3 still has its first real award ahead.
      s.hak.tutorial.firstPointsThoughtShown=input.hakTutorial?.firstPointsThoughtShown??(day>=4);
      const of=history.onlyfun;s.onlyfun={schemaVersion:1,unlocked:of.unlocked,signedIn:input.onlyfunSignedIn??of.signedIn,creators:clone(input.onlyfunCreators||of.creators),accounts:clone(input.onlyfunAccounts||of.accounts),subscriptions:clone(input.onlyfunSubscriptions||of.subscriptions),posts:clone(input.onlyfunPosts||[]),seenPosts:clone(input.onlyfunSeenPosts||{}),pendingGates:clone(input.onlyfunPendingGates||{}),pendingInteraction:null,receipts:clone(input.onlyfunReceipts||of.receipts),onboarding:clone(input.onlyfunOnboarding||of.onboarding),migration:{legacyImported:true,seeded:input.onlyfunSeeded??of.seeded}};
      const eligible=this.nodes.filter(n=>Number(n.day||n.chapterDay||0)<day&&this._routeAllows(n,s.world.routes));for(const n of eligible){const id=n.onceKey||n.storyId||n.id||n.path;if(id)s.progression.completedStoryIds.push(String(n.storyId||n.id||n.path||id)),s.progression.onceKeys.push(String(id));}
      const pending=this.nodes.filter(n=>Number(n.day||n.chapterDay||0)===day&&this._routeAllows(n,s.world.routes)).sort((a,b)=>String(a.path||'').localeCompare(String(b.path||'')))[0];if(pending){s.execution.activeStoryId=String(pending.storyId||pending.id||pending.path||'');s.execution.activeStoryPath=pending.path||pending.storyPath||null;s.execution.activeContactId=pending.contactId||pending.contact||pending.owner||null;}
      const contracts=typeof module==='object'&&module.exports?require('../branch-state-contracts'):root.BranchStateContracts||root.window?.BranchStateContracts;if(!contracts?.seedCheckpoint)throw new Error('BRANCH_STATE_CONTRACTS_REQUIRED');contracts.seedCheckpoint(s,input);
      s.progression.completedStoryIds=[...new Set(s.progression.completedStoryIds)].sort();s.progression.onceKeys=[...new Set(s.progression.onceKeys)].sort();s.world.gameTime=GameTimeService.initialClock(day,s.execution.activeStoryPath,s);return s;}
    _routeAllows(n,routes){const owner=String(n.contactId||n.contact||n.owner||'').toLowerCase(),required=String(n.route||n.requiredRoute||'').toLowerCase();return !required||required==='shared'||!owner||!routes[owner]||String(routes[owner]).toLowerCase()===required;}
    compare(a,b,ignored=['sessionId']){const strip=v=>{const x=clone(v);for(const k of ignored)delete x[k];if(x.execution)x.execution.lease=null;x.transactionId=null;return x;};return JSON.stringify(strip(a))===JSON.stringify(strip(b));}
  }
  CheckpointStateBuilder.historicalConsequences=historicalConsequences;
  CheckpointStateBuilder.reconstructSelectionHistory=function(state,catalog){
    if(!Array.isArray(catalog))throw new Error('CANONICAL_CHRONOLOGY_CATALOG_REQUIRED');
    const grammar=typeof module==='object'&&module.exports?require('./condition-grammar'):root.ConditionGrammar;
    const family=value=>['nts','nts1','nts2','nts_coach'].includes(String(value).toLowerCase())?'nts':String(value).toLowerCase();
    const once=new Set(state.progression.onceKeys||[]),active=new Set(state.world.activeCharacters||[]),added=[];
    const accessor=grammar.canonicalAccessor(state),strictAccessor={...accessor,
      lookup:key=>{if(!Object.hasOwn(state.world.variables||{},key)&&!Object.hasOwn(state.world.choices||{},key))throw new Error('UNKNOWN_HISTORICAL_VARIABLE');return accessor.lookup(key);},
      once:key=>{if(!once.has(key))throw new Error('UNKNOWN_HISTORICAL_ONCE');return true;}};
    function branchKnown(guard){try{return grammar.evaluateCondition(guard.rawCondition||guard.condition,strictAccessor)===(guard.expectedResult??true);}catch{return null;}}
    function guardsMet(producer){return (producer.guards||[]).every(g=>g.choiceGroupId?state.progression.choiceReceipts?.[g.choiceGroupId]?.selectedOptionId===g.selectedOptionId:branchKnown(g)===true);}
    for(const entry of catalog){
      if(!(Number(entry.day)>0&&Number(entry.day)<state.world.day)||!once.has(entry.onceKey))continue;
      const owner=String(entry.contactId||''),route=family(entry.route||'');
      if(['lena','evelyn','mason','hailey'].includes(owner)&&(!active.has(owner)||(route&&route!=='shared'&&route!==family(state.world.routeLocks?.[owner]||state.world.routes?.[owner]))))continue;
      const grouped=new Map();
      for(const producer of entry.producers||[]){
        if(producer.kind!=='variable'||producer.remove||producer.unresolved||!Object.hasOwn(state.world.variables||{},producer.key))continue;
        const routeKey=/^route_[a-z0-9_]+_locked_v1$/.test(producer.key),expected=state.world.variables[producer.key];
        if(routeKey?family(expected)!==family(producer.value):String(expected)!==String(producer.value))continue;
        const list=grouped.get(producer.key)||[];list.push(producer);grouped.set(producer.key,list);
      }
      for(const writers of grouped.values()){
        // A later route-confirmation step can have a fully known route guard
        // without identifying the earlier choice. Its own once consequence
        // is still proven; that does not invent the missing choice receipt.
        for(const writer of writers)if(writer.onceKey&&guardsMet(writer)&&!once.has(writer.onceKey)){once.add(writer.onceKey);added.push({key:writer.onceKey,story:entry.path,sourceStepKey:writer.sourceStepKey});}
        if(writers.some(p=>(p.guards||[]).some(g=>!g.choiceGroupId&&branchKnown(g)===null)))continue;
        const possible=writers.filter(p=>(p.guards||[]).every(g=>g.choiceGroupId||branchKnown(g)===true));if(!possible.length)continue;
        const firstChoices=(possible[0].guards||[]).filter(g=>g.choiceGroupId);
        const unanimous=firstChoices.filter(g=>possible.every(p=>(p.guards||[]).some(other=>other.choiceGroupId===g.choiceGroupId&&other.selectedOptionId===g.selectedOptionId)));
        if(possible.some(p=>(p.guards||[]).filter(g=>g.choiceGroupId).length!==unanimous.length))continue;
        for(const choice of unanimous){
          const old=state.progression.choiceReceipts[choice.choiceGroupId];
          if(old&&old.selectedOptionId!==choice.selectedOptionId){const error=new Error('CHRONOLOGY_CAUSAL_CONFLICT: reconstructed route conflicts with explicit historical choice');error.code='CHRONOLOGY_CAUSAL_CONFLICT';error.chronology={story:entry.path,choiceGroupId:choice.choiceGroupId,existing:old.selectedOptionId,required:choice.selectedOptionId};throw error;}
          if(!old){state.progression.choiceReceipts[choice.choiceGroupId]={choiceGroupId:choice.choiceGroupId,storyId:entry.id||entry.path,sourceStepKey:choice.sourceStepKey,selectedOptionId:choice.selectedOptionId,resultValue:choice.selectedOptionId,options:[{id:choice.selectedOptionId,value:choice.selectedOptionId}],reconstructed:true,reconstructionSource:'canonical_entry_selection',committedRevision:Number(state.revision)||0};state.world.choices[choice.choiceGroupId]=choice.selectedOptionId;}
        }
        for(const writer of possible){
          if(!guardsMet(writer))continue;
          if(writer.onceKey&&!once.has(writer.onceKey)){once.add(writer.onceKey);added.push({key:writer.onceKey,story:entry.path,sourceStepKey:writer.sourceStepKey});}
          for(const consequence of entry.producers||[])if(consequence.kind==='once'&&!consequence.unresolved&&consequence.authority==='choice_consequence'&&(consequence.guards||[]).some(g=>unanimous.some(c=>c.choiceGroupId===g.choiceGroupId&&c.selectedOptionId===g.selectedOptionId))&&guardsMet(consequence)&&!once.has(consequence.key)){once.add(consequence.key);added.push({key:consequence.key,story:entry.path,sourceStepKey:consequence.sourceStepKey});}
        }
      }
    }
    state.progression.onceKeys=[...once];return {added};
  };
  // Entry selection happens after the caller has reconstructed its routes and
  // explicit historical choices. A filename-first provisional node is never
  // the authority for the committed Start From / New Update story.
  CheckpointStateBuilder.selectCanonicalEntry=function(state,catalog){
    const grammar=typeof module==='object'&&module.exports?require('./condition-grammar'):root.ConditionGrammar;
    if(!Array.isArray(catalog)||!catalog.length||!grammar?.getNextCanonicalStory)throw new Error('CANONICAL_CHRONOLOGY_CATALOG_REQUIRED');
    const selected=grammar.getNextCanonicalStory(state,catalog,{day:state.world.day,respectActive:false,service:GameTimeService});
    if(selected.status!=='MISSING'||!selected.path){const error=new Error(selected.status+': '+String(selected.reason||'No eligible entry story'));error.code=selected.status;error.chronology=selected;throw error;}
    return selected;
  };
  return {CheckpointStateBuilder,baseState,historicalConsequences};
});
