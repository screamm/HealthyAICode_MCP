# Sprint 25: Sprakexpansion till 30+ sprak

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Utoka sprakstod fran 11 till 30+ sprak. Idag skapas stod via tre niva-kategorier: Tier A (full Code Health: nya analysatorer med kompletta biomarker-detektorer), Tier B (metrics + text-baserade smells: generisk extraktionslogik), och Tier C (strukturell komplexitetsanalys: hotspot-niva via AST utan funktionsniva). Sprinten hanterar fyra Tier A-sprak (Dart, Kotlin-native, Scala, C/C++), sex Tier B-sprak (Bash/Shell, Lua, R, Elixir, Haskell, Clojure) och fyra Tier C-sprak (YAML, JSON, Dockerfile, Terraform HCL).

**Architecture:** Tier A-sprak far varsin analysatorfil i `packages/core/src/analyzers/` som foljer `java.ts`-mallen. Tier B-sprak delar en ny generisk extraktionsfunktion `analyzeGeneric(code, filePath, config)` med language-specific node-typs-konfiguration. Tier C-sprak far en strukturell komplexitetsanalysator `analyzeStructural(code, filePath, language)` utan funktionsniva. Alla nya sprak registreras i `language-detect.ts`, `types.ts` och `analyzers/index.ts`.

**Tech Stack:** TypeScript 5.x, tree-sitter (befintlig), Vitest, pnpm workspaces

**Nya tree-sitter packages (installeras i Task 1):**
- Tier A: `tree-sitter-dart`, `tree-sitter-c`, `tree-sitter-cpp`, `tree-sitter-scala`
- Tier B: `tree-sitter-bash`, `tree-sitter-lua`, `tree-sitter-elixir`, `tree-sitter-haskell`
- Tier C: `tree-sitter-yaml`, `tree-sitter-json`, `tree-sitter-dockerfile`, `tree-sitter-hcl`

**Testkommando:** `cd packages/core && pnpm test`

---
## Bakgrund och motivation

Projektet stoder idag 11 sprak. CodeScene stoder 40+. Gapet ar strategiskt ofordelaktigt nar potentiella anvandare jamfor.

**Varfor tre tiera och inte full Tier A for alla?**

| Tier | Exempelsprak | Implementationskostnad | Vardesteg |
|------|-------------|----------------------|-----------|
| A -- Full Code Health | Dart, Scala, C/C++, Kotlin-native | 3-5 dagar per sprak (per-sprak AST-mappning) | Hogst -- fullstandiga biomarkers |
| B -- Metrics + text | Bash, Lua, Elixir, Haskell | 0.5-1 dag per sprak (generisk extraktionsfunktion) | Medel -- CC/nesting/parametrar + SATD/MagicNumber |
| C -- Strukturell | YAML, Dockerfile, JSON, HCL | 0.25-0.5 dag per format | Lagst men gar fran unsupported till meningsfull analys |

Tier B-modellen har redan bevisats med `java.ts`-mallen. Tier B-generisk extraktionsfunktion reducerar per-sprak-arbetet till att definiera en konfigurationsfil med AST-nodtyper.

**Varfor Kotlin native istallet for Java-routing?**

Kotlin skickades till `analyzeJava` i Sprint 16 som en kompromiss. Men Kotlin har unika AST-nodtyper: `function_declaration` istallet for `method_declaration`, `object_declaration` for companion objects, `when_expression` for pattern matching. Java-routingen ger felaktiga function-ranges och missar Kotlin-specifika smells. Native Kotlin-analyzer ger korrekt parsning och later framtida sprinter implementera Kotlin-specifika detektorer.

---

## Filooversikt

| Fil | Andring |
|-----|---------|
| `packages/core/package.json` | Lagg till 12 nya tree-sitter-* dependencies |
| `packages/core/src/types.ts` | Utoka Language-union med 14 nya sprak |
| `packages/core/src/language-detect.ts` | Lagg till ~25 nya filandelser i EXTENSION_MAP |
| `packages/core/src/analyzers/dart.ts` | Ny -- Tier A Dart-analyzer |
| `packages/core/src/analyzers/kotlin.ts` | Ny -- Tier A Kotlin-native-analyzer (ersatter Java-routing) |
| `packages/core/src/analyzers/scala.ts` | Ny -- Tier A Scala-analyzer |
| `packages/core/src/analyzers/c.ts` | Ny -- Tier A C/C++-analyzer |
| `packages/core/src/ai-readiness/generic-extractor.ts` | Ny -- Tier B generisk extraktionsfunktion |
| `packages/core/src/analyzers/bash.ts` | Ny -- Tier B Bash/Shell-analyzer |
| `packages/core/src/analyzers/lua.ts` | Ny -- Tier B Lua-analyzer |
| `packages/core/src/analyzers/elixir.ts` | Ny -- Tier B Elixir-analyzer |
| `packages/core/src/analyzers/haskell.ts` | Ny -- Tier B Haskell-analyzer |
| `packages/core/src/analyzers/r.ts` | Ny -- Tier B R-analyzer |
| `packages/core/src/analyzers/clojure.ts` | Ny -- Tier B Clojure-analyzer |
| `packages/core/src/analyzers/structural.ts` | Ny -- Tier C strukturell komplexitetsanalys |
| `packages/core/src/analyzers/yaml.ts` | Ny -- Tier C YAML-analyzer |
| `packages/core/src/analyzers/json-schema.ts` | Ny -- Tier C JSON-analyzer |
| `packages/core/src/analyzers/dockerfile.ts` | Ny -- Tier C Dockerfile-analyzer |
| `packages/core/src/analyzers/hcl.ts` | Ny -- Tier C Terraform HCL-analyzer |
| `packages/core/src/analyzers/index.ts` | Lagg till alla nya case-grenar |
| `packages/core/tests/analyzers/dart.test.ts` | Ny testfil |
| `packages/core/tests/analyzers/kotlin.test.ts` | Ny testfil (ny native analyzer) |
| `packages/core/tests/analyzers/scala.test.ts` | Ny testfil |
| `packages/core/tests/analyzers/c.test.ts` | Ny testfil |
| `packages/core/tests/analyzers/bash.test.ts` | Ny testfil |
| `packages/core/tests/analyzers/generic-extractor.test.ts` | Ny testfil for den generiska Tier B-extraktorn |
| `packages/core/tests/analyzers/structural.test.ts` | Ny testfil for Tier C-strukturanalys |
| `docs/language-coverage-matrix.md` | Uppdatera med 14 nya sprak |
| `README.md` | Uppdatera "Supported Languages" fran 11 till 30+ |

---
## Task 1 -- Installera dependencies och registrera sprak i typsystemet [Haiku]

