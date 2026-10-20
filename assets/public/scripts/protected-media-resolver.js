(function(root){"use strict";
  const BASE="assets/protected-media/",phrase="intercepted-protected-media-v1-runtime-capability";
  let manifestPromise=null,keyPromise=null,resolverGeneration=0;const cache=new Map(),pendingRecords=new Map(),ownedUrls=new Set(),events=[],sourceAssignments=new WeakMap(),imageListeners=new WeakMap();
  const retired=()=>Object.assign(new Error('Media resolution retired'),{code:'MEDIA_RESOLUTION_RETIRED'});
  function beginAssignment(element){const token={generation:resolverGeneration,wasConnected:!!element.isConnected};sourceAssignments.set(element,token);return token;}
  function assignmentCurrent(element,token){return sourceAssignments.get(element)===token&&token.generation===resolverGeneration&&(!token.wasConnected||element.isConnected);}
  function hashPath(value){let h=2166136261;const text=String(value||"").replace(/\\/g,"/").replace(/^\.\//,"").replace(/^\/+/,"").split(/[?#]/)[0].toLowerCase();for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(16).padStart(8,"0");}
  function note(event){events.push({...event,at:Date.now()});if(events.length>80)events.shift();}
  function fromBase64(value){const raw=atob(String(value||"")),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;}
  async function read(name){if(root.protectedMedia&&typeof root.protectedMedia.read==="function"){const response=await root.protectedMedia.read(name);if(!response?.ok)throw new Error(response?.error||"protected media unavailable");return fromBase64(response.bytes);}const response=await fetch(new URL(BASE+name,document.baseURI).href);if(!response.ok)throw new Error("protected media unavailable");return new Uint8Array(await response.arrayBuffer());}
  const manifest=()=>manifestPromise||(manifestPromise=read("manifest.json").then(bytes=>JSON.parse(new TextDecoder().decode(bytes))).then(value=>{note({type:"manifest",found:true,transport:root.protectedMedia?"ipc":"fetch"});return value;}).catch(error=>{note({type:"manifest",found:false,error:String(error?.message||error)});return null;}));
  const key=()=>keyPromise||(keyPromise=crypto.subtle.digest("SHA-256",new TextEncoder().encode(phrase)).then(bytes=>crypto.subtle.importKey("raw",bytes,{name:"AES-GCM"},false,["decrypt"])));
  function canonicalMediaPath(raw){const source=normalizePath(raw);if(!source||/^(?:data:|blob:|https?:)/i.test(source))return source;try{if(/(?:^|\/)assets\/avatars\/(?:mason(?:_female)?|male_mason|female_mason)\.jpg(?:[?#].*)?$/i.test(source))return normalizePath(root.MasonVariantService?.resolveAvatar?.("mason",source)||source);return normalizePath(root.MasonVariantService?.resolveImage?.(source,"mason")||source);}catch{return source;}}
  async function resolve(raw){const generation=resolverGeneration,requested=String(raw||""),source=canonicalMediaPath(requested);if(!source||/^(?:data:|blob:|https?:)/i.test(source))return source;const m=await manifest();if(generation!==resolverGeneration)throw retired();const row=m?.records?.[hashPath(source)];if(!row){note({type:"resolve",requestedPath:normalizePath(requested),logicalPath:source,protected:false,finalUrl:source});return source;}if(cache.has(row.record))return cache.get(row.record);if(pendingRecords.has(row.record))return pendingRecords.get(row.record);const task=(async()=>{try{const bytes=await read(row.record);if(generation!==resolverGeneration)throw retired();const sealed=new Uint8Array(bytes.length-12);sealed.set(bytes.slice(28),0);sealed.set(bytes.slice(12,28),bytes.length-28);const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:bytes.slice(0,12),tagLength:128},await key(),sealed);if(generation!==resolverGeneration)throw retired();const url=URL.createObjectURL(new Blob([plain],{type:row.mime||"application/octet-stream"}));cache.set(row.record,url);ownedUrls.add(url);note({type:"resolve",requestedPath:normalizePath(requested),logicalPath:source,protected:true,record:row.record,bytes:row.bytes,mime:row.mime,finalUrl:url,loaded:true});return url;}catch(error){note({type:"resolve",requestedPath:normalizePath(requested),logicalPath:source,protected:true,record:row.record,loaded:false,retired:error?.code==='MEDIA_RESOLUTION_RETIRED',error:String(error?.message||error)});throw error;}finally{if(pendingRecords.get(row.record)===task)pendingRecords.delete(row.record);}})();pendingRecords.set(row.record,task);return task;}
  function authorize(raw){const state=root.GameStateEngine?.getState?.();if(raw&&typeof raw==="object"&&Object.prototype.hasOwnProperty.call(raw,"cardId"))return !!state?.cardVault?.owned?.[String(raw.cardId||"")];const id=String(raw?.mediaId||raw||"");return !!(state?.gallery?.owned?.[id]||state?.gallery?.fullUnlock||state?.cardVault?.owned?.[id]);}
  function normalizePath(raw){return String(raw||"").trim().replace(/\\/g,"/").replace(/^\.\//,"").replace(/^\/+/,"");}

  // GOLDEN RULE: having an avatar asset in the game files does not mean the
  // player has unlocked that contact's photo. Each of these characters hands
  // the player a real photo during their own Day 1 intro story (see e.g.
  // story/DAY1/DAY1_02_HAILEY_INTRO.json's "I actually needed a new contact
  // photo for you" beat) -- that in-story moment, not the mere existence of
  // assets/avatars/<id>.jpg, is what notify-adapter.js's contact_avatar_
  // unlocked_<id> flag (read directly below, same pattern already used for
  // character_variant_mason) is meant to gate. This table is the declarative
  // registration of which canonical onceKey proves that moment happened, so
  // it can be derived the same deterministic way for old saves, Start From,
  // and New Update instead of guessing per version -- see isContactAvatarUnlocked.
  const AVATAR_REVEAL_ONCE_KEY=Object.freeze({evelyn:"d1_intro_evelyn_v1",mason:"d1_intro_mason_v2",hailey:"d1_intro_hailey_v1",lena:"d1_04_lena_first_text_v2",aiden:"d1_05_aiden_intro_v2"});
  // Only registered contact assets can replace a missing/stale avatar.
  // System notification ids (for example HAK) are not image filenames.
  const OFFICIAL_AVATAR_IDS=new Set(["aiden","evelyn","hailey","lena","tutor","static_muse"]);

  function isContactAvatarUnlocked(id){
    if(!id||!AVATAR_REVEAL_ONCE_KEY[id])return true; // no registered reveal gate for this id: nothing to lock
    try{if(typeof root.Game?.isAvatarUnlocked==="function")return root.Game.isAvatarUnlocked(id)===true;}catch{}
    try{return localStorage.getItem("contact_avatar_unlocked_"+id)==="1";}catch{return true;}
  }

  // rawAvatar is resolved to the character's OFFICIAL asset whenever it is
  // missing/default/stale -- a data-integrity self-heal, not a progression
  // decision. That self-heal must never run ahead of the player actually
  // having unlocked the contact's photo (Messages/Conversation/Notifications),
  // so the gate below short-circuits to the generic default first. Some
  // surfaces legitimately have their own, different contract for the same
  // asset (HAK surveillance evidence shows the real subject regardless of
  // whether Messages has "met" them yet; the Gallery character-filter tab is
  // a navigation aid, not a narrative reveal) -- those pass
  // {skipProgressionGate:true} explicitly, with the reason documented at the
  // call site, rather than this function guessing per caller.
  function avatarPath(rawId,rawAvatar,opts){
    const id=String(rawId||"").trim().toLowerCase().replace(/[^a-z0-9_-]+/g,"_").replace(/^_+|_+$/g,"");
    const raw=normalizePath(rawAvatar),lower=raw.toLowerCase();
    if(id&&opts?.skipProgressionGate!==true&&!isContactAvatarUnlocked(id))return"assets/avatars/default.jpg";
    if(id==="mason"||/(?:^|\/)assets\/avatars\/(?:mason(?:_female)?|male_mason|female_mason)\.jpg(?:[?#].*)?$/i.test(raw)){
      let female=false;try{female=String(root.MasonVariantService?.get?.()||root.GameStateEngine?.getState?.()?.world?.masonVariant||localStorage.getItem("character_variant_mason")||"").toLowerCase()==="female";}catch{}
      return female?"assets/avatars/female_mason.jpg":"assets/avatars/male_mason.jpg";
    }
    const missingOrDefault=!raw||/(?:^|\/)default\.(?:png|jpe?g|webp)(?:[?#].*)?$/i.test(lower);
    const official=OFFICIAL_AVATAR_IDS.has(id)?`assets/avatars/${id}.jpg`:"";
    const wrongOfficial=official&&lower.includes("assets/avatars/")&&!lower.endsWith(`/assets/avatars/${id}.jpg`)&&!lower.endsWith(`assets/avatars/${id}.jpg`);
    const staleGenerated=!official&&id&&new RegExp(`(?:^|/)assets/avatars/${id}\\.jpg(?:[?#].*)?$`).test(lower);
    if(official&&(missingOrDefault||wrongOfficial))return official;
    return missingOrDefault||staleGenerated?"assets/avatars/default.jpg":raw;
  }
  async function applyImage(img,logicalPath,meta={}){
    if(!img)return{status:"missing",logicalPath:normalizePath(logicalPath),finalUrl:""};
    imageListeners.get(img)?.();
    const token=beginAssignment(img),logical=canonicalMediaPath(logicalPath);if(!logical){try{img.removeAttribute("src");}catch{}return{status:"empty",logicalPath:"",finalUrl:""};}
    try{const finalUrl=await resolve(logical);if(!assignmentCurrent(img,token))return{status:"stale",logicalPath:logical,finalUrl};
      const trace={assetType:meta.assetType||"image",surface:meta.surface||"",logicalPath:logical,finalUrl,postId:String(meta.postId||""),profileId:String(meta.profileId||meta.contactId||"")};
      const clean=()=>{img.removeEventListener("load",onLoad);img.removeEventListener("error",onError);if(imageListeners.get(img)===clean)imageListeners.delete(img);},onLoad=()=>{clean();note({type:"image-load",...trace,naturalWidth:Number(img.naturalWidth||0),naturalHeight:Number(img.naturalHeight||0)});},onError=()=>{clean();note({type:"image-error",...trace,naturalWidth:Number(img.naturalWidth||0),naturalHeight:Number(img.naturalHeight||0)});};
      imageListeners.set(img,clean);img.addEventListener("load",onLoad);img.addEventListener("error",onError);
      img.src=finalUrl;if(img.dataset){img.dataset.logicalSrc=logical;img.dataset.resolvedSrc=finalUrl;}note({type:"apply",...trace,status:"resolved"});return{status:"resolved",logicalPath:logical,finalUrl};}catch(error){note({type:"apply",assetType:meta.assetType||"image",surface:meta.surface||"",logicalPath:logical,status:"error",error:String(error?.message||error)});throw error;}
  }
  async function applyBackground(element,logicalPath,meta={}){
    if(!element)return{status:"missing",logicalPath:normalizePath(logicalPath),finalUrl:""};
    const logical=normalizePath(logicalPath),token=beginAssignment(element);
    try{const finalUrl=await resolve(logical);if(!assignmentCurrent(element,token))return{status:"stale",logicalPath:logical,finalUrl};element.style.backgroundImage=`url(${JSON.stringify(finalUrl)})`;if(element.dataset){element.dataset.logicalSrc=logical;element.dataset.resolvedSrc=finalUrl;}note({type:"apply",assetType:meta.assetType||"background",surface:meta.surface||"",logicalPath:logical,finalUrl,status:"resolved"});return{status:"resolved",logicalPath:logical,finalUrl};}catch(error){note({type:"apply",assetType:meta.assetType||"background",surface:meta.surface||"",logicalPath:logical,status:"error",error:String(error?.message||error)});throw error;}
  }
  function install(proto){if(!proto)return;let owner=proto,desc;while(owner&&!desc){desc=Object.getOwnPropertyDescriptor(owner,"src");owner=Object.getPrototypeOf(owner);}const original=proto.setAttribute,remove=proto.removeAttribute;
    function assign(element,value,commit){const token=beginAssignment(element),logical=normalizePath(value);if(!logical){element.removeAttribute("src");return;}resolve(logical).then(url=>{if(url&&assignmentCurrent(element,token))commit(url);}).catch(error=>{if(error?.code!=='MEDIA_RESOLUTION_RETIRED'&&assignmentCurrent(element,token))commit(logical);});}
    if(desc?.set&&desc?.get)Object.defineProperty(proto,"src",{configurable:true,enumerable:desc.enumerable,get:desc.get,set(value){assign(this,value,url=>desc.set.call(this,url));}});
    proto.setAttribute=function(name,value){if(String(name).toLowerCase()!=="src")return original.call(this,name,value);assign(this,value,url=>original.call(this,name,url));};
    proto.removeAttribute=function(name){if(String(name).toLowerCase()==='src'){beginAssignment(this);imageListeners.get(this)?.();}return remove.call(this,name);};
  }
  install(root.HTMLImageElement?.prototype);install(root.HTMLVideoElement?.prototype);install(root.HTMLSourceElement?.prototype);
  root.ProtectedMediaResolver={resolve,resolveRuntimeAsset:resolve,canonicalMediaPath,avatarPath,isContactAvatarUnlocked,AVATAR_REVEAL_ONCE_KEY,applyImage,applyBackground,authorize,hashPath,diagnostics:()=>({transport:root.protectedMedia?"ipc":"fetch",cachedRecords:cache.size,pendingRecords:pendingRecords.size,activeBlobUrls:ownedUrls.size,events:events.slice()}),dispose(){resolverGeneration++;for(const url of ownedUrls)URL.revokeObjectURL(url);ownedUrls.clear();cache.clear();pendingRecords.clear();}};
})(typeof window!=="undefined"?window:globalThis);
