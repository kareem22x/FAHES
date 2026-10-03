/* ============================================================================
 * animations.js — dependency-free scroll reveal
 * ----------------------------------------------------------------------------
 * A ~200-line IntersectionObserver engine that pairs with `global.css`.
 * No frameworks, no build step, no polyfills required.
 *
 * Markup contract
 *   <div data-reveal>                    default = fade
 *   <div data-reveal="up">               fade + slide (up|down|left|right|
 *   <div data-reveal="zoom">                     start|end|zoom|zoom-in|fade)
 *   <div data-reveal-delay="200">        explicit delay in ms
 *   <div data-reveal-stagger="90">       direct children reveal in sequence
 *
 * Public API (window.Reveal)
 *   Reveal.init(options)     configure + start
 *   Reveal.observe(el)       watch a single element
 *   Reveal.refresh(root?)    scan for elements added later (SPA routes)
 *   Reveal.reveal(el)        force-reveal one element now
 *   Reveal.revealAll(root?)  force-reveal everything
 *   Reveal.reset(root?)      hide + re-watch everything (demos)
 *   Reveal.destroy()         tear down all observers
 *
 * Events
 *   `reveal:in`  and  `reveal:out` bubble from the element, detail = { el }
 *
 * Guarantees
 *   · Only toggles a class — all motion lives in CSS, transform/opacity only.
 *   · Degrades to "everything visible" if IntersectionObserver is missing.
 * ========================================================================== */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Reveal = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var REVEALED = 'is-revealed';

  var config = {
    selector: '[data-reveal]',
    staggerSelector: '[data-reveal-stagger]',
    root: null,
    /*
      Trigger geometry — tuned for a continuous descent.

      Default was `'0px 0px -12% 0px'` with `threshold: 0.15`: an element had
      to be a good way *inside* the viewport before it moved. Combined with a
      fast expo curve that produced a lurch — nothing, nothing, then a snap.

      Now the reveal starts while the element is still ~8% BELOW the fold
      (positive bottom margin extends the root downward), and there is no
      fractional-visibility wait. Motion therefore begins just before the
      element enters view and is already under way as it scrolls in, which is
      what a visitor perceives as "smooth".

      The reveal starts while the element is still ~8% BELOW the fold
      (positive bottom margin extends the root downward), and there is no
      fractional-visibility wait. Motion therefore begins just before the
      element enters view and is already under way as it scrolls in, which is
      what a visitor perceives as "smooth".

      `threshold: 0` fires on the first intersecting pixel — any positive
      threshold means a short element can sit at the fold doing nothing.
      `onDocumentEnd` below still guarantees everything reveals at the very
      bottom of the page.
    */
    rootMargin: '0px 0px 8% 0px',
    threshold: 0,
    staggerStep: 80,
    once: true, // false => re-hide when the element leaves the viewport
    watchDom: true, // re-scan when the DOM changes (client-side routing)
    autoInit: true // boot on DOMContentLoaded
  };

  var observer = null;
  var mutationObserver = null;
  var rafId = 0;
  var booted = false;

  /* ------------------------------------------------------------------ utils */

  function toArray(list) {
    return Array.prototype.slice.call(list || []);
  }

  function merge(target, source) {
    for (var key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        target[key] = source[key];
      }
    }
    return target;
  }

  function emit(el, type) {
    var event;
    try {
      event = new CustomEvent(type, { bubbles: true, detail: { el: el } });
    } catch (err) {
      event = document.createEvent('CustomEvent');
      event.initCustomEvent(type, true, false, { el: el });
    }
    el.dispatchEvent(event);
  }

  function setDelay(el, value) {
    var ms = parseFloat(value);
    el.style.setProperty(
      '--reveal-delay',
      isNaN(ms) ? value : ms + 'ms'
    );
  }

  /* ------------------------------------------------------- delay resolution */

  // Pass A — explicit per-element delays.
  function applyExplicitDelays(scope) {
    toArray(scope.querySelectorAll('[data-reveal-delay]')).forEach(function (el) {
      setDelay(el, el.getAttribute('data-reveal-delay'));
    });
  }

  // Pass B — stagger containers hand out incremental delays to direct children.
  function applyStaggerDelays(scope) {
    toArray(scope.querySelectorAll(config.staggerSelector)).forEach(function (box) {
      var step =
        parseFloat(box.getAttribute('data-reveal-stagger')) || config.staggerStep;
      var index = 0;

      toArray(box.children).forEach(function (child) {
        if (!child.matches(config.selector)) return;
        if (!child.hasAttribute('data-reveal-delay')) {
          setDelay(child, index * step);
        }
        index += 1;
      });
    });
  }

  /* -------------------------------------------------------------- revealing */

  function reveal(el) {
    if (!el || el.classList.contains(REVEALED)) return;
    el.classList.add(REVEALED);
    el.style.willChange = 'auto';
    if (observer) observer.unobserve(el);
    emit(el, 'reveal:in');
  }

  function conceal(el) {
    el.classList.remove(REVEALED);
    el.style.willChange = '';
    emit(el, 'reveal:out');
  }

  function onIntersect(entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        reveal(entry.target);
      } else if (!config.once) {
        conceal(entry.target);
      }
    });
  }

  /*
   * The bottom rootMargin is negative, which means an element that lives in the
   * last slice of the document can NEVER intersect the root — it cannot be
   * scrolled any higher than the document end, so it stays hidden forever.
   * (Measured: a 57px footer strip in the last 57px of a 4253px page never met
   * `threshold: 0.15` against a root inset by 12% of the viewport.)
   *
   * Once the page bottoms out, anything the observer has not caught yet is
   * unreachable by scrolling, so reveal it outright.
   */
  function onDocumentEnd() {
    var doc = document.documentElement;
    if (window.innerHeight + window.scrollY < doc.scrollHeight - 2) return;
    revealAll(document);
  }

  /* ------------------------------------------------------------------ scans */

  function observe(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.classList.contains(REVEALED)) return;
    if (!observer) {
      reveal(el); // no IO support => show immediately
      return;
    }
    observer.observe(el);
  }

  function scan(scope) {
    var node = scope && scope.nodeType === 1 ? scope : document;
    applyExplicitDelays(node);
    applyStaggerDelays(node);

    if (node.matches && node.matches(config.selector)) observe(node);
    toArray(node.querySelectorAll(config.selector)).forEach(observe);
  }

  function scheduleScan() {
    if (rafId) return;
    rafId = (window.requestAnimationFrame || window.setTimeout)(function () {
      rafId = 0;
      scan(document);
    }, 16);
  }

  function revealAll(scope) {
    var node = scope && scope.nodeType === 1 ? scope : document;
    var targets = toArray(node.querySelectorAll(config.selector));
    if (node.matches && node.matches(config.selector)) targets.push(node);
    targets.forEach(function (el) {
      el.classList.add(REVEALED);
      el.style.willChange = 'auto';
      if (observer) observer.unobserve(el);
    });
  }

  /* ------------------------------------------------------------- lifecycle */

  function init(options) {
    if (booted) {
      if (options) {
        merge(config, options);
        refresh();
      }
      return api;
    }
    booted = true;

    // Allow <script>window.RevealConfig = {...}</script> before load.
    if (window.RevealConfig) merge(config, window.RevealConfig);
    if (options) merge(config, options);

    // No IntersectionObserver => nothing to observe, just show it all.
    if (!('IntersectionObserver' in window)) {
      revealAll(document);
      return api;
    }

    observer = new IntersectionObserver(onIntersect, {
      root: config.root,
      rootMargin: config.rootMargin,
      threshold: config.threshold
    });

    scan(document);

    window.addEventListener('scroll', onDocumentEnd, { passive: true });

    if (config.watchDom && 'MutationObserver' in window && document.body) {
      mutationObserver = new MutationObserver(scheduleScan);
      mutationObserver.observe(document.body, { childList: true, subtree: true });
    }

    return api;
  }

  function refresh(scope) {
    if (!observer) {
      revealAll(scope);
      return api;
    }
    scan(scope);
    return api;
  }

  function reset(scope) {
    var node = scope && scope.nodeType === 1 ? scope : document;
    var targets = toArray(node.querySelectorAll(config.selector));
    if (node.matches && node.matches(config.selector)) targets.push(node);

    targets.forEach(function (el) {
      el.classList.remove(REVEALED);
      el.style.willChange = '';
      if (observer) observer.observe(el);
    });
    return api;
  }

  function destroy() {
    if (observer) observer.disconnect();
    if (mutationObserver) mutationObserver.disconnect();
    window.removeEventListener('scroll', onDocumentEnd);
    observer = null;
    mutationObserver = null;
    booted = false;
    return api;
  }

  /* -------------------------------------------------------------------- api */

  var api = {
    init: init,
    refresh: refresh,
    reset: reset,
    destroy: destroy,
    observe: observe,
    reveal: reveal,
    conceal: conceal,
    revealAll: revealAll,
    get config() {
      return config;
    }
  };

  /* ------------------------------------------------------------------- boot */

  function boot() {
    if (!config.autoInit) return;
    init();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
      boot();
    }
  }

  return api;
});
