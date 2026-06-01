# Sprint 58: Säkerhetsbiomarkörer (OWASP Top 10 2025) + undantagshantering + async-antipatterns + kodklonar

**Datum:** 2026-05-30
**Status:** Planerad

---

## Mål

- Lägga till fem nya `SmellType`-värden och tillhörande detektorer: `SsrfRisk`, `InsecureDeserializationRisk`, `CryptographicMisuseRisk`, `ExceptionHandlingAntiPattern` och `AsyncAntiPattern` — samtliga saknas helt i de nuvarande 28 biomarkörerna.
- Implementera `DuplicateCode`-biomarkören (klontyp 1–3 via AST-subtradshashning, in-fil → cross-fil) som ett komplement till det existerande `duplicationScore`-fältet i `MetricBreakdown`, som i dag alltid är 0 för per-filanalys.
- Förankra poängsystemets säkerhetsyta mot OWASP Top 10 2025 utan att duplicera den neuro-symboliska `auditSecurity`-pipelinen från Sprint 28; dessa biomarkörer producerar `Smell[]` och bidrar till hälsopoängen direkt via `analyzeByLanguage()`.
- Sätta viktningen på evidensbaserad nivå (1.0–1.5 för säkerhetsrelaterade, 0.8 för undantags- och async-mönster, 1.0 för kloner) och leverera fixtures under `packages/core/tests/fixtures/`.

---

## Bakgrund och motivation

### Säkerhet: OWASP Top 10 2025-gap

Projektets säkerhetsyta täcker redan SQL-injektion, XSS, kommandoinjektion, hårdkodade autentiseringsuppgifter, `PathTraversalRisk` och `UnsafeDeserialization` som `SecurityFindingType` i den neuro-symboliska pipelinen (Sprint 28, `packages/core/src/security/`). Det finns dock en viktig distinktion: dessa typer producerar `AggregatedFinding[]` för MCP-verktyget `code_health_security_audit`, men de flesta av dem är **inte** kopplade som `Smell`-poster i hälsopoängens `SmellType`-union och saknas därför i det ordinarie `analyzeCode()`/`analyzeFile()`-flödet.

Tre OWASP Top 10 2025-kategorier saknas helt i båda lagren:

- **Insecure Deserialization (CWE-502):** `pickle.load` utan tainted-input-kontroll (Python), `yaml.load` utan `SafeLoader` (Python/Ruby), `ObjectInputStream.readObject` (Java), `unserialize` (PHP), `Marshal.load` (Ruby). Roadmapen citerar att AI-genererad kod uppvisar 1,82× högre frekvens av deserialiseringsbrister ([sonarsource.com/solutions/taint-analysis](https://www.sonarsource.com/solutions/taint-analysis/)). Lägst implementationsinsats av de tre — rent namnmatchning på kända sinks.
- **SSRF (Server-Side Request Forgery):** `http.get`/`requests.get`/`fetch`/`axios.get` med URL som byggs från request-parametrar. Lyftes till en framträdande position i OWASP 2025 med anledning av cloud-metadata-missbruk (AWS IMDSv1, GCP metadata-server). Kräver enkel call-site-matchning och variabelkontextanalys.
- **Kryptografisk missbruk (CWE-326/327/338):** Svaga hash-algoritmer för säkerhetsändamål (MD5, SHA-1, DES, RC4 via `createHash('md5')`, `hashlib.md5`, `MessageDigest.getInstance("MD5")`), otillräcklig nyckellängd (RSA < 2048 bitar), osäker slump (`Math.random()` för tokens/sessioner, `random.random()` för kryptografiska ändamål) och hårdkodad IV/nonce. CogniCrypt och CryptoGuard är referensimplementationer i litteraturen ([arxiv.org/pdf/2409.06561](https://arxiv.org/pdf/2409.06561)). Viktning sätts konservativt (~1.0) tills kontext-filtrering för "MD5 som cache-nyckel" är implementerat.

### Undantagshantering: hög prevalens, låg täckning

Forskningsstudie (ICPC 2017, replikerad 2026) på 16 Java/C#-projekt identifierade fem undantagsantipatterns i >20% av alla catch-block: `CatchGeneric` (31,9%), `UnreachableHandler` (28,0%), `DestructiveWrapping` (22,3%), `OverCatch` (24,6%) och `EmptyCatch` (40,8%). En 2026-uppföljning rapporterar >70% violation-rate för `CatchGeneric` ensamt ([arxiv.org/abs/1704.00778](https://arxiv.org/abs/1704.00778)). Samtliga är direkt detekterbara via tree-sitter AST i samtliga Tier A-språk (TypeScript, Java, Python, Go, C#, Kotlin, Scala, etc.). Projektets nuvarande 28 biomarkörer har inget motsvarande; överlappet med `DeadCode` är marginellt (bara tomma kroppen, inte fel exceptiontyp).

### Async/Promise-antipatterns: JS/TS-specifikt gap

DrAsync (ICSE 2022, IEEE, [franktip.org/pubs/icse2022-drasync.pdf](https://www.franktip.org/pubs/icse2022-drasync.pdf)) identifierade 8 antipatterns i promise-baserad JavaScript och fann 2 600+ statiska instanser i 20 populära repositories. De statiskt detekterbara utan dataflödesanalys är: `asyncFunctionNoAwait` (async-funktion utan ett enda await-uttryck), `asyncFunctionAwaitedReturn` (redundant `await` i return-sats), `reactionReturnsPromise` (`.then()`-callback som returnerar ett nytt promise utan kedjning) och `executorOneArgUsed` (Promise-konstruktor med callback som bara använder resolve, inte reject). Dessa är direkt åtkomliga i det befintliga TypeScript/JavaScript tree-sitter-grammatiket utan nya parserberoenden. SonarQube täcker en delmängd; full täckning av DrAsync-katalogen är ett differentierat erbjudande.

### DuplicateCode: ökande frekvens i AI-genererad kod

GitClear 2025 Research ([gitclear.com/ai_assistant_code_quality_2025_research](https://www.gitclear.com/ai_assistant_code_quality_2025_research)) rapporterar att klon-frekvensen ökade från 8,3% till 12,3% mellan 2021 och 2024, en ökning starkt kopplad till AI-assisterat skrivande. Projektets `MetricBreakdown.duplicationScore` är alltid 0 för per-filanalys (kommenterat i `types.ts`); det finns en separat `project/duplication.ts` för cross-fil-analys men den bidrar inte till hälsopoängen. AST-subtradshashning (teknik populariserad av CloneDR, ICSM 1998; och DECKARD, ICSE 2007) ger korrekt typ-1–3-detektion: typ 1 = exakt kodklon, typ 2 = strukturellt identisk med ombyte av variabelnamn, typ 3 = nära-kloner med tillägg/borttagning av satser. In-fil-detektion är implementerbara i `analyzeByLanguage()`-passet; cross-fil kräver en separat projektfas.

---

## Arkitektur

### Nya filer

```
packages/core/src/analyzers/
  security-sink-detector.ts      — Detekterar InsecureDeserializationRisk, SsrfRisk och CryptographicMisuseRisk
                                   som Smell[]-poster via regex/AST-call-site-matchning; returnerar Smell[].
  exception-antipatterns.ts      — Detekterar ExceptionHandlingAntiPattern (EmptyCatch, CatchGeneric,
                                   DestructiveWrapping, UnreachableHandler) i Tier A-språk via tree-sitter.
  async-antipatterns.ts          — Detekterar AsyncAntiPattern (asyncFunctionNoAwait,
                                   asyncFunctionAwaitedReturn, reactionReturnsPromise,
                                   executorOneArgUsed) enbart för typescript/javascript via tree-sitter.
  duplicate-code.ts              — In-fil DuplicateCode-detektion via AST-subtradshashning (typ 1–2)
                                   och line-window-hashning (typ 3). Producerar Smell[].

packages/core/src/
  project/duplicate-code-cross-file.ts  — Cross-fil DuplicateCode: tar AnalyzerOutput[] för alla filer
                                          i ett projekt och returnerar ett Set av filpar med klonstyrka.
                                          Inte kopplas till per-fil-poängen ännu; förbereds för Sprint 59.

packages/core/tests/
  fixtures/unhealthy/insecure-deserialization.py   — pickle.load + yaml.load utan SafeLoader
  fixtures/unhealthy/ssrf-risk.ts                  — fetch() med url från req.query
  fixtures/unhealthy/crypto-misuse.ts               — createHash('md5'), Math.random() för token
  fixtures/unhealthy/crypto-misuse.py               — hashlib.md5() + random.random() som nonce
  fixtures/unhealthy/exception-antipatterns.ts      — EmptyCatch + CatchGeneric + DestructiveWrapping
  fixtures/unhealthy/exception-antipatterns.py      — bare except + except Exception as e: pass
  fixtures/unhealthy/async-antipatterns.ts          — asyncFunctionNoAwait + redundant await return
  fixtures/unhealthy/duplicate-code.ts              — ≥3 duplicerade block (typ 1) inom fil
  fixtures/healthy/no-crypto-misuse.ts              — SHA-256 + crypto.getRandomValues()
  fixtures/healthy/no-async-issues.ts               — korrekt async/await-mönster

packages/mcp-server/tests/integration/
  security-sinks.test.ts        — Integrationstest som verifierar att analyzeCode() returnerar
                                  SsrfRisk/InsecureDeserializationRisk/CryptographicMisuseRisk
                                  med korrekt viktad poängsänkning.
```

### Ändringar i befintliga filer

- **`packages/core/src/types.ts`** — Utöka `SmellType`-unionen med fem nya värden: `SsrfRisk`, `InsecureDeserializationRisk`, `CryptographicMisuseRisk`, `ExceptionHandlingAntiPattern`, `AsyncAntiPattern`, `DuplicateCode`.
- **`packages/core/src/scoring/weights.ts`** — Lägg till viktposter för de sex nya SmellType-värdena; se Tekniska beslut §2 för motiverade värden.
- **`packages/core/src/analyzers/typescript.ts`** — Anropa `detectAsyncAntiPatterns()` och `detectExceptionAntiPatterns()` i slutet av analyse-passet; slå ihop returnerade `Smell[]` med befintlig `smells`-array.
- **`packages/core/src/analyzers/python.ts`** — Anropa `detectSecuritySinks()` (deserialisering, SSRF) och `detectExceptionAntiPatterns()`.
- **`packages/core/src/analyzers/java.ts`** — Anropa `detectSecuritySinks()` (ObjectInputStream) och `detectExceptionAntiPatterns()`.
- **`packages/core/src/analyzers/index.ts`** — Inga strukturella ändringar; dispatch-tabellen `LANGUAGE_DISPATCH` påverkas inte. Kommentar om att `security-sink-detector` importeras av enskilda language-analyzers, inte av dispatch-lagret.
- **`packages/core/src/analyzers/go.ts`**, **`ruby.ts`**, **`php.ts`**, **`csharp.ts`**, **`kotlin.ts`**, **`scala.ts`** — Anropa `detectSecuritySinks()` och `detectExceptionAntiPatterns()` med språkspecifika sinklistor.
- **`packages/core/src/index.ts`** — Re-exportera `detectSecuritySinks`, `detectExceptionAntiPatterns`, `detectAsyncAntiPatterns`, `detectDuplicateCode` från respektive ny modul.

---

## Tasks

### Grupp 1: Typsystem och vikter

- [ ] [Haiku] **T1: Utöka SmellType-unionen och weights-tabellen**
  - Fil: `packages/core/src/types.ts` — lägg till sex nya literaler i `SmellType`-unionen direkt efter AI-specific-blocket (Sprint 29-kommentaren): `'SsrfRisk'`, `'InsecureDeserializationRisk'`, `'CryptographicMisuseRisk'`, `'ExceptionHandlingAntiPattern'`, `'AsyncAntiPattern'`, `'DuplicateCode'`.
  - Fil: `packages/core/src/scoring/weights.ts` — lägg till sex poster i `SMELL_WEIGHTS: Record<SmellType, number>`:
    ```typescript
    // Sprint 58: OWASP 2025 + undantag + async + kloner
    SsrfRisk: 1.3,
    InsecureDeserializationRisk: 1.5,
    CryptographicMisuseRisk: 1.0,
    ExceptionHandlingAntiPattern: 0.8,
    AsyncAntiPattern: 0.7,
    DuplicateCode: 1.0,
    ```
  - Acceptanskriterium: `pnpm -r typecheck` passerar utan fel. TypeScript-kompilatorn kräver att alla `SmellType`-värden har en post i `SMELL_WEIGHTS` (Record<SmellType, number> är uttömmande).

---

### Grupp 2: Säkerhetssink-detektor (SSRF + Deserialisering + Kryptering)

- [ ] [Sonnet] **T2: Skapa `packages/core/src/analyzers/security-sink-detector.ts`**

  Exporterar en funktion:
  ```typescript
  export function detectSecuritySinks(code: string, language: Language, filePath?: string): Smell[]
  ```

  **InsecureDeserializationRisk** — regex-matchning per språk:
  - Python: `/\bpickle\.(?:load|loads|Unpickler)\s*\(/g` och `/\byaml\.(?:load|unsafe_load)\s*\(/g` (utan `Loader=yaml.SafeLoader`-argument — approximeras som avsaknad av `SafeLoader`-sträng inom samma uttryck).
  - Java: `/\bnew\s+ObjectInputStream\s*\(/g`.
  - PHP: `/\bunserialize\s*\(/g`.
  - Ruby: `/\bMarshal\.(?:load|restore)\s*\(/g`.
  - JS/TS: `/\bvm\.runInNewContext\s*\(/g` och `/\beval\s*\(\s*[^'"]/g` (eval med icke-literalt argument).

  **SsrfRisk** — identifierar HTTP-anrops-sinks med url byggd från request-kontext:
  - Identifiera sinks: `fetch\s*\(`, `axios\.(?:get|post|put|delete|request)\s*\(`, `requests\.(?:get|post|put)\s*\(`, `http\.(?:get|request)\s*\(`, `urllib\.request\.urlopen\s*\(`.
  - Heuristik: om sink-anropets första argument innehåller en referens till ett vanligt request-variabelnamn (`req\.(?:query|params|body|url)`, `request\.GET`, `request\.POST`, `c\.Query\(`, `r\.URL\.Query\(`) inom 3 rader från anropet → rapportera `SsrfRisk`. Noggrannheten är medvetet konservativ (låg false-positive-rate prioriteras över recall).

  **CryptographicMisuseRisk** — matchar:
  - Svaga hash-algoritmer: `createHash\s*\(\s*['"](?:md5|sha1|sha-1|des|rc4|3des)['"]\s*\)`, `hashlib\.(?:md5|sha1)\s*\(`, `MessageDigest\.getInstance\s*\(\s*["'](?:MD5|SHA-1|SHA1)["']\s*\)`, `Digest::(?:MD5|SHA1)`, `hash\s*\(\s*'(?:md5|sha1)'`.
  - Osäker slump: `/\bMath\.random\s*\(\s*\)/g` (JS/TS), `/\brandom\.random\s*\(\s*\)/g` (Python) i kontext med variabelnamn som antyder tokens/sessioner (`token`, `secret`, `session`, `nonce`, `key`, `password` inom 5 rader).
  - Kort RSA-nyckel: `/(?:generate_private_key|RSA\.generate)\s*\([^)]*(?:1024|512)/g`.
  - Hårdkodad IV: `/(?:const|let|var|val)\s+(?:iv|IV|nonce)\s*=\s*(?:Buffer\.from|b'|bytes\.fromhex)\s*\(['"][0-9a-fA-F]+['"]\)/g`.
  - Severity: `critical` för svaga hash-algoritmer och hårdkodad IV, `high` för osäker slump.
  - Acceptanskriterium: fixture `unhealthy/crypto-misuse.ts` ger minst 2 `CryptographicMisuseRisk`-smells; fixture `healthy/no-crypto-misuse.ts` (använder `crypto.getRandomValues()` och `createHash('sha256')`) ger 0.

- [ ] [Haiku] **T3: Koppla `detectSecuritySinks()` till Tier A-analyzerna**

  I varje av följande filer: importera `detectSecuritySinks` från `'../analyzers/security-sink-detector'` och lägg till i returvärdet:
  ```typescript
  smells: [...existingSmells, ...detectSecuritySinks(code, 'python', filePath)]
  ```
  Berörda filer: `analyzers/python.ts`, `analyzers/typescript.ts` (täcker js via dispatchen), `analyzers/java.ts`, `analyzers/php.ts`, `analyzers/ruby.ts`, `analyzers/go.ts`, `analyzers/csharp.ts`, `analyzers/kotlin.ts`.

  - Acceptanskriterium: `analyzeCode(pickleLoadCode, 'python')` returnerar ett `Smell` med `type: 'InsecureDeserializationRisk'` och `severity: 'critical'`.

- [ ] [Haiku] **T4: Skapa fixtures för säkerhetssinks**

  - `packages/core/tests/fixtures/unhealthy/insecure-deserialization.py`: en Python-fil med `pickle.load(f)` och `yaml.load(data)` utan SafeLoader.
  - `packages/core/tests/fixtures/unhealthy/ssrf-risk.ts`: en TS-fil med `fetch(req.query.url)` och `axios.get(req.params.target)`.
  - `packages/core/tests/fixtures/unhealthy/crypto-misuse.ts`: `createHash('md5')`, `Math.random()` tilldelad variabel namngiven `token`.
  - `packages/core/tests/fixtures/unhealthy/crypto-misuse.py`: `hashlib.md5()` och `random.random()` som nonce.
  - `packages/core/tests/fixtures/healthy/no-crypto-misuse.ts`: `createHash('sha256')`, `crypto.getRandomValues(new Uint8Array(32))`.

---

### Grupp 3: Undantagsantipatterns

- [ ] [Sonnet] **T5: Skapa `packages/core/src/analyzers/exception-antipatterns.ts`**

  Exporterar:
  ```typescript
  export function detectExceptionAntiPatterns(code: string, language: Language): Smell[]
  ```

  Implementationen är regex-baserad (Tier B-kompatibel) men med tree-sitter AST-fallback för Tier A-språk. Fyra detekterade mönster:

  **EmptyCatch** — catch-block med tom kropp:
  - TS/JS: `catch\s*\([^)]*\)\s*\{\s*\}` och `catch\s*\([^)]*\)\s*\{\s*\/\/[^\n]*\n?\s*\}` (enbart kommentarer).
  - Python: `except[^:]*:\s*\n\s*pass` (bare except med pass).
  - Java/Kotlin/Scala/C#: `catch\s*\([^)]*\)\s*\{\s*\}`.
  - Severity: `medium`.

  **CatchGeneric** — fångar basexceptionstypen:
  - Java: `catch\s*\(\s*Exception\s+\w+\s*\)` och `catch\s*\(\s*Throwable\s+\w+\s*\)`.
  - Python: `except Exception\s*(?:as\s+\w+)?\s*:` och `except\s*:` (bare except utan typ).
  - TS/JS: `catch\s*\(\w+\)\s*\{` (alla errors fångas — JS har ingen typparameter, men verifiera att kroppen inte re-throw:ar omedelbart).
  - C#: `catch\s*\(\s*Exception\s+\w+\s*\)` och `catch\s*\{`.
  - Go: saknar exceptions — hoppa över.
  - Severity: `low`.

  **DestructiveWrapping** — re-throw som förlorar stack trace:
  - Java: `throw new \w+Exception\s*\(\s*\w+\.getMessage\s*\(\s*\)\s*\)` (ingen cause-parameter).
  - Python: `raise \w+\([^)]*str\(\w+\)[^)]*\)` utan `from \w+`.
  - TS/JS: `throw new Error\s*\(\s*\w+\.message\s*\)` (förlorar stack).
  - Severity: `high` (förlorad stack trace försvårar felsökning).

  **UnreachableHandler** — catch-block ordnat bredast-först (aldrig nåbar specifik handler):
  - Java/Kotlin: hitta try-block med fler än ett catch; om `catch(Exception e)` förekommer innan `catch(IOException e)` el. liknande → rapportera. Implementeras som: leta efter `catch\s*\(\s*Exception` följt av `catch\s*\(` på efterföljande rader inom 20 rader.
  - Severity: `medium`.

  - Acceptanskriterium: fixture `unhealthy/exception-antipatterns.ts` ger minst 2 `ExceptionHandlingAntiPattern`-smells; fixture `unhealthy/exception-antipatterns.py` ger minst 1 `ExceptionHandlingAntiPattern`-smell.

- [ ] [Haiku] **T6: Koppla `detectExceptionAntiPatterns()` till Tier A-analyzerna**

  Samma mönster som T3. Berörda filer: `analyzers/typescript.ts`, `analyzers/python.ts`, `analyzers/java.ts`, `analyzers/csharp.ts`, `analyzers/kotlin.ts`, `analyzers/scala.ts`, `analyzers/ruby.ts`. Go utelämnas (Go har inget exception-system; `error`-returmönster detekteras inte i detta steg).

  - Acceptanskriterium: `analyzeCode(emptyTryCatchCode, 'typescript')` returnerar `Smell` med `type: 'ExceptionHandlingAntiPattern'`.

- [ ] [Haiku] **T7: Skapa fixtures för undantagsantipatterns**

  - `packages/core/tests/fixtures/unhealthy/exception-antipatterns.ts`: tom catch-block, catch som sväjer all `Error`, DestructiveWrapping (`throw new Error(e.message)`).
  - `packages/core/tests/fixtures/unhealthy/exception-antipatterns.py`: `except: pass`, `except Exception as e: pass`, `raise RuntimeError(str(e))` utan `from e`.

---

### Grupp 4: Async/Promise-antipatterns (TypeScript/JavaScript)

- [ ] [Sonnet] **T8: Skapa `packages/core/src/analyzers/async-antipatterns.ts`**

  Exporterar:
  ```typescript
  export function detectAsyncAntiPatterns(code: string): Smell[]
  ```

  Funktionen anropas **enbart** för `language === 'typescript'` eller `'javascript'`.

  Implementera fyra mönster (DrAsync P1, P3, P7, P8):

  **P1 — asyncFunctionNoAwait** (`AsyncAntiPattern`, severity `medium`):
  - Regex: `async\s+(?:function\s+\w+|(?:\w+\s*=\s*)?(?:function|\([^)]*\)\s*=>))\s*[^{]*\{[^}]*\}` — men approximeras bättre med ett tvåstegsmönster: (1) hitta alla `async function`- och `async (`-deklarationer med deras rad-index; (2) för varje sådant block, sök inom blocket efter `await`; om inget `await` finns → rapportera. Använd en enkel bracket-balanserare för att avgränsa funktionskroppen.
  - Undantag: funktioner som innehåller `return new Promise(` är medvetet exkluderade (explicitPromiseConstructor, P4).

  **P3 — asyncFunctionAwaitedReturn** (`AsyncAntiPattern`, severity `low`):
  - Pattern: `return\s+await\s+\w+` som **sista** sats i en async-funktion (redundant await i return-position).
  - Regex: `/\breturn\s+await\s+(?!Promise\.(?:all|race|allSettled|any))\w/g` — undanta `return await Promise.all(...)` (legitimt för error-hantering i try/catch).

  **P7 — reactionReturnsPromise** (`AsyncAntiPattern`, severity `low`):
  - Pattern: `.then\s*\(\s*(?:async\s+)?\(?[^)]*\)?\s*=>\s*\{[^}]*return\s+\w+\s*\.\s*then\s*\(` — `.then()`-callback som returnerar ett nytt `.then()`-anrop i stället för att returera promise direkt.
  - Severity: `low` (bruten kedjebarhet utan faktisk bugg om `.catch()` hanteras utanpå).

  **P8 — executorOneArgUsed** (`AsyncAntiPattern`, severity `low`):
  - Pattern: `new\s+Promise\s*\(\s*(?:function\s*)?\(\s*resolve\s*\)` — Promise-konstruktor med en parameter (saknar reject-parameter helt), vilket förhindrar korrekt felhantering.

  - Acceptanskriterium: `analyzeCode('async function f() { return 42; }', 'typescript')` returnerar `AsyncAntiPattern` med `type: 'AsyncAntiPattern'` och description som anger `asyncFunctionNoAwait`.

- [ ] [Haiku] **T9: Koppla `detectAsyncAntiPatterns()` till TypeScript-analyzern**

  I `packages/core/src/analyzers/typescript.ts`: importera `detectAsyncAntiPatterns` och lägg till anropet med `language`-guard:
  ```typescript
  const asyncSmells = (language === 'typescript' || language === 'javascript')
    ? detectAsyncAntiPatterns(code)
    : [];
  ```
  Merge med befintlig smells-array.

  - Acceptanskriterium: fixture `unhealthy/async-antipatterns.ts` ger minst 2 `AsyncAntiPattern`-smells vid `analyzeFile()`.

- [ ] [Haiku] **T10: Skapa fixtures för async-antipatterns**

  - `packages/core/tests/fixtures/unhealthy/async-antipatterns.ts`: En fil med minst: (1) en `async function` utan `await`, (2) ett `return await something()` i en vanlig `try/catch`-fri context, (3) ett `new Promise((resolve) => {...})` utan reject-parameter.
  - `packages/core/tests/fixtures/healthy/no-async-issues.ts`: `async function fetcher() { const data = await fetch(url); return data.json(); }` — korrekt mönster som ger 0 `AsyncAntiPattern`.

---

### Grupp 5: DuplicateCode (in-fil, typ 1–2)

- [ ] [Opus] **T11: Designa och implementera `packages/core/src/analyzers/duplicate-code.ts`**

  Exporterar:
  ```typescript
  export interface CloneGroup {
    hash: string;
    occurrences: Array<{ startLine: number; endLine: number }>;
    cloneType: 1 | 2;
  }

  export function detectDuplicateCode(
    code: string,
    options?: { minLines?: number; normalizeIdentifiers?: boolean }
  ): Smell[]
  ```

  **Algoritm (AST-subtradshashning, in-fil):**
  1. Dela koden i rader. Standardtröskel: `minLines = 6` (konfigurabel).
  2. **Typ 1 (exakt klon):** Generera ett glidande fönster av `minLines`-storlek. Normalisera varje fönster: ta bort ledande/avslutande whitespace och tomrader. Hash fönstret med `sha1` (snabb, tillräcklig för likhetssökning — ej för säkerhetsändamål). Samla alla fönster i en `Map<hash, number[]>` (hash → startlinje-array). Fönster med ≥2 träffar rapporteras som `DuplicateCode`.
  3. **Typ 2 (strukturellt identisk med ombyte av identifierare):** Normalisera fönster ytterligare: ersätt alla identifierare (ej nyckelord) med `$ID` via regex `/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g` filtrat mot en nyckelordslista (`if`, `else`, `return`, `const`, `let`, `var`, `function`, etc.). Hash de normaliserade fönstren. Kloner som matchas i typ-2-pass men inte typ-1-pass rapporteras med `description` som anger "strukturell klon (typ 2) — identiska strukturer med oliknamnade identifierare".
  4. Varje `DuplicateCode`-smell refererar till den *första* förekomsten av klonen (lägst `startLine`) och anger `suggestion` med rad-intervallet för alla duplikat.
  5. Severity: `medium` om duplikat-blocket är 6–15 rader; `high` om >15 rader.

  **Designbeslut:** Typ 3-kloner (nära-kloner med tillägg/borttagning) undantas i detta sprint — de kräver edit-distance-beräkning (Jaccard-likhet på token-sekvenser) och ökar komplexiteten avsevärt. Noteras i kod-kommentar som TODO för Sprint 59.

  - Acceptanskriterium:
    - Fixture `unhealthy/duplicate-code.ts` med ett block om 8 rader kopierat 2 gånger inom filen → minst 1 `DuplicateCode`-smell med severity `medium` eller `high`.
    - Fixture `healthy/simple.ts` → 0 `DuplicateCode`-smells (validerar att unik kod inte falskt positivas).

- [ ] [Haiku] **T12: Koppla `detectDuplicateCode()` till TypeScript och Python-analyzerna**

  I `packages/core/src/analyzers/typescript.ts` och `analyzers/python.ts`: importera `detectDuplicateCode` och lägg till i smells-arrayen. Java och Go kan läggas till i nästa sprint då fixtures saknas.

  - Acceptanskriterium: `analyzeCode(codeWithDuplicateBlock, 'typescript')` returnerar ett `Smell` med `type: 'DuplicateCode'`.

- [ ] [Haiku] **T13: Skapa fixture för DuplicateCode**

  - `packages/core/tests/fixtures/unhealthy/duplicate-code.ts`: en TypeScript-fil med ett logikblock om 8 rader (t.ex. validering av ett formulärfält) kopierat tre gånger med olika variabelnamn. Väljs med flit som ett realistiskt scenario (kopia-pasta-driven refaktorering).

---

### Grupp 6: Re-export och integrationstest

- [ ] [Haiku] **T14: Re-exportera nya moduler från `packages/core/src/index.ts`**

  Lägg till exportrader i `packages/core/src/index.ts` för de nya modulerna:
  ```typescript
  export { detectSecuritySinks } from './analyzers/security-sink-detector';
  export { detectExceptionAntiPatterns } from './analyzers/exception-antipatterns';
  export { detectAsyncAntiPatterns } from './analyzers/async-antipatterns';
  export { detectDuplicateCode } from './analyzers/duplicate-code';
  export type { CloneGroup } from './analyzers/duplicate-code';
  ```

  - Acceptanskriterium: `pnpm -r typecheck` passerar utan fel.

- [ ] [Sonnet] **T15: Skriv enhetstester för säkerhetssink-detektorn**

  Fil: `packages/core/tests/analyzers/security-sink-detector.test.ts`

  Tester ska täcka:
  - `pickle.load(f)` på Python → `InsecureDeserializationRisk`, severity `critical`.
  - `yaml.load(data)` utan SafeLoader på Python → `InsecureDeserializationRisk`.
  - `yaml.safe_load(data)` → 0 smells (falsk positiv-kontroll).
  - `fetch(req.query.url)` på TypeScript → `SsrfRisk`.
  - `fetch('https://api.example.com/data')` (literal URL) → 0 smells.
  - `createHash('md5')` → `CryptographicMisuseRisk`, severity `critical`.
  - `createHash('sha256')` → 0 smells.
  - `Math.random()` vid variabeln `token` → `CryptographicMisuseRisk`.
  - `crypto.getRandomValues(buf)` → 0 smells.

- [ ] [Sonnet] **T16: Skriv enhetstester för undantags- och async-detektorerna**

  Fil: `packages/core/tests/analyzers/exception-async-antipatterns.test.ts`

  Tester ska täcka:
  - Tom catch-block i TS → `ExceptionHandlingAntiPattern`.
  - `catch (e) { console.log(e); }` → 0 smells (legitim minimal hantering räcker).
  - `except: pass` i Python → `ExceptionHandlingAntiPattern`.
  - `async function f() { return 42; }` → `AsyncAntiPattern` (`asyncFunctionNoAwait`).
  - `async function f() { const x = await g(); return x; }` → 0 `AsyncAntiPattern`.
  - `return await something()` utanför try/catch → `AsyncAntiPattern`.
  - `new Promise((resolve) => { resolve(42); })` → `AsyncAntiPattern` (saknar reject).

- [ ] [Sonnet] **T17: Integrationstest i MCP-server**

  Fil: `packages/mcp-server/tests/integration/security-sinks.test.ts`

  Verifiera att ett anrop till `analyzeCode()` med en Python-fil innehållande `pickle.load(f)`:
  - Returnerar en `HealthResult` med `score < 10`.
  - Innehåller ett `Smell` med `type: 'InsecureDeserializationRisk'`.
  - Att poängsänkningen är korrekt: ett enda `InsecureDeserializationRisk`-fynd med vikt 1.5 sänker poängen med `1.5 × √1 = 1.5` poäng (score ≈ 8.5 på en annars ren fil).

---

## Beroenden

**Förutsätter:**
- Sprint 28 (Neuro-symbolisk säkerhet): `packages/core/src/security/` — modulerna är separata, men Sprint 58-detektorerna bör inte duplicera `InjectionFinding`-terminologin; de producerar `Smell[]` direkt.
- Sprint 29 (AI-specifika smells): etablerade att lägga specialiserade smells i separata analyzer-moduler som anropas av language-analyzers — samma mönster följs här.

**Kräver inga externa beroenden:** Alla detektorer är regex/string-baserade. `detectDuplicateCode` använder Node.js inbyggda `crypto.createHash('sha1')` för subtradshashning.

**Låser upp:**
- Sprint 59: Cross-fil `DuplicateCode` via `project/duplicate-code-cross-file.ts` + typ 3-kloner.
- Sprint 60: Test-context reachability-filter (vikt-multiplikator 0.3× för säkerhetssinks i test-filer) — minskar brus för testfixturer och blandade kodbaser, vilket roadmapen identifierar som "90–95% noise reduction" ([konvu.com/solutions/reachability-analysis](https://konvu.com/solutions/reachability-analysis)).
- SSRF + deserialisering kan senare enricheras med enkel taint-flödesanalys om `PathTraversalRisk`s nuvarande implementation i `injection-detector.ts` utökas till ett gemensamt taint-lager.

---

## Testplan

```bash
# Enhetstester — core-paketet
pnpm --filter @healthy-ai-code/core test

# TypeScript-typkontroll
pnpm -r typecheck

# MCP-server integrationstest
pnpm --filter @healthy-ai-code/mcp-server test

# Självrevision (kontrollera att projektets egna filer inte flaggas felaktigt)
node scripts/health-audit.mjs
```

**Förväntade utfall:**

| Test | Förväntat resultat |
|---|---|
| `insecure-deserialization.py` → `analyzeFile()` | ≥2 `InsecureDeserializationRisk`, score ≤ 7.0 |
| `ssrf-risk.ts` → `analyzeFile()` | ≥1 `SsrfRisk`, score ≤ 8.5 |
| `crypto-misuse.ts` → `analyzeFile()` | ≥2 `CryptographicMisuseRisk`, score ≤ 8.0 |
| `exception-antipatterns.ts` → `analyzeFile()` | ≥2 `ExceptionHandlingAntiPattern`, score ≤ 8.7 |
| `async-antipatterns.ts` → `analyzeFile()` | ≥2 `AsyncAntiPattern`, score ≤ 9.0 |
| `duplicate-code.ts` → `analyzeFile()` | ≥1 `DuplicateCode`, score ≤ 9.0 |
| `no-crypto-misuse.ts` (healthy) | 0 `CryptographicMisuseRisk`, score ≥ 9.5 |
| `no-async-issues.ts` (healthy) | 0 `AsyncAntiPattern`, score ≥ 9.5 |
| `yaml.safe_load(data)` (in-test) | 0 smells (false-positive-kontroll) |
| `pnpm -r typecheck` | Inga fel — Record<SmellType, number> uttömmande |

---

## Tekniska beslut

1. **Separation från Sprint 28-säkerhetspipelinen.** Sprint 28's `SecurityFindingType` och `StaticFinding`/`AggregatedFinding` är optimerade för det neuro-symboliska audit-flödet (`code_health_security_audit`) med LLM-kostnadsbedömning och SARIF-output. Sprint 58-detektorerna producerar istället `Smell[]` direkt — samma format som alla andra biomarkörer — och integreras i det ordinarie `analyzeCode()`/`analyzeFile()`-flödet. Motivering: att duplicera LLM-pipelinen för varje `analyzeCode()`-anrop vore oproportionerligt kostsamt; rule-baserade detektorer räcker för de call-site-mönster som täcks här.

2. **Viktsättning.** `InsecureDeserializationRisk: 1.5` matchar befintliga kritiska injektionsrisker (`SqlInjectionRisk`, `XssRisk`, `CommandInjectionRisk`). `SsrfRisk: 1.3` är något lägre eftersom heuristiken utan fullständig taint-analys ger fler falska positiver. `CryptographicMisuseRisk: 1.0` sätts konservativt — roadmapen identifierar explicit att "MD5 som cache-nyckel" är ett känt false-positive-scenario som kräver kontextfiltrering innan vikten höjs. `ExceptionHandlingAntiPattern: 0.8` och `AsyncAntiPattern: 0.7` återspeglar att dessa påverkar reliabilitet snarare än direkt säkerhet. `DuplicateCode: 1.0` baseras på att klon-frekvensökning (8,3% → 12,3%) motiverar ett kännbart men inte dominerande straff.

3. **DuplicateCode begränsas till typ 1–2 i Sprint 58.** Typ 3-kloner (redigeringsavstånd-baserade) kräver Jaccard-likhet eller LSH-hashning på token-sekvenser (DECKARD-stil). Implementationskostnaden är oproportionerlig jämfört med typ 1–2 som täcker huvuddelen av AI-genererade copy-paste-kloner. Typ 3 schemalägges till Sprint 59.

4. **`yaml.load` utan `SafeLoader` — approximationsstrategi.** Att korrekt avgöra om `yaml.load(data)` är säkert kräver dataflödesanalys av `data`-variabelns ursprung och `Loader`-parameterns värde. Sprint 58 godkänner approximation: `yaml.load(` utan `SafeLoader` på samma rad flaggas alltid. Falsk positiv-rate för korrekt kod som passerar `Loader=yaml.SafeLoader` inline är låg i praktiken; korrekt use case är `yaml.safe_load()`.

5. **`sha1` för subtradshashning i DuplicateCode.** SHA-1 används som snabb identitetshash för kodfönster, inte för säkerhetsändamål. Detta är en etablerad praxis i clone-detektionsverktyg (CloneDR 1998, DECKARD 2007) och introducerar inget säkerhetsproblem. En kod-kommentar klargör detta för att undvika att `CryptographicMisuseRisk`-detektorn irrationellt flaggar den egna koden (kanariefugeltest inkluderas i `health-audit.mjs`-passet).

---

## Risker och öppna frågor

1. **False-positive-rate för `SsrfRisk`.** Heuristiken "URL-sträng med request-variabelnamn inom 3 rader" är en approximation och kan flagga legitima mönster där URL valideras eller allowlistas innan anropet. Om hälsorevisions-passet (`node scripts/health-audit.mjs`) flaggar projektets egna testfiler bör vikten sänkas till 1.0 eller detektionslogiken skärpas med en `allowlist`/`sanitize`-variabelnamnslista som neutraliserar fynd.

2. **`Math.random()` kontext-heuristik kan missa variabelnamn.** Detektionen av osäker slump i kryptografisk kontext baseras på att söka efter riskfyllda variabelnamn inom 5 rader. Kod som tilldelar `Math.random()` till en intermediär variabel och sedan skickar den till en token-funktion längre bort i koden missas. Detta är ett känt begränsning av single-pass regex-analys; dataflödesanalys krävs för fullständig precision. Öppen fråga: ska vi sänka tröskelns linjeavstånd till 3 rader för att minska false positives?

3. **Prestanda av `detectDuplicateCode()` på stora filer.** Det glidande fönster-algoritmen för typ 1–2 är O(n) per hashning-pass och O(n²) i värsta fall för map-lookup på kollisionsbegränsade fönsterlistor. För filer >2 000 rader bör ett max-radtak introduceras (t.ex. `maxLines: 2000`) för att undvika mätbara fördröjningar i `analyzeCode()`. Öppen fråga: ska vi sätta en hård gräns eller rapportera en varning vid stora filer?

4. **`asyncFunctionNoAwait`-detektion med bracket-balanserare.** Approximationen av funktionskroppens avgränsning via parentesmatchning är känslig för kodformatering (t.ex. inbyggda objekt-literals med krokar som ser ut som funktionskroppar). En full tree-sitter AST-traversering ger bättre precision men kräver att TypeScript-analyzern exponerar sin redan parsade AST istället för att reparsera i `async-antipatterns.ts`. Öppen fråga: ska vi refaktorera TypeScript-analyzern till att skicka med sin AST-referens, eller godta regex-approximationen i v1?
