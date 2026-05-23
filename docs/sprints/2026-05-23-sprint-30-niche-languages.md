# Sprint 30: Nischspråksexpansion — Tier B regex-analyzers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Utöka språkstödet med åtta nischspråk via Tier B regex-baserade analyzers: COBOL, Apex (Salesforce), F#, VB.NET, Perl, Groovy, Objective-C och PowerShell. Dessa språk saknar publika tree-sitter npm-paket (eller har instabila sådana) och hanteras via den generiska `analyzeGenericTierB`-infrastruktur som etablerades i Sprint 25. Varje analyzer extraherar funktioner/subroutiner, beräknar cyclomatic complexity via kontrollflödesnyckelord och kör text-baserade smells (SATD, MagicNumber).

**Architecture:** Åtta nya filer i `packages/core/src/analyzers/` — en per språk. Alla är tunna wrappers runt `analyzeGenericTierB` med en `TierBConfig` som definierar funktionsmönster och kontrollflödesnyckelord. Tre gemensamma påverkade filer: `src/types.ts` (Language union), `src/language-detect.ts` (filändelses-mappning) och `src/analyzers/index.ts` (dispatch-switch).

**Tech Stack:** TypeScript 5.x, Vitest, pnpm workspaces. Inga nya npm-paket installeras — alla analyzers är ren regex/text.

**Testkommando:** `cd packages/core && pnpm test`

---

## Bakgrund och motivation

Sprint 25 etablerade infrastrukturen för tre analysnivåer: Tier A (full AST-analys), Tier B (text-baserad extraktion) och Tier C (strukturell komplexitet). Sprint 30 fyller gapet i Tier B med åtta nischspråk som är vanliga i enterprise-miljöer men sällan stöds av moderna kodanalysverktyg.

**Varför dessa åtta språk?**

| Språk | Ekosystem | Antal aktiva kodbaser (uppskattning) |
|-------|-----------|-------------------------------------|
| COBOL | Finanssystem, banker, mainframe | ~200 miljarder kodrader globalt |
| Apex | Salesforce-plattformen | ~150 000 Salesforce-organisationer |
| F# | .NET, funktionell programmering | 50 000+ .NET-projekt |
| VB.NET | Legacy .NET, Windows-applikationer | Stor legacy-bas i enterprise |
| Perl | Systemadministration, bioinformatik, webb | Stor äldre kodbas |
| Groovy | Jenkins CI/CD, Gradle build-skript | Dominant i Jenkins-pipelines |
| Objective-C | iOS/macOS legacy-kod | ~30% av iOS-appar har ObjC-komponenter |
| PowerShell | Windows-automation, Azure DevOps | Dominant i Windows enterprise |

**Varför inte Tier A?**

Tier A kräver ett stabilt tree-sitter grammar-paket på npm. Inget av dessa åtta språk har ett välunderhållet tree-sitter npm-paket som är kompatibelt med vår tree-sitter version. COBOL i synnerhet har exceptionellt komplex grammatik (fixed-format, divisions, sections, paragraphs) som gör AST-parsing opraktisk utan ett moget grammar-bibliotek. Tier B ger meningsfull analys (CC, funktionslängd, SATD, MagicNumber) till en bråkdel av implementationskostnaden.

**Jämförelse mot CodeScene:**

CodeScene stöder COBOL, Apex och PowerShell via sin molnplattform. `code_health` stöder dem efter Sprint 30 via lokal analys utan molnberoende. F#, Groovy och Objective-C ingår inte i CodeScenes grundpaket och är ett differentierat erbjudande.

---

## Filöversikt

| Fil | Ändring |
|-----|---------|
| `packages/core/src/analyzers/cobol.ts` | Ny — Tier B COBOL-analyzer |
| `packages/core/src/analyzers/apex.ts` | Ny — Tier B Apex-analyzer |
| `packages/core/src/analyzers/fsharp.ts` | Ny — Tier B F#-analyzer |
| `packages/core/src/analyzers/vbnet.ts` | Ny — Tier B VB.NET-analyzer |
| `packages/core/src/analyzers/perl.ts` | Ny — Tier B Perl-analyzer |
| `packages/core/src/analyzers/groovy.ts` | Ny — Tier B Groovy-analyzer |
| `packages/core/src/analyzers/objc.ts` | Ny — Tier B Objective-C-analyzer |
| `packages/core/src/analyzers/powershell.ts` | Ny — Tier B PowerShell-analyzer |
| `packages/core/src/types.ts` | Utöka Language union med 8 nya identifierare |
| `packages/core/src/language-detect.ts` | Lägg till ~16 filändelser i EXTENSION_MAP |
| `packages/core/src/analyzers/index.ts` | Lägg till 8 nya case-grenar i `analyzeByLanguage` |
| `packages/core/tests/analyzers/cobol.test.ts` | Ny testfil |
| `packages/core/tests/analyzers/apex.test.ts` | Ny testfil |
| `packages/core/tests/analyzers/fsharp.test.ts` | Ny testfil |
| `packages/core/tests/analyzers/vbnet.test.ts` | Ny testfil |
| `packages/core/tests/analyzers/perl.test.ts` | Ny testfil |
| `packages/core/tests/analyzers/groovy.test.ts` | Ny testfil |
| `packages/core/tests/analyzers/objc.test.ts` | Ny testfil |
| `packages/core/tests/analyzers/powershell.test.ts` | Ny testfil |

---

## Task 1 — Registrera språk i typsystem och filändelsemapp

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/language-detect.ts`

Lägger grunden för alla följande tasks. Inga analyzer-implementeringar behövs — enbart typ-registrering och filändelse-mappning.

- [ ] **Steg 1: Utöka Language union i `types.ts`**

Hitta `export type Language = ...` och lägg till efter befintliga Tier B-språk:

```typescript
  // Tier B — niche languages (Sprint 30)
  | 'cobol'
  | 'apex'
  | 'fsharp'
  | 'vbnet'
  | 'perl'
  | 'groovy'
  | 'objc'
  | 'powershell'
