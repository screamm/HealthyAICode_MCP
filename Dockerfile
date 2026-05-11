# Build stage — requires build toolchain for tree-sitter native addons
FROM node:22-bookworm-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace definition, lock file, and all package.json files
# (layer-cached until any of these change)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/mcp-server/package.json ./packages/mcp-server/

# Install dependencies (compiles tree-sitter native addons via node-gyp)
RUN pnpm install --frozen-lockfile

# Copy source and build TypeScript
COPY packages/core/ ./packages/core/
COPY packages/mcp-server/ ./packages/mcp-server/
RUN pnpm run build

# Runtime stage — slimmed image without build toolchain
FROM node:22-bookworm-slim AS runtime

# git is needed by simple-git (used in core for repo analysis)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace manifests (needed so Node can resolve workspace packages)
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/packages/mcp-server/package.json ./packages/mcp-server/

# Copy node_modules including compiled .node native addon files
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=builder /app/packages/mcp-server/node_modules ./packages/mcp-server/node_modules

# Copy compiled TypeScript output
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/mcp-server/dist ./packages/mcp-server/dist

# The MCP server communicates over stdio.
# Mount the codebase to analyse with -v, e.g.:
#   docker run -i -v /path/to/myproject:/workspace ghcr.io/you/healthy-ai-code-mcp
# Set REPO_PATH to override the default /workspace mount point.

ENV NODE_ENV=production

ENTRYPOINT ["node", "packages/mcp-server/dist/index.js"]
