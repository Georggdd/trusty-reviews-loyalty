/* trusty-dc.block-hero.js */
(function () {
  'use strict';

  // Namespace + compat con el core
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

  // heroImg: usa el del core si existe; si no, fallback local
  const heroImg =
    (DC.utils && DC.utils.heroImg) ||
    function _heroImg(url) {
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
    };

  function renderHero(data, opts) {
    const KEEP = '__KEEP_DB__';
    const rawTitle = (opts.title_override || '').trim();
    const rawSubtitle = (opts.subtitle_override || '').trim();
    const titleOverride = rawTitle === KEEP ? '' : rawTitle;
    const subtitleOverride = rawSubtitle === KEEP ? '' : rawSubtitle;

    const title = titleOverride || (data && data.hero && data.hero.title) || 'DIVAIN Club';
    const subtitle = subtitleOverride || (data && data.hero && data.hero.subtitle) || '';

    const leftUrl = (data && data.theme && data.theme.hero_left_url) || '';
    const rightUrl = (data && data.theme && data.theme.hero_right_url) || '';

    const left = el('div', { class: 'trusty-dc-hero-col' }, [heroImg(leftUrl)]);
    const centerBox = el('div', { class: 'trusty-dc-hero-box' }, [
      el('h2', { class: 'trusty-dc-hero-title' }, [title]),
      subtitle ? el('p', { class: 'trusty-dc-hero-subtitle' }, [subtitle]) : null,
      el('div', { class: 'trusty-dc-hero-ctas' }, [
        opts.cta1_label && opts.cta1_link
          ? el('a', { class: 'trusty-dc-btn trusty-dc-btn--primary', href: opts.cta1_link }, [
              opts.cta1_label,
            ])
          : null,
        opts.cta2_label && opts.cta2_link
          ? el('a', { class: 'trusty-dc-btn trusty-dc-btn--ghost', href: opts.cta2_link }, [
              opts.cta2_label,
            ])
          : null,
      ].filter(Boolean)),
    ]);
    const center = el('div', { class: 'trusty-dc-hero-center' }, [centerBox]);
    const right = el('div', { class: 'trusty-dc-hero-col' }, [heroImg(rightUrl)]);

    return el('section', { class: 'trusty-dc-hero' }, [left, center, right]);
  }

  // 👉 Registro del bloque como espera el core
  DC.blocks.hero = function (data, opts) {
    return renderHero(data, opts);
  };
})();
