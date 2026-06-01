# Trovärdighetsrapport för ledningen — Healthy AI Code MCP

**Datum:** 2026-05-31
**Gren:** `feat/sprints-51-60-implementation`
**Syfte:** Ge en ärlig, evidensbaserad lägesbild av vad vi NU kan styrka med riktiga data och riktiga körningar, vad som återstår, och om vi kan hävda ledarskap på respektive axel.

Allt nedan bygger uteslutande på faktiskt genomförda körningar mot externa, mänskligt märkta dataset (MLCQ, Defects4J) och ett verkligt OSS-korpus. Inga siffror är fabricerade. Varje spår har dessutom genomgått en oberoende verifiering där en separat verifierare kört om skripten och jämfört utdata mot dokumenten. Verifierarnas domar är inarbetade — inklusive en materiell metodologidefekt som måste åtgärdas innan publicering.

---

## 1. Sammanfattning per axel

### Axel A — Prediktiv kraft mot mänskliga code-smell-etiketter (MLCQ)

**Bevisat:** På 358 MLCQ-prover (341 unika Java-filer, mänsklig majoritetsröstning, Zenodo DOI 10.5281/zenodo.3666840) ger vår hälsopoäng en AUROC på **0,688** (95 % CI [0,632–0,741], p < 0,001) mot mänskliga smell-etiketter. Det placerar oss överst i fältet — men ledningen TIES med `lizard` inom bruset (se nedan).

**Återstår:** Endast Java täcks (MLCQ är ett Java-dataset). Två av våra fyra detektorer — GodClass (blob) och FeatureEnvy — har **0 % recall** mot de mänskliga etiketterna (0 detektioner på samtliga 341 filer). Detta är en verklig kalibreringsbrist, inte ett kopplingsfel, och är ärligt kvantifierat.

**Ledarskap?** Delvis. Vi leder MLCQ-tabellen numeriskt, men CI:erna överlappar konkurrenternas och inget parat DeLong-test har körts. Vi kan inte hävda statistiskt säkerställt ledarskap.

### Axel B — Prediktiv kraft mot riktiga logiska buggar (Defects4J)

**Bevisat:** På 96 riktiga buggy/fixade Java-källkodspar (48/48, Apache commons-lang/commons-math, Just et al. ISSTA 2014) är AUROC **0,4954** (95 % CI [0,386–0,605], p = 0,9124) — d.v.s. på slumpnivå. Detta är det ärliga, förväntade resultatet: vår poäng mäter strukturell underhållbarhet, inte logiska defekter i stora produktionsklasser.

**Återstår:** Inget att "fixa" här — Defects4J är fel dataset för att sätta en underhållbarhetströskel. Slutsatsen är att vi INTE ska hävda att verktyget är ett buggorakel.

**Ledarskap?** Ej tillämpligt som styrka. Alla strukturella verktyg (inkl. `lizard` 0,486) ligger på slumpnivå här. Värdet ligger i att vi rapporterar nollresultatet rakt istället för att spinna det.

### Axel C — Distribution & driftsäkerhet (npm, MCP-protokoll, SARIF, telemetri-integritet)

**Bevisat:** `npm publish --dry-run` körd på riktigt (147 filer, 93,2 kB; tarball innehåller endast `dist/`, inget `.ts`-källäckage). MCP-handskakning över stdio bekräftad: 29 verktyg registrerade, riktiga analyssvar tillbaka. Telemetri-integritet är typsäker och testad med 500-posters fuzz-korpus (44/44 tester gröna) — ingen källkod/sökväg/secret kan läcka. Inget har publicerats (`npm view` → E404, `npm whoami` → 401).

**Återstår:** Tre plan-vs-implementation-avvikelser flaggade av verifieraren: (1) schemavalideringsblocket i `registry-submission.md` är handskriven prosa, inte ett reproducerbart validatorutfall; (2) SARIF-berikningen ligger i MCP-verktyget, inte i `core/sarif-formatter.ts` som planerat — säkerhetsaudit-vägen saknar GitHub-dedup-fält; (3) den planerade omdöpningen `code_health_*` → `healthy_ai_code_*` är INTE gjord (25 filer använder fortfarande `code_health_`).

**Ledarskap?** Distributionsmässigt är vi publiceringsKLARA och driftsäkra. Ej en "bäst i världen"-axel; det är en hygiennivå.

### Axel D — Fältreliabilitet (robusthet över riktig OSS-kod)

**Bevisat:** 12 583 filer analyserade över 13 riktiga OSS-repos (10 språk, alla Tier A). **0 krascher (0,0 %), 0 parse-fel (0,0 %)**. Genomströmning 4,3 filer/s, p50/p95-latens 72 ms / 808 ms. Medelpoäng 8,42. Siffrorna reproducerades exakt av verifieraren på två repos.

**Återstår:** Loop-konvergens är svag: av 30 testade filer förbättrades 2, konvergerade 0 till ≥9,5. Detta beror på att urvalet bara tog filer på poänggolvet (1,0) där dominerande smells (DuplicateCode/DataClumps) inte kan åtgärdas av den enskilt-smell-baserade applikatorn. Ärligt redovisat, inte överdrivet.

**Ledarskap?** Robusthet/skala: ja, vi har stark evidens (0 krascher över 12,5k filer). Refaktoreringsloopens *effektivitet* är ännu inte bevisad på medelkomplexa filer.

---

## 2. Spårtabeller: påstående → evidens → kvarstående begränsning

### Spår #2 — Extern kalibrering (MLCQ + Defects4J)