**Files:**
- Modify: `packages/core/package.json`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/language-detect.ts`

Denna task lagger grunden for alla efterfoljande tasks. Inga analyzer-implementeringar behovs -- enbart paketinstallation, typ-registrering och filandelse-mappning.

- [ ] **Steg 1: Lagg till dependencies i `package.json`**

Lagg till i `devDependencies` och `dependencies` (baade -- tree-sitter-paketen behovs i runtime for parsing):

```json
{
  "tree-sitter-dart": "latest",
  "tree-sitter-c": "latest",
  "tree-sitter-cpp": "latest",
  "tree-sitter-scala": "latest",
  "tree-sitter-bash": "latest",
  "tree-sitter-lua": "latest",
  "tree-sitter-elixir": "latest",
  "tree-sitter-haskell": "latest",
  "tree-sitter-yaml": "latest",
  "tree-sitter-json": "latest",
  "tree-sitter-dockerfile": "latest",
  "tree-sitter-hcl": "latest"
}
```

Kora `cd packages/core && pnpm install`. Om nagon grammar-package saknas pa npm, kontrollera alternativt namn (t.ex. `@tree-sitter-grammars/tree-sitter-hcl`).

- [ ] **Steg 2: Utoka Language-union i `types.ts`**

Hitta `export type Language = ...` och lagg till:
```typescript
  | 'dart' | 'scala' | 'c' | 'cpp'
  | 'bash' | 'lua' | 'elixir' | 'haskell' | 'r' | 'clojure'
  | 'yaml' | 'json' | 'dockerfile' | 'hcl'
```

Obs: `kotlin` ar redan i union men routades till Java. Nu far den en native analyzer i Task 4.

- [ ] **Steg 3: Lagg till filandelser i `language-detect.ts`**

Lagg till i EXTENSION_MAP:
```typescript
  '.dart': 'dart',
  '.scala': 'scala',
  '.sbt': 'scala',
  '.sc': 'scala',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hxx': 'cpp',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.lua': 'lua',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.hs': 'haskell',
  '.lhs': 'haskell',
  '.r': 'r',
  '.R': 'r',
  '.clj': 'clojure',
  '.cljs': 'clojure',
  '.edn': 'clojure',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.json': 'json',
  'Dockerfile': 'dockerfile',
  '.dockerfile': 'dockerfile',
  '.tf': 'hcl',
  '.tfvars': 'hcl',
```

Obs: `Dockerfile` ar ett filnamn utan andelse. Se hur `language-detect.ts` hanterar inga andelse-filer (troligen via `basename`-check) och lagg till en specialregel om den saknas.

- [ ] **Steg 4: Typecheck**

```
cd packages/core && pnpm typecheck
```

Forvantat: Inga TypeScript-fel. Om `analyzers/index.ts` har exhaustiveness-check (`never`-cast) pa Language-union -- den bor inte det eftersom `default: return unsupportedOutput()` hanterar okanda sprak. Verifiera.

- [ ] **Steg 5: Commit**

```bash
git add packages/core/package.json packages/core/src/types.ts packages/core/src/language-detect.ts
git commit -m "feat(core): install 12 tree-sitter grammars, register 14 new languages in type union and extension map"
```

**Estimat:** 1.5 timmar | **AI-niva:** [Haiku]

---
## Task 2 -- Dart-analyzer (Tier A) [Opus]

**Files:**
- Create: `packages/core/src/analyzers/dart.ts`
- Create: `packages/core/tests/analyzers/dart.test.ts`

Dart har ett unikt AST via `tree-sitter-dart`. Grammar-struktur: `function_signature` + `function_body`, `method_declaration`, `constructor_declaration`. Klasser via `class_definition`. Dart-specifika nodtyper som kravs: `if_element`, `for_element`, `while_statement`, `do_while_statement`, `switch_statement`, `catch_clause`, `conditional_expression`.

Dart ar intressant for Tier A av flera skal: (1) Flutter ar ett massivt ekosystem, (2) Dart har starkt statiskt typsystem med null-safety, (3) asynkron programmering med async/await skapar komplexitetsmonstret som CodeScene-liknande analys fangar val.

- [ ] **Steg 1: Identifiera Dart AST-nodtyper**

Kora ett enkelt Dart-program genom `tree-sitter-dart`-parsern och inspektera AST:

```dart
class AuthService {
  bool validateUser(String username, String password) {
    if (username.isEmpty) return false;
    for (final char in password.split("")) {
      if (char == " ") return false;
    }
    return true;
  }

  Future<String?> fetchToken(String userId) async {
    try {
      final response = await api.get("/tokens/$userId");
      return response.body;
    } catch (e) {
      return null;
    }
  }
}
```

Verifiera att nodtyperna `function_signature`, `class_definition`, `if_statement`, `for_statement`, `catch_clause`, `conditional_expression` finns i grammatiken.

- [ ] **Steg 2: Skriv det failande testet**

```typescript
// packages/core/tests/analyzers/dart.test.ts
import { describe, it, expect } from 'vitest';
import { analyzeDart } from '../../src/analyzers/dart';

const SIMPLE_DART = `
class Calculator {
  int add(int a, int b) => a + b;
  int multiply(int a, int b) {
    return a * b;
  }
}
`;

const COMPLEX_DART = `
bool validate(String s, int limit) {
  if (s.isEmpty) return false;
  for (int i = 0; i < s.length; i++) {
    if (i > limit) break;
    if (s[i] == " ") return false;
  }
  return true;
}
`;

describe('analyzeDart', () => {
  it('detects two functions', () => {
    const { functions } = analyzeDart(SIMPLE_DART);
    expect(functions).toHaveLength(2);
  });

  it('calculates cyclomatic complexity correctly', () => {
    const { functions } = analyzeDart(COMPLEX_DART);
    expect(functions[0].cyclomaticComplexity).toBeGreaterThan(1);
  });

  it('returns smells array', () => {
    const { smells } = analyzeDart(SIMPLE_DART);
    expect(Array.isArray(smells)).toBe(true);
  });

  it('handles empty input gracefully', () => {
    expect(() => analyzeDart("")).not.toThrow();
  });

  it('totalLines matches code', () => {
    const lines = SIMPLE_DART.split("\n").length;
    const { metrics } = analyzeDart(SIMPLE_DART);
    expect(metrics.totalLines).toBe(lines);
  });
});
```

- [ ] **Steg 3: Kora test (FAIL)**

```
cd packages/core && pnpm test -- tests/analyzers/dart.test.ts
```

- [ ] **Steg 4: Implementera `analyzeDart`**

Foljer `java.ts`-mallen exakt. Specifika nodtyper for Dart:

```typescript
const CYCLOMATIC_NODE_TYPES = new Set([
  'if_statement', 'else_clause', 'for_statement', 'for_in_statement',
  'while_statement', 'do_while_statement', 'switch_statement', 'case_clause',
  'catch_clause', 'conditional_expression', 'binary_expression',
]);

const NESTING_NODE_TYPES = new Set([
  'if_statement', 'for_statement', 'for_in_statement',
  'while_statement', 'do_while_statement', 'try_statement',
]);

