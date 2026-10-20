'use strict';
const fs=require('fs'),path=require('path');

// Any userData folder name this game (or an ancestor chapter/version of it)
// has ever shipped under. The canonical profile name must never be added
// here -- it is excluded from candidates by identity comparison in
// migrateHistoricalUserData, so listing it is harmless, but it does not
// belong conceptually once it is the live identity.
const HISTORICAL_USER_DATA_NAMES=Object.freeze(['intercepted-chapter2','iNTeRcepted - Chapter 2','intercepted-chapter1-v4','intercepted-chapter1-v3','intercepted-chapter1-v2','intercepted-chapter1v2','intercepted-chapter1','intercepted-chapter1-v1','iNTeRcepted - Chapter 1 v2','iNTeRcepted - Chapter 1','iNTeRcepted','Intercepted Demo','intercepted-demo']);
const DURABLE_KEYS=Object.freeze(['saves_v2','gallery_photos','savedPhotos','achievements_v1','achievement_meta_v1','hak_evidence_v1','hak_profiles_v1','hak_skills_v1','card_vault_state_v1','card_vault_state_backup_v1','entitlement_redemption_ledger_v1','entitlement_redemption_ledger_backup_v1','patreon_release_unlock_v1','patreon_master_unlock_v1','patreon_mason_day9_15_unlock_v1','patreon_evelyn_day9_15_unlock_v1','patreon_hailey_day16_20_unlock_v1','patreon_lena_day16_20_unlock_v1','gallery_full_unlock_v1','settings_language','settings_v1','wallpaper_v1','accessibility_v1']);
const TRANSIENT=/^(?:pending_|conv_|once_|__once:|active_character:|story_runtime|notification|loading|__boot_|openConversationId|activeConversationId)/i;
const EXPORT_NAMES=['intercepted-durable-export.json','durable-storage-export.json','local-storage-export.json'];

// Chromium storage directories that actually hold the game's durable state
// (localStorage). "Session Storage" is intentionally excluded: it backs
// non-durable, per-session data by Chromium's own contract, matching the
// same durable/transient split this module already applies to keys.
const STORAGE_SUBPATHS=Object.freeze(['Local Storage','IndexedDB']);

function directoryHasFiles(dir){try{return fs.statSync(dir).isDirectory()&&fs.readdirSync(dir).length>0;}catch{return false;}}
function directoryContainsProgressionData(dir){return directoryHasFiles(dir);}
function safeJson(file){try{return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}catch{return null;}}
function sanitize(source){const values=source?.values||source?.storage||source||{},durable={},discarded=[];for(const[key,value]of Object.entries(values)){if(DURABLE_KEYS.includes(key))durable[key]=value;else if(TRANSIENT.test(key))discarded.push(key);}return{durable,discarded};}
function reportPath(current){return path.join(current,'logs','user-data-migration.json');}
function writeReport(current,report){try{fs.mkdirSync(path.join(current,'logs'),{recursive:true});fs.writeFileSync(reportPath(current),JSON.stringify({...report,at:new Date().toISOString()},null,2),'utf8');}catch{}}

function resolveCandidateDirs(appDataDir,current,names){
  return names.map(name=>path.resolve(appDataDir,String(name))).filter(candidate=>candidate.toLowerCase()!==current.toLowerCase()&&fs.existsSync(candidate));
}

function leveldbNonEmpty(dir){
  const leveldb=path.join(dir,'Local Storage','leveldb');
  try{return fs.statSync(leveldb).isDirectory()&&fs.readdirSync(leveldb).length>0;}catch{return false;}
}

// "Most recently written" is used as the sole tie-break between multiple
// legacy profiles with real data, instead of any hardcoded name/version
// ordering -- so this keeps working unmodified for every future chapter or
// version without ever needing another literal name added to a priority list.
function newestStorageMtimeMs(dir){
  const leveldb=path.join(dir,'Local Storage','leveldb');
  let newest=0;
  try{
    for(const entry of fs.readdirSync(leveldb)){
      try{const stat=fs.statSync(path.join(leveldb,entry));if(stat.mtimeMs>newest)newest=stat.mtimeMs;}catch{}
    }
  }catch{}
  return newest;
}