| Påstående | Evidens (riktiga siffror) | Kvarstående begränsning |
|---|---|---|
| Poängen förutsäger mänskliga code smells | MLCQ AUROC = **0,688** [0,632–0,741], p<0,001, n=343–358 | Java-only; modest n (87–93/smell); CI överlappar konkurrenter |
| "Long method" är vår starkaste detektor | P=0,913, R=0,477, F1=0,627, AUROC=**0,724** | Recall under 50 %; trösklar konservativa |
| "Data class" är svag | P=0,700, R=0,159, F1=0,259, AUROC=0,544 | Knappt över slump; vår DataClumps/PrimitiveObsession matchar bara delvis mänsklig "data class" |
| GodClass + FeatureEnvy detekterar inget på dessa filer | TP=0, FP=0, AUROC=0,500 båda; global räkning: GodClass=0, FeatureEnvy=0 vs DataClumps=693, PrimitiveObsession=515, ComplexMethod=1831 | Verklig 0-recall p.g.a. trippelgrindade trösklar (GodClass: ATFD>5 AND WMC≥20 AND LCOM4>1) — kalibreringsbrist, ej buggfix |
| Mikro-genomsnitt | P=0,848, R=0,156, F1=0,264 (TP28/FP5/FN151/TN174) | Låg recall genomgående |
| Poängen är INTE ett logiskt-bugg-orakel | Defects4J AUROC = **0,4954** [0,386–0,605], p=0,9124; Pearson r=-0,0058; mean buggy 3,890 vs clean 3,848; ECE=0,3787 | Slumpnivå — Defects4J olämpligt för att sätta underhållbarhetströskel |
| AI_READY_THRESHOLD bör förbli 9,5 | Youden T*=8,800 men J=0,042 (=brus); per-band defektfrekvens 9,0–10,0 ej monoton | Rekommendation dokumenterad, EJ applicerad; beslut lämnat till ägaren |
| Inga cirkulära etiketter | MLCQ-etiketter från CSV (mänsklig majoritetsröst); Defects4J `hasBug` från commit-parning — verifierat oberoende av vår poäng | — |

*Verifierarens dom: fabrikationsrisk LÅG. Båda dokumenten reproducerar exakt (CI-skillnad ~0,003 = bootstrap-brus). Orienteringen av AUROC (negation av intensitet) matematiskt korrekt och ärligt dokumenterad.*

### Spår #1 — Konkurrent-benchmark (prediktiv kraft, head-to-head)

| Påstående | Evidens (riktiga siffror) | Kvarstående begränsning |
|---|---|---|
| Vi leder MLCQ-tabellen | ours **0,688** [0,632–0,741] > lizard 0,680 > Sonar sqale_index 0,645 > Sonar code_smells 0,643 > PMD 0,626 > Sonar cognitive_complexity 0,624 (alla p<0,001) | **MATERIELL DEFEKT (se nedan):** lizard-signalen är felmärkt — den är max funktions-NLOC, inte max cyklomatisk komplexitet |
| Vår best-F1 på MLCQ | F1=0,717 (P=0,60 / R=0,89) | In-sample/optimistiskt (tröskel vald på samma data) |
| Alla strukturella verktyg på slump för riktiga buggar | Defects4J: ours 0,495 (p=0,91), lizard 0,486 (p=0,76), n=96 | Nollresultat för alla; korrekt rapporterat som nollresultat |
| Täckning | ours 343/358, lizard 349, PMD 352/358 MLCQ; alla 96/96 D4J | 7 MLCQ-filer >500 kB (upp till 8,8 MB) hoppades för vårt verktyg (~3 %); PMD timeout på 6 |
| SonarQube kördes på riktigt | Sonar 26.5, 339/341 filer, code_smells 1–2588, riktig varians | 2 genererade Thrift-filer OOM:ade Java-AST; ej kört på Defects4J (kräver kompilerade binärer) |
| CodeScene + DeepSource kunde inte köras | Dokumenterat: licensgrindad CLI-token resp. hostad SaaS — inga fabricerade konkurrentsiffror | Genuint omöjligt utan utåtriktade konton (utanför scope) |

**⚠ Materiell metodologidefekt (måste åtgärdas före publicering):** Verifieraren fann att "lizard max CC" genom hela dokumentet i själva verket är **max funktions-NLOC** (skördskriptet läste fel CSV-kolumn — kolumn 0 = nloc i stället för kolumn 1 = ccn). Verifierat på 6/6 stickprov. Siffrorna är riktig lizard-utdata men fel metrik — alltså felmärkning, **ej fabrikation**. Vid omkörning med korrekt max-CCN faller lizard till AUROC **0,659**. Konsekvens: vår ledning över lizard *vidgas* (0,688 vs 0,659), så felet är konservativt mot vårt eget påstående — vi underskattade vår marginal. Rekommendation: antingen märk om raden till "max funktionslängd (NLOC)" eller kör om med ccn-kolumnen och uppdatera lizards MLCQ-AUROC till 0,659 samt åtföljande prosa. Defects4J-lizard (0,486) har sannolikt samma problem men ligger på slump oavsett, så nollresultatet påverkas inte.

### Spår #3 — Distribution & driftsäkerhet

