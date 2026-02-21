import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

function sanitizeForJs(value: string): string {
  return value.replace(/[\\'"<>&]/g, "");
}

function generateSnippet(apiKey: string, pixelId: string | null, ingestUrl: string): string {
  return `// Track Clear - Server-Side Event Tracking
(function(){
var K="${sanitizeForJs(apiKey)}",E="${sanitizeForJs(ingestUrl)}";
${pixelId ? `var P="${sanitizeForJs(pixelId)}";` : ""}
function gc(n){try{var m=document.cookie.match(new RegExp("(^| )"+n+"=([^;]+)"));return m?m[2]:null}catch(e){return null}}
function gp(n){try{var u=new URL(location.href);return u.searchParams.get(n)}catch(e){return null}}
var utm={s:gp("utm_source"),m:gp("utm_medium"),c:gp("utm_campaign"),n:gp("utm_content"),t:gp("utm_term")};
var su=null;
function se(en,eid,cd,ud,od){var c={};try{if(init&&init.customerPrivacy){c.analyticsAllowed=init.customerPrivacy.analyticsProcessingAllowed;c.marketingAllowed=init.customerPrivacy.marketingAllowed}}catch(e){}try{fetch(E,{method:"POST",headers:{"Content-Type":"application/json","X-TL-API-Key":K},body:JSON.stringify({eventName:en,eventId:eid,timestamp:Date.now(),url:(typeof location!=="undefined")?location.href:"",referrer:(typeof document!=="undefined")?document.referrer:"",fbp:gc("_fbp"),fbc:gc("_fbc"),ttclid:gp("ttclid"),rdtCid:gp("rdt_cid"),epik:gp("epik")||gc("_epik"),utmSource:utm.s,utmMedium:utm.m,utmCampaign:utm.c,utmContent:utm.n,utmTerm:utm.t,gclid:gp("gclid"),consent:c,userData:ud||{},customData:cd||{},onlyDestinations:od||undefined}),keepalive:true})}catch(e){}}
function eu(co){if(!co)return{};var b=co.billingAddress||co.shippingAddress||{};return{email:co.email||(co.order&&co.order.customer&&co.order.customer.email)||null,phone:b.phone||co.phone||null,firstName:b.firstName||null,lastName:b.lastName||null,city:b.city||null,state:b.province||b.provinceCode||null,zip:b.zip||null,countryCode:b.countryCode||null}}
analytics.subscribe("page_viewed",function(e){var id=crypto.randomUUID();se("PageView",id,{},{});if(typeof fbq==="function")fbq("track","PageView",{},{eventID:id})});
analytics.subscribe("product_viewed",function(e){var id=crypto.randomUUID(),v=e.data.productVariant||{},cd={contentIds:v.id?[String(v.id)]:[],contentType:"product",contentName:v.title||"",contentCategory:(v.product&&v.product.type)||"",value:v.price?parseFloat(v.price.amount):0,currency:v.price?v.price.currencyCode:"USD"};se("ViewContent",id,cd,{});if(typeof fbq==="function")fbq("track","ViewContent",{content_ids:cd.contentIds,content_type:cd.contentType,content_name:cd.contentName,value:cd.value,currency:cd.currency},{eventID:id})});
analytics.subscribe("product_added_to_cart",function(e){var id=crypto.randomUUID(),cl=e.data.cartLine||{},m=cl.merchandise||{},t=(cl.cost||{}).totalAmount||{},cd={contentIds:m.id?[String(m.id)]:[],contentType:"product",value:t.amount?parseFloat(t.amount):0,currency:t.currencyCode||"USD",numItems:cl.quantity||1};se("AddToCart",id,cd,{});if(typeof fbq==="function")fbq("track","AddToCart",{content_ids:cd.contentIds,content_type:cd.contentType,value:cd.value,currency:cd.currency,num_items:cd.numItems},{eventID:id})});
analytics.subscribe("checkout_started",function(e){var id=crypto.randomUUID(),co=e.data.checkout||{},tp=co.totalPrice||{},cd={value:tp.amount?parseFloat(tp.amount):0,currency:tp.currencyCode||"USD",contentIds:(co.lineItems||[]).map(function(l){return l.variant?String(l.variant.id):""}).filter(Boolean),contentType:"product",numItems:(co.lineItems||[]).length};se("InitiateCheckout",id,cd,eu(co));if(typeof fbq==="function")fbq("track","InitiateCheckout",{content_ids:cd.contentIds,content_type:cd.contentType,value:cd.value,currency:cd.currency,num_items:cd.numItems},{eventID:id})});
analytics.subscribe("checkout_contact_info_submitted",function(e){var co=e.data.checkout||{},ud=eu(co);su=ud;if(ud.email||ud.phone){var id=crypto.randomUUID(),tp=co.totalPrice||{},cd={value:tp.amount?parseFloat(tp.amount):0,currency:tp.currencyCode||"USD",contentIds:(co.lineItems||[]).map(function(l){return l.variant?String(l.variant.id):""}).filter(Boolean),contentType:"product",numItems:(co.lineItems||[]).length};se("InitiateCheckout",id,cd,ud,["KLAVIYO"])}});
analytics.subscribe("checkout_completed",function(e){var id=crypto.randomUUID(),co=e.data.checkout||{},tp=co.totalPrice||{},li=co.lineItems||[],cd={value:tp.amount?parseFloat(tp.amount):0,currency:tp.currencyCode||"USD",contentIds:li.map(function(l){return l.variant?String(l.variant.id):""}).filter(Boolean),contentType:"product",contents:li.map(function(l){return{id:l.variant?String(l.variant.id):"",quantity:l.quantity||1,itemPrice:l.variant&&l.variant.price?parseFloat(l.variant.price.amount):0}}),numItems:li.reduce(function(s,l){return s+(l.quantity||1)},0),orderId:co.order?co.order.name:null};var pud=eu(co);se("Purchase",id,cd,{email:pud.email||((su)&&su.email)||null,phone:pud.phone||((su)&&su.phone)||null,firstName:pud.firstName||((su)&&su.firstName)||null,lastName:pud.lastName||((su)&&su.lastName)||null,city:pud.city||((su)&&su.city)||null,state:pud.state||((su)&&su.state)||null,zip:pud.zip||((su)&&su.zip)||null,countryCode:pud.countryCode||((su)&&su.countryCode)||null});if(typeof fbq==="function")fbq("track","Purchase",{content_ids:cd.contentIds,content_type:cd.contentType,value:cd.value,currency:cd.currency,num_items:cd.numItems,contents:cd.contents},{eventID:id})});
})();`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId } = await params;

  const workspace = await db.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id, isActive: true },
    select: { apiKey: true, metaPixelId: true },
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const ingestUrl =
    process.env.NEXT_PUBLIC_INGEST_URL ||
    "https://api.trackclear.io/api/events/ingest";

  const snippet = generateSnippet(workspace.apiKey, workspace.metaPixelId, ingestUrl);

  return NextResponse.json({ snippet });
}
