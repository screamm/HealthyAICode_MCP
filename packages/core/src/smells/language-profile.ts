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
  /**
   * When true, documentation comments are line-based (e.g. `#`, `//`, `///`)
   * rather than block-based (`/** … *\/`).
   * The doc-coverage detector uses this to avoid requiring a `*\/` closing marker
   * and instead looks for any matching line immediately above the exported symbol.
   */
  docCommentIsLineStyle: boolean;
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

/** Language profile for Python — class_definition + function_definition with triple-quote docstrings. */
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
  docCommentIsLineStyle: false, // Python uses triple-quote block docstrings
  callFunctionField: 'function',
};

/** Language profile for Java — class_declaration + method_declaration with Javadoc block comments. */
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
  docCommentIsLineStyle: false, // Java uses /** ... */ block comments
  callFunctionField: null, // Java method_invocation uses object/name fields, not 'function'
};

/** Language profile for C# — class_declaration + method_declaration with XML doc comments (///). */
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
  docCommentIsLineStyle: false, // C# XML doc uses /// but is matched as a block via multiline regex
  callFunctionField: 'expression', // C# invocation_expression uses 'expression' field for the callee
};

/** Language profile for TypeScript/JavaScript — class + method_definition with JSDoc block comments. */
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
  docCommentIsLineStyle: false, // TypeScript/JavaScript uses /** ... */ JSDoc
  callFunctionField: 'function',
};

// ---------------------------------------------------------------------------
// Go — struct+method pattern; selector_expression for member access.
/** Language profile for Go — type_declaration + function_declaration with plain // doc comments. */
export const goProfile: LanguageProfile = {
  classNodeTypes: new Set(['type_declaration']),
  methodNodeTypes: new Set(['method_declaration', 'function_declaration', 'func_literal']),
  parameterListNodeTypes: new Set(['parameter_list']),
  parameterNodeTypes: new Set(['parameter_declaration', 'variadic_parameter_declaration']),
  implicitParameters: new Set(),
  memberAccessNodeType: 'selector_expression',
  callExpressionNodeType: 'call_expression',
  memberObjectField: 'operand',
  binaryExpressionNodeType: 'binary_expression',
  binaryOperatorField: 'operator',
  logicalOperators: new Set(['&&', '||']),
  controlFlowNodeTypes: new Set([
    'if_statement', 'for_statement', 'expression_switch_statement',
    'type_switch_statement', 'select_statement', 'communication_case',
  ]),
  catchNodeType: 'go_statement',
  primitiveTypeNames: new Set([
    'int', 'int8', 'int16', 'int32', 'int64',
    'uint', 'uint8', 'uint16', 'uint32', 'uint64',
    'float32', 'float64', 'complex64', 'complex128',
    'bool', 'string', 'byte', 'rune',
  ]),
  extractParamTypeName: (_param) => null,
  collectFieldName: (member) => {
    if (member.type !== 'field_declaration') return null;
    const nameNode = member.namedChildren.find(c => c.type === 'field_identifier' || c.type === 'identifier');
    return nameNode?.text ?? null;
  },
  selfKeyword: 'self',
  exportableNodeTypes: new Set(['function_declaration', 'method_declaration', 'type_declaration']),
  docCommentPattern: /^\/\/\s*\w/,
  docCommentIsLineStyle: true,
  callFunctionField: 'function',
};

