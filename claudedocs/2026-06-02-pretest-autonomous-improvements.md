# Pre-test autonoma förbättringar — vad MER vi kan göra innan ägaren testar

Datum: 2026-06-02
Scope: ENDAST autonoma åtgärder (ingen 3:e-partsorg, inget ägarkonto, ingen mänsklig adoption). Hämtning av PUBLIK data/dataset över nätet är tillåtet.
Status: brutalt ärlig, ingen hype. Verifierad mot källkoden där det går.

---

## 1. Svar på frågan — kan det bli bättre autonomt?

**Ja. Tydligt ja.** Den tidigare formuleringen "runway exhausted" var för stark och konflaterade två olika saker:

1. **Marginal-VINNANDE drag** (de som flyttar oss från "competitive" till "world-best") — dessa ÄR i huvudsak ägar-gatade. De kräver peer-review, riktiga adopters, OpenSSF/OWASP-filing, ägar-konto-publicering och en statistiskt valid real-agent-RCT. Här finns ingen autonom genväg.

2. **KVALITET / POLISH / KORREKTHET före test** — här finns substantiellt autonomt arbete kvar. Det handlar inte om att vinna en jämförelse; det handlar om att den som öppnar repot inte ska snubbla på undvikbara fel under de första 10 minuterna. Det finns minst tre olika klasser av sådant arbete:
   - **Verifierbara korrekthetsbuggar** vi redan känner till (py-06 slice-off-by-one, ts-08 dropped-await) och en missvisande security-aggregator (stub-confidence 0.5 blandas in med 60 % vikt).
   - **MCP-spec-efterlevnad från 2025–2026** som vi helt saknar: 0 av 30 verktyg har tool-annotations, 2 av 30 har outputSchema, 0 prompts, 0 resources, och 2 verktygsbeskrivningar är på svenska (gör dem nästan osynliga för en engelsk LLM-klient).
   - **Robusthet/säkerhet/UX** där en testare med stor sannolikhet träffar en vägg: ingen path-traversal-guard (bekräftat: 0 träffar på `validatePathWithinRoot`/`realpath` i shared.ts), ingen parse-timeout (bekräftat: 0 `setTimeoutMicros`), ingen inline-suppression (bekräftat: 0), ingen `.npmrc` (bekräftat saknas), O(n²) duplicate-detector som ger flersekunders-latens på vanliga filer.

**Viktig ärlig nyansering** — dessa drag gör produkten *bättre och trevligare att testa*, men de ändrar INTE det grundläggande mätresultatet. Vi är fortfarande "tied at top med lizard på MLCQ, bättre än PMD", behavior-equiv är fortfarande dynamiskt verifierad på 2 av 46 språk, och self-correcting-loopen konvergerar fortfarande ~26–31 % (LLM-driven) / ~0 % (mekanisk) på riktiga mid-complexity-filer. Polish kan inte dölja det. Den ärligaste vinsten av detta sweep är: **färre falska intryck och färre triviala fel vid första kontakt**, plus **två verifierbara korrekthetsfixar (py-06, ts-08)** som faktiskt höjer recall på den labelade korpusen.

---

## 2. Autonoma förbättringar — prioriterade (value × feasibility före test)

Värdering: "value-before-test" = hur stor risk att en testare träffar problemet under sina första interaktioner × hur illa det ser ut. Effort enligt fynden, justerat där jag kunnat verifiera.

### (A) Korrekthet / kvalitet — högst trovärdighetsvärde

