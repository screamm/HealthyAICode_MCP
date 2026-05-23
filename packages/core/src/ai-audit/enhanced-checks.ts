// packages/core/src/ai-audit/enhanced-checks.ts
import type { AiSpecificSmell } from './types';

// ─── StyleInconsistency helper ────────────────────────────────────────────────

export interface ExistingStyle {
  convention: 'camelCase' | 'snake_case' | 'PascalCase';
}

// ─── AbstractionLeakage ───────────────────────────────────────────────────────

/**
 * Detects parameters that destructure more than 3 fields inline rather than
 * using a named interface type — a common AI-generated pattern.
 */
export function detectAbstractionLeakage(
  code: string,
  _language: string,
): AiSpecificSmell[] {
  const smells: AiSpecificSmell[] = [];

  // Match named parameter with inline object type: (param: { field1: T; field2: T; field3: T; field4: T })
  // Pattern: word followed by optional ?: then colon then opening brace with fields
  const namedInlineTypePattern = /\w+\s*\??\s*:\s*\{([^{}]+)\}/g;
  let m = namedInlineTypePattern.exec(code);

  while (m !== null) {
    const typeBody = m[1];
    const fieldCount = (typeBody.match(/\b\w+\s*[?]?\s*:/g) ?? []).length;
    if (fieldCount >= 4) {
      const lineIndex = code.slice(0, m.index).split('\n').length;
      smells.push({
        type: 'AbstractionLeakage',
        severity: 'medium',
        line: lineIndex,
        description: `Inline parameter type has ${fieldCount} fields directly — consider a named interface type`,
        suggestion: 'Extract the inline type to a named interface to improve readability and reusability',
      });
    }
    m = namedInlineTypePattern.exec(code);
  }

  // Also detect destructuring parameters with ≥4 fields: function foo({ a, b, c, d, e }: ...)
  const destructuringParamPattern = /\(\s*\{([^}]+)\}\s*:/g;
  let dm = destructuringParamPattern.exec(code);

  while (dm !== null) {
    const fields = dm[1].split(',').map((f: string) => f.trim()).filter((f: string) => f.length > 0);
    if (fields.length >= 4) {
      const lineIndex = code.slice(0, dm.index).split('\n').length;
      const alreadyFlagged = smells.some(s => Math.abs(s.line - lineIndex) <= 2);
      if (!alreadyFlagged) {
        smells.push({
          type: 'AbstractionLeakage',
          severity: 'medium',
          line: lineIndex,
          description: `Destructuring parameter exposes ${fields.length} fields directly — consider a named interface type`,
          suggestion: 'Use a named interface (e.g. UserParams) instead of destructuring multiple inline fields',
        });
      }
    }
    dm = destructuringParamPattern.exec(code);
  }

  return smells;
}

// ─── HardcodedAssumption ─────────────────────────────────────────────────────

/**
 * Detects magic number literals used directly in comparison operators without
 * an explanatory named constant — typical of AI-generated retry/timeout/limit logic.
 */
export function detectHardcodedAssumptions(
  code: string,
  _language: string,
): AiSpecificSmell[] {
  const smells: AiSpecificSmell[] = [];
  const lines = code.split('\n');

  // Collect named constant definitions (ALL_CAPS) to avoid false positives
  const namedConstantValues = new Set<string>();
  const constDefinitionPattern = /(?:const|let|var)\s+[A-Z_][A-Z0-9_]+\s*=\s*(\d+)/g;
  let def = constDefinitionPattern.exec(code);
  while (def !== null) {
    namedConstantValues.add(def[1]);
    def = constDefinitionPattern.exec(code);
  }

  // Detect magic numbers in comparison expressions
  const magicComparisonPattern = /(?:>|<|>=|<=|===|!==|==|!=)\s*(\d+)(?!\s*[=])/g;
  let match = magicComparisonPattern.exec(code);

  while (match !== null) {
    const numStr = match[1];
    const num = parseInt(numStr, 10);

    // Skip trivially non-magic values: 0, 1
    if (num !== 0 && num !== 1 && !namedConstantValues.has(numStr)) {
      const lineIndex = code.slice(0, match.index).split('\n').length;
      const lineContent = lines[lineIndex - 1]?.trim() ?? '';

      // Skip lines that are themselves constant definitions
      const isConstDef = /(?:const|let|var)\s+[A-Z_]/.test(lineContent);
      // Skip lines that have an inline comment explaining the value
      const hasExplanation = lineContent.includes('// ') || lineContent.includes('/*');
      // Skip if already flagged on same line
      const alreadyFlagged = smells.some(s => s.line === lineIndex);

      if (!isConstDef && !hasExplanation && !alreadyFlagged) {
        smells.push({
          type: 'HardcodedAssumption',
          severity: 'low',
          line: lineIndex,
          description: `Magic number ${numStr} used directly in comparison — extract to a named constant`,
          suggestion: `Replace ${numStr} with a descriptive constant like MAX_RETRIES, TIMEOUT_MS, or similar`,
        });
      }
    }
    match = magicComparisonPattern.exec(code);
  }

  return smells;
}

