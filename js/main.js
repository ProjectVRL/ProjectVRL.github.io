// js/main.js
(function () {
  // Prefer explicit override if you ever want it:
  // <script src="js/main.js" data-base="/" defer></script>
  const scriptEl =
    document.currentScript ||
    Array.from(document.scripts).find(s => s.src && s.src.endsWith('/js/main.js'));

  let BASE = scriptEl?.dataset?.base || '';
  if (!BASE) {
    const u = new URL(scriptEl.src, location.origin);
    // e.g. /repo/js/main.js  -> /repo/
    //      /js/main.js       -> /
    BASE = u.pathname.replace(/js\/main\.js(?:\?.*)?$/, '');
    if (!BASE.endsWith('/')) BASE += '/';
  }

  const withBase = (p) => BASE + p.replace(/^\//, '');

  Promise.all([
    fetch(withBase('components/header.html')).then(r => r.ok ? r.text() : Promise.reject(r)),
    fetch(withBase('components/footer.html')).then(r => r.ok ? r.text() : Promise.reject(r)),
  ])
    .then(([headerHTML, footerHTML]) => {
      document.body.insertAdjacentHTML('afterbegin', headerHTML);
      document.body.insertAdjacentHTML('beforeend', footerHTML);

      // Normalize header nav links to include BASE
      document.querySelectorAll('header nav a[href]').forEach(a => {
        const clean = a.getAttribute('href').replace(/^\//, '');
        a.setAttribute('href', withBase(clean));
      });
    })
    .catch(err => {
      console.error('Failed to load header/footer', err);
    });
})();
