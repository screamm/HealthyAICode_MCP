/**
 * Fixture: unhealthy plugin that always returns a ComplexMethod smell.
 * Used to verify that plugin smells affect scoring and are properly returned.
 */

import type { BiomarkerPlugin } from '../../../src/plugins/biomarker-plugin';
import type { Language, Smell } from '../../../src/types';

export const examplePluginUnhealthy: BiomarkerPlugin = {
  name: 'example-plugin-unhealthy',
  version: '1.0.0',
  metadata: {
    supportedLanguages: 'all',
    smellWeights: {},
    description: 'Test fixture: always returns a ComplexMethod smell (weight 1.5 in core)',
    author: 'Healthy AI Code Test Suite',
    license: 'MIT',
  },
  detect(_code: string, _language: Language, _filePath?: string): Smell[] {
    return [
      {
        type: 'ComplexMethod',
        severity: 'high',
        functionName: 'fixtureMethod',
        line: 1,
        description: 'ComplexMethod — fixture smell for testing plugin scoring impact',
        suggestion: 'Refactor to reduce cyclomatic complexity below 10.',
        metricValue: 20,
      },
    ];
  },
};
