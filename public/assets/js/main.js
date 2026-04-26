
    // ════════════════════════════════════════════════════════════════════════
    // Utilities
    // ════════════════════════════════════════════════════════════════════════
    const fmt = (n, d = 2) => (n == null ? '—' : parseFloat(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }));
    const fmtDate = iso => iso ? new Date(iso).toLocaleString() : '—';
    const setRefreshTime = id => { const el = document.getElementById(id); if (el) el.textContent = 'Updated: ' + new Date().toLocaleTimeString(); };

    // ════════════════════════════════════════════════════════════════════════
    // Navigation
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll('nav a').forEach(link => {
    link.addEventListener('click', e => {
        e.preventDefault();
        document.querySelectorAll('nav a').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById('page-' + link.dataset.page).classList.add('active');
        if (link.dataset.page === 'watchlist') loadWatchlist();
        if (link.dataset.page === 'trades')    loadTrades();
        if (link.dataset.page === 'logs')      loadLogs();
        if (link.dataset.page === 'settings')  loadSettings();
    });
});

    // ════════════════════════════════════════════════════════════════════════
    // Dashboard
    // ════════════════════════════════════════════════════════════════════════
    async function loadDashboard() {
    try {
    const res  = await fetch('/api/dashboard');
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Server error');
    document.getElementById('offline-banner').style.display = 'none';
    const data = json.data;

    // Balance cards
    document.getElementById('stat-total-balance').textContent = '$' + fmt(data.totalBalance);
    document.getElementById('stat-total-balance-sub').textContent =
    `USDT $${fmt(data.usdtBalance)} + Crypto $${fmt(data.cryptoValue)}`;
    document.getElementById('stat-balance').textContent = '$' + fmt(data.usdtBalance);
    document.getElementById('stat-crypto-value').textContent = '$' + fmt(data.cryptoValue);

    // PnL card
    const pnlEl = document.getElementById('stat-pnl');
    const pnlSign = data.totalPnl >= 0 ? '+' : '';
    pnlEl.textContent = pnlSign + fmt(data.totalPnl) + ' USDT';
    pnlEl.className = 'value ' + (data.totalPnl >= 0 ? 'green' : 'red');
    const rSign = data.realizedPnl >= 0 ? '+' : '';
    const uSign = data.unrealizedPnl >= 0 ? '+' : '';
    document.getElementById('stat-pnl-sub').textContent =
    `R: ${rSign}${fmt(data.realizedPnl)} / U: ${uSign}${fmt(data.unrealizedPnl)}`;

    // Other cards
    document.getElementById('stat-open').textContent = data.openTrades.length;

    const wrEl = document.getElementById('stat-winrate');
    if (data.winRate !== null) {
    wrEl.textContent = fmt(data.winRate, 1) + '%';
    wrEl.className = 'value ' + (data.winRate >= 50 ? 'green' : 'red');
    document.getElementById('stat-winrate-sub').textContent =
    `${data.closedTrades} closed trade${data.closedTrades !== 1 ? 's' : ''}`;
} else {
    wrEl.textContent = '—';
    wrEl.className = 'value';
    document.getElementById('stat-winrate-sub').textContent = 'no closed trades yet';
}

    // Bot toggle button
    const toggleBtn = document.getElementById('btn-bot-toggle');
    if (data.isRunning) {
    toggleBtn.textContent = '⏹ Stop Bot';
    toggleBtn.className = 'btn danger';
} else {
    toggleBtn.textContent = '▶ Start Bot';
    toggleBtn.className = 'btn primary';
}

    // Holdings section
    const holdingsEl = document.getElementById('holdings-section');
    if (!data.cryptoAssets?.length) {
    holdingsEl.innerHTML = '';
} else {
    holdingsEl.innerHTML = `
        <div class="section-header" style="margin-top:1.25rem">
          <h2>Holdings</h2>
          <div style="display:flex;gap:.5rem">
            <button class="btn" id="btn-sell-selected">Sell Selected</button>
            <button class="btn danger" id="btn-sell-all">Sell All</button>
          </div>
        </div>
        <div class="table-wrap" style="margin-bottom:1.75rem">
          <table>
            <thead><tr>
              <th style="width:36px"><input type="checkbox" id="chk-select-all" title="Select all"></th>
              <th>Asset</th><th>Quantity</th><th>Current Price</th><th>Value (USDT)</th>
            </tr></thead>
            <tbody>${data.cryptoAssets.map(a => `<tr>
              <td><input type="checkbox" class="holding-chk" data-id="${a.tradeId || ''}" data-symbol="${a.symbol}"></td>
              <td style="font-weight:600;color:#f0f6fc">${a.asset}</td>
              <td>${fmt(a.quantity, 6)}</td>
              <td>$${fmt(a.currentPrice)}</td>
              <td style="font-weight:600">$${fmt(a.valueUsdt)}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>`;

    document.getElementById('chk-select-all').addEventListener('change', e => {
    document.querySelectorAll('.holding-chk').forEach(c => c.checked = e.target.checked);
});

    document.getElementById('btn-sell-selected').addEventListener('click', async () => {
    const ids = [...document.querySelectorAll('.holding-chk:checked')].map(c => c.dataset.id).filter(Boolean);
    if (!ids.length) return alert('Select at least one position.');
    await sellTrades(ids);
});

    document.getElementById('btn-sell-all').addEventListener('click', async () => {
    if (!confirm('Sell ALL open positions?')) return;
    await sellAllTrades();
});
}

    const grid = document.getElementById('open-trades-grid');
    if (!data.openTrades.length) {
    grid.innerHTML = '<p style="color:#8b949e;font-size:.875rem">No open positions.</p>';
} else {
    grid.innerHTML = data.openTrades.map(t => {
    const upnl = t.unrealizedPnl;
    const upnlColor = upnl == null ? '' : upnl >= 0 ? 'color:#3fb950' : 'color:#f85149';
    const upnlText  = upnl == null ? '—' : (upnl >= 0 ? '+' : '') + fmt(upnl) + ' USDT';
    return `<div class="open-trade-card">
          <div class="card-header">
            <span class="symbol">${t.symbol}</span>
            <span class="badge badge-open">OPEN</span>
          </div>
          <div class="grid2">
            <div class="item"><div class="lbl">Entry Price</div><div class="val">$${fmt(t.entryPrice)}</div></div>
            <div class="item"><div class="lbl">Current Price</div><div class="val">$${fmt(t.currentPrice)}</div></div>
            <div class="item"><div class="lbl">Quantity</div><div class="val">${fmt(t.quantity, 6)}</div></div>
            <div class="item"><div class="lbl">Position Value</div><div class="val">$${fmt(t.positionValue)}</div></div>
            <div class="item"><div class="lbl">Unrealized PnL</div><div class="val" style="${upnlColor}">${upnlText}</div></div>
            <div class="item"><div class="lbl">Stop Loss</div><div class="val red">$${fmt(t.stopLoss)}</div></div>
            <div class="item"><div class="lbl">Take Profit</div><div class="val green">$${fmt(t.takeProfit)}</div></div>
            <div class="item"><div class="lbl">Entry Time</div><div class="val" style="font-size:.8rem">${fmtDate(t.entryTime)}</div></div>
          </div>
        </div>`;
}).join('');
}

    setRefreshTime('dash-refresh-time');
} catch (err) {
    document.getElementById('offline-banner').style.display = 'block';
}
}

    // ════════════════════════════════════════════════════════════════════════
    // Watchlist
    // ════════════════════════════════════════════════════════════════════════
    let wlSortCol = null, wlSortDir = 1;

    function renderWatchlist(data) {
    let rows = [...data];
    if (wlSortCol) {
    rows.sort((a, b) => {
    const av = a[wlSortCol] ?? '';
    const bv = b[wlSortCol] ?? '';
    return typeof av === 'number' ? (av - bv) * wlSortDir : av.toString().localeCompare(bv.toString()) * wlSortDir;
});
}

    const tbody = document.getElementById('wl-tbody');
    tbody.innerHTML = rows.map(r => {
    if (r.error) return `<tr><td>${r.symbol}</td><td colspan="10" style="color:#f85149">${r.error}</td></tr>`;
    const rsi15Class = r.rsi15m < 30 ? 'rsi-low' : r.rsi15m > 70 ? 'rsi-high' : 'rsi-mid';
    const rsi5Class  = r.rsi5m  < 35 ? 'rsi-low' : r.rsi5m  > 65 ? 'rsi-high' : 'rsi-mid';
    const pos = r.hasOpenTrade
    ? `<span class="badge badge-active">&#9679; ${r.openStrategy?.toUpperCase() || 'ACTIVE'}</span>`
    : '<span style="color:#8b949e;font-size:.78rem">—</span>';
    return `<tr>
      <td style="font-weight:600;color:#f0f6fc">${r.symbol}</td>
      <td>$${fmt(r.price)}</td>
      <td style="color:#8b949e">$${fmt(r.ema50)}</td>
      <td style="color:#8b949e">$${fmt(r.ema200)}</td>
      <td class="${rsi15Class}">${fmt(r.rsi15m, 1)}</td>
      <td><span class="signal-${r.signal15m}">${r.signal15m}</span></td>
      <td style="color:#8b949e">$${fmt(r.ema9)}</td>
      <td style="color:#8b949e">$${fmt(r.ema21)}</td>
      <td class="${rsi5Class}">${fmt(r.rsi5m, 1)}</td>
      <td><span class="signal-${r.signal5m}">${r.signal5m}</span></td>
      <td>${pos}</td>
    </tr>`;
}).join('');

    // Update sort icons
    document.querySelectorAll('#wl-table thead th.sortable').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.col === wlSortCol) th.classList.add(wlSortDir === 1 ? 'sort-asc' : 'sort-desc');
});
}

    let wlData = [];
    let _wlLoading = false;
    async function loadWatchlist() {
    if (_wlLoading) return;
    _wlLoading = true;
    const tbody = document.getElementById('wl-tbody');
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:#8b949e">Fetching indicators…</td></tr>';
    try {
    const res  = await fetch('/api/watchlist');
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Server error');
    wlData = json.data;
    renderWatchlist(wlData);
    setRefreshTime('wl-refresh-time');
    loadDashboard();
    loadTrades();
} catch (err) {
    console.error('Watchlist error:', err);
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;color:#f85149">Failed to load watchlist: ${err.message}</td></tr>`;
} finally {
    _wlLoading = false;
}
}

    document.querySelectorAll('#wl-table thead th.sortable').forEach(th => {
    th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (wlSortCol === col) wlSortDir *= -1;
        else { wlSortCol = col; wlSortDir = 1; }
        renderWatchlist(wlData);
    });
});

    // ════════════════════════════════════════════════════════════════════════
    // Trades — with filter + sort
    // ════════════════════════════════════════════════════════════════════════
    let allTrades = [];
    let tradeSort = { col: 'entryTime', dir: -1 };

    function populateSymbolFilter(watchlist) {
    const sel = document.getElementById('filter-symbol');
    const current = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    (watchlist || []).forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    sel.appendChild(opt);
});
    if (current) sel.value = current;
}

    function getTradeFilters() {
    return {
    symbol:   document.getElementById('filter-symbol').value,
    strategy: document.getElementById('filter-strategy').value,
    status:   document.getElementById('filter-status').value,
    reason:   document.getElementById('filter-reason').value,
    search:   document.getElementById('filter-search').value.trim().toLowerCase(),
};
}

    function applyTradeFilters(trades) {
    const f = getTradeFilters();
    return trades.filter(t => {
    if (f.symbol   && t.symbol !== f.symbol) return false;
    if (f.strategy && (t.strategy || '15m') !== f.strategy) return false;
    if (f.status   && t.status !== f.status) return false;
    if (f.reason   && t.closeReason !== f.reason) return false;
    if (f.search   && !t.id.toLowerCase().includes(f.search)) return false;
    return true;
});
}

    function applySortTrades(trades) {
    return [...trades].sort((a, b) => {
    let av = a[tradeSort.col], bv = b[tradeSort.col];
    if (av == null) av = tradeSort.dir === 1 ? Infinity : -Infinity;
    if (bv == null) bv = tradeSort.dir === 1 ? Infinity : -Infinity;
    if (typeof av === 'string') return av.localeCompare(bv) * tradeSort.dir;
    return (av - bv) * tradeSort.dir;
});
}

    function renderTrades() {
    const filtered = applyTradeFilters(allTrades);
    const sorted   = applySortTrades(filtered);
    const tbody    = document.getElementById('trades-tbody');
    const countEl  = document.getElementById('trades-count');
    countEl.textContent = `Showing ${sorted.length} of ${allTrades.length} trades`;

    if (!sorted.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="11">No trades match the current filters.</td></tr>';
    return;
}

    tbody.innerHTML = sorted.map(t => {
    const statusBadge = t.status === 'OPEN'
    ? '<span class="badge badge-open">OPEN</span>'
    : '<span class="badge badge-closed">CLOSED</span>';
    const strategyBadge = t.strategy === '5m'
    ? '<span class="badge" style="background:#d2992222;color:#d29922">5m Bounce</span>'
    : '<span class="badge" style="background:#388bfd22;color:#388bfd">15m Trend</span>';
    const pnl = typeof t.pnl === 'number'
    ? `<span style="color:${t.pnl >= 0 ? '#3fb950' : '#f85149'}">${t.pnl >= 0 ? '+' : ''}${fmt(t.pnl)}</span>`
    : '—';
    return `<tr>
      <td style="font-family:monospace;font-size:.78rem">${t.id}</td>
      <td style="font-weight:600;color:#f0f6fc">${t.symbol}</td>
      <td>${strategyBadge}</td>
      <td>${statusBadge}</td>
      <td>${fmtDate(t.entryTime)}</td>
      <td>$${fmt(t.entryPrice)}</td>
      <td>${fmtDate(t.exitTime)}</td>
      <td>${t.exitPrice ? '$' + fmt(t.exitPrice) : '—'}</td>
      <td>${fmt(t.quantity, 6)}</td>
      <td>${pnl}</td>
      <td>${t.closeReason || '—'}</td>
    </tr>`;
}).join('');

    // Update sort icons
    document.querySelectorAll('#trades-table thead th.sortable').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.col === tradeSort.col) th.classList.add(tradeSort.dir === 1 ? 'sort-asc' : 'sort-desc');
});
}

    async function loadTrades() {
    try {
    const res  = await fetch('/api/trades');
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Server error');
    const data = json.data;
    allTrades = data; // already newest-first from server, we re-sort client-side
    renderTrades();
    setRefreshTime('trades-refresh-time');
} catch (err) { console.error('Trades error:', err); }
}

    // Sort on header click
    document.querySelectorAll('#trades-table thead th.sortable').forEach(th => {
    th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (tradeSort.col === col) tradeSort.dir *= -1;
        else { tradeSort.col = col; tradeSort.dir = -1; }
        renderTrades();
    });
});

    // Filter inputs
    ['filter-symbol','filter-strategy','filter-status','filter-reason'].forEach(id => {
    document.getElementById(id).addEventListener('change', renderTrades);
});
    document.getElementById('filter-search').addEventListener('input', renderTrades);
    document.getElementById('btn-clear-filters').addEventListener('click', () => {
    document.getElementById('filter-symbol').value   = '';
    document.getElementById('filter-strategy').value = '';
    document.getElementById('filter-status').value   = '';
    document.getElementById('filter-reason').value   = '';
    document.getElementById('filter-search').value   = '';
    renderTrades();
});

    // ════════════════════════════════════════════════════════════════════════
    // Logs — with level + search filter
    // ════════════════════════════════════════════════════════════════════════
    let allLogs = [];

    function renderLogs() {
    const level  = document.getElementById('filter-log-level').value;
    const search = document.getElementById('filter-log-search').value.trim().toLowerCase();
    const tbody  = document.getElementById('logs-tbody');

    const filtered = allLogs.filter(l => {
    if (level  && l.level !== level) return false;
    if (search && !l.message.toLowerCase().includes(search)) return false;
    return true;
});

    if (!filtered.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="3">No log entries match.</td></tr>';
    return;
}

    const levelColors = { INFO: '#8b949e', WARN: '#d29922', ERROR: '#f85149' };
    tbody.innerHTML = filtered.map(l => `<tr>
    <td style="font-family:monospace;font-size:.78rem">${fmtDate(l.timestamp)}</td>
    <td><span class="badge badge-${l.level.toLowerCase()}">${l.level}</span></td>
    <td style="color:${levelColors[l.level] || '#c9d1d9'}">${l.message}</td>
  </tr>`).join('');
}

    async function loadLogs() {
    try {
    const res  = await fetch('/api/logs?limit=500');
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Server error');
    const data = json.data;
    allLogs = data;
    renderLogs();
    setRefreshTime('logs-refresh-time');
} catch (err) { console.error('Logs error:', err); }
}

    document.getElementById('filter-log-level').addEventListener('change', renderLogs);
    document.getElementById('filter-log-search').addEventListener('input', renderLogs);

    // ════════════════════════════════════════════════════════════════════════
    // Buttons
    // ════════════════════════════════════════════════════════════════════════
    // ── Bot toggle ────────────────────────────────────────────────────────────────
    document.getElementById('btn-bot-toggle').addEventListener('click', async () => {
    const btn = document.getElementById('btn-bot-toggle');
    const isRunning = btn.classList.contains('danger');
    btn.disabled = true;
    try {
    await fetch(isRunning ? '/api/bot/stop' : '/api/bot/start', { method: 'POST' });
    await loadDashboard();
} catch { /* dashboard reload will show correct state */ }
    btn.disabled = false;
});

    // ── Sell helpers ─────────────────────────────────────────────────────────────
    async function sellTrades(ids) {
    const res  = await fetch('/api/trades/close', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
});
    const json = await res.json();
    if (!json.ok) return alert('Error: ' + json.error);
    setTimeout(loadDashboard, 2500);
}

    async function sellAllTrades() {
    const res  = await fetch('/api/trades/close-all', { method: 'POST' });
    const json = await res.json();
    if (!json.ok) return alert('Error: ' + json.error);
    setTimeout(loadDashboard, 2500);
}

    document.getElementById('btn-refresh-dash').addEventListener('click', loadDashboard);
    document.getElementById('btn-refresh-wl').addEventListener('click', loadWatchlist);
    document.getElementById('btn-refresh-trades').addEventListener('click', loadTrades);
    document.getElementById('btn-refresh-logs').addEventListener('click', loadLogs);

    // ════════════════════════════════════════════════════════════════════════
    // Settings
    // ════════════════════════════════════════════════════════════════════════
    let _settingsCache = { watchlist: [], tick15mEnabled: true, tick5mEnabled: true };

    function renderSettingsStrategies() {
    const b15 = document.getElementById('settings-15m-toggle');
    const b5  = document.getElementById('settings-5m-toggle');
    if (!b15 || !b5) return;
    const e15 = _settingsCache.tick15mEnabled;
    const e5  = _settingsCache.tick5mEnabled;
    b15.textContent = e15 ? '● Enabled' : '○ Disabled';
    b15.style.borderColor = e15 ? '#2ea043' : '#30363d';
    b15.style.color       = e15 ? '#3fb950' : '#8b949e';
    b5.textContent  = e5  ? '● Enabled' : '○ Disabled';
    b5.style.borderColor  = e5  ? '#2ea043' : '#30363d';
    b5.style.color        = e5  ? '#3fb950' : '#8b949e';
}

    function renderSettingsWatchlist() {
    const tbody   = document.getElementById('settings-wl-tbody');
    const countEl = document.getElementById('settings-wl-count');
    const wl      = _settingsCache.watchlist;
    if (countEl) countEl.textContent = `${wl.length} symbol${wl.length !== 1 ? 's' : ''}`;
    if (!tbody) return;
    if (!wl.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="3">No symbols in watchlist.</td></tr>';
    return;
}
    tbody.innerHTML = wl.map((sym, i) => `<tr>
    <td style="color:#8b949e;font-size:.78rem">${i + 1}</td>
    <td style="font-weight:600;color:#f0f6fc">${sym}</td>
    <td><button class="btn" style="padding:.22rem .55rem;font-size:.75rem;border-color:#b91c1c;color:#f85149"
        onclick="removeWatchlistSymbol('${sym}')">&#10005; Remove</button></td>
  </tr>`).join('');
}

    async function loadSettings() {
    try {
    const res  = await fetch('/api/settings');
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    _settingsCache = json.data;
    renderSettingsStrategies();
    renderSettingsWatchlist();
    populateSymbolFilter(_settingsCache.watchlist);
} catch (err) { console.error('Settings error:', err); }
}

    async function removeWatchlistSymbol(symbol) {
    if (!confirm(`Remove ${symbol} from watchlist?`)) return;
    const res  = await fetch(`/api/settings/watchlist/${symbol}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.ok) return alert('Error: ' + json.error);
    _settingsCache.watchlist = json.watchlist;
    renderSettingsWatchlist();
    populateSymbolFilter(_settingsCache.watchlist);
}

    document.getElementById('settings-15m-toggle').addEventListener('click', async () => {
    const enabled = !_settingsCache.tick15mEnabled;
    const res  = await fetch('/api/settings/strategy', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategy: '15m', enabled }),
});
    if ((await res.json()).ok) { _settingsCache.tick15mEnabled = enabled; renderSettingsStrategies(); }
});

    document.getElementById('settings-5m-toggle').addEventListener('click', async () => {
    const enabled = !_settingsCache.tick5mEnabled;
    const res  = await fetch('/api/settings/strategy', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategy: '5m', enabled }),
});
    if ((await res.json()).ok) { _settingsCache.tick5mEnabled = enabled; renderSettingsStrategies(); }
});

    document.getElementById('settings-add-btn').addEventListener('click', async () => {
    const input  = document.getElementById('settings-add-input');
    const msgEl  = document.getElementById('settings-add-msg');
    const symbol = input.value.toUpperCase().trim();
    if (!symbol) return;
    msgEl.textContent = 'Validating on Binance…'; msgEl.style.color = '#8b949e';
    const res  = await fetch('/api/settings/watchlist', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol }),
});
    const json = await res.json();
    if (!json.ok) { msgEl.textContent = json.error; msgEl.style.color = '#f85149'; return; }
    input.value = '';
    msgEl.textContent = `${symbol} added.`; msgEl.style.color = '#3fb950';
    _settingsCache.watchlist = json.watchlist;
    renderSettingsWatchlist();
    populateSymbolFilter(_settingsCache.watchlist);
    setTimeout(() => { msgEl.textContent = ''; }, 3000);
});

    document.getElementById('settings-add-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('settings-add-btn').click();
});

    // ════════════════════════════════════════════════════════════════════════
    // Init + auto-refresh
    // ════════════════════════════════════════════════════════════════════════
    loadDashboard();
    loadSettings();
    setInterval(loadDashboard, 15000);
