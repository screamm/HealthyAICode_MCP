# Healthy AI Code MCP — Agent Workflow

## OBLIGATORISKA REGLER (följ alltid utan undantag)

### Innan du ändrar en fil
1. Kör `code_health_review` på filen du ska ändra
2. Notera baseline-poängen
3. Om score < 7.0: refaktorera FÖRST — lägg inte till ny funktionalitet i ohälsosam kod

### Efter varje kodändring
1. Kör `code_health_review` igen på den ändrade filen
2. Om score SJUNKIT: STOPPA all annan aktivitet — gå in i refaktoreringsloop
3. Fortsätt loopen tills `loopComplete: true` i svaret

### Refaktoreringsloop (upprepa tills loopComplete: true)
1. Läs `nextAction.instruction` i svaret — det berättar exakt vad du ska göra
2. Åtgärda det problem som `nextAction.priority` pekar på
3. Kör `code_health_review` igen
4. Om `loopComplete: false` → upprepa från steg 1
5. Om `loopComplete: true` → loopen är klar

### Innan commit (OBLIGATORISKT)
- Kör alltid `pre_commit_code_health_safeguard` med alla ändrade filer
- Committa INTE om någon fil har score < 7.0 utan explicit godkännande från användaren

### Innan PR (OBLIGATORISKT)
- Kör `analyze_change_set` mot basgrenen
- Adressera ALLA regressioner och röda filer i resultatet

## Målpoäng
- Minst 7.0 för att committa
- Minst 9.5 för AI-redo kod (optimal)
- 10.0 är perfekt

## Verktygsöversikt
| Verktyg | När | Input |
|---|---|---|
| `code_health_review` | Före och efter varje ändring | filePath |
| `code_health_score` | Snabb screening | filePath |
| `pre_commit_code_health_safeguard` | Innan commit | repoPath, files[] |
| `analyze_change_set` | Innan PR | repoPath, baseBranch |
| `code_health_refactoring_business_case` | För att motivera refaktorering | filePath |
| `explain_code_health` | Om du behöver förstå systemet | (ingen) |
| `explain_code_health_productivity` | Om du behöver förstå ROI | (ingen) |
