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
    // DOB UI
    dob: string; // "YYYY-MM-DD"
    dobSaving: boolean;
    dobMsg: string | null;
    existingDob: string | null; // para pintar si ya hay una fecha guardada
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
    // DOB UI
    dob: "",
    dobSaving: false,
    dobMsg: null,
    existingDob: null,
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
  const shopDomain = "sandboxdivain.myshopify.com"; // TODO: parametrizar en prod

  const SUPABASE_EDGE = "https://tizzlfjuosqfyefybdee.supabase.co/functions/v1";

  async function fetchBalance(usedGid: string | null) {
    try {
      const { numeric } = normalizeCustomerId(usedGid);
      const qs = new URLSearchParams({
        shopify_customer_gid: usedGid ?? "",
        shopify_customer_id: numeric ?? "",
      });
      const res = await fetch(`${SUPABASE_EDGE}/loyalty_balance_ui?` + qs.toString());
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

  async function fetchExistingDob(usedGid: string | null) {
    try {
      const { numeric } = normalizeCustomerId(usedGid);
      if (!numeric) return;
      // Endpoint de lectura ligera del perfil del cliente (a implementar en Edge): get_customer_profile_ui
      const url = new URL(`${SUPABASE_EDGE}/get_customer_profile_ui`);
      url.searchParams.set("shop_domain", shopDomain);
      url.searchParams.set("shopify_customer_id", numeric);
      const res = await fetch(url.toString(), { method: "GET" });
      if (!res.ok) return; // si no existe aún, seguimos sin bloquear la UI
      const j = await res.json();
      if (j?.date_of_birth) {
        const [y, m, d] = String(j.date_of_birth).split("-");
        const ddmmyyyy = (y && m && d) ? `${d}-${m}-${y}` : j.date_of_birth;
        setState((p) => ({ ...p, existingDob: ddmmyyyy, dob: ddmmyyyy }));
      }
    } catch {
      // silencio: no bloquea la UI
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
            dob: "",
            dobSaving: false,
            dobMsg: null,
            existingDob: null,
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
              dob: "",
              dobSaving: false,
              dobMsg: null,
              existingDob: null,
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

        await Promise.all([
          fetchBalance(usedGid),
          fetchExistingDob(usedGid),
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

  // Helpers comunes
  const formEncode = (obj: Record<string, string | number>) => {
    const usp = new URLSearchParams();
    for (const k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) usp.append(k, String((obj as any)[k]));
    return usp.toString();
  };

  // Padding sin padStart (evita exigir es2017)
  const pad = (n: number | string, len: number) => {
    const s = String(n);
    return (Array(len + 1).join("0") + s).slice(-len);
  };

  // Helper para normalizar entrada de fecha a ISO
  function normalizeDobInputToISO(input: string): { ok: true; iso: string } | { ok: false; error: string } {
    if (!input) return { ok: false, error: "vacío" };
    let s = input.trim();
    // Acepta DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, DDMMYYYY, D-M-YYYY
    s = s.replace(/[\.\/]/g, "-").replace(/\s+/g, "");
    if (/^\d{8}$/.test(s)) s = `${s.slice(0,2)}-${s.slice(2,4)}-${s.slice(4)}`; // DDMMYYYY → DD-MM-YYYY
    const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (!m) return { ok: false, error: "formato" };
    const dd = Number(m[1]), mm = Number(m[2]), yyyy = Number(m[3]);
    if (!(mm >= 1 && mm <= 12)) return { ok: false, error: "mes" };
    if (!(dd >= 1 && dd <= 31)) return { ok: false, error: "día" };
    const daysInMonth = new Date(yyyy, mm, 0).getDate();
    if (dd > daysInMonth) return { ok: false, error: "día-mes" };
    const iso = `${pad(yyyy,4)}-${pad(mm,2)}-${pad(dd,2)}`;
    const dt = new Date(iso), today = new Date();
    if (Number.isNaN(+dt) || dt > today) return { ok: false, error: "fecha" };
    return { ok: true, iso };
  }

  async function getTokenForCustomer(): Promise<string> {
    const usedGid = state.debug.usedGid;
    const { numeric } = normalizeCustomerId(usedGid);
    if (!usedGid || !numeric) throw new Error("Sin sesión de cliente.");
    const tokUrl = new URL(`${SUPABASE_EDGE}/sign_loyalty_link`);
    tokUrl.searchParams.set("shop_domain", shopDomain);
    tokUrl.searchParams.set("shopify_customer_id", numeric);
    const tokRes = await fetch(tokUrl.toString(), { method: "GET" });
    const tok = await tokRes.json();
    if (!tokRes.ok || !tok?.ok || !tok?.token) {
      throw new Error(tok?.error || "No se pudo obtener autorización.");
    }
    return tok.token as string;
  }

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

      const token = await getTokenForCustomer();

      // (1) Preflight lógico
      const preRes = await fetch(
        `${SUPABASE_EDGE}/redeem_points?preflight=true&shop=${shopDomain}`,
        { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formEncode({ token, points }) }
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

      // (2) Canje real
      const redRes = await fetch(
        `${SUPABASE_EDGE}/redeem_points?shop=${shopDomain}`,
        { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formEncode({ token, points }) }
      );
      const rj = await redRes.json();
      if (!redRes.ok || !rj?.ok) {
        throw new Error(rj?.error || "No se pudo canjear.");
      }

      // (3) Mensaje + refrescar saldo (con negrita para el código)
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

  // ────────────────────────────────────────────────────────────────
  //          UI DE FECHA DE NACIMIENTO (Option B + Klaviyo)
  // ────────────────────────────────────────────────────────────────
  function isValidDobStr(yyyyMmDd: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) return false;
    const dt = new Date(yyyyMmDd);
    if (Number.isNaN(+dt)) return false;
    const today = new Date();
    if (dt > today) return false; // no futuro
    return true;
  }

  async function handleSaveDob() {
    try {
      setState((p) => ({ ...p, dobSaving: true, dobMsg: null }));
      const parsed = normalizeDobInputToISO(state.dob);
      if (!parsed.ok) {
        setState((p) => ({ ...p, dobSaving: false, dobMsg: "Formato esperado DD-MM-YYYY (admite 01011990, 01/01/1990, 01.01.1990)." }));
        return;
      }
      const dobISO = parsed.iso; // guardar en DB como YYYY-MM-DD

      const token = await getTokenForCustomer();
      const res = await fetch(`${SUPABASE_EDGE}/set_date_of_birth`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token, date_of_birth: dobISO, shop_domain: shopDomain }).toString(),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) throw new Error(j?.error || `Error HTTP ${res.status}`);

      // Mostrar en UI como DD-MM-YYYY
      const [y, m, d] = dobISO.split("-");
      const ddmmyyyy = `${d}-${m}-${y}`;
      setState((p) => ({ ...p, dobSaving: false, dobMsg: "Fecha guardada", existingDob: ddmmyyyy, dob: ddmmyyyy }));
    } catch (e: any) {
      setState((p) => ({ ...p, dobSaving: false, dobMsg: e?.message || "No se pudo guardar" }));
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

  if (state.loading) return <Text>Cargando tus puntos…</Text>;

  return (
    <BlockStack spacing="loose">
      {/* Solo CONSOLE: no pinta nada en pantalla */}
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
              <Text>
                {state.msg} <Text emphasis="bold">{state.generatedCode}</Text>
              </Text>
            </>
          )}

          {/* ─────────────────────────────────────────── */}
          {/*      NUEVO BLOQUE: Fecha de nacimiento      */}
          {/* ─────────────────────────────────────────── */}
          <Text emphasis="bold">¡Pon tu fecha de nacimiento y recibe 500 puntos como regalo de cumpleaños!</Text>

          <BlockStack spacing="tight">
            <TextField
              label="Fecha de nacimiento (DD-MM-YYYY)"
              value={state.dob}
              onChange={(value) => setState((p) => ({ ...p, dob: value }))}
              disabled={!!state.existingDob}
              /* Nota: TextField de customer-account no soporta type="date"; usamos string y validamos formato */
            />
            <Button
              kind="secondary"
              onPress={handleSaveDob}
              disabled={!!state.existingDob || state.dobSaving}
            >
              {state.existingDob ? "Guardada" : state.dobSaving ? "Guardando…" : "Guardar"}
            </Button>
          </BlockStack>

          {state.existingDob && (
            <Text>Ya tenemos tu fecha: {state.existingDob}. Si necesitas cambiarla, contacta con soporte.</Text>
          )}

          {state.dobMsg && <Text>{state.dobMsg}</Text>}

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
