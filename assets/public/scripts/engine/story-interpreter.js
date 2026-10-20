(function(root,factory){const deps=typeof module==='object'&&module.exports?{grammar:require('./condition-grammar'),position:require('./story-position')}:{grammar:root.ConditionGrammar,position:root.StoryPosition};const api=factory(root,deps.grammar,deps.position);if(typeof module==='object'&&module.exports)module.exports=api;root.StoryInterpreter=api.StoryInterpreter;})(typeof globalThis!=='undefined'?globalThis:this,function(root,ConditionGrammar,StoryPosition){
  'use strict';
  const MESSAGE=new Set(['message','image','photo','media','send_to_continue']);
  const transcriptSkillForStory=(storyPath,step={})=>{const explicit=String(step.route||step.evidenceRoute||step.hakRoute||'').toLowerCase();if(['love','ntr','nts'].includes(explicit))return explicit+'_audio_transcription_v1';const match=String(storyPath||'').replace(/\\/g,'/').match(/\/(love|ntr|nts)\//i);return match?match[1].toLowerCase()+'_audio_transcription_v1':'';};
  const VISUAL_EFFECTS=new Set(['glitch','cutscene','dev_message','hak_overlay','hak_hint','instagram_post','instagram_story','snapgram_post','gallery_add','meetandgreet_profile_unlock','meetandgreet_notify','meetandgreet_photo_add','meetandgreet_comment_add','meetandgreet_tip','patreon_update_gate','outbound_task']);
  const APP_UNLOCKS={meetandgreet_unlock_app:'meetandgreet'};
  const clone=v=>JSON.parse(JSON.stringify(v));
  const fingerprint=value=>{const text=JSON.stringify(value||{});let hash=2166136261;for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}return(hash>>>0).toString(36);};
  // "choices"/"player_choice" are documented Group 2 aliases for a choice
  // step (unused in current production content -- verified zero occurrences
  // -- but real, named types the format allows). Single normalization point
  // so peekCurrentStep and processOne can never disagree on a step's type.
  const CHOICE_TYPE_ALIASES=new Set(['choices','player_choice']);
  const normalizeStepType=step=>{const t=String(step?.type||'message').toLowerCase();return CHOICE_TYPE_ALIASES.has(t)?'choice':t;};
  // Story authoring historically uses `from` for conversation/media steps
  // and `fromId` for notification steps. Normalize that compatibility alias
  // once before any canonical command is built; all reducers/adapters then
  // consume the same `from`/contactId DTO regardless of source spelling.
  const authoredSenderId=step=>{const s=step&&typeof step==='object'?step:{};const fromId=String(s.fromId??'').trim();return fromId||String(s.from??s.sender??'').trim();};
  // Default goto budget for a single active story, matching convo-runtime.js's
  // MAX_GOTO_JUMPS_PER_RUN -- see its comment: every production story's total
  // goto count is under 10, so this is generous for any legitimate designed
  // loop while still failing fast (a canonical RECORD_BLOCKED_STATE, not a
  // hang) on a genuine unconditional cycle. Overridable per-instance for
  // tests via opts.maxGotoStreak.
  const DEFAULT_MAX_GOTO_STREAK=500;
  class StoryInterpreter{
    static activeCount=0; static activeId=null;
    constructor(engine,opts={}){if(!engine)throw new Error('GameStateEngine is required');if(StoryInterpreter.activeCount>0)throw Object.assign(new Error('MULTIPLE_STORY_INTERPRETERS'),{code:'MULTIPLE_STORY_INTERPRETERS'});this.engine=engine;this.id=opts.id||`interpreter-${Date.now().toString(36)}`;this.loadStory=opts.loadStory||this.defaultLoad;this.effects=opts.effects||{};this.storyCache=new Map();this.labelIndexCache=new WeakMap();this.pending=new Set();this.resources=new Set();this.destroyed=false;this.maxGotoStreak=Number.isFinite(opts.maxGotoStreak)?opts.maxGotoStreak:DEFAULT_MAX_GOTO_STREAK;this._gotoStreak=0;this._gotoStreakStoryId=null;StoryInterpreter.activeCount=1;StoryInterpreter.activeId=this.id;}
    async defaultLoad(path,signal){const response=await fetch(path,{cache:'no-store',signal});if(!response.ok)throw Object.assign(new Error(`story load failed: ${path}`),{code:'STORY_LOAD_FAILED'});return response.json();}
    async start(target,meta={}){this.assertLive();const controller=new AbortController();this.resources.add(controller);try{const story=typeof target==='string'?await this.loadStory(target,controller.signal):clone(target);const path=typeof target==='string'?target:meta.storyPath;this.storyCache.set(String(story.id||story.onceKey||path),story);if(path)this.storyCache.set(String(path),story);const state=this.engine.getGameplayState();if(state.execution.lease&&String(state.execution.activeStoryPath||'')===String(path||''))return{ok:true,status:'ALREADY_ACTIVE',commandId:meta.commandId||'',previousRevision:state.revision,nextRevision:state.revision,events:[],error:null};return this.engine.dispatch({type:'START_STORY',commandId:meta.commandId||`start:${path||story.id||story.onceKey}`,expectedRevision:state.revision,payload:{storyId:story.id||story.onceKey||path,onceKey:story.onceKey||null,requirements:ConditionGrammar.storyRequirements(story),storyPath:path,contactId:story.contactId||meta.contactId||this.ownerFromPath(path),leaseId:meta.leaseId}});}finally{this.resources.delete(controller);}}
    resume(input={}){return this.process(input);}
    submitChoice(optionId,meta={}){return this.process({...meta,choiceId:optionId});}
    submitContinue(meta={}){return this.process({...meta,continue:true});}
    async process(input={}){this.assertLive();const token={};this.pending.add(token);try{return await this.processOne(input);}finally{this.pending.delete(token);}}

    // -------------------------
    // Canonical execution cursor (GameStateEngine.CURSOR_PHASES). Every
    // dispatch below carries a `cursor` payload field computed from the
    // NORMALIZED story representation (scripts/engine/story-position.js) --
    // never a renderer-local i/index, never a destructive splice of the
    // chosen if-branch into a flat array. The engine commits the semantic
    // effect and this cursor patch in the SAME transaction (see
    // game-state-engine.js's apply()), so there is never a separate
    // "increment index" step after the fact.
    // -------------------------
    currentPosition(state){
      const cur=state.execution.cursor;
      if(cur&&Array.isArray(cur.branchPath)&&cur.storyPath===state.execution.activeStoryPath&&cur.storyId===state.execution.activeStoryId){
        return{rootIndex:Number(cur.rootIndex)||0,branchPath:cur.branchPath};
      }
      // Pre-cursor save (schemaVersion 4 before this field existed) or a
      // cursor that hasn't been established yet: fall back to the flat
      // activeStepIndex at the root level, matching what START_STORY/
      // RESTORE_SAVE already guarantee is at least a valid resume point.
      return{rootIndex:Number(state.execution.activeStepIndex)||0,branchPath:[]};
    }
    nextAfter(steps,resolved){
      const adv=StoryPosition.siblingAdvance(resolved.rootIndex,resolved.branchPath);
      return StoryPosition.normalize(steps,adv.rootIndex,adv.branchPath)||{rootIndex:steps.length,branchPath:[]};
    }
    labelIndex(story){
      let idx=this.labelIndexCache.get(story);
      if(!idx){idx=StoryPosition.buildLabelIndex(Array.isArray(story.steps)?story.steps:[]);this.labelIndexCache.set(story,idx);}
      return idx;
    }
    gotoPosition(steps,story,label){
      const key=String(label||'').trim().toLowerCase();
      if(!key)throw Object.assign(new Error('goto missing label'),{code:'INVALID_GRAPH_TARGET'});
      const idx=this.labelIndex(story);
      if(!idx.map.has(key))throw Object.assign(new Error(`Unknown label: ${label}`),{code:'INVALID_GRAPH_TARGET'});
      return StoryPosition.resolveGotoTarget(steps,idx.map,key)||{rootIndex:steps.length,branchPath:[]};
    }
    operationId(before,path,type){return fingerprint({storyPath:before.execution.activeStoryPath||'',path,type});}
    // branchId must byte-for-byte match convo-runtime.js's makeBranchDecisionId
    // (storyToken|token|condition, see story-position.js's keyToken/normToken
    // header comment) so a branch already decided by the legacy runtime before
    // the canonical cutover is recognized here as already-decided, not
    // re-evaluated.
    branchId(before,story,path,step){
      const storyToken=StoryPosition.normToken(story.onceKey||'')||StoryPosition.keyToken(before.execution.activeStoryPath||'')||'story';
      const token=StoryPosition.keyToken(path);
      const condition=String(step.condition||'').trim();
      return `${storyToken}|${token}|${condition}`;
    }
    // Unlike branchId, a choice's identity is its own stable authored key
    // (step.id/step.key -- e.g. "d8_05_hailey_outfit_choice"), not a tree
    // position: production `choice:<key>:<optionId>` conditions reference a
    // choice made in an EARLIER, DIFFERENT story file by that same stable
    // key (a Day 15 file reading a Day 9 choice), so the receipt must be
    // addressable the same story-spanning way world.choices already is.
    // Falls back to the position path only for a choice step authored
    // without any key at all (nothing else could address it later anyway).
    choiceGroupId(step,path){
      return String(step?.id||step?.key||path);
    }
    cursorFor(before,target,extra){
      return{
        storyPath:before.execution.activeStoryPath,storyId:before.execution.activeStoryId,contactId:before.execution.activeContactId,
        rootIndex:target.rootIndex,branchPath:clone(target.branchPath||[]),
        leaseId:before.execution.lease?before.execution.lease.id:null,
        operationId:null,operationType:null,branchReceiptId:null,gotoTarget:null,
        pendingUserIntent:null,pendingPresentationAck:null,
        phase:'ready_to_interpret',completion:'in_progress',continuation:'none',
        ...extra
      };
    }

    hakPresentation(step,opId){
      if(step.waitForOverlay===false)return null;
      return {kind:'hak_overlay',operationId:opId,payload:{level:step.level||1,title:step.title||'HAK',message:step.message||'',messages:Array.isArray(step.messages)?clone(step.messages):[],...(step.skillId?{skillId:step.skillId}:{}),...(step.presentation==='player_thought'?{presentation:'player_thought',speaker:'player'}:{})}};
    }
    acknowledgePresentation(owner){
      const before=this.engine.getGameplayState(),x=before.execution,pending=x.cursor?.pendingPresentationAck;
      if(!pending||pending.operationId!==owner?.operationId||x.lease?.id!==owner?.leaseId||Number(x.operationEpoch||0)!==Number(owner?.operationEpoch||0))return this.stale('presentation-ack');
      const cursor={...x.cursor,pendingPresentationAck:null,phase:'ready_to_interpret'};
      return this.command('COMMIT_STORY_STEP',{}, {stepIndex:cursor.rootIndex,nextStepIndex:cursor.rootIndex,cursor},x.lease,`presentation-ack:${pending.operationId}`);
    }
    async restoreLegacyHakPresentation(){
      const before=this.engine.getGameplayState(),x=before.execution,cursor=x.cursor;
      if(!x.lease||cursor?.pendingPresentationAck)return cursor?.pendingPresentationAck||null;
      if(cursor?.phase!=='operation_committed'||!['hak_unlock','hak_overlay'].includes(cursor.operationType)||!cursor.operationId)return null;
      const story=await this.activeStory(before);let pending=null;
      StoryPosition.walkNormalizedSteps(story.steps||[],'',(step,path)=>{
        if(normalizeStepType(step)===cursor.operationType&&this.operationId(before,path,cursor.operationType)===cursor.operationId)pending=this.hakPresentation(step,cursor.operationId);
      });
      const current=this.engine.getExecutionState();
      if(!pending||current.lease?.id!==x.lease.id||current.cursor?.operationId!==cursor.operationId||current.cursor?.phase!==cursor.phase||Number(current.operationEpoch||0)!==Number(x.operationEpoch||0))return null;
      const patch={...cursor,phase:'waiting_for_presentation',pendingPresentationAck:pending};
      const result=this.command('COMMIT_STORY_STEP',{}, {stepIndex:cursor.rootIndex,nextStepIndex:cursor.rootIndex,cursor:patch},x.lease,`restore-presentation:${cursor.operationId}`);
      return result.ok?pending:null;
    }

    // Read-only: resolves the step at the CURRENT canonical cursor position
    // without dispatching anything. Lets a caller (the Group 1 execution
    // seam in convo-runtime.js/conversation.html) decide whether this
    // interpreter should own the next step (Group 1) or whether an
    // unmigrated step type should stay on its existing path -- without
    // that caller re-implementing story-tree traversal itself.
    async peekCurrentStep(state){
      const story=await this.activeStory(state);
      const steps=Array.isArray(story.steps)?story.steps:[];
      const pos=this.currentPosition(state);
      const resolved=StoryPosition.normalize(steps,pos.rootIndex,pos.branchPath);
      if(!resolved)return{complete:true,type:null,step:null,path:null};
      const path=StoryPosition.formatPath(resolved.rootIndex,resolved.branchPath);
      return{complete:false,type:normalizeStepType(resolved.step),step:resolved.step,path,rootIndex:resolved.rootIndex,branchPath:resolved.branchPath};
    }
    async processOne(input={}){
      const before=this.engine.getStoryDecisionState?this.engine.getStoryDecisionState():this.engine.getGameplayState(),lease=before.execution.lease&&{...before.execution.lease};
      if(!this.engine.validateLease(lease))return this.stale(input.commandId);
      if(before.execution.cursor?.pendingPresentationAck)return{ok:false,status:'PRESENTATION_REQUIRED',commandId:input.commandId||'',previousRevision:before.revision,nextRevision:before.revision,events:[],error:null};
      const story=await this.activeStory(before);
      if(!this.engine.validateLease(lease))return this.stale(input.commandId);
      const steps=Array.isArray(story.steps)?story.steps:[];
      const pos=this.currentPosition(before);
      const resolved=StoryPosition.normalize(steps,pos.rootIndex,pos.branchPath);
      if(this._gotoStreakStoryId!==before.execution.activeStoryId){this._gotoStreakStoryId=before.execution.activeStoryId;this._gotoStreak=0;}

      if(!resolved){
        const target=this.routeStoryPath(story.onCompleteStartStory||story.startStory||null,before)||null,targetMeta=target?await this.targetDescriptor(target,story.onCompleteContactId):null;
        if(!this.engine.validateLease(lease))return this.stale(input.commandId);
        return this.command('COMPLETE_STORY',input,{storyId:before.execution.activeStoryId,onceKey:story.onceKey,continuation:target?{targetStoryId:targetMeta.storyId,targetStoryPath:target,targetOnceKey:targetMeta.onceKey,requirements:targetMeta.requirements,contactId:targetMeta.contactId,terminalStep:pos.rootIndex}:null},lease);
      }

      const step=resolved.step,path=StoryPosition.formatPath(resolved.rootIndex,resolved.branchPath);
      const type=normalizeStepType(step);
      const opId=this.operationId(before,path,type);

      if(MESSAGE.has(type)){
        if(type==='send_to_continue'&&!input.continue)return this.required('CONTINUE_REQUIRED',input,before,{type:'story:continue-required',stepIndex:resolved.rootIndex,path},lease,this.cursorFor(before,resolved,{operationId:opId,operationType:type,phase:'waiting_for_user_intent',pendingUserIntent:{kind:'continue'}}));
        if(Number(step.delay)>0){await this.delay(Math.min(Number(step.delay),10000),lease,{owner:input.presentationMode||'background',storyPath:before.execution.activeStoryPath,contactId:before.execution.activeContactId});if(!this.engine.validateLease(lease))return this.stale(input.commandId);}
        const next=this.nextAfter(steps,resolved);
        const eventId='msg-'+fingerprint({storyId:before.execution.activeStoryId,path,kind:['image','photo','media'].includes(type)?type:'message',text:step.text||step.message||'',src:step.src||step.image||step.url||null});
        return this.command('COMMIT_MESSAGE_EVENT',input,{
          contactId:before.execution.activeContactId,stepIndex:resolved.rootIndex,eventId,
          from:type==='send_to_continue'?'player':authoredSenderId(step),
          text:step.text||step.message||'',kind:['image','photo','media'].includes(type)?type:'message',
          ...(step.presentation==='player_thought'?{presentation:'player_thought',speaker:'player'}:{}),
          assetId:step.src||step.image||step.url||null,link:step.link?clone(step.link):null,nextStepIndex:next.rootIndex,
          cursor:this.cursorFor(before,next,{operationId:opId,operationType:type,phase:'ready_to_interpret'})
        },lease,opId);
      }

      if(type==='choice'){
        const options=step.options||step.choices||[];
        const choiceGroupId=this.choiceGroupId(step,path);
        const existingReceipt=before.progression.choiceReceipts[choiceGroupId];
        const pendingIntent={kind:'choice',choiceGroupId,sourceStepKey:path,options:clone(options),selectionOpen:!existingReceipt};
        // A receipt already existing for this exact choiceGroupId means the
        // player already decided this -- catch-up (executeCanonicalProgressionStep,
        // interpreter.process({})) must be able to replay past it with NO
        // input, exactly like the symmetric DUPLICATE_MESSAGE fix for plain
        // messages. Only demand fresh input when there is genuinely nothing
        // recorded yet (a live `npm restart` session reproduced the old,
        // unconditional gate here: a lease released/reacquired left the
        // cursor stuck BEHIND an already-answered choice, and every catch-up
        // replay was rejected INPUT_REQUIRED with selectionOpen:false --
        // the engine correctly knew the choice was already answered but
        // still refused to advance past it without a fresh click that could
        // never come, since no UI is shown for an already-decided choice).
        if(input.choiceId==null&&!existingReceipt)return this.required('INPUT_REQUIRED',input,before,{type:'story:choice-required',storyId:before.execution.activeStoryId,contactId:before.execution.activeContactId,stepIndex:resolved.rootIndex,choiceGroupId,options:clone(options)},lease,this.cursorFor(before,resolved,{operationId:opId,operationType:type,phase:'waiting_for_user_intent',pendingUserIntent:pendingIntent}));
        const option=input.choiceId==null?null:options.find(o=>String(o.id??o.value??o.text)===String(input.choiceId));
        if(input.choiceId!=null&&!option)return this.required('INVALID_CHOICE',input,before,{type:'story:choice-required',stepIndex:resolved.rootIndex,choiceGroupId,options:clone(options)},lease,this.cursorFor(before,resolved,{operationId:opId,operationType:type,phase:'waiting_for_user_intent',pendingUserIntent:pendingIntent}));
        // Immutable, exactly like branch decisions: once this exact choice
        // position has a receipt, a later attempt (even with a DIFFERENT
        // optionId -- a stale/duplicate click racing a fresh render -- or no
        // input at all, per the catch-up-replay case above) resolves to the
        // ALREADY-DECIDED option, not a new selection.
        const effectiveOption=existingReceipt?(options.find(o=>String(o.id??o.value??o.text)===existingReceipt.selectedOptionId)||option):option;
        const next=effectiveOption.goto?this.gotoPosition(steps,story,effectiveOption.goto):this.nextAfter(steps,resolved);
        return this.command('RECORD_CHOICE_DECISION',input,{
          choiceGroupId,sourceStepKey:path,options:clone(options),selectedOptionId:existingReceipt?existingReceipt.selectedOptionId:String(input.choiceId),selectedOptionText:String(effectiveOption?.text||effectiveOption?.label||''),
          stepIndex:resolved.rootIndex,nextStepIndex:next.rootIndex,
          cursor:this.cursorFor(before,next,{operationId:opId,operationType:type,phase:'ready_to_interpret',gotoTarget:effectiveOption.goto?{rootIndex:next.rootIndex,branchPath:clone(next.branchPath)}:null})
        },lease,opId);
      }

      if(type==='if'){
        const conditionExpr=String(step.condition||step.key||step.flag||step.if||'');
        const decision=this.condition(step,before);
        const bId=this.branchId(before,story,path,step);
        const existing=before.progression.branchReceipts[bId];
        const chosenBranch=existing?existing.selectedBranch:(decision?'then':'else');
        const descended=StoryPosition.descend(resolved.rootIndex,resolved.branchPath,chosenBranch);
        const next=StoryPosition.normalize(steps,descended.rootIndex,descended.branchPath)||{rootIndex:steps.length,branchPath:[]};
        return this.command('RECORD_BRANCH_DECISION',input,{
          branchId:bId,sourceStepKey:path,condition:conditionExpr,result:chosenBranch==='then',
          cursor:this.cursorFor(before,next,{operationId:opId,operationType:type,phase:'ready_to_interpret',branchReceiptId:bId})
        },lease,opId);
      }

      // A visible authored elapsed-time note ("5 MINUTES LATER") used to be
      // a purely structural, non-durable cursor advance -- identical to a
      // silent 'label' -- so it only ever rendered via conversation.html's
      // own LIVE, in-page script walk while the player was actively
      // watching. Anything reached through eager/background admission (the
      // SAME "notify" mechanism this session's own sibling investigation
      // covers) or later historical reconstruction (Save/Load, relaunch,
      // Start From/New Update, Timeline/checkpoint replay, simple
      // scrollback) had no canonical event to recover it from and silently
      // lost it -- live tester report, 2026-09-07: Evelyn's Day12 morning
      // "5 MINUTES LATER" note never appeared. A note with real text is
      // now committed as a genuine, durable conversation event (kind
      // 'note', from 'system' -- the exact convention conversation.html's
      // own transcriptItemFromScriptStep() already uses for a live note),
      // so every reconstruction path can replay it; game-state-engine.js's
      // own message() reducer excludes kind:'note' from ever becoming the
      // conversation's latest-event preview or incrementing unread, since
      // it is flavor text, not real dialogue. An empty-text note (no
      // visible artifact ever intended) keeps the original silent
      // advance.
      if(type==='note'&&String(step.text||'').trim()){
        if(Number(step.delay)>0){await this.delay(Math.min(Number(step.delay),10000),lease,{owner:input.presentationMode||'background',storyPath:before.execution.activeStoryPath,contactId:before.execution.activeContactId});if(!this.engine.validateLease(lease))return this.stale(input.commandId);}
        const next=this.nextAfter(steps,resolved);
        const eventId='msg-'+fingerprint({storyId:before.execution.activeStoryId,path,kind:'note',text:step.text||''});
        return this.command('COMMIT_MESSAGE_EVENT',input,{
          contactId:before.execution.activeContactId,stepIndex:resolved.rootIndex,eventId,
          from:'system',text:step.text||'',kind:'note',
          ...(step.presentation==='player_thought'?{presentation:'player_thought',speaker:'player'}:{}),
          nextStepIndex:next.rootIndex,
          cursor:this.cursorFor(before,next,{operationId:opId,operationType:type,phase:'ready_to_interpret'})
        },lease,opId);
      }
      if(type==='label'||type==='note'){
        const next=this.nextAfter(steps,resolved);
        return this.command('COMMIT_STORY_STEP',input,{stepIndex:resolved.rootIndex,nextStepIndex:next.rootIndex,cursor:this.cursorFor(before,next,{operationId:opId,operationType:type,phase:'ready_to_advance'})},lease,opId);
      }

      if(type==='goto'){
        // Total-gotos-per-active-story budget (see DEFAULT_MAX_GOTO_STREAK):
        // deliberately never reset by an intervening message/if/label/set_flag
        // step, matching convo-runtime.js's MAX_GOTO_JUMPS_PER_RUN, which
        // counts every goto jump across one story walk, not just consecutive
        // ones -- only a genuinely new active story (see the
        // _gotoStreakStoryId check above) resets it.
        if(this._gotoStreak>=this.maxGotoStreak){
          return this.command('RECORD_BLOCKED_STATE',input,{code:'GOTO_BUDGET_EXCEEDED',retryable:false,recoveryPolicy:'manual',detail:{path,label:step.label||step.goto,maxGotoStreak:this.maxGotoStreak}},lease,opId);
        }
        const target=this.gotoPosition(steps,story,step.label||step.goto);
        this._gotoStreak++;
        return this.command('COMMIT_STORY_STEP',input,{stepIndex:resolved.rootIndex,nextStepIndex:target.rootIndex,cursor:this.cursorFor(before,target,{operationId:opId,operationType:type,phase:'ready_to_advance',gotoTarget:{rootIndex:target.rootIndex,branchPath:clone(target.branchPath)}})},lease,opId);
      }

      if(type==='set_flag'){
        const key=step.key||step.flag||step.name;const remove=step.remove===true||step.clear===true;
        // Value default/normalization must byte-for-byte match convo-runtime.js's
        // and conversation.html's set_flag handling ("1" string, not boolean
        // true) -- both live runtimes already write/read this convention, and
        // ConditionGrammar's compareEquals is a String(...) comparison, so a
        // stored true vs "1" are NOT equivalent to a later `key:1` condition.
        const next=this.nextAfter(steps,resolved);
        return this.command('SET_STORY_VARIABLE',input,{key,value:remove?undefined:(step.value==null||String(step.value).trim()===''?'1':step.value),remove,stepIndex:resolved.rootIndex,nextStepIndex:next.rootIndex,cursor:this.cursorFor(before,next,{operationId:opId,operationType:type,phase:'ready_to_interpret'})},lease,opId);
      }

      if(type==='start_story'){const rawTarget=step.story||step.path||step.startStory,target=this.routeStoryPath(rawTarget,before),targetMeta=await this.targetDescriptor(target,step.contactId);return this.command('COMPLETE_STORY',input,{storyId:before.execution.activeStoryId,onceKey:story.onceKey,continuation:{targetStoryId:step.storyId||targetMeta.storyId,targetStoryPath:target,targetOnceKey:targetMeta.onceKey,requirements:targetMeta.requirements,contactId:targetMeta.contactId,terminalStep:resolved.rootIndex,receiptId:step.receiptId}},lease,opId);}

      if(type==='time_card'){
        const day=Number(step.day)||((step.nextDay||/day/i.test(step.title||step.text||''))?before.world.day+1:0),afterCard=this.nextAfter(steps,resolved),terminalCard=afterCard.rootIndex>=steps.length,target=this.routeStoryPath(step.startStory||step.story||step.path||(terminalCard?story.onCompleteStartStory:null),before);
        if(target){const targetMeta=await this.targetDescriptor(target,step.contactId);return this.command('COMPLETE_STORY',input,{storyId:before.execution.activeStoryId,onceKey:story.onceKey,day,timeCard:clone(step),terminalStep:resolved.rootIndex,continuation:{targetStoryId:targetMeta.storyId,targetStoryPath:target,targetOnceKey:targetMeta.onceKey,requirements:targetMeta.requirements,contactId:targetMeta.contactId,terminalStep:resolved.rootIndex}},lease,opId);}
        if(day){const next=this.nextAfter(steps,resolved);return this.command('CHANGE_DAY',input,{day,stepIndex:resolved.rootIndex,nextStepIndex:next.rootIndex,cursor:this.cursorFor(before,next,{operationId:opId,operationType:type,phase:'operation_committed'})},lease,opId);}
        return this.effect(type,step,input,lease,resolved,opId);
      }

      if(type==='wait'||type==='delay'){await this.delay(Number(step.ms||step.delay||step.duration)||0,lease);if(!this.engine.validateLease(lease))return this.stale(input.commandId);const next=this.nextAfter(steps,resolved);return this.command('COMMIT_STORY_STEP',input,{stepIndex:resolved.rootIndex,nextStepIndex:next.rootIndex,cursor:this.cursorFor(before,next,{operationId:opId,operationType:type,phase:'ready_to_advance'})},lease,opId);}

      if(type==='notify'){
        const next=this.nextAfter(steps,resolved);
        // Conversation ownership and authored sender are different axes.
        // A player-authored notification inside Evelyn's story still belongs
        // to Evelyn's conversation/lease; using fromId as contactId corrupts
        // the active owner into the non-contact "player" sentinel.
        const notifyContactId=step.contactId||before.execution.activeContactId||authoredSenderId(step);
        const notifySenderId=authoredSenderId(step)||notifyContactId;
        // Deterministic per-step id (story+path+contact+text), matching the
        // MESSAGE branch's own fingerprint convention just above -- NOT
        // conversations.latestEventByContact, which would tie this
        // notification's identity to whatever unrelated message happened to
        // be most recent for this contact rather than to this notify step
        // itself, and would collide/drift under replay or reordering.
        const messageEventId=step.messageEventId||('notify-'+fingerprint({storyId:before.execution.activeStoryId,path,contactId:notifyContactId,text:step.text||''}));
        return this.command('COMMIT_NOTIFICATION_EVENT',input,{messageEventId,contactId:notifyContactId,from:notifySenderId,notificationType:step.notificationType||'story',text:step.text||'',stepIndex:resolved.rootIndex,nextStepIndex:next.rootIndex,payload:{app:String(step.app||'messages').toLowerCase(),fromId:notifySenderId,fromName:step.fromName||step.name||'',avatar:(input.avatar!=null?input.avatar:step.avatar)||'',target:step.target||'',kind:step.kind||'text',suppressPopup:input.suppressPopup===true},cursor:this.cursorFor(before,next,{operationId:opId,operationType:type,phase:'operation_committed'})},lease,opId);
      }

      if(type==='hak_unlock'){
        const next=this.nextAfter(steps,resolved);
        const pendingPresentationAck=this.hakPresentation(step,opId);
        return this.command('UNLOCK_HAK',input,{operationId:opId,level:Number(step.level)||1,visible:step.deferAppReveal===true?false:step.visible!==false,openable:step.openable===true,stepIndex:resolved.rootIndex,nextStepIndex:next.rootIndex,cursor:this.cursorFor(before,next,{operationId:opId,operationType:type,phase:pendingPresentationAck?'waiting_for_presentation':'operation_committed',pendingPresentationAck})},lease,opId);
      }

      if(type==='hak_transcript'){
        if(Number(step.delay)>0){await this.delay(Math.min(Number(step.delay),10000),lease,{owner:input.presentationMode||'background',storyPath:before.execution.activeStoryPath,contactId:before.execution.activeContactId});if(!this.engine.validateLease(lease))return this.stale(input.commandId);}
        const next=this.nextAfter(steps,resolved);
        const requiredSkill=transcriptSkillForStory(before.execution.activeStoryPath,step);
        // The decision projection intentionally omits effect receipts. Read the
        // scalar canonical authority after the lease check; do not widen every step snapshot.
        const visible=!!requiredSkill&&this.engine.hasActiveHakSkill(requiredSkill);
        const eventId='msg-'+fingerprint({storyId:before.execution.activeStoryId,path,kind:'hak_transcript',text:step.text||'',from:step.from||step.sender||''});
        return this.command('COMMIT_MESSAGE_EVENT',input,{
          contactId:before.execution.activeContactId,stepIndex:resolved.rootIndex,eventId,
          from:step.from||step.sender,text:step.text||'',kind:'hak_transcript',source:'hak_transcript',visible,
          nextStepIndex:next.rootIndex,cursor:this.cursorFor(before,next,{operationId:opId,operationType:type,phase:'ready_to_interpret'})
        },lease,opId);
      }

      if(type==='onlyfun_account_unlock'){
        const next=this.nextAfter(steps,resolved);
        return this.command('UNLOCK_ONLYFUN_ACCOUNT',input,{...clone(step),operationId:opId,creatorId:step.creatorId||step.creator||step.authorId||step.accountId||step.id||'onlyfun',stepIndex:resolved.rootIndex,nextStepIndex:next.rootIndex,cursor:this.cursorFor(before,next,{operationId:opId,operationType:type,phase:'operation_committed'})},lease,opId);
      }

      if(type==='onlyfun_post'){
        const next=this.nextAfter(steps,resolved),post={...clone(step),id:String(step.id||step.onceKey||opId),onceKey:String(step.onceKey||step.id||opId),image:this.resolveOnlyfunImage(step,before)};
        return this.command('ADD_ONLYFUN_POST',input,{operationId:opId,post,stepIndex:resolved.rootIndex,nextStepIndex:next.rootIndex,cursor:this.cursorFor(before,next,{operationId:opId,operationType:type,phase:'operation_committed'})},lease,opId);
      }

      if(type==='hak_add_evidence'){
        const next=this.nextAfter(steps,resolved);
        const access=step.access&&typeof step.access==='object'?clone(step.access):null;
        if(access?.type==='skill'&&access.skillId==='hak_audio_transcription_v1'){
          const branchSkill=transcriptSkillForStory(before.execution.activeStoryPath,step);
          if(branchSkill)access.skillId=branchSkill;
        }
        const evidences=clone(step.evidences||step.items||[]).map(item=>access&&!item.access?{...item,access:clone(access)}:item);
        return this.command('ADD_HAK_EVIDENCE',input,{operationId:opId,profileId:step.profileId||step.contactId||before.execution.activeContactId,profile:clone(step.profile||{}),kind:step.kind||step.route||'',route:step.route||step.kind||'',access,evidences,stepIndex:resolved.rootIndex,nextStepIndex:next.rootIndex,cursor:this.cursorFor(before,next,{operationId:opId,operationType:type,phase:'operation_committed'})},lease,opId);
      }

      if(type==='hak_photo'||type==='hak_evidence'){
        const next=this.nextAfter(steps,resolved),photo={...clone(step),id:String(step.id||step.onceKey||opId),image:step.image||step.url||step.src||'',seen:false};
        return this.command('ADD_HAK_PHOTO',input,{operationId:opId,photo,stepIndex:resolved.rootIndex,nextStepIndex:next.rootIndex,cursor:this.cursorFor(before,next,{operationId:opId,operationType:type,phase:'operation_committed'})},lease,opId);
      }

      if(type==='gallery_add'){
        const next=this.nextAfter(steps,resolved),raw=step.photo&&typeof step.photo==='object'?step.photo:step;
        const url=String(raw.url||raw.image||raw.src||step.url||step.image||step.src||'').trim();
        const media={...clone(raw),url,ownerId:raw.ownerId||raw.characterId||raw.contactId||step.ownerId||step.characterId||step.contactId||step.fromId||step.from||before.execution.activeContactId,ownerName:raw.ownerName||raw.characterName||raw.contactName||step.ownerName||step.characterName||step.contactName||step.fromName||'',source:String(raw.source||raw.src||step.source||'story')};
        return this.command('UNLOCK_GALLERY_MEDIA',input,{operationId:opId,mediaId:String(raw.mediaId||raw.id||step.mediaId||step.id||''),media,stepIndex:resolved.rootIndex,nextStepIndex:next.rootIndex,cursor:this.cursorFor(before,next,{operationId:opId,operationType:type,phase:'operation_committed'})},lease,opId);
      }

      if(type==='hak_gate'){
        const next=this.nextAfter(steps,resolved);
        return this.command('SET_HAK_GATE',input,{operationId:opId,gateId:String(step.id||step.onceKey||opId),required:clone(step.required||[]),startStory:step.startStory||step.story||step.path||'',contactId:step.contactId||null,stepIndex:resolved.rootIndex,nextStepIndex:next.rootIndex,cursor:this.cursorFor(before,next,{operationId:opId,operationType:type,phase:'operation_committed'})},lease,opId);
      }

      if(type==='hak_watchlist'){
        const existing=before.hak?.receipts?.[opId],pendingIntent={kind:'hak_watchlist',eventId:opId,operationId:opId,sourceStepKey:path,config:clone(step)};
        if(!existing&&!Array.isArray(input.hakWatchlistSelected))return this.required('INPUT_REQUIRED',input,before,{type:'hak:watchlist-required',storyId:before.execution.activeStoryId,contactId:before.execution.activeContactId,stepIndex:resolved.rootIndex,operationId:opId,config:clone(step)},lease,this.cursorFor(before,resolved,{operationId:opId,operationType:type,phase:'waiting_for_user_intent',pendingUserIntent:pendingIntent}));
        const selected=existing?(before.hak?.watchlist?.selected||[]):input.hakWatchlistSelected,next=this.nextAfter(steps,resolved),targets=Array.isArray(step.targets)?Object.fromEntries(step.targets.map(t=>[String(t?.id||'').trim().toLowerCase(),selected.includes(String(t?.id||'').trim().toLowerCase())]).filter(([k])=>k)):{};
        return this.command('SET_HAK_WATCHLIST',input,{operationId:opId,selected,targets,availableTargetIds:Object.keys(targets),allowNone:step.allowNone!==false,config:clone(step),visible:step.revealApp===true||step.revealHakApp===true?true:undefined,stepIndex:resolved.rootIndex,nextStepIndex:next.rootIndex,cursor:this.cursorFor(before,next,{operationId:opId,operationType:type,phase:'operation_committed'})},lease,opId);
      }

      if(APP_UNLOCKS[type]){
        if(this.effects[type])await this.effects[type](clone(step),{lease,register:r=>this.register(lease,r)});
        if(!this.engine.validateLease(lease))return this.stale(input.commandId);
        const next=this.nextAfter(steps,resolved);
        return this.command('UNLOCK_APP',input,{appId:APP_UNLOCKS[type],stepIndex:resolved.rootIndex,nextStepIndex:next.rootIndex,cursor:this.cursorFor(before,next,{operationId:opId,operationType:type,phase:'operation_committed'})},lease,opId);
      }

      if(type==='route_lock'){const next=this.nextAfter(steps,resolved);return this.command('SET_ROUTE_LOCK',input,{contactId:step.contactId||before.execution.activeContactId,route:step.route,stepIndex:resolved.rootIndex,nextStepIndex:next.rootIndex,cursor:this.cursorFor(before,next,{operationId:opId,operationType:type,phase:'operation_committed'})},lease,opId);}
      if(type==='reward'||type==='points'){const next=this.nextAfter(steps,resolved);return this.command('RECORD_REWARD',input,{...clone(step),stepIndex:resolved.rootIndex,nextStepIndex:next.rootIndex,cursor:this.cursorFor(before,next,{operationId:opId,operationType:type,phase:'operation_committed'})},lease,opId);}
      if(VISUAL_EFFECTS.has(type))return this.effect(type,step,input,lease,resolved,opId);
      throw Object.assign(new Error(`Unsupported story step type: ${type}`),{code:'UNSUPPORTED_STEP'});
    }
    async activeStory(state){const key=String(state.execution.activeStoryId||'');if(this.storyCache.has(key))return this.storyCache.get(key);const path=state.execution.activeStoryPath;if(!path)throw Object.assign(new Error('active story path missing'),{code:'INVALID_GRAPH_TARGET'});const controller=new AbortController();this.resources.add(controller);const unregister=this.engine.registerResource(state.execution.lease.id,controller);try{const story=await this.loadStory(path,controller.signal);this.storyCache.set(key,story);return story;}finally{this.resources.delete(controller);unregister();}}
    async effect(type,step,input,lease,resolved,opId){
      const fn=this.effects[type];if(fn)await fn(clone(step),{lease,register:r=>this.register(lease,r)});
      if(!this.engine.validateLease(lease))return this.stale(input.commandId);
      const before=this.engine.getGameplayState(),story=await this.activeStory(before),steps=Array.isArray(story.steps)?story.steps:[];
      const next=this.nextAfter(steps,resolved);
      const pendingPresentationAck=type==='hak_overlay'?this.hakPresentation(step,opId):null;
      return this.command('COMMIT_STORY_EFFECT',input,{effectType:type,stepIndex:resolved.rootIndex,nextStepIndex:next.rootIndex,payload:clone(step),cursor:this.cursorFor(before,next,{operationId:opId,operationType:type,phase:pendingPresentationAck?'waiting_for_presentation':'operation_committed',pendingPresentationAck})},lease,opId);
    }
    resolveOnlyfunImage(step,state){const fallback=String(step?.image||step?.url||step?.photo||'').trim(),cfg=step?.imageVariant||step?.imageFromChoice||step?.imageByChoice;if(!cfg||typeof cfg!=='object')return fallback;const map=cfg.map||cfg.images||{},candidates=[cfg.variant,cfg.optionId,cfg.value,state?.world?.variables?.[cfg.storageKey||cfg.storeKey||cfg.flagKey||'']];const choiceKey=String(cfg.choiceKey||cfg.key||'');if(choiceKey){const receipt=state?.progression?.choiceReceipts?.[choiceKey];candidates.push(receipt?.optionId,receipt?.choiceId);}for(const value of candidates){const token=String(value||'').trim().toLowerCase().replace(/\s+/g,'_');if(token&&map[token])return String(map[token]);}return String(cfg.fallback||cfg.default||fallback);}
    routeStoryPath(rawPath,state){
      const path=String(rawPath||'').trim().replace(/\\/g,'/');
      if(!path)return path;
      const catalog=root.LogicalStoryRoutes||{};
      const slot=catalog[path]?[path,catalog[path]]:Object.entries(catalog).find(([,row])=>Object.values(row||{}).includes(path));
      if(!slot)return path;
      const [logicalPath,variants]=slot,metadata=root.LogicalStoryCatalog?.[logicalPath];
      // A scene name such as HAK is not its route owner. Generated ownership
      // comes from unanimous contact declarations in the physical stories.
      if(metadata?.ownerStatus&&metadata.ownerStatus!=='KNOWN')return path;
      const characterId=String(metadata?.ownerId||this.ownerFromPath(logicalPath)||'').toLowerCase();
      if(!characterId)return path;
      const assigned=state?.world?.variables?.[`route_${characterId}_locked_v1`]||state?.world?.routeLocks?.[characterId]||state?.world?.routes?.[characterId];
      if(!assigned&&!['evelyn','hailey','mason','lena'].includes(characterId)){
        const targets=[...new Set(Object.values(variants))];
        return targets.includes(path)?path:targets.length===1?String(targets[0]):path;
      }
      const route=String(assigned||'love').trim().toLowerCase(),folder=route.startsWith('nts')?'nts':route.startsWith('ntr')?'ntr':'love';
      return String(variants?.[folder]||path);
    }
    register(lease,resource){this.resources.add(resource);const unregister=this.engine.registerResource(lease.id,resource);return()=>{this.resources.delete(resource);unregister();};}
    delay(ms,lease,meta={}){const qaCap=Number(root.__CANONICAL_QA_DELAY_CAP_MS),duration=Number.isFinite(qaCap)&&qaCap>=0?Math.min(Math.max(0,ms),qaCap):Math.max(0,ms);const controller=root.PresentationController;if(controller&&typeof controller.wait==='function'){const pending=controller.wait(duration,meta);const cleanup=this.register(lease,()=>controller.cancelForRemount('lease_cancelled'));return Promise.resolve(pending).finally(cleanup);}return new Promise(resolve=>{let cleanup=()=>{};const timer=setTimeout(()=>{cleanup();resolve();},duration);cleanup=this.register(lease,()=>{clearTimeout(timer);resolve();});});}
    // Delegates all parsing/dispatch to the single shared grammar
    // (scripts/engine/condition-grammar.js) instead of a third independent
    // implementation -- see that file's header for why duplicating this
    // grammar is specifically what caused the all:/any: production bug.
    // This accessor is canonical-only (no legacy localStorage fallback,
    // unlike the live runtime's accessor). choice: is now canonical (Group
    // 2: progression.choiceReceipts, immutable per choiceGroupId -- see
    // RECORD_CHOICE_DECISION); hak_target: remains a domain with no
    // canonical home yet (Group 5), so it still throws
    // CONDITION_NOT_YET_CANONICAL rather than guessing.
    conditionAccessor(state){return ConditionGrammar.canonicalAccessor(state);}
    condition(step,state){const key=String(step.condition||step.key||step.flag||step.if||'');const value=ConditionGrammar.evaluateCondition(key,this.conditionAccessor(state));return step.equals!==undefined?value===step.equals:!!value;}
    command(type,input,payload,lease,opId){
      if(!this.engine.validateLease(lease))return this.stale(input.commandId);
      const revision=this.engine.getRevision();
      const opKey=opId||(payload&&payload.cursor&&payload.cursor.operationId)||`${this.engine.getExecutionState().activeStepIndex}`;
      const command={type,commandId:input.commandId||`${lease.id}:${opKey}:${type}:${fingerprint(payload)}`,expectedRevision:revision,leaseId:lease.id,payload};
      const result=this.engine.dispatch(command);
      const semanticDuplicateEvidence=(this.engine.verifySemanticDuplicateInvariant||this.engine.verifySemanticDuplicate)?.call(this.engine,command,result);
      // Non-persisted execution metadata for reconciliation. A duplicate
      // command receipt proves the operation already committed, but a save or
      // legacy renderer may still restore the cursor behind that receipt. The
      // shared runtime can use the interpreter-derived intended cursor to
      // repair that mismatch canonically without reapplying the operation.
      const reconciliable=semanticDuplicateEvidence?.verified===true?{...result,semanticDuplicateEvidence,semanticDuplicateCommand:clone(command)}:result;
      return payload&&payload.cursor?{...reconciliable,intendedCursor:clone(payload.cursor),intendedNextStepIndex:payload.nextStepIndex}:reconciliable;
    }
    // A step awaiting player input (choice/continue) does not advance the
    // cursor's position -- but it DOES persist the waiting_for_user_intent
    // phase/pendingUserIntent onto the canonical cursor (via a same-position
    // COMMIT_STORY_STEP, deterministic commandId so repeated polling while
    // waiting dedupes to the same receipt) so that state is real, queryable
    // canonical state a renderer or a save/relaunch can observe, not just
    // this call's return value. The interpreter-level result still reports
    // ok:false/status so callers keep treating it as "blocked on input,"
    // regardless of the underlying persistence commit's own success.
    required(status,input,before,event,lease,cursor){
      if(lease&&cursor)this.command('COMMIT_STORY_STEP',input,{stepIndex:cursor.rootIndex,nextStepIndex:cursor.rootIndex,cursor},lease,cursor.operationId);
      const after=this.engine.getGameplayState();
      return{ok:false,status,commandId:input.commandId||'',previousRevision:before.revision,nextRevision:after.revision,events:[event],error:null};
    }
    stale(commandId){const state=this.engine.getGameplayState();return{ok:false,status:'STALE_OPERATION',commandId:commandId||'',previousRevision:state.revision,nextRevision:state.revision,events:[],error:{code:'STALE_OPERATION',message:'execution lease is no longer active'}};}
    ownerFromPath(path){const match=String(path||'').match(/_(aiden|evelyn|hailey|mason|lena|tutor)(?:_|\.)/i);return match?match[1].toLowerCase():null;}
    async targetDescriptor(path,explicitContact){let targetStory=null;try{targetStory=await this.loadStory(path);if(targetStory){this.storyCache.set(String(path),targetStory);if(targetStory.id||targetStory.onceKey)this.storyCache.set(String(targetStory.id||targetStory.onceKey),targetStory);}}catch{}return{storyId:String(targetStory?.id||targetStory?.onceKey||path),onceKey:String(targetStory?.onceKey||''),requirements:ConditionGrammar.storyRequirements(targetStory),contactId:String(explicitContact||targetStory?.contactId||targetStory?.contact||targetStory?.owner||this.ownerFromPath(path)||'').trim().toLowerCase()||null};}
    async ownerForTarget(path,explicit){if(explicit)return String(explicit).trim().toLowerCase();const inferred=this.ownerFromPath(path);if(inferred)return inferred;try{const story=await this.loadStory(path);return String(story?.contactId||story?.contact||story?.owner||'').trim().toLowerCase()||null;}catch{return null;}}
    cancel(){const state=this.engine.getGameplayState();for(const resource of this.resources)try{resource.abort?.();typeof resource==='function'&&resource();}catch{}this.resources.clear();if(state.execution.lease)return this.engine.dispatch({type:'RELEASE_LEASE',commandId:`cancel:${state.execution.lease.id}`,expectedRevision:state.revision,payload:{}});return{ok:true,status:'IDLE'};}
    getDiagnostics(){const state=this.engine.getGameplayState();return{instanceCount:StoryInterpreter.activeCount,activeInterpreterId:StoryInterpreter.activeId,activeLeaseId:state.execution.lease?.id||null,currentStory:state.execution.activeStoryId,currentStep:state.execution.activeStepIndex,cursor:state.execution.cursor||null,blocked:state.execution.blocked||null,pendingOperationCount:this.pending.size,ownedResourceCount:this.resources.size};}
    assertLive(){if(this.destroyed)throw new Error('StoryInterpreter is destroyed');}
    destroy(){if(this.destroyed)return;this.cancel();this.destroyed=true;StoryInterpreter.activeCount=0;StoryInterpreter.activeId=null;}
  }
  return{StoryInterpreter,MESSAGE,VISUAL_EFFECTS};
});
