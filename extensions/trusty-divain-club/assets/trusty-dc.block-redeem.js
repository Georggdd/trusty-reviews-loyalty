/* trusty-dc.block-redeem.js */
(function () {
  'use strict';

  // Namespace y utilidades
  const DC = (window.TrustyDC = window.TrustyDC || {});
  DC.blocks = DC.blocks || {};
  DC.utils = DC.utils || {};

  // el() con fallback por si el core aún no expuso utils
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

  // Render del bloque "¿Cómo canjear…?"
  function renderRedeem(data) {
    const redeemRules =
      Array.isArray(data && data.redeem) && data.redeem.length
        ? data.redeem
        : [
            { title: '100 pts → cupón 5€', text: 'Un solo uso y exclusivo del cliente' },
            { title: '200 pts → cupón 10€', text: 'Un solo uso y exclusivo del cliente' },
          ];

    const list = el(
      'ul',
      { class: 'trusty-dc-grid' },
      redeemRules.map((r) =>
        el('li', { class: 'trusty-dc-card' }, [
          el('strong', { class: 'tdec-strong' }, [r.title || '']),
          el('span', { class: 'tdec-sub' }, [r.text || '']),
        ])
      )
    );

    return el('section', { class: 'trusty-dc-redeem trusty-dc-surface' }, [
      el('div', { class: 'trusty-dc-redeem-intro' }, [
        el('h2', { class: 'trusty-dc-redeem-title' }, ['¿Cómo canjear db points?']),
        el('p', { class: 'trusty-dc-redeem-help' }, ['Elige tu cupón y úsalo en tu próximo pedido.']),
      ]),
      list,
    ]);
  }

  // 👉 Registrar con el core (API nueva)
  DC.blocks.redeem = function (data, opts) {
    return renderRedeem(data, opts);
  };
})();
