# Kodhälsogranskning — strukturerat arbetsflöde

## Syfte

Traditionella code reviews är beroende av granskarens erfarenhet och uppmärksamhet. En van granskare fångar många problem — men design-smells som hög koppling, svaga abstraktioner och dold komplexitet är svåra att se utan ett systematiskt ramverk. Dessutom varierar tröskeln för vad som "går igenom" från granskare till granskare.

Det här skillt ger ett objektivt komplement till den mänskliga code reviewn. Det ersätter inte den — det förstärker den med mätbara, konsekventa kriterier.

Använd det här skillt när:
- Du granskar en PR och vill ha objektiva hälsomått som underlag
- Du vill ge konkret, sifferbaserad feedback istället för subjektiva kommentarer
- Du sätter upp granskningsrutiner för ett team och behöver tydliga merge-kriterier
- Du granskar en enskild fil inför en refaktorering eller merge

---

## Scenario A — Granska en enskild fil

Använd det här scenariot när du granskar en specifik fil, oavsett om den är del av en PR eller inte.

### Steg A.1 — Snabb bedömning med score

Anropa `code_health_score`:

```
code_health_score({ filePath: "<sökväg till fil>" })
```

Använd beslutsmatrisen nedan för att avgöra nästa steg:

| Score | Status | Innebörd | Åtgärd |
|-------|--------|----------|--------|
| >= 9.5 | AI-redo | Utmärkt — klar och välstrukturerad | Inga åtgärder krävs |
| 7.0–9.4 | Grön/gul | Godkänd — mindre förbättringsmöjligheter | Kör `code_health_review` för detaljer |
| 4.0–6.9 | Gul | Problematisk — smells påverkar underhållbarhet | Åtgärda identifierade problem innan merge |
| < 4.0 | Röd | Kritisk — hög komplexitet och teknisk skuld | Refaktorera innan commit, eskalera om nödvändigt |

### Steg A.2 — Djupgranskning av identifierade problem

Om score är under 9.5, anropa `code_health_review`:

```
code_health_review({ filePath: "<sökväg till fil>" })
```

Verktyget kan returnera resultaten i omgångar — fortsätt anropa tills `loopComplete: true`. Läs varje identifierat problem och förstå:
- Vad problemet är
- Varför det är ett problem (vad det gör svårare i praktiken)
- Vilken del av koden det berör

### Steg A.3 — Rapportera

Sammanfatta granskningen med tre delar:

1. **Score** — det objektiva måttet
2. **Identifierade problem** — lista från `code_health_review`, grupperade efter allvarlighetsgrad
3. **Prioriterade åtgärder** — vad som bör åtgärdas och i vilken ordning

---

## Scenario B — Granska ett PR eller en branch

Använd det här scenariot när du granskar en feature-branch med en öppen PR. Det ger en helhetsbild av alla ändringar och hur de påverkar kodhälsan jämfört med basgrenen.

### Steg B.1 — Analysera hela changeset

Anropa `analyze_change_set` med sökväg till repot och namn på basgrenen:

```
analyze_change_set({ repoPath: "<sökväg till repo>", baseBranch: "main" })
```

### Steg B.2 — Kontrollera `overallSafe`

Det här är det viktigaste fältet. Om `overallSafe: false` — lista varje fil som orsakat fällan och varför. Dessa måste åtgärdas innan merge.

### Steg B.3 — Kontrollera `newUnhealthyFiles`

Nya filer som introduceras i PRn med låg score är ett problem som är enklare att åtgärda nu än efter merge. Identifiera dem och inkludera dem i review-kommentaren.

### Steg B.4 — Kontrollera `improvements`

Om PRn förbättrar kodhälsan i befintliga filer — lyft fram det. Det är positivt beteende som bör uppmuntras och synliggöras för teamet.

### Steg B.5 — Formulera review-kommentaren

Använd mallarna nedan (se avsnittet "Mallar för review-kommentarer").

---

## Mallar för review-kommentarer

### Godkänd

```
Kodhälsogranskning: GODKÄND

Alla ändrade filer uppfyller hälsokraven (overallSafe: true).
Inga regressioner identifierade.

[Om förbättringar finns:]
Positivt: Följande filer förbättrades i denna PR:
- [filnamn]: [gammal score] → [ny score]

Redo för merge.
```

---

### Godkänd med anmärkningar

```
Kodhälsogranskning: GODKÄND MED ANMÄRKNINGAR

overallSafe: true — PR kan mergas, men följande bör noteras:

Filer som bör åtgärdas i kommande PR:
- [filnamn]: score [X.X] (gul zon, 7.0–9.4)
  Problem: [lista de viktigaste smells från code_health_review]

Ingen blockerare för denna merge, men skapa en teknisk skuld-uppgift för ovanstående.
```

---

### Avslagen

```
Kodhälsogranskning: AVSLAGEN

overallSafe: false — följande filer blockerar merge:

- [filnamn]: score [X.X] (röd zon, under 7.0)
  Problem: [lista smells från code_health_review]
  Krävs: Åtgärda identifierade problem tills score >= 7.0

[Om nya ohälsosamma filer finns:]
Nya filer med otillräcklig hälsa:
- [filnamn]: score [X.X]

Uppdatera PRn och begär ny granskning när åtgärderna är genomförda.
```

---

## Kriterier för merge-beredskap

En PR är redo att mergas när samtliga följande villkor uppfylls:

- `overallSafe: true` — inga filer bryter hälsogränsen
- Inga röda filer — inga ändrade eller nya filer med score under 4.0
- Inga regressioner — inga befintliga filer vars score försämrats av PRns ändringar
- Gula filer dokumenterade — filer i 7.0–9.4-zonen är antingen accepterade eller har en uppföljningsuppgift

En PR uppfyller inte merge-kriterierna om `overallSafe: false` — oavsett andra faktorer.

---

## Principer för objektiv granskning

**Håll dig till siffrorna.** "Den här koden känns komplex" är subjektivt. "Den här filen har score 4.8 och tre smells relaterade till hög cyklomatisk komplexitet" är objektivt.

**Separera åsikt från mätning.** Du kan ha en åsikt om kodstil — men kodhälsomåtten är verktygets bedömning, inte din. Presentera dem som vad de är: objektiva mätningar.

**Lyft positiva resultat.** Om en PR förbättrar kodhälsan — säg det. Det uppmuntrar rätt beteende och gör granskningsprocessen balanserad.

**Skapa uppföljning för gul zon.** Filer i 7.0–9.4-zonen blockerar inte merge men bör följas upp. Skapa en uppgift i backloggen istället för att låta dem glömmas bort.
