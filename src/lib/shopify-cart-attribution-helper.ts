export const TRACKCLEAR_CART_ATTRIBUTE_KEYS = [
  "_trackclear_session_id",
  "_fbp",
  "_fbc",
  "_fbclid",
  "_gclid",
  "_gbraid",
  "_wbraid",
  "_ttclid",
  "_ttp",
  "_rdt_cid",
  "_epik",
  "_utm_source",
  "_utm_medium",
  "_utm_campaign",
  "_utm_content",
  "_utm_term",
  "_landing_page",
  "_tc_attribution_timestamp",
  "_tc_attribution_source",
  "_tc_consent_analytics",
  "_tc_consent_marketing",
  "_tc_consent_timestamp",
  "_tc_consent_source",
] as const;

export const TRACKCLEAR_CART_DIAGNOSTIC_KEYS = [
  "_tc_cart_attr_last_ok",
  "_tc_cart_attr_last_checked_at",
  "_tc_cart_attr_missing",
] as const;

export const TRACKCLEAR_FORBIDDEN_CART_ATTRIBUTE_KEYS = [
  "email",
  "phone",
  "firstName",
  "lastName",
  "customerId",
  "address",
] as const;

export type TrackclearCartAttributeKey = (typeof TRACKCLEAR_CART_ATTRIBUTE_KEYS)[number];
export type TrackclearCartAttributes = Partial<Record<TrackclearCartAttributeKey, string>>;

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

type CookieLike = {
  get(name: string): string | null;
  set(name: string, value: string): void;
};

type ConsentLike = {
  analyticsAllowed?: boolean | null;
  marketingAllowed?: boolean | null;
};

type EnsureSessionIdOptions = {
  storage?: StorageLike | null;
  cookies?: CookieLike | null;
  generateId?: () => string;
};

type ExtractAttributionOptions = EnsureSessionIdOptions & {
  url: string;
  now?: number;
  consent?: ConsentLike | null;
  consentMode?: "STRICT" | "LAX";
  generateFbpRandom?: () => string;
};

const CONTEXT_KEY = "_tc_cart_attr_context";
const SESSION_KEY = "_trackclear_session_id";
const FBP_REGEX = /^fb\.1\.\d{13}\.\d{7,20}$/;
const FBC_REGEX = /^fb\.1\.(\d{13})\..+$/;
const META_COOKIE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const ATTRIBUTION_CONTEXT_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

function safeGet(storage: StorageLike | null | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSet(storage: StorageLike | null | undefined, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Ignore browser storage failures. The helper must never block checkout.
  }
}

function safeCookieGet(cookies: CookieLike | null | undefined, key: string): string | null {
  try {
    return cookies?.get(key) ?? null;
  } catch {
    return null;
  }
}

function safeCookieSet(cookies: CookieLike | null | undefined, key: string, value: string): void {
  try {
    cookies?.set(key, value);
  } catch {
    // Ignore cookie failures. localStorage/session enrichment can still help.
  }
}

