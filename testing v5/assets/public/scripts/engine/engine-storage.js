(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.EngineStorage=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const STATE_KEY='intercepted_engine_state_v4';
  const JOURNAL_KEY='intercepted_engine_journal_v4';
  const STABLE_KEY='intercepted_engine_stable_revision_v4';
  const RECEIPT_KEY_PREFIX='intercepted_engine_command_receipt_v5:';
  const RECEIPT_INDEX_PREFIX='intercepted_engine_command_index_v1:';
  const MESSAGE_DELTA_PREFIX='intercepted_engine_message_delta_v1:';
  const HEADROOM_KEY='intercepted_storage_headroom_v1';
  const PRESSURE_VERSION_KEY='intercepted_storage_pressure_compaction_v1';
  const persistenceStorageFullError=(cause,phase)=>{const error=new Error(String(cause?.message||'Persistent storage is full'),{cause});error.name='PersistenceStorageError';error.code='PERSISTENCE_STORAGE_FULL';error.domCode=cause?.code;error.enginePersistencePhase=phase||'wal_prepare';error.originalErrorName=String(cause?.name||'Error');return error;};
  const PROTECTED=[/^intercepted_engine_/,/^pending_story_v1$/, /^conv_progress_/, /^conv_done_/, /^once_/, /^active_character:/, /^character_route_/, /^choices_log_v1$/, /^conversations$/, /^notifications/, /^feature_onlyfun_unlocked$/, /^onlyfun_(signed_in|creators_v1|accounts_v1|subscriptions(?:_v1)?|posts_v1|seen_posts_v1|seeded_v1|pending_gates_v1)$/, /^(?:gallery_photos|savedPhotos|gallery_full_unlock_v1)$/];
  const stableStringify=(v)=>{if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(stableStringify).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stableStringify(v[k])).join(',')+'}';};
  // Dirty-domain persistence (perf): mirrorCompatKeys runs after EVERY
  // single canonical commit (even a plain text message that touches only
  // conversations/execution), and unconditionally re-serialized+rewrote
  // EVERY legacy compatibility key for EVERY domain -- HAK (~15 keys),
  // OnlyFun (~10 keys), Card Vault (the full domain JSON written to TWO
  // keys independently), Gallery, every once_ key ever set (strictly
  // additive -- by late game this can be 100+ redundant identical writes
  // per commit), and every active_character: key -- regardless of whether
  // that domain changed. Measured live (CDP JS profiler, 50-click rapid-
  // input burst): synchronous localStorage.setItem calls alone accounted
  // for ~500ms of a 10.7s burst, a large fraction of it here. These keys
  // are exclusively engine-written (verified: no other file in the
  // codebase writes to any of them -- see the per-domain "compatibility
  // projection, never authority" comments below, already established
  // conventions this fix relies on but does not introduce), so a same-
  // instance cache of "last value actually written" can safely skip a
  // write whose value is unchanged: the on-disk value is guaranteed to
  // already match, by the same invariant that made caching this even
  // possible. cache is undefined-safe (defaults fresh) so a caller that
  // doesn't have one yet still gets fully-correct, just uncached, output.
  function mirrorCompatKeys(storage,state,cache){try{
    cache=cache&&typeof cache==='object'?cache:{blobs:{},onceKeysWritten:new Set(),activeCharSig:null};
    // A committed fresh reset must also retire the previous playthrough's
    // compatibility markers. They are projections, never reset authority.
    // Keep the save store, collection/achievement records, identity/settings
    // and access-code ledgers; only story-scoped keys are eligible here.
    const resetId=String(state.playthrough?.id||'');
    if(String(state.initialization?.token||'').startsWith('reset:')&&state.initialization?.status==='READY_IDLE'&&
        !state.execution?.lease&&!(state.progression?.onceKeys||[]).length&&cache.resetPlaythroughId!==resetId){
      const exact=new Set(['conv_boot_done','story_prologue_done','conversations','choices_log_v1','notifications',
        'pending_story_v1','pending_chain_story_v1','pending_story_lock_v1','pending_outbound_v1','pending_interaction_v1',
        'story_runtime_v1','story_play_history_v1','story_play_current_v1','story_choice_rewinds_v1','story_replays_v1',
        'guided_cues_v1','todos_v1','app_badges_v1','home_pop_app_v1','feature_meetandgreet_unlocked',
        '__cinematic_lock_v1','premium_blocked_story_v1',
        'openConversationId','activeConversationId','__boot_from_save','__boot_intent_v1','__boot_dayload_v1','__chapter_load_mode']);
      const prefix=/^(?:once_|__once:|conv_(?:progress_|done_|episode_|lastEpisode_|if_decisions_|story_|oncomplete_|chain_|needsPlayer_|unread_)|hint_player_starts_|pending_player_first_done_v1::|route_|character_route_|active_character:|hak_|onlyfun_|meetandgreet_|contact_avatar_unlocked_)/;
      const stale=[];for(let i=0;i<Number(storage.length||0);i++){const key=String(storage.key(i)||'');if(exact.has(key)||prefix.test(key)||/^story_.+_done$/i.test(key))stale.push(key);}
      for(const key of stale)storage.removeItem(key);
      cache.blobs={};cache.onceKeysWritten=new Set();cache.activeCharSig=null;cache.resetPlaythroughId=resetId;
    }
    cache.blobs=cache.blobs||{};
    cache.onceKeysWritten=cache.onceKeysWritten||new Set();
    const setIfChanged=(key,value)=>{if(cache.blobs[key]===value)return;storage.setItem(key,value);cache.blobs[key]=value;};
    const removeIfChanged=(key)=>{if(cache.blobs[key]===null)return;storage.removeItem(key);cache.blobs[key]=null;};

    const active=new Set((state.world&&Array.isArray(state.world.activeCharacters))?state.world.activeCharacters:[]);
    const activeCharSig=JSON.stringify([...active].sort());
    if(cache.activeCharSig!==activeCharSig){
      const known=new Set(active);const len=storage.length||0;
      for(let i=0;i<len;i++){const k=storage.key(i);if(k&&k.indexOf('active_character:')===0)known.add(k.slice('active_character:'.length));}
      known.forEach(id=>{if(id)setIfChanged('active_character:'+id,active.has(id)?'1':'0');});
      cache.activeCharSig=activeCharSig;
    }
    const once=(state.progression&&Array.isArray(state.progression.onceKeys))?state.progression.onceKeys:[];
    // Strictly additive (once-set keys are never cleared) -- a key already
    // confirmed written never needs rewriting, so track membership instead
    // of re-diffing a growing array's JSON every commit.
    for(const key of once){if(key&&!cache.onceKeysWritten.has(key)){storage.setItem('once_'+key,'1');cache.onceKeysWritten.add(key);}}
    // progression.conversationsCache is the canonical authority (written only
    // via SET_CONVERSATIONS_CACHE, dispatched exclusively from
    // scripts/notify-adapter.js's persistConversationsCache). Mirroring it to
    // the legacy "conversations" key here -- the same read-never-authority
    // pattern already used for once_/active_character: above -- keeps the
    // numerous pre-existing readers across the renderer (scenes/home.html,
    // scenes/conversation.html, scenes/snapgram.html, scenes/settings.html,
    // main.js, ...) working without each needing an individual migration.
    // Only contact metadata is mirrored. Every direct reader of this key
    // (home unfinished cue, snapgram/story name+avatar, main.js unread)
    // uses metadata; message history is served from canonical events via
    // Game.readConversationStore. Mirroring the full message projection
    // stored the whole transcript a third time on Android's 5 MiB budget.
    if(state.progression&&state.progression.conversationsCache&&typeof state.progression.conversationsCache==='object'&&!Array.isArray(state.progression.conversationsCache)){
      const metadata={};
      for(const [cid,row] of Object.entries(state.progression.conversationsCache)){
        if(row&&typeof row==='object'&&!Array.isArray(row)){const {messages,...meta}=row;metadata[cid]=meta;}else metadata[cid]=row;
      }
      setIfChanged('conversations',JSON.stringify(metadata));
    }
    // Feature 6: HAK legacy keys are compatibility projections only. The
    // canonical domain is state.hak; existing scenes may keep reading these
    // keys while their presentation code is migrated, but engine commits are
    // the only source that refreshes their semantic values.
    const hak=state.hak;
    if(hak&&typeof hak==='object'){
      setIfChanged('feature_hak_unlocked',hak.unlocked?'1':'0');
      setIfChanged('feature_hak_visible',hak.visible?'1':'0');
      setIfChanged('feature_hak_openable',hak.openable?'1':'0');
      setIfChanged('feature_hak_open',hak.openable?'1':'0');
      setIfChanged('hak_level',String(Math.max(0,Number(hak.level)||0)));
      setIfChanged('hak_evidence_v1',JSON.stringify(hak.evidenceProfiles||{}));
      setIfChanged('hak_photos_v1',JSON.stringify(hak.photos||[]));
      setIfChanged('hak_evidence_seen_v1',JSON.stringify(hak.evidenceSeen||{}));
      if(hak.watchlist?.configured){
        setIfChanged('hak_watchlist_v1',JSON.stringify({selected:hak.watchlist.selected||[],updatedAt:Number(state.revision)||0,source:'canonical_hak'}));
        setIfChanged('hak_watchlist_v1_selected',JSON.stringify(hak.watchlist.selected||[]));
        setIfChanged('hak_targets_v1',JSON.stringify(hak.watchlist.targets||{}));
        setIfChanged('hak_character_selection_done_v1','1');
        if(hak.watchlist.config)setIfChanged('hak_character_selection_config_v1',JSON.stringify(hak.watchlist.config));else removeIfChanged('hak_character_selection_config_v1');
      }else{
        removeIfChanged('hak_watchlist_v1');
        removeIfChanged('hak_watchlist_v1_selected');
        removeIfChanged('hak_targets_v1');
        removeIfChanged('hak_character_selection_done_v1');
        removeIfChanged('hak_character_selection_config_v1');
      }
      setIfChanged('hak_skills_v1',JSON.stringify(hak.skills||{unlocked:{}}));
      setIfChanged('route_points_v1',JSON.stringify(hak.routePoints||{nts:0,ntr:0,love:0}));
      setIfChanged('hak_tutorial_required',hak.tutorial?.required?'1':'0');
      setIfChanged('hak_app_tutorial_done',hak.tutorial?.completed?'1':'0');
      setIfChanged('hak_app_tutorial_state_v1',String(hak.tutorial?.state||'evidence'));
      if(hak.tutorial?.resumeTarget)setIfChanged('hak_tutorial_resume_target_v1',JSON.stringify(hak.tutorial.resumeTarget));else removeIfChanged('hak_tutorial_resume_target_v1');
      if(hak.gate)setIfChanged('hak_gate_v1',JSON.stringify(hak.gate));else removeIfChanged('hak_gate_v1');
    }
    // Feature 7: OnlyFun legacy keys are read-only compatibility projections.
    const onlyfun=state.onlyfun;
    if(onlyfun&&typeof onlyfun==='object'){
      setIfChanged('feature_onlyfun_unlocked',onlyfun.unlocked?'1':'0');
      setIfChanged('onlyfun_signed_in',onlyfun.signedIn?'1':'0');
      setIfChanged('onlyfun_creators_v1',JSON.stringify({creators:onlyfun.creators||{}}));
      setIfChanged('onlyfun_accounts_v1',JSON.stringify({accounts:onlyfun.accounts||{}}));
      setIfChanged('onlyfun_subscriptions_v1',JSON.stringify({subs:onlyfun.subscriptions||{}}));
      setIfChanged('onlyfun_subscriptions',JSON.stringify({subs:onlyfun.subscriptions||{}}));
      setIfChanged('onlyfun_posts_v1',JSON.stringify({posts:onlyfun.posts||[]}));
      setIfChanged('onlyfun_seen_posts_v1',JSON.stringify(onlyfun.seenPosts||{}));
      setIfChanged('onlyfun_pending_gates_v1',JSON.stringify(onlyfun.pendingGates||{}));
      const masonGate=Object.values(onlyfun.pendingGates||{}).some(gate=>String(gate?.startStory||gate?.storyPath||'').replace(/\\/g,'/').toLowerCase().includes('day1/day1_09_mason_warning.json'));
      if(masonGate)setIfChanged('onlyfun_d1_09_pending','1');else removeIfChanged('onlyfun_d1_09_pending');
      setIfChanged('onlyfun_seeded_v1',onlyfun.migration?.seeded?'1':'0');
      const unseen=(onlyfun.posts||[]).reduce((count,post)=>{const creatorId=String(post?.creatorId||'').trim().toLowerCase(),postId=String(post?.id||'').trim();return count+(creatorId&&postId&&onlyfun.subscriptions?.[creatorId]&&onlyfun.seenPosts?.[postId]!==true?1:0);},0);
      // app_badges_v1 is shared across apps (not onlyfun-exclusive), so it
      // must stay a genuine read-modify-write -- only the final setItem is
      // dirty-gated, against the same key's own last-written value.
      const badges=(()=>{try{return JSON.parse(storage.getItem('app_badges_v1')||'{}');}catch{return {};}})();
      if(unseen>0)badges.onlyfun=unseen;else delete badges.onlyfun;
      // Messages is projected from canonical unread, never from the
      // rebuildable conversation cache (which can be empty for a new contact).
      const messagesUnread=Object.values(state.conversations?.unreadByContact||{}).reduce((sum,value)=>sum+Math.max(0,Number(value)||0),0);
      if(messagesUnread>0)badges.messages=messagesUnread;else delete badges.messages;
      setIfChanged('app_badges_v1',JSON.stringify(badges));
    }
    // Feature 8: Card Vault is canonical meta progression. These sealed legacy
    // keys are projections for old UI/build compatibility and never authority.
    const cardVault=state.cardVault;
    if(cardVault&&typeof cardVault==='object'){
      const cardVaultJson=JSON.stringify(cardVault);
      setIfChanged('card_vault_state_v1',cardVaultJson);
      setIfChanged('card_vault_state_backup_v1',cardVaultJson);
      setIfChanged('card_vault_support_tier_rank_v1',String(Math.max(0,Number(cardVault.supportTierRank)||0)));
    }
    // Feature 9: Gallery is canonical global/meta progression. Raw-path rows
    // remain a compatibility projection for the existing Gallery renderer.
    const gallery=state.gallery;
    if(gallery&&typeof gallery==='object'){
      const rowsJson=JSON.stringify(Object.values(gallery.owned||{}));
      setIfChanged('gallery_photos',rowsJson);
      setIfChanged('savedPhotos',rowsJson);
      if(gallery.fullUnlock)setIfChanged('gallery_full_unlock_v1','1');else removeIfChanged('gallery_full_unlock_v1');
    }
    // pending_story_v1 is listed in PROTECTED (below) and read directly by
    // legacy call sites (index.html's Game.autoResumePendingStory/
    // resumePendingStory-adjacent helpers, readPendingContactId, several
    // scenes/*.html readers) as their pendingStory source -- but nothing
    // ever wrote it here, so it was permanently empty/stale from the moment
    // the canonical SET_PENDING_STORY/CLEAR_PENDING_STORY reducer path
    // (scripts/convo-runtime.js's writePendingStory/clearPendingStory)
    // became the sole writer of progression.pendingStory. Every reader of
    // this key was silently dead: autoResumePendingStory's very first line
    // (`if (!rawPending) return false`) rejected before ever reaching its
    // navigationPolicy/scene gates, regardless of what those gates allowed.
    // Mirror it the same way active_character:/conversations already are.
    const pendingStory=state.progression&&state.progression.pendingStory;
    if(pendingStory&&typeof pendingStory==='object'){
      setIfChanged('pending_story_v1',JSON.stringify(pendingStory));
    }else{
      removeIfChanged('pending_story_v1');
    }
    // Same rationale/pattern as pending_story_v1 immediately above: a
    // generic canonical player-facing interaction boundary (see
    // SET_PENDING_INTERACTION/CLEAR_PENDING_INTERACTION in
    // game-state-engine.js) mirrored to a legacy-style compat key in case
    // anything ever needs to read it without going through the engine.
    const pendingInteraction=state.progression&&state.progression.pendingInteraction;
    if(pendingInteraction&&typeof pendingInteraction==='object'){
      setIfChanged('pending_interaction_v1',JSON.stringify(pendingInteraction));
    }else{
      removeIfChanged('pending_interaction_v1');
    }
  }catch{}}
  const checksum=(value)=>{const s=typeof value==='string'?value:stableStringify(value);let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,'0');};
  // ---- Segmented transcript persistence (Android localStorage budget) ----
  // Android WebView charges two bytes per localStorage character against a
  // 10 MiB origin area (5,242,880 code units, measured on API 36 / WebView
  // 149). The inline format stored every conversation event up to four
  // times: canonical events, conversationsCache messages, the legacy
  // `conversations` mirror, and a state-sized WAL written beside the prior
  // state on every non-message commit. Natural play therefore reached
  // PERSISTENCE_STORAGE_FULL long before the end of the chapter.
  // Each contact transcript is append-only in practice, so every complete
  // 64-event prefix block is stored once in an immutable, content-addressed,
  // compressed key written BEFORE the WAL. The head (STATE_KEY and the WAL)
  // references those keys and keeps only the open tail, so a commit journals
  // O(head) instead of O(transcript). Contacts with fewer than 64 events are
  // stored exactly as before, and a head without the marker below is the
  // unchanged legacy format.
  const SEGMENT_PREFIX='intercepted_engine_events_v1:';
  const SEGMENT_SIZE=64;
  const PERSISTENCE_KEY='__persistence';
  const persistenceError=(code,detail)=>Object.assign(new Error(code+(detail?' '+detail:'')),{name:'EnginePersistenceError',code});
  // Lossless LZW codec for immutable segments. Each output code unit carries
  // 15 payload bits in U+0020..U+801F (never a surrogate or C0 control).
  // Codes 0/1 introduce an 8/16-bit literal, 2 ends the stream, and every
  // code width derives from the decoder's own dictionary size. Every encoded
  // value is additionally decoded and compared before it is ever written.
  const CODEC_OFFSET=32,CODEC_BITS=15,CODEC_RESERVED=3;
  const codecWidth=n=>32-Math.clz32(n);
  function codecCompress(input){
    const text=String(input),dict=new Map(),pendingLiteral=new Set(),out=[];
    let next=CODEC_RESERVED,tokens=0,literals=0,acc=0,accBits=0,w='';
    const write=(value,bits)=>{for(let b=bits-1;b>=0;b--){acc=(acc<<1)|((value>>>b)&1);if(++accBits===CODEC_BITS){out.push(String.fromCharCode(acc+CODEC_OFFSET));acc=0;accBits=0;}}};
    const width=()=>codecWidth(CODEC_RESERVED+literals+Math.max(0,tokens-1));
    const emit=token=>{const bits=width();if(pendingLiteral.has(token)){const code=token.charCodeAt(0);if(code<256){write(0,bits);write(code,8);}else{write(1,bits);write(code,16);}pendingLiteral.delete(token);literals++;}else write(dict.get(token),bits);tokens++;};
    for(let i=0;i<text.length;i++){const c=text.charAt(i);if(!dict.has(c)){dict.set(c,next++);pendingLiteral.add(c);}const wc=w+c;if(dict.has(wc)){w=wc;continue;}emit(w);dict.set(wc,next++);w=c;}
    if(w!=='')emit(w);
    write(2,width());
    if(accBits>0)out.push(String.fromCharCode((acc<<(CODEC_BITS-accBits))+CODEC_OFFSET));
    return out.join('');
  }
  function codecDecompress(packed){
    const data=String(packed),dict=['','',''],out=[];let pos=0,acc=0,accBits=0,prev=null;
    const read=bits=>{let value=0;for(let b=0;b<bits;b++){if(accBits===0){if(pos>=data.length)throw persistenceError('ENGINE_SEGMENT_CORRUPT','truncated');acc=data.charCodeAt(pos++)-CODEC_OFFSET;if(acc<0||acc>=32768)throw persistenceError('ENGINE_SEGMENT_CORRUPT','unit');accBits=CODEC_BITS;}accBits--;value=(value<<1)|((acc>>>accBits)&1);}return value;};
    for(;;){
      const code=read(codecWidth(dict.length));if(code===2)break;
      let entry;
      if(code===0||code===1){entry=String.fromCharCode(read(code===0?8:16));dict.push(entry);}
      else if(code<dict.length)entry=dict[code];
      else if(code===dict.length&&prev!==null)entry=prev+prev.charAt(0);
      else throw persistenceError('ENGINE_SEGMENT_CORRUPT','code');
      out.push(entry);if(prev!==null)dict.push(prev+entry.charAt(0));prev=entry;
    }
    if(pos!==data.length||(accBits>0&&(acc&((1<<accBits)-1))!==0))throw persistenceError('ENGINE_SEGMENT_CORRUPT','trailing');
    return out.join('');
  }
  function encodeSegmentValue(raw){let packed=null;try{packed=codecCompress(raw);if(codecDecompress(packed)!==raw)packed=null;}catch{packed=null;}return packed!==null&&packed.length<raw.length?'z'+packed:'j'+raw;}
  function decodeSegmentValue(value){const text=String(value==null?'':value),tag=text.charAt(0);if(tag==='z')return codecDecompress(text.slice(1));if(tag==='j')return text.slice(1);throw persistenceError('ENGINE_SEGMENT_CORRUPT','encoding');}
  const segmentKeyFor=(raw,suffix)=>SEGMENT_PREFIX+checksum(raw)+':'+raw.length+(suffix?':'+suffix:'');
  function segmentMatches(key,raw){const parts=String(key).slice(SEGMENT_PREFIX.length).split(':');return parts[0]===checksum(raw)&&Number(parts[1])===raw.length;}
  // conversationsCache messages are the notify-adapter projection of
  // canonical events. A message equal to the projection of its (JSON-read)
  // event is rebuilt on read; any other message is kept verbatim, together
  // with the row's key order, so a head always inflates to the exact JSON of
  // the state that was committed.
  const jsonField=v=>v===undefined||typeof v==='function'||typeof v==='symbol'?undefined:(typeof v==='number'&&!Number.isFinite(v)?null:v);
  function projectedCacheMessage(event){
    const out={},put=(key,value)=>{const v=jsonField(value);if(v!==undefined)out[key]=v;};
    const eventId=jsonField(event.eventId),kind=jsonField(event.kind),stepIndex=jsonField(event.stepIndex);
    put('id',eventId);put('eventId',eventId);put('from',event.from);put('kind',kind==='message'?'text':kind);
    put('text',jsonField(event.text)||'');put('image',jsonField(event.assetId)||undefined);put('storyPath',jsonField(event.storyPath)||undefined);
    put('sourceStepIndex',Number.isFinite(Number(stepIndex))?Number(stepIndex):undefined);put('at',Number(jsonField(event.revision)||0));put('committed',true);
    return out;
  }
  function sameJsonRecord(actual,expected){
    if(!actual||typeof actual!=='object'||Array.isArray(actual))return false;
    const keys=Object.keys(expected);let i=0;
    for(const key of Object.keys(actual)){const v=jsonField(actual[key]);if(v===undefined)continue;if(keys[i]!==key)return false;if(v!==null&&typeof v==='object')return false;if(v!==expected[key])return false;i++;}
    return i===keys.length;
  }
  const visibleEvents=events=>{const out=[];for(const event of Array.isArray(events)?events:[])if(event&&event.visible!==false)out.push(event);return out;};
  function deriveCacheRow(row,events){
    if(!row||typeof row!=='object'||Array.isArray(row)||!Array.isArray(row.messages)||row.messages.length<SEGMENT_SIZE||!Array.isArray(events))return null;
    const messages=row.messages,first=messages[0],visible=visibleEvents(events);
    if(!first||typeof first!=='object'||first.eventId==null)return null;
    let start=-1;for(let i=0;i<visible.length;i++)if(jsonField(visible[i].eventId)===first.eventId){start=i;break;}
    if(start<0||start+messages.length>visible.length)return null;
    const overrides={};let overrideCount=0;
    for(let i=0;i<messages.length;i++){const m=messages[i];if(!m||typeof m!=='object'||Array.isArray(m))return null;if(!sameJsonRecord(m,projectedCacheMessage(visible[start+i]))){overrides[i]=m;overrideCount++;}}
    if(overrideCount*4>messages.length)return null;
    const keys=Object.keys(row).filter(key=>jsonField(row[key])!==undefined),rest={};
    for(const key of keys)if(key!=='messages')rest[key]=row[key];
    return {row:rest,meta:{start,count:messages.length,position:keys.indexOf('messages'),...(overrideCount?{overrides}:{})}};
  }
  function rehydrateCacheRow(row,meta,events){
    const start=Number(meta?.start),count=Number(meta?.count),visible=visibleEvents(events);
    if(!row||typeof row!=='object'||!Number.isInteger(start)||!Number.isInteger(count)||start<0||start+count>visible.length)throw persistenceError('ENGINE_CACHE_DERIVATION_CORRUPT');
    const overrides=meta.overrides&&typeof meta.overrides==='object'?meta.overrides:{},messages=new Array(count);
    for(let i=0;i<count;i++)messages[i]=Object.prototype.hasOwnProperty.call(overrides,i)?overrides[i]:projectedCacheMessage(visible[start+i]);
    const out={};let placed=false;
    Object.keys(row).forEach((key,index)=>{if(index===meta.position){out.messages=messages;placed=true;}out[key]=row[key];});
    if(!placed)out.messages=messages;
    return out;
  }
  // Pure: builds the persisted head for `state` and the segment writes it
  // needs. Nothing is written and no cache is mutated here.
  function planPersistedHead(state,segmentCache,storage){
    const head={...state,progression:{...(state?.progression||{}),commandReceipts:{}}};
    const eventsByContact=state?.conversations?.eventsByContact,persistence={version:1,segments:{}},writes=[],refs=new Set(),nextCache=new Map();
    if(eventsByContact&&typeof eventsByContact==='object'&&!Array.isArray(eventsByContact)){
      const headEvents={};let segmented=false;
      for(const [cid,list] of Object.entries(eventsByContact)){
        if(!Array.isArray(list)||list.length<SEGMENT_SIZE){headEvents[cid]=list;continue;}
        const sealed=list.length-(list.length%SEGMENT_SIZE),cached=segmentCache?.get(cid)||[],keys=[],rows=[];
        for(let i=0,c=0;i<sealed;i+=SEGMENT_SIZE,c++){
          const raw=JSON.stringify(list.slice(i,i+SEGMENT_SIZE));
          let key=cached[c]&&cached[c].raw===raw&&storage.getItem(cached[c].key)!=null?cached[c].key:null;
          if(!key)key=resolveSegmentKey(raw,storage,writes);
          keys.push(key);refs.add(key);rows.push({key,raw});
        }
        persistence.segments[cid]=keys;nextCache.set(cid,rows);headEvents[cid]=list.slice(sealed);segmented=true;
      }
      if(segmented)head.conversations={...state.conversations,eventsByContact:headEvents};
    }
    const cache=head.progression.conversationsCache;
    if(cache&&typeof cache==='object'&&!Array.isArray(cache)&&eventsByContact&&typeof eventsByContact==='object'){
      let derivedAny=false;const rows={},derived={};
      for(const [cid,row] of Object.entries(cache)){const result=deriveCacheRow(row,eventsByContact[cid]);if(result){rows[cid]=result.row;derived[cid]=result.meta;derivedAny=true;}else rows[cid]=row;}
      if(derivedAny){head.progression={...head.progression,conversationsCache:rows};persistence.derivedCache=derived;}
    }
    if(Object.keys(persistence.segments).length||persistence.derivedCache)head[PERSISTENCE_KEY]=persistence;
    return {head,headJson:JSON.stringify(head),writes,refs,nextCache};
  }
  function resolveSegmentKey(raw,storage,writes){
    for(let suffix=0;suffix<16;suffix++){
      const key=segmentKeyFor(raw,suffix),pending=writes.find(row=>row.key===key);
      if(pending){if(pending.raw===raw)return key;continue;}
      const existing=storage.getItem(key);
      if(existing==null){writes.push({key,raw,value:encodeSegmentValue(raw)});return key;}
      let decoded=null;try{decoded=decodeSegmentValue(existing);}catch{}
      // Shared content (for example a restored save of this playthrough).
      // A different value under this key belongs to someone else: never
      // overwrite a segment another head may reference.
      if(decoded===raw)return key;
    }
    throw persistenceError('ENGINE_SEGMENT_KEY_EXHAUSTED');
  }
  // Inflates a persisted head into the exact committed state. A missing or
  // corrupt segment fails closed: silently booting without history would
  // let the next commit overwrite the player's real progression.
  function inflatePersistedHead(head,storage,primeCache){
    if(!head||typeof head!=='object'||!head[PERSISTENCE_KEY])return head;
    const persistence=head[PERSISTENCE_KEY];
    if(Number(persistence?.version)!==1)throw persistenceError('ENGINE_PERSISTENCE_FORMAT_UNSUPPORTED',String(persistence?.version));
    const state={...head};delete state[PERSISTENCE_KEY];
    const segments=persistence.segments&&typeof persistence.segments==='object'?persistence.segments:{};
    if(Object.keys(segments).length){
      const conversations={...(state.conversations||{})},events={...(conversations.eventsByContact||{})};
      for(const [cid,keys] of Object.entries(segments)){
        const out=[],rows=[];
        for(const key of Array.isArray(keys)?keys:[]){
          const value=storage.getItem(key);if(value==null)throw persistenceError('ENGINE_SEGMENT_MISSING',key);
          const raw=decodeSegmentValue(value);if(!segmentMatches(key,raw))throw persistenceError('ENGINE_SEGMENT_CORRUPT',key);
          const chunk=JSON.parse(raw);if(!Array.isArray(chunk)||chunk.length!==SEGMENT_SIZE)throw persistenceError('ENGINE_SEGMENT_CORRUPT',key);
          for(const event of chunk)out.push(event);rows.push({key,raw});
        }
        const tail=events[cid];if(tail!=null&&!Array.isArray(tail))throw persistenceError('ENGINE_SEGMENT_CORRUPT','tail '+cid);
        if(Array.isArray(tail))for(const event of tail)out.push(event);
        events[cid]=out;if(primeCache)primeCache.set(cid,rows);
      }
      conversations.eventsByContact=events;state.conversations=conversations;
    }
    if(persistence.derivedCache&&typeof persistence.derivedCache==='object'){
      const cache={...(state.progression?.conversationsCache||{})},events=state.conversations?.eventsByContact||{};
      for(const [cid,meta] of Object.entries(persistence.derivedCache))cache[cid]=rehydrateCacheRow(cache[cid],meta,events[cid]);
      state.progression={...(state.progression||{}),conversationsCache:cache};
    }
    return state;
  }
  // Read-only reconstruction for tooling (QA inventories, diagnostics).
  function readPersistedHeadFrom(storage){let head=null;try{head=JSON.parse(storage.getItem(STATE_KEY)||'null');}catch{return null;}return head?inflatePersistedHead(head,storage,null):null;}
  const isQuotaError=error=>error?.name==='QuotaExceededError'||Number(error?.code)===22||Number(error?.code)===1014||error?.code==='NS_ERROR_DOM_QUOTA_REACHED';
  const receiptStorageKey=(playthroughId,commandId)=>RECEIPT_KEY_PREFIX+encodeURIComponent(String(playthroughId||'legacy'))+':'+encodeURIComponent(String(commandId||''));
  // A restored save is a new command-history branch within the same player
  // playthrough. Legacy states keep their old namespace until their first
  // restore; new branches retain an immutable link to their own receipt set.
  const receiptLedgerId=state=>String(state?.playthrough?.id||'legacy')+(state?.execution?.commandReceiptScope?'@'+String(state.execution.commandReceiptScope):'');
  const compactStateForStorage=(state)=>({...state,progression:{...(state?.progression||{}),commandReceipts:{}}});
  const serializeCompactState=(state)=>JSON.stringify(compactStateForStorage(state));
  function canonicalMessageDeltaEvent(event){
    if(!event||event.type!=='conversation:event-committed')return event;
    if(event.duplicate===true)return null;
    // Delta payloads retain the command receipt envelope for WAL recovery.
    // Its transport discriminator is not part of the committed transcript.
    const {type,duplicate,...canonical}=event;
    return canonical;
  }
  const byteSize=(key,value)=>2*(String(key||'').length+String(value||'').length);
  const REBUILDABLE_COMPAT_KEYS=['conversations','hak_evidence_v1','hak_photos_v1','hak_evidence_seen_v1','hak_watchlist_v1','hak_watchlist_v1_selected','hak_targets_v1','hak_skills_v1','route_points_v1','hak_gate_v1','onlyfun_creators_v1','onlyfun_accounts_v1','onlyfun_subscriptions_v1','onlyfun_subscriptions','onlyfun_posts_v1','onlyfun_seen_posts_v1','onlyfun_pending_gates_v1','card_vault_state_v1','card_vault_state_backup_v1','gallery_photos','savedPhotos'];
  // Reclaim only data whose authority is provably elsewhere. Player saves,
  // progression, unlocks, choices, entitlements and canonical domains are
  // intentionally absent. The operation is idempotent and allocation-light.
  function reclaimStoragePressure(storage,state){const removed=[];let releasedBytes=0;const remove=(key,kind)=>{try{const value=storage.getItem(key);if(value==null)return;const bytes=byteSize(key,value);storage.removeItem(key);releasedBytes+=bytes;removed.push({key,kind,bytes});}catch{}};remove(HEADROOM_KEY,'emergency_reserve');if(state&&typeof state==='object')for(const key of REBUILDABLE_COMPAT_KEYS)remove(key,'canonical_projection');const pid=receiptLedgerId(state),indexKey=RECEIPT_INDEX_PREFIX+encodeURIComponent(pid);let index=null;try{index=JSON.parse(storage.getItem(indexKey)||'null')}catch{}const indexed=new Set(Array.isArray(index?.commandIds)?index.commandIds.map(String):[]),prefix=RECEIPT_KEY_PREFIX+encodeURIComponent(pid)+':',keys=[];try{for(let i=0;i<Number(storage.length||0);i++){const key=String(storage.key(i)||'');if(key.startsWith(prefix))keys.push(key);}}catch{}for(const key of keys){let envelope=null;try{envelope=JSON.parse(storage.getItem(key)||'null')}catch{}if(envelope?.commandId&&indexed.has(String(envelope.commandId)))remove(key,'indexed_receipt_detail');}try{storage.setItem(PRESSURE_VERSION_KEY,JSON.stringify({version:1,at:new Date().toISOString(),releasedBytes,removedCount:removed.length}));}catch{}return{releasedBytes,removed};}
  class MemoryStorage{constructor(seed){this.data=new Map(Object.entries(seed||{}));}getItem(k){return this.data.has(k)?this.data.get(k):null;}setItem(k,v){this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}key(i){return [...this.data.keys()][i]??null;}get length(){return this.data.size;}}
  class EngineStorage{
    constructor(storage,opts={}){this.storage=storage||new MemoryStorage();this.failureHook=opts.failureHook||null;this.telemetryEnabled=opts.telemetryEnabled===true;this.receiptLedgersMigrated=new Set;this.receiptsSinceCompaction=0;this.receiptCompactionScheduled=false;this.pendingReceiptCompactionState=null;this.mirrorScheduled=false;this.pendingMirrorState=null;this.lastCommitTimings=null;this.segmentCache=new Map();this.lastSegmentRefsKey=null;
      // Persists for this instance's whole lifetime (one instance per app
      // session -- RESTORE_SAVE/RESET_PLAYTHROUGH mutate state in place,
      // they don't recreate the store), so mirrorCompatKeys' dirty-domain
      // skip stays correct across every call site that shares it below.
      this.mirrorCache={blobs:{},onceKeysWritten:new Set(),activeCharSig:null};}
    _stage(name,ctx){if(this.failureHook)this.failureHook(name,ctx);}
    _retirePreviousReceiptLedger(previous,next){
      // Retain the old branch until the new state and stable pointer commit.
      // Its receipt set is already sealed in any saved snapshot that needs
      // it again. Limit cleanup to this exact playthrough/previous scope.
      if(String(previous?.playthrough?.id||'')!==String(next?.playthrough?.id||''))return;
      const oldId=receiptLedgerId(previous),nextId=receiptLedgerId(next);
      if(oldId===nextId)return;
      const prefix=RECEIPT_KEY_PREFIX+encodeURIComponent(oldId)+':',keys=[];
      try{for(let i=0;i<Number(this.storage.length||0);i++){const key=String(this.storage.key(i)||'');if(key.startsWith(prefix))keys.push(key)}for(const key of keys)this.storage.removeItem(key);this.storage.removeItem(RECEIPT_INDEX_PREFIX+encodeURIComponent(oldId));this.receiptLedgersMigrated.delete(oldId);}catch{}
    }
    _receiptEnvelope(playthroughId,commandId,receipt,visibleAtRevision){return{version:1,playthroughId:String(playthroughId||'legacy'),commandId:String(commandId||''),nextRevision:Math.max(0,Number(receipt?.nextRevision)||0),visibleAtRevision:Math.max(0,Number(visibleAtRevision??receipt?.nextRevision)||0),receipt};}
    _writeReceipt(playthroughId,commandId,receipt,visibleAtRevision){if(!commandId||!receipt)return null;const key=receiptStorageKey(playthroughId,commandId),envelope=this._receiptEnvelope(playthroughId,commandId,receipt,visibleAtRevision),value=JSON.stringify(envelope);this.storage.setItem(key,value);return{key,value,envelope};}
    _messageDeltaKey(playthroughId,revision){return MESSAGE_DELTA_PREFIX+encodeURIComponent(String(playthroughId||'legacy'))+':'+String(Math.max(0,Number(revision)||0)).padStart(12,'0');}
    _applyMessageDeltas(state){if(!state||typeof state!=='object')return state;const pid=String(state.playthrough?.id||'legacy'),prefix=MESSAGE_DELTA_PREFIX+encodeURIComponent(pid)+':',stable=Math.max(Number(this.storage.getItem(STABLE_KEY))||0,Number(state.revision)||0),rows=[];try{for(let i=0;i<Number(this.storage.length||0);i++){const key=String(this.storage.key(i)||'');if(!key.startsWith(prefix))continue;let delta=null;try{delta=JSON.parse(this.storage.getItem(key)||'null')}catch{}if(delta&&Number(delta.nextRevision)>Number(state.revision)&&Number(delta.nextRevision)<=stable)rows.push({key,delta})}}catch{}rows.sort((a,b)=>Number(a.delta.nextRevision)-Number(b.delta.nextRevision));for(const{delta}of rows){if(Number(delta.previousRevision)!==Number(state.revision))continue;const cid=String(delta.contactId||''),event=canonicalMessageDeltaEvent(delta.event);if(cid&&event){const list=state.conversations.eventsByContact[cid]||(state.conversations.eventsByContact[cid]=[]);if(!list.some(row=>String(row?.eventId||'')===String(event.eventId||'')))list.push(event)}if(cid){if(delta.latestEventId)state.conversations.latestEventByContact[cid]=delta.latestEventId;state.conversations.unreadByContact[cid]=Math.max(0,Number(delta.unread)||0)}state.execution=delta.execution;state.recovery=delta.recovery;state.revision=Number(delta.nextRevision);state.transactionId=delta.transactionId||null;}return state;}
    _removeMessageDeltas(playthroughId,throughRevision){const prefix=MESSAGE_DELTA_PREFIX+encodeURIComponent(String(playthroughId||'legacy'))+':',limit=Math.max(0,Number(throughRevision)||0),keys=[];try{for(let i=0;i<Number(this.storage.length||0);i++){const key=String(this.storage.key(i)||'');if(key.startsWith(prefix)&&Number(key.slice(prefix.length))<=limit)keys.push(key)}for(const key of keys)this.storage.removeItem(key)}catch{}return keys.length;}
    _hydrateReceipts(state){if(!state||typeof state!=='object')return state;state.progression=state.progression&&typeof state.progression==='object'?state.progression:{};const embedded=state.progression.commandReceipts&&typeof state.progression.commandReceipts==='object'?state.progression.commandReceipts:{};const receipts={...embedded},playthroughId=receiptLedgerId(state),revision=Math.max(0,Number(state.revision)||0),prefix=RECEIPT_KEY_PREFIX+encodeURIComponent(playthroughId)+':',indexKey=RECEIPT_INDEX_PREFIX+encodeURIComponent(playthroughId);try{let index=null;try{index=JSON.parse(this.storage.getItem(indexKey)||'null')}catch{}for(const commandId of Array.isArray(index?.commandIds)?index.commandIds:[]){const key=String(commandId||'');if(key)receipts[key]={ok:true,status:'COMMITTED',commandId:key,previousRevision:0,nextRevision:0,events:[],error:null};}for(let i=0;i<Number(this.storage.length||0);i++){const key=String(this.storage.key(i)||'');if(!key.startsWith(prefix))continue;let envelope=null;try{envelope=JSON.parse(this.storage.getItem(key)||'null');}catch{}if(!envelope||String(envelope.playthroughId||'')!==playthroughId||!envelope.commandId||!envelope.receipt)continue;if(Number(envelope.visibleAtRevision??envelope.nextRevision??0)>revision)continue;receipts[String(envelope.commandId)]=envelope.receipt;}}catch{}state.progression.commandReceipts=receipts;return state;}
    _compactReceiptLedger(playthroughId,stableRevision){const pid=String(playthroughId||'legacy'),prefix=RECEIPT_KEY_PREFIX+encodeURIComponent(pid)+':',indexKey=RECEIPT_INDEX_PREFIX+encodeURIComponent(pid),ids=new Set,removable=[];let prior=null;try{prior=JSON.parse(this.storage.getItem(indexKey)||'null')}catch{}for(const commandId of Array.isArray(prior?.commandIds)?prior.commandIds:[])if(commandId)ids.add(String(commandId));for(let i=0;i<Number(this.storage.length||0);i++){const key=String(this.storage.key(i)||'');if(!key.startsWith(prefix))continue;let envelope=null;try{envelope=JSON.parse(this.storage.getItem(key)||'null')}catch{}if(!envelope?.commandId||Number(envelope.visibleAtRevision??envelope.nextRevision??0)>Number(stableRevision||0))continue;ids.add(String(envelope.commandId));removable.push(key);}if(!removable.length)return{compacted:0,count:ids.size};const payload=JSON.stringify({version:1,playthroughId:pid,stableRevision:Math.max(0,Number(stableRevision)||0),commandIds:[...ids].sort()});this.storage.setItem(indexKey,payload);let verified=null;try{verified=JSON.parse(this.storage.getItem(indexKey)||'null')}catch{}if(!verified||verified.playthroughId!==pid||!Array.isArray(verified.commandIds)||verified.commandIds.length!==ids.size)throw new Error('receipt index verification failed');for(const key of removable)this.storage.removeItem(key);return{compacted:removable.length,count:ids.size};}
    _scheduleReceiptCompaction(state,force=false){this.receiptsSinceCompaction++;this.pendingReceiptCompactionState=state;if(!force&&this.receiptsSinceCompaction<64)return;if(this.receiptCompactionScheduled)return;this.receiptCompactionScheduled=true;const enqueue=typeof queueMicrotask==='function'?queueMicrotask:(fn)=>Promise.resolve().then(fn);enqueue(()=>{this.receiptCompactionScheduled=false;this.receiptsSinceCompaction=0;const latest=this.pendingReceiptCompactionState;this.pendingReceiptCompactionState=null;try{this._compactReceiptLedger(receiptLedgerId(latest),latest?.revision)}catch{}});}
    _persistEmbeddedReceipts(state,force=false){const receipts=state?.progression?.commandReceipts||{},playthroughId=receiptLedgerId(state);if(!force&&this.receiptLedgersMigrated.has(playthroughId))return;const indexKey=RECEIPT_INDEX_PREFIX+encodeURIComponent(playthroughId);let prior=null;try{prior=JSON.parse(this.storage.getItem(indexKey)||'null')}catch{}if(!force&&prior?.playthroughId===playthroughId&&Array.isArray(prior.commandIds)){this.receiptLedgersMigrated.add(playthroughId);return;}const ids=new Set(Object.keys(receipts));for(const commandId of Array.isArray(prior?.commandIds)?prior.commandIds:[])if(commandId)ids.add(String(commandId));if(ids.size){const payload=JSON.stringify({version:1,playthroughId,stableRevision:Math.max(0,Number(state?.revision)||0),commandIds:[...ids].sort()});this.storage.setItem(indexKey,payload);const verified=JSON.parse(this.storage.getItem(indexKey)||'null');if(!verified||verified.playthroughId!==playthroughId||!Array.isArray(verified.commandIds)||verified.commandIds.length!==ids.size)throw new Error('receipt index verification failed');}this.receiptLedgersMigrated.add(playthroughId);}
    // Segment inflation errors deliberately propagate (fail closed); only an
    // unreadable/absent head keeps the historical null result.
    readState(){let head=null;try{head=JSON.parse(this.storage.getItem(STATE_KEY)||'null');}catch{return null;}if(!head)return null;const state=inflatePersistedHead(head,this.storage,this.segmentCache);try{return this._hydrateReceipts(this._applyMessageDeltas(state));}catch{return null;}}
    writeInitial(state){this._persistEmbeddedReceipts(state);this._writeHeadDirect(state,'initial');this.storage.setItem(STABLE_KEY,String(state.revision));this._scheduleReceiptCompaction(state,true);mirrorCompatKeys(this.storage,state,this.mirrorCache);return state;}
    _writeSegments(plan,writes){const written=[];try{for(const row of plan.writes){const at=Date.now();this.storage.setItem(row.key,row.value);written.push(row.key);if(writes)writes.push({phase:'transcript_segment',key:row.key,bytes:row.value.length*2,ms:Date.now()-at});}}catch(error){for(const key of written){try{this.storage.removeItem(key)}catch{}}throw error;}return written;}
    _adoptPlan(plan){for(const cid of [...this.segmentCache.keys()])if(!plan.nextCache.has(cid))this.segmentCache.delete(cid);for(const [cid,rows] of plan.nextCache)this.segmentCache.set(cid,rows);const refsKey=[...plan.refs].sort().join('|');if(plan.writes.length||refsKey!==this.lastSegmentRefsKey){this._collectSegments(plan.refs);this.lastSegmentRefsKey=refsKey;}}
    // Removes segments no durable head references. Callers run it only when
    // no journal is pending, so a roll-forward can never lose its segments.
    _collectSegments(refs){const stale=[];try{for(let i=0;i<Number(this.storage.length||0);i++){const key=String(this.storage.key(i)||'');if(key.startsWith(SEGMENT_PREFIX)&&!refs.has(key))stale.push(key);}for(const key of stale)this.storage.removeItem(key);}catch{}return stale.length;}
    _collectAfterRecovery(){try{const head=JSON.parse(this.storage.getItem(STATE_KEY)||'null'),refs=new Set();for(const keys of Object.values(head?.[PERSISTENCE_KEY]?.segments||{}))for(const key of Array.isArray(keys)?keys:[])refs.add(key);this._collectSegments(refs);this.lastSegmentRefsKey=[...refs].sort().join('|');if(head)this._collectStaleReceiptLedgers(receiptLedgerId(head));}catch{}}
    // Only the durable head's ledger is ever read (_hydrateReceipts); a
    // restored save re-seeds its own ledger from the snapshot. Ledgers of
    // retired or never-committed scopes (a refused Load, a crash before the
    // WAL) are dead weight; runs only once no journal is pending.
    _collectStaleReceiptLedgers(currentLedgerId){const keep=encodeURIComponent(String(currentLedgerId||'')),stale=[];try{for(let i=0;i<Number(this.storage.length||0);i++){const key=String(this.storage.key(i)||'');let ledger=null;if(key.startsWith(RECEIPT_INDEX_PREFIX))ledger=key.slice(RECEIPT_INDEX_PREFIX.length);else if(key.startsWith(RECEIPT_KEY_PREFIX))ledger=key.slice(RECEIPT_KEY_PREFIX.length).split(':')[0];if(ledger!==null&&ledger!==keep)stale.push(key);}for(const key of stale)this.storage.removeItem(key);}catch{}this.lastStaleReceiptLedgerKeys=stale.length;return stale.length;}
    _invalidateMirrorKeys(removed){for(const row of removed||[])if(row?.key&&this.mirrorCache?.blobs)delete this.mirrorCache.blobs[row.key];}
    // Non-journaled head replacement (initialization and format upgrade).
    // The STATE_KEY write is one atomic switch, and every segment it
    // references is already durable, so any interruption leaves either the
    // previous complete head or the new complete head.
    _writeHeadDirect(state,phase){
      let plan=planPersistedHead(state,this.segmentCache,this.storage);
      const attempt=()=>{const written=this._writeSegments(plan);try{this.storage.setItem(STATE_KEY,plan.headJson);}catch(error){for(const key of written){try{this.storage.removeItem(key)}catch{}}throw error;}};
      try{attempt();}catch(error){if(!isQuotaError(error))throw error;const recovery=reclaimStoragePressure(this.storage,state);this._invalidateMirrorKeys(recovery.removed);this.lastStoragePressureRecovery={...recovery,phase,retried:true};plan=planPersistedHead(state,this.segmentCache,this.storage);attempt();}
      this._adoptPlan(plan);return plan;
    }
    // Existing current-engine profiles keep their inline head until the first
    // launch of this build, which re-encodes the identical state. Pending
    // message deltas are left to the next full commit, which folds them.
    _upgradeLegacyHead(state){
      if(!state||typeof state!=='object')return false;
      let head=null;try{head=JSON.parse(this.storage.getItem(STATE_KEY)||'null');}catch{return false;}
      if(!head||head[PERSISTENCE_KEY]||String(this.storage.getItem(STABLE_KEY)??'')!==String(head.revision))return false;
      const before=String(this.storage.getItem(STATE_KEY)||'').length;
      if(!planPersistedHead(state,this.segmentCache,this.storage).head[PERSISTENCE_KEY])return false;
      try{const plan=this._writeHeadDirect(state,'format_upgrade');this.lastFormatUpgrade={headCodeUnitsBefore:before,headCodeUnitsAfter:plan.headJson.length,segments:plan.refs.size,segmentCodeUnitsWritten:plan.writes.reduce((n,row)=>n+row.key.length+row.value.length,0)};return true;}
      catch(error){this.lastFormatUpgradeError=String(error?.code||error?.name||error);return false;}
    }
    migrateEmbeddedReceipts(state){this._persistEmbeddedReceipts(state);this._scheduleReceiptCompaction(state,true);return state;}
    _commitMessageDelta(previous,next,command,commandReceipt){const clock=()=>typeof performance!=='undefined'&&performance.now?performance.now():Date.now(),startedAt=clock(),playthroughId=String(next?.playthrough?.id||'legacy'),cid=String(command?.payload?.contactId||next.execution?.activeContactId||''),receipt=commandReceipt||null,envelope=this._receiptEnvelope(receiptLedgerId(next),command.commandId,receipt,next.revision),event=(receipt?.events||[]).find(row=>row?.type==='conversation:event-committed'&&!row.duplicate)||null,delta={version:1,kind:'message_delta',playthroughId,commandId:String(command.commandId||''),previousRevision:Number(previous.revision)||0,nextRevision:Number(next.revision)||0,transactionId:next.transactionId||null,contactId:cid,event:event,latestEventId:String(next.conversations?.latestEventByContact?.[cid]||''),unread:Math.max(0,Number(next.conversations?.unreadByContact?.[cid])||0),execution:next.execution,recovery:next.recovery,commandReceipt:envelope};const deltaJson=JSON.stringify(delta),serializedAt=clock(),deltaKey=this._messageDeltaKey(playthroughId,next.revision),journal={version:3,status:'pending',kind:'message_delta',checksum:checksum(deltaJson),deltaKey,delta},journalJson=JSON.stringify(journal),writes=[],write=(key,value,phase)=>{const at=clock();this.storage.setItem(key,value);writes.push({phase,key,bytes:String(value).length*2,ms:clock()-at})};write(JOURNAL_KEY,journalJson,'journal_pending');this._stage('journal_pending',journal);const receiptWrite=this._writeReceipt(receiptLedgerId(next),command.commandId,receipt,next.revision);if(receiptWrite)writes.push({phase:'command_receipt',key:receiptWrite.key,bytes:receiptWrite.value.length*2,ms:0});this._stage('receipt_written',journal);write(deltaKey,deltaJson,'message_delta');this._stage('state_written',journal);journal.status='committed';this._stage('commit_marker',journal);write(STABLE_KEY,String(next.revision),'stable_pointer');this._stage('stable_pointer',journal);this.storage.removeItem(JOURNAL_KEY);this._stage('cleanup',journal);const durableAt=clock();this._scheduleReceiptCompaction(next,false);this.pendingMirrorState=next;if(!this.mirrorScheduled){this.mirrorScheduled=true;const enqueue=typeof queueMicrotask==='function'?queueMicrotask:(fn)=>Promise.resolve().then(fn);enqueue(()=>{const state=this.pendingMirrorState;this.pendingMirrorState=null;this.mirrorScheduled=false;if(state)mirrorCompatKeys(this.storage,state,this.mirrorCache)})}this.lastCommitTimings={commandId:command.commandId,serializeMs:serializedAt-startedAt,checksumMs:0,journalBuildMs:0,cleanupMs:0,durablePersistenceMs:durableAt-serializedAt,totalCriticalMs:durableAt-startedAt,canonicalBytes:deltaJson.length*2,walBytes:journalJson.length*2,totalSetItemBytes:writes.reduce((sum,row)=>sum+row.bytes,0),fullStateStringifyCount:0,fullStatePayloadWriteCount:0,writes,mirrorMs:null,messageDelta:true};return next;}
    commit(previous,next,command,commandReceipt=null,pressureRetry=false){if(command?.type==='COMMIT_MESSAGE_EVENT'&&!pressureRetry)return this._commitMessageDelta(previous,next,command,commandReceipt);const clock=()=>typeof performance!=='undefined'&&performance.now?performance.now():Date.now();const startedAt=clock();this._persistEmbeddedReceipts(previous);const playthroughId=receiptLedgerId(next),replacesReceiptLedger=command?.type==='RESTORE_SAVE'||String(command?.type||'').startsWith('INITIALIZE_')||receiptLedgerId(previous)!==playthroughId;// The replacement ledger index is written inside the transaction below so a
// refused commit (quota) rolls it back: a failed Load used to leave a
// complete orphan index (~45 code units per command ever issued) behind.
const nextIndexKey=RECEIPT_INDEX_PREFIX+encodeURIComponent(playthroughId),nextIndexBefore=replacesReceiptLedger?this.storage.getItem(nextIndexKey):null,nextLedgerKnown=this.receiptLedgersMigrated.has(playthroughId);const newReceipt=commandReceipt||next?.progression?.commandReceipts?.[command.commandId]||null,newReceiptEnvelope=this._receiptEnvelope(playthroughId,command.commandId,newReceipt,next.revision),newReceiptJson=JSON.stringify(newReceiptEnvelope);const plan=planPersistedHead(next,this.segmentCache,this.storage);const nextJson=plan.headJson;const serializedAt=clock();const checksumStartedAt=clock();const nextChecksum=checksum(nextJson+'\n'+newReceiptJson);const checksumAt=clock();const record={version:2,status:'pending',previousRevision:previous.revision,nextRevision:next.revision,commandId:command.commandId,checksum:nextChecksum,nextState:plan.head,commandReceipt:newReceiptEnvelope};
      // The state can be large during long conversations. Preserve the exact
      // write-ahead transaction ordering while reusing its one serialized
      // representation instead of recursively serializing the same state for
      // pending journal, state, and committed journal independently.
      const journalBuildStartedAt=clock();const pendingJournalJson='{"version":2,"status":"pending","previousRevision":'+JSON.stringify(record.previousRevision)+',"nextRevision":'+JSON.stringify(record.nextRevision)+',"commandId":'+JSON.stringify(record.commandId)+',"checksum":'+JSON.stringify(record.checksum)+',"commandReceipt":'+newReceiptJson+',"nextState":'+nextJson+'}';const journalBuiltAt=clock();
      const writes=[];const write=(key,value,phase)=>{const at=clock();this.storage.setItem(key,value);const done=clock();writes.push({phase,key,bytes:String(value).length*2,ms:done-at});};
      const receiptKey=receiptStorageKey(playthroughId,command.commandId);
      const before={state:this.storage.getItem(STATE_KEY),stable:this.storage.getItem(STABLE_KEY),receipt:this.storage.getItem(receiptKey)};
      let writtenSegments=[];
      try{
      // Immutable segments first: the WAL below may reference them, and a
      // crash before the WAL leaves only unreferenced keys for collection.
      if(replacesReceiptLedger)this._persistEmbeddedReceipts(next,true);
      writtenSegments=this._writeSegments(plan,writes);
      write(JOURNAL_KEY,pendingJournalJson,'wal_prepare');this._stage('journal_pending',record);
      const receiptWriteStartedAt=clock();const receiptWrite=this._writeReceipt(playthroughId,command.commandId,newReceipt,next.revision);const receiptWriteAt=clock();if(receiptWrite)writes.push({phase:'command_receipt',key:receiptWrite.key,bytes:receiptWrite.value.length*2,ms:receiptWriteAt-receiptWriteStartedAt});this._stage('receipt_written',record);
      write(STATE_KEY,nextJson,'canonical_state');this._stage('state_written',record);
      // A checksum-valid pending WAL is already the durable commit record:
      // recover() deterministically rolls it forward whether STATE_KEY was
      // written or not. Rewriting the entire state-sized WAL merely to flip
      // status to "committed" added a third synchronous full-payload write
      // and a second state-sized JS string without changing any recovery
      // outcome. Keep the historical failure-hook boundary so fault tests
      // still exercise a crash at this exact protocol point.
      record.status='committed';this._stage('commit_marker',record);
      write(STABLE_KEY,String(next.revision),'stable_pointer');this._stage('stable_pointer',record);
      const cleanupStartedAt=clock();this.storage.removeItem(JOURNAL_KEY);this._removeMessageDeltas(next?.playthrough?.id,next.revision);this._retirePreviousReceiptLedger(previous,next);this._adoptPlan(plan);const cleanupAt=clock();this._stage('cleanup',record);const durableAt=clock();this._scheduleReceiptCompaction(next,replacesReceiptLedger);this.pendingMirrorState=next;if(!this.mirrorScheduled){this.mirrorScheduled=true;const enqueue=typeof queueMicrotask==='function'?queueMicrotask:(fn)=>Promise.resolve().then(fn);enqueue(()=>{const mirrorStart=clock();const state=this.pendingMirrorState;this.pendingMirrorState=null;this.mirrorScheduled=false;if(state)mirrorCompatKeys(this.storage,state,this.mirrorCache);this.lastCommitTimings={...(this.lastCommitTimings||{}),mirrorMs:clock()-mirrorStart};});}const detail=this.telemetryEnabled?(()=>{const commandReceiptsJson=JSON.stringify(next.progression?.commandReceipts||{}),progressionJson=JSON.stringify(next.progression||{}),conversationsJson=JSON.stringify(next.conversations||{});return{commandReceiptsBytes:commandReceiptsJson.length*2,progressionBytes:progressionJson.length*2,conversationsBytes:conversationsJson.length*2};})():{};this.lastCommitTimings={commandId:command.commandId,serializeMs:serializedAt-startedAt,checksumMs:checksumAt-checksumStartedAt,journalBuildMs:journalBuiltAt-journalBuildStartedAt,cleanupMs:cleanupAt-cleanupStartedAt,durablePersistenceMs:durableAt-serializedAt,totalCriticalMs:durableAt-startedAt,canonicalBytes:nextJson.length*2,walBytes:pendingJournalJson.length*2,totalSetItemBytes:writes.reduce((sum,row)=>sum+row.bytes,0),fullStateStringifyCount:1,fullStatePayloadWriteCount:2,writes,...detail,mirrorMs:null};return next;
      }catch(error){
        const quota=error?.name==='QuotaExceededError'||Number(error?.code)===22||Number(error?.code)===1014||error?.code==='NS_ERROR_DOM_QUOTA_REACHED';
        // A process crash/fault injection must retain the WAL for roll-forward.
        // Only a synchronous quota refusal proves the renderer is still alive
        // and able to perform this in-session rollback.
        if(!quota)throw error;
        // localStorage is not transactional. A quota error can land after the
        // WAL or receipt but before the canonical state/pointer. Remove the
        // large WAL first (freeing headroom), then restore the exact durable
        // values observed before dispatch. The engine only publishes `next`
        // after this method returns, so a failed commit remains coherent in
        // memory and across relaunch.
        try{this.storage.removeItem(JOURNAL_KEY)}catch{}
        const restore=(key,value)=>{try{if(value==null)this.storage.removeItem(key);else this.storage.setItem(key,value)}catch{}};
        restore(STATE_KEY,before.state);restore(STABLE_KEY,before.stable);restore(receiptKey,before.receipt);
        // Segments written by this refused attempt are referenced by no
        // durable head (the restored STATE_KEY predates them).
        for(const key of writtenSegments){try{this.storage.removeItem(key)}catch{}}
        if(replacesReceiptLedger){restore(nextIndexKey,nextIndexBefore);if(!nextLedgerKnown)this.receiptLedgersMigrated.delete(playthroughId);}
        if(!pressureRetry){const recovery=reclaimStoragePressure(this.storage,previous);this._invalidateMirrorKeys(recovery.removed);this.lastStoragePressureRecovery={...recovery,phase:writes.at(-1)?.phase||'wal_prepare',retried:true};return this.commit(previous,next,command,commandReceipt,true);}
        this.lastStoragePressureRecovery={...(this.lastStoragePressureRecovery||{}),phase:writes.at(-1)?.phase||'wal_prepare',retryFailed:true};
        throw persistenceStorageFullError(error,writes.at(-1)?.phase||'wal_prepare');
      }}
    // WAL recovery bug fix (FINAL PERFORMANCE BLOCKER, 2026-08-19, found by
    // tools/qa/qa_wal_fault_injection_matrix.test.js -- a genuine
    // pre-existing crash-recovery defect, unrelated to and not introduced
    // by this round's command-scoped copy-on-write work, which does not
    // touch this file at all): a checksum-valid journal payload is durably
    // safe to replay forward REGARDLESS of whether its `status` field ever
    // reached 'committed' -- that is the entire point of write-AHEAD
    // logging: the log record itself is the durability boundary, not the
    // later finalize/cleanup steps (state write, stable-pointer update,
    // journal removal) that follow it. The previous version only trusted a
    // status==='committed' journal this way; for the narrower "STATE_KEY
    // was already durably overwritten with the new state, but the crash
    // hit before the journal was marked 'committed'" case, it built an
    // attempted "rollback" by taking the ALREADY-OVERWRITTEN new state and
    // just changing its own `.revision` field back down to the old number
    // -- producing a torn state whose CONTENT was the new commit's but
    // whose revision NUMBER claimed the old one (proven live: commandReceipts/
    // conversations/execution all reflected the crashed commit while
    // revision read as the prior one). There is no durable copy of the
    // actual previous state's own content anywhere in this WAL to roll
    // back to -- the journal only ever stores nextState, never previous's
    // content -- so the only sound move once a payload's checksum verifies
    // intact is to finish committing it forward, never to synthesize a
    // "rollback" from mismatched pieces.
    recover(){let journal=null;try{journal=JSON.parse(this.storage.getItem(JOURNAL_KEY)||'null');}catch{}if(journal?.kind==='message_delta'&&journal.delta&&checksum(JSON.stringify(journal.delta))===journal.checksum){const deltaJson=JSON.stringify(journal.delta);this.storage.setItem(String(journal.deltaKey||this._messageDeltaKey(journal.delta.playthroughId,journal.delta.nextRevision)),deltaJson);const envelope=journal.delta.commandReceipt;if(envelope?.commandId&&envelope?.receipt)this._writeReceipt(envelope.playthroughId,envelope.commandId,envelope.receipt,envelope.visibleAtRevision??journal.delta.nextRevision);this.storage.setItem(STABLE_KEY,String(journal.delta.nextRevision));this.storage.removeItem(JOURNAL_KEY);const state=this.readState();this._collectAfterRecovery();return{state,status:'completed'}}const current=this.readState();if(!journal){this._upgradeLegacyHead(current);this._collectAfterRecovery();return {state:current,status:'stable'};}
      // Accept both the current single-serialization checksum and journals
      // written by earlier builds with stableStringify-based checksums.
      const journalStateJson=journal.nextState?JSON.stringify(journal.nextState):'';
      const journalReceiptJson=journal.commandReceipt?JSON.stringify(journal.commandReceipt):'';
      const valid=journal.nextState&&(journal.version>=2
        ? checksum(journalStateJson+'\n'+journalReceiptJson)===journal.checksum
        : (checksum(journalStateJson)===journal.checksum||checksum(journal.nextState)===journal.checksum));
      if(valid){if(journal.commandReceipt?.commandId&&journal.commandReceipt?.receipt)this._writeReceipt(journal.commandReceipt.playthroughId,journal.commandReceipt.commandId,journal.commandReceipt.receipt,journal.commandReceipt.visibleAtRevision??journal.nextRevision);this.storage.setItem(STATE_KEY,journalStateJson);this.storage.setItem(STABLE_KEY,String(journal.nextRevision));this.storage.removeItem(JOURNAL_KEY);const state=this._hydrateReceipts(inflatePersistedHead(journal.nextState,this.storage,this.segmentCache));this._collectAfterRecovery();return {state,status:'completed'};}
      // Journal payload itself is missing/corrupt -- nothing trustworthy to
      // replay forward. The crash must have happened before or during the
      // journal's own pending write landing durably, so STATE_KEY should
      // still hold whatever the last fully-committed-and-cleaned-up prior
      // transaction left there untouched.
      this.storage.removeItem(JOURNAL_KEY);this._collectAfterRecovery();return {state:current,status:'discarded'};}
    mirrorCompat(state){mirrorCompatKeys(this.storage,state,this.mirrorCache);}
    static isProtectedKey(k){return PROTECTED.some(r=>r.test(String(k)));}
  }
  return {EngineStorage,MemoryStorage,STATE_KEY,JOURNAL_KEY,STABLE_KEY,checksum,stableStringify,PROTECTED,reclaimStoragePressure,REBUILDABLE_COMPAT_KEYS,HEADROOM_KEY,PRESSURE_VERSION_KEY,SEGMENT_PREFIX,SEGMENT_SIZE,PERSISTENCE_KEY,planPersistedHead,inflatePersistedHead,readPersistedHeadFrom,encodeSegmentValue,decodeSegmentValue,deriveCacheRow,rehydrateCacheRow,codec:{compress:codecCompress,decompress:codecDecompress}};
});
