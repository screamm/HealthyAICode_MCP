/**
 * A LanguageProfile maps generic AST concepts to tree-sitter node names
 * for a specific language. Used by all AST-based detectors so that the same
 * logic can run against Python, Java/Kotlin, and C#.
 */
export interface LanguageProfile {
  /** Class declarations (for God Class, Feature Envy, etc.) */
  classNodeTypes: Set<string>;
  /** Method and function declarations (for Cognitive Complexity, Primitive Obsession) */
  methodNodeTypes: Set<string>;
  /** Parameter list nodes (for Data Clumps, Primitive Obsession) */
  parameterListNodeTypes: Set<string>;
  /** Individual parameter nodes within a parameter list */
  parameterNodeTypes: Set<string>;
  /** Implicit parameter to exclude (self/cls/this) */
  implicitParameters: Set<string>;
  /** Member access Foo.bar (for Feature Envy, God Class, Message Chain) */
  memberAccessNodeType: string;
  /** Call expression foo() (for Message Chain) */
  callExpressionNodeType: string;
  /** Field name for "object" within member access — usually 'object' */
  memberObjectField: string;
  /** Binary expression (for Complex Conditional) */
  binaryExpressionNodeType: string;
  /** Field name for operator within binary expression — usually 'operator' */
  binaryOperatorField: string;
  /** Logical operators that count as "boolean chain" */
  logicalOperators: Set<string>;
  /** If/loop/switch/catch nodes for Cognitive Complexity nesting */
  controlFlowNodeTypes: Set<string>;
  /** Catch clauses (counted separately in SonarSource S3776) */
  catchNodeType: string;
  /** Primitive type names (for Primitive Obsession) */
  primitiveTypeNames: Set<string>;
  /** Identifies type annotation on a parameter; returns type text identifier or null. */
  extractParamTypeName: (param: import('tree-sitter').SyntaxNode) => string | null;
  /** Returns the class field/property name if the node is a named field, else null. */
  collectFieldName: (member: import('tree-sitter').SyntaxNode) => string | null;
  /** Returns the self-reference keyword — e.g. 'this', 'self'. */
  selfKeyword: string;
  /** Exportable symbols for doc-coverage (Python: top-level def/class; Java: public method; C#: public member) */
  exportableNodeTypes: Set<string>;
  /** Regex that matches the documentation comment above exportable nodes */
  docCommentPattern: RegExp;
  /** Field name for "function" in a call expression (TypeScript/Python/C#: 'function'; Java method_invocation: null — uses 'object' field recursion) */
  callFunctionField: string | null;
}

const pythonExtractParamType = (param: import('tree-sitter').SyntaxNode): string | null => {
  if (param.type !== 'typed_parameter' && param.type !== 'typed_default_parameter') return null;
  const typeNode = param.childForFieldName('type');
  return typeNode?.text ?? null;
};

const javaExtractParamType = (param: import('tree-sitter').SyntaxNode): string | null => {
  if (param.type !== 'formal_parameter') return null;
  const typeNode = param.childForFieldName('type');
  return typeNode?.text ?? null;
};

const csharpExtractParamType = (param: import('tree-sitter').SyntaxNode): string | null => {
  if (param.type !== 'parameter') return null;
  const typeNode = param.childForFieldName('type');
  return typeNode?.text ?? null;
};

const pythonCollectFieldName = (_member: import('tree-sitter').SyntaxNode): string | null => {
  // Python fields are assignments to self.x in __init__.
  // We return null here and fall back to regex-based self.NAME extraction in god-class-lcom4.
  return null;
};

const javaCollectFieldName = (member: import('tree-sitter').SyntaxNode): string | null => {
  if (member.type !== 'field_declaration') return null;
  const declarator = member.namedChildren.find(c => c.type === 'variable_declarator');
  return declarator?.childForFieldName('name')?.text ?? null;
};

const csharpCollectFieldName = (member: import('tree-sitter').SyntaxNode): string | null => {
  if (member.type !== 'field_declaration' && member.type !== 'property_declaration') return null;
  if (member.type === 'property_declaration') return member.childForFieldName('name')?.text ?? null;
  const varDecl = member.namedChildren.find(c => c.type === 'variable_declaration');
  const declarator = varDecl?.namedChildren.find(c => c.type === 'variable_declarator');
  return declarator?.childForFieldName('name')?.text ?? declarator?.namedChildren[0]?.text ?? null;
};

