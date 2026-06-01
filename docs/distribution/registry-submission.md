# Registry Submission Guide

Ready-to-run steps for the owner to publish `healthy-ai-code-mcp` to the MCP Registry and Smithery.
All commands are copy-pasteable. Do not run these until the npm package is publicly published.

---

## Pre-flight checklist

Before running any submission command, confirm the following are true:

- [ ] GitHub repo is public at `https://github.com/screamm/healthy-ai-code-mcp`
- [ ] npm package `@healthy-ai-code/mcp-server` is published and public (`npm info @healthy-ai-code/mcp-server` returns data)
- [ ] `server.json` is committed at the repo root
- [ ] `.well-known/mcp-server-card.json` is committed and served at `https://screamm.github.io/healthy-ai-code-mcp/.well-known/mcp-server-card.json` (or GitHub Pages / CDN)
- [ ] `packages/mcp-server/package.json` contains `"mcpName": "io.github.screamm/healthy-ai-code-mcp"`

---

## Part 1 — Publish to npm (prerequisite)

The MCP Registry hosts metadata only. The actual package must be on npm first.

```powershell
# Step 1: Build the distribution
pnpm --filter @healthy-ai-code/mcp-server build

# Step 2: Authenticate to npm (if not already logged in)
npm login

# Step 3: Publish (first time)
pnpm --filter @healthy-ai-code/mcp-server publish --access public --no-git-checks

# Verify it is live:
npm info @healthy-ai-code/mcp-server
```

For subsequent version bumps:
```powershell
# Bump version in packages/mcp-server/package.json AND server.json (must match)
# Then re-publish:
pnpm --filter @healthy-ai-code/mcp-server publish --access public --no-git-checks
```

---

## Part 2 — Publish to the Official MCP Registry

### Step 2a — Install the mcp-publisher CLI (Windows)

```powershell
$arch = if ([System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture -eq "Arm64") { "arm64" } else { "amd64" }
Invoke-WebRequest -Uri "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_windows_$arch.tar.gz" -OutFile "mcp-publisher.tar.gz"
tar xf mcp-publisher.tar.gz mcp-publisher.exe
Remove-Item mcp-publisher.tar.gz
# Move mcp-publisher.exe to a directory on your PATH, for example:
Move-Item mcp-publisher.exe "$env:USERPROFILE\AppData\Local\Microsoft\WindowsApps\"
```

Verify installation:
```powershell
mcp-publisher --help
```

### Step 2b — Authenticate with GitHub

Run this from the repo root (`C:\dev\Healthy AI Code MCP`):

```powershell
mcp-publisher login github
```

You will see:
```
Logging in with github...
To authenticate, please:
1. Go to: https://github.com/login/device
2. Enter code: XXXX-XXXX
3. Authorize this application
```

Open the URL, enter the device code, and authorize. Return to the terminal — you should see:
```
Successfully authenticated!
Successfully logged in
```

The server name `io.github.screamm/healthy-ai-code-mcp` matches your GitHub username `screamm`, which satisfies the namespace requirement for GitHub-based authentication.

### Step 2c — Publish to the registry

```powershell
# From the repo root
mcp-publisher publish
```

Expected output:
```
Publishing to https://registry.modelcontextprotocol.io...
Successfully published
Server io.github.screamm/healthy-ai-code-mcp version 0.1.0
```

### Step 2d — Verify the listing

```powershell
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.screamm/healthy-ai-code-mcp"
```

The response JSON should contain `"name":"io.github.screamm/healthy-ai-code-mcp"`.

### Troubleshooting

| Error | Action |
|---|---|
| `Registry validation failed for package` | Confirm `packages/mcp-server/package.json` has `"mcpName": "io.github.screamm/healthy-ai-code-mcp"` and the npm package is published |
| `Invalid or expired Registry JWT token` | Re-authenticate: `mcp-publisher login github` |
| `You do not have permission to publish this server` | The GitHub account used must be `screamm`. The server name must start with `io.github.screamm/` |

---

## Part 3 — List on Smithery

### Step 3a — Submit via web UI

1. Go to **https://smithery.ai/new**
2. Paste the npm package invocation URL or GitHub repo URL:
   - Use: `https://github.com/screamm/healthy-ai-code-mcp`
3. Smithery will auto-scan the server card at `.well-known/mcp-server-card.json`.
   If auto-scan fails, it will fall back to the static card at:
   `/.well-known/mcp/server-card.json` — ensure both paths are served.
