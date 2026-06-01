import { describe, it, expect } from 'vitest';
import type { Smell } from '../../src/types';
import {
  roleFromPath,
  roleWeightMultiplier,
  testContextMultiplier,
  churnMultiplier,
  isBotCommit,
  filterBotCommits,
  buildFileScoringContext,
  BOT_AUTHOR_PATTERNS,
} from '../../src/scoring/context-weights';

function smell(type: Smell['type'], description = ''): Smell {
  return {
    type,
    severity: 'high',
    line: 1,
    description,
    suggestion: '',
  };
}

describe('roleFromPath', () => {
  it('detects controller from directory and suffix', () => {
    expect(roleFromPath('src/controllers/UserController.ts')).toBe('controller');
    expect(roleFromPath('src/api/PaymentHandler.ts')).toBe('controller');
    expect(roleFromPath('app/Router.ts')).toBe('controller');
  });

  it('detects service', () => {
    expect(roleFromPath('src/services/AuthService.ts')).toBe('service');
    expect(roleFromPath('src/UserManager.ts')).toBe('service');
    expect(roleFromPath('src/PaymentFacade.ts')).toBe('service');
  });

  it('detects entity from models/domain/entity paths', () => {
    expect(roleFromPath('src/models/User.ts')).toBe('entity');
    expect(roleFromPath('src/domain/Order.ts')).toBe('entity');
    expect(roleFromPath('src/entity/Account.ts')).toBe('entity');
    expect(roleFromPath('src/UserModel.ts')).toBe('entity');
  });

  it('detects util/helper/lib', () => {
    expect(roleFromPath('src/utils/format.ts')).toBe('util');
    expect(roleFromPath('src/helpers/strings.ts')).toBe('util');
    expect(roleFromPath('src/lib/math.ts')).toBe('util');
    expect(roleFromPath('src/StringUtils.ts')).toBe('util');
  });

  it('detects test contexts', () => {
    expect(roleFromPath('src/__tests__/foo.ts')).toBe('test');
    expect(roleFromPath('tests/foo.ts')).toBe('test');
    expect(roleFromPath('src/foo.test.ts')).toBe('test');
    expect(roleFromPath('src/foo.spec.ts')).toBe('test');
    expect(roleFromPath('pkg/handler_test.go')).toBe('test');
  });

  it('test takes precedence over controller (a controller test is a test)', () => {
    expect(roleFromPath('src/__tests__/UserController.test.ts')).toBe('test');
  });

  it('falls back to unknown for unconventional paths', () => {
    expect(roleFromPath('src/index.ts')).toBe('unknown');
    expect(roleFromPath('main.py')).toBe('unknown');
  });

  it('is case-insensitive and handles windows separators', () => {
    expect(roleFromPath('SRC\\CONTROLLERS\\UserController.TS')).toBe('controller');
  });
});

describe('roleWeightMultiplier', () => {
  it('reduces GodClass in controller and util roles', () => {
    expect(roleWeightMultiplier('controller', 'GodClass')).toBe(0.75);
    expect(roleWeightMultiplier('controller', 'BrainMethod')).toBe(0.8);
    expect(roleWeightMultiplier('util', 'GodClass')).toBe(0.85);
  });

  it('increases GodClass/DataClumps in entity role', () => {
    expect(roleWeightMultiplier('entity', 'GodClass')).toBe(1.2);
    expect(roleWeightMultiplier('entity', 'DataClumps')).toBe(1.15);
  });

  it('increases FeatureEnvy in service role', () => {
    expect(roleWeightMultiplier('service', 'FeatureEnvy')).toBe(1.2);
  });

  it('returns neutral 1.0 for unmapped combinations', () => {
    expect(roleWeightMultiplier('controller', 'SqlInjectionRisk')).toBe(1.0);
    expect(roleWeightMultiplier('unknown', 'GodClass')).toBe(1.0);
    expect(roleWeightMultiplier('test', 'GodClass')).toBe(1.0);
  });

  it('controller GodClass multiplier is lower than entity GodClass multiplier', () => {
    expect(roleWeightMultiplier('controller', 'GodClass')).toBeLessThan(
      roleWeightMultiplier('entity', 'GodClass'),
    );
  });
});

