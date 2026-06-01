// packages/core/src/analyzers/exception-antipatterns.ts
// Sprint 58: ExceptionHandlingAntiPattern detector — EmptyCatch, CatchGeneric,
// DestructiveWrapping, UnreachableHandler across Tier A languages via regex.

import type { Language, Smell } from '../types';

/**
 * Detects exception handling anti-patterns in source code.
 *
 * Supports all Tier A languages that have exception/error handling constructs.
 * Go is excluded (uses error return values, not exceptions).
 *
 * Detected patterns (all produce SmellType 'ExceptionHandlingAntiPattern'):
 *   - EmptyCatch:          catch-block with empty or comment-only body
 *   - CatchGeneric:        catches the base exception type (Exception, Throwable, bare except)
 *   - DestructiveWrapping: re-throw that loses the original stack trace
 *   - UnreachableHandler:  broad catch placed before a specific catch (never reached)
 */
export function detectExceptionAntiPatterns(code: string, language: Language): Smell[] {
  const smells: Smell[] = [];
  const lines = code.split('\n');

  switch (language) {
    case 'typescript':
    case 'javascript':
      smells.push(
        ...detectEmptyCatchTs(lines),
        ...detectCatchGenericTs(lines),
        ...detectDestructiveWrappingTs(lines),
      );
      break;

    case 'python':
      smells.push(
        ...detectEmptyCatchPy(lines),
        ...detectCatchGenericPy(lines),
        ...detectDestructiveWrappingPy(lines),
      );
      break;

    case 'java':
    case 'kotlin':
    case 'scala':
      smells.push(
        ...detectEmptyCatchJvm(lines),
        ...detectCatchGenericJvm(lines, language),
        ...detectDestructiveWrappingJava(lines),
        ...detectUnreachableHandlerJvm(lines),
      );
      break;

    case 'csharp':
      smells.push(
        ...detectEmptyCatchCSharp(lines),
        ...detectCatchGenericCSharp(lines),
        ...detectDestructiveWrappingCSharp(lines),
      );
      break;

    case 'ruby':
      smells.push(
        ...detectEmptyCatchRuby(lines),
        ...detectCatchGenericRuby(lines),
      );
      break;

    case 'php':
      smells.push(
        ...detectEmptyCatchPhp(lines),
        ...detectCatchGenericPhp(lines),
        ...detectDestructiveWrappingPhp(lines),
      );
      break;

    default:
      // Unsupported language — return no smells
      break;
  }

  return smells;
}

// ---------------------------------------------------------------------------
// TypeScript / JavaScript detectors
// ---------------------------------------------------------------------------

/** Empty catch block: catch (e) {} or catch (e) { // comment } */
function detectEmptyCatchTs(lines: string[]): Smell[] {
  const smells: Smell[] = [];
  const code = lines.join('\n');

  // Match catch blocks that contain only whitespace or comments
  const emptyCatchRe = /catch\s*\([^)]*\)\s*\{\s*(\/\/[^\n]*)?\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = emptyCatchRe.exec(code)) !== null) {
    const lineNum = code.slice(0, m.index).split('\n').length;
    smells.push({
      type: 'ExceptionHandlingAntiPattern',
      severity: 'medium',
      line: lineNum,
      description: 'EmptyCatch — catch block has an empty body (silently swallows exceptions)',
      suggestion:
        'Log the exception, re-throw it, or handle it explicitly. Never silently discard errors.',
    });
  }
  return smells;
}

