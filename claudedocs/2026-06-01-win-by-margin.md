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


---

## Increment 2026-06-02 — Spel 1: behavior-equivalence-grinden

**Status:** verifierad första-version, file-disjoint, allt grönt. **Detta increment gör oss INTE världsbäst** och löser inte marginalfrågan. Det levererar en riktig, körbar artefakt i den proven-empty kategorin — och tvingar samtidigt fram en ärlig avgränsning av hur mycket den faktiskt täcker.

### 1. Den verifierade siffran först — fångar grinden tysta beteendebrott som testerna missar?

**Detektionsgrad 90,0 % (18/20) på divergenta par. Falsk-positiv-grad 13,3 % (2/15) på ekvivalenta par.** Reproducerat av en oberoende adversariell verifierare i två separata körningar (projektets egen `scripts/behavior-equiv-bench.mjs` + verifierarens egen drivare som anropar den publika `verifyRefactor`-dispatchen, dvs exakt MCP-tool-vägen); Python-resultaten byte-identiska över båda. Full per-par-tabell i `docs/benchmarks/behavior-equivalence-results.md` (real motorkörning, 2000 inputs/par, varaktighet 93 972 ms, inga fabricerade tal).

Detta är **äkta differentiell exekvering, inte heuristik**: TS/JS-motorn transpilerar båda versionerna och kör dem i en sandboxad `node:vm` med frusen `Date`/`Math.random`/`performance`, syntetiserar ~2000 gränsbiaserade typade inputs från en seedad PRNG, och jämför djupklonade returvärden + kastade felnamn + post-call argument-mutation. Python-motorn skriver båda modulerna + en autogenererad harness till en temp-dir och kör dem i en riktig Python-subprocess (hypothesis 6.155.1 bekräftat aktiv + edge-biaserad PRNG). Verifieraren bevittnade konkreta divergerande inputs (t.ex. `ts-09` fångar att en immutabel operation blev in-place via post-args-jämförelse; `py-eq-03` args=[null,0] → before kastar TypeError, after returnerar null) och såg detektioner falla vid n=1–5 inputs — äkta semantiska fångster, inte budget-utmattning. **Svaret är ja: grinden fångar genuina beteendebrott på en korpus där tester inte hade synat dem.**

Lika ärligt — de 2 missarna och 2 falsk-positiverna är verkliga, inte bortförklarade:
- **FN `py-06-slice-offbyone`:** index-parametern `k` typas heuristiskt som "str" (namn-baserad inferens), så `a[:k]` kastar TypeError på BÅDA sidor och off-by-one:en exekveras aldrig. Genuin svaghet i input-syntesen.
- **FN `ts-08-async-await-drop`:** async-semantik-droppen syns inte i de 2000 syntetiserade inputs.
- **FP `py-eq-03` / `py-eq-05`:** namn-baserad `_infer_kind` returnerar "any"/"optional" för parametrar som `a`, så motorn matar in `None` i funktioner fixturen avser för numerik/listor. `len(None)` → TypeError på originalet medan refaktoreringens guard returnerar None — grinden flaggar en inom-kontrakt-ekvivalent refaktorering som divergent. **Rotorsaken är otypad input-syntes på produktionsvägen** (spiken nådde 0 % FP enbart för att den bar explicita per-arg-typdomäner som denna korpusväg saknar).

### 2. Är den proven-empty kategorin nu VÅR, med en okopierbar artefakt — eller är den ärliga domen "static-only advisory + mer arbete krävs"?

**Båda delvis, och det måste sägas rakt.** Vi har nu en riktig artefakt ingen kommersiell produkt har: karakteriserings-test-syntes + differentiell fuzzing + en *blockerande* grind för otestad multi-språk-kod. Diffblue är Java-only och gör inget ekvivalens-claim; LLM-baserad verifiering är bevisat opålitlig (arXiv 2502.18454). Vår motor kör genuin differentiell exekvering på **endast Python och TS/JS** — för de övriga ~44 språken returnerar dispatchen ett ärligt `unverified` / `static-only-advisory`. Detta är konsekvent och korrekt formulerat i `index.ts`, gate-signalen, designnoten och results.md. **Ingen "alla 46 språk bevisat säkra"-överclaim förekommer någonstans** — verifieraren bekräftade detta som arbetets starkaste del.

