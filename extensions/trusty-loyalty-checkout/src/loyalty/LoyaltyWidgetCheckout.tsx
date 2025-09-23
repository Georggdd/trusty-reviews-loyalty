import * as React from "react";
import { Text, BlockStack, TextField, Button } from "@shopify/ui-extensions-react/checkout";

// ====== CONFIG RÁPIDA (ajusta solo estas constantes) ======
const EDGE_SIGN_LOYALTY_LINK = "https://tizzlfjuosqfyefybdee.supabase.co/functions/v1/sign_loyalty_link";
const EDGE_LOYALTY_BALANCE   = "https://tizzlfjuosqfyefybdee.supabase.co/functions/v1/loyalty_balance";
const EDGE_REDEEM_POINTS     = "https://tizzlfjuosqfyefybdee.supabase.co/functions/v1/redeem_points";
const SHOP_DOMAIN            = "sandboxdivain.myshopify.com";
// ==========================================================

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
          // Checkout todavía no nos dio el email → mantenemos loading
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
      setState((p) => ({ ...p, msg: null, generatedCode: null }));

      const points = parseInt(state.points, 10);
      if (!email) return; // en checkout debería estar siempre
      if (!Number.isInteger(points) || points <= 0) {
        setState((p) => ({ ...p, msg: "Introduce un número de puntos válido." }));
        return;
      }

      // 1) Obtener token por email
      const token = await getTokenByEmail(email);

      // 2) Preflight lógico
      {
        const preUrl = new URL(EDGE_REDEEM_POINTS);
        preUrl.searchParams.set("preflight", "true");
        preUrl.searchParams.set("shop", SHOP_DOMAIN);
        const preRes = await fetch(preUrl.toString(), {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formUrlEncoded({ token, points }),
        });
        const pj = await preRes.json().catch(() => ({}));
        if (!preRes.ok || !pj?.ok) {
          const err = pj?.error || "Error preflight";
          if (err === "min_redeem_not_met") {
            setState((p) => ({ ...p, msg: `Debes canjear al menos ${pj.min_redeem} puntos.` }));
            return;
          }
          if (err === "insufficient_balance") {
            setState((p) => ({ ...p, msg: `Saldo insuficiente. Tienes ${pj.currentBalance} puntos.` }));
            return;
          }
          throw new Error(err);
        }
      }

      // 3) Canje real
      const redUrl = new URL(EDGE_REDEEM_POINTS);
      redUrl.searchParams.set("shop", SHOP_DOMAIN);
      const redRes = await fetch(redUrl.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formUrlEncoded({ token, points }),
      });
      const rj = await redRes.json().catch(() => ({}));
      if (!redRes.ok || !rj?.ok) throw new Error(rj?.error || "No se pudo canjear.");

      // 4) Mensaje + refrescar saldo
      setState((p) => ({ ...p, msg: "Código generado:", generatedCode: rj.discount_code, points: "" }));
      const newBalance = await fetchBalanceByEmail(email);
      setState((p) => ({ ...p, balance: newBalance }));
    } catch (e: any) {
      setState((p) => ({ ...p, msg: e?.message || "Error en el canje." }));
    }
  }

  if (state.loading) return <Text>Cargando tus puntos…</Text>;
  if (state.error) return <Text>{state.error}</Text>;

  return (
    <BlockStack spacing="loose">
      <Text>Tu saldo de puntos: {state.balance ?? 0}</Text>

      <TextField
        label="Puntos a canjear"
        type="number"
        value={state.points}
        onChange={(value) => setState((p) => ({ ...p, points: value }))}
      />

      <Button kind="primary" onPress={handleRedeem}>
        Canjear
      </Button>

      {state.msg && !state.generatedCode && <Text>{state.msg}</Text>}
      {state.msg && state.generatedCode && (
        <Text>
          {state.msg} <Text emphasis="bold">{state.generatedCode}</Text>
        </Text>
      )}
    </BlockStack>
  );
}