```

- [ ] **Steg 2: Lägg till filändelser i `language-detect.ts`**

Lägg till i EXTENSION_MAP:

```typescript
  // Sprint 30 — niche languages
  '.cbl': 'cobol',
  '.cob': 'cobol',
  '.cobol': 'cobol',
  '.cls': 'apex',
  '.trigger': 'apex',
  '.fs': 'fsharp',
  '.fsx': 'fsharp',
  '.vb': 'vbnet',
  '.pl': 'perl',
  '.pm': 'perl',
  '.groovy': 'groovy',
  '.gvy': 'groovy',
  '.m': 'objc',
  '.mm': 'objc',
  '.ps1': 'powershell',
  '.psm1': 'powershell',
```

Obs: `.m` kolliderar potentiellt med MATLAB. MATLAB är inte ett stött språk och `.m` mappas till `objc`. Dokumentera i en kommentar i EXTENSION_MAP.

- [ ] **Steg 3: Typecheck**

```
cd packages/core && pnpm typecheck
```

Förväntat: inga TypeScript-fel. Eventuella exhaustiveness-fel i `analyzers/index.ts` åtgärdas i Task 10.

- [ ] **Steg 4: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/language-detect.ts
git commit -m "feat(core): register Sprint 30 niche languages in Language union and EXTENSION_MAP"
```

**Estimat:** 0.5 timmar | **AI-modell:** [Haiku]

**Acceptanskriterier:**
- [ ] `Language`-typen innehåller alla 8 nya identifierare
- [ ] EXTENSION_MAP innehåller alla 16 nya filändelser
- [ ] `pnpm typecheck` passerar utan fel

---

## Task 2 — COBOL-analyzer

**Files:**
- Create: `packages/core/src/analyzers/cobol.ts`
- Create: `packages/core/tests/analyzers/cobol.test.ts`

COBOL har en unik fixed-format-struktur: IDENTIFICATION DIVISION, ENVIRONMENT DIVISION, DATA DIVISION, PROCEDURE DIVISION. Funktioner definieras som PARAGRAPH-namn (en identifierare följd av punkt på en separat rad) eller SECTION-namn. CC bidras av IF/ELSE/WHEN/UNTIL/UNTIL-nyckelord.

- [ ] **Steg 1: Skriv det failande testet**

```typescript
// packages/core/tests/analyzers/cobol.test.ts
import { describe, it, expect } from 'vitest';
import { analyzeCobol } from '../../src/analyzers/cobol';

const SIMPLE_COBOL = `
       IDENTIFICATION DIVISION.
       PROGRAM-ID. HELLO.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "HELLO WORLD".
           STOP RUN.
       VALIDATE-PARA.
           IF WS-INPUT > 0
               DISPLAY "POSITIVE"
           ELSE
               DISPLAY "NON-POSITIVE"
           END-IF.
`;

const COMPLEX_COBOL = `
       PROCEDURE DIVISION.
       PROCESS-SECTION SECTION.
       PROCESS-PARA.
           EVALUATE TRUE
               WHEN WS-CODE = 1
                   PERFORM HANDLE-ONE
               WHEN WS-CODE = 2
                   PERFORM HANDLE-TWO
               WHEN OTHER
                   PERFORM HANDLE-OTHER
           END-EVALUATE.
           PERFORM VARYING WS-IDX FROM 1 BY 1
               UNTIL WS-IDX > WS-MAX
               DISPLAY WS-IDX
           END-PERFORM.
`;

describe('analyzeCobol', () => {
  it('identifierar paragrafnamn som funktioner', () => {
    const { functions } = analyzeCobol(SIMPLE_COBOL);
    expect(functions.length).toBeGreaterThanOrEqual(2);
  });

  it('beräknar cyclomatic complexity korrekt för IF/ELSE', () => {
    const { functions } = analyzeCobol(SIMPLE_COBOL);
    const validateFn = functions.find(f => f.name.includes('VALIDATE'));
    expect(validateFn?.cyclomaticComplexity).toBeGreaterThanOrEqual(2);
  });

  it('räknar EVALUATE WHEN som CC-bidrag', () => {
    const { functions } = analyzeCobol(COMPLEX_COBOL);
    expect(functions[0].cyclomaticComplexity).toBeGreaterThanOrEqual(4);
  });

  it('returnerar smells-array', () => {
    const { smells } = analyzeCobol(SIMPLE_COBOL);
    expect(Array.isArray(smells)).toBe(true);
  });

  it('hanterar tom input utan krasch', () => {
    expect(() => analyzeCobol('')).not.toThrow();
  });
});
```

- [ ] **Steg 2: Implementera `cobol.ts`**

```typescript
// packages/core/src/analyzers/cobol.ts
import { analyzeGenericTierB, type TierBConfig } from './generic-tier-b';
import type { AnalyzerOutput } from '../types';

const COBOL_CONFIG: TierBConfig = {
  language: 'cobol',
  // COBOL paragrafer: identifierare (ofta med bindestreck) följt av punkt
  functionPatterns: [
    /^[ \t]{7,8}([A-Z][A-Z0-9-]*)\./m,       // fixed-format paragraph
    /^[ \t]{7,8}([A-Z][A-Z0-9-]+)\s+SECTION\./im, // section header
  ],
  // EVALUATE WHEN räknas per WHEN-gren, PERFORM UNTIL och IF bidrar
  controlFlowKeywords: /\b(IF|ELSE|WHEN|UNTIL|VARYING|EVALUATE)\b/gi,
  commentPrefix: '*',
};

export const analyzeCobol = (code: string, filePath = '<inline>'): AnalyzerOutput =>
  analyzeGenericTierB(code, filePath, COBOL_CONFIG);
```

- [ ] **Steg 3: Kör testet (PASS) och commit**