| # | Förbättring | Varför FÖRE test | Effort | Autonom |
|---|---|---|---|---|
| A1 | Fixa py-06 slice off-by-one FN (korrelerad parametersyntes: `list`+`int` → `randint(0, len(list)+1)`) | Gate missar tyst en riktig slice-bug; "0 FN på Python-korpus" är annars osant | med | ja |
| A2 | Fixa ts-08 dropped-await FN via statisk detektor (`return await f()` → `return f()`); zero-FP på korpus | Enda kända TS-FN; tar bort KNOWN_MISSES-undantaget | med | ja |
| A3 | Fixa missvisande security-aggregator: när LLM-confidence==0.5 (stub-sentinel), kringgå 60/40-blend och returnera `static_score` + `note: llm_layer not_configured` | Varje SARIF-finding säger "LLM assessment pending (dry-run mode)" och scoren är strukturellt utspädd — ser halvbyggt ut | låg | ja |
| A4 | Utöka gate-malicious-korpus från 4 (endast TS) till ≥10 över 4 språk (Python HardcodedCredential, Go CommandInjection, Java SqlInjection) | "0 % FN" backas idag av 4 TS-exempel; gate-armen är otestad på Python/Go/Java | låg | ja |
| A5 | Strukturell joint-boundary-svep för multiparam-JS/TS (cross-produkt {[],[x],[x,y],[x,y,z]}×{-1,0,1,2,len-1,len,len+1}) + Promise-nesting-depth-spårning | Defensiv täckning för slice/await-klasserna utan slumpberoende | med | ja |
| A6 | Inline-suppression: `// healthy-ai-ignore: SmellType reason`-scanner i analyzeCode() (verifierat: finns inte idag) | En testare träffar en legitim falsk-positiv inom minuter; utan suppression dras slutsatsen "noisy, ej production-ready" | låg | ja |
| A7 | Per-dimension sub-score i HealthResult (complexity/structure/security/organisation/reliability) — summera redan beräknade penalties per grupp | Gör output direkt jämförbar med CodeScene/DeepSource; "varför är filen röd?" besvaras utan att läsa hela smell-listan | med | ja |
| A8 | `.healthyai.json`-loader (`exclude`, `muteSmells`, `weightOverrides`) | Mest efterfrågade ergonomi-feature i alla jämförbara verktyg; utan den måste man forka koden | med | ja |

### (B) MCP best-practice / DX-polish

| # | Förbättring | Varför FÖRE test | Effort | Autonom |
|---|---|---|---|---|
| B1 | Översätt svenska verktygsbeskrivningar/strängar till engelska (code-health-score.ts rad 19 verifierad svensk; explain-code-health.ts, shared.ts, config.ts, core-helpers.ts) | Verktyg med svensk beskrivning blir nära osynliga för engelsk LLM-tool-selection — `code_health_score` och `explain_code_health` väljs aldrig | låg | ja |
| B2 | Lägg tool-annotations (readOnlyHint/destructiveHint/idempotentHint/openWorldHint) på alla 30 verktyg (verifierat: 0 idag) | Klienter behandlar alla 30 som potentiellt destruktiva skriv-verktyg → confirm-dialog vid varje review-anrop i en 20+-iterationers loop | låg | ja |
| B3 | Migrera de 17 legacy-cast-verktygen (`server.tool as unknown as McpToolRegistrar` — verifierat 17 filer/18 förekomster, EJ 23 som ett fynd påstod) till `server.registerTool()` | Förutsättning för att effektivt lägga annotations + outputSchema | med | ja |
| B4 | Lägg outputSchema + structuredContent på loop-kritiska verktyg (code_health_score, pre_commit_safeguard, auto_refactor_apply, verify_refactor, analyze_change_set) | Låter ägaren läsa resultat programmatiskt utan ömtålig JSON.parse av text | med | ja |
| B5 | Registrera 2–3 MCP Prompts (start_refactoring_loop, explain_health_score, security_audit_directory) (verifierat: 0 idag) | Sänker inlärningskurvan; klient-UI visar dem som slash-kommandon | låg | ja |
| B6 | Dokumentera MCP Inspector-väg i README (`npx @modelcontextprotocol/inspector ...`) + uppgradera installer next-steps till verbatim copy-paste-prompt mot värsta filen | Tar bort "jag måste sätta upp Claude Code först"-invändningen; eliminerar tomrum mellan installerat och första interaktion | låg | ja |
| B7 | server-card.json (SEP-1649) i mcp-server-paketet | Registry-upptäckbarhet + levande dokumentation av alla 30 verktyg | låg | ja |