// ---------------------------------------------------------------------------
// Ruby — class+method nodes; dynamically typed (extractParamTypeName returns null).
/** Language profile for Ruby — class + method nodes with RDoc/YARD line comments (#). */
export const rubyProfile: LanguageProfile = {
  classNodeTypes: new Set(['class', 'singleton_class']),
  methodNodeTypes: new Set(['method', 'singleton_method']),
  parameterListNodeTypes: new Set(['method_parameters', 'block_parameters']),
  parameterNodeTypes: new Set([
    'identifier', 'optional_parameter', 'keyword_parameter',
    'splat_parameter', 'hash_splat_parameter', 'block_parameter',
    'destructured_parameter',
  ]),
  implicitParameters: new Set(),
  // Ruby method calls with explicit receiver: call node, receiver field = "receiver"
  memberAccessNodeType: 'call',
  callExpressionNodeType: 'call',
  memberObjectField: 'receiver',
  binaryExpressionNodeType: 'binary', // Ruby uses 'binary' for && / ||
  binaryOperatorField: 'operator',
  logicalOperators: new Set(['&&', '||', 'and', 'or']),
  controlFlowNodeTypes: new Set([
    'if', 'elsif', 'unless', 'while', 'until', 'for',
    'when', 'rescue', 'if_modifier', 'unless_modifier',
    'while_modifier', 'until_modifier', 'conditional',
  ]),
  catchNodeType: 'rescue',
  // Ruby is dynamically typed — no static primitive type names in grammar
  primitiveTypeNames: new Set(['Integer', 'Float', 'String', 'Symbol', 'TrueClass', 'FalseClass']),
  // No type annotations in standard Ruby
  extractParamTypeName: (_param) => null,
  // Ruby instance fields are @name instance variables assigned in methods.
  // The god-class LCOM4 uses text-based self.field matching; Ruby uses @field
  // instead, so we return null and rely on the regex fallback in god-class-lcom4.
  collectFieldName: (_member) => null,
  selfKeyword: 'self',
  exportableNodeTypes: new Set(['method', 'singleton_method', 'class']),
  // Ruby documentation: RDoc / YARD use leading # comment blocks
  docCommentPattern: /^\s*#/,
  docCommentIsLineStyle: true, // Ruby uses line comments: # Description
  callFunctionField: null, // Ruby 'call' node uses 'method' field for the callee
};

// ---------------------------------------------------------------------------
// Rust — impl_item + function_item; field_expression for member access.
/** Language profile for Rust — impl_item + function_item with /// line doc comments. */
export const rustProfile: LanguageProfile = {
  classNodeTypes: new Set(['impl_item']),
  methodNodeTypes: new Set(['function_item']),
  parameterListNodeTypes: new Set(['parameters']),
  parameterNodeTypes: new Set(['parameter', 'self_parameter']),
  implicitParameters: new Set(['self', '&self', '&mut self']),
  memberAccessNodeType: 'field_expression',
  callExpressionNodeType: 'call_expression',
  memberObjectField: 'value',
  binaryExpressionNodeType: 'binary_expression',
  binaryOperatorField: 'operator',
  logicalOperators: new Set(['&&', '||']),
  controlFlowNodeTypes: new Set([
    'if_expression', 'else_clause', 'for_expression', 'while_expression',
    'loop_expression', 'match_arm', 'while_let_expression',
  ]),
  catchNodeType: 'match_arm',
  primitiveTypeNames: new Set([
    'i8', 'i16', 'i32', 'i64', 'i128', 'isize',
    'u8', 'u16', 'u32', 'u64', 'u128', 'usize',
    'f32', 'f64', 'bool', 'char', 'str', 'String',
  ]),
  extractParamTypeName: (param) => {
    if (param.type !== 'parameter') return null;
    const typeNode = param.childForFieldName?.('type');
    return typeNode?.text ?? null;
  },
  // Rust struct fields are field_declaration nodes inside a field_declaration_list
  collectFieldName: (member) => {
    if (member.type !== 'field_declaration') return null;
    return member.childForFieldName?.('name')?.text ?? null;
  },
  selfKeyword: 'self',
  // Rust exported items use 'pub' visibility; pub(crate) is also common
  exportableNodeTypes: new Set(['function_item', 'struct_item', 'impl_item', 'trait_item']),
  docCommentPattern: /^\/\/\//, // Rust doc comments are ///
  docCommentIsLineStyle: true, // Rust uses line comments: /// Description
  callFunctionField: 'function',
};

