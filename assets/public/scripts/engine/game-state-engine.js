(function(root,factory){const deps=typeof module==='object'&&module.exports?{hakSkills:require('../hak-skill-definitions'),gameTime:require('../game-time-service'),entitlement:require('../entitlement-service'),grammar:require('./condition-grammar'),storage:require('./engine-storage'),checkpoint:require('./checkpoint-state-builder')}:{storage:root.EngineStorage,checkpoint:{baseState:root.CheckpointStateBuilderBase}};const api=factory(deps,root);if(typeof module==='object'&&module.exports)module.exports=api;root.GameStateEngine=api.singleton;root.GameStateEngineClass=api.GameStateEngineClass})(typeof globalThis!=='undefined'?globalThis:this,function(deps,root){'use strict';const{EngineStorage:EngineStorage,MemoryStorage:MemoryStorage,checksum:checksum}=deps.storage;const GameTimeService=deps.gameTime||root.GameTimeService;const DEFAULT_ACTIVE_CHARACTERS=['evelyn','hailey','mason','lena','aiden'];
const requirementsMet=(requirements,state)=>!requirements||(deps.grammar||root.ConditionGrammar).requirementsMet(requirements,state);
const GAME_TIME_PROGRESS_COMMANDS=new Set(['COMMIT_STORY_STEP','COMMIT_MESSAGE_EVENT','COMMIT_STORY_EFFECT','COMMIT_NOTIFICATION_EVENT','SET_CHOICE','RECORD_CHOICE_DECISION','RECORD_BRANCH_DECISION','SET_FLAG','SET_STORY_VARIABLE','SET_ROUTE_LOCK','RECORD_REWARD','UNLOCK_APP','UNLOCK_HAK','ADD_HAK_EVIDENCE','ADD_HAK_PHOTO','SET_HAK_WATCHLIST','SET_HAK_GATE','UNLOCK_ONLYFUN','UNLOCK_ONLYFUN_ACCOUNT','ADD_ONLYFUN_POST','SET_ONLYFUN_PENDING_GATE','UNLOCK_GALLERY_MEDIA','COMPLETE_STORY']);
// Each paid HAK skill owns its presentation independently. Legacy allocations
// are consumed without replaying old purchases; an explicit unfinished thought
// remains pending across the migration and across allocation resets.
function normalizeHakSkillSpendThoughts(hak){
  const tutorial=hak?.tutorial||{},raw=tutorial.skillSpendThoughts;
  const hasLedger=raw&&typeof raw==='object'&&!Array.isArray(raw),shown={},pending=[];
  if(hasLedger){for(const [id,value] of Object.entries(raw.shown||{}))if(id&&value===true)shown[id]=true;}
  const legacy=tutorial.firstSkillSpendThought;
  if(!hasLedger){
    for(const [id,skill] of Object.entries(hak?.skills?.unlocked||{})){
      const cost=Number(skill?.cost??(deps.hakSkills||root.HakSkillDefinitions)?.byId.get(id)?.cost);
      if(cost>0&&id!==String(legacy?.skillId||''))shown[id]=true;
    }
  }
  const rows=hasLedger?(Array.isArray(raw.pending)?raw.pending:[]):(legacy?[legacy]:[]);
  const skillIds=new Set(),operations=new Set();
  for(const row of rows){
    const skillId=String(row?.skillId||'').trim(),operationId=String(row?.operationId||'').trim(),branch=String(row?.branch||'').trim().toLowerCase(),cost=Number(row?.cost);
    if(!skillId||!operationId||!['nts','ntr','love'].includes(branch)||!(cost>0)||shown[skillId]||skillIds.has(skillId)||operations.has(operationId))continue;
    pending.push({operationId,skillId,branch,cost});skillIds.add(skillId);operations.add(operationId);
  }
  return{pending,shown};
}
function historicalTimeCursor(row){
  const key=String(row?.sourceStepKey||'');
  if(/^(0|[1-9]\d*)(\.(then|else)\.(0|[1-9]\d*))*$/.test(key)){
    const parts=key.split('.'),branchPath=[];for(let i=1;i<parts.length;i+=2)branchPath.push({branch:parts[i],index:Number(parts[i+1])});
    return{rootIndex:Number(parts[0]),branchPath};
  }
  // Old message records retain only a root step index. This is bounded authored
  // precision, not a fabricated nested address; the transcript stays unchanged.
  return Number.isInteger(row?.stepIndex)&&row.stepIndex>=0?{rootIndex:row.stepIndex,branchPath:[]}:null;
}
function progressGameTime(previous,next,command){
  if(!GAME_TIME_PROGRESS_COMMANDS.has(command.type)||previous.world.day!==next.world.day)return;
  const before=previous.execution,after=next.execution,path=before.activeStoryPath;
  if(!path||!before.lease||String(command.leaseId||'')!==String(before.lease.id||''))return;
  const completed=command.type==='COMPLETE_STORY';
  if(!completed&&(after.activeStoryPath!==path||after.lease?.id!==before.lease.id))return;
  const cursor=completed?before.cursor:after.cursor;
  // Presentation/intent acknowledgements at the same canonical address are
  // idle for clock purposes, including the first such write following Load.
  if(!completed&&GameTimeService.cursorPositionKey(before.cursor)===GameTimeService.cursorPositionKey(cursor)&&before.activeStepIndex===after.activeStepIndex)return;
  const clock=GameTimeService.clockForProgress(next,path,cursor||{rootIndex:after.activeStepIndex,branchPath:[]},completed,before.cursor||{rootIndex:before.activeStepIndex,branchPath:[]}),old=next.world.gameTime;
  if(old?.version===clock.version&&old.minuteOfDay===clock.minuteOfDay&&old.absoluteMinute===clock.absoluteMinute&&old.elapsedSeconds===clock.elapsedSeconds&&old.anchorOffsetMinutes===clock.anchorOffsetMinutes&&old.logicalSlot===clock.logicalSlot&&old.sourceStory===clock.sourceStory&&JSON.stringify(old.elapsedKeys)===JSON.stringify(clock.elapsedKeys))return;
  if(next.world===previous.world)next.world={...next.world};
  next.world.gameTime=clock;
}
function stampCommittedGameTime(state,events){
  let stamp;const current=()=>stamp||(stamp=GameTimeService.captureStamp(GameTimeService.readWorld(state.world)));
  for(const event of events){
    if(event.type==='notification:committed'){
      const row=state.notifications.committedEvents[event.notificationId];
      if(row){row.gameTime={...current()};event.gameTime={...current()};}
    }else if(event.type==='story:effect-committed'&&['instagram_post','instagram_story','snapgram_post'].includes(event.effectType)){
      state.progression.effectReceipts[event.eventId].gameTime={...current()};event.gameTime={...current()};event.payload.gameTime={...current()};
    }else if(event.type==='onlyfun:post-added'&&!event.reused){
      const post=state.onlyfun.posts.find(row=>row.id===event.postId);
      if(post&&!GameTimeService.normalizeStamp(post.gameTime))post.gameTime={...current()};
      if(event.post)event.post.gameTime=post?.gameTime?{...post.gameTime}:null;
    }
  }
}
function repairLenaDay16PrematureCompletion(state){
  const path='story/DAY16/nts/DAY16_02_LENA_EVENING_NTS.json';
  const storyId='d16_02_lena_evening_nts',sourceId='d16_01_lena_afternoon_nts';
  const execution=state.execution,progression=state.progression,cursor=execution?.cursor;
  // The old afternoon renderer could complete the newly admitted evening
  // lease with the afternoon onceKey, producing this impossible self-handoff.
  // Only repair the confirmed, completely unplayed episode. Completed or
  // partially played evenings and unrelated idle saves remain authoritative.
  if(Number(state.world?.day)!==16||state.world?.routes?.lena!=='nts'||
      state.world?.variables?.route_lena_locked_v1!=='nts'||
      !state.world?.activeCharacters?.includes('lena')||
      execution?.status!=='idle'||execution.activeStoryId||execution.activeStoryPath||execution.lease||
      cursor?.storyPath!==path||cursor.storyId!==storyId||cursor.contactId!=='lena'||
      cursor.phase!=='completed'||cursor.completion!=='completed'||cursor.rootIndex!==0||
      cursor.branchPath?.length||cursor.pendingUserIntent||cursor.pendingPresentationAck||
      progression?.pendingStory||progression?.pendingInteraction||progression?.pendingStoryQueue?.length||
      (progression?.dayTransitionIntent&&Number(progression.dayTransitionIntent.sourceDay)!==16)||
      !progression?.completedStoryIds?.includes(storyId)||!progression.completedStoryIds.includes(sourceId)||
      !progression.onceKeys?.includes(sourceId+'_v1')||progression.onceKeys.includes(storyId+'_v1'))return state;
  const receipts=Object.entries(progression.continuationReceipts||{});
  const self=receipts.filter(([,r])=>r.sourceStoryId===storyId&&r.targetStoryId===storyId&&
    r.deferred===true&&String(r.transactionId||'').startsWith('complete-story:')&&
    String(r.transactionId).endsWith(':'+path));
  if(self.length!==1||!receipts.some(([,r])=>r.sourceStoryId===sourceId&&r.targetStoryId===storyId))return state;
  const belongs=r=>r?.storyPath===path||r?.storyId===storyId;
  if(Object.values(state.conversations?.eventsByContact||{}).some(rows=>rows.some(belongs))||
      Object.values(progression.effectReceipts||{}).some(belongs))return state;
  progression.completedStoryIds=progression.completedStoryIds.filter(value=>value!==storyId);
  delete progression.continuationReceipts[self[0][0]];
  const generation=Math.max(0,Number(execution.generation)||0)+1;
  const leaseId='l-'+id('lena-day16-completion-repair',state.playthrough?.id,generation);
  Object.assign(execution,{activeStoryId:storyId,activeStoryPath:path,activeContactId:'lena',
    activeStepIndex:0,activeBranchId:null,status:'running',generation,blocked:null,
    lease:{id:leaseId,storyId,generation,createdRevision:state.revision}});
  execution.cursor={...cursor,operationId:null,operationType:null,branchReceiptId:null,gotoTarget:null,
    pendingUserIntent:null,pendingPresentationAck:null,phase:'ready_to_interpret',
    completion:'in_progress',continuation:'none',leaseId,storyRevision:state.revision};
  state.presence={contactId:null,mountState:null,storyId:null,navigationTransactionId:null,committedRevision:state.revision};
  state.world.gameTime=GameTimeService.clockForAdmission(state,path);
  return state;
}
// A schema upgrade may reconstruct historical stamps once. Current-clock saves
// and scalar reads never scan transcript or notification history.
function migrateGameTime(state){
  const world=state.world||(state.world={}),prior=world.gameTime;
  const hadClock=GameTimeService.isStoredClock(prior);
  world.gameTime=GameTimeService.migrateClock(state);
  if(hadClock)return state;
  const eventTimes=new Map(),notifications=Object.values(state.notifications?.committedEvents||{}),wantedEvents=new Set(notifications.map(row=>String(row.sourceEventId||row.messageEventId||'')));
  for(const events of Object.values(state.conversations?.eventsByContact||{}))for(const event of events||[]){
    if(!wantedEvents.has(String(event.eventId||'')))continue;
    const stamp=GameTimeService.captureStamp(GameTimeService.resolveStamp(event,{storyPath:event.storyPath||event.storyId,onceKey:event.storyOnceKey,cursor:historicalTimeCursor(event)}));
    if(stamp&&event.eventId)eventTimes.set(String(event.eventId),stamp);
  }
  for(const notification of notifications){
    const stamp=GameTimeService.normalizeStamp(notification.gameTime)||eventTimes.get(String(notification.sourceEventId||notification.messageEventId||''))||GameTimeService.resolveStamp(notification.payload,{storyPath:notification.storyPath||notification.payload?.storyPath,onceKey:notification.payload?.onceKey,cursor:historicalTimeCursor(notification.payload)});
    if(stamp)notification.gameTime=GameTimeService.captureStamp(stamp);
  }
  for(const receipt of Object.values(state.progression?.effectReceipts||{})){
    if(!['instagram_post','instagram_story','snapgram_post'].includes(receipt.effectType))continue;
    const stamp=GameTimeService.resolveStamp(receipt,{storyPath:receipt.storyPath||receipt.storyId,cursor:historicalTimeCursor(receipt)});if(stamp)receipt.gameTime=GameTimeService.captureStamp(stamp);
  }
  for(const post of state.onlyfun?.posts||[]){const stamp=GameTimeService.resolveStamp(post,{kind:'onlyfun',id:String(post.id||''),storyPath:post.storyPath,onceKey:post.onceKey});if(stamp)post.gameTime=GameTimeService.captureStamp(stamp)}
  return state;
}


// Canonical execution cursor: explicit phases (never an ambiguous boolean)
// so every consumer -- StoryInterpreter, tests, future renderer diagnostics
// -- agrees on what "the story is currently doing" means. See cursor field
// docs on defaultCursorShape() below.
const CURSOR_PHASES=['ready_to_interpret','operation_committed','waiting_for_presentation','waiting_for_user_intent','ready_to_advance','completed','continuation_pending','blocked_error'];
// Sentinel execution.activeContactId/cursor.contactId for a global story
// (no owning contact thread -- set_flag/instagram_post/... chains). Matches
// the literal convo-runtime.js's ensureCanonicalStoryLease already uses;
// exported here so that (and future Group 1 cutover code) can read one
// shared constant instead of duplicating the string.
const GLOBAL_STORY_CONTACT='__global_story__';
// Performance: command-scoped copy-on-write (FINAL PERFORMANCE BLOCKER,
// 2026-08-19). _dispatch() previously did `next=clone(prev)` -- a full
// deep clone of the ENTIRE multi-domain state -- on every single command,
// and validateState() (called unconditionally right after) ALSO
// unconditionally re-normalized (internally re-cloning) hak/onlyfun/
// cardVault/gallery regardless of whether the command touched them.
// Measured live (CDP JS profiler, 5-conversation session): click-to-paint
// p95 roughly doubled (199ms->403ms) purely from accumulated canonical
// state size, dominated by clone()/commit()/GC cost -- NOT a resource
// leak (DOM/listener/timer/rAF counts all confirmed flat).
// REGISTRY_DOMAINS are the four large, content-registry domains that
// ordinary gameplay (conversation/choice/story-progression/notification/
// world-state) commands NEVER touch -- confirmed via an exhaustive,
// line-by-line audit of every case in apply() below (each entry in
// GAMEPLAY_COMMANDS_EXEMPT_FROM_REGISTRY_CLONE was individually verified
// to only ever read/write execution/world/conversations/notifications/
// presence/progression/recovery). For these commands only, `next` starts
// as a SHALLOW copy of `prev` (registry domains stay reference-identical
// to prev's, validly reused rather than recloned) instead of a full deep
// clone. Every other command type (registry-domain commands themselves,
// plus rare bootstrap/reset/restore/checkpoint commands that legitimately
// touch everything) is UNCHANGED -- full clone, exactly the prior,
// already-proven-safe behavior. See isDispatchExemptFromRegistryClone()
// and the DEV-mode write-set invariant check in _dispatch() for the
// safety net that catches any command wrongly believed exempt.
const REGISTRY_DOMAINS=['hak','onlyfun','cardVault','gallery'];const GAMEPLAY_COMMANDS_EXEMPT_FROM_REGISTRY_CLONE=new Set(['START_STORY','COMMIT_STORY_STEP','COMMIT_MESSAGE_EVENT','COMMIT_STORY_EFFECT','SET_CONTACT_PROGRESS','RECORD_CHOICE_LOG_ENTRY','SET_PENDING_STORY','CLEAR_PENDING_STORY','SET_PENDING_INTERACTION','CLEAR_PENDING_INTERACTION','SET_CONVERSATIONS_CACHE','SET_CHOICE','RECORD_CHOICE_DECISION','SET_FLAG','SET_STORY_VARIABLE','RECORD_BRANCH_DECISION','MARK_ONCE','COMPLETE_STORY','ACTIVATE_CONTINUATION','RECORD_BLOCKED_STATE','OPEN_CONTACT','SET_CONVERSATION_PRESENCE','COMMIT_NOTIFICATION_EVENT','MARK_NOTIFICATION_DISPLAYED','CHANGE_DAY','UNLOCK_APP','SET_ROUTE','SET_ACTIVE_CHARACTER','SET_ROUTE_LOCK','SET_MASON_VARIANT','SET_COACH','RECORD_REWARD','RELEASE_LEASE']);const defaultHakDomain=()=>({schemaVersion:1,unlocked:false,visible:false,openable:false,level:0,evidenceProfiles:{},photos:[],evidenceSeen:{},watchlist:{selected:[],targets:{},configured:false,config:null},skills:{unlocked:{}},routePoints:{nts:0,ntr:0,love:0},tutorial:{required:false,completed:false,state:'evidence',resumeTarget:null},gate:null,pendingInteraction:null,receipts:{},migration:{legacyImported:false}});const defaultOnlyfunDomain=()=>({schemaVersion:1,unlocked:false,signedIn:false,creators:{},accounts:{},subscriptions:{},posts:[],seenPosts:{},pendingGates:{},pendingInteraction:null,receipts:{},migration:{legacyImported:false,seeded:false}});const defaultCardVaultDomain=()=>({version:4,catalogVersion:'',wallpaper:null,masonCardDisplayPreference:'male',masonCardDisplayPreferenceSource:'story_default',points:0,dust:0,owned:{},duplicates:{total:0,byCard:{},dustEarned:0},claimedRewards:{},rewardHistory:[],pointGrantLedger:{},supportTierRank:0,supportTierId:'free',packHistory:[],seenCards:{},dustExchangeHistory:[],pendingReveal:null,orphanedCards:{},onboarding:{version:1,tutorialSeen:false,tutorialCompleted:false,firstFreePackGranted:false,firstFreePackOpenedAt:''},statistics:{packsOpened:0,cardsCollected:0,duplicates:0,dustExchanges:0,dustExchanged:0,pointsFromDust:0,luckHistory:[],pullsByRarity:{},favoriteRarity:''},transactionReceipts:{},migration:{legacyImported:false,schemaVersion:1}});const defaultGalleryDomain=()=>({schemaVersion:1,owned:{},viewed:{},fullUnlock:false,receipts:{},migration:{legacyImported:false,schemaVersion:1}});const fallbackBase=(o={})=>({schemaVersion:4,profileId:o.profileId||'default',sessionId:o.sessionId||'',revision:0,transactionId:null,playthrough:{id:o.playthroughId||'p-'+id(o.profileId||'default',o.sessionId||'',Date.now(),Math.random()),generation:Math.max(1,Number(o.playthroughGeneration)||1),resetAt:Number(o.resetAt)||null},world:{day:1,gameTime:GameTimeService.initialClock(1),routes:{},routeLocks:{},activeCharacters:[...DEFAULT_ACTIVE_CHARACTERS],choices:{},variables:{},masonVariant:'male',coachIdentity:null,appUnlocks:[],entitlements:{},hakPoints:0,rewards:[]},hak:defaultHakDomain(),onlyfun:defaultOnlyfunDomain(),cardVault:defaultCardVaultDomain(),gallery:defaultGalleryDomain(),execution:{activeStoryId:null,activeStoryPath:null,activeContactId:null,activeStepIndex:0,activeBranchId:null,status:'idle',lease:null,generation:0,operationEpoch:0,cursor:null,blocked:null},progression:{completedStoryIds:[],onceKeys:[],continuationReceipts:{},commandReceipts:{},pendingStoryQueue:[],branchReceipts:{},choiceReceipts:{},effectReceipts:{},contactProgress:{},choicesLog:[],pendingStory:null,pendingInteraction:null,conversationsCache:{}},conversations:{eventsByContact:{},latestEventByContact:{},unreadByContact:{}},notifications:{committedEvents:{},displayedEventIds:[]},presence:{contactId:null,mountState:null,navigationTransactionId:null,committedRevision:0},recovery:{transactionStatus:'stable',previousStableRevision:0,pendingCommand:null,lastError:null},operation:null});const clone=v=>JSON.parse(JSON.stringify(v));const id=(...v)=>checksum(v.map(x=>x??'').join('|'));
GAMEPLAY_COMMANDS_EXEMPT_FROM_REGISTRY_CLONE.add('REASSIGN_ACTIVE_CONTACT');
GAMEPLAY_COMMANDS_EXEMPT_FROM_REGISTRY_CLONE.add('REPAIR_PSEUDO_CONTACT_EVENTS');
GAMEPLAY_COMMANDS_EXEMPT_FROM_REGISTRY_CLONE.add('SET_MEETANDGREET_VIEW_STATE');
GAMEPLAY_COMMANDS_EXEMPT_FROM_REGISTRY_CLONE.add('SET_SOCIAL_INTERACTION');
// Choice decisions now commit HAK route-point effects atomically, so they
// must clone registry domains before the reducer mutates s.hak.routePoints.
GAMEPLAY_COMMANDS_EXEMPT_FROM_REGISTRY_CLONE.delete('RECORD_CHOICE_DECISION');
// QA/dev-only mutation-safety net for the command-scoped copy-on-write
// optimization: a plain reference-equality check (see the write-set
// safety net in _dispatch()) only catches a reducer REASSIGNING a shared
// registry domain -- it is blind to a reducer mutating a PROPERTY of that
// still-shared object in place (e.g. `s.hak.unlocked=x` or
// `s.gallery.owned[id]={...}`), which is the more dangerous and more
// likely mistake class, and is exactly what this file's own `'use
// strict'` (line 2) turns into an immediate, loud TypeError against a
// frozen object instead of silent corruption. Deep, not shallow --
// seen (WeakSet) avoids re-walking an already-frozen subtree on repeat
// calls across many consecutive exempt commands sharing the same domain
// object. Not used in production by default (this walk costs roughly
// what the clone it is protecting against would have cost) -- see
// GameStateEngineClass.strictWriteSetValidation.
const deepFreeze=(v,seen=new WeakSet)=>{if(v===null||typeof v!=='object'||seen.has(v))return v;seen.add(v);if(!Object.isFrozen(v))Object.freeze(v);for(const k of Object.keys(v))deepFreeze(v[k],seen);return v};
// Per-function cache for the listenerBreakdown diagnostic label (see its
// own call site comment) -- computed once per unique listener reference,
// never recomputed on subsequent dispatches.
const listenerSrcLabelCache=new WeakMap;const listenerSrcLabel=fn=>{if(listenerSrcLabelCache.has(fn))return listenerSrcLabelCache.get(fn);let label='';try{label=String(fn).replace(/\s+/g,' ').slice(0,60)}catch{}listenerSrcLabelCache.set(fn,label);return label};
// FINAL PERFORMANCE CLOSURE (2026-08-20): progression/receipt-ledger
// scaling. Proven via tools/qa/qa_progression_scaling_diagnostic.js
// (isolating commandReceipts count as the sole variable): ordinary
// COMMIT_MESSAGE_EVENT dispatch cost grows LINEARLY with total
// commandReceipts count/bytes (0.073ms at 0 receipts -> 8.97ms at 4000,
// scaling exactly 2x per 2x receipts) even after the registry-domain
// copy-on-write fix, because `progression` -- which commandReceipts lives
// inside, written at its one call site in _dispatch() below -- was still
// being FULLY DEEP-CLONED on every single dispatch. commandReceipts is
// uniquely expensive to deep-clone because each receipt embeds a full
// copy of that command's own committed events (`events:clone(events)` in
// result()) -- for a message commit, that is the ENTIRE committed
// conversation event a second time, permanently, never pruned. Measured:
// commandReceipts accounted for 762KB of 809KB (94%) of progression's
// total serialized size at 4000 receipts.

// Fix: commandReceipts is looked up by direct object-key access
// (`prev.progression.commandReceipts[commandId]`, already O(1) -- the
// DUPLICATE_COMMAND check just below is not the bottleneck) and written
// at exactly ONE call site. Give its CONTAINER a fresh shallow copy
// (`{...prev}` -- O(receipt count) in property references copied, but
// each copy is a cheap pointer, not a re-serialization of that receipt's
// full content) instead of deep-cloning every historical receipt's
// content on every commit. Existing receipt VALUES stay reference-shared
// with prev's -- safe, because nothing ever mutates an EXISTING receipt
// in place (commandId is dispatch-time-unique; a receipt is written once
// and read thereafter only for the DUPLICATE_COMMAND replay path, which
// already does `clone(prior)` before returning it -- see _dispatch()).
// Every OTHER progression sub-collection (onceKeys, completedStoryIds,
// continuationReceipts, branchReceipts, choiceReceipts, effectReceipts,
// contactProgress, choicesLog, pendingStoryQueue, pendingStory,
// pendingInteraction, conversationsCache) keeps its EXACT prior
// behavior -- individually deep-cloned, unchanged -- since several of
// those ARE mutated in place by scattered reducer cases (e.g.
// `s.progression.choiceReceipts[choiceGroupId]=receipt`) that assume a
// fully-independent copy; only commandReceipts' single, well-understood
// write site was touched. Applied uniformly to EVERY dispatch (not just
// registry-exempt commands) since commandReceipts bookkeeping happens on
// every successful command regardless of type.
const cloneProgressionWithSharedReceiptHistory=p=>({...p.dayTransitionIntent!==undefined?{dayTransitionIntent:clone(p.dayTransitionIntent)}:{},completedStoryIds:clone(p.completedStoryIds),onceKeys:clone(p.onceKeys),continuationReceipts:clone(p.continuationReceipts),
// Runtime receipt authority lives on GameStateEngineClass, outside the
// per-revision gameplay object. Keeping this projection empty avoids an
// O(total receipts) property-table copy on every command; getState() and
// Save materialize the complete compatible object only at their public
// boundary.
commandReceipts:{},pendingStoryQueue:clone(p.pendingStoryQueue),branchReceipts:clone(p.branchReceipts),choiceReceipts:clone(p.choiceReceipts),effectReceipts:clone(p.effectReceipts),contactProgress:clone(p.contactProgress),choicesLog:clone(p.choicesLog),pendingStory:clone(p.pendingStory),pendingInteraction:clone(p.pendingInteraction),conversationsCache:clone(p.conversationsCache)});class GameStateEngineClass{constructor(){this.state=null;this.store=null;this.commandReceiptAuthority=Object.create(null);this.listeners=new Set;this.pending=0;this.initialized=false;this.resources=new Map;this.listenerDepth=0;this.performanceTrace=[];this.performanceTraceLimit=400;
// Opt-in, QA/dev-only: deep-freezes registry domains shared via the
// command-scoped copy-on-write optimization before apply() runs, so
// ANY mutation attempt (not just a reassignment) throws immediately
// instead of silently corrupting a previous revision's snapshot. See
// deepFreeze()'s own comment for why this is not the production
// default. tools/qa/qa_state_mutation_safety.test.js enables this.
this.strictWriteSetValidation=false}initialize(opts={}){
  if(this.initialized)return this.result(true,'ALREADY_INITIALIZED',{commandId:'initialize'},this.state?.revision||0,this.state?.revision||0,[]);
  if(opts.strictWriteSetValidation===true)this.strictWriteSetValidation=true;
  if(typeof opts.storyAccessPolicy==='function')this.storyAccessPolicy=opts.storyAccessPolicy;
  if(Array.isArray(opts.storyAdmissionCatalog))this.storyAdmissionCatalog=opts.storyAdmissionCatalog;
  const storage=opts.storage||root.localStorage||new MemoryStorage;
  this.store=opts.adapter||new EngineStorage(storage,{failureHook:opts.failureHook});
  const recovered=this.store.recover();
  const original=recovered.state?deps.storage.stableStringify(recovered.state):null;
  const hasDomain=key=>!!(recovered.state?.[key]&&typeof recovered.state[key]==='object'&&!Array.isArray(recovered.state[key]));
  const hadHak=hasDomain('hak'),hadOnlyfun=hasDomain('onlyfun'),hadCardVault=hasDomain('cardVault'),hadGallery=hasDomain('gallery');
  this.state=this.migrate(recovered.state,opts);
  // A present canonical domain is authoritative even when an old producer
  // left legacyImported=false. Compatibility mirrors may only initialize a
  // genuinely absent domain; they must never overwrite saved explicit values.
  if(hadHak)this.state.hak=this.normalizeHakDomain(this.state.hak);else this.importLegacyHak(this.state,storage);
  const transcriptSkill=this.state.hak?.skills?.unlocked?.hak_audio_transcription_v1;
  if(transcriptSkill&&typeof transcriptSkill==='object'){
    ['ntr','nts','love'].forEach(branch=>{
      const skillId=branch+'_audio_transcription_v1';
      if(!this.state.hak.skills.unlocked[skillId])this.state.hak.skills.unlocked[skillId]={at:Number(transcriptSkill.at||0)||Date.now(),branch,migratedFrom:'hak_audio_transcription_v1'};
    });
    delete this.state.hak.skills.unlocked.hak_audio_transcription_v1;
  }
  if(hadOnlyfun)this.state.onlyfun=this.normalizeOnlyfunDomain(this.state.onlyfun);else this.importLegacyOnlyfun(this.state,storage);
  if(hadCardVault)this.state.cardVault=this.normalizeCardVaultDomain(this.state.cardVault);else this.importLegacyCardVault(this.state,storage);
  if(hadGallery)this.state.gallery=this.normalizeGalleryDomain(this.state.gallery);else this.importLegacyGallery(this.state,storage);
  this.ensureInitialization(this.state);
  this.validateState(this.state);
  // Normalization and canonical schema migrations can change an existing
  // snapshot too. Publish every legitimate boot migration before exposing the
  // initialized engine, rather than changing memory at an unchanged revision.
  if(original===null||original!==deps.storage.stableStringify(this.state))this.store.writeInitial(this.state);
  else{this.store.migrateEmbeddedReceipts(this.state);this.store.mirrorCompat(this.state)}
  this.commandReceiptAuthority=Object.assign(Object.create(null),this.state.progression?.commandReceipts||{});
  this.state.progression.commandReceipts={};
  this.initialized=true;
  return this.result(true,recovered.status==='stable'?'INITIALIZED':'RECOVERED',{commandId:'initialize'},this.state?.revision||0,this.state?.revision||0,[{type:'engine:initialized',recovery:recovered.status}]);
}
normalizeHakDomain(raw){const d=defaultHakDomain(),h=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};return{...d,...clone(h),evidenceProfiles:h.evidenceProfiles&&typeof h.evidenceProfiles==='object'&&!Array.isArray(h.evidenceProfiles)?clone(h.evidenceProfiles):{},photos:Array.isArray(h.photos)?clone(h.photos):[],evidenceSeen:h.evidenceSeen&&typeof h.evidenceSeen==='object'&&!Array.isArray(h.evidenceSeen)?clone(h.evidenceSeen):{},watchlist:{...d.watchlist,...clone(h.watchlist||{}),selected:[...new Set(Array.isArray(h.watchlist?.selected)?h.watchlist.selected.map(v=>String(v||'').trim().toLowerCase()).filter(Boolean):[])],targets:h.watchlist?.targets&&typeof h.watchlist.targets==='object'&&!Array.isArray(h.watchlist.targets)?clone(h.watchlist.targets):{}},skills:{unlocked:h.skills?.unlocked&&typeof h.skills.unlocked==='object'&&!Array.isArray(h.skills.unlocked)?clone(h.skills.unlocked):{}},routePoints:{nts:Math.max(0,Number(h.routePoints?.nts)||0),ntr:Math.max(0,Number(h.routePoints?.ntr)||0),love:Math.max(0,Number(h.routePoints?.love)||0)},tutorial:{...d.tutorial,...clone(h.tutorial||{}),skillSpendThoughts:normalizeHakSkillSpendThoughts(h)},receipts:h.receipts&&typeof h.receipts==='object'&&!Array.isArray(h.receipts)?clone(h.receipts):{},migration:{...d.migration,...clone(h.migration||{})}}}onlyfunDisplayName(creatorId, value){return this.onlyfunCreatorId(creatorId)==='static_muse'?'Sexminator':String(value||creatorId||'').trim()}
normalizeOnlyfunDomain(raw){
  const d=defaultOnlyfunDomain(),o=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{},map=v=>v&&typeof v==='object'&&!Array.isArray(v)?clone(v):{};
  const profiles=value=>{const out=map(value);for(const [key,row] of Object.entries(out)){if(row&&typeof row==='object'&&this.onlyfunCreatorId(row.id||row.creatorId||key)==='static_muse'){row.displayName='Sexminator';row.name='Sexminator'}}return out};
  const posts=Array.isArray(o.posts)?clone(o.posts):[],byId=new Map;
  for(const row of posts){const post=row&&typeof row==='object'?row:null,pid=String(post?.id||post?.onceKey||'').trim(),creatorId=String(post?.creatorId||post?.creator||post?.authorId||'').trim().toLowerCase();if(!pid||!creatorId)continue;const normalized={...post,id:pid,creatorId};if(this.onlyfunCreatorId(creatorId)==='static_muse'){normalized.creatorDisplayName='Sexminator';if('authorName' in normalized)normalized.authorName='Sexminator'}byId.set(pid,normalized)}
  return{...d,...clone(o),creators:profiles(o.creators),accounts:profiles(o.accounts),subscriptions:map(o.subscriptions),posts:[...byId.values()].sort((a,b)=>Number(b?.createdAt||0)-Number(a?.createdAt||0)),seenPosts:map(o.seenPosts),pendingGates:map(o.pendingGates),receipts:map(o.receipts),migration:{...d.migration,...clone(o.migration||{})}}
}
normalizeCardVaultDomain(raw){const d=defaultCardVaultDomain(),v=raw&&typeof raw==='object'&&!Array.isArray(raw)?clone(raw):{},map=x=>x&&typeof x==='object'&&!Array.isArray(x)?clone(x):{};const out={...d,...v,points:Math.max(0,Math.min(2147483647,Math.floor(Number(v.points)||0))),dust:Math.max(0,Math.min(2147483647,Math.floor(Number(v.dust)||0))),owned:map(v.owned),claimedRewards:map(v.claimedRewards),pointGrantLedger:map(v.pointGrantLedger),seenCards:map(v.seenCards),orphanedCards:map(v.orphanedCards),transactionReceipts:map(v.transactionReceipts),duplicates:{...d.duplicates,...clone(v.duplicates||{}),byCard:map(v.duplicates?.byCard)},onboarding:{...d.onboarding,...clone(v.onboarding||{})},statistics:{...d.statistics,...clone(v.statistics||{}),luckHistory:Array.isArray(v.statistics?.luckHistory)?clone(v.statistics.luckHistory).slice(-100):[],pullsByRarity:map(v.statistics?.pullsByRarity)},packHistory:Array.isArray(v.packHistory)?clone(v.packHistory).slice(-200):[],rewardHistory:Array.isArray(v.rewardHistory)?clone(v.rewardHistory).slice(-200):[],dustExchangeHistory:Array.isArray(v.dustExchangeHistory)?clone(v.dustExchangeHistory).slice(-200):[],migration:{...d.migration,...clone(v.migration||{})}};out.statistics.cardsCollected=Object.keys(out.owned).length;return out}galleryMediaId(row){const explicit=String(row?.mediaId||row?.id||'').trim(),ephemeral=/^p_[0-9]/.test(explicit)||/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(explicit);if(explicit&&!ephemeral)return explicit;const path=String(row?.url||row?.path||row?.src||'').trim().replace(/\\/g,'/').replace(/^\.\//,'').toLowerCase();return path?'gallery_'+id(path):''}normalizeGalleryDomain(raw){const d=defaultGalleryDomain(),g=raw&&typeof raw==='object'&&!Array.isArray(raw)?clone(raw):{},map=v=>v&&typeof v==='object'&&!Array.isArray(v)?clone(v):{},owned={};for(const[key,value]of Object.entries(map(g.owned))){const row=value&&typeof value==='object'?clone(value):{},mediaId=this.galleryMediaId({...row,mediaId:key});if(!mediaId)continue;owned[mediaId]={...row,mediaId:mediaId}}return{...d,...g,owned:owned,viewed:map(g.viewed),receipts:map(g.receipts),fullUnlock:g.fullUnlock===true,migration:{...d.migration,...clone(g.migration||{})}}}importLegacyHak(s,storage){
  s.hak=this.normalizeHakDomain(s.hak);
  if(s.hak.migration.legacyImported)return s.hak;
  const rawKey=key=>{try{return storage?.getItem?.(key)??null}catch{return null}};
  const parseKey=(key,fallback)=>{try{const raw=rawKey(key);return raw==null?fallback:JSON.parse(raw)}catch{return fallback}};
  const truthy=key=>rawKey(key)==='1';
  const rawSkills=parseKey('hak_skills_v1',{});
  // Historical arrays and renamed starters are owned by the canonical import,
  // before the renderer's compatibility mirror replaces the original store.
  // An array has no purchase timestamp; use a stable sentinel for save migration.
  const unlocked=Array.isArray(rawSkills)
    ? Object.fromEntries(rawSkills.filter(value=>typeof value==='string').map(value=>value.trim()).filter(Boolean).map(skillId=>[skillId,{at:1}]))
    : rawSkills?.unlocked&&typeof rawSkills.unlocked==='object'&&!Array.isArray(rawSkills.unlocked)?clone(rawSkills.unlocked):{};
  const aliases={love_guided_response_v1:'love_risk_warning_v1',nts_ambiguity_indicator_v1:'nts_opportunity_indicator_v1'};
  for(const[legacyId,skillId]of Object.entries(aliases)){
    if(unlocked[legacyId]&&!unlocked[skillId])unlocked[skillId]=clone(unlocked[legacyId]);
  }
  s.hak.skills={unlocked};
  s.hak.unlocked=truthy('feature_hak_unlocked')||s.world.appUnlocks.includes('hak');
  s.hak.visible=truthy('feature_hak_visible')||s.hak.unlocked;
  s.hak.level=Math.max(0,Number(rawKey('hak_level'))||0);
  s.hak.evidenceProfiles=parseKey('hak_evidence_v1',{})||{};
  s.hak.photos=parseKey('hak_photos_v1',[])||[];
  s.hak.evidenceSeen=parseKey('hak_evidence_seen_v1',{})||{};
  const selectedRaw=parseKey('hak_watchlist_v1_selected',null),watchRaw=parseKey('hak_watchlist_v1',null),selected=Array.isArray(selectedRaw)?selectedRaw:Array.isArray(watchRaw)?watchRaw:Array.isArray(watchRaw?.selected)?watchRaw.selected:[];
  s.hak.watchlist.selected=[...new Set(selected.map(v=>String(v||'').trim().toLowerCase()).filter(Boolean))];
  s.hak.watchlist.targets=parseKey('hak_targets_v1',{})||{};
  s.hak.watchlist.config=parseKey('hak_character_selection_config_v1',null);
  s.hak.watchlist.configured=truthy('hak_character_selection_done_v1')||selected.length>0;
  s.hak.routePoints={...s.hak.routePoints,...parseKey('route_points_v1',{})||{}};
  s.hak.tutorial={required:truthy('hak_tutorial_required'),completed:truthy('hak_app_tutorial_done'),state:String(rawKey('hak_app_tutorial_state_v1')||'evidence'),resumeTarget:parseKey('hak_tutorial_resume_target_v1',null)};
  const skillDefinitions=deps.hakSkills||root.HakSkillDefinitions;
  const hasPriorPurchase=Object.keys(unlocked).some(skillId=>!!unlocked[skillId]&&skillDefinitions?.byId?.has(skillId));
  const missingOpenFlags=rawKey('feature_hak_openable')==null&&rawKey('feature_hak_open')==null;
  // Recover omitted legacy mirrors only with proof the already activated app
  // was usable. Explicit closed flags, points alone and Day 9 do not grant access.
  s.hak.openable=truthy('feature_hak_openable')||truthy('feature_hak_open')||(missingOpenFlags&&s.hak.unlocked&&(s.hak.tutorial.completed||hasPriorPurchase));
  s.hak.gate=parseKey('hak_gate_v1',null);
  s.hak.migration.legacyImported=true;
  return s.hak;
}
importLegacyOnlyfun(s,storage){s.onlyfun=this.normalizeOnlyfunDomain(s.onlyfun);if(s.onlyfun.migration.legacyImported)return s.onlyfun;const parse=(key,fallback)=>{try{const raw=storage?.getItem?.(key);return raw==null?fallback:JSON.parse(raw)}catch{return fallback}};const truthy=key=>{try{return storage?.getItem?.(key)==='1'}catch{return false}};const creatorRoot=parse('onlyfun_creators_v1',{}),accountRoot=parse('onlyfun_accounts_v1',{}),subsRoot=parse('onlyfun_subscriptions_v1',{}),publicRoot=parse('onlyfun_subscriptions',{}),postsRoot=parse('onlyfun_posts_v1',{});s.onlyfun.unlocked=truthy('feature_onlyfun_unlocked')||s.world.appUnlocks.includes('onlyfun');s.onlyfun.signedIn=truthy('onlyfun_signed_in');s.onlyfun.creators=clone(creatorRoot?.creators||{});s.onlyfun.accounts=clone(accountRoot?.accounts||accountRoot?.creators||accountRoot||{});s.onlyfun.subscriptions={...subsRoot?.subs||{},...publicRoot?.subs||publicRoot||{}};s.onlyfun.posts=Array.isArray(postsRoot?.posts)?clone(postsRoot.posts):[];s.onlyfun.seenPosts=clone(parse('onlyfun_seen_posts_v1',{})||{});s.onlyfun.pendingGates=clone(parse('onlyfun_pending_gates_v1',{})||{});s.onlyfun.migration={legacyImported:true,seeded:truthy('onlyfun_seeded_v1')};s.onlyfun=this.normalizeOnlyfunDomain(s.onlyfun);return s.onlyfun}importLegacyCardVault(s,storage){
  s.cardVault=this.normalizeCardVaultDomain(s.cardVault);
  if(s.cardVault.migration.legacyImported)return s.cardVault;
  // The first canonical boot must recover the legacy backup before publishing
  // compatibility mirrors, which would otherwise overwrite it with defaults.
  for(const key of ['card_vault_state_v1','card_vault_state_backup_v1']){
    let legacy=null;
    try{legacy=JSON.parse(storage?.getItem?.(key)||'null')}catch{}
    if(!legacy||typeof legacy!=='object'||Array.isArray(legacy))continue;
    s.cardVault=this.normalizeCardVaultDomain(legacy);
    break;
  }
  s.cardVault.migration={...s.cardVault.migration||{},legacyImported:true,schemaVersion:1};
  return s.cardVault;
}
cardVaultForStoryRestore(current,saved){
  const live=this.normalizeCardVaultDomain(current);
  // Codes are redeemed once per install. Story rewind must retain the wallet,
  // purchased cards and their receipts together, or spent rewards disappear
  // while the separate redemption ledger still prevents another claim.
  const maps=['owned','orphanedCards','claimedRewards','pointGrantLedger'];
  const histories=['packHistory','rewardHistory','dustExchangeHistory'];
  const economicCommands=new Set(['ADD_CARD_VAULT_POINTS','SPEND_CARD_VAULT_POINTS','GRANT_CARD','OPEN_CARD_PACK','OPEN_ALL_CARD_PACKS','EXCHANGE_CARD_VAULT_DUST','CLAIM_CARD_VAULT_REWARD']);
  const hasProgress=live.points>0||live.dust>0
    ||maps.some(key=>Object.keys(live[key]||{}).length>0)
    ||histories.some(key=>(live[key]||[]).length>0)
    ||live.onboarding.firstFreePackGranted===true
    ||Number(live.duplicates.total)>0||Number(live.duplicates.dustEarned)>0
    ||Object.keys(live.duplicates.byCard||{}).length>0
    ||['packsOpened','cardsCollected','duplicates','dustExchanges','dustExchanged','pointsFromDust'].some(key=>Number(live.statistics[key])>0)
    ||Object.values(live.transactionReceipts||{}).some(row=>economicCommands.has(row?.type));
  // An unused profile can still import a backed-up save. Configuration repair
  // and display preferences alone do not establish an economic progression.
  return hasProgress?live:this.normalizeCardVaultDomain(saved);
}importLegacyGallery(s,storage){s.gallery=this.normalizeGalleryDomain(s.gallery);if(s.gallery.migration.legacyImported)return s.gallery;let rows=[];for(const key of['gallery_photos','savedPhotos']){try{const value=JSON.parse(storage?.getItem?.(key)||'[]');if(Array.isArray(value))rows.push(...value)}catch{}}for(const raw of rows){const row=typeof raw==='string'?{url:raw}:raw,mediaId=this.galleryMediaId(row);if(!mediaId)continue;s.gallery.owned[mediaId]={...clone(row),mediaId:mediaId,unlockedAt:Math.max(1,Number(row?.unlockedAt||row?.at)||Date.now())}}s.gallery.fullUnlock=storage?.getItem?.('gallery_full_unlock_v1')==='1';s.gallery.migration={legacyImported:true,schemaVersion:1};return s.gallery}ensureInitialization(s){if(!s.initialization)s.initialization={mode:s.execution?.lease?'RESTORE_SAVE':'NONE',status:s.execution?.lease?'READY_WITH_ACTIVE_STORY':'UNINITIALIZED',token:null,targetDay:s.world?.day||null,firstStoryPath:s.execution?.activeStoryPath||null,expectedContactId:s.execution?.activeContactId||null,launchReceipt:null};return s.initialization}migrate(raw,opts={}){if(raw&&raw.schemaVersion===4&&raw.progression&&raw.execution){raw.playthrough=raw.playthrough&&typeof raw.playthrough==='object'?raw.playthrough:{id:'legacy-'+id(raw.profileId||opts.profileId||'default',raw.sessionId||'',raw.revision||0),generation:1,resetAt:null};raw.playthrough.id=String(raw.playthrough.id||'legacy-'+id(raw.profileId||'default',raw.sessionId||'',raw.revision||0));raw.playthrough.generation=Math.max(1,Number(raw.playthrough.generation)||1);raw.world=raw.world||{};raw.world.activeCharacters=Array.isArray(raw.world.activeCharacters)?raw.world.activeCharacters:[];raw.world.variables=raw.world.variables&&typeof raw.world.variables==='object'?raw.world.variables:{};raw.progression.branchReceipts=raw.progression.branchReceipts&&typeof raw.progression.branchReceipts==='object'?raw.progression.branchReceipts:{};raw.progression.choiceReceipts=raw.progression.choiceReceipts&&typeof raw.progression.choiceReceipts==='object'?raw.progression.choiceReceipts:{};raw.progression.effectReceipts=raw.progression.effectReceipts&&typeof raw.progression.effectReceipts==='object'?raw.progression.effectReceipts:{};raw.progression.contactProgress=raw.progression.contactProgress&&typeof raw.progression.contactProgress==='object'?raw.progression.contactProgress:{};raw.progression.choicesLog=Array.isArray(raw.progression.choicesLog)?raw.progression.choicesLog:[];raw.progression.pendingStory=raw.progression.pendingStory&&typeof raw.progression.pendingStory==='object'?raw.progression.pendingStory:null;raw.progression.pendingInteraction=raw.progression.pendingInteraction&&typeof raw.progression.pendingInteraction==='object'?raw.progression.pendingInteraction:null;raw.progression.conversationsCache=raw.progression.conversationsCache&&typeof raw.progression.conversationsCache==='object'?raw.progression.conversationsCache:{};raw.presence=raw.presence&&typeof raw.presence==='object'?raw.presence:{contactId:null,mountState:null,navigationTransactionId:null,committedRevision:0};raw.execution.cursor=raw.execution.cursor&&typeof raw.execution.cursor==='object'?raw.execution.cursor:null;raw.execution.blocked=raw.execution.blocked&&typeof raw.execution.blocked==='object'?raw.execution.blocked:null;return migrateGameTime(repairLenaDay16PrematureCompletion(raw))}const s=fallbackBase({profileId:raw?.profileId||opts.profileId,sessionId:opts.sessionId||this.sessionId()});if(raw){s.world.day=Number(raw.day||raw.world?.day)||1;s.world.routes=clone(raw.routes||raw.world?.routes||{});s.world.activeCharacters=[...new Set(raw.activeCharacters||raw.world?.activeCharacters||[])];s.world.choices=clone(raw.choices||raw.world?.choices||{});s.world.masonVariant=(raw.masonVariant||raw.world?.masonVariant)==='female'?'female':'male';s.progression.onceKeys=[...new Set(raw.onceKeys||raw.progression?.onceKeys||[])];s.progression.completedStoryIds=[...new Set(raw.completedStoryIds||raw.progression?.completedStoryIds||[])];s.conversations.eventsByContact=clone(raw.conversations?.eventsByContact||{});s.world.gameTime=raw.world?.gameTime||null}else{s.world.gameTime=null}return migrateGameTime(s)}sessionId(){return's-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9)}getState(){this.ensure();const state=clone(this.state);state.progression.commandReceipts=clone(this.commandReceiptAuthority);return state}
// Runtime consumers that do not inspect commandReceipts must not pay the
// O(receipt history) public compatibility projection on every message.
// This remains a deep defensive copy; only the separately-authoritative
// receipt ledger is omitted from the projection.
getGameplayState(){this.ensure();return clone(this.state)}getRevision(){this.ensure();return Number(this.state?.revision)||0}getCommandReceipt(commandId){this.ensure();const receipt=this.commandReceiptAuthority[String(commandId||'')];return receipt?clone(receipt):null}
// getState() deep-clones the ENTIRE multi-domain state (hak/onlyfun/
// cardVault/gallery/conversations/progression/world) on every call --
// correct as a general-purpose defensive-copy contract, but measured
// live (CDP JS profiler around a 50-click rapid-input burst) to be a
// real, non-trivial cost that a caller wanting exactly ONE small,
// rarely-changing field pays in full, repeatedly. world.activeCharacters
// specifically is read by convo-runtime.js's canonicalActiveCharacterIds
// -> shouldHideCharacterFromUI, itself called from 60+ sites across the
// message/notification pipeline (effectively every step of every
// story walk) -- getState/clone/canonicalActiveCharacterIds together
// accounted for ~2s of self-time out of a 10.7s profiled burst.
// Shallow-copies only the one small array actually needed; still an
// independent copy the caller cannot use to corrupt engine state.
getWorldActiveCharacters(){this.ensure();return Array.isArray(this.state?.world?.activeCharacters)?[...this.state.world.activeCharacters]:[]}
getWorldDay(){this.ensure();return Math.max(1,Number(this.state?.world?.day)||1)}
// Calendar needs canonical route decisions, but not the rest of world.variables.
// Resolve variable/lock/fallback precedence before returning its narrow snapshot.
getCalendarProjectionState(){
  this.ensure();
  const s=this.state,routeIds=new Set([...Object.keys(s.world.routes||{}),...Object.keys(s.world.routeLocks||{}),...Object.keys(s.world.variables||{}).map(key=>key.match(/^route_([a-z0-9_]+)_locked_v1$/)?.[1]).filter(Boolean)]),routes={};
  for(const contactId of routeIds)routes[contactId]=this.getWorldRoute(contactId);
  const bootIds=new Set(['d2_13_hak_boot_v2','story/DAY2/DAY2_13_HAK_BOOT.json']),tutorial=s.hak?.tutorial||{};
  const bootReceipts=Object.fromEntries(Object.entries(s.hak?.receipts||{}).filter(([,receipt])=>receipt?.kind==='unlock'&&bootIds.has(receipt.storyId)));
  return clone({world:{day:s.world.day,gameTime:s.world.gameTime,routes,activeCharacters:s.world.activeCharacters},conversations:{eventsByContact:s.conversations.eventsByContact},onlyfun:{posts:s.onlyfun.posts},
    hak:{tutorial:{announcedAt:tutorial.announcedAt},receipts:bootReceipts},
    progression:{onceKeys:(s.progression.onceKeys||[]).filter(key=>bootIds.has(key)),completedStoryIds:(s.progression.completedStoryIds||[]).filter(id=>bootIds.has(id))}});
}
socialInteractionTarget(state,app,postId){
  if(!['snapgram','onlyfun'].includes(app)||!postId||postId.length>240)return null;
  if(app==='onlyfun'){
    const domain=state.onlyfun,post=domain.posts.find(row=>String(row.id||row.onceKey||'')===postId);
    if(!post||!domain.unlocked||!domain.signedIn)return null;
    const creator=this.onlyfunCreatorId(post.creatorId||post.creator);
    if(post.requiresSub!==false&&domain.subscriptions[creator]!==true)return null;
    return post;
  }
  // Snapgram's acquired feed predates the canonical engine. Require BOTH
  // current saved feed membership and its durable acquired gallery record.
  // Gallery alone survives earlier Loads and cannot authorize future posts.
  let rows=[];
  for(const key of ['igFeed_v1','igStories_v1'])try{const list=JSON.parse(this.store.storage.getItem(key)||'[]');if(Array.isArray(list))rows.push(...list);}catch{}
  const post=rows.find(row=>String(row.id||row.onceKey||'')===postId);if(!post)return null;
  const normalize=value=>String(value||'').replace(/\\/g,'/').replace(/^\.\//,'').toLowerCase();
  const asset=normalize(post.image||post.video||post.url),owned=Object.values(state.gallery.owned||{}).some(row=>
    asset&&normalize(row.url||row.path||row.image)===asset&&
    (String(row.id||row.mediaId||'')===postId||String(row.src||row.source||'').toLowerCase().startsWith('snapgram')));
  return owned?post:null;
}
getSocialInteraction(app,postId){this.ensure();app=String(app||'');postId=String(postId||'');const post=this.socialInteractionTarget(this.state,app,postId),entry=this.state.world.variables.social_interactions_v1?.[app+':'+postId];return{allowed:!!post,postId,app,image:String(post?.image||''),authorId:String(post?.authorId||post?.creatorId||''),comments:post&&Array.isArray(post.comments)?clone(post.comments):[],baseLikes:Math.max(0,Math.floor(Number(post?.likes)||0)),liked:!!post&&entry?.liked===true,comment:post&&entry?.comment?clone(entry.comment):null}}
getGameTime(){this.ensure();return GameTimeService.readWorld(this.state.world)}
// Idle continuation repair reads fresh route/cursor/once/pending authority only.
// Preserve defensive copies without cloning transcripts or command receipts.
getStoryContinuationState(){this.ensure();const s=this.state;return clone({world:s.world,execution:s.execution,progression:{onceKeys:s.progression.onceKeys,pendingStory:s.progression.pendingStory}})}
getWorldAppUnlocks(){this.ensure();return clone(this.state?.world?.appUnlocks??null)}
getExecutionSnapshot(){this.ensure();const s=this.state;return clone({revision:s.revision,execution:s.execution,world:{day:s.world.day},progression:{pendingStory:s.progression.pendingStory}})}
// Interpreter decisions inspect these domains, never transcript bodies,
// notification history, compatibility caches or the durable command ledger.
// Keep the snapshot defensive and synchronous across awaited story loading.
getBranchDecisionReceipt(branchId){this.ensure();const row=this.state?.progression?.branchReceipts?.[String(branchId||'')];return row?clone(row):null}
getStoryDecisionState(){this.ensure();const s=this.state;return clone({revision:s.revision,execution:s.execution,world:s.world,progression:{onceKeys:s.progression.onceKeys,choiceReceipts:s.progression.choiceReceipts,branchReceipts:s.progression.branchReceipts},hak:{receipts:s.hak.receipts,skills:s.hak.skills,watchlist:s.hak.watchlist},onlyfun:{seenPosts:s.onlyfun.seenPosts}})}
// Pending requirement checks compare decisions and app gates, never the
// transcript, command ledger, presentation cursor or retry bookkeeping.
getStoryRequirementState(){this.ensure();const s=this.state,interaction=this.getStoryInteractionState();return clone({world:s.world,execution:interaction.execution,progression:{onceKeys:s.progression.onceKeys,choicesLog:s.progression.choicesLog,choiceReceipts:s.progression.choiceReceipts,branchReceipts:s.progression.branchReceipts},hak:{...interaction.hak,receipts:s.hak.receipts,skills:s.hak.skills,watchlist:s.hak.watchlist},onlyfun:interaction.onlyfun,conversationGates:interaction.conversationGates})}
getPendingStory(){this.ensure();return clone(this.state?.progression?.pendingStory||null)}
getHakSkillsState(){this.ensure();return clone(this.state?.hak?.skills||{unlocked:{}})}
hasSeenHakEvidence(evidenceId){this.ensure();return this.state?.hak?.evidenceSeen?.[String(evidenceId||'')]===true}
isHakSkillAvailable(skillId){this.ensure();return (deps.hakSkills||root.HakSkillDefinitions).isAvailable(this.state,skillId)}
hasActiveHakSkill(skillId){this.ensure();return (deps.hakSkills||root.HakSkillDefinitions).isActive(this.state,skillId)}
getPendingInteraction(){this.ensure();return clone(this.state?.progression?.pendingInteraction||null)}
getContactProgress(contactId){this.ensure();return clone(this.state?.progression?.contactProgress?.[String(contactId||'')]||null)}
getWorldRoute(contactId){this.ensure();const cid=String(contactId||'').trim().toLowerCase(),w=this.state?.world||{};return String(w.variables?.['route_'+cid+'_locked_v1']||w.routeLocks?.[cid]||w.routes?.[cid]||'')}
hasOnceKey(key){this.ensure();return !!this.state?.progression?.onceKeys?.includes(String(key||'').trim().toLowerCase())}
hasCompletedStory(storyId,onceKey){this.ensure();return onceKey?this.hasOnceKey(onceKey):this.state.progression.completedStoryIds.includes(String(storyId||''))}
// Admission/recovery needs committed interaction gates, including download
// links before their app finishes installing. Do not clone transcript bodies
// or command receipts on the idle recovery timer.
getStoryInteractionState(){this.ensure();const s=this.state,conversationGates=[];for(const rows of Object.values(s.conversations?.eventsByContact||{}))for(const row of rows||[])if(row?.link?.onlyfunGate)conversationGates.push(row.link.onlyfunGate);return clone({world:{day:s.world.day,routes:s.world.routes,routeLocks:s.world.routeLocks,variables:s.world.variables},execution:{lease:s.execution.lease,activeStoryPath:s.execution.activeStoryPath},progression:{onceKeys:s.progression.onceKeys},onlyfun:{subscriptions:s.onlyfun.subscriptions,pendingGates:s.onlyfun.pendingGates},hak:{gate:s.hak.gate,evidenceSeen:s.hak.evidenceSeen,photos:s.hak.photos.map(row=>({id:row.id,seen:row.seen}))},conversationGates})}
getConversationPresence(){this.ensure();return clone(this.state?.presence||{})}
getCardVaultState(){this.ensure();return clone(this.state?.cardVault||{})}
// Avatar/media projection needs Mason's saved authority, not a clone of every
// transcript and command receipt. Preserve the service's narrative-start gate.
getMasonVariantAuthority(){this.ensure();const s=this.state,initialization=s?.initialization;return{variant:String(s?.world?.masonVariant||''),narrativeStarted:!!(initialization?.status==='READY'||initialization?.status==='READY_WITH_ACTIVE_STORY'||initialization?.launchReceipt||s?.execution?.activeStoryId||(Array.isArray(s?.progression?.completedStoryIds)&&s.progression.completedStoryIds.length>0)||Object.keys(s?.progression?.choiceReceipts||{}).length>0||Object.keys(s?.progression?.branchReceipts||{}).length>0||Object.keys(s?.gallery?.owned||{}).length>0)}}
getConversationProjectionContact(contactId){this.ensure();const cid=String(contactId||'');const conversations=this.state?.conversations||{},events=conversations.eventsByContact?.[cid]||[];return{contactId:cid,events:clone(events.slice(-5000)),latestEventId:String(conversations.latestEventByContact?.[cid]||''),unread:Math.max(0,Number(conversations.unreadByContact?.[cid])||0)}}
// Append-only journal identity; restore/reset changes the operation epoch.
getConversationJournalIdentity(contactId){this.ensure();const rows=this.state?.conversations?.eventsByContact?.[String(contactId||'')]||[];return{playthroughId:String(this.state?.playthrough?.id||''),operationEpoch:Number(this.state?.execution?.operationEpoch)||0,count:rows.length,tailEventId:String(rows[rows.length-1]?.eventId||'')}}
getConversationProjectionDelta(contactId,previous){this.ensure();const cid=String(contactId||''),identity=this.getConversationJournalIdentity(cid),rows=this.state.conversations.eventsByContact[cid]||[],count=Number(previous?.count);if(!previous||identity.playthroughId!==previous.playthroughId||identity.operationEpoch!==previous.operationEpoch||!Number.isInteger(count)||count<0||count>rows.length||rows.length-count>64||String(rows[count-1]?.eventId||'')!==previous.tailEventId)return null;const start=Math.max(0,rows.length-5000),oldStart=Math.max(0,count-5000);return{identity,events:clone(rows.slice(Math.max(count,start)).filter(row=>row&&row.visible!==false)),dropEventIds:rows.slice(oldStart,start).filter(row=>row&&row.visible!==false).map(row=>String(row.eventId||'')),summary:this.getConversationProjectionSummary(cid)}}
// Scalar readers inspect current authority on each call. They retain no index
// across restore and never clone transcript bodies for metadata/identity work.
getConversationCacheContactSummary(contactId){this.ensure();const row=this.state?.progression?.conversationsCache?.[String(contactId||'')];return{messageCount:Array.isArray(row?.messages)?row.messages.length:-1,metadata:row&&typeof row==='object'?clone({name:row.name,avatar:row.avatar,last:row.last,unread:row.unread,unfinished:row.unfinished}):clone(row??null)}}
isReceivedConversationPreviewEvent(row){return !!row&&row.visible!==false&&!!String(row.eventId||'').trim()&&!['player','mc','system'].includes(String(row.from||row.fromId||'').toLowerCase())&&!['note','divider','hak_transcript'].includes(String(row.kind||row.type||'').toLowerCase())}
getConversationProjectionSummary(contactId){this.ensure();const cid=String(contactId||''),conversations=this.state?.conversations||{},rows=conversations.eventsByContact?.[cid]||[],latestId=String(conversations.latestEventByContact?.[cid]||'').trim();let visibleCount=0,hasDivider=false,latest=null,fallback=null;for(let i=Math.max(0,rows.length-5000);i<rows.length;i++){const row=rows[i];if(!row||row.visible===false)continue;visibleCount++;if(String(row.kind||'').toLowerCase()==='divider')hasDivider=true;if(!this.isReceivedConversationPreviewEvent(row))continue;fallback=row;if(!latest&&latestId&&String(row.eventId||'')===latestId)latest=row;}return{visibleCount,hasDivider,previewEvent:clone(latest||fallback||null),unread:Math.max(0,Number(conversations.unreadByContact?.[cid])||0)}}
hasConversationEvent(contactId,aliases){this.ensure();const wanted=new Set((Array.isArray(aliases)?aliases:[aliases]).map(value=>String(value||'').trim()).filter(Boolean));if(!wanted.size)return false;const rows=this.state?.conversations?.eventsByContact?.[String(contactId||'')]||[];return rows.some(row=>{const eventId=String(row?.eventId||row?.id||'').trim();return !!eventId&&wanted.has(eventId)})}
getRuntimeLifecycleIdentity(){this.ensure();return{playthroughId:this.state?.playthrough?.id||'',playthroughGeneration:Number(this.state?.playthrough?.generation||0),operationEpoch:Number(this.state?.execution?.operationEpoch||0)}}
getConversationReadShape(){this.ensure();const cache=this.state?.progression?.conversationsCache;return{objectStore:!!cache&&typeof cache==='object'&&!Array.isArray(cache),cacheRows:cache&&typeof cache==='object'?Object.entries(cache).map(([key,row])=>({key,objectRow:!!row&&typeof row==='object'&&!Array.isArray(row),id:clone(row?.id??null),name:clone(row?.name??null)})):[],eventKeys:Object.keys(this.state?.conversations?.eventsByContact||{})}}
// The full-list reader filters visibility BEFORE its cap and may select a
// preview event outside that cap. Episode stamping must retain that contract.
getConversationFullReadProjectionContact(contactId){this.ensure();const cid=String(contactId||''),conversations=this.state?.conversations||{},rows=conversations.eventsByContact?.[cid]||[],visible=rows.filter(row=>row&&row.visible!==false),eligible=visible.filter(row=>this.isReceivedConversationPreviewEvent(row)),latestId=String(conversations.latestEventByContact?.[cid]||'').trim(),preview=(latestId&&eligible.find(row=>String(row.eventId||'')===latestId))||eligible[eligible.length-1]||null;return{events:clone(visible.slice(-5000)),previewEvent:clone(preview),unread:clone(conversations.unreadByContact?.[cid]??null)}}
// Same rationale as getWorldActiveCharacters() just above, found via the
// sequential-conversations performance investigation's own per-subscriber
// listenerBreakdown instrumentation (final-certification reopen,
// 2026-08-19): scripts/canonical-story-runtime.js's engine.subscribe()
// callback runs on EVERY single dispatch and called engine.getState()
// (a full multi-domain deep clone) just to read one primitive number,
// execution.operationEpoch, to detect a RESTORE_SAVE generation bump --
// paying the full clone on every ordinary message/choice/effect commit
// for a value that changes on essentially none of them. Confirmed via
// live measurement: this subscriber's own cost grew ~38% (0.57ms ->
// 0.79ms) over 7 real sequential conversations in one process, tracking
// total state size. A primitive number needs no defensive copy, so this
// is safe with zero clone at all, not even a shallow one.
galleryForProgressionReplacement(state){const gallery=this.normalizeGalleryDomain(state.gallery);for(const row of Object.values(gallery.owned)){const source=String(row.src||row.source||row.app||'').trim().toLowerCase();if(source!=='hak'&&!source.startsWith('hak:'))continue;const branch=String(row.kind||row.route||'').trim().toLowerCase();const skill=row.access?.type==='skill'?String(row.access.skillId||row.access.id||''):['love','nts','ntr'].includes(branch)?branch+'_evidence_access':'';if(skill&&(deps.hakSkills||root.HakSkillDefinitions).isActive(state,skill))row.evidenceAccessGranted=true;}return gallery}
mergeEarnedGallery(target,current){
const out=this.normalizeGalleryDomain(target),earned=this.normalizeGalleryDomain(current);
const physicalPath=row=>String(row?.url||row?.image||row?.photo||'').trim().replace(/\\/g,'/').replace(/^\.\//,'').split('#')[0].split('?')[0].replace(/^\/+/, '').toLowerCase();
const relocate=(from,to)=>{
  const row=out.owned[from],existing=out.owned[to];if(!row||from===to)return;
  out.owned[to]={...row,...existing,mediaId:to,...(row.evidenceAccessGranted===true||existing?.evidenceAccessGranted===true?{evidenceAccessGranted:true}:{})};delete out.owned[from];
  if(out.viewed[from]===true)out.viewed[to]=true;delete out.viewed[from];
  const suffix=':asset:'+id(physicalPath(row));
  for(const [key,receipt] of Object.entries(out.receipts))if(receipt?.mediaId===from){
    const operationId=key.endsWith(suffix)?key:key+suffix;
    out.receipts[operationId]={...receipt,operationId,mediaId:to};if(operationId!==key)delete out.receipts[key];
  }
};
for(const [mediaId,row] of Object.entries(earned.owned)){
  const prior=out.owned[mediaId],incomingPath=physicalPath(row),priorPath=physicalPath(prior);
  // Old independent saves can use the same authored HAK id for opposite
  // physical variants. Keep the live id and relocate the saved acquisition,
  // including its viewed marker and receipt, instead of discarding it.
  if(prior&&priorPath&&incomingPath&&priorPath!==incomingPath)relocate(mediaId,mediaId+':asset:'+id(priorPath));
  out.owned[mediaId]={...row,...(row.evidenceAccessGranted===true||out.owned[mediaId]?.evidenceAccessGranted===true?{evidenceAccessGranted:true}:{})};
  const family=mediaId.split(':asset:')[0];
  for(const [alias,photo] of Object.entries(out.owned))if(alias!==mediaId&&!earned.owned[alias]&&alias.split(':asset:')[0]===family&&physicalPath(photo)===incomingPath)relocate(alias,mediaId);
}
for(const [mediaId,viewed] of Object.entries(earned.viewed))if(viewed===true)out.viewed[mediaId]=true;
out.receipts={...out.receipts,...earned.receipts};return out
}
// Attention needs skill-announcement receipts without cloning conversation history.
getHakProjectionState(){this.ensure();const s=this.state;return clone({hak:s.hak,execution:{cursor:s.execution?.cursor},world:{variables:s.world?.variables,routeLocks:s.world?.routeLocks,routes:s.world?.routes},progression:{effectReceipts:s.progression?.effectReceipts}})}
// Reopening an earned evidence item needs its acquisition thoughts, not the
// player's full conversation, gallery or save history.
getHakEvidenceThoughtState(evidenceId){
  this.ensure();const s=this.state,eid=String(evidenceId||''),evidenceProfiles={};
  for(const [profileId,row] of Object.entries(s.hak?.evidenceProfiles||{})){
    const evidences=(Array.isArray(row?.evidences)?row.evidences:[]).filter(item=>String(item?.id||'')===eid);
    if(evidences.length)evidenceProfiles[profileId]={profile:row.profile,kind:row.kind,route:row.route,evidences};
  }
  return clone({hak:{evidenceProfiles,photos:(s.hak?.photos||[]).filter(item=>String(item?.id||'')===eid)},
    progression:{effectReceipts:Object.fromEntries(Object.entries(s.progression?.effectReceipts||{}).filter(([,row])=>row?.effectType==='hak_overlay'))},
    execution:{activeStoryId:s.execution.activeStoryId,activeStoryPath:s.execution.activeStoryPath,cursor:s.execution.cursor},
    world:{masonVariant:s.world.masonVariant,activeCharacters:s.world.activeCharacters}});
}
// MeetAndGreet content is a projection of authored effects, never a second
// save domain. Reading it must not copy the full conversation/gallery history.
getMeetAndGreetProjectionState(){this.ensure();const s=this.state;return clone({unlocked:s.world.appUnlocks.includes('meetandgreet'),onceKeys:s.progression.onceKeys,completedStoryIds:s.progression.completedStoryIds,effects:Object.values(s.progression.effectReceipts).filter(row=>String(row.effectType||'').startsWith('meetandgreet_')),view:s.world.variables.meetandgreet_view_v1||null,execution:{activeStoryPath:s.execution.activeStoryPath,activeStoryId:s.execution.activeStoryId,cursor:s.execution.cursor},identity:{playthroughId:s.playthrough.id,playthroughGeneration:s.playthrough.generation,operationEpoch:s.execution.operationEpoch}})}
getOperationEpoch(){this.ensure();return Number(this.state?.execution?.operationEpoch)||0}getExecutionState(){this.ensure();return clone(this.state?.execution||{})}getHakState(){this.ensure();return clone(this.state?.hak||{})}getOnlyfunUnlocked(){this.ensure();return this.state?.onlyfun?.unlocked===true}getWorldVariables(){this.ensure();return clone(this.state?.world?.variables||{})}getChoiceReceipt(choiceGroupId){this.ensure();const row=this.state?.progression?.choiceReceipts?.[String(choiceGroupId||'')];return row?clone(row):null}getConversationEvents(contactId){this.ensure();return clone(this.state?.conversations?.eventsByContact?.[String(contactId||'')]||[])}getConversationCacheContact(contactId){this.ensure();const row=this.state?.progression?.conversationsCache?.[String(contactId||'')];return row?clone(row):null}
getGalleryState(){this.ensure();return clone(this.state?.gallery||{})}
// Gallery rendering and duplicate acquisition checks do not read transcripts
// or the complete collection. Keep these synchronous reads defensive and small.
hasFullGalleryUnlock(){this.ensure();return this.state?.gallery?.fullUnlock===true}
getGalleryMedia(mediaId){this.ensure();return clone(this.state?.gallery?.owned?.[String(mediaId||'')]||null)}
getGalleryReceipt(operationId){this.ensure();return clone(this.state?.gallery?.receipts?.[String(operationId||'')]||null)}
getGalleryMutationContext(){this.ensure();const s=this.state;return clone({revision:s.revision,execution:{activeStepIndex:s.execution.activeStepIndex,lease:s.execution.lease}})}
getGalleryOwnedCount(){this.ensure();return Object.keys(this.state?.gallery?.owned||{}).length}
getGalleryConversationMedia(){this.ensure();return clone(Object.fromEntries(Object.entries(this.state?.conversations?.eventsByContact||{}).map(([contactId,events])=>[contactId,(events||[]).filter(event=>event&&['image','photo','media'].includes(event.kind))])))}
getListenerDiagnostics(){this.ensure();return[...this.listeners].map((fn,index)=>({index,name:String(fn?.name||''),source:listenerSrcLabel(fn)}))}getProgressionIdentity(){this.ensure();return{playthroughId:String(this.state?.playthrough?.id||''),onceKeys:Array.isArray(this.state?.progression?.onceKeys)?[...this.state.progression.onceKeys]:[]}}
// Same rationale as getWorldActiveCharacters()/getOperationEpoch() above,
// found via the readConversations()/showNext() renderer-pipeline
// investigation (FINAL PERFORMANCE BLOCKER, 2026-08-20):
// scripts/notify-adapter.js's readConversations() -- called on EVERY
// single message via Game.notify(), the exact per-message hot path --
// called engine.getState() (a full multi-domain deep clone) just to
// read progression.conversationsCache, one field. Deep-clones (via the
// SAME clone() the full getState() path uses) only that one domain,
// NOT a shallow copy: notify-adapter.js's downstream logic mutates
// individual message row objects and reassigns nested fields on the
// conversation objects it gets back (unlike getWorldActiveCharacters()'s
// flat array of primitive strings, where a shallow copy is already
// fully safe) -- a shallow copy here would let that legacy code mutate
// LIVE canonical message rows directly, bypassing dispatch/validation
// entirely. Still far cheaper than getState(): skips hak/onlyfun/
// cardVault/gallery/execution/world/notifications/presence/recovery
// entirely, which is the overwhelming majority of total state size.
getMessagesUnreadTotal(){this.ensure();return Object.values(this.state?.conversations?.unreadByContact||{}).reduce((sum,value)=>sum+Math.max(0,Number(value)||0),0)}
// A read download link still needs player input after its story completes.
// Derive attention from delivered links and install authority so reading,
// completion and save/load cannot clear it or manufacture unread messages.
getPendingConversationDownloads(contactId=''){
this.ensure();const s=this.state,wanted=String(contactId||'').trim().toLowerCase(),pending=new Map();
// OnlyFun is the authored download with canonical installation authority.
if(s.onlyfun?.unlocked===true)return [];
for(const [cid,rows] of Object.entries(s.conversations?.eventsByContact||{})){
  if(wanted&&cid!==wanted)continue;
  for(const row of rows||[]){
    if(!row?.link||!this.isReceivedConversationPreviewEvent(row))continue;
    const link=row.link,label=String(link?.label||'').trim(),appId=String(link?.appId||link?.appName||'').trim().toLowerCase().replace(/\s+/g,'_');
    if(!label||appId!=='onlyfun')continue;
    pending.set(cid+':'+appId,{contactId:cid,appId,appName:String(link.appName||appId),label,
      storyPath:String(row.storyPath||''),eventId:String(row.eventId||''),color:'rainbow'});
  }
}
return [...pending.values()];
}
getConversationCacheFlushIdentity(){this.ensure();return{revision:Number(this.state?.revision)||0,playthroughId:String(this.state?.playthrough?.id||''),operationEpoch:Number(this.state?.execution?.operationEpoch)||0,hasActiveLease:!!this.state?.execution?.lease}}
getConversationCacheContact(contactId){this.ensure();const id=String(contactId||'');return clone(this.state?.progression?.conversationsCache?.[id]||null)}
getConversationEventCount(){this.ensure();return Object.values(this.state?.conversations?.eventsByContact||{}).reduce((count,rows)=>count+(Array.isArray(rows)?rows.length:0),0)}
// Projection repair needs the canonical journal, latest event and unread maps,
// including events newer than its pending cache. Return an independent domain
// clone so repairing UI rows cannot mutate authority or copy unrelated state.
getConversationsState(){this.ensure();return clone(this.state?.conversations||{})}
getOnlyfunPostSeen(postId){this.ensure();const key=String(postId||'').trim();return !!key&&this.state?.onlyfun?.seenPosts?.[key]===true}
getOnlyfunUnseenTotal(){this.ensure();const onlyfun=this.state?.onlyfun||{};return(onlyfun.posts||[]).reduce((count,post)=>{const creatorId=String(post?.creatorId||'').trim().toLowerCase(),postId=String(post?.id||'').trim();return count+(creatorId&&postId&&onlyfun.subscriptions?.[creatorId]&&onlyfun.seenPosts?.[postId]!==true?1:0)},0)}
getConversationsCache(){this.ensure();return clone(this.state?.progression?.conversationsCache||{})}createSaveSnapshot(){this.ensure();const journal=this.store?.storage?.getItem?.('intercepted_engine_journal_v4');if(journal)throw this.err('SAVE_TRANSACTION_IN_PROGRESS','canonical transaction is not stable');if(this.state?.recovery?.transactionStatus==='pending')throw this.err('SAVE_TRANSACTION_IN_PROGRESS','canonical transaction is not stable');const state=this.getState();this.validateLoadedState(state);return{state:state,sourceRevision:state.revision,sourceSessionId:state.sessionId,sourcePlaythroughId:state.playthrough?.id||null,sourcePlaythroughGeneration:Number(state.playthrough?.generation)||1}}getPerformanceTrace(){return clone(this.performanceTrace)}clearPerformanceTrace(){this.performanceTrace.length=0}subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn)}restore(payload,meta={}){return this.dispatch({type:'RESTORE_SAVE',commandId:meta.commandId||'restore-'+id(payload,Date.now(),Math.random()),expectedRevision:this.state?.revision,payload:payload})}dispatch(command={}){this.ensure();this.pending++;try{return this._dispatch(command)}finally{this.pending--}}_dispatch(c){const clock=()=>typeof performance!=='undefined'&&performance.now?performance.now():Date.now(),startedAt=clock(),prev=this.state,commandId=String(c.commandId||'');if(!commandId)return this.result(false,'INVALID_COMMAND',c,prev.revision,prev.revision,[],'commandId is required');const prior=this.commandReceiptAuthority[commandId];if(c.type!=='RESTORE_SAVE'&&prior)return{...clone(prior),status:'DUPLICATE_COMMAND'};if(c.expectedRevision!=null&&Number(c.expectedRevision)!==prev.revision)return this.result(false,'REVISION_MISMATCH',c,prev.revision,prev.revision,[],'expected revision does not match');const needsLease=new Set(['COMMIT_STORY_STEP','COMPLETE_STORY','ACTIVATE_CONTINUATION','COMMIT_MESSAGE_EVENT','COMMIT_STORY_EFFECT','SET_CHOICE','SET_FLAG','SET_STORY_VARIABLE','RECORD_BRANCH_DECISION','RECORD_CHOICE_DECISION','SET_ROUTE_LOCK','RECORD_REWARD','CHANGE_DAY','UNLOCK_APP','COMMIT_NOTIFICATION_EVENT','RECORD_BLOCKED_STATE']);const storyHakCommands=new Set(['UNLOCK_HAK','ADD_HAK_EVIDENCE','ADD_HAK_PHOTO','SET_HAK_WATCHLIST','SET_HAK_GATE']);const storyOnlyfunCommands=new Set(['UNLOCK_ONLYFUN','UNLOCK_ONLYFUN_ACCOUNT','ADD_ONLYFUN_POST','SET_ONLYFUN_PENDING_GATE']);const storyGalleryCommands=new Set(['UNLOCK_GALLERY_MEDIA']);const storyDomainOrigin=(storyHakCommands.has(c.type)||storyOnlyfunCommands.has(c.type)||storyGalleryCommands.has(c.type))&&(c.leaseId!=null||c.payload?.cursor!=null||c.payload?.stepIndex!=null||c.payload?.nextStepIndex!=null);if((needsLease.has(c.type)||storyDomainOrigin)&&prev.execution.lease){const lease=prev.execution.lease;if(lease.id!==c.leaseId)return this.result(false,'STALE_OPERATION',c,prev.revision,prev.revision,[],'active lease does not match')}const cloneStartedAt=clock();const registryExempt=GAMEPLAY_COMMANDS_EXEMPT_FROM_REGISTRY_CLONE.has(c.type);
// Registry-exempt commands share their audited, unchanged registry domains.
// Other commands retain the defensive full clone. The narrower cases below
// also share transcript/cache history while copying each mutable write set.
// These commands change execution/branch/cache metadata only. Sharing the
// immutable transcript avoids copying the whole campaign at each cursor ack.
const metadataOnly=['COMMIT_STORY_STEP','RECORD_BRANCH_DECISION','SET_CONVERSATIONS_CACHE'].includes(c.type);
const messageContact=String(c.type==='COMMIT_MESSAGE_EVENT'?(c.payload?.contactId||prev.execution?.activeContactId||''):'');
const messageConversations=messageContact?{...prev.conversations,eventsByContact:{...(prev.conversations?.eventsByContact||{}),[messageContact]:(prev.conversations?.eventsByContact?.[messageContact]||[]).slice()},latestEventByContact:{...(prev.conversations?.latestEventByContact||{})},unreadByContact:{...(prev.conversations?.unreadByContact||{})}}:null;
const narrowProgression=metadataOnly||messageContact?{...prev.progression,commandReceipts:{},...(c.type==='RECORD_BRANCH_DECISION'?{branchReceipts:{...prev.progression.branchReceipts}}:{})}:null;
let next={...prev,execution:clone(prev.execution),world:metadataOnly||messageContact?prev.world:clone(prev.world),conversations:metadataOnly?prev.conversations:messageConversations||clone(prev.conversations),notifications:metadataOnly||messageContact?prev.notifications:clone(prev.notifications),presence:metadataOnly||messageContact?prev.presence:clone(prev.presence),recovery:clone(prev.recovery),progression:narrowProgression||cloneProgressionWithSharedReceiptHistory(prev.progression),hak:registryExempt?prev.hak:clone(prev.hak),onlyfun:registryExempt?prev.onlyfun:clone(prev.onlyfun),cardVault:registryExempt?prev.cardVault:clone(prev.cardVault),gallery:registryExempt?prev.gallery:clone(prev.gallery)};
if(this.strictWriteSetValidation&&(metadataOnly||messageContact)){
for(const domain of ['world','conversations','notifications','presence','progression'])deepFreeze(prev[domain]);
};if(registryExempt&&this.strictWriteSetValidation)for(const domain of REGISTRY_DOMAINS)deepFreeze(prev[domain]);let events=[],clonedAt=clock();try{this.apply(next,c,events);progressGameTime(prev,next,c);stampCommittedGameTime(next,events);
// Write-set safety net: for a command declared exempt from registry
// cloning, the four registry domains MUST remain the exact same
// object references as prev's -- if apply() (a bug in the reducer, or
// a bug in this audit's own GAMEPLAY_COMMANDS_EXEMPT_FROM_REGISTRY_CLONE
// membership) touched one anyway, next[domain] would still be
// reference-identical (since it was never reassigned) but its
// CONTENTS may have been mutated in place -- which would corrupt
// prev's own copy too, since they are the same object. Cheap (4
// reference comparisons), left on unconditionally as a permanent
// safety net, not gated to a debug flag -- the whole point is to
// catch this class of bug the instant it is introduced, in every
// environment, not just when someone remembers to enable strict mode.
if(registryExempt){for(const domain of REGISTRY_DOMAINS)if(next[domain]!==prev[domain])throw this.err('REGISTRY_WRITE_SET_VIOLATION','command '+c.type+' unexpectedly touched domain '+domain+' -- update GAMEPLAY_COMMANDS_EXEMPT_FROM_REGISTRY_CLONE or investigate a reducer bug')}this.validateState(next,registryExempt?prev:null);next.revision=prev.revision+1;next.recovery.previousStableRevision=prev.revision;next.recovery.transactionStatus='stable';
// A duplicate-content commit (see message()'s own header comment)
// still succeeds and still advances the cursor, but keeps the
// caller-visible DUPLICATE_MESSAGE label instead of COMMITTED so
// existing status-based callers/telemetry can still tell "this
// exact content already existed" apart from a genuinely new commit.
const dupType=events.find(ev=>ev&&ev.duplicate===true)?.type;const status=dupType==='conversation:event-committed'?'DUPLICATE_MESSAGE':'COMMITTED';const receipt=this.result(true,status,c,prev.revision,next.revision,events),reducedAt=clock();const replacesReceiptAuthority=c.type==='RESTORE_SAVE'||String(prev.playthrough?.id||'')!==String(next.playthrough?.id||'');const replacementReceipts=replacesReceiptAuthority?next.progression.commandReceipts:null;if(replacesReceiptAuthority)next.execution.commandReceiptScope='rc-'+id(commandId,next.sessionId,next.execution.operationEpoch);this.store.commit(prev,next,c,receipt);const persistedAt=clock();if(replacesReceiptAuthority)this.commandReceiptAuthority=Object.assign(Object.create(null),replacementReceipts||{});this.commandReceiptAuthority[commandId]=receipt;next.progression.commandReceipts={};this.state=next;this.listenerDepth++;
// Per-subscriber inclusive timing (perf investigation): listenerMs was
// only ever an aggregate, and flat CPU-profiler self-time can't
// attribute cost TO a specific subscriber when its cost is almost
// entirely in functions it calls, not itself -- wrapping each fn(...)
// call individually gives true inclusive-per-subscriber cost with
// zero behavior change (same try/catch/clone semantics per listener).
// fn.name is empty for every current subscriber (all registered as
// anonymous arrows), so identify by registration order + a short
// source fingerprint instead.
const listenerBreakdown=[];try{for(const fn of[...this.listeners]){const lStart=clock();try{fn(clone(events))}catch{}
// FINAL PERFORMANCE BLOCKER (2026-08-20): found via CDP allocation
// sampling to be the SINGLE LARGEST allocator in the whole
// click-to-paint pipeline (300KB+ per 8-click burst) -- String(fn)
// decompiles a listener's ENTIRE function source on every single
// dispatch, for every listener, just to keep the first 60
// characters of a diagnostic label. Listener functions are stable
// (subscribed once at module-init, never recreated per dispatch --
// confirmed by this session's own static audit of every
// GameStateEngine.subscribe() call site), so this string is
// deterministic per function reference and only needs computing
// once, ever, not on every commit.
listenerBreakdown.push({index:listenerBreakdown.length,name:fn.name||'',src:listenerSrcLabel(fn),ms:clock()-lStart})}}finally{this.listenerDepth--}const finishedAt=clock(),storage=this.store.lastCommitTimings||{},storageForCommand=storage.commandId===commandId?storage:null;this.performanceTrace.push({commandId:commandId,type:String(c.type||''),previousRevision:prev.revision,nextRevision:next.revision,cloneMs:clonedAt-cloneStartedAt,reducerMs:reducedAt-clonedAt,persistenceMs:persistedAt-reducedAt,listenerMs:finishedAt-persistedAt,listenerBreakdown:listenerBreakdown,totalMs:finishedAt-startedAt,serializeMs:storageForCommand?.serializeMs??null,durablePersistenceMs:storageForCommand?.durablePersistenceMs??null,storage:storageForCommand?clone(storageForCommand):null});if(this.performanceTrace.length>this.performanceTraceLimit)this.performanceTrace.splice(0,this.performanceTrace.length-this.performanceTraceLimit);return receipt}catch(e){return this.result(false,e.code||'COMMAND_REJECTED',c,prev.revision,prev.revision,events,e.message)}}apply(s,c,e){const p=c.payload||{};const metaPreservingInit=new Set(['INITIALIZE_START_FROM','INITIALIZE_NEW_UPDATE','INITIALIZE_CHECKPOINT']);if(metaPreservingInit.has(c.type)&&p.state&&typeof p.state==='object'){p.state.cardVault=clone(s.cardVault);p.state.gallery=this.galleryForProgressionReplacement(s)}if(c.type==='INITIALIZE_NEW_UPDATE'&&p.state?.hak){const tutorial=s.hak.tutorial;p.state.hak.tutorial={...p.state.hak.tutorial,skillSpendThoughts:normalizeHakSkillSpendThoughts(s.hak)};if(tutorial.firstSkillSpendThoughtShown===true||tutorial.firstSkillSpendThought){p.state.hak.tutorial.firstSkillSpendThoughtShown=tutorial.firstSkillSpendThoughtShown===true;p.state.hak.tutorial.firstSkillSpendThought=clone(tutorial.firstSkillSpendThought||null)}}let cursorPatch=null;switch(c.type){
case'SET_CARD_WALLPAPER':{const tx=String(p.transactionId||c.commandId||'').trim();if(!tx)throw this.err('INVALID_CARD_VAULT_TRANSACTION','transaction identity required');s.cardVault=this.normalizeCardVaultDomain(p.state);s.cardVault.transactionReceipts[tx]={type:c.type,committedAt:Number(p.committedAt)||Date.now(),result:clone(p.result||{})};e.push({type:'card-vault:wallpaper-set',transactionId:tx,wallpaper:clone(s.cardVault.wallpaper)});break}
case'ADD_CARD_VAULT_POINTS':case'SPEND_CARD_VAULT_POINTS':case'GRANT_CARD':case'OPEN_CARD_PACK':case'OPEN_ALL_CARD_PACKS':case'COMPLETE_CARD_VAULT_TUTORIAL_STEP':case'COMPLETE_CARD_VAULT_TUTORIAL':case'UPDATE_CARD_VAULT_PRESENTATION':case'EXCHANGE_CARD_VAULT_DUST':case'CLAIM_CARD_VAULT_REWARD':case'SET_CARD_VAULT_PREFERENCE':case'MIGRATE_CARD_VAULT_STATE':{const tx=String(p.transactionId||c.commandId||'').trim();if(!tx)throw this.err('INVALID_CARD_VAULT_TRANSACTION','transaction identity required');s.cardVault=this.normalizeCardVaultDomain(p.state);s.cardVault.transactionReceipts=s.cardVault.transactionReceipts||{};s.cardVault.transactionReceipts[tx]={type:c.type,committedAt:Number(p.committedAt)||Date.now(),result:clone(p.result||{})};const receiptIds=Object.keys(s.cardVault.transactionReceipts);if(receiptIds.length>500)for(const oldId of receiptIds.slice(0,receiptIds.length-500))delete s.cardVault.transactionReceipts[oldId];e.push({type:'card-vault:committed',operation:c.type,transactionId:tx,result:clone(p.result||{})});break}
case'UNLOCK_GALLERY_MEDIA':{
const media=clone(p.media||{}),mediaId=this.galleryMediaId({...media,mediaId:p.mediaId});
if(!mediaId)throw this.err('INVALID_GALLERY_MEDIA','stable media identity required');
const operationId=String(p.operationId||c.commandId),prior=s.gallery.receipts[operationId],existing=s.gallery.owned[mediaId],added=!existing;
let reconciled=false;
if(!prior){
if(added)s.gallery.owned[mediaId]={...media,mediaId:mediaId,unlockedAt:Math.max(1,Number(media.unlockedAt)||Date.now())};
else if(media.canonicalOwner===true){
const canonicalOwnerId=String(media.ownerId||media.characterId||media.contactId||'').trim().toLowerCase();
const existingOwnerId=String(existing.ownerId||existing.characterId||existing.contactId||'').trim().toLowerCase();
if(canonicalOwnerId&&canonicalOwnerId!==existingOwnerId){
s.gallery.owned[mediaId]={...existing,ownerId:canonicalOwnerId,ownerName:String(media.ownerName||media.characterName||media.contactName||existing.ownerName||'').trim(),canonicalOwner:true};
reconciled=true;
}
}
if(!added){
const owned=s.gallery.owned[mediaId],path=row=>String(row?.url||row?.image||row?.photo||row?.path||'').trim().replace(/\\/g,'/').replace(/^\.\//,'').replace(/^\/+/, '').split('#')[0].split('?')[0].toLowerCase();
const owner=row=>{const value=String(row?.ownerId||row?.characterId||row?.contactId||'').trim().toLowerCase();return value==='player'?'mc':value;};
const source=String(media.src||media.source||media.app||'').trim().toLowerCase();
if((source==='hak'||source.startsWith('hak:'))&&path(media)&&path(media)===path(owned)&&owner(media)&&owner(media)===owner(owned)){
if(media.evidenceAccessGranted===true&&owned.evidenceAccessGranted!==true){owned.evidenceAccessGranted=true;reconciled=true;}
const nextAccess=media.access,priorSkill=String(owned.access?.skillId||owned.access?.id||'').trim(),nextSkill=String(nextAccess?.skillId||nextAccess?.id||'').trim();
if(nextAccess?.type==='skill'&&nextSkill&&nextSkill!=='hak_audio_transcription_v1'&&(!owned.access||(owned.access.type==='skill'&&(!priorSkill||priorSkill==='hak_audio_transcription_v1')))){
owned.access={...owned.access,...clone(nextAccess)};reconciled=true;
}
}
}
s.gallery.receipts[operationId]={operationId:operationId,mediaId:mediaId,added:added,reconciled:reconciled,committedAt:Date.now()};
}
e.push({type:'gallery:media-unlocked',operationId:operationId,mediaId:mediaId,added:prior?prior.added:added,reconciled:prior?prior.reconciled===true:reconciled,reused:!!prior});
s.execution.activeStepIndex=Number(p.nextStepIndex??s.execution.activeStepIndex+1);cursorPatch=p.cursor||null;break}
case'MARK_GALLERY_MEDIA_VIEWED':{const mediaId=String(p.mediaId||'').trim();if(!mediaId||!s.gallery.owned[mediaId])throw this.err('GALLERY_MEDIA_NOT_OWNED','media is not unlocked');s.gallery.viewed[mediaId]=true;e.push({type:'gallery:media-viewed',mediaId:mediaId});break}
case'SET_GALLERY_FULL_UNLOCK':{s.gallery.fullUnlock=p.enabled===true;e.push({type:'gallery:full-unlock-set',enabled:s.gallery.fullUnlock});break}
case'RESET_PLAYTHROUGH':{const oldLease=s.execution?.lease;if(oldLease)this.cancelResources(oldLease.id);const preservedCardVault=this.normalizeCardVaultDomain(s.cardVault),preservedGallery=this.galleryForProgressionReplacement(s);preservedCardVault.pendingReveal=null;const nextGeneration=Math.max(1,Number(s.playthrough?.generation)||1)+1;const resetAt=Number(p.resetAt)||Date.now();const built=fallbackBase({profileId:s.profileId,sessionId:this.sessionId(),playthroughGeneration:nextGeneration,playthroughId:'p-'+id(s.profileId||'default',nextGeneration,resetAt,c.commandId),resetAt:resetAt});built.cardVault=preservedCardVault;built.gallery=preservedGallery;if(p.mode==='story_restart'){built.world.entitlements=clone(s.world.entitlements||{});built.world.masonVariant=s.world.masonVariant==='female'?'female':'male';}built.initialization={mode:'FRESH_NEW_GAME',status:'READY_IDLE',token:'reset:'+built.playthrough.id,targetDay:1,firstStoryPath:null,expectedContactId:null,launchReceipt:null};Object.assign(s,built);e.push({type:'playthrough:reset',playthroughId:built.playthrough.id,playthroughGeneration:nextGeneration,resetAt:resetAt});break}
case'BOOTSTRAP':case'INITIALIZE_NEW_GAME':{const preservedCardVault=this.normalizeCardVaultDomain(s.cardVault),preservedGallery=this.galleryForProgressionReplacement(s);const built=fallbackBase({profileId:p.profileId||s.profileId,sessionId:s.sessionId,playthroughGeneration:s.playthrough?.generation||1,playthroughId:s.playthrough?.id});built.cardVault=preservedCardVault;built.gallery=preservedGallery;built.initialization={mode:'FRESH_NEW_GAME',status:'READY_IDLE',token:p.initializationToken||c.commandId,targetDay:1,firstStoryPath:null,expectedContactId:null,launchReceipt:null};Object.assign(s,built);break}
case'INITIALIZE_START_FROM':case'INITIALIZE_NEW_UPDATE':case'INITIALIZE_CHECKPOINT':{const built=clone(p.state);built.execution=built.execution||{};let suppliedCursor=built.execution.cursor&&typeof built.execution.cursor==='object'?built.execution.cursor:null;built.execution.cursor=suppliedCursor;built.execution.blocked=built.execution.blocked&&typeof built.execution.blocked==='object'?built.execution.blocked:null;const admissionCatalog=this.storyAdmissionCatalog||root.StoryAdmissionCatalog,grammar=deps.grammar||root.ConditionGrammar;if(Array.isArray(admissionCatalog)&&admissionCatalog.length&&grammar?.getNextCanonicalStory&&(!suppliedCursor||c.type!=='INITIALIZE_CHECKPOINT')){const next=grammar.getNextCanonicalStory(built,admissionCatalog,{day:built.world.day,respectActive:false,service:GameTimeService});if(next.status!=='MISSING')throw this.err(next.status==='CHRONOLOGY_CAUSAL_CONFLICT'?next.status:'INITIALIZATION_CHRONOLOGY_BLOCKED',JSON.stringify(next));built.execution.activeStoryPath=next.path;built.execution.activeStoryId=next.onceKey||next.id||next.path;built.execution.activeContactId=next.contactId||null;built.execution.activeStepIndex=0;built.execution.cursor=null;suppliedCursor=null;}if(!(c.type==='INITIALIZE_CHECKPOINT'&&suppliedCursor&&GameTimeService.isStoredClock(built.world.gameTime)))built.world.gameTime=GameTimeService.initialClock(built.world.day,built.execution.activeStoryPath,built);this.validateState(built);built.sessionId=s.sessionId;const storyPath=String(built.execution.activeStoryPath||'');if(!storyPath)throw this.err('INVALID_GRAPH_TARGET','checkpoint first story is required');const mode=c.type==='INITIALIZE_START_FROM'?'START_FROM':c.type==='INITIALIZE_NEW_UPDATE'?'NEW_UPDATE':String(p.mode||'TIMELINE').toUpperCase(),token=String(p.initializationToken||c.commandId);built.initialization={mode:mode,status:'READY_WITH_ACTIVE_STORY',token:token,targetDay:built.world.day,firstStoryPath:storyPath,expectedContactId:built.execution.activeContactId||null,launchReceipt:{id:'launch-'+id(token,storyPath),token:token,storyPath:storyPath,consumed:true}};built.execution.status='running';built.execution.generation=(Number(built.execution.generation)||0)+1;built.execution.lease={id:'l-'+id(token,storyPath),storyId:built.execution.activeStoryId||storyPath,generation:built.execution.generation,createdRevision:s.revision+1,initializationToken:token};Object.assign(s,built);e.push({type:'initialization:committed',mode:mode,token:token,storyPath:storyPath,leaseId:built.execution.lease.id});if(!suppliedCursor){cursorPatch={storyPath:storyPath,storyId:built.execution.activeStoryId||storyPath,contactId:built.execution.activeContactId||null,rootIndex:Number(built.execution.activeStepIndex)||0,branchPath:[],operationId:null,operationType:null,branchReceiptId:null,gotoTarget:null,pendingUserIntent:null,pendingPresentationAck:null,phase:'ready_to_interpret',completion:'in_progress',continuation:'none',leaseId:built.execution.lease.id}}break}
case'RESTORE_SAVE':{const restored=this.migrate(clone(p.state||p));this.validateLoadedState(restored);
restored.cardVault=this.cardVaultForStoryRestore(s.cardVault,restored.cardVault);
// Earned Gallery media belongs to the profile: rewinding the story must not
// erase discoveries from another choice or a more advanced save. Keep this
// union inside the restore transaction so storage and projections agree.
restored.gallery=this.mergeEarnedGallery(restored.gallery,this.galleryForProgressionReplacement(s));
this.cancelAllResources();const sourcePlaythrough=clone(restored.playthrough||{});restored.sessionId=this.sessionId();restored.playthrough={...sourcePlaythrough,id:String(sourcePlaythrough.id||'legacy-'+id(c.commandId)),generation:Math.max(1,Number(sourcePlaythrough.generation)||1),resetAt:sourcePlaythrough.resetAt||null};restored.execution.operationEpoch=Math.max(Number(s.execution?.operationEpoch)||0,Number(restored.execution.operationEpoch)||0)+1;restored.recovery={transactionStatus:'stable',previousStableRevision:s.revision,pendingCommand:null,lastError:null};restored.operation=null;const storyId=String(restored.execution.activeStoryId||'');if(storyId){restored.execution.status='running';restored.execution.generation=Math.max(Number(s.execution?.generation)||0,Number(restored.execution.generation)||0)+1;restored.execution.lease={id:'l-'+id(c.commandId,restored.sessionId,storyId,restored.execution.activeStepIndex,restored.execution.operationEpoch),storyId:storyId,generation:restored.execution.generation,createdRevision:s.revision+1,initializationToken:'restore:'+c.commandId};if(restored.execution.cursor){restored.execution.cursor.leaseId=restored.execution.lease.id;restored.execution.cursor.storyPath=restored.execution.activeStoryPath;restored.execution.cursor.storyId=storyId;restored.execution.cursor.contactId=restored.execution.activeContactId||null;restored.execution.activeStepIndex=Number(restored.execution.cursor.rootIndex)||0}e.push({type:'save:resumed',storyId:storyId,stepIndex:restored.execution.activeStepIndex,leaseId:restored.execution.lease.id,sessionId:restored.sessionId,sourcePlaythroughId:sourcePlaythrough.id||null,playthroughId:restored.playthrough.id})}else{restored.execution.lease=null;restored.execution.status='idle';if(restored.execution.cursor&&restored.execution.cursor.completion!=='completed')restored.execution.cursor=null}Object.assign(s,restored);e.push({type:'save:restored',sourceRevision:Number(p.sourceRevision??restored.revision)||0,sourcePlaythroughId:sourcePlaythrough.id||null,playthroughId:restored.playthrough.id,playthroughGeneration:restored.playthrough.generation,runtimeOperationEpoch:restored.execution.operationEpoch});break}
case'START_STORY':{if(s.execution.lease)throw this.err('LEASE_CONFLICT','another story lease is active');if(p.onceKey?s.progression.onceKeys.includes(p.onceKey):s.progression.completedStoryIds.includes(p.storyId||p.storyPath))throw this.err('STORY_ALREADY_COMPLETED','completed story cannot acquire a new lease');this.stageStoryAdmissionDay(s,p,e);const admissionBlock=this.admissionBlockReason(s,p);if(admissionBlock)throw this.err(admissionBlock==='requirements_not_met'?'STORY_REQUIREMENTS_NOT_MET':'STORY_ADMISSION_BLOCKED',admissionBlock);if(!p.storyId&&!p.storyPath)throw this.err('INVALID_GRAPH_TARGET','story target is required');s.execution.activeStoryId=p.storyId||p.storyPath;s.execution.activeStoryPath=p.storyPath||null;s.world.gameTime=GameTimeService.clockForAdmission(s,s.execution.activeStoryPath);s.execution.activeContactId=p.contactId||null;s.execution.activeStepIndex=Number(p.stepIndex)||0;s.execution.status='running';s.execution.generation++;s.execution.lease={id:p.leaseId||'l-'+id(c.commandId,s.execution.generation),storyId:s.execution.activeStoryId,generation:s.execution.generation,createdRevision:s.revision};if(p.consumePendingStoryId&&String(s.progression.pendingStory?.id||'')===String(p.consumePendingStoryId)){s.progression.pendingStory=null;e.push({type:'story:pending-cleared',reason:'target_admitted',pendingStoryId:String(p.consumePendingStoryId)})}e.push({type:'story:started',storyId:s.execution.activeStoryId,contactId:s.execution.activeContactId,leaseId:s.execution.lease.id});cursorPatch={storyPath:s.execution.activeStoryPath,storyId:s.execution.activeStoryId,contactId:s.execution.activeContactId,rootIndex:s.execution.activeStepIndex,branchPath:[],operationId:null,operationType:null,branchReceiptId:null,gotoTarget:null,pendingUserIntent:null,pendingPresentationAck:null,phase:'ready_to_interpret',completion:'in_progress',continuation:'none',leaseId:s.execution.lease.id,...p.cursor||{}};break}
case'REASSIGN_ACTIVE_CONTACT':{const from=String(s.execution.activeContactId||'').trim().toLowerCase(),target=String(p.contactId||'').trim().toLowerCase();if(!s.execution.lease||String(p.leaseId||'')!==String(s.execution.lease.id||''))throw this.err('STALE_OPERATION','active lease does not match');if(!['player','__global_story__'].includes(from))throw this.err('CONTACT_REASSIGN_NOT_SENTINEL','active contact is not an actor sentinel');if(!target||['player','__global_story__'].includes(target))throw this.err('INVALID_CONTACT','real owning contact required');const sourceEvents=Array.isArray(s.conversations.eventsByContact[from])?s.conversations.eventsByContact[from]:[],targetEvents=Array.isArray(s.conversations.eventsByContact[target])?s.conversations.eventsByContact[target]:[],moved=[],kept=[];for(const event of sourceEvents){if(String(event?.storyPath||'')===String(s.execution.activeStoryPath||'')){const repaired={...event,contactId:target};if(!targetEvents.some(row=>String(row?.eventId||'')===String(repaired.eventId||'')))targetEvents.push(repaired);moved.push(repaired)}else kept.push(event)}if(targetEvents.length)s.conversations.eventsByContact[target]=targetEvents;if(kept.length)s.conversations.eventsByContact[from]=kept;else delete s.conversations.eventsByContact[from];const latestTarget=targetEvents.at(-1),latestFrom=kept.at(-1);if(latestTarget?.eventId)s.conversations.latestEventByContact[target]=latestTarget.eventId;if(latestFrom?.eventId)s.conversations.latestEventByContact[from]=latestFrom.eventId;else delete s.conversations.latestEventByContact[from];s.conversations.unreadByContact[target]=Math.max(0,Number(s.conversations.unreadByContact[target])||0)+Math.max(0,Number(s.conversations.unreadByContact[from])||0);delete s.conversations.unreadByContact[from];for(const notification of Object.values(s.notifications.committedEvents||{})){if(String(notification?.contactId||'')===from&&moved.some(event=>String(event.eventId||'')===String(notification.sourceEventId||notification.messageEventId||'')))notification.contactId=target}s.execution.activeContactId=target;cursorPatch={...(s.execution.cursor||{}),contactId:target};e.push({type:'story:active-contact-reassigned',storyId:s.execution.activeStoryId,storyPath:s.execution.activeStoryPath,fromContactId:from,contactId:target,movedEventIds:moved.map(event=>event.eventId)});break}
case'REPAIR_PSEUDO_CONTACT_EVENTS':{const repaired=[];for(const pseudo of['player','__global_story__']){const source=Array.isArray(s.conversations.eventsByContact[pseudo])?s.conversations.eventsByContact[pseudo]:[],kept=[];for(const event of source){const match=String(event?.storyPath||'').match(/_(aiden|evelyn|hailey|mason|lena|tutor)(?:_|\.)/i),owner=String(match?.[1]||'').toLowerCase();if(!owner){kept.push(event);continue}const target=s.conversations.eventsByContact[owner]||(s.conversations.eventsByContact[owner]=[]),moved={...event,contactId:owner};if(!target.some(row=>String(row?.eventId||'')===String(moved.eventId||'')))target.push(moved);repaired.push({eventId:moved.eventId,fromContactId:pseudo,contactId:owner})}if(kept.length)s.conversations.eventsByContact[pseudo]=kept;else delete s.conversations.eventsByContact[pseudo];delete s.conversations.unreadByContact[pseudo];if(kept.at(-1)?.eventId)s.conversations.latestEventByContact[pseudo]=kept.at(-1).eventId;else delete s.conversations.latestEventByContact[pseudo]}for(const owner of Object.keys(s.conversations.eventsByContact||{})){const tail=s.conversations.eventsByContact[owner]?.at(-1);if(tail?.eventId)s.conversations.latestEventByContact[owner]=tail.eventId}for(const notification of Object.values(s.notifications.committedEvents||{})){const row=repaired.find(item=>String(item.eventId||'')===String(notification?.sourceEventId||notification?.messageEventId||''));if(row)notification.contactId=row.contactId}e.push({type:'conversation:pseudo-contacts-repaired',repaired});break}
case'COMMIT_STORY_STEP':s.execution.activeStepIndex=Number(p.nextStepIndex??s.execution.activeStepIndex+1);e.push({type:'story:step-committed',storyId:s.execution.activeStoryId,stepIndex:p.stepIndex,eventId:p.eventId||null});cursorPatch=p.cursor||null;break;case'COMMIT_MESSAGE_EVENT':this.message(s,c,p,e);s.execution.activeStepIndex=Number(p.nextStepIndex??s.execution.activeStepIndex+1);cursorPatch=p.cursor||null;break;case'COMMIT_STORY_EFFECT':{const eventId=p.eventId||id(s.execution.activeStoryId,p.stepIndex,p.effectType);if(s.progression.effectReceipts[eventId])throw this.err('DUPLICATE_EFFECT','effect already committed');s.progression.effectReceipts[eventId]={eventId:eventId,effectType:p.effectType,storyId:s.execution.activeStoryId,contactId:s.execution.activeContactId,stepIndex:p.stepIndex,transactionId:c.commandId,committedRevision:s.revision+1};e.push({type:'story:effect-committed',eventId:eventId,effectType:p.effectType,storyId:s.execution.activeStoryId,contactId:s.execution.activeContactId,stepIndex:p.stepIndex,payload:clone(p.payload||{})});s.execution.activeStepIndex=Number(p.nextStepIndex??s.execution.activeStepIndex+1);cursorPatch=p.cursor||null;break}
// Group 6 (protected-write elimination): canonical resume bookmark for
// a contact whose story is NOT the currently active/leased one (the
// background walker's own "where did I last leave contact X" record).
// Deliberately not in needsLease -- the walker updates OTHER contacts'
// bookmarks while a different contact's story genuinely holds the
// lease, and gating this on lease ownership would make that legitimate
// case fail. Last-write-wins per contactId (no ordering/idempotency
// requirement beyond the engine's own commandId dedup) since it is a
// plain bookmark, not a receipt of something that happened once.
case'SET_CONTACT_PROGRESS':{const cid=String(p.contactId||'').trim();if(!cid)throw this.err('INVALID_CONTACT','contactId required');s.progression.contactProgress[cid]={storyPath:String(p.storyPath||''),index:Math.max(0,Math.floor(Number(p.index)||0))};e.push({type:'story:contact-progress-set',contactId:cid,storyPath:s.progression.contactProgress[cid].storyPath,index:s.progression.contactProgress[cid].index});break}
// Group 6 (protected-write elimination): canonical, ordered choice
// history (distinct from choiceReceipts -- one receipt per
// choiceGroupId, immutable; this is an append-only log of every choice
// ever made, in order, used for chapter-branch-key derivation and
// "was X picked" / "latest option for X" lookups that need recency
// ordering, not just a single current value). Capped the same as the
// pre-existing legacy list (2000 entries, oldest dropped first).
case'RECORD_CHOICE_LOG_ENTRY':{const choiceKey=String(p.choiceKey||'').trim();const optionId=String(p.optionId||'').trim();if(!choiceKey||!optionId)throw this.err('INVALID_CHOICE_LOG_ENTRY','choiceKey and optionId required');const entry={at:Number(p.at)||Date.now(),contactId:String(p.contactId||''),storyPath:String(p.storyPath||''),storyOnceKey:String(p.storyOnceKey||''),choiceKey:choiceKey,optionId:optionId,text:String(p.text||''),points:p.points&&typeof p.points==='object'?clone(p.points):{ntr:0,nts:0,love:0}};s.progression.choicesLog.push(entry);if(s.progression.choicesLog.length>2e3)s.progression.choicesLog.splice(0,s.progression.choicesLog.length-2e3);e.push({type:'story:choice-log-recorded',choiceKey:choiceKey,optionId:optionId,contactId:entry.contactId});break}
// Group 6 (protected-write elimination): canonical single-record
// pending-story slot (the "what should start/resume next, and why"
// queued by the boot-chain retry mechanism -- queuePendingStoryStart,
// touchPendingDispatch, resumePendingDispatch, resumePendingResume,
// schedulePendingRetry). Deliberately a whole-record REPLACE (not a
// field-level patch command) because every real caller already reads
// the current record, merges in JS, and writes the full result back --
// that merge logic stays in convo-runtime.js unchanged; only the
// storage substrate underneath it moves here. The record itself keeps
// an open shape (kind/path/contactId/opts/reason/attempts/... plus
// caller-specific metadata) rather than a fixed field allowlist,
// because `opts` is a genuine pass-through bag forwarded to
// Game.startStory's own (separately evolving) options surface --
// stripping it to a fixed schema here would silently drop fields a
// caller depends on. Not lease-gated: a pending story is inherently
// about a FUTURE start, decoupled from whichever story currently holds
// the lease (the walker queues bob's resume while alice's story is
// still active), the same rationale as SET_CONTACT_PROGRESS.
case'SET_PENDING_STORY':{const record=p.record;if(!record||typeof record!=='object')throw this.err('INVALID_PENDING_STORY','record object required');s.progression.pendingStory=clone(record);e.push({type:'story:pending-set',kind:String(record.kind||''),path:String(record.path||record.storyPath||''),contactId:String(record.contactId||'')});break}
// Idempotent: clearing an already-clear pending story is a no-op
// success (matches safeRemLS on an absent key), not an error -- every
// caller (resumePendingDispatch's success path, clearPendingForChapterStart,
// clearPendingForCurrentContact, ...) calls this unconditionally
// without first checking whether a pending story exists.
case'CLEAR_PENDING_STORY':{s.progression.pendingStory=null;e.push({type:'story:pending-cleared'});break}
// Generic canonical/persisted "player-facing interaction boundary"
// slot -- same single-record-replace shape and same not-lease-gated
// rationale as SET_PENDING_STORY/CLEAR_PENDING_STORY just above (a
// pending interaction, e.g. the character-rename overlay opened after
// an already-committed `image` step, is decoupled from whichever
// story currently holds the execution lease). Any UI surface that
// presents a player_first-style modal/overlay whose answer is NOT
// itself a canonical interpreter step (so story-interpreter.js has
// nothing to pause on) can record "this is still awaiting the player"
// here instead of relying on renderer-only state that a scene
// teardown would silently drop. Open shape (kind + whatever fields
// that kind needs to reconstruct its own presentation), not a fixed
// per-kind schema, matching pendingStory's own open shape.
case'SET_PENDING_INTERACTION':{const record=p.record;if(!record||typeof record!=='object')throw this.err('INVALID_PENDING_INTERACTION','record object required');s.progression.pendingInteraction=clone(record);e.push({type:'interaction:pending-set',kind:String(record.kind||''),contactId:String(record.contactId||'')});break}
// Idempotent, same as CLEAR_PENDING_STORY: clearing an already-clear
// pending interaction is a no-op success, not an error.
case'CLEAR_PENDING_INTERACTION':{s.progression.pendingInteraction=null;e.push({type:'interaction:pending-cleared'});break}
// Reading client content is a UI action, independent of a conversation lease.
// It preserves the story cursor and is captured/restored with world.variables.
case'SET_MEETANDGREET_VIEW_STATE':{const list=value=>[...new Set((Array.isArray(value)?value:[]).map(x=>String(x||'').trim().toLowerCase()).filter(Boolean))];s.world.variables.meetandgreet_view_v1={seen:list(p.seen),tipSeen:list(p.tipSeen)};e.push({type:'meetandgreet:view-changed'});break}
case'SET_SOCIAL_INTERACTION':{
const identity=p.lifecycle||{};
if(identity.playthroughId!==s.playthrough.id||Number(identity.playthroughGeneration)!==s.playthrough.generation||Number(identity.operationEpoch)!==s.execution.operationEpoch)throw this.err('SOCIAL_STALE_VIEW','the displayed post belongs to a retired game state');
const app=String(p.app||''),postId=String(p.postId||'').trim();
if(!this.socialInteractionTarget(s,app,postId))throw this.err('SOCIAL_POST_UNAVAILABLE','the post must be acquired and accessible');
const key=app+':'+postId,entries=s.world.variables.social_interactions_v1||(s.world.variables.social_interactions_v1={});
const entry=entries[key]||{liked:false,comment:null};
if(p.action==='like'){if(typeof p.liked!=='boolean')throw this.err('INVALID_SOCIAL_LIKE','liked must be a boolean');entry.liked=p.liked;}
else if(p.action==='comment'){
  const text=String(p.text??'').trim();if(!text||[...text].length>500)throw this.err('INVALID_SOCIAL_COMMENT','comment must contain 1 to 500 characters');
  const now=Date.now();entry.comment={authorId:'player',text,createdAt:entry.comment?.createdAt||now,updatedAt:now};
}else if(p.action==='delete_comment')entry.comment=null;
else throw this.err('INVALID_SOCIAL_ACTION','unsupported social action');
entries[key]=entry;e.push({type:'social:interaction-changed',app,postId});break;
}
// Group 6 (protected-write elimination): canonical storage substrate
// for the "conversations" render cache (scripts/notify-adapter.js's
// declared single source of truth for thread metadata -- avatar, name,
// unread, needsPlayer/playerDraft -- plus message content, which is
// itself already a proper derived projection fed exclusively by
// installCanonicalMessageBridge's subscription to committed message
// events, deduped by eventId before ever being appended). Whole-object
// replace (not a per-contact patch) because notify-adapter.js already
// does its own full read-modify-write cycle in JS before persisting --
// that logic is unchanged; only the underlying storage moves here, the
// same pattern already proven for progression.pendingStory. Not
// lease-gated: this cache is independent of whichever story currently
// holds the execution lease.
case'SET_CONVERSATIONS_CACHE':{if(!p.store||typeof p.store!=='object')throw this.err('INVALID_CONVERSATIONS_CACHE','store object required');s.progression.conversationsCache=clone(p.store);e.push({type:'conversations:cache-set',contactCount:Object.keys(s.progression.conversationsCache).length});break}
case'SET_CHOICE':s.world.choices[String(p.key||p.choiceId||'')]=clone(p.value??p.optionId??true);e.push({type:'story:choice-committed',storyId:s.execution.activeStoryId,contactId:s.execution.activeContactId,stepIndex:p.stepIndex,choiceId:p.choiceId,optionId:p.optionId,nextStepIndex:p.nextStepIndex});s.execution.activeStepIndex=Number(p.nextStepIndex??s.execution.activeStepIndex+1);cursorPatch=p.cursor||null;break;
// Group 2: canonical choice state. Immutable per choiceGroupId, exactly
// like RECORD_BRANCH_DECISION -- a duplicate/repeat selection attempt
// (double-tap, cross-mode re-render) returns the ORIGINAL receipt and
// does not re-apply consequences or move the cursor again. world.choices
// is still written (same domain the generic key:value condition
// fallback and the legacy choices_log_v1-adjacent readers already use)
// so existing non-choice: conditions that happen to read a choice key
// keep working; the receipt itself is the new source of truth for the
// choice: condition domain (see StoryInterpreter.conditionAccessor).
case'RECORD_CHOICE_DECISION':{const choiceGroupId=String(p.choiceGroupId||'');if(!choiceGroupId)throw this.err('INVALID_CHOICE_GROUP','choiceGroupId required');const existing=s.progression.choiceReceipts[choiceGroupId];if(!existing){const selectedOptionId=String(p.selectedOptionId||'');if(!selectedOptionId)throw this.err('INVALID_CHOICE_OPTION','selectedOptionId required');const options=Array.isArray(p.options)?clone(p.options):[];const option=options.find(o=>String(o?.id??o?.value??o?.text)===selectedOptionId)||null;if(option?.onceKey&&!s.progression.onceKeys.includes(option.onceKey))s.progression.onceKeys.push(option.onceKey);const setKeys=Array.isArray(option?.set)?option.set:[];for(const k of setKeys){const key=String(k||'').trim();if(key&&!s.progression.onceKeys.includes(key))s.progression.onceKeys.push(key)}const resultValue=p.resultValue!==undefined?clone(p.resultValue):option?.value??selectedOptionId;s.world.choices[choiceGroupId]=clone(resultValue);const selectedOptionText=String(p.selectedOptionText||option?.text||option?.label||'').trim();const choiceMessageEventId=selectedOptionText?'choice-'+id(s.execution.activeStoryId,choiceGroupId,selectedOptionId):null;if(choiceMessageEventId)this.message(s,c,{contactId:s.execution.activeContactId,eventId:choiceMessageEventId,from:'player',text:selectedOptionText,kind:'message',stepIndex:p.stepIndex},e);const routePoints={};for(const branch of['ntr','nts','love']){const amount=Number(option?.points?.[branch]||0)||0;if(amount){s.hak.routePoints[branch]=Math.max(0,Number(s.hak.routePoints[branch])||0)+amount;routePoints[branch]=amount}}const effectEventId=Object.keys(routePoints).length?'choice-effect:'+choiceGroupId:null;if(effectEventId)s.progression.effectReceipts[effectEventId]={eventId:effectEventId,kind:'choice_route_points',choiceGroupId:choiceGroupId,storyId:s.execution.activeStoryId,routePoints:clone(routePoints),committedRevision:s.revision+1};const receipt={choiceGroupId:choiceGroupId,storyId:s.execution.activeStoryId,sourceStepKey:String(p.sourceStepKey||''),options:options,selectedOptionId:selectedOptionId,selectedOptionText:selectedOptionText,choiceMessageEventId:choiceMessageEventId,resultValue:clone(resultValue),consequences:{onceKeys:[...option?.onceKey?[option.onceKey]:[],...setKeys],routePoints:Object.keys(routePoints).length?clone(routePoints):null,effectEventId:effectEventId},committedRevision:s.revision+1};s.progression.choiceReceipts[choiceGroupId]=receipt;e.push({type:'story:choice-decided',choiceGroupId:choiceGroupId,storyId:receipt.storyId,sourceStepKey:receipt.sourceStepKey,selectedOptionId:selectedOptionId,resultValue:receipt.resultValue,reused:false,routePointsDelta:clone(routePoints),effectEventId:effectEventId});if(effectEventId)e.push({type:'story:choice-effect-committed',eventId:effectEventId,choiceGroupId:choiceGroupId,routePointsDelta:clone(routePoints)})}else{e.push({type:'story:choice-decided',choiceGroupId:choiceGroupId,storyId:existing.storyId,sourceStepKey:existing.sourceStepKey,selectedOptionId:existing.selectedOptionId,resultValue:existing.resultValue,reused:true,routePointsDelta:{},effectEventId:existing.consequences?.effectEventId||null})}
// Advance the cursor on a REPLAY (existing receipt) too, not just a
// fresh decision -- story-interpreter.js's choice handler already
// resolves p.cursor to the position AFTER this choice for both
// cases (see its effectiveOption/next computation), using the
// receipt's own selectedOptionId when replaying. Previously this
// was gated to `!existing`, so replaying an already-answered choice
// left the cursor permanently parked ON the choice step forever --
// the exact `npm restart` symptom: cursor.phase stuck at
// waiting_for_user_intent/INPUT_REQUIRED for a choice the player
// had already answered, with no way to advance past it.
if(p.cursor)cursorPatch={...p.cursor,branchReceiptId:choiceGroupId};break}
case'SET_FLAG':{const flag=String(p.flag||'');if(!flag)throw this.err('INVALID_FLAG','flag required');if(!s.progression.onceKeys.includes(flag))s.progression.onceKeys.push(flag);s.execution.activeStepIndex=Number(p.nextStepIndex??s.execution.activeStepIndex+1);cursorPatch=p.cursor||null;break}
case'SET_STORY_VARIABLE':{const key=String(p.key||'');if(!key)throw this.err('INVALID_VARIABLE','key required');if(p.remove===true)delete s.world.variables[key];else s.world.variables[key]=clone(p.value===undefined?true:p.value);const routeMatch=key.match(/^route_([a-z0-9_]+)_locked_v1$/i);if(routeMatch){const contactId=String(routeMatch[1]||'').toLowerCase(),route=String(p.remove===true?'':s.world.variables[key]||'').toLowerCase();if(p.remove===true){delete s.world.routes[contactId];delete s.world.routeLocks[contactId]}else if(['love','ntr','nts','nts_aiden','nts_ethan','nts_coach'].includes(route)){s.world.routes[contactId]=route;s.world.routeLocks[contactId]=route;e.push({type:'world:route-locked',contactId:contactId,route:route})}}s.execution.activeStepIndex=Number(p.nextStepIndex??s.execution.activeStepIndex+1);e.push({type:'world:variable-set',key:key,value:p.remove===true?null:s.world.variables[key]??null,removed:p.remove===true});cursorPatch=p.cursor||null;break}
case'RECORD_BRANCH_DECISION':{const branchId=String(p.branchId||'');if(!branchId)throw this.err('INVALID_BRANCH','branchId required');const existing=s.progression.branchReceipts[branchId];if(!existing){const receipt={branchId:branchId,storyId:s.execution.activeStoryId,sourceStepKey:String(p.sourceStepKey||''),condition:String(p.condition||''),result:!!p.result,selectedBranch:p.result?'then':'else',committedRevision:s.revision+1};s.progression.branchReceipts[branchId]=receipt;e.push({type:'story:branch-decided',branchId:branchId,storyId:receipt.storyId,sourceStepKey:receipt.sourceStepKey,result:receipt.result,selectedBranch:receipt.selectedBranch,reused:false});cursorPatch=p.cursor?{...p.cursor,branchReceiptId:branchId}:null}else{e.push({type:'story:branch-decided',branchId:branchId,storyId:existing.storyId,sourceStepKey:existing.sourceStepKey,result:existing.result,selectedBranch:existing.selectedBranch,reused:true})}break}
case'MARK_ONCE':{const key=String(p.key||'');if(!key)throw this.err('INVALID_FLAG','key required');if(!s.progression.onceKeys.includes(key))s.progression.onceKeys.push(key);e.push({type:'progression:once-marked',key:key});break}
case'COMPLETE_STORY':cursorPatch=this.complete(s,c,p,e);break;case'ACTIVATE_CONTINUATION':cursorPatch=this.continuation(s,c,p,e);break;case'RECORD_BLOCKED_STATE':{const blocked={code:String(p.code||'BLOCKED'),retryable:!!p.retryable,recoveryPolicy:String(p.recoveryPolicy||'manual'),storyId:s.execution.activeStoryId,storyPath:s.execution.activeStoryPath,contactId:s.execution.activeContactId,leaseId:s.execution.lease?s.execution.lease.id:null,cursor:s.execution.cursor?clone(s.execution.cursor):null,detail:p.detail?clone(p.detail):null,recordedRevision:s.revision+1};s.execution.blocked=blocked;if(s.execution.cursor){s.execution.cursor.phase='blocked_error';s.execution.cursor.storyRevision=s.revision+1}e.push({type:'execution:blocked',code:blocked.code,retryable:blocked.retryable,storyId:blocked.storyId,leaseId:blocked.leaseId});break}
case'OPEN_CONTACT':{const cid=String(p.contactId||'');if(!cid)throw this.err('CONTACT_REQUIRED','contactId required');s.conversations.unreadByContact[cid]=0;e.push({type:'contact:opened',contactId:cid});break}
case'SET_CONVERSATION_PRESENCE':{const mountState=p.mountState==null?null:String(p.mountState);if(mountState!==null&&!['opening','mounted','closing'].includes(mountState))throw this.err('INVALID_PRESENCE_STATE','mountState must be opening, mounted, closing, or null');const cid=mountState===null?null:String(p.contactId||'');if(mountState!==null&&!cid)throw this.err('CONTACT_REQUIRED','contactId required for a non-null mountState');
// storyId anchors presence to the SPECIFIC story instance the renderer
// actually mounted for this contact (the one active when this dispatch
// fired), not merely the bare contactId. A background admission that
// hands the SAME contact a NEW story (e.g. a same-day/next-day
// continuation) can otherwise inherit a stale "mounted" presence left
// over from a PRIOR, already-superseded conversation instance for that
// same contact -- the renderer has not actually mounted the new one yet,
// but the reducer's own contactId match alone cannot tell the two apart.
// Live-reproduced 2026-09-06 (tester report: Day3 Lena's first morning
// message shows no unread/notification after a same-day HAK->time_card
// hand-off from Lena's own prior-night conversation): confirmed via a
// clean-room reducer trace that a "mounted" presence surviving
// unchanged across two DIFFERENT COMPLETE_STORY admissions for the same
// contact silently suppresses the new story's own first notification.
s.presence={contactId:cid,mountState:mountState,storyId:mountState===null?null:String(s.execution.activeStoryId||''),navigationTransactionId:String(p.navigationTransactionId||c.commandId||''),committedRevision:s.revision+1};e.push({type:'presence:changed',contactId:cid,mountState:mountState,navigationTransactionId:s.presence.navigationTransactionId});break}
case'COMMIT_NOTIFICATION_EVENT':{const eid=p.notificationId||p.eventId||id(p.messageEventId,p.contactId,'notification');if(s.notifications.committedEvents[eid])throw this.err('DUPLICATE_NOTIFICATION','notification already committed');if(!p.messageEventId||!p.contactId)throw this.err('INVALID_NOTIFICATION','messageEventId and contactId required');const notificationPayload={text:p.text||'',...clone(p.payload||{})};delete notificationPayload.gameTime;if(String(notificationPayload.target||'').trim().toLowerCase()==='conversation')this.message(s,c,{contactId:p.contactId,eventId:p.messageEventId,from:p.from||notificationPayload.fromId||p.contactId,text:p.text||notificationPayload.text||'',kind:p.kind||notificationPayload.kind||'message',assetId:p.assetId||notificationPayload.assetId||null,link:p.link||notificationPayload.link||null,stepIndex:p.stepIndex},e);s.notifications.committedEvents[eid]={notificationId:eid,sourceEventId:p.messageEventId,contactId:p.contactId,transactionId:c.commandId,committedRevision:s.revision+1,type:p.notificationType||p.type||'story',payload:notificationPayload,displayReceipt:null};s.execution.activeStepIndex=Number(p.nextStepIndex??s.execution.activeStepIndex+1);e.push({type:'notification:committed',notificationId:eid,eventId:eid,contactId:p.contactId,sourceEventId:p.messageEventId,messageEventId:p.messageEventId});cursorPatch=p.cursor||null;break}
case'MARK_NOTIFICATION_DISPLAYED':{const eid=String(p.notificationId||p.eventId||'');const notification=s.notifications.committedEvents[eid];if(!notification)throw this.err('NOTIFICATION_NOT_FOUND','notification must be committed before display');if(!notification.displayReceipt)notification.displayReceipt={notificationId:eid,transactionId:c.commandId,displayedRevision:s.revision+1,displayedAt:Number(p.displayedAt)||Date.now()};if(!s.notifications.displayedEventIds.includes(eid))s.notifications.displayedEventIds.push(eid);e.push({type:'notification:displayed',notificationId:eid,contactId:notification.contactId});break}
case'CHANGE_DAY':if(Number(p.day)<1||Number(p.day)>20)throw this.err('INVALID_DAY','day outside supported range');if(Number(p.day)!==Number(s.world.day)){const block=this.chronologyDayBlock(s,Number(p.day));if(block)throw this.err(block.status==='CHRONOLOGY_CAUSAL_CONFLICT'?'CHRONOLOGY_CAUSAL_CONFLICT':'STORY_DAY_INCOMPLETE',JSON.stringify(block))}if(s.world.day!==Number(p.day))s.world.gameTime=GameTimeService.clockForDayTransition(s,Number(p.day));s.world.day=Number(p.day);this.consumeDayTransitionIntent(s,e);s.execution.activeStepIndex=Number(p.nextStepIndex??s.execution.activeStepIndex+1);e.push({type:'world:day-changed',day:s.world.day,stepIndex:p.stepIndex});cursorPatch=p.cursor||null;break;case'UNLOCK_APP':if(!s.world.appUnlocks.includes(p.appId))s.world.appUnlocks.push(p.appId);s.execution.activeStepIndex=Number(p.nextStepIndex??s.execution.activeStepIndex+1);e.push({type:'world:app-unlocked',appId:p.appId});cursorPatch=p.cursor||null;break;case'SET_ROUTE':s.world.routes[p.contactId]=p.route;break;case'SET_ACTIVE_CHARACTER':{const cid=String(p.contactId||'');if(!cid)throw this.err('CONTACT_REQUIRED','contactId required');const set=new Set(s.world.activeCharacters);if(p.active===false)set.delete(cid);else set.add(cid);s.world.activeCharacters=[...set];e.push({type:'world:active-character-changed',contactId:cid,active:p.active!==false});break}
case'SET_ROUTE_LOCK':s.world.routeLocks[p.contactId]=p.route;s.execution.activeStepIndex=Number(p.nextStepIndex??s.execution.activeStepIndex+1);e.push({type:'world:route-locked',contactId:p.contactId,route:p.route});cursorPatch=p.cursor||null;break;case'SET_MASON_VARIANT':s.world.masonVariant=p.variant==='female'?'female':'male';break;case'SET_COACH':s.world.coachIdentity=p.coachId||null;break;case'RECORD_REWARD':s.world.rewards.push({...clone(p),receiptId:p.receiptId||id(c.commandId,p.kind,p.value)});s.world.hakPoints+=Number(p.hakPoints||p.points||0)||0;s.execution.activeStepIndex=Number(p.nextStepIndex??s.execution.activeStepIndex+1);e.push({type:'world:reward-committed',payload:clone(p)});cursorPatch=p.cursor||null;break;case'UNLOCK_ONLYFUN':{const once=this.onlyfunOnce(s,c,p,'unlock');if(!once.reused){s.onlyfun.unlocked=true;if(!s.world.appUnlocks.includes('onlyfun'))s.world.appUnlocks.push('onlyfun')}e.push({type:'onlyfun:unlocked',operationId:once.operationId,reused:once.reused});s.execution.activeStepIndex=Number(p.nextStepIndex??s.execution.activeStepIndex+1);cursorPatch=p.cursor||null;break}
case'UNLOCK_ONLYFUN_ACCOUNT':{const once=this.onlyfunOnce(s,c,p,'account-unlock'),creatorId=this.onlyfunCreatorId(p.creatorId||p.creator||p.authorId||p.accountId||p.id);if(!creatorId)throw this.err('INVALID_ONLYFUN_ACCOUNT','creatorId required');if(!once.reused){const prior=s.onlyfun.creators[creatorId]||{},displayName=this.onlyfunDisplayName(creatorId,p.creatorDisplayName||p.displayName||p.name||p.authorName||prior.displayName||prior.name);const profile={...prior,...clone(p.profile||{}),id:creatorId,creatorId:creatorId,displayName:displayName,name:displayName,avatar:String(p.avatar||p.avatarUrl||p.photo||prior.avatar||''),priceEur:Math.max(0,Number(p.priceEur??prior.priceEur)||0),tagline:String(p.tagline||p.bio||prior.tagline||'Private creator feed.'),unlocked:true,unlockedAt:Number(p.unlockedAt)||Date.now()};s.onlyfun.unlocked=true;s.onlyfun.creators[creatorId]=profile;s.onlyfun.accounts[creatorId]=clone(profile);if(p.subscribe!==false&&p.subscribed!==false)s.onlyfun.subscriptions[creatorId]=true;if(!s.world.appUnlocks.includes('onlyfun'))s.world.appUnlocks.push('onlyfun')}e.push({type:'onlyfun:account-unlocked',operationId:once.operationId,reused:once.reused,creatorId:creatorId,profile:clone(s.onlyfun.accounts[creatorId])});s.execution.activeStepIndex=Number(p.nextStepIndex??s.execution.activeStepIndex+1);cursorPatch=p.cursor||null;break}
case'ADD_ONLYFUN_POST':{const once=this.onlyfunOnce(s,c,p,'post'),raw=clone(p.post||p),postId=String(raw.id||raw.onceKey||'').trim(),creatorId=this.onlyfunCreatorId(raw.creatorId||raw.creator||raw.authorId),image=String(raw.image||raw.url||raw.src||'').trim();if(!postId||!creatorId||!image)throw this.err('INVALID_ONLYFUN_POST','stable post id, creatorId, and image required');let inserted=false;if(!once.reused){const creator=s.onlyfun.creators[creatorId]||{},idx=s.onlyfun.posts.findIndex(row=>String(row?.id||'')===postId);const post={...raw,id:postId,onceKey:String(raw.onceKey||postId),creatorId:creatorId,creatorDisplayName:this.onlyfunDisplayName(creatorId,raw.creatorDisplayName||raw.authorName||creator.displayName||creator.name),creatorAvatar:String(raw.creatorAvatar||raw.avatar||creator.avatar||''),image:image,text:String(raw.text||raw.caption||''),likes:Math.max(0,Math.round(Number(raw.likes)||0)),requiresSub:raw.requiresSub!==false,createdAt:Math.max(1,Number(raw.createdAt||raw.at)||Date.now()),gameTime:GameTimeService.captureStamp(GameTimeService.normalizeStamp(s.onlyfun.posts[idx]?.gameTime)||GameTimeService.normalizeStamp(raw.gameTime||raw))};if(idx>=0)s.onlyfun.posts[idx]={...s.onlyfun.posts[idx],...post};else{s.onlyfun.posts.push(post);inserted=true}s.onlyfun.posts.sort((a,b)=>Number(b?.createdAt||0)-Number(a?.createdAt||0));if(inserted&&raw.notify===true&&s.onlyfun.subscriptions[creatorId]){const notificationId=String(raw.notificationId||'onlyfun-post:'+postId);if(!s.notifications.committedEvents[notificationId]){const text=String(raw.notifyText||raw.preview||post.text||`${post.creatorDisplayName} posted`);s.notifications.committedEvents[notificationId]={notificationId:notificationId,sourceEventId:once.operationId,messageEventId:once.operationId,contactId:creatorId,transactionId:c.commandId,committedRevision:s.revision+1,type:'onlyfun_post',payload:{app:'onlyfun',fromId:creatorId,fromName:post.creatorDisplayName,avatar:post.creatorAvatar,text:text,target:'onlyfun',open:{scene:'onlyfun',creatorId:creatorId,postId:postId}},displayReceipt:null};e.push({type:'notification:committed',notificationId:notificationId,eventId:notificationId,contactId:creatorId,sourceEventId:once.operationId,messageEventId:once.operationId})}}}e.push({type:'onlyfun:post-added',operationId:once.operationId,reused:once.reused,inserted:inserted,creatorId:creatorId,postId:postId,post:clone(s.onlyfun.posts.find(row=>String(row?.id||'')===postId)||null)});s.execution.activeStepIndex=Number(p.nextStepIndex??s.execution.activeStepIndex+1);cursorPatch=p.cursor||null;break}
case'SEED_ONLYFUN_CONTENT':{const once=this.onlyfunOnce(s,c,p,'seed');if(!once.reused){for(const raw of Array.isArray(p.creators)?p.creators:[]){const creatorId=this.onlyfunCreatorId(raw?.id||raw?.creatorId);if(creatorId)s.onlyfun.creators[creatorId]={...s.onlyfun.creators[creatorId]||{},...clone(raw),id:creatorId,creatorId:creatorId}}const known=new Set(s.onlyfun.posts.map(row=>String(row?.id||'')));for(const raw of Array.isArray(p.posts)?p.posts:[]){const postId=String(raw?.id||'').trim(),creatorId=this.onlyfunCreatorId(raw?.creatorId);if(postId&&creatorId&&!known.has(postId)){known.add(postId);s.onlyfun.posts.push({...clone(raw),id:postId,creatorId:creatorId,gameTime:GameTimeService.captureStamp(GameTimeService.resolveStamp(raw,{kind:'onlyfun',id:postId,storyPath:raw.storyPath,onceKey:raw.onceKey}))})}}s.onlyfun.posts.sort((a,b)=>Number(b?.createdAt||0)-Number(a?.createdAt||0));s.onlyfun.migration.seeded=true}e.push({type:'onlyfun:content-seeded',operationId:once.operationId,reused:once.reused,creatorCount:Object.keys(s.onlyfun.creators).length,postCount:s.onlyfun.posts.length});break}
case'SET_ONLYFUN_SIGNED_IN':{s.onlyfun.signedIn=p.signedIn!==false;e.push({type:'onlyfun:sign-in-changed',signedIn:s.onlyfun.signedIn});break}
case'SET_ONLYFUN_SUBSCRIPTION':{const creatorId=this.onlyfunCreatorId(p.creatorId);if(!creatorId)throw this.err('INVALID_ONLYFUN_SUBSCRIPTION','creatorId required');s.onlyfun.subscriptions[creatorId]=p.subscribed!==false;e.push({type:'onlyfun:subscription-changed',creatorId:creatorId,subscribed:s.onlyfun.subscriptions[creatorId]});break}
case'MARK_ONLYFUN_POST_VIEWED':{const postId=String(p.postId||p.id||'').trim();if(!postId||!s.onlyfun.posts.some(row=>String(row?.id||'')===postId))throw this.err('ONLYFUN_POST_NOT_FOUND','post must exist before it is viewed');s.onlyfun.seenPosts[postId]=true;e.push({type:'onlyfun:post-viewed',postId:postId});break}
case'SET_ONLYFUN_PENDING_GATE':{const once=this.onlyfunOnce(s,c,p,'gate'),gateId=String(p.gateId||p.id||once.operationId);if(!once.reused)s.onlyfun.pendingGates[gateId]={...clone(p.gate||p),id:gateId,gateId:gateId,creatorId:this.onlyfunCreatorId(p.creatorId||p.gate?.creatorId),createdRevision:s.revision+1};e.push({type:'onlyfun:gate-set',operationId:once.operationId,reused:once.reused,gate:clone(s.onlyfun.pendingGates[gateId])});s.execution.activeStepIndex=Number(p.nextStepIndex??s.execution.activeStepIndex+1);cursorPatch=p.cursor||null;break}
case'ACK_ONLYFUN_EVENT':{const eventId=String(p.eventId||p.gateId||'').trim();if(!eventId)throw this.err('INVALID_ONLYFUN_EVENT','event id required');delete s.onlyfun.pendingGates[eventId];if(s.onlyfun.pendingInteraction&&String(s.onlyfun.pendingInteraction.eventId||'')===eventId)s.onlyfun.pendingInteraction=null;e.push({type:'onlyfun:event-acknowledged',eventId:eventId});break}
case'UNLOCK_HAK':{const once=this.hakOnce(s,c,p,'unlock');if(!once.reused){s.hak.unlocked=true;s.hak.visible=p.visible!==false;s.hak.openable=p.openable===true;s.hak.level=Math.max(s.hak.level,Math.max(1,Number(p.level)||1));if(!s.world.appUnlocks.includes('hak'))s.world.appUnlocks.push('hak')}e.push({type:'hak:unlocked',operationId:once.operationId,reused:once.reused,level:s.hak.level});s.execution.activeStepIndex=Number(p.nextStepIndex??s.execution.activeStepIndex+1);cursorPatch=p.cursor||null;break}
case'ADD_HAK_EVIDENCE':{const once=this.hakOnce(s,c,p,'evidence');const profileId=String(p.profileId||p.profile?.id||p.contactId||'').trim().toLowerCase();const items=Array.isArray(p.evidences)?p.evidences:p.evidence?[p.evidence]:[];if(!profileId||!items.length)throw this.err('INVALID_HAK_EVIDENCE','profileId and evidences required');const added=[];if(!once.reused){const row=s.hak.evidenceProfiles[profileId]||(s.hak.evidenceProfiles[profileId]={profile:clone(p.profile||{}),kind:String(p.kind||p.route||''),route:String(p.route||p.kind||''),evidences:[]});row.profile={...row.profile||{},...clone(p.profile||{})};row.evidences=Array.isArray(row.evidences)?row.evidences:[];const known=new Set(Object.values(s.hak.evidenceProfiles).flatMap(r=>(Array.isArray(r?.evidences)?r.evidences:[]).map(x=>String(x?.id||''))));for(const raw of items){const evidence=clone(raw||{}),eid=String(evidence.id||evidence.evidenceId||'').trim(),url=String(evidence.url||evidence.src||evidence.image||'').trim();if(!eid||!url)throw this.err('INVALID_HAK_EVIDENCE','stable evidence id and media url required');if(known.has(eid))continue;known.add(eid);evidence.id=eid;evidence.url=url;evidence.src=String(evidence.src||url);evidence.timestamp=Math.max(1,Number(evidence.timestamp||evidence.at)||Date.now());row.evidences.push(evidence);added.push(eid)}row.evidences.sort((a,b)=>Number(b?.timestamp||0)-Number(a?.timestamp||0))}e.push({type:'hak:evidence-added',operationId:once.operationId,reused:once.reused,profileId:profileId,evidenceIds:added});s.execution.activeStepIndex=Number(p.nextStepIndex??s.execution.activeStepIndex+1);cursorPatch=p.cursor||null;break}
case'ADD_HAK_PHOTO':{const once=this.hakOnce(s,c,p,'photo'),item=clone(p.photo||p),eid=String(item.id||'').trim();if(!eid)throw this.err('INVALID_HAK_EVIDENCE','stable photo id required');if(!once.reused&&!s.hak.photos.some(x=>String(x?.id||'')===eid)){item.id=eid;item.seen=!!item.seen;s.hak.photos.unshift(item)}e.push({type:'hak:photo-added',operationId:once.operationId,reused:once.reused,evidenceId:eid});s.execution.activeStepIndex=Number(p.nextStepIndex??s.execution.activeStepIndex+1);cursorPatch=p.cursor||null;break}
case'MARK_HAK_EVIDENCE_SEEN':{const eid=String(p.evidenceId||p.id||'').trim();if(!eid)throw this.err('INVALID_HAK_EVIDENCE','evidence id required');s.hak.evidenceSeen[eid]=true;const photo=s.hak.photos.find(x=>String(x?.id||'')===eid);if(photo)photo.seen=true;e.push({type:'hak:evidence-seen',evidenceId:eid});break}
case'SET_HAK_WATCHLIST':{const once=this.hakOnce(s,c,p,'watchlist'),selected=[...new Set((Array.isArray(p.selected)?p.selected:[]).map(v=>String(v||'').trim().toLowerCase()).filter(Boolean))];if(p.allowNone===false&&selected.length===0)throw this.err('INVALID_HAK_WATCHLIST','at least one target required');if(!once.reused){s.hak.watchlist.selected=selected;s.hak.watchlist.targets=clone(p.targets||Object.fromEntries(selected.map(x=>[x,true])));s.hak.watchlist.config=p.config?clone(p.config):s.hak.watchlist.config;s.hak.watchlist.configured=true;if(p.visible!=null)s.hak.visible=!!p.visible;if(p.syncActiveCharacters!==false){const selectable=new Set((Array.isArray(p.availableTargetIds)?p.availableTargetIds:Object.keys(s.hak.watchlist.targets||{})).map(v=>String(v||'').trim().toLowerCase()).filter(Boolean));const active=new Set(s.world.activeCharacters);for(const cid of selectable){if(selected.includes(cid))active.add(cid);else active.delete(cid)}active.add('aiden');s.world.activeCharacters=[...active]}}e.push({type:'hak:watchlist-changed',operationId:once.operationId,reused:once.reused,selected:clone(s.hak.watchlist.selected)});s.execution.activeStepIndex=Number(p.nextStepIndex??s.execution.activeStepIndex+1);cursorPatch=p.cursor||null;break}
case'ADD_HAK_PROGRESS':{const once=this.hakOnce(s,c,p,'progress'),branch=String(p.branch||p.route||'').trim().toLowerCase(),amount=Number(p.amount??p.points),max=Math.max(0,Number(p.max)||16);if(!['nts','ntr','love'].includes(branch)||!Number.isFinite(amount)||amount<0)throw this.err('INVALID_HAK_PROGRESS','valid branch and non-negative amount required');if(!once.reused)s.hak.routePoints[branch]=Math.min(max,s.hak.routePoints[branch]+amount);e.push({type:'hak:progress-added',operationId:once.operationId,reused:once.reused,branch:branch,amount:amount,balance:s.hak.routePoints[branch]});break}
case'SPEND_HAK_PROGRESS':{const once=this.hakOnce(s,c,p,'progress-spend'),branch=String(p.branch||p.route||'').trim().toLowerCase(),amount=Number(p.amount??p.points);if(!['nts','ntr','love'].includes(branch)||!Number.isFinite(amount)||amount<0)throw this.err('INVALID_HAK_PROGRESS','valid branch and non-negative amount required');if(!once.reused){if(s.hak.routePoints[branch]<amount)throw this.err('INSUFFICIENT_HAK_POINTS','insufficient HAK points');s.hak.routePoints[branch]-=amount}e.push({type:'hak:progress-spent',operationId:once.operationId,reused:once.reused,branch:branch,amount:amount,balance:s.hak.routePoints[branch]});break}
case'UNLOCK_HAK_SKILL':{if(!(deps.hakSkills||root.HakSkillDefinitions).isAvailable(s,String(p.skillId||p.id||'').trim()))throw this.err('HAK_SKILL_NOT_ANNOUNCED','skill is not announced yet');const once=this.hakOnce(s,c,p,'skill'),skillId=String(p.skillId||p.id||'').trim(),branch=String(p.branch||'').trim().toLowerCase(),cost=Math.max(0,Number(p.cost)||0),requires=(Array.isArray(p.requires)?p.requires:p.requires?[p.requires]:[]).map(String);if(!skillId||!['nts','ntr','love','global'].includes(branch))throw this.err('INVALID_HAK_SKILL','skillId and valid branch required');let paymentBranch=branch;if(branch==='global'){const requested=String(p.paymentBranch||'').trim().toLowerCase();paymentBranch=['nts','ntr','love'].includes(requested)?requested:['nts','ntr','love'].find(key=>s.hak.routePoints[key]>=cost)||''}if(!once.reused){if(s.hak.skills.unlocked[skillId])throw this.err('HAK_SKILL_ALREADY_UNLOCKED','skill already unlocked');if(requires.some(req=>!s.hak.skills.unlocked[req]))throw this.err('HAK_SKILL_PREREQUISITE','skill prerequisite locked');if(!paymentBranch||s.hak.routePoints[paymentBranch]<cost)throw this.err('INSUFFICIENT_HAK_POINTS','insufficient HAK points');const thoughts=normalizeHakSkillSpendThoughts(s.hak);s.hak.tutorial.skillSpendThoughts=thoughts;s.hak.routePoints[paymentBranch]-=cost;s.hak.skills.unlocked[skillId]={at:Number(p.at)||Date.now(),branch:branch,cost:cost,paymentBranch:paymentBranch,receiptId:once.operationId};if(cost>0&&thoughts.shown[skillId]!==true&&!thoughts.pending.some(row=>row.skillId===skillId))thoughts.pending.push({operationId:once.operationId,skillId:skillId,branch:paymentBranch,cost:cost})}e.push({type:'hak:skill-unlocked',operationId:once.operationId,reused:once.reused,skillId:skillId,branch:branch,paymentBranch:paymentBranch,balance:paymentBranch?s.hak.routePoints[paymentBranch]:0});break}
case'ACK_HAK_SKILL_SPEND_THOUGHT':case'ACK_HAK_FIRST_SKILL_SPEND_THOUGHT':{
  const thoughts=normalizeHakSkillSpendThoughts(s.hak),operationId=String(p.operationId||''),skillId=String(p.skillId||'');
  if(!operationId||(c.type==='ACK_HAK_SKILL_SPEND_THOUGHT'&&!skillId))throw this.err('HAK_SKILL_SPEND_THOUGHT_NOT_PENDING','purchase operation and skill identity are required');
  const pending=thoughts.pending.find(row=>row.operationId===operationId&&(!skillId||row.skillId===skillId));
  if(!pending){
    if((skillId&&thoughts.shown[skillId]===true)||(c.type==='ACK_HAK_FIRST_SKILL_SPEND_THOUGHT'&&s.hak.tutorial.firstSkillSpendThoughtShown===true)){
      e.push({type:'hak:skill-spend-thought-shown',skillId:skillId,reused:true});break;
    }
    throw this.err('HAK_SKILL_SPEND_THOUGHT_NOT_PENDING','the successful skill spend must own this acknowledgment');
  }
  thoughts.shown[pending.skillId]=true;
  thoughts.pending=thoughts.pending.filter(row=>row.operationId!==pending.operationId);
  s.hak.tutorial.skillSpendThoughts=thoughts;
  if(s.hak.tutorial.firstSkillSpendThought?.operationId===pending.operationId){s.hak.tutorial.firstSkillSpendThoughtShown=true;s.hak.tutorial.firstSkillSpendThought=null;}
  e.push({type:'hak:skill-spend-thought-shown',operationId:operationId,skillId:pending.skillId,branch:pending.branch});break;
}
case'SET_HAK_GATE':{const once=this.hakOnce(s,c,p,'gate');if(!once.reused)s.hak.gate={gateId:String(p.gateId||once.operationId),required:[...new Set((Array.isArray(p.required)?p.required:[]).map(String).filter(Boolean))],startStory:String(p.startStory||'').trim(),contactId:p.contactId||null,createdRevision:s.revision+1};e.push({type:'hak:gate-set',operationId:once.operationId,reused:once.reused,gate:clone(s.hak.gate)});s.execution.activeStepIndex=Number(p.nextStepIndex??s.execution.activeStepIndex+1);cursorPatch=p.cursor||null;break}
case'SET_HAK_TUTORIAL':{const patch=clone(p.tutorial||p);delete patch.openable;delete patch.visible;s.hak.tutorial={...s.hak.tutorial,...patch};if(p.openable!=null)s.hak.openable=!!p.openable;if(p.visible!=null)s.hak.visible=!!p.visible;e.push({type:'hak:tutorial-changed',tutorial:clone(s.hak.tutorial),openable:s.hak.openable,visible:s.hak.visible});break}
case'SET_HAK_PENDING_INTERACTION':s.hak.pendingInteraction=p.interaction?clone(p.interaction):null;e.push({type:'hak:pending-interaction-changed',interaction:clone(s.hak.pendingInteraction)});break;case'ACK_HAK_EVENT':{const eventId=String(p.eventId||p.operationId||'').trim();if(!eventId)throw this.err('INVALID_HAK_EVENT','event id required');if(s.hak.pendingInteraction&&String(s.hak.pendingInteraction.eventId||s.hak.pendingInteraction.operationId||'')===eventId)s.hak.pendingInteraction=null;if(s.hak.gate&&String(s.hak.gate.gateId||'')===eventId)s.hak.gate=null;e.push({type:'hak:event-acknowledged',eventId:eventId});break}
case'RELEASE_LEASE':{const active=(this.storyAdmissionCatalog||root.StoryAdmissionCatalog||[]).find(row=>row.path===s.execution.activeStoryPath),inactive=active&&['mason','lena','hailey','evelyn'].includes(String(active.contactId||''))&&!s.world.activeCharacters.includes(active.contactId);if(active&&s.execution.lease&&!inactive&&s.execution.cursor?.completion!=='completed')throw this.err('ACTIVE_STORY_INCOMPLETE','complete the current global story before releasing its lease');this.releaseLease(s);break;}default:throw this.err('UNKNOWN_COMMAND','unsupported command '+c.type)}if(cursorPatch&&!this.isStaleIfCursorPatch(s.execution.cursor,cursorPatch)){s.execution.cursor=this.mergeCursor(s.execution.cursor,cursorPatch);s.execution.cursor.storyRevision=s.revision+1;if(Number.isFinite(cursorPatch.rootIndex))s.execution.activeStepIndex=cursorPatch.rootIndex;if(cursorPatch.phase&&cursorPatch.phase!=='blocked_error')s.execution.blocked=null}}onlyfunCreatorId(value){const raw=String(value||'').trim().toLowerCase().replace(/\s+/g,'_');return raw==='staticmuse'||raw==='sexminator'?'static_muse':raw}onlyfunOnce(s,c,p,kind){const operationId=String(p.operationId||p.receiptId||'').trim();if(!operationId)throw this.err('ONLYFUN_OPERATION_ID_REQUIRED','stable OnlyFun operationId required');const existing=s.onlyfun.receipts[operationId];if(existing){if(String(existing.kind||'')!==String(kind||''))throw this.err('ONLYFUN_OPERATION_ID_CONFLICT','OnlyFun operationId reused for another semantic kind');return{operationId:operationId,reused:true,receipt:existing}}const receipt={operationId:operationId,kind:String(kind||''),storyId:s.execution.activeStoryId||null,stepIndex:Number(p.stepIndex??s.execution.activeStepIndex)||0,commandId:c.commandId,committedRevision:s.revision+1};s.onlyfun.receipts[operationId]=receipt;return{operationId:operationId,reused:false,receipt:receipt}}hakOnce(s,c,p,kind){const operationId=String(p.operationId||p.receiptId||'').trim();if(!operationId)throw this.err('HAK_OPERATION_ID_REQUIRED','stable HAK operationId required');const existing=s.hak.receipts[operationId];if(existing){if(String(existing.kind||'')!==String(kind||''))throw this.err('HAK_OPERATION_ID_CONFLICT','HAK operationId reused for another semantic kind');return{operationId:operationId,reused:true,receipt:existing}}const receipt={operationId:operationId,kind:String(kind||''),storyId:s.execution.activeStoryId||null,stepIndex:Number(p.stepIndex??s.execution.activeStepIndex)||0,commandId:c.commandId,committedRevision:s.revision+1};s.hak.receipts[operationId]=receipt;return{operationId:operationId,reused:false,receipt:receipt}}
// A duplicate eventId (content-addressed: storyId+stepIndex+text) means
// this exact message was already committed -- possibly under a lease
// that was later released without preserving its cursor (see
// executeCanonicalProgressionStep's catch-up loop / [[if-cursor stale-
// mirror race]]), leaving execution.activeStepIndex/cursor parked
// BEHIND real committed history. THROWING here (the previous behavior)
// left activeStepIndex/cursorPatch below permanently un-advanced --
// every future catch-up attempt re-peeks the SAME already-committed
// step, re-hits this exact duplicate, and never makes forward progress
// (convo-runtime.js's normalizeDuplicateResult already relabels the
verifySemanticDuplicate(command={},result={}){this.ensure();const status=String(result.status||result.error?.code||'').toUpperCase(),p=command.payload||{},s=this.state||{};if(status==='DUPLICATE_COMMAND'){const receipt=this.commandReceiptAuthority[String(command.commandId||'')];return{verified:!!receipt&&receipt.ok===true,kind:'command_receipt',authorityId:String(command.commandId||''),status:status}}if(status==='DUPLICATE_EFFECT'){const eventId=String(p.eventId||id(s.execution?.activeStoryId,p.stepIndex,p.effectType)),receipt=s.progression?.effectReceipts?.[eventId];const verified=!!receipt&&String(receipt.eventId||'')===eventId&&String(receipt.storyId||'')===String(s.execution?.activeStoryId||'')&&Number(receipt.stepIndex)===Number(p.stepIndex)&&String(receipt.effectType||'')===String(p.effectType||'');return{verified:verified,kind:'effect_receipt',authorityId:eventId,status:status}}if(status==='DUPLICATE_NOTIFICATION'){const eventId=String(p.notificationId||p.eventId||id(p.messageEventId,p.contactId,'notification')),receipt=s.notifications?.committedEvents?.[eventId];const verified=!!receipt&&String(receipt.notificationId||'')===eventId&&String(receipt.sourceEventId||'')===String(p.messageEventId||'')&&String(receipt.contactId||'')===String(p.contactId||'');return{verified:verified,kind:'notification_receipt',authorityId:eventId,status:status}}if(status==='DUPLICATE_MESSAGE'){const contactId=String(p.contactId||s.execution?.activeContactId||''),eventId=String(p.eventId||id(s.execution?.activeStoryId,p.stepIndex??s.execution?.activeStepIndex,p.branchId||s.execution?.activeBranchId,contactId,p.variant||'')),receipt=(s.conversations?.eventsByContact?.[contactId]||[]).find(row=>String(row?.eventId||'')===eventId);const verified=!!receipt&&String(receipt.contactId||'')===contactId&&String(receipt.storyId||'')===String(s.execution?.activeStoryId||'')&&Number(receipt.stepIndex)===Number(p.stepIndex??s.execution?.activeStepIndex);return{verified:verified,kind:'message_event',authorityId:eventId,status:status}}return{verified:false,kind:null,authorityId:null,status:status}}
verifySemanticDuplicateInvariant(command={},result={}){const evidence=this.verifySemanticDuplicate(command,result);if(evidence.verified)return evidence;const status=String(result.status||result.error?.code||'').toUpperCase(),p=command.payload||{},s=this.state||{};if(status==='DUPLICATE_CONTINUATION'){const continuation=p.continuation||p,receiptId=String(continuation.receiptId||''),receipt=s.progression?.continuationReceipts?.[receiptId],target=String(continuation.targetStoryId||continuation.targetStoryPath||'');return{verified:!!receipt&&String(receipt.receiptId||'')===receiptId&&String(receipt.targetStoryId||'')===target,kind:'continuation_receipt',authorityId:receiptId,status:status}}return evidence;}
auditCanonicalCoherence(){this.ensure();const s=this.state,issues=[],checkMap=(map,idField,kind)=>{for(const[key,row]of Object.entries(map||{})){if(!row||String(row[idField]||'')!==String(key))issues.push({kind,authorityId:key,code:'RECEIPT_IDENTITY_MISMATCH'});if(row?.stepIndex!=null&&!Number.isFinite(Number(row.stepIndex)))issues.push({kind,authorityId:key,code:'RECEIPT_STEP_INVALID'})}};checkMap(s.progression?.effectReceipts,'eventId','effect_receipt');checkMap(s.progression?.choiceReceipts,'choiceGroupId','choice_receipt');checkMap(s.progression?.continuationReceipts,'receiptId','continuation_receipt');checkMap(s.notifications?.committedEvents,'notificationId','notification_receipt');for(const[key,row]of Object.entries(s.progression?.choiceReceipts||{})){const selected=String(row?.selectedOptionId||''),options=Array.isArray(row?.options)?row.options:[];if(!selected||!options.some(option=>String(option?.id||'')===selected))issues.push({kind:'choice_receipt',authorityId:key,code:'CHOICE_SELECTION_MISMATCH'});for(const onceKey of row?.consequences?.onceKeys||[])if(!s.progression.onceKeys.includes(onceKey))issues.push({kind:'choice_receipt',authorityId:key,code:'CHOICE_CONSEQUENCE_MISSING',onceKey})}const cursor=s.execution?.cursor,pending=cursor?.pendingUserIntent;if(cursor?.phase==='waiting_for_user_intent'&&(!pending||!['choice','continue'].includes(String(pending.kind||''))))issues.push({kind:'execution_cursor',authorityId:cursor?.operationId||null,code:'WAITING_PHASE_WITHOUT_PENDING_INTENT'});if(pending?.kind==='choice'&&(!pending.choiceGroupId||!pending.sourceStepKey||!Array.isArray(pending.options)||pending.options.length===0))issues.push({kind:'execution_cursor',authorityId:cursor?.operationId||null,code:'PENDING_CHOICE_INCOMPLETE'});return{ok:issues.length===0,revision:s.revision,issues};}
// Shared semantic-duplicate invariant. A caller may repair progression only
// after this engine has re-verified the durable authority for the original
// command. The durable operation is never replayed: the resulting transaction
// writes cursor/progression only, and therefore is safe for every duplicate
// family recognized by verifySemanticDuplicate.
reconcileSemanticDuplicate(command={},result={},intendedCursor=null,intendedNextStepIndex=null){this.ensure();const evidence=this.verifySemanticDuplicateInvariant(command,result),s=this.state,cursor=intendedCursor&&typeof intendedCursor==='object'?clone(intendedCursor):null,active=s.execution?.cursor;if(!evidence.verified)return{ok:false,status:'SEMANTIC_DUPLICATE_UNVERIFIED',evidence:evidence};if(!cursor)return{ok:false,status:'SEMANTIC_DUPLICATE_CURSOR_REQUIRED',evidence:evidence};if(!s.execution?.lease||String(command.leaseId||'')!==String(s.execution.lease.id||''))return{ok:false,status:'STALE_OPERATION',evidence:evidence};if(String(cursor.leaseId||'')!==String(s.execution.lease.id||'')||String(cursor.storyPath||'')!==String(s.execution.activeStoryPath||''))return{ok:false,status:'SEMANTIC_DUPLICATE_CURSOR_OWNERSHIP',evidence:evidence};if(active&&String(active.storyPath||'')!==String(cursor.storyPath||''))return{ok:false,status:'SEMANTIC_DUPLICATE_CURSOR_OWNERSHIP',evidence:evidence};if(active&&this.comparePosition(cursor.rootIndex,cursor.branchPath,active.rootIndex,active.branchPath)<0)return{ok:false,status:'SEMANTIC_DUPLICATE_CURSOR_REGRESSION',evidence:evidence};const authorityId=String(evidence.authorityId||''),repair=this.dispatch({type:'COMMIT_STORY_STEP',commandId:`semantic-duplicate-reconcile:${s.execution.lease.id}:${evidence.kind}:${authorityId}:${cursor.rootIndex}:${JSON.stringify(cursor.branchPath||[])}:${s.revision}`,expectedRevision:s.revision,leaseId:s.execution.lease.id,payload:{stepIndex:Number(command.payload?.stepIndex??s.execution.activeStepIndex),nextStepIndex:Number(intendedNextStepIndex??cursor.rootIndex),cursor:cursor,eventId:`semantic-duplicate:${evidence.kind}:${authorityId}`}});return{...repair,semanticDuplicateEvidence:evidence,reconciledSemanticDuplicate:repair.ok===true};}
// CALLER-facing result ok:true for DUPLICATE_MESSAGE, but that alone
// never advances the real engine cursor a throw prevented from
// running -- a live `npm restart` session reproduced this as a ~50-
// iteration/~80s unproductive spin through MAX_CONTROL_FLOW_CATCHUP_
// STEPS, each iteration re-paying the step's own authored delay, before
// finally giving up). Recognize the duplicate as "already done, safe to
// advance" instead -- mirroring DUPLICATE_COMMAND's existing idempotent-
// replay philosophy -- so the cursor moves on to the NEXT (possibly
// genuinely new) step instead of stalling forever on this one.
message(s,c,p,e){const cid=String(p.contactId||s.execution.activeContactId||'');if(!cid||cid!==s.execution.activeContactId)throw this.err('CONTACT_OWNERSHIP','message contact is not active owner');const eventId=p.eventId||id(s.execution.activeStoryId,p.stepIndex??s.execution.activeStepIndex,p.branchId||s.execution.activeBranchId,cid,p.variant||'');const list=s.conversations.eventsByContact[cid]||(s.conversations.eventsByContact[cid]=[]);const existing=list.find(x=>x.eventId===eventId);if(existing){e.push({type:'conversation:event-committed',...existing,duplicate:true});return}const kind=p.kind||'message',isHakTranscript=kind==='hak_transcript',isSystemNote=kind==='note';const event={eventId:eventId,contactId:cid,storyId:s.execution.activeStoryId,storyPath:s.execution.activeStoryPath||null,stepIndex:p.stepIndex??s.execution.activeStepIndex,kind:kind,from:p.from||cid,text:p.text||'',assetId:p.assetId||null,link:p.link||null,source:isHakTranscript?'hak_transcript':p.source||null,visible:isHakTranscript?p.visible===true:true,transactionId:c.commandId,revision:s.revision+1};if(p.presentation==='player_thought'){event.presentation='player_thought';event.speaker='player';}list.push(event);
// A system note ("5 MINUTES LATER"-style flavor text) is durably part of
// the canonical transcript -- so historical reconstruction (Save/Load,
// relaunch, background admission, Timeline/checkpoint replay) can still
// render it, unlike before (see this commit's own SET_CONVERSATION_
// PRESENCE comment for the sibling tester-report investigation this same
// day) -- but it must never become the conversation's own latest-event
// preview text or contribute to its unread count; only real
// dialogue/media from an actual sender should do that.
if((!isHakTranscript||event.visible)&&!isSystemNote){s.conversations.latestEventByContact[cid]=eventId;const contactIsOpen=s.presence?.contactId===cid&&(s.presence?.mountState==='opening'||s.presence?.mountState==='mounted')&&s.presence?.storyId===s.execution.activeStoryId;s.conversations.unreadByContact[cid]=(s.conversations.unreadByContact[cid]||0)+(p.from==='player'||contactIsOpen?0:1)}e.push({type:'conversation:event-committed',...event})}isTutorEligible(s){
// Tutor (Ethan) is Hailey's own NTS-exclusive tutoring subplot -- the
// ONE canonical eligibility authority for this contact, consulted by
// admission (below, so no requireOnceKey wording in any individual
// Tutor story -- including an OR-chain that can be independently
// satisfied by a DIFFERENT character's own unrelated route lock, the
// live-confirmed root cause of a real tester report, 2026-09-06:
// "Tutor appears on Day10 while playing Hailey LOVE" -- can ever admit
// Tutor content outside NTS again) and by every UI-visibility/
// notification/unread surface that asks the engine (not localStorage's
// own generic active_character default) whether Tutor may exist at all.
// Reads world.variables first, matching this codebase's own established
// per-character route-lock priority (world.variables > routeLocks >
// routes; see scripts/engine/story-interpreter.js's own routeStoryPath).
const route=String(s.world.variables?.['route_hailey_locked_v1']||s.world.routeLocks?.hailey||s.world.routes?.hailey||'').trim().toLowerCase();
return route==='nts'||route.startsWith('nts');
}
admissionBlockReason(s,p,chronologyOptions={}){
const contactId=String(p.contactId||'').trim().toLowerCase();
if(['evelyn','hailey','mason','lena'].includes(contactId)&&!s.world.activeCharacters.includes(contactId))return 'owner_inactive';
// 'tutor' is genuinely overloaded in this codebase: the SAME literal
// contactId also names route-agnostic Day15 evening dispatchers (e.g.
// story/DAY15/DAY15_02_HAILEY_EVENING.json, onceKey d15_router_hailey_
// evening_v1 -- real, shipped content, needed on EVERY route, not just
// NTS) that immediately hand off to the real per-route file. Only the
// genuine Ethan-tutor NTS subplot -- which, by definition, lives
// exclusively under an nts/ route folder -- is gated here; a bare
// contactId match alone would have wrongly blocked those dispatchers on
// every non-NTS Hailey/Lena/Evelyn playthrough (caught live by this
// fix's own regression pass against canonical_completed_id_collision
// .test.js, an existing test exercising exactly that dispatcher usage).
if(contactId==='tutor'&&/\/nts\//i.test(String(p.storyPath||p.targetStoryPath||''))&&!this.isTutorEligible(s))return 'owner_inactive';
if(this.requiredPriorStory(s,p,chronologyOptions))return 'prior_day_incomplete';
const meta={path:p.targetStoryPath||p.storyPath||p.targetStoryId||p.storyId,contactId:contactId};
if(this.storyAccessPolicy){if(this.storyAccessPolicy(meta)!==true)return 'access_denied'}else{
const access=root.EntitlementService||deps.entitlement;
if(!access?.requiredEntitlementForStory||!access?.canAccessStory)return 'access_policy_unavailable';
if(access.requiredEntitlementForStory(meta)&&access.canAccessStory(meta)!==true)return 'premium_locked';
}
return requirementsMet(p.requirements,s)?null:'requirements_not_met';
}
requiredPriorStory(s,p,chronologyOptions={}){const catalog=this.storyAdmissionCatalog||root.StoryAdmissionCatalog;if(!Array.isArray(catalog))return null;return(deps.grammar||root.ConditionGrammar).findRequiredPriorStory(s,p.targetStoryPath||p.storyPath||'',catalog,{...chronologyOptions,service:GameTimeService})}
stageStoryAdmissionDay(s,p,e){
const catalog=this.storyAdmissionCatalog||root.StoryAdmissionCatalog,path=p.storyPath||p.targetStoryPath;
if(!Array.isArray(catalog))return;
const target=catalog.find(row=>row.path===path),nextDay=Number(target?.day),currentDay=Number(s.world.day);
if(!(nextDay>currentDay)||!GameTimeService.resolveStoryTime(path))return;
// A fresh next-day lease is a boundary commit. Prove the previous day and
// the exact next canonical target before staging any day/clock change.
const blocked=this.chronologyDayBlock(s,nextDay)||this.requiredPriorStory(s,p);
if(blocked)throw this.err(blocked.status==='CHRONOLOGY_CAUSAL_CONFLICT'?'CHRONOLOGY_CAUSAL_CONFLICT':'STORY_DAY_INCOMPLETE',JSON.stringify(blocked));
s.world.gameTime=GameTimeService.clockForDayTransition(s,nextDay);
s.world.day=nextDay;
e.push({type:'world:day-changed',day:nextDay});
this.consumeDayTransitionIntent(s,e,path);
// Access and authored requirements are checked on this detached candidate
// before the dispatch commits; rejection exposes no partial transition.
}
chronologyDayBlock(s,nextDay,chronologyOptions={}){
const catalog=this.storyAdmissionCatalog||root.StoryAdmissionCatalog,grammar=deps.grammar||root.ConditionGrammar;
if(!Array.isArray(catalog)||!grammar?.getNextCanonicalStory)return null;
if(!catalog.some(row=>Number(row.day)===Number(s.world.day)&&GameTimeService.resolveStoryTime(row.path)))return null;
if(nextDay<Number(s.world.day))return{status:'UNRESOLVED',reason:'chronology_day_regression',day:s.world.day,targetDay:nextDay};
const next=grammar.getNextCanonicalStory(s,catalog,{...chronologyOptions,day:s.world.day,service:GameTimeService});
return next.status==='DAY_COMPLETE'?null:next;
}
complete(s,c,p,e){
const sid=s.execution.activeStoryId;
if(!sid)throw this.err('NO_ACTIVE_STORY','no active story');
const completed=p.storyId||sid;
if(completed!==sid)throw this.err('STORY_OWNERSHIP','completion target is not active');
if(!s.progression.completedStoryIds.includes(completed))s.progression.completedStoryIds.push(completed);
if(p.onceKey&&!s.progression.onceKeys.includes(p.onceKey))s.progression.onceKeys.push(p.onceKey);
// Complete the current JSON's absolute clock before another JSON can start.
s.world.gameTime=GameTimeService.clockForProgress(s,s.execution.activeStoryPath,s.execution.cursor,true,s.execution.cursor);
const source={storyId:completed,storyPath:s.execution.activeStoryPath,contactId:s.execution.activeContactId,terminalStep:p.terminalStep??s.execution.activeStepIndex};
const authoredDay=Number(p.day)||Number(String(p.continuation?.targetStoryPath||"").match(/(?:^|\/)DAY(\d{1,2})(?:\/|_)/i)?.[1])||0;
if(s.progression.dayTransitionIntent&&Number(s.progression.dayTransitionIntent.sourceDay)!==Number(s.world.day))throw this.err('STALE_DAY_TRANSITION_INTENT','day transition intent does not own the current Story Day');
if(authoredDay>Number(s.world.day)&&!s.progression.dayTransitionIntent){
s.progression.dayTransitionIntent={sourceDay:Number(s.world.day),targetDay:authoredDay,sourceStoryId:source.storyId,sourceStoryPath:source.storyPath,sourceContactId:source.contactId,terminalStep:source.terminalStep,timeCard:p.timeCard?clone(p.timeCard):null,requestedTarget:p.continuation?clone(p.continuation):null};
}
const intent=s.progression.dayTransitionIntent;
if(intent&&!intent.timeCard&&p.timeCard&&authoredDay===Number(intent.targetDay))Object.assign(intent,{timeCard:clone(p.timeCard),sourceStoryId:source.storyId,sourceStoryPath:source.storyPath,sourceContactId:source.contactId,terminalStep:source.terminalStep});
const requestedDay=Number(intent?.sourceDay)===Number(s.world.day)?Number(intent.targetDay):(authoredDay||Number(s.world.day));
const dayBlock=requestedDay!==Number(s.world.day)?this.chronologyDayBlock(s,requestedDay,{completedStoryPath:s.execution.activeStoryPath}):null;
let continuation=p.continuation,transitionBlock=null;
if(intent&&Number(intent.sourceDay)===Number(s.world.day)&&!dayBlock){
intent.finalCompletionOwner=clone(source);
const catalog=this.storyAdmissionCatalog||root.StoryAdmissionCatalog,grammar=deps.grammar||root.ConditionGrammar;
const next=Array.isArray(catalog)&&catalog.length&&grammar?.getNextCanonicalStory?grammar.getNextCanonicalStory(s,catalog,{day:requestedDay,respectActive:false,service:GameTimeService}):null;
if(next?.status==='MISSING')continuation={targetStoryId:next.onceKey||next.id||next.path,targetStoryPath:next.path,targetOnceKey:next.onceKey,contactId:next.contactId||(next.ownerScope==='global'?GLOBAL_STORY_CONTACT:null),requirements:next.requirements,terminalStep:source.terminalStep};
else if(next&&next.status!=='DAY_COMPLETE')transitionBlock=next;
else continuation=intent.requestedTarget||continuation;
}
const admissionBlock=dayBlock||transitionBlock?'prior_day_incomplete':continuation?this.admissionBlockReason(s,continuation,{completedStoryPath:s.execution.activeStoryPath}):null;
if(requestedDay>Number(s.world.day)&&!admissionBlock){s.world.gameTime=GameTimeService.clockForDayTransition(s,requestedDay);s.world.day=requestedDay;e.push({type:'world:day-changed',day:s.world.day});this.consumeDayTransitionIntent(s,e,continuation?.targetStoryPath||null)}
else if(p.timeCard&&!intent&&!admissionBlock)e.push({type:'story:time-card-committed',eventId:id(completed,p.terminalStep,'time-card'),storyId:completed,contactId:source.contactId,sourceStoryPath:source.storyPath,day:s.world.day,payload:clone(p.timeCard)});
e.push({type:'story:completed',storyId:completed});
if(continuation)return this.continuation(s,c,continuation,e,true,admissionBlock,dayBlock||transitionBlock);
const pendingBlock=dayBlock||transitionBlock;
if(pendingBlock){
const path=pendingBlock.path||null;
s.progression.pendingStory={kind:'dispatch',id:'chronology:'+c.commandId,path,storyPath:path,contactId:pendingBlock.contactId||null,index:0,from:completed,reason:pendingBlock.status==='MISSING'?'required_logical_slot_recovery':pendingBlock.status,via:'canonical_day_completion',startWhenScene:'home',navigationPolicy:'auto_open',requiredPriorStory:clone(pendingBlock)};
e.push({type:'story:pending-set',kind:'dispatch',path,contactId:pendingBlock.contactId||''});
}
this.releaseLease(s,{phase:'completed',completion:'completed',continuation:pendingBlock?'pending':'none',leaseId:null,pendingUserIntent:null,pendingPresentationAck:null,operationId:null,operationType:null,gotoTarget:null});
return null
}consumeDayTransitionIntent(s,e,targetStoryPath=null){
const intent=s.progression.dayTransitionIntent;
if(!intent||Number(intent.targetDay)!==Number(s.world.day)||!intent.finalCompletionOwner)return false;
const owner=intent.finalCompletionOwner;
if(intent.timeCard)e.push({type:'story:time-card-committed',eventId:id(intent.sourceStoryId,intent.terminalStep,intent.targetDay,'canonical-day-card'),day:s.world.day,storyId:owner.storyId,contactId:owner.contactId,sourceStoryPath:owner.storyPath,targetStoryPath:targetStoryPath||s.execution.activeStoryPath||null,payload:clone(intent.timeCard),authoredSourceStoryId:intent.sourceStoryId,authoredSourceStoryPath:intent.sourceStoryPath,authoredSourceContactId:intent.sourceContactId,deferredDayTransition:true});
s.progression.dayTransitionIntent=null;
return true;
}continuation(s,c,p,e,sourceCompleted=false,knownAdmissionBlock=undefined,knownChronologyBlock=null){if(!p.targetStoryId&&!p.targetStoryPath)throw this.err('INVALID_GRAPH_TARGET','continuation target required');const rid=p.receiptId||id(s.execution.activeStoryId,p.terminalStep,p.targetStoryId||p.targetStoryPath,p.branchId||'',JSON.stringify(s.world.routeLocks),JSON.stringify(s.world.choices));if(s.progression.continuationReceipts[rid])throw this.err('DUPLICATE_CONTINUATION','continuation already committed');s.progression.continuationReceipts[rid]={receiptId:rid,sourceStoryId:s.execution.activeStoryId,targetStoryId:p.targetStoryId||p.targetStoryPath,transactionId:c.commandId};if(p.targetOnceKey?s.progression.onceKeys.includes(p.targetOnceKey):s.progression.completedStoryIds.includes(p.targetStoryId||p.targetStoryPath)){s.progression.continuationReceipts[rid].alreadyCompleted=true;e.push({type:'story:continuation-satisfied',receiptId:rid,storyId:p.targetStoryId||p.targetStoryPath,alreadyCompleted:true});if(sourceCompleted)this.releaseLease(s,{phase:'completed',completion:'completed',continuation:'none',leaseId:null,pendingUserIntent:null,pendingPresentationAck:null,operationId:null,operationType:null,gotoTarget:null});return null}const admissionBlock=knownAdmissionBlock===undefined?this.admissionBlockReason(s,p):knownAdmissionBlock;if(admissionBlock){
if(!sourceCompleted)throw this.err(admissionBlock==='requirements_not_met'?'STORY_REQUIREMENTS_NOT_MET':'STORY_ADMISSION_BLOCKED',admissionBlock);
s.progression.continuationReceipts[rid].deferred=true;
const prior=admissionBlock==='prior_day_incomplete'?(knownChronologyBlock||this.requiredPriorStory(s,p,sourceCompleted?{completedStoryPath:s.execution.activeStoryPath}:{})):null,recovery=prior?.status==='MISSING'?prior:null,path=recovery?.path||p.targetStoryPath||p.targetStoryId,contactId=recovery?(recovery.contactId||null):(p.contactId||null);
s.progression.pendingStory={kind:'dispatch',id:'continuation:'+rid,path:path,storyPath:path,contactId,index:0,from:s.execution.activeStoryId,reason:recovery?'required_logical_slot_recovery':admissionBlock==='requirements_not_met'?'waiting_for_requirement':admissionBlock,via:'canonical_continuation',startWhenScene:'home',navigationPolicy:'auto_open',attempts:0,createdAt:Date.now(),updatedAt:Date.now(),...(prior?{requiredPriorStory:{path:prior.path,onceKey:prior.onceKey,status:prior.status,reason:prior.reason,...(prior.status==='CHRONOLOGY_CAUSAL_CONFLICT'?{diagnostic:clone(prior)}:{})},blockedNextStory:{path:p.targetStoryPath||p.targetStoryId,contactId:p.contactId||null}}:{})};
e.push({type:'story:continuation-deferred',receiptId:rid,storyId:p.targetStoryId||path,reason:admissionBlock});
e.push({type:'story:pending-set',kind:'dispatch',path:path,contactId:contactId||''});
this.releaseLease(s,{phase:'completed',completion:'completed',continuation:'pending',leaseId:null,pendingUserIntent:null,pendingPresentationAck:null,operationId:null,operationType:null,gotoTarget:null});return null}
s.execution.activeStoryId=p.targetStoryId||p.targetStoryPath;s.execution.activeStoryPath=p.targetStoryPath||null;s.world.gameTime=GameTimeService.clockForAdmission(s,s.execution.activeStoryPath);s.execution.activeContactId=p.contactId||null;s.execution.activeStepIndex=0;s.execution.generation++;s.execution.lease={id:p.leaseId||'l-'+id(c.commandId,rid),storyId:s.execution.activeStoryId,generation:s.execution.generation,createdRevision:s.revision+1};e.push({type:'story:continuation-activated',receiptId:rid,storyId:s.execution.activeStoryId,contactId:s.execution.activeContactId});return{storyPath:s.execution.activeStoryPath,storyId:s.execution.activeStoryId,contactId:s.execution.activeContactId,rootIndex:0,branchPath:[],operationId:null,operationType:null,branchReceiptId:null,gotoTarget:null,pendingUserIntent:null,pendingPresentationAck:null,phase:'ready_to_interpret',completion:'in_progress',continuation:'activated',leaseId:s.execution.lease.id}}releaseLease(s,finalCursorPatch=null){const old=s.execution.lease;if(old)this.cancelResources(old.id);s.execution.lease=null;s.execution.status='idle';s.execution.activeStoryId=null;s.execution.activeStoryPath=null;s.execution.activeContactId=null;s.execution.activeStepIndex=0;s.execution.cursor=finalCursorPatch?this.mergeCursor(s.execution.cursor,finalCursorPatch):null}registerResource(leaseId,resource){const set=this.resources.get(leaseId)||new Set;set.add(resource);this.resources.set(leaseId,set);return()=>set.delete(resource)}cancelResources(leaseId){for(const r of this.resources.get(leaseId)||[])try{if(typeof r==='function')r();else r.abort?.()}catch{}this.resources.delete(leaseId)}cancelAllResources(){for(const leaseId of[...this.resources.keys()])this.cancelResources(leaseId)}validateLease(lease){return!!lease&&this.state.execution.lease?.id===lease.id&&this.state.execution.lease?.generation===lease.generation}
// Canonical execution cursor (see CURSOR_PHASES above): everything needed
// to resume story execution deterministically without a renderer-local
// i/index -- root-level story position, nested if.then/if.else branch
// path (see scripts/engine/story-position.js), the normalized identity of
// the operation that produced/will produce this position, and explicit
// phase/completion/continuation status rather than ad hoc booleans.
defaultCursorShape(){return{storyPath:null,storyId:null,contactId:null,rootIndex:0,branchPath:[],operationId:null,operationType:null,branchReceiptId:null,gotoTarget:null,pendingUserIntent:null,pendingPresentationAck:null,phase:'ready_to_interpret',completion:'in_progress',continuation:'none',leaseId:null,storyRevision:0}}
// Byte-for-byte copy of scripts/engine/story-position.js's comparePosition
// -- this engine deliberately has zero load-order/require dependency on
// that module (script tags load game-state-engine.js before
// story-position.js in index.html, and this file is also required
// standalone by tools/qa/*.test.js), so the comparator is duplicated
// rather than imported, matching story-position.js's own documented
// precedent for normToken/keyToken. Keep in sync if either changes.
comparePosition(rootIndexA,branchPathA,rootIndexB,branchPathB){const rootA=Number(rootIndexA)||0,rootB=Number(rootIndexB)||0;if(rootA!==rootB)return rootA-rootB;const a=Array.isArray(branchPathA)?branchPathA:[],b=Array.isArray(branchPathB)?branchPathB:[];const n=Math.min(a.length,b.length);for(let i=0;i<n;i++){const ha=a[i]||{},hb=b[i]||{};if(ha.branch!==hb.branch)return ha.branch==='then'?-1:hb.branch==='then'?1:0;const ia=Number(ha.index)||0,ib=Number(hb.index)||0;if(ia!==ib)return ia-ib}return a.length-b.length}
// A cursor patch is STALE (must not overwrite the current cursor) only
// when: it targets the SAME running story+lease (a different story/lease
// is always a legitimate fresh context, e.g. START_STORY/continuation/
// restore) AND it is an `if`-decision cursor write (operationType==='if')
// AND it resolves to a position strictly BEHIND where the cursor already
// is. Scoped to 'if' specifically -- NOT a blanket "reject any backward
// move" -- because `goto` legitimately jumps backward for authored loops
// (see story-interpreter.js's MAX_GOTO_JUMPS_PER_RUN budget, which exists
// precisely because that backward jump is expected/allowed); blocking
// backward moves for goto's own COMMIT_STORY_STEP cursor writes would
// break every authored loop. This exists because TWO independent writers
// can legitimately both resolve the same if-decision -- the canonical
// StoryInterpreter's own if-handler (via convo-runtime.js's catch-up
// loop) and conversation.html's legacy expandIfStepAtScriptIndex, which
// mirrors its own resolution onto the canonical cursor as "best-effort,
// does not gate" (see its call site comment). If the canonical side
// already resolved AND the interactive renderer already committed the
// resulting content (advancing the cursor further), the legacy mirror's
// own independently-computed cursor for that SAME if-decision can still
// land under a brand-new commandId (its commit-cursor:if:<path> scheme
// never collides with the canonical side's own branchId-keyed commandId,
// so neither write dedupes against the other) and, if merged, would
// silently rewind the cursor back to "ready to interpret" a step whose
// content commit already happened and can never happen again (its
// commandId already has a receipt) -- corrupting the story into
// repeating DUPLICATE_COMMAND forever with no forward progress. Dropping
// the stale field write here (while still letting the rest of THIS
// command's own effects, e.g. its message queue entry, apply normally)
// is a pure no-op for the mirror's own stated contract, since a stale
// mirror was never supposed to move anything by the time it lands.
isStaleIfCursorPatch(prevCursor,patch){if(!patch||patch.operationType!=='if')return false;if(!prevCursor)return false;if(prevCursor.storyPath!==patch.storyPath||prevCursor.storyId!==patch.storyId||prevCursor.leaseId!==patch.leaseId)return false;if(!Number.isFinite(prevCursor.rootIndex)||!Number.isFinite(patch.rootIndex))return false;return this.comparePosition(patch.rootIndex,patch.branchPath,prevCursor.rootIndex,prevCursor.branchPath)<0}mergeCursor(prev,patch){const base=prev?clone(prev):this.defaultCursorShape();return{...base,...clone(patch)}}validateReceiptMaps(s){const maps=[['branchReceipts','branchId'],['choiceReceipts','choiceGroupId'],['effectReceipts','eventId'],['continuationReceipts','receiptId']];for(const[mapName,idField]of maps){const map=s?.progression?.[mapName]||{};for(const[key,receipt]of Object.entries(map)){if(!receipt||typeof receipt!=='object'||Array.isArray(receipt))throw this.err('INVALID_SAVE_STATE','invalid '+mapName+' receipt');if(String(receipt[idField]||'')!==String(key))throw this.err('INVALID_SAVE_STATE',mapName+' identity mismatch')}}return true}validateHakState(h){if(!h||h.schemaVersion!==1)throw this.err('INVALID_HAK_STATE','HAK schemaVersion 1 required');if(!Array.isArray(h.photos)||!Array.isArray(h.watchlist?.selected))throw this.err('INVALID_HAK_STATE','invalid HAK collections');if(!h.evidenceProfiles||typeof h.evidenceProfiles!=='object'||Array.isArray(h.evidenceProfiles)||!h.skills?.unlocked||typeof h.skills.unlocked!=='object'||Array.isArray(h.skills.unlocked)||!h.receipts||typeof h.receipts!=='object'||Array.isArray(h.receipts))throw this.err('INVALID_HAK_STATE','invalid HAK maps');for(const branch of['nts','ntr','love'])if(!Number.isFinite(Number(h.routePoints?.[branch]))||Number(h.routePoints[branch])<0)throw this.err('INVALID_HAK_STATE','invalid HAK route points');const ids=[];for(const row of Object.values(h.evidenceProfiles)){for(const item of Array.isArray(row?.evidences)?row.evidences:[]){const eid=String(item?.id||'');if(!eid)throw this.err('INVALID_HAK_STATE','evidence id required');ids.push(eid)}}for(const item of h.photos){const eid=String(item?.id||'');if(!eid)throw this.err('INVALID_HAK_STATE','photo id required');ids.push(eid)}if(ids.length!==new Set(ids).size)throw this.err('INVALID_HAK_STATE','duplicate HAK evidence id');return true}validateOnlyfunState(o){if(!o||o.schemaVersion!==1)throw this.err('INVALID_ONLYFUN_STATE','OnlyFun schemaVersion 1 required');for(const key of['creators','accounts','subscriptions','seenPosts','pendingGates','receipts'])if(!o[key]||typeof o[key]!=='object'||Array.isArray(o[key]))throw this.err('INVALID_ONLYFUN_STATE','invalid OnlyFun '+key);if(!Array.isArray(o.posts))throw this.err('INVALID_ONLYFUN_STATE','invalid OnlyFun posts');const ids=o.posts.map(row=>String(row?.id||''));if(ids.some(value=>!value)||ids.length!==new Set(ids).size)throw this.err('INVALID_ONLYFUN_STATE','OnlyFun post ids must be stable and unique');return true}
// `prev`, when supplied, enables the SAME "unchanged domain -> skip
// re-work" optimization at the validation layer that _dispatch()'s own
// command-scoped copy-on-write applies at the clone layer (FINAL
// PERFORMANCE BLOCKER, 2026-08-19) -- normalizeHakDomain/normalizeOnlyfun
// Domain/normalizeCardVaultDomain/normalizeGalleryDomain each internally
// deep-clone their entire domain, and were previously called
// UNCONDITIONALLY on every dispatch regardless of whether that command
// touched the domain at all, independently undoing whatever the outer
// clone-skip saved. Safe by induction: if s.hak===prev.hak (the exact
// same object, not just deep-equal), it was already normalized and
// validated at some earlier point this same object was produced (every
// path that ever creates a NEW hak object runs it through
// normalizeHakDomain first), and nothing can have mutated it since
// (guaranteed by _dispatch()'s own write-set safety net, which throws
// rather than allow a reference-identical-but-silently-mutated domain
// to reach here). `prev` is only ever passed from the one hot-path
// call site (_dispatch(), and only when that command was declared
// registry-exempt); every other caller (initialize(), validateLoadedState())
// omits it and gets the original, always-normalize-everything behavior.
validateState(s,prev=null){if(!s||s.schemaVersion!==4)throw this.err('INVALID_STATE','schemaVersion 4 required');const hakUnchanged=!!prev&&s.hak===prev.hak,onlyfunUnchanged=!!prev&&s.onlyfun===prev.onlyfun,cardVaultUnchanged=!!prev&&s.cardVault===prev.cardVault,galleryUnchanged=!!prev&&s.gallery===prev.gallery;if(!hakUnchanged)s.hak=this.normalizeHakDomain(s.hak);if(!onlyfunUnchanged)s.onlyfun=this.normalizeOnlyfunDomain(s.onlyfun);if(!cardVaultUnchanged)s.cardVault=this.normalizeCardVaultDomain(s.cardVault);if(!galleryUnchanged)s.gallery=this.normalizeGalleryDomain(s.gallery);if(!Number.isInteger(s.revision)||s.revision<0)throw this.err('INVALID_STATE','invalid revision');if(s.execution?.lease&&s.execution.lease.storyId!==s.execution.activeStoryId)throw this.err('INVALID_STATE','lease/story mismatch');if(s.execution?.cursor){if(!CURSOR_PHASES.includes(s.execution.cursor.phase))throw this.err('INVALID_STATE','invalid cursor phase');if(!Array.isArray(s.execution.cursor.branchPath))throw this.err('INVALID_STATE','invalid cursor branchPath')}this.validateReceiptMaps(s);if(!hakUnchanged)this.validateHakState(s.hak);if(!onlyfunUnchanged)this.validateOnlyfunState(s.onlyfun);return true}validateLoadedState(s){this.validateState(s);const required=['world','execution','progression','conversations','notifications','recovery'];for(const key of required)if(!s[key]||typeof s[key]!=='object'||Array.isArray(s[key]))throw this.err('INVALID_SAVE_STATE','missing '+key+' domain');for(const key of['completedStoryIds','onceKeys','pendingStoryQueue','choicesLog'])if(!Array.isArray(s.progression[key]))throw this.err('INVALID_SAVE_STATE','invalid progression.'+key);for(const key of['continuationReceipts','commandReceipts','branchReceipts','choiceReceipts','effectReceipts','contactProgress','conversationsCache'])if(!s.progression[key]||typeof s.progression[key]!=='object'||Array.isArray(s.progression[key]))throw this.err('INVALID_SAVE_STATE','invalid progression.'+key);if(!Array.isArray(s.world.activeCharacters))throw this.err('INVALID_SAVE_STATE','invalid activeCharacters');for(const key of['routes','routeLocks','choices','variables'])if(!s.world[key]||typeof s.world[key]!=='object'||Array.isArray(s.world[key]))throw this.err('INVALID_SAVE_STATE','invalid world.'+key);const unique=(values,label)=>{const normalized=values.map(v=>String(v));if(normalized.length!==new Set(normalized).size)throw this.err('INVALID_SAVE_STATE','duplicate '+label)};unique(s.progression.completedStoryIds,'completed story id');unique(s.progression.onceKeys,'once key');unique(s.notifications.displayedEventIds||[],'displayed notification id');const eventIds=[];for(const[contactId,events]of Object.entries(s.conversations.eventsByContact||{})){if(!contactId||!Array.isArray(events))throw this.err('INVALID_SAVE_STATE','invalid conversation events');for(const event of events){if(!event||String(event.contactId||contactId)!==contactId)throw this.err('INVALID_SAVE_STATE','conversation contact mismatch');if(event.eventId)eventIds.push(event.eventId)}}unique(eventIds,'message event id');const active=String(s.execution.activeStoryId||'');const cursor=s.execution.cursor;if(active){if(!cursor)throw this.err('INVALID_SAVE_STATE','active story cursor missing');if(String(cursor.storyId||'')!==active||String(cursor.storyPath||'')!==String(s.execution.activeStoryPath||''))throw this.err('INVALID_SAVE_STATE','cursor/story mismatch');if(cursor.contactId!=null&&String(cursor.contactId)!==String(s.execution.activeContactId||''))throw this.err('INVALID_SAVE_STATE','cursor/contact mismatch');if(cursor.phase==='waiting_for_user_intent'&&(!cursor.pendingUserIntent||typeof cursor.pendingUserIntent!=='object'))throw this.err('INVALID_SAVE_STATE','waiting cursor missing user intent');if(cursor.pendingUserIntent&&cursor.phase!=='waiting_for_user_intent')throw this.err('INVALID_SAVE_STATE','user intent/cursor phase mismatch');if(Number.isFinite(Number(cursor.rootIndex)))s.execution.activeStepIndex=Math.max(0,Number(cursor.rootIndex)||0)}else if(s.execution.lease)throw this.err('INVALID_SAVE_STATE','lease without active story');if(s.progression.pendingStory!=null&&(!s.progression.pendingStory||typeof s.progression.pendingStory!=='object'||Array.isArray(s.progression.pendingStory)))throw this.err('INVALID_SAVE_STATE','invalid pendingStory');if(s.progression.pendingInteraction!=null&&(!s.progression.pendingInteraction||typeof s.progression.pendingInteraction!=='object'||Array.isArray(s.progression.pendingInteraction)))throw this.err('INVALID_SAVE_STATE','invalid pendingInteraction');return true}getDiagnostics(){return{activeEngines:this.initialized?1:0,activeInterpreters:root.StoryInterpreter?.activeCount||0,activeLeases:this.state?.execution?.lease?1:0,timers:[...this.resources.values()].reduce((n,s)=>n+s.size,0),listeners:this.listeners.size,pendingCommands:this.pending,unresolvedTransactions:this.store?.storage?.getItem?.('intercepted_engine_journal_v4')?1:0}}result(ok,status,c,previousRevision,nextRevision,events,error=null){return{ok:ok,status:status,commandId:String(c.commandId||''),previousRevision:previousRevision,nextRevision:nextRevision,events:clone(events||[]),error:error?{code:status,message:String(error)}:null}}err(code,message){const e=new Error(message);e.code=code;return e}ensure(){if(!this.initialized)this.initialize()}}GameStateEngineClass.CURSOR_PHASES=CURSOR_PHASES;GameStateEngineClass.GLOBAL_STORY_CONTACT=GLOBAL_STORY_CONTACT;const singleton=new GameStateEngineClass;return{GameStateEngineClass:GameStateEngineClass,singleton:singleton,CURSOR_PHASES:CURSOR_PHASES,GLOBAL_STORY_CONTACT:GLOBAL_STORY_CONTACT}});