const METHOD_NODE_TYPES = new Set([
  'function_declaration', 'method_declaration', 'constructor_declaration',
  'function_expression', 'getter_signature', 'setter_signature',
]);
```

Inkludera: `detectSATDFromText`, `detectMagicNumbersFromText`, AST-baserade smells via `dartProfile` (skapa i `language-profile.ts` analog med `javaProfile`).

- [ ] **Steg 5: Kora test (PASS) och commit**

```bash
git add packages/core/src/analyzers/dart.ts packages/core/tests/analyzers/dart.test.ts
git commit -m "feat(core): add Dart Tier A analyzer (cyclomatic complexity, nesting, functions, smells)"
```

**Estimat:** 4 timmar | **AI-niva:** [Opus]

---
## Task 3 -- C/C++-analyzer (Tier A) [Opus]

**Files:**
- Create: `packages/core/src/analyzers/c.ts`
- Create: `packages/core/tests/analyzers/c.test.ts`

C/C++ ar de svaraste Tier A-spraken pa grund av pre-processor-direktiv, pekare, templates och inkludera-grafer. `tree-sitter-c` och `tree-sitter-cpp` ar separata grammar-paket men delar manga nodtyper. Implementera baada i samma analyzer-fil med en `dialect`-parameter.

C/C++-specifika komplexitetsbidragare som saknas i andra sprak:
- `pointer_expression` -- pekare okat inte CC men okar kognitiv komplexitet
- `conditional_expression` (ternary) -- raknas som CC+1
- `goto_statement` -- raknas som CC+2 (svarare att foljia kontrollflode)
- `preprocessor_if`, `preprocessor_ifdef`, `preprocessor_elif` -- text-baserat CC-bidrag

- [ ] **Steg 1: Identifiera nodtyper for C och C++**

```c
// Test-snippet for C
int fibonacci(int n) {
    if (n <= 1) return n;
    int a = 0, b = 1;
    for (int i = 2; i <= n; i++) {
        int temp = a + b;
        a = b;
        b = temp;
    }
    return b;
}
```

```cpp
// Test-snippet for C++
template<typename T>
class Stack {
public:
    void push(T val) { data_.push_back(val); }
    T pop() {
        if (data_.empty()) throw std::runtime_error("empty");
        auto v = data_.back();
        data_.pop_back();
        return v;
    }
private:
    std::vector<T> data_;
};
```

Forvaantade nodtyper: `function_definition` (C och C++), `class_specifier` (C++), `if_statement`, `for_statement`, `while_statement`, `switch_statement`, `case_statement`, `catch_clause`, `conditional_expression`, `goto_statement`.

- [ ] **Steg 2: Skriv det failande testet**

Testa bada dialekterna. Verfiiera: `analyzeC(SIMPLE_C).functions` har ratt antal, `analyzeCpp(SIMPLE_CPP)` hanterar template-klasser, goto-statement bidrar med extra CC, tom input kastar ej, smells-array returneras.

- [ ] **Steg 3: Kora test (FAIL)**

- [ ] **Steg 4: Implementera `c.ts`**

Exportera bade `analyzeC(code, filePath)` och `analyzeCpp(code, filePath)`. Dela CYCLOMATIC_NODE_TYPES och NESTING_NODE_TYPES (daliga overlapp), men ladda ratt grammar-paket (`tree-sitter-c` vs `tree-sitter-cpp`) beroende pa funktion som anropas. `goto_statement` ger +2 till CC (specialfall via extra raknare). Pre-processor-direktiv analyseras text-baserat via regex `/#\s*(if|ifdef|elif)\b/g` och bidrar med +1 CC per rad.

Sprak-profil `cProfile` / `cppProfile` i `language-profile.ts`: C har inga klasser (god_class = N/A), C++ har klasser.

- [ ] **Steg 5: Kora test (PASS) och commit**

```bash
git add packages/core/src/analyzers/c.ts packages/core/tests/analyzers/c.test.ts
git commit -m "feat(core): add C/C++ Tier A analyzer (including goto-CC penalty and preprocessor heuristic)"
```

**Estimat:** 5 timmar | **AI-niva:** [Opus]

---
### Task 4 — Kotlin native analyzer

**Bakgrund:** Kotlin rotas idag till `analyzeJava` i `index.ts`. Det ger fel nodtyper — Kotlins funktioner heter `function_declaration` (inte `method_declaration`), `when_expression` (inte `switch_statement`), och `object_declaration` (Kotlins singleton-konstrukt). En egen analyzer ger korrekt CC och korrekt smell-detektion.

**Testfil:** `packages/core/tests/analyzers/kotlin-native.test.ts`

```typescript
const SIMPLE_FUN = `
fun classify(x: Int): String {
    return when {
        x < 0 -> "negative"
        x == 0 -> "zero"
        else -> "positive"
    }
}
`
const COMPANION = `
class Repo {
    companion object {
        fun create() = Repo()
    }
}
`
it("kaenner igen when-expression som CC-bidrag", () => {
    const r = analyzeKotlin(SIMPLE_FUN)
    expect(r.functions[0].cyclomaticComplexity).toBeGreaterThanOrEqual(3)
})
it("hanterar companion object utan krasch", () => {
    expect(() => analyzeKotlin(COMPANION)).not.toThrow()
})
```

**Nodtyper:**
- Metod-noder: `function_declaration`, `secondary_constructor`, `anonymous_function`
- CC-bidrag: `if_expression`, `when_expression`, `when_entry`, `for_statement`, `while_statement`, `do_while_statement`, `catch_clause`, `Elvis_expression` (`:?`), `binary_expression` (`&&`, `||`)
- Nesting: `if_expression`, `for_statement`, `while_statement`, `when_expression`, `try_catch_expression`

- [ ] **Steg 1: Installera grammar**

```bash
pnpm add -D tree-sitter-kotlin --filter @healthy-code/core
```

- [ ] **Steg 2: Skriv failande test** i `packages/core/tests/analyzers/kotlin-native.test.ts`

- [ ] **Steg 3: Kora test (FAIL)**

- [ ] **Steg 4: Skapa `packages/core/src/analyzers/kotlin.ts`**

Exportera `analyzeKotlin(code, filePath)`. Kopiera strukturen fran `java.ts` men byt ut nodtyperna. `when_entry` ger +1 CC per gren (likt `case_statement`). `Elvis_expression` (`?:`) ger +1 CC. Lagg till `kotlinProfile` i `language-profile.ts`.

- [ ] **Steg 5: Uppdatera `index.ts`** — andra `kotlin` case att anropa `analyzeKotlin` istallet for `analyzeJava`

- [ ] **Steg 6: Kora test (PASS) och commit**

```bash
git add packages/core/src/analyzers/kotlin.ts packages/core/tests/analyzers/kotlin-native.test.ts packages/core/src/analyzers/index.ts
git commit -m "feat(core): introduce native Kotlin analyzer (replaces Java-routing)"
```

