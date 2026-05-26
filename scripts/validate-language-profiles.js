/**
 * validate-language-profiles.js  (CommonJS)
 *
 * Validates Go, Ruby, Rust, and PHP language profiles against real OSS code.
 * Checks for false positives, score reasonableness, and smell accuracy.
 *
 * Usage: node scripts/validate-language-profiles.js
 *
 * Files analysed (pre-downloaded to C:\temp\validate-profiles\):
 *   Go:   gin-gonic/gin — gin.go (~832 lines)
 *   Ruby: rails/rails  — actionmailer base.rb (~1082 lines)
 *   Rust: BurntSushi/ripgrep — crates/core/search.rs (~449 lines)
 *                            — crates/searcher/src/searcher/mod.rs (~1088 lines)
 *   PHP:  laravel/framework — Illuminate/Foundation/Application.php (~1735 lines)
 */

'use strict';

const { readFileSync, existsSync } = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const fixtureDir = 'C:\\temp\\validate-profiles';

// Load language-specific analyzers directly to avoid pulling in tree-sitter-c-sharp
// (which uses ESM top-level await, incompatible with require() in Node 24).
// Each analyzer is self-contained: it requires only tree-sitter-<lang> + shared helpers.
const dist = path.join(repoRoot, 'packages/core/dist');
const { analyzeGo }   = require(path.join(dist, 'analyzers/go.js'));
const { analyzeRuby } = require(path.join(dist, 'analyzers/ruby.js'));
const { analyzeRust } = require(path.join(dist, 'analyzers/rust.js'));
const { analyzePhp }  = require(path.join(dist, 'analyzers/php.js'));
const { calculateScore, categorize } = require(path.join(dist, 'scoring/scorer.js'));

