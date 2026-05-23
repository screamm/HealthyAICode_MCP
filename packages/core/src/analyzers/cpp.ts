import { analyzeGenericTierB } from './generic-tier-b';
import type { TierBConfig } from './generic-tier-b';

const CPP_CONFIG: TierBConfig = {
  language: 'cpp',
  functionPatterns: [
    // C++ function / method definition: return_type name(
    // Handles templates, const qualifiers, scoped names (Foo::bar)
    /^\s*(?:(?:static|virtual|inline|explicit|constexpr|const|override|auto)\s+)*[\w:<>*&]+\s+(?:\w+::)*(\w+)\s*\([^)]*\)\s*(?:const\s*)?(?:override\s*)?(?:noexcept\s*)?\{?/,
  ],
  // C++ control flow keywords
  controlFlowKeywords: /\b(if|else\s+if|while|for|do|switch|case|catch|throw|goto)\b/g,
  commentPrefix: '//',
};

/**
 * Tier B C++ analyzer.
 * Extracts function definitions and cyclomatic complexity via regex.
 * No AST parsing — faster but less precise than Tier A.
 */
export function analyzeCpp(code: string, filePath = '<inline>') {
  return analyzeGenericTierB(code, filePath, CPP_CONFIG);
}
