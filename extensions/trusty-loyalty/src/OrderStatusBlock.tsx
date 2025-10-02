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
    generatedCode: string | null;
    amount: number | null;
    expiresAt: string | null;
    // DOB UI
    dob: string;
    dobSaving: boolean;
    dobMsg: string | null;
    existingDob: string | null;
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
      if (!numeric) throw new Error("Sin sesión de cliente.");
  
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
      setState((prev) => ({ ...prev, error: "No se pudo cargar el saldo" }));
    }
  }   

  async function fetchExistingDob(usedGid: string | null) {
    try {
      const { numeric } = normalizeCustomerId(usedGid);
      if (!numeric) return;
      const url = new URL(`${SUPABASE_EDGE}/get_customer_profile_ui`);
      url.searchParams.set("shop_domain", shopDomain);
      url.searchParams.set("shopify_customer_id", numeric);
      const res = await fetch(url.toString(), { method: "GET" });
      if (!res.ok) return;
      const j = await res.json();
      if (j?.date_of_birth) {
        const [y, m, d] = String(j.date_of_birth).split("-");
        const ddmmyyyy = (y && m && d) ? `${d}-${m}-${y}` : j.date_of_birth;
        setState((p) => ({ ...p, existingDob: ddmmyyyy, dob: ddmmyyyy }));
      }
    } catch {
      // silencio
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
            amount: null,
            expiresAt: null,
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
              amount: null,
              expiresAt: null,
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

        await Promise.all([fetchBalance(usedGid), fetchExistingDob(usedGid)]);

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
      setState((prev) => ({ ...prev, msg: null, generatedCode: null, amount: null, expiresAt: null }));
  
      // Usa el GID que ya está resuelto en debug; si faltara, cae al runtime
      const usedGidLocal = state.debug.usedGid ?? runtimeGid;
      const { numeric } = normalizeCustomerId(usedGidLocal);
      const points = parseInt(state.points, 10);
  
      if (!usedGidLocal || !numeric) throw new Error("Sin sesión de cliente.");
      if (!Number.isInteger(points) || points <= 0) {
        setState((prev) => ({ ...prev, msg: "Introduce un número de puntos válido." }));
        return;
      }
  
      const token = await getTokenForCustomer(usedGidLocal);
  
      const redRes = await fetch(
        `${SUPABASE_EDGE}/redeem_discount_code?shop=${shopDomain}`,
        { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formEncode({ token, points }) }
      );
      const rj = await redRes.json().catch(() => ({} as any));
  
      const ok = redRes.ok && ((rj?.ok === true) || (rj?.success === true));
      if (!ok) {
        const err = (rj?.error || "").toString();
        if (err === "no_redemption_option") { setState((p) => ({ ...p, msg: rj.message || `No hay opción de canje para ${points} puntos.` })); return; }
        if (err === "Insufficient points" || err === "INSUFFICIENT_BALANCE") { setState((p) => ({ ...p, msg: `Saldo insuficiente. Tienes ${rj.available} puntos, necesitas ${rj.required}.` })); return; }
        if (err === "invalid_token") { setState((p) => ({ ...p, msg: `Token inválido. Cierra sesión y vuelve a entrar.` })); return; }
        throw new Error(err || `No se pudo canjear (HTTP ${redRes.status}).`);
      }
  
      const code = rj.discount_code ?? rj.code ?? null;
      const amount = (typeof rj.amount === "number" ? rj.amount : typeof rj.discount_amount === "number" ? rj.discount_amount : null);
      const expiresAt = rj.expires_at ?? rj.expiry ?? null;
  
      setState((prev) => ({ ...prev, msg: "Código de descuento generado:", generatedCode: code, amount, expiresAt, points: "" }));
  
      await fetchBalance(usedGidLocal);
    } catch (e: any) {
      setState((prev) => ({ ...prev, msg: e?.message || "Error en el canje." }));
    }
  }  

  async function copyCodeToClipboard(code: string) {
    try {
      await (navigator as any)?.clipboard?.writeText(code);
      setState((p) => ({ ...p, msg: "Código copiado al portapapeles ✅" }));
    } catch {
      setState((p) => ({ ...p, msg: "No se pudo copiar. Copia manualmente." }));
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
          dobMsg: "Formato esperado DD-MM-YYYY (admite 01011990, 01/01/1990, 01.01.1990).",
        }));
        return;
      }
      const dobISO = parsed.iso;

      const token = await getTokenForCustomer();
      const res = await fetch(`${SUPABASE_EDGE}/set_date_of_birth`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token, date_of_birth: dobISO, shop_domain: shopDomain }).toString(),
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
          {/*           SECCIÓN DE PUNTOS MEJORADA        */}
          {/* ═══════════════════════════════════════════ */}
          <BlockStack spacing="loose">
            {/* Saldo de puntos destacado */}
            <BlockStack spacing="tight">
              <Text emphasis="bold" size="large">Tu saldo de puntos: {state.balance ?? 0}</Text>
              <Text appearance="subdued">Canjea tus puntos por descuentos exclusivos</Text>
            </BlockStack>

            {/* Campo de canje con mejor diseño */}
            <BlockStack spacing="tight">
              <TextField
                label="Puntos a canjear"
                type="number"
                value={state.points}
                onChange={(value) => setState((prev) => ({ ...prev, points: value }))}
              />
              
              <Button kind="primary" onPress={handleRedeem}>
                Canjear
              </Button>
            </BlockStack>

            {/* Mensajes de estado mejorados */}
            {state.msg && (
              <BlockStack spacing="tight">
                <Text emphasis="bold">{state.msg}</Text>
              </BlockStack>
            )}

            {/* Código generado con mejor presentación */}
            {state.generatedCode && (
              <BlockStack spacing="tight">
                <Text emphasis="bold" size="large">🎉 ¡Código generado!</Text>
                <BlockStack spacing="extraTight">
                  <Text emphasis="bold" size="medium">{state.generatedCode}</Text>
                  {state.amount != null && (
                    <Text appearance="success">
                      Vale por {String(state.amount)}€
                      {state.expiresAt ? ` · Caduca: ${state.expiresAt}` : ""}
                    </Text>
                  )}
                </BlockStack>
                <Button kind="secondary" onPress={() => copyCodeToClipboard(state.generatedCode!)}>
                  📋 Copiar código
                </Button>
              </BlockStack>
            )}
          </BlockStack>

          {/* ═══════════════════════════════════════════ */}
          {/*      SECCIÓN DE CUMPLEAÑOS MEJORADA         */}
          {/* ═══════════════════════════════════════════ */}
          <BlockStack spacing="loose">
            {/* Encabezado de cumpleaños atractivo */}
            <BlockStack spacing="tight">
              <Text emphasis="bold" size="large">🎂 ¡Celebra tu cumpleaños!</Text>
              <Text>Pon tu fecha de nacimiento y recibe 15 puntos como regalo de cumpleaños</Text>
            </BlockStack>

            {/* Estado actual si ya tiene fecha */}
            {state.existingDob && (
              <BlockStack spacing="tight">
                <Text emphasis="bold">Ya tenemos tu fecha: {state.existingDob}</Text>
                <Text appearance="success">✅ ¡Recibirás 15 puntos en tu cumpleaños!</Text>
              </BlockStack>
            )}

            {/* Formulario de fecha de nacimiento */}
            {!state.existingDob && (
              <BlockStack spacing="tight">
                <TextField
                  label="Fecha de nacimiento (DD-MM-YYYY)"
                  value={state.dob}
                  onChange={(value) => setState((p) => ({ ...p, dob: value }))}
                  disabled={!!state.existingDob}
                />
                
                <Button 
                  kind="secondary" 
                  onPress={handleSaveDob} 
                  disabled={!!state.existingDob || state.dobSaving}
                >
                  {state.existingDob ? "✅ Guardada" : state.dobSaving ? "Guardando…" : "🎁 Guardar"}
                </Button>
              </BlockStack>
            )}

            {/* Mensajes de estado para DOB */}
            {state.dobMsg && (
              <Text appearance="critical">{state.dobMsg}</Text>
            )}
          </BlockStack>

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
