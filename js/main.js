// js/main.js
(() => {
  // Determine BASE from this script's URL (works for root or /repo/ and subpages).
  const script =
    document.currentScript ||
    Array.from(document.scripts).find(s => s.src && s.src.endsWith('/js/main.js'));

  let BASE = script?.dataset?.base || '';
  if (!BASE) {
    try {
      const u = new URL(script.src, location.origin);
      BASE = u.pathname.replace(/js\/main\.js(?:\?.*)?$/, '');
      if (!BASE.endsWith('/')) BASE += '/';
    } catch {
      BASE = '/';
    }
  }

  const withBase = (p) => BASE + (p || '').replace(/^\//, '');

  async function injectHeaderFooter() {
    try {
      const [headerHTML, footerHTML] = await Promise.all([
        fetch(withBase('components/header.html'), { cache: 'no-store' }).then(r => r.ok ? r.text() : Promise.reject(r)),
        fetch(withBase('components/footer.html'), { cache: 'no-store' }).then(r => r.ok ? r.text() : Promise.reject(r)),
      ]);

      document.body.insertAdjacentHTML('afterbegin', headerHTML);
      document.body.insertAdjacentHTML('beforeend', footerHTML);

      // Normalize nav links to include BASE (so they work from any subdirectory).
      document.querySelectorAll('header nav a[href]').forEach(a => {
        const clean = (a.getAttribute('href') || '').replace(/^\//, '');
        a.setAttribute('href', withBase(clean));
      });
    } catch (err) {
      console.error('Header/Footer load failed:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectHeaderFooter, { once: true });
  } else {
    injectHeaderFooter();
  }
})();
