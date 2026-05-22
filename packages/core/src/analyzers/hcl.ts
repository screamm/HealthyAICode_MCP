import { analyzeStructuralTierC } from './structural-tier-c';

/**
 * Tier C Terraform HCL analyzer.
 * Returns file-level structural metrics: totalLines, LargeFile smell, SATD.
 * HCL supports # and // line comments, so SATD detection applies.
 */
export function analyzeHcl(code: string, filePath = '<inline>') {
  return analyzeStructuralTierC(code, filePath);
}