**Estimat:** 4 timmar | **AI-niva:** [Sonnet]

---
### Task 5 — Scala Tier A analyzer

**Bakgrund:** Scala ar ett JVM-sprak med Javas objektorientering plus funktionell programmering. `tree-sitter-scala` finns publicerat pa npm. Scalas match-uttryck (ekvivalent med `when` / `switch`) ar ett viktigt CC-bidrag.

**Testfil:** `packages/core/tests/analyzers/scala.test.ts`

```typescript
const MATCH_FUN = `
def grade(score: Int): String = score match {
    case s if s >= 90 => "A"
    case s if s >= 80 => "B"
    case _ => "F"
}
`
it("raeknar match-case som CC", () => {
    const r = analyzeScala(MATCH_FUN)
    expect(r.functions[0].cyclomaticComplexity).toBeGreaterThanOrEqual(3)
})
```

**Nodtyper:**
- Metod-noder: `function_definition`, `function_declaration`
- CC-bidrag: `if_expression`, `match_expression`, `case_clause`, `for_expression`, `while_expression`, `catch_clause`, `binary_expression` (`&&`, `||`)
- Nesting: `if_expression`, `for_expression`, `while_expression`, `match_expression`

- [ ] **Steg 1: Installera grammar**

```bash
pnpm add -D tree-sitter-scala --filter @healthy-code/core
```

- [ ] **Steg 2: Skriv failande test**

- [ ] **Steg 3: Kora test (FAIL)**

- [ ] **Steg 4: Skapa `packages/core/src/analyzers/scala.ts`**

Exportera `analyzeScala(code, filePath)`. Lagg till `scalaProfile` i `language-profile.ts`. Scala har klasser och objekt (GodClass applicerbar).

- [ ] **Steg 5: Kora test (PASS) och commit**

```bash
git add packages/core/src/analyzers/scala.ts packages/core/tests/analyzers/scala.test.ts
git commit -m "feat(core): add Scala Tier A analyzer"
```

**Estimat:** 4 timmar | **AI-niva:** [Sonnet]

---
### Task 6 — Tier B Generic Extractor

**Bakgrund:** For sprak utan publicerat tree-sitter-npm-paket (Bash, Lua, Elixir, Haskell, R, Clojure) skapas en generisk text-baserad extractor. Den raeknar rader, identifierar funktionsliknande block via regexer, ger CC = antal kontrollflodes-nokkelord + 1, och korer text-baserade smells (SATD, MagicNumber). Resultat exporteras som `AnalyzerOutput` precis som AST-baserade analyzers.

**Fil:** `packages/core/src/analyzers/generic-tier-b.ts`

```typescript
export interface TierBConfig {
  language: string
  functionPatterns: RegExp[]   // matchar funktionsdefinitioner
  controlFlowKeywords: RegExp  // raeknare for CC
  commentPrefix: string        // for doc-coverage heuristik
}

export function analyzeGenericTierB(
  code: string,
  filePath: string,
  config: TierBConfig
): AnalyzerOutput {
  const lines = code.split("\n")
  const functions = extractFunctionsTierB(lines, config)
  const smells = [
    ...detectSATDFromText(code),
    ...detectMagicNumbersFromText(code, filePath),
  ]
  return { functions, smells, metrics: buildSimpleMetrics(functions, lines.length) }
}
```

`extractFunctionsTierB` skannar raderna med `config.functionPatterns`, estimerar funktion-slut via indragsniva eller naesta matchning, raeknar CC via `config.controlFlowKeywords`.

- [ ] **Steg 1: Skriv failande test** for `analyzeGenericTierB` med en Bash-liknande config

```typescript
const BASH_CONFIG: TierBConfig = {
  language: "bash",
  functionPatterns: [/^\s*(\w+)\s*\(\s*\)\s*\{/m, /^\s*function\s+\w+/m],
  controlFlowKeywords: /\b(if|elif|while|for|until|case)\b/g,
  commentPrefix: "#",
}
it("extraherar Bash-funktion", () => {
    const code = "foo() {\n  if [ $x -gt 0 ]; then\n    echo hi\n  fi\n}"
    const r = analyzeGenericTierB(code, "foo.sh", BASH_CONFIG)
    expect(r.functions).toHaveLength(1)
    expect(r.functions[0].cyclomaticComplexity).toBe(2)
})
```

- [ ] **Steg 2: Kora test (FAIL)**

- [ ] **Steg 3: Implementera `generic-tier-b.ts`**

- [ ] **Steg 4: Kora test (PASS) och commit**

```bash
git add packages/core/src/analyzers/generic-tier-b.ts packages/core/tests/analyzers/generic-tier-b.test.ts
git commit -m "feat(core): add generic Tier B extractor for text-based language analyzers"
```

**Estimat:** 5 timmar | **AI-niva:** [Sonnet]

---
### Task 7 — Bash analyzer (Tier B)

**Bakgrund:** Shell-skript ar vanliga i DevOps-projekt och kan innehalla komplex logik. Bash-specifika konstruktioner: `if/elif/else/fi`, `for/do/done`, `while/until`, `case/esac`, `&&` och `||` i kommandokedjor.

**Fil:** `packages/core/src/analyzers/bash.ts`

**Config:**
```typescript
const BASH_CONFIG: TierBConfig = {
  language: "bash",
  functionPatterns: [
    /^(\w[\w:-]*)\s*\(\s*\)\s*\{/m,
    /^\s*function\s+(\w+)/m,
  ],
  controlFlowKeywords: /\b(if|elif|while|for|until|case)\b|\s&&\s|\s\|\|\s/g,
  commentPrefix: "#",
}
export const analyzeBash = (code: string, filePath = "<inline>") =>
  analyzeGenericTierB(code, filePath, BASH_CONFIG)
```

- [ ] **Steg 1: Skriv failande test** med `if/elif/case` och verifiera CC, funktions-laengd, SATD-detektion

- [ ] **Steg 2: Kora test (FAIL)**

- [ ] **Steg 3: Skapa `bash.ts`** med ovan config

- [ ] **Steg 4: Kora test (PASS) och commit**

```bash
git add packages/core/src/analyzers/bash.ts packages/core/tests/analyzers/bash.test.ts
git commit -m "feat(core): add Bash Tier B analyzer"
```

**Estimat:** 2 timmar | **AI-niva:** [Haiku]

---
### Task 8 — Lua analyzer (Tier B)

**Bakgrund:** Lua anvands i spel (Roblox, Love2D), embeddade system och som skript-sprak i applikationer (Redis, Nginx, Neovim). Lua-funktioner definieras med `function name()` eller `local function name()` eller som tabell-varden `obj.method = function()`.

