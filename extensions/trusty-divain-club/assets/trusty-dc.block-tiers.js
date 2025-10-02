/* trusty-dc.block-tiers.js */
(function () {
  'use strict';

  // Namespace y compatibilidad con el core
  const DC = (window.TrustyDC = window.TrustyDC || {});
  DC.blocks = DC.blocks || {};
  DC.utils = DC.utils || {};

  // el() con fallback
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

  // Render del bloque "Tiers" (Notas olfativas en tu caso)
  function renderTiers(data) {
    const tiers =
      Array.isArray(data && data.tiers) && data.tiers.length
        ? data.tiers
        : [
            { name: 'Notas de salida', threshold: 0, perks: ['Cítricos', 'Ligero'] },
            { name: 'Notas de corazón', threshold: 150, perks: ['Florales', 'Dulces'] },
            { name: 'Notas de fondo', threshold: 300, perks: ['Amaderadas', 'Intensas'] },
          ];

    const grid = el(
      'div',
      { class: 'trusty-dc-grid trusty-dc-tiers' },
      tiers.map((t) =>
        el('div', { class: 'trusty-dc-card trusty-dc-tier' }, [
          el('div', { class: 'trusty-dc-tier-name' }, [t.name || 'Tier']),
          el('div', { class: 'trusty-dc-tier-threshold' }, [
            t.threshold != null ? `Spend ${t.threshold} € to level up` : '',
          ]),
          el(
            'ul',
            { class: 'trusty-dc-tier-perks' },
            (t.perks || []).map((p) => el('li', {}, [p]))
          ),
        ])
      )
    );

    return el('section', { class: 'trusty-dc-tiers-wrap' }, [
      el('h2', {}, ['Level up and get more rewards']),
      grid,
    ]);
  }

  // 👉 Registro con el core (API nueva)
  DC.blocks.tiers = function (data, opts) {
    return renderTiers(data, opts);
  };
})();
