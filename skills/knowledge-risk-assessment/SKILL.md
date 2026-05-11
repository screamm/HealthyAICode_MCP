# Kunskapsriskbedömning — bus factor och dolda beroenden

## Syfte

Kod är mer bräcklig när kunskapen om den sitter hos en enda person. Det räcker med att den personen
är sjuk en vecka, byter jobb eller går på semester för att teamet ska stå handfallet. Det här skill
synliggör dessa risker på ett objektivt och datadrivet sätt — och ger konkreta åtgärdsförslag.

Tre typer av kunskapsrisker identifieras:

- **Koordinationsrisk** — för många personer ändrar samma fil, vilket skapar konflikter och defekter
- **Bus factor-risk** — en enda person äger kunskapen om en kritisk fil
- **Dolda arkitekturrisker** — filer som alltid ändras ihop men inte borde höra ihop

---

## Steg 1 — Kör kunskapskartan

Anropa `code_health_knowledge_map` med sökvägen till projektet:

```json
{
  "tool": "code_health_knowledge_map",
  "arguments": {
    "projectPath": "/absolut/sökväg/till/projektet"
  }
}
```

Verktyget returnerar:

```
summary {
  totalFiles        — antal analyserade filer
  congestionRisk    — andel filer med >= 5 aktiva författare
  singleOwnerRisk   — andel filer med exakt en känd ägare
  hiddenCouplingPairs — antal filpar med stark temporal koppling
}
developerCongestion[]   — filer med för många samtidiga ägare
knowledgeRisk[]         — filer med bus factor = 1
temporalCoupling[]      — filpar som alltid ändras ihop
```

---

## Steg 2 — Tolka koordinationsrisk (developerCongestion)

Filer med fem eller fler aktiva författare har förhöjd defektrisk. Forskning visar att antalet
unika bidragsgivare är en av de starkaste prediktorerna för buggar.

**Vad det innebär:**
- Ingen äger helheten — alla gör lokala ändringar utan att förstå konsekvenserna
- Mergeconflikter ökar, vilket leder till hastiga lösningar
- Testning och review blir svårare när ingen har full bild

**Åtgärder:**
- Utse en primärägare (module owner) som godkänner alla ändringar
- Bryt ner filen i mindre, tydligare avgränsade delar
- Inför obligatorisk code review av primärägaren

---

## Steg 3 — Tolka bus factor-risk (knowledgeRisk, busFactorEstimate = 1)

En fil med `busFactorEstimate = 1` betyder att om den personen försvinner förlorar teamet
kritisk kunskap. Filen kan fortfarande fungera tekniskt — men ingen vet hur den fungerar
eller hur man ändrar den säkert.

**Vad det innebär:**
- Hotfix-situationer blir kaotiska
- Onboarding av nya teammedlemmar tar onödigt lång tid
- Refaktorering undviks eftersom "ingen törs röra den"

**Åtgärder:**
- Schemalägg pair programming-sessioner där experten undervisar en kollega
- Kräv att dessa filer alltid code-reviewas av minst en annan person
- Prioritera att skriva förklarande dokumentation och beslutsposter (ADR)
- Rotera code review-ansvar så att fler bygger upp förståelse

---

## Steg 4 — Tolka temporal koppling (temporalCoupling)

Temporal koppling innebär att två filer ändras synkroniserat i commit efter commit — men utan
att vara explicita beroenden av varandra i koden. Det är ett tecken på dold arkitekturell skuld.

**Kopplingsgräns:** >= 50 % samändring räknas som stark koppling.

**Vad det innebär:**
- Modulerna är kopplade i praktiken, även om koden inte säger det
- En ändring i fil A kräver alltid en ändring i fil B — utan att det är dokumenterat
- Nästa utvecklare hittar inte sambandet och introducerar en bugg

**Åtgärder:**
- Slå ihop filerna om de konceptuellt hör ihop
- Dela på filerna längs en tydligare ansvarsgräns om de är oönskade beroenden
- Gör beroendet explicit med ett väldefinierat API mellan dem

---

## Steg 5 — Korsreferera med kodhälsa

Kör `code_health_score` på de filer som identifierats som högriskfiler i stegen ovan:

```json
{
  "tool": "code_health_score",
  "arguments": {
    "filePath": "/sökväg/till/högriskfil.ts"
  }
}
```

Kombinera resultaten för att identifiera kritiska prioriteter:

| Kunskapsrisk | Kodhälsopoäng | Prioritet    |
|--------------|---------------|--------------|
| Hög          | < 5           | KRITISK — åtgärda omedelbart |
| Hög          | 5–7           | Hög — planera in inom sprinten |
| Hög          | > 7           | Medium — övervaka och dokumentera |
| Låg          | < 5           | Medium — teknisk skuld att planera in |
| Låg          | > 7           | Låg — bevaka |

---

## Steg 6 — Sammanfattning och åtgärdsplan

Rangordna riskerna baserat på kombinationen av kunskapsrisk och kodhälsa. Formulera en konkret
åtgärdsplan för de tre till fem mest kritiska filerna.

### Rapportmall för tech lead

```
Kunskapsriskrapport — [Projektnamn] — [Datum]

SAMMANFATTNING
Analyserade filer:        [totalFiles]
Bus factor-risk:          [antal] filer med en enda kunskapsinnehavare
Koordinationsrisk:        [antal] filer med >= 5 aktiva författare
Dolda kopplingar:         [hiddenCouplingPairs] filpar med stark temporal koppling

KRITISKA FILER (bus factor 1 + låg kodhälsa)
1. [filnamn] — Score: [X.X] — Ägare: [namn] — Åtgärd: pair programming + dokumentation
2. [filnamn] — Score: [X.X] — Ägare: [namn] — Åtgärd: code review-rotation
3. ...

KOORDINATIONSRISKER
1. [filnamn] — [N] aktiva författare — Åtgärd: utse primärägare
2. ...

DOLDA KOPPLINGAR
1. [fil A] ↔ [fil B] — [X]% samändring — Åtgärd: slå ihop eller gör beroendet explicit
2. ...

REKOMMENDERADE ÅTGÄRDER (prioritetsordning)
1. ...
2. ...
3. ...
```

---

## Vanliga misstag att undvika

- **Ignorera bus factor tills det är akut.** Risken materialiseras plötsligt — planera i förväg.
- **Blanda ihop koordinationsrisk med produktivitet.** Många bidragsgivare är bra för öppen
  källkod men riskabelt för kritiska interna moduler.
- **Glömma temporal koppling i arkitekturgranskning.** Dessa dolda beroenden hittas inte
  med vanliga statiska analysverktyg.
