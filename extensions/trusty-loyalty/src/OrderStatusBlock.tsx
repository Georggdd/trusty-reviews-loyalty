import * as React from "react";
import {
  reactExtension,
  Text,
  BlockStack,
  InlineStack,
  useApi,
  TextField,
  Button,
  Divider,
  View,
  useTranslate,
} from "@shopify/ui-extensions-react/customer-account";
import {
  useAuthenticatedAccountCustomer as useAuthenticatedCustomer,
} from "@shopify/ui-extensions-react/customer-account";

/**
 * Target: listado de pedidos en la cuenta de cliente
 * (coincide con shopify.extension.toml → customer-account.order-index.block.render)
 */
export default reactExtension(
  "customer-account.order-index.block.render",
  () => <LoyaltyWidget />
);

// Normaliza id "8465..." o "gid://shopify/Customer/8465..."
function normalizeCustomerId(id?: string | null): { gid: string | null; numeric: string | null } {
  if (!id) return { gid: null, numeric: null };
  if (/^\d+$/.test(id)) return { gid: `gid://shopify/Customer/${id}`, numeric: id };
  const m = id.match(/Customer\/(\d+)/);
  return { gid: id, numeric: m ? m[1] : null };
}

// Detector robusto de modo "Customize/Preview"
function isCustomizerPreview(): boolean {
  if (typeof window === "undefined") return false;
  const q = (window.location?.search || "").toLowerCase();
  const bodyText =
    typeof document !== "undefined" && document.body
      ? document.body.innerText.toLowerCase()
      : "";
  return (
    q.includes("pb=") ||
    q.includes("_fd=") ||
    q.includes("preview_theme_id") ||
    q.includes("profile_preview_token") ||
    bodyText.includes("close preview") ||
    bodyText.includes("divain-test-dev-store configuration") ||
    bodyText.includes("you're viewing:")
  );
}

function extractEmailLoose(obj: any): string | null {
  if (!obj) return null;
  return obj?.email?.address ?? obj?.emailAddress?.emailAddress ?? obj?.email ?? null;
}

type CustomerIdQueryResult = {
  data?: { customer?: { id?: string | null; email?: string | null; firstName?: string | null; lastName?: string | null } | null };
};

// Mini-componente de diagnóstico (solo CONSOLA)
function DebugCustomer() {
  const customer = useAuthenticatedCustomer();
  const gidOrNumeric = (customer as any)?.id ?? null;
  const { gid, numeric } = normalizeCustomerId(gidOrNumeric);
  const email = extractEmailLoose(customer);
  // eslint-disable-next-line no-console
  console.log("DEBUG useAuthenticatedCustomer → gid:", gid, "numeric:", numeric, "email:", email, "raw:", customer);
  return null;
}

// Helpers de formato
const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);

// Devuelve DD/MM/AAAA con ceros delante
function formatDateDDMMYYYY(iso?: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (!Number.isNaN(+d)) {
      return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
    }
  } catch {}
  // Fallback si viene "YYYY-MM-DD"
  const [y, m, d] = String(iso).split("T")[0].split("-");
  if (y && m && d) return `${pad2(Number(d))}/${pad2(Number(m))}/${y}`;
  return String(iso);
}

