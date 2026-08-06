'use strict';
// CORTEX brand-kit generator. Writes self-contained HTML per asset into _studio/out/,
// then render.js rasterizes each with headless Chrome (ABSOLUTE file:// URLs) to Desktop.
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">`;

const BASE = `
:root{--bg:#05070d;--blue:#2e7cff;--cyan:#3ee6ff;--ink:#e8eefc;--dim:#7686a8;
  --grad:linear-gradient(92deg,#2e7cff,#3ee6ff)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{font-family:'Inter',system-ui,sans-serif;color:var(--ink);background:var(--bg);overflow:hidden}
.stage{position:relative;overflow:hidden;background:
  radial-gradient(55% 70% at 80% 10%,rgba(46,124,255,.16),transparent 60%),
  radial-gradient(50% 60% at 15% 90%,rgba(62,230,255,.10),transparent 55%),
  linear-gradient(160deg,#090d17,#05070d)}
.grad{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.mono{font-family:'JetBrains Mono',monospace}
`;

// synapse field: deterministic pseudo-random nodes + lines as inline SVG
function synapse(w, h, n = 46, seed = 7) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pts = Array.from({ length: n }, () => [rnd() * w, rnd() * h]);
  let lines = '';
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
    if (d < w * 0.13) lines += `<line x1="${pts[i][0]}" y1="${pts[i][1]}" x2="${pts[j][0]}" y2="${pts[j][1]}" stroke="rgba(46,124,255,${(0.22 * (1 - d / (w * 0.13))).toFixed(3)})" stroke-width="1.5"/>`;
  }
  const dots = pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="rgba(62,230,255,.5)"/>`).join('');
  return `<svg style="position:absolute;inset:0" width="${w}" height="${h}">${lines}${dots}</svg>`;
}

// logo: dashed orbital ring + glowing core
function mark(size, glow = true) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 200 200" style="${glow ? `filter:drop-shadow(0 0 ${size * 0.07}px rgba(62,230,255,.65))` : ''}">
    <defs><radialGradient id="c" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#d8f9ff"/><stop offset=".45" stop-color="#3ee6ff"/><stop offset="1" stop-color="#2e7cff"/></radialGradient></defs>
    <circle cx="100" cy="100" r="82" fill="none" stroke="#2e7cff" stroke-width="10" stroke-dasharray="38 24" stroke-linecap="round"/>
    <circle cx="100" cy="100" r="60" fill="none" stroke="rgba(62,230,255,.35)" stroke-width="2" stroke-dasharray="3 9"/>
    <circle cx="100" cy="100" r="34" fill="url(#c)"/>
  </svg>`;
}

