// Compute correct base for GitHub Project Pages (username.github.io/repo)
// vs user/custom domains (root).
const parts = location.pathname.split('/').filter(Boolean);
const isGhProject = location.hostname.endsWith('github.io') && parts.length > 0;
const BASE = isGhProject ? `/${parts[0]}/` : '/';

const withBase = (p) => BASE + p.replace(/^\//, '');

// Fetch header & footer concurrently
Promise.all([
  fetch(withBase('components/header.html')).then(r => r.text()),
  fetch(withBase('components/footer.html')).then(r => r.text())
]).then(([headerHTML, footerHTML]) => {
  document.body.insertAdjacentHTML('afterbegin', headerHTML);
  document.body.insertAdjacentHTML('beforeend', footerHTML);

  // Normalize all header nav links to include BASE
  document.querySelectorAll('header nav a[href]').forEach(a => {
    const clean = a.getAttribute('href').replace(/^\//, '');
    a.setAttribute('href', withBase(clean));
  });
}).catch(console.error);