```bash
git add packages/core/src/analyzers/cobol.ts packages/core/tests/analyzers/cobol.test.ts
git commit -m "feat(core): add COBOL Tier B analyzer (paragraph/section extraction, EVALUATE/IF/UNTIL CC)"
```

**Estimat:** 2 timmar | **AI-modell:** [Haiku]

**Acceptanskriterier:**
- [ ] `analyzeCobol` extraherar minst 2 paragrafnamn från `SIMPLE_COBOL`
- [ ] CC >= 2 för paragraph med IF/ELSE
- [ ] CC >= 4 för EVALUATE med 3 WHEN-grenar och PERFORM UNTIL
- [ ] Tom input kastar ej undantag
- [ ] `smells` är en array

---

## Task 3 — Apex-analyzer (Salesforce)

**Files:**
- Create: `packages/core/src/analyzers/apex.ts`
- Create: `packages/core/tests/analyzers/apex.test.ts`

Apex liknar Java syntaktiskt. Klasser definieras med `public class Foo`, metoder med `public void methodName()`. Kontrollflöde via `if`, `else`, `for`, `while`, `switch`. SOQL-queries (SELECT ... FROM ...) är en Apex-specifik konstruktion men bidrar ej till CC.

- [ ] **Steg 1: Skriv det failande testet**

```typescript
// packages/core/tests/analyzers/apex.test.ts
import { describe, it, expect } from 'vitest';
import { analyzeApex } from '../../src/analyzers/apex';

const SIMPLE_APEX = `
public class AccountController {
    public static List<Account> getAccounts() {
        return [SELECT Id, Name FROM Account];
    }

    public static void updateAccount(Account acc, Boolean isActive) {
        if (isActive) {
            acc.Status__c = 'Active';
        } else {
            acc.Status__c = 'Inactive';
        }
        update acc;
    }
}
`;

const TRIGGER_APEX = `
trigger AccountTrigger on Account (before insert, before update) {
    for (Account acc : Trigger.new) {
        if (acc.Name == null) {
            acc.addError('Name is required');
        }
    }
}
`;

describe('analyzeApex', () => {
  it('identifierar Apex-metoder som funktioner', () => {
    const { functions } = analyzeApex(SIMPLE_APEX);
    expect(functions.length).toBeGreaterThanOrEqual(2);
  });

  it('beräknar CC för if/else-logik', () => {
    const { functions } = analyzeApex(SIMPLE_APEX);
    const updateFn = functions.find(f => f.name.includes('update'));
    expect(updateFn?.cyclomaticComplexity).toBeGreaterThanOrEqual(2);
  });

  it('hanterar trigger-syntax utan krasch', () => {
    expect(() => analyzeApex(TRIGGER_APEX)).not.toThrow();
  });

  it('returnerar smells-array', () => {
    const { smells } = analyzeApex(SIMPLE_APEX);
    expect(Array.isArray(smells)).toBe(true);
  });

  it('hanterar tom input utan krasch', () => {
    expect(() => analyzeApex('')).not.toThrow();
  });
});
```

- [ ] **Steg 2: Implementera `apex.ts`**

```typescript
// packages/core/src/analyzers/apex.ts
import { analyzeGenericTierB, type TierBConfig } from './generic-tier-b';
import type { AnalyzerOutput } from '../types';

const APEX_CONFIG: TierBConfig = {
  language: 'apex',
  functionPatterns: [
    // Apex-metoder: access modifier + return type + name + parentheses
    /^\s*(?:public|private|protected|global|static|override|\s)+\s+\w+\s+(\w+)\s*\(/m,
    // Apex-konstruktorer
    /^\s*(?:public|private|protected|global)\s+(\w+)\s*\(/m,
  ],
  controlFlowKeywords: /\b(if|else|for|while|switch|when|catch)\b/g,
  commentPrefix: '//',
};

export const analyzeApex = (code: string, filePath = '<inline>'): AnalyzerOutput =>
  analyzeGenericTierB(code, filePath, APEX_CONFIG);
```

- [ ] **Steg 3: Kör testet (PASS) och commit**

```bash
git add packages/core/src/analyzers/apex.ts packages/core/tests/analyzers/apex.test.ts
git commit -m "feat(core): add Apex (Salesforce) Tier B analyzer (method extraction, if/for/switch CC)"
```

**Estimat:** 2 timmar | **AI-modell:** [Haiku]

**Acceptanskriterier:**
- [ ] `analyzeApex` extraherar minst 2 metoder från `SIMPLE_APEX`
- [ ] CC >= 2 för metod med if/else
- [ ] Trigger-syntax kastar ej undantag
- [ ] Tom input kastar ej undantag

---

## Task 4 — F#-analyzer

**Files:**
- Create: `packages/core/src/analyzers/fsharp.ts`
- Create: `packages/core/tests/analyzers/fsharp.test.ts`

F# är ett funktionellt .NET-språk. Funktioner definieras med `let functionName arg = ...` eller `let rec functionName`. Kontrollflöde via `if/then/else`, `match ... with`, `for ... in ... do`, `while ... do`. Pattern matching är centralt och varje match-gren bidrar med CC.

- [ ] **Steg 1: Skriv det failande testet**

```typescript
// packages/core/tests/analyzers/fsharp.test.ts
import { describe, it, expect } from 'vitest';
import { analyzeFsharp } from '../../src/analyzers/fsharp';

const SIMPLE_FSHARP = `
let add x y = x + y

let classify n =
    if n > 0 then "positive"
    elif n < 0 then "negative"
    else "zero"
`;

const MATCH_FSHARP = `
let describe shape =
    match shape with
    | Circle r -> sprintf "circle with radius %f" r
    | Rectangle (w, h) -> sprintf "rectangle %f x %f" w h
    | Triangle (a, b, c) -> sprintf "triangle %f %f %f" a b c

let rec factorial n =
    if n <= 1 then 1
    else n * factorial (n - 1)
