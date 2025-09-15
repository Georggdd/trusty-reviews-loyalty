import * as React from "react";
import {
  reactExtension,
  Text,
  BlockStack,
  useApi,
  TextField,
  Button,
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
    bodyText.includes("you’re viewing:")
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

function LoyaltyWidget() {
  const api = useApi();
  const query = (api as any).query as (q: string) => Promise<CustomerIdQueryResult>;

  // 🟣 FLAG DEBUG UI: dejar en false para ocultar el texto de depuración en pantalla.
  // Si en la tienda real necesitas volver a ver el detalle en pantalla, cambia a true.
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
    generatedCode: string | null; // ← para pintar en negrita
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

  // ⚠️ Por ahora fijo a la DEV store para pruebas controladas.
  const shopDomain = "divain-test-dev-store.myshopify.com";

  async function fetchBalance(usedGid: string | null) {
    try {
      const { numeric } = normalizeCustomerId(usedGid);
      const qs = new URLSearchParams({
        shopify_customer_gid: usedGid ?? "",
        shopify_customer_id: numeric ?? "",
      });
      const res = await fetch(
        "https://tizzlfjuosqfyefybdee.supabase.co/functions/v1/loyalty_balance_ui?" + qs.toString()
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setState((prev) => ({
        ...prev,
        balance: typeof json?.balance === "number" ? json.balance : 0,
        error: null,
      }));
    } catch {
      setState((prev) => ({ ...prev, error: "No se pudo cargar el saldo" }));
    }
  }

  React.useEffect(() => {
    let cancelled = false;

    async function hydrateAndLoad() {
      const notes: string[] = [];
      const preview = isCustomizerPreview();
      const href = typeof window !== "undefined" ? window.location.href : "";

      try {
        if (preview) {
          setState({
            loading: false,
            balance: null,
            error:
              "Estás en vista PREVIEW del editor. Cierra la vista previa (Close preview) y abre la cuenta de cliente en una pestaña normal para que exista sesión.",
            points: "",
            msg: null,
            generatedCode: null,
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
              error:
                "No se pudo identificar tu sesión de cliente. Cierra sesión y vuelve a entrar en la cuenta de la tienda.",
              points: "",
              msg: null,
              generatedCode: null,
              debug: {
                runtimeGid: runtimeGid,
                runtimeNumeric: runtimeNumeric,
                queryGid,
                usedGid: null,
                notes: [
                  ...notes,
                  "Asegúrate de NO estar en preview y de usar https://shopify.com/…/account.",
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

        await fetchBalance(usedGid);

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
            error: "No se pudo cargar el saldo",
          }));
        }
      }
    }

    hydrateAndLoad();
    return () => {
      cancelled = true;
    };
  }, [api, runtimeGid, runtimeNumeric, runtimeEmail]);

  async function handleRedeem() {
    try {
      setState((prev) => ({ ...prev, msg: null, generatedCode: null }));

      const usedGid = state.debug.usedGid;
      const { numeric } = normalizeCustomerId(usedGid);
      const points = parseInt(state.points, 10);

      if (!usedGid || !numeric) throw new Error("Sin sesión de cliente.");
      if (!Number.isInteger(points) || points <= 0) {
        setState((prev) => ({ ...prev, msg: "Introduce un número de puntos válido." }));
        return;
      }

      // (1) Token por GET (evita preflight CORS)
      const tokUrl = new URL(
        "https://tizzlfjuosqfyefybdee.supabase.co/functions/v1/sign_loyalty_link"
      );
      tokUrl.searchParams.set("shop_domain", shopDomain);
      tokUrl.searchParams.set("shopify_customer_id", numeric);

      const tokRes = await fetch(tokUrl.toString(), { method: "GET" });
      const tok = await tokRes.json();
      if (!tokRes.ok || !tok?.ok || !tok?.token) {
        throw new Error(tok?.error || "No se pudo obtener autorización para canjear.");
      }

      // Helper: x-www-form-urlencoded
      const form = (obj: Record<string, string | number>) => {
        const usp = new URLSearchParams();
        for (const k in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, k)) {
            const v = (obj as any)[k];
            if (v !== undefined && v !== null) usp.append(k, String(v));
          }
        }
        return usp.toString();
      };

      // (2) Preflight lógico
      const preRes = await fetch(
        `https://tizzlfjuosqfyefybdee.supabase.co/functions/v1/redeem_points?preflight=true&shop=${shopDomain}`,
        { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form({ token: tok.token, points }) }
      );
      const pj = await preRes.json();
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

      // (3) Canje real
      const redRes = await fetch(
        `https://tizzlfjuosqfyefybdee.supabase.co/functions/v1/redeem_points?shop=${shopDomain}`,
        { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form({ token: tok.token, points }) }
      );
      const rj = await redRes.json();
      if (!redRes.ok || !rj?.ok) {
        throw new Error(rj?.error || "No se pudo canjear.");
      }

      // (4) Mensaje + refrescar saldo (con negrita para el código)
      setState((prev) => ({
        ...prev,
        msg: "Código generado:",
        generatedCode: rj.discount_code,
        points: "",
      }));
      await fetchBalance(usedGid);
    } catch (e: any) {
      setState((prev) => ({ ...prev, msg: e?.message || "Error en el canje." }));
    }
  }

  if (state.loading) return <Text>Cargando tus puntos…</Text>;

  return (
    <BlockStack spacing="loose">
      {/* Solo CONSOLE: no pinta nada en pantalla */}
      {SHOW_DEBUG && <DebugCustomer />}

      {state.error ? (
        <>
          <Text>{state.error}</Text>

          {/* Si activas SHOW_DEBUG=true podrás ver estos detalles en pantalla */}
          {SHOW_DEBUG && (
            <>
              <Text>
                DEBUG → runtimeGid: {String(state.debug.runtimeGid)} | runtimeNumeric:{" "}
                {String(state.debug.runtimeNumeric)} | queryGid: {String(state.debug.queryGid)} | usedGid:{" "}
                {String(state.debug.usedGid)}
              </Text>
              <Text>
                INFO → email: {String(state.debug.email)} | name: {String(state.debug.name)}
              </Text>
              <Text>NOTES → {state.debug.notes.join(" | ")}</Text>
              <Text>PAGE → preview: {String(state.debug.isPreview)} | {state.debug.href}</Text>
            </>
          )}
        </>
      ) : (
        <>
          <Text>Tu saldo de puntos: {state.balance ?? 0}</Text>

          <TextField
            label="Puntos a canjear"
            type="number"
            value={state.points}
            onChange={(value) => setState((prev) => ({ ...prev, points: value }))}
          />

          <Button kind="primary" onPress={handleRedeem}>
            Canjear
          </Button>

          {/* Mensajes de usuario */}
          {state.msg && !state.generatedCode && <Text>{state.msg}</Text>}
          {state.msg && state.generatedCode && (
            <>
              <Text>{state.msg} <Text emphasis="bold">{state.generatedCode}</Text></Text>
            </>
          )}

          {/* Bloque de depuración en pantalla → oculto por defecto */}
          {SHOW_DEBUG && (
            <Text>
              DEBUG → runtimeGid: {String(state.debug.runtimeGid)} | usedGid:{" "}
              {String(state.debug.usedGid)} | email: {String(state.debug.email)}
            </Text>
          )}
        </>
      )}
    </BlockStack>
  );
}
