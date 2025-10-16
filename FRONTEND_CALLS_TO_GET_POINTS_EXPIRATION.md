# 📡 Frontend Calls to get_points_expiration

Este documento muestra **exactamente cómo el frontend está llamando a la función** para que puedas arreglarla en el backend.

---

## 📍 UBICACIÓN 1: Extension de Orders

**Archivo:** `extensions/trusty-loyalty/src/OrderStatusBlock.tsx`

### 1️⃣ Declaración del State (Líneas 120-123)

```typescript
// Points expiration
expiringSoon: Array<{ expiration_date: string; points: number }> | null;
totalExpiringSoon: number | null;
loadingExpiration: boolean;
```

### 2️⃣ Inicialización del State (Líneas 150-153)

```typescript
// Points expiration
expiringSoon: null,
totalExpiringSoon: null,
loadingExpiration: false,
```

### 3️⃣ Función que Llama a la API (Líneas 295-338)

```typescript
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
```

**🔑 IMPORTANTE:**
- **URL:** `https://tizzlfjuosqfyefybdee.supabase.co/functions/v1/get_points_expiration`
- **Método:** `POST`
- **Content-Type:** `application/json`
- **Body:**
  ```json
  {
    "customer_id": "8465890336131",
    "shop_domain": "divainusa.myshopify.com"
  }
  ```

**📤 Response Esperado:**
```json
{
  "ok": true,
  "expiring_soon": [
    {
      "expiration_date": "2025-04-15",
      "points": 50
    }
  ],
  "total_expiring_soon": 50
}
```

### 4️⃣ Llamada #1: Al Cargar el Componente (Línea 465)

```typescript
await Promise.all([
  fetchBalance(usedGid, detectedShopDomain),
  fetchExistingDob(usedGid, detectedShopDomain),
  fetchPointsExpiration(usedGid, detectedShopDomain)  // ⬅️ AQUÍ SE LLAMA
]);
```

**Contexto:** Se ejecuta cuando el usuario entra a `/orders`

### 5️⃣ Llamada #2: Después de Canjear Puntos (Línea 623)

```typescript
if (state.shopDomain) {
  await Promise.all([
    fetchBalance(usedGidLocal, state.shopDomain),
    fetchPointsExpiration(usedGidLocal, state.shopDomain)  // ⬅️ AQUÍ SE LLAMA
  ]);
}
```

**Contexto:** Se ejecuta después de que el usuario canjea 100 o 200 puntos

### 6️⃣ UI que Muestra los Datos (Líneas 746-767)

```tsx
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
```

**Lo que el usuario ve:**
```
⏰ Points Expiration
50 points expiring on 15/04/2025
30 points expiring on 20/04/2025
```

---

## 📍 UBICACIÓN 2: Extension de Checkout

**Archivo:** `extensions/trusty-loyalty-checkout/src/loyalty/LoyaltyWidgetCheckout.tsx`

### 1️⃣ Declaración del State (Líneas 105-108)

```typescript
// Points expiration
expiringSoon: null as Array<{ expiration_date: string; points: number }> | null,
totalExpiringSoon: null as number | null,
loadingExpiration: false as boolean,
```

### 2️⃣ Función que Llama a la API (Líneas 133-170)

```typescript
async function fetchPointsExpiration(mail: string) {
  try {
    setState((prev) => ({ ...prev, loadingExpiration: true }));
    
    const url = new URL("https://tizzlfjuosqfyefybdee.supabase.co/functions/v1/get_points_expiration");
    const body = JSON.stringify({
      email: mail,
      shop_domain: shopDomain
    });
    
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
    } else {
      setState((prev) => ({ ...prev, loadingExpiration: false }));
    }
  } catch (err) {
    console.warn('fetchPointsExpiration error:', err);
    setState((prev) => ({ ...prev, loadingExpiration: false }));
  }
}
```

**🔑 IMPORTANTE:**
- **URL:** `https://tizzlfjuosqfyefybdee.supabase.co/functions/v1/get_points_expiration`
- **Método:** `POST`
- **Content-Type:** `application/json`
- **Body:**
  ```json
  {
    "email": "customer@example.com",
    "shop_domain": "divainusa.myshopify.com"
  }
  ```

**⚠️ DIFERENCIA CON ORDERS:**
- Orders envía: `customer_id` (string numérico)
- Checkout envía: `email` (string)

**La función debe soportar AMBOS formatos.**

### 3️⃣ Llamada #1: Al Cargar el Componente (Línea 181)

```typescript
const balance = await fetchBalanceByEmail(email);
fetchPointsExpiration(email); // ⬅️ AQUÍ SE LLAMA (sin await, paralelo)
if (!cancelled) setState((s) => ({ ...s, loading: false, balance, error: null }));
```

**Contexto:** Se ejecuta cuando el checkout detecta el email del cliente

### 4️⃣ Llamada #2: Después de Canjear Puntos (Línea 278)

```typescript
const newBalance = await fetchBalanceByEmail(email);
fetchPointsExpiration(email); // ⬅️ AQUÍ SE LLAMA (sin await, paralelo)
setState((p) => ({ ...p, balance: newBalance }));
```

**Contexto:** Se ejecuta después de que el usuario canjea puntos en el checkout

### 5️⃣ UI que Muestra los Datos (Líneas 292-313)

```tsx
{/* Points Expiration Section */}
{!state.loadingExpiration && state.expiringSoon !== null && (
  <BlockStack spacing="tight">
    <Text size="small" emphasis="bold">⏰ {translate('pointsExpiring')}</Text>
    {state.expiringSoon.length > 0 ? (
      <BlockStack spacing="extraTight">
        {state.expiringSoon.map((exp, idx) => (
          <Text key={idx} size="small">
            {translate('expiringPoints', { 
              points: exp.points, 
              date: formatDateDDMMYYYY(exp.expiration_date) 
            })}
          </Text>
        ))}
      </BlockStack>
    ) : (
      <Text size="small">
        {translate('noPointsExpiring')}
      </Text>
    )}
  </BlockStack>
)}
```

