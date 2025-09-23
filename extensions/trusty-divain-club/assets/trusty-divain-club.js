(function () {
    'use strict';
  
    // Selección del contenedor del widget
    const sel = '#trusty-divain-club';
  
    // Tu proyecto Supabase
    const PROJECT_REF = 'tizzlfjuosqfyefybdee';
    const fnUrl = (shop) =>
      `https://${PROJECT_REF}.functions.supabase.co/admin_rewards?shop_domain=${encodeURIComponent(shop || '')}`;
  
    // Fetch a la Edge Function pública
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
  
    // Helper para crear nodos
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
  
    // Render principal
    function render(container, data, opts) {
      container.innerHTML = '';
  
      // 1) HERO
      const hero = el('section', { class: 'trusty-dc-hero' }, [
        el('h1', {}, [opts.title_override || (data?.hero?.title || 'DIVAIN Club')]),
        el('p', {}, [data?.hero?.subtitle || 'Gana puntos y canjéalos por descuentos y regalos.']),
      ]);
  
      // 2) Cómo funciona
      let how = null;
      if (opts.show_how !== false) {
        const steps = data?.how_it_works || [
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
  
      // 3) Formas de ganar  (TU FRAGMENTO, corregido y encajado)
      let earn = null;
      if (opts.show_earn !== false) {
        const earnRules = data?.earn || [
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
  
      // 4) Formas de canjear (TU FRAGMENTO, corregido y encajado)
      let redeem = null;
      if (opts.show_redeem !== false) {
        const redeemRules = data?.redeem || [
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
  
      // Append secciones
      [hero, how, earn, redeem].filter(Boolean).forEach((sec) => container.appendChild(sec));
    }
  
    // Arranque
    async function boot() {
      const root = document.querySelector(sel);
      if (!root) return;
      const shop = root.getAttribute('data-shop') || '';
      const settings = root.closest('[data-section-id]')?.dataset || {};
  
      try {
        const data = await fetchAdminRewards(shop);
        render(root, data, {
          title_override: settings.title_override,
          show_how: settings.show_how !== 'false',
          show_earn: settings.show_earn !== 'false',
          show_redeem: settings.show_redeem !== 'false',
        });
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
  