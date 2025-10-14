import * as React from "react";
import { Text, BlockStack, TextField, Button, useTranslate } from "@shopify/ui-extensions-react/checkout";

// ====== CONFIG ======
const EDGE_SIGN_LOYALTY_LINK = "https://tizzlfjuosqfyefybdee.supabase.co/functions/v1/sign_loyalty_link";
const EDGE_LOYALTY_BALANCE   = "https://tizzlfjuosqfyefybdee.supabase.co/functions/v1/loyalty_balance"; // OK para saldo con token
const EDGE_REDEEM_DISCOUNT   = "https://tizzlfjuosqfyefybdee.supabase.co/functions/v1/redeem_discount_code"; // ⬅️ NUEVO
// =====================

// Detecta el shop domain dinámicamente
function detectShopDomain(): string {
  if (typeof window === "undefined") {
    console.warn('⚠️ Window not available in checkout, using fallback');
    return "sandboxdivain.myshopify.com";
  }

  const hostname = window.location.hostname;
  const href = window.location.href;
  console.log('🔍 Checkout: Detecting shop domain from:', { hostname, href });
  
  // Mapeo de dominios de checkout a tiendas
  const customDomainMap: Record<string, string> = {
    'checkout.divainparfums.co': 'divainusa.myshopify.com',
    'checkout.divainparfums.com': 'divainusa.myshopify.com',
    'checkout.divainparfums.es': 'divaines.myshopify.com',
  };
  
  // 1. Check custom domain mapping first
  if (customDomainMap[hostname]) {
    console.log('✅ Shop domain from custom checkout domain:', customDomainMap[hostname]);
    return customDomainMap[hostname];
  }
  
  // 2. Si estamos en myshopify.com checkout
  if (hostname.includes("myshopify.com")) {
    const match = hostname.match(/([^.]+)\.myshopify\.com/);
    if (match) {
      const detected = `${match[1]}.myshopify.com`;
      console.log('✅ Shop domain from checkout URL:', detected);
      return detected;
    }
  }
  
  // 3. Intentar desde URL (puede tener pistas)
  if (href.includes('divainusa')) {
    console.log('✅ Shop domain inferred from URL content: divainusa');
    return 'divainusa.myshopify.com';
  }
  if (href.includes('divaines')) {
    console.log('✅ Shop domain inferred from URL content: divaines');
    return 'divaines.myshopify.com';
  }
  
  // Fallback
  console.warn('⚠️ Using fallback shop domain in checkout');
  return "sandboxdivain.myshopify.com";
}


// 👉 helper para formatear fechas a DD/MM/AAAA
const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
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
  const [shopDomain] = React.useState(() => detectShopDomain());
  
  const [state, setState] = React.useState({
    loading: true,
    balance: null as number | null,
    error: null as string | null,
    points: "",
    msg: null as string | null,
    generatedCode: null as string | null,
    amount: null as number | null,
    expiresAt: null as string | null,
  });

  async function getTokenByEmail(mail: string): Promise<string> {
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

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!email) {
          setState((s) => ({ ...s, loading: true, error: null }));
          return;
        }
        const balance = await fetchBalanceByEmail(email);
        if (!cancelled) setState((s) => ({ ...s, loading: false, balance, error: null }));
      } catch {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: translate('errorLoadBalance') }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email]);

  async function handleRedeem() {
    try {
      setState((p) => ({ ...p, msg: null, generatedCode: null, amount: null, expiresAt: null }));

      const points = parseInt(state.points, 10);
      if (!email) return;
      if (!Number.isInteger(points) || points <= 0) {
        setState((p) => ({ ...p, msg: translate('errorInvalidPoints') }));
        return;
      }

      // 1) Token por email
      const token = await getTokenByEmail(email);

      // 2) Preflight con el endpoint nuevo (opcional pero útil para mensajes)
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
          if (err === "no_redemption_option") {
            setState((p) => ({ ...p, msg: pj?.message || translate('errorRedemptionOption', { points }) }));
            return;
          }
          if (err === "Insufficient points" || err === "insufficient_balance") {
            setState((p) => ({ ...p, msg: String(translate('errorInsufficientBalance', { available: pj?.available ?? pj?.currentBalance ?? "0" })) }));
            return;
          }
          throw new Error(err || "Error preflight");
        }
      }

      // 3) Canje real con el endpoint nuevo
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
        if (err === "no_redemption_option") {
          setState((p) => ({ ...p, msg: rj.message || translate('errorRedemptionOption', { points }) }));
          return;
        }
        if (err === "Insufficient points" || err === "INSUFFICIENT_BALANCE") {
          setState((p) => ({ ...p, msg: String(translate('errorInsufficientBalance', { available: rj.available })) }));
          return;
        }
        if (err === "invalid_token") {
          setState((p) => ({ ...p, msg: translate('errorInvalidToken') }));
          return;
        }
        throw new Error(err || `HTTP ${redRes.status}`);
      }

      // 4) Extrae datos (tolerante a claves antiguas/nuevas)
      const code     = rj.discount_code ?? rj.code ?? null;
      const amount   = typeof rj.amount === "number"
                        ? rj.amount
                        : (typeof rj.discount_amount === "number" ? rj.discount_amount : null);
      const expires  = rj.expires_at ?? rj.expiry ?? null;

      setState((p) => ({
        ...p,
        msg: translate('codeGenerated'),
        generatedCode: code,
        amount,
        expiresAt: expires,
        points: "",
      }));

      // 5) Refrescar saldo
      const newBalance = await fetchBalanceByEmail(email);
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
          <Text>
            {state.msg} <Text emphasis="bold">{state.generatedCode}</Text>
          </Text>
          {state.amount != null && (
             <Text>{translate('expiresOn', { date: formatDateDDMMYYYY(state.expiresAt) })}</Text>
            )}
        </BlockStack>
      )}
    </BlockStack>
  );
}