### (C) Dogfooding (self-apply på våra 99 sub-9.6-filer)

| # | Förbättring | Varför FÖRE test | Effort | Autonom |
|---|---|---|---|---|
| C1 | Kör self-correcting-loopen på SÄKRA gula filer (6.0–8.9, endast strukturell bloat): server.ts, smell-instructions.ts, refactoring-loop.ts, debt-goals.ts m.fl. Mål: medel 8.55 → ~8.7–8.8, under-9.6 från 99 → ~80. Kör hela testsviten efter varje fil | Testarens första handling är sannolikt att köra verktyget på vårt eget repo; 99 röda/gula filer underminerar "production-ready" | med | ja |
| C2 | Dokumentera exklusionslista för 9 semantik-tunga filer (js-equiv.ts, js-slice.ts, python-equiv.ts, exception-antipatterns.ts, async-antipatterns.ts, security-sink-detector.ts, plugin-conformance.ts, context-weights.ts, split-residue.ts) som EJ får LLM-refaktoreras | "Teaching the grader to grade itself" — refaktorering här ändrar vad verktyget mäter på all annan kod. OCLint kör sig själv read-only, skriver inte om sin egen motor | låg | ja |
| C3 | Lägg `pnpm self-audit` (eller --ci-flagga) som exit≠0 om medel < 8.5 eller någon grön fil regrederar | Gör self-audit körbar/enforcerbar — bättre demo än någon README-claim | låg | ja |
| C4 | Ärlig self-audit-not i CLAUDE.md/README ("236 filer, medel 8.55, 99 < 9.6; komplexa interna motorer scorar i röda bandet p.g.a. nödvändig algoritmisk komplexitet") | Vänder en trovärdighets-träff till en demonstration av ärlighet | låg | ja |

### (D) Public-dataset-kalibrering (breddning)

| # | Förbättring | Varför FÖRE test | Effort | Autonom |
|---|---|---|---|---|
| D1 | Kör HELA MLCQ-korpusen (9 517 majority-vote, ej 100/smell) genom mlcq-validate.mjs | Kvantifierar GodClass/FeatureEnvy 0-recall i skala; snävar long-method-AUROC-CI från n=87 till n=3000+ | låg | ja |
| D2 | Blind extern validering av SlopsquattingRisk mot Aikido-bloggens namngivna riktiga hallucinerade paket (unused-imports, huggingface-cli, react-codeshift) | "100 % precision/recall" är idag cirkulärt (vi byggde testet mot samma data vi byggde) | låg | ja |
| D3 | Ladda + inspektera DACOS files.zip (Zenodo 7570428); om Java/Python → kör som andra oberoende human-label-AUROC | Verifierar att MLCQ-resultatet inte är en en-dataset-artefakt | med | ja |
| D4 | Ladda Crowdsmelling-orakel (Zenodo 6555241, 2,9 MB) → kör mot GodClass | Isolerar om 0-recall är tröskel-miss eller koncept-mismatch | låg | ja |
| D5 | Skriv refresh-scripts (refresh-package-snapshots.mjs via hugovk top-pypi + wooorm/npm-high-impact; refresh-slopsquatting-corpus.mjs via DepScope daily) + SNAPSHOT_PROVENANCE.md | Gör snapshots reproducerbart byggbara från citerade publika källor — tar bort "registry-dependent" från annexen | låg | ja |
| D6 | Dokumentera ÄRLIGT i docs/calibration/README.md att inget human-labelat Go/TS-smell-dataset finns (jun 2026) | Hindrar framtida bortkastad tid på att leta icke-existerande dataset; ärlig gräns är mer värd än uppfunna proxies | låg | ja |

### (E) Perf / robusthet / säkerhet