`;

describe('analyzeFsharp', () => {
  it('identifierar let-bindings som funktioner', () => {
    const { functions } = analyzeFsharp(SIMPLE_FSHARP);
    expect(functions.length).toBeGreaterThanOrEqual(2);
  });

  it('beräknar CC för if/elif/else', () => {
    const { functions } = analyzeFsharp(SIMPLE_FSHARP);
    const classifyFn = functions.find(f => f.name === 'classify');
    expect(classifyFn?.cyclomaticComplexity).toBeGreaterThanOrEqual(3);
  });

  it('räknar match-grenar som CC', () => {
    const { functions } = analyzeFsharp(MATCH_FSHARP);
    const describeFn = functions.find(f => f.name === 'describe');
    expect(describeFn?.cyclomaticComplexity).toBeGreaterThanOrEqual(3);
  });

  it('hanterar rekursiva funktioner (let rec)', () => {
    const { functions } = analyzeFsharp(MATCH_FSHARP);
    expect(functions.some(f => f.name === 'factorial')).toBe(true);
  });

  it('hanterar tom input utan krasch', () => {
    expect(() => analyzeFsharp('')).not.toThrow();
  });
});
```

- [ ] **Steg 2: Implementera `fsharp.ts`**

```typescript
// packages/core/src/analyzers/fsharp.ts
import { analyzeGenericTierB, type TierBConfig } from './generic-tier-b';
import type { AnalyzerOutput } from '../types';

const FSHARP_CONFIG: TierBConfig = {
  language: 'fsharp',
  functionPatterns: [
    /^\s*let\s+(?:rec\s+)?([a-zA-Z_][a-zA-Z0-9_']*)\s+[^=]*=/m,
    /^\s*member\s+\w+\.([a-zA-Z_][a-zA-Z0-9_']*)\s*\(/m,
  ],
  controlFlowKeywords: /\b(if|elif|else|match|with|for|while|do)\b|\|\s+\w/g,
  commentPrefix: '//',
};

export const analyzeFsharp = (code: string, filePath = '<inline>'): AnalyzerOutput =>
  analyzeGenericTierB(code, filePath, FSHARP_CONFIG);
```

- [ ] **Steg 3: Kör testet (PASS) och commit**

```bash
git add packages/core/src/analyzers/fsharp.ts packages/core/tests/analyzers/fsharp.test.ts
git commit -m "feat(core): add F# Tier B analyzer (let-binding extraction, match/if CC)"
```

**Estimat:** 2 timmar | **AI-modell:** [Haiku]

**Acceptanskriterier:**
- [ ] `analyzeFsharp` extraherar `add`, `classify`, `describe`, `factorial` som funktioner
- [ ] `classify` har CC >= 3 (if/elif/else)
- [ ] `describe` har CC >= 3 (tre match-grenar)
- [ ] `let rec`-funktioner identifieras korrekt
- [ ] Tom input kastar ej undantag

---

## Task 5 — VB.NET-analyzer

**Files:**
- Create: `packages/core/src/analyzers/vbnet.ts`
- Create: `packages/core/tests/analyzers/vbnet.test.ts`

VB.NET definierar funktioner med `Function` (med returvärde) och `Sub` (utan). Kontrollflöde via `If/Then/ElseIf/Else/End If`, `For/Next`, `For Each/Next`, `While/End While`, `Select Case/Case/End Select`.

- [ ] **Steg 1: Skriv det failande testet**

```typescript
// packages/core/tests/analyzers/vbnet.test.ts
import { describe, it, expect } from 'vitest';
import { analyzeVbnet } from '../../src/analyzers/vbnet';

const SIMPLE_VBNET = `
Public Class Calculator
    Public Function Add(a As Integer, b As Integer) As Integer
        Return a + b
    End Function

    Public Sub ProcessValue(value As Integer)
        If value > 0 Then
            Console.WriteLine("Positive")
        ElseIf value < 0 Then
            Console.WriteLine("Negative")
        Else
            Console.WriteLine("Zero")
        End If
    End Sub
End Class
`;

const SELECT_VBNET = `
Public Function GetDayName(day As Integer) As String
    Select Case day
        Case 1
            Return "Monday"
        Case 2
            Return "Tuesday"
        Case 3
            Return "Wednesday"
        Case Else
            Return "Unknown"
    End Select
End Function
`;

describe('analyzeVbnet', () => {
  it('identifierar Function och Sub som funktioner', () => {
    const { functions } = analyzeVbnet(SIMPLE_VBNET);
    expect(functions.length).toBeGreaterThanOrEqual(2);
  });

  it('beräknar CC för If/ElseIf/Else', () => {
    const { functions } = analyzeVbnet(SIMPLE_VBNET);
    const processFn = functions.find(f => f.name.toLowerCase().includes('process'));
    expect(processFn?.cyclomaticComplexity).toBeGreaterThanOrEqual(3);
  });

  it('räknar Select Case-grenar som CC', () => {
    const { functions } = analyzeVbnet(SELECT_VBNET);
    expect(functions[0].cyclomaticComplexity).toBeGreaterThanOrEqual(4);
  });

  it('hanterar tom input utan krasch', () => {
    expect(() => analyzeVbnet('')).not.toThrow();
  });
});
```

- [ ] **Steg 2: Implementera `vbnet.ts`**

```typescript
// packages/core/src/analyzers/vbnet.ts
import { analyzeGenericTierB, type TierBConfig } from './generic-tier-b';
import type { AnalyzerOutput } from '../types';

const VBNET_CONFIG: TierBConfig = {
  language: 'vbnet',
  functionPatterns: [
    /^\s*(?:Public|Private|Protected|Friend|Shared|Overrides|\s)*\s+Function\s+(\w+)\s*\(/im,
    /^\s*(?:Public|Private|Protected|Friend|Shared|Overrides|\s)*\s+Sub\s+(\w+)\s*\(/im,
  ],
  controlFlowKeywords: /\b(If|ElseIf|Else|For|While|Select|Case|Do|Loop|Catch)\b/gi,
  commentPrefix: "'",
};

export const analyzeVbnet = (code: string, filePath = '<inline>'): AnalyzerOutput =>
  analyzeGenericTierB(code, filePath, VBNET_CONFIG);
```

