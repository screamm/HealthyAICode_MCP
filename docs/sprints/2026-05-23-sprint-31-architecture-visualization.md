# Sprint 31: Arkitekturvisualisering — interaktiv beroendesgraf med D3.js

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementera MCP-verktyget `code_health_architecture_report` som genererar en self-contained HTML-fil med en interaktiv D3.js force-directed beroendesgraf. Noder representerar filer/moduler (storlek = churn-frekvens, färg = `costOfChangeSeverity`), kanter representerar beroenden (tjocklek = kopplingstyrka, röd om kanten är del av en cykel). Interaktivitet: hover visar filinformation, klick highlightar direkta beroenden, filterknappar döljer/visar noder per severity-nivå. Ingen befintlig lokal MCP levererar visuell arkitekturanalys.

**Architecture:** MCP-verktyget `code_health_architecture_report` bygger ovanpå `code_health_architecture_debt` (Sprint 22) för beroendegrafs- och Cost-of-Change-data, och `code_health_hotspot` (Sprint 10) för churn-data. HTML-genereringen sker i `packages/mcp-server/src/tools/architecture-report.ts` via en D3.js-mall inbäddad som TypeScript-sträng-literal. D3.js v7 inkluderas via CDN-URL inbäddad i HTML-filen — inga ytterligare npm-beroenden.

**Tech Stack:** TypeScript 5.x, D3.js v7 (CDN, inbäddad i HTML), Vitest, pnpm workspaces

**Testkommando:** `cd packages/mcp-server && pnpm test` och `cd packages/core && pnpm test`

---

## Bakgrund och motivation

Sprint 22 (`code_health_architecture_debt`) levererade maskinläsbar arkitekturanalys: FAN-IN/OUT, Propagation Cost, cykliska beroenden och Cost of Change per modul som JSON. Datan är korrekt men svår att konsumera för en människa utan visualisering.

**Varför visualisering är nästa logiska steg:**

Arkitekturella problem — cykliska beroenden, flaskhalsar med hög FAN-IN, moduler med hög propagation cost — är svåra att förstå från tabelldata. En interaktiv graf gör dem omedelbart synliga:

- En röd kant = cykliskt beroende som blockerar oberoende deployment
- En stor röd nod = modul vars förändring riskerar att sprida sig till 20%+ av kodbasen
- En klustrad nodgrupp = modul-coupling som tyder på dålig separation of concerns

**Varför force-directed layout?**

Force-directed layout (D3.js `d3.forceSimulation`) placerar tätt kopplade moduler nära varandra och löst kopplade moduler långt ifrån varandra. Layouten reflekterar den faktiska kopplingsstrukturen utan manuell placering — ett matematiskt uttryck för kodbasens arkitektur.

**Jämförelse mot CodeScene:**

CodeScenes "System Mastery"-vy och "Code Health Treemap" är visuella men molnbaserade och betalda. IntelliJ IDEA Ultimate har arkitekturvy för Java men inte cross-language. `code_health_architecture_report` är lokal, open-source, cross-language och self-contained i en HTML-fil som kan delas via e-post eller versionshanteras.

**Varför self-contained HTML?**

En self-contained HTML-fil (D3.js via CDN, all data inbäddad som JSON i `<script>`) kräver inga serverkonfigurationer, inga webbramverk och ingen installation. MCP-verktyget returnerar filsökvägen; användaren öppnar filen i en webbläsare. Det passar MCP:s offline-first-filosofi.

---

## Filöversikt

| Fil | Ändring |
|-----|---------|
| `packages/mcp-server/src/tools/architecture-report.ts` | Ny — MCP-verktygsregistrering och HTML-orkestrering |
| `packages/mcp-server/src/html/architecture-graph-template.ts` | Ny — D3.js HTML-mall som TypeScript sträng-literal |
| `packages/mcp-server/src/html/graph-data-builder.ts` | Ny — bygger GraphData JSON från `ArchitectureDebtResult` |
| `packages/mcp-server/src/server.ts` | Ändra — registrera `code_health_architecture_report` |
| `packages/core/src/types.ts` | Lägg till `ArchitectureReportNode`, `ArchitectureReportEdge`, `ArchitectureReportData` |
| `packages/mcp-server/tests/tools/architecture-report.test.ts` | Ny testfil |
| `packages/mcp-server/tests/html/graph-data-builder.test.ts` | Ny testfil |

---