export const pythonProfile: LanguageProfile = {
  classNodeTypes: new Set(['class_definition']),
  methodNodeTypes: new Set(['function_definition']),
  parameterListNodeTypes: new Set(['parameters']),
  parameterNodeTypes: new Set([
    'identifier', 'typed_parameter', 'default_parameter',
    'typed_default_parameter', 'list_splat_pattern', 'dictionary_splat_pattern',
  ]),
  implicitParameters: new Set(['self', 'cls']),
  memberAccessNodeType: 'attribute',
  callExpressionNodeType: 'call',
  memberObjectField: 'object',
  binaryExpressionNodeType: 'boolean_operator',
  binaryOperatorField: 'operator',
  logicalOperators: new Set(['and', 'or']),
  controlFlowNodeTypes: new Set([
    'if_statement', 'elif_clause', 'for_statement', 'while_statement',
    'try_statement', 'with_statement', 'conditional_expression',
  ]),
  catchNodeType: 'except_clause',
  primitiveTypeNames: new Set(['int', 'float', 'str', 'bool', 'bytes']),
  extractParamTypeName: pythonExtractParamType,
  collectFieldName: pythonCollectFieldName,
  selfKeyword: 'self',
  exportableNodeTypes: new Set(['function_definition', 'class_definition']),
  docCommentPattern: /^\s*("""|''')/,
  callFunctionField: 'function',
};

export const javaProfile: LanguageProfile = {
  classNodeTypes: new Set(['class_declaration', 'interface_declaration', 'enum_declaration']),
  methodNodeTypes: new Set(['method_declaration', 'constructor_declaration']),
  parameterListNodeTypes: new Set(['formal_parameters']),
  parameterNodeTypes: new Set(['formal_parameter']),
  implicitParameters: new Set(),
  memberAccessNodeType: 'field_access',
  callExpressionNodeType: 'method_invocation',
  memberObjectField: 'object',
  binaryExpressionNodeType: 'binary_expression',
  binaryOperatorField: 'operator',
  logicalOperators: new Set(['&&', '||']),
  controlFlowNodeTypes: new Set([
    'if_statement', 'for_statement', 'enhanced_for_statement',
    'while_statement', 'do_statement', 'switch_expression',
    'ternary_expression',
  ]),
  catchNodeType: 'catch_clause',
  primitiveTypeNames: new Set(['int', 'long', 'short', 'byte', 'float', 'double', 'boolean', 'char', 'String']),
  extractParamTypeName: javaExtractParamType,
  collectFieldName: javaCollectFieldName,
  selfKeyword: 'this',
  exportableNodeTypes: new Set(['method_declaration', 'class_declaration', 'interface_declaration']),
  docCommentPattern: /\/\*\*[\s\S]*?\*\//,
  callFunctionField: null, // Java method_invocation uses object/name fields, not 'function'
};

export const csharpProfile: LanguageProfile = {
  classNodeTypes: new Set(['class_declaration', 'interface_declaration', 'record_declaration', 'struct_declaration']),
  methodNodeTypes: new Set(['method_declaration', 'constructor_declaration', 'local_function_statement']),
  parameterListNodeTypes: new Set(['parameter_list']),
  parameterNodeTypes: new Set(['parameter']),
  implicitParameters: new Set(),
  memberAccessNodeType: 'member_access_expression',
  callExpressionNodeType: 'invocation_expression',
  memberObjectField: 'expression',
  binaryExpressionNodeType: 'binary_expression',
  binaryOperatorField: 'operator',
  logicalOperators: new Set(['&&', '||']),  // removed '??' — null-coalescing is not a boolean chain operator per S3776
  controlFlowNodeTypes: new Set([
    'if_statement', 'for_statement', 'foreach_statement',
    'while_statement', 'do_statement', 'switch_statement',
    'conditional_expression',
  ]),
  catchNodeType: 'catch_clause',
  primitiveTypeNames: new Set(['int', 'long', 'short', 'byte', 'float', 'double', 'decimal', 'bool', 'char', 'string']),
  extractParamTypeName: csharpExtractParamType,
  collectFieldName: csharpCollectFieldName,
  selfKeyword: 'this',
  exportableNodeTypes: new Set(['method_declaration', 'class_declaration', 'property_declaration']),
  docCommentPattern: /\/\/\/\s*<summary>[\s\S]*?<\/summary>/,
  callFunctionField: 'expression', // C# invocation_expression uses 'expression' field for the callee
};

export const typescriptProfile: LanguageProfile = {
  classNodeTypes: new Set(['class_declaration', 'class']),
  methodNodeTypes: new Set(['method_definition', 'function_declaration', 'arrow_function', 'function_expression']),
  parameterListNodeTypes: new Set(['formal_parameters']),
  parameterNodeTypes: new Set(['required_parameter', 'optional_parameter']),
  implicitParameters: new Set(['this']),
  memberAccessNodeType: 'member_expression',
  callExpressionNodeType: 'call_expression',
  memberObjectField: 'object',
  binaryExpressionNodeType: 'binary_expression',
  binaryOperatorField: 'operator',
  logicalOperators: new Set(['&&', '||']),
  controlFlowNodeTypes: new Set(['if_statement', 'else_clause', 'for_statement', 'for_in_statement', 'while_statement', 'do_statement', 'switch_statement', 'try_statement']),
  catchNodeType: 'catch_clause',
  primitiveTypeNames: new Set(['string', 'number', 'boolean', 'any', 'unknown', 'never']),
  extractParamTypeName: (param) => {
    const ann = param.childForFieldName?.('type');
    if (!ann) return null;
    const typeNode = ann.namedChildren[0];
    return typeNode?.type === 'predefined_type' ? typeNode.text : null;
  },
  collectFieldName: (member) => {
    if (member.type === 'public_field_definition' || member.type === 'field_definition') {
      return member.childForFieldName?.('name')?.text ?? null;
    }
    return null;
  },
  selfKeyword: 'this',
  exportableNodeTypes: new Set(['export_statement']),
  docCommentPattern: /\/\*\*[\s\S]*?\*\//,
  callFunctionField: 'function',
};