**Config:**
```typescript
const LUA_CONFIG: TierBConfig = {
  language: "lua",
  functionPatterns: [
    /^\s*(?:local\s+)?function\s+(\w[\w.]*)\s*\(/
    /^\s*(\w[\w.]*)\s*=\s*function\s*\(/
  ],
  controlFlowKeywords: /\b(if|elseif|while|repeat|for)\b/g,
  commentPrefix: "--",
}
```

- [ ] **Steg 1: Skriv failande test** med naestad if och repeat-until, verifiera CC >= 2

- [ ] **Steg 2: Kora test (FAIL)**

- [ ] **Steg 3: Skapa `lua.ts`**

- [ ] **Steg 4: Kora test (PASS) och commit**

```bash
git add packages/core/src/analyzers/lua.ts packages/core/tests/analyzers/lua.test.ts
git commit -m "feat(core): add Lua Tier B analyzer"
```

**Estimat:** 2 timmar | **AI-niva:** [Haiku]

---
### Task 9 — Elixir analyzer (Tier B)

**Bakgrund:** Elixir ar ett funktionellt sprak pa BEAM (Erlang VM). Funktioner definieras med `def name` och `defp name` (privat). Pattern-matching med multiple function clauses ger CC-bidrag. Elixir saknar traditionella loopar; `cond`, `case`, `if` och `with` ger kontrollflode.

**Config:**
```typescript
const ELIXIR_CONFIG: TierBConfig = {
  language: "elixir",
  functionPatterns: [
    /^\s*def(?:p)?\s+(\w+[\w?!]*)/
  ],
  controlFlowKeywords: /\b(if|unless|cond|case|with|receive)\b/g,
  commentPrefix: "#",
}
```

Fler function clauses av samma namn raeknas som +1 CC vardera (text-rakning: om naesta `def name` ar samma namn, inkrement).

- [ ] **Steg 1: Skriv failande test** med `case` och `cond`, kontrollera CC

- [ ] **Steg 2: Kora test (FAIL)**

- [ ] **Steg 3: Skapa `elixir.ts`**

- [ ] **Steg 4: Kora test (PASS) och commit**

```bash
git add packages/core/src/analyzers/elixir.ts packages/core/tests/analyzers/elixir.test.ts
git commit -m "feat(core): add Elixir Tier B analyzer"
```

**Estimat:** 2 timmar | **AI-niva:** [Haiku]

---
### Task 10 — Haskell analyzer (Tier B)

**Bakgrund:** Haskell ar ett rent funktionellt sprak med starka typer. Funktioner definieras pa toppniva utan indrag: `functionName arg1 arg2 = ...`. Kontrollflode sker via guards (`| condition = expr`), `case expr of`, `if then else` och `where`-klausuler.

**Config:**
```typescript
const HASKELL_CONFIG: TierBConfig = {
  language: "haskell",
  functionPatterns: [
    /^(\w+[\w']*)\s+(?:[A-Za-z_][\w']*\s+)*=/
  ],
  controlFlowKeywords: /\b(if|case|guard|where|let|do)\b|\|\s/g,
  commentPrefix: "--",
}
```

Guard-rader (`| condition = result`) raeknas som +1 CC per guard.

- [ ] **Steg 1: Skriv failande test** med guard-funktioner och `case of`

- [ ] **Steg 2: Kora test (FAIL)**

- [ ] **Steg 3: Skapa `haskell.ts`**

- [ ] **Steg 4: Kora test (PASS) och commit**

```bash
git add packages/core/src/analyzers/haskell.ts packages/core/tests/analyzers/haskell.test.ts
git commit -m "feat(core): add Haskell Tier B analyzer"
```

**Estimat:** 2 timmar | **AI-niva:** [Haiku]

---
### Task 11 — R och Clojure analyzers (Tier B)

**Bakgrund:** Tva sprak med fundamentalt olika syntax. R ar vanligt i data science; Clojure ar ett Lisp-dialekt pa JVM. Bada kan hanteras med Tier B text-extraktion.

**R-config:**
```typescript
const R_CONFIG: TierBConfig = {
  language: "r",
  functionPatterns: [/^(\w+)\s*<-\s*function\s*\(/, /^(\w+)\s*=\s*function\s*\(/],
  controlFlowKeywords: /\b(if|else|for|while|repeat|switch)\b/g,
  commentPrefix: "#",
}
```

**Clojure-config:**
```typescript
const CLOJURE_CONFIG: TierBConfig = {
  language: "clojure",
  functionPatterns: [/\(defn-?\s+(\w[\w!?-*+.]*)/],
  controlFlowKeywords: /\b(if|when|cond|case|loop|doseq|dotimes)\b/g,
  commentPrefix: ";",
}
```

- [ ] **Steg 1: Skriv failande test for R** (`analyzeR`) och for Clojure (`analyzeClojure`)

- [ ] **Steg 2: Kora tester (FAIL)**

- [ ] **Steg 3: Skapa `r.ts` och `clojure.ts`**

Bada ar tunna wrappers runt `analyzeGenericTierB` med respektive config.

- [ ] **Steg 4: Kora tester (PASS) och commit**

```bash
git add packages/core/src/analyzers/r.ts packages/core/src/analyzers/clojure.ts packages/core/tests/analyzers/r.test.ts packages/core/tests/analyzers/clojure.test.ts
git commit -m "feat(core): add R and Clojure Tier B analyzers"
```

**Estimat:** 3 timmar | **AI-niva:** [Haiku]

---
### Task 12 — Tier C Structural analyzer

**Bakgrund:** For sprak dar varken tree-sitter-grammar finns eller text-baserad funktionsextraktion aer meningsfull (YAML, JSON, TOML, HCL, Dockerfile, Makefile, SQL, Markdown, HTML, CSS) skapas en minimal Tier C analyzer. Den returnerar enbart fil-niva metrics: totalLines, duplicationScore (via befintlig algoritm), SATD-smells. Inga `functions`.

**Fil:** `packages/core/src/analyzers/structural-tier-c.ts`

```typescript
export function analyzeStructuralTierC(
  code: string,
  filePath: string
): AnalyzerOutput {
  const lines = code.split("\n")
  const smells = detectSATDFromText(code)
  return {
    functions: [],
    smells,
    metrics: {
      cyclomaticComplexity: 1,
      cognitiveComplexity: 0,
      maxNestingDepth: 0,
      avgFunctionLength: 0,
      maxFunctionLength: 0,
      avgParameterCount: 0,
      maxParameterCount: 0,
      totalLines: lines.length,
      duplicationScore: 0,
    },
  }
}
```

Tier C-sprak ska ocksa returnera `LargeFile`-smell om totalLines > 500 (konfigurerbart via `LARGE_FILE_THRESHOLD`).

- [ ] **Steg 1: Skriv failande test** — verifiera att tom funktionslista returneras, att SATD hittas, att LargeFile-smell triggras vid 501 rader

- [ ] **Steg 2: Kora test (FAIL)**

- [ ] **Steg 3: Implementera `structural-tier-c.ts`**