## Teknisk specifikation — grafformat

### GraphData — JSON-schema inbäddat i HTML

```typescript
interface ArchitectureReportNode {
  id: string;               // Filsökväg relativt repo-root: "src/auth/login.ts"
  label: string;            // Filnamn utan sökväg: "login.ts"
  size: number;             // Normaliserat [1, 50] baserat på churn-frekvens
  severity: 'critical' | 'high' | 'medium' | 'low';  // costOfChangeSeverity
  costOfChange: number;     // Råvärde [0, 1] från architecture-debt
  fanIn: number;
  fanOut: number;
  propagationCost: number;  // [0, 1]
  inCycle: boolean;
}

interface ArchitectureReportEdge {
  source: string;           // Node id
  target: string;           // Node id
  strength: number;         // [0, 1] — normaliserat kopplingsantal
  isCyclic: boolean;        // sant om kanten är del av en cykel
}

interface ArchitectureReportData {
  generatedAt: string;      // ISO 8601
  repoPath: string;
  totalFiles: number;
  totalEdges: number;
  cyclicGroups: number;     // antal SCCs med storlek > 1
  nodes: ArchitectureReportNode[];
  edges: ArchitectureReportEdge[];
}
```

### Severity-klassificering

```
costOfChange >= 0.7  → 'critical'   (röd nod, #e74c3c)
costOfChange >= 0.5  → 'high'       (orange nod, #e67e22)
costOfChange >= 0.3  → 'medium'     (gul nod, #f1c40f)
costOfChange < 0.3   → 'low'        (grön nod, #2ecc71)
```

### Normalisering av nodstorlek

```
size = 1 + Math.round((churnFrequency / maxChurn) * 49)
```

Noder utan churnddata (filen har aldrig ändrats i git) får `size = 5` (standardstorlek).

---

## Task 1 — Definiera typer och GraphData-byggare

**Files:**
- Modify: `packages/core/src/types.ts`
- Create: `packages/mcp-server/src/html/graph-data-builder.ts`
- Create: `packages/mcp-server/tests/html/graph-data-builder.test.ts`

Stabilisera datatransformationen från `ArchitectureDebtResult` till `ArchitectureReportData` innan HTML-generering.

- [ ] **Steg 1: Lägg till typer i `packages/core/src/types.ts`**

```typescript
export interface ArchitectureReportNode {
  id: string;
  label: string;
  size: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  costOfChange: number;
  fanIn: number;
  fanOut: number;
  propagationCost: number;
  inCycle: boolean;
}

export interface ArchitectureReportEdge {
  source: string;
  target: string;
  strength: number;
  isCyclic: boolean;
}

export interface ArchitectureReportData {
  generatedAt: string;
  repoPath: string;
  totalFiles: number;
  totalEdges: number;
  cyclicGroups: number;
  nodes: ArchitectureReportNode[];
  edges: ArchitectureReportEdge[];
}
```

- [ ] **Steg 2: Skriv det failande testet**