function page(w, h, css, inner) {
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE}
  .stage{width:${w}px;height:${h}px}${css}</style></head>
  <body><div class="stage">${inner}</div></body></html>`;
}

const assets = {};

// 1) PFP 2000x2000 — circle-safe
assets['cortex-pfp'] = page(2000, 2000, `
  .wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:70px}`,
  `${synapse(2000, 2000, 60, 11)}
   <div class="wrap">${mark(980)}
     <div style="font-size:150px;font-weight:800;letter-spacing:.14em">CORTEX</div>
   </div>`);

// 2) BANNER 3000x1000 (X header)
assets['cortex-banner'] = page(3000, 1000, `
  .wrap{position:absolute;inset:0;display:flex;align-items:center;padding:0 170px;gap:110px}
  .h{font-size:150px;font-weight:800;letter-spacing:-.02em;line-height:1.04}
  .s{font-size:52px;color:var(--dim);margin-top:34px}
  .tick{position:absolute;right:170px;bottom:80px;font-size:38px;letter-spacing:.28em;color:var(--cyan)}`,
  `${synapse(3000, 1000, 70, 5)}
   <div class="wrap">${mark(560)}
     <div><div class="h">One brain.<br><span class="grad">All your money.</span></div>
       <div class="s">Invest · Analyze · Earn · Spend — one agentic AI ecosystem.</div></div></div>
   <div class="tick mono">$CRTX · CORTEXRH.XYZ</div>`);

// 3) KEYART 2400x1350
assets['cortex-keyart'] = page(2400, 1350, `
  .wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:52px}
  .ey{font-size:40px;letter-spacing:.5em;color:var(--cyan);text-transform:uppercase}
  .h{font-size:200px;font-weight:800;letter-spacing:-.02em;line-height:1.02}
  .s{font-size:52px;color:var(--dim);max-width:1500px}`,
  `${synapse(2400, 1350, 64, 23)}
   <div class="wrap">${mark(380)}
     <div class="ey mono">Agentic AI · One unified system</div>
     <div class="h">One brain.<br><span class="grad">All your money.</span></div>
     <div class="s">You define intent. CORTEX structures, validates, and executes.</div>
     <div class="mono" style="font-size:44px;letter-spacing:.3em;color:var(--cyan)">$CRTX · CORTEXRH.XYZ</div>
   </div>`);

// 4) PILLARS 2400x1350
const pillar = (ico, t, d) => `<div style="background:rgba(255,255,255,.035);border:1px solid rgba(46,124,255,.35);border-radius:30px;padding:52px 48px">
  <div style="font-size:64px;margin-bottom:22px">${ico}</div>
  <div style="font-size:44px;font-weight:700;margin-bottom:18px">${t}</div>
  <div style="font-size:32px;color:var(--dim);line-height:1.45">${d}</div></div>`;
assets['cortex-pillars'] = page(2400, 1350, `
  .wrap{position:absolute;inset:0;padding:110px 140px;display:flex;flex-direction:column}
  .ey{font-size:38px;letter-spacing:.4em;color:var(--cyan);text-transform:uppercase;margin-bottom:26px}
  .h{font-size:100px;font-weight:800;letter-spacing:-.02em;margin-bottom:64px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:36px}`,
  `${synapse(2400, 1350, 50, 31)}
   <div class="wrap">
     <div class="ey mono">The ecosystem</div>
     <div class="h">Four verticals. <span class="grad">Zero app-switching.</span></div>
     <div class="grid">
       ${pillar('📈', 'Invest', 'Integrated DEX — trade, swap, and manage assets at live Pyth oracle pricing without leaving the app.')}
       ${pillar('🧠', 'Analyze', 'Instant portfolio analysis, risk flags, and price alerts that queue analysis the moment they fire.')}
       ${pillar('🌱', 'Earn', 'Vault staking streams $CRTX rewards per second. No lockups, exit any time.')}
       ${pillar('💳', 'Spend', 'Next-gen banking rail. Low fees, fast settlement, 2% AI-powered cashback in $CRTX.')}
     </div>
   </div>`);

// 5) HOW IT WORKS 2400x1350 — intent → plan → execute
const step = (n, t, d) => `<div style="flex:1;background:rgba(255,255,255,.035);border:1px solid rgba(62,230,255,.3);border-radius:30px;padding:56px 48px">
  <div class="mono" style="font-size:40px;color:var(--cyan);margin-bottom:24px">0${n}</div>
  <div style="font-size:52px;font-weight:700;margin-bottom:20px">${t}</div>
  <div style="font-size:33px;color:var(--dim);line-height:1.45">${d}</div></div>`;
assets['cortex-howitworks'] = page(2400, 1350, `
  .wrap{position:absolute;inset:0;padding:120px 140px;display:flex;flex-direction:column}
  .ey{font-size:38px;letter-spacing:.4em;color:var(--cyan);text-transform:uppercase;margin-bottom:26px}
  .h{font-size:100px;font-weight:800;letter-spacing:-.02em;margin-bottom:80px}
  .steps{display:flex;gap:40px;margin-bottom:80px}
  .cmd{background:#070b14;border:1px solid rgba(46,124,255,.4);border-radius:24px;padding:44px 56px;font-size:40px}`,
  `${synapse(2400, 1350, 50, 43)}
   <div class="wrap">
     <div class="ey mono">How it works</div>
     <div class="h">Intent in. <span class="grad">Execution out.</span></div>
     <div class="steps">
       ${step(1, 'You define intent', '"Swap 500 USDC to SOL." "Alert me when SOL breaks 200." Plain language, nothing else.')}
       ${step(2, 'The agent plans', 'Route, fees, and resulting balances — structured into a validated plan you can inspect.')}
       ${step(3, 'One-click execute', 'Confirm once. The engine settles at oracle prices and mints a receipt to your tape.')}
     </div>
     <div class="cmd mono"><span style="color:#7686a8">you ▸</span> alert me when SOL &gt; 200&nbsp;&nbsp;&nbsp;<span style="color:#3ee6ff">cortex ▸</span> plan armed. watching the oracle. <span style="color:#38e08c">✔</span></div>
   </div>`);

for (const [name, html] of Object.entries(assets)) {
  fs.writeFileSync(path.join(OUT, name + '.html'), html);
  console.log('wrote', name + '.html');
}
console.log('done:', Object.keys(assets).length, 'assets');