// ─── MissingEdgeCase ─────────────────────────────────────────────────────────

/**
 * Detects obvious missing edge case guards:
 * - Array.find() result used without null/undefined check or optional chaining
 * - async functions with await but no try/catch
 */
export function detectMissingEdgeCases(
  code: string,
  _language: string,
): AiSpecificSmell[] {
  const smells: AiSpecificSmell[] = [];
  const lines = code.split('\n');

  // Pattern 1: .find(...).property without optional chain
  const findPattern = /\.find\s*\([^)]*\)\s*\.\s*(?!\?)/g;
  let m = findPattern.exec(code);

  while (m !== null) {
    const lineIndex = code.slice(0, m.index).split('\n').length;
    const lineContent = lines[lineIndex - 1] ?? '';
    if (!lineContent.includes('?.')) {
      smells.push({
        type: 'MissingEdgeCase',
        severity: 'medium',
        line: lineIndex,
        description: 'Array.find() result used without null check — will crash if element is not found',
        suggestion: 'Use optional chaining: .find(...)?.property or add a null check before accessing properties',
      });
    }
    m = findPattern.exec(code);
  }

  // Pattern 2: async function with await but no try/catch
  const asyncFnPattern = /(?:async\s+function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*async\s+(?:function\s+)?\()\s*[^{]*\{/g;
  let am = asyncFnPattern.exec(code);

  while (am !== null) {
    const startIndex = am.index + am[0].length - 1;
    const body = code.slice(startIndex, startIndex + 600);
    if (!body.includes('try {') && !body.includes('try{') && body.includes('await ')) {
      const lineIndex = code.slice(0, am.index).split('\n').length;
      smells.push({
        type: 'MissingEdgeCase',
        severity: 'low',
        line: lineIndex,
        description: 'Async function with await calls has no try/catch — unhandled promise rejections',
        suggestion: 'Wrap async operations in try/catch to handle potential errors',
      });
    }
    am = asyncFnPattern.exec(code);
  }

  void lines;
  return smells;
}

// ─── StyleInconsistency ───────────────────────────────────────────────────────

/**
 * Detects variable declarations that violate the project's established naming
 * convention (camelCase vs snake_case).
 */
export function detectStyleInconsistency(
  code: string,
  existingStyle: ExistingStyle,
  _language: string,
): AiSpecificSmell[] {
  const smells: AiSpecificSmell[] = [];

  if (existingStyle.convention === 'camelCase') {
    const snakeCasePattern = /(?:const|let|var)\s+([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\s*[=:]/g;
    let m = snakeCasePattern.exec(code);
    while (m !== null) {
      const identifier = m[1];
      const lineIndex = code.slice(0, m.index).split('\n').length;
      smells.push({
        type: 'StyleInconsistency',
        severity: 'low',
        line: lineIndex,
        description: `Identifier '${identifier}' uses snake_case but project convention is camelCase`,
        suggestion: `Rename to camelCase: '${snakeToCamel(identifier)}'`,
      });
      m = snakeCasePattern.exec(code);
    }
  } else if (existingStyle.convention === 'snake_case') {
    const camelCasePattern = /(?:const|let|var)\s+([a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*)\s*[=:]/g;
    let m = camelCasePattern.exec(code);
    while (m !== null) {
      const identifier = m[1];
      const lineIndex = code.slice(0, m.index).split('\n').length;
      smells.push({
        type: 'StyleInconsistency',
        severity: 'low',
        line: lineIndex,
        description: `Identifier '${identifier}' uses camelCase but project convention is snake_case`,
        suggestion: `Rename to snake_case: '${camelToSnake(identifier)}'`,
      });
      m = camelCasePattern.exec(code);
    }
  }

  return smells;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function camelToSnake(s: string): string {
  return s.replace(/([A-Z])/g, '_$1').toLowerCase();
}
