import { NextResponse } from "next/server";
import { db } from "@/lib/db";

function generateTrackingScript(
  apiKey: string,
  pixelId: string | null,
  ingestUrl: string,
  hasShopifyWebhook: boolean
): string {
  return `(function(){
var ctx=window.__tl||{},a=ctx.analytics||analytics;
var K="${apiKey}",E="${ingestUrl}";
var H=${hasShopifyWebhook ? "true" : "false"};
${pixelId ? `var P="${pixelId}";` : ""}
function gc(n){try{var m=document.cookie.match(new RegExp("(^| )"+n+"=([^;]+)"));return m?m[2]:null}catch(e){return null}}
function gp(n){try{var u=new URL(location.href);return u.searchParams.get(n)}catch(e){return null}}
function vp(v){if(!v)return null;return/^fb\\.1\\.\\d{13}\\.\\d{7,20}$/.test(v)?v:null}
function vf(v){if(!v)return null;var m=v.match(/^fb\\.1\\.(\\d{13})\\..+$/);if(!m)return null;if(Date.now()-parseInt(m[1],10)>7776000000)return null;return v}
function xf(v){if(!v)return null;var p=v.lastIndexOf(".");return p>0?v.substring(p+1):null}
var fbpVal=vp(gc("_fbp"));if(!fbpVal){fbpVal="fb.1."+Date.now()+"."+Math.floor(1000000000+Math.random()*9000000000);try{document.cookie="_fbp="+fbpVal+";max-age=7776000;path=/;SameSite=Lax"}catch(e){}}
var _fbclid=gp("fbclid");var fbcVal=vf(gc("_fbc"));if(_fbclid){var _ef=xf(fbcVal);if(!fbcVal||_ef!==_fbclid){fbcVal="fb.1."+Date.now()+"."+_fbclid;try{document.cookie="_fbc="+fbcVal+";max-age=7776000;path=/;SameSite=Lax"}catch(e){}}}
function se(en,eid,cd,ud){var c={};try{var cp=ctx.customerPrivacy||(typeof init!=="undefined"&&init.customerPrivacy);if(cp){c.analyticsAllowed=cp.analyticsProcessingAllowed;c.marketingAllowed=cp.marketingAllowed}}catch(e){}try{fetch(E,{method:"POST",headers:{"Content-Type":"application/json","X-TL-API-Key":K},body:JSON.stringify({eventName:en,eventId:eid,timestamp:Date.now(),url:(typeof location!=="undefined")?location.href:"",referrer:(typeof document!=="undefined")?document.referrer:"",fbp:fbpVal,fbc:fbcVal,consent:c,userData:ud||{},customData:cd||{}}),keepalive:true})}catch(e){}}
function eu(co){if(!co)return{};var b=co.billingAddress||co.shippingAddress||{};return{email:co.email||(co.order&&co.order.customer&&co.order.customer.email)||null,phone:b.phone||co.phone||null,firstName:b.firstName||null,lastName:b.lastName||null,city:b.city||null,state:b.province||b.provinceCode||null,zip:b.zip||null,countryCode:b.countryCode||null}}
a.subscribe("page_viewed",function(e){var id=crypto.randomUUID();se("PageView",id,{},{});if(typeof fbq==="function")fbq("track","PageView",{},{eventID:id})});
a.subscribe("product_viewed",function(e){var id=crypto.randomUUID(),v=e.data.productVariant||{},cd={contentIds:v.id?[String(v.id)]:[],contentType:"product",contentName:v.title||"",contentCategory:(v.product&&v.product.type)||"",value:v.price?parseFloat(v.price.amount):0,currency:v.price?v.price.currencyCode:"USD"};se("ViewContent",id,cd,{});if(typeof fbq==="function")fbq("track","ViewContent",{content_ids:cd.contentIds,content_type:cd.contentType,content_name:cd.contentName,value:cd.value,currency:cd.currency},{eventID:id})});
a.subscribe("product_added_to_cart",function(e){var id=crypto.randomUUID(),cl=e.data.cartLine||{},m=cl.merchandise||{},t=(cl.cost||{}).totalAmount||{},cd={contentIds:m.id?[String(m.id)]:[],contentType:"product",value:t.amount?parseFloat(t.amount):0,currency:t.currencyCode||"USD",numItems:cl.quantity||1};se("AddToCart",id,cd,{});if(typeof fbq==="function")fbq("track","AddToCart",{content_ids:cd.contentIds,content_type:cd.contentType,value:cd.value,currency:cd.currency,num_items:cd.numItems},{eventID:id})});
a.subscribe("checkout_started",function(e){var id=crypto.randomUUID(),co=e.data.checkout||{},tp=co.totalPrice||{},cd={value:tp.amount?parseFloat(tp.amount):0,currency:tp.currencyCode||"USD",contentIds:(co.lineItems||[]).map(function(l){return l.variant?String(l.variant.id):""}).filter(Boolean),contentType:"product",numItems:(co.lineItems||[]).length};se("InitiateCheckout",id,cd,eu(co));if(typeof fbq==="function")fbq("track","InitiateCheckout",{content_ids:cd.contentIds,content_type:cd.contentType,value:cd.value,currency:cd.currency,num_items:cd.numItems},{eventID:id})});
a.subscribe("checkout_completed",function(e){var id=crypto.randomUUID(),co=e.data.checkout||{},tp=co.totalPrice||{},li=co.lineItems||[],cd={value:tp.amount?parseFloat(tp.amount):0,currency:tp.currencyCode||"USD",contentIds:li.map(function(l){return l.variant?String(l.variant.id):""}).filter(Boolean),contentType:"product",contents:li.map(function(l){return{id:l.variant?String(l.variant.id):"",quantity:l.quantity||1,itemPrice:l.variant&&l.variant.price?parseFloat(l.variant.price.amount):0}}),numItems:li.reduce(function(s,l){return s+(l.quantity||1)},0),orderId:co.order?co.order.name:null};se("Purchase",id,cd,eu(co));if(!H&&typeof fbq==="function")fbq("track","Purchase",{content_ids:cd.contentIds,content_type:cd.contentType,value:cd.value,currency:cd.currency,num_items:cd.numItems,contents:cd.contents},{eventID:id})});
})();`;
}

// Public endpoint — no auth required (like ingest)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;

  const workspace = await db.workspace.findFirst({
    where: { id: workspaceId, isActive: true },
    select: { apiKey: true, metaPixelId: true, shopifyWebhookSecretEncrypted: true },
  });

  if (!workspace) {
    return new NextResponse("// workspace not found", {
      status: 404,
      headers: { "Content-Type": "application/javascript" },
    });
  }

  const ingestUrl =
    process.env.NEXT_PUBLIC_INGEST_URL ||
    "https://api.trackclear.io/api/events/ingest";

  const script = generateTrackingScript(
    workspace.apiKey,
    workspace.metaPixelId,
    ingestUrl,
    !!workspace.shopifyWebhookSecretEncrypted
  );

  return new NextResponse(script, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
