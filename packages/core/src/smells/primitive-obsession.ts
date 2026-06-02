import type { SyntaxNode } from 'tree-sitter';
import type { Smell } from '../types';
import type { LanguageProfile } from './language-profile';

const MIN_PRIMITIVE_PARAMS = 3;

export function detectPrimitiveObsession(root: SyntaxNode, profile: LanguageProfile): Smell[] {
  const smells: Smell[] = [];
  traverse(root, profile, smells);
  return smells;
}

function traverse(node: SyntaxNode, profile: LanguageProfile, acc: Smell[]): void {
  if (profile.methodNodeTypes.has(node.type)) {
    checkFunction(node, profile, acc);
  }
  for (const child of node.children) traverse(child, profile, acc);
}

function countPrimitiveParams(
  params: SyntaxNode,
  profile: LanguageProfile,
): { count: number; names: string[] } {
  let count = 0;
  const names: string[] = [];
  for (const param of params.namedChildren) {
    if (param.type === 'comment') continue;
    if (!profile.parameterNodeTypes.has(param.type)) continue;
    const paramName = param.text.split(':')[0].trim();
    if (profile.implicitParameters.has(paramName)) continue;
    const typeName = profile.extractParamTypeName(param);
    if (typeName && profile.primitiveTypeNames.has(typeName)) {
      count++;
      names.push(paramName);
    }
  }
  return { count, names };
}

function checkFunction(node: SyntaxNode, profile: LanguageProfile, acc: Smell[]): void {
  // Find the parameter list using profile-defined node types
  const params = node.namedChildren.find(c => profile.parameterListNodeTypes.has(c.type));
  if (!params) return;
  const { count, names } = countPrimitiveParams(params, profile);
  if (count < MIN_PRIMITIVE_PARAMS) return;
  const fnName = getFunctionName(node);
  acc.push({
    type: 'PrimitiveObsession',
    severity: count >= 5 ? 'high' : 'medium',
    line: node.startPosition.row + 1,
    functionName: fnName,
    description: `'${fnName}' takes ${count} primitive parameters (${names.join(', ')}) — missing a domain abstraction.`,
    suggestion: `Group the primitive parameters into a well-named domain object (e.g. interface ${capitalize(fnName)}Options) to improve type safety and readability.`,
  });
}

/**
 * Resolves the name of a function/method node.
 * For TypeScript arrow functions assigned to a variable (const f = () => {}),
 * the name lives on the parent variable_declarator node — this fallback is preserved.
 */
function getFunctionName(node: SyntaxNode): string {
  if (node.type === 'function_declaration' || node.type === 'method_definition') {
    return node.childForFieldName('name')?.text ?? '<anonymous>';
  }
  // Arrow functions and function expressions: name is on the parent declarator
  const parent = node.parent;
  if (parent?.type === 'variable_declarator') {
    return parent.childForFieldName('name')?.text ?? '<anonymous>';
  }
  // Generic fallback for other languages (Java method_declaration, Python function_definition, etc.)
  return node.childForFieldName('name')?.text ?? '<anonymous>';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
