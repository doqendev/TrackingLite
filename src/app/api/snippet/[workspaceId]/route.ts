import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

function generateSnippet(
  apiKey: string,
  pixelId: string | null,
  ingestUrl: string
): string {
  return `// TrackingLite - Server-Side Meta CAPI Tracking
(function(){
  var TL_API_KEY="${apiKey}";
  var TL_ENDPOINT="${ingestUrl}";
  ${pixelId ? `var TL_PIXEL_ID="${pixelId}";` : ""}

  function getCookie(name){
    try{var match=document.cookie.match(new RegExp("(^| )"+name+"=([^;]+)"));return match?match[2]:null;}catch(e){return null;}
  }

  function sendEvent(eventName,eventId,customData,userData){
    var consent={};
    try{if(init&&init.customerPrivacy){consent.analyticsAllowed=init.customerPrivacy.analyticsProcessingAllowed;consent.marketingAllowed=init.customerPrivacy.marketingAllowed;}}catch(e){}
    var payload={eventName:eventName,eventId:eventId,timestamp:Date.now(),url:(typeof location!=="undefined")?location.href:"",referrer:(typeof document!=="undefined")?document.referrer:"",fbp:getCookie("_fbp"),fbc:getCookie("_fbc"),consent:consent,userData:userData||{},customData:customData||{}};
    try{fetch(TL_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json","X-TL-API-Key":TL_API_KEY},body:JSON.stringify(payload),keepalive:true});}catch(e){}
  }

  function extractUserData(checkout){
    if(!checkout)return {};
    var ba=checkout.billingAddress||checkout.shippingAddress||{};
    var email=checkout.email||(checkout.order&&checkout.order.customer&&checkout.order.customer.email);
    return {email:email||null,phone:ba.phone||checkout.phone||null,firstName:ba.firstName||null,lastName:ba.lastName||null,city:ba.city||null,state:ba.province||ba.provinceCode||null,zip:ba.zip||null,countryCode:ba.countryCode||null};
  }

  analytics.subscribe("page_viewed",function(event){var eid=crypto.randomUUID();sendEvent("PageView",eid,{},{});if(typeof fbq==="function"){fbq("track","PageView",{},{eventID:eid});}});
  analytics.subscribe("product_viewed",function(event){var eid=crypto.randomUUID();var v=event.data.productVariant||{};var cd={contentIds:v.id?[String(v.id)]:[],contentType:"product",contentName:v.title||"",contentCategory:(v.product&&v.product.type)||"",value:v.price?parseFloat(v.price.amount):0,currency:v.price?v.price.currencyCode:"USD"};sendEvent("ViewContent",eid,cd,{});if(typeof fbq==="function"){fbq("track","ViewContent",{content_ids:cd.contentIds,content_type:cd.contentType,content_name:cd.contentName,value:cd.value,currency:cd.currency},{eventID:eid});}});
  analytics.subscribe("product_added_to_cart",function(event){var eid=crypto.randomUUID();var cl=event.data.cartLine||{};var merch=cl.merchandise||{};var cost=cl.cost||{};var total=cost.totalAmount||{};var cd={contentIds:merch.id?[String(merch.id)]:[],contentType:"product",value:total.amount?parseFloat(total.amount):0,currency:total.currencyCode||"USD",numItems:cl.quantity||1};sendEvent("AddToCart",eid,cd,{});if(typeof fbq==="function"){fbq("track","AddToCart",{content_ids:cd.contentIds,content_type:cd.contentType,value:cd.value,currency:cd.currency,num_items:cd.numItems},{eventID:eid});}});
  analytics.subscribe("checkout_started",function(event){var eid=crypto.randomUUID();var co=event.data.checkout||{};var tp=co.totalPrice||{};var cd={value:tp.amount?parseFloat(tp.amount):0,currency:tp.currencyCode||"USD",contentIds:(co.lineItems||[]).map(function(li){return li.variant?String(li.variant.id):""}).filter(Boolean),contentType:"product",numItems:(co.lineItems||[]).length};var ud=extractUserData(co);sendEvent("InitiateCheckout",eid,cd,ud);if(typeof fbq==="function"){fbq("track","InitiateCheckout",{content_ids:cd.contentIds,content_type:cd.contentType,value:cd.value,currency:cd.currency,num_items:cd.numItems},{eventID:eid});}});
  analytics.subscribe("checkout_completed",function(event){var eid=crypto.randomUUID();var co=event.data.checkout||{};var tp=co.totalPrice||{};var lineItems=co.lineItems||[];var cd={value:tp.amount?parseFloat(tp.amount):0,currency:tp.currencyCode||"USD",contentIds:lineItems.map(function(li){return li.variant?String(li.variant.id):""}).filter(Boolean),contentType:"product",contents:lineItems.map(function(li){return{id:li.variant?String(li.variant.id):"",quantity:li.quantity||1,itemPrice:li.variant&&li.variant.price?parseFloat(li.variant.price.amount):0}}),numItems:lineItems.reduce(function(sum,li){return sum+(li.quantity||1)},0),orderId:co.order?co.order.name:null};var ud=extractUserData(co);sendEvent("Purchase",eid,cd,ud);if(typeof fbq==="function"){fbq("track","Purchase",{content_ids:cd.contentIds,content_type:cd.contentType,value:cd.value,currency:cd.currency,num_items:cd.numItems,contents:cd.contents},{eventID:eid});}});
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
    "https://api.trackinglite.com/api/events/ingest";

  const snippet = generateSnippet(
    workspace.apiKey,
    workspace.metaPixelId,
    ingestUrl
  );

  return NextResponse.json({ snippet });
}
