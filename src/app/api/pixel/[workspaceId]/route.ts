import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contentIdOptionsFromWorkspace, type ContentIdOptions } from "@/lib/content-id";

function sanitizeForJs(value: string): string {
  return value.replace(/[\\'"<>&`\n\r\0]/g, "");
}

function generatePixelCode(
  apiKey: string,
  pixelId: string | null,
  ingestUrl: string,
  hasShopifyWebhook: boolean,
  workspaceId: string,
  contentIdOptions: ContentIdOptions = {}
): string {
  return `// Track Clear v2 - Server-Side Event Tracking
(async function(){
var A=window.__tcAnalytics,B=window.__tcBrowser,I=window.__tcInit;
if(!A){console.error("[TrackClear] Missing analytics global");return}
var K="${sanitizeForJs(apiKey)}",E="${sanitizeForJs(ingestUrl)}",W="${sanitizeForJs(workspaceId)}";
var H=${hasShopifyWebhook ? "true" : "false"};
var CM="${sanitizeForJs(String(contentIdOptions.mode ?? "VARIANT_NUMERIC_ID"))}",CP="${sanitizeForJs(contentIdOptions.prefix ?? "")}",CS="${sanitizeForJs(contentIdOptions.suffix ?? "")}",CT="${sanitizeForJs(contentIdOptions.template ?? "")}";
${pixelId ? `var P="${sanitizeForJs(pixelId)}";` : ""}
function gc(n){try{var m=document.cookie.match(new RegExp("(^| )"+n+"=([^;]+)"));return m?m[2]:null}catch(e){return null}}
var pageUrl="",pageRef="";try{var loc=I.context.document.location;pageUrl=loc.href||"";pageRef=I.context.document.referrer||""}catch(e){try{pageUrl=location.href;pageRef=document.referrer}catch(e2){}}
function gp(n){try{var u=new URL(pageUrl);return u.searchParams.get(n)}catch(e){return null}}
function vp(v){if(!v)return null;return/^fb\\.1\\.\\d{13}\\.\\d{7,20}$/.test(v)?v:null}
function vf(v){if(!v)return null;var m=v.match(/^fb\\.1\\.(\\d{13})\\..+$/);if(!m)return null;if(Date.now()-parseInt(m[1],10)>7776000000)return null;return v}
function xf(v){if(!v)return null;var p=v.lastIndexOf(".");return p>0?v.substring(p+1):null}
var utm={s:gp("utm_source"),m:gp("utm_medium"),c:gp("utm_campaign"),n:gp("utm_content"),t:gp("utm_term")};
var cid={tt:gp("ttclid"),rd:gp("rdt_cid"),ep:gp("epik")||gc("_epik"),gl:gp("gclid"),fb:gp("fbclid"),gb:gp("gbraid"),wb:gp("wbraid")};
var gaClientId=null;
try{if(B){var _gac=await B.cookie.get("_ga");if(_gac){var _gap=_gac.split(".");if(_gap.length>=4)gaClientId=_gap.slice(2).join(".")}}}catch(e){}
var fbpVal=null;try{if(B){var _rfp=await B.cookie.get("_fbp");fbpVal=vp(_rfp)}}catch(e){}
var fbcVal=null;try{if(B){var _rfc=await B.cookie.get("_fbc");fbcVal=vf(_rfc)}}catch(e){}
var sid=null;try{if(B){sid=await B.cookie.get("_trackclear_session_id")}}catch(e){}
var _sc=null;try{if(B&&B.sessionStorage){var _sr=await B.sessionStorage.getItem("_tc");if(_sr)_sc=JSON.parse(_sr)}}catch(e){}
if(_sc){utm.s=utm.s||_sc.us||null;utm.m=utm.m||_sc.um||null;utm.c=utm.c||_sc.uc||null;utm.n=utm.n||_sc.un||null;utm.t=utm.t||_sc.ut||null;cid.tt=cid.tt||_sc.tt||null;cid.rd=cid.rd||_sc.rd||null;cid.ep=cid.ep||_sc.ep||null;cid.gl=cid.gl||_sc.gl||null;cid.gb=cid.gb||_sc.gb||null;cid.wb=cid.wb||_sc.wb||null;fbpVal=fbpVal||vp(_sc.fp)||null;fbcVal=fbcVal||vf(_sc.fc)||null}
if(!fbpVal||!fbcVal||!cid.gl||!cid.tt||!cid.gb||!cid.wb){try{var _ca=(I.data&&I.data.cart&&I.data.cart.attributes)||[];for(var _ci=0;_ci<_ca.length;_ci++){if(_ca[_ci].key==="_fbp"&&!fbpVal)fbpVal=vp(_ca[_ci].value);if(_ca[_ci].key==="_fbc"&&!fbcVal)fbcVal=vf(_ca[_ci].value);if(_ca[_ci].key==="_gclid"&&!cid.gl)cid.gl=_ca[_ci].value;if(_ca[_ci].key==="_gbraid"&&!cid.gb)cid.gb=_ca[_ci].value;if(_ca[_ci].key==="_wbraid"&&!cid.wb)cid.wb=_ca[_ci].value;if(_ca[_ci].key==="_ttclid"&&!cid.tt)cid.tt=_ca[_ci].value;if(_ca[_ci].key==="_trackclear_session_id"&&!sid)sid=_ca[_ci].value}}catch(e){}}
if(!fbpVal){fbpVal="fb.1."+Date.now()+"."+Math.floor(1000000000+Math.random()*9000000000);try{if(B)await B.cookie.set("_fbp",fbpVal)}catch(e){}}
if(cid.fb){var _ef=xf(fbcVal);if(!fbcVal||_ef!==cid.fb){fbcVal="fb.1."+Date.now()+"."+cid.fb;try{if(B)await B.cookie.set("_fbc",fbcVal)}catch(e){}}}
if(!sid&&_sc)sid=_sc.sid||null;if(!sid){sid=(crypto.randomUUID?crypto.randomUUID():String(Date.now())+"."+Math.random().toString(36).slice(2));try{if(B)await B.cookie.set("_trackclear_session_id",sid)}catch(e){}}
var lp=(_sc&&_sc.lp)||pageUrl;
try{if(B&&B.sessionStorage){await B.sessionStorage.setItem("_tc",JSON.stringify({sid:sid,lp:lp,us:utm.s,um:utm.m,uc:utm.c,un:utm.n,ut:utm.t,tt:cid.tt,rd:cid.rd,ep:cid.ep,gl:cid.gl,gb:cid.gb,wb:cid.wb,fp:fbpVal,fc:fbcVal}))}}catch(e){}
var su=null;var _ciId=null;
var iu={};try{if(I&&I.data&&I.data.customer){var _ic=I.data.customer;iu={email:_ic.email||null,phone:_ic.phone||null,firstName:_ic.firstName||null,lastName:_ic.lastName||null,customerId:_ic.id||null}}}catch(e){}
function mu(a,b){var r={};for(var k in a){if(a[k])r[k]=a[k]}for(var k in b){if(b[k])r[k]=b[k]}return r}
function cn(){var c={};try{if(I&&I.customerPrivacy){c.analyticsAllowed=I.customerPrivacy.analyticsProcessingAllowed;c.marketingAllowed=I.customerPrivacy.marketingAllowed}}catch(e){}return c}
function av(o,k,v){if(v!==null&&v!==undefined&&String(v)!=="")o[k]=String(v)}
function at(){var c=cn(),o={};av(o,"_trackclear_session_id",sid);av(o,"_fbp",fbpVal);av(o,"_fbc",fbcVal);av(o,"_fbclid",cid.fb);av(o,"_gclid",cid.gl);av(o,"_gbraid",cid.gb);av(o,"_wbraid",cid.wb);av(o,"_ttclid",cid.tt);av(o,"_rdt_cid",cid.rd);av(o,"_epik",cid.ep);av(o,"_utm_source",utm.s);av(o,"_utm_medium",utm.m);av(o,"_utm_campaign",utm.c);av(o,"_utm_content",utm.n);av(o,"_utm_term",utm.t);av(o,"_landing_page",lp);if(c.analyticsAllowed!==undefined)av(o,"_tc_consent_analytics",c.analyticsAllowed);if(c.marketingAllowed!==undefined)av(o,"_tc_consent_marketing",c.marketingAllowed);if(c.analyticsAllowed!==undefined||c.marketingAllowed!==undefined){av(o,"_tc_consent_timestamp",Date.now());av(o,"_tc_consent_source","shopify_customer_privacy")}return o}
function wa(){try{var o=at(),b=new URLSearchParams();for(var k in o)b.append("attributes["+k+"]",o[k]);if(!b.toString())return;fetch(new URL("/cart/update.js",pageUrl||location.href).toString(),{method:"POST",mode:"no-cors",credentials:"include",keepalive:true,headers:{"Content-Type":"application/x-www-form-urlencoded"},body:b.toString()})}catch(e){}}
function se(en,eid,cd,ud,od,ed){var c=cn();var _ud=mu(iu,ud||{});try{fetch(E,{method:"POST",headers:{"Content-Type":"application/json","X-TL-API-Key":K},body:JSON.stringify({eventName:en,eventId:eid,timestamp:Date.now(),url:pageUrl,referrer:pageRef,trackclearSessionId:sid,checkoutToken:(cd&&cd.checkoutToken)||undefined,cartToken:(cd&&cd.cartToken)||undefined,fbp:fbpVal||gc("_fbp"),fbc:fbcVal||gc("_fbc"),fbclid:cid.fb,gbraid:cid.gb,wbraid:cid.wb,ttclid:cid.tt,rdtCid:cid.rd,epik:cid.ep,gaClientId:gaClientId,utmSource:utm.s,utmMedium:utm.m,utmCampaign:utm.c,utmContent:utm.n,utmTerm:utm.t,gclid:cid.gl,consent:c,userData:_ud,customData:cd||{},onlyDestinations:od||undefined,excludeDestinations:ed||undefined}),keepalive:true})}catch(e){}}
function eu(co){if(!co)return{};var b=co.billingAddress||co.shippingAddress||{};return{email:co.email||(co.order&&co.order.customer&&co.order.customer.email)||null,phone:b.phone||co.phone||null,firstName:b.firstName||null,lastName:b.lastName||null,city:b.city||null,state:b.province||b.provinceCode||null,zip:b.zip||null,countryCode:b.countryCode||null}}
function ni(v){if(v==null)return"";v=String(v).trim();var m=v.match(/^gid:\\/\\/shopify\\/[^\\/]+\\/([^\\/?#]+)/i);if(m)v=m[1];m=v.match(/\\/(\\d+)(?:[\\/?#].*)?$/);if(m)v=m[1];return String(v).replace(/^#+/,"").toLowerCase().replace(/[^a-z0-9._:-]+/g,"_").replace(/^_+|_+$/g,"").slice(0,180)}
function cg(r,x,n){x=x||"";if(/^gid:\\/\\/shopify\\//.test(x))return x;var d=ni(x||n);return d?"gid://shopify/"+r+"/"+d:x||""}
function cv(v){if(v==null)return"";return String(v).trim()}
function ct(t,o){return t.replace(/\\{\\{\\s*([a-zA-Z0-9_]+)\\s*\\}\\}/g,function(_,k){return o[k]||""})}
function fm(o){o=o||{};var v="",vals={variant_id:ni(o.variantId||o.variantGraphqlId),product_id:ni(o.productId||o.productGraphqlId),variant_graphql_id:cg("ProductVariant",o.variantGraphqlId,o.variantId),product_graphql_id:cg("Product",o.productGraphqlId,o.productId),sku:cv(o.sku),country:cv(o.country)};if(CM==="PRODUCT_NUMERIC_ID")v=vals.product_id;else if(CM==="VARIANT_GRAPHQL_ID")v=vals.variant_graphql_id;else if(CM==="PRODUCT_GRAPHQL_ID")v=vals.product_graphql_id;else if(CM==="SKU")v=vals.sku;else if(CM==="CUSTOM")v=ct(CT,vals);else v=vals.variant_id||vals.product_id||vals.sku;v=cv(v);return v?cv(CP+v+CS).slice(0,180):""}
function ci(o){var id=fm(o);return id?[id]:[]}
function lo(l){l=l||{};var v=l.variant||l.merchandise||{},p=v.product||l.product||{};return{variantId:v.id||v.variantId||l.variant_id,variantGraphqlId:v.id||v.admin_graphql_api_id,productId:p.id||p.productId||l.product_id,productGraphqlId:p.id||p.admin_graphql_api_id,sku:v.sku||l.sku}}
function pid(co){co=co||{};var o=co.order||{},id=ni(o.id||o.admin_graphql_api_id||o.name||co.orderName||co.checkoutToken||co.token||co.id||co.cartToken||co.cartId);return id?"shopify-purchase:"+W+":"+id:crypto.randomUUID()}
A.subscribe("page_viewed",function(e){var id=crypto.randomUUID();se("PageView",id,{},{});if(typeof fbq==="function")fbq("track","PageView",{},{eventID:id})});
A.subscribe("product_viewed",function(e){var id=crypto.randomUUID(),v=e.data.productVariant||{},cd={contentIds:ci({variantId:v.id,variantGraphqlId:v.id,productId:v.product&&v.product.id,productGraphqlId:v.product&&v.product.id,sku:v.sku}),contentType:"product",contentName:v.title||"",contentCategory:(v.product&&v.product.type)||"",value:v.price?parseFloat(v.price.amount):0,currency:v.price?v.price.currencyCode:"USD"};se("ViewContent",id,cd,{});if(typeof fbq==="function")fbq("track","ViewContent",{content_ids:cd.contentIds,content_type:cd.contentType,content_name:cd.contentName,value:cd.value,currency:cd.currency},{eventID:id})});
A.subscribe("product_added_to_cart",function(e){var id=crypto.randomUUID(),cl=e.data.cartLine||{},m=cl.merchandise||{},t=(cl.cost||{}).totalAmount||{},cd={contentIds:ci({variantId:m.id,variantGraphqlId:m.id,productId:m.product&&m.product.id,productGraphqlId:m.product&&m.product.id,sku:m.sku}),contentType:"product",value:t.amount?parseFloat(t.amount):0,currency:t.currencyCode||"USD",numItems:cl.quantity||1};wa();se("AddToCart",id,cd,{});if(typeof fbq==="function")fbq("track","AddToCart",{content_ids:cd.contentIds,content_type:cd.contentType,value:cd.value,currency:cd.currency,num_items:cd.numItems},{eventID:id})});
A.subscribe("checkout_started",function(e){var id=crypto.randomUUID();_ciId=id;var co=e.data.checkout||{},tp=co.totalPrice||{},cd={value:tp.amount?parseFloat(tp.amount):0,currency:tp.currencyCode||"USD",contentIds:(co.lineItems||[]).map(function(l){return fm(lo(l))}).filter(Boolean),contentType:"product",numItems:(co.lineItems||[]).length,checkoutToken:co.checkoutToken||co.token||co.id||null,cartToken:co.cartToken||co.cartId||null};wa();se("InitiateCheckout",id,cd,eu(co),null,["META","KLAVIYO"]);if(typeof fbq==="function")fbq("track","InitiateCheckout",{content_ids:cd.contentIds,content_type:cd.contentType,value:cd.value,currency:cd.currency,num_items:cd.numItems},{eventID:id})});
A.subscribe("checkout_contact_info_submitted",function(e){var co=e.data.checkout||{},ud=eu(co);su=mu(su||{},ud);if(ud.email||ud.phone){var tp=co.totalPrice||{},cd={value:tp.amount?parseFloat(tp.amount):0,currency:tp.currencyCode||"USD",contentIds:(co.lineItems||[]).map(function(l){return fm(lo(l))}).filter(Boolean),contentType:"product",numItems:(co.lineItems||[]).length,checkoutToken:co.checkoutToken||co.token||co.id||null,cartToken:co.cartToken||co.cartId||null};se("InitiateCheckout",_ciId||crypto.randomUUID(),cd,ud,["META"]);var id=crypto.randomUUID();se("InitiateCheckout",id,cd,ud,["KLAVIYO"])}});
A.subscribe("checkout_address_info_submitted",function(e){var co=e.data.checkout||{},ud=eu(co);su=mu(su||{},ud)});
A.subscribe("checkout_completed",function(e){var co=e.data.checkout||{},id=pid(co),tp=co.totalPrice||{},li=co.lineItems||[],o=co.order||{},cd={value:tp.amount?parseFloat(tp.amount):0,currency:tp.currencyCode||"USD",contentIds:li.map(function(l){return fm(lo(l))}).filter(Boolean),contentType:"product",contents:li.map(function(l){return{id:fm(lo(l)),quantity:l.quantity||1,itemPrice:l.variant&&l.variant.price?parseFloat(l.variant.price.amount):0}}).filter(function(x){return x.id}),numItems:li.reduce(function(s,l){return s+(l.quantity||1)},0),orderId:o.id||o.name||null,orderName:o.name||null,checkoutToken:co.checkoutToken||co.token||co.id||null,cartToken:co.cartToken||co.cartId||null};var pud=eu(co);se("Purchase",id,cd,{email:pud.email||((su)&&su.email)||null,phone:pud.phone||((su)&&su.phone)||null,firstName:pud.firstName||((su)&&su.firstName)||null,lastName:pud.lastName||((su)&&su.lastName)||null,city:pud.city||((su)&&su.city)||null,state:pud.state||((su)&&su.state)||null,zip:pud.zip||((su)&&su.zip)||null,countryCode:pud.countryCode||((su)&&su.countryCode)||null});if(!H&&typeof fbq==="function")fbq("track","Purchase",{content_ids:cd.contentIds,content_type:cd.contentType,value:cd.value,currency:cd.currency,num_items:cd.numItems,contents:cd.contents},{eventID:id})});
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
      shopifyWebhookSecretEncrypted: true,
      catalogIdMode: true,
      catalogIdPrefix: true,
      catalogIdSuffix: true,
      catalogIdTemplate: true,
    },
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

  const js = generatePixelCode(
    workspace.apiKey,
    workspace.metaPixelId,
    ingestUrl,
    !!workspace.shopifyWebhookSecretEncrypted,
    workspaceId,
    contentIdOptionsFromWorkspace(workspace)
  );

  return new Response(js, {
    status: 200,
    headers: {
      "Content-Type": "text/javascript",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      ...corsHeaders,
    },
  });
}