- [ ] **Steg 3: Kör testet (PASS) och commit**

```bash
git add packages/core/src/analyzers/vbnet.ts packages/core/tests/analyzers/vbnet.test.ts
git commit -m "feat(core): add VB.NET Tier B analyzer (Function/Sub extraction, If/Select CC)"
```

**Estimat:** 2 timmar | **AI-modell:** [Haiku]

**Acceptanskriterier:**
- [ ] Både `Function` och `Sub` identifieras som funktioner
- [ ] `If/ElseIf/Else` ger CC >= 3
- [ ] `Select Case` med 4 grenar ger CC >= 4
- [ ] Tom input kastar ej undantag

---

## Task 6 — Perl-analyzer

**Files:**
- Create: `packages/core/src/analyzers/perl.ts`
- Create: `packages/core/tests/analyzers/perl.test.ts`

Perl definierar subroutiner med `sub name { ... }`. Kontrollflöde via `if/elsif/else`, `unless`, `for`/`foreach`, `while`/`until`. Perl har även postfix-if (`statement if condition`) och postfix-unless — dessa bidrar med CC via `unless`-räknaren.

- [ ] **Steg 1: Skriv det failande testet**

```typescript
// packages/core/tests/analyzers/perl.test.ts
import { describe, it, expect } from 'vitest';
import { analyzePerl } from '../../src/analyzers/perl';

const SIMPLE_PERL = `
sub greet {
    my ($name) = @_;
    return "Hello, $name!";
}

sub validate_age {
    my ($age) = @_;
    if ($age < 0) {
        die "Age cannot be negative";
    } elsif ($age > 150) {
        die "Age too large";
    }
    return 1;
}
`;

const LOOP_PERL = `
sub process_items {
    my @items = @_;
    my @result;
    foreach my $item (@items) {
        unless ($item eq '') {
            push @result, uc($item);
        }
    }
    return @result;
}
`;

describe('analyzePerl', () => {
  it('identifierar sub-definitioner som funktioner', () => {
    const { functions } = analyzePerl(SIMPLE_PERL);
    expect(functions.length).toBeGreaterThanOrEqual(2);
  });

  it('beräknar CC för if/elsif', () => {
    const { functions } = analyzePerl(SIMPLE_PERL);
    const validateFn = functions.find(f => f.name.includes('validate'));
    expect(validateFn?.cyclomaticComplexity).toBeGreaterThanOrEqual(3);
  });

  it('räknar unless och foreach som CC', () => {
    const { functions } = analyzePerl(LOOP_PERL);
    expect(functions[0].cyclomaticComplexity).toBeGreaterThanOrEqual(3);
  });

  it('hanterar tom input utan krasch', () => {
    expect(() => analyzePerl('')).not.toThrow();
  });
});
```

- [ ] **Steg 2: Implementera `perl.ts`**

```typescript
// packages/core/src/analyzers/perl.ts
import { analyzeGenericTierB, type TierBConfig } from './generic-tier-b';
import type { AnalyzerOutput } from '../types';

const PERL_CONFIG: TierBConfig = {
  language: 'perl',
  functionPatterns: [
    /^\s*sub\s+(\w+)\s*\{/m,
  ],
  controlFlowKeywords: /\b(if|elsif|else|unless|for|foreach|while|until|given|when)\b/g,
  commentPrefix: '#',
};

export const analyzePerl = (code: string, filePath = '<inline>'): AnalyzerOutput =>
  analyzeGenericTierB(code, filePath, PERL_CONFIG);
```

- [ ] **Steg 3: Kör testet (PASS) och commit**

```bash
git add packages/core/src/analyzers/perl.ts packages/core/tests/analyzers/perl.test.ts
git commit -m "feat(core): add Perl Tier B analyzer (sub extraction, if/elsif/unless/foreach CC)"
```

**Estimat:** 2 timmar | **AI-modell:** [Haiku]

**Acceptanskriterier:**
- [ ] `sub`-definitioner identifieras som funktioner
- [ ] `if/elsif` ger CC >= 3
- [ ] `unless` och `foreach` räknas som CC-bidrag
- [ ] Tom input kastar ej undantag

---

## Task 7 — Groovy-analyzer

**Files:**
- Create: `packages/core/src/analyzers/groovy.ts`
- Create: `packages/core/tests/analyzers/groovy.test.ts`

Groovy liknar Java syntaktiskt men har optionella typer och closures. Metoder definieras antingen med `def methodName(` eller med explicit typ `String methodName(`. Closures (`{ args -> body }`) är vanliga i Jenkins Pipelines och Gradle-skript. Kontrollflöde identiskt med Java.

- [ ] **Steg 1: Skriv det failande testet**

```typescript
// packages/core/tests/analyzers/groovy.test.ts
import { describe, it, expect } from 'vitest';
import { analyzeGroovy } from '../../src/analyzers/groovy';

const SIMPLE_GROOVY = `
class BuildHelper {
    def buildProject(String name, boolean clean) {
        if (clean) {
            sh 'gradle clean'
        }
        sh "gradle build -p ${name}"
    }

    String getVersion() {
        def props = new Properties()
        props.load(new File('gradle.properties').newReader())
        return props.getProperty('version')
    }
}
`;

const PIPELINE_GROOVY = `
pipeline {
    agent any
    stages {
        stage('Build') {
            steps {
                script {
                    def result = sh(script: 'gradle build', returnStatus: true)
                    if (result != 0) {
                        error 'Build failed'
                    } else if (result == 0) {
                        echo 'Build succeeded'
                    }
                }
            }
        }
    }
}
`;

describe('analyzeGroovy', () => {
  it('identifierar def-metoder som funktioner', () => {
    const { functions } = analyzeGroovy(SIMPLE_GROOVY);
    expect(functions.length).toBeGreaterThanOrEqual(2);
  });

  it('beräknar CC för if-logik', () => {
    const { functions } = analyzeGroovy(SIMPLE_GROOVY);
    const buildFn = functions.find(f => f.name.includes('build'));
    expect(buildFn?.cyclomaticComplexity).toBeGreaterThanOrEqual(2);
  });

  it('hanterar pipeline-syntax utan krasch', () => {
    expect(() => analyzeGroovy(PIPELINE_GROOVY)).not.toThrow();
  });

  it('hanterar tom input utan krasch', () => {
    expect(() => analyzeGroovy('')).not.toThrow();
  });
});
```

