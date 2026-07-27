import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contentIdOptionsFromWorkspace, type ContentIdOptions } from "@/lib/content-id";
import { getWorkspaceIngestUrl } from "@/lib/custom-ingest-domain";

function sanitizeForJs(value: string): string {
  return value.replace(/[\\'"<>&`\n\r\0]/g, "");
}

function generatePixelCode(
  apiKey: string,
  pixelId: string | null,
  tiktokPixelId: string | null,
  ingestUrl: string,
  hasShopifyWebhook: boolean,
  workspaceId: string,
  metaBrowserTrackingEnabled: boolean,
  tiktokBrowserTrackingEnabled: boolean,
  consentMode: "STRICT" | "LAX",
  contentIdOptions: ContentIdOptions = {}
): string {
  return `// Track Clear v2 - Server-Side Event Tracking
(async function(){
var A=window.__tcAnalytics,B=window.__tcBrowser,I=window.__tcInit,C=window.__tcCustomerPrivacy,PS=window.__tcPrivacyStatus||(window.__tcInit&&window.__tcInit.customerPrivacy)||{};
if(!A){console.error("[TrackClear] Missing analytics global");return}
var K="${sanitizeForJs(apiKey)}",E="${sanitizeForJs(ingestUrl)}",W="${sanitizeForJs(workspaceId)}",M="${consentMode}";
var H=${hasShopifyWebhook ? "true" : "false"};
var MB=${metaBrowserTrackingEnabled ? "true" : "false"},MI=false;
var TB=${tiktokBrowserTrackingEnabled ? "true" : "false"},TI=false;
var CM="${sanitizeForJs(String(contentIdOptions.mode ?? "VARIANT_NUMERIC_ID"))}",CP="${sanitizeForJs(contentIdOptions.prefix ?? "")}",CS="${sanitizeForJs(contentIdOptions.suffix ?? "")}",CT="${sanitizeForJs(contentIdOptions.template ?? "")}";
${pixelId ? `var P="${sanitizeForJs(pixelId)}";` : ""}
${tiktokPixelId ? `var TP="${sanitizeForJs(tiktokPixelId)}";` : ""}
function gc(n){try{var m=document.cookie.match(new RegExp("(^| )"+n+"=([^;]+)"));return m?m[2]:null}catch(e){return null}}
var pageUrl="",pageRef="";try{var loc=I.context.document.location;pageUrl=loc.href||"";pageRef=I.context.document.referrer||""}catch(e){try{pageUrl=location.href;pageRef=document.referrer}catch(e2){}}
function gp(n){try{var u=new URL(pageUrl);return u.searchParams.get(n)}catch(e){return null}}
function vp(v){if(!v)return null;return/^fb\\.1\\.\\d{13}\\.\\d{7,20}$/.test(v)?v:null}
function vf(v){if(!v)return null;var m=v.match(/^fb\\.1\\.(\\d{13})\\..+$/);if(!m)return null;if(Date.now()-parseInt(m[1],10)>7776000000)return null;return v}
function xf(v){if(!v)return null;var p=v.lastIndexOf(".");return p>0?v.substring(p+1):null}
var utm={s:gp("utm_source"),m:gp("utm_medium"),c:gp("utm_campaign"),n:gp("utm_content"),t:gp("utm_term")};
var cid={tt:gp("ttclid"),rd:gp("rdt_cid"),ep:gp("epik")||gc("_epik"),gl:gp("gclid"),fb:gp("fbclid"),gb:gp("gbraid"),wb:gp("wbraid")};
function cn(){var c={};try{if(PS){c.analyticsAllowed=PS.analyticsProcessingAllowed;c.marketingAllowed=PS.marketingAllowed}}catch(e){}return c}
function mk(){var v=cn().marketingAllowed;return M==="STRICT"?v===true:v!==false}
function ak(){var v=cn().analyticsAllowed;return M==="STRICT"?v===true:v!==false}
function mf(){if(!MB||typeof P==="undefined"||!P||!mk()||MI)return;var R=window.__tcMetaInitializedPixels||(window.__tcMetaInitializedPixels={});if(R[P]){MI=true;return}if(!window.fbq){var f=window.fbq=function(){f.callMethod?f.callMethod.apply(f,arguments):f.queue.push(arguments)};if(!window._fbq)window._fbq=f;f.push=f;f.loaded=true;f.version="2.0";f.queue=[]}if(!window.__tcMetaScriptRequested){try{var t=document.createElement("script"),s=document.getElementsByTagName("script")[0];t.async=true;t.src="https://connect.facebook.net/en_US/fbevents.js";s&&s.parentNode?s.parentNode.insertBefore(t,s):document.head.appendChild(t);window.__tcMetaScriptRequested=true}catch(e){}}window.fbq("consent","grant");window.fbq("init",P);R[P]=true;MI=true}
function bf(){return MB&&mk()&&typeof window.fbq==="function"}
function tf(){if(!TB||typeof TP==="undefined"||!TP||!mk()||TI)return;var R=window.__tcTikTokInitializedPixels||(window.__tcTikTokInitializedPixels={});if(R[TP]){TI=true;return}if(!window.ttq||typeof window.ttq.load!=="function"){(function(w,d,t){w.TiktokAnalyticsObject=t;var q=w[t]=w[t]||[];q.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];q.setAndDefer=function(o,m){o[m]=function(){o.push([m].concat([].slice.call(arguments,0)))}};for(var i=0;i<q.methods.length;i++)q.setAndDefer(q,q.methods[i]);q.instance=function(e){var a=q._i[e]||[];for(var i=0;i<q.methods.length;i++)q.setAndDefer(a,q.methods[i]);return a};q.load=function(e,o){var u="https://analytics.tiktok.com/i18n/pixel/events.js";q._i=q._i||{};q._i[e]=[];q._i[e]._u=u;q._t=q._t||{};q._t[e]=+new Date;q._o=q._o||{};q._o[e]=o||{};var s=d.createElement("script"),x=d.getElementsByTagName("script")[0];s.type="text/javascript";s.async=true;s.src=u+"?sdkid="+e+"&lib="+t;x&&x.parentNode?x.parentNode.insertBefore(s,x):d.head.appendChild(s)}})(window,document,"ttq")}window.ttq.grantConsent();window.ttq.load(TP);R[TP]=true;TI=true}
function bt(){return TB&&mk()&&window.ttq&&typeof window.ttq.track==="function"}
function pc(){if(mk()){if(MB&&window.fbq)window.fbq("consent","grant");if(TB&&window.ttq&&typeof window.ttq.grantConsent==="function")window.ttq.grantConsent()}else{if(MB&&window.fbq)window.fbq("consent","revoke");if(TB&&window.ttq&&typeof window.ttq.revokeConsent==="function")window.ttq.revokeConsent()}}
function td(cd){cd=cd||{};var p={},a=[];if(Array.isArray(cd.contents)){for(var i=0;i<cd.contents.length;i++){var x=cd.contents[i]||{},z={content_id:String(x.id||"") ,content_type:"product",quantity:x.quantity||1};if(x.itemPrice!==undefined)z.price=x.itemPrice;else if(x.item_price!==undefined)z.price=x.item_price;if(z.content_id)a.push(z)}}else if(Array.isArray(cd.contentIds)){for(var j=0;j<cd.contentIds.length;j++)a.push({content_id:String(cd.contentIds[j]),content_type:"product",quantity:1})}if(a.length)p.contents=a;if(cd.contentType)p.content_type=cd.contentType;if(cd.contentName)p.content_name=cd.contentName;if(cd.value!==undefined)p.value=cd.value;if(cd.currency)p.currency=cd.currency;if(cd.numItems!==undefined)p.quantity=cd.numItems;return p}
if(!mk()){cid.fb=null;cid.tt=null;cid.rd=null;cid.ep=null;cid.gl=null;cid.gb=null;cid.wb=null}
var _now=Date.now(),_fresh=!!(cid.tt||cid.rd||cid.ep||cid.gl||cid.fb||cid.gb||cid.wb||utm.s||utm.m||utm.c||utm.n||utm.t);
var gaClientId=null;
try{if(B&&ak()){var _gac=await B.cookie.get("_ga");if(_gac){var _gap=_gac.split(".");if(_gap.length>=4)gaClientId=_gap.slice(2).join(".")}}}catch(e){}
var sid=null;try{if(B){sid=await B.cookie.get("_trackclear_session_id")}}catch(e){}
var _sc=null;try{if(B){var _sr=B.localStorage?await B.localStorage.getItem("_tc"):null;if(!_sr&&B.sessionStorage)_sr=await B.sessionStorage.getItem("_tc");if(_sr)_sc=JSON.parse(_sr)}}catch(e){}
if(_sc&&_sc.ca&&_now-parseInt(_sc.ca,10)>7776000000)_sc=null;else if(_sc&&!_sc.ca)_sc.ca=_now;
if(_sc&&!_fresh){utm.s=_sc.us||null;utm.m=_sc.um||null;utm.c=_sc.uc||null;utm.n=_sc.un||null;utm.t=_sc.ut||null;if(mk()){cid.fb=_sc.fb||null;cid.tt=_sc.tt||null;cid.rd=_sc.rd||null;cid.ep=_sc.ep||null;cid.gl=_sc.gl||null;cid.gb=_sc.gb||null;cid.wb=_sc.wb||null}}
var _ats=_fresh?_now:(_sc&&_sc.ca)||null,_as=_fresh?(cid.fb?"meta":cid.tt?"tiktok":(cid.gl||cid.gb||cid.wb)?"google":cid.rd?"reddit":cid.ep?"pinterest":(utm.s||"utm").toLowerCase().slice(0,100)):(_sc&&_sc.so)||null;if(_as)_as=String(_as).slice(0,100);
var _cfp=null,_cfc=null,_ctp=null;try{var _ca=(I.data&&I.data.cart&&I.data.cart.attributes)||[];for(var _ci=0;_ci<_ca.length;_ci++){if(mk()&&_ca[_ci].key==="_fbp")_cfp=vp(_ca[_ci].value);if(mk()&&_ca[_ci].key==="_fbc")_cfc=vf(_ca[_ci].value);if(mk()&&_ca[_ci].key==="_ttp")_ctp=_ca[_ci].value;if(_ca[_ci].key==="_trackclear_session_id"&&!sid)sid=_ca[_ci].value;if(!_fresh){if(mk()&&_ca[_ci].key==="_fbclid"&&!cid.fb)cid.fb=_ca[_ci].value;if(mk()&&_ca[_ci].key==="_gclid"&&!cid.gl)cid.gl=_ca[_ci].value;if(mk()&&_ca[_ci].key==="_gbraid"&&!cid.gb)cid.gb=_ca[_ci].value;if(mk()&&_ca[_ci].key==="_wbraid"&&!cid.wb)cid.wb=_ca[_ci].value;if(mk()&&_ca[_ci].key==="_ttclid"&&!cid.tt)cid.tt=_ca[_ci].value;if(_ca[_ci].key==="_tc_attribution_timestamp"&&!_ats){var _atn=Number(_ca[_ci].value);if(Number.isFinite(_atn))_ats=_atn}if(_ca[_ci].key==="_tc_attribution_source"&&!_as)_as=String(_ca[_ci].value).slice(0,100)}}}catch(e){}
var fbpVal=null,fbcVal=null,ttpVal=null;
async function pi(){cid.fb=null;cid.tt=null;cid.rd=null;cid.ep=null;cid.gl=null;cid.gb=null;cid.wb=null;_cfp=null;_cfc=null;_ctp=null;fbpVal=null;fbcVal=null;ttpVal=null;try{if(B){await B.cookie.set("_fbp=; Max-Age=0; Path=/; SameSite=Lax");await B.cookie.set("_fbc=; Max-Age=0; Path=/; SameSite=Lax");await B.cookie.set("_ttp=; Max-Age=0; Path=/; SameSite=Lax");await B.cookie.set("_epik=; Max-Age=0; Path=/; SameSite=Lax")}}catch(e){}}
async function ri(){if(!mk()){await pi();return}cid.fb=cid.fb||gp("fbclid");cid.tt=cid.tt||gp("ttclid");cid.rd=cid.rd||gp("rdt_cid");cid.ep=cid.ep||gp("epik");cid.gl=cid.gl||gp("gclid");cid.gb=cid.gb||gp("gbraid");cid.wb=cid.wb||gp("wbraid");if(cid.fb||cid.tt||cid.rd||cid.ep||cid.gl||cid.gb||cid.wb){_fresh=true;_ats=_now;_as=cid.fb?"meta":cid.tt?"tiktok":(cid.gl||cid.gb||cid.wb)?"google":cid.rd?"reddit":"pinterest"}try{if(B){fbpVal=vp(await B.cookie.get("_fbp"));fbcVal=vf(await B.cookie.get("_fbc"));ttpVal=await B.cookie.get("_ttp")||null}}catch(e){}fbpVal=fbpVal||_cfp||vp(_sc&&_sc.fp)||null;fbcVal=fbcVal||_cfc||vf(_sc&&_sc.fc)||null;ttpVal=ttpVal||_ctp||(_sc&&_sc.tp)||null;if(!fbpVal){fbpVal="fb.1."+Date.now()+"."+Math.floor(1000000000+Math.random()*9000000000);try{if(B)await B.cookie.set("_fbp="+fbpVal+"; Max-Age=7776000; Path=/; SameSite=Lax")}catch(e){}}if(cid.fb){var _ef=xf(fbcVal);if(!fbcVal||_ef!==cid.fb){fbcVal="fb.1."+Date.now()+"."+cid.fb;try{if(B)await B.cookie.set("_fbc="+fbcVal+"; Max-Age=7776000; Path=/; SameSite=Lax")}catch(e){}}}}
async function rt(){if(!mk()){ttpVal=null;return}try{if(B)ttpVal=await B.cookie.get("_ttp")||ttpVal}catch(e){}}
await ri();
if(!sid&&_sc)sid=_sc.sid||null;if(!sid){sid=(crypto.randomUUID?crypto.randomUUID():String(Date.now())+"."+Math.random().toString(36).slice(2));try{if(B)await B.cookie.set("_trackclear_session_id="+sid+"; Max-Age=31536000; Path=/; SameSite=Lax")}catch(e){}}
var lp=(!_fresh&&_sc&&_sc.lp)||pageUrl;
async function sc(){try{if(B){var m=mk(),v=JSON.stringify({sid:sid,lp:lp,us:utm.s,um:utm.m,uc:utm.c,un:utm.n,ut:utm.t,fb:m?cid.fb:null,tt:m?cid.tt:null,rd:m?cid.rd:null,ep:m?cid.ep:null,gl:m?cid.gl:null,gb:m?cid.gb:null,wb:m?cid.wb:null,fp:m?fbpVal:null,fc:m?fbcVal:null,tp:m?ttpVal:null,ca:_ats,so:_as});if(B.localStorage)await B.localStorage.setItem("_tc",v);if(B.sessionStorage)await B.sessionStorage.setItem("_tc",v)}}catch(e){}}
await sc();
var DK="_trackclear_pending_consent_v1",DQ=[],DR=null,DT=null,DC=Promise.resolve(),DG=0,DX=2592000000,DM=20,LK="trackclear-consent-revocation-v1";
async function dl(){var ql=[],qs=[];try{if(B&&B.localStorage){var rl=await B.localStorage.getItem(DK),pl=rl?JSON.parse(rl):[];if(Array.isArray(pl))ql=pl}}catch(e){}try{if(B&&B.sessionStorage){var rs=await B.sessionStorage.getItem(DK),ps=rs?JSON.parse(rs):[];if(Array.isArray(ps))qs=ps}}catch(e){}var n=Date.now(),m=Object.create(null);ql.concat(qs,DQ).forEach(function(x){if(x&&x.id&&x.payload&&x.createdAt>=n-DX&&x.payload.timestamp>=n-DX){if(!x.generation)x.generation="legacy:"+x.id+":"+x.createdAt;m[x.generation]=x}});return Object.keys(m).map(function(k){return m[k]}).sort(function(a,b){var d=a.createdAt-b.createdAt;return d||String(a.generation).localeCompare(String(b.generation))}).slice(-DM)}
async function dw(q){DQ=q.slice(-DM);var v=JSON.stringify(DQ);try{if(B&&B.localStorage)await B.localStorage.setItem(DK,v)}catch(e){}try{if(B&&B.sessionStorage)await B.sessionStorage.setItem(DK,v)}catch(e){}}
function dn(c){return c&&(c.analyticsAllowed===false||c.marketingAllowed===false)}
function dm(p){var c=p.customData||{},d={};["orderId","orderName","checkoutToken","cartToken"].forEach(function(k){if(c[k]!=null)d[k]=c[k]});return{eventName:p.eventName,eventId:p.eventId,timestamp:p.timestamp,url:"",referrer:"",trackclearSessionId:p.trackclearSessionId,checkoutToken:p.checkoutToken,cartToken:p.cartToken,consent:p.consent,userData:{},customData:d,onlyDestinations:[]}}
function dp(p){return fetch(E,{method:"POST",headers:{"Content-Type":"application/json","X-TL-API-Key":K},body:JSON.stringify(p),keepalive:true})}
function dj(a){return Math.min(300000,5000*Math.pow(2,Math.min(Math.max(a-1,0),6)))}
function dg(){return Date.now().toString(36)+"."+(++DG).toString(36)+"."+Math.random().toString(36).slice(2)}
function dy(ms){if(DT||typeof setTimeout!=="function")return;DT=setTimeout(function(){DT=null;rr()},ms)}
function dk(f){var run=function(){try{if(typeof navigator!=="undefined"&&navigator.locks&&typeof navigator.locks.request==="function")return navigator.locks.request(LK,f)}catch(e){}return f()},n=DC.then(run,run);DC=n.then(function(){},function(){});return n}
async function dq(p){return dk(async function(){var m=dm(p),id=m.eventId+":"+m.timestamp,ref={id:id,generation:dg()},q=await dl();q.push({id:id,generation:ref.generation,payload:m,createdAt:Date.now(),attempts:0,nextAttemptAt:0});await dw(q);return ref})}
async function dz(ref,ok){return dk(async function(){var n=Date.now(),delay=0,q=(await dl()).flatMap(function(x){if(x.id!==ref.id||x.generation!==ref.generation)return[x];if(ok)return[];var a=(x.attempts||0)+1,d=dj(a);delay=d;return[Object.assign({},x,{attempts:a,nextAttemptAt:n+d})]});await dw(q);if(delay)dy(delay)})}
async function rr(){if(DR)return DR;DR=(async function(){var q=await dk(async function(){var x=await dl();await dw(x);return x}),n=Date.now();for(var i=0;i<q.length;i++){var x=q[i];if(x.nextAttemptAt>n){dy(x.nextAttemptAt-n);continue}try{var r=await dp(x.payload);await dz({id:x.id,generation:x.generation},r.ok)}catch(e){await dz({id:x.id,generation:x.generation},false)}}})();try{await DR}finally{DR=null}}
rr();
try{if(C&&typeof C.subscribe==="function"){var _sub=C.subscribe("visitorConsentCollected",async function(e){PS=(e&&e.customerPrivacy)||PS;window.__tcPrivacyStatus=PS;pc();if(!ak())gaClientId=null;await ri();await sc();mf();tf();wa();var c=cn();if(dn(c))await se("PageView",crypto.randomUUID(),{},{},[]) });if(_sub&&typeof _sub.catch==="function")_sub.catch(function(){})}}catch(e){}
var su=null;var _ciId=null;
var iu={};try{if(I&&I.data&&I.data.customer){var _ic=I.data.customer;iu={email:_ic.email||null,phone:_ic.phone||null,firstName:_ic.firstName||null,lastName:_ic.lastName||null,customerId:_ic.id||null}}}catch(e){}
function mu(a,b){var r={};for(var k in a){if(a[k])r[k]=a[k]}for(var k in b){if(b[k])r[k]=b[k]}return r}
function av(o,k,v){if(v!==null&&v!==undefined&&String(v)!=="")o[k]=String(v)}
function at(){var c=cn(),m=mk(),o={};av(o,"_trackclear_session_id",sid);if(m){av(o,"_fbp",fbpVal);av(o,"_fbc",fbcVal);av(o,"_fbclid",cid.fb);av(o,"_gclid",cid.gl);av(o,"_gbraid",cid.gb);av(o,"_wbraid",cid.wb);av(o,"_ttclid",cid.tt);av(o,"_ttp",ttpVal);av(o,"_rdt_cid",cid.rd);av(o,"_epik",cid.ep)}else{var ak=["_fbp","_fbc","_fbclid","_gclid","_gbraid","_wbraid","_ttclid","_ttp","_rdt_cid","_epik"];for(var i=0;i<ak.length;i++)o[ak[i]]=""}var tk=[["_fbclid",cid.fb],["_gclid",cid.gl],["_gbraid",cid.gb],["_wbraid",cid.wb],["_ttclid",cid.tt],["_rdt_cid",cid.rd],["_epik",cid.ep],["_utm_source",utm.s],["_utm_medium",utm.m],["_utm_campaign",utm.c],["_utm_content",utm.n],["_utm_term",utm.t]];if(_fresh){for(var j=0;j<tk.length;j++){if(m||tk[j][0].indexOf("_utm_")===0)o[tk[j][0]]=tk[j][1]||""}}else{for(var j=0;j<tk.length;j++)av(o,tk[j][0],tk[j][1])}av(o,"_landing_page",lp);av(o,"_tc_attribution_timestamp",_ats);av(o,"_tc_attribution_source",_as);if(c.analyticsAllowed!==undefined)av(o,"_tc_consent_analytics",c.analyticsAllowed);if(c.marketingAllowed!==undefined)av(o,"_tc_consent_marketing",c.marketingAllowed);if(c.analyticsAllowed!==undefined||c.marketingAllowed!==undefined){av(o,"_tc_consent_timestamp",Date.now());av(o,"_tc_consent_source","shopify_customer_privacy")}return o}
async function wa(){await rt();try{var o=at(),b=new URLSearchParams();for(var k in o)b.append("attributes["+k+"]",o[k]);if(!b.toString())return;fetch(new URL("/cart/update.js",pageUrl||location.href).toString(),{method:"POST",mode:"no-cors",credentials:"include",keepalive:true,headers:{"Content-Type":"application/x-www-form-urlencoded"},body:b.toString()})}catch(e){}}
async function se(en,eid,cd,ud,od,ed){var c=cn(),m=mk();if(m)await rt();else ttpVal=null;var _ud=m?mu(iu,ud||{}):{},p={eventName:en,eventId:eid,timestamp:Date.now(),url:pageUrl,referrer:pageRef,trackclearSessionId:sid,checkoutToken:(cd&&cd.checkoutToken)||undefined,cartToken:(cd&&cd.cartToken)||undefined,fbp:m?fbpVal:null,fbc:m?fbcVal:null,fbclid:m?cid.fb:null,gbraid:m?cid.gb:null,wbraid:m?cid.wb:null,ttclid:m?cid.tt:null,ttp:m?ttpVal:null,rdtCid:m?cid.rd:null,epik:m?cid.ep:null,gaClientId:ak()?gaClientId:null,utmSource:utm.s,utmMedium:utm.m,utmCampaign:utm.c,utmContent:utm.n,utmTerm:utm.t,gclid:m?cid.gl:null,attributionTimestamp:_ats,attributionSource:_as,consent:c,userData:_ud,customData:cd||{},onlyDestinations:od||undefined,excludeDestinations:ed||undefined},ref=null;try{if(dn(c))ref=await dq(p)}catch(e){}if(!ref)await rr();try{var r=await dp(p);if(ref)await dz(ref,r.ok)}catch(e){if(ref)try{await dz(ref,false)}catch(e2){}}if(ref)rr()}
function eu(co){if(!co)return{};var b=co.billingAddress||co.shippingAddress||{};return{email:co.email||(co.order&&co.order.customer&&co.order.customer.email)||null,phone:b.phone||co.phone||null,firstName:b.firstName||null,lastName:b.lastName||null,city:b.city||null,state:b.province||b.provinceCode||null,zip:b.zip||null,countryCode:b.countryCode||null}}
function ni(v){if(v==null)return"";v=String(v).trim();var m=v.match(/^gid:\\/\\/shopify\\/[^\\/]+\\/([^\\/?#]+)/i);if(m)v=m[1];m=v.match(/\\/(\\d+)(?:[\\/?#].*)?$/);if(m)v=m[1];return String(v).replace(/^#+/,"").toLowerCase().replace(/[^a-z0-9._:-]+/g,"_").replace(/^_+|_+$/g,"").slice(0,180)}
function cg(r,x,n){x=x||"";if(/^gid:\\/\\/shopify\\//.test(x))return x;var d=ni(x||n);return d?"gid://shopify/"+r+"/"+d:x||""}
function cv(v){if(v==null)return"";return String(v).trim()}
function ct(t,o){return t.replace(/\\{\\{\\s*([a-zA-Z0-9_]+)\\s*\\}\\}/g,function(_,k){return o[k]||""})}
function fm(o){o=o||{};var v="",vals={variant_id:ni(o.variantId||o.variantGraphqlId),product_id:ni(o.productId||o.productGraphqlId),variant_graphql_id:cg("ProductVariant",o.variantGraphqlId,o.variantId),product_graphql_id:cg("Product",o.productGraphqlId,o.productId),sku:cv(o.sku),country:cv(o.country)};if(CM==="PRODUCT_NUMERIC_ID")v=vals.product_id;else if(CM==="VARIANT_GRAPHQL_ID")v=vals.variant_graphql_id;else if(CM==="PRODUCT_GRAPHQL_ID")v=vals.product_graphql_id;else if(CM==="SKU")v=vals.sku;else if(CM==="CUSTOM")v=ct(CT,vals);else v=vals.variant_id||vals.product_id||vals.sku;v=cv(v);return v?cv(CP+v+CS).slice(0,180):""}
function ci(o){var id=fm(o);return id?[id]:[]}
function lo(l){l=l||{};var v=l.variant||l.merchandise||{},p=v.product||l.product||{};return{variantId:v.id||v.variantId||l.variant_id,variantGraphqlId:v.id||v.admin_graphql_api_id,productId:p.id||p.productId||l.product_id,productGraphqlId:p.id||p.admin_graphql_api_id,sku:v.sku||l.sku}}
function pid(co){co=co||{};var o=co.order||{},id=ni(o.name||co.orderName||o.id||o.admin_graphql_api_id||co.checkoutToken||co.token||co.id||co.cartToken||co.cartId);return id?"shopify-purchase:"+W+":"+id:crypto.randomUUID()}
mf();tf();
A.subscribe("page_viewed",function(e){var id=crypto.randomUUID();se("PageView",id,{},{});if(bf())window.fbq("track","PageView",{},{eventID:id});if(bt())window.ttq.track("Pageview",{},{event_id:id})});
A.subscribe("product_viewed",function(e){var id=crypto.randomUUID(),v=e.data.productVariant||{},cd={contentIds:ci({variantId:v.id,variantGraphqlId:v.id,productId:v.product&&v.product.id,productGraphqlId:v.product&&v.product.id,sku:v.sku}),contentType:"product",contentName:v.title||"",contentCategory:(v.product&&v.product.type)||"",value:v.price?parseFloat(v.price.amount):0,currency:v.price?v.price.currencyCode:"USD"};se("ViewContent",id,cd,{});if(bf())window.fbq("track","ViewContent",{content_ids:cd.contentIds,content_type:cd.contentType,content_name:cd.contentName,value:cd.value,currency:cd.currency},{eventID:id});if(bt())window.ttq.track("ViewContent",td(cd),{event_id:id})});
A.subscribe("product_added_to_cart",function(e){var id=crypto.randomUUID(),cl=e.data.cartLine||{},m=cl.merchandise||{},t=(cl.cost||{}).totalAmount||{},cd={contentIds:ci({variantId:m.id,variantGraphqlId:m.id,productId:m.product&&m.product.id,productGraphqlId:m.product&&m.product.id,sku:m.sku}),contentType:"product",value:t.amount?parseFloat(t.amount):0,currency:t.currencyCode||"USD",numItems:cl.quantity||1};wa();se("AddToCart",id,cd,{});if(bf())window.fbq("track","AddToCart",{content_ids:cd.contentIds,content_type:cd.contentType,value:cd.value,currency:cd.currency,num_items:cd.numItems},{eventID:id});if(bt())window.ttq.track("AddToCart",td(cd),{event_id:id})});
A.subscribe("checkout_started",function(e){var id=crypto.randomUUID();_ciId=id;var co=e.data.checkout||{},tp=co.totalPrice||{},cd={value:tp.amount?parseFloat(tp.amount):0,currency:tp.currencyCode||"USD",contentIds:(co.lineItems||[]).map(function(l){return fm(lo(l))}).filter(Boolean),contentType:"product",numItems:(co.lineItems||[]).length,checkoutToken:co.checkoutToken||co.token||co.id||null,cartToken:co.cartToken||co.cartId||null};wa();se("InitiateCheckout",id,cd,eu(co),null,["KLAVIYO"]);if(bf())window.fbq("track","InitiateCheckout",{content_ids:cd.contentIds,content_type:cd.contentType,value:cd.value,currency:cd.currency,num_items:cd.numItems},{eventID:id});if(bt())window.ttq.track("InitiateCheckout",td(cd),{event_id:id})});
A.subscribe("checkout_contact_info_submitted",function(e){var co=e.data.checkout||{},ud=eu(co);su=mu(su||{},ud);if(ud.email||ud.phone){var tp=co.totalPrice||{},cd={value:tp.amount?parseFloat(tp.amount):0,currency:tp.currencyCode||"USD",contentIds:(co.lineItems||[]).map(function(l){return fm(lo(l))}).filter(Boolean),contentType:"product",numItems:(co.lineItems||[]).length,checkoutToken:co.checkoutToken||co.token||co.id||null,cartToken:co.cartToken||co.cartId||null};se("InitiateCheckout",_ciId||crypto.randomUUID(),cd,ud,["META"]);var id=crypto.randomUUID();se("InitiateCheckout",id,cd,ud,["KLAVIYO"])}});
A.subscribe("checkout_address_info_submitted",function(e){var co=e.data.checkout||{},ud=eu(co);su=mu(su||{},ud)});
A.subscribe("checkout_completed",function(e){var co=e.data.checkout||{},id=pid(co),tp=co.totalPrice||{},li=co.lineItems||[],o=co.order||{},cd={value:tp.amount?parseFloat(tp.amount):0,currency:tp.currencyCode||"USD",contentIds:li.map(function(l){return fm(lo(l))}).filter(Boolean),contentType:"product",contents:li.map(function(l){return{id:fm(lo(l)),quantity:l.quantity||1,itemPrice:l.variant&&l.variant.price?parseFloat(l.variant.price.amount):0}}).filter(function(x){return x.id}),numItems:li.reduce(function(s,l){return s+(l.quantity||1)},0),orderId:o.id||o.name||co.orderName||null,orderName:o.name||co.orderName||null,checkoutToken:co.checkoutToken||co.token||co.id||null,cartToken:co.cartToken||co.cartId||null};var pud=eu(co);se("Purchase",id,cd,{email:pud.email||((su)&&su.email)||null,phone:pud.phone||((su)&&su.phone)||null,firstName:pud.firstName||((su)&&su.firstName)||null,lastName:pud.lastName||((su)&&su.lastName)||null,city:pud.city||((su)&&su.city)||null,state:pud.state||((su)&&su.state)||null,zip:pud.zip||((su)&&su.zip)||null,countryCode:pud.countryCode||((su)&&su.countryCode)||null});if(!H&&bf())window.fbq("track","Purchase",{content_ids:cd.contentIds,content_type:cd.contentType,value:cd.value,currency:cd.currency,num_items:cd.numItems,contents:cd.contents},{eventID:id});if(!H&&bt())window.ttq.track("CompletePayment",td(cd),{event_id:id})});
if(typeof A.activate==="function")A.activate();
})();`;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;

  const workspace = await db.workspace.findFirst({
    where: { id: workspaceId, isActive: true },
    select: {
      apiKey: true,
      metaPixelId: true,
      enableMeta: true,
      metaBrowserTrackingEnabled: true,
      tiktokPixelId: true,
      enableTikTok: true,
      tiktokBrowserTrackingEnabled: true,
      shopifyWebhookSecretEncrypted: true,
      shopifyWebhookVerifiedAt: true,
      consentMode: true,
      catalogIdMode: true,
      catalogIdPrefix: true,
      catalogIdSuffix: true,
      catalogIdTemplate: true,
      customIngestDomain: true,
      customIngestDomainVerifiedAt: true,
    },
  });

  if (!workspace) {
    return new Response("// Track Clear: workspace not found", {
      status: 404,
      headers: { "Content-Type": "text/javascript", ...corsHeaders },
    });
  }

  const ingestUrl = getWorkspaceIngestUrl(workspace);

  const js = generatePixelCode(
    workspace.apiKey,
    workspace.metaPixelId,
    workspace.tiktokPixelId,
    ingestUrl,
    !!workspace.shopifyWebhookVerifiedAt,
    workspaceId,
    workspace.metaBrowserTrackingEnabled && workspace.enableMeta,
    workspace.tiktokBrowserTrackingEnabled && workspace.enableTikTok,
    workspace.consentMode,
    contentIdOptionsFromWorkspace(workspace)
  );

  return new Response(js, {
    status: 200,
    headers: {
      "Content-Type": "text/javascript",
      "Cache-Control": "public, max-age=0, s-maxage=30, must-revalidate",
      ...corsHeaders,
    },
  });
}
