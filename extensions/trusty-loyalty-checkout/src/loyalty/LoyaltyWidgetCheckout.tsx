import * as React from "react";
import { Text, BlockStack, TextField, Button, useTranslate, useApi } from "@shopify/ui-extensions-react/checkout";

// ====== CONFIG ======
const EDGE_SIGN_LOYALTY_LINK = "https://tizzlfjuosqfyefybdee.functions.supabase.co/sign_loyalty_link";
const EDGE_LOYALTY_BALANCE   = "https://tizzlfjuosqfyefybdee.functions.supabase.co/loyalty_balance";
const EDGE_REDEEM_DISCOUNT   = "https://tizzlfjuosqfyefybdee.functions.supabase.co/redeem_discount_code";
// =====================

async function detectShopDomainCheckout(query: any): Promise<string> {
  // Lista explícita de las 3 tiendas soportadas
  const SUPPORTED_SHOPS = {
    sandbox: 'sandboxdivain.myshopify.com',
    usa: 'divainusa.myshopify.com',
    spain: 'divaines.myshopify.com',
  } as const;

  console.log('🔍 Checkout - Attempting to detect shop domain via GraphQL...');
  
  try {
    const result = await query(`query { shop { myshopifyDomain } }`);
    const domain = (result as any)?.data?.shop?.myshopifyDomain;
    
    if (domain) {
      console.log('✅ Checkout - Shop domain from GraphQL:', domain);
      const domainLower = String(domain).toLowerCase();
      
      // Validar que sea una de nuestras 3 tiendas
      if (domainLower.includes('divainusa')) return SUPPORTED_SHOPS.usa;
      if (domainLower.includes('divaines')) return SUPPORTED_SHOPS.spain;
      if (domainLower.includes('sandbox')) return SUPPORTED_SHOPS.sandbox;
      
      if (domainLower === SUPPORTED_SHOPS.usa) return SUPPORTED_SHOPS.usa;
      if (domainLower === SUPPORTED_SHOPS.spain) return SUPPORTED_SHOPS.spain;
      if (domainLower === SUPPORTED_SHOPS.sandbox) return SUPPORTED_SHOPS.sandbox;
      
      console.error('❌ Checkout - Shop domain no soportado:', domain);
      throw new Error(`Tienda no soportada: ${domain}`);
    }
  } catch (err: any) {
    console.error('❌ Checkout - GraphQL query failed:', err?.message || err);
    throw new Error(`No se pudo detectar la tienda: ${err?.message || 'error desconocido'}`);
  }
  
  console.error('❌ Checkout - GraphQL no devolvió shop domain');
  throw new Error('No se pudo detectar la tienda en checkout');
}

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
function formatDateDDMMYYYY(iso?: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (!Number.isNaN(+d)) {
      return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
    }
  } catch {}
  const [y, m, d] = String(iso).split("T")[0].split("-");
  if (y && m && d) return `${pad2(Number(d))}/${pad2(Number(m))}/${y}`;
  return String(iso);
}

function formUrlEncoded(obj: Record<string, string | number | undefined | null>): string {
  const usp = new URLSearchParams();
  for (const k in obj) {
    const v = obj[k];
    if (v !== undefined && v !== null) usp.append(k, String(v));
  }
  return usp.toString();
}

type Props = { email: string };

