// CORTEX — One brain. All your money.
// Agentic AI financial ecosystem: invest, analyze, earn, spend.
// Dependency-free Node. Paper execution only — no custody, no real funds.
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8176;
const DATA_PATH = process.env.DATA_PATH || path.join(__dirname, 'data');
const LEDGER_FILE = path.join(DATA_PATH, 'ledger.json');

// ---------------------------------------------------------------- prices
const FEEDS = {
  BTC: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  ETH: 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  SOL: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
};
const prices = {
  BTC: { px: 0, ts: 0, hist: [] },
  ETH: { px: 0, ts: 0, hist: [] },
  SOL: { px: 0, ts: 0, hist: [] },
  USDC: { px: 1, ts: Date.now(), hist: [] },
  CRTX: { px: 0.0042, ts: Date.now(), hist: [] },
};

function pollPyth() {
  const ids = Object.values(FEEDS).map(id => 'ids[]=' + id).join('&');
  const url = 'https://hermes.pyth.network/v2/updates/price/latest?' + ids;
  https.get(url, res => {
    let buf = '';
    res.on('data', d => buf += d);
    res.on('end', () => {
      try {
        const j = JSON.parse(buf);
        for (const p of j.parsed || []) {
          const sym = Object.keys(FEEDS).find(k => FEEDS[k] === p.id);
          if (!sym) continue;
          const px = Number(p.price.price) * Math.pow(10, p.price.expo);
          prices[sym].px = px;
          prices[sym].ts = Date.now();
          const h = prices[sym].hist;
          h.push({ t: Date.now(), p: px });
          if (h.length > 720) h.shift();
        }
        checkAlerts();
      } catch (e) { /* keep last */ }
    });
  }).on('error', () => {});
}
// CRTX simulated drift
setInterval(() => {
  const c = prices.CRTX;
  c.px = Math.max(0.0001, c.px * (1 + (Math.random() - 0.492) * 0.004));
  c.ts = Date.now();
  c.hist.push({ t: Date.now(), p: c.px });
  if (c.hist.length > 720) c.hist.shift();
}, 5000);
setInterval(pollPyth, 5000);
pollPyth();

// ---------------------------------------------------------------- ledger
let ledger = { accounts: {} };
try { ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8')); } catch (e) {}
let dirty = false;
function save() { dirty = true; }
setInterval(() => {
  if (!dirty) return;
  dirty = false;
  try {
    fs.mkdirSync(DATA_PATH, { recursive: true });
    fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger));
  } catch (e) {}
}, 2000);

const START_BAL = { USDC: 10000, SOL: 20, ETH: 1.5, BTC: 0.05, CRTX: 250000 };
function getAccount(id) {
  if (!/^[a-zA-Z0-9_-]{6,64}$/.test(id)) return null;
  if (!ledger.accounts[id]) {
    ledger.accounts[id] = {
      bal: { ...START_BAL },
      staked: 0, stakeTs: 0, rewards: 0, cashback: 0,
      alerts: [], tape: [],
      created: Date.now(),
    };
    tape(ledger.accounts[id], 'ACCOUNT', 'Neural link established. Demo capital allocated.');
    save();
  }
  return ledger.accounts[id];
}
function tape(acct, kind, msg) {
  acct.tape.unshift({ t: Date.now(), kind, msg });
  if (acct.tape.length > 100) acct.tape.pop();
}
function receipt() { return crypto.randomBytes(12).toString('hex'); }

function portfolioValue(acct) {
  let v = 0;
  for (const [sym, amt] of Object.entries(acct.bal)) v += amt * (prices[sym] ? prices[sym].px : 0);
  v += acct.staked * prices.CRTX.px;
  return v;
}

// stake APY 12% accrual on CRTX
function accrue(acct) {
  if (acct.staked > 0 && acct.stakeTs) {
    const dt = (Date.now() - acct.stakeTs) / 1000;
    const r = acct.staked * 0.12 * dt / (365 * 86400);
    acct.rewards += r;
    acct.stakeTs = Date.now();
  }
}

