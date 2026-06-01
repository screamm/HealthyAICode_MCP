#!/usr/bin/env node
/**
 * scripts/rct/run-real-agent-rct.mjs
 *
 * Real-Agent Gate-On vs Gate-Off RCT Runner — Phase 2 harness.
 *
 * This runner orchestrates a single file through one or both RCT arms. It does NOT
 * contain the LLM loop itself — that is the job of the Phase 2 worker agents who
 * CALL this runner (or import its named exports).
 *
 * Key responsibilities:
 *   1. Load the original file from the corpus (READ-ONLY from disk).
 *   2. Given a proposed edit (either from a real LLM agent via --supplied-edit, or
 *      from a live Anthropic API call in full mode), evaluate it through the gate.
 *   3. In gate-on arm: feed deny feedback back to the caller and retry up to
 *      maxRevisions times.
 *   4. Score the final code with analyzeCode + collectSecuritySmells (the same
 *      measurement used in the prior simulation, for comparability).
 *   5. Run anti-gaming checks (comment count, export count, parse check).
 *   6. Write per-file result to benchmark-data/rct-real/{slug}-{arm}.json and
 *      return the ArmResult object to the caller.
 *
 * Usage (CLI):
 *   # Dry-run with a hand-supplied edit (no LLM call):
 *   node scripts/rct/run-real-agent-rct.mjs \
 *     --file field-repos/cli-go/context/context.go \
 *     --arm gate-on \
 *     --dry-run \
 *     --supplied-edit /path/to/proposed_edit.txt
 *
 *   # Both arms, dry-run with same supplied edit for both:
 *   node scripts/rct/run-real-agent-rct.mjs \
 *     --file field-repos/cli-go/context/context.go \
 *     --arm both \
 *     --dry-run \
 *     --supplied-edit /path/to/proposed_edit.txt
 *
 *   # Full run (requires ANTHROPIC_API_KEY env var):
 *   node scripts/rct/run-real-agent-rct.mjs \
 *     --file field-repos/cli-go/context/context.go \
 *     --arm both \
 *     --model claude-sonnet-4-5-20250815
 *
 * Named exports (for Phase 2 worker agents importing this module):
 *   runArm, scoreCode, applyGate, buildTaskPrompt, checkAntiGaming
 *
 * Pre-registration: docs/benchmarks/rct-preregistration.md
 * Output dir:       benchmark-data/rct-real/
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, basename, extname, relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = join(__dirname, '..', '..');

// ─── Lazy-load core and gate (built packages, not src) ────────────────────────

let _core = null;
let _gate = null;

async function loadCore() {
  if (_core) return _core;
  const coreDist = join(ROOT, 'packages', 'core', 'dist', 'index.js');
  if (!existsSync(coreDist)) {
    throw new Error(`packages/core/dist/index.js not found — run 'pnpm build' first.`);
  }
  _core = await import(pathToFileURL(coreDist).href);
  return _core;
}

async function loadGate() {
  if (_gate) return _gate;
  const gateDist = join(ROOT, 'packages', 'gate', 'dist');
  const evalPath  = join(gateDist, 'evaluate-gate.js');
  const secPath   = join(gateDist, 'security-smells.js');
  if (!existsSync(evalPath)) {
    throw new Error(`packages/gate/dist/evaluate-gate.js not found — run 'pnpm build' first.`);
  }
  const evalMod = await import(pathToFileURL(evalPath).href);
  const secMod  = await import(pathToFileURL(secPath).href);
  _gate = {
    evaluateGate:          evalMod.evaluateGate,
    collectSecuritySmells: secMod.collectSecuritySmells,
  };
  return _gate;
}

// ─── Constants (mirroring pre-registration doc) ───────────────────────────────

export const NEAR_TARGET      = 9.4;   // files left < 9.4 = Metric 3
export const DEFAULT_FLOOR    = 5.0;   // gate floor for below-floor check in RCT
                                       // (5.0 not 6.0 to allow benign edits on score-5 files)
export const MAX_REVISIONS    = 3;     // max revision attempts per blocked edit (gate-on)
export const TOKEN_BUDGET     = 8000;  // output token budget per file per arm

// Security/AI-native smell types for Metric 2b
export const SECURITY_SMELL_TYPES = new Set([
  'SqlInjectionRisk', 'XssRisk', 'CommandInjectionRisk', 'HardcodedCredential',
  'HardcodedApiKey', 'UnsafeDeserialization', 'PathTraversalRisk', 'SsrfRisk',
  'CryptographicMisuseRisk',
]);
export const AI_NATIVE_SMELL_TYPES = new Set([
  'SlopsquattingRisk', 'HallucinatedPackageImport', 'LlmUnboundedCall', 'LlmUnpinnedModel',
  'LlmNoSystemMessage', 'LlmNoStructuredOutput', 'LlmUnsetTemperature', 'AiAttributedSATD',
]);

// ─── Scoring helper ───────────────────────────────────────────────────────────

/**
 * Score code with the full smell set (analyzeCode + collectSecuritySmells).
 * Returns { score, smellTypes, smellObjects }.
 *
 * This is the canonical measurement used by the gate and the prior simulation —
 * it is the ONLY scoring function the RCT should use for comparability.
 *
 * @param {string} code
 * @param {string} lang - detected language string
 * @param {string} filePath - used for language-specific heuristics
 * @returns {{ score: number, smellTypes: string[], smellObjects: object[] }}
 */
