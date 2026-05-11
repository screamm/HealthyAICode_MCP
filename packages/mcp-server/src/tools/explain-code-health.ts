import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const CODE_HEALTH_EXPLANATION = `
# Vad är Code Health?

Code Health är ett mått (1-10) på hur lätt kod är att förstå, ändra och underhålla.

## Skala
- 9.5-10.0: AI-redo — Säker och effektiv för AI-assisterat arbete
- 9.0-9.4: Grön (Hälsosam) — Liten risk
- 4.0-8.9: Gul (Teknisk skuld) — Ökad risk och underhållskostnad
- 1.0-3.9: Röd (Allvarlig teknisk skuld) — Hög risk, svår att ändra

## Varför spelar det roll för AI?
Forskning visar att AI-kodassistenter introducerar 60%+ fler buggar i ohälsosam kod.
Kod med hälsopoäng under 7.0 är inte pålitlig att modifiera med AI.

## Vad mäts?
- Cyklomatisk komplexitet (grenar i kod)
- Nestningsdjup (nästlade kontrollstrukturer)
- Funktions- och fillängd
- Parameterantal
- Kodlukter (code smells)
`.trim();

const PRODUCTIVITY_EXPLANATION = `
# Code Health och Produktivitet

## Forskningsresultat (CodeScene, peer-reviewed)
- Att förbättra från industri-genomsnittet 5.15 till 9.1 ger:
  - ~36% snabbare leveranstid
  - ~36% färre produktionsdefekter
  - ~50% lägre token-kostnad för AI-assistans

## AI-assistans och kodhälsa
- 20%: Utan strukturell vägledning fixar frontier-modeller bara 20% av problem
- 90-100%: Med Code Health-vägledning ökar fix-rate till 90-100%
- Varje poängs förbättring = ~4% snabbare och ~4% färre defekter

## Rekommendation
Sträva efter 9.5+ för AI-redo kod. Refaktorera till 9.5+ innan du låter AI
modifiera filen — annars riskerar du att AI introducerar buggar.
`.trim();

type McpToolRegistrar = (
  name: string,
  desc: string,
  schema: z.ZodRawShape,
  handler: (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>
) => void;

/** Registers the explain_code_health tool on the MCP server. */
export function registerExplainCodeHealth(server: McpServer): void {
  (server.tool as unknown as McpToolRegistrar)(
    'explain_code_health',
    'Förklarar vad Code Health-poängen betyder och hur den beräknas.',
    {},
    async () => ({ content: [{ type: 'text', text: CODE_HEALTH_EXPLANATION }] })
  );
}

/** Registers the explain_code_health_productivity tool on the MCP server. */
export function registerExplainProductivity(server: McpServer): void {
  (server.tool as unknown as McpToolRegistrar)(
    'explain_code_health_productivity',
    'Förklarar sambandet mellan Code Health och leveranshastighet/defekter.',
    {},
    async () => ({ content: [{ type: 'text', text: PRODUCTIVITY_EXPLANATION }] })
  );
}
