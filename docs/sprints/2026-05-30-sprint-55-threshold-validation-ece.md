# Sprint 55: Tröskelvalidering & ECE — förankra 9.5/9.6 empiriskt

**Datum:** 2026-05-30
**Status:** Planerad

---

## Mål

- Producera ett märkt holdout-dataset (50–100 filer, score-span 8.0–10.0, Python/TypeScript/Go) med mänskliga underhållsbarhetsbetyg och uppmätt LLM-bryt-frekvens, och avgöra empiriskt om 9.5 är rätt tröskel eller om 9.4 räcker.
- Implementera Expected Calibration Error (ECE) i `runValidation` (binning av predikterat score-band mot faktisk smell-förekomst) så att projektet kan påvisa kalibreringskvalitet — inte bara AUROC.
- Beräkna per-språk ROC-kurvetrösklar för Python, TypeScript och Go med Youden J-kriteriet och jämföra mot nuvarande Alves-percentilmetod; publicera resultaten i `docs/calibration/`.
- Leverera en replikerbar multi-språk empirisk validering (Python/TypeScript/Go) som speglar CodeScenes metodik men med öppen data och transparent beräkning — och som kan citeras som motbevis till att 9.5-tröskeln "bara gäller Java".

---

## Bakgrund och motivation

### Problemet med en ovaliderad tröskel

Projektets `AI_READY_THRESHOLD = 9.5` (definierad i `packages/core/src/scoring/weights.ts`) är kalibrerad endast mot Java/Defects4J per `docs/calibration/README.md`. Två oberoende studier placerar AI-säkerhetsklippan *lägre*:

- [CodeScene "Code Red"-studien (arXiv 2203.04374)](https://ar5iv.labs.arxiv.org/html/2203.04374) — 30 737 filer i 39 proprietära kodbaser — finner att grön tröskel = **8.0** (r = −0.58 mot issue-resolution-tid, 15× defekt-differential under 4.0).
- [CodeScenes agentiska benchmark 2026](https://codescene.com/blog/making-legacy-code-ai-ready-benchmarks-on-agentic-refactoring) — AI-tillförlitlighetsklippan = **9.4**.

Det innebär att 9.5 är konservativt men möjligen försvarbart, medan 9.6 är *ovanför* båda publicerade klipporna. De sista 0.1–0.2 poängen köper marginellt mindre defektprevention men kostar många loopitera­tioner och riskerar att fragmentera välstrukturerad kod (LLM-reasoning sweet-spot är CC ≈ 10, inte CC = 1, per [arXiv 2601.21894](https://arxiv.org/abs/2601.21894)).

Roadmap-rekommendationen (sektion "Reaching >9.6, punkt A1") är tydlig: *validera mot ett märkt holdout innan 9.6 låses som mål*. Om bryt-frekvensen är platt mellan 9.4 och 9.6 → sikta 9.4–9.5 och sluta. Detta kan radera hela iterationer ur loopen.

### ECE — det saknade kalibrerings-måttet

`runValidation` (i `packages/core/src/validation/dataset-runner.ts`) rapporterar redan AUROC, Pearson r, Spearman ρ och Mann-Whitney U. Det som saknas är **Expected Calibration Error**: ett mått på om ett predikterat score-band (t.ex. 9.0–9.5) faktiskt stämmer överens med den faktiska andelen felfria filer i det bandet.

[arXiv 2504.12051](https://arxiv.org/abs/2504.12051) (Shahini m.fl., april 2025) visade att JIT-defektmodeller — som är konceptuellt likartade med en regel-baserad hälsoscore — uppvisar ECE på **2–35 %**. Utan ECE vet vi inte om skillnaden 9.3 vs 9.6 är meningsfull eller bara brus. ECE fyller detta gap: det är den kvantitativa beviskedjan som rättfärdigar valet av specifik tröskel.

### Alves-percentil vs ROC-kurvetrösklar

Nuvarande kalibrering för icke-Java-språk faller tillbaka på industristandardsvärden från Sprint 11. [Alves m.fl. (ICSM 2010)](https://webarchive.di.uminho.pt/wiki.di.uminho.pt/twiki/pub/Personal/Joost/PublicationList/AlvesYpmaVisserICSM2010.pdf) använde fyra percentiler (70/80/90/>90) på en benchmark av 100 OO-system för att härleda trösklar. Metoden är välciterad men optimerar inte F1 eller Youden J mot faktiska defektdata — den deriverar trösklar från fördelningen av metrikvärden, inte från felkorrelation.

Per-språk ROC-kurvetrösklar (Youden J = TPR − FPR, maximeras längs kurvan) är bättre anpassade till faktisk defektprediktionsförmåga. [arXiv 2602.06831v1](https://arxiv.org/abs/2602.06831) diskuterar denna distinktion i kontexten av firmware-metrik och visar att percentilbaserade trösklar systematiskt avviker från ROC-optimala trösklar för språk med sneda fördelningar.

### Multi-språk validering som akademiskt motbevis

CodeScene citerar peer-reviewed forskning (r = −0.58, 30 737 filer). Projektets kalibrering är Java-only per `docs/calibration/README.md`. En öppen, replikerbar validering mot Python/TypeScript/Go ger:
1. Akademisk trovärdighet för 9.5-tröskeln bortom Java.
2. Konkurrens­klar­görelse: CodeScene-valideringen är proprietär och författardriven; vår är öppen och reproducerbar.
3. Underlag för den kalibrerings-flywheel som roadmapen identifierar som projektets starkaste långsiktiga moat.

---

## Arkitektur

### Nya filer

```
packages/core/src/validation/
  ece.ts                          — computeECE(): binnar score-band mot faktisk smell-förekomst; EceResult-typ
  per-language-roc.ts             — computePerLanguageRocThresholds(): Youden J per språk; RocThresholdResult-typ

packages/core/src/validation/holdout/
  holdout-builder.ts              — buildHoldoutDataset(): samlar filer, mäter LLM-bryt-frekvens via analyzeCode()
  holdout-types.ts                — HoldoutRecord, HoldoutDataset, LlmBreakRateResult-typ-definitioner
  maintainability-rater.ts        — MaintainabilityRater: läser manuella betyg från JSON, validerar format

scripts/validation/
  build-holdout-corpus.mjs        — CLI: samlar 50–100 källfiler, beräknar score, skriver holdout-corpus.json
  run-ece-validation.mjs          — CLI: kör runValidation + computeECE på holdout-corpus.json, skriver ECE-rapport
  run-per-language-thresholds.mjs — CLI: kör computePerLanguageRocThresholds, skriver per-language-roc.json

docs/calibration/
  holdout-methodology.md          — Dokumenterar holdout-processen, urvalskriterier, betygsättningsprotokoll
  per-language-roc-report.md      — Resultat: per-språk Youden J-trösklar vs Alves-percentilmetoden

packages/core/tests/fixtures/holdout/
  healthy/                        — 15+ källfiler (score 9.0–10.0) i Python/TS/Go
  borderline/                     — 15+ källfiler (score 8.5–9.4) — det kritiska valideringsintervallet
  unhealthy/                      — 15+ källfiler (score < 8.5) för separation
  corpus-labels.json              — Manuella underhållbarhetsbetyg (1–5) + LLM-bryt-frekvens per fil
```

### Ändringar i befintliga filer

- **`packages/core/src/validation/dataset-runner.ts`** — `runValidation()` utökas med ett valfritt `eceOptions`-argument; `ValidationReport`-typen får nya fält `ece`, `ecePerBand`, och `perLanguageRocThresholds`. `computeAggregateStats()` anropar `computeECE()` och `computePerLanguageRocThresholds()` när hållout-data finns.
- **`packages/core/src/validation/index.ts`** — Re-exporterar `computeECE`, `EceResult`, `computePerLanguageRocThresholds`, `RocThresholdResult`, `HoldoutRecord`, `HoldoutDataset` från de nya modulerna.
- **`packages/core/src/index.ts`** — Exporterar `computeECE`, `computePerLanguageRocThresholds` och tillhörande typer i den publika API-ytan.
- **`docs/calibration/README.md`** — Uppdateras med en ny sektion "ECE-validering" och en tabell med per-språk ROC-trösklar efter att Sprint 55 levererat.
- **`packages/core/tests/fixtures/healthy/`** — Nya Python- och Go-fixtur-filer med explicit score-span 9.0–10.0 för holdout-validering.

---

## Tasks

### 1. ECE-beräkning i validerings-pipelinen

- [ ] **[Sonnet] Implementera `computeECE()` i `packages/core/src/validation/ece.ts`**
  - Funktion-signatur: `computeECE(fileResults: ValidationReport['fileResults'], numBins?: number): EceResult`
  - Binning: equal-width bins över score-intervallet [1.0, 10.0]; standard `numBins = 10` ger 0.9-breda band; bin b innehåller filer med score i [1 + (b−1)×0.9, 1 + b×0.9).
  - Per bin: räkna andelen defektfria filer (`cleanFraction`) och medelpoäng (`meanScore`); ECE = Σ(|n_b/N| × |cleanFraction_b − predictedCleanFraction_b|) där `predictedCleanFraction` normaliseras från score (score/10).
  - `EceResult`-typ: `{ ece: number; bins: Array<{ bandLow: number; bandHigh: number; count: number; actualCleanFraction: number; predictedCleanFraction: number; calibrationError: number }> }`.
  - Acceptanskriterium: `computeECE([])`returnerar `ece: 0` utan att kasta; ett dataset med alla filer vid score 10 och inga buggar returnerar `ece < 0.05`.

- [ ] **[Haiku] Re-exportera `computeECE` och `EceResult` från `packages/core/src/validation/index.ts` och `packages/core/src/index.ts`**
  - Lägg till `export { computeECE } from './ece'` och `export type { EceResult } from './ece'` i `index.ts`.
  - Verifiera att `pnpm -r typecheck` passerar utan fel.

- [ ] **[Sonnet] Utöka `ValidationReport`-typen och `runValidation()` i `packages/core/src/validation/dataset-runner.ts`**
  - Lägg till valfria fält i `ValidationReport`: `ece?: EceResult; perLanguageRocThresholds?: RocThresholdResult[]`.
  - I `computeAggregateStats()`: anropa `computeECE(fileResults)` och tilldela resultatet när `fileResults.length >= 10` (för få filer ger meningslösa bins).
  - Uppdatera `interpretation`-strängen att inkludera ECE-siffran: om `ece > 0.15` → "Hög kalibreringsfel (ECE={ece:.2f}) — trösklar bör ses över".
  - Acceptanskriterium: `runValidation(records)` med 20+ poster returnerar ett objekt där `ece` är definierat och `ece.ece` är i intervallet [0, 1].

### 2. Per-språk ROC-kurvetrösklar

- [ ] **[Opus] Implementera `computePerLanguageRocThresholds()` i `packages/core/src/validation/per-language-roc.ts`**
  - Funktion-signatur: `computePerLanguageRocThresholds(records: BugRecord[], fileResults: ValidationReport['fileResults']): RocThresholdResult[]`
  - Algoritm: för varje språk med minst 5 buggiga och 5 rena filer — sweeppa kandidattrösklar T ∈ {unika score-värden} i fallande ordning; beräkna TPR och FPR vid varje T; välj T* = argmax(TPR − FPR) (Youden J-kriteriet).
  - Jämför T* mot Alves-90:e-percentil-tröskeln för samma dataset: `alvesP90 = percentile(scores, 0.90)`.
  - `RocThresholdResult`-typ: `{ language: string; rocOptimalThreshold: number; youdenJ: number; alvesPercentile90: number; thresholdDelta: number; sampleSize: number; buggyCount: number }`.
  - Acceptanskriterium: för ett syntetiskt dataset med tydlig separation (buggiga filer score < 7.0, rena score > 8.5) returnerar funktionen ett `rocOptimalThreshold` mellan 7.0 och 8.5 med `youdenJ > 0.5`.

- [ ] **[Sonnet] Integrera `computePerLanguageRocThresholds()` i `runValidation()` i `packages/core/src/validation/dataset-runner.ts`**
  - Anropa funktionen i `computeAggregateStats()` efter det befintliga `computePerLanguageBreakdown()`-anropet.
  - Tilldela resultatet till `perLanguageRocThresholds` i den returnerade `ValidationReport`.
  - Acceptanskriterium: `runValidation()` med ett blandad-språk-dataset returnerar `perLanguageRocThresholds` med en post per språk som har tillräcklig täckning.

### 3. Holdout-corpus: filinsamling och märkning

- [ ] **[Opus] Designa och implementera `HoldoutRecord`-typer i `packages/core/src/validation/holdout/holdout-types.ts`**
  - `HoldoutRecord`: `{ filePath: string; language: Language; code: string; healthScore: number; maintainabilityRating: number; llmBreakRate: number; smellTypes: SmellType[]; raterNotes?: string }`.
  - `HoldoutDataset`: `{ createdAt: string; totalFiles: number; records: HoldoutRecord[]; scoreHistogram: Record<string, number> }` — `scoreHistogram` grupperar filer i bands `['8.0-8.4', '8.5-8.9', '9.0-9.4', '9.5-9.9', '10.0']`.
  - `LlmBreakRateResult`: `{ filePath: string; breakRate: number; iterations: number }` — representerar andel av N=5 analyskörningar där score sjunker efter ett LLM-redigeringsförsök.
  - Acceptanskriterium: alla typer är korrekta TypeScript (ingen `any`); `pnpm -r typecheck` passerar.

- [ ] **[Sonnet] Implementera `buildHoldoutDataset()` i `packages/core/src/validation/holdout/holdout-builder.ts`**
  - Signatur: `async buildHoldoutDataset(sourceDir: string, labelFile: string): Promise<HoldoutDataset>`.
  - Steg 1: samla `.ts`, `.py`, `.go`-filer rekursivt från `sourceDir` (återanvänd `collectSourceFiles`-mönstret från `dataset-runner.ts`).
  - Steg 2: kör `analyzeCode(code, language, filePath)` på varje fil och filtrera till score-intervallet 8.0–10.0.
  - Steg 3: läs in `labelFile` (JSON med `{ filePath: string; maintainabilityRating: number; llmBreakRate: number; raterNotes?: string }[]`) via `MaintainabilityRater`.
  - Steg 4: merge ihop analysresultat och etiketter; för omärkta filer, sätt `maintainabilityRating: -1` som sentinel.
  - Returnera `HoldoutDataset` med `scoreHistogram` beräknad.
  - Acceptanskriterium: funktionen kastar ett tydligt fel om `labelFile` saknas eller är malformad JSON; returnerar en tom `HoldoutDataset` om `sourceDir` inte finns.

- [ ] **[Haiku] Implementera `MaintainabilityRater` i `packages/core/src/validation/holdout/maintainability-rater.ts`**
  - Klassen laddar ett JSON-schema: `{ filePath: string; maintainabilityRating: number; llmBreakRate: number }[]`.
  - Validerar att `maintainabilityRating` är i [1, 5] och `llmBreakRate` i [0.0, 1.0]; kastar `RatingValidationError` annars.
  - Metod `getLabel(filePath: string)` returnerar etiketten eller `undefined` om sökvägen saknas.
  - Acceptanskriterium: ogiltiga ratings avvisas med ett beskrivande felmeddelande som inkluderar filnamnet.

### 4. Holdout-fixtures

- [ ] **[Sonnet] Skapa holdout-fixtur-filer i `packages/core/tests/fixtures/holdout/`**
  - `healthy/` — minst 5 filer per språk (Python/TS/Go) med förväntad score ≥ 9.0: välstrukturerade, dokumenterade funktioner utan kända smells. Inkludera ett `corpus-labels.json` i katalogen med `maintainabilityRating: 4` eller `5` och `llmBreakRate: 0.0` (ingen break-frekvens i testfixtur).
  - `borderline/` — minst 5 filer per språk med en smell vardera (t.ex. en `ComplexMethod` med CC 12–15 och en `DeepNesting` på nivå 4) och förväntad score 8.5–9.4; `maintainabilityRating: 3`, `llmBreakRate: 0.2`.
  - `unhealthy/` — återanvänd befintliga `packages/core/tests/fixtures/unhealthy/complex.py` och `complex.go`; komplettera med ett `complex.ts`-exemplar med `GodClass`-indikation; `maintainabilityRating: 1`, `llmBreakRate: 0.8`.
  - Acceptanskriterium: `buildHoldoutDataset('packages/core/tests/fixtures/holdout', 'corpus-labels.json')` körs utan fel i ett integra­tionstest och returnerar ≥ 15 poster.

### 5. CLI-skript för validerings-pipeline

- [ ] **[Sonnet] Implementera `scripts/validation/build-holdout-corpus.mjs`**
  - Tar `--source <dir>` och `--labels <file>` och `--out <file>` som argument.
  - Anropar `buildHoldoutDataset()` och skriver resultatet till `<out>` som JSON.
  - Skriver en sammanfattning till stdout: antal filer per score-band, antal omärkta filer.
  - Acceptanskriterium: `node scripts/validation/build-holdout-corpus.mjs --source packages/core/tests/fixtures/holdout --labels packages/core/tests/fixtures/holdout/corpus-labels.json --out /tmp/corpus.json` avslutar med exit-kod 0 och en giltig JSON-fil.

- [ ] **[Sonnet] Implementera `scripts/validation/run-ece-validation.mjs`**
  - Tar `--corpus <holdout-corpus.json>` och `--bins <n>` (default 10) som argument.
  - Konverterar `HoldoutRecord[]` till `BugRecord[]` (mappar `maintainabilityRating < 3` → `hasBug: true`).
  - Anropar `runValidation()` och skriver en tabellformaterad ECE-rapport till stdout med kolumner: `Band | Filer | Faktisk ren-andel | Predikterad ren-andel | Kalibreringsfel`.
  - Flaggar om ECE > 0.10 med en varning: "Hög ECE — trösklar behöver omprövas".
  - Acceptanskriterium: skriptet ger felmeddelande och exit-kod 1 om corpus-filen saknas.

- [ ] **[Sonnet] Implementera `scripts/validation/run-per-language-thresholds.mjs`**
  - Tar `--corpus <holdout-corpus.json>` och `--out <per-language-roc.json>` som argument.
  - Konverterar corpus till `BugRecord[]` och anropar `runValidation()` för att få `perLanguageRocThresholds`.
  - Skriver resultaten till `<out>` och stdout: `Språk | ROC-optimal tröskel | Youden J | Alves P90 | Delta`.
  - Acceptanskriterium: för corpus med Python/TS/Go returneras tre poster i JSON-filen.

### 6. Dokumentation och kalibreringsfil

- [ ] **[Haiku] Skapa `docs/calibration/holdout-methodology.md`**
  - Dokumenterar urvalskriterier för holdout-filerna (score-span 8.0–10.0, balanserad fördelning, tre språk).
  - Beskriver betygsättningsprotokollet för `maintainabilityRating` (1 = oläsbar, 5 = exemplarisk).
  - Definierar `llmBreakRate` operationellt: andel av 5 iterationer av `analyzeCode()` → LLM-redigering → `analyzeCode()` där slutscoren är lägre än startscore.
  - Noterar begränsningarna: fixtur-baserad LLM-bryt-frekvens är syntetisk — verkliga uppmätta värden kräver körning mot en faktisk LLM-agent.

- [ ] **[Haiku] Uppdatera `docs/calibration/README.md`**
  - Lägg till rad för Python och TypeScript i "Coverage"-tabellen med status "Sprint 55 — ROC-trösklar beräknade, ECE-validerade".
  - Lägg till avsnitt "ECE-validering" med en länk till metoddokumentationen och ett exempel på tolkning.

### 7. Enhetstester

- [ ] **[Sonnet] Enhetstester för `computeECE()` i `packages/core/tests/validation/ece.test.ts`**
  - Test 1: perfekt kalibrering — alla filer i band 9.5–10.0 är rena → ECE nära 0.
  - Test 2: systematisk överskattning — alla filer i band 9.0–9.5 är buggiga trots högt score → ECE > 0.4.
  - Test 3: tom indata → `{ ece: 0, bins: [] }` utan undantag.
  - Test 4: `numBins = 5` → 5 bins med bredd 1.8.
  - Acceptanskriterium: alla 4 tester gröna med `pnpm --filter @healthy-ai-code/core test`.

- [ ] **[Sonnet] Enhetstester för `computePerLanguageRocThresholds()` i `packages/core/tests/validation/per-language-roc.test.ts`**
  - Test 1: syntetisk Python-dataset med tydlig separation → `rocOptimalThreshold` i korrekt intervall, `youdenJ > 0.7`.
  - Test 2: dataset med bara ett språk → exakt ett resultat i utdata-arrayen.
  - Test 3: ett språk med < 5 buggiga filer → det språket exkluderas från utdata.
  - Acceptanskriterium: alla 3 tester gröna.

- [ ] **[Sonnet] Integrationstest för holdout-pipeline i `packages/core/tests/validation/holdout-integration.test.ts`**
  - Kör `buildHoldoutDataset()` mot `packages/core/tests/fixtures/holdout/` och verifiera att ≥ 15 poster returneras.
  - Konverterar till `BugRecord[]` och kör `runValidation()` — verifiera att `ece` och `perLanguageRocThresholds` är definierade i `ValidationReport`.
  - Acceptanskriterium: testet passerar utan nätverksanrop och slutar < 10 sekunder.

---

## Beroenden

**Förutsätter levererat:**
- Sprint 18 (kalibrerings-infrastruktur: `calibration-loader.ts`, `calibration/java.json`) — levererat.
- Sprint 26 (SZZ-pipeline, `runValidation`, `buildRecordsFromDirectory`) — levererat.
- Sprint 32 (`runValidation`, `computeAUROC`, `bootstrapAUROC`, `mannWhitneyU`, `pearsonCorrelation`, `spearmanCorrelation`) — levererat.

**Vad detta sprint låser upp:**
- En empiriskt förankrad `AI_READY_THRESHOLD` (möjligen sänkt till 9.4 om ECE-data stöder det) — reducerar antal loop-iterationer utan att kompromissa med kodkvalitet.
- ECE som ett löpande kalibrerings-mått i `runValidation`: kan köras i CI efter varje viktjustering i `weights.ts`.
- Per-språk kalibreringsfiler (`calibration/python.json`, `calibration/typescript.json`, `calibration/go.json`) med ROC-optimala trösklar — möjliggör `useCalibratedThresholds: true` bortom Java.
- Underlag för en akademisk publikation eller teknisk rapport som stärker projektets konkurrensposition mot CodeScene.

---

## Testplan

```bash
# Typkontroll hela monorepon
pnpm -r typecheck

# Enhetstester för core
pnpm --filter @healthy-ai-code/core test

# Enhetstester för mcp-server
pnpm --filter @healthy-ai-code/mcp-server test

# Bygg alla paket
pnpm build

# Kör holdout-corpus-bygget mot fixtur-katalogen
node scripts/validation/build-holdout-corpus.mjs \
  --source packages/core/tests/fixtures/holdout \
  --labels packages/core/tests/fixtures/holdout/corpus-labels.json \
  --out /tmp/sprint55-corpus.json

# Kör ECE-validering mot corpus
node scripts/validation/run-ece-validation.mjs \
  --corpus /tmp/sprint55-corpus.json \
  --bins 10

# Beräkna per-språk ROC-trösklar
node scripts/validation/run-per-language-thresholds.mjs \
  --corpus /tmp/sprint55-corpus.json \
  --out /tmp/per-language-roc.json

# Kör self-audit (befintligt skript, kontrollera att det inte regrederar)
node scripts/health-audit.mjs
```

**Förväntade utfall:**

| Test | Förväntat resultat |
|------|--------------------|
| `pnpm -r typecheck` | 0 fel |
| `pnpm --filter @healthy-ai-code/core test` | Alla tester gröna, inklusive 4+3+1 nya ECE/ROC/holdout-tester |
| `run-ece-validation.mjs` (fixtur-data) | ECE < 0.15 för det syntetiska holdout-setet; varning om ECE > 0.10 skrivs ut |
| `run-per-language-thresholds.mjs` | Tre rader (python/typescript/go) i utdata; `youdenJ` > 0 för alla |
| `node scripts/health-audit.mjs` | Ingen regression i projektets egna hälsopoäng |

**Nya fixtures:**
- `packages/core/tests/fixtures/holdout/healthy/*.{py,ts,go}` (5+ filer per språk)
- `packages/core/tests/fixtures/holdout/borderline/*.{py,ts,go}` (5+ filer per språk)
- `packages/core/tests/fixtures/holdout/unhealthy/*.{py,ts,go}` (minst 3 filer per språk)
- `packages/core/tests/fixtures/holdout/corpus-labels.json`

---

## Tekniska beslut

1. **Equal-width bins för ECE (inte equal-frequency).** Equal-width bins [1.0–10.0] i 10 steg ger direkt tolkbara band (t.ex. 9.0–9.9) som är meningsfulla i produktkontexten. Equal-frequency bins skulle ger bättre statistisk precision men göra resultaten svårare att kommunicera till användare. Avvägning: med ett litet holdout-set (50–100 filer) kan vissa bins vara tomma — tomma bins exkluderas från ECE-summan med en kommentar i koden.

2. **Youden J som ROC-tröskelväljarare.** Youden J = TPR − FPR maximeras utan att explicit anta en kostnadsmatris (false positive-kostnad vs false negative-kostnad). Alternativet är F1-maximering, som implicit väger recall dubbelt. Eftersom defekter i produktionskod är assymetriska (false negative = ohälsosam kod passerar som sund) kan F1 argumenteras för — men Youden J är det mer vedertagna valet i ROC-litteraturen och reproduceras enklare av externa granskare.

3. **`maintainabilityRating < 3` → `hasBug: true` i BugRecord-konverteringen.** Holdout-filer betygsätts 1–5 av en mänsklig granskare. Tröskeln 3 är ett pragmatiskt val: betyg 1–2 = svår att underhålla, betyg 4–5 = välhållbar. Alternativet är att mäta LLM-bryt-frekvens direkt (> 0.3 → buggig), men det kräver verkliga LLM-körningar för ett meningsfullt corpus. I detta sprint används syntetiska LLM-bryt-frekvenser i fixturerna; ett framtida sprint kan ersätta dem med faktiska uppmätta värden.

4. **Fixtur-baserad LLM-bryt-frekvens är syntetisk.** Verklig mätning av LLM-bryt-frekvens kräver en AI-agent, nätverksanrop och en deterministisk testsekvens — det är utanför detta sprints scope. Fixtur-corpus-labels.json innehåller manuellt tilldelade `llmBreakRate`-värden som reflekterar förväntad svårighet baserad på smell-profilen. Dokumenteras explicit i `holdout-methodology.md` för att undvika att testa-resultat läses som faktiska LLM-mätningar.

---

## Risker / öppna frågor

1. **Holdout-storleken räcker möjligen inte för statistisk signifikans per språk.** Med 50–100 filer totalt och tre språk kan per-språk-delmängden bli 15–33 filer per språk. Mann-Whitney U kräver typiskt n ≥ 20 per grupp för stabil p-värdes­uppskattning. Om per-språk-datasetet är för litet ger `computePerLanguageRocThresholds()` trösklar med bred konfidensinterval. Lösning: exponera `sampleSize` och `buggyCount` i `RocThresholdResult` och varna i CLI-skriptet om `buggyCount < 10`.

2. **ECE-mått kräver balanserat dataset för meningsfull tolkning.** Om holdout-filerna är koncentrerade i score-bandet 9.0–10.0 (sannolikt eftersom vi väljer "välskrivna" exempelfiler) kan låg-score-bins vara tomma och ECE understättas. Mitigering: `build-holdout-corpus.mjs` skriver ut en score-histogram och varnar om ett band är tomt; `scoreHistogram` inkluderas i `HoldoutDataset`.

3. **Manuella underhållbarhetsbetyg är subjektiva.** Betygsättningsprotokollet i `holdout-methodology.md` specificerar kriterierna men inter-rater-reliabilitet (Cohen's κ) kräver minst två oberoende granskare. I detta sprint är det en enpersonsgranskare (projektägaren). Öppen fråga: bör vi ta in externa granskare via ett GitHub-issue eller en öppen enkät för att öka reliabiliteten?

4. **Gränsbeslutet 9.4 vs 9.5 beror på kvaliteten i LLM-bryt-frekvens-mätningen.** Roadmap-rekommendationen — "om bryt-frekvensen är platt mellan 9.4 och 9.6, sänk tröskeln" — kan bara göras med tillförlitliga LLM-bryt-data. De syntetiska fixtur-värdena i detta sprint är inte tillräckliga för det beslutet. Sprint 55 levererar infrastrukturen och metoden; det faktiska tröskel-beslutet kräver ett uppföljningssteg med verkliga LLM-körningar (potentiellt Sprint 56 eller som en fristående kalibrerings-session).