```typescript
// packages/mcp-server/tests/html/graph-data-builder.test.ts
import { describe, it, expect } from 'vitest';
import { buildGraphData } from '../../src/html/graph-data-builder';
import type { ArchitectureDebtResult } from '@healthy-ai-code/core';

const MOCK_DEBT_RESULT: ArchitectureDebtResult = {
  modules: [
    {
      filePath: 'src/auth/login.ts',
      fanIn: 5,
      fanOut: 2,
      instability: 0.29,
      propagationCost: 0.35,
      inCycle: false,
      cycleName: undefined,
      costOfChange: 0.62,
      changeFrequency: 12,
    },
    {
      filePath: 'src/utils/helper.ts',
      fanIn: 8,
      fanOut: 0,
      instability: 0,
      propagationCost: 0.55,
      inCycle: true,
      cycleName: 'cycle-1',
      costOfChange: 0.81,
      changeFrequency: 3,
    },
    {
      filePath: 'src/config/constants.ts',
      fanIn: 1,
      fanOut: 1,
      instability: 0.5,
      propagationCost: 0.05,
      inCycle: false,
      cycleName: undefined,
      costOfChange: 0.12,
      changeFrequency: 1,
    },
  ],
  dependencies: [
    { from: 'src/auth/login.ts', to: 'src/utils/helper.ts', count: 3 },
    { from: 'src/utils/helper.ts', to: 'src/config/constants.ts', count: 1 },
  ],
  cycles: [['src/utils/helper.ts']],
  summary: { totalModules: 3, totalEdges: 2, cyclicGroups: 1, avgCostOfChange: 0.52 },
};

describe('buildGraphData', () => {
  it('skapar korrekt antal noder', () => {
    const data = buildGraphData(MOCK_DEBT_RESULT, '/repo');
    expect(data.nodes).toHaveLength(3);
  });

  it('klassificerar severity korrekt', () => {
    const data = buildGraphData(MOCK_DEBT_RESULT, '/repo');
    const helper = data.nodes.find(n => n.id.includes('helper'));
    expect(helper?.severity).toBe('critical');  // costOfChange = 0.81
    const login = data.nodes.find(n => n.id.includes('login'));
    expect(login?.severity).toBe('high');        // costOfChange = 0.62
    const constants = data.nodes.find(n => n.id.includes('constants'));
    expect(constants?.severity).toBe('low');     // costOfChange = 0.12
  });

  it('normaliserar nodstorlek till [1, 50]', () => {
    const data = buildGraphData(MOCK_DEBT_RESULT, '/repo');
    for (const node of data.nodes) {
      expect(node.size).toBeGreaterThanOrEqual(1);
      expect(node.size).toBeLessThanOrEqual(50);
    }
  });

  it('skapar kanter med isCyclic korrekt satt', () => {
    const data = buildGraphData(MOCK_DEBT_RESULT, '/repo');
    expect(data.edges).toHaveLength(2);
    // Kanten från helper (inCycle) markeras som cyklisk
    const cyclicEdge = data.edges.find(e => e.source.includes('helper'));
    expect(cyclicEdge?.isCyclic).toBe(true);
  });

  it('sätter generatedAt som ISO 8601-sträng', () => {
    const data = buildGraphData(MOCK_DEBT_RESULT, '/repo');
    expect(() => new Date(data.generatedAt)).not.toThrow();
    expect(data.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('räknar cyclicGroups korrekt', () => {
    const data = buildGraphData(MOCK_DEBT_RESULT, '/repo');
    expect(data.cyclicGroups).toBe(1);
  });
});
```

- [ ] **Steg 3: Implementera `graph-data-builder.ts`**

```typescript
// packages/mcp-server/src/html/graph-data-builder.ts
import type { ArchitectureDebtResult, ArchitectureReportData,
              ArchitectureReportNode, ArchitectureReportEdge } from '@healthy-ai-code/core';
import * as path from 'path';

function classifySeverity(costOfChange: number): ArchitectureReportNode['severity'] {
  if (costOfChange >= 0.7) return 'critical';
  if (costOfChange >= 0.5) return 'high';
  if (costOfChange >= 0.3) return 'medium';
  return 'low';
}

function normalizeSize(churn: number, maxChurn: number): number {
  if (maxChurn === 0) return 5;
  return 1 + Math.round((churn / maxChurn) * 49);
}

export function buildGraphData(
  debtResult: ArchitectureDebtResult,
  repoPath: string,
): ArchitectureReportData {
  const maxChurn = Math.max(...debtResult.modules.map(m => m.changeFrequency ?? 0), 1);
  const cyclicNodeIds = new Set(debtResult.cycles.flat());

  const nodes: ArchitectureReportNode[] = debtResult.modules.map(m => ({
    id: m.filePath,
    label: path.basename(m.filePath),
    size: normalizeSize(m.changeFrequency ?? 0, maxChurn),
    severity: classifySeverity(m.costOfChange),
    costOfChange: m.costOfChange,
    fanIn: m.fanIn,
    fanOut: m.fanOut,
    propagationCost: m.propagationCost,
    inCycle: cyclicNodeIds.has(m.filePath),
  }));

  const maxCount = Math.max(...debtResult.dependencies.map(d => d.count), 1);
  const edges: ArchitectureReportEdge[] = debtResult.dependencies.map(d => ({
    source: d.from,
    target: d.to,
    strength: d.count / maxCount,
    isCyclic: cyclicNodeIds.has(d.from) && cyclicNodeIds.has(d.to),
  }));

  return {
    generatedAt: new Date().toISOString(),
    repoPath,
    totalFiles: nodes.length,
    totalEdges: edges.length,
    cyclicGroups: debtResult.summary.cyclicGroups,
    nodes,
    edges,
  };
}
```

- [ ] **Steg 4: Kör testet (PASS) och commit**

