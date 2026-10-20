(function(root){
  'use strict';
  const DB_NAME='intercepted_save_storage',DB_VERSION=1,SLOT_STORE='save_slots',META_STORE='metadata',STORE_KEY='saves_v2',AUTHORITY_KEY='save_storage_authority_v1';
  const fail=(code,cause)=>Object.assign(new Error(code),{code,cause});
  const request=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||fail('PERSISTENCE_BACKEND_UNAVAILABLE'));});
  const transactionDone=tx=>new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||fail('PERSISTENCE_WRITE_FAILED'));tx.onerror=()=>{};});
  const normalizeError=error=>{if(error?.code&&String(error.code).startsWith('PERSISTENCE_'))return error;const name=String(error?.name||'');if(name==='QuotaExceededError')return fail('PERSISTENCE_STORAGE_FULL',error);if(name==='InvalidStateError'||name==='NotSupportedError'||name==='SecurityError')return fail('PERSISTENCE_BACKEND_UNAVAILABLE',error);return fail('PERSISTENCE_WRITE_FAILED',error);};
  const migrationHook=(point,details={})=>{if(typeof root.__SAVE_STORAGE_MIGRATION_PROGRESS==='function')root.__SAVE_STORAGE_MIGRATION_PROGRESS(String(point),details);if(typeof root.__SAVE_STORAGE_MIGRATION_QA_HOOK==='function')root.__SAVE_STORAGE_MIGRATION_QA_HOOK(String(point),details);};
  function openDatabase(){return new Promise((resolve,reject)=>{if(!root.indexedDB){reject(fail('PERSISTENCE_BACKEND_UNAVAILABLE'));return;}const req=root.indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(SLOT_STORE))db.createObjectStore(SLOT_STORE,{keyPath:'id'});if(!db.objectStoreNames.contains(META_STORE))db.createObjectStore(META_STORE,{keyPath:'key'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(normalizeError(req.error));req.onblocked=()=>reject(fail('PERSISTENCE_BACKEND_UNAVAILABLE'));});}
  // Every save used to re-serialize the whole store on read and clear+rewrite
  // every slot and the shared authority pool on write, so a Quick Save (and
  // each automatic checkpoint) cost O(total saves): multi-second main-thread
  // freezes on Android by mid-game. Writes stay one atomic transaction but
  // only touch slots whose content signature changed.
  // Signature: slot metadata JSON (id, type, label, updatedAt, checksum, ...)
  // plus the snapshot's sealed integrity checksum, capture time and source
  // revision. SaveSystem reseals every snapshot it changes, so this identifies
  // content without serializing multi-megabyte snapshots; snapshots without a
  // seal fall back to their full JSON.
  function slotSignature(slot){
    if(!slot||typeof slot!=='object'||Array.isArray(slot))return 'raw:'+JSON.stringify(slot);
    const {snapshot,...meta}=slot,seal=snapshot&&typeof snapshot==='object'?snapshot.integrity:null;
    const body=seal&&seal.checksum?`sealed:${seal.algorithm||''}:${seal.checksum}:${snapshot.createdAt||''}:${snapshot.source?.revision??''}:${snapshot.saveSchemaVersion??''}`:'full:'+JSON.stringify(snapshot);
    return JSON.stringify(meta)+'|'+body;
  }
  // The authority pool is content-addressed (key = checksum:length:suffix and
  // never rewritten under an existing key), so its key list identifies it.
  function envelopeSignature(version,envelope,count){
    const {internalAuthorityRecords,...rest}=envelope||{};
    return JSON.stringify({version,count,rest,pool:internalAuthorityRecords&&typeof internalAuthorityRecords==='object'?Object.keys(internalAuthorityRecords):null});
  }
  const slotKey=slot=>slot&&typeof slot==='object'?slot.id:undefined;
  const frozenObjects=new WeakSet();
  function freezeTree(value){if(!value||typeof value!=='object'||frozenObjects.has(value))return value;for(const child of Object.values(value))freezeTree(child);Object.freeze(value);frozenObjects.add(value);return value;}
  // IDB owns these detached rows until open() resolves. Yield between bounded
  // chunks while freezing them; no caller sees a partially immutable store.
  // The old recursive walk blocked the renderer for seconds on retained saves.
  async function freezeLoadedTrees(values){
    const stack=values.slice(),now=()=>root.performance?.now?.()??Date.now();
    let deadline=now()+8,work=0,channel=null,resume=null;
    const pause=()=>{
      if(typeof root.scheduler?.yield==='function')return root.scheduler.yield();
      if(typeof root.MessageChannel==='function'){
        if(!channel){channel=new root.MessageChannel();channel.port1.onmessage=()=>{const done=resume;resume=null;done();};}
        return new Promise(resolve=>{resume=resolve;channel.port2.postMessage(0);});
      }
      return new Promise(resolve=>root.setTimeout(resolve,0));
    };
    try{
      while(stack.length){
        // Shared references can leave a long tail of already frozen entries.
        // They must consume the same task budget as newly visited objects.
        if(now()>=deadline){await pause();deadline=now()+8;}
        const value=stack.pop();
        if(!value||typeof value!=='object'||frozenObjects.has(value))continue;
        Object.freeze(value);frozenObjects.add(value);
        for(const child of Object.values(value)){
          if(child&&typeof child==='object'&&!frozenObjects.has(child))stack.push(child);
          if(++work%256===0&&now()>=deadline){await pause();deadline=now()+8;}
        }
        if(++work%256===0&&now()>=deadline){await pause();deadline=now()+8;}
      }
    }finally{channel?.port1.close();channel?.port2.close();}
  }
  function readSlotRows(tx,visit=null){
    const store=tx.objectStore(SLOT_STORE);
    // Native IndexedDB provides openCursor. Keep the old read facade usable for
    // injected storage backends without batching every real save into one clone.
    if(typeof store.openCursor!=='function')return request(store.getAll()).then(rows=>{if(visit){for(const row of rows)visit(row);return null;}return rows;});
    return new Promise((resolve,reject)=>{
      const rows=visit?null:[],req=store.openCursor();
      req.onerror=()=>reject(req.error||fail('PERSISTENCE_BACKEND_UNAVAILABLE'));
      req.onsuccess=()=>{
        try{const cursor=req.result;if(!cursor){resolve(rows);return;}if(visit)visit(cursor.value);else rows.push(cursor.value);cursor.continue();}
        catch(error){reject(error);try{tx.abort();}catch{}}
      };
    });
  }
  const detached=value=>JSON.parse(JSON.stringify(value));
  // Migration must compare complete JSON values, including sealed snapshots.
  // Retaining every row's JSON (or serializing the shared authority envelope)
  // creates another store-sized string allocation. Walk one value at a time;
  // frames hold only the keys on the current path, never serialized bodies.
  function sameJsonValue(left,right){
    const stack=[{left,right,keys:null,index:0}];
    while(stack.length){
      const frame=stack[stack.length-1],a=frame.left,b=frame.right;
      if(a===b){stack.pop();continue;}
      if(!frame.keys){
        if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
        if(Array.isArray(a)&&a.length!==b.length)return false;
        frame.keys=Object.keys(a);frame.otherKeys=Object.keys(b);
        if(frame.keys.length!==frame.otherKeys.length)return false;
      }
      if(frame.index===frame.keys.length){stack.pop();continue;}
      const index=frame.index++,key=frame.keys[index];
      if(key!==frame.otherKeys[index])return false;
      stack.push({left:a[key],right:b[key],keys:null,index:0});
    }
    return true;
  }
  class IndexedDbSaveStorageAdapter{
    constructor(db,localStorage,slots,version=6,migrationState=null,envelope=null,count=null,committedAt=0){this.committedAt=Math.max(0,Number(committedAt)||0);this.db=db;this.storage=localStorage;this.slots=freezeTree(slots);this.version=version;this.migrationState=migrationState;this.envelope=freezeTree(envelope||{version,slots:[]});this.backend='indexedDB';this.storeJson=null;this._trackCommitted(count==null&&!envelope?null:count);}
    // Mirrors exactly what the last committed transaction left in IndexedDB.
    _trackCommitted(count){this.committedCount=count;this.signatures=new Map();for(const slot of this.slots)this.signatures.set(slotKey(slot),slotSignature(slot));this.metaSignature=count==null?null:envelopeSignature(this.version,this.envelope,count);}
    async writeTransaction(stores,write){let tx,done;try{tx=this.db.transaction(stores,'readwrite');done=transactionDone(tx);write(tx);await done;}catch(error){try{tx?.abort();}catch{}if(done)await done.catch(()=>{});throw normalizeError(error);}}
    static async open(localStorage){
      const db=await openDatabase();let done;
      try{
        const tx=db.transaction([SLOT_STORE,META_STORE],'readonly');done=transactionDone(tx);
        const [slots,meta,migration]=await Promise.all([readSlotRows(tx),request(tx.objectStore(META_STORE).get('save_store')),request(tx.objectStore(META_STORE).get('migration_state'))]);
        await done;
        const rows=Array.isArray(slots)?slots:[],envelope=meta?.envelope||null;
        await freezeLoadedTrees([rows,envelope]);
        return new IndexedDbSaveStorageAdapter(db,localStorage,rows,Number(meta?.version)||6,migration||null,envelope,meta?Number(meta.count??rows.length):null,meta?.updatedAt);
      }catch(error){if(done)await done.catch(()=>{});try{db.close();}catch{}throw normalizeError(error);}
    }
    // The store JSON is immutable once committed; readers parse their own
    // copy, so the committed string is returned instead of re-serializing.
    get(key){if(key===STORE_KEY){if(this.storeJson==null)this.storeJson=JSON.stringify({...this.envelope,version:this.version,slots:this.slots});return this.storeJson;}if(key===AUTHORITY_KEY)return'indexedDB';return this.storage.getItem(key);}
    // SaveSystem mutates only these small containers. Committed snapshots and
    // authority records are immutable and shared until a particular row changes.
    // Catalog reads and checkpoints never stringify/parse the complete save set.
    getStore(){return{...this.envelope,version:this.version,slots:this.slots.slice(),...(this.envelope.internalAuthorityRecords?{internalAuthorityRecords:{...this.envelope.internalAuthorityRecords}}:{})};}
    getSlotRows(){return this.slots;}
    isImmutableRecord(record){return frozenObjects.has(record);}
    set(key,value){if(key!==STORE_KEY)return this.storage.setItem(key,String(value));return this.setSlots(value);}
    async setSlots(value){
      const text=String(value);let parsed;try{parsed=JSON.parse(text);}catch(error){throw fail('PERSISTENCE_WRITE_FAILED',error);}
      return this.setStore(parsed,text);
    }
    async setStore(parsed,committedJson=null){
      const slots=Array.isArray(parsed)?parsed:Array.isArray(parsed?.slots)?parsed.slots:null;if(!slots)throw fail('PERSISTENCE_WRITE_FAILED');
      const envelope=Array.isArray(parsed)?{version:6,slots:[]}:{...parsed,slots:[]},version=Number(parsed?.version)||6;
      const signatures=new Map(),puts=[],committedById=new Map(this.slots.map(slot=>[slotKey(slot),slot])),nextSlots=[];
      for(const slot of slots){const id=slotKey(slot),signature=slotSignature(slot);signatures.set(id,signature);const unchanged=this.signatures.get(id)===signature,committed=unchanged?committedById.get(id):null,row=committed||freezeTree(detached(slot));nextSlots.push(row);if(!unchanged)puts.push(row);}
      // Copy only newly introduced authority records. Existing immutable records
      // remain shared; a failed transaction cannot modify the committed pool.
      const {internalAuthorityRecords,...rest}=envelope,nextEnvelope=detached(rest);
      if(internalAuthorityRecords&&typeof internalAuthorityRecords==='object')nextEnvelope.internalAuthorityRecords=Object.fromEntries(Object.entries(internalAuthorityRecords).map(([key,record])=>{const prior=this.envelope.internalAuthorityRecords?.[key];if(prior){if(record!==prior&&JSON.stringify(record)!==JSON.stringify(prior))throw fail('PERSISTENCE_WRITE_FAILED');return[key,prior];}return[key,freezeTree(detached(record))];}));
      freezeTree(nextEnvelope);freezeTree(nextSlots);
      // Duplicate ids keep clear()+put() semantics: the last row wins.
      const deletes=[...this.signatures.keys()].filter(id=>!signatures.has(id)),metaSignature=envelopeSignature(version,nextEnvelope,nextSlots.length),writeMeta=metaSignature!==this.metaSignature,committedAt=writeMeta?Date.now():this.committedAt;
      if(puts.length||deletes.length||writeMeta)await this.writeTransaction([SLOT_STORE,META_STORE],tx=>{const store=tx.objectStore(SLOT_STORE);for(const id of deletes)store.delete(id);for(const slot of puts)store.put(slot);if(writeMeta)tx.objectStore(META_STORE).put({key:'save_store',version,envelope:nextEnvelope,count:nextSlots.length,updatedAt:committedAt});});
      this.slots=nextSlots;this.version=version;this.envelope=nextEnvelope;this.signatures=signatures;this.committedCount=nextSlots.length;this.committedAt=committedAt;this.metaSignature=metaSignature;this.storeJson=committedJson;
      this.lastWrite={puts:puts.length,deletes:deletes.length,meta:writeMeta};
    }
    remove(key){if(key!==STORE_KEY)return this.storage.removeItem(key);return this.removeSlots();}
    async removeSlots(){const committedAt=Date.now();await this.writeTransaction([SLOT_STORE,META_STORE],tx=>{tx.objectStore(SLOT_STORE).clear();tx.objectStore(META_STORE).put({key:'save_store',version:6,envelope:{version:6,slots:[]},count:0,updatedAt:committedAt});});this.slots=freezeTree([]);this.version=6;this.envelope=freezeTree({version:6,slots:[]});this.storeJson=null;this.committedAt=committedAt;this._trackCommitted(0);}
    async setMigrationState(phase,extra={}){const record={key:'migration_state',version:1,phase:String(phase),updatedAt:Date.now(),...extra};await this.writeTransaction(META_STORE,tx=>tx.objectStore(META_STORE).put(record));this.migrationState=record;return record;}
    async verifyImportedStore(sourceById,envelope,version,count){
      let tx,done;
      try{
        tx=this.db.transaction([SLOT_STORE,META_STORE],'readonly');done=transactionDone(tx);
        const seen=new Set(),[,meta]=await Promise.all([readSlotRows(tx,slot=>{const id=String(slot?.id||'');if(seen.has(id)||!sourceById.has(id)||!sameJsonValue(sourceById.get(id),slot))throw fail('PERSISTENCE_WRITE_FAILED');seen.add(id);}),request(tx.objectStore(META_STORE).get('save_store'))]);
        await done;
        if(seen.size!==count||!meta||Number(meta.version)!==version||Number(meta.count)!==count||!sameJsonValue(meta.envelope,envelope))throw fail('PERSISTENCE_WRITE_FAILED');
      }catch(error){try{tx?.abort();}catch{}if(done)await done.catch(()=>{});throw normalizeError(error);}
    }
    async importLegacy(raw){
      if(!raw){await this.setMigrationState('verified',{count:this.slots.length});return{ok:true,migrated:false,count:this.slots.length};}
      let parsed;try{parsed=JSON.parse(raw);}catch(error){throw fail('PERSISTENCE_WRITE_FAILED',error);}
      const slots=Array.isArray(parsed)?parsed:parsed?.slots;if(!Array.isArray(slots))throw fail('PERSISTENCE_WRITE_FAILED');
      const version=Number(parsed?.version)||6,envelope=Array.isArray(parsed)?{version,slots:[]}:{...parsed,slots:[]};
      const sourceById=new Map(slots.map(slot=>[String(slot?.id||''),slot])),targetMatches=sameJsonValue(envelope,this.envelope)&&this.slots.length===slots.length&&this.slots.every(slot=>sameJsonValue(sourceById.get(String(slot?.id||'')),slot));
      if(targetMatches){await this.setMigrationState('verified',{count:slots.length});return{ok:true,migrated:false,idempotent:true,count:slots.length};}
      const committedAt=Date.now();
      await this.writeTransaction([SLOT_STORE,META_STORE],tx=>{
        const store=tx.objectStore(SLOT_STORE);store.clear();
        migrationHook('before_first_slot_write',{expected:slots.length,copied:0});
        for(let i=0;i<slots.length;i++){store.put(slots[i]);if(i===0)migrationHook('after_first_slot_write',{expected:slots.length,copied:1});if(i+1===Math.ceil(slots.length/2))migrationHook('halfway_through_copy',{expected:slots.length,copied:i+1});}
        tx.objectStore(META_STORE).put({key:'save_store',version,envelope,count:slots.length,updatedAt:committedAt});
      });
      migrationHook('after_all_slot_writes_before_verification',{expected:slots.length,copied:slots.length});
      // Verify committed records in a second transaction before publishing the
      // new cache. Cursor rows are compared and discarded one at a time.
      await this.verifyImportedStore(sourceById,envelope,version,slots.length);
      this.slots=freezeTree(slots);this.version=version;this.envelope=freezeTree(envelope);this.storeJson=null;this.committedAt=committedAt;this._trackCommitted(slots.length);
      await this.setMigrationState('verified',{count:slots.length});return{ok:true,migrated:true,count:slots.length};
    }
    close(){try{this.db.close();}catch{}}
  }
  root.IndexedDbSaveStorageAdapter=IndexedDbSaveStorageAdapter;
  root.SaveStorageIndexedDb={DB_NAME,DB_VERSION,SLOT_STORE,META_STORE,STORE_KEY,AUTHORITY_KEY,normalizeError};
})(typeof window!=='undefined'?window:globalThis);
