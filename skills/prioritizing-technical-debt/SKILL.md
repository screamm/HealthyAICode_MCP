# Prioritera teknisk skuld — var börjar du?

## Syfte

Utan ett systematiskt prioriteringssätt tenderar team att åtgärda teknisk skuld där den syns,
inte där den skadar mest. Resultatet: man lägger tid på filer som ingen rör, medan de riktiga
problemfilerna — de som ändras varje sprint och bromsar leveransen — förblir orörda.

Det här skill ger dig ett datadrivet beslutsstöd för att avgöra var insatsen ger störst effekt.

---

## Prioriteringsmatrisen

Två faktorer avgör var teknisk skuld faktiskt skadar: kodhälsa och förändringfrekvens.
Kombinationen av dessa ger fyra tydliga kategorier:

```
                        FÖRÄNDRINGFREKVENS
                   HÖG                    LÅG
              ┌──────────────────┬──────────────────┐
         LÅG  │   KRITISK        │  PLANERA IN       │
  HÄLSO-      │   (Hotspot)      │  (Stabil skuld)   │
  POÄNG       ├──────────────────┼──────────────────┤
         HÖG  │   BEVAKA         │  IGNORERA         │
              │   (Degraderings- │  (Rör det inte)   │
              │   risk)          │                   │
              └──────────────────┴──────────────────┘
```

### Kritisk — Låg hälsa + Hög förändringfrekvens (Hotspot)

Den farligaste kombinationen. Filen är redan sjuk och teamet rör den hela tiden.
Varje ny ändring riskerar att introducera buggar, och den befintliga skulden saktar
ner varje leverans. Börja alltid här.

**Typiska symptom:** Långa kodrader, djupa nästlade villkor, mångsidig funktion som
gör allt, avsaknad av tester.

**Åtgärd:** Schemalägg aktiv refaktorering inom nästa sprint. Kör `code_health_auto_refactor`
för konkreta instruktioner.

### Planera in — Låg hälsa + Låg förändringfrekvens (Stabil skuld)

Filen är i dåligt skick men ingen rör den. Risken är acceptabel på kort sikt,
men om filen plötsligt behöver ändras (ny feature, bugg i produktion) kostar det
oproportionerligt mycket tid.

**Åtgärd:** Planera in refaktorering inför känd förändring. Lägg på tech debt-backloggen
med estimat från `code_health_refactoring_business_case`.

### Bevaka — Hög hälsa + Hög förändringfrekvens (Degraderingsrisk)

Filen är frisk nu men ändras ofta. Det är en tidsfråga innan kvaliteten börjar sjunka
om det inte finns disciplin kring code review och hälsokontroller.

**Åtgärd:** Aktivera `pre_commit_code_health_safeguard` för dessa filer. Sätt en
bevakningströskel och agera snabbt om poängen sjunker under 7.0.

### Ignorera — Hög hälsa + Låg förändringfrekvens

Filen fungerar, ingen rör den, och den mår bra. Lägg inte tid här — det är
lägst möjlig avkastning på refaktoreringsinvesteringen.

**Åtgärd:** Ingen åtgärd krävs. Dokumentera beslutet så att nästa person vet att
det är ett aktivt val, inte ett förbiseende.

---

## Steg 1 — Kartlägg hälsan

Kör `code_health_score` på alla filer du misstänker är problematiska, eller på hela
moduler som verkar bromsa leveransen:

```json
{
  "tool": "code_health_score",
  "arguments": {
    "filePath": "/sökväg/till/fil.ts"
  }
}
```

Samla resultaten i en lista. Filer med poäng under 5.0 är akuta kandidater.
Filer med poäng 5.0–6.9 är planerings-kandidater.

---

## Steg 2 — Identifiera kunskapsrisker som förstärker prioriteten

Kör `code_health_knowledge_map` för att identifiera vilka låghälsofiler som också
är hotspots ur ett kunskapsperspektiv:

```json
{
  "tool": "code_health_knowledge_map",
  "arguments": {
    "projectPath": "/sökväg/till/projektet"
  }
}
```