```bash
git add packages/core/src/types.ts \
        packages/mcp-server/src/html/graph-data-builder.ts \
        packages/mcp-server/tests/html/graph-data-builder.test.ts
git commit -m "feat(mcp-server): add GraphData type definitions and graph-data-builder from ArchitectureDebtResult"
```

**Estimat:** 3 timmar | **AI-modell:** [Sonnet]

**Acceptanskriterier:**
- [ ] `buildGraphData` producerar korrekt antal noder och kanter
- [ ] Severity-klassificeringen är korrekt för alla tre tröskelvärden
- [ ] Nodstorlek är alltid i [1, 50]
- [ ] `isCyclic` är `true` för kanter mellan noder som båda är i cykler
- [ ] `generatedAt` är en giltig ISO 8601-sträng
- [ ] Alla 6 testfall är gröna

---

## Task 2 — D3.js HTML-mall

**Files:**
- Create: `packages/mcp-server/src/html/architecture-graph-template.ts`
- Create: `packages/mcp-server/tests/html/architecture-graph-template.test.ts`

D3.js-grafen implementeras som en TypeScript-sträng-literal. Alla stilar (CSS) och skript (JavaScript/D3.js) är inbäddade direkt i HTML-filen.

- [ ] **Steg 1: Skriv det failande testet**

```typescript
// packages/mcp-server/tests/html/architecture-graph-template.test.ts
import { describe, it, expect } from 'vitest';
import { generateArchitectureHtml } from '../../src/html/architecture-graph-template';
import type { ArchitectureReportData } from '@healthy-ai-code/core';

const MINIMAL_DATA: ArchitectureReportData = {
  generatedAt: '2026-05-23T10:00:00.000Z',
  repoPath: '/repo',
  totalFiles: 2,
  totalEdges: 1,
  cyclicGroups: 0,
  nodes: [
    { id: 'src/a.ts', label: 'a.ts', size: 20, severity: 'high',
      costOfChange: 0.6, fanIn: 2, fanOut: 1, propagationCost: 0.3, inCycle: false },
    { id: 'src/b.ts', label: 'b.ts', size: 5, severity: 'low',
      costOfChange: 0.1, fanIn: 0, fanOut: 1, propagationCost: 0.05, inCycle: false },
  ],
  edges: [
    { source: 'src/a.ts', target: 'src/b.ts', strength: 1.0, isCyclic: false },
  ],
};

describe('generateArchitectureHtml', () => {
  it('returnerar en sträng som innehåller <!DOCTYPE html>', () => {
    const html = generateArchitectureHtml(MINIMAL_DATA);
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('innehåller d3.js CDN-länk', () => {
    const html = generateArchitectureHtml(MINIMAL_DATA);
    expect(html).toContain('d3js.org');
  });

  it('bäddar in GraphData som JSON i en script-tagg', () => {
    const html = generateArchitectureHtml(MINIMAL_DATA);
    expect(html).toContain('"src/a.ts"');
    expect(html).toContain('"src/b.ts"');
  });

  it('innehåller d3.forceSimulation', () => {
    const html = generateArchitectureHtml(MINIMAL_DATA);
    expect(html).toContain('forceSimulation');
  });

  it('innehåller filterknapp-HTML för severity-nivåer', () => {
    const html = generateArchitectureHtml(MINIMAL_DATA);
    expect(html).toContain('critical');
    expect(html).toContain('high');
    expect(html).toContain('medium');
    expect(html).toContain('low');
  });

  it('innehåller hover-tooltip-logik', () => {
    const html = generateArchitectureHtml(MINIMAL_DATA);
    expect(html).toContain('tooltip');
  });

  it('innehåller cykel-markeringslogik (röd kant)', () => {
    const html = generateArchitectureHtml(MINIMAL_DATA);
    expect(html).toContain('isCyclic');
  });

  it('är en giltig HTML-sträng (öppnar och stänger html-tagg)', () => {
    const html = generateArchitectureHtml(MINIMAL_DATA);
    expect(html.trim()).toMatch(/^<!DOCTYPE html>/);
    expect(html.trim()).toMatch(/<\/html>$/);
  });
});
```

- [ ] **Steg 2: Implementera `architecture-graph-template.ts`**

Mallen ska innehålla:

**HTML-struktur:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Architecture Report — {repoPath}</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    /* Nod-färger per severity */
    /* Kant-styling: röd om isCyclic */
    /* Tooltip-styling */
    /* Filter-knapp-styling */
  </style>