function defaultId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}.${Math.random().toString(36).slice(2)}`;
}

function defaultFbpRandom(): string {
  return String(Math.floor(1000000000 + Math.random() * 9000000000));
}

function validFbp(value: string | null | undefined): string | null {
  return value && FBP_REGEX.test(value) ? value : null;
}

function validFbc(value: string | null | undefined, now: number): string | null {
  if (!value) return null;
  const match = value.match(FBC_REGEX);
  if (!match) return null;
  if (now - Number.parseInt(match[1], 10) > META_COOKIE_MAX_AGE_MS) return null;
  return value;
}

function clickIdFromFbc(value: string | null | undefined): string | null {
  if (!value) return null;
  const index = value.lastIndexOf(".");
  return index > 0 ? value.slice(index + 1) : null;
}

function readContext(storage: StorageLike | null | undefined, now: number): Record<string, string> {
  const raw = safeGet(storage, CONTEXT_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const context = parsed as Record<string, string>;
    const capturedAt = Number.parseInt(context.capturedAt ?? "", 10);
    if (Number.isFinite(capturedAt) && now - capturedAt > ATTRIBUTION_CONTEXT_MAX_AGE_MS) return {};
    // One-time compatibility migration for context written before touches were timestamped.
    if (!Number.isFinite(capturedAt)) context.capturedAt = String(now);
    return context;
  } catch {
    return {};
  }
}

function writeContext(storage: StorageLike | null | undefined, context: Record<string, string>): void {
  safeSet(storage, CONTEXT_KEY, JSON.stringify(context));
}

function getParam(url: URL, key: string): string | null {
  const value = url.searchParams.get(key);
  return value && value.trim() ? value.trim() : null;
}

function setIfValue(
  attributes: TrackclearCartAttributes,
  key: TrackclearCartAttributeKey,
  value: unknown
): void {
  if (value === null || value === undefined || String(value) === "") return;
  attributes[key] = String(value);
}

export function ensureTrackClearSessionId({
  storage,
  cookies,
  generateId = defaultId,
}: EnsureSessionIdOptions = {}): { sessionId: string; generated: boolean } {
  const existing = safeCookieGet(cookies, SESSION_KEY) || safeGet(storage, SESSION_KEY);
  if (existing) {
    safeCookieSet(cookies, SESSION_KEY, existing);
    safeSet(storage, SESSION_KEY, existing);
    return { sessionId: existing, generated: false };
  }

  const sessionId = generateId();
  safeCookieSet(cookies, SESSION_KEY, sessionId);
  safeSet(storage, SESSION_KEY, sessionId);
  return { sessionId, generated: true };
}

export function extractShopifyCartAttribution({
  url,
  now = Date.now(),
  storage,
  cookies,
  consent,
  consentMode = "LAX",
  generateId,
  generateFbpRandom = defaultFbpRandom,
}: ExtractAttributionOptions): {
  attributes: TrackclearCartAttributes;
  sessionId: string;
  sessionGenerated: boolean;
} {
  const parsedUrl = new URL(url, "https://shop.example");
  let context = readContext(storage, now);
  const { sessionId, generated } = ensureTrackClearSessionId({ storage, cookies, generateId });
  const marketingAllowed = consentMode === "STRICT"
    ? consent?.marketingAllowed === true
    : consent?.marketingAllowed !== false;

  const captures: Array<[string, string, TrackclearCartAttributeKey]> = [
    ["fbclid", "fbclid", "_fbclid"],
    ["gclid", "gclid", "_gclid"],
    ["gbraid", "gbraid", "_gbraid"],
    ["wbraid", "wbraid", "_wbraid"],
    ["ttclid", "ttclid", "_ttclid"],
    ["rdt_cid", "rdtCid", "_rdt_cid"],
    ["epik", "epik", "_epik"],
    ["utm_source", "utmSource", "_utm_source"],
    ["utm_medium", "utmMedium", "_utm_medium"],
    ["utm_campaign", "utmCampaign", "_utm_campaign"],
    ["utm_content", "utmContent", "_utm_content"],
    ["utm_term", "utmTerm", "_utm_term"],
  ];

  const currentValues = captures.reduce<Record<string, string>>((values, [paramName, contextKey, attributeKey]) => {
    if (!marketingAllowed && !attributeKey.startsWith("_utm_")) return values;
    const value = getParam(parsedUrl, paramName);
    if (value) values[contextKey] = value;
    return values;
  }, {});
  const hasFreshTouch = Object.keys(currentValues).length > 0;
  if (hasFreshTouch) {
    context = {
      ...currentValues,
      capturedAt: String(now),
      source:
        currentValues.fbclid ? "meta" :
        currentValues.ttclid ? "tiktok" :
        currentValues.gclid || currentValues.gbraid || currentValues.wbraid ? "google" :
        currentValues.rdtCid ? "reddit" :
        currentValues.epik ? "pinterest" :
        currentValues.utmSource?.toLowerCase().slice(0, 100) || "utm",
    };
  }

  if (!context.landingPage || hasFreshTouch) {
    context.landingPage = parsedUrl.toString();
  }

  if (!marketingAllowed) {
    for (const key of ["fbclid", "gclid", "gbraid", "wbraid", "ttclid", "rdtCid", "epik"]) {
      delete context[key];
    }
    safeCookieSet(cookies, "_fbp", "");
    safeCookieSet(cookies, "_fbc", "");
    safeCookieSet(cookies, "_ttp", "");
    safeCookieSet(cookies, "_epik", "");
    safeSet(storage, "_fbp", "");
    safeSet(storage, "_fbc", "");
    const hasUtmContext = !!(
      context.utmSource || context.utmMedium || context.utmCampaign ||
      context.utmContent || context.utmTerm
    );
    if (hasUtmContext) {
      context.source = context.utmSource?.toLowerCase().slice(0, 100) || "utm";
    } else {
      delete context.source;
      delete context.capturedAt;
    }
  }

  let fbp = marketingAllowed
    ? validFbp(safeCookieGet(cookies, "_fbp") || safeGet(storage, "_fbp"))
    : null;
  if (marketingAllowed && !fbp) {
    fbp = `fb.1.${now}.${generateFbpRandom()}`;
    safeCookieSet(cookies, "_fbp", fbp);
    safeSet(storage, "_fbp", fbp);
  }

  let fbc = marketingAllowed
    ? validFbc(safeCookieGet(cookies, "_fbc") || safeGet(storage, "_fbc"), now)
    : null;
  if (marketingAllowed && context.fbclid && (!fbc || clickIdFromFbc(fbc) !== context.fbclid)) {
    fbc = `fb.1.${now}.${context.fbclid}`;
    safeCookieSet(cookies, "_fbc", fbc);
    safeSet(storage, "_fbc", fbc);
  }

  writeContext(storage, context);

  const attributes: TrackclearCartAttributes = {};
  setIfValue(attributes, "_trackclear_session_id", sessionId);
  if (marketingAllowed) {
    setIfValue(attributes, "_fbp", fbp);
    setIfValue(attributes, "_fbc", fbc);
    setIfValue(attributes, "_fbclid", context.fbclid);
    setIfValue(attributes, "_gclid", context.gclid);
    setIfValue(attributes, "_gbraid", context.gbraid);
    setIfValue(attributes, "_wbraid", context.wbraid);
    setIfValue(attributes, "_ttclid", context.ttclid);
    setIfValue(attributes, "_ttp", safeCookieGet(cookies, "_ttp"));
    setIfValue(attributes, "_rdt_cid", context.rdtCid);
    setIfValue(attributes, "_epik", context.epik);
  } else {
    for (const key of ["_fbp", "_fbc", "_fbclid", "_gclid", "_gbraid", "_wbraid", "_ttclid", "_ttp", "_rdt_cid", "_epik"] as const) {
      attributes[key] = "";
    }
  }
  if (hasFreshTouch) {
    const touchKeys = [
      ["_fbclid", context.fbclid], ["_gclid", context.gclid], ["_gbraid", context.gbraid],
      ["_wbraid", context.wbraid], ["_ttclid", context.ttclid], ["_rdt_cid", context.rdtCid],
      ["_epik", context.epik], ["_utm_source", context.utmSource], ["_utm_medium", context.utmMedium],
      ["_utm_campaign", context.utmCampaign], ["_utm_content", context.utmContent], ["_utm_term", context.utmTerm],
    ] as const;
    for (const [key, value] of touchKeys) {
      if (marketingAllowed || key.startsWith("_utm_")) attributes[key] = value ?? "";
    }
  }
  setIfValue(attributes, "_utm_source", context.utmSource);
  setIfValue(attributes, "_utm_medium", context.utmMedium);
  setIfValue(attributes, "_utm_campaign", context.utmCampaign);
  setIfValue(attributes, "_utm_content", context.utmContent);
  setIfValue(attributes, "_utm_term", context.utmTerm);
  setIfValue(attributes, "_landing_page", context.landingPage);
  setIfValue(attributes, "_tc_attribution_timestamp", context.capturedAt);
  setIfValue(attributes, "_tc_attribution_source", context.source);

  if (consent?.analyticsAllowed !== undefined && consent.analyticsAllowed !== null) {
    setIfValue(attributes, "_tc_consent_analytics", consent.analyticsAllowed);
  }
  if (consent?.marketingAllowed !== undefined && consent.marketingAllowed !== null) {
    setIfValue(attributes, "_tc_consent_marketing", consent.marketingAllowed);
  }
  if (
    (consent?.analyticsAllowed !== undefined && consent.analyticsAllowed !== null) ||
    (consent?.marketingAllowed !== undefined && consent.marketingAllowed !== null)
  ) {
    setIfValue(attributes, "_tc_consent_timestamp", now);
    setIfValue(attributes, "_tc_consent_source", "shopify_customer_privacy");
  }

  return { attributes, sessionId, sessionGenerated: generated };
}

export function buildCartUpdateBody(attributes: TrackclearCartAttributes): string {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined) {
      body.append(`attributes[${key}]`, value);
    }
  }
  return body.toString();
}

export function verifyCartAttributes(
  expected: TrackclearCartAttributes,
  cartAttributes: Record<string, unknown> | Array<{ key: string; value: unknown }> | null | undefined
): string[] {
  const actual: Record<string, unknown> = Array.isArray(cartAttributes)
    ? cartAttributes.reduce<Record<string, unknown>>((acc, item) => {
        acc[item.key] = item.value;
        return acc;
      }, {})
    : cartAttributes ?? {};

  return Object.entries(expected)
    .filter(([, value]) => value !== undefined)
    .filter(([key, value]) => String(actual[key] ?? "") !== String(value))
    .map(([key]) => key);
}

type CartAttributeFetch = (
  input: string,
  init?: {
    method?: string;
    credentials?: string;
    headers?: Record<string, string>;
    body?: string;
    keepalive?: boolean;
    cache?: string;
  }
) => Promise<{ json?: () => Promise<unknown> }>;

export async function writeAndVerifyCartAttributes(
  attributes: TrackclearCartAttributes,
  options: { fetcher: CartAttributeFetch; retryOnce?: boolean }
): Promise<{ ok: boolean; missing: string[]; attempts: number; verified: boolean }> {
  const { fetcher, retryOnce = true } = options;
  let attempts = 0;

  async function postUpdate() {
    attempts += 1;
    await fetcher("/cart/update.js", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: buildCartUpdateBody(attributes),
      keepalive: true,
    });
  }

  async function verify(): Promise<string[]> {
    const response = await fetcher("/cart.js", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const cart = response.json ? await response.json() : {};
    const cartAttributes =
      cart && typeof cart === "object" && "attributes" in cart
        ? (cart as { attributes?: Record<string, unknown> }).attributes
        : {};
    return verifyCartAttributes(attributes, cartAttributes);
  }

  try {
    await postUpdate();
    let missing = await verify();
    if (missing.length && retryOnce) {
      await postUpdate();
      missing = await verify();
    }
    return { ok: missing.length === 0, missing, attempts, verified: true };
  } catch {
    return { ok: false, missing: ["request_failed"], attempts, verified: false };
  }
}

export function generateShopifyCartAttributionHelperCode(
  workspaceId: string,
  consentMode: "STRICT" | "LAX" = "LAX"
): string {
  const safeWorkspaceId = workspaceId.replace(/[\\'"<>&`\n\r\0]/g, "");
  return `(function(){
var W="${safeWorkspaceId}",M="${consentMode}",CK=${JSON.stringify(TRACKCLEAR_CART_ATTRIBUTE_KEYS)};
var CTX="_tc_cart_attr_context",SID="_trackclear_session_id",WR=false,Q=false,T=null;
function g(n){try{var m=document.cookie.match(new RegExp("(^| )"+n+"=([^;]+)"));return m?decodeURIComponent(m[2]):null}catch(e){return null}}
function s(n,v){try{document.cookie=n+"="+encodeURIComponent(v)+";max-age=7776000;path=/;SameSite=Lax"}catch(e){}}
function x(n){try{document.cookie=n+"=;max-age=0;path=/;SameSite=Lax";localStorage.removeItem(n)}catch(e){}}
function lg(){try{var u=new URL(location.href);return u.searchParams.get("trackclear_debug")==="1"||localStorage.getItem("trackclear_debug")==="1"||localStorage.getItem("_tc_debug")==="1"}catch(e){return false}}
var D=lg();function log(){if(!D)return;try{console.info.apply(console,["[TrackClear cart helper]"].concat([].slice.call(arguments)))}catch(e){}}
function ls(k){try{return localStorage.getItem(k)}catch(e){return null}}
function ss(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function gp(n){try{var v=new URL(location.href).searchParams.get(n);return v&&v.trim()?v.trim():null}catch(e){return null}}
function vp(v){return v&&/^fb\\.1\\.\\d{13}\\.\\d{7,20}$/.test(v)?v:null}
function vf(v){if(!v)return null;var m=v.match(/^fb\\.1\\.(\\d{13})\\..+$/);if(!m)return null;if(Date.now()-parseInt(m[1],10)>7776000000)return null;return v}
function xf(v){if(!v)return null;var p=v.lastIndexOf(".");return p>0?v.substring(p+1):null}
function js(v){try{return v?JSON.parse(v):{}}catch(e){return {}}}
function id(){var x=g(SID)||ls(SID),gen=false;if(!x){gen=true;x=(crypto.randomUUID?crypto.randomUUID():String(Date.now())+"."+Math.random().toString(36).slice(2))}s(SID,x);ss(SID,x);log(gen?"session id generated":"session id present/reused",x);return x}
function cp(){var c={};try{var p=window.Shopify&&Shopify.customerPrivacy;if(p){var a=typeof p.analyticsProcessingAllowed==="function"?p.analyticsProcessingAllowed():p.analyticsProcessingAllowed;var m=typeof p.marketingAllowed==="function"?p.marketingAllowed():p.marketingAllowed;if(a!==undefined)c.analyticsAllowed=a;if(m!==undefined)c.marketingAllowed=m}}catch(e){}return c}
function av(o,k,v){if(v!==null&&v!==undefined&&String(v)!=="")o[k]=String(v)}
function attrs(){
var n=Date.now(),cn=cp(),mk=M==="STRICT"?cn.marketingAllowed===true:cn.marketingAllowed!==false,c=js(ls(CTX)),ca=parseInt(c.ca||"",10);if(isFinite(ca)&&n-ca>7776000000)c={};else if(!isFinite(ca))c.ca=n;
var has=false,ps=[["fbclid","fb","_fbclid"],["gclid","gl","_gclid"],["gbraid","gb","_gbraid"],["wbraid","wb","_wbraid"],["ttclid","tt","_ttclid"],["rdt_cid","rd","_rdt_cid"],["epik","ep","_epik"],["utm_source","us","_utm_source"],["utm_medium","um","_utm_medium"],["utm_campaign","uc","_utm_campaign"],["utm_content","un","_utm_content"],["utm_term","ut","_utm_term"]],nv={};
for(var i=0;i<ps.length;i++){if(!mk&&ps[i][2].indexOf("_utm_")!==0)continue;var v=gp(ps[i][0]);if(v){nv[ps[i][1]]=v;has=true}}
if(has){c=nv;c.ca=n;c.so=c.fb?"meta":c.tt?"tiktok":(c.gl||c.gb||c.wb)?"google":c.rd?"reddit":c.ep?"pinterest":(c.us||"utm").toLowerCase().slice(0,100)}
if(!mk){delete c.fb;delete c.gl;delete c.gb;delete c.wb;delete c.tt;delete c.rd;delete c.ep;x("_fbp");x("_fbc");x("_ttp");x("_epik");if(c.us||c.um||c.uc||c.un||c.ut)c.so=(c.us||"utm").toLowerCase().slice(0,100);else{delete c.ca;delete c.so}}
if(!c.lp||has)c.lp=location.href;ss(CTX,JSON.stringify(c));
var fbp=mk?vp(g("_fbp")||ls("_fbp")):null;if(mk&&!fbp){fbp="fb.1."+n+"."+Math.floor(1000000000+Math.random()*9000000000);s("_fbp",fbp);ss("_fbp",fbp)}
var fbc=mk?vf(g("_fbc")||ls("_fbc")):null;if(mk&&c.fb&&(!fbc||xf(fbc)!==c.fb)){fbc="fb.1."+n+"."+c.fb;s("_fbc",fbc);ss("_fbc",fbc)}
var o={};av(o,"_trackclear_session_id",id());if(mk){av(o,"_fbp",fbp);av(o,"_fbc",fbc);av(o,"_fbclid",c.fb);av(o,"_gclid",c.gl);av(o,"_gbraid",c.gb);av(o,"_wbraid",c.wb);av(o,"_ttclid",c.tt);av(o,"_ttp",g("_ttp"));av(o,"_rdt_cid",c.rd);av(o,"_epik",c.ep)}else{var ak=["_fbp","_fbc","_fbclid","_gclid","_gbraid","_wbraid","_ttclid","_ttp","_rdt_cid","_epik"];for(i=0;i<ak.length;i++)o[ak[i]]=""}
if(has){for(i=0;i<ps.length;i++){if(mk||ps[i][2].indexOf("_utm_")===0)o[ps[i][2]]=c[ps[i][1]]||""}}
av(o,"_utm_source",c.us);av(o,"_utm_medium",c.um);av(o,"_utm_campaign",c.uc);av(o,"_utm_content",c.un);av(o,"_utm_term",c.ut);av(o,"_landing_page",c.lp);av(o,"_tc_attribution_timestamp",c.ca);av(o,"_tc_attribution_source",c.so);
if(cn.analyticsAllowed!==undefined)av(o,"_tc_consent_analytics",cn.analyticsAllowed);if(cn.marketingAllowed!==undefined)av(o,"_tc_consent_marketing",cn.marketingAllowed);if(cn.analyticsAllowed!==undefined||cn.marketingAllowed!==undefined){av(o,"_tc_consent_timestamp",Date.now());av(o,"_tc_consent_source","shopify_customer_privacy")}
log("attribution fields found",Object.keys(o));return o}
function body(o){var b=new URLSearchParams();for(var k in o)b.append("attributes["+k+"]",o[k]);return b.toString()}
function miss(exp,got){var m=[];got=got||{};for(var k in exp){if(exp[k]!==undefined&&String(got[k]||"")!==String(exp[k]))m.push(k)}return m}
function diag(ok,m){ss("_tc_cart_attr_last_ok",String(!!ok));ss("_tc_cart_attr_last_checked_at",String(Date.now()));ss("_tc_cart_attr_missing",(m||[]).join(","))}
async function post(o){log("cart update attempted");return fetch("/cart/update.js",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},body:body(o),keepalive:true})}
async function ver(o){log("cart.js verification fired");var r=await fetch("/cart.js",{credentials:"same-origin",headers:{"Accept":"application/json"},cache:"no-store"});var j=await r.json();var m=miss(o,j&&j.attributes);diag(!m.length,m);if(m.length)log("missing attributes",m);else log("cart update verified");return m}
async function wr(reason,retry){if(WR){Q=true;return}WR=true;try{var o=attrs();await post(o);var m=await ver(o);if(m.length&&retry){log("retrying cart update",reason);await post(o);m=await ver(o)}if(m.length)diag(false,m)}catch(e){diag(false,["request_failed"]);log("cart update failed",e&&e.message?e.message:e)}finally{WR=false;if(Q){Q=false;sch("queued")}}}
function sch(r){clearTimeout(T);T=setTimeout(function(){wr(r,true)},120)}
function cartUrl(u){try{var x=String(u&&u.url?u.url:u);return /\\/cart\\/(add|change|update|clear)(\\.js)?/.test(x)}catch(e){return false}}
function checkoutEl(el){try{return !!(el&&(el.closest('a[href*="/checkout"],button[name="checkout"],input[name="checkout"],form[action*="/checkout"]')))}catch(e){return false}}
function cartEl(el){try{return !!(el&&(el.closest('form[action*="/cart/add"],button[name="add"],input[name="add"],[data-add-to-cart],[data-cart-add]')))}catch(e){return false}}
function bind(){log("TrackClear cart helper loaded",W);sch("page_load");window.addEventListener("pageshow",function(){sch("pageshow")});window.addEventListener("pagehide",function(){wr("pagehide",false)});document.addEventListener("visitorConsentCollected",function(){sch("consent_change")});document.addEventListener("submit",function(e){var f=e.target;if(cartEl(f))sch("cart_submit");if(checkoutEl(f))wr("before_checkout_submit",false)},true);document.addEventListener("click",function(e){var el=e.target;if(cartEl(el))sch("cart_click");if(checkoutEl(el))wr("before_checkout_click",false)},true);if(window.fetch){var of=window.fetch;window.fetch=function(){var u=arguments[0],p=of.apply(this,arguments);if(!WR&&cartUrl(u)){Promise.resolve(p).then(function(){sch("fetch_cart_change")},function(){})}return p}};if(window.XMLHttpRequest){var O=XMLHttpRequest.prototype.open,S=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.open=function(m,u){this.__tcCartUrl=cartUrl(u);return O.apply(this,arguments)};XMLHttpRequest.prototype.send=function(){if(this.__tcCartUrl&&!WR)this.addEventListener("loadend",function(){sch("xhr_cart_change")});return S.apply(this,arguments)}}}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind,{once:true});else bind();
})();`;
}
