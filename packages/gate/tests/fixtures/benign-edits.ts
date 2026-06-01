/**
 * Benign-edit corpus for false-positive measurement.
 *
 * Each entry is a realistic, behaviour-preserving (or behaviour-additive but
 * harmless) edit that a competent developer or a well-behaved agent would make.
 * NONE of these should be denied by the gate: they do not introduce a security
 * or AI-native smell, do not drop the file below the floor, and do not regress
 * the health score beyond the configured tolerance.
 *
 * The corpus deliberately covers the categories the task names —
 *   - renames (symbol / parameter / local)
 *   - added pure functions
 *   - documentation / comment additions
 *   - harmless refactors (extract variable, early-return, guard clause, dedup)
 * — plus a few adjacent benign patterns (formatting, added type annotations,
 * import reordering, added test-style helpers) and several languages, because
 * the gate is multi-language and a false positive in any of them turns the hook
 * off "on day one".
 *
 * Used by `false-positive-rate.test.ts` to assert the measured FP rate is < 5%.
 * Kept as data (not inline in the test) so the corpus can grow independently of
 * the assertion and so the exact count is auditable.
 */
import type { Language } from '@healthy-ai-code/core';

export interface BenignEdit {
  /** Stable id for reporting which case (if any) was a false positive. */
  id: string;
  /** Category of benign change, for FP-by-category reporting. */
  category:
    | 'rename'
    | 'added-pure-function'
    | 'doc-addition'
    | 'refactor'
    | 'formatting'
    | 'type-annotation'
    | 'import-reorder';
  filePath: string;
  language: Language;
  before: string;
  after: string;
}

// ---------------------------------------------------------------------------
// TypeScript baselines
// ---------------------------------------------------------------------------

const TS_BASE = `export interface Order {
  id: string;
  total: number;
  currency: string;
}

export function orderTotal(orders: Order[]): number {
  let sum = 0;
  for (const order of orders) {
    sum += order.total;
  }
  return sum;
}

export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}
`;

const PY_BASE = `def order_total(orders):
    total = 0
    for order in orders:
        total += order["total"]
    return total


def format_currency(amount, currency):
    return f"{currency} {amount:.2f}"
`;

const JAVA_BASE = `public class OrderService {
    public int orderTotal(int[] orders) {
        int sum = 0;
        for (int o : orders) {
            sum += o;
        }
        return sum;
    }

    public String describe(int count) {
        return "orders: " + count;
    }
}
`;

const GO_BASE = `package orders

func OrderTotal(orders []int) int {
	sum := 0
	for _, o := range orders {
		sum += o
	}
	return sum
}

func Describe(count int) string {
	return "orders"
}
`;

const JS_BASE = `function orderTotal(orders) {
  let sum = 0;
  for (const order of orders) {
    sum += order.total;
  }
  return sum;
}

module.exports = { orderTotal };
`;

