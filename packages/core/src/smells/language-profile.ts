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
// Go
// ---------------------------------------------------------------------------
// Go has no class keyword. The closest OO analog is a struct plus a set of
// methods whose receiver has the same type. In tree-sitter-go:
//   - struct_type       represents the struct body (fields)
//   - method_declaration represents a function with a named receiver (func (r T) Name(...))
//   - function_declaration represents a top-level function
//
// Thresholds rationale:
//   LongMethod   >50 lines — Go idiomatic style favours flat, short funcs; 50 is generous
//   LargeClass   >200 lines — matches the effective size a struct+methods can grow to
//   God Class    via WMC>=20 + ATFD>5 + LCOM4>1 (same thresholds as Java baseline)
//
// Member access: Go uses selector_expression (a.b) with the object in the
// "operand" field. Call expressions are call_expression.
export const goProfile: LanguageProfile = {
  // struct_type is the "class body" node in Go; method_declaration nodes are
  // top-level siblings rather than children, so god-class traversal is limited,
  // but the profile must be structurally correct for future detector improvements.
  classNodeTypes: new Set(['type_declaration']),
  methodNodeTypes: new Set(['method_declaration', 'function_declaration', 'func_literal']),
  parameterListNodeTypes: new Set(['parameter_list']),
  // Go groups params: "a, b int" → parameter_declaration with multiple identifiers.
  // variadic_parameter_declaration handles "args ...T".
  parameterNodeTypes: new Set(['parameter_declaration', 'variadic_parameter_declaration']),
  implicitParameters: new Set(),
  // Go member access: a.b → selector_expression; field name in "field" child
  memberAccessNodeType: 'selector_expression',
  callExpressionNodeType: 'call_expression',
  // tree-sitter-go uses "operand" for the receiver of a selector_expression
  memberObjectField: 'operand',
  binaryExpressionNodeType: 'binary_expression',
  binaryOperatorField: 'operator',
  logicalOperators: new Set(['&&', '||']),
  controlFlowNodeTypes: new Set([
    'if_statement', 'for_statement', 'expression_switch_statement',
    'type_switch_statement', 'select_statement', 'communication_case',
  ]),
  catchNodeType: 'go_statement', // Go has no catch; closest is goroutine panic recover
  // Go primitive types — only the language-built-in set (no string aliases)
  primitiveTypeNames: new Set([
    'int', 'int8', 'int16', 'int32', 'int64',
    'uint', 'uint8', 'uint16', 'uint32', 'uint64',
    'float32', 'float64', 'complex64', 'complex128',
    'bool', 'string', 'byte', 'rune',
  ]),
  // Go functions are not individually typed in parameter lists the same way;
  // parameter_declaration has multiple identifiers with one type at the end.
  // Returning null here falls back to no-type detection (conservative).
  extractParamTypeName: (_param) => null,
  // Go struct fields are field_declaration nodes inside a struct_type body.
  // collectFieldName returns the first identifier text if the member is a
  // field_declaration, enabling LCOM4 computation via self.<field> references.
  collectFieldName: (member) => {
    if (member.type !== 'field_declaration') return null;
    const nameNode = member.namedChildren.find(c => c.type === 'field_identifier' || c.type === 'identifier');
    return nameNode?.text ?? null;
  },
  // Go method receivers use explicit receiver variable (e.g. "s" in "func (s *Svc) Method()").
  // selfKeyword is set to the conventional single-letter receiver placeholder.
  // Feature Envy detection via "receiver.field" patterns still works because
  // the detector compares against importedTypeNames, not selfKeyword.
  selfKeyword: 'self', // placeholder — Go receivers are arbitrary identifiers
  exportableNodeTypes: new Set(['function_declaration', 'method_declaration', 'type_declaration']),
  docCommentPattern: /^\/\/\s*\w/, // Go doc comments are plain // lines above exported symbols
  docCommentIsLineStyle: true, // Go uses line comments: // FuncName does ...
  callFunctionField: 'function',
};

