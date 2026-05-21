import type Parser from 'tree-sitter';
import type { Smell } from '../types';
import { detectTypeSafetyEscapes } from '../smells/type-safety-escape';
import { detectMagicNumbers } from '../smells/magic-number';
import { detectLowDocCoverage } from '../smells/doc-coverage';
import { detectComplexConditional } from '../smells/complex-conditional';
import { detectMessageChain } from '../smells/message-chain';
import { detectDataClumps } from '../smells/data-clumps';
import { detectSATD } from '../smells/satd';
import { detectGodClass } from '../smells/god-class';
import { detectFeatureEnvy } from '../smells/feature-envy';
import { detectPrimitiveObsession } from '../smells/primitive-obsession';
import { detectBumpyRoadChunks } from '../smells/bumpy-road';

type MIResult = { index: number; halstead: { volume: number } };

/** Collects all quality findings for a parsed TypeScript AST. */
export function collectTypeScriptSmells(
  root: Parser.SyntaxNode,
  ctx: { code: string; filePath: string },
  analysis: { names: Set<string>; mi: MIResult; avgCC: number; functionNodes: Parser.SyntaxNode[] },
): Smell[] {
  const { names, mi, avgCC, functionNodes } = analysis;
  const findings: Smell[] = [
    ...(detectTypeSafetyEscapes(root, ctx.code) as Smell[]),
    ...(detectMagicNumbers(root, ctx.filePath) as Smell[]),
    ...(detectLowDocCoverage(root, ctx.code) as Smell[]),
    ...detectComplexConditional(root),
    ...detectMessageChain(root),
    ...detectDataClumps(root),
    ...detectSATD(root),
    ...detectGodClass(root, names),
    ...detectFeatureEnvy(root, names),
    ...detectPrimitiveObsession(root),
  ];

  for (const fnNode of functionNodes) {
    const br = detectBumpyRoadChunks(fnNode);
    if (br) findings.push(br);
  }

  if (mi.index < 30) findings.push({ type: 'LowMaintainability', severity: mi.index < 15 ? 'medium' : 'low', line: 1, description: `Maintainability Index är ${mi.index}/100 — filen är svår att underhålla (Halstead Volume=${Math.round(mi.halstead.volume)}, CC=${Math.round(avgCC)}).`, suggestion: 'Minska filens komplexitet: extrahera funktioner, förenkla logik, reducera cyklomatisk komplexitet.' } as Smell);
  return findings;
}