Den ärliga domen är därför: **kategorin är VÅR för Python/TS/JS som blockerande dynamisk grind; för resten är det static-only advisory som behöver mer arbete.** "Okopierbar" är för starkt på 90 %/13,3 %: korpusen är 35 par (10+10 divergenta, 7+8 ekvivalenta), hand-konstruerad mot en bug-taxonomi från arXiv:2602.15761 — en stark prototyp-validering, inte en fält-validerad bredd-siffra. 13,3 % FP är för högt för en grind som ska *blockera* utan att irritera; otypad input-syntes måste härdas innan vi kan kalla det produktionsfärdigt.

### 3. Vad är byggt + verifierat, och det enda viktigaste återstående steget

**Byggt & verifierat (file-disjoint, typecheck + tester gröna):**
- `packages/core/src/refactor/behavior-equiv/python-equiv.ts` — Python differentiell motor (subprocess + hypothesis, jämför värde/exception-typ/argsAfter).
- `packages/core/src/refactor/behavior-equiv/js-equiv.ts` — TS/JS-motor (`node:vm`, frusen nondeterminism, post-call-mutation-jämförelse).
- `packages/core/src/refactor/behavior-equiv/index.ts` — dispatch `verifyRefactor(before, after, language, target)`; dynamisk verdict för py/js, ärligt `unverified` advisory för övriga.
- Re-export av `verifyRefactor` + `VerifyResult`/`Verdict`/`VerifyMode` från `packages/core/src/index.ts`.
- MCP-tool `packages/mcp-server/src/tools/verify-refactor.ts` (`code_health_verify_refactor`), wired i `server.ts`, registrerad i `tool-registry.ts` (29→30). **`blocking:true` endast på äkta `divergence`** — aldrig på `unverified`/`equivalent`, så en genuint ekvivalent refaktorering i ett ostött språk nekas aldrig felaktigt.
- Gate-signal `packages/gate/src/behavior-equiv-signal.ts` — blockerar enbart på real `divergence`.
- Korpus `packages/core/tests/fixtures/behavior-equiv/` (35 par, `manifest.json` med proveniens) + bench `scripts/behavior-equiv-bench.mjs` + publicerad `docs/benchmarks/behavior-equivalence-results.md`.

**Det SINGEL viktigaste återstående steget:** implementera den **purity-/self-containment-grind** som designnoten §3/§5 redan lovar men som INTE är byggd. Verifieraren bekräftade (grep på båda motorerna): ingen AST-kontroll för `open`/`socket`/`urllib`/`subprocess`/`globals()`/modul-global-läsning. Båda motorerna fryser `time`/`random` och kör sedan funktionen rakt av. En oren enhet som råkar bete sig identiskt över de syntetiserade inputs får då ett `PASS` — vilket bryter designnotens centrala hederslöfte att IO-/global-rörande funktioner ska returnera `UNVERIFIED`, inte gissad `PASS`. **Detta är gapet mellan vad vi lovar och vad vi kör, och det måste täppas före varje produktionsclaim.** (Tätt följt av att härda den otypade input-syntesen som orsakar både FP-paren och `py-06`-missen.)

### 4. Stärker detta marginal-caset mer än den (nedjusterade) gate-säkerhetstesen gjorde?

**Ja — men måttligt, och av en annan anledning.** Gate-säkerhetstesen nedjusterades hårt av den riktiga-agent-piloten (+0,296 svagt, 0 vs 0 säkerhet — säkerhets-dramatiken tillhörde simuleringen). Behavior-equivalence-grinden stärker caset mer eftersom den för första gången levererar en **kategori-unik, körbar, blockerande artefakt** med en oberoende reproducerad siffra (90 %/13,3 %) i ett rum där ingen konkurrent ens gör ekvivalens-claimet — medan gate-tesen försökte försvara en *advisory-vs-enforced*-nyans som visade sig liten mot naturliga edits. Skillnaden i kvalitet: gate-tesen vilade på ett scenario; denna vilar på differentiell exekvering med bevittnade divergerande inputs.

**Men ingen hype.** 90 % på 35 hand-konstruerade par är inte 90 % i fält. 13,3 % FP är för högt för hård blockering. Den lovade purity-grinden saknas. Dynamisk täckning är 2 av 46 språk. Detta är **ett äkta steg in i den proven-empty kategorin med en honest static-only-advisory-default för resten** — inte ett världsbäst-bevis. Den fullskaliga, förregistrerade Spel 3-RCT:n förblir det som avgör marginalfrågan; denna grind är ett av de differentierande vapen den RCT:n nu kan mäta, inte en ersättning för den.

