// packages/mcp-server/src/tools/architecture-report-template.ts
// Extracted HTML/CSS/JS template functions for architecture report.
import * as path from 'path';

export interface GraphNode {
  id: string;
  fanIn: number;
  fanOut: number;
  instability: number;
  severity: 'high' | 'medium' | 'low';
  churn: number;
  inCycle: boolean;
  propagationCost: number;
  costOfChange: number;
}

export interface GraphLink {
  source: string;
  target: string;
  strength: number;
  inCycle: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  cycles: string[][];
  summary: {
    totalModules: number;
    cycleCount: number;
    avgCostOfChange: number;
    highSeverityCount: number;
    mediumSeverityCount: number;
    lowSeverityCount: number;
  };
}

/** Escape a string for safe embedding in HTML attributes. */
export function escapeHtml(str: string): string {
  const ampEscaped = str.replace(/&/g, '&amp;');
  const ltEscaped = ampEscaped.replace(/</g, '&lt;');
  const gtEscaped = ltEscaped.replace(/>/g, '&gt;');
  return gtEscaped.replace(/"/g, '&quot;');
}

/** Base layout and controls CSS styles. */
export function buildHtmlStylesBase(): string {
  return `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0d1117;
    color: #c9d1d9;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', monospace;
    overflow: hidden;
    height: 100vh;
    display: flex;
    flex-direction: column;
  }
  #header {
    background: #161b22;
    border-bottom: 1px solid #30363d;
    padding: 10px 16px;
    display: flex;
    align-items: center;
    gap: 16px;
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  #header h1 { font-size: 14px; font-weight: 600; color: #58a6ff; white-space: nowrap; }
  #header .path {
    font-size: 11px; color: #8b949e; font-family: monospace;
    flex: 1; min-width: 0; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;
  }
  #stats { display: flex; gap: 12px; flex-shrink: 0; }
  .stat { text-align: center; min-width: 60px; }
  .stat .val { font-size: 18px; font-weight: 700; line-height: 1.2; }
  .stat .lbl { font-size: 9px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; }
  .val-red { color: #f85149; }
  .val-orange { color: #d29922; }
  .val-green { color: #3fb950; }
  .val-blue { color: #58a6ff; }
  #controls {
    background: #161b22;
    border-bottom: 1px solid #30363d;
    padding: 6px 16px;
    display: flex; align-items: center; gap: 8px;
    flex-shrink: 0; flex-wrap: wrap;
  }
  .filter-btn {
    background: #21262d; border: 1px solid #30363d; color: #c9d1d9;
    padding: 4px 10px; border-radius: 6px; font-size: 12px;
    cursor: pointer; transition: all 0.15s;
  }
  .filter-btn:hover { background: #30363d; }
  .filter-btn.active { background: #1f6feb; border-color: #388bfd; color: #fff; }
  #controls label { font-size: 12px; color: #8b949e; margin-left: 8px; }
  #main { display: flex; flex: 1; overflow: hidden; min-height: 0; }
  #canvas-container { flex: 1; position: relative; overflow: hidden; }
  canvas { position: absolute; top: 0; left: 0; cursor: grab; }
  canvas:active { cursor: grabbing; }
`;
}

/** Sidebar, tooltip, legend, and zoom control CSS styles. */
export function buildHtmlStylesSidebar(): string {
  return `
  #sidebar {
    width: 280px; background: #161b22;
    border-left: 1px solid #30363d;
    overflow-y: auto; flex-shrink: 0;
    display: flex; flex-direction: column;
  }
  #sidebar-content { padding: 12px; flex: 1; }
  .section-title {
    font-size: 11px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.8px;
    color: #8b949e; margin-bottom: 8px; margin-top: 16px;
    padding-bottom: 4px; border-bottom: 1px solid #21262d;
  }
  .section-title:first-child { margin-top: 0; }
  #node-detail {
    background: #21262d; border: 1px solid #30363d;
    border-radius: 8px; padding: 10px; margin-bottom: 12px;
    min-height: 80px;
  }
  #node-detail-placeholder {
    display: flex; align-items: center; justify-content: center;
    min-height: 80px; color: #484f58; font-size: 12px; text-align: center;
  }
  .node-name {
    font-size: 11px; font-family: monospace; color: #c9d1d9;
    word-break: break-all; margin-bottom: 8px; font-weight: 600;
  }
  .node-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .metric-item { background: #161b22; border-radius: 4px; padding: 5px 7px; }
  .metric-item .m-label { font-size: 9px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.3px; }
  .metric-item .m-value { font-size: 13px; font-weight: 600; }
  .metric-wide { grid-column: span 2; }
  .legend-item { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 12px; }
  .legend-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
  .legend-line { width: 24px; height: 3px; border-radius: 2px; flex-shrink: 0; }
  .cycle-item {
    background: #21262d; border: 1px solid #30363d;
    border-radius: 6px; padding: 7px 9px; margin-bottom: 6px;
  }
  .cycle-header {
    display: inline-block; background: #da3633; color: #fff;
    font-size: 9px; padding: 1px 5px; border-radius: 10px;
    font-weight: 600; margin-bottom: 4px;
  }
  .cycle-member {
    font-family: monospace; color: #8b949e;
    font-size: 10px; margin-top: 2px; word-break: break-all;
  }
  #tooltip {
    position: fixed; background: #161b22;
    border: 1px solid #30363d; border-radius: 8px;
    padding: 8px 12px; font-size: 12px;
    pointer-events: none; z-index: 1000; max-width: 280px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.6); display: none;
  }
  .tt-name { font-family: monospace; font-weight: 600; color: #c9d1d9; margin-bottom: 5px; word-break: break-all; font-size: 11px; }
  .tt-grid { display: grid; grid-template-columns: auto auto; gap: 3px 10px; font-size: 11px; }
  .tt-label { color: #8b949e; }
  .tt-val { color: #c9d1d9; font-weight: 600; }
  #zoom-controls {
    position: absolute; bottom: 12px; right: 12px;
    display: flex; flex-direction: column; gap: 4px;
  }
  .zoom-btn {
    background: #21262d; border: 1px solid #30363d; color: #c9d1d9;
    width: 28px; height: 28px; border-radius: 6px;
    cursor: pointer; font-size: 16px;
    display: flex; align-items: center; justify-content: center;
    user-select: none; transition: background 0.15s;
  }
  .zoom-btn:hover { background: #30363d; }
  #zoom-label {
    background: #21262d; border: 1px solid #30363d; color: #8b949e;
    font-size: 10px; padding: 2px 4px; border-radius: 4px;
    text-align: center; cursor: default;
  }
  #empty-state {
    display: none; position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    text-align: center; color: #484f58; font-size: 14px;
  }
`;
}

export function buildHtmlStyles(): string {
  return '<style>' + buildHtmlStylesBase() + buildHtmlStylesSidebar() + '</style>';
}

/** HTML body: header and filter controls. */
export function buildHtmlBodyHeader(): string {
  return `<div id="header">
  <h1>Architecture Report</h1>
  <span class="path" id="dir-path"></span>
  <div id="stats">
    <div class="stat"><div class="val val-blue" id="stat-modules">0</div><div class="lbl">Modules</div></div>
    <div class="stat"><div class="val val-red" id="stat-high">0</div><div class="lbl">High Risk</div></div>
    <div class="stat"><div class="val val-red" id="stat-cycles">0</div><div class="lbl">Cycles</div></div>
    <div class="stat"><div class="val val-orange" id="stat-avg">0</div><div class="lbl">Avg CoC</div></div>
  </div>
</div>

<div id="controls">
  <span style="font-size:12px;color:#8b949e;font-weight:600">Filter:</span>
  <button class="filter-btn active" id="btn-all" onclick="setFilter('all')">Show all</button>
  <button class="filter-btn" id="btn-high" onclick="setFilter('high')">High risk only</button>
  <button class="filter-btn" id="btn-cycles" onclick="setFilter('cycles')">Cycles only</button>
  <label>
    <input type="checkbox" id="chk-labels" onchange="toggleLabels()" checked>
    File names
  </label>
  <label style="margin-left:8px">
    <input type="checkbox" id="chk-links" onchange="toggleLinks()" checked>
    Edges
  </label>
</div>
`;
}

/** HTML body: main canvas, sidebar, and tooltip panel. */
export function buildHtmlBodyMain(): string {
  return `<div id="main">
  <div id="canvas-container">
    <canvas id="graph-canvas"></canvas>
    <div id="empty-state">No nodes match the filter</div>
    <div id="zoom-controls">
      <button class="zoom-btn" onclick="zoomIn()" title="Zoom in">+</button>
      <div id="zoom-label">100%</div>
      <button class="zoom-btn" onclick="zoomOut()" title="Zoom out">-</button>
      <button class="zoom-btn" onclick="resetView()" title="Reset" style="font-size:12px">&#x21BA;</button>
    </div>
  </div>
  <div id="sidebar">
    <div id="sidebar-content">
      <div class="section-title">Selected node</div>
      <div id="node-detail">
        <div id="node-detail-placeholder">Click a node for details</div>
        <div id="node-detail-content" style="display:none;width:100%">
          <div class="node-name" id="detail-name"></div>
          <div class="node-metrics">
            <div class="metric-item">
              <div class="m-label">FAN-IN</div>
              <div class="m-value val-blue" id="detail-fanin"></div>
            </div>
            <div class="metric-item">
              <div class="m-label">FAN-OUT</div>
              <div class="m-value val-blue" id="detail-fanout"></div>
            </div>
            <div class="metric-item">
              <div class="m-label">Instability</div>
              <div class="m-value" id="detail-inst"></div>
            </div>
            <div class="metric-item">
              <div class="m-label">Prop. Cost</div>
              <div class="m-value" id="detail-prop"></div>
            </div>
            <div class="metric-item">
              <div class="m-label">Cost-of-Change</div>
              <div class="m-value" id="detail-coc"></div>
            </div>
            <div class="metric-item">
              <div class="m-label">Churn (12m)</div>
              <div class="m-value" id="detail-churn"></div>
            </div>
            <div class="metric-item metric-wide">
              <div class="m-label">Severity</div>
              <div class="m-value" id="detail-sev"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="section-title">Legend</div>
      <div class="legend-item">
        <div class="legend-dot" style="background:#f85149"></div>
        <span>High severity (CoC &gt; 0.66)</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot" style="background:#d29922"></div>
        <span>Medium severity (CoC 0.33&ndash;0.66)</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot" style="background:#3fb950"></div>
        <span>Low severity (CoC &lt; 0.33)</span>
      </div>
      <div class="legend-item" style="margin-top:6px">
        <div style="width:12px;height:12px;border-radius:50%;background:#3fb950;border:2px solid #f85149;flex-shrink:0"></div>
        <span>In a circular dependency</span>
      </div>
      <div class="legend-item">
        <div class="legend-line" style="background:#484f58"></div>
        <span>Normal dependency</span>
      </div>
      <div class="legend-item">
        <div class="legend-line" style="background:#f85149"></div>
        <span>Cycle dependency</span>
      </div>
      <div style="font-size:11px;color:#8b949e;margin-top:4px">
        Node size = change frequency (churn)
      </div>

      <div class="section-title" id="cycles-title">Cycles (0)</div>
      <div id="cycles-list"></div>
    </div>
  </div>
</div>

<div id="tooltip">
  <div class="tt-name" id="tt-name"></div>
  <div class="tt-grid">
    <span class="tt-label">FAN-IN</span><span class="tt-val" id="tt-fanin"></span>
    <span class="tt-label">FAN-OUT</span><span class="tt-val" id="tt-fanout"></span>
    <span class="tt-label">Instability</span><span class="tt-val" id="tt-inst"></span>
    <span class="tt-label">Prop. Cost</span><span class="tt-val" id="tt-prop"></span>
    <span class="tt-label">Cost-of-Change</span><span class="tt-val" id="tt-coc"></span>
    <span class="tt-label">Churn (12m)</span><span class="tt-val" id="tt-churn"></span>
    <span class="tt-label">I cykel</span><span class="tt-val" id="tt-cycle"></span>
  </div>
</div>`;
}

export function buildHtmlBody(): string {
  return buildHtmlBodyHeader() + buildHtmlBodyMain();
}

/** Script section: data, state variables, colour constants, init + graph build functions. */
export function buildScriptInit(dataJson: string, directory: string): string {
  return `
const GRAPH_DATA = ${dataJson};
const DIRECTORY = ${JSON.stringify(directory)};

// ─── State ────────────────────────────────────────────────────────────────────
let currentFilter = 'all';
let showLabels = true;
let showLinks = true;
let selectedNode = null;
let hoveredNode = null;

// Pan/zoom state
let panX = 0, panY = 0, scale = 1;
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let dragNode = null;

// Physics state
let nodes = [];
let links = [];
let animFrame = null;
let simRunning = false;
let alpha = 1.0;

// Canvas
const canvas = document.getElementById('graph-canvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('canvas-container');

// ─── Colours ──────────────────────────────────────────────────────────────────
const SEV_COLOR = { high: '#f85149', medium: '#d29922', low: '#3fb950' };
const LINK_COLOR_NORMAL = 'rgba(99,110,123,0.5)';
const LINK_COLOR_CYCLE = 'rgba(248,81,73,0.7)';
const LINK_COLOR_HIGHLIGHT = 'rgba(88,166,255,0.85)';

// ─── Node radius ──────────────────────────────────────────────────────────────
function nodeRadius(d) {
  const r = Math.sqrt(Math.max(1, d.churn + 1)) * 3.5;
  return Math.min(30, Math.max(7, r));
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init() {
  // Set directory path via textContent (safe, no XSS)
  document.getElementById('dir-path').textContent = DIRECTORY;

  updateStats();
  renderCyclesList();
  buildGraph();
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  setupCanvasEvents();
}

function updateStats() {
  document.getElementById('stat-modules').textContent = GRAPH_DATA.summary.totalModules;
  document.getElementById('stat-high').textContent = GRAPH_DATA.summary.highSeverityCount;
  document.getElementById('stat-cycles').textContent = GRAPH_DATA.summary.cycleCount;
  document.getElementById('stat-avg').textContent = (GRAPH_DATA.summary.avgCostOfChange * 100).toFixed(0) + '%';
}

function renderCyclesList() {
  const list = document.getElementById('cycles-list');
  document.getElementById('cycles-title').textContent = 'Cycles (' + GRAPH_DATA.cycles.length + ')';

  // Clear existing children
  while (list.firstChild) list.removeChild(list.firstChild);

  if (GRAPH_DATA.cycles.length === 0) {
    const msg = document.createElement('div');
    msg.style.fontSize = '12px';
    msg.style.color = '#3fb950';
    msg.textContent = 'No circular dependencies found';
    list.appendChild(msg);
    return;
  }

  const displayed = GRAPH_DATA.cycles.slice(0, 20);
  displayed.forEach(function(cyc, i) {
    const item = document.createElement('div');
    item.className = 'cycle-item';

    const badge = document.createElement('span');
    badge.className = 'cycle-header';
    badge.textContent = 'Cykel ' + (i + 1) + ' (' + cyc.length + ' noder)';
    item.appendChild(badge);

    cyc.forEach(function(member) {
      const row = document.createElement('div');
      row.className = 'cycle-member';
      row.textContent = '-> ' + shortPath(member);
      item.appendChild(row);
    });

    list.appendChild(item);
  });

  if (GRAPH_DATA.cycles.length > 20) {
    const more = document.createElement('div');
    more.style.fontSize = '11px';
    more.style.color = '#8b949e';
    more.style.marginTop = '6px';
    more.textContent = '+ ' + (GRAPH_DATA.cycles.length - 20) + ' fler cykler...';
    list.appendChild(more);
  }
}

function shortPath(p) {
  const parts = p.replace(/\\\\/g, '/').split('/');
  return parts.length > 3 ? '...' + parts.slice(-3).join('/') : parts.join('/');
}

// ─── Filter ───────────────────────────────────────────────────────────────────
function setFilter(f) {
  currentFilter = f;
  ['all', 'high', 'cycles'].forEach(function(id) {
    const btn = document.getElementById('btn-' + id);
    btn.className = 'filter-btn' + (id === f ? ' active' : '');
  });
  buildGraph();
}

function toggleLabels() {
  showLabels = document.getElementById('chk-labels').checked;
  drawFrame();
}

function toggleLinks() {
  showLinks = document.getElementById('chk-links').checked;
  drawFrame();
}

// ─── Graph build ──────────────────────────────────────────────────────────────
function buildGraph() {
  stopSim();

  let filteredNodes = GRAPH_DATA.nodes;
  if (currentFilter === 'high') {
    filteredNodes = filteredNodes.filter(function(n) { return n.severity === 'high'; });
  } else if (currentFilter === 'cycles') {
    const cycleIds = {};
    GRAPH_DATA.cycles.forEach(function(c) {
      c.forEach(function(id) { cycleIds[id] = true; });
    });
    filteredNodes = filteredNodes.filter(function(n) { return cycleIds[n.id]; });
  }

  const nodeIdSet = {};
  filteredNodes.forEach(function(n) { nodeIdSet[n.id] = true; });

  const filteredLinks = GRAPH_DATA.links.filter(function(l) {
    return nodeIdSet[l.source] && nodeIdSet[l.target];
  });

  const W = canvas.width || container.getBoundingClientRect().width;
  const H = canvas.height || container.getBoundingClientRect().height;
  const cx = W / 2, cy = H / 2;
  const radius = Math.min(W, H) * 0.35;

  nodes = filteredNodes.map(function(nd, i) {
    const angle = (2 * Math.PI * i) / filteredNodes.length;
    return Object.assign({}, nd, {
      x: cx + radius * Math.cos(angle) + (Math.random() - 0.5) * 20,
      y: cy + radius * Math.sin(angle) + (Math.random() - 0.5) * 20,
      vx: 0,
      vy: 0,
      fixed: false,
    });
  });

  const nodeIndex = {};
  nodes.forEach(function(n, i) { nodeIndex[n.id] = i; });

  links = filteredLinks
    .map(function(l) {
      return Object.assign({}, l, {
        sourceIdx: nodeIndex[l.source],
        targetIdx: nodeIndex[l.target],
      });
    })
    .filter(function(l) { return l.sourceIdx !== undefined && l.targetIdx !== undefined; });

  panX = 0; panY = 0; scale = 1;

  const emptyState = document.getElementById('empty-state');
  emptyState.style.display = nodes.length === 0 ? 'block' : 'none';

  if (nodes.length > 0) {
    startSim();
  } else {
    drawFrame();
  }
}
`;
}

/** Script section: force simulation and canvas drawing functions. */
export function buildScriptPhysics(): string {
  return `
// ─── Force simulation ─────────────────────────────────────────────────────────
const ALPHA_DECAY = 0.02;
const VELOCITY_DECAY = 0.6;

function startSim() {
  alpha = 1.0;
  simRunning = true;
  scheduleTick();
}

function stopSim() {
  simRunning = false;
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
}

function scheduleTick() {
  animFrame = requestAnimationFrame(tick);
}

function tick() {
  if (!simRunning) return;
  if (alpha < 0.001) {
    simRunning = false;
    drawFrame();
    return;
  }

  applyForces();
  integratePositions();
  alpha *= (1 - ALPHA_DECAY);

  drawFrame();
  scheduleTick();
}

function applyForces() {
  const W = canvas.width, H = canvas.height;
  const cx = (W / 2 - panX) / scale, cy = (H / 2 - panY) / scale;
  const repStrength = 200 * alpha;

  // Many-body repulsion
  for (let i = 0; i < nodes.length; i++) {
    const ni = nodes[i];
    if (ni.fixed) continue;
    for (let j = i + 1; j < nodes.length; j++) {
      const nj = nodes[j];
      const dx = ni.x - nj.x;
      const dy = ni.y - nj.y;
      const distSq = dx * dx + dy * dy + 0.01;
      const dist = Math.sqrt(distSq);
      const force = repStrength / distSq;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (!ni.fixed) { ni.vx += fx; ni.vy += fy; }
      if (!nj.fixed) { nj.vx -= fx; nj.vy -= fy; }
    }
  }

  // Link spring forces
  for (let k = 0; k < links.length; k++) {
    const link = links[k];
    const src = nodes[link.sourceIdx];
    const tgt = nodes[link.targetIdx];
    const dx = tgt.x - src.x;
    const dy = tgt.y - src.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const restLength = 80 + nodeRadius(src) + nodeRadius(tgt);
    const force = (dist - restLength) * 0.3 * alpha * (0.5 + link.strength * 0.5);
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    if (!src.fixed) { src.vx += fx; src.vy += fy; }
    if (!tgt.fixed) { tgt.vx -= fx; tgt.vy -= fy; }
  }

  // Center gravity
  const gravStrength = 0.05 * alpha;
  for (let i = 0; i < nodes.length; i++) {
    const nd = nodes[i];
    if (nd.fixed) continue;
    nd.vx += (cx - nd.x) * gravStrength;
    nd.vy += (cy - nd.y) * gravStrength;
  }

  // Collision avoidance
  for (let i = 0; i < nodes.length; i++) {
    const ni = nodes[i];
    const ri = nodeRadius(ni) + 4;
    for (let j = i + 1; j < nodes.length; j++) {
      const nj = nodes[j];
      const rj = nodeRadius(nj) + 4;
      const minDist = ri + rj;
      const dx = ni.x - nj.x;
      const dy = ni.y - nj.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      if (dist < minDist) {
        const overlap = (minDist - dist) * 0.5;
        const fx = (dx / dist) * overlap * 0.5;
        const fy = (dy / dist) * overlap * 0.5;
        if (!ni.fixed) { ni.vx += fx; ni.vy += fy; }
        if (!nj.fixed) { nj.vx -= fx; nj.vy -= fy; }
      }
    }
  }
}

function integratePositions() {
  for (let i = 0; i < nodes.length; i++) {
    const nd = nodes[i];
    if (nd.fixed) continue;
    nd.vx *= VELOCITY_DECAY;
    nd.vy *= VELOCITY_DECAY;
    nd.x += nd.vx;
    nd.y += nd.vy;
  }
}

// ─── Drawing ──────────────────────────────────────────────────────────────────
function drawFrame() {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(scale, scale);

  // Draw links
  if (showLinks) {
    for (let k = 0; k < links.length; k++) {
      const link = links[k];
      const src = nodes[link.sourceIdx];
      const tgt = nodes[link.targetIdx];
      const isHighlighted = selectedNode &&
        (src.id === selectedNode.id || tgt.id === selectedNode.id);

      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.lineWidth = isHighlighted ? 2.5 : Math.max(0.5, link.strength * 2.5);
      ctx.strokeStyle = isHighlighted
        ? LINK_COLOR_HIGHLIGHT
        : (link.inCycle ? LINK_COLOR_CYCLE : LINK_COLOR_NORMAL);
      ctx.globalAlpha = isHighlighted ? 1 : (link.inCycle ? 0.7 : 0.4 + link.strength * 0.3);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // Draw nodes
  for (let i = 0; i < nodes.length; i++) {
    const nd = nodes[i];
    const r = nodeRadius(nd);
    const isSelected = selectedNode && nd.id === selectedNode.id;
    const isHovered = hoveredNode && nd.id === hoveredNode.id;
    const isNeighbour = selectedNode && isNeighbourOf(nd, selectedNode);
    const dimmed = selectedNode && !isSelected && !isNeighbour;

    ctx.globalAlpha = dimmed ? 0.25 : 1;

    if (isSelected || isHovered) {
      ctx.shadowColor = isSelected ? '#58a6ff' : '#8b949e';
      ctx.shadowBlur = 12;
    }

    ctx.beginPath();
    ctx.arc(nd.x, nd.y, r, 0, 2 * Math.PI);
    ctx.fillStyle = SEV_COLOR[nd.severity] || '#8b949e';
    ctx.fill();

    if (nd.inCycle) {
      ctx.strokeStyle = '#f85149';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.shadowBlur = 0;

    if (isSelected) {
      ctx.strokeStyle = '#58a6ff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    if (showLabels && scale > 0.4) {
      const nameParts = nd.id.replace(/\\\\/g, '/').split('/');
      const label = nameParts[nameParts.length - 1] || nd.id;
      ctx.font = (scale < 0.7 ? 9 : 11) + 'px -apple-system,monospace';
      ctx.fillStyle = dimmed ? '#484f58' : '#c9d1d9';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, nd.x, nd.y + r + 3);
    }
  }

  ctx.globalAlpha = 1;
  ctx.restore();

  updateZoomLabel();
}

function isNeighbourOf(nd, selected) {
  for (let k = 0; k < links.length; k++) {
    const l = links[k];
    if (nodes[l.sourceIdx].id === selected.id && nodes[l.targetIdx].id === nd.id) return true;
    if (nodes[l.targetIdx].id === selected.id && nodes[l.sourceIdx].id === nd.id) return true;
  }
  return false;
}
`;
}

/** Script section: canvas events, tooltip, sidebar, and zoom controls. */
export function buildScriptControls(): string {
  return `
// ─── Canvas events ────────────────────────────────────────────────────────────
function resizeCanvas() {
  const rect = container.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  drawFrame();
}

function setupCanvasEvents() {
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mouseleave', onMouseLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('click', onClick);
}

function canvasToWorld(cx, cy) {
  return { x: (cx - panX) / scale, y: (cy - panY) / scale };
}

function findNodeAt(wx, wy) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const nd = nodes[i];
    const r = nodeRadius(nd);
    const dx = wx - nd.x, dy = wy - nd.y;
    if (dx * dx + dy * dy <= r * r) return nd;
  }
  return null;
}

function onMouseDown(e) {
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
  const wp = canvasToWorld(cx, cy);
  const nd = findNodeAt(wp.x, wp.y);
  if (nd) {
    dragNode = nd;
    nd.fixed = true;
  } else {
    isDragging = true;
    dragStart = { x: cx - panX, y: cy - panY };
  }
}

function onMouseMove(e) {
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
  const wp = canvasToWorld(cx, cy);

  if (dragNode) {
    dragNode.x = wp.x;
    dragNode.y = wp.y;
    dragNode.vx = 0;
    dragNode.vy = 0;
    if (alpha < 0.1) { alpha = 0.3; if (!simRunning) startSim(); }
    drawFrame();
    return;
  }

  if (isDragging) {
    panX = cx - dragStart.x;
    panY = cy - dragStart.y;
    drawFrame();
    return;
  }

  const nd = findNodeAt(wp.x, wp.y);
  if (nd !== hoveredNode) {
    hoveredNode = nd;
    drawFrame();
  }
  if (nd) showTooltip(e, nd);
  else hideTooltip();
}

function onMouseUp() {
  if (dragNode) { dragNode.fixed = false; dragNode = null; }
  isDragging = false;
}

function onMouseLeave() {
  isDragging = false;
  if (dragNode) { dragNode.fixed = false; dragNode = null; }
  hoveredNode = null;
  hideTooltip();
  drawFrame();
}

function onClick(e) {
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
  const wp = canvasToWorld(cx, cy);
  const nd = findNodeAt(wp.x, wp.y);
  if (nd) {
    selectedNode = (selectedNode && selectedNode.id === nd.id) ? null : nd;
  } else {
    selectedNode = null;
  }
  updateSidebar();
  drawFrame();
}

function onWheel(e) {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  const newScale = Math.min(4, Math.max(0.1, scale * factor));
  panX = cx - (cx - panX) * (newScale / scale);
  panY = cy - (cy - panY) * (newScale / scale);
  scale = newScale;
  drawFrame();
}

// ─── Tooltip (all values set via textContent) ─────────────────────────────────
function showTooltip(e, nd) {
  const tt = document.getElementById('tooltip');
  document.getElementById('tt-name').textContent = nd.id;
  document.getElementById('tt-fanin').textContent = String(nd.fanIn);
  document.getElementById('tt-fanout').textContent = String(nd.fanOut);
  document.getElementById('tt-inst').textContent = (nd.instability * 100).toFixed(0) + '%';
  document.getElementById('tt-prop').textContent = (nd.propagationCost * 100).toFixed(1) + '%';
  document.getElementById('tt-coc').textContent = (nd.costOfChange * 100).toFixed(0) + '% (' + nd.severity + ')';
  document.getElementById('tt-churn').textContent = nd.churn + ' commits';
  document.getElementById('tt-cycle').textContent = nd.inCycle ? 'Ja' : 'Nej';

  const x = Math.min(e.clientX + 12, window.innerWidth - 300);
  const y = Math.min(e.clientY + 12, window.innerHeight - 200);
  tt.style.left = x + 'px';
  tt.style.top = y + 'px';
  tt.style.display = 'block';
}

function hideTooltip() {
  document.getElementById('tooltip').style.display = 'none';
}

// ─── Sidebar (all values set via textContent) ─────────────────────────────────
function updateSidebar() {
  const placeholder = document.getElementById('node-detail-placeholder');
  const content = document.getElementById('node-detail-content');

  if (!selectedNode) {
    placeholder.style.display = 'flex';
    content.style.display = 'none';
    return;
  }

  const nd = selectedNode;
  const sevColor = SEV_COLOR[nd.severity] || '#8b949e';

  placeholder.style.display = 'none';
  content.style.display = 'block';

  document.getElementById('detail-name').textContent = nd.id;
  document.getElementById('detail-fanin').textContent = String(nd.fanIn);
  document.getElementById('detail-fanout').textContent = String(nd.fanOut);
  document.getElementById('detail-inst').textContent = (nd.instability * 100).toFixed(0) + '%';
  document.getElementById('detail-prop').textContent = (nd.propagationCost * 100).toFixed(1) + '%';
  document.getElementById('detail-coc').textContent = (nd.costOfChange * 100).toFixed(0) + '%';
  document.getElementById('detail-coc').style.color = sevColor;
  document.getElementById('detail-churn').textContent = nd.churn + ' commits';
  document.getElementById('detail-sev').textContent = nd.severity.toUpperCase() + (nd.inCycle ? ' - I CYKEL' : '');
  document.getElementById('detail-sev').style.color = sevColor;
}

// ─── Zoom controls ────────────────────────────────────────────────────────────
function zoomIn() {
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const newScale = Math.min(4, scale * 1.2);
  panX = cx - (cx - panX) * (newScale / scale);
  panY = cy - (cy - panY) * (newScale / scale);
  scale = newScale;
  drawFrame();
}

function zoomOut() {
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const newScale = Math.max(0.1, scale / 1.2);
  panX = cx - (cx - panX) * (newScale / scale);
  panY = cy - (cy - panY) * (newScale / scale);
  scale = newScale;
  drawFrame();
}

function resetView() {
  panX = 0; panY = 0; scale = 1;
  drawFrame();
}

function updateZoomLabel() {
  document.getElementById('zoom-label').textContent = Math.round(scale * 100) + '%';
}

// ─── Start ────────────────────────────────────────────────────────────────────
init();
`;
}

export function buildHtmlScript(dataJson: string, directory: string): string {
  return '<script>' +
    buildScriptInit(dataJson, directory) +
    buildScriptPhysics() +
    buildScriptControls() +
    '</script>';
}

/**
 * Generates a self-contained interactive HTML file for the architecture report.
 * Graph data is embedded as a JS constant; all user-visible strings are set via
 * textContent (not innerHTML) in the client-side script, preventing XSS.
 */
export function generateHtml(graphData: GraphData, directory: string): string {
  const dataJson = JSON.stringify(graphData);
  const dirTitle = escapeHtml(path.basename(directory));
  void dirTitle; // used in title below

  return `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Architecture Report</title>
${buildHtmlStyles()}
</head>
<body>
${buildHtmlBody()}
${buildHtmlScript(dataJson, directory)}
</body>
</html>`;
}

