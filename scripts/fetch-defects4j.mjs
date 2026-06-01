#!/usr/bin/env node
/**
 * fetch-defects4j.mjs
 *
 * Fetches real buggy/fixed Java source file pairs from Defects4J projects
 * via the Apache GitHub mirrors. Produces benchmark-data/defects4j/defects4j-labeled.json
 * in the Defects4JEntry[] format expected by loadDefects4JFromJson().
 *
 * Projects used:
 *   - Lang   (apache/commons-lang, git SHAs)
 *   - Math   (apache/commons-math, git SHAs)
 *
 * Usage: node scripts/fetch-defects4j.mjs
 */

import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'benchmark-data', 'defects4j');
const OUT_FILE = join(OUT_DIR, 'defects4j-labeled.json');

// Defects4J commit databases (from rjust/defects4j framework/projects/<P>/commit-db)
// Format: [bugId, buggyCommit, fixedCommit]
const LANG_COMMITS = [
  [1, '396afc3e4693cfee182efe582455f2d97058c068', 'd1a45e9738de5b3e299bb51e987565dcce55fee6'],
  [3, '64cfee77e333d0c31a0fde0abe6dac3d97b0f078', '8a1042959df80c06dbfa83896594caa8e20ff9d6'],
  [4, 'cd91a4f2cd0ced1178e8fd1f49229196eb88094c', '0cdc976684efcf478397b68c1d54cefc87bb92c9'],
  [5, 'bc255ccf5c239666ab54e5a31720d3f482ae78eb', '4d46f014fb8ee44386feb5fec52509f35d0e36ea'],
  [6, 'f5a83bb90cf7b318ac72823e6b99d01d060abe41', '52bcd9b8e82d4d1d287b0d75df1e161aff8c65ab'],
  [7, 'a7b467a74cbe1160d676dc070a19d19764e132a3', '350cf8c2da08ccde6b4d71b19bb3df97256ea368'],
  [8, 'cfab1e4fa19755d65de7b81206d86f9e98622d8e', '04babff3798680e012646988841bcc710a9e3c54'],
  [9, 'ad72b9f2bf37bd61af18bde67c1622d90a5d8766', '65a6458eaa2e1f88278e4bb5753a68bd825e3a80'],
  [10, '192b1e1b6b96da05cb000b2c89b71467cbfaf245', 'ad72b9f2bf37bd61af18bde67c1622d90a5d8766'],
  [11, '27bcbcc728434ffb2c45e81c0e75e6a3d6da3441', '4a65cb8da23d6667ac6f91775309b4da9b315d95'],
  [12, '1971d3ed8ba303eccc83935e352758ceca9f34d7', '27bcbcc728434ffb2c45e81c0e75e6a3d6da3441'],
  [13, '81797ed4402a982f90bd903c7437aeea4e3933f5', 'e9429c05e1a4797383fb405928088d2f8563ff97'],
  [14, 'a31570673477b8d8f4f0f2429002ec219e83369f', 'dfa6882a3b9ae6d17c386312ad5e5902d852fb4e'],
  [15, 'e6a1d017b1aeca6986c5e8486c9f8ce6360872d4', 'c71d0f03dab384f98ef2c0ba0050822fba22a063'],
  [16, 'c98fbe27b2822e669461a061ee916e7ce5bf188f', '41326bf5266ecc6472bab28481b77cecd6f7fb5c'],
  [17, '8a3e8603455c6dbfc595ab7a7e4a32f171a8b245', '2c1b5be146585dc8b27aedebca959f92da19094e'],
  [18, 'c023bfb593d32144f4511079dada681e2e8142d2', '34a6449c90a3b6074111a6bcbd31ad00ac1570f3'],
  [19, '23a71e792bf4ff7263d196047c2f378e888ce04f', '8914d7f617f78aae8c85405856283c98d4e43990'],
  [20, 'f5cb67acd964ee173967081205eb30c43ba585c3', 'a80f11cf9d02d2517c7f230f24949cbebaafc0c2'],
  [21, 'a655a3fafbc535b09fa0596635d2c87cf48c428e', '3e5d5dc9c0a5047152eedb802bc008ce78b8de0c'],
  [22, '7e8d044b7b8c6d2786a88f416d17eed2f472445c', '2270d830fda743de1ce8a61e33b9542cb39a0f4b'],
  [23, '66e42dc8b43d37ff011de69586f8e6764c4b3164', '249788d799ca1c3964062bdc5c19a51ecc05c2f7'],
  [24, '7df70a8c6b14452767ac932a14640e32a1dc16da', '8e2f4ddb9a1ecd7a1bf7d752c2c891d630287036'],
  [25, '44dbf85b6a7156d550ba62210412015058336281', 'dd5f8ea30755268dc43bbf2cd5024412674eb1b0'],
];

