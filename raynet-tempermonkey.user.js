// ==UserScript==
// @name         Raynet tweaks (select + rename + wide detail)
// @namespace    https://tampermonkey.net/
// @version      5.0
// @description  Allow text selection, rename Projekty->Prístroje, hide the detail-view side panel and stretch the main column (and the tables inside it) to full width.
// @match        https://app.raynetcrm.sk/intertec*
// @match        http://app.raynetcrm.sk/intertec*
// @match        https://*.app.raynetcrm.sk/intertec*
// @match        http://*.app.raynetcrm.sk/intertec*
// @match        https://app.raynetcrm.cz/intertec*
// @match        http://app.raynetcrm.cz/intertec*
// @match        https://*.app.raynetcrm.cz/intertec*
// @match        http://*.app.raynetcrm.cz/intertec*
// @include      /^https?:\/\/([^.]+\.)?app\.raynetcrm\.(sk|cz)\/intertec.*$/i
// @updateURL    https://github.com/martinkolarik-ext54836/raynet-tempermonkey/raw/refs/heads/main/raynet-tempermonkey.user.js
// @downloadURL  https://github.com/martinkolarik-ext54836/raynet-tempermonkey/raw/refs/heads/main/raynet-tempermonkey.user.js
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // Set to true if you also want the left contact column gone.
  const HIDE_LEFT_COLUMN = false;

  const norm = s => (s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

  // ------------------------------------------------------------------
  // 1. CSS: text selection + hide side panel + stretch everything
  // ------------------------------------------------------------------
  // Hashed class suffixes (__lbiIv, __EMoGj, ...) change between Raynet
  // builds, so anything hashed is matched with [class*="prefix__"].
  const CSS = `
    /* --- override Raynet "no text select" --- */
    body { user-select: auto !important; }

    /* --- hide the right-hand widget column + the tab that pops it back out --- */
    .xDetailViewLayoutColumn.-widget,
    .xInfoPanelFabWithSidePanel { display: none !important; }

    /* --- lift the fixed max-widths so the view uses the whole window --- */
    .xDetailViewLayout,
    [class*="xDetailListViewLayout__"] { max-width: none !important; }

    /* --- let the main column swallow the freed grid tracks.
           Scoped with :has() so it only touches layouts that actually have a
           widget column: the deal (-business) layout has a different column
           set (-full/-side/-content) and gets mangled by a blanket
           grid-template-columns override. --- */
    .xDetailViewLayout__inner:has(> .xDetailViewLayoutColumn.-widget)
      > .xDetailViewLayoutColumn.-content {
      grid-column: ${HIDE_LEFT_COLUMN ? '1' : '2'} / -1 !important;
    }
    ${HIDE_LEFT_COLUMN ? '.xDetailViewLayoutColumn.-side { display: none !important; }' : ''}

    /* --- stretch the tables *inside* the panels.
           Raynet gives each column a fixed inline px width and never
           redistributes the slack, so the table sits left-aligned with dead
           space on the right. The rows live in a virtual-scroller sizer div
           that also carries an inline px width - widen that first, then let
           the flex cells grow into it. Header and body must both be widened
           or they visibly desync. --- */
    [class*="xDetailViewVirtualScrollerTableWrapper__"] > div,
    [class*="xDetailViewTableHeader__container__"],
    [class*="xDetailViewTableRow__wrapper__"],
    [class*="xDetailViewTableBody__row__"] {
      width: 100% !important;
    }
    [class*="xTableHeader__cell"],
    [class*="xDetailViewTableBody__cell__"] {
      flex-grow: 1 !important;
    }
  `;

  const style = document.createElement('style');
  style.textContent = CSS;
  (document.head || document.documentElement).appendChild(style);

  // ------------------------------------------------------------------
  // 2. Rename "Projekty" -> "Prístroje" and "Projekt" -> "Prístroj"
  // ------------------------------------------------------------------
  function renameProjectsToPristroje() {
    // Navigation and accordion items (hashed class suffix)
    document.querySelectorAll(
      '[class*="xNavigationMenuItem__"], [class*="xNavigationMenu__topLevelItem__"]'
    ).forEach(el => {
      if (norm(el.textContent) !== 'Projekty') return;
      const title = el.querySelector('[class*="xNavigationMenu__topLevelItemTitle__"]') || el;
      if (norm(title.textContent) !== 'Prístroje') title.textContent = 'Prístroje';
    });

    // Leaf spans that are exactly "Projekty".
    // childElementCount check keeps us from blowing away a wrapper's children.
    document.querySelectorAll('span').forEach(el => {
      if (el.childElementCount === 0 && norm(el.textContent) === 'Projekty') {
        el.textContent = 'Prístroje';
      }
    });

    // List view titles
    document.querySelectorAll('div.xListViewTitle').forEach(el => {
      const txt = norm(el.textContent);
      const tit = el.getAttribute('title');
      if (txt === 'Projekty' || tit === 'Projekty') {
        if (txt === 'Projekty') el.textContent = 'Prístroje';
        if (tit === 'Projekty') el.setAttribute('title', 'Prístroje');
      }
    });

    // Detail header "Projekt<span>CODE</span>"
    document.querySelectorAll('[class*="__codeRenderer__"]').forEach(el => {
      el.childNodes.forEach(n => {
        if (n.nodeType === Node.TEXT_NODE && n.textContent.includes('Projekt')) {
          n.textContent = n.textContent.replace(/Projekt/g, 'Prístroj');
        }
      });
    });

    // Record info header
    document.querySelectorAll('.x-recordinfo .entity-type').forEach(el => {
      const txt = norm(el.textContent);
      if (txt === 'Projekty') el.textContent = 'Prístroje';
      else if (txt === 'Projekt') el.textContent = 'Prístroj';
    });
  }

  // Observe with the observer detached during the pass - the rename itself
  // mutates the DOM and would otherwise retrigger us forever.
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      observer.disconnect();
      try { renameProjectsToPristroje(); } finally { start(); }
    });
  });

  function start() {
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    renameProjectsToPristroje();
    start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
