(function () {
  'use strict';

  // Selector del contenedor del widget en el bloque Liquid
  const SEL = '#trusty-divain-club';

  // Supabase project ref (ajústalo si cambia)
  const PROJECT_REF = 'tizzlfjuosqfyefybdee';

  // Construye la URL de la Edge Function pública
  const fnUrl = (shop) =>
    `https://${PROJECT_REF}.functions.supabase.co/admin_rewards?shop_domain=${encodeURIComponent(shop || '')}`;

  // Llamada a la Edge Function (GET público)
  async function fetchAdminRewards(shop) {
    const url = fnUrl(shop);
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'omit',
    });
    if (!res.ok) throw new Error(`admin_rewards ${res.status}`);
    return await res.json();
  }

  // Helper para crear nodos HTML
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.keys(attrs).forEach((k) => {
      if (k === 'class') node.className = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    children.forEach((c) => {
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  // Render principal del widget
  function render(container, data, opts) {
    container.innerHTML = '';

    // 1) HERO
    const hero = el('section', { class: 'trusty-dc-hero' }, [
      el('h1', {}, [opts.title_override || (data && data.hero && data.hero.title) || 'DIVAIN Club']),
      el('p', {}, [(data && data.hero && data.hero.subtitle) || 'Gana puntos y canjéalos por descuentos y regalos.']),
    ]);

    // 2) Cómo funciona
    let how = null;
    if (opts.show_how !== false) {
      const steps =
        (data && data.how_it_works) || [
          { title: 'Compra', text: '1 punto por cada 1€ gastado' },
          { title: 'Suma', text: 'Tus puntos se acumulan 6 meses' },
          { title: 'Canjea', text: 'Convierte puntos en cupones de 5€ / 10€' },
        ];
      how = el('section', { class: 'trusty-dc-how' }, [
        el('h2', {}, ['Cómo funciona']),
        el(
          'div',
          { class: 'trusty-dc-steps' },
          steps.map((s) =>
            el('div', { class: 'trusty-dc-step' }, [
              el('h3', {}, [s.title || 'Paso']),
              el('p', {}, [s.text || '']),
            ]),
          ),
        ),
      ]);
    }

    // 3) Formas de ganar
    let earn = null;
    if (opts.show_earn !== false) {
      const earnRules =
        (data && data.earn) || [
          { title: 'Compra en la web', points: '+1 punto por €' },
          { title: 'Crear cuenta', points: '+10' },
          { title: 'Seguir en Instagram', points: '+5' },
          { title: 'Cumpleaños', points: '+15' },
        ];
      earn = el('section', { class: 'trusty-dc-earn' }, [
        el('h2', {}, ['Formas de ganar']),
        el(
          'ul',
          { class: 'trusty-dc-grid' },
          earnRules.map((r) =>
            el('li', { class: 'trusty-dc-card' }, [
              el('strong', {}, [r.title || 'Regla']),
              el('span', {}, [r.points || '']),
            ]),
          ),
        ),
      ]);
    }

    // 4) Formas de canjear
    let redeem = null;
    if (opts.show_redeem !== false) {
      const redeemRules =
        (data && data.redeem) || [
          { title: '100 pts → cupón 5€', text: 'Cupón de un solo uso' },
          { title: '200 pts → cupón 10€', text: 'Cupón de un solo uso' },
        ];
      redeem = el('section', { class: 'trusty-dc-redeem' }, [
        el('h2', {}, ['Formas de canjear']),
        el(
          'ul',
          { class: 'trusty-dc-grid' },
          redeemRules.map((r) =>
            el('li', { class: 'trusty-dc-card' }, [
              el('strong', {}, [r.title || 'Canje']),
              el('span', {}, [r.text || '']),
            ]),
          ),
        ),
      ]);
    }

    // Añadir secciones al contenedor
    [hero, how, earn, redeem].filter(Boolean).forEach((sec) => container.appendChild(sec));
  }

  // Boot del widget
  async function boot() {
    const root = document.querySelector(SEL);
    if (!root) return;

    const shop = root.getAttribute('data-shop') || '';
    const ds = root.dataset || {};
    // dataset: data-title-override -> titleOverride, data-show-how -> showHow, etc.
    const opts = {
      title_override: ds.titleOverride || '',
      show_how: ds.showHow !== 'false',
      show_earn: ds.showEarn !== 'false',
      show_redeem: ds.showRedeem !== 'false',
    };

    try {
      const data = await fetchAdminRewards(shop);
      render(root, data, opts);
    } catch (err) {
      console.error('Trusty Divain Club error:', err);
      root.innerHTML =
        '<div class="trusty-dc-error">No se pudo cargar el DIVAIN Club. Inténtalo más tarde.</div>';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