4. Complete the publishing flow (description, icon if desired, visibility).

### Step 3b — Alternatively, use the Smithery CLI

```powershell
# Install the Smithery CLI
npm install -g @smithery/cli

# Publish (stdio server via npm)
smithery mcp publish "npx -y @healthy-ai-code/mcp-server" -n screamm/healthy-ai-code-mcp
```

### Step 3c — Verification

After publishing, go to your server page on Smithery and click **Settings → Verification** to complete the official-vendor verification checklist.

---

## Part 4 — Automate future publishes with GitHub Actions (optional)

Create `.github/workflows/publish-registry.yml`:

```yaml
name: Publish to MCP Registry

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      - run: npm install -g pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @healthy-ai-code/mcp-server build
      - run: pnpm --filter @healthy-ai-code/mcp-server publish --access public --no-git-checks
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      - name: Install mcp-publisher
        run: |
          curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_linux_amd64.tar.gz" | tar xz mcp-publisher
          sudo mv mcp-publisher /usr/local/bin/
      - name: Publish to MCP Registry
        run: mcp-publisher publish
        env:
          MCP_REGISTRY_TOKEN: ${{ secrets.MCP_REGISTRY_TOKEN }}
```

Store your MCP Registry JWT as `MCP_REGISTRY_TOKEN` in GitHub Secrets
(obtain by running `mcp-publisher login github` locally and copying the token from `~/.mcp-publisher/credentials`).

---

## File inventory

| File | Purpose | Status |
|---|---|---|
| `server.json` | MCP Registry metadata (official schema 2025-12-11) | Ready |
| `.well-known/mcp-server-card.json` | Smithery/aggregator discovery card | Ready |
| `packages/mcp-server/package.json` | Contains `mcpName` for registry npm verification | Ready |

---

## Schema validation results (produced 2026-06-01)

> **Note:** These results were produced by actually running ajv@8 against the fetched schema.
> The previous version of this section contained a hand-written "VALID" block that no
> validator had produced; that has been replaced with this real output.
>
> Prior to this update, `server.json` had a `description` field of 253 characters, which
> exceeded the schema's `maxLength: 100` constraint. The description was shortened to 95
> characters and server.json now passes validation.

### server.json — validated against `https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`

Validator: **ajv@8** (`strict: false`, `allErrors: true`). Schema fetched live from
`https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`
(HTTP 200 on 2026-06-01).

```
name:                       PASS  (io.github.screamm/healthy-ai-code-mcp)
description:                PASS  (95 chars; schema maxLength: 100)
version:                    PASS  (0.1.0)
packages[0].registryType:   PASS  ("npm")
packages[0].identifier:     PASS  ("@healthy-ai-code/mcp-server")
packages[0].transport.type: PASS  ("stdio")

ajv result: VALID
```

Note: the schema does not define a JSON Schema for `uri` formats, so format validation
is advisory only (ajv emits "unknown format ignored" warnings for uri fields, which is
expected and does not affect the PASS result).

### .well-known/mcp-server-card.json

There is no official JSON Schema for the Smithery server-card format; structural
validation was done by inspection (node JSON.parse + field presence checks).

```
Syntactically valid JSON:  PASS
name present:              PASS  ("Healthy AI Code")
description present:       PASS  (385 chars — no schema constraint for this file)
version present:           PASS  (0.1.0)
transport present:         PASS  (["stdio"])
mcpName present:           PASS  (io.github.screamm/healthy-ai-code-mcp)
mcpName matches server.json: PASS
toolCount is integer (29): PASS
homepage present:          PASS  (URL string)
license present:           PASS  ("MIT")
keywords is array:         PASS  (22 items)
installation.npx present:  PASS

Structural check: PASS (no official schema; not ajv-validated)
```

---

## Tool discovery optimization — notes

Tool names follow the `code_health_*` prefix consistently (26 of 29 tools), with three exceptions:
`analyze_change_set`, `pre_commit_code_health_safeguard`, `get_config` / `set_config`, and the two
`explain_*` tools. This is intentional — `analyze_change_set` and `pre_commit_code_health_safeguard`
are action-oriented names that surface well in keyword searches. The `get_config`/`set_config` names
follow the standard configuration pattern recognized by MCP clients.

All 29 tool descriptions in `server.json` are written in English (overriding the Swedish source
strings in the TypeScript tool files), which maximizes discovery on the MCP Registry and Smithery.