const MATH_COMMITS = [
  [1, 'd7fd760eb8c5ba8dc7bc30fd565575f2547e0c86', '86545dab3ed57872ad98b23e46924d67ddad03fc'],
  [2, '6d66a863b5c0049926330ef217accba4e022a1db', 'f1467e45ab538789090f968f549f88bd0b8c26c7'],
  [3, '7cdc540aa6dd90cc4479ce44d033f492637cfcf7', '91d280b7300b0f601cd76a880c26784a822f96b8'],
  [4, '0ee817712b9e8330fdfd6985752aa8f1b25ba9d9', 'd270055e874148a2742604be36ab977eec030fba'],
  [5, '8c2199df0f613c63bd362303c953cee66712d56c', '724795b5513651e1e34fae3904d1b58229ce9c17'],
  [6, '4e4e8fad43b1b105395d56d9bae98297d3fefdb1', 'f83bbc1d68bd457dfccd370afb248126ce031eb6'],
  [7, 'd18a6b851035818e38637a7b2f60e6f5c6367480', '424cbd201ca5969181d68cff99d8b9b77a41cefe'],
  [8, 'f00bd95151792341002bf4e987f403f0124bb323', '0d057fc6dc9fac9e16c01e3647c2201281310a6a'],
  [9, '43a6f15a1af977d6bf950dca17ab248e72ad8e95', '73605560b9f0205ac641ec602145756305a41f79'],
  [10, '2edd83f5f5009f3ceba55f45d17b351effe65414', '48dde3784e22e6cf886521e7ae17a327a461688e'],
  [11, 'fea4dd914bebc7eb4f2b4ec8086f4241a9bd28e6', 'cedf0d27f9e9341a9e9fa8a192735a0c2e11be40'],
  [12, '42673df5b72ca93fa4dbac6fdb0dec19e0ed6992', '185e3033ef43527a729c9dda5d57ed0537921a27'],
  [13, 'b07ecae3d60c4f0233f1a1d97eb35d4a678f39aa', '2836a6f9efcd30effe2f1125d47c38f62f96ed09'],
  [14, 'ace42058d67a52fb362543c5cf5aca64cf8de3e8', 'b07ecae3d60c4f0233f1a1d97eb35d4a678f39aa'],
  [15, '4673043763616457113c70219e1950818ced847b', '6844aba987aaf32c85a4eb3fba3f6ccf9d7c8db6'],
];

/** Convert a fully-qualified Java class name to a source file path */
function classToPath(className) {
  return 'src/main/java/' + className.replaceAll('.', '/') + '.java';
}

/** Fetch raw text from a URL, returning null on failure */
async function fetchRaw(url) {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

/** Fetch modified class names for a given project+bugId from Defects4J metadata */
async function fetchModifiedClasses(project, bugId) {
  const url = `https://raw.githubusercontent.com/rjust/defects4j/master/framework/projects/${project}/modified_classes/${bugId}.src`;
  const text = await fetchRaw(url);
  if (!text) return [];
  return text.trim().split('\n').map(s => s.trim()).filter(Boolean);
}

/** Fetch a Java source file from a GitHub raw URL */
async function fetchJavaSource(repo, commit, filePath) {
  const url = `https://raw.githubusercontent.com/${repo}/${commit}/${filePath}`;
  return await fetchRaw(url);
}

/** Process all bugs for a project */
async function processProject(project, repo, commits) {
  const entries = [];
  let fetched = 0;
  let skipped = 0;

  for (const [bugId, buggyCommit, fixedCommit] of commits) {
    const classes = await fetchModifiedClasses(project, bugId);
    if (classes.length === 0) {
      console.log(`  [SKIP] ${project} bug ${bugId}: no modified_classes`);
      skipped++;
      continue;
    }

    for (const className of classes) {
      const filePath = classToPath(className);
      const [buggyCode, fixedCode] = await Promise.all([
        fetchJavaSource(repo, buggyCommit, filePath),
        fetchJavaSource(repo, fixedCommit, filePath),
      ]);

      if (!buggyCode && !fixedCode) {
        // Try alternate source root (some older versions use src/java/)
        const altPath = 'src/java/' + className.replaceAll('.', '/') + '.java';
        const [altBuggy, altFixed] = await Promise.all([
          fetchJavaSource(repo, buggyCommit, altPath),
          fetchJavaSource(repo, fixedCommit, altPath),
        ]);
        if (altBuggy || altFixed) {
          entries.push({
            project,
            bugId: String(bugId),
            className,
            buggyCode: altBuggy || '',
            fixedCode: altFixed || '',
          });
          fetched++;
          console.log(`  [OK] ${project} bug ${bugId}: ${className} (alt path, buggy=${!!altBuggy}, fixed=${!!altFixed})`);
          continue;
        }
        console.log(`  [SKIP] ${project} bug ${bugId}: ${className} — not found at either path`);
        skipped++;
        continue;
      }

      entries.push({
        project,
        bugId: String(bugId),
        className,
        buggyCode: buggyCode || '',
        fixedCode: fixedCode || '',
      });
      fetched++;
      console.log(`  [OK] ${project} bug ${bugId}: ${className} (${(buggyCode||'').length}/${(fixedCode||'').length} chars)`);
    }
  }

  console.log(`  => ${project}: ${fetched} file pairs fetched, ${skipped} skipped`);
  return entries;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log('Fetching Lang bugs...');
  const langEntries = await processProject('Lang', 'apache/commons-lang', LANG_COMMITS);

  console.log('\nFetching Math bugs...');
  const mathEntries = await processProject('Math', 'apache/commons-math', MATH_COMMITS);

  const allEntries = [...langEntries, ...mathEntries];

  // Summary
  const buggyCount = allEntries.length;    // Each entry produces 1 buggy + 1 fixed record
  const cleanCount = allEntries.length;
  const langCount = langEntries.length;
  const mathCount = mathEntries.length;

  console.log('\n========================================');
  console.log(`SUMMARY`);
  console.log(`  Total Defects4JEntry items: ${allEntries.length}`);
  console.log(`  -> Will produce ${buggyCount} buggy records + ${cleanCount} clean records = ${buggyCount + cleanCount} BugRecord total`);
  console.log(`  Lang entries: ${langCount}`);
  console.log(`  Math entries: ${mathCount}`);
  console.log(`  Output: ${OUT_FILE}`);
  console.log('========================================\n');

  await writeFile(OUT_FILE, JSON.stringify(allEntries, null, 2), 'utf-8');
  console.log(`Written: ${OUT_FILE}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
