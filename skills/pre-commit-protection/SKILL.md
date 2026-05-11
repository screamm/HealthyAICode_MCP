# Pre-commit kodhälsoskydd — stoppa skulden vid källan

## Syfte

Att åtgärda teknisk skuld efter att den är incheckad i kodbasen kostar uppskattningsvis
tio gånger mer än att stoppa den vid commit-tillfället. Varje gång dålig kod checkas in
riskerar den att spridas, kopieras och bli beroenden för annan kod. Stoppa den innan.

Det här skill visar tre nivåer av skydd — från enkel manuell körning i Claude Code
till automatiserad CI/CD-integration för hela teamet.

---

## Hur `pre_commit_code_health_safeguard` fungerar

Verktyget tar emot:

- `repoPath` — absolut sökväg till git-repot
- `files` — lista med filer som ska granskas (typiskt de staged filerna)

Det blockerar commit om **någon av följande villkor** gäller för en fil:

1. Filen har en hälsopoäng under **7.0**
2. Filen har **försämrats** jämfört med sin baseline (regression)

Verktyget returnerar:

```json
{
  "approved": false,
  "blockedFiles": [
    {
      "file": "src/auth/login.ts",
      "score": 5.8,
      "reason": "Score below threshold (7.0)",
      "details": "Deeply nested conditionals, function too long"
    }
  ],
  "approvedFiles": ["src/utils/helpers.ts"]
}
```

---

## Alternativ A — Manuell körning (enklast, för Claude Code-användare)

Det här är det snabbaste sättet att komma igång. Instruera AI-assistenten att alltid
köra skyddet innan den föreslår en commit.

### Instruktion till AI-assistenten

Lägg följande i din CLAUDE.md eller som en systemanvisning:

```
Innan du föreslår `git commit` eller kör någon git-commit-kommando:
1. Hämta staged filer med: git diff --cached --name-only
2. Kör pre_commit_code_health_safeguard med repoPath och dessa filer
3. Om någon fil blockeras — stanna och rapportera vilka filer och varför
4. Fortsätt aldrig med commit om safeguarden returnerar approved: false
```

### Hämta staged filer

```bash
git diff --cached --name-only
```

Exempel på output:
```
src/auth/login.ts
src/payment/checkout.ts
src/utils/helpers.ts
```

### Exempelanrop till verktyget

```json
{
  "tool": "pre_commit_code_health_safeguard",
  "arguments": {
    "repoPath": "/absolut/sökväg/till/projektet",
    "files": [
      "src/auth/login.ts",
      "src/payment/checkout.ts",
      "src/utils/helpers.ts"
    ]
  }
}
```

---

## Alternativ B — Git pre-commit hook (för hela teamet)

En pre-commit hook körs automatiskt varför någon i teamet gör `git commit`.
Det kräver ingen extra disciplin — skyddet aktiveras alltid.

### Skapa hooken

Skapa filen `.git/hooks/pre-commit` med följande innehåll:

```bash
#!/usr/bin/env bash
set -e

REPO_PATH=$(git rev-parse --show-toplevel)
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|js|py|java|cs)$' || true)

if [ -z "$STAGED_FILES" ]; then
  echo "Inga kodfiler staged — hoppar över hälsokontroll."
  exit 0
fi

echo "Kör kodhälsokontroll på staged filer..."

# Bygg JSON-lista av filer
FILES_JSON=$(echo "$STAGED_FILES" | jq -R . | jq -s .)

# Anropa MCP-servern via Claude Code CLI
RESULT=$(claude --mcp-server healthy-ai-code \
  --tool pre_commit_code_health_safeguard \
  --args "{\"repoPath\": \"$REPO_PATH\", \"files\": $FILES_JSON}" \
  2>/dev/null)

APPROVED=$(echo "$RESULT" | jq -r '.approved')

if [ "$APPROVED" != "true" ]; then
  echo ""
  echo "COMMIT BLOCKERAT — Kodhälsokontroll misslyckades"
  echo "================================================"
  echo "$RESULT" | jq -r '.blockedFiles[] | "  \(.file): \(.score)/10 — \(.reason)"'
  echo ""
  echo "Kör 'code_health_review' på blockerande filer for att se detaljer."
  echo "Kör 'code_health_auto_refactor' for att få refaktoreringsinstruktioner."
  exit 1
fi

echo "Kodhälsokontroll godkand — alla filer passerar (>= 7.0)"
exit 0
```

Gör hooken körbar:

```bash
chmod +x .git/hooks/pre-commit
```

### Distribuera hooken till hela teamet

Git-hooks i `.git/hooks/` följer inte med vid `git clone`. Använd ett av dessa alternativ:

**Alt B1 — Commit hooks i repot (rekommenderas):**

```bash
mkdir -p .githooks
cp .git/hooks/pre-commit .githooks/pre-commit
git config core.hooksPath .githooks
git add .githooks/pre-commit
git commit -m "chore: add code health pre-commit hook"
```

Alla som klonar repot kör sedan:
```bash
git config core.hooksPath .githooks
```

**Alt B2 — Automatisk installation via npm/package.json:**

```json
{
  "scripts": {
    "prepare": "git config core.hooksPath .githooks"
  }
}
```

`npm install` eller `pnpm install` kör då `prepare` automatiskt.

---

## Alternativ C — CI/CD-integration (skyddar mot allt som slinker igenom)