</head>
<body>
  <header>
    <h1>Architecture Dependency Graph</h1>
    <p>Generated: {generatedAt} | Files: {totalFiles} | Cyclic groups: {cyclicGroups}</p>
    <div id="filters">
      <button data-severity="critical">Critical</button>
      <button data-severity="high">High</button>
      <button data-severity="medium">Medium</button>
      <button data-severity="low">Low</button>
    </div>
  </header>
  <svg id="graph"></svg>
  <div id="tooltip"></div>
  <script>
    const graphData = /* GRAPH_DATA_JSON */;
    // D3.js force simulation
    // Noder: cirkel, storlek=node.size, färg=severityColor(node.severity)
    // Kanter: linje, tjocklek=edge.strength*4, färg=isCyclic?'#e74c3c':'#95a5a6'
    // Hover: visa tooltip med fanIn, fanOut, propagationCost, costOfChange
    // Klick: highlighta direkta grannar, tonar bort resten
    // Filter: döljer/visar noder per severity-nivå
  </script>
</body>
</html>
```

**D3.js force-simulation-kärnan:**

```javascript
const simulation = d3.forceSimulation(graphData.nodes)
  .force('link', d3.forceLink(graphData.edges)
    .id(d => d.id)
    .strength(d => d.strength * 0.5))
  .force('charge', d3.forceManyBody().strength(-120))
  .force('center', d3.forceCenter(width / 2, height / 2))
  .force('collision', d3.forceCollide().radius(d => d.size + 4));

const link = svg.append('g').selectAll('line')
  .data(graphData.edges)
  .join('line')
  .attr('stroke', d => d.isCyclic ? '#e74c3c' : '#95a5a6')
  .attr('stroke-width', d => Math.max(1, d.strength * 4))
  .attr('stroke-opacity', 0.7);

const node = svg.append('g').selectAll('circle')
  .data(graphData.nodes)
  .join('circle')
  .attr('r', d => d.size)
  .attr('fill', d => SEVERITY_COLORS[d.severity])
  .call(drag(simulation));
```

**Hover-tooltip:**

```javascript
node.on('mouseover', (event, d) => {
  tooltip.style('display', 'block')
    .html(`<strong>${d.label}</strong><br>
           FAN-IN: ${d.fanIn} | FAN-OUT: ${d.fanOut}<br>
           Propagation Cost: ${(d.propagationCost * 100).toFixed(1)}%<br>
           Cost of Change: ${d.costOfChange.toFixed(2)}<br>
           ${d.inCycle ? '⚠ Part of cyclic dependency' : ''}`);
})
.on('mousemove', (event) => {
  tooltip.style('left', (event.pageX + 10) + 'px')
         .style('top', (event.pageY - 10) + 'px');
})
.on('mouseout', () => tooltip.style('display', 'none'));
```

**Klick-interaktivitet:**

```javascript
node.on('click', (event, d) => {
  const connectedIds = new Set([d.id]);
  graphData.edges.forEach(e => {
    if (e.source.id === d.id) connectedIds.add(e.target.id);
    if (e.target.id === d.id) connectedIds.add(e.source.id);
  });
  node.attr('opacity', n => connectedIds.has(n.id) ? 1.0 : 0.15);
  link.attr('opacity', e =>
    e.source.id === d.id || e.target.id === d.id ? 1.0 : 0.05);
});
```

**Filter-knappar:**

```javascript
document.querySelectorAll('#filters button').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.classList.toggle('active');
    const hiddenSeverities = [...document.querySelectorAll('#filters button.active')]
      .map(b => b.dataset.severity);
    node.attr('display', n => hiddenSeverities.includes(n.severity) ? 'none' : 'block');
  });
});
```

- [ ] **Steg 3: Kör testet (PASS) och commit**

```bash
git add packages/mcp-server/src/html/architecture-graph-template.ts \
        packages/mcp-server/tests/html/architecture-graph-template.test.ts