export const BENIGN_EDITS: BenignEdit[] = [
  // --- renames -------------------------------------------------------------
  {
    id: 'ts-rename-local',
    category: 'rename',
    filePath: 'src/orders.ts',
    language: 'typescript',
    before: TS_BASE,
    after: TS_BASE.replace(/sum/g, 'runningTotal'),
  },
  {
    id: 'ts-rename-exported-fn',
    category: 'rename',
    filePath: 'src/orders.ts',
    language: 'typescript',
    before: TS_BASE,
    after: TS_BASE.replace(/orderTotal/g, 'sumOrders'),
  },
  {
    id: 'ts-rename-param',
    category: 'rename',
    filePath: 'src/orders.ts',
    language: 'typescript',
    before: TS_BASE,
    after: TS_BASE.replace(/\bamount\b/g, 'value'),
  },
  {
    id: 'py-rename-local',
    category: 'rename',
    filePath: 'src/orders.py',
    language: 'python',
    before: PY_BASE,
    after: PY_BASE.replace(/total/g, 'running_total'),
  },
  {
    id: 'java-rename-method',
    category: 'rename',
    filePath: 'src/OrderService.java',
    language: 'java',
    before: JAVA_BASE,
    after: JAVA_BASE.replace(/orderTotal/g, 'sumOrders'),
  },
  {
    id: 'go-rename-param',
    category: 'rename',
    filePath: 'orders/orders.go',
    language: 'go',
    before: GO_BASE,
    after: GO_BASE.replace(/count/g, 'n'),
  },

  // --- added pure functions ------------------------------------------------
  {
    id: 'ts-add-pure-fn',
    category: 'added-pure-function',
    filePath: 'src/orders.ts',
    language: 'typescript',
    before: TS_BASE,
    after:
      TS_BASE +
      `
export function averageOrder(orders: Order[]): number {
  if (orders.length === 0) {
    return 0;
  }
  return orderTotal(orders) / orders.length;
}
`,
  },
  {
    id: 'ts-add-small-helper',
    category: 'added-pure-function',
    filePath: 'src/orders.ts',
    language: 'typescript',
    before: TS_BASE,
    after:
      TS_BASE +
      `
export function isHighValue(order: Order): boolean {
  return order.total > 1000;
}
`,
  },
  {
    id: 'py-add-pure-fn',
    category: 'added-pure-function',
    filePath: 'src/orders.py',
    language: 'python',
    before: PY_BASE,
    after:
      PY_BASE +
      `

def average_order(orders):
    if not orders:
        return 0
    return order_total(orders) / len(orders)
`,
  },
  {
    id: 'java-add-pure-method',
    category: 'added-pure-function',
    filePath: 'src/OrderService.java',
    language: 'java',
    before: JAVA_BASE,
    after: JAVA_BASE.replace(
      '    public String describe(int count) {\n        return "orders: " + count;\n    }\n}',
      '    public String describe(int count) {\n        return "orders: " + count;\n    }\n\n' +
        '    public boolean isEmpty(int[] orders) {\n        return orders.length == 0;\n    }\n}',
    ),
  },
  {
    id: 'go-add-pure-fn',
    category: 'added-pure-function',
    filePath: 'orders/orders.go',
    language: 'go',
    before: GO_BASE,
    after:
      GO_BASE +
      `
func IsEmpty(orders []int) bool {
	return len(orders) == 0
}
`,
  },
  {
    id: 'js-add-pure-fn',
    category: 'added-pure-function',
    filePath: 'src/orders.js',
    language: 'javascript',
    before: JS_BASE,
    after: JS_BASE.replace(
      'module.exports = { orderTotal };',
      'function average(orders) {\n' +
        '  if (orders.length === 0) {\n    return 0;\n  }\n' +
        '  return orderTotal(orders) / orders.length;\n}\n\n' +
        'module.exports = { orderTotal, average };',
    ),
  },

  // --- documentation / comment additions -----------------------------------
  {
    id: 'ts-add-jsdoc',
    category: 'doc-addition',
    filePath: 'src/orders.ts',
    language: 'typescript',
    before: TS_BASE,
    after: TS_BASE.replace(
      'export function orderTotal(orders: Order[]): number {',
      '/**\n * Sums the `total` field across all orders.\n * @param orders the orders to total\n * @returns the summed total\n */\nexport function orderTotal(orders: Order[]): number {',
    ),
  },
  {
    id: 'ts-add-inline-comment',
    category: 'doc-addition',
    filePath: 'src/orders.ts',
    language: 'typescript',
    before: TS_BASE,
    after: TS_BASE.replace(
      '  let sum = 0;',
      '  // Accumulate the order totals in a single pass.\n  let sum = 0;',
    ),
  },
  {
    id: 'py-add-docstring',
    category: 'doc-addition',
    filePath: 'src/orders.py',
    language: 'python',
    before: PY_BASE,
    after: PY_BASE.replace(
      'def order_total(orders):\n',
      'def order_total(orders):\n    """Return the summed total across all orders."""\n',
    ),
  },
  {
    id: 'java-add-javadoc',
    category: 'doc-addition',
    filePath: 'src/OrderService.java',
    language: 'java',
    before: JAVA_BASE,
    after: JAVA_BASE.replace(
      '    public int orderTotal(int[] orders) {',
      '    /** Sums the order amounts. */\n    public int orderTotal(int[] orders) {',
    ),
  },
  {
    id: 'go-add-doc-comment',
    category: 'doc-addition',
    filePath: 'orders/orders.go',
    language: 'go',
    before: GO_BASE,
    after: GO_BASE.replace(
      'func OrderTotal(orders []int) int {',
      '// OrderTotal sums the order amounts.\nfunc OrderTotal(orders []int) int {',
    ),
  },

  // --- harmless refactors --------------------------------------------------
  {
    id: 'ts-extract-variable',
    category: 'refactor',
    filePath: 'src/orders.ts',
    language: 'typescript',
    before: TS_BASE,
    after: TS_BASE.replace(
      "  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);",
      "  const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency });\n  return formatter.format(amount);",
    ),
  },
  {
    id: 'ts-guard-clause',
    category: 'refactor',
    filePath: 'src/orders.ts',
    language: 'typescript',
    before: TS_BASE,
    after: TS_BASE.replace(
      '  let sum = 0;\n  for (const order of orders) {\n    sum += order.total;\n  }\n  return sum;',
      '  if (orders.length === 0) {\n    return 0;\n  }\n  let sum = 0;\n  for (const order of orders) {\n    sum += order.total;\n  }\n  return sum;',
    ),
  },
  {
    id: 'ts-reduce-rewrite',
    category: 'refactor',
    filePath: 'src/orders.ts',
    language: 'typescript',
    before: TS_BASE,
    after: TS_BASE.replace(
      '  let sum = 0;\n  for (const order of orders) {\n    sum += order.total;\n  }\n  return sum;',
      '  return orders.reduce((sum, order) => sum + order.total, 0);',
    ),
  },
  {
    id: 'py-comprehension-rewrite',
    category: 'refactor',
    filePath: 'src/orders.py',
    language: 'python',
    before: PY_BASE,
    after: PY_BASE.replace(
      '    total = 0\n    for order in orders:\n        total += order["total"]\n    return total',
      '    return sum(order["total"] for order in orders)',
    ),
  },
  {
    id: 'go-early-return',
    category: 'refactor',
    filePath: 'orders/orders.go',
    language: 'go',
    before: GO_BASE,
    after: GO_BASE.replace(
      '\tsum := 0\n\tfor _, o := range orders {\n\t\tsum += o\n\t}\n\treturn sum',
      '\tif len(orders) == 0 {\n\t\treturn 0\n\t}\n\tsum := 0\n\tfor _, o := range orders {\n\t\tsum += o\n\t}\n\treturn sum',
    ),
  },
  {
    id: 'java-extract-local',
    category: 'refactor',
    filePath: 'src/OrderService.java',
    language: 'java',
    before: JAVA_BASE,
    after: JAVA_BASE.replace(
      '        return "orders: " + count;',
      '        String label = "orders: " + count;\n        return label;',
    ),
  },

  // --- formatting ----------------------------------------------------------
  {
    id: 'ts-reformat-spacing',
    category: 'formatting',
    filePath: 'src/orders.ts',
    language: 'typescript',
    before: TS_BASE,
    after: TS_BASE.replace(
      'export interface Order {\n  id: string;\n  total: number;\n  currency: string;\n}',
      'export interface Order {\n  id: string;\n\n  total: number;\n\n  currency: string;\n}',
    ),
  },
  {
    id: 'py-reflow-blank-lines',
    category: 'formatting',
    filePath: 'src/orders.py',
    language: 'python',
    before: PY_BASE,
    after: PY_BASE.replace(
      'def format_currency(amount, currency):\n',
      '\ndef format_currency(amount, currency):\n',
    ),
  },

  // --- added type annotations ----------------------------------------------
  {
    id: 'ts-add-return-type',
    category: 'type-annotation',
    filePath: 'src/orders.ts',
    language: 'typescript',
    before: TS_BASE.replace('): number {\n  let sum = 0;', ') {\n  let sum = 0;'),
    after: TS_BASE,
  },
  {
    id: 'py-add-type-hints',
    category: 'type-annotation',
    filePath: 'src/orders.py',
    language: 'python',
    before: PY_BASE,
    after: PY_BASE.replace(
      'def order_total(orders):',
      'def order_total(orders: list[dict]) -> float:',
    ),
  },

  // --- import reordering ---------------------------------------------------
  {
    id: 'ts-import-reorder',
    category: 'import-reorder',
    filePath: 'src/app.ts',
    language: 'typescript',
    before: `import { readFile } from 'fs/promises';
import { join } from 'path';
import { orderTotal } from './orders';

export async function loadAndTotal(path: string): Promise<number> {
  const raw = await readFile(join(process.cwd(), path), 'utf-8');
  return orderTotal(JSON.parse(raw));
}
`,
    after: `import { join } from 'path';
import { readFile } from 'fs/promises';
import { orderTotal } from './orders';

export async function loadAndTotal(path: string): Promise<number> {
  const raw = await readFile(join(process.cwd(), path), 'utf-8');
  return orderTotal(JSON.parse(raw));
}
`,
  },
  {
    id: 'py-import-reorder',
    category: 'import-reorder',
    filePath: 'src/app.py',
    language: 'python',
    before: `import json
import os


def load(path):
    with open(os.path.join(os.getcwd(), path)) as f:
        return json.load(f)
`,
    after: `import os
import json


def load(path):
    with open(os.path.join(os.getcwd(), path)) as f:
        return json.load(f)
`,
  },
];
