// ==UserScript==
// @name         Raynet grid reformatter (visible-grid scoped)
// @namespace    https://tampermonkey.net/
// @version      3.6a
// @description  Attach toggle after every exact "Exportovať". Always rescan and apply ONLY to the currently visible grid/tab using a unique CSS scope. When enabled, clone the visible grid into a fullscreen popup and apply CSS to the clone.
// @match        *://*.app.raynetcrm.sk/intertec*
// @updateURL    https://github.com/martinkolarik-ext54836/raynet-tempermonkey/raw/refs/heads/main/raynet-tempermonkey.user.js
// @downloadURL  https://github.com/martinkolarik-ext54836/raynet-tempermonkey/raw/refs/heads/main/raynet-tempermonkey.user.js
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const TAG = '[TM GridFix v3.5]';
  let ENABLED = false;
  let scopeCounter = 0;                // for unique scope classes
  let currentScopedGrid = null;        // the grid element we last scoped
  let currentScopeClass = null;        // e.g. tm-gridfix-scope-3

  // modal-related
  let modalEl = null;
  let modalInnerEl = null;
  let clonedGridEl = null;

  const log = (...a) => console.log(TAG, ...a);
  const norm = s => (s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

  // ---------- util: visible detection ----------
  function isVisible(el) {
    if (!el) return false;
    if (!(el.offsetParent || el.getClientRects().length)) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
  }

  // ---------- locate the visible grid and its header ----------
  function getVisibleGridAndHeader() {
    // prefer grids that actually have a header row and are visible
    const grids = Array.from(document.querySelectorAll('.x-grid3'));
    for (const grid of grids) {
      if (!isVisible(grid)) continue;
      const hdrRow = grid.querySelector('.x-grid3-header .x-grid3-hd-row');
      if (hdrRow && isVisible(hdrRow)) return { grid, hdrRow };
    }
    // fallback: visible header anywhere
    const hdrRow = Array.from(document.querySelectorAll('.x-grid3-header .x-grid3-hd-row')).find(isVisible);
    if (hdrRow) {
      const grid = hdrRow.closest('.x-grid3');
      if (grid && isVisible(grid)) return { grid, hdrRow };
    }
    return null;
  }

  // ---------- scope management ----------
  function ensureScope(gridEl) {
    // if grid already has our scope class, reuse
    const existing = Array.from(gridEl.classList).find(c => c.startsWith('tm-gridfix-scope-'));
    if (existing) return existing;
    const cls = `tm-gridfix-scope-${++scopeCounter}`;
    gridEl.classList.add(cls);
    return cls;
  }

  function clearAllStyleTags() {
    document.querySelectorAll('style[data-tm-gridfix="1"]').forEach(n => n.remove());
  }

  function upsertStyle(cssText) {
    clearAllStyleTags();
    const s = document.createElement('style');
    s.setAttribute('data-tm-gridfix', '1');
    s.textContent = cssText;
    (document.head || document.documentElement).appendChild(s);
  }

  // ---------- read header -> build CSS using nth-child scoped to the visible grid ----------
  function readHeaderOrder(hdrRow) {
    let i = 0;
    const idx = {};
    hdrRow.querySelectorAll('td.x-grid3-hd').forEach(td => {
      i++;
      const title = norm(td.textContent);
      if (title === 'Typ') idx.typ = i;
      if (title === 'Predmet') idx.predmet = i;
      if (title === 'Obsah aktivity') idx.obsah = i;
      if (title === 'Riešenie úlohy / Výsledok jednania') idx.riesenie = i;
    });
    return idx;
  }

  function buildScopedCSS(scopeClass, idx) {
    const sc = `.${scopeClass}`;
    const rules = [];

    if (idx.predmet) {
      rules.push(`
        ${sc} .x-grid3-hd-row > td:nth-child(${idx.predmet}),
        ${sc} .x-grid3-row-table > tbody > tr > td:nth-child(${idx.predmet}) {
          display: none !important;
        }`);
    }

    if (idx.typ) {
      rules.push(`
        ${sc} .x-grid3-row-table > tbody > tr > td:nth-child(${idx.typ}) .x-grid3-cell-inner > div {
          font-size: 0 !important;
          display: inline-block !important;
          min-width: 16px !important;
          min-height: 16px !important;
        }
        ${sc} .x-grid3-row-table > tbody > tr > td:nth-child(${idx.typ}) .x-grid3-cell-inner > div::after {
          content: "" !important;
        }`);
    }

    if (idx.obsah) {
      rules.push(`
        ${sc} .x-grid3-hd-row > td:nth-child(${idx.obsah}) .x-grid3-hd-inner,
        ${sc} .x-grid3-row-table > tbody > tr > td:nth-child(${idx.obsah}) .x-grid3-cell-inner {
          text-overflow: unset !important;
          white-space: normal !important;
          overflow: unset !important;
        }`);
    }

    return rules.join('\n');
  }

  // merge "Riešenie úlohy / Výsledok jednania" into "Obsah aktivity" on the CLONED grid
  function mergeRiesenieIntoObsah(gridEl, idx) {
    if (!idx || !idx.obsah || !idx.riesenie) return;
    if (gridEl.getAttribute('data-tm-merged') === '1') return;
    const rows = gridEl.querySelectorAll('.x-grid3-row');
    rows.forEach(row => {
      const tds = row.querySelectorAll('td');
      const obsahTd = tds[idx.obsah - 1];
      const riesTd = tds[idx.riesenie - 1];
      if (!obsahTd || !riesTd) return;
      const obsahDiv = obsahTd.querySelector('.x-grid3-cell-inner');
      const riesDiv = riesTd.querySelector('.x-grid3-cell-inner');
      if (!obsahDiv || !riesDiv) return;
      const add = norm(riesDiv.textContent);
      if (!add) return;
      const base = norm(obsahDiv.textContent);
      if (base.includes(add)) return;
      obsahDiv.textContent = base ? (base + ' | ' + add) : add;
    });
    gridEl.setAttribute('data-tm-merged', '1');
  }

  // ---------- modal helpers ----------
  function ensureModalBaseCSS() {
    if (document.querySelector('style[data-tm-gridfix-modal-css="1"]')) return;
    const s = document.createElement('style');
    s.setAttribute('data-tm-gridfix-modal-css', '1');
    s.textContent = `
      .tm-gridfix-modal {
        position: fixed; inset: 0; background: rgba(0,0,0,0.6);
        z-index: 2147483000; display: flex; align-items: center; justify-content: center;
      }
      .tm-gridfix-modal-inner {
        background: #fff; width: 96vw; height: 90vh; overflow: hidden; padding: 0; box-sizing: border-box;
        box-shadow: 0 10px 30px rgba(0,0,0,0.35); border-radius: 8px; position: relative;
        display: flex; flex-direction: column;
      }
      .tm-gridfix-close {
        position: absolute; top: 8px; right: 8px; border: 0; background: #eee; cursor: pointer; padding: 6px 10px; border-radius: 4px;
        z-index: 2147483647;
      }
      .tm-gridfix-fill {
        width: 100% !important; height: 100% !important; max-height: 100% !important;
      }
      /* make the cloned grid fully expand to modal width */
      .tm-gridfix-fill,
      .tm-gridfix-fill .x-grid3,
      .tm-gridfix-fill .x-grid3-viewport,
      .tm-gridfix-fill .x-grid3-scroller,
      .tm-gridfix-fill .x-grid3-body,
      .tm-gridfix-fill .x-grid3-header-inner,
      .tm-gridfix-fill .x-grid3-row,
      .tm-gridfix-fill .x-grid3-row-table {
        width: 100% !important;
        max-width: 100% !important;
      }
      /* make the cloned grid as tall as the modal */
      .tm-gridfix-fill .x-grid3,
      .tm-gridfix-fill .x-grid3-viewport,
      .tm-gridfix-fill .x-grid3-scroller,
      .tm-gridfix-fill .x-grid3-body {
        height: 100% !important;
        max-height: 100% !important;
      }
    `;
    document.head.appendChild(s);
  }

  function openModalWithClonedGrid(gridEl) {
    if (modalEl) return; // already open
    ensureModalBaseCSS();

    modalEl = document.createElement('div');
    modalEl.className = 'tm-gridfix-modal';
    modalInnerEl = document.createElement('div');
    modalInnerEl.className = 'tm-gridfix-modal-inner';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tm-gridfix-close';
    closeBtn.textContent = 'Zavrieť';
    closeBtn.addEventListener('click', () => {
      ENABLED = false;
      updateAllToggleLabels();
      clearRules();
      destroyModal();
    });

    clonedGridEl = gridEl.cloneNode(true);
    clonedGridEl.classList.add('tm-gridfix-fill');
    clonedGridEl.style.width = '100%';
    clonedGridEl.style.height = '100%';
    clonedGridEl.style.maxHeight = '100%';

    // remove all unselectable attributes inside cloned HTML
    clonedGridEl.removeAttribute('unselectable');
    clonedGridEl.querySelectorAll('[unselectable]').forEach(n => n.removeAttribute('unselectable'));

    modalInnerEl.appendChild(closeBtn);
    modalInnerEl.appendChild(clonedGridEl);
    modalEl.appendChild(modalInnerEl);
    document.body.appendChild(modalEl);

    // NEW: close modal when any link inside the cloned grid is clicked
    clonedGridEl.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a');
      if (a) {
        ENABLED = false;
        updateAllToggleLabels();
        clearRules();
        destroyModal();
      }
    });

    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) {
        ENABLED = false;
        updateAllToggleLabels();
        clearRules();
        destroyModal();
      }
    });
    document.addEventListener('keydown', escCloseOnce, { once: true });

    log('modal opened with cloned grid');
  }

  function escCloseOnce(e) {
    if (e.key === 'Escape') {
      ENABLED = false;
      updateAllToggleLabels();
      clearRules();
      destroyModal();
    }
  }

  function destroyModal() {
    if (modalEl && modalEl.parentNode) modalEl.parentNode.removeChild(modalEl);
    modalEl = null;
    modalInnerEl = null;
    clonedGridEl = null;
    log('modal destroyed');
  }

  // ---------- apply / clear rules ONLY on the cloned grid when enabled ----------
  function applyRulesToVisibleGrid() {
    // when enabled, operate on the cloned grid inside modal
    if (ENABLED && clonedGridEl) {
      const hdrRow = clonedGridEl.querySelector('.x-grid3-header .x-grid3-hd-row');
      if (!hdrRow) { log('no header in cloned grid'); return; }
      currentScopedGrid = clonedGridEl;
      currentScopeClass = ensureScope(clonedGridEl);
      const idx = readHeaderOrder(hdrRow);

      // merge requested content before applying CSS
      mergeRiesenieIntoObsah(clonedGridEl, idx);

      const cssBase = buildScopedCSS(currentScopeClass, idx);
      let extra = '';
      if (idx.riesenie) {
        extra += `
          .${currentScopeClass} .x-grid3-hd-row > td:nth-child(${idx.riesenie}),
          .${currentScopeClass} .x-grid3-row-table > tbody > tr > td:nth-child(${idx.riesenie}) {
            display: none !important;
          }`;
      }
      upsertStyle(cssBase + extra);
      log('CSS applied to cloned grid', idx, currentScopeClass);
      return;
    }

    // original behavior when not enabled (kept unchanged)
    const hit = getVisibleGridAndHeader();
    if (!hit) { log('no visible grid/header'); return; }
    const { grid, hdrRow } = hit;

    if (currentScopedGrid !== grid) {
      currentScopedGrid = grid;
      currentScopeClass = ensureScope(grid);
      log('scoped to grid with class', currentScopeClass);
    } else if (!currentScopeClass) {
      currentScopeClass = ensureScope(grid);
    }

    const idx = readHeaderOrder(hdrRow);
    const css = buildScopedCSS(currentScopeClass, idx);
    upsertStyle(css);
    log('CSS applied to visible grid', idx, currentScopeClass);
  }

  function clearRules() {
    clearAllStyleTags();
    log('CSS cleared');
  }

  // ---------- toggle button handling ----------
  function updateAllToggleLabels() {
    document.querySelectorAll('button.tm-toggle-original')
      .forEach(b => b.textContent = ENABLED ? 'Pôvodné zobrazenie' : 'Upravené zobrazenie');
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button.tm-toggle-original');
    if (!btn) return;

    ENABLED = !ENABLED;
    updateAllToggleLabels();

    if (ENABLED) {
      const hit = getVisibleGridAndHeader();
      if (hit) {
        openModalWithClonedGrid(hit.grid);
        applyRulesToVisibleGrid();
      } else {
        ENABLED = false;
        updateAllToggleLabels();
      }
    } else {
      clearRules();
      destroyModal();
    }
  });

  // ---------- insert toggle after EVERY exact "Exportovať" ----------
  function addToggleAfterAllExportButtons() {
    let added = 0;
    const exportButtons = Array.from(document.querySelectorAll('button.x-btn-text'))
      .filter(b => norm(b.textContent) === 'Exportovať'); // exact match

    exportButtons.forEach(expBtn => {
      const row = expBtn.closest('tr.x-toolbar-left-row');
      if (!row) return;
      if (row.querySelector('button.tm-toggle-original')) return;

      const td = document.createElement('td');
      td.className = 'x-toolbar-cell';
      const div = document.createElement('div');
      div.className = 'x-btn x-view-toolbar-btn x-btn-small x-btn-icon-small-left x-btn-noicon';
      div.style.width = 'auto';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'x-btn-text tm-toggle-original';
      btn.textContent = ENABLED ? 'Pôvodné zobrazenie' : 'Upravené zobrazenie';
      div.appendChild(btn);
      td.appendChild(div);

      const expTd = expBtn.closest('td');
      if (expTd && expTd.parentNode) {
        expTd.parentNode.insertBefore(td, expTd.nextSibling);
        added++;
      }
    });

    if (added) log('toggle(s) added after Exportovať x', added);
    return added > 0;
  }

  // ---------- observers ----------
  const domObs = new MutationObserver(() => {
    // keep buttons present in any rebuilt toolbars
    addToggleAfterAllExportButtons();

    // if enabled, re-apply only on the cloned grid in the modal
    if (ENABLED) applyRulesToVisibleGrid();
  });

  function startObservers() {
    domObs.observe(document.body, { childList: true, subtree: true });
  }

  // ---------- init ----------
  function init() {
    // try immediately and on delayed loads
    let tries = 0;
    const tick = () => {
      const ok = addToggleAfterAllExportButtons();
      if (ok || tries++ > 60) {
        startObservers();
        log('init complete');
      } else {
        setTimeout(tick, 300);
      }
    };
    tick();
  }

  if (document.readyState === 'complete') init();
  else window.addEventListener('load', init, { once: true });
})();
