# Vinna med marginal — den definitiva planen

**Datum:** 2026-06-02
**Författare:** Master-strateg-syntes ur (a) `docs/benchmarks/leadership-credibility-report.md`, (b) `claudedocs/2026-06-01-path-to-world-best.md`, (c) denna körnings färska konkurrent-/regulatorik-/behavior-equivalence-research (8 dimensioner) och (d) den adversariellt verifierade gate-on-vs-off-RCT:n + den expanderade loop-konvergensmätningen.
**Ton:** Senior, evidensbaserad, brutalt ärlig. Inga marknadsföringssuperlativ. Varje konkurrenspåstående är förankrat i en faktisk körning eller en citerad, verklig källa.

Detta dokument svarar på en fråga: **hur vinner vi med marginal — inte med nöd och näppe — i en värld där CodeScene den 5 mars 2026 skeppade en konceptuellt nästan identisk produkt?**

---

## 1. Marginal-tesen, skärpt

Den tidigare tesen (`enforced + open + verified` — den oberoende, leverantörsneutrala, deterministiska, öppna, beteendeverifierade grinden för AI-genererad kod) var rätt. **Den färska researchen bekräftar den och tvingar fram en skärpning, inte en omsvängning.** Två fynd förändrar bilden:

1. **Den direkta konkurrenten har stängt en del av advisory-gapet, men inte enforcement-gapet.** CodeScene CodeHealth MCP (GA, ~$9/mån, lokal exekvering, 30+ språk, `pre_commit_code_health_safeguard`, AGENTS.md-driven self-correcting loop, peer-reviewat papper) är nu det närmaste hotet ([codescene.com/product/code-health-mcp](https://codescene.com/product/code-health-mcp)). Men den verifierade läsningen av deras egen AGENTS.md är avgörande: safeguarden körs **post-edit (pre-commit), inte pre-edit**, och agenten **får kringgå den** — om den ombeds skippa ska den varna men tillåta ([github.com/codescene-oss/codescene-mcp-server](https://github.com/codescene-oss/codescene-mcp-server/blob/main/AGENTS.md)). Det är alltså advisory i praktiken, post-generation, och kräver ett moln-konto. Vår `packages/gate` är pre-edit, hård deny via `PreToolUse`, lokal, utan konto.

2. **Tre marginaler är nu mätbart eller strukturellt tomma — och vi sitter redan i två av dem.** Behavior-equivalence-kategorin är **bevisat tom**: ingen kommersiell produkt kombinerar karaktäriseringstest-syntes + differential-fuzzing + blockerande grind för otestad multi-språkskod ([arXiv 2602.15761](https://arxiv.org/pdf/2602.15761); Diffblue är Java-only och verifierar inte ekvivalens, [cover-docs.diffblue.com](https://cover-docs.diffblue.com/features/cover-refactor/get-started-cover-refactor)). Enforced-gating-kategorin **har ännu inget namn i analytiker-vokabulären** och ingen turnkey-produkt med öppen spec. Och EU-regulatorikens fönster (GPAI-enforcement 2 aug 2026, CRA-rapportering 11 sep 2026) öppnar en attestation-marginal där ingen incumbent har en artefakt.

**Den skärpta, enda vassaste formuleringen av hur vi vinner med marginal:**

> Vi tävlar **inte** på score-accuracy (oavgjort mot lizard, p=0,85 — oförändrat och ovinnbart). Vi vinner genom att äga den **enda position som är samtidigt (a) enforced pre-edit i agent-loopen, (b) öppet specificerad så att en stängd vendor inte kan följa efter utan att kannibalisera sin egen affärsmodell, och (c) bevisad med en kausal claim — gate-on minskar mätbart osunda AI-edits — som varje advisory-verktyg är *strukturellt* förhindrat att göra eftersom de saknar kontrollarmen.**

Det är den avgörande asymmetrin: **CodeScene, Sonar, Qodo och Copilot kan inte köra en gate-off-arm** — deras produkt *är* granskningen, så de har ingen kontrafaktisk att mäta mot. Vi har redan kört den (avsnitt 2). Det är skillnaden mellan att hävda "grindar hjälper" och att äga ett kausalt mätresultat ingen annan i kategorin kan producera.

Marginalen kommer alltså inte från att vara bättre på samma sak — den kommer från att vara den enda i en kategori konkurrenterna är **strukturellt utelåsta från**: advisory-affärsmodellen motstår att bli en hård grind (en grind som hindrar skrivningen eliminerar review-kommentar-flödet som är deras intäktsmotor), den stängda scoringen kan inte öppnas utan att förstöra moaten, och molnberoendet låser ute reglerade/air-gapped-köpare.

---

## 2. Vad RCT:n visade

**Den verifierade domen: enforced gating slår no-gate, och det är ett kausalt, riktningsentydigt resultat — men det är ett *preventions*-resultat på en syntetisk edit-sekvens, inte ett improvement-resultat.** Detta är den viktigaste meningen i hela dokumentet, så den måste bäras med exakt sina gränser.

**Setup (verifierat oberoende, alla 55 filer, batch 0–5):** 55 riktiga OSS-medelkomplexa filer (baslinje-score 5,0–8,0), 12 språk. Varje fil fick 3–5 simulerade AI-feature-edits — en blandning av godartade tillägg och avsiktligt dåliga (hårdkodade AWS/GitHub-nycklar, XSS via `innerHTML`/`res.write`, SQL-injektion via strängkonkatenering, deep nesting, komplexitetsspikar). Båda armarna kördes på samma in-memory-buffert; källfilerna muterades aldrig. Verifieraren litade **inte** på batch-JSON: den re-scorade varje slutbuffert med `analyzeCode` + säkerhetssmell-insamling, re-deriverade smells mot originalet, och körde anti-gaming-checkar från grunden.

**Verifierat aggregat (n=55, oberoende omräknat):**

| Mått | Gate OFF | Gate ON |
|---|---|---|
| Medelscore | 5,007 | **6,458** |
| Medel-delta (ON − OFF), parat | — | **+1,451** (parad SD 1,242; parat t ≈ 8,7) |
| Delta-fördelning | — | **44 positiva, 11 exakt noll, 0 negativa** |
| Nyintroducerade smells (totalt) | 139 | **1** (en DeepNesting, icke-säkerhet) |
| Nyintroducerade säkerhets-/AI-smells | 21 | **0** |
| Filer <9,0 (osunda) efter | 55/55 | 55/55 |

**Score-re-verifiering: 55/55 slutbuffertar reproducerade inom ±0,15 av påstått värde. Noll mismatchar. Noll gaming** (kommentarsantal icke-minskande, inga borttagna funktioner/exporter, alla buffertar parsar) — och verifieraren falsifieringstestade sina egna detektorer, så det rena resultatet är äkta, inte en död check.

**Är det en marginal-definierande kausal claim eller bara riktningsgivande?** Det är **kausalt och starkt riktningsgivande, men med tre ärliga förbehåll som måste resa med varje publicering:**

- **+1,45-marginalen drivs av att gate-OFF *degraderar*, inte att gate-ON *förbättrar*.** 44/55 gate-off-buffertar försämrades faktiskt vs originalet (11 var no-ops). Gaten *fryser* filen vid dess pre-edit-tillstånd när den blockerar (10/55 gate-on-buffertar är byte-identiska med originalet). Effekten är genuin men det är en **preventionseffekt**, inte en lyfteffekt: gaten gör aldrig en fil sämre (0 negativa deltas), men den lyfter inte heller någon fil till mål — 55/55 förblir <9,0 i båda armarna. Det är exakt vad en grind ska göra (hindra degradering), men det får inte säljas som "grinden förbättrar din kod".
- **Det är en simulerad edit-sekvens, inte en levande agent.** Editerna var skriptade, inte genererade av en autonom modell mot en uppgift. Den verkliga kausalstudien (gate-on-vs-off med en *riktig* agent som löser riktiga issues) återstår — det är 90-dagars-RCT-piloten.
- **Off-arm-degraderingen är mestadels vanlig komplexitet, inte bara uppenbara secrets.** Av 139 nya off-smells är endast 21 säkerhet/AI; 118 är komplexitet/underhållbarhet (TypeSafetyEscape, MagicNumber, DeepNesting, BrainMethod m.fl.). Det är faktiskt ett *starkare* argument — grinden fångar den tråkiga erosionen som en secret-scanner missar — men det måste sägas rakt: det är inte 139 säkerhetshål.

**Loop-konvergensen, infälld och ärligt nedjusterad.** Den expanderade LLM-loop-mätningen (n=80, verifierad oberoende: 80/80 filer re-scorade rent, 0 parse-/comment-/export-överträdelser) ger:

| Korpus | Konvergens ≥9,5 |
|---|---|
| Full n=80 (verifierad re-score) | **25/80 = 31,3 %** (påstått 30,0 %; re-score marginellt *högre*, ej inflaterat) |
| Endast riktig OSS, n=65 (exkl. 15 egna fixtures/src) | **17/65 = 26 %** ← den externt mest valida siffran |
| Tidigare rapporterad (n=46) | 16/46 = 34,8 % |
| Statisk/mekanisk loop | **0/55 = 0 %** (och 1/27 = 4 % på dynamisk loop-bench) |

**Den ärliga domen på loopen: konvergensraten gick *inte* upp — den sjönk något (34,8 % → ~26–31 %) på en större, hårdare korpus.** Och den gäller **endast med en LLM i loopen** (Claude som manuellt rollspelar loopen, verktyget bara som score-signal). Den **deterministiska mekaniska applikatorn konvergerar ~0 %**. Så "loopen når 9,5 på ~26–31 %" är sant enbart för en LLM-i-loopen, aldrig för den skeppade automatiska transform-motorn. Det är inte en svaghet att dölja — det är gränsen som gör claimet trovärdigt.

**Sammantaget för marginal-tesen:** RCT:n ger oss den *kausala kärnan* (gate-on → 0 nya säkerhetssmells vs 21, 0 negativa deltas, +1,45 medelscore-prevention) som ingen advisory-konkurrent kan replikera. Loopen ger oss ett *absolut* värdetal (~26 % på riktig OSS, beteendebevarat, 0 % gaming) utan jämförelsepunkt mot CodeScene. **Marginalen vilar på grinden, inte på loopen.** Loopen är det som fyller datasvänghjulet; grinden är det som vinner kategorin.

---

## 3. De avgörande first-mover-spelen

Rankade på `strukturell utelåsning av konkurrenten × tidskänslighet × genomförbarhet inom 90 dagar`. Var och en skapar ett försprång som inte kan kopieras genom att spendera mer pengar.

### Spel 1 — Differential-fuzzing-grinden för behavior-equivalence (den tomma kategorin)

- **Vad:** Wira Google Atheris (Python) in i `packages/gate` som ett blockerande steg: före commit av en LLM-refaktorering, kör 500–1000 fuzz-inputs mot original och refaktorerad kod, blockera vid output-divergens. Detta är den **första produktionsimplementationen** av arXiv 2602.15761:s metod.
- **Varför försvarbart (strukturell utelåsning):** Kategorin är *bevisat tom* — Diffblue är Java-only och gör ingen ekvivalens-claim; EvoSuiteR är akademisk och inte i en agent-loop; Qodo genererar tester men ingen differential-jämförelse. Och naiva motdraget ("vi genererar tester före") är publicerat trasigt: LLM-genererade tester spårar inte semantik genom förändring (pass-rate faller till 66 % under semantiska ändringar, [arXiv 2603.23443](https://arxiv.org/html/2603.23443v1)). Att använda en LLM för att verifiera en LLM:s refaktorering är dessutom bevisat opålitligt (40 % miss på Type II-buggar, [arXiv 2502.18454](https://arxiv.org/pdf/2502.18454)). En icke-LLM, deterministisk differential-check är den enda arkitektur som undkommer det — och advisory-verktyg kan strukturellt inte bädda in den.
- **90-dagars första version:** Atheris differential-fuzz-steg för Python i grinden + golden-master-karaktäriseringstester (genererade *före* refaktorering, kört *efter* — inversen av Diffblues ordning) för TS/JS via fast-check. Mät mot de 20 kända icke-ekvivalenta refaktoreringarna i arXiv 2602.15761. Övriga 44 språk märks ärligt "static-equivalence only (advisory)" — överclaimet "alla 46 språk bevisat säkra" är kill-risken.

### Spel 2 — Externalisera OCHS-styrningen till ett neutralt hem NU (innan skala)

- **Vad:** Publicera OCHS v0.1 som öppen spec (formel, alla 55 biomarkörer, vikter, ISO 25010-mappning, conformance-kit + en validator-CLI) och **lämna in den till OpenSSF eller OWASP som inkuberande projekt inom 90 dagar.**
- **Varför försvarbart (strukturell utelåsning):** Detta är det enskilt högsta-hävstångsdraget. Det dokumenterade mönstret hos OpenSSF Scorecard, SLSA, SARIF och CycloneDX är entydigt: ursprung i en neutral stiftelse, inte en vendor, är det som gör en score till infrastruktur snarare än ett vendor-tal ([openssf.org/projects/scorecard](https://openssf.org/projects/scorecard/)). CodeScene kan **inte** öppna sin scoring utan att förstöra sin SaaS-moat. Och Terraform→OpenTofu är varningen: HashiCorp missade att externalisera styrningen *före* kommersiella incitament att stänga den, och OpenTofu åt 12 % av marknaden på månader efter IBM:s licensändring ([encore.cloud/resources/terraform-2026](https://encore.cloud/resources/terraform-2026)). Vi gör anti-Terraform-draget proaktivt: då finns inget att forka mot.
- **90-dagars första version:** Lyft `weights.ts` + biomarkördefinitionerna till ett versionerat MIT/CC-spec med ISO-mappningstabell; packa testfixturerna som conformance-kit; skeppa en fristående `ochs-validate`-CLI (MIT, ingen MCP-beroende) med publicerat JSON-schema. Inkludera valideringsappendix som **öppet redovisar MLCQ-oavgjordheten mot lizard och Defects4J-nollresultatet** — radikal auditbarhet *är* varumärket. Lämna in inkubationsförslag till OpenSSF.

### Spel 3 — Den förregistrerade gate-on-vs-gate-off-RCT:n med en *riktig* agent

- **Vad:** Förregistrera (OSF.io/AsPredicted) en RCT *innan* körning: samma modell, samma N riktiga issues, samma token-budget, med/utan den deterministiska grinden. Mät minskning i (återställda edits, nyintroducerade smells, filer kvar <9,4, AI-introducerade CVE-mönster). Publicera rådata oavsett utfall.
- **Varför försvarbart (strukturell utelåsning):** Detta är den **enda kausala claim hela advisory-kategorin är förhindrad att göra** — de kan inte randomisera "ingen granskning alls" eftersom deras produkt *är* granskningen. SWE-bench-precedenten visar att ett enda trovärdigt, publicerat, reproducerbart resultat triggar en vendor-citerings-flywheel: varje AI-kodvendor måste adressera siffran ([codeant.ai/blogs/swe-bench-scores](https://www.codeant.ai/blogs/swe-bench-scores)). Vår n=55-simulering (avsnitt 2) är dess pilot — den bevisar att harness och mätinstrument fungerar; full-skala-versionen med en levande agent är beviset.
- **90-dagars första version:** 50 medelkomplexa filer, en modell, en arm med grind / en utan, tre utfallsmått. **Ärlig disciplin: slår gate-on inte gate-off, publicerar vi det och pivoterar — inget hype-tal.**

### Spel 4 — `code_health_attest` mappad till EU-regulatorik före 2 aug 2026

- **Vad:** Signerad per-fil-attestation `{timestamp, filePath, toolVersion, modelIdentity, score, biomarkörvektor, SHA256(kod), thresholdPassed}`, exporterbar som SARIF-kompatibel JSON-LD. Plus ett **publicerat mappningsdokument** mot EU AI Act Art. 12 (loggning), Art. 50 (maskinläsbar märkning) och CRA Art. 14 (rapportering).
- **Varför försvarbart (tidsfönster):** GPAI-enforcement landar 2 aug 2026 — *oförändrat* av Omnibus-uppskjutningen (Annex III sköts till dec 2027, men Art. 50/51–56 går enligt schema, [gibsondunn.com](https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/)). CRA-rapporteringsplikt aktiveras 11 sep 2026 ([herodevs.com](https://www.herodevs.com/blog-posts/cra-reporting-obligations-start-september-2026-what-eol-dependencies-mean-for-your-compliance)). Inget kodverktyg producerar en Art. 12-artefakt; CodeScenes SaaS är dessutom strukturellt blockerad i air-gapped/reglerade miljöer. Fönstret är ~8 veckor och perishabelt.
- **90-dagars första version:** Verktyget live före 2 aug; ettsidigt compliance-mappnings-dokument (inte whitepaper — en checklista) publicerat. **Ärlig avgränsning:** EU AI Act är *inte* ett generellt mandat att gata all AI-kod — standard-autocomplete är inte high-risk. Pitchen gäller de ~15–20 % som bygger Annex III-system (medtech, reglerad fintech, kritisk infrastruktur). Överclaim här skadar trovärdigheten.

### Spel 5 — `SlopsquattingRisk` som det smalaste sanna "world-first"-claimet

- **Vad:** AST-nivå import-validering: flagga paket som saknas i lockfilen, matchar DepScope-hallucinationskorpusen, är typosquat-distans till ett populärt paket, eller 404:ar/publicerades <90 dagar sedan vid en (opt-in) live registry-check.
- **Varför försvarbart (tidsfönster ~12–18 mån):** Slopsquatting är ett namngivet, aktivt utnyttjat 2026-hot (~20 % hallucinationsrate; ett hallucinerat paket fick 30 000 nedladdningar på 3 månader, [CSA Research Note apr 2026](https://labs.cloudsecurityalliance.org/research/csa-research-note-slopsquatting-ai-supply-chain-20260419-csa/)). **Inget** kodkvalitetsverktyg (Sonar, CodeScene, DeepSource, Codacy) skeppar AST-nivå-detektion knuten till en health-score; SCA-verktyg jobbar på registernivå. Det är det tydligaste, smalaste claimet som faktiskt är sant.
- **90-dagars första version:** `SlopsquattingRisk` (vikt 1,5, paritet med `SqlInjectionRisk`) som lockfile-diff + DepScope-match för Tier-A; live-registry-validering i v2 (opt-in, 24h-cache, 0 nätverk vid opt-out). Bonus: skeppa det som en *fristående* gratis npm/pip-paket i CI som top-of-funnel-wedge mot DevSecOps-köparen.

### Spel 6 — Starta dataset-klockan NU (irreproducerbarhet är moaten)

- **Vad:** Instrumentera den LLM-drivna loopen att emittera `{biomarkörvektor, score-delta, diff, bröt-tester, språk}` per iteration (opt-in, content-free). Stå upp en CI-pipeline som veckovis snapshotar health-trajektorier över en seed på 500 repos.
- **Varför försvarbart (compoundande moat):** Datadog-spelet — datan, inte algoritmen, är den ouppnåeliga moaten ([useluminix.com Datadog overview 2026](https://www.useluminix.com/reports/company-overviews/datadog-company-overview-observability-platform-financials-and-competitive-position-2026)). Den longitudinella `{pre, vektor, AI-diff, post, bröt-det}`-tupeln är exakt vad CodeScenes Lund-studie bevisade men *aldrig publicerade* — deras stängda modell förbjuder det. Ett advisory-verktyg ser aldrig utfall, bara kod vid en tidpunkt. Datasetet behöver inte vara stort för att vara först — det behöver vara tidsstämplat.
- **90-dagars första version:** Opt-in (default off), lokal append-only-logg med "vad skickas"-vy, integritetsfuzz 44/44 grönt. Sikta på en akademisk medförfattare (t.ex. "Debt Behind the AI Boom"-teamet, arXiv 2603.28592) för citeringslegitimitet — den långsamma, icke-tekniska flaskhalsen.

**Var vi INTE ska slåss:** högre MLCQ-AUROC (oavgjort mot lizard, ovinnbart mot deep-ensemble F1 0,88+), AI PR-review (commoditiserat av Anthropic/OpenAI/GitHub), portfölj-dashboards (Sonar/SIG/Gartner-territorium), "code health score"-kategorin som sådan (CodeScenes peer-reviewade hemmaplan).

---

## 4. Sekvens till marginal

Varje milstolpe är knuten till det **mått som bevisar marginalen** — inte aktiviteten.

### 30 dagar — grundbultar + fixa de dokumenterade defekterna

| Leverabel | Mått som BEVISAR marginalen |
|---|---|
| OCHS v0.1-spec publicerad + `ochs-validate`-CLI (Spel 2) | Spec live; determinism-regressionstest grönt (identisk score för repo-hash+version i 100 %); ≥1 tredjepart kan emittera OCHS-conformant score |
| `SlopsquattingRisk` v1 (Spel 5) | ≥85 % precision på DepScope-korpus; 0 nätverk vid opt-out |
| `packages/gate` hårdnad: strukturerad-JSON-deny + install-self-test (Spel 1-bas) | Känd-dålig edit blockeras på ≥2 harness-versioner; false-positive <5 % på delta-korpus av legitima edits |
| Fixa lizard-metriken (→0,659/oavgjort) + regenerera fullt `field-reliability/results.json` + byt stale `budget_tokens` i CLAUDE.md | `git grep budget_tokens` tomt; benchmark-doc reproducerbar |

### 90 dagar — det kritiska narrativ-fönstret (allt EU-regulatorik-känsligt MÅSTE landa här)

| Leverabel | Mått som BEVISAR marginalen |
|---|---|
| **Differential-fuzzing-grind, Python + TS (Spel 1)** | ≥80 % av tysta beteendebrott som testsviter missar, mot arXiv-2602.15761-korpusen — *annars* märks static-only och vi pivoterar |
| **Gate-on-vs-off-RCT, pilot med riktig agent (Spel 3)** | tre utfallsmått mätta; effektstorlek rapporterad; förregistrerad på OSF *före* körning |
| **`code_health_attest` + EU-mappningsdokument (Spel 4)** | verktyg live **före 2 aug 2026**; mappning mot Art. 12/50 + CRA Art. 14 publicerad |
| **OCHS inlämnad till OpenSSF/OWASP (Spel 2)** | inkubationsförslag inne |
| **Dataset-klockan igång (Spel 6)** | första veckovisa snapshot-aggregat insamlat; integritetsfuzz 44/44 grönt |
| Lager-B-loop-benchmark, n≥500, öppet dataset | %≥9,5 + test-pass per komplexitetsdecil rapporterat ärligt (förväntat ~26 % på OSS — publiceras oavsett) |

### 180 dagar — moat-byggande

| Leverabel | Mått som BEVISAR marginalen |
|---|---|
| `code_health_verify_refactor` GA (TS/JS + Python dynamisk equivalence) | ≥80 % tyst-brott-detektion; syntetiserade tester returneras som artefakt; övriga språk märkta advisory |
| Fri GitHub Action: merge-gate på health-regression, öppen formel visad | platform-neutral; badge driver organiska installs; första externa adopter citerar OCHS |
| Calibration data-flywheel live (opt-in, content-free) | hård opt-in default off; första aggregat kalibrerar AI-native-vikter empiriskt |
| Multi-språk-kalibrering: Python + TS mot externa etiketter | AUROC/precision/recall per språk publicerat; ingen "validerad över 46 språk"-överclaim |

### 365 dagar — kategori-auktoritet

| Leverabel | Mått som BEVISAR marginalen |
|---|---|
| **Gate-on-vs-off-RCT i full skala (Spel 3)** | statistiskt signifikant minskning av osunda AI-edits, eller publicerad pivot |
| OCHS i neutralt governance-hem + 2–3 namngivna externa validatorer | acceptans i OpenSSF/OWASP sandbox; medförfattare rekryterade |
| HealthBench — levande, daterat, fler-språkigt dataset (LiveCodeBench-format, kvartals-DOI) | Q-snapshot med fryst DOI; inter-rater-kappa rapporterad |
| Venue-acceptans (differential-fuzzing-grind → SANER/MSR/FORGE 2027; HealthBench → NeurIPS D&B) | submission inne; ≥1 tredjepart analyserar *vår* benchmark |

---

## 5. Red-team & varför vi ändå vinner

**Det starkaste fallet mot oss (sammanvägt ur den oberoende verifieraren + "redteam-why-we-lose"-dimensionen):**

> "Er marginal är ett korthus. (1) Score-accuracy är oavgjord mot lizard (0,688, p=0,85) — ert 'deterministiska ankare' är inte bättre än ett gratis 200-raders Python-verktyg. (2) Gate-RCT:n är en *simulerad* edit-sekvens, +1,45 drivs av att off-armen degraderar, inte att ni förbättrar — och 55/55 filer förblir osunda i båda armarna. (3) Loopen sjönk till ~26 % på riktig OSS och fungerar *bara* med en LLM-människa i loopen, aldrig den skeppade motorn. (4) Hook-ytan är inte längre Claude-exklusiv — Kiro och Copilot skeppar PreToolUse-hooks; en grind som bara lever i Claude Code är utflankerad inom 12 månader ([docs.github.com cloud-agent hooks](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-hooks)). (5) OCHS har ett enda implementation — det är ett proprietärt format med ett vänligt namn tills en tredjepart emitterar det. (6) Ni har noll riktiga användare, noll peer-review, och CodeScene har $-finansiering, varumärke och ett publicerat papper."

**Varje punkt är delvis sann. Det specifika vadet som slår fallet:**

Marginalen vilar **inte** på någon enskild av de attackerade punkterna — den vilar på **kombinationen ingen konkurrent kan replikera samtidigt**. Score-accuracy *behöver* inte slå lizard, för vi tävlar inte där; det deterministiska ankaret är värdefullt inte för att det är mest exakt utan för att det är det enda en revisor/försäkringsgivare/EU-auditör kan citera och det enda en modelleverantör är strukturellt avskräckt från att bygga (dokumenterad reward-hacking, EvilGenie 36–75 %). Hook-yt-commoditiseringen (punkt 4) är exakt varför Spel 1–3 inte handlar om hook-API:t — de handlar om **kvalitetssignalen (55 biomarkörer), den öppna specen (OCHS) och det kausala RCT-beviset**, som överlever även när Kiro/Copilot har identiska hooks. Och OCHS-en-implementation-risken (punkt 5) är precis vad Spel 2:s tidiga externalisering adresserar — vi flyttar styrningen *innan* skala, så draget inte kan låsas.

**Det enda vad som beats allt detta:** kör den förregistrerade gate-on-vs-off-RCT:n med en riktig agent och publicera den (Spel 3). En enda trovärdig, reproducerbar, kausal siffra — "enforced gating minskade osunda AI-edits med X %" — är den enda asymmetrin hela advisory-kategorin är strukturellt förhindrad att producera, och den är den händelse som triggar vendor-citerings-flywheelen. Allt annat (spec, biomarkörer, attestation) är förstärkning av den siffran.

---

## 6. Ärlig dom

**Ja — vi är på en trovärdig väg att vinna med marginal, men marginalen är inte vunnen ännu och vilar på en sak vi ännu inte har publicerat.**

Vad vi faktiskt har, verifierat: en grind som i en oberoende verifierad simulering blockerar 100 % av nyintroducerade säkerhets-/AI-smells (0 vs 21) och håller 0 negativa score-deltas (n=55, parat t≈8,7); en LLM-loop som beteendebevarat lyfter ~26 % av riktig OSS-medelkod till 9,5 (0 gaming, oberoende re-scorat); bevisad fält-robusthet (0 krascher/12 583 filer); och fyra strukturellt tomma kategorier (behavior-equivalence, namnlös enforced-gating, EU-attestation, AST-slopsquatting) där konkurrenterna är utelåsta av sin egen affärsmodell, inte av brist på resurser.

Vad vi inte har: ett kausalt RCT-resultat med en *riktig* agent, en OCHS med fler än en implementation, en akademisk medförfattare, peer-review, och en enda riktig användare.

**Den ENA saken som mest avgör om vi vinner med marginal:** den förregistrerade gate-on-vs-gate-off-RCT:n med en riktig agent (Spel 3), publicerad med rådata. Den är den enda kausala claim hela advisory-kategorin är *strukturellt* förhindrad att göra — CodeScene, Sonar, Qodo och Copilot kan inte köra en kontrollarm där deras egen produkt är granskningen. Vinner den, har vi ett mekanism-anspråk konkurrenterna inte kan kontra utan att bygga om sin arkitektur. Förlorar den, vet vi det tidigt och pivoterar ärligt. Allt annat i planen — den öppna specen, biomarkörerna, attestationen, datasvänghjulet — är förstärkning av den siffran. Utan den är "vinn med marginal" fortfarande en tes; med den blir den ett bevisat, icke-kopierbart faktum.

---

## Increment 2026-06-02 — Spel 3 (riktig-agent-RCT) + härdning

**Ton:** Senior, brutalt ärlig, noll hype. Varje siffra nedan är från en faktisk lokal körning eller oberoende omräknad ur rådata — inget är fabricerat. Detta increment **gör oss inte världsbäst**; det avancerar vägen och, viktigast, det **dämpar ett av huvuddokumentets egna påståenden** med riktig data. Läs § "Den obekväma domen" innan något citeras.

### 0. Det enda som spelar roll: vad den RIKTIGA agenten visade (Spel 3-pilot)

Vi körde äntligen den studie hela planen vilar på — inte den skriptade simulering som gav +1,45 (§ 2), utan en **riktig agent (Claude Sonnet 4.6) som autonomt hittade på realistiska utvecklaruppgifter och genererade naturliga edits**, fil för fil, sedan kördes båda armarna (gate-off / gate-on) på samma in-memory-buffert. 48 filer (midfiles.json[0..47], 6 batchar), baslinje-score 5,0–7,7, ~12 språk. Källfiler muterades aldrig. En oberoende verifierare re-scorade varje slutbuffert med `analyzeCode` (på nyombyggd `core`/`gate`), jämförde gate-ON-buffertar byte-för-byte mot originalet och recomputade aggregatet från grunden utan att lita på batch-JSON.

**Verifierat aggregat (n=48, oberoende omräknat ur `benchmark-data/rct-real/batch-{0..5}.json`):**

| Mått | Gate OFF | Gate ON |
|---|---|---|
| Medelscore | 5,958 | **6,254** |
| Medel-delta (ON − OFF), parat | — | **+0,296** (parad SD 0,797; parat t ≈ 2,57) |
| Delta-fördelning | — | **14 positiva, 34 exakt noll, 0 negativa** |
| Nyintroducerade smells (icke-säkerhet) | 20 | **5** |
| **Nyintroducerade säkerhets-/AI-smells** | **0** | **0** |
| Editerna blockerade-och-reviderade | — | 11 (varav verifieraren räknar 5 äkta revisioner, 12 rena reverts, 30 natural-clean no-ops) |

**Domen, rakt: enforced gating hjälper mätbart men SVAGT när en riktig agent gör NATURLIGA edits — och säkerhetsmarginalen som dominerade simuleringen FÖRSVINNER nästan helt.** Tre fakta måste resa med varje citering:

1. **Naturliga agent-edits är oftast rena, och grinden no-op:ar då.** Av 48 filer var verifierarens mutuellt-exklusiva taxonomi: **30 natural-clean** (gate-ON byte-identisk med gate-OFF — grinden gjorde ingenting), **12 reverts** (gate-ON byte-identisk med originalet — uppgiften helt övergiven), **5 äkta revisioner** (gate-ON skiljer sig från både off och original). Det betyder att grindens *mätbara* verkan kom från en handfull filer, inte från korpusen brett. Detta **försvagar marginal-claimet** relativt simuleringen — och det måste sägas: en riktig agent injicerar inte 21 säkerhetshål på 48 filer som det skriptade adversariella scenariot gjorde.
2. **Säkerhets-/AI-smell-fångsten — simuleringens starkaste fynd (0 vs 21) — reproduceras INTE här: 0 OFF vs 0 ON.** Oberoende bekräftat över alla 48 OFF-buffertar (`analyzeCode` säkerhetsfilter + `detectSecrets`). En autonom agent som löser en ärlig uppgift skriver helt enkelt inte hårdkodade nycklar eller SQL-injektion på det sätt den adversariellt skriptade sekvensen gjorde. **Grindens verkliga effekt på naturliga edits ligger på tråkig komplexitet/underhållbarhet (20→5), inte säkerhet.** Det är fortfarande ett äkta preventionsvärde, men det är en mycket mindre dramatisk siffra än +1,45 / 21-blockerade, och vi får inte sälja det som annat.
3. **+0,296 drivs av prevention, inte lyft, precis som simuleringen — men i mindre skala.** 0 negativa deltas (grinden gör aldrig en fil sämre), 34 ties, 14 förbättringar. Av de 5 äkta revisionerna är 2 legitima uppgiftslösande renare edits (b2.0 `complex.py` 4,3→7,0; b2.7 `options.go`), 1 vann inte alls (b1 `Complex.cs` 4,3→4,3, ärligt registrerat), och **2 är "soft task-abandonment"** som verifieraren flaggar: b3.25 `withJvmOverloads.kt` undvek `LongParameterList` genom att *krympa funktionen från 5 till 2 parametrar* (smalare uppgift), b4.38 `symLinks.ts` släppte den substantiella refaktoreringen för en nära-trivial hjälpare. **Inget förbjudet gaming** (0 kommentarsborttagningar, 0 funktionsborttagningar, alla buffertar parsar) — men i två fall vann grinden genom att agenten *gjorde mindre*, inte renare. Det är en ärlig nyans, inte ett fusk.

**Konsekvens för planen:** pilotens harness och mätinstrument fungerar (det var pilotens syfte, och det är bekräftat), men **piloten bevisar INTE ett starkt kausalt enforced-gating-värde på naturliga edits**. Den fulla, förregistrerade RCT:n (Spel 3, 365-dagars-raden) behöver (a) ett uppgiftsurval som tvingar fram riskfyllda edits (refaktoreringar, inte additiva hjälpare), (b) en levande agent som faktiskt redigerar källfiler i en loop snarare än engångs-buffertar, och (c) förregistrering på OSF *före* körning. Pre-registreringsdokumentet finns nu (`docs/benchmarks/rct-preregistration.md`) med H1/H3, within-file crossover-design, tre låsta utfallsmått och ett avsnitt som explicit skiljer denna riktiga-agent-RCT från den skriptade simuleringen.

### 1. Vad som nu är BYGGT & VERIFIERAT (file-disjoint agenter, allt grönt)

- **OCHS-validator-CLI — Spel 2 levererad i första version.** Nytt fristående paket `packages/ochs-validate` (MIT, *ingen* `@healthy-ai-code/core`-runtime-beroende — vikterna är kopierade verbatim, så en tredjepart kan validera utan vår motor). Publicerat JSON-schema (draft-07, alla 55 SmellType-enums, score-intervall [1,0; 10,0]), strukturell validator + formel-re-derivering `max(1,0; 10 − Σ vikt×√count)`, och `bin: ochs-validate`. Verifierat end-to-end på den riktiga `dist/cli.js`: giltigt objekt → PASS exit 0; ogiltig version `"v0.1"` → FAIL exit 1; formel-mismatch (rapporterad 10,0 vs re-deriverad 8,5) → FAIL exit 1; trasig JSON → FAIL exit 1. 98/98 paket-tester gröna inkl. 4 determinism-tester. **Detta är det första steget som gör OCHS till mer än ett proprietärt format med vänligt namn — men det är fortfarande EN implementation tills en extern part emitterar en conformant score.**
- **SlopsquattingRisk härdad — Spel 5 mätt.** På en deterministisk, offline, märkt mängd (positives=56, negatives=4132): **precision 100,00 %, recall 100,00 %, TP=56 FP=0 FN=0** (mål ≥85 % precision, <1 % FP — båda överträffade). Full-snapshot-FP-bevis (den realistiska falsk-positiv-ytan): **0/5581 npm-namn och 0/14997 PyPI-moduler = 0,000 %**. Noll-nätverk-bevis vid opt-out är icke-vakuöst och självkontrollerat (källan importerar ingen nätverksmodul; en live `global.fetch`-tripwire träffas 0 gånger; opt-in når registret enbart via injicerad fetcher). **Förbehåll:** 100 % precision gäller *denna märkta mängd* — den innehåller hand-konstruerade single-edit-typosquats av prominenta paket, så det är en stark men inte fält-validerad siffra; verklig precision på live-hallucinationer återstår att mäta.
- **`packages/gate` falsk-positiv-rate uppmätt — Spel 1-bas.** 29-edit benign-korpus över 5 språk (rename/added-pure-function/doc/refaktor/formattering/typannotering/import-omordning). **FP-rate 0/29 = 0,00 %** (mål <5 %) via exakt samma kodväg som produktionshooken. Per kategori alla 0. Den låga siffran är *inte* uppnådd genom att neutralisera grinden: negativ-kontroll-sviten bekräftar att varje skadlig edit (7 fixtures) fortfarande nekas av rätt skäl. En äkta (ej kosmetisk) FP rotorsakades och fixades under härdningen.

### 2. Test- & grön-status (oberoende verifierat med riktig körning)

`pnpm -r typecheck` grönt för alla 5 paket; `pnpm build` grönt; `pnpm test` exit 0, noll fel. **Totalt 1964 tester över 5 paket** (core 1547, mcp-server 206, ochs-validate 98, gate 84, init 29). **Ärlig not, inget överclaim:** uppdraget refererade "1844 tester över 4 paket"; repot har nu 5 källpaket (nya `ochs-validate`) och 1964 tester — deltat är BuildHarden-tester + det nya paketet, inte uppblåsning.

### 3. Uppdaterad ärlig ställning mot beslutsregeln

**Är vi närmare att vinna med marginal? Marginellt ja på leverans-bredd, men piloten DÄMPADE huvudtesen, inte stärkte den.**

- **Plus:** Spel 2 (OCHS-CLI), Spel 5 (slopsquatting) och Spel 1-bas (gate-FP) är nu från tes till verifierad artefakt. Förregistreringsdokumentet finns. Harnessen för den riktiga RCT:n fungerar bevisat.
- **Minus (det avgörande):** den riktiga-agent-piloten visade att enforced gating på *naturliga* edits ger **+0,296 (svagt, t≈2,57) och noll säkerhetsmarginal (0 vs 0)** — långt från simuleringens +1,45 / 0-vs-21. Grinden no-op:ar på 30/48 filer och vinner mätbart på en handfull. **Den kausala kärnan i § 2 håller bara för adversariella edit-sekvenser; mot en ärlig agent är effekten reell men liten.** Detta är exakt den sorts fynd planen lovade att publicera oavsett utfall — och vi gör det.

**Det betyder inte att grinden är värdelös:** 0 negativa deltas på 48 naturliga edits + 20→5 komplexitets-smell-prevention + 0,00 % FP är ett ärligt "gör-aldrig-skada, fångar-tråkig-erosion"-värde. Men det är en *svagare* asymmetri än dokumentet hittills hävdat, och säkerhets-dramatiken (21 blockerade) tillhör simuleringen, inte den riktiga agenten.

**Det SINGEL viktigaste återstående steget — oförändrat och nu skärpt av piloten:** den **fullskaliga, förregistrerade Spel 3-RCT:n med en levande agent som redigerar källfiler i en faktisk loop mot riktiga issues, med ett uppgiftsurval som framkallar riskfyllda refaktoreringar** (inte additiva hjälpare som råkar vara rena). Piloten bevisade att instrumentet mäter rätt; den bevisade också att det lätta scenariot ger en liten effekt. Den fullskaliga studien är det enda som avgör om det finns en *publicerbar* kausal siffra konkurrenterna inte kan kontra — eller om vi måste pivotera ärligt till "prevention av komplexitetserosion" som det realistiska claimet. OCHS-extern-adopter och riktiga användare är nästa-efter-det, men de följer av RCT-siffran, inte tvärtom.

**Sammanfattat:** detta increment gör oss inte världsbäst och löser inte marginalfrågan — det levererar tre verifierade artefakter, kör pilotstudien ärligt, och tvingar fram en nedjustering av huvudtesens styrka. Vägen är intakt; beviset som avgör den är fortfarande okört i full skala.
