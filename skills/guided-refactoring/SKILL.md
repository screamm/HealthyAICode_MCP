# Systematisk refaktorering med kodhälsomätning

## Syfte

Refaktorering utan mätning är blindflygning. Du kan flytta kod, döpa om metoder och dela upp klasser — men utan objektiv återkoppling vet du inte om det faktiskt blev bättre. Det här skillets ger en strukturerad loop där varje steg mäts och bekräftas innan nästa påbörjas.

Använd det här skillt när:
- En fil har låg kodhälsopoäng (under 7.0)
- En `code_health_review` visar många code smells
- Du vill refaktorera men inte vet var du ska börja
- Du vill kunna visa att refaktoreringen faktiskt hjälpte

---

## Förutsättning

Identifiera målfilen innan du börjar. Kandidater är:
- Filer med låg poäng från `code_health_score`
- Filer med många smells från `code_health_review`
- Filer som kollegor klagar på eller som ofta ger upphov till buggar
- Filer som AI-assistenter har svårt att arbeta med effektivt

---

## Fas 1 — Etablera baslinje

Innan du ändrar en enda rad kod behöver du veta var du startar.

**Steg 1.1 — Mät nuvarande score**

Anropa `code_health_score` med sökvägen till målfilen:

```
code_health_score({ filePath: "<sökväg till fil>" })
```

Notera poängen. Det här är din baslinje — alla framtida mätningar jämförs mot detta värde.

**Steg 1.2 — Identifiera alla problem**

Anropa `code_health_review` för att få en fullständig lista över identifierade code smells:

```
code_health_review({ filePath: "<sökväg till fil>" })
```

Verktyget kan returnera resultaten i omgångar. Fortsätt anropa det tills `loopComplete: true` returneras. Läs varje identifierat problem noggrant — förstå vad det innebär och varför det är ett problem, inte bara att det finns.

Spara listan. Det är din prioritetsordning för fas 2.

---

## Fas 2 — Refaktoreringsloop

Det här är kärnfasen. Upprepa följande cykel tills `loopComplete: true` och score >= 9.5.

**Steg 2.1 — Hämta riktade instruktioner**

Anropa `code_health_auto_refactor`:

```
code_health_auto_refactor({ filePath: "<sökväg till fil>" })
```

Verktyget returnerar:
- `primaryTarget` — det specifika problemet du ska åtgärda nu
- `refactoringInstructions` — konkreta steg för att lösa just det problemet
- `codeContext` — relevant kontext om den berörda koden
- `fullFileContent` — filens fullständiga innehåll som referens

**Steg 2.2 — Genomför ENBART det primära målet**

Fokusera uteslutande på `primaryTarget`. Ändra inte annat — inte ens om du ser andra problem som "enkelt" går att fixa. Anledningen är enkel: varje ändring kan ha oväntade konsekvenser, och om du gör flera ändringar samtidigt vet du inte vilken som orsakade en eventuell regression.

Följ `refactoringInstructions` noggrant. Använd `fullFileContent` och `codeContext` för att förstå helheten.

**Steg 2.3 — Verifiera förbättringen**

Anropa `code_health_review` igen på samma fil:

```
code_health_review({ filePath: "<sökväg till fil>" })
```

Kontrollera:
- Är det adresserade problemet borta från listan?
- Har poängen förbättrats jämfört med föregående mätning?
- Har inga nya problem uppstått?

Om svaret är ja på alla tre — gå vidare. Om nej — undersök vad som gick fel innan du fortsätter.

**Steg 2.4 — Commit mellanresultatet**

Gör en commit med ett beskrivande meddelande som anger exakt vad som åtgärdades:

```
git commit -m "refactor: löst [primaryTarget] i [filnamn] (score X.X → Y.Y)"
```

Täta commits gör det enkelt att identifiera och rulla tillbaka om något går fel. Det är också ett bevis på att refaktoreringen skedde i kontrollerade steg.

**Upprepa steg 2.1–2.4** tills `code_health_auto_refactor` signalerar att inga fler primära mål finns, eller tills score >= 9.5.

---

## Fas 3 — Verifiera och stäng

När refaktoreringslopen är avslutad, verifiera att allt är i ordning.

**Steg 3.1 — Kontrollera commit-beredskap**

Anropa `pre_commit_code_health_safeguard` för att säkerställa att inga ändrade filer har score under 7.0:

```
pre_commit_code_health_safeguard({ filePaths: ["<sökväg till fil>"] })
```

Om verktyget blockerar — åtgärda det som återstår innan du fortsätter.

**Steg 3.2 — Analysera hela branchen (om tillämpligt)**

Om du arbetar på en feature-branch med en öppen PR, anropa `analyze_change_set` för att se hur alla ändringar sammantaget påverkar kodhälsan:

```
analyze_change_set({ repoPath: "<sökväg till repo>", baseBranch: "main" })
```

Kontrollera `overallSafe` och att inga regressioner introducerats i filer som inte var målet för refaktoreringen.

---

## Regler att följa under hela processen

- **En smell i taget** — adressera aldrig mer än `primaryTarget` per cykel
- **Mät efter varje steg** — subjektiv känsla av förbättring räknas inte
- **Commit ofta** — varje löst problem är en egen commit
- **Ändra inte beteende** — refaktorering ska bevara exakt samma funktionalitet
- **Lita på verktygen** — om `code_health_review` säger att ett problem kvarstår, kvarstår det

---

## Definition av "klar"

Refaktoreringen är klar när **båda** följande villkor uppfylls:

1. `code_health_auto_refactor` returnerar `loopComplete: true`
2. `code_health_score` returnerar >= **9.5**

Uppfylls bara ett av villkoren — fortsätt loopen.
