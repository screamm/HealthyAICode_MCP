import type { Smell, SmellType } from '../types';

/**
 * Architecture role inferred from a file's path (Sprint 56, SATT model).
 * Used to scale smell weights by architectural context: a GodClass in a controller
 * is an expected MVC pattern, but the same smell in a domain entity is a serious design flaw.
 * @see Palomba et al., IEEE 7781795 (SATT severity-by-role model).
 */
export type ArchitectureRole =
  | 'controller'
  | 'service'
  | 'entity'
  | 'util'
  | 'test'
  | 'unknown';

/**
 * Per-file scoring context derived from path + (optionally) git churn.
 * Consumed by the context-aware scoring path (`calculateScoreWithContext`),
 * which is activated via `analyzeFileWithHistory()` (analogous to `MethodTemporalCoupling`).
 */
export interface FileScoringContext {
  filePath: string;
  role: ArchitectureRole;
  isTestContext: boolean;
  /** Multiplier applied to ALL smells in the file when churn is high. 1.0 when no git history. */
  churnMultiplier: number;
}

/**
 * Committer/author patterns identifying automated (bot) commits.
 * Bot edits make up a substantial share of hotspot history (arXiv 2602.13170);
 * filtering them is a prerequisite to churn-weighting so automation noise does not
 * inflate hotspot scores. Exported as a constant for easy extension.
 */
export const BOT_AUTHOR_PATTERNS: readonly string[] = [
  'dependabot',
  'renovate',
  'github-actions',
  'semantic-release',
  'release-drafter',
];

/** Email domain that always indicates an automated GitHub actor. */
const BOT_EMAIL_DOMAIN = 'noreply.github.com';

/** Security smell types that get reachability discounting in test context. */
const SECURITY_SMELL_TYPES: ReadonlySet<SmellType> = new Set<SmellType>([
  'SqlInjectionRisk',
  'XssRisk',
  'CommandInjectionRisk',
  'HardcodedCredential',
  'HardcodedApiKey',
  'UnsafeDeserialization',
  'PathTraversalRisk',
]);

/** Churn-rate thresholds (mirror MEDIUM_CHURN / HIGH_CHURN in temporal/code-churn.ts). */
const MEDIUM_CHURN = 40;
const HIGH_CHURN = 80;

/** Normalises path separators and lowercases for case-insensitive matching. */
function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').toLowerCase();
}

/** Returns just the basename (last path segment), lowercased. */
function basename(normalized: string): string {
  const idx = normalized.lastIndexOf('/');
  return idx === -1 ? normalized : normalized.slice(idx + 1);
}

/**
 * Infers the {@link ArchitectureRole} of a file from its path (Sprint 56, SATT).
 * Path-based heuristic covers ~80% of real cases with minimal maintenance;
 * non-conventional layouts fall back to `'unknown'` (neutral weighting).
 *
 * Precedence: test > controller > service > entity > util > unknown.
 * `test` is checked first because a `UserControllerTest.ts` is a test, not a controller.
 */
export function roleFromPath(filePath: string): ArchitectureRole {
  const p = normalizePath(filePath);
  const base = basename(p);

  // test — checked first: a *Controller.test.ts is a test, not a controller.
  if (
    /(^|\/)__tests__\//.test(p) ||
    /(^|\/)tests?\//.test(p) ||
    /\.(test|spec)\./.test(base) ||
    /_test\.go$/.test(base) ||
    /test\.[a-z0-9]+$/.test(base) ||
    /(^|[._-])test[._-]/.test(base)
  ) {
    return 'test';
  }

  // controller
  if (
    /(^|\/)controllers?\//.test(p) ||
    /(controller|handler|router)\.[a-z0-9]+$/.test(base)
  ) {
    return 'controller';
  }

  // service
  if (
    /(^|\/)services?\//.test(p) ||
    /(service|manager|facade)\.[a-z0-9]+$/.test(base)
  ) {
    return 'service';
  }

  // entity / domain model
  if (
    /(^|\/)models?\//.test(p) ||
    /(^|\/)entity\//.test(p) ||
    /(^|\/)entities\//.test(p) ||
    /(^|\/)domain\//.test(p) ||
    /(entity|model)\.[a-z0-9]+$/.test(base)
  ) {
    return 'entity';
  }

  // util / helper / lib
  if (
    /(^|\/)utils?\//.test(p) ||
    /(^|\/)helpers?\//.test(p) ||
    /(^|\/)lib\//.test(p) ||
    /(utils|helper)\.[a-z0-9]+$/.test(base)
  ) {
    return 'util';
  }

  return 'unknown';
}