/** Generic catch in TS/JS: catch (e) { ... } where body does NOT immediately re-throw */
function detectCatchGenericTs(lines: string[]): Smell[] {
  const smells: Smell[] = [];

  // TS/JS catch always catches all errors — flag when body is non-trivial (not just re-throw)
  // We look for catch(...) { <body without immediate throw> } patterns
  const code = lines.join('\n');
  const catchRe = /catch\s*\((\w+)\)\s*\{([^}]*)\}/gs;
  let m: RegExpExecArray | null;
  while ((m = catchRe.exec(code)) !== null) {
    const varName = m[1];
    const body = m[2];
    // Skip if the body is empty (already caught by EmptyCatch)
    if (/^\s*(\/\/[^\n]*)?\s*$/.test(body)) continue;
    // Skip if the body immediately re-throws the same variable
    if (/^\s*throw\s+\w+\s*;?\s*$/.test(body)) continue;
    // Skip if the body immediately re-throws with 'from' (Python pattern — not applicable here)
    // Flag as generic catch (all errors captured without type discrimination)
    const lineNum = code.slice(0, m.index).split('\n').length;
    smells.push({
      type: 'ExceptionHandlingAntiPattern',
      severity: 'low',
      line: lineNum,
      description: `CatchGeneric — catch(${varName}) catches all error types without discrimination`,
      suggestion:
        'Catch specific error types (e.g. TypeError, RangeError) or narrow handling with instanceof checks.',
    });
  }
  return smells;
}

/** Destructive wrapping in TS/JS: throw new Error(e.message) — loses stack trace */
function detectDestructiveWrappingTs(lines: string[]): Smell[] {
  const smells: Smell[] = [];
  const destructiveRe = /throw\s+new\s+\w*Error\s*\(\s*\w+\.message\s*\)/g;
  const code = lines.join('\n');
  let m: RegExpExecArray | null;
  while ((m = destructiveRe.exec(code)) !== null) {
    const lineNum = code.slice(0, m.index).split('\n').length;
    smells.push({
      type: 'ExceptionHandlingAntiPattern',
      severity: 'high',
      line: lineNum,
      description:
        'DestructiveWrapping — re-throwing with new Error(e.message) discards the original stack trace',
      suggestion:
        'Use "throw e" to re-throw, or "throw new CustomError(msg, { cause: e })" to preserve the original cause.',
    });
  }
  return smells;
}

// ---------------------------------------------------------------------------
// Python detectors
// ---------------------------------------------------------------------------

