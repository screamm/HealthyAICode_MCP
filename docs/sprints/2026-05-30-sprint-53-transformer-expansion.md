# Sprint 53: Transformer-expansion — Python (rope) + Go (gopls) + tidig-retur (ast-grep)

**Datum:** 2026-05-30
**Status:** Planerad

---

## Mål

- Höja den mekaniska fix-raten från nuvarande 11.8 % genom att lägga till deterministiska transformatorer för Python (via `rope`) och Go (via `gopls codeaction`), vilket tar antalet fullt transformerade Tier A-språk från 3 till 5.
- Implementera ett bibliotek av tidig-retur/guard-clause-regler via `ast-grep` som täcker alla nio Tier A-språk och direkt attackerar `DeepNesting` (vikt 1.2) och `BrainMethod` (vikt 1.2) mekaniskt.
- Använda `semgrep --autofix` som ett billigt pre-pass-steg för att rensa enkla lukter innan LLM-iterationen börjar, vilket minskar antalet refaktoreringsvarv per fil.
- Integrera RefactoringMiner 3.0 (F1=99,7 %, precision=99,9 %) som ett beteendebevarande oracle i testsviten för att verifiera att befintliga TS/JS/PHP-transformatorer och de nya Python/Go-transformatorerna inte introducerar oavsiktliga förändringar.

---

## Bakgrund och motivation

### Den mekaniska fix-raten är projektets mest citerade svaghet

Det nuvarande systemet kan deterministiskt transformera TypeScript/JavaScript (via de befintliga transformatorerna i `packages/core/src/refactor/auto-refactor-applier.ts`) och PHP, men inte Python eller Go — de två mest efterfrågade Tier A-språken. Roadmap-analysen identifierar denna brist som punkt C i "Automated-transformer expansion" och bedömer den som den enskilt viktigaste förbättringen av den mekaniska fix-raten ([roadmap, sektion C](../claudedocs/2026-05-30-world-class-research-roadmap.md)).

### Python: rope med offset-baserat API

