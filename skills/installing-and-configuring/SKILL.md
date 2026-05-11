# Installera och konfigurera Healthy AI Code MCP

## Syfte

Det här skillt guidar AI-assistenten att hjälpa en användare installera Healthy AI Code MCP-servern, verifiera att den svarar korrekt och genomföra grundläggande konfiguration — allt i rätt ordning utan att hoppa över steg som kan orsaka tysta fel.

---

## Förutsättningar

- **Node.js >= 18** måste vara installerat. Kontrollera med:
  ```
  node --version
  ```
  Om versionen är lägre än 18, be användaren uppgradera via https://nodejs.org innan ni fortsätter.

---

## Steg 1 — Installera MCP-servern

Välj det installationssätt som passar användarens miljö.

### Alternativ A: npx (rekommenderas för snabbstart)
Inget förinstallationssteg krävs. Servern laddas ned och körs vid behov:
```
npx @healthy-ai-code/mcp-server
```

### Alternativ B: Global npm-installation
Installera en gång, använd överallt:
```
npm install -g @healthy-ai-code/mcp-server
```

### Alternativ C: Claude Desktop — lägg till i konfigurationsfilen
Öppna eller skapa `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) eller `%APPDATA%\Claude\claude_desktop_config.json` (Windows) och lägg till:
```json
{
  "mcpServers": {
    "healthy-ai-code": {
      "command": "npx",
      "args": ["-y", "@healthy-ai-code/mcp-server"]
    }
  }
}
```
Starta om Claude Desktop efter ändringen.

### Alternativ D: VS Code — mcp.json
Skapa eller redigera `.vscode/mcp.json` i projektroten:
```json
{
  "servers": {
    "healthy-ai-code": {
      "command": "npx",
      "args": ["-y", "@healthy-ai-code/mcp-server"]
    }
  }
}
```

### Alternativ E: Cursor
Öppna **Settings → MCP** och lägg till en ny server med:
- **Name:** `healthy-ai-code`
- **Command:** `npx -y @healthy-ai-code/mcp-server`

---

## Steg 2 — Verifiera att servern svarar

Kör verktyget `explain_code_health` utan argument. Det är ett läsverktyg som inte kräver någon fil och ger ett omedelbart svar om servern är online:

```
Verktyg: explain_code_health
Argument: {}
```

**Förväntat utfall:** En beskrivning av hälsoskalan 1–10, vad som mäts och varför det spelar roll.

Om du inte får svar — se avsnittet Felsökning nedan.

---

## Steg 3 — Grundläggande konfiguration med set_config

Sätt projektnamn och standardgren så att verktyg som `analyze_change_set` och `pre_commit_code_health_safeguard` vet vilket projekt och vilken basgren de arbetar mot:

```
Verktyg: set_config
Argument:
{
  "projectName": "<projektets namn>",
  "defaultBranch": "main"
}
```

Byt ut `"main"` mot `"master"` eller annan basgren om det är vad projektet använder. Verifiera inställningarna direkt efteråt:

```
Verktyg: get_config
Argument: {}
```

Kontrollera att `projectName` och `defaultBranch` visas korrekt i svaret.

---

## Steg 4 — Första hälsoanalysen

Kör `code_health_score` på en representativ källkodsfil för att bekräfta att hela flödet fungerar — från server till filanalys:

```
Verktyg: code_health_score
Argument:
{
  "filePath": "<absolut eller relativ sökväg till en .ts/.js/.py/.cs/.java-fil>"
}
```

**Förväntat utfall:** En poäng mellan 1.0 och 10.0 samt en kort sammanfattning.

Om poängen visas är installationen komplett och klar att använda.

---

## Felsökning — vanliga problem

| Problem | Sannolik orsak | Lösning |
|---|---|---|
| `command not found: npx` | Node.js inte installerat eller inte i PATH | Installera Node.js >= 18, starta om terminalen |
| Servern svarar inte i Claude Desktop | Konfigurationsfilen felformaterad eller fel sökväg | Validera JSON, kontrollera att filen är sparad på rätt plats, starta om Claude Desktop |
| `explain_code_health` returnerar fel | Gammal version av paketet cachad | Kör `npm cache clean --force` och försök igen med `npx -y` |
| `code_health_score` kan inte hitta filen | Sökvägen är relativ och löstes från fel katalog | Använd absolut sökväg, t.ex. `/Users/david/projekt/src/app.ts` |
| Poäng returneras inte, tomt svar | Filen är tom eller har syntaxfel | Prova med en annan fil som är känd att fungera |

Om problemet kvarstår efter ovanstående steg, be användaren köra:
```
npx @healthy-ai-code/mcp-server --version
```
och kontrollera att den rapporterade versionen är aktuell.