| # | Förbättring | Varför FÖRE test | Effort | Autonom |
|---|---|---|---|---|
| E1 | Path-traversal-guard: `validatePathWithinRoot()` i shared.ts, anropas i alla fil-rörande verktyg + `output`-param i architecture-report (verifierat: 0 guard idag) | Mest CVE:ade MCP-klassen (CVE-2025-68143/68145 var exakt detta i Anthropics egen git-MCP); första säkerhetsfokuserade testaren hittar den | med | ja |
| E2 | parser.setTimeoutMicros(3_000_000) före varje parse i Tier A-moduler + early-exit i analyzeCode när totalLines > LARGE_FILE_THRESHOLD (verifierat: 0 timeout idag) | Genererad/minifierad fil → 20+ s hang utan felmeddelande, riskerar MCP -32001 | låg | ja |
| E3 | Skippa detectDuplicateCode i gate-pathen (gate behöver bara security + regression) | O(n²)-detektorn ger 373 ms på 300-radersfil; gate-mål är <50 ms | med | ja |
| E4 | MAX_SINGLE_FILE_BYTES (10 MB) + stat()-pre-check före bare fs.readFile i per-fil-verktyg | Trivial krasch av servern vid stor binär/genererad fil | låg | ja |
| E5 | `.npmrc` med save-exact=true + audit-level=high; `minimumReleaseAge: '3 days'` i pnpm-workspace (verifierat: .npmrc saknas) | Stänger vanligaste MCP-supply-chain-vektorn (Shai-Hulud, mcp-remote CVE-2025-6514) före npm-publicering | låg | ja |
| E6 | Promise.race-timeout (30 s) runt analyzeFile i review/score-verktygen → strukturerad `{error, partial:true}` | Gör pathologiska inputs debugbara istället för 60 s tyst väntan + kryptisk JSON-RPC | låg | ja |
| E7 | isAbsolute-check på HEALTHY_AI_PYTHON/GOPLS/JAVA/REFACTORING_MINER före execFile | Hindrar operatör-misconfig från att bli exploaterbar path | låg | ja |
| E8 | perf-baseline.mjs (10/50/200/500/1000 rader, asserterade budgetar) i CI | Fångar framtida O(n²)-regressioner före skala | låg | ja |

---

## 3. Topp 5 att göra FÖRE test

Rangordnat på (sannolikhet att testaren träffar problemet) × (hur illa det ser ut) × (autonom genomförbarhet). Dessa fem ger mest ärlig avkastning per timme.

**1. Översätt de svenska verktygsbeskrivningarna och användarvända strängarna till engelska. (B1)**
Detta är den enskilt billigaste, högst-värda fixen. Två verktyg (`code_health_score`, `explain_code_health`) är funktionellt osynliga för en engelsk LLM eftersom tool-selection sker på beskrivningen.
*Första steg:* öppna `packages/mcp-server/src/tools/code-health-score.ts` rad 19, byt `'Beräknar en snabb hälsopoäng (1-10) för en fil. Använd detta för snabb screening.'` till engelska; gör sedan samma i explain-code-health.ts, shared.ts (nextAction.instruction), config.ts och core-helpers.ts (LargeFile-smell). Grep-svep: `är|och|för|till|med|Ingen|Beräknar` under `packages/`.

**2. Path-traversal-guard + single-file size-guard. (E1 + E4)**
Den mest CVE:ade MCP-klassen, och verifierat frånvarande (0 träffar på guard i shared.ts). En säkerhetsfokuserad testare hittar `../../../etc/passwd` direkt — och `auto-refactor-apply` *skriver* dessutom (`.bak`), så det är write-anywhere.
*Första steg:* lägg `validatePathWithinRoot(filePath, root)` i `packages/mcp-server/src/tools/shared.ts` (fs.realpathSync + startsWith-check), anropa den i auto-refactor-apply.ts, ai-audit.ts, code-health-review.ts, format-output.ts, knowledge-map.ts och architecture-report.ts (även `output`-param). Lägg regressionstest i tests/integration/.

