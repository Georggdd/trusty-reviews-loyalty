import * as React from "react";
import { Text, BlockStack, TextField, Button } from "@shopify/ui-extensions-react/checkout";

// ====== CONFIG ======
const EDGE_SIGN_LOYALTY_LINK = "https://tizzlfjuosqfyefybdee.supabase.co/functions/v1/sign_loyalty_link";
const EDGE_LOYALTY_BALANCE   = "https://tizzlfjuosqfyefybdee.supabase.co/functions/v1/loyalty_balance"; // OK para saldo con token
const EDGE_REDEEM_DISCOUNT   = "https://tizzlfjuosqfyefybdee.supabase.co/functions/v1/redeem_discount_code"; // ⬅️ NUEVO
const SHOP_DOMAIN            = "sandboxdivain.myshopify.com";
// =====================

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
    url.searchParams.set("shop_domain", SHOP_DOMAIN);
    url.searchParams.set("email", mail);
    const res = await fetch(url.toString(), { method: "GET" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok || !json?.token) {
      throw new Error(json?.error || "No se pudo obtener autorización.");
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
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: "No se pudo cargar el saldo" }));
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
        setState((p) => ({ ...p, msg: "Introduce un número de puntos válido." }));
        return;
      }

      // 1) Token por email
      const token = await getTokenByEmail(email);

      // 2) Preflight con el endpoint nuevo (opcional pero útil para mensajes)
      {
        const preUrl = new URL(EDGE_REDEEM_DISCOUNT);
        preUrl.searchParams.set("preflight", "true");
        preUrl.searchParams.set("shop", SHOP_DOMAIN);
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
            setState((p) => ({ ...p, msg: pj?.message || `No hay opción de canje para ${points} puntos.` }));
            return;
          }
          if (err === "Insufficient points" || err === "insufficient_balance") {
            setState((p) => ({ ...p, msg: `Saldo insuficiente. Tienes ${pj?.available ?? pj?.currentBalance ?? "0"} puntos.` }));
            return;
          }
          throw new Error(err || "Error preflight");
        }
      }

      // 3) Canje real con el endpoint nuevo
      const redUrl = new URL(EDGE_REDEEM_DISCOUNT);
      redUrl.searchParams.set("shop", SHOP_DOMAIN);
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
          setState((p) => ({ ...p, msg: rj.message || `No hay opción de canje para ${points} puntos.` }));
          return;
        }
        if (err === "Insufficient points" || err === "INSUFFICIENT_BALANCE") {
          setState((p) => ({ ...p, msg: `Saldo insuficiente. Tienes ${rj.available} puntos, necesitas ${rj.required}.` }));
          return;
        }
        if (err === "invalid_token") {
          setState((p) => ({ ...p, msg: `Token inválido. Vuelve a introducir el email o recarga la página.` }));
          return;
        }
        throw new Error(err || `No se pudo canjear (HTTP ${redRes.status}).`);
      }

      // 4) Extrae datos (tolerante a claves antiguas/nuevas)
      const code     = rj.discount_code ?? rj.code ?? null;
      const amount   = typeof rj.amount === "number"
                        ? rj.amount
                        : (typeof rj.discount_amount === "number" ? rj.discount_amount : null);
      const expires  = rj.expires_at ?? rj.expiry ?? null;

      setState((p) => ({
        ...p,
        msg: "Código generado:",
        generatedCode: code,
        amount,
        expiresAt: expires,
        points: "",
      }));

      // 5) Refrescar saldo
      const newBalance = await fetchBalanceByEmail(email);
      setState((p) => ({ ...p, balance: newBalance }));
    } catch (e: any) {
      setState((p) => ({ ...p, msg: e?.message || "Error en el canje." }));
    }
  }

  if (state.loading) return <Text>Cargando tus puntos…</Text>;
  if (state.error)   return <Text>{state.error}</Text>;

  return (
    <BlockStack spacing="loose">
      <Text>Tu saldo de puntos: {state.balance ?? 0}</Text>

      <TextField
        label="Puntos a canjear (100 → 5€, 200 → 10€)"
        type="number"
        value={state.points}
        onChange={(value) => setState((p) => ({ ...p, points: value }))}
      />

      <Button kind="primary" onPress={handleRedeem}>
        Canjear
      </Button>

      {state.msg && !state.generatedCode && <Text>{state.msg}</Text>}

      {state.msg && state.generatedCode && (
        <BlockStack spacing="tight">
          <Text>
            {state.msg} <Text emphasis="bold">{state.generatedCode}</Text>
          </Text>
          {state.amount != null && (
            <Text>Importe: {String(state.amount)}€{state.expiresAt ? ` · Caduca: ${state.expiresAt}` : ""}</Text>
          )}
        </BlockStack>
      )}
    </BlockStack>
  );
}
