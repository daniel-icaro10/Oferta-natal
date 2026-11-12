/* Pixel da Meta — Ligação do Papai Noel. Preencha o ID abaixo para ativar. */
(function () {
  var ID = '1876174250463589'; // Pixel "Ligação Papai Noel"
  window.META_PIXEL_ID = ID;
  if (!ID) return;
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
    t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', ID);
  fbq('track', 'PageView');
})();
