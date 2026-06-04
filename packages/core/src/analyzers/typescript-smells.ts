import type Parser from 'tree-sitter';
import type { Smell } from '../types';
import { detectTypeSafetyEscapes } from '../smells/type-safety-escape';
import { detectMagicNumbers } from '../smells/magic-number';
import { detectLowDocCoverage } from '../smells/doc-coverage';
import { detectComplexConditional } from '../smells/complex-conditional';
import { detectMessageChain } from '../smells/message-chain';
import { detectDataClumps } from '../smells/data-clumps';
import { typescriptProfile } from '../smells/language-profile';
import { detectSATD } from '../smells/satd';
import { detectGodClass } from '../smells/god-class';
import { detectFeatureEnvy } from '../smells/feature-envy';
import { detectPrimitiveObsession } from '../smells/primitive-obsession';
import { detectBumpyRoadChunks } from '../smells/bumpy-road';
import { detectTidyOpportunity } from '../smells/tidy-opportunity';

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
    ...(detectLowDocCoverage(root, ctx.code, typescriptProfile) as Smell[]),
    ...detectComplexConditional(root, typescriptProfile),
    ...detectMessageChain(root, typescriptProfile),
    ...detectDataClumps(root, typescriptProfile),
    ...detectSATD(root),
    ...detectGodClass(root, names, typescriptProfile),
    ...detectFeatureEnvy(root, names, typescriptProfile),
    ...detectPrimitiveObsession(root, typescriptProfile),
  ];

  for (const fnNode of functionNodes) {
    const br = detectBumpyRoadChunks(fnNode);
    if (br) {
      findings.push(br);
      continue;
    }
    // 2–3 chunks: below BumpyRoad, surface the non-scored TidyOpportunity advisory instead.
    const tidy = detectTidyOpportunity(fnNode);
    if (tidy) findings.push(tidy);
  }

  if (mi.index < 30) findings.push({ type: 'LowMaintainability', severity: mi.index < 15 ? 'medium' : 'low', line: 1, description: `Maintainability Index is ${mi.index}/100 — the file is hard to maintain (Halstead Volume=${Math.round(mi.halstead.volume)}, CC=${Math.round(avgCC)}).`, suggestion: 'Reduce the file complexity: extract functions, simplify logic, reduce cyclomatic complexity.' } as Smell);
  return findings;
}
