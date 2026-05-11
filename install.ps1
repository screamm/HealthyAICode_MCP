# Healthy AI Code MCP - Windows Installation Script
# Usage: irm https://raw.githubusercontent.com/YOUR_USERNAME/healthy-ai-code-mcp/main/install.ps1 | iex

$ErrorActionPreference = "Stop"
$PackageName = "@healthy-ai-code/mcp-server"
$BinName = "healthy-ai-code-mcp"
$MinNodeVersion = 18

function Write-Header {
    Write-Host ""
    Write-Host "  Healthy AI Code MCP Installer" -ForegroundColor Cyan
    Write-Host "  ==============================" -ForegroundColor Cyan
    Write-Host ""
}

function Test-NodeInstalled {
    try {
        $nodeVersion = node --version 2>$null
        if (-not $nodeVersion) { return $false }
        # Extrahera major version (v18.x.x -> 18)
        $major = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
        if ($major -lt $MinNodeVersion) {
            Write-Host "  [FEL] Node.js $nodeVersion hittades men version >=$MinNodeVersion krävs." -ForegroundColor Red
            Write-Host "        Ladda ner Node.js från https://nodejs.org/" -ForegroundColor Yellow
            exit 1
        }
        return $true
    } catch {
        return $false
    }
}

function Install-Package {
    Write-Host "  Installerar $PackageName..." -ForegroundColor Yellow
    try {
        npm install -g $PackageName --silent
        Write-Host "  [OK] Installation lyckades!" -ForegroundColor Green
    } catch {
        Write-Host "  [FEL] Installation misslyckades: $_" -ForegroundColor Red
        Write-Host "        Försök med: npm install -g $PackageName" -ForegroundColor Yellow
        exit 1
    }
}

function Show-ConfigInstructions {
    $binPath = (Get-Command $BinName -ErrorAction SilentlyContinue)?.Source

    Write-Host ""
    Write-Host "  Konfiguration" -ForegroundColor Cyan
    Write-Host "  =============" -ForegroundColor Cyan
    Write-Host ""

    Write-Host "  Claude Code:" -ForegroundColor White
    Write-Host "    claude mcp add healthy-ai-code -- $BinName" -ForegroundColor Gray
    Write-Host ""

    Write-Host "  Claude Desktop (claude_desktop_config.json):" -ForegroundColor White
    Write-Host '    {' -ForegroundColor Gray
    Write-Host '      "mcpServers": {' -ForegroundColor Gray
    Write-Host '        "healthy-ai-code": {' -ForegroundColor Gray
    Write-Host "          `"command`": `"$BinName`"" -ForegroundColor Gray
    Write-Host '        }' -ForegroundColor Gray
    Write-Host '      }' -ForegroundColor Gray
    Write-Host '    }' -ForegroundColor Gray
    Write-Host ""

    Write-Host "  VS Code (kopieras till .vscode/mcp.json i ditt projekt):" -ForegroundColor White
    Write-Host '    {' -ForegroundColor Gray
    Write-Host '      "servers": {' -ForegroundColor Gray
    Write-Host '        "healthy-ai-code": {' -ForegroundColor Gray
    Write-Host '          "command": "npx",' -ForegroundColor Gray
    Write-Host '          "args": ["-y", "@healthy-ai-code/mcp-server"],' -ForegroundColor Gray
    Write-Host '          "type": "stdio"' -ForegroundColor Gray
    Write-Host '        }' -ForegroundColor Gray
    Write-Host '      }' -ForegroundColor Gray
    Write-Host '    }' -ForegroundColor Gray
    Write-Host ""

    Write-Host "  Cursor / Windsurf (MCP-inställningar):" -ForegroundColor White
    Write-Host "    Kommando: $BinName" -ForegroundColor Gray
    Write-Host "    Transport: stdio" -ForegroundColor Gray
    Write-Host ""
}

# Main
Write-Header

# Kontrollera Node.js
Write-Host "  Kontrollerar Node.js..." -ForegroundColor Yellow
if (-not (Test-NodeInstalled)) {
    Write-Host "  [FEL] Node.js hittades inte. Installera Node.js >=$MinNodeVersion från https://nodejs.org/" -ForegroundColor Red
    exit 1
}
$nodeVer = node --version
Write-Host "  [OK] Node.js $nodeVer hittad" -ForegroundColor Green

# Installera paketet
Install-Package

# Visa konfigurationsinstruktioner
Show-ConfigInstructions

Write-Host "  Installation klar! Kopiera AGENTS.md till ditt projekt for optimal AI-integration." -ForegroundColor Cyan
Write-Host "  Dokumentation: https://github.com/YOUR_USERNAME/healthy-ai-code-mcp" -ForegroundColor Cyan
Write-Host ""