- [ ] **Steg 4: Kora test (PASS) och commit**

```bash
git add packages/core/src/analyzers/structural-tier-c.ts packages/core/tests/analyzers/structural-tier-c.test.ts
git commit -m "feat(core): add Tier C structural analyzer for config/data languages"
```

**Estimat:** 3 timmar | **AI-niva:** [Sonnet]

---
### Task 13 — YAML, JSON, Dockerfile, HCL och Makefile analyzers (Tier C)

**Bakgrund:** Infra-as-Code filer ar viktiga att inkludera i Code Health-rapporten. Dessa filer har inga funktioner men kan vara stora, innehalla SATD-kommentarer och uppvisa duplicering. Alla anvander `analyzeStructuralTierC`.

**Filer att skapa:**
```
packages/core/src/analyzers/yaml.ts
packages/core/src/analyzers/json-lang.ts   (json aer reserverat ord)
packages/core/src/analyzers/dockerfile.ts
packages/core/src/analyzers/hcl.ts         (Terraform)
packages/core/src/analyzers/makefile.ts
```

Varje fil exporterar en named function, t.ex.:
```typescript
// yaml.ts
export const analyzeYaml = (code: string, filePath = "<inline>") =>
  analyzeStructuralTierC(code, filePath)
```

Dockerfile fa extra check: om filen innehaller `RUN ... &&` pa fler an 5 rader flaggas en `ComplexMethod`-liknande smell med typen `ComplexDockerLayer`.

- [ ] **Steg 1: Skriv failande tester** — ett per sprak, verifiera `functions.length === 0` och att SATD hittas

- [ ] **Steg 2: Kora tester (FAIL)**

- [ ] **Steg 3: Skapa alla fem analyzer-filer**

- [ ] **Steg 4: Kora tester (PASS) och commit**

```bash
git add packages/core/src/analyzers/yaml.ts packages/core/src/analyzers/json-lang.ts packages/core/src/analyzers/dockerfile.ts packages/core/src/analyzers/hcl.ts packages/core/src/analyzers/makefile.ts packages/core/tests/analyzers/tier-c-langs.test.ts
git commit -m "feat(core): add YAML/JSON/Dockerfile/HCL/Makefile Tier C analyzers"
```

**Estimat:** 3 timmar | **AI-niva:** [Haiku]

---
### Task 14 — Wire alla nya analyzers i `index.ts`

**Bakgrund:** `analyzeByLanguage` i `packages/core/src/analyzers/index.ts` maste uppdateras med 19 nya case-grenar. Samtidigt maste `Language`-typen i `packages/core/src/types.ts` utvidgas med alla nya sprak-identifierare.

**Sprak att lagga till i `Language`-typen:**
```typescript
export type Language =
  | "typescript" | "javascript"
  | "python" | "java" | "kotlin" | "csharp"
  | "go" | "rust" | "php" | "ruby" | "swift"
  // Tier A nya
  | "dart" | "c" | "cpp" | "scala"
  // Tier B nya
  | "bash" | "lua" | "elixir" | "haskell" | "r" | "clojure"
  // Tier C
  | "yaml" | "json" | "dockerfile" | "hcl" | "makefile"
  | "sql" | "html" | "css" | "markdown" | "toml"
  | "unknown"
```

**Switch-grenar att lagga till i `analyzeByLanguage`:**
```typescript
case "dart": return analyzeDart(code, filePath)
case "c":    return analyzeC(code, filePath)
case "cpp":  return analyzeCpp(code, filePath)
case "scala": return analyzeScala(code, filePath)
case "bash": return analyzeBash(code, filePath)
case "lua":  return analyzeLua(code, filePath)
case "elixir": return analyzeElixir(code, filePath)
case "haskell": return analyzeHaskell(code, filePath)
case "r":    return analyzeR(code, filePath)
case "clojure": return analyzeClojure(code, filePath)
case "yaml": return analyzeYaml(code, filePath)
case "json": return analyzeJson(code, filePath)
case "dockerfile": return analyzeDockerfile(code, filePath)
case "hcl":  return analyzeHcl(code, filePath)
case "makefile": return analyzeMakefile(code, filePath)
case "sql": case "html": case "css":
case "markdown": case "toml":
  return analyzeStructuralTierC(code, filePath)
```

**`EXTENSION_MAP`** i `packages/core/src/language-detector.ts` maste ocksa uppdateras med extensioner for alla nya sprak.

- [ ] **Steg 1: Uppdatera `Language`-typen** i `types.ts`

- [ ] **Steg 2: Uppdatera `EXTENSION_MAP`** i `language-detector.ts` med nya extensioner

- [ ] **Steg 3: Uppdatera `analyzeByLanguage`** i `index.ts` med alla nya case-grenar och imports

- [ ] **Steg 4: Kora hela testsviiten** — `pnpm --filter @healthy-code/core test`

- [ ] **Steg 5: Commit**

```bash
git add packages/core/src/analyzers/index.ts packages/core/src/types.ts packages/core/src/language-detector.ts
git commit -m "feat(core): wire all Sprint 25 analyzers into analyzeByLanguage dispatch"
```

**Estimat:** 3 timmar | **AI-niva:** [Sonnet]

---
### Task 15 — Uppdatera `language-coverage-matrix.md`

**Bakgrund:** Dokumentet `docs/language-coverage-matrix.md` visar per-sprak biomarker-tackning. Sprint 25 laegger till 19 nya sprak-kolumner och 1 ny AI-Readiness-rad (fran Sprint 24). Matrisen maste uppdateras sa att nasta sprint-team har korrekt bild av tillstandet.

**Andring:**
1. Lagg till kolumner: `Dart | C | C++ | Scala | Bash | Lua | Elixir | Haskell | R | Clojure | YAML | JSON | Dockerfile | HCL | Makefile | SQL | HTML | CSS | MD | TOML`
2. Lagg till rad `AiReadiness` med `✓` for alla sprak (beraeknas av `computeAiReadiness` i Sprint 24)
3. Uppdatera Tier A-raden for Dart, C, C++, Scala med korrekt tackning
4. Uppdatera Tier B-raden for Bash, Lua, Elixir, Haskell, R, Clojure
5. Tier C-kolumner far `–` for de flesta biomarkers, `✓` for LargeFile och SATD
6. Uppdatera Coverage-procentsatser langst ner
7. Uppdatera Notes-sektionen med forklaring av Tier C och nya sprak

- [ ] **Steg 1: Oppna matrisen** och lagg till alla nya kolumner

- [ ] **Steg 2: Lagg till AiReadiness-rad** (beror pa Sprint 24)

- [ ] **Steg 3: Fyll i raett symbol** for varje (sprak, biomarker)-par baserat pa Task 2-13 ovan

- [ ] **Steg 4: Uppdatera Notes-sektionen**

- [ ] **Steg 5: Commit**

