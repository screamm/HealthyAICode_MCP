import { describe, it, expect } from 'vitest';
import { analyzeBash } from '../../src/analyzers/bash';

const DEPLOY_SCRIPT = `
function deploy() {
  if [ "$ENV" = "prod" ]; then
    for server in $SERVERS; do
      rsync -r ./dist/ $server:/app
    done
  fi
}`;

const SIMPLE_FUNC = `
hello() {
  echo "hello world"
}`;

const COMPLEX_SCRIPT = `
validate_env() {
  if [ -z "$VAR1" ]; then
    echo "missing VAR1"
    exit 1
  elif [ -z "$VAR2" ]; then
    echo "missing VAR2"
    exit 1
  fi

  case "$ENV" in
    prod|staging)
      echo "valid env"
      ;;
    *)
      echo "unknown env"
      exit 1
      ;;
  esac
}`;

describe('analyzeBash', () => {
  it('detects functions using function keyword', () => {
    const result = analyzeBash(DEPLOY_SCRIPT, 'deploy.sh');
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe('deploy');
  });

  it('detects functions using POSIX syntax name()', () => {
    const result = analyzeBash(SIMPLE_FUNC, 'hello.sh');
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe('hello');
  });

  it('counts cyclomatic complexity for if/for', () => {
    const result = analyzeBash(DEPLOY_SCRIPT, 'deploy.sh');
    expect(result.functions[0].cyclomaticComplexity).toBeGreaterThan(2);
  });

  it('counts if/elif/case as CC contributors', () => {
    const result = analyzeBash(COMPLEX_SCRIPT, 'validate.sh');
    expect(result.functions[0].cyclomaticComplexity).toBeGreaterThanOrEqual(3);
  });

  it('returns base CC of 1 for a simple function', () => {
    const result = analyzeBash(SIMPLE_FUNC, 'hello.sh');
    expect(result.functions[0].cyclomaticComplexity).toBe(1);
  });

  it('handles empty input without throwing', () => {
    expect(() => analyzeBash('', 'empty.sh')).not.toThrow();
    const result = analyzeBash('', 'empty.sh');
    expect(result.functions).toHaveLength(0);
  });

  it('returns valid metrics object', () => {
    const result = analyzeBash(DEPLOY_SCRIPT, 'deploy.sh');
    expect(result.metrics).toHaveProperty('cyclomaticComplexity');
    expect(result.metrics).toHaveProperty('totalLines');
    expect(result.metrics.totalLines).toBeGreaterThan(0);
  });

  it('detects SATD comments', () => {
    const code = 'setup() {\n  # TODO: implement retry logic\n  ssh $HOST deploy\n}';
    const result = analyzeBash(code, 'setup.sh');
    expect(result.smells.some(s => s.type === 'SATD')).toBe(true);
  });

  it('smells array is always an array', () => {
    const result = analyzeBash(SIMPLE_FUNC, 'hello.sh');
    expect(Array.isArray(result.smells)).toBe(true);
  });
});
