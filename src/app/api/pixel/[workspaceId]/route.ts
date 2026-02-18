import { NextResponse } from "next/server";
import { db } from "@/lib/db";

function generateTrackingScript(apiKey: string, pixelId: string | null, ingestUrl: string): string {
  return `(function(){
var TL_API_KEY="${apiKey}";
var TL_ENDPOINT="${ingestUrl}";
${pixelId ? `var TL_PIXEL_ID="${pixelId}";` : ""}
function getCookie(n){try{var m=document.cookie.match(new RegExp("(^| )"+n+"=([^;]+)"));return m?m[2]:null}catch(e){return null}}
function sendEvent(en,eid,cd,ud){var c={};try{if(init&&init.customerPrivacy){c.analyticsAllowed=init.customerPrivacy.analyticsProcessingAllowed;c.marketingAllowed=init.customerPrivacy.marketingAllowed}}catch(e){}var p={eventName:en,eventId:eid,timestamp:Date.now(),url:(typeof location!=="undefined")?location.href:"",referrer:(typeof document!=="undefined")?document.referrer:"",fbp:getCookie("_fbp"),fbc:getCookie("_fbc"),consent:c,userData:ud||{},customData:cd||{}};try{fetch(TL_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json","X-TL-API-Key":TL_API_KEY},body:JSON.stringify(p),keepalive:true})}catch(e){}}
function extractUserData(co){if(!co)return{};var ba=co.billingAddress||co.shippingAddress||{};var email=co.email||(co.order&&co.order.customer&&co.order.customer.email);return{email:email||null,phone:ba.phone||co.phone||null,firstName:ba.firstName||null,lastName:ba.lastName||null,city:ba.city||null,state:ba.province||ba.provinceCode||null,zip:ba.zip||null,countryCode:ba.countryCode||null}}
analytics.subscribe("page_viewed",function(e){var eid=crypto.randomUUID();sendEvent("PageView",eid,{},{});if(typeof fbq==="function"){fbq("track","PageView",{},{eventID:eid})}});
analytics.subscribe("product_viewed",function(e){var eid=crypto.randomUUID();var v=e.data.productVariant||{};var cd={contentIds:v.id?[String(v.id)]:[],contentType:"product",contentName:v.title||"",contentCategory:(v.product&&v.product.type)||"",value:v.price?parseFloat(v.price.amount):0,currency:v.price?v.price.currencyCode:"USD"};sendEvent("ViewContent",eid,cd,{});if(typeof fbq==="function"){fbq("track","ViewContent",{content_ids:cd.contentIds,content_type:cd.contentType,content_name:cd.contentName,value:cd.value,currency:cd.currency},{eventID:eid})}});
analytics.subscribe("product_added_to_cart",function(e){var eid=crypto.randomUUID();var cl=e.data.cartLine||{};var merch=cl.merchandise||{};var cost=cl.cost||{};var total=cost.totalAmount||{};var cd={contentIds:merch.id?[String(merch.id)]:[],contentType:"product",value:total.amount?parseFloat(total.amount):0,currency:total.currencyCode||"USD",numItems:cl.quantity||1};sendEvent("AddToCart",eid,cd,{});if(typeof fbq==="function"){fbq("track","AddToCart",{content_ids:cd.contentIds,content_type:cd.contentType,value:cd.value,currency:cd.currency,num_items:cd.numItems},{eventID:eid})}});
analytics.subscribe("checkout_started",function(e){var eid=crypto.randomUUID();var co=e.data.checkout||{};var tp=co.totalPrice||{};var cd={value:tp.amount?parseFloat(tp.amount):0,currency:tp.currencyCode||"USD",contentIds:(co.lineItems||[]).map(function(li){return li.variant?String(li.variant.id):""}).filter(Boolean),contentType:"product",numItems:(co.lineItems||[]).length};var ud=extractUserData(co);sendEvent("InitiateCheckout",eid,cd,ud);if(typeof fbq==="function"){fbq("track","InitiateCheckout",{content_ids:cd.contentIds,content_type:cd.contentType,value:cd.value,currency:cd.currency,num_items:cd.numItems},{eventID:eid})}});
analytics.subscribe("checkout_completed",function(e){var eid=crypto.randomUUID();var co=e.data.checkout||{};var tp=co.totalPrice||{};var li=co.lineItems||[];var cd={value:tp.amount?parseFloat(tp.amount):0,currency:tp.currencyCode||"USD",contentIds:li.map(function(l){return l.variant?String(l.variant.id):""}).filter(Boolean),contentType:"product",contents:li.map(function(l){return{id:l.variant?String(l.variant.id):"",quantity:l.quantity||1,itemPrice:l.variant&&l.variant.price?parseFloat(l.variant.price.amount):0}}),numItems:li.reduce(function(s,l){return s+(l.quantity||1)},0),orderId:co.order?co.order.name:null};var ud=extractUserData(co);sendEvent("Purchase",eid,cd,ud);if(typeof fbq==="function"){fbq("track","Purchase",{content_ids:cd.contentIds,content_type:cd.contentType,value:cd.value,currency:cd.currency,num_items:cd.numItems,contents:cd.contents},{eventID:eid})}});
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
    select: { apiKey: true, metaPixelId: true },
  });

  if (!workspace) {
    return new NextResponse("// workspace not found", {
      status: 404,
      headers: { "Content-Type": "application/javascript" },
    });
  }

  const ingestUrl =
    process.env.NEXT_PUBLIC_INGEST_URL ||
    "https://api.trackinglite.com/api/events/ingest";

  const script = generateTrackingScript(workspace.apiKey, workspace.metaPixelId, ingestUrl);

  return new NextResponse(script, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