/** bare except: pass or except Exception as e: pass */
function detectEmptyCatchPy(lines: string[]): Smell[] {
  const smells: Smell[] = [];
  // Look for except: followed by pass (possibly on the next line)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*except\b[^:]*:\s*$/.test(line) || /^\s*except\b[^:]*:\s*(#.*)?$/.test(line)) {
      // Check if the next non-empty/non-comment line is 'pass'
      let j = i + 1;
      while (j < lines.length && /^\s*(#.*)?$/.test(lines[j])) j++;
      if (j < lines.length && /^\s*pass\s*(#.*)?$/.test(lines[j])) {
        smells.push({
          type: 'ExceptionHandlingAntiPattern',
          severity: 'medium',
          line: i + 1,
          description: 'EmptyCatch — bare except/except clause followed by pass silently swallows exceptions',
          suggestion:
            'Log the exception or re-raise it. Use "except SomeSpecificError as e: logger.error(e); raise" instead.',
        });
      }
    }
  }
  return smells;
}

/** bare except: or except Exception: (generic catch in Python) */
function detectCatchGenericPy(lines: string[]): Smell[] {
  const smells: Smell[] = [];
  const bareExceptRe = /^\s*except\s*:/;
  const genericExceptRe = /^\s*except\s+Exception(\s+as\s+\w+)?\s*:/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (bareExceptRe.test(line)) {
      // Only report CatchGeneric if not already reported as EmptyCatch (check next line)
      let j = i + 1;
      while (j < lines.length && /^\s*(#.*)?$/.test(lines[j])) j++;
      const nextIsPass = j < lines.length && /^\s*pass\s*(#.*)?$/.test(lines[j]);
      if (!nextIsPass) {
        smells.push({
          type: 'ExceptionHandlingAntiPattern',
          severity: 'low',
          line: i + 1,
          description: 'CatchGeneric — bare except clause catches all exceptions including SystemExit and KeyboardInterrupt',
          suggestion:
            'Catch specific exception types (e.g. except ValueError, except IOError) instead of bare except.',
        });
      }
    } else if (genericExceptRe.test(line)) {
      let j = i + 1;
      while (j < lines.length && /^\s*(#.*)?$/.test(lines[j])) j++;
      const nextIsPass = j < lines.length && /^\s*pass\s*(#.*)?$/.test(lines[j]);
      if (!nextIsPass) {
        smells.push({
          type: 'ExceptionHandlingAntiPattern',
          severity: 'low',
          line: i + 1,
          description: 'CatchGeneric — except Exception catches all standard exceptions without discrimination',
          suggestion:
            'Catch specific exception types to make error handling intentional and predictable.',
        });
      }
    }
  }
  return smells;
}

/** Python: raise SomeError(str(e)) without "from e" */
function detectDestructiveWrappingPy(lines: string[]): Smell[] {
  const smells: Smell[] = [];
  // raise SomeException(str(e)) without "from" — destructive wrap
  const destructiveRe = /^\s*raise\s+\w+\([^)]*str\(\w+\)[^)]*\)\s*$/;
  const fromRe = /\bfrom\s+\w+/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (destructiveRe.test(line) && !fromRe.test(line)) {
      smells.push({
        type: 'ExceptionHandlingAntiPattern',
        severity: 'high',
        line: i + 1,
        description:
          'DestructiveWrapping — raise SomeError(str(e)) discards the original traceback',
        suggestion: 'Use "raise SomeError(...) from e" to preserve the original exception chain.',
      });
    }
  }
  return smells;
}

// ---------------------------------------------------------------------------
// JVM (Java / Kotlin / Scala) detectors
// ---------------------------------------------------------------------------

/** Empty catch block in JVM languages */
function detectEmptyCatchJvm(lines: string[]): Smell[] {
  const smells: Smell[] = [];
  const code = lines.join('\n');
  const emptyCatchRe = /catch\s*\([^)]*\)\s*\{\s*(\/\/[^\n]*)?\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = emptyCatchRe.exec(code)) !== null) {
    const lineNum = code.slice(0, m.index).split('\n').length;
    smells.push({
      type: 'ExceptionHandlingAntiPattern',
      severity: 'medium',
      line: lineNum,
      description: 'EmptyCatch — catch block has an empty body (silently swallows exceptions)',
      suggestion:
        'Log the exception, re-throw it, or handle it explicitly. Never silently discard errors.',
    });
  }
  return smells;
}

/** Generic catch in JVM: catch(Exception e) or catch(Throwable e) */
function detectCatchGenericJvm(lines: string[], _language: Language): Smell[] {
  const smells: Smell[] = [];
  const genericRe = /catch\s*\(\s*(Exception|Throwable)\s+\w+\s*\)/g;
  const code = lines.join('\n');
  let m: RegExpExecArray | null;
  while ((m = genericRe.exec(code)) !== null) {
    const lineNum = code.slice(0, m.index).split('\n').length;
    smells.push({
      type: 'ExceptionHandlingAntiPattern',
      severity: 'low',
      line: lineNum,
      description: `CatchGeneric — catch(${m[1]}) catches all exceptions without discrimination`,
      suggestion:
        'Catch specific exception types (e.g. IOException, IllegalArgumentException) to make error handling intentional.',
    });
  }
  return smells;
}

/** Destructive wrapping in Java: throw new XException(e.getMessage()) without cause */
function detectDestructiveWrappingJava(lines: string[]): Smell[] {
  const smells: Smell[] = [];
  // throw new SomeException(e.getMessage()) — no cause passed
  const destructiveRe = /throw\s+new\s+\w+\s*\(\s*\w+\.getMessage\s*\(\s*\)\s*\)/g;
  const code = lines.join('\n');
  let m: RegExpExecArray | null;
  while ((m = destructiveRe.exec(code)) !== null) {
    const lineNum = code.slice(0, m.index).split('\n').length;
    smells.push({
      type: 'ExceptionHandlingAntiPattern',
      severity: 'high',
      line: lineNum,
      description:
        'DestructiveWrapping — re-throwing with e.getMessage() discards the original stack trace',
      suggestion:
        'Pass the original exception as a cause: throw new CustomException("msg", e)',
    });
  }
  return smells;
}

/** Unreachable handler: catch(Exception) before a specific catch block */
function detectUnreachableHandlerJvm(lines: string[]): Smell[] {
  const smells: Smell[] = [];
  const code = lines.join('\n');

  // Find catch(Exception e) followed by another catch within 20 lines
  const broadCatchRe = /catch\s*\(\s*(?:Exception|Throwable)\s+\w+\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = broadCatchRe.exec(code)) !== null) {
    const afterBroad = code.slice(m.index + m[0].length);
    // Look for another catch within the next ~20 lines (approx 600 chars)
    const snippet = afterBroad.slice(0, 600);
    if (/catch\s*\(/.test(snippet)) {
      const lineNum = code.slice(0, m.index).split('\n').length;
      smells.push({
        type: 'ExceptionHandlingAntiPattern',
        severity: 'medium',
        line: lineNum,
        description:
          'UnreachableHandler — broad catch(Exception) appears before a more specific catch block, making it unreachable',
        suggestion:
          'Reorder catch clauses: specific exceptions first, broad exceptions last.',
      });
    }
  }
  return smells;
}

// ---------------------------------------------------------------------------
// C# detectors
// ---------------------------------------------------------------------------

function detectEmptyCatchCSharp(lines: string[]): Smell[] {
  const smells: Smell[] = [];
  const code = lines.join('\n');
  // catch { } or catch (Exception e) { }
  const emptyCatchRe = /catch\s*(?:\([^)]*\))?\s*\{\s*(\/\/[^\n]*)?\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = emptyCatchRe.exec(code)) !== null) {
    const lineNum = code.slice(0, m.index).split('\n').length;
    smells.push({
      type: 'ExceptionHandlingAntiPattern',
      severity: 'medium',
      line: lineNum,
      description: 'EmptyCatch — catch block has an empty body (silently swallows exceptions)',
      suggestion:
        'Log the exception, re-throw it, or handle it explicitly.',
    });
  }
  return smells;
}

