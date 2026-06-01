#!/usr/bin/env node
/**
 * update-package-snapshots.mjs
 *
 * Refreshes the cached npm and PyPI package name snapshots used by
 * detectHallucinatedImports() in packages/core/src/analyzers/hallucinated-import.ts.
 *
 * Usage:
 *   node scripts/update-package-snapshots.mjs
 *   node scripts/update-package-snapshots.mjs --npm-only
 *   node scripts/update-package-snapshots.mjs --pypi-only
 *   node scripts/update-package-snapshots.mjs --limit=5000
 *
 * Sources:
 *   PyPI — https://hugovk.github.io/top-pypi-packages/top-pypi-packages-30-days.min.json
 *           Published by @hugovk; top 15 000 packages by 30-day downloads (ClickHouse / PyPI stats).
 *           Dataset is refreshed monthly. Falls back to PyPI Simple JSON API.
 *
 *   npm  — https://registry.npmjs.org/-/v1/search?text=<QUERY>&popularity=1.0&size=250
 *           Paged search queries ordered by popularity across multiple keyword categories.
 *           Multiple query buckets are merged, deduped, and capped at the configured limit.
 *           A curated supplement list of ~250 ubiquitous packages (react, lodash, express, etc.)
 *           is merged in to guarantee they are always present regardless of query ordering.
 *           The npm search API returns ~5 250 unique results per query (wraps around after that).
 *           Running with default limit=15000 collects ~10 000+ unique packages from 3-4 queries.
 *
 * Output format (each JSON file):
 * {
 *   "_format": "npm-package-snapshot" | "pypi-package-snapshot",
 *   "_description": "...",
 *   "_generatedAt": "ISO-8601 timestamp",
 *   "_source": "...",
 *   "packages": ["name1", "name2", ...]
 * }
 *
 * PyPI normalisation: names are lowercased and dashes/underscores/dots collapsed to "-"
 * (PEP 503). The detector applies the same normalisation on import names.
 *
 * npm matching: exact case-sensitive match (npm package names are already lowercase).
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, '..', 'packages', 'core', 'src', 'data');
const NPM_SNAPSHOT_PATH = join(DATA_DIR, 'npm-snapshot.json');
const PYPI_SNAPSHOT_PATH = join(DATA_DIR, 'pypi-snapshot.json');

// ─── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const npmOnly = args.includes('--npm-only');
const pypiOnly = args.includes('--pypi-only');
const limitArg = args.find((a) => a.startsWith('--limit='));
// Default: 10 000 npm packages, 15 000 PyPI packages (capped by source size)
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 15_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'healthy-ai-code-mcp/snapshot-updater (https://github.com/screamm/healthy-ai-code-mcp)',
    },
    ...options,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchText(url, options = {}) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'healthy-ai-code-mcp/snapshot-updater (https://github.com/screamm/healthy-ai-code-mcp)',
    },
    ...options,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function writeSnapshot(filePath, format, source, packages) {
  mkdirSync(dirname(filePath), { recursive: true });
  const snapshot = {
    _format: format,
    _description:
      format === 'npm-package-snapshot'
        ? 'Real npm package names (top by download popularity) for HallucinatedPackageImport detection. Refresh: node scripts/update-package-snapshots.mjs --npm-only'
        : 'Real PyPI package names (top by 30-day downloads) for HallucinatedPackageImport detection. Refresh: node scripts/update-package-snapshots.mjs --pypi-only',
    _generatedAt: new Date().toISOString(),
    _source: source,
    packages,
  };
  writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
  console.log(`  Written ${packages.length.toLocaleString()} packages → ${filePath}`);
}

/** Sleep ms milliseconds. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── PyPI updater ─────────────────────────────────────────────────────────────

/**
 * Fetch top PyPI packages by 30-day downloads.
 *
 * Primary source: hugovk/top-pypi-packages dataset (JSON, ~700 KB compressed).
 *   URL: https://hugovk.github.io/top-pypi-packages/top-pypi-packages-30-days.min.json
 *   Format: { rows: [{ project: "name", download_count: N }, ...] }
 *   Contains top 15 000 packages, pre-sorted by download count descending.
 *
 * Fallback: PyPI Simple JSON API (all packages, no download ranking).
 *
 * All names are PEP-503 normalised (lowercase, [-_.] → "-") so the detector
 * can do a fast Set.has() lookup with the same normalisation applied to imports.
 */
