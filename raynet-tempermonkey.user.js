// ==UserScript==
// @name         Raynet tweaks (select + rename + wide detail)
// @namespace    https://tampermonkey.net/
// @version      5.4
// @description  Allow text selection, rename Projekty->Prístroje, on the client/contact detail hide the side panel and stretch the main column to full width, and auto-reload after the custom generate-offer-PDF API call succeeds (with a toast fallback).
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
  //
  // Everything except text-select is scoped to `.xDetailViewLayout.-contact`,
  // the client/contact detail layout (Company + Person). Other detail layouts
  // must NOT be touched:
  //   -business             (deal)  has no widget column
  //   -content-mid-reversed (task)  puts the -widget column on the LEFT and
  //                                 keeps "Mám hotovo" in -content; an unscoped
  //                                 `-widget { display:none }` there hid the
  //                                 left column and the content grid-column
  //                                 override overlapped the -side panel.
  const SCOPE = '.xDetailViewLayout.-contact';
  const CSS = `
    /* --- override Raynet "no text select" (global, harmless everywhere) --- */
    body { user-select: auto !important; }

    /* --- hide the right-hand widget column + the tab that pops it back out --- */
    ${SCOPE} .xDetailViewLayoutColumn.-widget,
    ${SCOPE} .xInfoPanelFabWithSidePanel { display: none !important; }

    /* --- lift the fixed max-widths so the view uses the whole window --- */
    ${SCOPE},
    ${SCOPE} [class*="xDetailListViewLayout__"] { max-width: none !important; }

    /* --- let the main column swallow the freed grid tracks.
           Scoped with :has() so it only touches layouts that actually have a
           widget column. --- */
    ${SCOPE} .xDetailViewLayout__inner:has(> .xDetailViewLayoutColumn.-widget)
      > .xDetailViewLayoutColumn.-content {
      grid-column: ${HIDE_LEFT_COLUMN ? '1' : '2'} / -1 !important;
    }
    ${HIDE_LEFT_COLUMN ? `${SCOPE} .xDetailViewLayoutColumn.-side { display: none !important; }` : ''}

    /* --- stretch the tables *inside* the panels.
           Raynet gives each column a fixed inline px width and never
           redistributes the slack, so the table sits left-aligned with dead
           space on the right. The rows live in a virtual-scroller sizer div
           that also carries an inline px width - widen that first, then let
           the flex cells grow into it. Header and body must both be widened
           or they visibly desync. --- */
    ${SCOPE} [class*="xDetailViewVirtualScrollerTableWrapper__"] > div,
    ${SCOPE} [class*="xDetailViewTableHeader__container__"],
    ${SCOPE} [class*="xDetailViewTableRow__wrapper__"],
    ${SCOPE} [class*="xDetailViewTableBody__row__"] {
      width: 100% !important;
    }
    ${SCOPE} [class*="xTableHeader__cell"],
    ${SCOPE} [class*="xDetailViewTableBody__cell__"] {
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

    // "Naviazané záznamy" sublist title - a div, so the span pass above
    // misses it. childElementCount === 0 targets the inner text node holder
    // and leaves the wrapper that contains the dropdown chevron alone.
    document.querySelectorAll(
      '[class*="xLinkedRecordsSublistSelect__value__"], [class*="xDetailListView__title__"]'
    ).forEach(el => {
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

  // ------------------------------------------------------------------
  // 3. Auto-refresh after the custom "generate offer PDF" action.
  // ------------------------------------------------------------------
  // The custom offer action calls an external API that builds the PDF and
  // attaches it to the offer server-side, then returns a success payload
  // (which Raynet reads to show a toast). The detail view does not re-fetch,
  // so the new attachment only appears after a manual "Aktualizovať záznam".
  //
  // Two triggers, sharing a single one-shot guard so at most one reload
  // happens per generation:
  //   a) primary - intercept the AJAX call to the generate-offer API and
  //      reload on HTTP success. Because Raynet reads the response body, the
  //      endpoint is CORS-readable, so the real status is visible.
  //   b) fallback - watch Raynet's Radix toast area for the success message,
  //      in case the request ever goes out through a path we don't wrap.
  const OFFER_API_RE   = /\/\/api\.intertec\.sk\/generate-offer\//i;
  const REFRESH_ON_TOAST = /Ponuka vygenerovan/i; // stem: matches -á/-ý/-é, "... do PDF"
  const REFRESH_DELAY_MS = 600; // let the server-side attach settle
  let refreshArmed = true;      // one-shot; a reload resets it anyway

  function triggerRefresh() {
    if (!refreshArmed) return;
    refreshArmed = false;
    setTimeout(() => location.reload(), REFRESH_DELAY_MS);
  }

  // (a) wrap fetch + XMLHttpRequest. Installed synchronously (not in init)
  //     so no call is missed; the generate action only fires on user click,
  //     well after this runs.
  function hookNetwork() {
    const urlOf = x => (typeof x === 'string' ? x : (x && x.url) || String(x || ''));

    const _fetch = window.fetch;
    if (typeof _fetch === 'function') {
      window.fetch = function (input, init) {
        const p = _fetch.apply(this, arguments);
        if (OFFER_API_RE.test(urlOf(input))) {
          p.then(res => { if (res && res.ok) triggerRefresh(); }).catch(() => {});
        }
        return p;
      };
    }

    const XHR = window.XMLHttpRequest;
    if (XHR && XHR.prototype) {
      const _open = XHR.prototype.open;
      const _send = XHR.prototype.send;
      XHR.prototype.open = function (method, url) {
        this.__tmOfferApi = OFFER_API_RE.test(url || '');
        return _open.apply(this, arguments);
      };
      XHR.prototype.send = function () {
        if (this.__tmOfferApi) {
          this.addEventListener('load', () => {
            if (this.status >= 200 && this.status < 300) triggerRefresh();
          });
        }
        return _send.apply(this, arguments);
      };
    }
  }

  // (b) toast fallback
  function watchToasts() {
    const vp = document.querySelector('.xToastViewport');
    if (!vp) { setTimeout(watchToasts, 1000); return; } // app shell not up yet
    if (vp.__tmToastWatched) return;
    vp.__tmToastWatched = true;

    new MutationObserver(muts => {
      if (!refreshArmed) return;
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (REFRESH_ON_TOAST.test(norm(n.textContent))) {
            triggerRefresh();
            return;
          }
        }
      }
    }).observe(vp, { childList: true, subtree: true });
  }

  hookNetwork();

  function init() {
    renameProjectsToPristroje();
    start();
    watchToasts();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