function detectCatchGenericCSharp(lines: string[]): Smell[] {
  const smells: Smell[] = [];
  const code = lines.join('\n');
  // catch (Exception e) or catch { (no type specified)
  const genericRe = /catch\s*\(\s*Exception\s+\w+\s*\)|catch\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = genericRe.exec(code)) !== null) {
    const lineNum = code.slice(0, m.index).split('\n').length;
    smells.push({
      type: 'ExceptionHandlingAntiPattern',
      severity: 'low',
      line: lineNum,
      description: 'CatchGeneric — catch block catches all exceptions without discrimination',
      suggestion:
        'Catch specific exception types to make error handling intentional.',
    });
  }
  return smells;
}

function detectDestructiveWrappingCSharp(lines: string[]): Smell[] {
  const smells: Smell[] = [];
  const code = lines.join('\n');
  // throw new SomeException(e.Message) without inner exception
  const destructiveRe = /throw\s+new\s+\w+\s*\(\s*\w+\.Message\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = destructiveRe.exec(code)) !== null) {
    const lineNum = code.slice(0, m.index).split('\n').length;
    smells.push({
      type: 'ExceptionHandlingAntiPattern',
      severity: 'high',
      line: lineNum,
      description:
        'DestructiveWrapping — re-throwing with e.Message discards the original stack trace',
      suggestion:
        'Pass the original exception as inner exception: throw new CustomException("msg", e)',
    });
  }
  return smells;
}

// ---------------------------------------------------------------------------
// Ruby detectors
// ---------------------------------------------------------------------------

