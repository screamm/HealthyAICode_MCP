/**
 * Output formatter with moderate branching — borderline complexity.
 */

export type OutputFormat = 'json' | 'csv' | 'tsv' | 'plain';

export interface FormatOptions {
  format: OutputFormat;
  indent?: number;
  delimiter?: string;
  header?: boolean;
}

/**
 * Formats an array of objects into the requested output format.
 * Supports JSON (pretty or compact), CSV, TSV, and plain text.
 */
export function formatOutput(
  rows: Record<string, unknown>[],
  options: FormatOptions,
): string {
  if (rows.length === 0) return '';

  const { format, indent = 2, delimiter = ',', header = true } = options;

  if (format === 'json') {
    return JSON.stringify(rows, null, indent);
  }

  const keys = Object.keys(rows[0]);

  if (format === 'csv' || format === 'tsv') {
    const sep = format === 'tsv' ? '\t' : delimiter;
    const lines: string[] = [];
    if (header) {
      lines.push(keys.join(sep));
    }
    for (const row of rows) {
      lines.push(keys.map((k) => String(row[k] ?? '')).join(sep));
    }
    return lines.join('\n');
  }

  // plain
  const lines: string[] = [];
  for (const row of rows) {
    const parts = keys.map((k) => `${k}=${String(row[k] ?? '')}`);
    lines.push(parts.join(' '));
  }
  return lines.join('\n');
}