- [ ] **Steg 2: Implementera `groovy.ts`**

```typescript
// packages/core/src/analyzers/groovy.ts
import { analyzeGenericTierB, type TierBConfig } from './generic-tier-b';
import type { AnalyzerOutput } from '../types';

const GROOVY_CONFIG: TierBConfig = {
  language: 'groovy',
  functionPatterns: [
    /^\s*(?:def|void|String|int|boolean|List|Map)\s+(\w+)\s*\(/m,
    /^\s*(?:public|private|protected|static|\s)*(?:def|\w+)\s+(\w+)\s*\(/m,
  ],
  controlFlowKeywords: /\b(if|else|for|while|switch|case|catch|when)\b/g,
  commentPrefix: '//',
};

export const analyzeGroovy = (code: string, filePath = '<inline>'): AnalyzerOutput =>
  analyzeGenericTierB(code, filePath, GROOVY_CONFIG);
```

- [ ] **Steg 3: Kör testet (PASS) och commit**

```bash
git add packages/core/src/analyzers/groovy.ts packages/core/tests/analyzers/groovy.test.ts
git commit -m "feat(core): add Groovy Tier B analyzer (def/typed method extraction, if/switch CC)"
```

**Estimat:** 2 timmar | **AI-modell:** [Haiku]

**Acceptanskriterier:**
- [ ] Både `def`-metoder och typade metoder identifieras
- [ ] `if`-logik ger korrekt CC
- [ ] Jenkins Pipeline-syntax kastar ej undantag
- [ ] Tom input kastar ej undantag

---

## Task 8 — Objective-C-analyzer

**Files:**
- Create: `packages/core/src/analyzers/objc.ts`
- Create: `packages/core/tests/analyzers/objc.test.ts`

Objective-C har en unik meddelandesyntax för metoddefinitioner: `- (returnType)methodName:(paramType)param`. Instansmetoder börjar med `-`, klassmetoder med `+`. Kontrollflöde via `if/else`, `for`, `while`, `switch/case`. Objective-C-blocks (`^{ ... }`) bidrar till komplexitet men hanteras inte specifikt i Tier B.

- [ ] **Steg 1: Skriv det failande testet**

```typescript
// packages/core/tests/analyzers/objc.test.ts
import { describe, it, expect } from 'vitest';
import { analyzeObjc } from '../../src/analyzers/objc';

const SIMPLE_OBJC = `
@implementation AccountViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.title = @"Accounts";
}

- (BOOL)validateInput:(NSString *)input withLimit:(NSInteger)limit {
    if (input == nil || input.length == 0) {
        return NO;
    }
    if (input.length > limit) {
        return NO;
    }
    return YES;
}

+ (instancetype)controllerWithAccount:(Account *)account {
    AccountViewController *vc = [[self alloc] init];
    vc.account = account;
    return vc;
}

@end
`;

describe('analyzeObjc', () => {
  it('identifierar instansmetoder (–) och klassmetoder (+)', () => {
    const { functions } = analyzeObjc(SIMPLE_OBJC);
    expect(functions.length).toBeGreaterThanOrEqual(3);
  });

  it('beräknar CC för if-kedjor', () => {
    const { functions } = analyzeObjc(SIMPLE_OBJC);
    const validateFn = functions.find(f => f.name.includes('validate'));
    expect(validateFn?.cyclomaticComplexity).toBeGreaterThanOrEqual(3);
  });

  it('hanterar tom input utan krasch', () => {
    expect(() => analyzeObjc('')).not.toThrow();
  });
});
```

- [ ] **Steg 2: Implementera `objc.ts`**

```typescript
// packages/core/src/analyzers/objc.ts
import { analyzeGenericTierB, type TierBConfig } from './generic-tier-b';
import type { AnalyzerOutput } from '../types';

const OBJC_CONFIG: TierBConfig = {
  language: 'objc',
  functionPatterns: [
    // Objective-C instans- och klassmetoder
    /^\s*[-+]\s*\([^)]+\)\s*(\w+)(?::|\s*\{)/m,
    // C-funktioner i .m-filer
    /^\s*\w[\w\s*]*\s+(\w+)\s*\([^)]*\)\s*\{/m,
  ],
  controlFlowKeywords: /\b(if|else|for|while|switch|case|catch)\b/g,
  commentPrefix: '//',
};

export const analyzeObjc = (code: string, filePath = '<inline>'): AnalyzerOutput =>
  analyzeGenericTierB(code, filePath, OBJC_CONFIG);
```

- [ ] **Steg 3: Kör testet (PASS) och commit**

```bash
git add packages/core/src/analyzers/objc.ts packages/core/tests/analyzers/objc.test.ts
git commit -m "feat(core): add Objective-C Tier B analyzer (instance/class method extraction, if/switch CC)"
```

**Estimat:** 2 timmar | **AI-modell:** [Haiku]

**Acceptanskriterier:**
- [ ] Instansmetoder (`-`) och klassmetoder (`+`) identifieras
- [ ] Metod med två if-satser ger CC >= 3
- [ ] Tom input kastar ej undantag

---

## Task 9 — PowerShell-analyzer

**Files:**
- Create: `packages/core/src/analyzers/powershell.ts`
- Create: `packages/core/tests/analyzers/powershell.test.ts`