---

## 📥 RESUMEN: Request Formats

### Desde Orders:
```http
POST https://tizzlfjuosqfyefybdee.supabase.co/functions/v1/get_points_expiration
Content-Type: application/json

{
  "customer_id": "8465890336131",
  "shop_domain": "divainusa.myshopify.com"
}
```

### Desde Checkout:
```http
POST https://tizzlfjuosqfyefybdee.supabase.co/functions/v1/get_points_expiration
Content-Type: application/json

{
  "email": "customer@example.com",
  "shop_domain": "divainusa.myshopify.com"
}
```

**⚠️ LA FUNCIÓN DEBE ACEPTAR AMBOS FORMATOS:**
- Si recibe `customer_id` → usarlo directamente
- Si recibe `email` + `shop_domain` → buscar el customer en la DB primero

---

## 📤 Response Esperado (AMBOS CASOS)

```json
{
  "ok": true,
  "customer_id": "8465890336131",
  "email": "customer@example.com",
  "current_balance": 150,
  "expiring_soon": [
    {
      "expiration_date": "2025-04-15",
      "points": 50,
      "earned_date": "2024-10-15",
      "entries_count": 2
    },
    {
      "expiration_date": "2025-04-20",
      "points": 30,
      "earned_date": "2024-10-20",
      "entries_count": 1
    }
  ],
  "all_expirations": [
    {
      "expiration_date": "2025-04-15",
      "points": 50,
      "earned_date": "2024-10-15",
      "entries_count": 2
    },
    {
      "expiration_date": "2025-04-20",
      "points": 30,
      "earned_date": "2024-10-20",
      "entries_count": 1
    },
    {
      "expiration_date": "2025-05-10",
      "points": 70,
      "earned_date": "2024-11-10",
      "entries_count": 3
    }
  ],
  "total_expiring_soon": 80
}
```

### Campos Requeridos por el Frontend:

**Mínimo:**
- `ok` (boolean)
- `expiring_soon` (array de objetos)
  - `expiration_date` (string, formato: "YYYY-MM-DD")
  - `points` (number)

**Opcional (no usado actualmente):**
- `total_expiring_soon` (number)
- `all_expirations` (array)
- `current_balance` (number)
- `customer_id` (string)
- `email` (string)

---

## 🔍 Cómo Detectar Errores en Producción

### Logs en Consola del Navegador:

**Cuando se hace la llamada:**
```
📡 Fetching points expiration with: { customer_id: "8465890336131", shop_domain: "divainusa.myshopify.com" }
```

**Si falla (status != 200):**
```
fetchPointsExpiration failed: 500
```

**Si tiene éxito:**
```
✅ Points expiration loaded: [{ expiration_date: "2025-04-15", points: 50 }]
```

### Network Tab (F12):

**Buscar:**
```
POST get_points_expiration
```

**Status actual:** 500 Internal Server Error ❌  
**Status esperado:** 200 OK ✅

---

## 🎯 Lo Que Necesita el Backend

### Lógica de Negocio:

1. **Recibir parámetros:**
   - `customer_id` (string) O
   - `email` (string) + `shop_domain` (string)

2. **Si recibe email:**
   - Buscar en tabla `customers` por `email` y `shop_domain`
   - Obtener el `customer_id`

3. **Obtener entradas del ledger:**
   - Tabla: `loyalty_ledger`
   - Filtro: `customer_id` = el del paso anterior
   - Filtro: `points > 0` (solo puntos positivos)
   - Ordenar por: `created_at` ascendente

4. **Calcular caducidad:**
   - Cada entrada caduca **6 meses** después de `created_at`
   - Agrupar por fecha de caducidad
   - Filtrar solo los que caducan en los **próximos 30 días**

5. **Devolver response:**
   ```json
   {
     "ok": true,
     "expiring_soon": [...],
     ...
   }
   ```

---

## ❌ Error Actual

```
Status: 500 Internal Server Error
```

**Posibles causas:**
- Sintaxis incorrecta en el código de la función
- Tabla `loyalty_ledger` no existe o no tiene las columnas esperadas
- Variable de entorno mal configurada
- Error de permisos en la base de datos

**Necesito que revises los logs de la función en Supabase para ver el error exacto.**

---

## 📋 Tablas Utilizadas

### `customers`
- `id` (primary key)
- `email`
- `shop_domain`

### `loyalty_ledger`
- `customer_id` (foreign key → customers.id)
- `points` (integer)
- `created_at` (timestamp)

---

## ✅ Checklist para Arreglar la Función

- [ ] La función acepta `customer_id` O (`email` + `shop_domain`)
- [ ] Si recibe `email`, busca el customer en la DB
- [ ] Consulta `loyalty_ledger` con `points > 0`
- [ ] Calcula caducidad (6 meses desde `created_at`)
- [ ] Filtra solo los que caducan en próximos 30 días
- [ ] Devuelve JSON con `ok: true` y `expiring_soon: [...]`
- [ ] Maneja errores y devuelve status codes correctos (400, 404, 500)
- [ ] Incluye CORS headers correctos

---

**Proyecto:** trusty-loyalty-reviews  
**Supabase Project ID:** tizzlfjuosqfyefybdee  
**URL:** https://tizzlfjuosqfyefybdee.supabase.co/functions/v1/get_points_expiration  
**Fecha:** 2025-10-15