git commit -m "feat(mcp-server): add D3.js force-directed architecture graph HTML template with hover/click/filter"
```

**Estimat:** 6 timmar | **AI-modell:** [Sonnet]

**Acceptanskriterier:**
- [ ] `generateArchitectureHtml` returnerar giltig HTML som börjar med `<!DOCTYPE html>` och slutar med `</html>`
- [ ] D3.js CDN-länk (`d3js.org`) inkluderas
- [ ] GraphData JSON är inbäddad och innehåller nodernas `id`
- [ ] `forceSimulation` är synlig i HTML-strängen
- [ ] Filterknappar för `critical`, `high`, `medium`, `low` finns
- [ ] `tooltip`-element och hover-logik finns
- [ ] `isCyclic` används för att särskilja kant-färg
- [ ] Alla 8 testfall är gröna

---

## Task 3 — MCP-verktygsregistrering

**Files:**
- Create: `packages/mcp-server/src/tools/architecture-report.ts`
- Modify: `packages/mcp-server/src/server.ts`
- Create: `packages/mcp-server/tests/tools/architecture-report.test.ts`

MCP-verktyget `code_health_architecture_report` anropar befintlig arkitekturanalys (Sprint 22), bygger GraphData och skriver HTML-filen till disk.

- [ ] **Steg 1: Skriv det failande testet**

```typescript
// packages/mcp-server/tests/tools/architecture-report.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Testar HTML-generering i isolering — MCP-verktyget mockas
import { buildGraphData } from '../../src/html/graph-data-builder';
import { generateArchitectureHtml } from '../../src/html/architecture-graph-template';
import type { ArchitectureReportData } from '@healthy-ai-code/core';

describe('architecture-report integration', () => {
  it('genererar och skriver en HTML-fil till disk', async () => {
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'arch-report-'));
    const outputPath = path.join(tmpDir, 'architecture-report.html');

    const mockData: ArchitectureReportData = {
      generatedAt: new Date().toISOString(),
      repoPath: '/repo',
      totalFiles: 1,
      totalEdges: 0,
      cyclicGroups: 0,
      nodes: [{ id: 'src/app.ts', label: 'app.ts', size: 10, severity: 'low',
                costOfChange: 0.1, fanIn: 0, fanOut: 0, propagationCost: 0, inCycle: false }],
      edges: [],
    };

    const html = generateArchitectureHtml(mockData);
    await fsp.writeFile(outputPath, html, 'utf-8');

    const written = await fsp.readFile(outputPath, 'utf-8');
    expect(written).toContain('<!DOCTYPE html>');
    expect(written).toContain('app.ts');
    expect(written.length).toBeGreaterThan(5000);

    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it('buildGraphData + generateArchitectureHtml pipeline producerar giltig HTML', () => {
    const mockResult = {
      modules: [{
        filePath: 'src/index.ts', fanIn: 0, fanOut: 1, instability: 1,
        propagationCost: 0.1, inCycle: false, cycleName: undefined,
        costOfChange: 0.2, changeFrequency: 5,
      }],
      dependencies: [],
      cycles: [],
      summary: { totalModules: 1, totalEdges: 0, cyclicGroups: 0, avgCostOfChange: 0.2 },
    };
    const graphData = buildGraphData(mockResult as Parameters<typeof buildGraphData>[0], '/repo');
    const html = generateArchitectureHtml(graphData);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html.length).toBeGreaterThan(1000);
  });
});
```

- [ ] **Steg 2: Implementera `architecture-report.ts`**

```typescript
// packages/mcp-server/src/tools/architecture-report.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { buildGraphData } from '../html/graph-data-builder';
import { generateArchitectureHtml } from '../html/architecture-graph-template';
// Importera befintlig arkitekturanalys från Sprint 22
import { analyzeArchitectureDebt } from '@healthy-ai-code/core';