Pre-commit hooks kan kringgås med `git commit --no-verify`. CI/CD-gaten kan inte det.
Kör `analyze_change_set` vid varje pull request för att analysera hela diffen mot basgrenen.

### GitHub Actions — exempel-YAML

Skapa `.github/workflows/code-health.yml`:

```yaml
name: Code Health Check

on:
  pull_request:
    branches: [main, master, develop]

jobs:
  code-health:
    name: Kodhälsogranskning
    runs-on: ubuntu-latest

    steps:
      - name: Checka ut kod
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Behövs för att jämfora mot basgrenen

      - name: Installera Claude Code CLI
        run: npm install -g @anthropic-ai/claude-code

      - name: Kör kodhalsanalys av PR
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          BASE_BRANCH="${{ github.base_ref }}"
          REPO_PATH="${{ github.workspace }}"

          RESULT=$(claude --mcp-server healthy-ai-code \
            --tool analyze_change_set \
            --args "{\"repoPath\": \"$REPO_PATH\", \"baseBranch\": \"$BASE_BRANCH\"}")

          echo "$RESULT" > health-report.json

          OVERALL_SAFE=$(echo "$RESULT" | jq -r '.overallSafe')
          REGRESSIONS=$(echo "$RESULT" | jq -r '.regressions | length')
          NEW_UNHEALTHY=$(echo "$RESULT" | jq -r '.newUnhealthyFiles | length')

          echo "### Kodhalsrapport" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "- Godkand: $OVERALL_SAFE" >> $GITHUB_STEP_SUMMARY
          echo "- Regressioner: $REGRESSIONS" >> $GITHUB_STEP_SUMMARY
          echo "- Nya problematiska filer: $NEW_UNHEALTHY" >> $GITHUB_STEP_SUMMARY

          if [ "$OVERALL_SAFE" != "true" ]; then
            echo "Kodhalsokontrollen misslyckades — se rapport ovan"
            exit 1
          fi

      - name: Ladda upp rapport som artefakt
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: code-health-report
          path: health-report.json
```

### GitLab CI — exempelkonfiguration

Lagg till i `.gitlab-ci.yml`:

```yaml
code-health:
  stage: test
  image: node:20
  before_script:
    - npm install -g @anthropic-ai/claude-code
  script:
    - |
      RESULT=$(claude --mcp-server healthy-ai-code \
        --tool analyze_change_set \
        --args "{\"repoPath\": \"$CI_PROJECT_DIR\", \"baseBranch\": \"$CI_DEFAULT_BRANCH\"}")
      OVERALL_SAFE=$(echo "$RESULT" | jq -r '.overallSafe')
      if [ "$OVERALL_SAFE" != "true" ]; then
        echo "$RESULT" | jq '.regressions, .newUnhealthyFiles'
        exit 1
      fi
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```

---

## Beslutsflöde: vad gör du när safeguarden blockerar?

Safeguarden returnerar `approved: false`. Gör sa har:

### Steg 1 — Forsta vad som ar fel

Kör `code_health_review` på den blockerande filen for en detaljerad analys.
Verktyget kan behöva anropas flera gånger tills `loopComplete: true`:

```json
{
  "tool": "code_health_review",
  "arguments": {
    "filePath": "/sökväg/till/blockerande-fil.ts"
  }
}
```

Granskningen ger dig specifika code smells, var de finns och hur allvarliga de ar.

### Steg 2 — Fa refaktoreringsinstruktioner

Kör `code_health_auto_refactor` pa samma fil:

```json
{
  "tool": "code_health_auto_refactor",
  "arguments": {
    "filePath": "/sökväg/till/blockerande-fil.ts"
  }
}
```

Verktyget returnerar filinnehall och riktade instruktioner for hur refaktoreringen ska utföras.
Genomför ändringarna i koden.

### Steg 3 — Validera att filen nu passerar

Kör `pre_commit_code_health_safeguard` igen med samma filer:

```json
{
  "tool": "pre_commit_code_health_safeguard",
  "arguments": {
    "repoPath": "/sökväg/till/projektet",
    "files": ["src/auth/login.ts"]
  }
}
```

### Steg 4 — Commit när alla filer passerar

Nar safeguarden returnerar `approved: true` för alla filer ar det säkert att committa.

---

## Nar man inte kan refaktorera direkt

Ibland ar en blockerande fil del av en storre ändring som maste levereras nu.
Da finns tva alternativ:

**Alt 1 — Dela upp PR:en.** Skapa en separat refaktoreringsbranch som avslutas innan
feature-branchen mergas. Det ar den rena lösningen.

**Alt 2 — Dokumenterat undantag.** Om det ar omöjligt at refaktorera nu, dokumentera
beslutet i PR-beskrivningen med en commit till tech debt-backloggen. Undvik att göra
detta till praxis — varje undantag ökar skulden.

---

## Sammanfattning — tre nivåer av skydd

| Niva     | Metod                        | Tacker         | Svårt att kringgå |
|----------|------------------------------|----------------|--------------------|
| Niva 1   | Manuell körning i Claude Code | Din egen kod   | Nej (kräver disciplin) |
| Niva 2   | Git pre-commit hook          | Hela teamet    | Med --no-verify    |
| Niva 3   | CI/CD-gate vid PR            | Alla branches  | Ja — obligatorisk  |

Rekommendationen är att implementera alla tre nivåer. Nivå 3 ar det yttersta skyddsnatet.