**3. Fixa py-06 och ts-08 false-negatives. (A1 + A2)**
De två enda kända korrekthetsbuggarna i behavior-equiv-motorn. Att fixa dem gör "0 FN på labelad korpus"-påståendet sant istället för aspirationellt, och tar bort KNOWN_MISSES-undantagen.
*Första steg:* för py-06, lägg en co-occurrence-pass i `packages/core/src/refactor/behavior-equiv/python-equiv.ts` före `_synth_args_rng` — när en `list`-param och en `int`-param samexisterar, dra int:en som `randint(0, len(drawn_list)+1)`. För ts-08, lägg `detectAsyncAwaitDrop(before, after, fnName)` i js-equiv.ts som zero-FP statisk pre-check (`return await f()` vs `return f()`). Ta bort KNOWN_MISSES i js-equiv.test.ts/python-equiv.test.ts när de passerar.

**4. Tool-annotations på alla 30 verktyg + migrera de 17 legacy-cast-verktygen. (B2 + B3)**
Utan annotations kan en klient be om bekräftelse vid varje av de 20+ review-anropen i en loop — stor friktion innan ägaren ens kommit igång. Migreringen är förutsättning för att göra det rent.
*Första steg:* migrera ett verktyg åt gången från `(server.tool as unknown as McpToolRegistrar)` till `server.registerTool()` med ett `annotations`-objekt (readOnlyHint:true, openWorldHint:false för rena analys-verktyg; readOnlyHint:false + destructiveHint:false + idempotentHint:true för set_config/debt-goal). Använd code-health-review.ts som referens. Börja med de 5 loop-kritiska verktygen. (Notera korrekt antal: 17 filer, inte 23.)

**5. Säkra dogfooding-körning på de gula filerna + ärlig self-audit-not. (C1 + C2 + C4)**
Testaren kör nästan säkert verktyget på vårt eget repo först. 99 sub-9.6-filer (medel 8.55, verifierat idag) är en trovärdighets-träff om de är odokumenterade. Att höja ~15 säkra gula filer OCH öppet dokumentera varför de röda motorfilerna är röda vänder detta till en demonstration.
*Första steg:* använd det redan existerande `scripts/run-on-our-code.mjs` som bas, men begränsa till filer i 6.0–8.9-bandet med rent strukturella smells; kör hela testsviten efter varje fil; commit:a EJ utan explicit instruktion. Lägg samtidigt exklusionslistan (9 semantik-filer) och self-audit-noten i CLAUDE.md.

---

## 4. Vad som FORTFARANDE är ägar-gatat

Inget i sweepen ovan rör dessa. De är gränsen mellan "bättre/trevligare att testa" och "bevisat world-best", och de kan inte göras autonomt:

- **OpenSSF/OWASP-filing** och varje formell standardiserings-/intygsprocess hos en 3:e-partsorg.
- **Rekrytering av adopters/maintainers** och varje form av mänsklig adoption.
- **Publicering under ägarens npm-/GitHub-konto** (vi kan förbereda paketet och server-card, men inte publicera).
- **Riktiga användare** och fältvalidering på riktiga produktions-imports (SlopsquattingRisk är fortfarande EJ fältvaliderad — D2 ger blind-extern-validering mot publik data, men inte fält-data).
- **Peer-review** av metod och resultat.
- **En full real-agent gate-on-vs-off-RCT-beslut** i statistiskt valid skala. Den nuvarande loop-konvergensen (~26–31 % LLM-driven / ~0 % mekanisk) och behavior-equiv-täckningen (2 av 46 språk dynamiskt) ändras INTE av polish; de kräver riktig benchmarking i skala, vilket är ägar-/resurs-gatat.

Ärlig sammanfattning av gränsdragningen: **autonomt arbete kan göra MCP:n mätbart korrektare (A1–A4), spec-följsam (B1–B7), robustare/säkrare (E1–E8) och trevligare att testa (C, D) — men det kan inte flytta de fyra grund-claimsen (world-best, fält-validerad slopsquatting, hög loop-konvergens, bred behavior-equiv). Dessa förblir ägar-gatade och ska inte överdrivas.**
