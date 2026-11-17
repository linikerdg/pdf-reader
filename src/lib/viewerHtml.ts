/** Template puro do leitor (sem dependências do Expo, testável fora do app). */
export type ViewerHtmlInput = {
  lib: string;
  worker: string;
  pdfBase64: string;
  initialPage: number;
  dark: boolean;
};

const safeScript = (code: string) => code.replace(/<\/script/gi, '<\\/script');

export function renderViewerHtml(opts: ViewerHtmlInput): string {
  const { lib, worker, pdfBase64 } = opts;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes" />
<style>
  html, body { margin: 0; padding: 0; background: #e9e9ee; -webkit-tap-highlight-color: transparent; }
  body.dark { background: #121214; }
  #pages { padding: 8px 0 96px; width: 100vw; overflow-x: auto; box-sizing: border-box; }
  .page { position: relative; margin: 0 auto 10px; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.18); }
  body.dark .page { background: #1d1d20; box-shadow: none; }
  .page canvas { position: relative; z-index: 1; display: block; width: 100%; height: 100%; }
  body.dark .page canvas { filter: invert(0.92) hue-rotate(180deg); }
  .num { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
         color: #aaa; font: 14px -apple-system, Roboto, sans-serif; }
</style>
</head>
<body class="${opts.dark ? 'dark' : ''}">
<div id="pages"></div>
<script>${safeScript(lib)}</script>
<script>
(function () {
  var post = function (m) { window.ReactNativeWebView.postMessage(JSON.stringify(m)); };
  var workerCode = ${JSON.stringify(worker)};
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' }));

  var container = document.getElementById('pages');
  var doc = null, total = 0, zoom = 1, baseW = 0, baseH = 0;
  var slots = [];          // { el, rendered, task, w, h }
  var currentPage = 0;
  var dpr = Math.min(window.devicePixelRatio || 1, 3);

  function fitWidth() { return Math.min(container.clientWidth - 16, 1000); }

  function layout() {
    var w = fitWidth() * zoom;
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      var ratio = (s.h || baseH) / (s.w || baseW);
      s.el.style.width = w + 'px';
      s.el.style.height = (w * ratio) + 'px';
    }
  }

  function unrender(s) {
    if (s.task) { try { s.task.cancel(); } catch (e) {} s.task = null; }
    var c = s.el.querySelector('canvas');
    if (c) { c.width = 0; c.height = 0; c.remove(); }
    s.rendered = false;
  }

  function render(i) {
    var s = slots[i];
    if (s.rendered) return;
    s.rendered = true;
    doc.getPage(i + 1).then(function (page) {
      var vp1 = page.getViewport({ scale: 1 });
      if (vp1.width !== s.w || vp1.height !== s.h) { s.w = vp1.width; s.h = vp1.height; layout(); }
      var cssW = parseFloat(s.el.style.width);
      var scale = (cssW / vp1.width) * dpr;
      // limita o tamanho do canvas para não estourar memória em zoom alto
      var maxPixels = 16e6;
      var vp = page.getViewport({ scale: scale });
      if (vp.width * vp.height > maxPixels) {
        scale *= Math.sqrt(maxPixels / (vp.width * vp.height));
        vp = page.getViewport({ scale: scale });
      }
      var canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      s.task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
      return s.task.promise.then(function () {
        s.task = null;
        if (!s.rendered) return;
        var old = s.el.querySelector('canvas');
        if (old) old.remove();
        s.el.appendChild(canvas);
      });
    }).catch(function (e) {
      if (e && e.name === 'RenderingCancelledException') return;
      s.rendered = false;
    });
  }

  function update() {
    if (!slots.length) return;
    var vh = window.innerHeight, mid = window.scrollY + vh / 2;
    var best = 0, bestDist = Infinity;
    for (var i = 0; i < slots.length; i++) {
      var r = slots[i].el.getBoundingClientRect();
      var top = r.top + window.scrollY, bottom = top + r.height;
      // renderiza o que está visível + 1 tela de margem, descarta o resto
      if (r.bottom > -vh && r.top < vh * 2) render(i);
      else if (slots[i].rendered && (r.bottom < -vh * 3 || r.top > vh * 4)) unrender(slots[i]);
      var d = mid < top ? top - mid : mid > bottom ? mid - bottom : 0;
      if (d < bestDist) { bestDist = d; best = i; }
    }
    if (best + 1 !== currentPage) {
      currentPage = best + 1;
      post({ type: 'page', page: currentPage, total: total });
    }
  }

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; update(); });
  }, { passive: true });

  window.goToPage = function (n) {
    n = Math.max(1, Math.min(total, n | 0));
    var el = slots[n - 1].el;
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 8);
    update();
  };

  window.setZoom = function (z) {
    var keep = currentPage || 1;
    zoom = Math.max(0.5, Math.min(4, z));
    for (var i = 0; i < slots.length; i++) unrender(slots[i]);
    layout();
    window.goToPage(keep);
    post({ type: 'zoom', zoom: zoom });
  };

  window.setDark = function (on) { document.body.classList.toggle('dark', !!on); };

  window.addEventListener('resize', function () {
    if (!doc) return;
    var keep = currentPage || 1;
    for (var i = 0; i < slots.length; i++) unrender(slots[i]);
    layout();
    window.goToPage(keep);
  });

  var data = atob(${JSON.stringify(pdfBase64)});
  var bytes = new Uint8Array(data.length);
  for (var k = 0; k < data.length; k++) bytes[k] = data.charCodeAt(k);
  data = null;

  pdfjsLib.getDocument({ data: bytes }).promise.then(function (d) {
    doc = d; total = d.numPages;
    return d.getPage(1);
  }).then(function (p1) {
    var vp = p1.getViewport({ scale: 1 });
    baseW = vp.width; baseH = vp.height;
    for (var i = 0; i < total; i++) {
      var el = document.createElement('div');
      el.className = 'page';
      el.innerHTML = '<div class="num">' + (i + 1) + '</div>';
      container.appendChild(el);
      slots.push({ el: el, rendered: false, task: null, w: 0, h: 0 });
    }
    layout();
    post({ type: 'loaded', total: total });
    window.goToPage(${Math.max(1, Math.floor(opts.initialPage))});
  }).catch(function (e) {
    post({
      type: 'error',
      message: (e && e.message) || String(e),
      password: !!(e && e.name === 'PasswordException'),
    });
  });
})();
</script>
</body>
</html>`;
}