describe('testContextMultiplier', () => {
  it('applies 0.4x to security smells in test context', () => {
    expect(testContextMultiplier('test', smell('SqlInjectionRisk'))).toBe(0.4);
    expect(testContextMultiplier('test', smell('XssRisk'))).toBe(0.4);
    expect(testContextMultiplier('test', smell('HardcodedCredential'))).toBe(0.4);
  });

  it('does not discount non-security smells in test context', () => {
    expect(testContextMultiplier('test', smell('ComplexMethod'))).toBe(1.0);
    expect(testContextMultiplier('test', smell('GodClass'))).toBe(1.0);
  });

  it('applies 0.5x for string-literal sinks outside test context', () => {
    expect(
      testContextMultiplier('controller', smell('SqlInjectionRisk', 'tainted string literal flows to query')),
    ).toBe(0.5);
  });

  it('keeps full weight for production security smell with non-literal sink', () => {
    expect(
      testContextMultiplier('controller', smell('SqlInjectionRisk', 'user input flows to query')),
    ).toBe(1.0);
  });
});

describe('churnMultiplier', () => {
  it('returns 1.0 below medium threshold', () => {
    expect(churnMultiplier(0)).toBe(1.0);
    expect(churnMultiplier(39)).toBe(1.0);
    expect(churnMultiplier()).toBe(1.0);
  });

  it('returns 1.2 in medium band', () => {
    expect(churnMultiplier(40)).toBe(1.2);
    expect(churnMultiplier(79)).toBe(1.2);
  });

  it('returns 1.5 at/above high threshold', () => {
    expect(churnMultiplier(80)).toBe(1.5);
    expect(churnMultiplier(200)).toBe(1.5);
  });
});

describe('isBotCommit / filterBotCommits', () => {
  it('matches [bot] suffix on author or committer', () => {
    expect(isBotCommit('dependabot[bot]', 'x@y.com', 'GitHub')).toBe(true);
    expect(isBotCommit('Real Dev', 'x@y.com', 'renovate[bot]')).toBe(true);
  });

  it('matches the github noreply email domain', () => {
    expect(isBotCommit('whatever', '12345+bot@users.noreply.github.com', 'whatever')).toBe(true);
  });

  it('matches exact bot pattern names', () => {
    for (const p of BOT_AUTHOR_PATTERNS) {
      expect(isBotCommit(p, 'a@b.com', 'x')).toBe(true);
    }
  });

  it('does not match a normal human commit', () => {
    expect(isBotCommit('David Rydgren', 'david@example.com', 'David Rydgren')).toBe(false);
  });

  it('filterBotCommits removes only bot commits', () => {
    const commits = [
      { authorName: 'David', authorEmail: 'd@x.com', committerName: 'David' },
      { authorName: 'dependabot[bot]', authorEmail: 'b@x.com', committerName: 'GitHub' },
      { authorName: 'renovate', authorEmail: 'r@x.com', committerName: 'GitHub' },
    ];
    const filtered = filterBotCommits(commits);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].authorName).toBe('David');
  });
});

describe('buildFileScoringContext', () => {
  it('derives role, test flag and churn multiplier', () => {
    const ctx = buildFileScoringContext('src/controllers/UserController.ts');
    expect(ctx.role).toBe('controller');
    expect(ctx.isTestContext).toBe(false);
    expect(ctx.churnMultiplier).toBe(1.0);
  });

  it('marks test context and applies churn multiplier when churn is high', () => {
    const ctx = buildFileScoringContext('src/__tests__/foo.test.ts', 90);
    expect(ctx.role).toBe('test');
    expect(ctx.isTestContext).toBe(true);
    expect(ctx.churnMultiplier).toBe(1.5);
  });
});

// Role detection for the Sprint 56 fixture scenarios, evaluated at their representative
// production-equivalent paths (the fixtures themselves live under tests/, which is — correctly —
// always classified as 'test'; here we assert how the same files would be classified in a real tree).
describe('fixture-scenario role detection', () => {
  it('a controller-god-class under controllers/ is controller; an entity-god-class under models/ is entity', () => {
    expect(roleFromPath('src/controllers/controller-god-class.ts')).toBe('controller');
    expect(roleFromPath('src/models/entity-god-class.ts')).toBe('entity');
  });

  it('a test-sql file under __tests__/ is test; a prod-sql handler in controllers/ is controller', () => {
    expect(roleFromPath('src/__tests__/test-sql-injection.ts')).toBe('test');
    expect(roleFromPath('src/controllers/prod-sql-injection.ts')).toBe('controller');
  });

  it('anything physically under tests/fixtures/ is classified as test (precedence)', () => {
    expect(roleFromPath('packages/core/tests/fixtures/healthy/controller-god-class.ts')).toBe('test');
    expect(roleFromPath('packages/core/tests/fixtures/unhealthy/entity-god-class.ts')).toBe('test');
  });
});
