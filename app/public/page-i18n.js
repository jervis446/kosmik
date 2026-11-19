/**
 * English ↔ Hindi for Kosmik's static pages (the landing page and the Claude/ChatGPT guide).
 *
 * English is written in the page. Hindi comes from dictionaries keyed by the English text with
 * whitespace collapsed: `text` for text nodes and attributes (placeholder, aria-label, title, alt),
 * `html` for elements marked data-i18n="key", whose whole innerHTML is swapped. Content the page adds
 * later is translated as it appears. Left alone: script, style, svg, Sanskrit ([lang^="sa"]) and
 * anything inside [data-noi18n]. The choice is shared with the app's landing key "kosmik-lang".
 *
 *   const i18n = kosmikI18n({ text: {...}, html: {...}, onChange: (lang) => {...} });
 *   i18n.lang()          'en' | 'hi'
 *   i18n.toggle()        switches and remembers
 *   i18n.pick(en, hi)    for strings the page builds itself
 */
(function () {
  var ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
  var norm = function (s) { return s.replace(/\s+/g, ' ').trim(); };

  window.kosmikI18n = function (opts) {
    var text = (opts && opts.text) || {};
    var html = (opts && opts.html) || {};
    var onChange = opts && opts.onChange;
    var lang = 'en';
    try { lang = localStorage.getItem('kosmik-lang') === 'hi' ? 'hi' : 'en'; } catch (e) {}

    var textRec = new WeakMap(); // text node -> { en, hi }
    var attrRec = new WeakMap(); // element -> { attr: { en, hi } }
    var htmlRec = new WeakMap(); // element -> English innerHTML

    var frozen = function (el) {
      return !el || !!el.closest('script,style,svg,noscript,[lang^="sa"],[data-noi18n]');
    };
    // Same leading/trailing spaces as the English, so inline words don't run together.
    var swap = function (en, hi) {
      return en.match(/^\s*/)[0] + hi + en.match(/\s*$/)[0];
    };

    var doText = function (n) {
      if (frozen(n.parentElement) || n.parentElement.closest('[data-i18n]')) return;
      var rec = textRec.get(n);
      var en = rec && n.nodeValue === rec.hi ? rec.en : n.nodeValue;
      var want = en;
      if (lang === 'hi') {
        var hi = text[norm(en)];
        if (hi === undefined) return;
        want = swap(en, hi);
        textRec.set(n, { en: en, hi: want });
      }
      if (n.nodeValue !== want) n.nodeValue = want;
    };

    var doAttrs = function (el) {
      if (frozen(el)) return;
      for (var i = 0; i < ATTRS.length; i++) {
        var a = ATTRS[i];
        var v = el.getAttribute(a);
        if (v == null) continue;
        var recs = attrRec.get(el) || {};
        var rec = recs[a];
        var en = rec && v === rec.hi ? rec.en : v;
        var want = en;
        if (lang === 'hi') {
          var hi = text[norm(en)];
          if (hi === undefined) continue;
          want = hi;
          recs[a] = { en: en, hi: hi };
          attrRec.set(el, recs);
        }
        if (v !== want) el.setAttribute(a, want);
      }
    };

    var doHtml = function (el) {
      if (frozen(el)) return;
      var key = el.getAttribute('data-i18n');
      if (!htmlRec.has(el)) htmlRec.set(el, el.innerHTML);
      var want = lang === 'hi' && html[key] !== undefined ? html[key] : htmlRec.get(el);
      if (el.innerHTML !== want) el.innerHTML = want;
    };

    var walk = function (root) {
      if (root.nodeType === 3) return doText(root);
      if (root.nodeType !== 1) return;
      if (root.hasAttribute('data-i18n')) doHtml(root);
      root.querySelectorAll('[data-i18n]').forEach(doHtml);
      doAttrs(root);
      root.querySelectorAll('[' + ATTRS.join('],[') + ']').forEach(doAttrs);
      var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      var n;
      while ((n = w.nextNode())) doText(n);
    };

    new MutationObserver(function (records) {
      records.forEach(function (r) {
        if (r.type === 'characterData') doText(r.target);
        else if (r.type === 'attributes') doAttrs(r.target);
        else r.addedNodes.forEach(walk);
      });
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });

    var apply = function () {
      document.documentElement.lang = lang;
      walk(document.body);
      if (onChange) onChange(lang);
    };
    apply();

    return {
      lang: function () { return lang; },
      pick: function (en, hi) { return lang === 'hi' ? hi : en; },
      toggle: function () {
        lang = lang === 'en' ? 'hi' : 'en';
        try { localStorage.setItem('kosmik-lang', lang); } catch (e) {}
        apply();
      },
    };
  };
})();
