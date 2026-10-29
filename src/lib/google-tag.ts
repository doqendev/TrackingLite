import { isDestinationAllowedForWorkspace } from "@/lib/workspace-mode";

/**
 * The Google tag Track Clear runs in the shopper's browser when a store turns it
 * on (off by default, like the Meta and TikTok browser modes). It reports the
 * store's Google Ads conversion actions with the merchant's own labels, and its
 * Purchase action can be the server upload's destination too: Google then
 * merges browser and server copies through multi-source, matched by
 * transaction_id, which both sides set to Shopify's numeric order ID.
 *
 * The tag loads only once the shopper allows marketing, so Google consent mode
 * starts granted and is updated on any later change. Shopify's pixel sandbox
 * cannot keep Google's own click cookie, so every hit carries the stored Google
 * click in page_location, as the landing URL did.
 */
export interface GoogleTagConfig {
  id: string;
  purchaseLabel: string;
  addToCartLabel: string | null;
  beginCheckoutLabel: string | null;
  pageViewLabel: string | null;
}

/** "AW-" plus the numeric Google Ads tag ID; accepts lower case and spaces. */
export function normalizeGoogleTagId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim().toUpperCase();
  return /^AW-\d{6,15}$/.test(id) ? id : null;
}

/** A conversion label, the part after the slash in send_to. */
export function normalizeGoogleTagLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const label = value.trim();
  return /^[A-Za-z0-9_-]{6,64}$/.test(label) ? label : null;
}

export function googleTagForWorkspace(workspace: {
  id?: string | null;
  productMode?: string | null;
  installType?: string | null;
  googleBrowserTrackingEnabled?: boolean | null;
  googleTagId?: string | null;
  googleTagPurchaseLabel?: string | null;
  googleTagAddToCartLabel?: string | null;
  googleTagBeginCheckoutLabel?: string | null;
  googleTagPageViewLabel?: string | null;
}): GoogleTagConfig | null {
  if (!workspace.googleBrowserTrackingEnabled || !isDestinationAllowedForWorkspace(workspace, "GOOGLE_ADS")) {
    return null;
  }
  const id = normalizeGoogleTagId(workspace.googleTagId);
  const purchaseLabel = normalizeGoogleTagLabel(workspace.googleTagPurchaseLabel);
  if (!id || !purchaseLabel) return null;
  return {
    id,
    purchaseLabel,
    addToCartLabel: normalizeGoogleTagLabel(workspace.googleTagAddToCartLabel),
    beginCheckoutLabel: normalizeGoogleTagLabel(workspace.googleTagBeginCheckoutLabel),
    pageViewLabel: normalizeGoogleTagLabel(workspace.googleTagPageViewLabel),
  };
}

/**
 * Browser code shared by the Custom Pixel and the legacy script. It relies on
 * the host script's cn(), mk(), M and cid. Host scripts use only GT, GI, gi()
 * (load the tag once marketing is allowed), gk() (consent state for an update)
 * and gh(kind, event, customData, userData, order) with kind "v" page view,
 * "a" add to cart, "c" begin checkout or "p" purchase. The code holds no
 * backslash: production minification once dropped escape sequences from a
 * served template (25 Oct 2026).
 */
export function googleTagScript(
  config: GoogleTagConfig | null,
  host: { pageUrl: string; referrer: string }
): string {
  if (!config) return "var GT=null,GI=false;function gi(){}function gk(){return{}}function gh(){}";
  const labels = JSON.stringify({
    p: config.purchaseLabel,
    a: config.addToCartLabel ?? "",
    c: config.beginCheckoutLabel ?? "",
    v: config.pageViewLabel ?? "",
  });
  return `var GT=${JSON.stringify(config.id)},GL=${labels},GI=false,GP=false,GU=null;
function ge(e){try{return(e&&e.context&&e.context.document&&e.context.document.location&&e.context.document.location.href)||${host.pageUrl}}catch(x){return ${host.pageUrl}}}
function gk(){var c=cn(),m=mk(),a=c.analyticsAllowed,g=m?"granted":"denied";return{ad_storage:g,ad_user_data:g,ad_personalization:m&&c.saleOfDataAllowed!==false?"granted":"denied",analytics_storage:(M==="STRICT"?a===true:a!==false)?"granted":"denied"}}
function gu(u){try{var x=new URL(u);if(!x.searchParams.get("gclid")&&!x.searchParams.get("gbraid")&&!x.searchParams.get("wbraid")){if(cid.gl)x.searchParams.set("gclid",cid.gl);else if(cid.gb)x.searchParams.set("gbraid",cid.gb);else if(cid.wb)x.searchParams.set("wbraid",cid.wb)}return x.toString()}catch(e){return u}}
function gi(){if(GI||!mk())return;GI=true;var w=window;w.dataLayer=w.dataLayer||[];if(typeof w.gtag!=="function")w.gtag=function(){w.dataLayer.push(arguments)};var R=w.__tcGoogleTagsInitialized||(w.__tcGoogleTagsInitialized={});if(!R[GT]){R[GT]=true;w.gtag("consent","default",gk());w.gtag("js",new Date());try{var t=document.createElement("script"),s=document.getElementsByTagName("script")[0];t.async=true;t.src="https://www.googletagmanager.com/gtag/js?id="+GT;s&&s.parentNode?s.parentNode.insertBefore(t,s):document.head.appendChild(t)}catch(e){}}if(GP)gs(GU||${host.pageUrl},"page_view",GL.v,null,null)}
function gs(u,ev,label,p,ud){if(ev==="page_view")GU=u;if(!GI||!mk()){if(ev==="page_view")GP=true;return}if(ev==="page_view")GP=false;var w=window;w.gtag("config",GT,{page_location:gu(u),page_referrer:${host.referrer},send_page_view:false,allow_enhanced_conversions:true});if(ud)w.gtag("set","user_data",ud);if(ev)w.gtag("event",ev,{send_to:GT});if(label){var q={send_to:GT+"/"+label};if(p)for(var k in p)if(p[k]!==undefined&&p[k]!==null)q[k]=p[k];w.gtag("event","conversion",q)}}
function gd(u){if(!u)return null;var d={},a={},e=u.email?String(u.email).trim().toLowerCase():"",ph=u.phone?String(u.phone).replace(/[ ()-]/g,""):"";if(e.indexOf("@")>0)d.email=e;if(/^[+][0-9]{7,15}$/.test(ph))d.phone_number=ph;if(u.firstName)a.first_name=String(u.firstName).trim();if(u.lastName)a.last_name=String(u.lastName).trim();if(u.city)a.city=String(u.city).trim();if(u.state)a.region=String(u.state).trim();if(u.zip)a.postal_code=String(u.zip).trim();if(u.countryCode)a.country=String(u.countryCode).trim().toUpperCase();if(a.first_name&&a.last_name&&a.postal_code&&a.country)d.address=a;return d.email||d.phone_number||d.address?d:null}
function gx(o){var v=o&&o.id!=null?String(o.id).split("/").pop():"";return /^[0-9]+$/.test(v)?v:undefined}
function gh(k,e,cd,ud,o){var u=ge(e);if(k==="v"){gs(u,"page_view",GL.v,null,null);return}if(!GL[k])return;var p={value:cd&&cd.value,currency:cd&&cd.currency};if(k==="p")p.transaction_id=gx(o);gs(u,null,GL[k],p,ud?gd(ud):null)}`;
}