function detectEmptyCatchRuby(lines: string[]): Smell[] {
  const smells: Smell[] = [];
  // rescue followed only by nil or empty body until end/rescue
  // Approximate: rescue\n  end or rescue\n  # comment\n  end
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*rescue\b/.test(lines[i])) {
      let j = i + 1;
      while (j < lines.length && /^\s*(#.*)?$/.test(lines[j])) j++;
      if (j < lines.length && /^\s*(end\b|rescue\b|ensure\b)/.test(lines[j])) {
        smells.push({
          type: 'ExceptionHandlingAntiPattern',
          severity: 'medium',
          line: i + 1,
          description: 'EmptyCatch — rescue block has an empty body (silently swallows exceptions)',
          suggestion:
            'Log the exception or re-raise it. Never silently discard errors.',
        });
      }
    }
  }
  return smells;
}

function detectCatchGenericRuby(lines: string[]): Smell[] {
  const smells: Smell[] = [];
  // bare "rescue" without a specific exception class catches StandardError (broad)
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*rescue\s*$/.test(lines[i]) || /^\s*rescue\s+StandardError\b/.test(lines[i])) {
      // Check next line is non-empty (has actual handling)
      let j = i + 1;
      while (j < lines.length && /^\s*(#.*)?$/.test(lines[j])) j++;
      if (j < lines.length && !/^\s*(end\b|rescue\b|ensure\b)/.test(lines[j])) {
        smells.push({
          type: 'ExceptionHandlingAntiPattern',
          severity: 'low',
          line: i + 1,
          description: 'CatchGeneric — bare rescue catches all StandardError exceptions without discrimination',
          suggestion:
            'Rescue specific exception classes (e.g. rescue ArgumentError, IOError) to make error handling intentional.',
        });
      }
    }
  }
  return smells;
}

// ---------------------------------------------------------------------------
// PHP detectors
// ---------------------------------------------------------------------------

function detectEmptyCatchPhp(lines: string[]): Smell[] {
  const smells: Smell[] = [];
  const code = lines.join('\n');
  const emptyCatchRe = /catch\s*\([^)]*\)\s*\{\s*(\/\/[^\n]*)?\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = emptyCatchRe.exec(code)) !== null) {
    const lineNum = code.slice(0, m.index).split('\n').length;
    smells.push({
      type: 'ExceptionHandlingAntiPattern',
      severity: 'medium',
      line: lineNum,
      description: 'EmptyCatch — catch block has an empty body (silently swallows exceptions)',
      suggestion:
        'Log the exception, re-throw it, or handle it explicitly.',
    });
  }
  return smells;
}

function detectCatchGenericPhp(lines: string[]): Smell[] {
  const smells: Smell[] = [];
  const code = lines.join('\n');
  const genericRe = /catch\s*\(\s*(?:Exception|Throwable)\s+\$\w+\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = genericRe.exec(code)) !== null) {
    const lineNum = code.slice(0, m.index).split('\n').length;
    smells.push({
      type: 'ExceptionHandlingAntiPattern',
      severity: 'low',
      line: lineNum,
      description: `CatchGeneric — catch(${m[0].includes('Throwable') ? 'Throwable' : 'Exception'}) catches all exceptions without discrimination`,
      suggestion:
        'Catch specific exception types to make error handling intentional.',
    });
  }
  return smells;
}

function detectDestructiveWrappingPhp(lines: string[]): Smell[] {
  const smells: Smell[] = [];
  const code = lines.join('\n');
  // throw new SomeException($e->getMessage()) without previous exception
  const destructiveRe = /throw\s+new\s+\w+\s*\(\s*\$\w+->getMessage\s*\(\s*\)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = destructiveRe.exec(code)) !== null) {
    const lineNum = code.slice(0, m.index).split('\n').length;
    smells.push({
      type: 'ExceptionHandlingAntiPattern',
      severity: 'high',
      line: lineNum,
      description:
        'DestructiveWrapping — re-throwing with $e->getMessage() discards the original stack trace',
      suggestion:
        'Pass the original exception: throw new CustomException("msg", 0, $e)',
    });
  }
  return smells;
}
