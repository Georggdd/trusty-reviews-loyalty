/* trusty-dc.block-how.js */
(function () {
  'use strict';

  // =========================================================
  // Namespace + compat con el core
  // =========================================================
  const DC = (window.TrustyDC = window.TrustyDC || {});
  DC.blocks = DC.blocks || {};
  DC.utils = DC.utils || {};

  // el() con fallback si el core aún no cargó
  const el =
    (DC.utils && DC.utils.el) ||
    function _el(tag, attrs = {}, children = []) {
      const n = document.createElement(tag);
      if (attrs && typeof attrs === 'object') {
        Object.keys(attrs).forEach((k) => {
          if (k === 'class') n.className = attrs[k];
          else if (k === 'style' && attrs[k] && typeof attrs[k] === 'object')
            Object.assign(n.style, attrs[k]);
          else n.setAttribute(k, attrs[k]);
        });
      }
      (children || []).forEach((c) =>
        n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)
      );
      return n;
    };

  // =========================================================
  // 1) Render bloque "¿Cómo funciona?"
  // =========================================================
  function renderHow(data) {
    let steps = Array.isArray(data && data.how_it_works) ? data.how_it_works : null;
    if (!steps || !steps.length) {
      steps = [
        { title: 'Regístrate', text: 'Unirte a divain.Club es totalmente gratuito. Además, ¡obtienes 10 divipuntos solo por registrarte!' },
        { title: 'Gana puntos', text: 'Recibe divipuntos con cada compra, siguiéndonos en redes y más acciones.' },
        { title: 'Disfruta', text: 'Canjea tus divipuntos mediante cupones descuento acumulables.' },
      ];
    }
    steps = steps.slice(0, 3);

    return el('section', { class: 'trusty-dc-how' }, [
      el('h2', {}, ['¿Cómo funciona?']),
      el('div', { class: 'trusty-dc-steps' },
        steps.map((s, i) => {
          const num = String(i + 1).padStart(2, '0');
          return el('div', { class: 'trusty-dc-step' }, [
            el('div', { class: 'trusty-dc-num' }, [num]),
            el('h3', {}, [(s && s.title) || 'Paso']),
            el('p', {}, [(s && s.text) || '']),
          ]);
        })
      ),
    ]);
  }

  // 👉 Registro del bloque como espera el core
  DC.blocks.how = function (data, opts) {
    return renderHow(data, opts);
  };

  // =========================================================
  // 2) Cumpleaños – caja 2 (invitado → recoger → hecho) y caja 1 (tras login)
  // =========================================================
  const ROOT_SEL = '#trusty-divain-club';
  const GRID_SEL = '.trusty-dc-earn-yotpo-grid';
  const SUPABASE_EDGE = 'https://tizzlfjuosqfyefybdee.supabase.co/functions/v1';

  // -------- Helpers DOM / estado --------
  function waitForElement(selector, { root = document, timeout = 12000 } = {}) {
    return new Promise((resolve, reject) => {
      const found = root.querySelector(selector);
      if (found) return resolve(found);
      const obs = new MutationObserver(() => {
        const elx = root.querySelector(selector);
        if (elx) { obs.disconnect(); resolve(elx); }
      });
      obs.observe(root === document ? document.documentElement : root, { childList: true, subtree: true });
      if (timeout) setTimeout(() => { obs.disconnect(); reject(new Error('waitForElement timeout')); }, timeout);
    });
  }
  function isLoggedIn() {
    try {
      if (document.cookie.indexOf('customer_signed_in=yes') !== -1) return true;
      if (window.Shopify && window.Shopify.customer) return true;
      if (window.__st && window.__st.cid) return true;
    } catch {}
    return false;
  }
  function getNumericCustomerId(root) {
    const id = (root && root.dataset && root.dataset.customerId) || '';
    return /^\d+$/.test(id) ? id : null;
  }

  // -------- Iconos (SVG con currentColor) --------
  function personIconSVG(size = 56) {
    const wrap = document.createElement('span');
    wrap.innerHTML =
      `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"
            fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="7.5" r="3.5"></circle>
          <path d="M4 20c0-4 4-6 8-6s8 2 8 6"></path>
       </svg>`;
    return wrap.firstChild;
  }
  function cakeIconSVG(size = 56) {
    const wrap = document.createElement('span');
    wrap.innerHTML =
      `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"
            fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3c-.8 0-1.5.7-1.5 1.5S12 7 12 7s1.5-1.7 1.5-2.5S12.8 3 12 3z"></path>
        <path d="M4 11h16v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7z"></path>
        <path d="M4 11c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2"></path>
      </svg>`;
    return wrap.firstChild;
  }
  function dollarIconSVG(size = 56) {
    const wrap = document.createElement('span');
    wrap.innerHTML =
      `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"
            fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9"></circle>
        <path d="M8.5 14.5c.6 1.1 2 1.8 3.5 1.8 2 0 3.6-1.2 3.6-2.8s-1-2.2-3-2.6l-1.2-.2c-1.7-.3-2.6-1-2.6-2.3 0-1.6 1.6-2.8 3.6-2.8 1.5 0 2.9.6 3.5 1.7M12 4v16"></path>
      </svg>`;
    return wrap.firstChild;
  }

  // -------- Llamadas a Supabase Edge --------
  async function getCustomerToken(shopDomain, numericCustomerId) {
    const url = new URL(SUPABASE_EDGE + '/sign_loyalty_link');
    url.searchParams.set('shop_domain', shopDomain);
    url.searchParams.set('shopify_customer_id', numericCustomerId);
    const res = await fetch(url.toString(), { method: 'GET' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j || !j.ok || !j.token) throw new Error((j && j.error) || 'No se pudo autorizar la operación.');
    return j.token;
  }
  async function saveDOBWithToken(token, shopDomain, isoDate) {
    const body = new URLSearchParams({ token, date_of_birth: isoDate, shop_domain: shopDomain }).toString();
    const res = await fetch(SUPABASE_EDGE + '/set_date_of_birth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const j = await res.json().catch(() => ({}));
    if (res.status === 409 || String((j && j.error) || '').toLowerCase().includes('already')) {
      return { ok: false, duplicated: true };
    }
    if (!res.ok || (j && j.ok) === false) {
      return { ok: false, duplicated: false, error: (j && j.error) || 'HTTP ' + res.status };
    }
    return { ok: true };
  }

  // -------- Render CAJA 1 (tras login) --------
  function renderWelcomeFirstCard(first) {
    first.innerHTML = '';
    first.classList.add('tdey-card', 'trusty-dc-card', 'tdey-card--welcome');

    const iconWrap = el('div', { class: 'tdey-icon' }, []);
    iconWrap.appendChild(personIconSVG(56));
    first.appendChild(iconWrap);

    const title = el('div', { class: 'tdey-title' }, ['¡Has ganado 10 puntos por crearte la cuenta!']);
    first.appendChild(title);
  }

  // -------- Render CAJA 2 (guest) --------
  function renderGuestCard(second, { joinLink, loginLink }) {
    second.innerHTML = '';
    second.classList.add('tdey-card', 'tdey-bday', 'trusty-dc-card');

    const icon = el('div', { class: 'tdey-icon' }, []);
    icon.appendChild(cakeIconSVG(56));

    const title = el('div', { class: 'tdey-title' }, ['15 divipoints']);
    const sub   = el('div', { class: 'tdey-desc'  }, ['¡Celebremos tu cumpleaños juntos!']);

    const overlay = el('div', { class: 'tdey-bday-hover' }, [
      el('a', { href: joinLink, class: 'trusty-dc-btn trusty-dc-btn--primary tdey-bday-join' }, ['ÚNETE AL CLUB']),
      el('div', { class: 'tdey-bday-auth' }, [
        '¿Ya tienes una cuenta? ',
        el('a', { href: loginLink, class: 'tdey-bday-login' }, ['Inicia sesión']),
      ]),
    ]);

    second.appendChild(icon);
    second.appendChild(title);
    second.appendChild(sub);
    second.appendChild(overlay);
  }

  function renderCollectCard(second, onSubmit) {
    second.innerHTML = '';
    second.classList.add('tdey-card', 'tdey-bday', 'tdey-bday--collect');

    const iconWrap = el('div', { class: 'tdey-bday-icon', 'aria-hidden': 'true' }, []);
    try { iconWrap.appendChild(cakeIconSVG(56)); } catch { iconWrap.textContent = '🎂'; }

    const input = el('input', {
      type: 'text', inputmode: 'numeric', autocomplete: 'bday',
      placeholder: 'DD / MM / AAAA', 'aria-label': 'Fecha de nacimiento',
      class: 'tdey-date-input',
    });
    input.addEventListener('input', () => {
      const sel = input.selectionStart || 0;
      const before = input.value;
      const d = (before || '').replace(/\D/g, '').slice(0, 8);
      const a = d.slice(0, 2), b = d.slice(2, 4), c = d.slice(4, 8);
      let out = ''; if (a) out = a; if (b) out += ' / ' + b; if (c) out += ' / ' + c;
      input.value = out;
      if (document.activeElement === input) {
        const diff = input.value.length - before.length;
        input.setSelectionRange(sel + diff, sel + diff);
      }
    });

    const btn = el('button', { type: 'button', class: 'tdey-bday-cta', 'aria-label': 'Enviar fecha de cumpleaños' }, ['→']);
    const row = el('div', { class: 'tdey-row' }, [input, btn]);
    const helper = el('div', { class: 'tdey-collect-help' }, ['Te regalamos 15 divipoints en tu cumpleaños. Indica tu fecha de nacimiento:']);
    const msg = el('div', { class: 'tdey-msg', role: 'status' }, []);

    async function handler() {
      const raw = (input.value || '').trim();
      const m = raw.match(/^(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})$/);
      if (!m) { msg.textContent = 'Introduce una fecha válida (DD/MM/AAAA)'; return; }
      const p1 = parseInt(m[1], 10), p2 = parseInt(m[2], 10), yyyy = parseInt(m[3], 10);
      let dd, mm; if (p1 > 12) { dd = p1; mm = p2; } else { mm = p1; dd = p2; }
      const dt = new Date(Date.UTC(yyyy, (mm || 0) - 1, dd || 0));
      const valid = dt.getUTCFullYear() === yyyy && dt.getUTCMonth() + 1 === mm && dt.getUTCDate() === dd;
      if (!valid) { msg.textContent = 'Introduce una fecha válida (DD/MM/AAAA)'; return; }
      const iso = `${yyyy.toString().padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
      await onSubmit({ iso, disable: (v) => { input.disabled = v; btn.disabled = v; }, msg });
    }
    btn.addEventListener('click', handler);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') handler(); });

    second.appendChild(iconWrap);
    second.appendChild(row);
    second.appendChild(helper);
    second.appendChild(msg);
  }

  function renderDoneCard(second) {
    second.innerHTML = '';
    second.classList.add('tdey-card', 'tdey-bday', 'tdey-bday--done', 'trusty-dc-card');
    const icon = el('div', { class: 'tdey-icon' }, []);
    icon.appendChild(cakeIconSVG(56));
    const done = el('div', { class: 'tdey-done' }, ['¡Completado! Tenemos ganas de celebrar contigo este día especial :)']);
    second.appendChild(icon);
    second.appendChild(done);
  }

  // =========================================================
  // 3) ★★★ CAJA 3 – Earn (“1 € = 1 divipoint”) ★★★
  // =========================================================
  function renderEarnCard3Logged(third) {
    third.innerHTML = '';
    third.classList.add('tdey-card', 'trusty-dc-card', 'tdey-earn3', 'tdey-earn3--logged');

    const body = el('div', { class: 'tdey-earn3-body' }, []);
    const icon = el('div', { class: 'tdey-earn3-icon', 'aria-hidden': 'true' }, []);
    try { icon.appendChild(dollarIconSVG(56)); } catch { icon.textContent = '$'; }

    const title = el('div', { class: 'tdey-earn3-title' }, ['1 € gastado = 1 divipoint']);
    const sub   = el('div', { class: 'tdey-earn3-sub'   }, ['¡Con cada compra ganas divipoints!']);

    body.appendChild(icon);
    body.appendChild(title);
    body.appendChild(sub);

    const hover = el('div', { class: 'tdey-earn3-hover', role: 'note' }, [
      el('div', { class: 'tdey-earn3-msg' }, ['Gana 1 divipoint por cada euro gastado'])
    ]);

    third.appendChild(body);
    third.appendChild(hover);
  }

  // Observador para blindar el estado
  function armEarn3Observer(third) {
    if (third.__earn3Observer) return;
    const obs = new MutationObserver(() => {
      if (!third.classList.contains('tdey-earn3--logged')) {
        renderEarnCard3Logged(third);
      }
    });
    obs.observe(third, { childList: true, subtree: true });
    third.__earn3Observer = obs;
  }

  /* =========================================================
   4) ★★★ CAJAS 4–6 (Social): Facebook, Instagram, TikTok ★★★
   ========================================================= */

  // --- helpers ---
  async function awardSocialPoints({ shop, numericId, network }) {
    const token = await getCustomerToken(shop, numericId);
    const body = new URLSearchParams({
      token,
      shop_domain: shop,
      network,           // 'facebook' | 'instagram' | 'tiktok'
      points: '5'
    }).toString();

    const res = await fetch(SUPABASE_EDGE + '/earn_social', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });

    const j = await res.json().catch(() => ({}));
    if (!res.ok || (j && j.ok) === false) {
      throw new Error((j && j.error) || 'No se pudieron otorgar los puntos');
    }
    return true;
  }

  function removeVisitButton(card) {
    // Quitar SOLO el botón "Visitar" de la tarjeta,
    // sin tocar overlays de invitado (ÚNETE AL CLUB / Inicia sesión)
    const candidates = Array.from(
      card.querySelectorAll('a, button')
    ).filter((el) => {
      const txt = (el.textContent || '').trim().toLowerCase();
      const insideGuestOverlay =
        el.closest('.dc-hover') || el.closest('.tdey-bday-hover');
      const isJoinBtn = el.classList.contains('tdey-bday-join');
      // Es "Visitar", NO está en overlays de invitado y NO es el botón de "ÚNETE AL CLUB"
      return /visitar/.test(txt) && !insideGuestOverlay && !isJoinBtn;
    });
  
    candidates.forEach((el) => el.remove());
  }
  

  function markSocialDone(card) {
    card.classList.add('tdey-social', 'tdey-social--done');
    if (!card.querySelector('.tdey-social-done')) {
      const done = el('div', { class: 'tdey-social-done', role: 'status' }, ['¡Completado!']);
      card.appendChild(done);
    }
  }

  function wireSocialCard(card, { labelSelector = '.tdey-desc', url, network, logged, shop, numericId }) {
    if (!card) return;
  
    // Quitar SIEMPRE el botón "Visitar" (sin tocar overlays de invitado)
    removeVisitButton(card);
  
    // Invitado → dejar todo tal cual (overlay de “ÚNETE…” incluido)
    if (!logged) return;
  
    // >>> Estado logeado: desactivar overlays de invitado en esta tarjeta
    card.classList.add('tdey-social', 'tdey-social--logged');
  
    // Solo la palabra Facebook/Instagram/TikTok es el enlace
    const labelEl = card.querySelector(labelSelector) || card;
    const full = (labelEl.textContent || '').trim();
  
    const properMap = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok' };
    const proper = properMap[network] || network;
    const rx = new RegExp(`\\b${proper}\\b`, 'i');
    const prefix = rx.test(full) ? full.replace(rx, '').trim() : full;
  
    labelEl.innerHTML = '';
    if (prefix) labelEl.appendChild(document.createTextNode(prefix + ' '));
  
    const a = el('a', {
      href: url,
      target: '_blank',
      rel: 'noopener',
      class: 'tdey-social-link',
      'data-network': network
    }, [proper]);
  
    labelEl.appendChild(a);
  
    // Si ya estaba completado antes, activar overlay de “¡Completado!” en hover
    const k = `dc_social_done_${network}`;
    if (localStorage.getItem(k) === '1') {
      markSocialDone(card); // añade tdey-social--done
    }
  
    // Click: la PRIMERA vez otorga +5; siempre abre la red
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        if (!localStorage.getItem(k)) {
          await awardSocialPoints({ shop, numericId, network });
          localStorage.setItem(k, '1');
          markSocialDone(card); // ahora el hover mostrará “¡Completado!”
        }
      } catch (err) {
        console.warn('earn_social failed:', err);
      } finally {
        window.open(url, '_blank', 'noopener');
      }
    });
  }
  
  // --- orquestación de 4–6 ---
  function enhanceSocialCards(root, grid, { logged, shop, numericId }) {
    const cards = grid.querySelectorAll('.tdey-card');
    if (cards.length < 6) return;

    const facebook = (root.dataset && root.dataset.fbUrl) || root.getAttribute('data-fb-url') || 'https://facebook.com';
    const instagram = (root.dataset && root.dataset.igUrl) || root.getAttribute('data-ig-url') || 'https://instagram.com';
    const tiktok = (root.dataset && root.dataset.tkUrl) || root.getAttribute('data-tk-url') || 'https://tiktok.com';

    // Cajas 4, 5, 6 → índices 3, 4, 5
    wireSocialCard(cards[3], { url: facebook,  network: 'facebook',  logged, shop, numericId });
    wireSocialCard(cards[4], { url: instagram, network: 'instagram', logged, shop, numericId });
    wireSocialCard(cards[5], { url: tiktok,    network: 'tiktok',    logged, shop, numericId });
  }

  // -------- Orquestación del grid -------- 
  function buildUI(root, grid) {
    const cards = grid.querySelectorAll('.tdey-card');
    if (!cards.length) return;

    const first  = cards[0];
    const second = cards[1] || null;
    const third  = cards[2] || null; // ← CAJA 3

    const shop = root.getAttribute('data-shop') || '';
    const joinLink  = root.dataset.cta1Link || '/account/register';
    const loginLink = root.dataset.cta2Link || '/account/login';

    const numericId = getNumericCustomerId(root);
    const logged = isLoggedIn();

    // CAJA 1 overlay “Completado”
    if (logged && first) {
      first.classList.add('tdey-welcome');
      if (!first.querySelector('.tdey-welcome-hover')) {
        const overlay = el('div', { class: 'tdey-welcome-hover', role: 'status' }, [
          el('div', { class: 'tdey-welcome-msg' }, ['¡Completado! Has recibido 10 divipoints por crearte la cuenta!'])
        ]);
        first.appendChild(overlay);
      }
    }

    // CAJA 2
    if (second) {
      if (!logged) {
        renderGuestCard(second, { joinLink, loginLink });
      } else {
        renderCollectCard(second, async ({ iso, disable, msg }) => {
          try {
            disable(true);
            msg.textContent = 'Guardando…';
            if (!numericId) { msg.textContent = 'Inicia sesión para guardar tu fecha.'; disable(false); return; }
            const token = await getCustomerToken(shop, numericId);
            const r = await saveDOBWithToken(token, shop, iso);
            if (r.ok || r.duplicated) renderDoneCard(second);
            else { msg.textContent = 'No se pudo guardar. Inténtalo de nuevo.'; disable(false); }
          } catch (e) { msg.textContent = 'La autorización ha fallado.'; disable(false); }
        });
      }
    }

    // ★ CAJA 3 – sólo actuamos si está logado
    if (third && logged) {
      renderEarnCard3Logged(third);
      armEarn3Observer(third);
    }
    // Si no está logado, NO tocamos la tarjeta 3.

    // ★★★ CAJAS 4–6 (social)
    enhanceSocialCards(root, grid, { logged, shop, numericId });
  }

  async function bootExtras() {
    const root = document.querySelector(ROOT_SEL);
    if (!root) return;
    try {
      const grid = await waitForElement(GRID_SEL, { root: document, timeout: 12000 });
      buildUI(root, grid);
    } catch { /* silencio */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootExtras);
  } else {
    bootExtras();
  }
})();
