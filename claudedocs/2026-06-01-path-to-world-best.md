# Vägen till världens bästa code-health-MCP

**Datum:** 2026-06-01
**Författare:** Master-plan, syntetiserad ur 141 researchade fynd över 22 dimensioner + faktiska benchmark-körningar (`docs/benchmarks/`).
**Ton:** Senior, evidensbaserad, ärlig. Inga marknadsföringssuperlativ. Varje konkurrenspåstående är förankrat i en faktisk körning eller en citerad källa.

Detta dokument svarar på exakt en fråga: **hur blir vi den enastående, världsbästa code-health-MCP:n** — inte med hype, utan med en sekvenserad strategi, en försvarbar moat och de risker som kan döda oss.

---

## 1. Utgångsläge (ärligt)

Per den faktiska evidensen (`docs/benchmarks/leadership-credibility-report.md`, verifierad av en oberoende re-körning per spår, uppdaterad 2026-06-01) står vi exakt här:

- **Prediktiv kraft (MLCQ, Java).** Vår hälsopoäng ger AUROC **0,688** [0,632–0,741] mot mänskligt märkta code smells. Ett parat DeLong-test slår fast att vi är **statistiskt oavgjorda mot `lizard`** (0,6811 vs 0,6848, p=0,85 — lizard marginellt före i punktskattning) och **bevisat ledande endast mot PMD** (Δ+0,066, p=0,0021, överlever Bonferroni). Sonar-ledningarna överlever inte korrektion. Den tidigare hypotesen att korrekt lizard-metrik skulle vidga vår marginal **motbevisades**. Vi leder alltså fältet på *exakt en* mätbar axel: head-to-head mot PMD.
- **Logiska buggar (Defects4J, Java).** AUROC **0,495** (p=0,91) — slumpnivå. Detta är väntat och korrekt: hälsa mäter underhållbarhet, inte logikdefekter. Vi ska aktivt **inte** hävda att vi är ett buggorakel.
- **Robusthet.** **0 krascher / 0 parse-fel över 12 583 filer / 13 OSS-repos / 10 språk.** Reproducerat av verifieraren. Stark, äkta evidens — men robusthet ≠ "bäst".
- **Den mekaniska loopen.** Svag: **1/55 (2 %)** medelkomplexa filer (poäng 5–8) når 9,5; 84 % rörs inte alls; median-Δ = 0. Säker (0 regressioner) men "gör ingen skada" ≠ "förbättrar".
- **Den LLM-drivna loopen.** Endast ett litet test finns (`claude-refactoring-benchmark.md`, 5 fixturefiler): **20 % fix-rate vs 11,8 % mekaniskt, +2,04 medel-Δ**. Riktning lovande men statistiskt meningslöst urval. **Den riktiga produkten är fortfarande obenchmarkad i statistiskt valid skala.**
- **Kalibrering.** Java-only (Defects4J + MLCQ). De övriga ~45 språken är **obevisade** mot externa etiketter.