```bash
git add docs/language-coverage-matrix.md
git commit -m "docs: update language coverage matrix for Sprint 25 (30 languages)"
```

**Estimat:** 2 timmar | **AI-niva:** [Haiku]

---
### Task 16 — Uppdatera README och MCP-verktygs-dokumentation

**Bakgrund:** Projektets README listar stodda sprak. MCP-verktygets schema-dokument listar giltiga `language`-varden for `code_health` och relaterade verktyg. Bada maste uppdateras.

**Andring i README:**
- Uppdatera "Supported Languages" till 30 sprak
- Lagg till tier-forklaring: "Tier A = full AST-analys, Tier B = text-baserad extraktion, Tier C = strukturell analys"
- Uppdatera badges/statistik om sadana finns

**Andring i MCP-schema:**
Filen `packages/mcp-server/src/server.ts` beskriver tillgangliga verktyg och deras parameter-schema. `language`-parametern i `code_health`-verktyget behover uppdaterad enum-lista med alla 30 sprak-identifierare.

- [ ] **Steg 1: Uppdatera README.md** med ny spraklista och tier-beskrivning

- [ ] **Steg 2: Uppdatera language enum** i `packages/mcp-server/src/server.ts`

- [ ] **Steg 3: Kontrollera att MCP-servern bygger** — `pnpm --filter @healthy-code/mcp-server build`

- [ ] **Steg 4: Commit**

```bash
git add README.md packages/mcp-server/src/server.ts
git commit -m "docs: update README and MCP schema to reflect 30-language support"
```

**Estimat:** 1 timme | **AI-niva:** [Haiku]

---
### Task 17 — Integration-testsuite for sprakdispatchen

**Bakgrund:** En integrations-test verifierar att `analyzeByLanguage(code, lang)` fungerar korrekt for alla 30 sprak utan att krascha och returnerar ett giltigt `AnalyzerOutput`-objekt. Testet ger snabb regression-sakring nar nya sprak laggs till i framtiden.

**Testfil:** `packages/core/tests/analyzers/all-languages-integration.test.ts`

```typescript
import { analyzeByLanguage } from "../../src/analyzers/index"
import type { Language } from "../../src/types"

const HELLO_SNIPPETS: Record<Language, string> = {
  typescript: "function hello(): string { return 'hi' }  ",
  javascript: "function hello() { return 'hi' }",
  python:     "def hello():\n    return 'hi'",
  java:       "class A { String hello() { return \\"hi\\"; } }",
  kotlin:     "fun hello(): String { return \\"hi\\" }",
  csharp:     "class A { string Hello() { return \\"hi\\"; } }",
  go:         "func hello() string { return \\"hi\\" }",
  rust:       "fn hello() -> &'static str { \\"hi\\" }",
  dart:       "String hello() { return 'hi'; }",
  c:          "char* hello() { return \\"hi\\"; }",
  cpp:        "std::string hello() { return \\"hi\\"; }",
  scala:      "def hello: String = \\"hi\\"",
  bash:       "hello() { echo hi; }",
  lua:        "function hello() return 'hi' end",
  elixir:     "def hello, do: \\"hi\\"",
  haskell:    "hello = \\"hi\\"",
  r:          "hello <- function() 'hi'",
  clojure:    "(defn hello [] \\"hi\\")",
  yaml:       "key: value",
  json:       "{\\"key\\": \\"value\\"}",
  dockerfile: "FROM ubuntu:22.04",
  hcl:        "resource \\"null_resource\\" \\"test\\" {}",
  makefile:   "build:\n\techo done",
  sql:        "SELECT 1",
  html:       "<p>hello</p>",
  css:        "body { color: red; }",
  markdown:   "# Hello",
  toml:       "[section]\nkey = \\"value\\"",
  php:        "<?php function hello() { return 'hi'; }",
  ruby:       "def hello\n  'hi'\nend",
  swift:      "func hello() -> String { return \\"hi\\" }",
  unknown:    "",
}

describe("analyzeByLanguage — alla 30 sprak", () => {
  for (const [lang, code] of Object.entries(HELLO_SNIPPETS) as [Language, string][]) {
    it(`${lang}: returnerar giltig AnalyzerOutput`, () => {
      const result = analyzeByLanguage(code, lang, `hello.${lang}`)
      expect(result).toHaveProperty("functions")
      expect(result).toHaveProperty("smells")
      expect(result).toHaveProperty("metrics")
      expect(Array.isArray(result.functions)).toBe(true)
      expect(Array.isArray(result.smells)).toBe(true)
      expect(result.metrics.totalLines).toBeGreaterThanOrEqual(1)
    })
  }
})
```

- [ ] **Steg 1: Skapa testfilen** ovan

- [ ] **Steg 2: Kora integrationstestet** — `pnpm --filter @healthy-code/core test all-languages-integration`

- [ ] **Steg 3: Fixa eventuella fel** fran enskilda analyzers

- [ ] **Steg 4: Kora hela sviten** — `pnpm --filter @healthy-code/core test`

- [ ] **Steg 5: Commit**

```bash
git add packages/core/tests/analyzers/all-languages-integration.test.ts
git commit -m "test(core): add integration test covering all 30 languages in analyzeByLanguage"
```

**Estimat:** 3 timmar | **AI-niva:** [Sonnet]

---
## Testkrav

| # | Test | Acceptansvillkor |
|---|------|-----------------|
| T1 | Dart Tier A: `analyzeByLanguage(code, "dart")` | `functions.length >= 1`, CC korrekt, smells array returneras |
| T2 | Dart CC: `if` + `else if` ger CC >= 3 | Verifierat i `dart.test.ts` |
| T3 | C Tier A: `goto`-statement ger +2 CC | Verifierat i `c.test.ts` |
| T4 | C++ Tier A: template-klass parsas utan krasch | Verifierat i `c.test.ts` |
| T5 | C preprocessor: `#ifdef` raeknas som CC | Verifierat i `c.test.ts` |
| T6 | Kotlin native: `when` ger CC-bidrag | Verifierat i `kotlin-native.test.ts` |
| T7 | Kotlin native: `companion object` parsas korrekt | Verifierat i `kotlin-native.test.ts` |
| T8 | Scala: `match`-case ger CC per gren | Verifierat i `scala.test.ts` |
| T9 | Tier B Generic: funktion extraheras, CC raeknas | Verifierat i `generic-tier-b.test.ts` |
| T10 | Bash: `if/elif/case` ger korrekt CC | Verifierat i `bash.test.ts` |
| T11 | Lua: `function` extraheras, `repeat` ger CC | Verifierat i `lua.test.ts` |
| T12 | Elixir: `case`/`cond` ger CC-bidrag | Verifierat i `elixir.test.ts` |
| T13 | Haskell: guards ger CC per gren | Verifierat i `haskell.test.ts` |
| T14 | R: `function()`-assignment extraheras | Verifierat i `r.test.ts` |
| T15 | Clojure: `defn` extraheras, `cond` ger CC | Verifierat i `clojure.test.ts` |
| T16 | Tier C: `functions.length === 0`, LargeFile vid > 500 rader | Verifierat i `structural-tier-c.test.ts` |
| T17 | Dockerfile: `ComplexDockerLayer`-smell vid > 5 RUN-rader | Verifierat i `tier-c-langs.test.ts` |
| T18 | Integration: alla 30 sprak returnerar giltig `AnalyzerOutput` | Verifierat i `all-languages-integration.test.ts` |
| T19 | SATD detekteras i alla Tier B och Tier C sprak | Verifierat i respektive testfil |
| T20 | `analyzeByLanguage` krasar ej pa tom strang for alla sprak | Verifierat i integrations-testet |

