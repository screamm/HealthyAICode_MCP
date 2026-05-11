# Homebrew Formula

Installera Healthy AI Code MCP via Homebrew:

```bash
brew tap YOUR_USERNAME/healthy-ai-code-mcp https://github.com/YOUR_USERNAME/healthy-ai-code-mcp
brew install healthy-ai-code-mcp
```

## Uppdatera formula vid ny release

1. Publicera ny version till npm: `npm publish`
2. Hämta SHA256: `curl -sL https://registry.npmjs.org/@healthy-ai-code/mcp-server/-/mcp-server-VERSION.tgz | shasum -a 256`
3. Uppdatera `url` och `sha256` i Formula/healthy-ai-code-mcp.rb
4. Commit och tagga: `git tag v{VERSION}`