PowerShell definierar funktioner med `function FunctionName { ... }` eller `function FunctionName([params]) { ... }`. Kontrollflöde via `if/elseif/else`, `foreach`, `for`, `while`, `switch`. PowerShell-pipeline-operatorn `|` bidrar inte till CC. `trap` och `catch` bidrar.

- [ ] **Steg 1: Skriv det failande testet**

```typescript
// packages/core/tests/analyzers/powershell.test.ts
import { describe, it, expect } from 'vitest';
import { analyzePowershell } from '../../src/analyzers/powershell';

const SIMPLE_POWERSHELL = `
function Get-UserInfo {
    param([string]$Username)
    $user = Get-ADUser -Identity $Username
    return $user
}

function Test-ConnectionHealth {
    param(
        [string]$Server,
        [int]$Port = 80
    )
    if ($Port -lt 1 -or $Port -gt 65535) {
        throw "Invalid port number"
    }
    $result = Test-NetConnection -ComputerName $Server -Port $Port
    if ($result.TcpTestSucceeded) {
        Write-Host "Connection OK"
    } else {
        Write-Warning "Connection failed"
    }
    return $result
}
`;

const SWITCH_POWERSHELL = `
function Get-ServiceStatus {
    param([string]$ServiceName)
    $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    switch ($service.Status) {
        'Running'  { return 'active' }
        'Stopped'  { return 'inactive' }
        'Paused'   { return 'paused' }
        default    { return 'unknown' }
    }
}
`;

describe('analyzePowershell', () => {
  it('identifierar function-definitioner', () => {
    const { functions } = analyzePowershell(SIMPLE_POWERSHELL);
    expect(functions.length).toBeGreaterThanOrEqual(2);
  });

  it('beräknar CC för if/else-logik', () => {
    const { functions } = analyzePowershell(SIMPLE_POWERSHELL);
    const healthFn = functions.find(f => f.name.toLowerCase().includes('health'));
    expect(healthFn?.cyclomaticComplexity).toBeGreaterThanOrEqual(3);
  });

  it('räknar switch-grenar som CC', () => {
    const { functions } = analyzePowershell(SWITCH_POWERSHELL);
    expect(functions[0].cyclomaticComplexity).toBeGreaterThanOrEqual(4);
  });

  it('hanterar param-block utan krasch', () => {
    expect(() => analyzePowershell(SIMPLE_POWERSHELL)).not.toThrow();
  });

  it('hanterar tom input utan krasch', () => {
    expect(() => analyzePowershell('')).not.toThrow();
  });
});
```

- [ ] **Steg 2: Implementera `powershell.ts`**

```typescript
// packages/core/src/analyzers/powershell.ts
import { analyzeGenericTierB, type TierBConfig } from './generic-tier-b';
import type { AnalyzerOutput } from '../types';

const POWERSHELL_CONFIG: TierBConfig = {
  language: 'powershell',
  functionPatterns: [
    /^\s*function\s+([\w-]+)\s*(?:\{|\(|\[)/im,
  ],
  controlFlowKeywords: /\b(if|elseif|else|foreach|for|while|switch|catch|trap)\b/gi,
  commentPrefix: '#',
};

export const analyzePowershell = (code: string, filePath = '<inline>'): AnalyzerOutput =>
  analyzeGenericTierB(code, filePath, POWERSHELL_CONFIG);
```

- [ ] **Steg 3: Kör testet (PASS) och commit**

```bash
git add packages/core/src/analyzers/powershell.ts packages/core/tests/analyzers/powershell.test.ts
git commit -m "feat(core): add PowerShell Tier B analyzer (function extraction, if/switch/foreach CC)"
```

**Estimat:** 2 timmar | **AI-modell:** [Haiku]

**Acceptanskriterier:**
- [ ] PowerShell-funktioner med `param`-block identifieras
- [ ] `if/elseif` ger CC >= 3
- [ ] `switch` med 4 grenar ger CC >= 4
- [ ] Tom input kastar ej undantag

---

## Task 10 — Wire alla 8 analyzers i `index.ts`

**Files:**
- Modify: `packages/core/src/analyzers/index.ts`

Koppla in alla åtta nya analyzers i `analyzeByLanguage`-dispatchen.

- [ ] **Steg 1: Lägg till imports i `index.ts`**

```typescript
import { analyzeCobol } from './cobol';
import { analyzeApex } from './apex';
import { analyzeFsharp } from './fsharp';
import { analyzeVbnet } from './vbnet';
import { analyzePerl } from './perl';
import { analyzeGroovy } from './groovy';
import { analyzeObjc } from './objc';
import { analyzePowershell } from './powershell';
```

- [ ] **Steg 2: Lägg till case-grenar i switch**

```typescript
case 'cobol':      return analyzeCobol(code, filePath);
case 'apex':       return analyzeApex(code, filePath);
case 'fsharp':     return analyzeFsharp(code, filePath);
case 'vbnet':      return analyzeVbnet(code, filePath);
case 'perl':       return analyzePerl(code, filePath);
case 'groovy':     return analyzeGroovy(code, filePath);
case 'objc':       return analyzeObjc(code, filePath);
case 'powershell': return analyzePowershell(code, filePath);
```

- [ ] **Steg 3: Kör hela testsviten**

```
cd packages/core && pnpm test
```

Förväntat: alla befintliga tester passerar utan regressioner. Alla 8 nya analyzer-tester är gröna.

- [ ] **Steg 4: Kör typecheck**

```
pnpm -r typecheck
```

- [ ] **Steg 5: Commit**

```bash
git add packages/core/src/analyzers/index.ts
git commit -m "feat(core): wire Sprint 30 niche language analyzers into analyzeByLanguage dispatch"
```

**Estimat:** 1 timme | **AI-modell:** [Haiku]

**Acceptanskriterier:**
- [ ] `analyzeByLanguage(code, 'cobol')` returnerar giltig `AnalyzerOutput`
- [ ] Alla 8 nya case-grenar finns i switch
- [ ] `pnpm -r typecheck` passerar utan fel
- [ ] `pnpm -r test` passerar utan regressioner

