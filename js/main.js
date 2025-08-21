// js/main.js
(() => {
  // ---------- BASE path detection (works from root or subfolders) ----------
  const script =
    document.currentScript ||
    Array.from(document.scripts).find(s => s.src && /\/js\/main\.js(\?|$)/.test(s.src));

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

      // Normalize nav links to include BASE (so they work from any subdirectory).
      document.querySelectorAll('header nav a[href]').forEach(a => {
        const clean = (a.getAttribute('href') || '').replace(/^\//, '');
        a.setAttribute('href', withBase(clean));
      });

      // Resolve header logo paths from data-src using BASE (works on subpages).
      document.querySelectorAll('header img[data-src]').forEach(img => {
        const clean = (img.getAttribute('data-src') || '').replace(/^\//, '');
        img.src = withBase(clean);
      });
    } catch (err) {
      console.error('Header/Footer load failed:', err);
    }
  }

  // ---------- Helpers ----------
  const fetchJSON = (url) => fetch(url, { cache: 'no-store' }).then(r => r.json());
  const by = (keyFn) => (a, b) => keyFn(a) - keyFn(b);

  // ---------- Standings logic (3/1/0 with BO5 loser point) ----------
  function emptyStats(t) {
    return {
      id: t.id, name: t.name, logo: t.logo, color: t.color || null,
      pts: 0, wins: 0, losses: 0, games: 0, gf: 0, ga: 0, gd: 0
    };
  }

  // 3 for win; 1 if loss in 3–2; otherwise 0.
  function pointsFor(teamGames, oppGames, didWin) {
    if (didWin) return 3;
    const maxG = Math.max(teamGames, oppGames), minG = Math.min(teamGames, oppGames);
    return (maxG === 3 && minG === 2) ? 1 : 0;
  }

  function applySeries(map, homeId, awayId, hs, as) {
    const H = map.get(homeId), A = map.get(awayId);
    if (!H || !A) return;                         // guard against id mismatch
    H.games++; A.games++;
    H.gf += hs; H.ga += as; A.gf += as; A.ga += hs;
    H.gd = H.gf - H.ga; A.gd = A.gf - A.ga;

    const hWin = hs > as, aWin = as > hs;
    if (hWin) { H.wins++; A.losses++; } else if (aWin) { A.wins++; H.losses++; }

    H.pts += pointsFor(hs, as, hWin);
    A.pts += pointsFor(as, hs, aWin);
  }

  function sortStandings(rows) {
    // PTS desc → GD desc → Wins desc → GF desc → Name asc
    return rows.sort((x, y) =>
      y.pts - x.pts ||
      y.gd - x.gd ||
      y.wins - x.wins ||
      y.gf - x.gf ||
      x.name.localeCompare(y.name)
    );
  }

  const groupLetter = (title) => {
    const m = /Group\s+([A-Z])/i.exec(title || '');
    return m ? m[1].toUpperCase() : null;
  };

  // ---------- Schedule page renderer ----------
  async function bootSchedulePage() {
    const root = document.getElementById('groups-root');
    if (!root) return; // Not the schedule page

    const upcomingDiv = document.getElementById('upcoming');

    try {
      const [gData, mData] = await Promise.all([
        fetchJSON(withBase('data/groups.json')),
        fetchJSON(withBase('data/matches.json')),
      ]);
      const groups = gData?.groups || [];
      const matches = mData?.matches || [];

      root.innerHTML = '';
      upcomingDiv && (upcomingDiv.innerHTML = '');

      // Index matches by group letter
      const matchesByGroup = matches.reduce((acc, m) => {
        (acc[m.group] ||= []).push(m);
        return acc;
      }, {});

      // Render each group card
      groups.forEach(g => {
        const letter = groupLetter(g.title);
        const map = new Map(g.teams.map(t => [t.id, emptyStats(t)]));
        (matchesByGroup[letter] || []).forEach(m => {
          if (Number.isFinite(m.homeScore) && Number.isFinite(m.awayScore)) {
            applySeries(map, m.home, m.away, m.homeScore, m.awayScore);
          }
        });

        const tableData = sortStandings([...map.values()]);

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

      // Upcoming list (matches missing a score)
      const upcoming = matches.filter(m => m.homeScore == null || m.awayScore == null);
      if (upcoming.length && upcomingDiv) {
        const ul = document.createElement('ul');
        ul.style.listStyle = 'none';
        ul.style.paddingLeft = '0';
        const h3 = document.createElement('h3');
        h3.style.marginTop = '1rem';
        h3.textContent = 'Upcoming Matches';
        ul.appendChild(h3);

        // Sort by date if present
        upcoming.sort((a, b) => {
          const ad = Date.parse(a.date || ''), bd = Date.parse(b.date || '');
          return (isNaN(ad) ? 9e12 : ad) - (isNaN(bd) ? 9e12 : bd);
        });

        upcoming.forEach(m => {
          const li = document.createElement('li');
          li.style.opacity = '0.85';
          li.textContent = `Group ${m.group}: ${m.home} vs ${m.away} — ${m.date || 'TBD'}`;
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
  const start = () => {
    injectHeaderFooter();
    bootSchedulePage();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