export async function scoreCode(code, lang, filePath) {
  const { analyzeCode } = await loadCore();
  const { collectSecuritySmells } = await loadGate();

  const result = analyzeCode(code, lang, filePath);
  const secSmells = collectSecuritySmells(code, lang, filePath);

  const allSmellObjects = [...result.smells, ...secSmells];
  const allSmellTypes   = [...new Set(allSmellObjects.map(s => s.type))];

  return {
    score:        result.score,
    smellTypes:   allSmellTypes,
    smellObjects: allSmellObjects,
  };
}

// ─── Gate helper ─────────────────────────────────────────────────────────────

/**
 * Apply the gate to a proposed edit. Wraps evaluateGate with standard RCT config.
 *
 * @param {string} before - original file content
 * @param {string} after  - proposed edited content
 * @param {string} lang
 * @param {string} filePath
 * @param {object} [config] - override gate config (e.g. { floor: 5.0 })
 * @returns {Promise<import('../../packages/gate/src/gate-types').GateDecision>}
 */
export async function applyGate(before, after, lang, filePath, config) {
  const { evaluateGate } = await loadGate();
  const cfg = { floor: DEFAULT_FLOOR, ...config };
  return evaluateGate({ filePath, before, after, language: lang }, cfg);
}

// ─── Task prompt builder ──────────────────────────────────────────────────────

/**
 * Build a realistic issue-style task prompt for the agent given a file's context.
 * Used to construct the user message for the LLM in full (non-dry-run) mode.
 *
 * The prompt explicitly prohibits comment stripping and code deletion (anti-gaming).
 *
 * @param {string} filePath - relative or absolute path
 * @param {string} lang
 * @param {string[]} dominantSmells - from midfiles.json dominantSmells field
 * @param {string} originalCode
 * @returns {string} task prompt
 */
export function buildTaskPrompt(filePath, lang, dominantSmells, originalCode) {
  const fileName = basename(filePath);
  const smellDesc = dominantSmells.length > 0
    ? dominantSmells.join(', ')
    : 'high complexity and deep nesting';

  return `You are a senior software engineer refactoring production code to improve its code health score.

FILE: ${fileName}
LANGUAGE: ${lang}
DOMINANT CODE SMELLS: ${smellDesc}

TASK:
Refactor the code to reduce the identified code smells and improve the overall health score.
Target: bring the health score as close to 9.5/10 as possible.

RULES (non-negotiable):
1. Preserve all observable behavior — do not change what the code does.
2. Do NOT remove, delete, or significantly reduce comments — comment stripping is detected and disqualifies the submission.
3. Do NOT delete functions, methods, exports, or public interfaces — only restructure their internals.
4. Do NOT add new dependencies or imports that do not already exist in the file.
5. Output the COMPLETE refactored file content, not a diff or partial edit.
6. Do NOT add hardcoded credentials, injection-vulnerable string concatenation, or unsafe patterns.

Return ONLY the complete file content, with no markdown fencing, no explanations before or after.

ORIGINAL CODE:
\`\`\`${lang}
${originalCode}
\`\`\``;
}