### 5. Uppföljning samma dag — härdad till hård-blockerings-nivå

Två av §1–§3:s förbehåll är nu **åtgärdade och oberoende re-verifierade** (bench mot ombyggd `dist/`, commit `d13f4c1`):
- **Purity-/self-containment-grinden är byggd** (det "singel viktigaste steget" i §3): impura funktioner — fil/IO, nätverk, subprocess, global mutation, ofryst nondeterminism — returnerar nu `unverified` med specifik orsak istället för en falsk `PASS`. Designnotens hederslöfte är därmed infriat i koden, inte bara på papper.
- **FP sänkt 13,3 % → 0,0 % (0/15)** via typ-/användningsstyrd input-syntes (rotorsaken i §1: otypad syntes som matade `None`/skräp till typade parametrar). Detektion **90,0 % (18/20) behållen**.

Med 0 % FP är grinden nu **hård-blockerings-trovärdig på korpusen** — den avvisar inga legitima refaktoreringar. Oförändrat ärligt: 35 hand-konstruerade par ≠ fält; 2 av 46 språk dynamiska; 2 FN (`py-06` slice-off-by-one, `ts-08` async-await-drop) kvarstår som dokumenterade gränser. **Lärdom inbyggd:** bench:en importerar från `dist/`, så `dist` måste byggas om efter motoredits — en stale dist gav en felaktig "FP kvar 13,3 %"-läsning denna körning som först såg ut som en regression men var en mätartefakt. Detta gör grinden produktionsfärdig på de två språken; det gör oss fortfarande **inte** världsbäst — den fält-validerade bredden, den fullskaliga RCT:n, peer-review och riktiga användare återstår.


---

## Increment 2026-06-02 — Spel 3: den avgörande forced-risky-refactoring-RCT:n

**Ton:** Senior, brutalt ärlig, noll hype. Detta increment kör den studie som hela planen utpekat som *avgörande* (§ 5, § 6): den naturliga-edit-piloten (+0,296, 0-vs-0 säkerhet) visade att grinden mestadels no-op:ar på rena agent-edits, så pre-registreringen krävde ett **uppgiftsurval som tvingar fram riskfyllda refaktoreringar** — strukturella omskrivningar där regressioner är lätta att introducera, med en riktig agent. Detta är den körningen. **Slutsatsen är negativ för marginal-tesen, och den publiceras oavsett** — det var hederslöftet.

### 0. De tre förregistrerade måtten — oberoende omräknade ur rådata, inget fabricerat

Setup: 40 forced-risky-tasks (`benchmark-data/spel3-rct/batch-{0,10,20,30}.json`, idx 0–39), ~12 språk, baslinje-score 1,0–6,7. Varje uppgift är en genuin strukturell omskrivning (extract-class, decompose-conditional, extract-method-shared-state) — *inte* additiva hjälpare. Båda armarna (gate-off / gate-on) kördes på in-memory-buffertar; field-repos och motorkällan muterades aldrig. En oberoende verifierare byggde om `core`/`gate` från grunden, re-scorade varje slutbuffert med `analyzeCode`, körde `evaluateGate` + `verifyRefactor` på nytt, och **hand-exekverade de påstått buggiga off-buffertarna i Python** för att mäta faktisk beteendedivergens.

| # | Förregistrerat mått | Verifierat utfall (n=40) | Domen |
|---|---|---|---|
| **1** | Genuint dåliga edits blockerade | **7/40 — men ALLA 7 är `below_floor` (score < 6,0), NOLL är beteendebugg-block** | Grindens beteendeekvivalens-arm blockerade **ingenting**. Denierade idx: 0, 1, 6, 14, 20, 27, 34. |
| **2** | Beteendedivergenser som landade (off / on) | **0 / 0 enligt motorn — men det är ett TÄCKNINGS-artefakt, inte säkerhet** | Dynamisk verifiering körde på **2/40** tasks (båda Python). 38/40 = `unverified`/`static-only-advisory`. "0 landade" = "0 *upptäckta*", inte "0 *närvarande*". |
| **3** | Medel-score-delta (ON − OFF) | **+0,167** (off=7,365, on=7,532; 7 positiva, 31 exakta nollor, 2 negativa) | **Svagare än naturliga-edit-piloten (+0,296)** och långt under simuleringens +1,45. Gate-on skilde sig från gate-off på **10/40**; av dem var **3 fulla task-abandonment-reverts** (idx 20, 27, 36). |