export function LoyaltyWidgetCheckout({ email }: Props) {
  const translate = useTranslate();
  const api = useApi();
  const query = (api as any).query;
  const [shopDomain, setShopDomain] = React.useState<string | null>(null);

  const [state, setState] = React.useState({
    loading: true,
    balance: null as number | null,
    error: null as string | null,
    points: "",
    msg: null as string | null,
    generatedCode: null as string | null,
    amount: null as number | null,
    expiresAt: null as string | null,
    expiringSoon: null as Array<{ expiration_date: string; points: number }> | null,
    totalExpiringSoon: null as number | null,
    loadingExpiration: false as boolean,
  });

  React.useEffect(() => {
    async function detect() {
      try {
        const d: string = await detectShopDomainCheckout(query);
        setShopDomain(d);
      } catch (err: any) {
        const errorMsg = err?.message || translate('shopDomainNotDetected');
        setState((s) => ({ ...s, loading: false, error: errorMsg }));
      }
    }
    detect();
  }, [query]);

  async function getTokenByEmail(mail: string): Promise<string> {
    if (!shopDomain) throw new Error(translate('shopDomainNotDetected'));
    const url = new URL(EDGE_SIGN_LOYALTY_LINK);
    url.searchParams.set("shop_domain", shopDomain);
    url.searchParams.set("email", mail);
    const res = await fetch(url.toString(), { method: "GET" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok || !json?.token) {
      throw new Error(json?.error || translate('errorInvalidToken'));
    }
    return json.token as string;
  }

  async function fetchBalanceByEmail(mail: string): Promise<number> {
    const token = await getTokenByEmail(mail);
    const url = new URL(EDGE_LOYALTY_BALANCE);
    url.searchParams.set("token", token);
    const res = await fetch(url.toString(), { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json().catch(() => ({}));
    return typeof json?.balance === "number" ? json.balance : 0;
  }

  async function fetchPointsExpiration(mail: string) {
    try {
      if (!shopDomain) throw new Error(translate('shopDomainNotDetected'));
      setState((prev) => ({ ...prev, loadingExpiration: true }));

      const url = new URL("https://tizzlfjuosqfyefybdee.functions.supabase.co/get_points_expiration");
      const body = JSON.stringify({
        email: mail,
        shop_domain: shopDomain
      });

      console.log('📡 get_points_expiration (checkout) →', { email: mail, shop_domain: shopDomain });

      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
      });

      const text = await res.text();
      let json: any = null;
      try { json = JSON.parse(text); } catch {}

      if (!res.ok) {
        console.warn('❌ get_points_expiration FAIL (checkout)', { status: res.status, body: text });
        setState((prev) => ({ ...prev, loadingExpiration: false }));
        return;
      }

      if (json?.ok) {
        setState((prev) => ({
          ...prev,
          expiringSoon: json.expiring_soon || [],
          totalExpiringSoon: json.total_expiring_soon || 0,
          loadingExpiration: false
        }));
      } else {
        setState((prev) => ({ ...prev, loadingExpiration: false }));
      }
    } catch (err) {
      console.warn('fetchPointsExpiration error (checkout):', err);
      setState((prev) => ({ ...prev, loadingExpiration: false }));
    }
  }

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!email || !shopDomain) return;
        const balance = await fetchBalanceByEmail(email);
        fetchPointsExpiration(email); // paralelo (no bloqueante)
        if (!cancelled) setState((s) => ({ ...s, loading: false, balance, error: null }));
      } catch {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: translate('errorLoadBalance') }));
      }
    })();
    return () => { cancelled = true; };
  }, [email, shopDomain]);

  async function handleRedeem() {
    try {
      if (!shopDomain) throw new Error(translate('shopDomainNotDetected'));
      setState((p) => ({ ...p, msg: null, generatedCode: null, amount: null, expiresAt: null }));

      const points = parseInt(state.points, 10);
      if (!email) return;
      if (!Number.isInteger(points) || points <= 0) {
        setState((p) => ({ ...p, msg: translate('errorInvalidPoints') }));
        return;
      }

      const token = await getTokenByEmail(email);

      // Preflight
      {
        const preUrl = new URL(EDGE_REDEEM_DISCOUNT);
        preUrl.searchParams.set("preflight", "true");
        preUrl.searchParams.set("shop", shopDomain);
        const preRes = await fetch(preUrl.toString(), {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formUrlEncoded({ token, points }),
        });
        const pj = await preRes.json().catch(() => ({}));
        const ok = preRes.ok && (pj?.ok === true || pj?.success === true || pj?.preflight === true);
        if (!ok) {
          const err = (pj?.error || "").toString();
          if (err === "no_redemption_option") { setState((p) => ({ ...p, msg: pj?.message || translate('errorRedemptionOption', { points }) })); return; }
          if (err === "Insufficient points" || err === "insufficient_balance") {
            setState((p) => ({ ...p, msg: String(translate('errorInsufficientBalance', { available: pj?.available ?? pj?.currentBalance ?? "0" })) }));
            return;
          }
          throw new Error(err || "Error preflight");
        }
      }

      // Canje real
      const redUrl = new URL(EDGE_REDEEM_DISCOUNT);
      redUrl.searchParams.set("shop", shopDomain);
      const redRes = await fetch(redUrl.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formUrlEncoded({ token, points }),
      });
      const rj = await redRes.json().catch(() => ({}));

      const ok = redRes.ok && ((rj?.ok === true) || (rj?.success === true));
      if (!ok) {
        const err = (rj?.error || "").toString();
        if (err === "no_redemption_option") { setState((p) => ({ ...p, msg: rj.message || translate('errorRedemptionOption', { points }) })); return; }
        if (err === "Insufficient points" || err === "INSUFFICIENT_BALANCE") { setState((p) => ({ ...p, msg: String(translate('errorInsufficientBalance', { available: rj.available })) })); return; }
        if (err === "invalid_token") { setState((p) => ({ ...p, msg: translate('errorInvalidToken') })); return; }
        throw new Error(err || `HTTP ${redRes.status}`);
      }

      const code   = rj.discount_code ?? rj.code ?? null;
      const amount = typeof rj.amount === "number" ? rj.amount : (typeof rj.discount_amount === "number" ? rj.discount_amount : null);
      const expires = rj.expires_at ?? rj.expiry ?? null;

      setState((p) => ({
        ...p,
        msg: translate('codeGenerated'),
        generatedCode: code,
        amount,
        expiresAt: expires,
        points: "",
      }));

      const newBalance = await fetchBalanceByEmail(email);
      fetchPointsExpiration(email);
      setState((p) => ({ ...p, balance: newBalance }));
    } catch (e: any) {
      setState((p) => ({ ...p, msg: e?.message || translate('errorRedeemGeneral') }));
    }
  }

  if (state.loading) return <Text>{translate('loading')}</Text>;
  if (state.error)   return <Text>{state.error}</Text>;

  return (
    <BlockStack spacing="loose">
      <Text>{translate('yourBalance', { balance: state.balance ?? 0 })}</Text>

      {!state.loadingExpiration && state.expiringSoon !== null && (
        <BlockStack spacing="tight">
          <Text size="small" emphasis="bold">⏰ {translate('pointsExpiring')}</Text>
          {state.expiringSoon.length > 0 ? (
            <BlockStack spacing="extraTight">
              {state.expiringSoon.map((exp, idx) => (
                <Text key={idx} size="small">
                  {translate('expiringPoints', { points: exp.points, date: formatDateDDMMYYYY(exp.expiration_date) })}
                </Text>
              ))}
            </BlockStack>
          ) : (
            <Text size="small">{translate('noPointsExpiring')}</Text>
          )}
        </BlockStack>
      )}

      <TextField
        label={translate('pointsToRedeem')}
        type="number"
        value={state.points}
        onChange={(value) => setState((p) => ({ ...p, points: value }))}
      />

      <Button kind="primary" onPress={handleRedeem}>
        {translate('redeem')}
      </Button>

      {state.msg && !state.generatedCode && <Text>{state.msg}</Text>}

      {state.msg && state.generatedCode && (
        <BlockStack spacing="tight">
          <Text>{state.msg} <Text emphasis="bold">{state.generatedCode}</Text></Text>
          {state.amount != null && <Text>{translate('expiresOn', { date: formatDateDDMMYYYY(state.expiresAt) })}</Text>}
        </BlockStack>
      )}
    </BlockStack>
  );
}