// ---------------------------------------------------------------------------
// Kotlin — JVM-based; navigation_expression for member access; KDoc comments.
/** Language profile for Kotlin — class_declaration + function_declaration with KDoc block comments. */
export const kotlinProfile: LanguageProfile = {
  classNodeTypes: new Set(['class_declaration', 'object_declaration', 'companion_object']),
  methodNodeTypes: new Set(['function_declaration', 'anonymous_function', 'secondary_constructor']),
  parameterListNodeTypes: new Set(['function_value_parameters']),
  parameterNodeTypes: new Set(['function_value_parameter', 'parameter']),
  implicitParameters: new Set(),
  memberAccessNodeType: 'navigation_expression',
  callExpressionNodeType: 'call_expression',
  memberObjectField: 'expression',
  binaryExpressionNodeType: 'infix_expression',
  binaryOperatorField: 'operator',
  logicalOperators: new Set(['&&', '||']),
  controlFlowNodeTypes: new Set([
    'if_expression', 'when_expression', 'for_statement',
    'while_statement', 'do_while_statement', 'try_expression',
  ]),
  catchNodeType: 'catch_block',
  primitiveTypeNames: new Set(['Int', 'Long', 'Short', 'Byte', 'Float', 'Double', 'Boolean', 'Char', 'String', 'Unit']),
  extractParamTypeName: (param) => {
    if (param.type !== 'function_value_parameter' && param.type !== 'parameter') return null;
    const typeNode = param.childForFieldName?.('type');
    return typeNode?.text ?? null;
  },
  collectFieldName: (member) => {
    if (member.type !== 'property_declaration') return null;
    return member.childForFieldName?.('variableDeclaration')?.childForFieldName?.('simpleIdentifier')?.text
      ?? member.namedChildren.find(c => c.type === 'simple_identifier')?.text
      ?? null;
  },
  selfKeyword: 'this',
  exportableNodeTypes: new Set(['function_declaration', 'class_declaration', 'property_declaration']),
  docCommentPattern: /\/\*\*[\s\S]*?\*\//,
  docCommentIsLineStyle: false,
  callFunctionField: 'callSuffix',
};

// ---------------------------------------------------------------------------
// PHP — class_declaration + method_declaration; $this; member_call_expression.
/** Language profile for PHP — class_declaration + method_declaration with phpDoc block comments. */
export const phpProfile: LanguageProfile = {
  classNodeTypes: new Set(['class_declaration', 'interface_declaration', 'trait_declaration']),
  methodNodeTypes: new Set(['method_declaration', 'function_definition']),
  parameterListNodeTypes: new Set(['formal_parameters']),
  parameterNodeTypes: new Set([
    'simple_parameter', 'variadic_parameter', 'property_promotion_parameter',
  ]),
  implicitParameters: new Set(),
  memberAccessNodeType: 'member_call_expression',
  callExpressionNodeType: 'function_call_expression',
  memberObjectField: 'object',
  binaryExpressionNodeType: 'binary_expression',
  binaryOperatorField: 'operator',
  logicalOperators: new Set(['&&', '||', 'and', 'or']),
  controlFlowNodeTypes: new Set([
    'if_statement', 'else_if_clause', 'for_statement', 'foreach_statement',
    'while_statement', 'do_statement', 'switch_statement',
    'match_conditional_expression', 'conditional_expression',
  ]),
  catchNodeType: 'catch_clause',
  primitiveTypeNames: new Set([
    'int', 'float', 'string', 'bool', 'array', 'callable', 'void', 'null', 'mixed',
  ]),
  extractParamTypeName: (param) => {
    if (param.type !== 'simple_parameter') return null;
    const typeNode = param.childForFieldName?.('type');
    return typeNode?.text ?? null;
  },
  collectFieldName: (member) => {
    if (member.type !== 'property_declaration') return null;
    const element = member.namedChildren.find(c => c.type === 'property_element');
    const varName = element?.namedChildren.find(c => c.type === 'variable_name');
    return varName?.childForFieldName?.('name')?.text
      ?? varName?.namedChildren.find(c => c.type !== '$')?.text
      ?? null;
  },
  selfKeyword: '$this',
  exportableNodeTypes: new Set(['method_declaration', 'class_declaration', 'function_definition']),
  docCommentPattern: /\/\*\*[\s\S]*?\*\//,
  docCommentIsLineStyle: false,
  callFunctionField: 'function',
};