Filer i `developerCongestion` (>= 5 aktiva författare) ändras ofta av många — de är
naturliga hotspot-kandidater. Kombinera med hälsopoängen:

- Fil i `developerCongestion` + låg hälsopoäng = bekräftad hotspot, högsta prioritet
- Fil i `knowledgeRisk` (bus factor 1) + låg hälsopoäng = kritisk risk, svår att åtgärda

---

## Steg 3 — Beräkna ROI för refaktorering

Kör `code_health_refactoring_business_case` på de tre till fem filerna med sämst poäng
och högst aktivitet. Det ger dig siffror att presentera för ledningen:

```json
{
  "tool": "code_health_refactoring_business_case",
  "arguments": {
    "filePath": "/sökväg/till/fil.ts"
  }
}
```

Verktyget returnerar uppskattad tidsåtgång för refaktorering, förväntad tidsbesparing
per sprint och break-even-punkt. Använd dessa siffror — inte subjektiva bedömningar —
när du argumenterar för att prioritera ned features till förmån för teknisk städning.

---

## Steg 4 — Rangordna med prioritetsformel

Beräkna ett prioriteringsindex för varje kandidatfil:

```
Prioritet = (10 − Hälsopoäng) × Förändringfrekvens × Affärsvikt
```

Där:
- `10 − Hälsopoäng` — hälsogapet (sämre poäng = högre gap)
- `Förändringfrekvens` — antal commits under de senaste 90 dagarna (normaliserat 1–10)
- `Affärsvikt` — subjektiv bedömning av filens affärskritikalitet (1 = intern utility, 10 = kritisk kundväg)

Sortera listan fallande. Topp tre till fem är din refaktoreringskö.

---

## Steg 5 — Formulera refaktoreringsorder med motivering

För varje fil i kön, formulera en motivering som kombinerar verktygdata med affärskontext:

```
Fil: src/payment/checkout.ts
Hälsopoäng: 3.8 / 10
Commits senaste 90 dagarna: 47
Antal aktiva bidragsgivare: 6 (koordinationsrisk)
ROI-break-even: 2,3 sprints
Motivering: Checkout-flödet är kritiskt för konvertering. Filen ändras nästan
            varje dag av hela teamet, och den låga hälsopoängen visar på djup
            nästling och bristande separation. Varje bugg här kostar direkt
            i förlorad omsättning. Refaktorering betalar sig inom tre sprints.
```

---

## Steg 6 — Presentera för teamet med data, inte åsikter

Använd siffrorna från verktygen som beslutsunderlag. Undvik formuleringar som
"den här koden är hemsk" eller "vi borde alltid skriva bättre kod". Säg istället:

> "Filen har en hälsopoäng på 3.8, ändrades 47 gånger senaste kvartalet och har
> sex aktiva bidragsgivare. Refaktoreringsverktyget uppskattar att det tar
> 4 timmar och sparar 1,5 timmar per sprint. Break-even på 2,3 sprints."

Det är ett beslutsunderlag — inte en åsikt.

---

## Exempelformat: Prioriterad teknisk skuld-backlogg

```
TEKNISK SKULD — PRIORITERAD KÖLISTA — [Datum]

Rangordning baserat på: hälsogap × förändringfrekvens × affärsvikt

#1  KRITISK   src/payment/checkout.ts          Score: 3.8  Commits: 47  Break-even: 2.3 sprints
#2  KRITISK   src/api/user-controller.ts       Score: 4.1  Commits: 38  Break-even: 3.1 sprints
#3  HÖG       src/auth/session-manager.ts      Score: 5.2  Commits: 29  Break-even: 4.0 sprints
#4  MEDIUM    src/reporting/export-service.ts  Score: 4.8  Commits: 11  Break-even: 5.5 sprints
#5  LÅG       src/utils/date-formatter.ts      Score: 3.2  Commits:  2  Break-even: 8.0 sprints
               (låg förändringfrekvens — planera in inför nästa feature)

BEVAKA (hög hälsa, hög aktivitet — risk för degradering):
- src/orders/order-processor.ts   Score: 7.9  Commits: 31
- src/notifications/dispatcher.ts Score: 8.2  Commits: 22
```
