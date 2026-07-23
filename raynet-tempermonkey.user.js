// ==UserScript==
// @name         Raynet tweaks (select + rename + wide detail)
// @namespace    https://tampermonkey.net/
// @version      5.6
// @description  Allow text selection, rename Projekty->Prístroje, on the client/contact detail hide the side panel and stretch the main column to full width, and after the custom generate-offer-PDF call succeeds refresh the record in place via "Aktualizovať záznam" (no page reload, keeps tabs).
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
  // Two triggers, collapsed into one refresh per generation:
  //   a) primary - intercept the AJAX call to the generate-offer API and
  //      refresh on HTTP success. Because Raynet reads the response body, the
  //      endpoint is CORS-readable, so the real status is visible.
  //   b) fallback - watch Raynet's Radix toast area for the success message,
  //      in case the request ever goes out through a path we don't wrap.
  //
  // The refresh is NOT a page reload - that would drop all open Raynet tabs.
  // Instead we invoke Raynet's own "Aktualizovať záznam" menu action, which
  // re-fetches the record in place (POST /special/{Entity}/detail/{id} + the
  // related wall/history/activity calls) and re-renders just this tab.
  const OFFER_API_RE     = /\/\/api\.intertec\.sk\/generate-offer\//i;
  const REFRESH_ON_TOAST = /Ponuka vygenerovan/i;   // stem: matches -á/-ý/-é, "... do PDF"
  const REFRESH_MENU_ITEM = 'Aktualizovať záznam';  // exact record-refresh menu label
  const REFRESH_DELAY_MS = 600;                     // let the server-side attach settle
  const REARM_MS         = 3000;                    // ignore duplicate triggers this long
  let refreshPending = false;

  // Collapse the near-simultaneous network + toast triggers into a single
  // refresh, then re-arm (there is no reload to reset state) so a later
  // generation in the same session refreshes again.
  function triggerRefresh() {
    if (refreshPending) return;
    refreshPending = true;
    setTimeout(() => {
      refreshRecord();
      setTimeout(() => { refreshPending = false; }, REARM_MS);
    }, REFRESH_DELAY_MS);
  }

  // The active Raynet tab's scroll container. There is one scroll wrapper per
  // open tab, so a plain querySelector may hit a hidden tab's wrapper - scope
  // to the active tab body.
  const activeScroller = () =>
    document.querySelector('.xMainTabs__bodyContent.-active .xMainTabContent__scrollWrapper');

  // Raynet's own "Aktualizovať záznam" resets the record's scroll to the top
  // (it does this on a manual click too). Pin the scroll back to where it was
  // for a short window after we trigger the refresh, so the re-render's reset
  // is corrected within one frame and the jump is not visible.
  const PIN_SCROLL_MS = 1500;
  function keepScroll(savedTop) {
    if (!savedTop) return; // already at top, nothing to preserve
    const started = Date.now();
    const iv = setInterval(() => {
      const sc = activeScroller();
      if (sc && sc.scrollTop !== savedTop) sc.scrollTop = savedTop;
      if (Date.now() - started > PIN_SCROLL_MS) clearInterval(iv);
    }, 50);
  }

  // Invoke "Aktualizovať záznam" via Raynet's own header "..." menu.
  // Anchored on the generate(*)/add(+) button so we find the record-level
  // more-menu in that same action group - never the products toolbar's or a
  // tab bar's "...", and never the -orange/-primary buttons themselves (which
  // would re-run the generate/add action). Radix mounts the menu content
  // async, so we poll for the item; selection is a plain click. On failure we
  // do nothing - deliberately no page-reload fallback.
  function refreshRecord() {
    const anchor = document.querySelector('button.-orange[aria-haspopup="menu"]')
                || document.querySelector('button.-primary[aria-haspopup="menu"]');
    if (!anchor) return;

    let more = null;
    for (let node = anchor.parentElement, i = 0; node && i < 8; node = node.parentElement, i++) {
      more = node.querySelector('button.-lightGrey[aria-haspopup="menu"]');
      if (more) break;
    }
    if (!more) return;

    const sc = activeScroller();
    const savedTop = sc ? sc.scrollTop : 0; // capture before the refresh resets it

    if (more.getAttribute('data-state') !== 'open') {
      // Radix trigger opens on a primary pointerdown/up (a full click toggles
      // it straight back closed, so do NOT dispatch click here).
      more.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse', isPrimary: true }));
      more.dispatchEvent(new PointerEvent('pointerup',   { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse', isPrimary: true }));
    }

    let tries = 0;
    const iv = setInterval(() => {
      const item = [...document.querySelectorAll('[role="menuitem"]')]
        .find(e => norm(e.textContent) === REFRESH_MENU_ITEM && e.getBoundingClientRect().width > 0);
      if (item) {
        clearInterval(iv);
        item.click();       // Radix selects on click -> app re-fetches this record
        keepScroll(savedTop); // ...which scrolls to top; hold the old position
      } else if (++tries > 20) {
        clearInterval(iv); // menu never mounted; give up quietly
      }
    }, 100);
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
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (REFRESH_ON_TOAST.test(norm(n.textContent))) {
            triggerRefresh(); // guarded internally against duplicate triggers
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
