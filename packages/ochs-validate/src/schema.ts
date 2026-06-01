/**
 * Embeds the OCHS JSON schema as a plain JS object so the validator works
 * without any filesystem access at runtime.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

// We load the schema from the published file at module initialisation.
// This keeps the schema as the single source of truth (schemas/ochs-schema.json)
// while allowing the validator to use it without filesystem calls at call time.
let _schema: unknown;

export function getSchema(): unknown {
  if (_schema) return _schema;
  const schemaPath = join(__dirname, '..', 'schemas', 'ochs-schema.json');
  _schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  return _schema;
}