// ---------------------------------------------------------------- alerts
function checkAlerts() {
  for (const acct of Object.values(ledger.accounts)) {
    for (const a of acct.alerts) {
      if (a.fired) continue;
      const px = prices[a.sym] ? prices[a.sym].px : 0;
      if (!px) continue;
      if ((a.op === '>' && px > a.level) || (a.op === '<' && px < a.level)) {
        a.fired = true; a.firedAt = Date.now(); a.firedPx = px;
        tape(acct, 'ALERT', `Alert fired: ${a.sym} ${a.op} $${fmt(a.level)} (now $${fmt(px)}). Analysis queued.`);
        save();
      }
    }
  }
}
function fmt(n) {
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 1) return n.toFixed(2);
  return n.toPrecision(4);
}

// ---------------------------------------------------------------- agent engine (deterministic)
const SYMS = ['BTC', 'ETH', 'SOL', 'USDC', 'CRTX'];
function normSym(s) {
  s = (s || '').toUpperCase().replace(/^\$/, '');
  if (s === 'BITCOIN') s = 'BTC';
  if (s === 'ETHEREUM') s = 'ETH';
  if (s === 'SOLANA') s = 'SOL';
  if (s === 'CORTEX') s = 'CRTX';
  return SYMS.includes(s) ? s : null;
}

// Parses natural-language intent into a structured, validated plan.
function parseIntent(text, acct) {
  const t = text.toLowerCase().trim();
  let m;

  // swap X A to/for B  |  buy $X of A  |  buy X A  |  sell X A
  if ((m = t.match(/swap\s+\$?([\d,.]+)\s+(\w+)\s+(?:to|for|into)\s+\$?(\w+)/))) {
    const from = normSym(m[2]), to = normSym(m[3]), amt = parseFloat(m[1].replace(/,/g, ''));
    if (from && to && amt > 0) return planSwap(acct, from, to, amt);
  }
  if ((m = t.match(/buy\s+\$([\d,.]+)\s+(?:of\s+|worth of\s+)?(\w+)/))) {
    const to = normSym(m[2]), usd = parseFloat(m[1].replace(/,/g, ''));
    if (to && usd > 0) return planSwap(acct, 'USDC', to, usd);
  }
  if ((m = t.match(/buy\s+([\d,.]+)\s+(\w+)/))) {
    const to = normSym(m[2]), qty = parseFloat(m[1].replace(/,/g, ''));
    if (to && qty > 0) return planSwap(acct, 'USDC', to, qty * prices[to].px);
  }
  if ((m = t.match(/sell\s+([\d,.]+)\s+(\w+)/))) {
    const from = normSym(m[2]), qty = parseFloat(m[1].replace(/,/g, ''));
    if (from && qty > 0) return planSwap(acct, from, 'USDC', qty);
  }
  if ((m = t.match(/sell\s+(?:all|everything)\s*(?:of\s+)?(\w+)?/)) && normSym(m[1])) {
    const from = normSym(m[1]);
    return planSwap(acct, from, 'USDC', acct.bal[from] || 0);
  }

  // alerts: alert/notify me when|if SOL >|above|<|below N
  if ((m = t.match(/(?:alert|notify|tell|ping).{0,20}?(\w+)\s*(?:goes\s+)?(>|<|above|below|over|under|hits)\s*\$?([\d,.]+)/))) {
    const sym = normSym(m[1]);
    const op = ['<', 'below', 'under'].includes(m[2]) ? '<' : '>';
    const level = parseFloat(m[3].replace(/,/g, ''));
    if (sym && level > 0) return {
      action: 'alert', sym, op, level,
      title: `Set alert: ${sym} ${op} $${fmt(level)}`,
      steps: [`Watch ${sym}/USD via Pyth oracle`, `Trigger when price ${op === '>' ? 'exceeds' : 'drops below'} $${fmt(level)}`, 'Queue instant analysis on trigger'],
      rationale: `${sym} is at $${fmt(prices[sym].px)} now — that's ${op === '>' ? '+' : ''}${(((level / prices[sym].px) - 1) * 100).toFixed(1)}% from here.`,
    };
  }

  // stake / earn
  if ((m = t.match(/(?:stake|earn on|lock)\s+\$?([\d,.]+k?)\s*(crtx|cortex)?/))) {
    let amt = parseFloat(m[1].replace(/,/g, ''));
    if (m[1].endsWith('k')) amt *= 1000;
    if (amt > 0) return {
      action: 'stake', amt,
      title: `Stake ${fmt(amt)} $CRTX`,
      steps: ['Move $CRTX into the earn vault', 'Accrue 12% APY, streamed per second', 'Unstake any time, no lockup'],
      rationale: `At 12% APY this earns ~${fmt(amt * 0.12 / 365)} $CRTX per day.`,
    };
  }
  if (t.match(/unstake|withdraw stake/)) {
    return {
      action: 'unstake',
      title: `Unstake ${fmt(acct.staked)} $CRTX + claim ${fmt(acct.rewards)} rewards`,
      steps: ['Exit the earn vault', 'Claim accrued rewards', 'Return principal to spot balance'],
      rationale: 'Principal and rewards return to your spot balance instantly.',
    };
  }

  // spend
  if ((m = t.match(/(?:spend|pay|buy me|purchase)\s+\$([\d,.]+)\s*(?:on|for|at)?\s*(.*)/))) {
    const usd = parseFloat(m[1].replace(/,/g, ''));
    const what = (m[2] || 'purchase').trim() || 'purchase';
    if (usd > 0) return {
      action: 'spend', usd, what,
      title: `Spend $${fmt(usd)} on ${what}`,
      steps: ['Settle from USDC balance via CORTEX card rail', 'Instant settlement, 0.1% network fee', `Earn 2% cashback in $CRTX (~${fmt(usd * 0.02 / prices.CRTX.px)} CRTX)`],
      rationale: 'Cashback is credited immediately — real-world utility, on-chain capital.',
    };
  }

  // analyze / portfolio
  if (t.match(/analy|portfolio|how am i doing|what do i (?:own|hold)|balance|status|review/)) {
    return { action: 'analyze', title: 'Full portfolio analysis', steps: ['Mark all holdings to live oracle prices', 'Compute allocation and concentration', 'Flag risks and opportunities'], rationale: 'Read-only — executes instantly.' };
  }
  if (t.match(/price|quote|chart/)) {
    const sym = normSym((t.match(/\b(btc|eth|sol|usdc|crtx|bitcoin|ethereum|solana|cortex)\b/) || [])[1]) || 'SOL';
    return { action: 'quote', sym, title: `Quote ${sym}/USD`, steps: ['Read live Pyth oracle'], rationale: 'Read-only.' };
  }
  if (t.match(/help|what can you do|commands/)) return { action: 'help', title: 'Capabilities', steps: [], rationale: '' };

  return null;
}