export function registerArchitectureReport(server: McpServer): void {
  (server.tool as unknown as McpToolRegistrar)(
    'code_health_architecture_report',
    'Genererar en interaktiv HTML-rapport med D3.js force-directed beroendesgraf. '
    + 'Noder = filer (storlek=churn, färg=cost-of-change-severity). '
    + 'Kanter = beroenden (röda om cykliska). '
    + 'Interaktivitet: hover=filinfo, klick=highlighta beroenden, filterknappar per severity.',
    {
      repoPath: z.string()
        .describe('Absolut sökväg till git-repo att analysera'),
      outputPath: z.string().optional()
        .describe('Sökväg för HTML-output-fil (default: {repoPath}/architecture-report.html)'),
      maxNodes: z.number().int().min(10).max(500).default(200)
        .describe('Max antal noder att inkludera (väljer de med högst costOfChange)'),
      includeExternalDeps: z.boolean().default(false)
        .describe('Inkludera externa npm-paket som noder (gör grafen större)'),
    },
    async (args) => {
      try {
        const debtResult = await analyzeArchitectureDebt({
          repoPath: args.repoPath,
          includeExternalDeps: args.includeExternalDeps,
        });

        // Begränsa till maxNodes — välj de med högst costOfChange
        if (debtResult.modules.length > args.maxNodes) {
          debtResult.modules.sort((a, b) => b.costOfChange - a.costOfChange);
          const keepIds = new Set(
            debtResult.modules.slice(0, args.maxNodes).map(m => m.filePath)
          );
          debtResult.modules = debtResult.modules.slice(0, args.maxNodes);
          debtResult.dependencies = debtResult.dependencies.filter(
            d => keepIds.has(d.from) && keepIds.has(d.to)
          );
        }

        const graphData = buildGraphData(debtResult, args.repoPath);
        const html = generateArchitectureHtml(graphData);

        const outputPath = args.outputPath
          ?? path.join(args.repoPath, 'architecture-report.html');
        await fsp.writeFile(outputPath, html, 'utf-8');

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              outputPath,
              summary: {
                totalFiles: graphData.totalFiles,
                totalEdges: graphData.totalEdges,
                cyclicGroups: graphData.cyclicGroups,
                criticalNodes: graphData.nodes.filter(n => n.severity === 'critical').length,
                highNodes: graphData.nodes.filter(n => n.severity === 'high').length,
              },
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: 'text' as const,
            text: `Architecture report failed: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    },
  );
}
```

- [ ] **Steg 3: Registrera i `server.ts`**

```typescript
import { registerArchitectureReport } from './tools/architecture-report';
// ...
registerArchitectureDebt(server);
registerArchitectureReport(server);  // Sprint 31
registerConfigTools(server);
```

- [ ] **Steg 4: Kör testet (PASS) och commit**

```bash
git add packages/mcp-server/src/tools/architecture-report.ts \
        packages/mcp-server/src/server.ts \
        packages/mcp-server/tests/tools/architecture-report.test.ts
git commit -m "feat(mcp-server): add code_health_architecture_report tool with D3.js HTML generation"
```

**Estimat:** 4 timmar | **AI-modell:** [Sonnet]

**Acceptanskriterier:**
- [ ] MCP-verktyget accepterar `repoPath`, `outputPath` (optional), `maxNodes`, `includeExternalDeps`
- [ ] HTML-filen skrivs till `outputPath` (eller default `{repoPath}/architecture-report.html`)
- [ ] Output JSON innehåller `totalFiles`, `totalEdges`, `cyclicGroups`, `criticalNodes`, `highNodes`
- [ ] `maxNodes`-begränsningen väljer de `n` noder med högst `costOfChange`
- [ ] Felhantering: icke-existerande `repoPath` → `isError: true`
- [ ] Båda testfall är gröna

---

## Task 4 — Typecheck och fullständig testsvit

**Files:**
- Alla befintliga testfiler

- [ ] **Steg 1: Kör hela testsviten**

```
pnpm -r test
```

Förväntat: alla tester PASS i `core` och `mcp-server`, inga regressioner.

- [ ] **Steg 2: Kör typecheck**

```
pnpm -r typecheck
```

Förväntat: inga TypeScript-fel.

- [ ] **Steg 3: Manuell rök-test av HTML-output**

Om ett test-repo finns lokalt — kör:
```
code_health_architecture_report { repoPath: "/path/to/test-repo" }
```
Öppna den genererade HTML-filen i en webbläsare. Verifiera:
- [ ] Grafen laddas och noder är synliga
- [ ] Hover visar filinfo i tooltip
- [ ] Klick på en nod highlightar dess grannar
- [ ] Filterknappar fungerar
- [ ] Röda kanter syns om cykler finns

- [ ] **Steg 4: Slutkommit**

```bash
git commit -m "test(mcp-server): verify Sprint 31 architecture visualization pipeline passes all tests"
```

**Estimat:** 2 timmar | **AI-modell:** [Haiku]

---

## Testkrav

| # | Test | Acceptansvillkor |
|---|------|-----------------|
| T1 | `buildGraphData`: nodantal | `nodes.length === modules.length` |
| T2 | `buildGraphData`: severity | `costOfChange >= 0.7` → `'critical'`, korrekt för alla tre trösklar |
| T3 | `buildGraphData`: nodstorlek | `size` alltid i [1, 50] |
| T4 | `buildGraphData`: cykliska kanter | `isCyclic: true` när både source och target är i cykel |
| T5 | `buildGraphData`: generatedAt | Giltig ISO 8601-sträng |
| T6 | `buildGraphData`: cyclicGroups | Korrekt från `summary.cyclicGroups` |
| T7 | `generateArchitectureHtml`: DOCTYPE | Strängen börjar med `<!DOCTYPE html>` |
| T8 | `generateArchitectureHtml`: D3.js CDN | `d3js.org` finns i strängen |
| T9 | `generateArchitectureHtml`: inbäddad data | Nod-id:n finns i strängen |
| T10 | `generateArchitectureHtml`: forceSimulation | `forceSimulation` finns i strängen |
| T11 | `generateArchitectureHtml`: filterknappar | `critical`, `high`, `medium`, `low` finns |
| T12 | `generateArchitectureHtml`: tooltip | `tooltip` finns i strängen |
| T13 | `generateArchitectureHtml`: cyklisk kant-logik | `isCyclic` finns i strängen |
| T14 | `generateArchitectureHtml`: välformad HTML | Strängen slutar med `</html>` |
| T15 | Integration: HTML-filskrivning | `fsp.writeFile` lyckas och filen > 5 KB |
| T16 | Integration: pipeline end-to-end | `buildGraphData` + `generateArchitectureHtml` producerar giltig HTML |

## Definition of Done

- [ ] Alla 4 tasks har gröna tester
- [ ] `pnpm -r test` passerar utan regressions
- [ ] `pnpm -r typecheck` passerar utan TypeScript-fel
- [ ] MCP-verktyget `code_health_architecture_report` är registrerat i `server.ts`
- [ ] `ArchitectureReportNode`, `ArchitectureReportEdge`, `ArchitectureReportData` är exporterade från `@healthy-ai-code/core`
- [ ] HTML-filen är self-contained (D3.js via CDN, all data inbäddad)
- [ ] Noder är korrekt färgkodade per severity: critical=röd, high=orange, medium=gul, low=grön
- [ ] Kanter har röd färg om `isCyclic: true`
- [ ] Hover visar fanIn, fanOut, propagationCost och costOfChange
- [ ] Klick highlightar direkta grannar och tonar bort resten
- [ ] Filterknappar döljer/visar noder per severity-nivå
- [ ] `maxNodes`-parametern begränsar grafen till de `n` noder med högst costOfChange

## Koppling till CodeScene-jämförelsen

CodeScenes viktigaste konkurrensfördelar är: (1) System-Mastery-kartor, (2) Architectural Hotspots och (3) visuell presentation av beroendegrafer. Sprint 31 adresserar direkt punkt 2 och 3 med en lokal, open-source lösning. Den force-directed grafen gör cykliska beroenden och högrisk-moduler visuellt omedelbart synliga utan molnanrop.

`code_health_architecture_report` kombinerar `code_health_architecture_debt` (Sprint 22) och `code_health_hotspot` (Sprint 10) till ett enda visuellt gränssnitt — ett steg mot att matcha CodeScenes "Architecture Analysis Dashboard" som en self-hosted lösning.

## Risker

| Risk | Sannolikhet | Påverkan | Mitigation |
|------|-------------|----------|------------|
| D3.js CDN-länk är otillgänglig i offline-miljöer | Medel | Hög | Dokumentera offline-alternativ: ladda ner `d3.v7.min.js` och ersätt CDN-URL med lokal sökväg |
| Stora repos (>200 noder) gör grafen oläsbar | Hög | Medel | `maxNodes`-parametern begränsar till 200 noder med högst costOfChange |
| Force-simulation konvergerar långsamt för täta grafer | Medel | Låg | Öka `d3.forceManyBody().strength()` — konfigurbart i HTML |
| `analyzeArchitectureDebt` är långsam på stora repos | Medel | Medel | MCP-verktyg är asynkrona; acceptabelt med timeout-dokumentation |
| HTML-strängen är för stor för MCP-responsformat | Låg | Hög | Skriver till fil, returnerar filsökväg — inte HTML-strängen direkt i response |
| Kant-riktning i D3.js är visuellt oklar | Låg | Låg | Lägg till pilspetsar via `d3.marker` om feedback begär det |

**Totalt estimat:** ~15 timmar fördelade på 4 tasks
