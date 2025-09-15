import * as React from "react";
import {Text, BlockStack, TextField, Button} from "@shopify/ui-extensions-react/checkout";

function formUrlEncoded(obj: Record<string, string | number | undefined | null>): string {
  const usp = new URLSearchParams();
  for (const k in obj) {
    const v = obj[k];
    if (v !== undefined && v !== null) usp.append(k, String(v));
  }
  return usp.toString();
}

type Props = { email: string };

export function LoyaltyWidgetCheckout({email}: Props) {
  const [state, setState] = React.useState({
    loading: true,
    balance: null as number | null,
    error: null as string | null,
    points: "",
    msg: null as string | null,
    generatedCode: null as string | null,
  });

  // Igual que en tu widget actual
  const shopDomain = "divain-test-dev-store.myshopify.com";

  async function fetchBalanceByEmail(mail: string) {
    const url = new URL(import.meta.env.VITE_EDGE_LOYALTY_BALANCE_UI);
    url.searchParams.set("email", mail);
    const res = await fetch(url.toString(), { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return typeof json?.balance === "number" ? json.balance : 0;
  }

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!email) {
          setState(s => ({...s, loading: false, error: "Introduce tu email para ver el saldo."}));
          return;
        }
        const balance = await fetchBalanceByEmail(email);
        if (!cancelled) setState(s => ({...s, loading: false, balance, error: null}));
      } catch {
        if (!cancelled) setState(s => ({...s, loading: false, error: "No se pudo cargar el saldo"}));
      }
    })();
    return () => { cancelled = true; };
  }, [email]);

  async function handleRedeem() {
    try {
      setState(p => ({...p, msg: null, generatedCode: null}));
      const points = parseInt(state.points, 10);
      if (!email) throw new Error("Sin email del comprador.");
      if (!Number.isInteger(points) || points <= 0) {
        setState(p => ({...p, msg: "Introduce un número de puntos válido."}));
        return;
      }

      // 1) Obtener token (usa email en checkout)
      const tokUrl = new URL(import.meta.env.VITE_EDGE_SIGN_LOYALTY_LINK);
      tokUrl.searchParams.set("shop_domain", shopDomain);
      tokUrl.searchParams.set("email", email);
      const tokRes = await fetch(tokUrl.toString(), { method: "GET" });
      const tok = await tokRes.json();
      if (!tokRes.ok || !tok?.ok || !tok?.token) throw new Error(tok?.error || "No se pudo autorizar el canje.");

      // 2) Preflight lógico
      const preUrl = new URL(import.meta.env.VITE_EDGE_REDEEM_POINTS);
      preUrl.searchParams.set("preflight", "true");
      preUrl.searchParams.set("shop", shopDomain);
      const preRes = await fetch(preUrl.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formUrlEncoded({ token: tok.token, points }),
      });
      const pj = await preRes.json();
      if (!preRes.ok || !pj?.ok) {
        const err = pj?.error || "Error preflight";
        if (err === "min_redeem_not_met") { setState(p => ({...p, msg: `Debes canjear al menos ${pj.min_redeem} puntos.`})); return; }
        if (err === "insufficient_balance") { setState(p => ({...p, msg: `Saldo insuficiente. Tienes ${pj.currentBalance} puntos.`})); return; }
        throw new Error(err);
      }

      // 3) Canje real
      const redUrl = new URL(import.meta.env.VITE_EDGE_REDEEM_POINTS);
      redUrl.searchParams.set("shop", shopDomain);
      const redRes = await fetch(redUrl.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formUrlEncoded({ token: tok.token, points }),
      });
      const rj = await redRes.json();
      if (!redRes.ok || !rj?.ok) throw new Error(rj?.error || "No se pudo canjear.");

      setState(p => ({...p, msg: "Código generado:", generatedCode: rj.discount_code, points: ""}));
      const newBalance = await fetchBalanceByEmail(email);
      setState(p => ({...p, balance: newBalance}));
    } catch (e: any) {
      setState(p => ({...p, msg: e?.message || "Error en el canje."}));
    }
  }

  if (state.loading) return <Text>Cargando tus puntos…</Text>;

  return (
    <BlockStack spacing="loose">
      {state.error ? (
        <Text>{state.error}</Text>
      ) : (
        <>
          <Text>Tu saldo de puntos: {state.balance ?? 0}</Text>
          <TextField
            label="Puntos a canjear"
            type="number"
            value={state.points}
            onChange={(value) => setState(p => ({...p, points: value}))}
          />
          <Button kind="primary" onPress={handleRedeem}>Canjear</Button>
          {state.msg && !state.generatedCode && <Text>{state.msg}</Text>}
          {state.msg && state.generatedCode && (
            <Text>{state.msg} <Text emphasis="bold">{state.generatedCode}</Text></Text>
          )}
        </>
      )}
    </BlockStack>
  );
}