// ---------------------------------------------------------------------------
// Scala — class/object/trait_definition; infix_expression for boolean logic.
/** Language profile for Scala — class/object/trait_definition + function_definition with Scaladoc. */
export const scalaProfile: LanguageProfile = {
  classNodeTypes: new Set(['class_definition', 'object_definition', 'trait_definition']),
  methodNodeTypes: new Set(['function_definition', 'function_declaration']),
  parameterListNodeTypes: new Set(['parameters']),
  parameterNodeTypes: new Set(['parameter']),
  implicitParameters: new Set(),
  memberAccessNodeType: 'field_expression',
  callExpressionNodeType: 'call_expression',
  memberObjectField: 'value',
  binaryExpressionNodeType: 'infix_expression',
  binaryOperatorField: 'operator',
  logicalOperators: new Set(['&&', '||']),
  controlFlowNodeTypes: new Set([
    'if_expression', 'for_expression', 'while_expression',
    'do_while_expression', 'match_expression', 'case_clause',
    'try_expression', 'catch_clause',
  ]),
  catchNodeType: 'catch_clause',
  primitiveTypeNames: new Set([
    'Int', 'Long', 'Short', 'Byte', 'Float', 'Double',
    'Boolean', 'Char', 'String', 'Unit', 'Any', 'AnyRef',
  ]),
  extractParamTypeName: (param) => {
    if (param.type !== 'parameter') return null;
    const typeNode = param.namedChildren.find(
      c => c.type === 'type_identifier' || c.type === 'generic_type',
    );
    return typeNode?.text ?? null;
  },
  collectFieldName: (member) => {
    if (member.type !== 'val_definition' && member.type !== 'var_definition') return null;
    const nameNode = member.namedChildren.find(c => c.type === 'identifier');
    return nameNode?.text ?? null;
  },
  selfKeyword: 'this',
  exportableNodeTypes: new Set(['function_definition', 'class_definition', 'object_definition', 'trait_definition']),
  docCommentPattern: /\/\*\*[\s\S]*?\*\//,
  docCommentIsLineStyle: false,
  callFunctionField: 'function',
};

// ---------------------------------------------------------------------------
// Elixir — module-based (def/defp); dot node for member access; @doc attributes.
/** Language profile for Elixir — module-based functions (def/defp) with @doc block attributes. */
export const elixirProfile: LanguageProfile = {
  classNodeTypes: new Set<string>(),
  methodNodeTypes: new Set<string>(),
  parameterListNodeTypes: new Set(['arguments']),
  parameterNodeTypes: new Set(['identifier', 'binary_operator']),
  implicitParameters: new Set(),
  memberAccessNodeType: 'dot',
  callExpressionNodeType: 'call',
  memberObjectField: 'object',
  binaryExpressionNodeType: 'binary_operator',
  binaryOperatorField: 'operator',
  logicalOperators: new Set(['&&', '||', 'and', 'or']),
  controlFlowNodeTypes: new Set(['if', 'unless', 'cond', 'case', 'receive', 'with']),
  catchNodeType: 'rescue_block',
  primitiveTypeNames: new Set(['integer', 'float', 'binary', 'atom', 'boolean', 'list', 'map', 'tuple']),
  extractParamTypeName: (_param) => null,
  collectFieldName: (_member) => null,
  selfKeyword: 'self',
  exportableNodeTypes: new Set<string>(),
  docCommentPattern: /^\s*@doc\s+"""/,
  docCommentIsLineStyle: false,
  callFunctionField: 'function',
};