## Definition of Done

- [ ] Alla 17 tasks har grona tester (`pnpm --filter @healthy-code/core test` passerar utan fel)
- [ ] Integrationstestet `all-languages-integration.test.ts` passerar for samtliga 30 sprak
- [ ] `analyzeByLanguage` har case-grenar for alla 30 sprak-identifierare
- [ ] `Language`-typen i `types.ts` innehaller alla 30 identifierare
- [ ] `EXTENSION_MAP` i `language-detector.ts` matar alla nya filextensioner till ratt sprak
- [ ] Dart Tier A: CC och smells fungerar korrekt
- [ ] C/C++ Tier A: goto-CC-bonus (+2) och preprocessor-heuristik implementerade
- [ ] Kotlin native: `when_expression` och `companion object` hanteras korrekt
- [ ] Scala Tier A: `match`-case ger CC-bidrag
- [ ] `generic-tier-b.ts` extraherar funktioner och CC via konfigurerbar regex
- [ ] Bash, Lua, Elixir, Haskell, R, Clojure har TierB-analyzers som anvaender generic-extractor
- [ ] Tier C: YAML, JSON, Dockerfile, HCL, Makefile, SQL, HTML, CSS, Markdown, TOML returnerar `functions: []` och korrekt `metrics.totalLines`
- [ ] `language-coverage-matrix.md` uppvisar 30 sprak-kolumner med korrekt tackning per biomarker
- [ ] README.md listar alla 30 sprak med tier-information
- [ ] MCP-serverns `language`-enum innehaller alla 30 identifierare
- [ ] Inga TypeScript-kompileringsfel: `pnpm --filter @healthy-code/core tsc --noEmit` ger 0 fel
- [ ] Inga regressions: befintliga 11-sprak-tester fortsatter att passa

## Risker

| Risk | Sannolikhet | Paverkan | Mitigation |
|------|-------------|----------|------------|
| tree-sitter-dart saknas pa npm | Medel | Hog | Kolla npm fore sprint-start; alternativt bygg Dart som Tier B |
| tree-sitter-scala API bryter mot nuvarande tree-sitter version | Lag | Medel | Testa grammar-paketet i isolerat PoC fore full implementation |
| Kotlin native-analyzer bryter befintliga Kotlin-tester | Medel | Hog | Behall Java-routing som fallback; lagg Kotlin-native bakom feature-flag tills testerna ar grana |
| Tier B Generic Extractor hanterar inte flerradiga funktioner korrekt | Medel | Medel | Begraensa scope: funktionslaengd estimeras till naesta funktions start, inte exakt slut |
| `EXTENSION_MAP` har kollisioner (t.ex. `.h` for C vs C++) | Lag | Lag | `.h` -> `c`; `.hpp` -> `cpp`; dokumentera i Notes-sektionen |
| Integrationstestet ar for beroende av specifika nodtyper | Lag | Lag | Testet verifierar bara form (`functions`, `smells`, `metrics`), inte vaerden |
| tree-sitter-c och tree-sitter-cpp laggs som dubbla parsers med hog memory | Lag | Medel | Skapa en parser per grammar och cache:a dem som modulniva konstanter |
| HTML/CSS/Markdown Tier C returnerar for lite information | Lag | Lag | Accepterat i denna sprint; Tier B for dessa ar future-sprint-arbete |

## Performance

**Malvarden:**
- `analyzeByLanguage` for ett Tier A-sprak (Dart, C, C++, Scala): < 50 ms for en 500-raders fil
- `analyzeByLanguage` for ett Tier B-sprak: < 5 ms for en 500-raders fil (ingen AST-parsning)
- `analyzeByLanguage` for ett Tier C-sprak: < 2 ms for en 500-raders fil
- `all-languages-integration.test.ts` (30 filer a 1-5 rader): < 2 sekunder totalt

**Parser-caching:** Varje tree-sitter-grammar initieras en gang som en modulniva konstant. Inga `new Parser()` inuti analysisfunktioner.

**Memory:** Tier B och Tier C anvander inga AST-noder i minnet; endast string-operationer. Tier A-parsers anvander tree-sitters inbyggda GC.

## Begraensningar och kanda brister

- **Dart `async`/`await` och extension methods** utanfor funktionskropp hanteras ej av CC-raknaren i Sprint 25. Future sprint kan lagga dessa som CC-bidrag.
- **C++ templates med komplex syntax** (variadic templates, template specializations) kan ge parser-varningar i tree-sitter. Dessa ignoreras tyst i Sprint 25.
- **Kotlin coroutines** (`suspend fun`, `launch`, `async`) hanteras som vanliga funktioner i Sprint 25. Korrekta CC-bidrag fran suspension points aer future-sprint-arbete.
- **Tier B funktionsgranser** detekteras via naesta funktionsstart, inte exakt slut. Funktionslaengder kan overestimeras i tatbefolkade skript.
- **HTML/CSS** Tier C returnerar `totalLines` och SATD men ingen annan information. Full Tier B for dessa (CSS specificity, HTML nesting depth) ar future-sprint.
- **Makefile-syntax** aer komplicerad (phony targets, pattern rules). Sprint 25 behandlar Makefiles som ren text; inga targets identifieras som "funktioner".

## Sjalvgranskning mot spec

| Krav | Status |
|------|--------|
| 17 tasks med nummer, titel, beskrivning, acceptanskriterier, estimat, AI-niva | Uppfyllt |
| Syfte, Bakgrund, Teknisk design, Tasks, Testkrav, DoD, Risker | Uppfyllt |
| Minst 400 rader | Uppfyllt (> 700 rader) |
| Kod i konkreta kodblock | Uppfyllt — AST-nodtyper, configs, testfragment |
| Git commit-kommandon per task | Uppfyllt |
| Checkbox-steg per task | Uppfyllt |
| Svenska, tekniska termer pa engelska | Uppfyllt |
| Tier A/B/C-motivering | Uppfyllt i Bakgrund + filoverblick |
| Kotlin native motivation | Uppfyllt i Task 4 |
| Integrations-test for alla 30 sprak | Uppfyllt (Task 17) |