function planSwap(acct, from, to, fromAmt) {
  if (from === to) return null;
  const fromPx = prices[from].px, toPx = prices[to].px;
  if (!fromPx || !toPx) return null;
  const usd = fromAmt * fromPx;
  const fee = usd * 0.001;
  const toAmt = (usd - fee) / toPx;
  const ok = (acct.bal[from] || 0) >= fromAmt;
  return {
    action: 'swap', from, to, fromAmt, toAmt, usd, fee,
    title: `Swap ${fmt(fromAmt)} ${from} → ${fmt(toAmt)} ${to}`,
    steps: [
      `Route ${fmt(fromAmt)} ${from} ($${fmt(usd)}) through the integrated DEX`,
      `Best-path execution at oracle mid, 0.10% fee ($${fmt(fee)})`,
      `Receive ~${fmt(toAmt)} ${to}`,
    ],
    rationale: ok
      ? `${from} $${fmt(fromPx)} / ${to} $${fmt(toPx)} — validated against your balance. Ready.`
      : `⚠ Insufficient ${from}: you hold ${fmt(acct.bal[from] || 0)}, plan needs ${fmt(fromAmt)}.`,
    valid: ok,
  };
}

function analyze(acct) {
  accrue(acct);
  const total = portfolioValue(acct);
  const lines = [];
  const alloc = [];
  for (const sym of SYMS) {
    const amt = (acct.bal[sym] || 0) + (sym === 'CRTX' ? acct.staked : 0);
    const v = amt * prices[sym].px;
    if (v < 0.01) continue;
    alloc.push({ sym, amt, v, pct: total ? v / total * 100 : 0 });
  }
  alloc.sort((a, b) => b.v - a.v);
  lines.push(`Total portfolio: $${fmt(total)} across ${alloc.length} assets.`);
  for (const a of alloc) lines.push(`• ${a.sym}: ${fmt(a.amt)} ($${fmt(a.v)}, ${a.pct.toFixed(1)}%)`);
  const top = alloc[0];
  if (top && top.pct > 60) lines.push(`⚠ Concentration risk: ${top.sym} is ${top.pct.toFixed(0)}% of the book. Consider rebalancing.`);
  const stable = alloc.find(a => a.sym === 'USDC');
  const stablePct = stable ? stable.pct : 0;
  if (stablePct < 10) lines.push('⚠ Low stable reserve (<10%). Thin buffer for dips or spending.');
  else lines.push(`Stable reserve: ${stablePct.toFixed(0)}% — ${stablePct > 40 ? 'heavy dry powder; idle capital could earn' : 'healthy buffer'}.`);
  if (acct.staked > 0) lines.push(`Earning: ${fmt(acct.staked)} $CRTX staked at 12% APY, ${fmt(acct.rewards)} accrued.`);
  else lines.push('Idle: no $CRTX staked. "stake 100k CRTX" puts it to work at 12% APY.');
  if (acct.cashback > 0) lines.push(`Lifetime cashback: ${fmt(acct.cashback)} $CRTX.`);
  return lines;
}