/**
 * Role-aware smell weight multiplier (Sprint 56, SATT).
 * ±20–30% is conservative relative to Palomba et al.'s empirical span.
 * All combinations not listed return 1.0 (neutral).
 */
export function roleWeightMultiplier(
  role: ArchitectureRole,
  smellType: SmellType,
): number {
  switch (role) {
    case 'controller':
      if (smellType === 'GodClass') return 0.75; // orchestrator facades are expected to be large
      if (smellType === 'BrainMethod') return 0.8;
      return 1.0;
    case 'util':
      if (smellType === 'GodClass') return 0.85; // utility collectors are often intentionally broad
      return 1.0;
    case 'entity':
      if (smellType === 'GodClass') return 1.2; // entities should be focused; stricter
      if (smellType === 'DataClumps') return 1.15;
      return 1.0;
    case 'service':
      if (smellType === 'FeatureEnvy') return 1.2; // the service layer's signature ailment
      return 1.0;
    case 'test':
    case 'unknown':
    default:
      return 1.0;
  }
}

/**
 * Test-context reachability multiplier for security smells (Sprint 56).
 * Returns 0.4× for security smells when `role === 'test'` (most are unreachable in prod).
 * Complementary heuristic: when the smell's `description` indicates the tainted argument is a
 * string literal (a fixed configuration value), apply 0.5× even outside test context.
 * @see Konvu reachability (90–95% noise reduction); Pixee SAST (91% noise reduction).
 */
export function testContextMultiplier(
  role: ArchitectureRole,
  smell: Smell,
): number {
  if (!SECURITY_SMELL_TYPES.has(smell.type)) return 1.0;

  if (role === 'test') return 0.4;

  // String-literal sink → fixed config call, not user-controlled. Reduce FP weight.
  if (/string literal/i.test(smell.description)) return 0.5;

  return 1.0;
}

/**
 * Churn-rate → multiplier applied to ALL smells in a file (Sprint 56).
 * Only meaningful when `analyzeFileWithHistory()` supplies a real churn rate (requires git).
 * Mirrors the MEDIUM_CHURN (40) / HIGH_CHURN (80) thresholds in temporal/code-churn.ts.
 *
 * @param churnRate file churn rate (0–100+). Defaults to 0 → multiplier 1.0.
 * @returns 1.0 (<40), 1.2 (40–79), 1.5 (≥80).
 */
export function churnMultiplier(churnRate = 0): number {
  if (churnRate >= HIGH_CHURN) return 1.5;
  if (churnRate >= MEDIUM_CHURN) return 1.2;
  return 1.0;
}

/**
 * True when an author/committer identifies as an automated (bot) account.
 * Case-insensitive match against `[bot]` suffix, the {@link BOT_AUTHOR_PATTERNS} list,
 * and the GitHub noreply email domain.
 */
export function isBotCommit(
  authorName: string,
  authorEmail: string,
  committerName: string,
): boolean {
  const name = (authorName ?? '').toLowerCase();
  const committer = (committerName ?? '').toLowerCase();
  const email = (authorEmail ?? '').toLowerCase();

  if (name.endsWith('[bot]') || committer.endsWith('[bot]')) return true;
  if (email.includes(BOT_EMAIL_DOMAIN)) return true;

  for (const pattern of BOT_AUTHOR_PATTERNS) {
    if (name === pattern || committer === pattern) return true;
    if (name.includes(`${pattern}[bot]`) || committer.includes(`${pattern}[bot]`)) {
      return true;
    }
  }

  return false;
}

/**
 * Filters out automated (bot) commits before churn aggregation (Sprint 56).
 * Generic over any commit-shaped object so it can be reused by hotspot/churn analyses.
 */
export function filterBotCommits<
  T extends { authorName: string; authorEmail: string; committerName: string },
>(commits: T[]): T[] {
  return commits.filter(
    (c) => !isBotCommit(c.authorName, c.authorEmail, c.committerName),
  );
}

/**
 * Builds a {@link FileScoringContext} from a path and optional churn rate (Sprint 56).
 * `isTestContext` is derived from the role; `churnMultiplier` is 1.0 unless a churn rate
 * is supplied (i.e. only when git history is available via `analyzeFileWithHistory()`).
 */
export function buildFileScoringContext(
  filePath: string,
  churnRate?: number,
): FileScoringContext {
  const role = roleFromPath(filePath);
  return {
    filePath,
    role,
    isTestContext: role === 'test',
    churnMultiplier: churnMultiplier(churnRate),
  };
}