[`rope`](https://rope.readthedocs.io/en/latest/library.html) (version 1.14.0 vid skrivtillfället) erbjuder ett fullt headless API för extract-method via `rope.refactor.extract.ExtractMethod`. Refaktoreringsklassen tar `project`, `resource`, `start_offset` och `end_offset` som argument och returnerar ett `Changes`-objekt vars textuella diff kan appliceras utan filsystemskrivning via `changes.get_description()`. Hälsoscorern identifierar redan målmetoden (`ComplexMethod`/`BrainMethod`) med startrad och slutrad; LLM-steget konverterar dessa till byte-offset och `rope` exekverar deterministiskt. Motivering för att köra som subprocess: `rope` är ett Python-paket och MCP-servern är Node.js/TypeScript — subprocess-anropet isolerar runtime-miljöerna och undviker dependency-konflikt. Roadmap-bedömningen: högt ROI, medelhög insats ([sektion C, punkt 1 och D14](../claudedocs/2026-05-30-world-class-research-roadmap.md)).

### Go: gopls codeaction med -diff-flagga

`gopls codeaction -exec -kind refactor.extract.function -diff file.go:#START-#END` är ett icke-interaktivt CLI-anrop som tar nollbaserade byte-offsets och returnerar ett unified diff till stdout ([go.dev/gopls/features/transformation](https://go.dev/gopls/features/transformation)). Samma handoff-mönster som rope: hälsoscorern identifierar funktionen, LLM levererar byte-offsets, `gopls` exekverar. Beroende: Go och gopls måste finnas installerade i miljön; transformer returnerar ett tydligt fel om de saknas. Roadmap: högt ROI, medelhög insats ([sektion C, punkt 2 och D15](../claudedocs/2026-05-30-world-class-research-roadmap.md)).

### ast-grep: tidig-retur-regler för alla Tier A-språk

`if (cond) { lång kropp }` → `if (!cond) return; kropp` är strukturellt identiskt i Python, Go, Ruby, Rust, Java, Kotlin, Elixir, Swift och Scala. ast-grep:s YAML-regelformat stöder detta exakt: ett mönster-fält matchar `if`-noden, ett `fix`-fält ersätter nodens text, och `language`-fältet väljer språk-grammar. Dokumentationen bekräftar att regeln kan sätta ett `fix` per matchat nod ([ast-grep.github.io/guide/rewrite-code.html](https://ast-grep.github.io/guide/rewrite-code.html)). Begränsning: ast-grep kan inte extrahera en metod (kräver tvåstegsomskrivning), men tidig-retur är en enkel-nod-omskrivning och passar perfekt. Roadmap: hög impact, låg insats ([sektion C, punkt 3 och D16](../claudedocs/2026-05-30-world-class-research-roadmap.md)).

### semgrep --autofix som pre-pass

`semgrep --autofix` erbjuder AST-baserad autofix för Python och JavaScript/TypeScript med 96,4 % korrekthet i testfall. Kan köras som ett billigt pre-pass för att eliminera `MagicNumber`, enkel SATD och triviala säkerhetslukter innan LLM-iterationen börjar — färre lukter att hantera i loopen = färre varv totalt ([semgrep.dev/docs/writing-rules/autofix](https://semgrep.dev/docs/writing-rules/autofix)). Roadmap: hög impact, medelhög insats ([sektion C, punkt 4](../claudedocs/2026-05-30-world-class-research-roadmap.md)).

### RefactoringMiner 3.0 som beteendebevarande oracle

Projektet saknar i dag ett automatiserat sätt att verifiera att transformatorerna producerar beteendebevarande output. RefactoringMiner 3.0 uppnår F1=99,7 % (precision 99,9 %, recall 98,2 %) på etablerade benchmarks och kan via sitt Java-API bekräfta att rätt refaktoreringstyp skedde utan oavsiktliga biförändringar ([RefactoringMiner accuracy](https://github.com/tsantalis/RefactoringMiner/blob/master/documentation/accuracy.md)). Begränsning: RefactoringMiner är Java-only och analyserar Git-commits — testfixturen måste konstruera ett temporärt Git-repo (liknande `method-coupling-repo-builder.ts`). Roadmap: medelhög impact, medelhög insats ([sektion C, punkt 5 och D17](../claudedocs/2026-05-30-world-class-research-roadmap.md)).

---

## Arkitektur

### Nya filer

```
packages/core/src/refactor/
  python-rope-transformer.ts     — subprocess-wrapper runt rope; exporterar applyRopeExtractMethod(filePath, startOffset, endOffset, newName)
  go-gopls-transformer.ts        — subprocess-wrapper runt gopls codeaction -exec -diff; exporterar applyGoplsExtractFunction(filePath, startOffset, endOffset, newName)
  ast-grep-early-return.ts       — kör ast-grep CLI med paketerade YAML-regler; exporterar applyAstGrepEarlyReturn(code, language)
  semgrep-prepass.ts             — kör semgrep --autofix som pre-pass; exporterar runSemgrepPrepass(filePath, language)

packages/core/src/refactor/rules/
  early-return-python.yaml       — ast-grep YAML-regel: if-sats → tidig retur (Python)
  early-return-go.yaml           — ast-grep YAML-regel: if-sats → tidig retur (Go)
  early-return-ruby.yaml         — ast-grep YAML-regel: if-sats → tidig retur (Ruby)
  early-return-rust.yaml         — ast-grep YAML-regel: if-sats → tidig retur (Rust)
  early-return-java.yaml         — ast-grep YAML-regel: if-sats → tidig retur (Java)
  early-return-kotlin.yaml       — ast-grep YAML-regel: if-sats → tidig retur (Kotlin)
  early-return-swift.yaml        — ast-grep YAML-regel: if-sats → tidig retur (Swift)
  early-return-scala.yaml        — ast-grep YAML-regel: if-sats → tidig retur (Scala)
  early-return-elixir.yaml       — ast-grep YAML-regel: if-uttryck → tidig retur (Elixir)

packages/core/tests/
  refactor/
    python-rope-transformer.test.ts        — enhetstester för rope-wrapper (subprocess mock + fixture)
    go-gopls-transformer.test.ts           — enhetstester för gopls-wrapper (subprocess mock + fixture)
    ast-grep-early-return.test.ts          — enhetstester för tidig-retur-regler per språk
    semgrep-prepass.test.ts                — enhetstester för semgrep pre-pass (subprocess mock)
    refactoring-miner-oracle.test.ts       — integrationstester: bygg temporärt git-repo, kör transformer, verifiera via RefactoringMiner CLI

  fixtures/
    unhealthy/deep-nesting.py              — Python-fixture med djup nästling (DeepNesting ≥3, ComplexMethod CC≥15) för rope-test
    unhealthy/deep-nesting.go              — Go-fixture med djup nästling för gopls-test
    healthy/early-return-refactored.py     — Förväntat resultat efter tidig-retur-omskrivning (Python)
    healthy/early-return-refactored.go     — Förväntat resultat efter tidig-retur-omskrivning (Go)
```

### Ändringar i befintliga filer

- **`packages/core/src/refactor/auto-refactor-applier.ts`** — Lägg till två nya case i `switch (refactoringStrategy)`: `'rope_extract_method'` (delegerar till `applyRopeExtractMethod`) och `'gopls_extract_function'` (delegerar till `applyGoplsExtractFunction`). Befintliga case `'extract_method'` och `'split_at_seam'` påverkas inte.

- **`packages/core/src/refactor/auto-refactor-analyzer.ts`** — Utöka strategivalslogiken: om `language === 'python'` och smell är `ComplexMethod` eller `BrainMethod` och `rope` är tillgängligt (checked via `canUseRope()`), välj `'rope_extract_method'`; om `language === 'go'` och samma smells, välj `'gopls_extract_function'`.

- **`packages/core/src/refactor/smell-instructions.ts`** — Lägg till `RefactoringTemplate` för `'rope_extract_method'` och `'gopls_extract_function'` med instruktioner om hur LLM skall beräkna byte-offsets från rad/kolumn-information.

- **`packages/core/src/refactor/index.ts`** — Re-exportera `applyRopeExtractMethod`, `applyGoplsExtractFunction`, `applyAstGrepEarlyReturn`, `runSemgrepPrepass` från sina respektive moduler.

- **`packages/core/src/index.ts`** — Lägg till export av `applyRopeExtractMethod`, `applyGoplsExtractFunction`, `applyAstGrepEarlyReturn`, `runSemgrepPrepass`.

- **`packages/mcp-server/src/tools/auto-refactor-apply.ts`** — Hantera de nya strategierna i response-byggaren; returnera `transformedCode` och `diff` (unified diff-sträng) även för rope/gopls-strategier.

- **`packages/mcp-server/src/server.ts`** — Inga nya verktygsregistreringar krävs (de nya transformatorerna nås via befintligt `code_health_auto_refactor_apply`-verktyg).

---

## Tasks

### 1. Python rope-transformer

- [ ] **[Sonnet] Implementera `packages/core/src/refactor/python-rope-transformer.ts`**
  - Exportera `applyRopeExtractMethod(filePath: string, startOffset: number, endOffset: number, newName: string): Promise<RopeTransformResult>` där `RopeTransformResult = { success: boolean; diff: string; error?: string }`.
  - Kör ett inbäddat Python-hjälpskript via `child_process.execFile('python3', ['-c', ropeScript])` där `ropeScript` skapar ett `Project`, anropar `ExtractMethod(project, resource, startOffset, endOffset)`, kör `get_changes(newName)` och skriver ut `changes.get_description()` till stdout.
  - Exportera `canUseRope(): Promise<boolean>` som verifierar att `python3 -c "import rope"` lyckas utan fel.
  - Acceptanskriterium: `applyRopeExtractMethod` på `unhealthy/deep-nesting.py` producerar ett icke-tomt `diff` och `success: true`; `canUseRope()` returnerar `false` när Python saknas (mockat i test).

- [ ] **[Haiku] Skapa testfixtur `packages/core/tests/fixtures/unhealthy/deep-nesting.py`**
  - Python-funktion med CC ≥ 15, minst tre nästlingsnivåer (djupnästlad if/for/while), ≥ 30 rader.
  - Hälsoanalys via `analyzeCode(code, 'python')` skall returnera `score < 7.0` och inkludera `ComplexMethod` eller `BrainMethod` i smells.
  - Acceptanskriterium: `pnpm --filter @healthy-ai-code/core test` passerar med fixture-assertion.

- [ ] **[Sonnet] Enhetstester `packages/core/tests/refactor/python-rope-transformer.test.ts`**
  - Mock `child_process.execFile` för att simulera framgångsrikt rope-svar (diff-sträng) och felfall (rope saknas, syntaxfel i Python-fil).
  - Testa att `canUseRope()` returnerar korrekt boolean baserat på exit-kod.
  - Testa att `applyRopeExtractMethod` parsar diff-output korrekt och returnerar `success: false` vid tom diff.
  - Acceptanskriterium: 100 % branch-täckning på `python-rope-transformer.ts`; `pnpm --filter @healthy-ai-code/core test` grön.

### 2. Go gopls-transformer

- [ ] **[Sonnet] Implementera `packages/core/src/refactor/go-gopls-transformer.ts`**
  - Exportera `applyGoplsExtractFunction(filePath: string, startOffset: number, endOffset: number): Promise<GoplsTransformResult>` där `GoplsTransformResult = { success: boolean; diff: string; error?: string }`.
  - Kör `execFile('gopls', ['codeaction', '-exec', '-kind', 'refactor.extract.function', '-diff', `${filePath}:#${startOffset}-#${endOffset}`])` och fånga stdout som diff-sträng.
  - Exportera `canUseGopls(): Promise<boolean>` via `gopls version` exit-kod.
  - Byte-offset-format: nollbaserat, `#START-#END` exakt som gopls dokumenterar ([go.dev/gopls/features/transformation](https://go.dev/gopls/features/transformation)).
  - Acceptanskriterium: `applyGoplsExtractFunction` på `unhealthy/deep-nesting.go` producerar icke-tomt diff (med gopls installerat i CI); `canUseGopls()` returnerar `false` vid saknad installation.

- [ ] **[Haiku] Skapa testfixtur `packages/core/tests/fixtures/unhealthy/deep-nesting.go`**
  - Go-funktion med CC ≥ 12, djup nästling, ≥ 25 rader.
  - `analyzeCode(code, 'go')` skall returnera `score < 7.5` med `ComplexMethod` i smells.
  - Acceptanskriterium: fixture-assertion passerar i testsviten.

- [ ] **[Sonnet] Enhetstester `packages/core/tests/refactor/go-gopls-transformer.test.ts`**
  - Mock `execFile` för gopls; testa framgångssvar (unified diff), saknad gopls (ENOENT), och gopls-fel (exit-kod 1).
  - Verifiera att `#`-prefix används korrekt i argumentet.
  - Acceptanskriterium: alla testfall gröna; `pnpm -r typecheck` ren.

### 3. Integration i auto-refactor-applier och analyzer

- [ ] **[Sonnet] Utöka `packages/core/src/refactor/auto-refactor-applier.ts` med rope/gopls-strategier**
  - Lägg till `case 'rope_extract_method': return await applyRopeStrategy(code, refactorResult)` och `case 'gopls_extract_function': return await applyGoplsStrategy(code, refactorResult)` i `applyAutoRefactor`.
  - `applyRopeStrategy`: läs `result.startLine`/`result.endLine`, konvertera till byte-offset via radlängdsackumulering, anropa `applyRopeExtractMethod`, applicera diff mot `code`-strängen via ett enkelt patch-bibliotek eller inbyggd textsubstitution.
  - `applyGoplsStrategy`: samma mönster för Go.
  - Acceptanskriterium: befintliga strategier (`early_return`, `extract_method`, etc.) förblir opåverkade; `pnpm -r typecheck` ren; befintliga tester gröna.

- [ ] **[Sonnet] Utöka `packages/core/src/refactor/auto-refactor-analyzer.ts` med språkbaserad strategiväljare**
  - I `analyzeForAutoRefactor`: om `language === 'python'` och primär smell är `ComplexMethod` eller `BrainMethod`, kontrollera `await canUseRope()` och sätt `refactoringStrategy: 'rope_extract_method'` vid `true`, annars fallback till befintlig `'extract_method'`-strategi.
  - Motsvarande logik för `language === 'go'` med `canUseGopls()` och `'gopls_extract_function'`.
  - Acceptanskriterium: `analyzeForAutoRefactor` på `deep-nesting.py`-fixtur returnerar `refactoringStrategy: 'rope_extract_method'` (med rope mock som `true`); fallback till `'extract_method'` när rope-mock returnerar `false`.

- [ ] **[Haiku] Uppdatera `packages/core/src/refactor/smell-instructions.ts` med nya mallar**
  - Lägg till `RefactoringTemplate` för `'rope_extract_method'`: inkludera instruktioner om att LLM skall beräkna `start_offset` och `end_offset` som ackumulerade teckens antal från filens start till resp. rad/kolumn.
  - Lägg till `RefactoringTemplate` för `'gopls_extract_function'`: instruktioner om nollbaserade byte-offsets och att körning kräver att filen sparas till disk före anrop.
  - Acceptanskriterium: `smell-instructions.ts` kompilerar; `pnpm -r typecheck` ren.

### 4. ast-grep tidig-retur-regler

- [ ] **[Sonnet] Skapa YAML-regler i `packages/core/src/refactor/rules/`**
  - Skapa `early-return-python.yaml` med `language: Python`, `rule: { pattern: "if $COND:\n  $$$BODY" }`, `fix: "if not $COND:\n  return\n$$$BODY"` (anpassad till Pythons indentering via ast-grep:s multi-line mönsterstöd).
  - Skapa `early-return-go.yaml` med `language: Go`, `rule: { pattern: "if $COND { $$$BODY }" }`, `fix: "if !($COND) { return }\n$$$BODY"`.
  - Skapa motsvarande regler för Ruby, Rust, Java, Kotlin, Swift, Scala, Elixir — varje fil anpassad till grammatikens syntax (t.ex. `unless`-alternativ i Ruby).
  - Varje regelfil skall vara testbar med `ast-grep scan --rule <fil> <fixture>`.
  - Acceptanskriterium: `ast-grep scan --rule early-return-python.yaml packages/core/tests/fixtures/unhealthy/deep-nesting.py` matchar minst en nod.

- [ ] **[Sonnet] Implementera `packages/core/src/refactor/ast-grep-early-return.ts`**
  - Exportera `applyAstGrepEarlyReturn(code: string, language: Language, filePath?: string): Promise<AstGrepResult>` där `AstGrepResult = { transformedCode: string; matchCount: number; error?: string }`.
  - Skriv koden till en temporär fil (via `fs.mkdtemp`), kör `ast-grep scan --rule <regelsfil> --rewrite <tempfil>`, läs tillbaka omskriven kod, städa upp tempfilen.
  - Välja korrekt regelsfil baserat på `language`-parameter via en `LANGUAGE_RULE_MAP`-konstant.
  - Exportera `canUseAstGrep(): Promise<boolean>` via `ast-grep --version` exit-kod.
  - Acceptanskriterium: `applyAstGrepEarlyReturn(deepNestingPyCode, 'python')` returnerar `matchCount > 0` och `transformedCode` som inte innehåller den nästlade if-strukturen (verifierat via snapshot-test).

- [ ] **[Sonnet] Enhetstester `packages/core/tests/refactor/ast-grep-early-return.test.ts`**
  - Testa varje YAML-regel med en minimal syntetisk kod-sträng per språk (inline fixture, ej diskfil).
  - Mock `execFile` för `ast-grep`; verifiera att korrekt regelsfil väljs per language.
  - Testa fallback när `ast-grep` saknas.
  - Acceptanskriterium: `pnpm --filter @healthy-ai-code/core test` grön.

### 5. semgrep pre-pass

- [ ] **[Sonnet] Implementera `packages/core/src/refactor/semgrep-prepass.ts`**
  - Exportera `runSemgrepPrepass(filePath: string, language: Language): Promise<SemgrepResult>` där `SemgrepResult = { applied: boolean; fixCount: number; error?: string }`.
  - Kör `semgrep --config=auto --autofix --quiet <filePath>` via `execFile`; tolka exit-kod (0 = inga fynd, 1 = fynd utan fix-fel, ≥2 = fel).
  - Exportera `canUseSemgrep(): Promise<boolean>` via `semgrep --version`.
  - Pre-passet skall enbart köras om `canUseSemgrep()` returnerar `true`; om inte, returnera `{ applied: false, fixCount: 0 }` utan fel.
  - Acceptanskriterium: `runSemgrepPrepass` på en Python-fil med kända MagicNumber-lukter reducerar dem (integrationstestbart om semgrep är installerat i CI); unit-test med subprocess-mock verifierar exit-kod-tolkning.

- [ ] **[Haiku] Enhetstester `packages/core/tests/refactor/semgrep-prepass.test.ts`**
  - Mock `execFile` för tre scenarion: exit 0 (inget att fixa), exit 1 (fixar tillämpade), exit 2 (körningstfel).
  - Testa att `canUseSemgrep()` returnerar korrekt värde.
  - Acceptanskriterium: `pnpm --filter @healthy-ai-code/core test` grön.

### 6. RefactoringMiner oracle i testsviten

- [ ] **[Opus] Implementera `packages/core/tests/refactor/refactoring-miner-oracle.test.ts`**
  - Bygg ett deterministiskt temporärt Git-repo (liknande `method-coupling-repo-builder.ts`) med en Java-fil (t.ex. `Calculator.java`) som innehåller en komplex metod.
  - Applicera `applyExtractMethodFull` (den befintliga TS-transformatorn) på filens innehåll och skriv resultatet som ett nytt commit i temprepot.
  - Kör `java -jar RefactoringMiner.jar -c <tempRepo> HEAD` via subprocess och parsa JSON-output.
  - Verifiera att RefactoringMiner returnerar minst en refaktorering av typen `"Extract Method"` för commit HEAD.
  - Skip-logik: testet skall skippa med ett tydligt meddelande om `java` eller `RefactoringMiner.jar` saknas i PATH/`tools/`-katalogen.
  - Acceptanskriterium: testet passerar med RefactoringMiner installerat och identifierar `"Extract Method"`-refaktorering; utan installation: testet skippas utan att bryta CI.

- [ ] **[Haiku] Lägg till `tools/`-katalog och `README`-instruktioner för RefactoringMiner**
  - Skapa `tools/README.md` med instruktioner för att ladda ned `RefactoringMiner-3.x-all.jar` från GitHub Releases och placera den som `tools/RefactoringMiner.jar`.
  - Lägg till `tools/.gitkeep` så katalogen checkas in utan jar-filen.
  - Acceptanskriterium: `tools/README.md` finns och innehåller korrekt nedladdningslänk.

### 7. Re-export och typsystemintegration

- [ ] **[Haiku] Uppdatera `packages/core/src/refactor/index.ts` och `packages/core/src/index.ts`**
  - Re-exportera `applyRopeExtractMethod`, `canUseRope`, `applyGoplsExtractFunction`, `canUseGopls`, `applyAstGrepEarlyReturn`, `canUseAstGrep`, `runSemgrepPrepass`, `canUseSemgrep` från sina moduler.
  - Exportera typer `RopeTransformResult`, `GoplsTransformResult`, `AstGrepResult`, `SemgrepResult`.
  - Acceptanskriterium: `pnpm -r typecheck` ren utan nya diagnostikfel; befintliga exporter påverkas inte.

---

## Beroenden

### Förutsättningar för Sprint 53
- Sprint 32 (auto-refactor-applier med `applyAutoRefactor`, `analyzeForAutoRefactor`) måste vara levererat och stabilt — Sprint 53 bygger direkt vidare på dessa funktioner.
- Befintliga Tier A-analyzers (`analyzePython`, `analyzeGo`) i `packages/core/src/analyzers/index.ts` används för att verifiera att fixtures producerar förväntade smells.

### Externa runtime-beroenden (opt-in, ej hård dependency)
- `python3` + `pip install rope` — krävs för rope-transformer; saknas → graceful fallback till befintlig `extract_method`-strategi.
- `go` + `gopls` — krävs för gopls-transformer; saknas → graceful fallback.
- `ast-grep` CLI — krävs för tidig-retur-regler; saknas → fallback.
- `semgrep` — krävs för pre-pass; saknas → pre-pass hoppas över.
- `java` + `RefactoringMiner.jar` — krävs för oracle-testet; saknas → test skippar.

### Vad Sprint 53 låser upp
- Grund för Sprint 54+ att lägga till RCI-självkritik i `followUpInstruction` (roadmap sektion D, punkt 9) — fler deterministiska transformatorer ger RCI-prompten mer att jobba med.
- Ger empirisk data för en kommande mekanisk-fix-rate-rapport (nuvarande 11.8 % → förväntat ≥20 % med rope + gopls + ast-grep).

---

## Testplan

```bash
# 1. Typkontroll hela monorepon
pnpm -r typecheck

# 2. Alla enhetstester (core + mcp-server)
pnpm test

# 3. Enbart core-tester (snabbare feedback-loop under implementation)
pnpm --filter @healthy-ai-code/core test

# 4. Enbart mcp-server-tester
pnpm --filter @healthy-ai-code/mcp-server test

# 5. Verifiera att nya fixtures producerar förväntade scores
node -e "
const { analyzeCode } = require('./packages/core/dist/index.js');
const fs = require('fs');
const py = fs.readFileSync('packages/core/tests/fixtures/unhealthy/deep-nesting.py', 'utf8');
const result = analyzeCode(py, 'python');
console.log('Python score:', result.score, '(förväntat < 7.0)');
const go = fs.readFileSync('packages/core/tests/fixtures/unhealthy/deep-nesting.go', 'utf8');
const goResult = analyzeCode(go, 'go');
console.log('Go score:', goResult.score, '(förväntat < 7.5)');
"

# 6. Självrevision av projektet (verifierar att Sprint 53-koden inte sänker projektets egna score)
node scripts/health-audit.mjs

# 7. ast-grep regelvalidering (kräver ast-grep installerat)
ast-grep scan --rule packages/core/src/refactor/rules/early-return-python.yaml \
  packages/core/tests/fixtures/unhealthy/deep-nesting.py

# 8. RefactoringMiner oracle-test (skippas automatiskt om jar saknas)
pnpm --filter @healthy-ai-code/core test -- --testPathPattern refactoring-miner-oracle
```

**Förväntade testutfall:**
- Alla enhetstester gröna (subprocess-mockar täcker rope, gopls, ast-grep, semgrep).
- `deep-nesting.py`: `score < 7.0`, smells inkluderar `ComplexMethod` eller `BrainMethod`.
- `deep-nesting.go`: `score < 7.5`, smells inkluderar `ComplexMethod`.
- `pnpm -r typecheck`: noll diagnostikfel.
- `node scripts/health-audit.mjs`: inga nya filer under projektets egna 9.5-tröskel.

---

## Tekniska beslut

1. **Subprocess-isolation för rope och gopls, inte inbyggda bindings.** MCP-servern är Node.js/TypeScript; rope är Python och gopls är en Go-binär. Subprocess-anrop via `child_process.execFile` isolerar runtime-miljöerna utan att introducera FFI eller komplexa beroenden. Nackdel: processstartkostnad (~50–200 ms per anrop); acceptabelt för en refaktoreringsoperation som körs sällan. Alternativet — att bunta in en Python-runtime — avfärdas som för komplex.

2. **Graceful fallback vid saknad runtime-dependency.** Alla fyra externa verktyg (rope, gopls, ast-grep, semgrep) är opt-in: `can*`-funktionerna körs vid initiering och resultaten cachas per session. Om ett verktyg saknas returneras en tydlig `error`-sträng och befintlig strategi används. Designprincipen: en saknad runtime skall aldrig krascha MCP-servern.

3. **YAML-regler paketeras i `src/refactor/rules/` och distribueras med paketet.** Reglerna är statiska och versionskontrollerade. Alternativet — att ladda ned regler vid körning — avfärdas p.g.a. offline-drift och reproducerbarhet. ast-grep:s `--rule`-flagga accepterar en absolut sökväg, så reglerna löses till `__dirname + '/rules/<fil>'` vid körning.

4. **RefactoringMiner-oracle är ett opt-in integrationstestmål, inte ett blockande CI-krav.** Jar-filen (>50 MB) checkas inte in i repot. Testet detekterar om `tools/RefactoringMiner.jar` finns och skippas annars. Detta är samma mönster som det befintliga `method-coupling-repo-builder.ts`-testet. Rättfärdigande: att kräva RefactoringMiner i CI skulle introducera ett Java-beroende som ökar CI-komplexitet utan proportionell nytta för alla PR:ar.

5. **ast-grep tidig-retur-regler täcker inte elixir `with`-konstruktioner i version 1.** Elixirs `if`-uttryck skiljer sig syntaktiskt från andra språk och `with`-konstruktionen kräver en egen mer komplex regel. Sprint 53 levererar en basal `if`-regel för Elixir; `with`-stöd planeras som en separat förbättring.

---

## Risker / öppna frågor

1. **Indenteringskänslighet i Python-regelns `fix`-fält.** ast-grep:s tidig-retur-fix för Python måste hantera godtycklig indentering i `$$$BODY`. Om `fix`-fältet innehåller hårdkodad indentering kan den krocka med befintlig indenteringsnivå. Risk: medelhög. Mitigering: testa fixeln mot minst tre indenteringsnivåer (0, 4, 8 mellanslag) i enhetstestet; overwrite om ast-grep:s eget AST-baserade substitution hanterar det.

2. **gopls kräver ett giltigt Go-modul-sammanhang.** `gopls codeaction` kan misslyckas om filen inte ingår i ett `go.mod`-projekt. Risk: medelhög för isolerade `.go`-filer (t.ex. fixtures som enstaka filer). Mitigering: `go-gopls-transformer.ts` skapar ett minimalt temporärt `go.mod` i samma katalog som tempfilen om inget `go.mod` hittas uppåt i filträdet.

3. **RefactoringMiner identifierar extraherade Java-metoder från TS-transformatorn.** Den befintliga `applyExtractMethodFull` genererar TypeScript/JavaScript-kod, inte Java. Oracle-testet kräver en Java-fixture. Risk: låg (Java-fixtur är enkel att skriva), men oracle validerar inte TS-transformatorns korrekthet direkt — det validerar principen. Öppen fråga: finns det ett JVM-oberoende oracle för TS/JS-extract-method som kan fylla detta gap?

4. **semgrep `--config=auto` kräver nätverksåtkomst vid första körning.** `auto`-konfigurationen kan ladda ned regler från semgrep.dev. Risk: låg för interaktiv användning, men kan orsaka problem i strikt offline-miljö. Mitigering: `semgrep-prepass.ts` skall acceptera en valfri `configPath`-parameter (`--config=<path>`) som pekar på en lokal regelkatalog; `auto` används som default.
