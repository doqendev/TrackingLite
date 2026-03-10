import { NextResponse } from "next/server";
import { db } from "@/lib/db";

function sanitizeForJs(value: string): string {
  return value.replace(/[\\'"<>&`\n\r\0]/g, "");
}

function generatePixelCode(apiKey: string, pixelId: string | null, ingestUrl: string): string {
  return `// Track Clear v2 - Server-Side Event Tracking
(async function(){
var A=window.__tcAnalytics,B=window.__tcBrowser,I=window.__tcInit;
if(!A){console.error("[TrackClear] Missing analytics global");return}
var K="${sanitizeForJs(apiKey)}",E="${sanitizeForJs(ingestUrl)}";
${pixelId ? `var P="${sanitizeForJs(pixelId)}";` : ""}
function gc(n){try{var m=document.cookie.match(new RegExp("(^| )"+n+"=([^;]+)"));return m?m[2]:null}catch(e){return null}}
var pageUrl="",pageRef="";try{var loc=I.context.document.location;pageUrl=loc.href||"";pageRef=I.context.document.referrer||""}catch(e){try{pageUrl=location.href;pageRef=document.referrer}catch(e2){}}
function gp(n){try{var u=new URL(pageUrl);return u.searchParams.get(n)}catch(e){return null}}
function vp(v){if(!v)return null;return/^fb\\.1\\.\\d{13}\\.\\d{7,15}$/.test(v)?v:null}
function vf(v){if(!v)return null;var m=v.match(/^fb\\.1\\.(\\d{13})\\..+$/);if(!m)return null;if(Date.now()-parseInt(m[1],10)>7776000000)return null;return v}
function xf(v){if(!v)return null;var p=v.lastIndexOf(".");return p>0?v.substring(p+1):null}
var utm={s:gp("utm_source"),m:gp("utm_medium"),c:gp("utm_campaign"),n:gp("utm_content"),t:gp("utm_term")};
var cid={tt:gp("ttclid"),rd:gp("rdt_cid"),ep:gp("epik")||gc("_epik"),gl:gp("gclid"),fb:gp("fbclid")};
var gaClientId=null;
try{if(B){var _gac=await B.cookie.get("_ga");if(_gac){var _gap=_gac.split(".");if(_gap.length>=4)gaClientId=_gap.slice(2).join(".")}}}catch(e){}
var fbpVal=null;try{if(B){var _rfp=await B.cookie.get("_fbp");fbpVal=vp(_rfp)}}catch(e){}
var fbcVal=null;try{if(B){var _rfc=await B.cookie.get("_fbc");fbcVal=vf(_rfc)}}catch(e){}
var _sc=null;try{if(B&&B.sessionStorage){var _sr=await B.sessionStorage.getItem("_tc");if(_sr)_sc=JSON.parse(_sr)}}catch(e){}
if(_sc){utm.s=utm.s||_sc.us||null;utm.m=utm.m||_sc.um||null;utm.c=utm.c||_sc.uc||null;utm.n=utm.n||_sc.un||null;utm.t=utm.t||_sc.ut||null;cid.tt=cid.tt||_sc.tt||null;cid.rd=cid.rd||_sc.rd||null;cid.ep=cid.ep||_sc.ep||null;cid.gl=cid.gl||_sc.gl||null;fbpVal=fbpVal||vp(_sc.fp)||null;fbcVal=fbcVal||vf(_sc.fc)||null}
if(!fbpVal){fbpVal="fb.1."+Date.now()+"."+Math.floor(1000000000+Math.random()*9000000000);try{if(B)await B.cookie.set("_fbp",fbpVal)}catch(e){}}
if(cid.fb){var _ef=xf(fbcVal);if(!fbcVal||_ef!==cid.fb){fbcVal="fb.1."+Date.now()+"."+cid.fb;try{if(B)await B.cookie.set("_fbc",fbcVal)}catch(e){}}}
try{if(B&&B.sessionStorage){await B.sessionStorage.setItem("_tc",JSON.stringify({us:utm.s,um:utm.m,uc:utm.c,un:utm.n,ut:utm.t,tt:cid.tt,rd:cid.rd,ep:cid.ep,gl:cid.gl,fp:fbpVal,fc:fbcVal}))}}catch(e){}
var su=null;
var iu={};try{if(I&&I.data&&I.data.customer){var _ic=I.data.customer;iu={email:_ic.email||null,phone:_ic.phone||null,firstName:_ic.firstName||null,lastName:_ic.lastName||null,customerId:_ic.id||null}}}catch(e){}
function mu(a,b){var r={};for(var k in a){if(a[k])r[k]=a[k]}for(var k in b){if(b[k])r[k]=b[k]}return r}
function se(en,eid,cd,ud,od){var c={};try{if(I&&I.customerPrivacy){c.analyticsAllowed=I.customerPrivacy.analyticsProcessingAllowed;c.marketingAllowed=I.customerPrivacy.marketingAllowed}}catch(e){}var _ud=mu(iu,ud||{});try{fetch(E,{method:"POST",headers:{"Content-Type":"application/json","X-TL-API-Key":K},body:JSON.stringify({eventName:en,eventId:eid,timestamp:Date.now(),url:pageUrl,referrer:pageRef,fbp:fbpVal||gc("_fbp"),fbc:fbcVal||gc("_fbc"),ttclid:cid.tt,rdtCid:cid.rd,epik:cid.ep,gaClientId:gaClientId,utmSource:utm.s,utmMedium:utm.m,utmCampaign:utm.c,utmContent:utm.n,utmTerm:utm.t,gclid:cid.gl,consent:c,userData:_ud,customData:cd||{},onlyDestinations:od||undefined}),keepalive:true})}catch(e){}}
function eu(co){if(!co)return{};var b=co.billingAddress||co.shippingAddress||{};return{email:co.email||(co.order&&co.order.customer&&co.order.customer.email)||null,phone:b.phone||co.phone||null,firstName:b.firstName||null,lastName:b.lastName||null,city:b.city||null,state:b.province||b.provinceCode||null,zip:b.zip||null,countryCode:b.countryCode||null}}
A.subscribe("page_viewed",function(e){var id=crypto.randomUUID();se("PageView",id,{},{});if(typeof fbq==="function")fbq("track","PageView",{},{eventID:id})});
A.subscribe("product_viewed",function(e){var id=crypto.randomUUID(),v=e.data.productVariant||{},cd={contentIds:v.id?[String(v.id)]:[],contentType:"product",contentName:v.title||"",contentCategory:(v.product&&v.product.type)||"",value:v.price?parseFloat(v.price.amount):0,currency:v.price?v.price.currencyCode:"USD"};se("ViewContent",id,cd,{});if(typeof fbq==="function")fbq("track","ViewContent",{content_ids:cd.contentIds,content_type:cd.contentType,content_name:cd.contentName,value:cd.value,currency:cd.currency},{eventID:id})});
A.subscribe("product_added_to_cart",function(e){var id=crypto.randomUUID(),cl=e.data.cartLine||{},m=cl.merchandise||{},t=(cl.cost||{}).totalAmount||{},cd={contentIds:m.id?[String(m.id)]:[],contentType:"product",value:t.amount?parseFloat(t.amount):0,currency:t.currencyCode||"USD",numItems:cl.quantity||1};se("AddToCart",id,cd,{});if(typeof fbq==="function")fbq("track","AddToCart",{content_ids:cd.contentIds,content_type:cd.contentType,value:cd.value,currency:cd.currency,num_items:cd.numItems},{eventID:id})});
A.subscribe("checkout_started",function(e){var id=crypto.randomUUID(),co=e.data.checkout||{},tp=co.totalPrice||{},cd={value:tp.amount?parseFloat(tp.amount):0,currency:tp.currencyCode||"USD",contentIds:(co.lineItems||[]).map(function(l){return l.variant?String(l.variant.id):""}).filter(Boolean),contentType:"product",numItems:(co.lineItems||[]).length};se("InitiateCheckout",id,cd,eu(co));if(typeof fbq==="function")fbq("track","InitiateCheckout",{content_ids:cd.contentIds,content_type:cd.contentType,value:cd.value,currency:cd.currency,num_items:cd.numItems},{eventID:id})});
A.subscribe("checkout_contact_info_submitted",function(e){var co=e.data.checkout||{},ud=eu(co);su=ud;if(ud.email||ud.phone){var id=crypto.randomUUID(),tp=co.totalPrice||{},cd={value:tp.amount?parseFloat(tp.amount):0,currency:tp.currencyCode||"USD",contentIds:(co.lineItems||[]).map(function(l){return l.variant?String(l.variant.id):""}).filter(Boolean),contentType:"product",numItems:(co.lineItems||[]).length};se("InitiateCheckout",id,cd,ud,["KLAVIYO"])}});
A.subscribe("checkout_completed",function(e){var id=crypto.randomUUID(),co=e.data.checkout||{},tp=co.totalPrice||{},li=co.lineItems||[],cd={value:tp.amount?parseFloat(tp.amount):0,currency:tp.currencyCode||"USD",contentIds:li.map(function(l){return l.variant?String(l.variant.id):""}).filter(Boolean),contentType:"product",contents:li.map(function(l){return{id:l.variant?String(l.variant.id):"",quantity:l.quantity||1,itemPrice:l.variant&&l.variant.price?parseFloat(l.variant.price.amount):0}}),numItems:li.reduce(function(s,l){return s+(l.quantity||1)},0),orderId:co.order?co.order.name:null};var pud=eu(co);se("Purchase",id,cd,{email:pud.email||((su)&&su.email)||null,phone:pud.phone||((su)&&su.phone)||null,firstName:pud.firstName||((su)&&su.firstName)||null,lastName:pud.lastName||((su)&&su.lastName)||null,city:pud.city||((su)&&su.city)||null,state:pud.state||((su)&&su.state)||null,zip:pud.zip||((su)&&su.zip)||null,countryCode:pud.countryCode||((su)&&su.countryCode)||null});if(typeof fbq==="function")fbq("track","Purchase",{content_ids:cd.contentIds,content_type:cd.contentType,value:cd.value,currency:cd.currency,num_items:cd.numItems,contents:cd.contents},{eventID:id})});
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
    select: { apiKey: true, metaPixelId: true },
  });

  if (!workspace) {
    return new Response("// Track Clear: workspace not found", {
      status: 404,
      headers: { "Content-Type": "text/javascript", ...corsHeaders },
    });
  }

  const ingestUrl =
    process.env.NEXT_PUBLIC_INGEST_URL ||
    "https://api.trackclear.io/api/events/ingest";

  const js = generatePixelCode(workspace.apiKey, workspace.metaPixelId, ingestUrl);

  return new Response(js, {
    status: 200,
    headers: {
      "Content-Type": "text/javascript",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      ...corsHeaders,
    },
  });
}