async function fetchPypiPackages(limit) {
  console.log(`\nFetching PyPI packages (target: ${limit.toLocaleString()})…`);

  // Primary: hugovk top-pypi-packages dataset
  const TOP_PYPI_URL =
    'https://hugovk.github.io/top-pypi-packages/top-pypi-packages-30-days.min.json';
  try {
    console.log(`  Trying hugovk top-pypi-packages dataset…`);
    const data = await fetchJson(TOP_PYPI_URL);
    if (Array.isArray(data?.rows) && data.rows.length > 0) {
      const raw = data.rows
        .map((r) => r?.project ?? '')
        .filter((n) => n.length > 0);
      // PEP 503 normalisation
      const normalised = raw.map((n) => n.toLowerCase().replace(/[-_.]+/g, '-'));
      const unique = [...new Set(normalised)].slice(0, limit);
      console.log(`  Got ${unique.length.toLocaleString()} packages (from ${raw.length.toLocaleString()} raw entries)`);
      return {
        packages: unique,
        source: `hugovk/top-pypi-packages (30-day downloads, ClickHouse/PyPI stats) — ${unique.length.toLocaleString()} packages. URL: ${TOP_PYPI_URL}`,
      };
    }
  } catch (err) {
    console.warn(`  hugovk dataset failed: ${err.message}. Falling back to PyPI Simple API.`);
  }

  // Fallback: PyPI Simple JSON API (returns ALL package names, no popularity sort)
  const SIMPLE_URL = 'https://pypi.org/simple/';
  try {
    console.log('  Trying PyPI Simple JSON API…');
    const res = await fetch(SIMPLE_URL, {
      headers: {
        'Accept': 'application/vnd.pypi.simple.v1+json',
        'User-Agent': 'healthy-ai-code-mcp/snapshot-updater',
      },
    });
    if (res.ok) {
      const data = await res.json();
      const projects = data?.projects ?? [];
      const normalised = projects
        .map((p) => (p?.name ?? '').toLowerCase().replace(/[-_.]+/g, '-'))
        .filter((n) => n.length > 0)
        .slice(0, limit);
      const unique = [...new Set(normalised)];
      console.log(`  Got ${unique.length.toLocaleString()} packages from PyPI Simple JSON API`);
      return {
        packages: unique,
        source: `PyPI Simple JSON API (all packages, no popularity sort) — ${unique.length.toLocaleString()} packages`,
      };
    }
  } catch (err) {
    console.warn(`  PyPI Simple JSON API failed: ${err.message}. Falling back to HTML index.`);
  }

  // Last resort: scrape the HTML Simple index
  console.log('  Fetching PyPI Simple HTML index…');
  const html = await fetchText(SIMPLE_URL);
  const HREF_RE = /href=["']\/simple\/([^/"']+)\//g;
  const names = new Set();
  let m;
  while ((m = HREF_RE.exec(html)) !== null) {
    const norm = m[1].toLowerCase().replace(/[-_.]+/g, '-');
    names.add(norm);
    if (names.size >= limit) break;
  }
  const unique = [...names];
  console.log(`  Got ${unique.length.toLocaleString()} packages from PyPI HTML index`);
  return {
    packages: unique,
    source: `PyPI Simple HTML index — ${unique.length.toLocaleString()} packages`,
  };
}

// ─── npm updater ──────────────────────────────────────────────────────────────

/**
 * Fetch top npm packages by popularity using the registry search API.
 *
 * Source: https://registry.npmjs.org/-/v1/search
 *   Sorted by popularity score (download-count weighted). Each query returns up
 *   to 250 packages per page and can be paginated with ?from=N.
 *
 * Strategy: Run multiple keyword search queries that cover broad areas of the npm
 * ecosystem. The search API sorts by popularity, so the first pages from each
 * query yield the most-downloaded packages in that category. Results are merged
 * and deduplicated to maximise coverage.
 *
 * Query buckets (each yields up to ~5 250 unique packages sorted by popularity;
 * the npm search index wraps around after that offset):
 *   - keywords:typescript  (124 000+ packages)
 *   - keywords:react       (top React ecosystem)
 *   - keywords:node        (36 000+ packages)
 *   - keywords:javascript  (57 000+ packages)
 *
 * The npm search API rate-limits at ~10 requests per few seconds (HTTP 429).
 * The fetch loop uses 1.5 s delay per page and exponential back-off on 429.
 *
 * A curated supplement (~250 packages) is merged in at the end to ensure that
 * ubiquitous packages like react, lodash, express always appear in the snapshot
 * even if rate limiting prevents reaching them via keyword search.
 *
 * npm package names are lowercased by npm policy, so no normalisation is needed.
 */

/**
 * Curated supplement: well-known popular npm packages that must always be in the snapshot.
 * All names are verified real npm package names as of 2026.
 */
const NPM_SUPPLEMENT = [
  'lodash', 'underscore', 'moment', 'date-fns', 'luxon', 'dayjs',
  'uuid', 'nanoid', 'cuid',
  'axios', 'node-fetch', 'got', 'superagent', 'request', 'ky',
  'express', 'koa', 'fastify', 'hapi', 'restify', 'connect',
  'webpack', 'rollup', 'parcel', 'esbuild', 'vite', 'snowpack',
  'babel', '@babel/core', '@babel/preset-env', '@babel/preset-react',
  'typescript', 'ts-node', 'tsup', 'tslib',
  'eslint', 'prettier', 'tslint', 'jshint',
  'jest', 'mocha', 'chai', 'sinon', 'jasmine', 'karma', 'ava',
  'react', 'react-dom', 'react-router', 'react-router-dom',
  'redux', 'react-redux', 'mobx', 'zustand', 'recoil', 'jotai',
  'vue', 'vue-router', 'vuex', 'pinia', 'nuxt',
  'angular', '@angular/core', '@angular/common', '@angular/forms',
  'svelte', '@sveltejs/kit',
  'next', 'gatsby', 'remix', 'astro',
  'graphql', 'apollo-client', '@apollo/client', 'urql',
  'openai', '@anthropic-ai/sdk', 'langchain', '@langchain/core',
  'grunt', 'gulp', 'turbo',
  'supertest', 'enzyme', '@testing-library/react', '@testing-library/dom',
  'playwright', '@playwright/test', 'puppeteer', 'cypress',
  'nock', 'msw', '@testing-library/jest-dom',
  'fs-extra', 'mkdirp', 'rimraf', 'del', 'glob', 'minimatch', 'micromatch',
  'chalk', 'colors', 'ansi-colors', 'kleur', 'picocolors',
  'commander', 'yargs', 'minimist', 'meow', 'arg',
  'inquirer', 'prompts', 'enquirer', 'ora',
  'dotenv', 'dotenv-expand', 'cross-env',
  'nodemon', 'concurrently', 'npm-run-all',
  'debug', 'winston', 'pino', 'bunyan', 'morgan', 'log4js',
  'semver',
  'async', 'bluebird', 'p-limit', 'p-queue', 'p-map',
  'bcrypt', 'bcryptjs', 'argon2', 'crypto-js',
  'jsonwebtoken', 'passport', 'passport-jwt', 'passport-local',
  'cors', 'helmet', 'express-rate-limit',
  'mongoose', 'sequelize', 'typeorm', 'prisma', '@prisma/client',
  'knex', 'objection',
  'mongodb', 'pg', 'mysql', 'mysql2', 'sqlite3', 'better-sqlite3',
  'redis', 'ioredis',
  'body-parser', 'multer', 'formidable', 'busboy',
  'compression', 'joi', 'yup', 'zod',
  'socket.io', 'ws',
  'aws-sdk', '@aws-sdk/client-s3', '@aws-sdk/client-sqs',
  'firebase', 'firebase-admin',
  'sharp', 'jimp',
  'pdfkit', 'pdf-lib', 'pdf-parse',
  'xlsx', 'exceljs',
  'csv-parser', 'csv-stringify', 'papaparse',
  'archiver', 'unzipper',
  'tailwindcss', 'postcss', 'autoprefixer',
  'bootstrap', 'bulma',
  'styled-components', '@emotion/react', '@emotion/styled',
  '@mui/material', '@mui/icons-material', '@material-ui/core',
  'antd', '@chakra-ui/react',
  'ramda', 'immutable', 'immer',
  'marked', 'markdown-it', 'remark', 'rehype',
  'gray-matter', 'js-yaml', 'yaml',
  'classnames', 'clsx',
  'ms', 'bytes',
  'cheerio', 'jsdom', 'htmlparser2', 'parse5',
  'nodemailer', 'node-cron',
  'i18next', 'react-i18next',
  'lru-cache', 'node-cache',
  'tar', 'adm-zip',
  'shelljs', 'execa', 'cross-spawn',
  'pm2', 'forever',
  'http-proxy', 'http-proxy-middleware',
  'express-session', 'connect-redis',
  'lerna', 'nx',
  'changesets', '@changesets/cli',
  'webpack-cli', 'webpack-dev-server', 'webpack-merge',
  'html-webpack-plugin', 'css-loader', 'style-loader', 'babel-loader',
  'react-query', '@tanstack/react-query', 'react-hook-form',
  'formik',
  'framer-motion',
  'react-window', '@tanstack/react-virtual',
  'react-dnd', 'react-beautiful-dnd',
  'react-select', '@tanstack/react-table',
  'react-toastify', 'react-hot-toast',
  'react-icons', '@heroicons/react', '@fortawesome/fontawesome-svg-core',
  'react-dropzone',
  'vuetify', 'quasar', 'vee-validate',
  '@storybook/react', '@storybook/vue', '@storybook/addon-actions',
  '@reduxjs/toolkit', 'redux-saga', 'redux-thunk',
  'json-server', 'faker', '@faker-js/faker', 'chance',
  'source-map-support',
  'fast-glob', 'chokidar',
  'get-port',
  'fast-deep-equal',
  'camelcase', 'change-case',
  'prom-client', '@opentelemetry/api',
  'socket.io-client',
  'express-validator',
  'mongoose-paginate-v2',
];

async function fetchNpmPackages(limit) {
  console.log(`\nFetching npm packages (target: ${limit.toLocaleString()})…`);

  // Queries ordered by breadth (more packages first).
  // Each query yields up to ~5 250 unique packages from the npm search index.
  const QUERIES = [
    'keywords:typescript',
    'keywords:react',
    'keywords:node',
    'keywords:javascript',
    'keywords:cli',
    'keywords:utility',
    'keywords:testing',
    'keywords:css',
    'keywords:plugin',
  ];

  const PAGE_SIZE = 250;
  // Each npm search query wraps around after ~5 250 unique results (21 pages).
  const MAX_OFFSET = 5250;
  // 1.5 s between requests avoids hitting the ~10 req/burst rate limit.
  const DELAY_MS = 1500;
  // Retry on 429 with exponential back-off.
  const MAX_RETRIES = 5;

  const packages = new Set();
  let totalRequests = 0;

  async function fetchPage(query, from) {
    const url =
      `https://registry.npmjs.org/-/v1/search` +
      `?text=${encodeURIComponent(query)}` +
      `&size=${PAGE_SIZE}&from=${from}` +
      `&quality=0&popularity=1.0&maintenance=0`;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'healthy-ai-code-mcp/snapshot-updater',
          },
        });
        if (res.status === 429) {
          const wait = (attempt + 1) * 3000;
          console.warn(`\n  429 rate limit (query="${query}", from=${from}) — waiting ${wait / 1000}s`);
          await sleep(wait);
          continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        if (attempt === MAX_RETRIES - 1) throw err;
        await sleep(2000);
      }
    }
    throw new Error(`Failed after ${MAX_RETRIES} attempts`);
  }

  for (const query of QUERIES) {
    if (packages.size >= limit) break;

    const startSize = packages.size;
    let page = 0;

    while (page * PAGE_SIZE < MAX_OFFSET && packages.size < limit) {
      const from = page * PAGE_SIZE;
      try {
        const data = await fetchPage(query, from);
        const objects = data?.objects ?? [];
        if (objects.length === 0) break;

        let newInPage = 0;
        for (const obj of objects) {
          const name = obj?.package?.name;
          if (typeof name === 'string' && name.length > 0 && !packages.has(name)) {
            packages.add(name);
            newInPage++;
          }
        }

        page++;
        totalRequests++;

        if (totalRequests % 5 === 0) {
          process.stdout.write(`  … ${packages.size.toLocaleString()} packages\r`);
        }

        // If loop detects the search index is repeating (< 5 new on page > 5), stop early.
        if (page > 5 && newInPage < 5) {
          console.log(`\n  [${query}] Index repeating at page ${page} — stopping.`);
          break;
        }

        await sleep(DELAY_MS);
      } catch (err) {
        console.warn(`\n  npm search error (query="${query}", from=${from}): ${err.message}`);
        break;
      }
    }

    console.log(
      `  Query "${query}" → ${(packages.size - startSize).toLocaleString()} new` +
      ` (${packages.size.toLocaleString()} total, ${page} pages)`,
    );
  }

  // Merge in curated supplement to guarantee ubiquitous packages are present.
  let supplementAdded = 0;
  for (const pkg of NPM_SUPPLEMENT) {
    if (!packages.has(pkg)) {
      packages.add(pkg);
      supplementAdded++;
    }
  }
  if (supplementAdded > 0) {
    console.log(`  Merged ${supplementAdded} packages from curated supplement list.`);
  }

  const result = [...packages].slice(0, limit);
  console.log(`  Collected ${result.length.toLocaleString()} npm packages (${totalRequests} API requests)`);
  return {
    packages: result,
    source:
      `npm registry /-/v1/search (popularity-sorted, multiple keyword queries) + curated supplement — ` +
      `${result.length.toLocaleString()} packages`,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== update-package-snapshots.mjs ===');
  console.log(`Data directory: ${DATA_DIR}`);
  mkdirSync(DATA_DIR, { recursive: true });

  const doNpm = !pypiOnly;
  const doPypi = !npmOnly;

  if (doPypi) {
    try {
      const { packages, source } = await fetchPypiPackages(LIMIT);
      writeSnapshot(PYPI_SNAPSHOT_PATH, 'pypi-package-snapshot', source, packages);
    } catch (err) {
      console.error(`\nPyPI snapshot update failed: ${err.message}`);
      process.exit(1);
    }
  }

  if (doNpm) {
    try {
      const { packages, source } = await fetchNpmPackages(LIMIT);
      writeSnapshot(NPM_SNAPSHOT_PATH, 'npm-package-snapshot', source, packages);
    } catch (err) {
      console.error(`\nnpm snapshot update failed: ${err.message}`);
      process.exit(1);
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
