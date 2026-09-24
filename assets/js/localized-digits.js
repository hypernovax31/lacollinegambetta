/* Chiffres d’affichage localisés ==========================================
   Les valeurs fonctionnelles (href, date ISO, téléphone, données Firebase)
   restent ASCII dans le DOM et dans les attributs techniques. Seul le rendu
   visible et accessible est transcrit dans l’écriture de la langue choisie. */
(function () {
  'use strict';

  var DIGITS = {
    ar: '٠١٢٣٤٥٦٧٨٩',
    hi: '०१२३४५६७८९',
    zh: '〇一二三四五六七八九',
    ja: '〇一二三四五六七八九',
    ko: '영일이삼사오육칠팔구'
  };
  /* L’ukrainien n’a pas de glyphes numériques distincts dans son usage
     contemporain : les chiffres sont donc écrits en toutes lettres
     cyrilliques, afin qu’aucun chiffre latin ne reste affiché. */
  var WORD_DIGITS = {
    uk: ['нуль', 'один', 'два', 'три', 'чотири', 'п’ять', 'шість', 'сім', 'вісім', 'дев’ять']
  };

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function localizeDisplayDigits(value, lang) {
    var text = String(value == null ? '' : value);
    var words = WORD_DIGITS[lang];
    if (words) {
      return text.replace(/[0-9]+/g, function (token) {
        return token.split('').map(function (digit) { return words[parseInt(digit, 10)]; }).join(' ');
      });
    }
    var map = DIGITS[lang];
    if (!map) return text;
    return text.replace(/[0-9]/g, function (digit) {
      return map.charAt(parseInt(digit, 10));
    });
  }

  function skipTextNode(node) {
    var parent = node && node.parentElement;
    while (parent && parent !== document.body) {
      if (/^(SCRIPT|STYLE|NOSCRIPT|CODE|PRE|TEXTAREA)$/.test(parent.tagName)) return true;
      if (parent.classList && (parent.classList.contains('lang-menu') || parent.classList.contains('legal-lang-menu'))) return true;
      parent = parent.parentElement;
    }
    return false;
  }

  function localizeTextNode(node, lang) {
    if (!node || node.nodeType !== 3 || skipTextNode(node)) return;
    var current = node.nodeValue;
    var next = localizeDisplayDigits(current, lang);
    if (next !== current) node.nodeValue = next;
  }

  function localizeTree(root, lang) {
    if (!root) return;
    var owner = root.ownerDocument || document;
    var start = root.nodeType === 3 ? root : root;
    if (start.nodeType === 3) {
      localizeTextNode(start, lang);
    } else {
      var walker = owner.createTreeWalker(start, NodeFilter.SHOW_TEXT, null);
      var node;
      while ((node = walker.nextNode())) localizeTextNode(node, lang);
    }
    var title = owner.querySelector ? owner.querySelector('title') : null;
    if (title && title.firstChild) localizeTextNode(title.firstChild, lang);
    localizeVisibleAttributes(root, lang);
  }

  function localizeVisibleAttributes(root, lang) {
    if (!root) return;
    var elements = [];
    if (root.nodeType === 1 && root.matches && root.matches('[title],[aria-label],[placeholder]')) {
      elements.push(root);
    }
    if (root.querySelectorAll) {
      var descendants = root.querySelectorAll('[title],[aria-label],[placeholder]');
      for (var di = 0; di < descendants.length; di++) elements.push(descendants[di]);
    }
    for (var i = 0; i < elements.length; i++) {
      var element = elements[i];
      ['title', 'aria-label', 'placeholder'].forEach(function (attribute) {
        if (!element.hasAttribute(attribute)) return;
        var current = element.getAttribute(attribute);
        var next = localizeDisplayDigits(current, lang);
        if (next !== current) element.setAttribute(attribute, next);
      });
    }
  }

  function installObserver(getLang) {
    if (!window.MutationObserver || !document.body || document.body.__lcgDigitObserver) return;
    var observer = new MutationObserver(function (mutations) {
      var lang = typeof getLang === 'function' ? getLang() : document.documentElement.lang || 'fr';
      mutations.forEach(function (mutation) {
        if (mutation.type === 'characterData') {
          localizeTextNode(mutation.target, lang);
        } else if (mutation.type === 'attributes') {
          var element = mutation.target;
          var attribute = mutation.attributeName;
          if (element.hasAttribute(attribute)) {
            var current = element.getAttribute(attribute);
            var next = localizeDisplayDigits(current, lang);
            if (next !== current) element.setAttribute(attribute, next);
          }
        } else {
          for (var i = 0; i < mutation.addedNodes.length; i++) {
            var added = mutation.addedNodes[i];
            if (added.nodeType === 3) localizeTextNode(added, lang);
            else if (added.nodeType === 1) localizeTree(added, lang);
          }
        }
      });
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['title', 'aria-label', 'placeholder']
    });
    document.body.__lcgDigitObserver = observer;
  }

  window.LCGLocalizeDisplayDigits = localizeDisplayDigits;
  window.LCGLocalizeAllDisplayDigits = localizeTree;
  window.LCGInstallDisplayDigitObserver = installObserver;
  window.LCGDisplayDigitMaps = DIGITS;
})();
