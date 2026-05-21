# Förklara kodhälsa för teamet

## Syfte

Det här skillt guidar AI-assistenten att förklara vad kodhälsa är på ett sätt som landar hos mottagaren — oavsett om det är en utvecklare som vill förstå en konkret score, en tech lead som funderar på leveranshastighet, eller en chef som behöver ett affärsperspektiv. Använd rätt verktyg och rätt vinkel beroende på vem du pratar med.

---

## Tre målgrupper — tre ingångsvinklar

### Målgrupp 1: Utvecklare

Utvecklare vill förstå vad poängen faktiskt säger om deras kod — inte abstrakta principer.

**Tillvägagångssätt:**
1. Kör `explain_code_health` för att hämta en preciserad beskrivning av vad som mäts:
   ```
   Verktyg: explain_code_health
   Argument: {}
   ```
2. Kör `code_health_score` på en fil de själva känner igen:
   ```
   Verktyg: code_health_score
   Argument: { "filePath": "<sökväg till en aktuell fil>" }
   ```
3. Förankra svaret i den konkreta koden: "Den här filen fick 6.2. Det beror framför allt på att funktionen `processOrder` gör tre saker samtidigt — det är svårt för en AI-assistent att ändra en del utan att riskera att bryta de andra."
4. Om de vill gå djupare, kör `code_health_review` för att se exakt vilka code smells som identifierades.

**Nyckelbudskap för utvecklare:** Kodhälsa mäter hur lätt det är att ändra koden utan att skapa nya buggar. Låg poäng = varje ändring är ett lotteri.

---

### Målgrupp 2: Tech lead

Tech leads vill koppla kodhälsa till leveranshastighet och teamets förmåga att hålla tempo.

**Tillvägagångssätt:**
1. Kör `explain_code_health_productivity` för det produktivitetsfokuserade perspektivet:
   ```
   Verktyg: explain_code_health_productivity
   Argument: {}
   ```
2. Kör `code_health_score` på de filer som teamet arbetar i mest — de med hög förändringsfrekvens är extra kritiska.
3. Koppla resultaten till konkreta team-upplevelser: "Det ni kallar 'trampat vatten' i den modulen — det är vad en score på 5.1 förklarar. Hög kognitiv belastning, svår att testa, svår att ge till en junior."
4. Lyft fram tröskeln 9.5 som "AI-redo" — filer under den gränsen kräver mänsklig expertis vid varje ändring.

**Nyckelbudskap för tech lead:** Kodhälsa är en prediktiv indikator på hur snabbt teamet kan leverera nästa kvartal. Skulden syns inte i sprinten den skapas — den syns tre månader senare.

---

### Målgrupp 3: Chef / Product Manager

Chefer och PMs behöver ett affärsspråk, inte ett tekniskt.

**Tillvägagångssätt:**
1. Kör `explain_code_health_productivity` och extrahera affärspåverkan:
   ```
   Verktyg: explain_code_health_productivity
   Argument: {}
   ```
2. Översätt till affärstermer: undvika att säga "cyklomatisk komplexitet", säg istället "en feature som borde ta en dag tar en vecka, och den introducerar ändå en ny bugg".
3. Kör om möjligt `code_health_refactoring_business_case` för en modul med känd hög kostnad:
   ```
   Verktyg: code_health_refactoring_business_case
   Argument: { "filePath": "<sökväg>" }
   ```
   Det returnerar en ROI-beräkning som är direkt kommunicerbar i en budgetdiskussion.

**Nyckelbudskap för chef:** Kodhälsa är kassaflöde för mjukvara. Låg hälsa = du betalar ränta varje sprint. Hög hälsa = teamet kan leverera nya funktioner istället för att betala av gammal skuld.

---

## Hälsoskalans innebörd

| Poäng | Nivå | Vad det innebär i praktiken |
|---|---|---|
| 9.5–10.0 | Grön — AI-redo | Koden är tydlig, välstrukturerad och kan ändras säkert av AI-assistenter utan mänsklig supervision |
| 8.0–9.4 | Grön | God hälsa, manuell granskning rekommenderas vid AI-genererade ändringar |
| 6.5–7.9 | Gul | Acceptabel hälsa, men komplex nog att kräva erfaren utvecklare vid ändringar |
| 5.0–6.4 | Orange | Märkbar teknisk skuld, varje ändring har förhöjd risk för regressioner |
| 1.0–4.9 | Röd | Kritisk hälsa, ändringar är oförutsägbara, refaktorering bör prioriteras |

Tröskeln **9.5** är inte en ambition — den är `loopComplete`-villkoret. Under den
gränsen är loopen inte färdigkörd. Tröskeln **10.0** är målet för all AI-genererad eller
AI-ändrad kod i ett repo som följer AGENTS.md. Allt däremellan är ett uttryckligt
accepterat gap som måste dokumenteras (se AGENTS.md §6).

---

## Konkret genomgång — steg för steg

1. **Välj en representativ fil** — helst en som teamet faktiskt arbetar i ofta.
2. **Kör `code_health_score`** och visa resultatet öppet.
3. **Förklara poängen** med hjälp av tabellen ovan och de nyckelbudskap som passar målgruppen.
4. **Kör `code_health_review`** om ni vill gå djupare och se specifika problem — kör verktyget i loop tills `loopComplete: true`.
5. **Diskutera nästa steg** utifrån prioritet och resurser.

---

## Vanliga missuppfattningar att rätta till

**"En låg poäng betyder att koden är fel."**
Nej. Koden kan fungera korrekt och ändå ha låg hälsa. Poängen mäter hur lätt den är att ändra — inte om den producerar rätt output idag.

**"Vi kan fixa det senare."**
Teknisk skuld räntar sig. En modul med score 4.0 som ändras 10 gånger per sprint kostar exponentiellt mer ju längre den lämnas.

**"AI-verktyg löser ändå det här."**
Tvärtom: AI-verktyg förvärrar ofta läget i ohälsosam kod, eftersom de genererar ny komplexitet ovanpå befintlig. Hög kodhälsa är förutsättningen för att AI ska vara en tillgång.

**"Det är bara ett tal."**
Varje biomarkör i poängen är kopplad till forskning om defektfrekvens och underhållskostnad. Det är inte en åsikt — det är ett mätvärde.

---

## Nästa steg efter förklaringen

- Om score >= 9.5: bekräfta att filerna är AI-reddiga och fortsätt utan åtgärd.
- Om score 7.0–9.4: dokumentera vilka filer som behöver förbättras, planera in refaktorering i nästa sprint.
- Om score < 7.0: kör `code_health_refactoring_business_case` för att kvantifiera ROI och ta med resultatet i prioriteringsdiskussionen.
- Sätt upp `pre_commit_code_health_safeguard` för att förhindra att hälsan försämras ytterligare — se skillt *Skydda kodbasen från AI-genererad teknisk skuld*.