// ---------------------------------------------------------------- execute
function execute(acct, plan) {
  accrue(acct);
  const rid = receipt();
  switch (plan.action) {
    case 'swap': {
      const { from, to, fromAmt, toAmt } = plan;
      if ((acct.bal[from] || 0) < fromAmt) return { ok: false, msg: `Insufficient ${from}.` };
      acct.bal[from] -= fromAmt;
      acct.bal[to] = (acct.bal[to] || 0) + toAmt;
      tape(acct, 'SWAP', `${fmt(fromAmt)} ${from} → ${fmt(toAmt)} ${to} · receipt ${rid}`);
      save();
      return { ok: true, msg: `Executed. ${fmt(fromAmt)} ${from} → ${fmt(toAmt)} ${to}. Receipt ${rid}.` };
    }
    case 'alert': {
      acct.alerts.push({ sym: plan.sym, op: plan.op, level: plan.level, fired: false, created: Date.now() });
      if (acct.alerts.length > 20) acct.alerts.shift();
      tape(acct, 'ALERT', `Armed: ${plan.sym} ${plan.op} $${fmt(plan.level)}`);
      save();
      return { ok: true, msg: `Alert armed. I'm watching ${plan.sym} ${plan.op} $${fmt(plan.level)} on the live oracle.` };
    }
    case 'stake': {
      if ((acct.bal.CRTX || 0) < plan.amt) return { ok: false, msg: 'Insufficient $CRTX.' };
      acct.bal.CRTX -= plan.amt;
      acct.staked += plan.amt;
      acct.stakeTs = Date.now();
      tape(acct, 'EARN', `Staked ${fmt(plan.amt)} $CRTX @ 12% APY · receipt ${rid}`);
      save();
      return { ok: true, msg: `Staked ${fmt(plan.amt)} $CRTX. Rewards stream per second. Receipt ${rid}.` };
    }
    case 'unstake': {
      if (acct.staked <= 0) return { ok: false, msg: 'Nothing staked.' };
      const p = acct.staked, r = acct.rewards;
      acct.bal.CRTX += p + r;
      acct.staked = 0; acct.rewards = 0; acct.stakeTs = 0;
      tape(acct, 'EARN', `Unstaked ${fmt(p)} + ${fmt(r)} rewards $CRTX · receipt ${rid}`);
      save();
      return { ok: true, msg: `Unstaked ${fmt(p)} $CRTX and claimed ${fmt(r)} rewards. Receipt ${rid}.` };
    }
    case 'spend': {
      const cost = plan.usd * 1.001;
      if ((acct.bal.USDC || 0) < cost) return { ok: false, msg: `Insufficient USDC (need $${fmt(cost)} incl. fee).` };
      acct.bal.USDC -= cost;
      const cb = plan.usd * 0.02 / prices.CRTX.px;
      acct.bal.CRTX += cb;
      acct.cashback += cb;
      tape(acct, 'SPEND', `$${fmt(plan.usd)} on ${plan.what} · +${fmt(cb)} $CRTX cashback · receipt ${rid}`);
      save();
      return { ok: true, msg: `Settled $${fmt(plan.usd)} on ${plan.what}. Cashback +${fmt(cb)} $CRTX credited. Receipt ${rid}.` };
    }
  }
  return { ok: false, msg: 'Unknown action.' };
}

// ---------------------------------------------------------------- http
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.json': 'application/json', '.ico': 'image/x-icon' };