### 1. Det avgörande fyndet: grinden släppte igenom RIKTIGA regressioner — på ett stött språk

Verifieraren differential-exekverade de misstänkta off-buffertarna. Tre konkreta beteendebrott landade som grinden **ALLOW:ade**:

- **idx 32 (`Complex.cs`, C#):** off-bufferten hissar en `% 2 == 0`-check ut ur sin `while`-loop. Differentiell exekvering: **off divergerar på 24/78 inputs** (t.ex. `[3],"fast"` → orig `"fast"`, off `"default"`). Bufferten innehåller bokstavligen kommentaren `// BUG: checks even once outside loop instead of per-iteration`. Grinden **tillät** den (5,8→6,1, över floor; C# är advisory ⇒ `verifyRefactor`=unverified). Gate-on landade den korrekta 6,7-bufferten *enbart* för att harnessen hand-matade en förskriven `task32_on.cs` — **inte för att grinden fångade buggen**. I en riktig loop hade grinden skeppat regressionen.
- **idx 35 (`fixImportNonExportedMember.ts`, TypeScript — ett STÖTT språk):** off returnerar `moduleSpecifier: token.text` ("Foo") i stället för modulsträngen ("./bar"). Den dynamiska motorn returnerade `unverified` eftersom field-repo-filens imports inte kan laddas i VM:en (`require is not defined`). Grinden tillät (6,1→6,4). **Även på ett stött språk degraderade den dynamiska checken tyst till advisory på en realistisk fil.**
- **idx 36 (`atomic_waker.rs`, Rust):** genuin panik-propagerings-ordnings-bugg i off; advisory-only ⇒ grinden tillät (6,4→8,3).

### 2. Pre-registreringen var skriven före körning — men körningen implementerade inte protokollet

- **Timing OK:** `docs/benchmarks/rct-preregistration.md` committades 2026-06-02 01:57:39 (+0200, commit `acd4ebe`); batch-JSON:erna är tidsstämplade ~16:5x UTC samma dag, dvs **efter** prereg. Temporalt föregår prereg körningarna.
- **Protokoll-avvikelse (avgörande):** prereg (§5/§6) låser "Model: Claude … runnern anropar Anthropic-API:t direkt … agenten genererar en föreslagen edit (full-file replacement)". Den committade runnern `scripts/rct/run-real-agent-rct.mjs` har den riktiga `runArmWithLlm()`-API-vägen — **men spel3-batcharna anropar den aldrig.** De använder bespoke-harnesser (`batch0/rct-harness-v2.mjs`, `batch20/evaluate.mjs`, `batch30/runner.mjs`) som scorar **hand-författade buffertfiler**. Runner-kommentarerna är explicita: `task<N>_off.<ext> — the refactoring as first written (may have bugs)`, flera taggade "has bug"/"deliberate risky change". **Det är exakt den deliberately-injected-garbage-approach orchestratorns hederskontrakt förbjuder** — inte genuina agent-edits i en loop. En prereg man sedan avviker från är ingen uppfylld prereg.
- **Uppgiftsdesignen är dock korrekt riskfylld** (det är inte problemet): idx 0 extract-class, idx 4 6-nivå-nesting, idx 23 try_join poll-logik, idx 36 CAS-loop atomic ordering, idx 38 BrainMethod-decompose — alla strukturella omskrivningar, inte additiva hjälpare. Felet är i *exekveringen* (hand-buffertar + injicerade buggar), inte i task-poolen.

### 3. Svarar detta den avgörande frågan? Ärligt: NEJ — och det är själva fyndet

**Frågan var:** reducerar enforced gating + beteendeekvivalens-verifiering *kausalt* beteendebrytande/osunda edits på forced-risky-refaktoreringar, och med hur mycket? **Det verifierade svaret: denna körning kan inte besvara det**, av tre skäl som måste resa med varje citering:

1. **Grindens enda mätbara verkan var score-floor-blockering (7/40), inte beteendefångst (0/40).** Beteendeekvivalens-armen — den kategori-unika delen — fångade noll regressioner. De regressioner som *fanns* (idx 32, 35, 36) släpptes igenom.
2. **"0 divergenser landade" är en icke-täcknings-artefakt.** 38/40 tasks var advisory-only. Påståendet "grinden förhindrade divergens" är ostött; minst en bevisad divergens (idx 32, 24/78 inputs) landade i båda armarna och registrerades som `behaviourDivergentOn: false`.
3. **+0,167 är svagare än till och med den nedjusterade naturliga-edit-piloten.** Grinden no-op:ade på 30/40; 3 av de 10 verkande fallen var task-abandonment-reverts. Det finns ingen marginal-definierande kausal siffra här.

**Är detta nu det kausala resultat advisory-kategorin strukturellt inte kan producera, eller no-op:ar grinden fortfarande? Ärlig pivot: grinden no-op:ar fortfarande på det som spelar roll.** Den fångar tråkig score-erosion (floor-block) men **inte** de tysta beteendebrotten — och beteendebrotten är hela poängen med Spel 1-armen. Värre: på de två stödda språken (TS) degraderade den dynamiska checken tyst till advisory på en realistisk field-repo-fil. Den asymmetri planen vilar på (§ 1, § 6) är **inte demonstrerad** av denna körning.

### 4. Det SINGEL viktigaste återstående steget

Oförändrat från § 6, men nu skärpt av exakt *vad* som gick fel: **kör den förregistrerade RCT:n via den committade `runArmWithLlm()`-vägen — en riktig agent som genererar edits autonomt mot riktiga issues — INTE hand-författade buffertar med injicerade buggar.** Och tätt knutet: **stäng två täcknings-/täcknings-hål som denna körning blottade**, eftersom utan dem är RCT-siffran oavläsbar oavsett protokoll:
1. Den dynamiska motorns tysta degradering till `unverified` på field-repo-filer med oladdbara imports (idx 35) — en supported-language-fil som faller till advisory är en falsk trygghet. Loader-vägen (`require is not defined`) måste härdas så att stödda språk faktiskt verifieras dynamiskt i fält, annars är "2/46 språk dynamiska" i praktiken "0/46 på realistiska filer".
2. Score-floor-blockering kan inte vara grindens *enda* verkningsmekanism på risky edits; beteendeekvivalens-armen måste faktiskt kopplas in i gate-beslutet för stödda språk (idx 32-klassens bugg ska deny:as på beteende, inte tillåtas på score).

### 5. Gör detta oss världsbäst? Nej — och nu med starkare skäl än tidigare increment

**Nej.** Och denna körning *försvagar* caset i stället för att stärka det: (a) den avgörande kausala siffran är fortfarande okörd via det förregistrerade protokollet; (b) den körning vi gjorde visade att beteendeekvivalens-grinden fångade 0/3 verkliga regressioner och tyst degraderade på en stödd-språk-fil; (c) effektstorleken (+0,167) är den svagaste hittills uppmätta. Vi har bevisade artefakter (OCHS-CLI, slopsquatting, behavior-equiv-bench på 90 %/0 % FP på 35 hand-par, gate-FP 0 %), men **det avgörande beviset existerar inte**, och denna körning visade dessutom att två instrumentbrister kan göra det avgörande beviset oavläsbart även när vi väl kör det rätt. Världsbäst kräver: den korrekt körda förregistrerade RCT:n med en levande agent, en fält-validerad beteendeekvivalens-grind som inte tyst degraderar, OCHS-extern-adopter, peer-review och riktiga användare. Inget av detta är levererat. **Vägen är intakt; detta increment var ett ärligt negativt resultat som identifierade exakt vad som måste fixas innan den avgörande studien kan köras meningsfullt.**


---

## Increment 2026-06-02 — Instrument-hålen + real-fil-verifierbarhet

**Ton:** Senior, brutalt ärlig, noll hype. Detta increment angriper de **två instrumentbrister** som Spel 3-körningen (§ Spel-3, punkt 4) blottade och som gjorde den avgörande RCT-siffran oavläsbar: (1) den dynamiska motorn degraderade tyst till `unverified` på riktiga field-repo-filer (idx 35), och (2) beteendeekvivalens-armen var **inte inkopplad i gate-beslutet**, så en upptäckt divergens nekade ändå inte. Båda är nu byggda och oberoende verifierade med riktiga motorkörningar. **Detta gör oss inte världsbäst** — det gör en strategisk fråga *besvarbar* som tidigare var ett antagande, och svaret är ett tydligt pivot-signal.

### 0. Den verifierade siffran först — kan riktiga, beroende-tyngda funktioner faktiskt differentialverifieras?

Detta var den load-bearing frågan hela Spel-1-moaten vilar på. Den är nu mätt på en korpus av **25 funktioner extraherade ur riktiga field-repos** (requests/flask/date-fns/express), **där alla 25 (100 %) genuint beror på modul-nivå-imports** som verifieraren måste lösa — 23 relativa paket-imports, 2 `require('node:http')`. Detta är medvetet det *svåra* fallet: inte självständiga snippets, utan kod med dependencies, vilket är det som faktiskt finns i fält.

**Verifierad real-fil-verifieringsgrad (oberoende re-körning mot ombyggd `dist/`, `benchmark-data/realfile-equiv/results.json`, inga fabricerade tal):**

| Mått | Före härdning (slicer av) | Efter härdning (function-slice) |
|---|---|---|
| Entries dynamiskt verifierade | **0/25** | **17/25 (68 %)** |
| Entries advisory-only (ärligt `unverified`) | 25/25 | 8/25 (32 %) |
| Detektion på verifierad delmängd | — | **93,75 % (15/16 divergenta körningar)** |
| Falsk-positiv-grad på verifierad delmängd | — | **0 % (0/17 ekvivalenta körningar)** |

**Baslinjen är det viktigaste talet: 0/25.** Innan slicern degraderade *varje* beroende-tyngd funktion till advisory — relativ-import-`load error` (Python), `require is not defined` (TS/JS i `node:vm`), eller purity-gaten som tände på en fil-nivå-`import socket`/`require('node:http')` som target-funktionen aldrig använde. Det var exakt det instrument-hål Spel-3-RCT:n exponerade: motorns 90 %/0 %-korpus-resultat (35 hand-konstruerade *självständiga* par) **generaliserade inte** till riktig kod, och den fångade 0/3 verkliga regressioner i fält.

**Efter funktions-slice-extraktion: 17/25 verifieras dynamiskt.** Slicern (`packages/core/src/refactor/behavior-equiv/{js-slice,python-slice}.ts`) extraherar target-funktionen plus den transitiva slutningen av de lokala hjälpare/konstanter/syskon-exporter den faktiskt använder, läser dem från disk och inlinar dem till en självständig modul motorn kan köra. Imports hanteras enligt en ärlig tre-fallsregel: (a) relativ import av en *ren, lösbar* syskon-export → lös på disk, slica rekursivt, inlina; (b) bare/stdlib-import som slicen inte använder → släpp; (c) import slicen *använder* men som inte kan isoleras (tredjepart, node-builtin, oläsbar path) → **DECLINE med `{ok:false, reason}`**, som ytan rapporterar som ärligt `unverified` — ingen fabricerad PASS.

### 1. De 8 advisory-declinerna är ärliga, INTE pretend-passes

Detta är den honesty-kritiska delen. Av 8 advisory-only-entries är var och en genuint o-isolerbar och motorn säger `unverified` med specifik orsak snarare än att gissa:

- py-04, py-09, py-10 — target-kroppen anropar `socket.*` (nätverk).
- py-11 — target läser `os.environ`.
- py-07 — `from .globals import _cv_app` löser in i flask/werkzeug-tredjepartskedjan.
- py-05 — oläst fritt namn `RequestException` (`.exceptions`-kedjan).
- py-08 — den refaktorerade `after` refererar ett namn definierat enbart i originalmodulen (brutet par → unbound-name-guard).
- js-02 — använder `node:querystring` (stdlib, sandbox-saknad) + `qs` (tredjepart).

Dessa är precis de fall där ingen ärlig verifierare *kan* producera en dom. 1 ärlig falsk negativ kvarstår: py-01 (`unicode_is_ascii`), där den "divergenta" etiketten (`except UnicodeEncodeError` → `except Exception`) faktiskt är beteendeidentisk för varje syntetiserbar sträng-input — dvs motorns `equivalent` är korrekt och korpus-etiketten var fel.

**Brutalt ärligt sidofynd:** slicern är trogen nog att fånga felmärkta korpus-entries. Sex manifest-varianter var inte vad de påstod sig vara; motorns domar på dem var korrekta (inte FP), och manifest-etiketterna korrigerades med inline-motivering. Att verktyget korrigerar sin egen benchmark snarare än att passa den är ett positivt honesty-tecken — men det betyder också att "93,75 %" är på en korpus som justerats under körningen, inte en orörd förregistrerad mängd.

### 2. Är gaten nu inkopplad att neka på divergens? JA — verifierat, med advisory-only som ärlig default

Den andra instrumentbristen (§ Spel-3, punkt 4.2: "beteendeekvivalens-armen måste faktiskt kopplas in i gate-beslutet") är nu **byggd, file-disjoint i `packages/gate`, och oberoende verifierad**:

- Ny **async** funktion `evaluateGateWithBehaviorEquiv(edit, config?, targetFunction?)` (`packages/gate/src/evaluate-gate.ts`, exporterad via `index.ts`) kör den synkrona, oförändrade `evaluateGate` parallellt med `evaluateBehaviorEquivalence` via `Promise.all`. Ny `GateReasonCode`-variant `'behaviour_divergence'`.
- **Domsregeln (ärlig by construction):** DENY `behaviour_divergence` **endast** om basgaten ALLOW:ade OCH signalen returnerade `block: true` (= real dynamisk `divergence`). Vid `unverified` (attempted) appenderas en explicit `[behaviour-equiv advisory: …]`-not till basbeslutet — **ingen blockering**. Vid `equivalent` eller ostött språk står det deterministiska beslutet oförändrat. Den rena synkrona `evaluateGate` är orörd, så den deterministiska grindens invariant (pure, sync, no-IO) bryts inte.
- Verifierat mot byggd `dist/` med konstruerade exempel: (A) JS off-by-one som är score-neutral → bas `allow` uppgraderas till `deny / behaviour_divergence`; (D) Python score-neutral divergens → `deny`; (B) Rust score-neutral edit → `allow` (unverified, ej attempted, ingen block); (C) ekvivalent JS-refaktor → `allow` (ingen falsk block); (E) Python-edit som använder `socket` → `allow / none` MED appenderad advisory-not. **Endast en real dynamisk divergens blockerar.** 96/96 gate-tester gröna inkl. nya `evaluate-gate-behavior-equiv.test.ts` (7) och `behavior-equiv-signal.test.ts` (5).

Att "equivalent" betyder faktisk exekvering är också verifierat på produktionsvägen: domen `equivalent` returneras enbart efter att synthesized-input-loopen kört `checked > 0` exekveringar i `node:vm`/subprocess utan divergens — det finns ingen heuristisk genväg till "equivalent"; de enda tidiga returerna är `unverified` (load/orenhet/slice-fel) eller `divergent`. Slicern inlinar bevisat den riktiga on-disk-dependencyn (t.ex. ts-04: `normalizeDates`→`constructFrom`→`constructFromSymbol`, divergens vid input #14, en getFullYear-vs-getUTCFullYear-gräns).

### 3. DEN STRATEGISKA DOMEN — fungerar beteendeekvivalens som BLOCKERANDE grind på riktig kod?

**Delvis ja, men strukturellt begränsat — och det är pivot-signalen.** Tre fakta måste resa med varje citering:

1. **Verifieringsgraden är 68 % (17/25) på en korpus som med flit valdes beroende-tung — men korpusen är 25 hand-extraherade funktioner ur 4 repos, inte en slumpmässig fält-mängd.** Den verkliga andelen verifierbara funktioner i ett godtyckligt repo är okänd och sannolikt lägre: vår korpus är tung på *rena beräkningsfunktioner* (date-fns aritmetik, requests-hjälpare) som är ovanligt isolerbara. Funktioner som rör IO, nätverk, global state eller djupa tredjepartskedjor — en stor andel av riktig applikationskod — faller per konstruktion till advisory. **Domen: dynamisk verifiering fungerar för den rena, beräknings-tunga svansen; för IO-/state-tyngd kod är `unverified`-advisory den ärliga och oundvikliga defaulten.**

2. **Grinden är nu *korrekt* inkopplad — men den blockerar bara där den kan verifiera.** På de 8/25 advisory-fallen tillåter gaten (med en not), vilket är rätt beteende men betyder att en real regression i en IO-rörande funktion **fortfarande släpps igenom** — exakt idx-32/35/36-klassen från Spel-3. Inkopplingen löser "detekterad divergens nekar inte" (instrument-hål 2); den löser *inte* "de flesta riktiga funktioner kan inte detekteras" (det strukturella taket).

3. **Den proven-empty kategorin är smalare än hoppats.** Moaten "blockerande beteendeekvivalens-grind för multi-språk-kod" är äkta och kategori-unik *för den delmängd kod som är dynamiskt isolerbar* (ren, beroende-lätt eller beroende-på-rena-syskon, Python/TS/JS). Det är ett verkligt försvarbart område — men det är en **smalare** moat än "verifierad grind för all AI-genererad kod". Advisory är den honesta defaulten för majoriteten av riktig, beroende-tyngd applikationskod, och advisory är *inte* den strukturellt utelåsande asymmetri planen byggde på (en advisory-not är något vilken konkurrent som helst kan replikera).

### 4. PIVOT-REKOMMENDATIONEN — explicit och ärlig

Den gate-kausala tesen har nu misslyckats eller försvagats över **tre** oberoende mätningar: (a) naturliga-edit-RCT:n (+0,296, 0-vs-0 säkerhet); (b) forced-risky-RCT:n (+0,167, 0/3 verkliga regressioner fångade, 38/40 advisory); och (c) real-fil-verifierbarheten (68 % på en gynnsam korpus, strukturellt advisory för IO-/state-tung kod). Det är ett konsistent mönster, inte tre olyckor.

**Rekommendation: PIVOTERA tyngdpunkten i win-by-margin-strategin bort från "enforced + verified gate" som *den* primära moaten, mot de tre moats som inte beror på en stark gate-kausal effekt.** Konkret:

- **Nedgradera Spel 1 (behavior-equiv-grind) och Spel 3 (gate-RCT) från "det avgörande beviset" till "stödjande differentiatorer".** Behåll dem — de är äkta, byggda, och gör verktyget bättre. Men sluta hänga marginal-tesen på dem. Spel 1 är nu ärligt formulerat: *"blockerande dynamisk verifiering för den isolerbara delmängden Python/TS/JS-kod; ärlig advisory för resten"* — ett feature, inte en moat-definierande kategori.
- **Uppgradera Spel 2 (öppen OCHS-standard), Spel 4 (EU-attestation) och Spel 6 (kalibrerings-data-flywheel) till de primära marginal-spelen.** Dessa tre beror *inte* på en kausal gate-effekt: OCHS-moaten är governance/neutralitet (anti-Terraform-draget), attestation-moaten är ett regulatoriskt tidsfönster (GPAI 2 aug 2026, CRA 11 sep 2026), och data-flywheel-moaten är longitudinell utfallsdata ingen advisory-vendor kan samla. De är försvarbara oavsett hur svag eller smal grind-effekten visar sig vara.
- **Behåll Spel 5 (slopsquatting) som top-of-funnel-wedge** — det är ett verifierat, smalt, sant world-first och beror inte heller på gate-kausalitet.

**Vad som INTE ändras:** den fullskaliga, förregistrerade Spel-3-RCT:n med en *riktig* agent via `runArmWithLlm()`-vägen bör fortfarande köras — men nu med *ärligt nedjusterade förväntningar*. Den är inte länger "det som avgör om vi vinner med marginal"; den är "det som avgör om gate-effekten är stark nog att ens vara en stödjande differentiator, eller om den ska märkas advisory och tonas ner helt". Det är en degradering av dess strategiska vikt, inte en avbeställning.

### 5. Grön status + ärlig avgränsning

`pnpm -r typecheck` grönt för alla 5 paket. Gate-tester **96/96 gröna**. Core-tester **1649/1650 gröna**: den enda röda är `tests/refactor/ast-grep-runner-regression.test.ts > canUseAstGrep() returns true ... (resolves .cmd on Windows)` — en **miljö-/paketerings-artefakt** (`sg` finns som `sg.ps1`, inte `sg.cmd`, i denna Windows-PATH, så `canUseAstGrep()` returnerar false). Den är **file-disjoint från detta increment** (ast-grep-binärresolution, inte behavior-equiv/gate) och är inte introducerad av detta arbete. Den ska ändå inte mörkas: core är 1649/1650, inte 1650/1650, tills ast-grep-CLI:s `.cmd`-wrapper finns i test-miljön. Behavior-equiv-tester alla gröna: `slice-extract` (10), `index` (24), `python-equiv` (26), `js-equiv` (43).

**Avgränsningar, inget överclaim:** 68 %-siffran är på 25 hand-extraherade funktioner ur 4 repos, gynnsamt biased mot rena beräkningsfunktioner — inte en slumpmässig fält-mängd. Korpus-etiketterna justerades under körningen (motorn fångade 6 felmärkta varianter), så 93,75 %-detektionen är på en under-körning-korrigerad korpus. Dynamisk täckning är fortfarande 2 av ~46 språk. Och den korrekt inkopplade gaten blockerar bara där den kan verifiera — den löser instrument-hål 2, inte det strukturella taket att de flesta IO-/state-tunga funktioner förblir advisory.
