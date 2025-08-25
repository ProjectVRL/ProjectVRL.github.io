// js/main.js
(() => {
  // ---------- BASE path detection ----------
  const script =
    document.currentScript ||
    Array.from(document.scripts).find(s => s.src && /\/js\/main\.js(\?|$)/.test(s.src));

  let BASE = script?.dataset?.base || '';
  if (!BASE) {
    try {
      const u = new URL(script.src, location.origin);
      BASE = u.pathname.replace(/js\/main\.js(?:\?.*)?$/, '');
      if (!BASE.endsWith('/')) BASE += '/';
    } catch { BASE = '/'; }
  }
  const withBase = (p = '') => BASE + p.replace(/^\//, '');

  // ---------- Header/Footer injection ----------
  async function injectHeaderFooter() {
    try {
      const [headerHTML, footerHTML] = await Promise.all([
        fetch(withBase('components/header.html'), { cache: 'no-store' }).then(r => r.ok ? r.text() : Promise.reject(r)),
        fetch(withBase('components/footer.html'), { cache: 'no-store' }).then(r => r.ok ? r.text() : Promise.reject(r)),
      ]);
      document.body.insertAdjacentHTML('afterbegin', headerHTML);
      document.body.insertAdjacentHTML('beforeend', footerHTML);

      document.querySelectorAll('header nav a[href]').forEach(a => {
        const clean = (a.getAttribute('href') || '').replace(/^\//, '');
        a.setAttribute('href', withBase(clean));
      });
      document.querySelectorAll('header img[data-src]').forEach(img => {
        const clean = (img.getAttribute('data-src') || '').replace(/^\//, '');
        img.src = withBase(clean);
      });
    } catch (err) { console.error('Header/Footer load failed:', err); }
  }

  // ---------- Helpers ----------
  const fetchJSON = (url) => fetch(url, { cache: 'no-store' }).then(r => r.json());
  function emptyStats(t) {
    return { id:t.id, name:t.name, logo:t.logo, color:t.color || null,
      pts:0, wins:0, losses:0, games:0, gf:0, ga:0, gd:0 };
  }
  function pointsFor(teamGames, oppGames, didWin) {
    if (didWin) return 3;
    const maxG = Math.max(teamGames, oppGames), minG = Math.min(teamGames, oppGames);
    return (maxG === 3 && minG === 2) ? 1 : 0;
  }
  // Update a SINGLE row (works for cross-group games)
  function applySeriesTo(row, teamGames, oppGames, didWin) {
    row.games += 1;
    row.gf += teamGames; row.ga += oppGames;
    row.gd = row.gf - row.ga;
    if (didWin) row.wins++; else row.losses++;
    row.pts += pointsFor(teamGames, oppGames, didWin);
  }
  function sortStandings(arr) {
    // PTS ↓, GD ↓, Wins ↓, GF ↓, Name ↑
    return arr.sort((a,b)=>
      b.pts-a.pts || b.gd-a.gd || b.wins-a.wins || b.gf-a.gf || a.name.localeCompare(b.name)
    );
  }
  const groupLetter = (title) => (title?.match(/Group\s+([A-Z])/i)||[])[1]?.toUpperCase() || null;

  // ---------- Schedule page renderer (counts cross-group) ----------
  async function bootSchedulePage() {
    const root = document.getElementById('groups-root');
    if (!root) return;
    const upcomingDiv = document.getElementById('upcoming');

    try {
      const [gData, mData] = await Promise.all([
        fetchJSON(withBase('data/groups.json')),
        fetchJSON(withBase('data/matches.json')),
      ]);
      const groups  = gData?.groups  || [];
      const matches = mData?.matches || [];

      root.innerHTML = '';
      if (upcomingDiv) upcomingDiv.innerHTML = '';

      // Fast lookup: id -> group letter for membership checks (optional)
      const idToGroup = new Map();
      groups.forEach(g => {
        const L = groupLetter(g.title) || '?';
        g.teams.forEach(t => idToGroup.set(t.id, L));
      });

      // Render each group using ALL scored matches that involve its teams
      groups.forEach(g => {
        const map = new Map(g.teams.map(t => [t.id, emptyStats(t)]));
        const teamSet = new Set(g.teams.map(t => t.id));

        matches.forEach(m => {
          const done = Number.isFinite(m.homeScore) && Number.isFinite(m.awayScore);
          if (!done) return;

          const hIn = teamSet.has(m.home);
          const aIn = teamSet.has(m.away);
          if (!hIn && !aIn) return; // not relevant to this group's table

          const hWin = m.homeScore > m.awayScore;
          const aWin = m.awayScore > m.homeScore;

          if (hIn) applySeriesTo(map.get(m.home), m.homeScore, m.awayScore, hWin);
          if (aIn) applySeriesTo(map.get(m.away), m.awayScore, m.homeScore, aWin);
        });

        const tableData = sortStandings([...map.values()]);

        // Build card
        const card = document.createElement('div');
        card.className = 'group-card';
        card.style.setProperty('--accent', g.color || 'var(--brand)');

        const title = document.createElement('div');
        title.className = 'group-title';
        title.textContent = g.title;
        card.appendChild(title);

        const table = document.createElement('table');
        table.className = 'group-table';
        table.innerHTML = `
          <thead>
            <tr>
              <th>Position</th><th>Team Crest</th><th>Team</th>
              <th>PTS</th><th>Wins</th><th>Losses</th><th>Games</th><th>G. Diff</th>
            </tr>
          </thead>
          <tbody></tbody>
        `;
        const tbody = table.querySelector('tbody');

        tableData.forEach((t, idx) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${idx + 1}</td>
            <td><img src="${withBase('logos/' + t.logo)}" alt="${t.name} crest" width="28" height="28" loading="lazy" decoding="async"></td>
            <td style="${t.color ? `background:${t.color};` : ''}"><strong>${t.name}</strong></td>
            <td>${t.pts}</td><td>${t.wins}</td><td>${t.losses}</td><td>${t.games}</td><td>${t.gd}</td>
          `;
          tbody.appendChild(tr);
        });

        card.appendChild(table);
        root.appendChild(card);
      });

      // Upcoming (any match missing a score)
      const upcoming = matches.filter(m => m.homeScore == null || m.awayScore == null);
      if (upcoming.length && upcomingDiv) {
        upcoming.sort((a,b)=>{
          const ad = Date.parse(a.date || ''), bd = Date.parse(b.date || '');
          return (isNaN(ad)?9e12:ad) - (isNaN(bd)?9e12:bd);
        });
        const ul = document.createElement('ul');
        ul.style.listStyle = 'none';
        ul.style.paddingLeft = '0';
        ul.innerHTML = `<h3 style="margin-top:1rem;">Upcoming Matches</h3>`;
        upcoming.forEach(m => {
          const li = document.createElement('li');
          li.style.opacity = '0.85';
          li.textContent = `${m.date || 'TBD'} — ${m.home} vs ${m.away} (Group ${m.group || '—'})`;
          ul.appendChild(li);
        });
        upcomingDiv.appendChild(ul);
      }
    } catch (e) {
      console.error(e);
      root.innerHTML = '<p>Failed to load data.</p>';
    }
  }

  // ---------- Boot ----------
  const start = () => { injectHeaderFooter(); bootSchedulePage(); };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else { start(); }
})();