function json(res, code, obj) {
  const b = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(b);
}
function body(req) {
  return new Promise(resolve => {
    let b = '';
    req.on('data', d => { b += d; if (b.length > 65536) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;

  if (p === '/api/prices') {
    const out = {};
    for (const [k, v] of Object.entries(prices)) out[k] = { px: v.px, ts: v.ts, hist: v.hist.slice(-120) };
    return json(res, 200, out);
  }

  if (p === '/api/state') {
    const acct = getAccount(u.searchParams.get('id') || '');
    if (!acct) return json(res, 400, { err: 'bad id' });
    accrue(acct);
    return json(res, 200, {
      bal: acct.bal, staked: acct.staked, rewards: acct.rewards, cashback: acct.cashback,
      alerts: acct.alerts, tape: acct.tape.slice(0, 40), total: portfolioValue(acct),
    });
  }

  if (p === '/api/agent' && req.method === 'POST') {
    const b = await body(req);
    const acct = getAccount(b.id || '');
    if (!acct) return json(res, 400, { err: 'bad id' });
    const text = String(b.text || '').slice(0, 400);
    tape(acct, 'INTENT', `"${text}"`);

    const plan = parseIntent(text, acct);
    if (!plan) {
      save();
      return json(res, 200, { kind: 'reply', lines: [
        "I couldn't structure that into a plan. Try:",
        '• "swap 500 USDC to SOL" · "buy $250 of ETH" · "sell 0.5 SOL"',
        '• "alert me when SOL > 200" · "stake 100k CRTX" · "unstake"',
        '• "spend $40 on dinner" · "analyze my portfolio" · "price of BTC"',
      ]});
    }
    if (plan.action === 'analyze') { save(); return json(res, 200, { kind: 'reply', lines: analyze(acct) }); }
    if (plan.action === 'quote') {
      const pr = prices[plan.sym];
      const h = pr.hist, chg = h.length > 1 ? ((pr.px / h[0].p) - 1) * 100 : 0;
      save();
      return json(res, 200, { kind: 'reply', lines: [`${plan.sym}/USD: $${fmt(pr.px)} (${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% over the tracked window). Source: ${plan.sym === 'CRTX' ? 'internal AMM' : plan.sym === 'USDC' ? 'peg' : 'Pyth oracle'}.`] });
    }
    if (plan.action === 'help') {
      save();
      return json(res, 200, { kind: 'reply', lines: [
        'I structure intent into validated plans, then execute on your confirm.',
        'INVEST — swap / buy / sell across BTC, ETH, SOL, USDC, CRTX (oracle-priced DEX).',
        'ANALYZE — portfolio breakdown, risk flags, live quotes, price alerts.',
        'EARN — stake $CRTX at 12% APY, streamed per second.',
        'SPEND — settle purchases from USDC with 2% $CRTX cashback.',
      ]});
    }
    save();
    return json(res, 200, { kind: 'plan', plan });
  }

  if (p === '/api/execute' && req.method === 'POST') {
    const b = await body(req);
    const acct = getAccount(b.id || '');
    if (!acct || !b.plan || !b.plan.action) return json(res, 400, { err: 'bad request' });
    // Re-validate server-side: rebuild swap economics at current prices.
    let plan = b.plan;
    if (plan.action === 'swap') {
      plan = planSwap(acct, normSym(plan.from), normSym(plan.to), Number(plan.fromAmt));
      if (!plan) return json(res, 400, { err: 'invalid swap' });
    }
    if (plan.action === 'stake') plan = { action: 'stake', amt: Math.max(0, Number(b.plan.amt) || 0) };
    if (plan.action === 'spend') plan = { action: 'spend', usd: Math.max(0, Number(b.plan.usd) || 0), what: String(b.plan.what || 'purchase').slice(0, 60) };
    if (plan.action === 'alert') {
      const sym = normSym(b.plan.sym), level = Number(b.plan.level);
      if (!sym || !(level > 0)) return json(res, 400, { err: 'invalid alert' });
      plan = { action: 'alert', sym, op: b.plan.op === '<' ? '<' : '>', level };
    }
    const r = execute(acct, plan);
    return json(res, 200, r);
  }

  // static
  let file = p === '/' ? 'index.html' : p === '/app' ? 'app.html' : p === '/docs' ? 'docs.html' : p.slice(1);
  file = path.normalize(file).replace(/^(\.\.[\\/])+/, '');
  const fp = path.join(__dirname, 'public', file);
  if (!fp.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); return res.end(); }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`CORTEX online :${PORT}`));