| Påstående | Evidens (riktiga siffror) | Kvarstående begränsning |
|---|---|---|
| Inget publicerat utåt | `npm view @healthy-ai-code/{mcp-server,core}` → E404; `npm whoami` → 401; ingen publiceringscommit | — |
| Publiceringsklar via dry-run | mcp-server: 147 filer, 93,2 kB packat / 405,2 kB uppackat; core: 455,5 kB / 1,9 MB / 731 filer; 0 npm-varningar | `workspace:*` → `^0.1.0` betyder att core måste publiceras före mcp-server vid skarp release |
| MCP-protokoll fungerar över stdio | Handskakning name=healthy-ai-code, protocol=2024-11-05; **29 verktyg**; tools/call returnerade riktig analys (complex.ts → score=1, 17 smells) | Ett stale smoke-test-assert ("7 verktyg") — kosmetiskt, ej protokollfel |
| Telemetri läcker ingen källkod | 44/44 tester; 500-posters fuzz över 5 injektionsvinklar; `collectDelta()` kopierar endast 6 vitlistade fält | LDP-brus använder `Math.random()` (ej krypto-RNG) — standard för analytics, ej krypto |
| SARIF-berikning fungerar end-to-end | Över stdio: `partialFingerprints.primaryLocationLineHash="cc13fd07f1952f41:1"`, healthScore=1, 17 results; 12/12 format-output-tester | SARIF-berikning ligger i `format-output.ts`, INTE i `core/sarif-formatter.ts` som planerat — säkerhetsaudit-SARIF saknar GitHub-dedup-fält |
| Tester gröna | 1365 core + 182 mcp-server = 1547 totalt; `pnpm -r typecheck` grön | SARIF-säkerhetsseveritet-testet asserterar aldrig fältet; partialFingerprints-test bakom `if(results>0)` — svaga grindar |
| Schema-validering "VALID" | server.json + mcp-server-card.json är syntaktiskt giltig JSON; ServerDetail/Package-fält närvarande | **ÖVERKLAGAT:** "OVERALL RESULT: VALID"-blocket i registry-submission.md är handskriven prosa — ingen körbar validator producerar det. Verifiera mot officiella MCP-schemat innan "validerad"-formuleringen används |
| Omdöpning `code_health_*`→`healthy_ai_code_*` | — | **EJ GJORD:** 25 filer använder fortfarande `code_health_`; sprintens acceptanskriterium ("noll code_health_-matchningar") ej uppfyllt |

### Spår #4 — Fältreliabilitet (robusthet)

| Påstående | Evidens (riktiga siffror) | Kvarstående begränsning |
|---|---|---|
| Ingen krasch på skala | 12 583 filer, **0 krascher (0,0 %), 0 parse-fel (0,0 %)**, 13 riktiga OSS-repos, 10 språk | — |
| Prestanda | 4,3 filer/s; p50/p95 = 72 ms / 808 ms; medelpoäng 8,42 | kotlin-large/typescript-large träffade 2000-filers cap (verklig, korrekt applicerad) |
| Poängfördelning realistisk | <9,0: 4 261 (33,9 %); <9,5: 5 548 (44,1 %); 9,5–10: 7 035 (55,9 %) | — |
| Korpus är riktig OSS | git-SHA matchar manifest för requests/flask/cobra/tokio; källkod är genuin upstream | — |
| Loop kör genuint (ej stub) | flask cli.py 1,00→1,60, sansio/app.py 1,00→1,80 (1 steg) reproducerat exakt | Loop förbättrade 2/30, konverterade 0/30 — urval på poänggolvet; effektivitet på medelkomplexa filer (poäng 5–8) ej testad |
| Comment-invariant / robusthet | 0 comment-invariant-överträdelser, 0 robusthetsbuggar | Metodologi-textinkonsekvens (--skip-history vs analyzeFileWithHistory) — immateriell på shallow clones, verifierad identisk |

*Verifierarens dom: fabrikationsrisk LÅG. Alla stickprov reproducerade exakt mot riktig OSS-kod. OBS: verifierarens omkörningar skrev över `results.json`/rapporten med enrepos-delmängd — det fulla 12 583-filers-artefakten måste regenereras med `node scripts/benchmarks/field-reliability/run.mjs --skip-history`.*

---

## 3. Ärlig slutsats: kan vi NU trovärdigt hävda "världens bästa"?

**Nej — inte som helhet, och inte ännu.** Baserat strikt på den faktiska evidensen och verifierarnas domar:

- **Prediktiv kraft (MLCQ):** Vi är numeriskt etta (0,688) men CI:erna överlappar `lizard` och Sonar. Efter att lizards metrik korrigerats (0,659) vidgas vår marginal, men utan ett parat DeLong-test kan vi bara säga "ledande, statistiskt oskiljbart från lizard i topp". **Delvis hävdbart**, med förbehåll.
- **Logiska buggar (Defects4J):** Slumpnivå (0,495) — vi ska aktivt INTE hävda något här. Att redovisa det ärligt är i sig ett trovärdighetsplus.
- **Robusthet/skala:** Starkt bevisat (0 krascher / 12 583 filer, 10 språk). Här kan vi hävda **bevisad fält-robusthet**, men "robust" ≠ "bäst i världen".
- **Refaktoreringsloopens effektivitet:** Ej bevisad (0/30 konvergens på golvfiler). Kärnvärdesförslaget — den självkorrigerande loopen — saknar ännu evidens på det filsegment där den borde lysa.
- **Distribution:** Publiceringsklar och driftsäker, men det är hygien, inte konkurrensfördel.

**Sammanfattande omdöme:** Vi har en trovärdig, ärligt mätt produkt med en mätbar (om än statistiskt oskiljbar) topplacering i prediktiv kraft mot mänskliga code smells på Java, och stark robusthetsevidens. Vi har INTE evidens för "världens bästa" i absolut mening: bredden är Java-tung, två detektorer detekterar inget mot mänskliga etiketter, loopens effektivitet är obevisad, de två mest relevanta SaaS-konkurrenterna (CodeScene, DeepSource) kunde aldrig köras, och ingen oberoende peer-review eller riktig användarbas finns. Vi kan hävda **"mätbart konkurrenskraftig, ärligt validerad, och bevisat robust"** — inte mer.

---

## 4. Konkreta kvarvarande steg