Den direkta rivalen **CodeScene** har skeppat en konceptuellt identisk produkt: lokal CodeHealth-MCP, 1–10-score, 9,4 AI-ready-tröskel, self-correcting loop, ~30 språk, peer-reviewat papper (arXiv 2601.02200) som länkar Code Health till AI-refaktoreringssäkerhet, och en publicerad 90–100 %-fix-rate-siffra ([codescene.com/blog](https://codescene.com/blog/making-legacy-code-ai-ready-benchmarks-on-agentic-refactoring)). De äger det vetenskapliga och narrativa försprånget idag.

**Slutsatsen, oförskönad:** vi är **mätbart konkurrenskraftiga, ärligt validerade och bevisat robusta** — och statistiskt säkerställt bättre än PMD i prediktiv kraft mot mänskliga code smells på Java. Vi är **inte** ledande på score-accuracy (oavgjort mot lizard), och vårt kärnvärde — den självkorrigerande loopen — saknar ännu positiv evidens i skala. Varje sats nedan utgår från denna verklighet, inte en marknadsföringsversion av den.

---

## 2. Vinnande tes

**Sluta tävla på poängen. Vi kan inte vinna "bäst score" mot lizard, deep-ensemble-papper (F1 0,88+) eller en peer-reviewad, finansierad rival — och vi behöver inte.**

Den enastående positionen vi *kan* äga, och som CodeScene/Sonar/GitHub **strukturellt inte kan ta**, är en ny kategori:

> **Den oberoende, leverantörsneutrala, deterministiska verifieringsgrinden för AI-genererad kod — med en öppen, auditbar score (OCHS) och en bevisad behavior-preservation-garanti.**

Tre ord bär tesen: **enforced, open, verified.**

- **Enforced, inte advisory.** CodeScenes och Sonars loopar är *pull* — agenten måste frivilligt anropa review inuti ett prompt-styrt workflow. En snabb/billig modell routar runt det. Vår score är synk, lokal, <100 ms på en funktion — exakt formen en Claude Code `PreToolUse`-hook behöver för att *blockera en dålig edit innan den landar*. Ingen rival skeppar en harness-nivå-deny.
- **Open, inte proprietär.** CodeScenes affärsmodell *förbjuder* dem att öppna formeln — metriken *är* deras moat. Vår enda icke-kopierbara differentiator är radikal transparens: hela `weights.ts`, alla 43 biomarkördefinitioner, trösklarna, ISO 25010-mappningen, publicerade som en versionerad spec (OCHS) med ett conformance-kit. En stängd inkumbent kan inte följa efter utan att kannibalisera sig själv.
- **Verified, inte bara "snyggare".** 19–35 % av LLM-refaktoreringar är funktionellt icke-ekvivalenta, och ~21 % av brotten slinker förbi befintliga tester ([arXiv 2602.15761](https://arxiv.org/abs/2602.15761)). CodeScene verifierar korrekthet endast genom att köra *befintliga* tester — blint på low-coverage legacy, som är majoriteten av marknaden. Ingen code-health-MCP skeppar behavior-equivalence-verifiering på otestad kod.

**The wedge:** vi gatear på **delta, inte absolut score** — blockera bara när editen gör filen *sämre*. Det undviker den false-positive-trötthet som får hooks avstängda dag ett, och det är något en rå lint-i-en-hook inte kan. Ovanpå det: AI-native biomarkörer (slopsquatting, LLM-integration-smells, AI-SATD) som ingen general health-tool har koncept för.

**Varför vi kan vinna detta:** modelleverantörer (Anthropic, OpenAI, GitHub) är **strukturellt jäviga** att döma sin egen output — dokumenterad reward-hacking av både Codex och Claude Code i EvilGenie-benchmarken (hack-rate 36–75 %). En oberoende, deterministisk, reproducerbar grind är precis det de inte kan vara, och det en stängd rival inte kan öppna. Det är den enda durabla asymmetrin vi har.

---

## 3. De 5 definierande satsningarna

Rankade på `försvarbarhet × genomförbarhet-inom-12-mån × first-mover`. Tillsammans gör de oss bäst; var och en attackerar en axel där öppen/lokal är strukturellt överlägsen.

### Sats 1 — Den deterministiska delta-gating-hooken (`@healthy-ai-code/gate`)

- **Vad:** En cross-harness-hook (Claude Code `PreToolUse` + Cursor-adapter) som scorar den *föreslagna* filändringen innan den landar och returnerar `hookSpecificOutput.permissionDecision: "deny"` (med en självkorrigeringsorsak) endast när editen sänker filen under golvet eller inför en säkerhets-/LLM-integration-smell.
- **Varför försvarbart:** harness-nivå-enforcement är kategoriskt starkare än ett prompt-styrt workflow och kräver inget frivilligt agentanrop. Delta-gating (via `analyzeChangeset`) är det som skiljer ett verktyg man behåller från ett man stänger av.
- **Varför vi kan vara FÖRST:** CodeScenes och Sonars loopar är advisory pull. Ingen skeppar en deterministisk block-before-land. Vår score har redan rätt latensform.
- **Första konkreta åtgärd:** bygg v0.1 med Claude Code-adapter, `analyzeChangeset`-delta-gating, **strukturerad-JSON-deny-väg (inte exit-codes** — täcker [claude-code#21988](https://github.com/anthropics/claude-code/issues/21988) där exit-codes ignoreras), plus ett install-tids self-test som verifierar att en känd-dålig edit faktiskt blockeras på den installerade versionen. Degradera graciöst till `PostToolUse`-coaching när block inte går att genomdriva.
- **Owner-typ:** DevOps/backend-ingenjör (harness-integration, plattformsfragilitet).
- **Success-metrik:** känd-dålig edit blockeras på ≥2 harness-versioner i conformance-self-testet; false-positive-rate <5 % på en delta-korpus av legitima edits.

### Sats 2 — Behavior-equivalence-verifiering i refaktoreringssteget

- **Vad:** Ett nytt verktyg `code_health_verify_refactor(before, after, language)` som returnerar en *beteende-ekvivalens*-dom, inte bara en health-delta. Två lager: (1) billig statisk klassificering (RefactoringMiner 3.1.4, F1 99,7 %, + smell-diff); (2) dyr dynamisk — syntetisera karakteriseringstester från `before`, differential-fuzza `before` vs `after`, rapportera PASS / DIVERGENCE / UNVERIFIED. De syntetiserade testerna lämnas tillbaka till användaren som en gratis regressionssvit.
- **Varför försvarbart:** detta är den enda moat CodeScene *strukturellt saknar* — de är health-only och blinda på otestad legacy. Vi vänder en kill-risk (tysta brott) till en differentiator.
- **Varför vi kan vara FÖRST:** ingen code-health-MCP syntetiserar de saknade testerna *inuti* loopen. Hela fältet namnger "lägg till tester först" som blockeraren.
- **Första konkreta åtgärd:** kör en **2-veckors feasibility-spike** på det svåraste problemet — differential-exekvering + neutralisering av icke-determinism (I/O, tid, slump) för TS/JS + Python — mot de 20 kända icke-ekvivalenta refaktoreringarna i [arXiv 2602.15761](https://arxiv.org/abs/2602.15761). Bygg verktyget endast om spiken fångar brotten.
- **Owner-typ:** Python/TS-expert + quality-engineer (sandbox, nondeterminism).
- **Success-metrik:** detekterar ≥80 % av de tysta beteendebrott som befintliga testsviter missar, på TS/JS + Python. Övriga 44 språk märks ärligt **"static-equivalence only (advisory)"** — överclaim "alla 46 språk bevisat säkra" är kill-risken här.

### Sats 3 — Open Code Health Score (OCHS) v0.1: öppen spec + conformance-kit

- **Vad:** Publicera scoringmatten (`10 − Σ weight×√count`, golv 1,0), varje vikt, alla 43 biomarkördefinitioner och en conformance-testsvit som ett fristående versionerat MIT/CC-licensierat spec-dokument — explicit mappat till ISO/IEC 25010 underhållbarhets-underkaraktäristika.
- **Varför försvarbart:** den enda differentiator en stängd, peer-reviewad rival **inte kan kopiera**. Bevismodellen finns: OpenSSF Scorecard är en öppet styrd 0–10-score som blev default-infrastruktur ([openssf.org/projects/scorecard](https://openssf.org/projects/scorecard/)).
- **Varför vi kan vara FÖRST:** Borg/Tornhill-papperet etablerar vetenskapen men föreslår medvetet **ingen** portabel standardiserad score (arXiv 2601.02200). CodeScene open-sourcade plumbingen men aldrig formeln. GitHub Code Quality är opakt.
- **Första konkreta åtgärd:** lyft `packages/core/src/scoring/weights.ts` + biomarkördefinitionerna till ett versionerat spec-dokument med en mappningstabell biomarkör → ISO 25010, och packa om de befintliga testfixturerna som conformance-kit. Inkludera en **valideringsappendix som öppet redovisar MLCQ-oavgjordheten mot lizard och Defects4J-nollresultatet** — radikal auditbarhet är varumärket.
- **Owner-typ:** technical-writer + system-architect.
- **Success-metrik:** spec publicerad; ≥1 tredjepartsverktyg kan emittera en OCHS-conformant score; determinism-regressionstest grönt i CI (identisk score för repo-hash+version i 100 % av körningar).

### Sats 4 — SlopsquattingRisk-biomarkör med live registry-validering

- **Vad:** Parsa import/require/use i Tier-A-AST, flagga paket som (a) saknas i lockfilen, (b) matchar DepScope-hallucinationskorpusen, (c) är typosquat-distans till ett populärt paket, eller (d) returnerar 404 / först-publicerades <90 dagar sedan vid en live registry-check.
- **Varför försvarbart:** slopsquatting är ett namngivet, CSA-dokumenterat, aktivt utnyttjat 2026-supply-chain-hot (~20 % hallucinationsrate; 43 % reproduceras varje körning, [CSA Research Note apr 2026](https://labs.cloudsecurityalliance.org/wp-content/uploads/2026/04/CSA_research_note_slopsquatting-ai-supply-chain_20260419-csa-styled-1.pdf)). Inget större kodkvalitetsverktyg (Sonar, CodeScene, DeepSource, Codacy) skeppar detektion. SCA-verktyg (Snyk, Socket) jobbar på registernivå, inte AST-nivå knutet till en health-score.
- **Varför vi kan vara FÖRST:** detta är det tydligaste, smalaste "world-first"-claimet som faktiskt är sant. En underhållen korpus finns redan att matcha mot.
- **Första konkreta åtgärd:** skeppa `SlopsquattingRisk` (vikt 1,5, paritet med `SqlInjectionRisk`) som lockfile-diff + DepScope-korpusmatch för Tier-A-språk; live-registry-validering (npm/PyPI 404, 24h-cache, opt-in för air-gapped) i v2.
- **Owner-typ:** security-engineer.
- **Success-metrik:** detektionsprecision ≥85 % på DepScope-korpusen; <1 % false-positive på ett verifierat lockfile-korpus; 0 nätverksanrop när opt-out är satt.

### Sats 5 — Den öppna, reproducerbara loop-/gate-benchmarken (Lager B + gate-on-vs-off-RCT)

- **Vad:** Instrumentera den **LLM-drivna** loopen att emittera `{biomarkörvektor, score-delta, diff, bröt-tester, språk}` per iteration. Kör (a) Lager B: % filer som når 9,5 + test-pass-rate per komplexitetsdecil på ≥500 filer; (b) en gate-on-vs-gate-off-RCT: samma agent, samma N filer, samma budget, med/utan vår deterministiska grind, mät minskning i (återställda edits, nyintroducerade smells, filer kvar <9,4). Publicera rådata + metodik på GitHub.
- **Varför försvarbart:** detta är det enda som konverterar "mätbart konkurrenskraftig" till ett försvarbart mekanism-anspråk — "enforced gating *minskar mätbart* osunda AI-edits" — som CodeScenes advisory pull-loop strukturellt inte kan göra.
- **Varför vi kan vara FÖRST:** CodeScenes Lund-studie bevisade vetenskapen men publicerade *inte* den longitudinella `{pre, vektor, diff, post, bröt-det}`-tupeln — deras stängda modell förbjuder det. Vi sitter på den genererande processen.
- **Första konkreta åtgärd:** välj korpus (Defects4J-delmängd med befintliga testsviter), skriv harness som loggar per loop-iteration, kör den **mekaniska loopen som baslinje denna sprint**, lägg sedan LLM-loopen ovanpå.
- **Owner-typ:** quality-engineer + performance-engineer (LLM-API-spend, statistik).
- **Success-metrik:** publicerad benchmark med n≥500; LLM-loopen når **>60 % på medelkomplexa filer med bevarad korrekthet (≥95 % test-pass)**; gate-on slår gate-off statistiskt signifikant. **Ärlig disciplin: om gate-on inte slår gate-off publicerar vi det och pivoterar — inget hype-tal.**

---

## 4. Sekvenserad plan

Sekvensen respekterar beroenden: spec + biomarkörer + gate är oberoende och kan parallelliseras; benchmarken kräver att loopen är instrumenterad; flywheelen kräver adoption (gate + installer) först.

### 30 dagar — grundbultar (billigt, hög säkerhet)

| Leverabel | Metrik som bevisar den |
|---|---|
| **OCHS v0.1-spec publicerad** (Sats 3) — formel, 43 biomarkörer, ISO 25010-mappning, valideringsappendix med ärlig MLCQ/Defects4J-redovisning | Spec live på GitHub; determinism-regressionstest grönt i CI |
| **`SlopsquattingRisk` v1** (Sats 4) — lockfile-diff + DepScope-match, Tier-A | ≥85 % precision på DepScope; 0 nätverk vid opt-out |
| **`@healthy-ai-code/gate` v0.1** (Sats 1) — Claude Code-adapter, delta-gating, strukturerad-JSON-deny, conformance-self-test | Känd-dålig edit blockeras i self-testet på installerad version |
| **`npx @healthy-ai-code/init`** — en-kommandos-installer, <60 s till första score, funnel-telemetri | install→first-score-event loggat; medianinstalltid <60 s |
| **Fix av dokumenterade defekter** — korrigera lizard-metriken i `competitive-benchmark.md` till max-CCN (0,659/oavgjort), regenerera fullt `field-reliability/results.json`, byt stale `budget_tokens` i CLAUDE.md (ger 400 på Opus 4.8) | `git grep budget_tokens` tomt; benchmark-doc reproducerbar |

### 90 dagar — det kritiska narrativ-fönstret

| Leverabel | Metrik som bevisar den |
|---|---|
| **Lager B-loop-benchmark publicerad** (Sats 5) — LLM-loopen på ≥500 filer, öppet dataset + harness + rådata | n≥500; %≥9,5 + test-pass per decil rapporterat ärligt |
| **Gate-on-vs-gate-off-RCT, pilot** (Sats 5) — 50 medelkomplexa filer, en modell | tre utfallsmått (återställda edits, nya smells, filer <9,4) mätta |
| **Behavior-equivalence feasibility-spike klar** (Sats 2) — TS/JS + Python mot arXiv-2602.15761-korpusen | spiken fångar ≥80 % av de 20 kända brotten, *annars* dokumenteras "static-only" och vi pivoterar |
| **LLM-integration-smells (UMM/NMVP/NSM/NSO/TNES)** — `analyzers/llm-integration.ts`, vikt ~1,0–1,2 | 86 %-precisionsmål replikerat på SpecDetect4AI-fixturer |
| **arXiv-preprint: öppen, fler-språkig Concordia-/AI-friendliness-detektor** — operationalisera arXiv 2605.02741-taxonomin, validera mot Zenodo 10.5281/zenodo.19245562 | preprint uppe inom 90 dagar (kritiskt: om en akademisk grupp skeppar Concordia-detektorn först är first-mover-positionen borta) |
| **`code_health_attest`** (EU AI Act Art. 12) — signerad JSON `{timestamp, filePath, toolVersion, score, smells[], thresholdPassed}` + SARIF/CycloneDX-export | verktyg live före 2 aug 2026-deadline; säljs som *controls evidence*, inte risk prediction |

### 180 dagar — moat-byggande

| Leverabel | Metrik som bevisar den |
|---|---|
| **`code_health_verify_refactor` GA** (Sats 2) — dynamisk equivalence för TS/JS + Python, syntetiserade tester som artefakt | ≥80 % tyst-brott-detektion; övriga språk märkta advisory |
| **Calibration data-flywheel live** — opt-in, content-free `{vektor, delta, diff-stats, bröt-tester, språk}`, lokal append-only-logg med "vad skickas"-vy | hård opt-in default off; integritetsfuzz 44/44 grönt; första aggregat insamlade |
| **Biomarker-plugin-API v0.1** — fryst JSON-schema (matchers, vikt, språk, testfixturer), no-CLA, automatiserad TP/TN-CI-validering | ≥3 founding ecosystem-partners; sub-24h automatiserad review |
| **Fri GitHub Action: merge-gate på health-regression** — `analyzeChangeset` på diffen, blockerar under konfigurerbart golv, öppen formel visad | platform-neutral (GitHub/GitLab); badge driver organiska installs |
| **Multi-språk kalibrering: Python + TS** — BugsInPy/PySmell + TS, AUROC/precision/recall per språk publicerat | ärligt rapporterat; ingen "validerad över 46 språk"-överclaim |

### 365 dagar — kategori-auktoritet

| Leverabel | Metrik som bevisar den |
|---|---|
| **Gate-on-vs-gate-off-RCT i full skala** (Sats 5) | statistiskt signifikant minskning av osunda AI-edits, eller publicerad pivot |
| **HealthBench — levande, daterat, fler-språkigt dataset** — LiveCodeBench-format, kvartalsvisa DOI-pinnade snapshots, privat eval-server mot kontamination | Q-snapshot med fryst DOI; inter-rater-kappa rapporterad |
| **"Code Health Refactoring Leaderboard"** — ny otävlad kategori (health-delta under behavior-preservation), publik HuggingFace Space + privat eval-server | ≥1 rival (lizard/PMD/Sonar) submittar — varje deltagare legitimerar vårt dataset som ground truth |
| **Neutralt governance-hem ansökt** (OpenSSF/CISQ/LF sandbox) + 2–3 namngivna externa validatorer | ansökan inne; medförfattare rekryterade |
| **Venue-acceptans** — Concordia/AI-friendliness-papper till SANER/MSR/FORGE 2027; HealthBench till NeurIPS D&B | submission inne |

---

## 5. Moaten

Mot alla fyra hot (commoditisering, finansierad rival, ekosystem-churn, obevisad loop) konvergerar mitigeringen på **samma två saker** — ett gott tecken på att de är rätt. Algoritmen är **inte** moaten; den kan forkas. Moaten är kombinationen som compoundar:

1. **Data/verifierings-flywheel.** Vår LLM-loop emitterar naturligt `{pre-kod, biomarkörvektor, AI-diff, post-kod, post-score, bröt-det}` på varje iteration — exakt den longitudinella tupel CodeScenes Lund-studie bevisade men **aldrig publicerade** (deras stängda modell förbjuder det). Plus behavior-equivalence-verifiering på otestad kod, som växer korpusen för varje körning. **Hur det compoundar:** fler installs → fler tupler → empiriskt kalibrerade AI-native-vikter (fyller litteraturens uttalade gap: "AI-native smell-trösklar är inte kalibrerade för LLM-karaktäristik", arXiv 2605.02741) → bättre gate → fler installs. En stängd vendor är bunden av betalande kunder; ett lokalt, opt-in, open-data-verktyg kan ackumulera en *större* fler-språkig korpus.

2. **Öppen standard + conformance-registret.** OCHS-specen + conformance-kitet + ett neutralt governance-hem + namngivna externa validatorer. **Hur det compoundar:** auktoritet i forskning är social och kumulativ (citeringsnätverk), inte högst AUROC — SWE-bench blev kanon genom ICLR + öppen leaderboard, inte genom mest exakt. Auktoritet uppnås den dag en tredjepart publicerar ett papper som *analyserar vår* benchmark. Vi designar därför datasetet för att vara värt att analysera (publicerad annoterings-metodik, inter-rater-kappa, språkdistribution, eval-harness på npm/PyPI).

**Varför CodeScene inte kan matcha det:** deras affärsmodell *kräver* att metriken förblir proprietär — radikal transparens skulle kannibalisera dem. Deras SaaS-arkitektur stänger ute reglerade/air-gapped-kunder där vår zero-egress-lokala modell är ett strukturellt övertag (EU AI Act Art. 12, CRA, FedRAMP). Och deras stängda modell förbjuder dem att släppa flywheel-datasetet. Asymmetrin *är* strategin.

**Ärlig begränsning:** flywheelen compoundar bara vid install-skala, så den hänger på att Sats 1 (gate) + installern landar först. Och det öppna datasetet kräver en akademisk medförfattare för citeringslegitimitet — den långsamma, icke-tekniska flaskhalsen. Öppenhet inbjuder forkning; moaten måste vara nätverket runt benchmark/dataset + governance-hemmet, aldrig algoritmen.

---

## 6. First-mover-spel (ta nu)

Rankade efter försvarbarhet och hur snabbt fönstret stänger:

1. **arXiv-preprint för en öppen, fler-språkig Concordia-/AI-friendliness-detektor — inom 90 dagar.** Det kritiskaste draget. Concordia-papperet (arXiv 2605.02741) listar *själv* gapen (ingen integrerad detektor, bara Python, ett agent-ramverk). Om en akademisk grupp skeppar detektorn före oss är hela first-mover-positionen borta. Snabbhet slår polish.
2. **SlopsquattingRisk med live registry-validering.** Tydligaste, smalaste "world-first"-claimet som är sant. Inget kodkvalitetsverktyg gör AST-nivå-importvalidering knuten till en health-score. Fönster ~12–18 mån innan Sonar bygger motsvarande.
3. **Deterministisk delta-gating-hook.** CodeScene/Sonar är advisory pull. Den generiska "lint-i-en-hook"-sloten commoditiseras inom månader (SonarQube skeppade redan en PostToolUse-plugin) — vårt försprång är delta-gating + AI-native-biomarkörer, inte plumbingen. Ta sloten nu.
4. **`code_health_attest` före 2 aug 2026.** EU AI Act Art. 12-loggning aktiveras då; ingen code-health-MCP ramar sin output som en Art. 12-logg eller AI-BOM-fragment. CodeScenes SaaS är strukturellt blockerad i reglerade miljöer. Säljs som controls evidence.
5. **ComplexityMassConcentration-biomarkören.** SlopCodeBench (arXiv 2603.24755) definierar strukturell erosion med formeln `mass(f)=CC(f)×√SLOC(f)` — som oberoende re-deriverar vår √-baserade matematik. Citerbar tredjepartsvalidering av vår kärnmekanik; pure aggregation över befintlig per-funktions-CC/SLOC. Dagar, inte veckor.

**Var vi INTE ska slåss:** "code health score"-kategorin (CodeScenes hemmaplan, peer-reviewad), AI PR-review (commoditiserat av Anthropic/OpenAI/GitHub — vi kan inte utspendera $15–25/PR), portfölj-dashboards (SIG/Sonar/Gartner-territorium), högre MLCQ-AUROC (förlorat lopp mot deep-ensemble F1 0,88+).

---

## 7. Kill-risks & mitigeringar

### Risk 1 — Modell-/plattformskommoditisering (sannolikhet HÖG, impact EXISTENTIELL)

Anthropic (multi-agent Code Review, intern substansgranskning 16 %→54 %), GitHub Code Quality (org-dashboards, kan auto-avvisa PR) och Sonar levererar redan gratis, inbäddad kodkvalitet i agenten. Om Sonar eller GitHub lägger till en 1–10-score + loop kollapsar vår differentiering över en natt.

**Vårt svar (strukturellt, inte önsketänkande):** en modell **kan inte vara neutral domare över sin egen output** — dokumenterad reward-hacking av Codex och Claude Code (EvilGenie, 36–75 %). Vår öppna, deterministiska formel (samma input → samma score, auditbar) är här en *tillgång*: den enda en revisor, försäkringsgivare eller M&A-köpare kan citera, och den enda en modelleverantör är strukturellt avskräckt från att bygga. Ompositionera från "AI-granskare" till "den oberoende, leverantörsneutrala, deterministiska grinden som *betygsätter* agentens output — inklusive dess egen självgranskning". Attackera GitHubs luckor specifikt: 40 språk bortom deras 6, platform-neutralitet, öppen score vs deras CodeQL-black-box, AI-native-biomarkörer CodeQL saknar. **Ärlig svaghet:** vårt "deterministiska ankare" undergrävs av att vår AUROC (0,688) bara är i nivå med lizard. Ett svagt ankare är den verkliga kill-risken — validitetsförbättring (Sats 5, multi-språk-kalibrering) är inte valfri.

### Risk 2 — CodeScene pressar oss på narrativet (sannolikhet HÖG att pressa, MÅTTLIG att radera)

De äger den akademiska trovärdigheten och en citerbar 90–100 %-siffra. **Vårt svar:** sluta tävla på score-accuracy (vi vinner inte — oavgjort med lizard). Vinn på de tre axlar de strukturellt inte kan matcha: öppen formel, behavior-equivalence på otestad kod, compliance-inramning. **Ärlig svaghet:** "vi fixar, de diagnostiserar" är bara sant om vår loop fungerar — och den mekaniska når 9,5 på 2 %. LLM-loopen *måste* bevisas på en publik benchmark (Sats 5) **innan** vi leder med exekvering. Annars är trovärdighetsskadan värre än att aldrig ha hävdat det.

### Risk 3 — Loopen är obevisad (sannolikhet HÖG idag, impact HÖG)

RefactorBench: 12–35 % på multi-fil, 0 % på 6+ filer (arXiv 2503.07832). SmellBench: bästa agenten löser 47,7 %, den aggressivaste *inför* 140 nya smells (arXiv 2605.07001). Vår mekaniska loop: 2 %. **Vårt svar:** RefactorBench-felet är *state-degradation* — agenten tappar kodbastillstånd efter sekventiella edits; explicita tillståndsrepresentationer stänger 44 % av gapet. Vår loop *ger* agenten en persistent tillståndssignal (score efter varje edit). Men detta är ett *påstående* tills Sats 5 publicerar kontrollerad data. **Den verkliga moaten kring loopen är inte loopen — det är dataspåret den genererar.**

### Risk 4 — MCP-/hook-skörhet (sannolikhet LÅG–MÅTTLIG, impact LÅG–MÅTTLIG)

MCP-protokollet är standardiserat (Linux Foundation Agentic AI Foundation, dec 2025) — ingen protokoll-churn-risk. De verkliga riskerna: (a) registrets kvalitetsgolv höjs (bara 12,9 % når "high trust") — mitigering är ren hygien (README, typade scheman, semver); (b) hook-enforcement är version-skör ([#21988](https://github.com/anthropics/claude-code/issues/21988)) — mitigering är strukturerad `permissionDecision`-väg + self-test (Sats 1); (c) vi är själva en supply-chain-attackyta (OX Security förgiftade 9/11 MCP-register apr 2026) — signera npm-releaser med publicerade SHA-256-hashar.

---

## 8. Hur vi VET att vi är bäst

Tre lager. Vi hänger **aldrig** "bäst" på detektions-AUROC — det är ett förlorat lopp och fel mätetal för en refaktoreringsgrind.

### Lager A — Robusthet & reproducerbarhet (redan vårt; gör citerbart)

| Metrik | Målnivå | Instrumentering |
|---|---|---|
| Kraschfri körning | 0 krascher över **≥15 000 filer / ≥12 språk** (utöka från 12 583/10) | `scripts/health-audit.mjs` över top-1000 GitHub-repos |
| Determinism | Identiskt score för (repo-hash + version) i **100 %** | Hash-pinnad CI-regressionstest, kör korpus två gånger, diffa |
| Öppen formel-täckning | **100 %** av 43 biomarkörer har publicerad regel + vikt + fixtur | OCHS v0.1-spec |

### Lager B — Loop-utfall (publiceras inom ~90 dagar)

| Metrik | Målnivå | Instrumentering |
|---|---|---|
| % filer som når ≥9,5 (LLM-loop) | **>60 % på medelkomplexa filer MED bevarad korrekthet** (rapporteras per decil; mekaniskt är 2 %) | `runRefactoringLoop` på publik korpus, score-delta/iteration |
| Korrekthetsbevarande (test-pass) | **≥95 %** av accepterade refaktoreringar passerar befintliga tester | före/efter-testkörning på korpus med testsviter |
| Strukturell vs kosmetisk | Extract-Method-till-Rename-ratio som visar djupa ändringar (ostyrda agenter: ~0,00 median design-smell-delta, arXiv 2511.04824) | smell-delta-räkning per iteration |
| Tid-till-AI-ready | Score-delta-tidsserie per iteration (mått vi äger) | `{iteration, score}`-logg |

### Lager C — Det som faktiskt bevisar ledarskap

| Experiment | Vinnbart anspråk | Målnivå |
|---|---|---|
| **Gate-on vs gate-off RCT** | "enforced gating minskar mätbart osunda AI-edits" — något CodeScenes advisory pull strukturellt inte kan hävda | statistiskt signifikant minskning i återställda edits / nya smells / filer <9,4 |
| **Öppen AI-friendliness-replikering** (Borg/Tornhill, multi-språk, riktiga repos) | vår score blir den öppna, citerbara definitionen av "AI-readiness" | Spearman + AUC per health-decil, ≥10 språk |
| **SlopCodeBench-motbevis** | score-feedback sänker erosionsfrekvensen | erosion i agent-trajektorier 77 %→<40 % |
| **Behavior-equivalence-detektion** | TS/JS + Python | ≥80 % av tysta brott som testsviter missar |

**Vad vi explicit INTE sätter som ledarmål:** högre MLCQ-AUROC (förlorat lopp), bug-orakel-anspråk på Defects4J (nära slumpen — väntat), bredd som bevis (43 biomarkörer / 46 språk är en feature-lista, inte ett bevis).

**Beslutsregeln:** vi får hävda "världsbäst" först när Lager A är fryst-citerbart, Lager B är publicerat med n≥500 och >60 %/≥95 %-målen nådda, OCH minst ett Lager C-experiment vunnits offentligt. Innan dess är formuleringen "mätbart konkurrenskraftig, ärligt validerad, bevisat robust — och statistiskt säkerställt bättre än PMD" den enda vi får använda.
