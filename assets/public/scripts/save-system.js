(function(root){
  'use strict';
  if(root.SaveSystem?.__feature5Canonical)return;
  const STORE_KEY='saves_v2',SAVE_SCHEMA=6,FORMAT='canonical-engine-snapshot',HEADROOM_KEY='intercepted_storage_headroom_v1',HEADROOM_CHARS=262144,MIGRATION_KEY='save_storage_migration_v1',INTERNAL_SCHEMA=2,INTERNAL_MIGRATION_KEY='save_internal_snapshot_migration_v1';
  const META_KEYS=Object.freeze(['gallery_photos','savedPhotos','achievements_v1','achievement_meta_v1','card_vault_state_v1','card_vault_state_backup_v1','entitlement_redemption_ledger_v1','entitlement_redemption_ledger_backup_v1','patreon_release_unlock_v1','patreon_master_unlock_v1','patreon_mason_day9_15_unlock_v1','patreon_evelyn_day9_15_unlock_v1','patreon_hailey_day16_20_unlock_v1','patreon_lena_day16_20_unlock_v1','gallery_full_unlock_v1','settings_language','settings_v1','wallpaper_v1','accessibility_v1']);
  let restoreSequence=0;
  class LocalStorageSaveStorageAdapter{constructor(storage){this.storage=storage;}get(key){return this.storage.getItem(key);}set(key,value){this.storage.setItem(key,String(value));}remove(key){this.storage.removeItem(key);}get backend(){return'localStorage';}}
  class DegradedIndexedDbStorageAdapter{constructor(storage,error){this.storage=storage;this.error=String(error||'PERSISTENCE_BACKEND_UNAVAILABLE');}get(key){if(key===STORE_KEY)return null;return this.storage.getItem(key);}set(key){throw fail('PERSISTENCE_BACKEND_UNAVAILABLE',this.error);}remove(key){throw fail('PERSISTENCE_BACKEND_UNAVAILABLE',this.error);}get backend(){return'indexedDB_degraded';}}
  let storageAdapter=new LocalStorageSaveStorageAdapter(root.localStorage);
  // Serialize the complete read/modify/write operation. IndexedDB commits are
  // asynchronous, so queuing only the final write loses concurrent save slots.
  let storeMutationTail=Promise.resolve();
  function queueStoreMutation(work){const result=storeMutationTail.then(work);storeMutationTail=result.catch(()=>{});return result;}
  const clone=v=>JSON.parse(JSON.stringify(v));
  const stable=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?`[${v.map(stable).join(',')}]`:`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  const checksum=v=>{const t=typeof v==='string'?v:stable(v);let h=2166136261;for(let i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(16).padStart(8,'0');};
  const fail=(code,message=code)=>Object.assign(new Error(message),{code});
  const parse=(raw,fallback=null)=>{try{return JSON.parse(raw);}catch{return fallback;}};
  const tok=v=>String(v||'').trim().toLowerCase();
  const isQuotaError=e=>e?.name==='QuotaExceededError'||Number(e?.code)===22||Number(e?.code)===1014||e?.code==='NS_ERROR_DOM_QUOTA_REACHED';
  function ensureHeadroom(){try{if(storageAdapter.get(HEADROOM_KEY)==null)storageAdapter.set(HEADROOM_KEY,'0'.repeat(HEADROOM_CHARS));storageAdapter.remove('intercepted_storage_pressure_compaction_v1');return true;}catch{return false;}}
  function releaseHeadroom(){try{storageAdapter.remove(HEADROOM_KEY);}catch{}}
  // `storage` tells the UI which area refused the write: the IndexedDB save
  // store is bounded by free device space, localStorage by the game's own
  // fixed Web Storage area. Players must not be told the wrong one is full.
  function storageFailure(e){return{ok:false,code:'SAVE_FAILED_STORAGE_FULL',reason:'STORAGE_QUOTA',storage:String(storageAdapter.backend||'localStorage'),errorName:String(e?.name||'QuotaExceededError')};}
  function emit(){try{root.dispatchEvent(new Event('game:saves-updated'));}catch{}}
  const ui=(key,source)=>{try{return root.Game?.i18n?.ui?.(key,source)||source;}catch{return source;}};
function showError(e){if(e?.code==='PERSISTENCE_STORAGE_FULL'){try{const text=ui("storage.full.load", "This save could not be loaded because the internal save space of the game is full. Your saves are not damaged. Close and reopen the game so it can compact its data, then try again. If this message comes back, install the latest version of the game.");if(root.UIModal?.alert)root.UIModal.alert({title:ui("storage.full.title", "Game storage full"),text});else root.showToast?.(text);}catch{}return;}const text=e?.code==='LEGACY_CHECKPOINT_AUTHORITY_UNAVAILABLE'?'This checkpoint cannot be faithfully restored. Please load a manual save or continue your current game.':['SAVE_CHECKPOINT_AUTHORITY_UNAVAILABLE','SAVE_CHECKPOINT_AUTHORITY_CORRUPT'].includes(e?.code)?'This checkpoint is incomplete and could not be loaded. Please load another save.':e?.code==='SAVE_SLOT_NOT_FOUND'?'Save slot not found or invalid.':e?.code==='SAVE_CHECKSUM_MISMATCH'?'This save is corrupted and could not be loaded.':'This save is invalid and could not be loaded.';try{if(root.UIModal?.alert)root.UIModal.alert({title:'Load',text});else root.showToast?.(text);}catch{}}
  function readStore(){if(typeof storageAdapter.getStore==='function')return storageAdapter.getStore();const raw=storageAdapter.get(STORE_KEY);if(!raw)return{version:SAVE_SCHEMA,slots:[]};const v=parse(raw,null);if(Array.isArray(v))return{version:1,slots:v};return v&&Array.isArray(v.slots)?v:{version:SAVE_SCHEMA,slots:[]};}
  async function writeStore(v){const next={...(v||{}),version:SAVE_SCHEMA,slots:Array.isArray(v?.slots)?v.slots:[]};pruneInternalAuthority(next);if(typeof storageAdapter.setStore==='function')await storageAdapter.setStore(next);else await storageAdapter.set(STORE_KEY,JSON.stringify(next));emit();return next;}
  // Public callers receive mutable detached rows. Reading a label does not copy
  // its snapshot; the first snapshot access copies only that selected save.
  function publicSlot(slot){if(!slot)return null;const {snapshot,...meta}=slot,row=clone(meta);let loaded=false,value;Object.defineProperty(row,'snapshot',{enumerable:true,configurable:true,get(){if(!loaded){value=snapshot===undefined?undefined:clone(snapshot);loaded=true;}return value;},set(next){loaded=true;value=next;}});return row;}
  const readSlotRows=()=>typeof storageAdapter.getSlotRows==='function'?storageAdapter.getSlotRows():readStore().slots;
  function publicSlots(type){return readSlotRows().filter(slot=>!type||slot.type===type).map(publicSlot);}
  const verifiedChapterSnapshots=new WeakMap();
  function savedChapterBranchKey(state){
    const token=value=>String(value||'').trim().toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_.-]/g,''),world=state.world||{};
    const picks=Array.isArray(state.progression?.choicesLog)?state.progression.choicesLog:[];
    const parts=picks.map(row=>{const key=token(row?.choiceKey),option=token(row?.optionId);return key&&option?key+':'+option:'';}).filter(Boolean);
    const routes=['lena','hailey','evelyn','mason'].map(cid=>cid+':'+token(world.variables?.['route_'+cid+'_locked_v1']||world.routeLocks?.[cid]||world.routes?.[cid]||'')).join('|');
    const active=Array.isArray(world.activeCharacters)?world.activeCharacters:[];
    const history=parts.join('|'),prefix='routes:'+routes+';active:'+active.map(token).sort().join(',')+';mason:'+token(world.masonVariant)+';choices:'+parseInt(checksum(history),16).toString(16)+':'+history.length+';';
    return prefix+(parts.slice(-8).join('|')||'root').slice(-Math.max(0,320-prefix.length));
  }
  function getChapterSnapshotHeader(slotOrId,options={}){
    const id=typeof slotOrId==='object'?slotOrId?.id:slotOrId,slot=readSlotRows().find(row=>String(row?.id||'')===String(id||'')),snapshot=slot?.snapshot,state=snapshot?.canonicalState;
    if(!state)return null;
    const world=state.world||{},execution=state.execution||{},marker=snapshot.metadata?.internalSnapshot;
    const canVerifyExactAuthority=snapshot.saveSchemaVersion===SAVE_SCHEMA&&snapshot.format===FORMAT&&(!marker||(marker.schemaVersion===INTERNAL_SCHEMA&&!!marker.authorityRoot));
    let exactAuthority=false;
    if(options.verifyExactAuthority===true&&canVerifyExactAuthority){
      // Cache only immutable product storage. A new adapter/envelope retires
      // validation even if it happens to reuse the same snapshot object.
      const envelope=storageAdapter.envelope,cacheable=!!envelope&&storageAdapter.isImmutableRecord?.(snapshot)===true&&storageAdapter.isImmutableRecord?.(envelope)===true;
      const cached=cacheable?verifiedChapterSnapshots.get(snapshot):null;
      if(cached?.adapter===storageAdapter&&cached.envelope===envelope)exactAuthority=cached.exactAuthority;
      else{
        try{inflateInternalBody(verify(snapshot));exactAuthority=true;}catch{}
        if(cacheable)verifiedChapterSnapshots.set(snapshot,{adapter:storageAdapter,envelope,exactAuthority});
      }
    }
    return clone({world:{day:world.day,routes:world.routes,routeLocks:world.routeLocks,variables:Object.fromEntries(Object.entries(world.variables||{}).filter(([key])=>/^route_.+_locked_v1$/.test(key))),activeCharacters:world.activeCharacters,gameTime:world.gameTime},execution:{activeContactId:execution.activeContactId,activeStoryPath:execution.activeStoryPath,cursor:execution.cursor,lease:execution.lease},playthrough:state.playthrough,branchKey:savedChapterBranchKey(state),canVerifyExactAuthority,exactAuthority});
  }
  function validateAdapter(adapter){if(!adapter||!['get','set','remove'].every(name=>typeof adapter[name]==='function'))throw fail('INVALID_SAVE_STORAGE_ADAPTER');return adapter;}
  function migrateStorageAdapter(nextAdapter){return queueStoreMutation(()=>migrateStorageAdapterNow(nextAdapter));}
  async function migrateStorageAdapterNow(nextAdapter){validateAdapter(nextAdapter);const previous=storageAdapter,legacyRaw=previous.get(STORE_KEY),existingRaw=nextAdapter.get(STORE_KEY),existing=existingRaw==null?null:parse(existingRaw,null);if(existingRaw!=null&&!existing)throw fail('SAVE_STORAGE_MIGRATION_TARGET_INVALID');const existingSlots=Array.isArray(existing)?existing:Array.isArray(existing?.slots)?existing.slots:[];if(existingRaw!=null&&(existingSlots.length||nextAdapter.backend!=='indexedDB')){await nextAdapter.set(MIGRATION_KEY,JSON.stringify({version:1,status:'complete',source:previous.backend||'legacy',target:nextAdapter.backend||'custom',checksum:checksum(existingRaw)}));storageAdapter=nextAdapter;return{ok:true,migrated:false,idempotent:true,legacyRetained:legacyRaw==null||previous.get(STORE_KEY)===legacyRaw};}if(legacyRaw!=null){const legacy=parse(legacyRaw,null);if(!legacy||!Array.isArray(Array.isArray(legacy)?legacy:legacy.slots))throw fail('SAVE_STORAGE_MIGRATION_SOURCE_INVALID');await nextAdapter.set(STORE_KEY,legacyRaw);if(nextAdapter.get(STORE_KEY)!==legacyRaw)throw fail('SAVE_STORAGE_MIGRATION_VERIFY_FAILED');}await nextAdapter.set(MIGRATION_KEY,JSON.stringify({version:1,status:'complete',source:previous.backend||'legacy',target:nextAdapter.backend||'custom',checksum:checksum(legacyRaw||'')}));storageAdapter=nextAdapter;return{ok:true,migrated:legacyRaw!=null,idempotent:false,legacyRetained:legacyRaw==null||previous.get(STORE_KEY)===legacyRaw};}
  function metadata(options,state){const scene=tok(options.forceScene||root.Game?.currentScene||'home')||'home',presence=tok(state.presence?.contactId),active=tok(state.execution?.activeContactId),cursor=state.execution?.cursor||{},contactId=scene==='conversation'?(presence||active||tok(cursor.contactId)):'',storyPath=scene==='conversation'?String(cursor.storyPath||state.execution?.activeStoryPath||'').trim():'',startIndex=Math.max(0,Number(cursor.rootIndex??state.execution?.activeStepIndex)||0),last=root.Game?.lastQuery&&typeof root.Game.lastQuery==='object'?clone(root.Game.lastQuery):{},query=scene==='conversation'&&contactId?{...last,id:contactId,contactId,openConversationId:contactId,activeConversationId:contactId,...(storyPath?{storyPath,story:storyPath,path:storyPath,startIndex,index:startIndex}:{}),from:'save_restore',source:'save_restore'}:last;return{scene,query,openConversationId:contactId||null};}
  function compactCommandReceipts(receipts){const out={};for(const[commandId,receipt]of Object.entries(receipts&&typeof receipts==='object'?receipts:{})){if(!receipt||typeof receipt!=='object')continue;out[commandId]={ok:receipt.ok!==false,status:String(receipt.status||'COMMITTED'),commandId:String(receipt.commandId||commandId),previousRevision:Number(receipt.previousRevision)||0,nextRevision:Number(receipt.nextRevision)||0,...(receipt.error?{error:clone(receipt.error)}:{})};}return out;}
  function bodyFrom(snapshot,options={}){const state=clone(snapshot.state),cursor=state.execution?.cursor,pending=state.execution?.pendingOperation;if(state.progression)state.progression.commandReceipts=compactCommandReceipts(state.progression.commandReceipts);if(cursor&&cursor.phase==='ready_to_interpret'&&!pending&&cursor.pendingPresentationAck==null){cursor.operationId=null;cursor.operationType=null;}const source={revision:Number(snapshot.sourceRevision??state.revision)||0,sessionId:String(snapshot.sourceSessionId||state.sessionId||''),playthroughId:snapshot.sourcePlaythroughId||state.playthrough?.id||null,playthroughGeneration:Number(snapshot.sourcePlaythroughGeneration??state.playthrough?.generation)||1};return{saveSchemaVersion:SAVE_SCHEMA,format:FORMAT,createdAt:String(options.createdAt||new Date().toISOString()),gameVersion:String(root.Game?.version||'2.1.0'),source,canonicalState:state,metadata:metadata(options,state)};}
  const seal=body=>({...body,integrity:{algorithm:'fnv1a32-stable',checksum:checksum(body)}});
  function captureSnapshot(options={}){if(!root.GameStateEngine?.createSaveSnapshot)throw fail('CANONICAL_SAVE_UNAVAILABLE');return seal(bodyFrom(root.GameStateEngine.createSaveSnapshot(),options));}
  const INTERNAL_TYPES=new Set(['choice_rewind','story_replay','chapter']);
  // Immutable, shared sequence chunks keep exact historical authority without
  // embedding the complete transcript/receipt ledger in every internal slot.
  // The pool lives in the save-store envelope and commits with its slot refs.
  function internAuthorityRecord(store,record){
    const pool=store.internalAuthorityRecords||(store.internalAuthorityRecords={}),raw=stable(record),base=`h:${checksum(raw)}:${raw.length}:`;
    let suffix=0,key=base+suffix;
    while(pool[key]&&stable(pool[key])!==raw)key=base+(++suffix);
    if(!pool[key])pool[key]=record;
    return key;
  }
  const verifiedImmutableAuthority=new WeakMap();
  function readAuthorityRecord(store,key){
    const record=store.internalAuthorityRecords?.[key];
    if(!record)throw fail('SAVE_CHECKPOINT_AUTHORITY_UNAVAILABLE');
    if(verifiedImmutableAuthority.get(record)===key)return record;
    const raw=stable(record);
    if(!String(key).startsWith(`h:${checksum(raw)}:${raw.length}:`))throw fail('SAVE_CHECKPOINT_AUTHORITY_CORRUPT');
    if(storageAdapter.isImmutableRecord?.(record)===true)verifiedImmutableAuthority.set(record,key);
    return record;
  }
  function packAuthoritySequence(store,values){
    let level=[];
    for(let i=0;i<values.length;i+=32)level.push(internAuthorityRecord(store,{kind:'leaf',items:values.slice(i,i+32)}));
    if(!level.length)level.push(internAuthorityRecord(store,{kind:'leaf',items:[]}));
    while(level.length>1){const next=[];for(let i=0;i<level.length;i+=32)next.push(internAuthorityRecord(store,{kind:'branch',children:level.slice(i,i+32)}));level=next;}
    return level[0];
  }
  function unpackAuthoritySequence(store,key,active=new Set()){
    if(active.has(key))throw fail('SAVE_CHECKPOINT_AUTHORITY_CORRUPT');
    active.add(key);const record=readAuthorityRecord(store,key);let result;
    if(record.kind==='leaf'&&Array.isArray(record.items))result=clone(record.items);
    else if(record.kind==='branch'&&Array.isArray(record.children))result=record.children.flatMap(child=>unpackAuthoritySequence(store,child,active));
    else throw fail('SAVE_CHECKPOINT_AUTHORITY_CORRUPT');
    active.delete(key);return result;
  }
  function packInternalAuthority(state,store){
    const roots=[],pack=values=>{const ref=packAuthoritySequence(store,values);roots.push(ref);return ref;};
    const conversations=clone(state.conversations||{eventsByContact:{},latestEventByContact:{},unreadByContact:{}}),eventRoots={};
    for(const[cid,events]of Object.entries(conversations.eventsByContact||{}))eventRoots[cid]=pack(events);
    delete conversations.eventsByContact;
    const notifications=clone(state.notifications||{committedEvents:{},displayedEventIds:[]}),notificationRoot=pack(Object.entries(notifications.committedEvents||{})),displayedRoot=pack(notifications.displayedEventIds||[]);
    delete notifications.committedEvents;delete notifications.displayedEventIds;
    const caches={};
    for(const[cid,value]of Object.entries(state.progression?.conversationsCache||{})){
      const row=clone(value);
      if(row&&typeof row==='object'&&Array.isArray(row.messages)){const messages=pack(row.messages);delete row.messages;caches[cid]={row,messages};}
      else caches[cid]={row};
    }
    const data={commandReceipts:pack(Object.entries(state.progression?.commandReceipts||{})),conversations,eventRoots,notifications,notificationRoot,displayedRoot,caches,presence:clone(state.presence||{}),recovery:clone(state.recovery||{})};
    return internAuthorityRecord(store,{kind:'authority',playthrough:clone(state.playthrough||{}),operationEpoch:Number(state.execution?.operationEpoch)||0,revision:Number(state.revision)||0,roots,data});
  }
  function unpackInternalAuthority(store,key){
    const record=readAuthorityRecord(store,key);if(record.kind!=='authority')throw fail('SAVE_CHECKPOINT_AUTHORITY_CORRUPT');
    const d=record.data,cache={};
    for(const[cid,value]of Object.entries(d.caches||{}))cache[cid]=value.messages?{...clone(value.row),messages:unpackAuthoritySequence(store,value.messages)}:clone(value.row);
    return{playthrough:clone(record.playthrough),revision:record.revision,execution:{operationEpoch:record.operationEpoch},progression:{commandReceipts:Object.fromEntries(unpackAuthoritySequence(store,d.commandReceipts)),conversationsCache:cache},conversations:{...clone(d.conversations),eventsByContact:Object.fromEntries(Object.entries(d.eventRoots).map(([cid,ref])=>[cid,unpackAuthoritySequence(store,ref)]))},notifications:{...clone(d.notifications),committedEvents:Object.fromEntries(unpackAuthoritySequence(store,d.notificationRoot)),displayedEventIds:unpackAuthoritySequence(store,d.displayedRoot)},presence:clone(d.presence),recovery:clone(d.recovery)};
  }
  function applyInternalAuthority(body,authority){
    const state=clone(body.canonicalState);
    state.progression={...(state.progression||{}),...clone(authority.progression)};
    for(const key of['conversations','notifications','presence','recovery'])state[key]=clone(authority[key]);
    return{...body,canonicalState:state};
  }
  function pruneInternalAuthority(store){
    if(!store.internalAuthorityRecords)return;
    const keep=new Set(),visit=key=>{if(!key||keep.has(key))return;keep.add(key);const record=readAuthorityRecord(store,key);for(const ref of(record.kind==='authority'?record.roots:record.kind==='branch'?record.children:[])||[])visit(ref);};
    for(const slot of store.slots||[])visit(slot?.snapshot?.metadata?.internalSnapshot?.authorityRoot);
    store.internalAuthorityRecords=Object.fromEntries([...keep].map(key=>[key,store.internalAuthorityRecords[key]]));
    if(!keep.size)delete store.internalAuthorityRecords;
  }
  function internalLogicalId(type,meta={},state={}){
    const playthrough=String(meta.playthroughId||state.playthrough?.id||'legacy'),story=String(meta.storyPath||state.execution?.activeStoryPath||''),logical=type==='choice_rewind'?String(meta.choiceGroupId||meta.choiceKey||meta.sourceStep||meta.order||'choice'):type==='story_replay'?String(meta.storyOnceKey||story):String(meta.chapterId||`${story}:${meta.startIndex||0}`);
    const identity=[playthrough,story,logical];
    if(type==='chapter'){
      const world=state.world||{};
      identity.push(['lena','hailey','evelyn','mason'].map(cid=>tok(world.variables?.[`route_${cid}_locked_v1`]||world.routeLocks?.[cid]||world.routes?.[cid])),Array.isArray(world.activeCharacters)?world.activeCharacters.map(tok).sort():null,tok(world.masonVariant));
    }
    return`internal:${type}:${checksum(identity)}`;
  }
  function compactInternalPayload(payload,type,meta={},store){
    const verified=verify(payload);
    // Existing compact slots must never be relabelled as lossless: their
    // discarded authority cannot be recovered from current gameplay.
    if(verified.metadata?.internalSnapshot)return seal(verified);
    const state=verified.canonicalState,authorityRoot=packInternalAuthority(state,store);
    if(state.progression){state.progression.commandReceipts={};state.progression.conversationsCache={};}
    state.conversations={eventsByContact:{},latestEventByContact:{},unreadByContact:{}};
    state.notifications={committedEvents:{},displayedEventIds:[]};
    state.presence={contactId:null,mountState:null,navigationTransactionId:null,committedRevision:0};
    state.recovery={transactionStatus:'stable',previousStableRevision:Number(state.revision)||0,pendingCommand:null,lastError:null};
    return seal({...verified,canonicalState:state,metadata:{...(verified.metadata||{}),internalSnapshot:{schemaVersion:INTERNAL_SCHEMA,type,logicalId:internalLogicalId(type,meta,state),authorityRoot,omitted:['progression.commandReceipts','progression.conversationsCache','conversations','notifications','presence','recovery']}}});
  }
  function inflateInternalBody(body){
    const marker=body?.metadata?.internalSnapshot;if(!marker)return body;
    if(!marker.authorityRoot)throw fail(Number(marker.schemaVersion)===1?'LEGACY_CHECKPOINT_AUTHORITY_UNAVAILABLE':'SAVE_CHECKPOINT_AUTHORITY_UNAVAILABLE');
    const authority=unpackInternalAuthority(readStore(),marker.authorityRoot),state=body.canonicalState;
    if(authority.playthrough?.id!==state.playthrough?.id||Number(authority.playthrough?.generation)!==Number(state.playthrough?.generation)||Number(authority.revision)!==Number(state.revision)||Number(authority.execution.operationEpoch)!==Number(state.execution?.operationEpoch||0))throw fail('SAVE_CHECKPOINT_AUTHORITY_CORRUPT');
    return applyInternalAuthority(body,authority);
  }
  function validateState(state){const engine=root.GameStateEngine,migrated=engine.migrate(clone(state),{sessionId:String(state?.sessionId||'save-validation')});engine.validateLoadedState(migrated);engine.validateReceiptMaps(migrated);return migrated;}
  function verifyV5(p){if(!p?.canonicalState)throw fail('INVALID_CANONICAL_SAVE');const b={saveSchemaVersion:5,createdAt:p.createdAt,gameVersion:p.gameVersion,canonicalState:p.canonicalState,durableSubsystems:p.durableSubsystems||{},metadata:p.metadata||{}};if(p.integrity?.checksum!==checksum(b))throw fail('SAVE_CHECKSUM_MISMATCH');return b;}
  function legacyEvents(store){
    const out={};
    for(const[cid,row]of Object.entries(store&&typeof store==='object'?store:{})){
      const messages=Array.isArray(row?.messages)?row.messages:[];
      out[cid]=messages.map((m,i)=>{
        const kind=m?.kind||'message',media=['image','photo','media'].includes(kind);
        const sourceStepKey=m?.sourceStepKey??m?.sourceStepIndex;
        return{eventId:String(m?.eventId||m?.id||`legacy-message-${checksum([cid,i,m?.from,m?.text,m?.kind])}`),contactId:cid,
          storyId:m?.storyId||m?.storyOnceKey||null,storyPath:m?.storyPath||null,
          stepIndex:Number(m?.stepIndex??m?.sourceStepIndex??i)||0,
          ...(sourceStepKey!=null?{sourceStepKey:String(sourceStepKey)}:{}),
          kind,from:m?.from||cid,...(m?.presentation==='player_thought'?{presentation:'player_thought',speaker:'player'}:{}),
          text:String(m?.text||m?.body||''),assetId:m?.assetId||(media?(m?.image||m?.imageSrc||m?.url||m?.src):null)||null,
          transactionId:'legacy-save-migration',revision:0};
      });
    }
    return out;
  }
  function importLegacyGallerySnapshot(state,storage){
    if(!['gallery_photos','savedPhotos','gallery_full_unlock_v1'].some(key=>Object.prototype.hasOwnProperty.call(storage,key)))return;
    const fullUnlock=state.gallery?.fullUnlock===true;
    root.GameStateEngine.importLegacyGallery(state,{getItem:key=>{
      const raw=Object.prototype.hasOwnProperty.call(storage,key)?storage[key]:null;
      if(!['gallery_photos','savedPhotos'].includes(key))return raw;
      const rows=parse(raw,[]);
      // Undated ownership remains undated. Importing the same archive must
      // not invent a new discovery time on every normalization.
      return Array.isArray(rows)?JSON.stringify(rows.map(row=>{
        if(typeof row==='string')return{url:row,unlockedAt:1};
        if(!row||typeof row!=='object')return row;
        const unlockedAt=[row.unlockedAt,row.at,row.timestamp,row.addedAt,row.createdAt].map(value=>{
          const numeric=Number(value);return Number.isFinite(numeric)?numeric:typeof value==='string'?Date.parse(value):0;
        }).find(value=>Number.isFinite(value)&&value>0)||1;
        return{...row,unlockedAt};
      })):raw;
    }});
    if(fullUnlock)state.gallery.fullUnlock=true;
  }
  function legacyToCanonical(snapshot){if(snapshot?.canonicalState)return validateState(snapshot.canonicalState);const storage=snapshot?.storage&&typeof snapshot.storage==='object'?snapshot.storage:{},embedded=parse(storage.intercepted_engine_state_v4||'',null);if(embedded)return validateState(embedded);const hash=checksum(snapshot||{}),active=[],routes={},once=[];for(const[k,v]of Object.entries(storage)){if(k.startsWith('active_character:')&&v==='1')active.push(tok(k.slice(17)));if((k.startsWith('once_')||k.startsWith('__once:'))&&v==='1')once.push(k.replace(/^once_|^__once:/,''));const m=k.match(/^(?:character_route_|route_)([a-z0-9_-]+?)(?:_locked_v1)?$/i);if(m&&['love','ntr','nts'].includes(tok(v)))routes[tok(m[1])]=tok(v);}const rows=parse(storage.choices_log_v1||'[]',[]),choices={};for(const[i,row]of(Array.isArray(rows)?rows:[]).entries())choices[String(row?.key||row?.id||`legacy_${i}`)]=clone(row?.value??row?.optionId??true);const engine=root.GameStateEngine,state=engine.migrate({day:Number(storage.current_day||snapshot?.game?.day)||1,routes,activeCharacters:active.length?active:['evelyn','hailey','mason','lena','aiden'],choices,onceKeys:[...new Set(once)],completedStoryIds:[]},{profileId:'default',sessionId:`legacy-save-${hash}`});state.sessionId=`legacy-save-${hash}`;state.playthrough={id:`legacy-${hash}`,generation:1,resetAt:null};state.progression.onceKeys=[...new Set(once)];state.progression.choicesLog=Array.isArray(rows)?clone(rows):[];state.progression.conversationsCache=parse(storage.conversations||'{}',{})||{};state.conversations.eventsByContact=legacyEvents(state.progression.conversationsCache);state.conversations.latestEventByContact={};state.conversations.unreadByContact={};for(const[cid,events]of Object.entries(state.conversations.eventsByContact)){if(events.length)state.conversations.latestEventByContact[cid]=events.at(-1).eventId;state.conversations.unreadByContact[cid]=Math.max(0,Number(state.progression.conversationsCache?.[cid]?.unread)||0);}state.progression.pendingStory=parse(storage.pending_story_v1||'',null);const runtime=parse(storage.story_runtime_v1||'',{})||{},cid=tok(storage.openConversationId||storage.activeConversationId||runtime.activeCharacterId||runtime.turnOwner),path=String(runtime.activeStoryPath||(cid&&(storage[`conv_story_${cid}`]||storage[`conv_episode_${cid}`]))||'').trim();if(path){const step=Math.max(0,Number(runtime.resumeIndex??runtime.activeStepIndex??storage[`conv_progress_${cid}`])||0),pending=parse(storage.pending_outbound_v1||'',null);state.execution={...state.execution,activeStoryId:String(runtime.activeStoryId||path),activeStoryPath:path,activeContactId:cid||null,activeStepIndex:step,status:'running',generation:1,lease:{id:`legacy-lease-${hash}`,storyId:String(runtime.activeStoryId||path),generation:1,createdRevision:0}};state.execution.cursor={storyPath:path,storyId:state.execution.activeStoryId,contactId:state.execution.activeContactId,rootIndex:step,branchPath:[],operationId:null,operationType:null,branchReceiptId:null,gotoTarget:null,pendingUserIntent:pending&&typeof pending==='object'?pending:null,pendingPresentationAck:null,phase:pending?'waiting_for_user_intent':'ready_to_interpret',completion:'in_progress',continuation:'none',leaseId:state.execution.lease.id,storyRevision:0};}delete state.world.gameTime;return validateState(state);}
  function migrateLegacy(snapshot){let state,createdAt=snapshot?.createdAt,meta=snapshot?.metadata||{};if(Number(snapshot?.saveSchemaVersion)===5){const old=verifyV5(snapshot);state=validateState(old.canonicalState);createdAt=old.createdAt;meta=old.metadata;}else{state=legacyToCanonical(snapshot);const legacyStorage=snapshot?.storage&&typeof snapshot.storage==='object'?snapshot.storage:{};const legacyReader={getItem:key=>Object.prototype.hasOwnProperty.call(legacyStorage,key)?legacyStorage[key]:null};root.GameStateEngine.importLegacyHak(state,legacyReader);importLegacyGallerySnapshot(state,legacyStorage);state=validateState(state);meta={scene:tok(snapshot?.scene||snapshot?.game?.currentScene||'home')||'home',query:clone(snapshot?.game?.lastQuery||{}),openConversationId:tok(snapshot?.storage?.openConversationId||snapshot?.storage?.activeConversationId)||null};}const body=bodyFrom({state,sourceRevision:state.revision,sourceSessionId:state.sessionId,sourcePlaythroughId:state.playthrough?.id,sourcePlaythroughGeneration:state.playthrough?.generation},{createdAt,forceScene:meta.scene});body.metadata={...body.metadata,...clone(meta||{})};return seal(body);}
  function verify(payload){if(!payload||Number(payload.saveSchemaVersion)!==SAVE_SCHEMA||payload.format!==FORMAT||!payload.canonicalState)throw fail('INVALID_CANONICAL_SAVE');const body={saveSchemaVersion:payload.saveSchemaVersion,format:payload.format,createdAt:payload.createdAt,gameVersion:payload.gameVersion,source:payload.source||{},canonicalState:payload.canonicalState,metadata:payload.metadata||{}};if(payload.integrity?.algorithm!=='fnv1a32-stable'||payload.integrity?.checksum!==checksum(body))throw fail('SAVE_CHECKSUM_MISMATCH');body.canonicalState=validateState(body.canonicalState);return body;}
  function normalizePayload(snapshot){if(Number(snapshot?.saveSchemaVersion)===SAVE_SCHEMA){verify(snapshot);return clone(snapshot);}const migrated=migrateLegacy(snapshot);verify(migrated);return migrated;}
  function generateId(type){if(type==='quick')return'quicksave';if(type==='auto')return'autosave';if(type==='auto_return')return'autosave_return_previous_conversation';return`s${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`;}
  async function restoreStoryReplay(id,opts={}){
    await api.ready;
    const slot=api.findSlot(id);
    if(!slot||slot.type!=='story_replay')throw fail('SAVE_SLOT_NOT_FOUND');
    const normalize=value=>String(value||'').trim().replace(/\\/g,'/');
    const storyPath=normalize(slot.storyPath),requestedPath=normalize(opts.storyPath);
    if(!storyPath||(requestedPath&&requestedPath.toLowerCase()!==storyPath.toLowerCase()))return false;
    // Replay displays already committed history. Its legacy save envelope is
    // never restored: that would replace the live clock, lease and pending turn.
    const conversations=root.GameStateEngine?.getConversationsState?.().eventsByContact||{};
    const matches=event=>normalize(event?.storyPath).toLowerCase()===storyPath.toLowerCase();
    const contactId=tok(opts.contactId||slot.contactId||slot.characterId)||Object.keys(conversations).find(cid=>(conversations[cid]||[]).some(matches));
    if(!contactId||!(conversations[contactId]||[]).some(matches)||typeof root.navigateToScene!=='function')return false;
    return (await root.navigateToScene('conversation',{id:contactId,from:'story_route_tree_history',storyPath,onceKey:String(opts.storyOnceKey||slot.storyOnceKey||''),nodeId:String(opts.nodeId||''),manifestId:String(opts.manifestId||'')}))!==false;
  }
  async function createSlot({id,type='manual',label='',snapshot,metadata:meta={}}={}){await api.ready;const key=id||generateId(type),now=Date.now(),payload=snapshot?normalizePayload(snapshot):captureSnapshot(meta);return queueStoreMutation(async()=>{const store=readStore(),prior=store.slots.find(row=>row?.id===key),row={id:key,type,label:String(label||prior?.label||''),scene:payload.metadata?.scene||'home',createdAt:Number(prior?.createdAt)||now,updatedAt:now,schemaVersion:SAVE_SCHEMA,canonicalRevision:payload.source.revision,playthroughGeneration:payload.source.playthroughGeneration,checksum:payload.integrity.checksum,snapshot:payload};store.slots=store.slots.filter(item=>item?.id!==key);store.slots.push(row);await writeStore(store);return key;});}
  const find=id=>publicSlot(readSlotRows().find(slot=>String(slot?.id||'')===String(id||'')));
  function retireRuntime(){try{root.PresentationController?.cancelForRemount?.('save_restore');}catch{}try{root.__conv_cleanup?.();}catch{}try{root.__conv_resetStoryRunner?.({source:'save_restore'});}catch{}try{root.Game._storyRunId=Math.max(0,Number(root.Game?._storyRunId)||0)+1;root.Game._activeRunner=null;root.Game.actionPending=false;root.Game.choicePending=false;root.Game.choicePendingState=null;}catch{}}
  function boot(meta,opts={}){const scene=tok(meta?.scene||'home')||'home',query=meta?.query&&typeof meta.query==='object'?clone(meta.query):{};if(scene==='conversation'&&meta?.openConversationId){query.id=tok(meta.openConversationId);query.contactId=query.id;query.openConversationId=query.id;query.activeConversationId=query.id;}storageAdapter.set('__boot_from_save',JSON.stringify({scene,query,justLoadedFromSave:true,suppressPendingAutoResume:opts.suppressPendingAutoResume!==false,presentationWasActive:opts.presentationWasActive===true}));if(opts.bootIntent&&typeof opts.bootIntent==='object')storageAdapter.set('__boot_intent_v1',JSON.stringify(opts.bootIntent));}
  function restore(payload,opts={}){
    const body=inflateInternalBody(verify(payload));
    if(body.metadata?.internalSnapshot){
      const savedWorld=payload.canonicalState.world||{},savedClock=savedWorld.gameTime;
      const hasSavedClock=(savedClock?.version===1||root.GameTimeService?.isStoredClock?.(savedClock)===true)&&typeof root.GameTimeService?.normalizeStamp==='function'&&!!root.GameTimeService.normalizeStamp({...savedClock,day:savedWorld.day});
      if(!hasSavedClock){
        // verify validates the compact body before its frozen message and
        // notification authority is inflated. A clock inferred there cannot
        // mark historical migration complete. Restore the original clock
        // input on this detached body and validate the complete authority
        // before retiring any live runtime. Catalog reads stay unchanged.
        if(Object.prototype.hasOwnProperty.call(savedWorld,'gameTime'))body.canonicalState.world.gameTime=clone(savedClock);
        else delete body.canonicalState.world.gameTime;
        body.canonicalState=validateState(body.canonicalState);
      }
    }
    const presentationWasActive=!!root.document?.querySelector?.('#hak-overlay.show');retireRuntime();const commandId=String(opts.commandId||`save-restore:${payload.integrity.checksum}:${Date.now()}:${++restoreSequence}`),result=root.GameStateEngine.restore({state:body.canonicalState,sourceRevision:body.source.revision},{commandId});if(!result.ok)throw fail(result.status,result.error?.message||result.status);const rawMasonVariant=String(root.GameStateEngine.getState()?.world?.masonVariant||'').trim().toLowerCase(),masonVariant=rawMasonVariant==='female'||rawMasonVariant==='male'?rawMasonVariant:'';if(masonVariant)storageAdapter.set('character_variant_mason',masonVariant);else storageAdapter.remove('character_variant_mason');try{root.dispatchEvent(new CustomEvent('character-variant:changed',{detail:{id:'mason',value:masonVariant,source:'save_restore'}}));}catch{}if(opts.reload===true){boot(body.metadata,{...opts,presentationWasActive});root.location.reload();}else queueMicrotask(()=>root.Game?.resumePendingStory?.({source:'save_restore',presentationWasActive}));return result;
  }
  async function loadFromSlot(id,opts={}){await api.ready;try{const payload=await queueStoreMutation(async()=>{const store=readStore(),slot=store.slots.find(row=>String(row?.id||'')===String(id||''));if(!slot?.snapshot)throw fail('SAVE_SLOT_NOT_FOUND');const migrated=normalizePayload(slot.snapshot);if(Number(slot.snapshot.saveSchemaVersion)!==SAVE_SCHEMA){const replacement={...slot,snapshot:migrated,schemaVersion:SAVE_SCHEMA,canonicalRevision:migrated.source.revision,playthroughGeneration:migrated.source.playthroughGeneration,checksum:migrated.integrity.checksum};store.slots=store.slots.map(row=>row===slot?replacement:row);await writeStore(store);}return migrated;});return restore(payload,opts);}catch(e){if(opts.silent!==true)showError(e);throw e;}}
  async function deleteSlot(id){await api.ready;return queueStoreMutation(async()=>{const store=readStore(),before=store.slots.length;store.slots=store.slots.filter(slot=>String(slot?.id||'')!==String(id||''));if(store.slots.length!==before)await writeStore(store);return store.slots.length!==before;});}
  function play(opts={}){if(opts.playSfx===false)return;try{root.Game?.audio?.play?.('ui_confirm',{category:'sfx',cooldownKey:'save_confirm_action',cooldownMs:90});}catch{}}
  let restartPromise=null;
  function restartStoryFromBeginning(opts={}){
    if(restartPromise)return restartPromise;
    restartPromise=(async()=>{
      await api.ready;
      const engine=root.GameStateEngine,identity=JSON.stringify(engine?.getRuntimeLifecycleIdentity?.()||{});
      if(!engine?.dispatch||!root.UIModal?.confirm)return{ok:false,status:'RESTART_UNAVAILABLE'};
      const accepted=await root.UIModal.confirm({title:ui('story.restart.title','Restart from Day 1'),
        text:ui('story.restart.confirm','Restart the story from the beginning? Your saves, unlocked gallery images, Card Vault collection, achievements, access codes, names and settings will be kept.'),
        okText:ui('story.restart.action','Restart'),cancelText:ui('common.cancel','Cancel')});
      if(!accepted)return{ok:false,cancelled:true};
      // A Load or another campaign replacing the state while confirmation is
      // open revokes this request. Cancellation has made no persistent writes.
      if(root.GameStateEngine!==engine||JSON.stringify(engine.getRuntimeLifecycleIdentity?.()||{})!==identity)return{ok:false,cancelled:true,status:'STALE_RESTART'};
      const resetAt=Date.now(),before=engine.getState();
      const result=engine.dispatch({type:'RESET_PLAYTHROUGH',commandId:`story-restart:${before.playthrough?.id}:${resetAt}`,
        expectedRevision:before.revision,payload:{resetAt,mode:'story_restart'}});
      if(!result?.ok){await root.UIModal.alert?.({title:ui('story.restart.title','Restart from Day 1'),text:ui('story.restart.failed','The story could not be restarted. Your current progress has been kept. Please try again.')});return result;}
      retireRuntime();
      const game=root.Game||{};
      for(const key of ['_bootIntent','_pendingLoad','_pendingStory','pendingStory','__pendingStory'])delete game[key];
      game.history=[];game.lastQuery={};history.length=0;
      const current=engine.getState();
      try{storageAdapter.set('character_variant_mason',current.world.masonVariant);}catch{}
      const source=String(opts.source||'story_restart');
      try{storageAdapter.set('achievement_run_v1',JSON.stringify({startedAt:resetAt,resetSource:source,seededAt:resetAt,updatedAt:resetAt}));root.dispatchEvent(new CustomEvent('game:story-restarted',{detail:{source}}));}catch{}
      // EngineStorage owns both the durable reset and its compatibility
      // projection cleanup; allow that queued projection to settle before boot.
      await Promise.resolve();
      if(opts.reload!==false)root.location.reload();
      return result;
    })().finally(()=>{restartPromise=null;});
    return restartPromise;
  }
  async function createInternalSlot(type,meta={}){
    await api.ready;
    if(typeof meta.isCurrent==='function'&&meta.isCurrent()!==true)return null;
    const rich=meta.snapshot?normalizePayload(meta.snapshot):captureSnapshot({forceScene:meta.forceScene||'conversation'}),logicalId=internalLogicalId(type,meta,rich.canonicalState),id=String(meta.slotId||logicalId),now=Date.now();
    return queueStoreMutation(async()=>{
      if(typeof meta.isCurrent==='function'&&meta.isCurrent()!==true)return null;
      const store=readStore(),payload=compactInternalPayload(rich,type,meta,store);
      // The chapter index can still reference another playthrough's slot.
      // Reuse it only if its saved route and playthrough identity also match.
      const matches=row=>type==='chapter'?row?.type===type&&row?.snapshot?.canonicalState&&internalLogicalId(type,row,row.snapshot.canonicalState)===logicalId:row?.id===id||row?.snapshot?.metadata?.internalSnapshot?.logicalId===logicalId;
      const prior=store.slots.find(row=>row?.id===id&&matches(row))||store.slots.find(matches),key=prior?.id||(store.slots.some(row=>row?.id===id)?logicalId:id),row={id:key,type,label:String(meta.label||meta.title||prior?.label||''),scene:payload.metadata?.scene||'conversation',createdAt:Number(prior?.createdAt)||now,updatedAt:now,schemaVersion:SAVE_SCHEMA,internalSchemaVersion:payload.metadata.internalSnapshot.schemaVersion,logicalId,storyPath:String(meta.storyPath||''),choiceKey:String(meta.choiceGroupId||meta.choiceKey||''),chapterId:String(meta.chapterId||''),canonicalRevision:payload.source.revision,playthroughGeneration:payload.source.playthroughGeneration,checksum:payload.integrity.checksum,snapshot:payload};
      store.slots=store.slots.filter(item=>item!==prior&&item?.id!==row.id&&item?.snapshot?.metadata?.internalSnapshot?.logicalId!==logicalId);store.slots.push(row);
      // Earned chapter variants are durable. A global 32-slot cap silently
      // erased older routes; immutable authority chunks already share history.
      await writeStore(store);return row.id;
    });
  }
  function migrateInternalSlotsOnce(){return queueStoreMutation(migrateInternalSlotsNow);}
  async function migrateInternalSlotsNow(){
    if(storageAdapter.get(INTERNAL_MIGRATION_KEY)==='1')return{ok:true,migrated:false};
    const started=typeof performance!=='undefined'?performance.now():Date.now(),store=readStore(),manualBefore=store.slots.filter(s=>String(s?.type||'manual')==='manual').map(s=>({id:s.id,snapshot:s.snapshot})),out=[],groups=new Map,profile=[];
    for(const slot of store.slots){
      const type=String(slot?.type||'manual');
      if(!INTERNAL_TYPES.has(type)){out.push(slot);continue;}
      const state=slot?.snapshot?.canonicalState,key=state?internalLogicalId(type,slot,state):`unresolved:${String(slot?.id||Math.random())}`,group=groups.get(key)||[];
      group.push(slot);groups.set(key,group);
    }
    let changed=false,processed=out.length;
    try{root.__SAVE_STORAGE_MIGRATION_PROGRESS?.('internal_compaction',{processed,total:store.slots.length});}catch{}
    for(const candidates of groups.values()){
      candidates.sort((a,b)=>Number(b?.updatedAt||0)-Number(a?.updatedAt||0));
      let retained=null;
      for(const slot of candidates){
        const type=String(slot?.type||'manual'),rowStart=typeof performance!=='undefined'?performance.now():Date.now(),legacyBytes=JSON.stringify(slot).length;
        try{
          const normalizeStart=typeof performance!=='undefined'?performance.now():Date.now(),payload=Number(slot?.snapshot?.saveSchemaVersion)===SAVE_SCHEMA?slot.snapshot:normalizePayload(slot.snapshot),normalizationMs=(typeof performance!=='undefined'?performance.now():Date.now())-normalizeStart,compactStart=typeof performance!=='undefined'?performance.now():Date.now(),compact=compactInternalPayload(payload,type,slot,store),compactionMs=(typeof performance!=='undefined'?performance.now():Date.now())-compactStart,logicalId=compact.metadata.internalSnapshot.logicalId;
          retained={...slot,id:String(slot.id||logicalId),internalSchemaVersion:compact.metadata.internalSnapshot.schemaVersion,logicalId,checksum:compact.integrity.checksum,snapshot:compact};
          const normalizedBytes=JSON.stringify(retained).length,totalMs=(typeof performance!=='undefined'?performance.now():Date.now())-rowStart;
          profile.push({slotId:String(slot.id||''),slotType:type,legacyBytes,normalizedBytes,parseMs:0,normalizationMs,compactionMs,fingerprintMs:0,semanticIdentityMs:0,serializationMs:Math.max(0,totalMs-normalizationMs-compactionMs),totalMs,retained:true,duplicateCandidates:candidates.length});
          changed=changed||JSON.stringify(slot.snapshot)!==JSON.stringify(compact)||candidates.length>1;
          break;
        }catch(error){profile.push({slotId:String(slot.id||''),slotType:type,legacyBytes,normalizedBytes:0,totalMs:(typeof performance!=='undefined'?performance.now():Date.now())-rowStart,retained:false,error:String(error?.code||error?.message||error)});}
      }
      if(retained)out.push(retained);else out.push(...candidates);
      processed+=candidates.length;
      try{root.__SAVE_STORAGE_MIGRATION_PROGRESS?.('internal_compaction',{processed,total:store.slots.length});}catch{}
    }
    if(changed||out.length!==store.slots.length)await writeStore({...store,slots:out});
    const manualAfter=out.filter(s=>String(s?.type||'manual')==='manual');
    if(manualAfter.length!==manualBefore.length||manualBefore.some((s,i)=>manualAfter[i]?.id!==s.id||manualAfter[i]?.snapshot!==s.snapshot))throw fail('INTERNAL_MIGRATION_MANUAL_INVARIANT');
    await storageAdapter.set(INTERNAL_MIGRATION_KEY,'1');
    root.__SAVE_INTERNAL_MIGRATION_PROFILE={totalMs:(typeof performance!=='undefined'?performance.now():Date.now())-started,beforeSlots:store.slots.length,afterSlots:out.length,groups:groups.size,rows:profile};
    try{root.__SAVE_STORAGE_MIGRATION_PROGRESS?.('internal_compaction_complete',{processed:store.slots.length,total:store.slots.length});}catch{}
    return{ok:true,migrated:changed,beforeSlots:store.slots.length,afterSlots:out.length};
  }
  function getStorageInventory(){const rows=[],storage=storageAdapter.storage||root.localStorage;if(!storage)return{totalBytes:0,rows:[]};for(let i=0;i<Number(storage.length||0);i++){const key=String(storage.key(i)||''),value=String(storage.getItem(key)||''),logicalBytes=2*(key.length+value.length);let classification='current_durable',rebuildable=false,prunable=false;if(key===STORE_KEY)classification='save_store';else if(key===HEADROOM_KEY){classification='emergency_reserve';rebuildable=true;prunable=true;}else if(/^(conversations|gallery_photos|savedPhotos|card_vault_state_(?:v1|backup_v1)|hak_|onlyfun_)/.test(key)){classification='compatibility_projection';rebuildable=true;prunable=true;}else if(/migration|pressure_compaction/.test(key))classification='migration_metadata';else if(/journal/.test(key))classification='required_wal';else if(key.startsWith('intercepted_engine_events_v1:'))classification='canonical_transcript_segment';rows.push({key,logicalBytes,classification,rebuildable,prunable});}rows.sort((a,b)=>b.logicalBytes-a.logicalBytes);return{totalBytes:rows.reduce((n,r)=>n+r.logicalBytes,0),rows};}
  const history=[];
  const migrationTiming={startedAt:typeof performance!=='undefined'?performance.now():Date.now(),phases:{}};
  const markMigration=point=>{migrationTiming.phases[String(point)]=(typeof performance!=='undefined'?performance.now():Date.now())-migrationTiming.startedAt;root.__SAVE_STORAGE_MIGRATION_TIMING=migrationTiming;};
  const api={__v2:true,__canonical:true,__feature5Canonical:true,saveSchemaVersion:SAVE_SCHEMA,metaKeys:META_KEYS.slice(),LocalStorageSaveStorageAdapter,getStorageBackend:()=>storageAdapter.backend||'custom',setStorageAdapter(adapter,opts={}){validateAdapter(adapter);if(opts.migrateLegacy!==false)return migrateStorageAdapter(adapter);storageAdapter=adapter;return{ok:true,migrated:false,legacyRetained:true};},migrateStorageAdapter,captureSnapshot,verify,migrateLegacy,normalizePayload,restore,restartStoryFromBeginning,
    async manualSave(label,opts={}){play(opts);try{const id=await createSlot({type:'manual',label,metadata:{forceScene:opts.forceScene||'home'}});ensureHeadroom();try{root.showToast?.(`Save created: ${label||'Manual'}`);}catch{}return id;}catch(e){if(!isQuotaError(e)&&e?.code!=='PERSISTENCE_STORAGE_FULL')throw e;releaseHeadroom();return storageFailure(e);}},
    async quickSave(opts={}){play(opts);const id=await createSlot({id:'quicksave',type:'quick'});try{root.showToast?.('Quicksave saved');}catch{}return id;},saveToSlot:(id,opts={})=>createSlot({id,type:'manual',metadata:opts}),autoSave:(opts={})=>createSlot({id:'autosave',type:'auto',metadata:opts}),loadFromSlot,getSlots:()=>publicSlots().sort((a,b)=>Number(b?.updatedAt||0)-Number(a?.updatedAt||0)),deleteSlot,findSlot:find,getChapterSnapshotHeader,
    createChapterSlot:meta=>createInternalSlot('chapter',meta),createChoiceRewindSlot:meta=>createInternalSlot('choice_rewind',meta),createStoryReplaySlot:meta=>createInternalSlot('story_replay',meta),restoreChoiceRewind:(id,opts={})=>loadFromSlot(id,{...opts,reload:opts.reload!==false}),restoreStoryReplay,getChoiceRewinds:()=>publicSlots('choice_rewind'),getStoryReplays:()=>publicSlots('story_replay'),recordStoryPlayHistory:meta=>{history.push(clone(meta));return meta;},getStoryPlayHistory:()=>clone(history),getPreviousStoryPlayEntry:()=>history.at(-2)||null,restorePreviousStoryConversation:()=>false,rememberConversationStartSnapshot:()=>true,getConversationStartSnapshot:()=>null,autoSaveStartOfConversation:()=>createSlot({id:'autosave_return_previous_conversation',type:'auto_return'}),autoSaveBeforeConversationEnter:()=>true,updateChoiceRewindSelection:()=>true,isPlayerVisibleSlot:slot=>!['chapter','choice_rewind','story_replay'].includes(String(slot?.type||'')),computeSlotLabel:slot=>String(slot?.label||''),clearAllSlots:async()=>{await api.ready;return queueStoreMutation(()=>writeStore({version:SAVE_SCHEMA,slots:[]}));},migrateInternalSlotsOnce,getStorageInventory};
  root.SaveSystem=api;root.Game=root.Game||{};Object.assign(root.Game,{quickSave:api.quickSave,autoSave:api.autoSave,manualSave:api.manualSave,loadFromSlot:api.loadFromSlot,restoreChoiceRewind:api.restoreChoiceRewind,restoreStoryReplay:api.restoreStoryReplay});
  async function migrateInternalStorage(){
    markMigration('internal_start');
    try{
      const result=await migrateInternalSlotsOnce();
      if(result?.migrated===true)root.__SAVE_INTERNAL_SNAPSHOT_MIGRATED_THIS_LAUNCH=true;
    }catch(error){
      try{console.error('[SaveSystem] internal snapshot migration deferred',String(error?.code||error?.message||error));}catch{}
    }
    markMigration('internal_complete');
  }
  function validateIndexedDbAuthority(adapter){
    const rows=adapter.getSlotRows(),count=adapter.committedCount,phase=adapter.migrationState;
    // Old fresh profiles certified an empty database without save_store metadata.
    // A missing store for a previously populated profile must stay unavailable.
    const certifiedEmpty=count==null&&rows.length===0&&phase?.count===0&&['verified','legacy_cleanup_complete'].includes(phase?.phase);
    if(!certifiedEmpty&&(!Number.isSafeInteger(count)||count<0||count!==rows.length))throw fail('INDEXEDDB_AUTHORITY_INVALID');
  }
  async function recoverNewLegacySlots(adapter,raw){
    if(!raw)return{count:0};
    const legacy=parse(raw,null),incoming=Array.isArray(legacy)?legacy:legacy?.slots;
    if(!Array.isArray(incoming))throw fail('SAVE_STORAGE_RECOVERY_SOURCE_INVALID');
    const store=adapter.getStore(),timestamp=row=>Math.max(0,Number(row?.updatedAt)||0,Number(row?.createdAt)||0);
    let cutoff=Math.max(0,Number(adapter.migrationState?.updatedAt)||0,Number(adapter.committedAt)||0);
    for(const slot of store.slots)cutoff=Math.max(cutoff,timestamp(slot));
    // A failed old migration could leave localStorage active after verifying
    // IndexedDB. Only writes newer than every durable commit are recoverable;
    // the original import source cannot resurrect deleted or older saves.
    const candidates=incoming.filter(slot=>timestamp(slot)>cutoff);
    if(!candidates.length)return{count:0};
    const records={...(store.internalAuthorityRecords||{})};
    for(const[key,record]of Object.entries(legacy?.internalAuthorityRecords||{})){
      if(Object.prototype.hasOwnProperty.call(records,key)&&stable(records[key])!==stable(record))throw fail('SAVE_STORAGE_RECOVERY_AUTHORITY_CONFLICT');
      if(!Object.prototype.hasOwnProperty.call(records,key))records[key]=record;
    }
    const rows=new Map(store.slots.map(slot=>[String(slot?.id||''),slot]));
    let recovered=0;
    for(const slot of candidates){
      const id=String(slot?.id||'');
      if(!id||!slot?.snapshot||typeof slot.snapshot!=='object')throw fail('SAVE_STORAGE_RECOVERY_SOURCE_INVALID');
      const prior=rows.get(id);
      if(prior&&stable(prior)===stable(slot))continue;
      let next=slot;
      if(prior){
        const fingerprint=String(slot.snapshot.integrity?.checksum||slot.checksum||checksum(slot.snapshot));
        const recoveredId=`recovered:${id}:${fingerprint}:${timestamp(slot)}`;
        next={...slot,id:recoveredId,recoveredFromId:id};
        const existing=rows.get(recoveredId);
        if(existing){if(stable(existing)!==stable(next))throw fail('SAVE_STORAGE_RECOVERY_SLOT_CONFLICT');continue;}
      }
      rows.set(String(next.id),next);recovered++;
    }
    if(!recovered)return{count:0};
    const merged={...store,slots:[...rows.values()],...(Object.keys(records).length?{internalAuthorityRecords:records}:{})};
    await adapter.setStore(merged);
    // Verify structured rows without constructing the complete catalog JSON.
    // Keep the original legacy payload until this durable verification succeeds.
    const {internalAuthorityRecords,...envelope}={...merged,slots:[]};
    if(internalAuthorityRecords)envelope.internalAuthorityRecords=internalAuthorityRecords;
    await adapter.verifyImportedStore(rows,envelope,Number(merged.version)||SAVE_SCHEMA,rows.size);
    return{count:recovered,cutoff};
  }
  api.ready=(async()=>{
    markMigration('detection');
    if(!root.IndexedDbSaveStorageAdapter){await migrateInternalStorage();return{backend:'localStorage'};}
    let authoritativeDatabase=false,recoveredLegacySlots=0;
    try{
      const hook=(point,details={})=>{if(typeof root.__SAVE_STORAGE_MIGRATION_QA_HOOK==='function')root.__SAVE_STORAGE_MIGRATION_QA_HOOK(String(point),details);};
      const legacyRaw=root.localStorage.getItem(STORE_KEY),authority=root.localStorage.getItem('save_storage_authority_v1');
      const adapter=await root.IndexedDbSaveStorageAdapter.open(root.localStorage);
      markMigration('database_open');
      const phase=adapter.migrationState?.phase,certified=['verified','legacy_cleanup_complete'].includes(phase);
      authoritativeDatabase=authority==='indexedDB'||certified;
      if(authoritativeDatabase){
        validateIndexedDbAuthority(adapter);
        storageAdapter=adapter;
        const recovered=await recoverNewLegacySlots(adapter,legacyRaw);recoveredLegacySlots=recovered.count;
        if(authority==='indexedDB'&&phase==='legacy_cleanup_complete'){
          await migrateInternalStorage();
          root.localStorage.removeItem(STORE_KEY);
          markMigration('complete');
          return{backend:'indexedDB',migrated:false,idempotent:recovered.count===0,recoveredLegacySlots:recovered.count,count:adapter.slots.length,phase:'legacy_cleanup_complete'};
        }
      }else{
        root.localStorage.setItem('save_storage_migration_state_v2',JSON.stringify({version:1,phase:'copying',at:Date.now()}));
        await adapter.importLegacy(legacyRaw);
        markMigration('copy');
        const verified=adapter.getStore();
        if(!verified||!Array.isArray(verified.slots)||adapter.migrationState?.phase!=='verified')throw fail('SAVE_STORAGE_MIGRATION_VERIFY_FAILED');
        validateIndexedDbAuthority(adapter);
        authoritativeDatabase=true;
        markMigration('verification');
        hook('after_verification_before_authority',{verified:verified.slots.length});
      }
      // The durable verification certificate survives missing localStorage
      // markers and interrupted cleanup. Never re-import stale legacy data.
      root.localStorage.setItem('save_storage_authority_v1','indexedDB');
      root.localStorage.setItem('save_storage_migration_state_v2',JSON.stringify({version:1,phase:'indexeddb_authoritative',at:Date.now()}));
      storageAdapter=adapter;
      markMigration('authority');
      hook('after_authority_before_legacy_cleanup',{verified:adapter.slots.length});
      await migrateInternalStorage();
      root.localStorage.removeItem(STORE_KEY);
      hook('before_legacy_cleanup_completion',{verified:adapter.slots.length});
      if(adapter.migrationState?.phase!=='legacy_cleanup_complete')await adapter.setMigrationState('legacy_cleanup_complete',{count:adapter.slots.length});
      root.localStorage.setItem('save_storage_migration_state_v2',JSON.stringify({version:1,phase:'legacy_cleanup_complete',at:Date.now()}));
      markMigration('complete');
      return{backend:'indexedDB',migrated:!certified&&authority!=='indexedDB'&&legacyRaw!=null,idempotent:(certified||authority==='indexedDB')&&recoveredLegacySlots===0,recoveredLegacySlots,count:adapter.slots.length,phase:'legacy_cleanup_complete'};
    }catch(error){
      markMigration('failed');
      const message=String(error?.code||error?.message||error),authority=root.localStorage.getItem('save_storage_authority_v1');
      if(authoritativeDatabase||authority==='indexedDB'){
        storageAdapter=new DegradedIndexedDbStorageAdapter(root.localStorage,message);
        root.__SAVE_STORAGE_DEGRADED={code:'INDEXEDDB_AUTHORITY_UNREADABLE',authority:'indexedDB',backend:storageAdapter.backend,error:message,at:Date.now()};
        try{root.dispatchEvent(new CustomEvent('game:storage-degraded',{detail:clone(root.__SAVE_STORAGE_DEGRADED)}));}catch{}
        try{console.error('[SaveSystem] authoritative IndexedDB unavailable',message);}catch{}
        return{backend:storageAdapter.backend,degraded:true,code:'INDEXEDDB_AUTHORITY_UNREADABLE',error:message};
      }
      try{console.error('[SaveSystem] IndexedDB migration deferred',message);}catch{}
      return{backend:'localStorage',error:message};
    }
  })();
  // Catalog scenes may mount while IndexedDB hydrates cooperatively. Publish
  // the authoritative inventory once ready so early reads refresh in place.
  api.ready.then(emit);
  ensureHeadroom();
})(typeof window!=='undefined'?window:globalThis);
