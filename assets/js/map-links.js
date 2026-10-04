/* Ouvre les adresses dans l’application cartographique du téléphone,
   puis conserve Google Maps comme solution de repli si le schéma local
   n’est pas pris en charge. */
(function () {
  'use strict';

  var FALLBACK_DELAY = 1200;

  function isIOS() {
    var ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function isAndroid() {
    return /Android/i.test(navigator.userAgent || '');
  }

  function appMapUrl(address) {
    var encoded = encodeURIComponent(address);
    if (isIOS()) return 'maps://?address=' + encoded;
    if (isAndroid()) return 'geo:0,0?q=' + encoded;
    return '';
  }

  function openFallback(link, fallback) {
    var opened = window.open(fallback, '_blank', 'noopener,noreferrer');
    if (!opened) window.location.assign(fallback);
  }

  function openDeviceMap(event, link) {
    var address = link.getAttribute('data-map-address');
    var fallback = link.getAttribute('href');
    var appUrl = address && appMapUrl(address);
    if (!appUrl) return;

    event.preventDefault();

    /* Sur iOS/iPadOS, Safari ne signale pas toujours le passage vers Plans
       par visibilitychange. Le minuteur de repli finissait donc par ouvrir
       Google Maps même lorsque maps:// avait bien été accepté et que Plans
       était en train de s’ouvrir. Plans est l’application native attendue
       sur ces appareils : on lui laisse la navigation sans lancer un faux
       repli après 1,2 s. */
    if (isIOS()) {
      try {
        window.location.assign(appUrl);
      } catch (error) {
        openFallback(link, fallback);
      }
      return;
    }

    var settled = false;
    var timer;

    function cleanUp() {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    }

    function onVisibility() {
      if (document.hidden) cleanUp();
    }

    document.addEventListener('visibilitychange', onVisibility);
    timer = window.setTimeout(function () {
      if (settled) return;
      cleanUp();
      openFallback(link, fallback);
    }, FALLBACK_DELAY);

    try {
      window.location.assign(appUrl);
    } catch (error) {
      cleanUp();
      openFallback(link, fallback);
    }
  }

  document.addEventListener('click', function (event) {
    var target = event.target;
    var link = target && target.closest ? target.closest('a[data-default-map]') : null;
    if (link) openDeviceMap(event, link);
  }, true);
})();
