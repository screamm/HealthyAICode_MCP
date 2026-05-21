# Bygg ett affärscase för kodhälsoförbättring

## Syfte

Teknisk skuld är osynlig för beslutsfattare. Utvecklare ser den varje dag — i kod som tar timmar att förstå, i buggar som dyker upp på oväntade ställen, i AI-assistenter som ger halvdana förslag för att kontexten är otydlig. Men chefer och produktägare ser inte detta. De ser leveranstakt, defektfrekvens och kostnad.

Det här skillt ger dig ett strukturerat sätt att omvandla kodhälsomätningar till affärssiffror. Inte uppskattningar eller magkänsla — verkliga tal från verktyget, kopplade till affärspåverkan.

Använd det här skillt när:
- Du vill prioritera refaktoreringarbete i backloggen
- Du behöver argumentera för teknisk skuld i en sprint-planering
- En chef frågar varför ni "lägger tid på att flytta kod"
- Du vill visa att AI-assisterad utveckling kräver hälsosam kod som underlag

---

## Steg 1 — Identifiera kandidatfiler

Börja med att kartlägga vilka filer som har lägst kodhälsa. Fokusera på filer som:
- Är centrala i systemet (ofta ändrade, många beroenden)
- Tillhör domäner med hög affärspåverkan
- Är kända problempunkter i teamet

Anropa `code_health_score` för varje kandidatfil:

```
code_health_score({ filePath: "<sökväg till fil>" })
```

Notera score för varje fil. Filer med score under 7.0 är kandidater för affärscase. Filer under 4.0 är akuta fall.

---

## Steg 2 — Analysera affärsvärde per fil

För varje kandidatfil, anropa `code_health_refactoring_business_case`:

```
code_health_refactoring_business_case({ filePath: "<sökväg till fil>" })
```

Verktyget returnerar fyra nyckeltal. Tolka dem så här:

**`developmentSpeedGain`**
Hur mycket snabbare kan teamet leverera efter refaktoreringen? Det här talet är direkt kopplat till sprint-kapacitet. En fil som bromsar upp varje ändring med extra förståelsetid kostar tid i varje sprint den rörs.

**`defectRateReduction`**
Hur många färre buggar förväntas uppstå? Komplex, svårläst kod producerar fler defekter — inte för att utvecklarna är sämre, utan för att det är svårare att se konsekvenserna av en ändring. Det här talet kan kopplas till supportkostnader och kundnöjdhet.

**`aiReadinessGain`**
Om filen blockerar AI-assistans är det här ett växande problem. AI-kodassistenter (inklusive Claude) ger sämre förslag i kod med låg hälsa — tät koppling, otydliga abstraktioner och lång kontext gör det svårt att generera korrekt kod. Det här måttet visar hur mycket AI-assistansen förbättras efter refaktoreringen.

**`recommendation`**
Verktygets sammanvägda bedömning: hög, medium eller låg prioritet, med motivering. Använd detta direkt i kommunikationen — det är ett objektivt utlåtande, inte din personliga åsikt.

---

## Steg 3 — Aggregera och prioritera

Samla resultaten från alla kandidatfiler i en enkel tabell:

| Fil | Score | Speed gain | Defect reduction | AI gain | Prioritet |
|-----|-------|-----------|-----------------|---------|-----------|
| src/orders/processor.ts | 4.2 | +35% | -28% | +42% | Hög |
| src/auth/session.ts | 5.8 | +18% | -15% | +22% | Medium |
| ... | ... | ... | ... | ... | ... |

Rangordna efter `recommendation` och summera potentialen. En tabell som visar att teamets tre sämsta filer tillsammans kan ge +25% leveranshastighet är ett kraftfullt argument.

---

## Steg 4 — Hämta branschkontext

Anropa `explain_code_health_productivity` för att få en förklaring av sambandet mellan kodhälsa och produktivitet:

```
explain_code_health_productivity({})
```

Det här verktyget ger dig formuleringar och branschkontext som du kan använda för att rama in siffrorna. Det är lättare att ta till sig "fil X ligger i det intervall där forskning visar att utvecklare spenderar 40% mer tid per ändring" än bara en siffra utan kontext.

---

## Steg 5 — Bygg presentationen

Strukturera argumentet i tre delar:

**Del 1 — Nuläget (fakta)**
Presentera filerna, deras score och vad det innebär i praktiken. Håll dig till verktygen siffror.

**Del 2 — Kostnaden (affärspåverkan)**
Koppla score till `developmentSpeedGain` och `defectRateReduction`. Undvik tekniska termer — prata om leveranstakt och buggfrekvens.

**Del 3 — Rekommendationen (handling)**
Presentera `recommendation` från verktyget direkt, följt av ett konkret förslag: "Vi föreslår att vi avsätter X sprintar för att åtgärda de tre filerna med högst prioritet."

---

## Mall för e-post eller Slack-meddelande

Använd den här mallen när du kommunicerar resultaten till en chef eller produktägare. Fyll i siffrorna direkt från verktygets output — lägg inte till egna uppskattningar.

---

**Ärende: Teknisk skuld i [filnamn / modulnamn] — affärspåverkan och rekommendation**

Hej [namn],

Vi har analyserat kodhälsan i [filnamn / modulnamn]. Resultaten visar:

- **Nuvarande kodhälsopoäng:** [score]/10
- **Förväntad leveranshastighetsökning efter åtgärd:** +[developmentSpeedGain]%
- **Förväntad minskning av defektfrekvens:** -[defectRateReduction]%
- **Förbättrad AI-assistans:** +[aiReadinessGain]%
- **Rekommendation:** [recommendation från verktyget]

Filen är [en central del av / används i / påverkar] [beskriv kort affärskontexten]. Varje förändring i den tar i snitt längre tid än nödvändigt och ökar risken för oavsiktliga fel.

Förslaget är att prioritera åtgärd i [sprint X / Q3 / nästa planering].

Hör av dig om du vill diskutera.

[Ditt namn]

---

---

## Affärscaset är inte ett override-argument

Affärscaset (`code_health_refactoring_business_case`) är ett verktyg för att *prioritera
in* refaktorering — inte för att *prioritera bort* en blockerande safeguard. Om verktyget
visar låg ROI för en fil betyder det inte att den filen får kringgås vid commit. Det betyder
att den får vänta med proaktiv refaktorering. Pre-commit-safeguarden gäller fortfarande
(AGENTS.md §3.2 och §6).

---

## Viktiga principer

**Använd verktygets siffror — lägg inte till egna gissningar.** Om verktyget säger +18% leveranshastighet, skriv +18%. Om du lägger till "ungefär", "troligen" eller "vi tror" tappar siffrorna sin trovärdighet.

**Undvik teknisk jargong i kommunikationen uppåt.** "Hög cyklomatisk komplexitet" säger inget till en produktägare. "Filen är svår att ändra utan att orsaka buggar" säger allt.

**Koppla alltid till affärspåverkan.** Varje teknisk observation behöver översättas: låg score → långsammare leverans, hög defektfrekvens → fler kundrapporterade buggar, låg AI-beredskap → sämre utbyte av AI-investeringen.
