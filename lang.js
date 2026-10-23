/**
 * lang.js  — Radio Foxhunting LMS bilingual engine (EN / BM)
 * Injects a language toggle into .sitenav, applies data-bm attributes.
 * Sets window.rfLang = 'en' | 'bm' for activity scripts.
 */
(function () {
  'use strict';
  var lang = 'en';
  try { lang = localStorage.getItem('rf_lang') || 'en'; } catch (e) {}
  window.rfLang = lang;

  function applyLang(l) {
    window.rfLang = l;
    document.querySelectorAll('[data-bm]').forEach(function (el) {
      if (!el.hasAttribute('data-en')) el.setAttribute('data-en', el.innerHTML);
      el.innerHTML = (l === 'bm') ? el.getAttribute('data-bm') : el.getAttribute('data-en');
    });
    document.querySelectorAll('[data-bm-ph]').forEach(function (el) {
      if (!el.hasAttribute('data-en-ph')) el.setAttribute('data-en-ph', el.placeholder);
      el.placeholder = (l === 'bm') ? el.getAttribute('data-bm-ph') : el.getAttribute('data-en-ph');
    });
    var btn = document.getElementById('rf-lang-btn');
    if (btn) btn.textContent = (l === 'bm') ? 'EN' : 'BM';
    document.documentElement.lang = (l === 'bm') ? 'ms' : 'en';
  }

  function injectToggle() {
    var nav = document.querySelector('.sitenav') || document.querySelector('nav');
    if (!nav || document.getElementById('rf-lang-btn')) return;
    var btn = document.createElement('button');
    btn.id = 'rf-lang-btn';
    btn.textContent = (lang === 'bm') ? 'EN' : 'BM';
    btn.title = 'Toggle language / Tukar bahasa';
    btn.style.cssText = 'background:rgba(2,173,165,.15);border:1px solid var(--teal);color:var(--teal);border-radius:6px;padding:.28rem .72rem;font-size:.78rem;font-weight:800;cursor:pointer;letter-spacing:.06em;margin-left:auto;flex-shrink:0;transition:background .15s;';
    btn.addEventListener('click', function () {
      lang = (lang === 'en') ? 'bm' : 'en';
      try { localStorage.setItem('rf_lang', lang); } catch (e) {}
      applyLang(lang);
    });
    nav.style.display = 'flex';
    nav.style.alignItems = 'center';
    nav.appendChild(btn);
  }

  function init() { injectToggle(); applyLang(lang); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
