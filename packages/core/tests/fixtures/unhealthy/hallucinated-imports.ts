/**
 * unhealthy/hallucinated-imports.ts
 *
 * Fixture for HallucinatedPackageImport detection.
 * Contains one real npm package (openai) and one obviously-fake package (xyzzy-not-a-real-package-abc123).
 * Used in packages/core/tests/analyzers/hallucinated-import.test.ts.
 */

// Real package — should NOT trigger HallucinatedPackageImport
import OpenAI from 'openai';

// Fake package — should trigger HallucinatedPackageImport
import { something } from 'xyzzy-not-a-real-package-abc123';

export function callFakePackage() {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  // @ts-ignore — something is from the fake package
  return something(client);
}
