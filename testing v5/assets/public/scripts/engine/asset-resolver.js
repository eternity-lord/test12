(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.AssetResolver=api.AssetResolver;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const PLACEHOLDER='assets/ui/asset-placeholder.svg';
  class AssetResolver{constructor(opts={}){this.base=String(opts.base||'').replace(/\/$/,'');this.exists=opts.exists||null;this.maxRetries=Number.isFinite(opts.maxRetries)?opts.maxRetries:1;this.retries=new Map();}
    canonicalize(raw){let p=String(raw||'').trim().replace(/\\/g,'/').replace(/^file:\/\/[^/]*\//i,'').replace(/^(?:\.\/|\/)+/,'');p=p.replace(/assets\/avatars\/pd_[^/]*_\.\/story\/([^?#]+\.json)\.jpg/i,'story/$1');p=p.replace(/\/+/g,'/');if(!p||p.includes('..')||/^[a-z]+:/i.test(p))return '';return p;}
    async resolve(raw,{blocking=false}={}){const id=this.canonicalize(raw);if(!id)return blocking?null:PLACEHOLDER;let ok=true;if(this.exists)try{ok=await this.exists(id);}catch{ok=false;}if(!ok){const n=(this.retries.get(id)||0)+1;this.retries.set(id,n);return blocking?null:PLACEHOLDER;}return this.base?this.base+'/'+id:id;}
    diagnostics(){return {assetRetries:[...this.retries.entries()].map(([asset,count])=>({asset,count}))};}}
  return {AssetResolver,PLACEHOLDER};
});