// Copies real Chromium storage (not a hand-picked subset of keys) from
// `sourceDir` into `destDir`, staged in a temp folder and published via
// rename so a crash or I/O error mid-copy can never leave a half-written
// storage directory behind for either profile.
function copyStorageDirectories(sourceDir,destDir){
  const stagingDir=path.join(destDir,`.migration-staging-${process.pid}-${Date.now()}`);
  try{
    fs.mkdirSync(stagingDir,{recursive:true});
    let copiedAny=false;
    for(const sub of STORAGE_SUBPATHS){
      const src=path.join(sourceDir,sub);
      if(!fs.existsSync(src))continue;
      fs.cpSync(src,path.join(stagingDir,sub),{recursive:true,force:true,errorOnExist:false});
      copiedAny=true;
    }
    if(!copiedAny){fs.rmSync(stagingDir,{recursive:true,force:true});return{copied:false,reason:'no_storage_subpaths'};}
    for(const sub of STORAGE_SUBPATHS){
      const stagedSub=path.join(stagingDir,sub);
      if(!fs.existsSync(stagedSub))continue;
      const finalSub=path.join(destDir,sub);
      if(fs.existsSync(finalSub))continue; // never clobber storage that already landed there
      fs.renameSync(stagedSub,finalSub);
    }
    fs.rmSync(stagingDir,{recursive:true,force:true});
    return{copied:true};
  }catch(err){
    try{fs.rmSync(stagingDir,{recursive:true,force:true});}catch{}
    return{copied:false,reason:'copy_failed',error:String(err&&err.message||err)};
  }
}

function migrateHistoricalUserData(options={}){
  const appDataDir=path.resolve(String(options.appDataDir||'')),current=path.resolve(String(options.currentUserData||''));
  if(!options.appDataDir||!options.currentUserData)return{migrated:false,reason:'invalid_paths'};

  // Exactly-once gate: this only ever runs its decision on the first launch
  // of a given canonical profile, before that profile can hold any real
  // gameplay data of its own -- every later launch short-circuits here, so
  // a canonical profile with its own history can never be overwritten by an
  // older legacy one.
  const prior=safeJson(reportPath(current));
  if(prior?.completed===true)return{migrated:false,reason:'already_migrated',source:prior.source,currentUserData:current};

  const names=options.historicalNames?.length?options.historicalNames:HISTORICAL_USER_DATA_NAMES;
  const candidates=resolveCandidateDirs(appDataDir,current,names);

  // Preferred path: copy real Chromium storage wholesale from whichever
  // legacy profile actually has it, so every durable key this game has ever
  // written -- known to this module or not -- survives the move untouched.
  const storageCandidates=candidates
    .filter(leveldbNonEmpty)
    .map(dir=>({dir,mtime:newestStorageMtimeMs(dir)}))
    .sort((a,b)=>b.mtime-a.mtime);

  if(storageCandidates.length){
    const selected=storageCandidates[0].dir;
    const copy=copyStorageDirectories(selected,current);
    if(copy.copied){
      const result={migrated:true,completed:true,reason:'storage_directory_copy',source:selected,currentUserData:current,originalUntouched:true,otherCandidates:storageCandidates.slice(1).map(c=>c.dir)};
      writeReport(current,result);
      return result;
    }
    // A failed copy is not latched as completed: the exactly-once gate above
    // only fires once a report exists, so leaving no report here means the
    // next launch retries instead of being permanently stuck on a fresh
    // profile after a transient I/O failure.
    return{migrated:false,completed:false,reason:copy.reason||'copy_failed',source:selected,currentUserData:current,error:copy.error};
  }

  // Fallback: no legacy profile has real Chromium storage on disk (e.g. a
  // profile that only ever produced a portable durable-state export).
  let selected=null,parsed=null,exportFile=null;
  for(const candidate of candidates){
    for(const name of EXPORT_NAMES){const file=path.join(candidate,name),value=safeJson(file);if(value){selected=candidate;parsed=value;exportFile=file;break;}}
    if(parsed)break;
  }
  if(!parsed){const result={migrated:false,completed:true,reason:candidates.length?'no_selective_export':'no_historical_storage',currentUserData:current,candidates};writeReport(current,result);return result;}
  const clean=sanitize(parsed);fs.mkdirSync(current,{recursive:true});const destination=path.join(current,'durable-import-v4.json');fs.writeFileSync(destination,JSON.stringify({version:1,source:selected,values:clean.durable},null,2),'utf8');const result={migrated:Object.keys(clean.durable).length>0,completed:true,reason:'selective_durable_import',source:selected,sourceExport:exportFile,currentUserData:current,destination,importedKeys:Object.keys(clean.durable),discardedTransientKeys:clean.discarded,originalUntouched:true};writeReport(current,result);return result;
}

module.exports={HISTORICAL_USER_DATA_NAMES,DURABLE_KEYS,TRANSIENT,EXPORT_NAMES,STORAGE_SUBPATHS,directoryHasFiles,directoryContainsProgressionData,sanitize,leveldbNonEmpty,migrateHistoricalUserData};