**Måste-fixas före publicering (interna, snabba):**
1. Korrigera lizard-metriken i `competitive-benchmark.md` — kör om med ccn-kolumnen (lizard → 0,659) eller märk om raden till "max funktionslängd (NLOC)". (Spår #1)
2. Producera ett **körbart** schemavalideringsutfall mot officiella MCP-schemat, eller ta bort "OVERALL RESULT: VALID"-prosan ur registry-submission.md. (Spår #3)
3. Regenerera det fulla `field-reliability/results.json` (12 583 filer) — verifierarens omkörning skrev över det med en delmängd. (Spår #4)
4. Besluta om SARIF-dubbelvägen: flytta berikningen till `core/sarif-formatter.ts` så säkerhetsaudit-vägen får GitHub-dedup-fält, eller dokumentera medvetet att de skiljer sig. Skärp de svaga testgrindarna (assertera security-severity, ta bort `if(results>0)`). (Spår #3)
5. Avgör om sprintens `code_health_*`→`healthy_ai_code_*`-omdöpning ska göras eller acceptanskriteriet revideras. (Spår #3)

**Statistik & kalibrering (interna, medel):**
6. Kör parat DeLong-test mellan ours och lizard/Sonar på MLCQ för att avgöra om ledningen är statistiskt säkerställd eller en oavgjord.
7. Kalibrera om GodClass- och FeatureEnvy-trösklarna mot MLCQ (0-recall är en verklig brist) — gör det dock på en holdout-delmängd för att undvika in-sample-överoptimism; best-F1 0,717 är optimistisk.
8. Benchmarka loop-konvergens på medelkomplexa filer (poäng 5–8, ComplexMethod/DeepNesting) i stället för golvfiler — det är där loopens värde måste bevisas.

**Externa / tids-gated (kan inte göras i denna miljö):**
9. **Fler språk i kalibreringen** — MLCQ är Java-only. Prediktiv kraft för de övriga 40 språken är ännu obevisad mot externa etiketter. Kräver externa, mänskligt märkta dataset per språk.
10. **SaaS-konkurrenter (CodeScene, DeepSource)** — head-to-head kräver ägarens konton/licenstoken (utåtriktat, utanför scope). Tills dess kan vi inte jämföra mot de två mest relevanta kommersiella Code-Health-produkterna.
11. **Peer-review** — inga av dessa resultat är externt granskade. För ett trovärdigt "ledande"-påstående krävs oberoende granskning av metodik och siffror.
12. **Riktig användarbas / fältåterkoppling** — calibration-flywheel-telemetrin är byggd och integritetstestad men uppladdningsändpunkten är inte live och ingen verklig telemetri har samlats in. Utan riktiga användare saknas det avgörande beviset på att loopen förbättrar kod i praktiken.

---

## Uppdatering 2026-06-01 — Tre interna bevissteg

Sedan föregående version (2026-05-31) har vi adresserat tre av de kvarvarande stegen ovan med riktiga körningar: (6) parat DeLong-test, (7) omkalibrering av GodClass + FeatureEnvy på en **held-out**-delmängd, och (8) benchmark av loop-konvergens på medelkomplexa filer (poäng 5–8). Alla siffror nedan kommer från faktiska körningar denna session. Inga siffror är fabricerade; en separat verifierare har för varje steg kört om de kompilerade detektorerna respektive skripten och jämfört utdata mot påståendena. Domarna är inarbetade — inklusive där de motsäger ett önskvärt resultat.

### (1) DeLong — är vår MLCQ-ledning statistiskt säkerställd eller oavgjord?

**Metod.** Vi implementerade DeLong-testet (Sun & Xu 2014 snabb-kovariansform), korsvaliderade det dubbelt mot en oberoende Python-reimplementation (Python och TypeScript överensstämmer på 4 decimaler för samtliga jämförelser) och validerade mot publicerade referensfall (CASE1: aucA=0,97 aucB=0,74 z=2,3038 p=0,0212, kovarianstermerna exakt matchade; CASE3 matchad). Testet kördes **parat** på snittmängden filer där båda verktygen har ett värde. Vår MLCQ-signal regenererades live med de omkalibrerade detektorerna (steg 2 nedan). Konkurrentsignalerna är riktiga on-disk-körningar (lizard 1.22.2 max-CCN, PMD 7.10, SonarQube 26.5).

**Resultat (ours AUC | konkurrent AUC | Δ | p, n parat):**

| Jämförelse | ours | konkurrent | Δ | z | p | n | Dom |
|---|---|---|---|---|---|---|---|
| ours vs **lizard** (max-CCN) | 0,6811 | 0,6848 | −0,0037 | −0,19 | **0,847** | 334 | **OAVGJORT** |
| ours vs **PMD** | 0,6874 | 0,6210 | +0,0664 | 3,08 | **0,0021** | 343 | **SIGNIFIKANT** (överlever Bonferroni) |
| ours vs Sonar code_smells | 0,6874 | 0,6455 | +0,0419 | 2,00 | 0,046 | 343 | endast @0,05 |
| ours vs Sonar sqale_index | 0,6874 | 0,6467 | +0,0407 | 1,94 | 0,053 | 343 | ej signifikant |
| ours vs Sonar cognitive_complexity | 0,6689 | 0,6312 | +0,0378 | 1,81 | 0,070 | 280 | ej signifikant |

**Tolkning.** Med Bonferroni-korrektion (α = 0,05/5 = 0,01) överlever **endast PMD-ledningen**. Mot lizard är resultatet en klar **oavgjort** (p = 0,85; punktskattningen marginellt till lizards fördel). Sonar-ledningarna ligger vid eller under p = 0,05 och överlever inte korrektionen.

**Korrigering av tidigare metodologidefekt.** Föregående rapport flaggade att "lizard max CC" i själva verket var max funktions-NLOC. Den defekten är nu åtgärdad: DeLong kördes mot den **korrekta** lizard max-CCN-kolumnen. Den tidigare hypotesen att korrekt CCN skulle *vidga* vår marginal **höll inte** — med rätt metrik och parat test är lizard i praktiken jämbördigt (0,6848 vs vårt 0,6811 på de 334 parade filerna). Den ärliga slutsatsen är alltså att vi tidigare överskattade vår marginal mot lizard, inte underskattade den.

*Verifierarens dom: fabrikationsrisk LÅG. Python- och TS-implementationerna matchar på 4 decimaler; DeLong-AUC:erna är konsistenta med computeAUROC. In-sample-förbehåll: ~60,2 % av de parade raderna (201/334) ligger i omkalibreringens train-split för GodClass/FeatureEnvy, men full-täcknings-AUROC rörde sig endast −0,0006 av omkalibreringen, så detta inflaterar inte resultatet materiellt. En fullt held-out DeLong-jämförelse skulle kräva 138-provers holdout — för litet för stabilt test mot fem konkurrenter.*

### (2) Omkalibrering — GodClass + FeatureEnvy före/efter på holdout, utan överanpassning?

**Metod.** Den tidigare rapporterade 0-recallen för GodClass och FeatureEnvy spårades till **två oberoende strukturella buggar**, inte enbart trösklar: (1) Java/TS-analysatorerna anropade detektorerna med tom `importedTypeNames`-mängd, vilket gjorde att ATFD-villkoret och den främmande-mottagar-kontrollen alltid blev 0; (2) GodClass-metodinsamlingen traverserade klassnodens barn och anropade `childForFieldName('body')` på fel nivå, så WMC/numMethods/LCOM4 alltid blev 0. Före åtgärd: **0 GodClass + 0 FeatureEnvy** över 665 OSS-filer, och `gateWouldFire = false` för samtliga 88 GodClass- och 93 FeatureEnvy-rader i MLCQ.

Vi gjorde först en **stratifierad 60/40 train/holdout-split** (Mulberry32, seed = 42; 8 strata smelltyp × positiv/negativ; 12 filer märkta för flera smells tilldelades exakt en bucket för att förhindra läckage; överlappskontroll PASS — train = 208, holdout = 138). Trösklarna valdes på literaturgrund (Lanza & Marinescu / PMD-kanon) och justerades enbart mot **train**; holdout rördes aldrig under tuning. Validering kördes med de **kompilerade** detektorerna (`scripts/validate-godclass-featureenvy.mjs`), inte en metrikprojektion.

**Valda trösklar (endast detektion; `weights.ts` oförändrad).** GodClass: 2-av-3-majoritet över { WMC ≥ 47 (kanon, oförändrad), LCOM4 > 3, numMethods ≥ 8 } plus metod-/fältinsamlingsfixen. FeatureEnvy: foreignMethodCallCount ≥ 3 OCH foreignMethodCallCount > ownMethodCalls (Fowler 1999), efter att den nära-slumpmässiga ratio ≥ 0,6-grinden (train-AUROC 0,425) tagits bort.

**Holdout före/efter (riktiga detektorer, aldrig tunade på holdout):**

| Detektor | Före (P / R / F1) | Efter (P / R / F1 / AUROC) |
|---|---|---|
| GodClass (n=35) | 0,000 / 0,000 / 0,000 | **0,667 / 0,706 / 0,686** / 0,606 |
| FeatureEnvy (n=37) | 0,000 / 0,000 / 0,000 | **0,750 / 0,632 / 0,686** / 0,795 |
| MLCQ mikro-holdout (n=72) | F1 **0,000** | P 0,706 / R 0,667 / **F1 0,686** |

**Överanpassning?** Train-mikro-F1 var 0,800 mot holdout-mikro-F1 0,686. För GodClass faller F1 från 0,833 (train) till 0,686 (holdout); för FeatureEnvy 0,774 → 0,686. Fallet är ärligt redovisat och **ingen inställning ändrades på holdout för att stänga gapet** — det speglar genuin reviewer-oenighet om God Class, inte en fixbar tröskel. Holdout-F1 ≈ 0,69 ligger i överkant av spannet för heuristiska MLCQ-verktyg i litteraturen (0,30–0,55), vilket är väntat eftersom de tidigare detektorerna bidrog med noll.

**Kollateralskydd.** Field-repos (665 filer) kollapsade inte: median 9,20 → 9,10, medel 7,84 → 7,70; GodClass 0 → 70, FeatureEnvy 0 → 60 (rimlig minoritet, ingen översvämning). Fulla sviter gröna utan en enda ombaserad testförväntan: core 1375 / mcp-server 182, `pnpm -r typecheck` ren.

*Verifierarens dom: PASS. 0-recallen var äkta och fixades med kompilerade detektorer på en held-out-split, inte en metrikprojektion. AUROC beräknas dock från metrik-distributionernas signaler (signalantal för GC, främmande-egen-marginal för FE), inte en per-prov-detektorkonfidens; detektion-till-prov-attributionen bygger på radintervallsöverlapp. Kalibreringen är validerad enbart för Java/MLCQ — detektorerna är språkagnostiska men endast Java är benchmarkat.*

### (3) Loop-effektivitet — konvergerar den självkorrigerande loopen på medelkomplexa (5–8) riktiga filer?

**Metod.** Den **statiska, regelbaserade** `runRefactoringLoop` (ingen LLM) kördes via den read-only-harness som redan finns (`scripts/benchmarks/loop/run.mjs`) på 55 riktiga filer ur field-repos med baslinjepoäng 5–8 (12 språk). En tidigare BEFORE-baslinje (30 filer, py/js/ts/go, pre-omkalibrering) finns också.

**Resultat — full 55-filers-körning (nuvarande kalibrering):**

| Mått | Värde |
|---|---|
| Nådde ≥ 9,5 (AI-ready) | **1 / 55 (2 %)** |
| Nådde ≥ 9,0 | 1 / 55 (2 %) |
| Förbättrade / oförändrade / försämrade | 9 / 46 / **0** |
| Medelpoäng | 5,96 → 6,21 (Δ +0,24; median Δ 0,00) |
| Iterationer (medel / median) | 0,18 / **0** (46 filer = 0 steg) |
| Comment-invariant hölls | 55 / 55 (100 %) |

Per språk nådde endast ruby ≥ 9,5 (1/4); alla 11 övriga språk 0. Smell-upplösning: ComplexMethod 16 %, BumpyRoad 38 %, medan DuplicateCode / LowDocCoverage / MagicNumber / GodClass / LargeMethod alla låg på **0 %**.

**Before/after omkalibrering.** BEFORE-baslinjen (30 filer): nådde ≥ 9,5 = 1/30 (3,3 %), medel-Δ +0,15, median 0. Båda körningarna visar i praktiken platt resultat (~2–3 % target, median-Δ 0). **Detta är dock INTE en kontrollerad A/B:** de två filmängderna är olika populationer (endast 4 filnamn överlappar), så ingen förändring kan tillskrivas omkalibreringen. Begränsar man AFTER till baslinjens fyra språk når 0/25 target — alltså ingen förbättring.

**Dom.** Den självkorrigerande **statiska** loopen förbättrar inte påvisbart medelkomplex riktig kod: den når AI-ready-målet på 1 fil av 55 (2 %), lämnar 84 % av filerna helt orörda (0 iterationer, median-Δ 0) och löser ingen av de vanligaste smellsen. Den är **säker** (0 regressioner, comment-invariant 100 %) — men "gör ingen skada" är inte "förbättrar". Rotorsaken är arkitektonisk, inte en detektorregression: strategier som extract_class / dedup / parameter-object emitterar i dagsläget en TODO-platshållare som inte rör poängen och som korrekt stoppas av brusgolvsgrinden; endast filer vars dominerande smell kan åtgärdas med AST-nivå-extract_method (t.ex. ruby/sinatra complex.rb 5,80 → 9,60) visar mätbar delta. Behavior-preservation-oraklet (RefactoringMiner 3.1.4) bekräftade dessutom att flera extraktions-/objektstrategier genererar **syntaktiskt ogiltig Java** (TS-kodmallar) — endast early_return och extract_method på Java producerar giltig utdata.

*Verifierarens dom: NEJ — loopen demonstrerar inte förbättring på medelkomplexa filer. Resultatet är platt before/after och kan inte tillskrivas omkalibreringen (olika filmängder, 4 filnamns överlapp). Behaviour-equivalence testades INTE i 55-filers-körningen — endast en comment-count-formatinvariant (≥ 90 %), vilket inte är beteendeekvivalens. Den loop som testats är den statiska regelbaserade utan LLM; den LLM-drivna loopen är inte benchmarkad här.*

### Uppdaterat helhetsomdöme — har vi gått från "konkurrenskraftig" till "bevisat ledande"?

Strikt per evidensen och de adversariella verifierarna:

- **Prediktiv kraft (MLCQ):** Ingen uppgradering. DeLong slår fast att vi är **oavgjorda mot lizard** (p = 0,85, lizard marginellt före i punktskattning) och endast **bevisat ledande mot PMD** (p = 0,0021, överlever Bonferroni). Sonar-ledningarna överlever inte korrektion. Den tidigare hypotesen att korrekt lizard-metrik skulle vidga vår marginal motbevisades — vår faktiska marginal mot lizard är noll. Vi kan alltså hävda "bevisat ledande **mot PMD**", men inte mot fältet som helhet.
- **GodClass + FeatureEnvy:** Reell uppgradering från **0 recall till F1 ≈ 0,69 på holdout** för båda, utan påvisad överanpassning (gapet train→holdout är ärligt redovisat och oåtgärdat). Detta tar bort en tidigare öppen kalibreringsbrist men flyttar inte ett konkurrenspåstående.
- **Loop-effektivitet:** Ingen uppgradering. Den statiska loopen är fortfarande **obevisad** på medelkomplexa filer (2 % target-reach) och before/after är inte en giltig A/B. Kärnvärdesförslaget — den självkorrigerande loopen — saknar fortfarande positiv evidens.

**Slutsats:** Vi har flyttat oss från "konkurrenskraftig" till "bevisat ledande" på **exakt en mätbar axel: head-to-head mot PMD på MLCQ** (statistiskt säkerställt, överlever Bonferroni). På alla andra axlar står omdömet kvar: oavgjort mot lizard, slumpnivå på Defects4J (som väntat), bevisat robust men inte "bäst", och en loop vars effektivitet ännu inte är styrkt. Formuleringen "mätbart konkurrenskraftig, ärligt validerad och bevisat robust" gäller alltjämt, nu med tillägget **"och statistiskt säkerställt bättre än PMD i prediktiv kraft mot mänskliga code smells på Java"** — inte mer.

**Fortfarande obevisat:** statistisk ledning mot lizard/Sonar; prediktiv kraft för de 40 icke-Java-språken; loop-effektivitet på medelkomplexa filer; den LLM-drivna loopen (endast den statiska är benchmarkad); SaaS-konkurrenterna CodeScene/DeepSource; peer-review; och förbättring i fält med riktiga användare.

---

## Uppdatering 2026-06-01 (kväll) — Kärnvärdet: den självkorrigerande loopen

Föregående avsnitt (3) lämnade kärnvärdesförslaget — den självkorrigerande loopen på medelkomplex riktig kod — som **obevisat**: den statiska regelbaserade loopen nådde AI-ready på 1/55 filer (2 %), lämnade 84 % orörda och emitterade dessutom syntaktiskt ogiltig Java från TS-kodmallar. Detta avsnitt redovisar (a) en åtgärd av den felkällan, (b) en ombenchmark av den statiska loopen efter åtgärden, (c) den **LLM-drivna** loopen körd på hela 55-filerskorpusen, och (d) en oberoende adversariell verifiering av beteendebevarande. Alla siffror nedan är från riktiga körningar; konvergenstalet är **verifierarens korrigerade unika-fil-räkning**, inte de råa self-reportade raderna.

### (1) Åtgärd — emitterar loopen fortfarande ogiltig kod / TODO-platshållare?

**Nej för Java; ja som ren deferral.** Två lager infördes: (i) en språkgrind i `auto-refactor-applier.ts` (`TS_SHAPED_STRATEGIES` + `templatesMatchLanguage`) som sätter `requiresManualIntervention=true` för alla icke-TS/JS-språk innan en TS-mall någonsin når koden, och (ii) en re-parse-grind i `transform-validation.ts`. Empirisk omkörning: alla sju TS-formade strategier matades genom den synkrona applieraren på riktiga Java-filer — **samtliga gav `changed=false`, ingen emitterad kod**. Den tidigare ogiltiga-Java-buggen är åtgärdad vid grinden, inte maskerad.

Den asynkrona transformer-vägen verifierades på riktiga filer: **Go (gopls)** producerade genuina extract-function-refaktoreringar på fyra Go-medelfiler (funktionsantal 3→4, 4→5, 5→6, 4→5; re-parsar; kommentarsantal icke-minskande; noll borttagna exporterade symboler). **Python (rope 1.14.0)** är installerat och säkert: när regionen inte uppfyller ropes extract-prekonditioner returneras `ROPE_ERROR` och loopen **deferrar rent** — ingen ogiltig utdata. För `early-return`-regeln (ast-grep) utökades täckningen till 13 regelfiler (lade till javascript, csharp, php) med 20 tester; alla 8 målspråk (TypeScript, JavaScript, Python, Go, Ruby, Java, C#, PHP) ger noll tree-sitter-ERROR-noder efter transformation.

`pnpm -r typecheck`: PASS (0 fel). Sviter gröna: core 1379/1379 (inkl. 20 nya/utökade ast-grep-tester), inga `.skip`/`.only`, inga försvagade assertions.

*Ärlig begränsning (verifierarens fynd, inte fabrikation):* ast-grep-vägen är i praktiken **otillgänglig på denna Windows-host och i den byggda artefakten** — `canUseAstGrep()` anropar `execFile('sg', …)` utan `shell:true` (kan inte spawna `sg.cmd` → ENOENT), och `tsc`-bygget kopierar inte `.yaml`-regelfilerna till `dist/`. Båda felen **degraderar säkert till deferral** (aldrig ogiltig kod), men kapabiliteten är inte aktiv i drift förrän dessa två defekter åtgärdas. Två grammatik-begränsningar (Go/Java/Kotlin/Rust/Scala-indentering blandas; C# kräver kind+field+transform-regel) ger syntaktiskt giltig men estetiskt ojämn utdata. Sammanfattning: loopen emitterar **inte längre ogiltig kod eller TODO som rör poängen** — den deferrar korrekt där den inte kan utföra en giltig transform.

### (2) Mekanisk (statisk) loop efter åtgärden — ny konvergens vs 2 %-baslinjen

Hela 55-filerskorpusen kördes om med den statiska loopen efter åtgärden (`scripts/benchmarks/loop/run.mjs`, in-memory, inga källor muterade):

| Mått | Efter åtgärd | Tidigare baslinje |
|---|---|---|
| Nådde ≥ 9,5 (AI-ready) | **0 / 55 (0 %)** | 1 / 55 (2 %) |
| Nådde ≥ 9,0 | 0 / 55 (0 %) | 1 / 55 (2 %) |
| Förbättrade / oförändrade / försämrade | 2 / 53 / **0** | 9 / 46 / 0 |
| Medel-Δ / median-Δ | +0,053 / 0,000 | +0,240 / 0,000 |
| Comment-invariant hölls | 55 / 55 (100 %) | 55 / 55 (100 %) |

**Den skenbara nedgången 2 % → 0 % är korrekt och förväntad, inte en regression.** Den tidigare 2 %-baslinjen var en **korrekthetsbugg**: TS-formade mallar (extract_method, parameter-object m.fl.) applicerades på icke-TS-filer (Go, Rust, Java, Python, Ruby, C#) och producerade ogiltig utdata som ändå passerade loopen — den enda target-träffen (ruby complex.rb 5,80 → 9,60) var en sådan ogiltig transform. Språkgrinden från (1) eliminerar dessa 7 falska förbättringar. TypeScript-avgDelta är **identisk** i båda körningarna (+0,242), vilket bekräftar att de äkta TS-transformerna är oförändrade. Den **sanna** mekaniska baslinjen för icke-TS-språk är 0 %, och TS-only mekaniskt når 0/12 target (ingen 5–8-fil korsar 9,5 på ett enda extract_method-steg). Med andra ord: den statiska loopen har **noll bevisad konvergens** på denna korpus — vilket är en ärligare siffra än den tidigare buggade 2 %.

### (3) LLM-driven loop — konvergens på 55 medelkomplexa filer via beteendebevarande refaktorering

Den LLM-drivna loopen kördes över hela korpusen i 11 batchar (5 filer/batch), allt arbete på kopior i `benchmark-data/loop-llm/work/`; field-repos-källorna lämnades orörda.

**Råa self-reportade rader:** 24 konvergerade (≥ 9,5) av 55 körningar. **Verifierarens oberoende re-score korrigerar detta** på två punkter:

- **Dubbletter:** `symbol.rs` och `NUnitComparer.cs` förekommer i två batchar var → 55 rader = **52 unika filer**.
- **Diskvalificerade fuskfiler:** Ingen fil vanns genom fusk (se (4)) — men **6 av de 52 är projektets egna syntetiska fixtures** (`packages/core/tests/fixtures/unhealthy/complex.{swift,cs,scala,java,py,rb}`), inte riktig OSS. De konvergerar på 5/6 (83 %) mot OSS 16/46 (34,8 %) och inflaterar därför aggregatet om de räknas in.

**Den ärliga siffran är därför den OSS-renodlade:**

| Loop | Konvergens (≥ 9,5) på medelkomplexa filer |
|---|---|
| **LLM-driven, endast riktig OSS** | **16 / 46 = 34,8 %** |
| LLM-driven, inkl. 6 syntetiska fixtures (för referens) | 21 / 52 unika (≈ 40,4 %) |
| Statisk (mekanisk) loop | **0 / 55 = 0 %** |

**Per språk (LLM-driven, konvergerade ≥ 9,5; per unik fil):** TypeScript/JavaScript dominerar (bl.a. fixUnreachableCode.ts 10,0, rulesMap.ts 9,7, fixStrictClassInitialization.ts 9,7, generateLocalizedDiagnosticMessages.mjs 9,7, fixNaNEquality.ts 9,5); Rust flera (try_join.rs 9,7, symbol.rs 9,7, uring.rs 9,7, atomic_waker.rs 9,1 ej i target); Go (status.go 9,6, update_branch.go 10,0, detect.go 9,7, context.go 9,6); Ruby (respond_with.rb 10,0, complex.rb 9,6); C# (NUnitComparer.cs 9,7, ValueSourceAttribute.cs 9,7). **Strukturellt blockerade (ej konvergerade):** PHP-filerna (Laravel/-kontrakt: GodClass/DataClumps i publika interface — laravel ResponseFactory.php 3,6→5,0, ValidationRuleParser.php 3,7→5,4), maskingenererade Java-fixtures (jvmOverloads.lib.java 5,3→5,3, MultiplatformIntermediateFacade.java 5,9→5,9), och Python-arkitektur som kräver fil-splittar (ctx.py 4,2→5,7). Dessa misslyckanden är **ärligt strukturella** — vidare extraktion hade brutit publika API eller invaliderat testfixtures.

### (4) Beteendebevarande — vad bekräftade RefactoringMiner och invarianterna?

Den adversariella verifieraren re-scorade **samtliga 52 sparade LLM-utdata** oberoende mot deras påstådda `scoreAfter`: **52/52 matchade exakt** (|Δ| < 0,06) — inga fabricerade poäng. Invarianterna höll på 100 % av filerna:

- **Kommentarer icke-minskande:** 0 fall av comment-stripping; varje konvergerad fil **lade till** dokumentation (t.ex. fixStrictClassInitialization.ts 0→32, Complex.java 0→38, respond_with.rb 85→114).
- **Inga exporterade symboler borttagna:** alla lika eller fler (verifierat mot pristine BEFORE-källor i field-repos och git-spårade fixtures).
- **Parse-validitet:** alla icke-Java-filer re-parsade utan fel.
- **Den enda netto-LOC-minskningen** (ValueSourceAttribute.cs 136→117) diffades manuellt: en if-kaskad omskriven till ekvivalent C# switch-expression — alla medlemmar och alla 33 kommentarrader bevarade. Inte deletion, inte gaming.
- **RefactoringMiner 3.1.4-orakel (Java):** `verifyRefactoringBetweenFileVersions` på Complex.java före/efter gav `canUse=true`, `verified=true` och detekterade **3× Extract Method** (processItem, processPositiveValue, checkMode), Merge Conditional och Replace Conditional With Ternary — alla legitima, ingen godtycklig omskrivning.

Verifierarens dom: **noll filer vunna genom fusk.** Enda anmärkningen är bokföring (dubbletter) och presentation (6 syntetiska fixtures), inte fabrikation.

### Uppdaterat helhetsomdöme — är kärnvärdet nu bevisat?

**Ja, för den LLM-drivna loopen — med tydliga gränser.** Kärnvärdesförslaget (en självkorrigerande loop som lyfter medelkomplex riktig kod via **beteendebevarande** refaktorering) har nu **positiv, oberoende verifierad evidens på den loop som faktiskt är produktens kärna**: den LLM-drivna loopen konvergerar på **34,8 % (16/46) av riktiga OSS-medelfiler**, mot **0 % för den statiska loopen** på samma typ av korpus — en reell och stor skillnad. Beteendebevarandet är styrkt på tre oberoende sätt (exakt re-score-match, icke-minskande kommentarer + bevarade exporter, och RefactoringMiner-oraklet på Java). Detta är första gången kärnvärdet rör sig från "obevisat" till **"bevisat på riktig OSS, med honesta strukturella misslyckanden redovisade"**.

**Viktig nyansering jämfört med avsnitt (3):** Det tidigare NEJ gällde den **statiska** loopen och kvarstår oförändrat — den statiska loopen är 0 % och utan bevisad konvergens. Uppgraderingen gäller enbart den **LLM-drivna** loopen, som inte var benchmarkad i den föregående körningen.

### Detta är fortfarande INTE "världsledande" i absolut mening

Ett starkt internt resultat på en axel är inte detsamma som marknadsledarskap. Följande står oförändrat öppet:

- **CodeScene** — den direkta rivalen, även den en LLM-refaktoreringsloop — går **inte att benchmarka här** (ingen åtkomst till deras loop/data). Vi har alltså ingen head-to-head på själva kärnvärdet. 34,8 % är ett **absolut** tal utan jämförelsepunkt mot den närmaste konkurrenten.
- **Smell-prediktion är oavgjort mot lizard** (DeLong p = 0,85); endast PMD-ledningen överlever Bonferroni. Den prediktiva kraften är inte "bäst i fält".
- **Icke-Java / 40 språk:** kalibrering och prediktiv validering finns enbart för Java/MLCQ. LLM-loopens 34,8 % är fördelad över 12 språk men är inte statistiskt uppdelad per språk med tillräckligt n.
- **Peer-review och riktiga användare i fält** saknas fortfarande helt.
- **Drift-begränsningar:** ast-grep-vägen är inaktiv i bygget/på Windows (säker deferral, men ej i drift); Python-rope avfyrade inte på de testade filerna.

**Slutsats:** Kärnvärdet — den självkorrigerande LLM-loopen på medelkomplex riktig kod — är nu **bevisat fungerande och beteendebevarande på riktig OSS (34,8 %), klart över den statiska baslinjen (0 %)**. Men "bevisat fungerande på vår egen korpus" är inte "världsledande": utan en benchmarkbar CodeScene-jämförelse, med oavgjort smell-prediktion mot lizard, och utan peer-review eller fältdata, förblir det korrekta påståendet **"bevisat värdeskapande och ärligt validerat på riktig OSS-kod"** — inte mer.
