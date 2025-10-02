/* trusty-dc.block-earn.js */
(function () {
  'use strict';

  // Namespace + utils del core
  const DC = (window.TrustyDC = window.TrustyDC || {});
  DC.blocks = DC.blocks || {};
  DC.utils = DC.utils || {};
  const el = (DC.utils && DC.utils.el) || function _el(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    if (attrs && typeof attrs === 'object') {
      Object.keys(attrs).forEach((k) => {
        if (k === 'class') n.className = attrs[k];
        else if (k === 'style' && attrs[k] && typeof attrs[k] === 'object') Object.assign(n.style, attrs[k]);
        else n.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach((c) =>
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)
    );
    return n;
  };

  // Iconos inline simples
  function iconSvg(name, size = 64) {
    const common = `viewBox="0 0 24 24" width="${size}" height="${size}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" aria-hidden="true"`;
    const map = {
      user: `<svg ${common}><circle cx="12" cy="8" r="3.6"/><path d="M4 20a8 8 0 0 1 16 0"/></svg>`,
      cake: `<svg ${common}><path d="M12 3.5v3"/><path d="M11 3.5a1 1 0 0 0 2 0c0-.8-.7-1.5-1.5-1.5S11 2.7 11 3.5Z"/><rect x="4" y="10.5" width="16" height="8.5" rx="2"/><path d="M6 13c1.1 0 1.1 1 2.2 1s1.1-1 2.2-1 1.1 1 2.2 1 1.1-1 2.2-1 1.1 1 2.2 1"/></svg>`,
      coin: `<svg ${common}><circle cx="12" cy="12" r="9"/><path d="M14.5 8.5c-.5-1-1.6-1.5-2.8-1.5-1.5 0-2.7.8-2.7 2s1 1.8 2.3 2.1l1.9.4c1.3.3 2.3 1 2.3 2.2s-1.2 2.1-2.8 2.1c-1.3 0-2.5-.6-3-1.6"/><path d="M12 5v14"/></svg>`,
      share: `<svg ${common}><path d="M7 16c3-4.5 6.5-6.5 11-7"/><path d="M14 6l4 3-4 3"/></svg>`,
      instagram: `<svg ${common}><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="3.8"/><circle cx="17.25" cy="6.75" r="1.1" fill="currentColor" stroke="none"/></svg>`,
      tiktok: `<svg ${common}><path d="M9.5 7.5v8a3.5 3.5 0 1 1-2-3.2"/><path d="M14.5 4.5c.7 1.8 2.2 3 4 3.4"/></svg>`
    };
    const wrap = document.createElement('div');
    wrap.className = 'trusty-dc-icon';
    wrap.innerHTML = map[name] || '';
    return wrap;
  }

  function earnCardsFromData(data, opts) {
    return [
      { icon: 'user',      title: '10 divipoints',                 desc: 'Solo por crearte una cuenta ya ganas 10 divipoints' },
      { icon: 'cake',      title: '15 divipoints',                 desc: '¡Celebremos juntos el cumpleaños!' },
      { icon: 'coin',      title: '1 € gastado = 1 divipoint',     desc: '¡Con cada compra ganas divipoints!' },
      { icon: 'share',     title: '5 divipoints',                  desc: 'Compártenos en Facebook', href: (opts.fb_url || '#') },
      { icon: 'instagram', title: '5 divipoints',                  desc: 'Síguenos en Instagram',   href: (opts.ig_url || '#') },
      { icon: 'tiktok',    title: '5 divipoints',                  desc: 'Síguenos en TikTok',      href: (opts.tk_url || '#') },
    ];
  }

  function renderEarn(data, opts) {
    const cards = earnCardsFromData(data, opts || {});
    if (!cards.length) return null;

    const grid = el('div', { class: 'trusty-dc-earn-yotpo-grid', role: 'list' });

    cards.forEach((c) => {
      const icon  = iconSvg(c.icon);
      const title = el('div', { class: 'tdey-title' }, [c.title || '']);
      const desc  = el('div', { class: 'tdey-desc'  }, [c.desc  || '']);

      // Overlay con CTA genérica (registro / login)
      const overlay = el('div', { class: 'tdey-overlay' }, [
        el('a', {
          class: 'trusty-dc-btn trusty-dc-btn--primary tdey-cta',
          href: opts.cta1_link || '/account/register'
        }, [opts.cta1_label || 'Crea una cuenta']),
        el('div', { class: 'tdey-login' }, [
          document.createTextNode('¿Ya tienes una cuenta? '),
          el('a', { href: opts.cta2_link || '/account/login' }, ['Inicia sesión'])
        ])
      ]);

      // Botón visible para redes si hay href
      const socialBtn = c.href ? el('a', {
        class: 'tdey-social',
        href: c.href,
        target: '_blank',
        rel: 'noopener'
      }, ['Visitar']) : null;

      const children = [icon, title, desc];
      if (socialBtn) children.push(socialBtn);
      children.push(overlay);

      const card = el('article', { class: 'tdey-card', tabindex: '0', role: 'listitem' }, children);
      grid.appendChild(card);
    });

    return el('section', { class: 'trusty-dc-earn-yotpo' }, [
      el('h2', {}, ['¿Cómo ganar divipuntos?']),
      grid
    ]);
  }

  // 👉 Registro del bloque tal como espera el core
  DC.blocks.earn = function (data, opts) {
    return renderEarn(data, opts);
  };
})();
