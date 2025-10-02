// trusty-dc-core.js
(function () {
  'use strict';

  // ----- espacio global (único) -----
  const DC = (window.TrustyDC = window.TrustyDC || {});
  DC.blocks = DC.blocks || {};          // aquí se registran los bloques
  DC.utils = DC.utils || {};
  DC.__LOG_PREFIX__ = '[DivainClub]';

  // ----- utils visibles para los bloques -----
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.keys(attrs || {}).forEach((k) => {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'style' && typeof attrs[k] === 'object') Object.assign(node.style, attrs[k]);
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach((c) =>
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)
    );
    return node;
  }
  function heroImg(url) {
    const wrap = el('div', { class: 'trusty-dc-hero-img' });
    if (url) {
      wrap.style.background = `url("${url}") center / cover no-repeat`;
      const img = el('img', {
        src: url,
        alt: '',
        class: 'trusty-dc-hero-img-el',
        loading: 'lazy',
        decoding: 'async',
      });
      wrap.appendChild(img);
    }
    return wrap;
  }
  DC.utils.el = el;
  DC.utils.heroImg = heroImg;

  // ----- fetch a Supabase (igual que antes) -----
  const PROJECT_REF = 'tizzlfjuosqfyefybdee';
  const KEEP = '__KEEP_DB__';
  const SEL = '#trusty-divain-club';

  function fnUrl(shop) {
    return `https://${PROJECT_REF}.functions.supabase.co/admin_rewards?shop_domain=${encodeURIComponent(
      shop || ''
    )}`;
  }
  async function fetchAdminRewards(shop) {
    const res = await fetch(fnUrl(shop), { method: 'GET', headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`admin_rewards ${res.status}`);
    return await res.json();
  }

  // ----- orquestador -----
  async function boot() {
    const root = document.querySelector(SEL);
    if (!root) {
      console.warn(DC.__LOG_PREFIX__, 'No se encontró el contenedor', SEL);
      return;
    }

    // Quita “cargando…”
    root.innerHTML = '';

    const ds = root.dataset || {};
    const shop = root.getAttribute('data-shop') || '';

    const opts = {
      title_override: ds.titleOverride || KEEP,
      subtitle_override: ds.subtitleOverride || KEEP,
      show_how: ds.showHow !== 'false',
      show_earn: ds.showEarn !== 'false',
      show_redeem: ds.showRedeem !== 'false',
      show_tiers: ds.showTiers !== 'false',
      cta1_label: ds.cta1Label || 'ÚNETE AL CLUB',
      cta1_link: ds.cta1Link || '/account/register',
      cta2_label: ds.cta2Label || 'INICIAR SESIÓN',
      cta2_link: ds.cta2Link || '/account/login',
      fb_url: ds.fbUrl || root.getAttribute('data-fb-url') || '',
      ig_url: ds.igUrl || root.getAttribute('data-ig-url') || '',
      tk_url: ds.tkUrl || root.getAttribute('data-tk-url') || '',
    };

    let data = null;
    try {
      data = await fetchAdminRewards(shop);
    } catch (err) {
      console.error(DC.__LOG_PREFIX__, 'Error cargando admin_rewards:', err);
      const fallback = el('div', { class: 'trusty-dc-error' }, [
        'No se pudo cargar el DIVAIN Club (contenido). ',
        'Actualiza la página o inténtalo más tarde.',
      ]);
      root.appendChild(fallback);
      // seguimos para que al menos el hero/how estático se pinte si los bloques no dependen de data
      data = {};
    }

    // Color de acento
    const accent = data?.theme?.accent_color || '#111111';
    root.style.setProperty('--c-accent', accent);

    // Orden de bloques
    const order = [
      'hero',                 // trusty-dc.block-hero.js
      'how',                  // trusty-dc.block-how.js
      'earn',                 // trusty-dc.block-earn.js
      'redeem',               // trusty-dc.block-redeem.js
      'tiers',                // trusty-dc.block-tiers.js
    ];

    // Renderiza cada bloque si existe
    for (const key of order) {
      const fn = DC.blocks[key];
      if (typeof fn !== 'function') {
        console.warn(DC.__LOG_PREFIX__, `Bloque "${key}" no encontrado (¿falta el asset JS del bloque?).`);
        continue;
      }
      try {
        const sec = fn(data, opts, DC.utils);
        if (sec) root.appendChild(sec);
      } catch (e) {
        console.error(DC.__LOG_PREFIX__, `Bloque "${key}" lanzó un error:`, e);
        const errBox = el('div', { class: 'trusty-dc-error' }, [
          `No se pudo cargar el bloque "${key}".`,
        ]);
        root.appendChild(errBox);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
