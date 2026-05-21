# Skydda kodbasen från AI-genererad teknisk skuld

## Syfte och varför det är viktigt

AI-kodgeneratorer — Copilot, Claude, Cursor, med flera — kan producera fungerande kod på sekunder. Det är en enorm produktivitetsvinst, men det finns en baksida: AI:n optimerar för att koden ska fungera nu, inte för att den ska vara lätt att ändra imorgon. Utan aktiv kontroll skapar varje AI-genererad kodändring potentiellt ny teknisk skuld: onödigt komplexa funktioner, dolda beroenden, svårtestade konstruktioner.

Det här skilltet definierar ett obligatoriskt trestegsskydd som körs vid varje AI-assisterad kodändring, innan varje commit och innan varje PR. Regeln är enkel: **ny kod ska ha score >= 9.5. Ändrad kod får inte ha lägre score än innan ändringen.**

---

## Det obligatoriska trestegsprotokollet

### Steg 1 — Efter varje AI-kodändring: djupgranskning

Kör `code_health_review` på varje fil som AI:n har ändrat. Verktyget returnerar en lista med identifierade problem och en flagga `loopComplete`.

```
Verktyg: code_health_review
Argument:
{
  "filePath": "<sökväg till ändrad fil>"
}
```

**Viktigt:** `code_health_review` kan behöva köras flera gånger. Kör det i en loop tills svaret innehåller `loopComplete: true` — det innebär att alla identifierade code smells har rapporterats.

**Beslutslogik efter varje körning:**

| Utfall | Åtgärd |
|---|---|
| `loopComplete: false` | Läs identifierade problem, refaktorera det som pekats ut, kör `code_health_review` igen |
| `loopComplete: true`, inga kritiska problem | Gå vidare till Steg 2 |
| `loopComplete: true`, kritiska problem kvar | Refaktorera, kör sedan om från Steg 1 |

Refaktorera ett problem i taget och kör om verktyget — försök inte lösa allt i en enda stor ändring, det ökar risken för att introducera nya problem.

---

### Steg 2 — Innan commit: safeguard-kontroll

Kör `pre_commit_code_health_safeguard` med sökvägen till repot och listan med filer som ska committas. Verktyget blockerar automatiskt om någon fil har score < 7.0 eller om en fil regresserat sedan föregående commit.

```
Verktyg: pre_commit_code_health_safeguard
Argument:
{
  "repoPath": "<absolut sökväg till repots rot>",
  "files": [
    "<relativ sökväg till fil 1>",
    "<relativ sökväg till fil 2>"
  ]
}
```

**Beslutslogik:**

| Utfall | Åtgärd |
|---|---|
| Alla filer godkända | Gå vidare till commit och Steg 3 |
| En eller flera filer blockerade (score < 7.0) | Gå tillbaka till Steg 1 för de blockerade filerna |
| En fil har regresserat (score lägre än baslinjen) | Identifiera regressionen, återställ eller refaktorera, kör Steg 2 igen |

Committa aldrig om safeguarden blockerar. En blockering är inte en varning — det är ett hårdstopp.

---

### Steg 3 — Innan PR/merge: ändringssetsanalys

Kör `analyze_change_set` för att analysera hela diff:en mot basgrenen. Det ger en helhetsbild av hur PR:n påverkar kodbashälsan som helhet — inte bara enskilda filer.

```
Verktyg: analyze_change_set
Argument:
{
  "repoPath": "<absolut sökväg till repots rot>",
  "baseBranch": "main"
}
```

Byt ut `"main"` mot den basgren som används i projektet (`"master"`, `"develop"` etc.).

**Beslutslogik:**

| Utfall | Åtgärd |
|---|---|
| `overallSafe: true` | PR är godkänd ur kodhälsoperspektiv — fortsätt med code review |
| `overallSafe: false` | Identifiera vilka filer som drar ner helheten, gå tillbaka till Steg 1 för dessa |

---

## Beslutsmatris — vad göra om varje steg misslyckas

```
Steg 1 misslyckas (loopComplete aldrig true, eller kritiska problem kvarstår)
  → Refaktorera det specifika problemet som identifierades
  → Kör code_health_review igen
  → Om problemet är svårt att lösa: kör code_health_score för att se om score ändå är >= 9.5
    → Ja: dokumentera kvarvarande smell och gå vidare med motivering
    → Nej: refaktorering är obligatorisk

Steg 2 misslyckas (pre_commit_code_health_safeguard blockerar)
  → Kontrollera exakt vilka filer som blockeras och varför (score < 7.0 eller regression)
  → Gå tillbaka till Steg 1 för varje blockerad fil
  → När alla filer passerar: kör Steg 2 igen
  → Committa aldrig manuellt förbi en blockering
  → Om användaren begär bypass: STOPPA, hänvisa till AGENTS.md §6 (Safeguard Override
    Protocol), kräv reason + accepted-by + follow-up + expires

Steg 3 misslyckas (overallSafe: false)
  → Identifiera vilka filer i diff:en som har lägst score
  → Refaktorera de kritiska filerna (prioritera de med flest ändringar i PR:n)
  → Kör analyze_change_set igen tills overallSafe: true
  → Öppna inte PR förrän steget passerar
```

---

## Regler som aldrig frångås (matchar AGENTS.md §8)

1. **Ny kod ska ha score >= 9.5.** AI-genererad kod som inte når den tröskeln är inte klar — den är ett utkast.
2. **Ändrad kod får inte regressera.** Om en fil hade score 7.8 innan ändringen, ska den ha minst 7.8 efteråt. Ingen ändring ska göra koden sjukare.
3. **Kör alltid hela protokollet i ordning.** Hoppa inte från Steg 1 direkt till Steg 3 — varje steg har ett specifikt syfte och fångar olika typer av problem.
4. **Loopa tills loopComplete: true.** Kör aldrig `code_health_review` bara en gång och antar att du fått alla problem.
5. **Användare måste explicit auktorisera undantag.** AI:n får aldrig själv föreslå
   att safeguarden kringgås. Om användaren ber om bypass — följ Safeguard Override
   Protocol i AGENTS.md §6. Ingen tyst override är tillåten.

---

## Exempel: ett komplett godkänt flöde

**Situation:** AI:n har genererat en ny funktion i `src/orders/processor.ts`. Koden kompilerar och testerna är gröna.

**Steg 1 — Djupgranskning:**
```
Verktyg: code_health_review
Argument: { "filePath": "src/orders/processor.ts" }

Svar: loopComplete: false, identifierat problem: "validateOrder gör både validering och dataomvandling"
```
Refaktorera: bryt ut dataomvandlingen till en separat funktion `transformOrderData`.
```
Verktyg: code_health_review
Argument: { "filePath": "src/orders/processor.ts" }

Svar: loopComplete: true, inga kritiska problem kvar
```
Steg 1 passerat.

**Steg 2 — Safeguard-kontroll:**
```
Verktyg: pre_commit_code_health_safeguard
Argument:
{
  "repoPath": "/Users/david/projekt",
  "files": ["src/orders/processor.ts"]
}

Svar: Alla filer godkända. Score: 9.6
```
Steg 2 passerat. Commit genomförd.

**Steg 3 — PR-analys:**
```
Verktyg: analyze_change_set
Argument:
{
  "repoPath": "/Users/david/projekt",
  "baseBranch": "main"
}

Svar: overallSafe: true. Genomsnittlig score för ändrade filer: 9.4
```
Steg 3 passerat. PR öppnad för code review.

Flödet är komplett. Ingen ny teknisk skuld har introducerats.