---

## Task 11 — Integrationstestuppdatering

**Files:**
- Modify: `packages/core/tests/analyzers/all-languages-integration.test.ts`

Lägg till de 8 nya språken i det integrations-test som etablerades i Sprint 25.

- [ ] **Steg 1: Lägg till snippets i `HELLO_SNIPPETS`**

```typescript
cobol: "       IDENTIFICATION DIVISION.\n       PROGRAM-ID. HELLO.\n       PROCEDURE DIVISION.\n       MAIN-PARA.\n           STOP RUN.",
apex: "public class Hello { public static void greet() { System.debug('hi'); } }",
fsharp: "let hello () = \"hi\"",
vbnet: "Public Function Hello() As String\n    Return \"hi\"\nEnd Function",
perl: "sub hello { return 'hi'; }",
groovy: "def hello() { return 'hi' }",
objc: "- (NSString *)hello { return @\"hi\"; }",
powershell: "function Get-Hello { return 'hi' }",
```

- [ ] **Steg 2: Kör integrationstestet**

```
cd packages/core && pnpm test -- tests/analyzers/all-languages-integration.test.ts
```

- [ ] **Steg 3: Commit**

```bash
git add packages/core/tests/analyzers/all-languages-integration.test.ts
git commit -m "test(core): add Sprint 30 niche languages to all-languages integration test"
```

**Estimat:** 0.5 timmar | **AI-modell:** [Haiku]

**Acceptanskriterier:**
- [ ] Alla 8 nya språk returnerar giltig `AnalyzerOutput` med `functions`, `smells`, `metrics`
- [ ] `metrics.totalLines >= 1` för alla 8 snippets
- [ ] Inga undantag kastas

---

## Testkrav

| # | Test | Acceptansvillkor |
|---|------|-----------------|
| T1 | COBOL: paragrafextraktion | >= 2 paragrafnamn från `PROCEDURE DIVISION`-fixture |
| T2 | COBOL: EVALUATE WHEN CC | CC >= 4 för 3 WHEN-grenar + PERFORM UNTIL |
| T3 | Apex: metodextraktion | >= 2 metoder från klassfixture |
| T4 | Apex: trigger-syntax | Inga undantag |
| T5 | F#: let-bindingsextraktion | `add`, `classify`, `describe`, `factorial` hittade |
| T6 | F#: match CC | `describe` CC >= 3 för 3 match-grenar |
| T7 | VB.NET: Function och Sub | Båda typerna identifieras |
| T8 | VB.NET: Select Case | CC >= 4 för 4 Case-grenar |
| T9 | Perl: sub-extraktion | >= 2 sub-definitioner |
| T10 | Perl: unless-räkning | `unless` räknas som CC-bidrag |
| T11 | Groovy: def och typade metoder | Båda typerna identifieras |
| T12 | Groovy: pipeline-syntax | Inga undantag |
| T13 | Objective-C: - och + metoder | Instans- och klassmetoder identifieras |
| T14 | Objective-C: meddelandesyntax CC | Metod med 2 if-satser ger CC >= 3 |
| T15 | PowerShell: function med param-block | Identifieras korrekt |
| T16 | PowerShell: switch CC | 4 switch-grenar ger CC >= 4 |
| T17 | Integration: alla 8 språk | `analyzeByLanguage` returnerar giltig output utan undantag |
| T18 | Regressions: befintliga språk | Inga befintliga tester bryts |

## Definition of Done

- [ ] Alla 11 tasks har gröna tester
- [ ] `pnpm -r test` passerar utan regressions
- [ ] `pnpm -r typecheck` passerar utan TypeScript-fel
- [ ] `Language`-unionen i `types.ts` innehåller alla 8 nya identifierare
- [ ] `EXTENSION_MAP` i `language-detect.ts` innehåller alla 16 nya filändelser
- [ ] `analyzeByLanguage` har case-grenar för alla 8 nya språk
- [ ] Integrationstestet täcker alla 8 nya språk
- [ ] Varje analyzer har ett eget testfil med minst 4 testfall
- [ ] MCP-serverns `language`-enum uppdaterad om den existerar som hårdkodad lista

## Koppling till CodeScene-jämförelsen

Sprint 30 reducerar funktionalitetsgapet mot CodeScene inom språkstöd. CodeScene stöder COBOL och Apex som tillvalsfunktioner; Groovy, F#, VB.NET, Objective-C och PowerShell saknas eller är begränsade i deras standarderbjudande. Alla åtta Sprint 30-språk analyseras lokalt utan molnanrop, vilket är ett arkitekturellt differentieringsvärde.

Tier B-nivån för dessa nischspråk ger tillräcklig information för att identifiera hotspots (hög CC + hög kodfrekvens) och Long Method-smells — de primära värdeskaparna i CodeScene-analys. Full Tier A (AST-baserad) för dessa språk är en potentiell framtida sprint men kräver moget tree-sitter grammar-stöd.

## Risker

| Risk | Sannolikhet | Påverkan | Mitigation |
|------|-------------|----------|------------|
| COBOL fixed-format regex missar free-format COBOL | Medel | Låg | Tier B ger best-effort; dokumentera begränsning |
| Apex `.cls`-extension kolliderar med Visual Basic klassmoduler | Låg | Låg | Apex `.cls` är mer frekvent i moderna repos; accepteras |
| PowerShell verb-noun-namngivning (Get-Hello) skapar långa funktionsnamn | Låg | Ingen | Namngivning är inte ett problem för analysen |
| Groovy closures räknas som funktioner felaktigt | Medel | Låg | Tier B räknar `def`-metoder; closures hoppas över |
| ObjC `.m`-extension kolliderar med MATLAB | Låg | Låg | MATLAB är inte ett stött språk; dokumentera |

**Totalt estimat:** ~16.5 timmar fördelade på 11 tasks