function LoyaltyWidget() {
  const api = useApi();
  const query = (api as any).query as (q: string) => Promise<CustomerIdQueryResult>;
  const translate = useTranslate();

  // 🟣 FLAG DEBUG UI
  const SHOW_DEBUG = false;

  const customer = useAuthenticatedCustomer();
  const customerIdRaw = (customer as any)?.id ?? null;
  const { gid: runtimeGid, numeric: runtimeNumeric } = normalizeCustomerId(customerIdRaw);
  const runtimeEmail = extractEmailLoose(customer);

  const [state, setState] = React.useState<{
    loading: boolean;
    balance: number | null;
    error: string | null;
    points: string;
    msg: string | null;
    generatedCode: string | null;
    amount: number | null;
    expiresAt: string | null;
    // DOB UI
    dob: string;
    dobSaving: boolean;
    dobMsg: string | null;
    existingDob: string | null;
    shopDomain: string | null;
    // Points expiration
    expiringSoon: Array<{ expiration_date: string; points: number }> | null;
    totalExpiringSoon: number | null;
    loadingExpiration: boolean;
    debug: {
      runtimeGid: string | null;
      runtimeNumeric: string | null;
      queryGid: string | null;
      usedGid: string | null;
      notes: string[];
      email?: string | null;
      name?: string | null;
      isPreview?: boolean;
      href?: string;
    };
  }>({
    loading: true,
    balance: null,
    error: null,
    points: "",
    msg: null,
    generatedCode: null,
    amount: null,
    expiresAt: null,
    // DOB UI
    dob: "",
    dobSaving: false,
    dobMsg: null,
    existingDob: null,
    shopDomain: null,
    // Points expiration
    expiringSoon: null,
    totalExpiringSoon: null,
    loadingExpiration: false,
    debug: {
      runtimeGid,
      runtimeNumeric,
      queryGid: null,
      usedGid: null,
      notes: [],
      isPreview: false,
      href: "",
    },
  });

  const SUPABASE_EDGE = "https://tizzlfjuosqfyefybdee.supabase.co/functions/v1";
  
  async function detectShopDomain(): Promise<string> {
    if (typeof window === "undefined") {
      console.warn('⚠️ Window not available, using fallback');
      return "sandboxdivain.myshopify.com";
    }

    const hostname = window.location.hostname;
    const href = window.location.href;
    console.log('🔍 Detecting shop domain from:', { hostname, href });
    
    // Mapeo de dominios personalizados a tiendas (PRIMERO porque es más confiable)
    const customDomainMap: Record<string, string> = {
      'account.divainparfums.co': 'divainusa.myshopify.com',
      'account.divainparfums.com': 'divainusa.myshopify.com', 
      'account.divainparfums.es': 'divaines.myshopify.com',
    };
    
    console.log('🔍 Custom domain check:', { hostname, hasDomain: !!customDomainMap[hostname] });
    
    // 1. Check custom domain mapping first
    if (customDomainMap[hostname]) {
      console.log('✅ Shop domain from custom domain map:', customDomainMap[hostname]);
      return customDomainMap[hostname];
    }
    
    // 2. Extraer de URL si es myshopify.com
    if (hostname.includes('.myshopify.com')) {
      const match = hostname.match(/([^.]+)\.(?:account\.)?myshopify\.com/);
      if (match) {
        const detected = `${match[1]}.myshopify.com`;
        console.log('✅ Shop domain from myshopify URL:', detected);
        return detected;
      }
    }
    
    // 3. Intentar desde parámetros de URL (region_country puede dar pistas)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const regionCountry = urlParams.get('region_country');
      if (regionCountry === 'US') {
        console.log('✅ Shop domain inferred from region_country=US');
        return 'divainusa.myshopify.com';
      }
      if (regionCountry === 'ES') {
        console.log('✅ Shop domain inferred from region_country=ES');
        return 'divaines.myshopify.com';
      }
    } catch (err) {
      console.warn('⚠️ Could not parse URL params:', err);
    }
    
    // 4. Último intento con GraphQL (puede no funcionar en Customer Account)
    try {
      const result = await query(`query { shop { myshopifyDomain } }`);
      const domain = (result as any)?.data?.shop?.myshopifyDomain;
      if (domain) {
        console.log('✅ Shop domain from GraphQL:', domain);
        return domain;
      }
    } catch (err) {
      console.warn('⚠️ GraphQL shop query failed (expected in Customer Account):', err);
    }
    
    // Último fallback
    console.warn('⚠️ Using fallback shop domain: sandboxdivain.myshopify.com');
    return "sandboxdivain.myshopify.com";
  }

  async function fetchBalance(usedGid: string | null, shopDomain: string) {
    try {
      const { numeric } = normalizeCustomerId(usedGid);
      if (!numeric) throw new Error(translate('errorNoSession'));
  
      // loyalty_balance_ui espera el ID numérico (o el GID). No usa token.
      const url = new URL(`${SUPABASE_EDGE}/loyalty_balance_ui`);
      url.searchParams.set("shopify_customer_id", numeric);
  
      const res = await fetch(url.toString(), { method: "GET" });
      const json = await res.json().catch(() => ({} as any));
  
      if (!res.ok || typeof json?.balance !== "number") {
        console.warn("loyalty_balance_ui error", res.status, json);
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
  
      setState((prev) => ({ ...prev, balance: json.balance, error: null }));
    } catch {
      setState((prev) => ({ ...prev, error: translate('errorLoadBalance') }));
    }
  }   

  async function fetchExistingDob(usedGid: string | null, shopDomain: string) {
    try {
      const { numeric } = normalizeCustomerId(usedGid);
      if (!numeric) return;
      
      const url = new URL(`${SUPABASE_EDGE}/get_customer_profile_ui`);
      url.searchParams.set("shop_domain", shopDomain);
      url.searchParams.set("shopify_customer_id", numeric);
      
      console.log('📡 Fetching DOB with:', { shopDomain, shopify_customer_id: numeric });
      
      const res = await fetch(url.toString(), { method: "GET" });
      if (!res.ok) {
        console.warn('fetchExistingDob failed:', res.status);
        return;
      }
      
      const j = await res.json();
      if (j?.date_of_birth) {
        const [y, m, d] = String(j.date_of_birth).split("-");
        const ddmmyyyy = (y && m && d) ? `${d}-${m}-${y}` : j.date_of_birth;
        setState((p) => ({ ...p, existingDob: ddmmyyyy, dob: ddmmyyyy }));
        console.log('✅ DOB loaded:', ddmmyyyy);
      }
    } catch (err) {
      console.warn('fetchExistingDob error:', err);
    }
  }

  async function fetchPointsExpiration(usedGid: string | null, shopDomain: string) {
    try {
      setState((prev) => ({ ...prev, loadingExpiration: true }));
      
      const { numeric } = normalizeCustomerId(usedGid);
      if (!numeric) return;
      
      const url = new URL(`${SUPABASE_EDGE}/get_points_expiration`);
      const body = JSON.stringify({
        customer_id: numeric,
        shop_domain: shopDomain
      });
      
      console.log('📡 Fetching points expiration with:', { customer_id: numeric, shop_domain: shopDomain });
      
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
      });
      
      if (!res.ok) {
        console.warn('fetchPointsExpiration failed:', res.status);
        setState((prev) => ({ ...prev, loadingExpiration: false }));
        return;
      }
      
      const json = await res.json();
      if (json?.ok) {
        setState((prev) => ({
          ...prev,
          expiringSoon: json.expiring_soon || [],
          totalExpiringSoon: json.total_expiring_soon || 0,
          loadingExpiration: false
        }));
        console.log('✅ Points expiration loaded:', json.expiring_soon);
      } else {
        setState((prev) => ({ ...prev, loadingExpiration: false }));
      }
    } catch (err) {
      console.warn('fetchPointsExpiration error:', err);
      setState((prev) => ({ ...prev, loadingExpiration: false }));
    }
  }

  React.useEffect(() => {
    let cancelled = false;

    async function hydrateAndLoad() {
      const notes: string[] = [];
      const preview = isCustomizerPreview();
      const href = typeof window !== "undefined" ? window.location.href : "";

      try {
        // Detectar shop domain primero
        const detectedShopDomain = await detectShopDomain();
        notes.push(`Shop domain detectado: ${detectedShopDomain}`);
        
        if (!cancelled) {
          setState((prev) => ({ ...prev, shopDomain: detectedShopDomain }));
        }

        if (preview) {
          setState({
            loading: false,
            balance: null,
            error: translate('previewMode'),
            points: "",
            msg: null,
            generatedCode: null,
            amount: null,
            expiresAt: null,
            dob: "",
            dobSaving: false,
            dobMsg: null,
            existingDob: null,
            shopDomain: detectedShopDomain,
            expiringSoon: null,
            totalExpiringSoon: null,
            loadingExpiration: false,
            debug: {
              runtimeGid: runtimeGid,
              runtimeNumeric: runtimeNumeric,
              queryGid: null,
              usedGid: null,
              notes: [
                "El editor no inyecta sesión real de cliente.",
                "Abre: https://shopify.com/70911820012/account y haz login.",
              ],
              isPreview: true,
              href,
              email: runtimeEmail,
            },
          });
          return;
        }

        // (1) Hook
        let usedGid: string | null = runtimeGid;
        let finalEmail: string | null = runtimeEmail;
        let queryGid: string | null = null;
        let queryEmail: string | null = null;
        let queryName: string | null = null;

        if (!usedGid) {
          notes.push("useAuthenticatedAccountCustomer no devolvió GID; probando GraphQL…");
          try {
            const result = await query(`query CustomerId { customer { id email firstName lastName } }`);
            queryGid = result?.data?.customer?.id ?? null;
            queryEmail = result?.data?.customer?.email ?? null;

            const firstName = result?.data?.customer?.firstName ?? "";
            const lastName = result?.data?.customer?.lastName ?? "";
            queryName = [firstName, lastName].filter(Boolean).join(" ") || null;

            if (!queryEmail) {
              notes.push("GraphQL respondió pero customer.email viene vacío");
            } else {
              notes.push(`GraphQL email: ${queryEmail}`);
            }
            usedGid = queryGid;
            if (!finalEmail) finalEmail = queryEmail;
          } catch (err: any) {
            notes.push(`query() error: ${String(err?.message || err)}`);
          }
        } else {
          notes.push("Identidad obtenida desde useAuthenticatedAccountCustomer.");
        }

        if (!usedGid) {
          if (!cancelled) {
            setState({
              loading: false,
              balance: null,
              error: translate('errorNoSession'),
              points: "",
              msg: null,
              generatedCode: null,
              amount: null,
              expiresAt: null,
              dob: "",
              dobSaving: false,
              dobMsg: null,
              existingDob: null,
              shopDomain: detectedShopDomain,
              expiringSoon: null,
              totalExpiringSoon: null,
              loadingExpiration: false,
              debug: {
                runtimeGid: runtimeGid,
                runtimeNumeric: runtimeNumeric,
                queryGid,
                usedGid: null,
                notes: [
                  ...notes,
                  translate('noSession'),
                ],
                email: finalEmail,
                name: queryName,
                isPreview: preview,
                href,
              },
            });
          }
          return;
        }

        await Promise.all([
          fetchBalance(usedGid, detectedShopDomain),
          fetchExistingDob(usedGid, detectedShopDomain),
          fetchPointsExpiration(usedGid, detectedShopDomain)
        ]);

        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: null,
            debug: {
              runtimeGid: runtimeGid,
              runtimeNumeric: runtimeNumeric,
              queryGid,
              usedGid,
              notes,
              email: finalEmail,
              name: queryName,
              isPreview: preview,
              href,
            },
          }));
        }
      } catch {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: translate('errorLoadBalance'),
          }));
        }
      }
    }

    hydrateAndLoad();
    return () => {
      cancelled = true;
    };
  }, [api, runtimeGid, runtimeNumeric, runtimeEmail]);

  // Helpers comunes
  const formEncode = (obj: Record<string, string | number>) => {
    const usp = new URLSearchParams();
    for (const k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) usp.append(k, String((obj as any)[k]));
    return usp.toString();
  };

  const pad = (n: number | string, len: number) => {
    const s = String(n);
    return (Array(len + 1).join("0") + s).slice(-len);
  };

  function normalizeDobInputToISO(input: string): { ok: true; iso: string } | { ok: false; error: string } {
    if (!input) return { ok: false, error: "vacío" };
    let s = input.trim();
    s = s.replace(/[\.\/]/g, "-").replace(/\s+/g, "");
    if (/^\d{8}$/.test(s)) s = `${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4)}`;
    const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (!m) return { ok: false, error: "formato" };
    const dd = Number(m[1]),
      mm = Number(m[2]),
      yyyy = Number(m[3]);
    if (!(mm >= 1 && mm <= 12)) return { ok: false, error: "mes" };
    if (!(dd >= 1 && dd <= 31)) return { ok: false, error: "día" };
    const daysInMonth = new Date(yyyy, mm, 0).getDate();
    if (dd > daysInMonth) return { ok: false, error: "día-mes" };
    const iso = `${pad(yyyy, 4)}-${pad(mm, 2)}-${pad(dd, 2)}`;
    const dt = new Date(iso),
      today = new Date();
    if (Number.isNaN(+dt) || dt > today) return { ok: false, error: "fecha" };
    return { ok: true, iso };
  }

  async function getTokenForCustomer(usedGidParam?: string | null): Promise<string> {
    const usedGid = usedGidParam ?? state.debug.usedGid;
    const { numeric } = normalizeCustomerId(usedGid);
    if (!usedGid || !numeric) throw new Error(translate('errorNoSession'));
    if (!state.shopDomain) throw new Error(translate('shopDomainNotDetected'));
    const tokUrl = new URL(`${SUPABASE_EDGE}/sign_loyalty_link`);
    tokUrl.searchParams.set("shop_domain", state.shopDomain);
    tokUrl.searchParams.set("shopify_customer_id", numeric);
    const tokRes = await fetch(tokUrl.toString(), { method: "GET" });
    const tok = await tokRes.json();
    if (!tokRes.ok || !tok?.ok || !tok?.token) {
      throw new Error(tok?.error || translate('errorInvalidToken'));
    }
    return tok.token as string;
  }  

  async function handleRedeem() {
    try {
      setState((prev) => ({ ...prev, msg: null, generatedCode: null, amount: null, expiresAt: null }));
  
      // Usa el GID que ya está resuelto en debug; si faltara, cae al runtime
      const usedGidLocal = state.debug.usedGid ?? runtimeGid;
      const { numeric } = normalizeCustomerId(usedGidLocal);
      const points = parseInt(state.points, 10);
  
      if (!usedGidLocal || !numeric) throw new Error(translate('errorNoSession'));
      if (!state.shopDomain) throw new Error(translate('shopDomainNotDetected'));
      if (!Number.isInteger(points) || points <= 0) {
        setState((prev) => ({ ...prev, msg: translate('errorInvalidPoints') }));
        return;
      }
  
      const token = await getTokenForCustomer(usedGidLocal);
  
      // 🚨 TEMPORARY: Always use debug=1 to see full Shopify response
      const redRes = await fetch(
        `${SUPABASE_EDGE}/redeem_discount_code?shop=${state.shopDomain}&debug=1`,
        { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formEncode({ token, points }) }
      );
      const rj = await redRes.json().catch(() => ({} as any));
  
      const ok = redRes.ok && ((rj?.ok === true) || (rj?.success === true));
      if (!ok) {
        const err = (rj?.error || "").toString();
        
        // 🚨 TEMPORARY: Log full error response to console
        console.error('❌ Redeem failed:', {
          status: redRes.status,
          error: rj?.error,
          message: rj?.message,
          debug: rj?.debug,
          fullResponse: rj
        });
        
        if (err === "no_redemption_option") { 
          setState((p) => ({ ...p, msg: rj.message || translate('errorRedemptionOption') })); 
          return; 
        }
        if (err === "Insufficient points" || err === "INSUFFICIENT_BALANCE") { 
          setState((p) => ({ 
            ...p, 
            msg: String(translate('errorInsufficientBalance', { 
              available: rj.available, 
              required: rj.required 
            }))
          })); 
          return; 
        }
        if (err === "invalid_token") { 
          setState((p) => ({ ...p, msg: translate('errorInvalidToken') })); 
          return; 
        }
        
        // Show full error message including debug info
        const debugInfo = rj?.debug ? JSON.stringify(rj.debug, null, 2) : '';
        throw new Error(`${err || `HTTP ${redRes.status}`} ${rj?.message || ''} ${debugInfo}`.trim());
      }
  
      const code = rj.discount_code ?? rj.code ?? null;
      const amount = (typeof rj.amount === "number" ? rj.amount : typeof rj.discount_amount === "number" ? rj.discount_amount : null);
      const expiresAt = rj.expires_at ?? rj.expiry ?? null;
  
      setState((prev) => ({ ...prev, msg: null, generatedCode: code, amount, expiresAt, points: "" }));
  
      if (state.shopDomain) {
        await Promise.all([
          fetchBalance(usedGidLocal, state.shopDomain),
          fetchPointsExpiration(usedGidLocal, state.shopDomain)
        ]);
      }
    } catch (e: any) {
      setState((prev) => ({ ...prev, msg: e?.message || translate('errorRedeemGeneral') }));
    }
  }  
  // ────────────────────────────────────────────────────────────────
  //          UI DE FECHA DE NACIMIENTO (Option B + Klaviyo)
  // ────────────────────────────────────────────────────────────────
  function isValidDobStr(yyyyMmDd: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) return false;
    const dt = new Date(yyyyMmDd);
    if (Number.isNaN(+dt)) return false;
    const today = new Date();
    if (dt > today) return false;
    return true;
  }

  async function handleSaveDob() {
    try {
      setState((p) => ({ ...p, dobSaving: true, dobMsg: null }));
      const parsed = normalizeDobInputToISO(state.dob);
      if (!parsed.ok) {
        setState((p) => ({
          ...p,
          dobSaving: false,
          dobMsg: translate('errorDateFormat'),
        }));
        return;
      }
      const dobISO = parsed.iso;

      if (!state.shopDomain) throw new Error(translate('shopDomainNotDetected'));
      const token = await getTokenForCustomer();
      const res = await fetch(`${SUPABASE_EDGE}/set_date_of_birth`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token, date_of_birth: dobISO, shop_domain: state.shopDomain }).toString(),
      });
      const j = await res.json().catch(() => ({} as any));
      if (!res.ok || j?.ok === false) throw new Error(j?.error || `Error HTTP ${res.status}`);

      const [y, m, d] = dobISO.split("-");
      const ddmmyyyy = `${d}-${m}-${y}`;
      setState((p) => ({
        ...p,
        dobSaving: false,
        dobMsg: null,
        existingDob: ddmmyyyy,
        dob: ddmmyyyy,
      }));
    } catch (e: any) {
      setState((p) => ({ ...p, dobSaving: false, dobMsg: e?.message || translate('errorSaveDate') }));
    }
  }

  // ────────────────────────────────────────────────────────────────
  //                 TESTS (solo en modo DEBUG)
  // ────────────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!SHOW_DEBUG) return;
    try {
      console.log("[TEST] normalizeCustomerId");
      console.assert(normalizeCustomerId("123").numeric === "123", "numeric extract");
      console.assert(normalizeCustomerId("gid://shopify/Customer/456").numeric === "456", "gid extract");
      console.assert(normalizeCustomerId(undefined).numeric === null, "null extract");

      console.log("[TEST] isValidDobStr");
      console.assert(isValidDobStr("1990-01-01") === true, "valid date");
      console.assert(isValidDobStr("2999-01-01") === false, "future date invalid");
      console.assert(isValidDobStr("1990-13-40") === false, "bad date invalid");
    } catch (e) {
      console.warn("DEV TESTS failed:", e);
    }
  }, []);

  if (state.loading) return <Text>{translate('loading')}</Text>;

  return (
    <BlockStack spacing="loose">
      {SHOW_DEBUG && <DebugCustomer />}

      {state.error ? (
        <>
          <Text>{state.error}</Text>
          {SHOW_DEBUG && (
            <>
              <Text>
                DEBUG → runtimeGid: {String(state.debug.runtimeGid)} | runtimeNumeric:{" "}
                {String(state.debug.runtimeNumeric)} | queryGid: {String(state.debug.queryGid)} | usedGid:{" "}
                {String(state.debug.usedGid)}
              </Text>
              <Text>INFO → email: {String(state.debug.email)} | name: {String(state.debug.name)}</Text>
              <Text>NOTES → {state.debug.notes.join(" | ")}</Text>
              <Text>PAGE → preview: {String(state.debug.isPreview)} | {state.debug.href}</Text>
            </>
          )}
        </>
      ) : (
        <>
          {/* ═══════════════════════════════════════════ */}
          {/*           SECCIÓN DE PUNTOS PREMIUM         */}
          {/* ═══════════════════════════════════════════ */}
          <View 
            border="base" 
            cornerRadius="large" 
            padding="base"
          >
            <BlockStack spacing="base">
              {/* Header con saldo destacado */}
              <InlineStack spacing="tight" blockAlignment="center">
                <Text size="extraLarge" emphasis="bold">💎</Text>
                <BlockStack spacing="extraTight">
                  <Text emphasis="bold" size="large">
                    {state.balance ?? 0} {translate('points')}
                  </Text>
                  <Text appearance="subdued" size="small">
                    {translate('availableBalance')}
                  </Text>
                </BlockStack>
              </InlineStack>

              {/* Points Expiration Section */}
              {!state.loadingExpiration && state.expiringSoon !== null && (
                <BlockStack spacing="extraTight">
                  <Text emphasis="bold" size="small">⏰ {translate('pointsExpiring')}</Text>
                  {state.expiringSoon.length > 0 ? (
                    <BlockStack spacing="extraTight">
                      {state.expiringSoon.map((exp, idx) => (
                        <Text key={idx} appearance="subdued" size="small">
                          {translate('expiringPoints', { 
                            points: exp.points, 
                            date: formatDateDDMMYYYY(exp.expiration_date) 
                          })}
                        </Text>
                      ))}
                    </BlockStack>
                  ) : (
                    <Text appearance="subdued" size="small">
                      {translate('noPointsExpiring')}
                    </Text>
                  )}
                </BlockStack>
              )}

              <Divider />

              {/* Campo de canje */}
              <BlockStack spacing="base">
                <Text emphasis="bold">💰 {translate('redeemPoints')}</Text>
                <InlineStack spacing="base" blockAlignment="end">
                  <BlockStack spacing="extraTight">
                    <TextField
                      label={translate('amountOfPoints')}
                      type="number"
                      value={state.points}
                      onChange={(value) => setState((prev) => ({ ...prev, points: value }))}
                    />
                  </BlockStack>

                  {/* Botón oficial (colores permitidos por Shopify) */}
                  <Button
                    kind="primary"
                    onPress={handleRedeem}
                    accessibilityLabel={translate('redeem')}
                  >
                     {translate('redeem')}
                  </Button>
                </InlineStack>
              </BlockStack>

              {/* Mensajes de estado */}
              {state.msg && (
                <View 
                  border="base" 
                  cornerRadius="base" 
                  padding="tight"
                >
                  <Text emphasis="bold">{state.msg}</Text>
                </View>
              )}

{state.generatedCode && (
  <BlockStack spacing="tight" inlineAlignment="start">
    <InlineStack spacing="base" blockAlignment="center">
      <Text emphasis="bold" size="large">{translate('codeGenerated')}</Text>
      <View border="base" cornerRadius="base" padding="tight">
        <Text emphasis="bold" size="medium">{state.generatedCode}</Text>
      </View>
    </InlineStack>

    {state.amount != null && (
      <Text appearance="success" size="medium">
        {translate('worthAmount', { amount: String(state.amount), date: formatDateDDMMYYYY(state.expiresAt) })}
      </Text>
    )}
  </BlockStack>
)}

            </BlockStack>
          </View>

          {/* ═══════════════════════════════════════════ */}
          {/*      SECCIÓN DE CUMPLEAÑOS PREMIUM          */}
          {/* ═══════════════════════════════════════════ */}
          <View 
            border="base" 
            cornerRadius="large" 
            padding="base"
          >
            <BlockStack spacing="base">
              {/* Header de cumpleaños */}
              <InlineStack spacing="tight" blockAlignment="center">
                <Text size="extraLarge">🎂</Text>
                <BlockStack spacing="extraTight">
                  <Text emphasis="bold" size="large">
                    {translate('celebrateBirthday')}
                  </Text>
                  <Text appearance="subdued" size="small">
                    {translate('birthdayReward')}
                  </Text>
                </BlockStack>
              </InlineStack>

              <Divider />

              {/* Estado cuando ya tiene fecha guardada (izquierda, sin caja envolvente) */}
              {state.existingDob ? (
  <BlockStack spacing="tight" inlineAlignment="start">
    <InlineStack spacing="base" blockAlignment="center">
      <Text emphasis="bold" size="large">{translate('dateSaved')}</Text>
      <Text size="medium">{state.existingDob}</Text>
    </InlineStack>
    <Text appearance="success" size="medium">
      {translate('birthdayPointsInfo')}
    </Text>
  </BlockStack>
) : (

                /* Formulario activo */
                <BlockStack spacing="base">
                  <Text emphasis="bold">📅 {translate('dateOfBirth')}</Text>
                  
                  <InlineStack spacing="base" blockAlignment="end">
                    <BlockStack spacing="extraTight">
                      <TextField
                        label={translate('datePlaceholder')}
                        value={state.dob}
                        onChange={(value) => setState((p) => ({ ...p, dob: value }))}
                        disabled={state.dobSaving}
                      />
                    </BlockStack>

                    <Button
                      kind="primary"
                      onPress={handleSaveDob}
                      loading={state.dobSaving}
                      accessibilityLabel={translate('save')}
                    >
                       {state.dobSaving ? translate('saving') : translate('save')}
                    </Button>
                  </InlineStack>
                </BlockStack>
              )}

              {/* Mensajes de error */}
              {state.dobMsg && (
                <View 
                  border="base" 
                  cornerRadius="base" 
                  padding="tight"
                >
                  <Text appearance="critical" size="small">
                    ⚠️ {state.dobMsg}
                  </Text>
                </View>
              )}
            </BlockStack>
          </View>

          {SHOW_DEBUG && (
            <Text>
              DEBUG → runtimeGid: {String(state.debug.runtimeGid)} | usedGid: {String(state.debug.usedGid)} | email:{" "}
              {String(state.debug.email)}
            </Text>
          )}
        </>
      )}
    </BlockStack>
  );
}