// Wrapper that replicates analyzeCode's output shape for Go/Ruby/Rust/PHP only
function analyzeCode(code, language, filePath) {
  let result;
  switch (language) {
    case 'go':   result = analyzeGo(code, filePath);   break;
    case 'ruby': result = analyzeRuby(code, filePath); break;
    case 'rust': result = analyzeRust(code, filePath); break;
    case 'php':  result = analyzePhp(code, filePath);  break;
    default: throw new Error(`Unsupported language in this validation script: ${language}`);
  }
  const score = calculateScore(result.smells, result.metrics);
  const category = categorize(score);
  return { ...result, score, category };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function loadFile(filename) {
  const fp = path.join(fixtureDir, filename);
  if (!existsSync(fp)) {
    throw new Error(`Missing fixture file: ${fp}`);
  }
  return readFileSync(fp, 'utf8');
}

function runAnalysis(code, language, filePath) {
  const result = analyzeCode(code, language, filePath);
  const score = result.score;
  const smellCounts = {};
  for (const smell of result.smells || []) {
    smellCounts[smell.type] = (smellCounts[smell.type] || 0) + 1;
  }
  return {
    language,
    filePath,
    lineCount: code.split('\n').length,
    score: typeof score === 'number' ? parseFloat(score.toFixed(2)) : null,
    smells: smellCounts,
    allSmells: result.smells || [],
  };
}

function printSection(title) {
  console.log('\n' + '═'.repeat(72));
  console.log('  ' + title);
  console.log('═'.repeat(72));
}

function printResult(label, r) {
  console.log(`\n[${r.language.toUpperCase()}] ${label}`);
  console.log(`  File: ${r.filePath}  (${r.lineCount} lines)`);
  console.log(`  Score: ${r.score}`);
  const smellKeys = Object.keys(r.smells);
  if (smellKeys.length === 0) {
    console.log('  Smells: none detected');
  } else {
    console.log('  Smells:');
    const sorted = Object.entries(r.smells).sort((a, b) => b[1] - a[1]);
    for (const [type, count] of sorted) {
      console.log(`    ${type}: ${count}`);
    }
  }
}

const issues = [];
const passes = [];

function check(condition, description, detail) {
  if (condition) {
    passes.push(description);
    console.log(`  PASS: ${description}`);
  } else {
    const msg = detail ? `${description} — ${detail}` : description;
    issues.push(msg);
    console.log(`  FAIL: ${msg}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Synthetic "known-healthy" fixtures
// ─────────────────────────────────────────────────────────────────────────────

const goHealthy = `package main

import "fmt"

// Greeter greets people.
type Greeter struct {
\tname string
}

// Greet returns a greeting string.
func (g *Greeter) Greet() string {
\treturn fmt.Sprintf("Hello, %s!", g.name)
}

// NewGreeter creates a Greeter.
func NewGreeter(name string) *Greeter {
\treturn &Greeter{name: name}
}
`;

const rubyHealthy = `# Simple Ruby class — well-structured, idiomatic
class Calculator
  # Creates a new Calculator.
  def initialize
    @history = []
  end

  # Adds two numbers.
  def add(a, b)
    result = a + b
    @history << result
    result
  end

  # Subtracts two numbers.
  def subtract(a, b)
    result = a - b
    @history << result
    result
  end

  # Returns the history.
  def history
    @history.dup
  end
end
`;

const rustHealthy = `/// A simple adder struct.
pub struct Adder {
    base: i32,
}

impl Adder {
    /// Creates a new Adder.
    pub fn new(base: i32) -> Self {
        Adder { base }
    }

    /// Adds the given value to the base.
    pub fn add(&self, value: i32) -> i32 {
        self.base + value
    }
}

/// A trait for display.
pub trait Display {
    fn display(&self) -> String;
}

impl Display for Adder {
    fn display(&self) -> String {
        format!("Adder(base={})", self.base)
    }
}
`;

const phpHealthy = `<?php

namespace App;

/**
 * Simple UserRepository class.
 */
class UserRepository
{
    /**
     * @var array
     */
    private array $users = [];

    /**
     * Finds a user by ID.
     */
    public function find(int $id): ?array
    {
        return $this->users[$id] ?? null;
    }

    /**
     * Saves a user.
     */
    public function save(array $user): void
    {
        $this->users[$user['id']] = $user;
    }

    /**
     * Returns all users.
     */
    public function all(): array
    {
        return array_values($this->users);
    }
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

printSection('Loading OSS fixtures');

const ginCode = loadFile('gin.go');
const baseRbCode = loadFile('base.rb');
const searchRsCode = loadFile('search.rs');
const searcherModRsCode = loadFile('searcher_mod.rs');
const applicationPhpCode = loadFile('Application.php');

console.log(`  gin.go:           ${ginCode.split('\n').length} lines`);
console.log(`  base.rb:          ${baseRbCode.split('\n').length} lines`);
console.log(`  search.rs:        ${searchRsCode.split('\n').length} lines`);
console.log(`  searcher_mod.rs:  ${searcherModRsCode.split('\n').length} lines`);
console.log(`  Application.php:  ${applicationPhpCode.split('\n').length} lines`);

// ── GO ────────────────────────────────────────────────────────────────────────
printSection('GO — gin-gonic/gin gin.go');

const ginResult = runAnalysis(ginCode, 'go', 'gin.go');
const goHealthyResult = runAnalysis(goHealthy, 'go', 'greeter.go');

printResult('gin-gonic/gin gin.go', ginResult);
printResult('Healthy Go (Greeter)', goHealthyResult);

console.log('\n  Checks:');
check(goHealthyResult.score >= 7.0, `Healthy Go fixture scores >= 7.0 (got ${goHealthyResult.score})`);
check(ginResult.score >= 4.0, `gin.go scores >= 4.0 (got ${ginResult.score})`, 'large framework file but not catastrophic');
check((goHealthyResult.smells['GodClass'] || 0) === 0, `Healthy Go Greeter has no GodClass false positive`);
check(typeof ginResult.score === 'number' && !isNaN(ginResult.score), `gin.go analysis returns numeric score`);

const ginGodClass = ginResult.smells['GodClass'] || 0;
if (ginGodClass > 0) {
  console.log(`  INFO: gin.go GodClass flagged ${ginGodClass} time(s) — Engine struct is genuinely large`);
} else {
  console.log(`  INFO: gin.go GodClass NOT flagged — WMC+ATFD+LCOM4 thresholds not all met`);
}

// ── RUBY ──────────────────────────────────────────────────────────────────────
printSection('RUBY — rails/rails actionmailer base.rb');

const baseRbResult = runAnalysis(baseRbCode, 'ruby', 'base.rb');
const rubyHealthyResult = runAnalysis(rubyHealthy, 'ruby', 'calculator.rb');

printResult('rails/rails actionmailer base.rb', baseRbResult);
printResult('Healthy Ruby (Calculator)', rubyHealthyResult);

console.log('\n  Checks:');
check(rubyHealthyResult.score >= 7.0, `Healthy Ruby fixture scores >= 7.0 (got ${rubyHealthyResult.score})`);
check(baseRbResult.score >= 2.0, `base.rb scores >= 2.0 (got ${baseRbResult.score})`, 'ActionMailer::Base is legitimately complex');
check(baseRbResult.score <= rubyHealthyResult.score, `base.rb scores <= healthy fixture (${baseRbResult.score} <= ${rubyHealthyResult.score})`);
check((rubyHealthyResult.smells['GodClass'] || 0) === 0, `Healthy Ruby Calculator has no GodClass`);
check((rubyHealthyResult.smells['FeatureEnvy'] || 0) === 0, `Healthy Ruby Calculator has no FeatureEnvy`);
check(typeof baseRbResult.score === 'number' && !isNaN(baseRbResult.score), `base.rb analysis returns numeric score`);

// ── RUST ──────────────────────────────────────────────────────────────────────
printSection('RUST — BurntSushi/ripgrep');

const searchRsResult = runAnalysis(searchRsCode, 'rust', 'search.rs');
const searcherModResult = runAnalysis(searcherModRsCode, 'rust', 'searcher_mod.rs');
const rustHealthyResult = runAnalysis(rustHealthy, 'rust', 'adder.rs');

printResult('ripgrep crates/core/search.rs', searchRsResult);
printResult('ripgrep crates/searcher/mod.rs', searcherModResult);
printResult('Healthy Rust (Adder + trait impls)', rustHealthyResult);

console.log('\n  Checks:');
check(rustHealthyResult.score >= 7.0, `Healthy Rust fixture scores >= 7.0 (got ${rustHealthyResult.score})`);
check(searchRsResult.score >= 6.0, `ripgrep search.rs scores >= 6.0 (got ${searchRsResult.score})`);
check((rustHealthyResult.smells['GodClass'] || 0) === 0, `Healthy Rust (struct + trait impl blocks) has no GodClass`);
const searcherGC = searcherModResult.smells['GodClass'] || 0;
check(searcherGC <= 2, `ripgrep searcher_mod.rs has <= 2 GodClass flags (got ${searcherGC})`);
check(typeof searchRsResult.score === 'number' && !isNaN(searchRsResult.score), `search.rs returns numeric score`);
check(typeof searcherModResult.score === 'number' && !isNaN(searcherModResult.score), `searcher_mod.rs returns numeric score`);

// ── PHP ───────────────────────────────────────────────────────────────────────
printSection('PHP — laravel/framework Application.php');

const applicationResult = runAnalysis(applicationPhpCode, 'php', 'Application.php');
const phpHealthyResult = runAnalysis(phpHealthy, 'php', 'UserRepository.php');

printResult('laravel Application.php', applicationResult);
printResult('Healthy PHP (UserRepository)', phpHealthyResult);

console.log('\n  Checks:');
check(phpHealthyResult.score >= 7.0, `Healthy PHP fixture scores >= 7.0 (got ${phpHealthyResult.score})`);
check(applicationResult.score >= 1.0, `Application.php score >= 1.0 (got ${applicationResult.score})`, 'does not crash');
check(applicationResult.score <= phpHealthyResult.score, `Application.php scores <= healthy PHP (${applicationResult.score} <= ${phpHealthyResult.score})`);
check((phpHealthyResult.smells['GodClass'] || 0) === 0, `Healthy PHP UserRepository has no GodClass`);
const appGC = applicationResult.smells['GodClass'] || 0;
check(appGC <= 5, `Application.php GodClass count <= 5 (got ${appGC})`, 'may fire: Application IS a god class');
check(typeof applicationResult.score === 'number' && !isNaN(applicationResult.score), `Application.php returns numeric score`);

// ── SYNTHETIC EDGE CASES ─────────────────────────────────────────────────────
printSection('SYNTHETIC EDGE CASES');

// Go: net/http-style interface — must NOT trigger GodClass
const goHandlerInterface = `package http

// Handler responds to an HTTP request.
type Handler interface {
\tServeHTTP(ResponseWriter, *Request)
}

// ResponseWriter is used by an HTTP handler to construct an HTTP response.
type ResponseWriter interface {
\tHeader() Header
\tWrite([]byte) (int, error)
\tWriteHeader(statusCode int)
}
`;
const goInterfaceResult = runAnalysis(goHandlerInterface, 'go', 'handler.go');
printResult('Go net/http Handler interface', goInterfaceResult);
check((goInterfaceResult.smells['GodClass'] || 0) === 0, `Go interface declarations do not trigger GodClass`);
check(goInterfaceResult.score >= 7.0, `Go interface-only file scores >= 7.0 (got ${goInterfaceResult.score})`);

// Ruby: callback module — idiomatic Ruby, no FeatureEnvy
const rubyCallbackModule = `# Callbacks module
module Callbacks
  # Runs before save.
  def before_save
    validate_attributes
  end

  # Runs after save.
  def after_save
    notify_observers
  end

  private

  def validate_attributes
    @valid = true
  end

  def notify_observers
    @observers.each(&:update)
  end
end
`;
const rubyCallbackResult = runAnalysis(rubyCallbackModule, 'ruby', 'callbacks.rb');
printResult('Ruby Callbacks Module', rubyCallbackResult);
check((rubyCallbackResult.smells['FeatureEnvy'] || 0) === 0, `Ruby callbacks module has no FeatureEnvy`);

// Rust: trait impl blocks (Iterator + Display) — no GodClass
const rustTraitImpls = `/// Iterator for a list.
pub struct ListIter {
    items: Vec<i32>,
    pos: usize,
}

impl ListIter {
    /// Creates a new ListIter.
    pub fn new(items: Vec<i32>) -> Self {
        ListIter { items, pos: 0 }
    }
}

impl Iterator for ListIter {
    type Item = i32;

    fn next(&mut self) -> Option<i32> {
        if self.pos < self.items.len() {
            let val = self.items[self.pos];
            self.pos += 1;
            Some(val)
        } else {
            None
        }
    }
}

impl std::fmt::Display for ListIter {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "ListIter(pos={})", self.pos)
    }
}
`;
const rustIterResult = runAnalysis(rustTraitImpls, 'rust', 'list_iter.rs');
printResult('Rust Iterator trait impl', rustIterResult);
check((rustIterResult.smells['GodClass'] || 0) === 0, `Rust Iterator trait impl has no GodClass`);
check(rustIterResult.score >= 6.0, `Rust Iterator trait impl scores >= 6.0 (got ${rustIterResult.score})`);

// PHP: IoC container pattern — no GodClass on small container
const phpIoCPattern = `<?php

namespace Foundation;

/**
 * Simple IoC container.
 */
class Container
{
    /**
     * @var array
     */
    protected array $bindings = [];

    /**
     * Bind an abstract to a concrete.
     */
    public function bind(string $abstract, callable $factory): void
    {
        $this->bindings[$abstract] = $factory;
    }

    /**
     * Resolve an abstract from the container.
     */
    public function make(string $abstract): mixed
    {
        if (isset($this->bindings[$abstract])) {
            return ($this->bindings[$abstract])($this);
        }
        return new $abstract();
    }

    /**
     * Returns true if the abstract is bound.
     */
    public function has(string $abstract): bool
    {
        return isset($this->bindings[$abstract]);
    }
}
`;
const phpIoCResult = runAnalysis(phpIoCPattern, 'php', 'Container.php');
printResult('PHP IoC Container', phpIoCResult);
check((phpIoCResult.smells['GodClass'] || 0) === 0, `PHP IoC Container has no GodClass`);
check(phpIoCResult.score >= 6.0, `PHP IoC Container scores >= 6.0 (got ${phpIoCResult.score})`);

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
printSection('SUMMARY');
console.log(`\n  Passed: ${passes.length}`);
console.log(`  Failed: ${issues.length}`);

if (issues.length > 0) {
  console.log('\n  FAILURES:');
  for (const issue of issues) {
    console.log(`    FAIL: ${issue}`);
  }
}

// Collect all results for structured output
const allResults = {
  timestamp: new Date().toISOString(),
  results: {
    'go_healthy': goHealthyResult,
    'gin_go': ginResult,
    'ruby_healthy': rubyHealthyResult,
    'base_rb': baseRbResult,
    'rust_healthy': rustHealthyResult,
    'search_rs': searchRsResult,
    'searcher_mod_rs': searcherModResult,
    'php_healthy': phpHealthyResult,
    'application_php': applicationResult,
    'go_interface': goInterfaceResult,
    'ruby_callbacks': rubyCallbackResult,
    'rust_iterator': rustIterResult,
    'php_ioc': phpIoCResult,
  },
  passes: passes.length,
  failures: issues.length,
  failureDetails: issues,
};

console.log('\n  JSON_RESULTS_START');
console.log(JSON.stringify(allResults, null, 2));
console.log('  JSON_RESULTS_END');

process.exit(issues.length > 0 ? 1 : 0);