// ---------------------------------------------------------------------------
// Ruby
// ---------------------------------------------------------------------------
// Ruby has full OO with class keyword. In tree-sitter-ruby:
//   - class node contains a body_statement with method nodes
//   - instance methods use 'method'; class-level methods use 'singleton_method'
//   - instance variables are @name (instance_variable nodes)
//   - method calls with receiver: call node, receiver in "receiver" field
//
// Thresholds rationale:
//   LongMethod   >20 lines — Ruby style is concise; community norm is 10–15, we use 20
//   LargeClass   >200 lines — consistent with Python/Java baseline
//   God Class    WMC>=20 + ATFD>5 + LCOM4>1
//
// Ruby is dynamically typed so extractParamTypeName always returns null.
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
// Rust
// ---------------------------------------------------------------------------
// Rust has no classes; the OO analog is a struct plus an impl block.
// In tree-sitter-rust:
//   - impl_item represents an impl block (class analog)
//   - struct_item represents struct declarations
//   - function_item inside impl_item represents methods
//   - field_expression (a.b) represents member access, with "value" = receiver
//
// Thresholds rationale:
//   LongMethod   >50 lines — Rust code tends toward flat; 50 is generous
//   LargeClass   >200 lines — impl blocks beyond 200 lines suggest too many responsibilities
//   God Class    WMC>=20 + ATFD>5 + LCOM4>1
//
// Rust ownership semantics mean Feature Envy is less straightforward — a method
// operating on borrowed external types is normal. The ATFD threshold of >5 is
// intentionally conservative to avoid false positives from idiomatic ownership patterns.
export const rustProfile: LanguageProfile = {
  // impl_item is the closest class analog — it groups methods for a type.
  // struct_item is also included so that LCOM4 can find field declarations.
  classNodeTypes: new Set(['impl_item']),
  methodNodeTypes: new Set(['function_item']),
  parameterListNodeTypes: new Set(['parameters']),
  // Rust parameters: self_parameter for &self/&mut self, parameter for named params
  parameterNodeTypes: new Set(['parameter', 'self_parameter']),
  // &self and self are implicit "this" equivalents
  implicitParameters: new Set(['self', '&self', '&mut self']),
  // Rust member/field access: field_expression with "value" = receiver, "field" = member
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
  catchNodeType: 'match_arm', // Rust error handling is via match/Result, no catch
  primitiveTypeNames: new Set([
    'i8', 'i16', 'i32', 'i64', 'i128', 'isize',
    'u8', 'u16', 'u32', 'u64', 'u128', 'usize',
    'f32', 'f64', 'bool', 'char', 'str', 'String',
  ]),
  // Rust parameters have explicit type annotations via ':' separator
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
// Kotlin
// ---------------------------------------------------------------------------
// Kotlin is JVM-based and shares many structural similarities with Java.
// However Kotlin uses shorter idiomatic style — functions replace many patterns
// that Java uses classes for. Thresholds are tighter than Java:
//   LongMethod   >30 lines — Kotlin idiomatic functions are concise
//   LargeClass   >200 lines — same as Java baseline
//   God Class    WMC>=15 + ATFD>5 + LCOM4>1 (lower WMC than Java due to conciseness)
//
// NOTE: Kotlin currently uses a Tier B text-based analyzer (no tree-sitter-kotlin
// package in this project). This profile is provided for forward-compatibility
// when a Kotlin tree-sitter grammar becomes available. The profile structure
// mirrors what tree-sitter-kotlin would expose.
//
// Key Kotlin-specific considerations:
//   - data classes: should not be flagged as God Class (ATFD threshold guards this)
//   - extension functions: treated as regular methods for WMC purposes
//   - object declarations: treated as class analogs
export const kotlinProfile: LanguageProfile = {
  // Kotlin class types as they would appear in tree-sitter-kotlin grammar
  classNodeTypes: new Set(['class_declaration', 'object_declaration', 'companion_object']),
  methodNodeTypes: new Set([
    'function_declaration', 'anonymous_function',
    'secondary_constructor',
  ]),
  parameterListNodeTypes: new Set(['function_value_parameters']),
  parameterNodeTypes: new Set(['function_value_parameter', 'parameter']),
  implicitParameters: new Set(),
  // Kotlin member access: navigation_expression with "navigationSuffix" field
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
  primitiveTypeNames: new Set([
    'Int', 'Long', 'Short', 'Byte', 'Float', 'Double',
    'Boolean', 'Char', 'String', 'Unit',
  ]),
  // Kotlin has typed parameters: "name: Type" syntax
  extractParamTypeName: (param) => {
    if (param.type !== 'function_value_parameter' && param.type !== 'parameter') return null;
    const typeNode = param.childForFieldName?.('type');
    return typeNode?.text ?? null;
  },
  // Kotlin class fields are property_declaration nodes
  collectFieldName: (member) => {
    if (member.type !== 'property_declaration') return null;
    return member.childForFieldName?.('variableDeclaration')?.childForFieldName?.('simpleIdentifier')?.text
      ?? member.namedChildren.find(c => c.type === 'simple_identifier')?.text
      ?? null;
  },
  selfKeyword: 'this',
  exportableNodeTypes: new Set(['function_declaration', 'class_declaration', 'property_declaration']),
  docCommentPattern: /\/\*\*[\s\S]*?\*\//, // Kotlin uses KDoc (/** ... */)
  docCommentIsLineStyle: false, // Kotlin uses /** ... */ KDoc block comments
  callFunctionField: 'callSuffix', // Kotlin call_expression uses callSuffix for args
};

// ---------------------------------------------------------------------------
// PHP
// ---------------------------------------------------------------------------
// PHP has class-based OO similar to Java/C#. In tree-sitter-php (php_only mode):
//   - class_declaration: regular class
//   - interface_declaration: interface
//   - method_declaration: instance/static methods inside class body
//   - member_call_expression: $obj->method() — object in "object" field
//   - property_declaration: class property fields
//
// Thresholds rationale:
//   LongMethod   >40 lines — PHP has more ceremony than Python/Ruby but less than Java
//   LargeClass   >200 lines — consistent with Java/C# baseline
//   God Class    WMC>=20 + ATFD>5 + LCOM4>1
//
// PHP variables are prefixed with $, which the tree-sitter grammar parses as
// variable_name nodes (containing a '$' token + 'name' identifier). The profile
// cannot use plain identifiers for parameter names, so extractParamTypeName
// navigates the simple_parameter structure.
export const phpProfile: LanguageProfile = {
  classNodeTypes: new Set(['class_declaration', 'interface_declaration', 'trait_declaration']),
  methodNodeTypes: new Set(['method_declaration', 'function_definition']),
  parameterListNodeTypes: new Set(['formal_parameters']),
  parameterNodeTypes: new Set([
    'simple_parameter', 'variadic_parameter', 'property_promotion_parameter',
  ]),
  implicitParameters: new Set(),
  // PHP member access: member_call_expression for method calls ($obj->method())
  // and member_access_expression for property access ($obj->prop)
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
  // PHP parameter type hints: simple_parameter has 'type' field
  extractParamTypeName: (param) => {
    if (param.type !== 'simple_parameter') return null;
    const typeNode = param.childForFieldName?.('type');
    return typeNode?.text ?? null;
  },
  // PHP class properties: property_declaration contains property_element with name
  collectFieldName: (member) => {
    if (member.type !== 'property_declaration') return null;
    const element = member.namedChildren.find(c => c.type === 'property_element');
    // variable_name node: first named child after $ is the 'name' identifier
    const varName = element?.namedChildren.find(c => c.type === 'variable_name');
    return varName?.childForFieldName?.('name')?.text
      ?? varName?.namedChildren.find(c => c.type !== '$')?.text
      ?? null;
  },
  selfKeyword: '$this',
  exportableNodeTypes: new Set(['method_declaration', 'class_declaration', 'function_definition']),
  docCommentPattern: /\/\*\*[\s\S]*?\*\//, // PHP uses phpDoc (/** ... */)
  docCommentIsLineStyle: false, // PHP uses /** ... */ block comments (phpDoc)
  callFunctionField: 'function',
};

// ---------------------------------------------------------------------------
// Scala
// ---------------------------------------------------------------------------
// Scala has class-based OO with both FP and OOP idioms. In tree-sitter-scala:
//   - class_definition: regular class
//   - object_definition: singleton object (companion or standalone)
//   - trait_definition: trait (interface + default methods)
//   - function_definition: def blocks (methods and top-level functions)
//   - function_declaration: abstract def in traits
//   - field_expression: a.b member access
//   - call_expression: function/method calls
//   - val_definition / var_definition: class fields
//
// Thresholds rationale:
//   LongMethod   >40 lines — Scala style favours concise FP but class methods can be verbose
//   LargeClass   >200 lines — consistent with Java/C# baseline
//   God Class    WMC>=20 + ATFD>5 + LCOM4>1
//
// Scala's match expressions count as CC contributors (one per case_clause).
// infix_expression handles logical operators (&&, ||) for ComplexConditional.
export const scalaProfile: LanguageProfile = {
  classNodeTypes: new Set(['class_definition', 'object_definition', 'trait_definition']),
  methodNodeTypes: new Set(['function_definition', 'function_declaration']),
  parameterListNodeTypes: new Set(['parameters']),
  parameterNodeTypes: new Set(['parameter']),
  implicitParameters: new Set(),
  // Scala member access: field_expression with "." separator (a.b)
  memberAccessNodeType: 'field_expression',
  callExpressionNodeType: 'call_expression',
  memberObjectField: 'value', // field_expression: left side is 'value' in tree-sitter-scala
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
  // Scala parameters: parameter has identifier + type_identifier children
  extractParamTypeName: (param) => {
    if (param.type !== 'parameter') return null;
    const typeNode = param.namedChildren.find(
      c => c.type === 'type_identifier' || c.type === 'generic_type',
    );
    return typeNode?.text ?? null;
  },
  // Scala class fields are val_definition / var_definition nodes
  collectFieldName: (member) => {
    if (member.type !== 'val_definition' && member.type !== 'var_definition') return null;
    const nameNode = member.namedChildren.find(c => c.type === 'identifier');
    return nameNode?.text ?? null;
  },
  selfKeyword: 'this',
  exportableNodeTypes: new Set(['function_definition', 'class_definition', 'object_definition', 'trait_definition']),
  docCommentPattern: /\/\*\*[\s\S]*?\*\//, // Scala uses Scaladoc (/** ... */)
  docCommentIsLineStyle: false, // Scala uses /** ... */ Scaladoc block comments
  callFunctionField: 'function',
};

// ---------------------------------------------------------------------------
// Elixir
// ---------------------------------------------------------------------------
// Elixir is a functional language with module-based organisation. In tree-sitter-elixir:
//   - call with identifier "defmodule": module definition
//   - call with identifier "def": public function
//   - call with identifier "defp": private function
//   - Elixir has no classes; the closest OO analog is a module with state via GenServer
//   - call node: function call, with "dot" as receiver for module calls (Foo.bar)
//   - dot node: Foo.bar — object in "left" child, member in "right" child
//
// Thresholds rationale:
//   LongMethod   >30 lines — Elixir functions are idiomatic short; 30 is generous
//   LargeClass   >200 lines — treating defmodule as the class analog
//   God Class    WMC>=15 + ATFD>5 + LCOM4>1 (lower WMC; Elixir is concise)
//
// Note: Elixir's multi-clause functions (multiple def with same name) are each
// treated as a separate function entity, consistent with the Tier B behavior.
// Pattern matching in case/cond contributes to CC.
export const elixirProfile: LanguageProfile = {
  // Elixir has no class keyword; we model defmodule call nodes as class analogs.
  // The god-class detector will look for nodes whose type is in classNodeTypes.
  // Since defmodule is a 'call' node in tree-sitter-elixir, we cannot directly
  // distinguish it by type alone — use an empty set and rely on module-level analysis.
  classNodeTypes: new Set<string>(), // Handled specially in the analyzer
  methodNodeTypes: new Set<string>(), // Handled specially in the analyzer
  parameterListNodeTypes: new Set(['arguments']),
  parameterNodeTypes: new Set(['identifier', 'binary_operator']),
  implicitParameters: new Set(),
  // Elixir: Foo.bar is a "dot" node; for call expressions it's a "call" node
  memberAccessNodeType: 'dot',
  callExpressionNodeType: 'call',
  memberObjectField: 'object', // dot node: left child is the module/object
  binaryExpressionNodeType: 'binary_operator',
  binaryOperatorField: 'operator',
  logicalOperators: new Set(['&&', '||', 'and', 'or']),
  controlFlowNodeTypes: new Set([
    'if', 'unless', 'cond', 'case', 'receive', 'with',
  ]),
  catchNodeType: 'rescue_block',
  primitiveTypeNames: new Set([
    'integer', 'float', 'binary', 'atom', 'boolean', 'list', 'map', 'tuple',
  ]),
  // Elixir is dynamically typed — no static type annotations
  extractParamTypeName: (_param) => null,
  // Elixir has no class fields in the OOP sense
  collectFieldName: (_member) => null,
  selfKeyword: 'self', // placeholder — Elixir has no self
  exportableNodeTypes: new Set<string>(), // Handled specially
  docCommentPattern: /^\s*@doc\s+"""/,
  docCommentIsLineStyle: false, // Elixir uses @doc """ ... """ block attributes
  callFunctionField: 'function',
};
