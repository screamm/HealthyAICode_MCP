/**
 * Fixture: healthy plugin that always returns empty smell list.
 * Used to verify zero-overhead path when plugins find no issues.
 */

import type { BiomarkerPlugin } from '../../../src/plugins/biomarker-plugin';
import type { Language, Smell } from '../../../src/types';

export const examplePluginHealthy: BiomarkerPlugin = {
  name: 'example-plugin-healthy',
  version: '1.0.0',
  metadata: {
    supportedLanguages: 'all',
    smellWeights: {},
    description: 'Test fixture: always returns no smells (healthy code path)',
    author: 'Healthy AI Code Test Suite',
    license: 'MIT',
  },
  detect(_code: string, _language: Language, _filePath?: string): Smell[] {
    return [];
  },
};
