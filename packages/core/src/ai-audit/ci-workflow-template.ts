// packages/core/src/ai-audit/ci-workflow-template.ts

/**
 * GitHub Actions workflow YAML template for AI code quality check.
 * Copy the contents to .github/workflows/ai-code-quality.yml in your project.
 */
export const GITHUB_ACTIONS_WORKFLOW_TEMPLATE = `
name: AI Code Quality Check
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  ai-quality-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run AI code quality audit
        run: node scripts/ai-audit-ci.mjs --output-json /tmp/ai-audit-result.json

      - name: Comment PR with AI quality report
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const result = JSON.parse(fs.readFileSync('/tmp/ai-audit-result.json', 'utf8'));
            if (result.flagged_files.length === 0) return;
            const body = '## AI Code Quality Report\\n' +
              result.flagged_files.map(f => \`- \${f.path}: score \${f.score} (confidence: \${f.confidence})\`).join('\\n');
            await github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body,
            });
`.trim();