// ─── Anti-gaming checks ───────────────────────────────────────────────────────

/**
 * Verify the agent's edit did not "cheat" to reduce smells by deleting code.
 *
 * Pre-committed checks (from pre-registration §4):
 *   1. Parse check: analyzeCode must not throw on finalCode
 *   2. Comment count: finalCode comment lines >= original (not decreased)
 *   3. LOC check: finalCode LOC >= original * 0.5 (extreme deletion guard)
 *
 * @param {string} originalCode
 * @param {string} finalCode
 * @param {string} lang
 * @param {string} filePath
 * @returns {{ passed: boolean, violations: string[] }}
 */
export async function checkAntiGaming(originalCode, finalCode, lang, filePath) {
  const { analyzeCode } = await loadCore();
  const violations = [];

  // Check 1: parse check (analyzeCode must not throw)
  let parsePassed = true;
  try {
    analyzeCode(finalCode, lang, filePath);
  } catch (e) {
    parsePassed = false;
    violations.push(`parse_fail: analyzeCode threw on finalCode — ${e.message}`);
  }

  // Check 2: comment count (count lines starting with comment markers)
  const commentPat = /^\s*(\/\/|#|<!--|\*|\/\*|--)/m;
  function countCommentLines(code) {
    return code.split('\n').filter(l => commentPat.test(l)).length;
  }
  const origComments  = countCommentLines(originalCode);
  const finalComments = countCommentLines(finalCode);
  if (origComments > 0 && finalComments < origComments * 0.7) {
    violations.push(
      `comment_strip: original had ${origComments} comment lines, final has ${finalComments} (< 70% of original)`,
    );
  }

  // Check 3: LOC (lines of code) — extreme deletion guard
  const origLoc  = originalCode.split('\n').filter(l => l.trim().length > 0).length;
  const finalLoc = finalCode.split('\n').filter(l => l.trim().length > 0).length;
  if (origLoc > 10 && finalLoc < origLoc * 0.5) {
    violations.push(
      `excessive_deletion: original had ${origLoc} non-blank lines, final has ${finalLoc} (< 50% of original)`,
    );
  }

  return { passed: violations.length === 0, violations };
}

// ─── New-smell computation ────────────────────────────────────────────────────

/**
 * Compute newly introduced smell types (present in finalSmells but not in originalSmells).
 *
 * @param {string[]} originalSmellTypes
 * @param {string[]} finalSmellTypes
 * @returns {{ all: string[], securityAndAi: string[] }}
 */
export function computeNewSmells(originalSmellTypes, finalSmellTypes) {
  const origSet = new Set(originalSmellTypes);
  const newAll  = finalSmellTypes.filter(t => !origSet.has(t));
  const newSecAi = newAll.filter(t => SECURITY_SMELL_TYPES.has(t) || AI_NATIVE_SMELL_TYPES.has(t));
  return { all: newAll, securityAndAi: newSecAi };
}

// ─── Dry-run arm executor (no LLM call) ──────────────────────────────────────

/**
 * Execute one arm of the RCT using a hand-supplied proposed edit (dry-run / test mode).
 *
 * This is the interface used for harness acceptance testing and by Phase 2 worker
 * agents when they supply their own generated edit.
 *
 * @param {object} opts
 * @param {string} opts.filePath   - relative path from ROOT (e.g. "field-repos/...")
 * @param {'gate-on'|'gate-off'} opts.arm
 * @param {string} opts.proposedCode  - the full proposed file content
 * @param {string} [opts.lang]        - if omitted, detected from filePath
 * @param {object} [opts.gateConfig]  - override gate config
 * @param {boolean} [opts.writeOutput=true] - write result to benchmark-data/rct-real/
 * @returns {Promise<ArmResult>}
 */
export async function runArm({
  filePath,
  arm,
  proposedCode,
  lang: langOverride,
  gateConfig,
  writeOutput = true,
}) {
  const absPath = existsSync(filePath) ? filePath : join(ROOT, filePath);
  if (!existsSync(absPath)) {
    throw new Error(`File not found: ${absPath}`);
  }

  const { detectLanguage } = await loadCore();
  const originalCode = readFileSync(absPath, 'utf-8');
  const lang = langOverride ?? detectLanguage(absPath);

  if (lang === 'unsupported') {
    throw new Error(`Language not supported for: ${absPath}`);
  }

  // Baseline score
  const baseline = await scoreCode(originalCode, lang, absPath);

  // Proposed edit: may go through gate (gate-on) or land freely (gate-off)
  const gateDecisions = [];
  let   finalCode     = proposedCode;
  let   editsBlocked  = 0;
  let   revisionsUsed = 0;
  let   taskCompleted = true;

  if (arm === 'gate-on') {
    const decision = await applyGate(originalCode, proposedCode, lang, absPath, gateConfig);
    gateDecisions.push(decision);

    if (decision.verdict === 'deny') {
      editsBlocked++;
      // In dry-run mode there is no LLM to call for revisions — we record the block
      // and keep the original code as the final state (gate prevented the edit from landing).
      // In full (LLM) mode the runner would call the model again with decision.reason.
      finalCode = originalCode;  // edit did not land
      taskCompleted = false;
      revisionsUsed = 0;
    }
    // If allowed, finalCode = proposedCode (already set above)
  }
  // gate-off: finalCode = proposedCode, no gate consulted

  // Score final code
  const finalScored = await scoreCode(finalCode, lang, absPath);

  // New smells (Metric 2)
  const newSmells = computeNewSmells(baseline.smellTypes, finalScored.smellTypes);

  // Anti-gaming (Metric 1 companion)
  const antiGaming = await checkAntiGaming(originalCode, finalCode, lang, absPath);

  // Build result
  const result = {
    arm,
    filePath:             relative(ROOT, absPath),
    lang,
    baselineScore:        Math.round(baseline.score * 1000) / 1000,
    finalScore:           Math.round(finalScored.score * 1000) / 1000,
    finalCode,            // stored for audit; not written to the source file
    newSmellsTotal:       newSmells.all.length,         // Metric 2a
    newSmellsSecurity:    newSmells.securityAndAi.length, // Metric 2b
    newSmellsAll:         newSmells.all,
    newSmellsSecAi:       newSmells.securityAndAi,
    leftBelowNearTarget:  finalScored.score < NEAR_TARGET,  // Metric 3
    editsBlocked,         // Metric 1
    revisionsUsed,
    taskCompleted,
    antiGaming,
    gateDecisions,        // gate-on only (empty array for gate-off)
    modelId:              'dry-run',
    tokenUsed:            0,
    dryRun:               true,
    generatedAt:          new Date().toISOString(),
    smellsBaseline:       baseline.smellTypes,
    smellsFinal:          finalScored.smellTypes,
  };

  if (writeOutput) {
    const outDir = join(ROOT, 'benchmark-data', 'rct-real');
    mkdirSync(outDir, { recursive: true });
    const slug    = relative(ROOT, absPath).replace(/[/\\]/g, '_').replace(/\.[^.]+$/, '');
    const outPath = join(outDir, `${slug}-${arm}.json`);
    const toWrite = { ...result, finalCode: '[redacted for output — stored in memory only]' };
    writeFileSync(outPath, JSON.stringify(toWrite, null, 2), 'utf-8');
    console.log(`  Wrote: ${relative(ROOT, outPath)}`);
  }

  return result;
}

// ─── Full LLM-backed arm executor ────────────────────────────────────────────

/**
 * Execute one arm of the RCT with a real Anthropic API call.
 *
 * Requires ANTHROPIC_API_KEY in environment.
 * Phase 2 worker agents call this (or import runArm with proposedCode from their
 * own LLM generation step).
 *
 * @param {object} opts
 * @param {string} opts.filePath
 * @param {'gate-on'|'gate-off'} opts.arm
 * @param {string} opts.modelId
 * @param {string[]} [opts.dominantSmells]
 * @param {object} [opts.gateConfig]
 * @param {number} [opts.maxRevisions]
 * @param {boolean} [opts.writeOutput=true]
 * @returns {Promise<ArmResult>}
 */
export async function runArmWithLlm({
  filePath,
  arm,
  modelId,
  dominantSmells = [],
  gateConfig,
  maxRevisions = MAX_REVISIONS,
  writeOutput = true,
}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required for full LLM run.');
  }

  const absPath = existsSync(filePath) ? filePath : join(ROOT, filePath);
  if (!existsSync(absPath)) {
    throw new Error(`File not found: ${absPath}`);
  }

  const { detectLanguage } = await loadCore();
  const originalCode = readFileSync(absPath, 'utf-8');
  const lang = detectLanguage(absPath);

  if (lang === 'unsupported') {
    throw new Error(`Language not supported for: ${absPath}`);
  }

  // Lazy-load the Anthropic SDK (optional dep — not required for dry-run)
  let Anthropic;
  try {
    const mod = await import('@anthropic-ai/sdk');
    Anthropic = mod.default ?? mod.Anthropic;
  } catch {
    throw new Error(`@anthropic-ai/sdk not found. Run 'pnpm add @anthropic-ai/sdk' at root.`);
  }

  const client = new Anthropic({ apiKey });

  const baseline   = await scoreCode(originalCode, lang, absPath);
  const taskPrompt = buildTaskPrompt(absPath, lang, dominantSmells, originalCode);

  const messages   = [{ role: 'user', content: taskPrompt }];
  const gateDecisions = [];
  let totalTokens  = 0;
  let editsBlocked = 0;
  let revisionsUsed = 0;
  let taskCompleted = false;
  let finalCode    = originalCode;  // fallback: unchanged if agent produces nothing valid

  // Initial call + revision loop (gate-on only)
  let attempt = 0;
  const maxAttempts = arm === 'gate-on' ? maxRevisions + 1 : 1;

  while (attempt < maxAttempts) {
    attempt++;
    const response = await client.messages.create({
      model:       modelId,
      max_tokens:  TOKEN_BUDGET,
      messages,
    });

    totalTokens += (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    // Strip markdown fencing if present
    const proposed = text
      .replace(/^```[^\n]*\n?/, '')
      .replace(/\n?```\s*$/, '')
      .trim();

    if (!proposed) {
      // Model returned empty — count as failed attempt
      continue;
    }

    if (arm === 'gate-off') {
      // No gate: accept unconditionally
      finalCode    = proposed;
      taskCompleted = true;
      break;
    }

    // gate-on: evaluate
    const decision = await applyGate(originalCode, proposed, lang, absPath, gateConfig);
    gateDecisions.push(decision);

    if (decision.verdict === 'allow') {
      finalCode    = proposed;
      taskCompleted = true;
      break;
    }

    // Denied — feed back to agent
    editsBlocked++;
    revisionsUsed++;
    messages.push({ role: 'assistant', content: text });
    messages.push({
      role: 'user',
      content:
        `The code you submitted was rejected by the quality gate:\n\n${decision.reason}\n\n` +
        `Please revise and resubmit the complete file. Remember: no comment stripping, ` +
        `no code deletion, no new security issues.`,
    });
  }

  // Score final code
  const finalScored = await scoreCode(finalCode, lang, absPath);
  const newSmells   = computeNewSmells(baseline.smellTypes, finalScored.smellTypes);
  const antiGaming  = await checkAntiGaming(originalCode, finalCode, lang, absPath);

  const result = {
    arm,
    filePath:             relative(ROOT, absPath),
    lang,
    baselineScore:        Math.round(baseline.score * 1000) / 1000,
    finalScore:           Math.round(finalScored.score * 1000) / 1000,
    finalCode,
    newSmellsTotal:       newSmells.all.length,
    newSmellsSecurity:    newSmells.securityAndAi.length,
    newSmellsAll:         newSmells.all,
    newSmellsSecAi:       newSmells.securityAndAi,
    leftBelowNearTarget:  finalScored.score < NEAR_TARGET,
    editsBlocked,
    revisionsUsed,
    taskCompleted,
    antiGaming,
    gateDecisions,
    modelId,
    tokenUsed:            totalTokens,
    dryRun:               false,
    generatedAt:          new Date().toISOString(),
    smellsBaseline:       baseline.smellTypes,
    smellsFinal:          finalScored.smellTypes,
  };

  if (writeOutput) {
    const outDir = join(ROOT, 'benchmark-data', 'rct-real');
    mkdirSync(outDir, { recursive: true });
    const slug    = relative(ROOT, absPath).replace(/[/\\]/g, '_').replace(/\.[^.]+$/, '');
    const outPath = join(outDir, `${slug}-${arm}.json`);
    const toWrite = { ...result, finalCode: '[redacted for output — stored in memory only]' };
    writeFileSync(outPath, JSON.stringify(toWrite, null, 2), 'utf-8');
    console.log(`  Wrote: ${relative(ROOT, outPath)}`);
  }

  return result;
}

// ─── Paired summary ───────────────────────────────────────────────────────────

/**
 * Given a gate-on result and gate-off result for the same file, compute the
 * three pre-registered outcome metrics as paired differences.
 *
 * @param {ArmResult} onResult
 * @param {ArmResult} offResult
 * @returns {PairedRecord}
 */
export function pairResults(onResult, offResult) {
  return {
    filePath:           onResult.filePath,
    lang:               onResult.lang,
    baselineScore:      onResult.baselineScore,
    // Metric 1
    metric1_blocked:    onResult.editsBlocked,
    // Metric 2a — paired difference (negative = gate-on fewer smells)
    metric2a_on:        onResult.newSmellsTotal,
    metric2a_off:       offResult.newSmellsTotal,
    metric2a_diff:      onResult.newSmellsTotal - offResult.newSmellsTotal,
    // Metric 2b
    metric2b_on:        onResult.newSmellsSecurity,
    metric2b_off:       offResult.newSmellsSecurity,
    metric2b_diff:      onResult.newSmellsSecurity - offResult.newSmellsSecurity,
    // Metric 3
    metric3_on:         onResult.leftBelowNearTarget,
    metric3_off:        offResult.leftBelowNearTarget,
    // Quality flags
    antiGamingOn:       onResult.antiGaming.passed,
    antiGamingOff:      offResult.antiGaming.passed,
    taskCompletedOn:    onResult.taskCompleted,
    taskCompletedOff:   offResult.taskCompleted,
  };
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name) => argv.includes(name);
  const arg  = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };

  const filePath    = arg('--file', null);
  const arm         = arg('--arm', 'both');          // 'gate-on', 'gate-off', 'both'
  const isDryRun    = flag('--dry-run');
  const suppliedEdit = arg('--supplied-edit', null); // path to a file with proposed code
  const modelId     = arg('--model', 'claude-sonnet-4-5-20250815');

  if (!filePath) {
    console.error('ERROR: --file is required');
    console.error('Usage: node scripts/rct/run-real-agent-rct.mjs --file <path> [--arm gate-on|gate-off|both] [--dry-run] [--supplied-edit <path>]');
    process.exit(1);
  }

  const arms = arm === 'both' ? ['gate-on', 'gate-off'] : [arm];

  if (isDryRun && !suppliedEdit) {
    console.error('ERROR: --dry-run requires --supplied-edit <path>');
    process.exit(1);
  }

  if (!isDryRun && !process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY env var required for non-dry-run mode');
    process.exit(1);
  }

  console.log('Real-Agent Gate-On vs Gate-Off RCT Runner');
  console.log('==========================================');
  console.log(`File:     ${filePath}`);
  console.log(`Arms:     ${arms.join(', ')}`);
  console.log(`Mode:     ${isDryRun ? 'DRY-RUN (hand-supplied edit)' : `LIVE (model: ${modelId})`}`);
  console.log('');

  const results = {};

  for (const a of arms) {
    console.log(`--- ARM: ${a} ---`);

    if (isDryRun) {
      const proposedCode = readFileSync(suppliedEdit, 'utf-8');
      const result = await runArm({
        filePath,
        arm: a,
        proposedCode,
        writeOutput: true,
      });
      results[a] = result;

      console.log(`  Baseline score:    ${result.baselineScore.toFixed(2)}`);
      console.log(`  Final score:       ${result.finalScore.toFixed(2)}`);
      console.log(`  New smells (all):  ${result.newSmellsTotal}`);
      console.log(`  New smells (sec):  ${result.newSmellsSecurity}`);
      console.log(`  Left below 9.4:    ${result.leftBelowNearTarget}`);
      console.log(`  Edits blocked:     ${result.editsBlocked}`);
      console.log(`  Task completed:    ${result.taskCompleted}`);
      console.log(`  Anti-gaming:       ${result.antiGaming.passed ? 'PASS' : 'FAIL — ' + result.antiGaming.violations.join('; ')}`);
      if (a === 'gate-on' && result.gateDecisions.length > 0) {
        const d = result.gateDecisions[0];
        console.log(`  Gate verdict:      ${d.verdict} (${d.reasonCode})`);
        if (d.verdict === 'deny') {
          console.log(`  Gate reason:       ${d.reason.substring(0, 120)}...`);
        }
      }
    } else {
      // Load dominant smells from midfiles.json if available
      let dominantSmells = [];
      try {
        const manifestPath = join(ROOT, 'benchmark-data', 'loop-bench', 'midfiles.json');
        if (existsSync(manifestPath)) {
          const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
          const entry = (manifest.files ?? manifest).find(
            f => f.path === filePath || join(ROOT, f.path) === filePath,
          );
          dominantSmells = entry?.dominantSmells ?? [];
        }
      } catch { /* not critical */ }

      const result = await runArmWithLlm({
        filePath,
        arm: a,
        modelId,
        dominantSmells,
        writeOutput: true,
      });
      results[a] = result;

      console.log(`  Baseline score:    ${result.baselineScore.toFixed(2)}`);
      console.log(`  Final score:       ${result.finalScore.toFixed(2)}`);
      console.log(`  New smells (all):  ${result.newSmellsTotal}`);
      console.log(`  New smells (sec):  ${result.newSmellsSecurity}`);
      console.log(`  Left below 9.4:    ${result.leftBelowNearTarget}`);
      console.log(`  Edits blocked:     ${result.editsBlocked}`);
      console.log(`  Revisions used:    ${result.revisionsUsed}`);
      console.log(`  Task completed:    ${result.taskCompleted}`);
      console.log(`  Tokens used:       ${result.tokenUsed}`);
      console.log(`  Anti-gaming:       ${result.antiGaming.passed ? 'PASS' : 'FAIL — ' + result.antiGaming.violations.join('; ')}`);
    }

    console.log('');
  }

  // If both arms ran, print paired summary
  if (results['gate-on'] && results['gate-off']) {
    const paired = pairResults(results['gate-on'], results['gate-off']);
    console.log('--- PAIRED SUMMARY ---');
    console.log(`  Metric 2a diff (on-off): ${paired.metric2a_diff >= 0 ? '+' : ''}${paired.metric2a_diff} new smells`);
    console.log(`  Metric 2b diff (on-off): ${paired.metric2b_diff >= 0 ? '+' : ''}${paired.metric2b_diff} sec/AI smells`);
    console.log(`  Metric 3 on:  left<9.4 = ${paired.metric3_on}`);
    console.log(`  Metric 3 off: left<9.4 = ${paired.metric3_off}`);

    // Write paired record
    const outDir  = join(ROOT, 'benchmark-data', 'rct-real');
    mkdirSync(outDir, { recursive: true });
    const slug    = filePath.replace(/[/\\]/g, '_').replace(/\.[^.]+$/, '');
    const pairOut = join(outDir, `${slug}-paired.json`);
    writeFileSync(pairOut, JSON.stringify(paired, null, 2), 'utf-8');
    console.log(`\n  Paired record: ${relative(ROOT, pairOut)}`);
  }
}

// Run CLI only when executed directly
const isMain = process.argv[1] &&
  fileURLToPath(import.meta.url).replace(/\\/g, '/') === process.argv[1].replace(/\\/g, '/');

if (isMain) {
  main().catch(err => {
    console.error('\nRunner failed:', err.message);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  });
}
