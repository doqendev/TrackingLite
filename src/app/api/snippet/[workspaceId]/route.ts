import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getWorkspacePixelUrl } from "@/lib/custom-ingest-domain";

const LOADER_BRIDGE_VERSION = "bridge-v1";

function generateLoaderSnippet(pixelUrl: string): string {
  return `// Track Clear - Server-Side Event Tracking (${LOADER_BRIDGE_VERSION}; remote tracker auto-updates)
(function(){
  // Subscribe before the external script request. Shopify does not document
  // replaying standard events to late subscribers, so a bounded bridge keeps
  // the first page/checkout event until the generated tracker is ready.
  var eventQueue=[],eventHandlers={},eventBridgeActive=false,eventQueueLimit=100;
  function deliverBufferedEvent(item){
    var handler=eventHandlers[item.name];
    if(!handler)return;
    try{var result=handler(item.event);if(result&&typeof result.catch==="function")result.catch(function(){})}catch(e){}
  }
  function bufferEvent(name,event){
    var item={name:name,event:event};
    if(eventBridgeActive)deliverBufferedEvent(item);
    else{if(eventQueue.length>=eventQueueLimit)eventQueue.shift();eventQueue.push(item)}
  }
  function ignoreSubscriptionError(subscription){
    if(subscription&&typeof subscription.catch==="function")subscription.catch(function(){})
  }
  window.__tcAnalytics={subscribe:function(name,callback){
    if(typeof callback!=="function")return Promise.resolve();
    eventHandlers[name]=callback;
    return Promise.resolve();
  },activate:function(){
    if(eventBridgeActive)return;
    eventBridgeActive=true;
    var buffered=eventQueue;eventQueue=[];
    for(var i=0;i<buffered.length;i++)deliverBufferedEvent(buffered[i]);
  }};
  // Shopify's Custom Pixel validator requires literal standard-event names.
  // Keep each subscription explicit so the editor recognizes and accepts all seven.
  try{ignoreSubscriptionError(analytics.subscribe("page_viewed",function(event){bufferEvent("page_viewed",event)}))}catch(e){}
  try{ignoreSubscriptionError(analytics.subscribe("product_viewed",function(event){bufferEvent("product_viewed",event)}))}catch(e){}
  try{ignoreSubscriptionError(analytics.subscribe("product_added_to_cart",function(event){bufferEvent("product_added_to_cart",event)}))}catch(e){}
  try{ignoreSubscriptionError(analytics.subscribe("checkout_started",function(event){bufferEvent("checkout_started",event)}))}catch(e){}
  try{ignoreSubscriptionError(analytics.subscribe("checkout_contact_info_submitted",function(event){bufferEvent("checkout_contact_info_submitted",event)}))}catch(e){}
  try{ignoreSubscriptionError(analytics.subscribe("checkout_address_info_submitted",function(event){bufferEvent("checkout_address_info_submitted",event)}))}catch(e){}
  try{ignoreSubscriptionError(analytics.subscribe("checkout_completed",function(event){bufferEvent("checkout_completed",event)}))}catch(e){}
  window.__tcBrowser=browser;
  window.__tcInit=init;
  window.__tcCustomerPrivacy=(typeof api!=="undefined"&&api.customerPrivacy)?api.customerPrivacy:(typeof customerPrivacy!=="undefined"?customerPrivacy:null);
  window.__tcPrivacyStatus=(init&&init.customerPrivacy)||{};
  try{if(window.__tcCustomerPrivacy&&typeof window.__tcCustomerPrivacy.subscribe==="function"){var cp=window.__tcCustomerPrivacy.subscribe("visitorConsentCollected",function(e){window.__tcPrivacyStatus=(e&&e.customerPrivacy)||window.__tcPrivacyStatus});if(cp&&typeof cp.catch==="function")cp.catch(function(){})}}catch(e){}
  var s=document.createElement("script");
  s.src="${pixelUrl}?loader=${LOADER_BRIDGE_VERSION}";
  s.async=true;
  s.onerror=function(){console.error("[TrackClear] Pixel load failed")};
  document.head.appendChild(s);
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
    select: {
      apiKey: true,
      metaPixelId: true,
      customIngestDomain: true,
      customIngestDomainVerifiedAt: true,
    },
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const pixelUrl = getWorkspacePixelUrl(workspace, workspaceId);
  const snippet = generateLoaderSnippet(pixelUrl);

  return NextResponse.json({ snippet });
}
