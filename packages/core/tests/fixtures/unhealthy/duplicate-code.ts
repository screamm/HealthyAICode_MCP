/**
 * Unhealthy fixture — duplicate-code.ts
 *
 * Contains three copy-pasted variants of the same form-field validation logic,
 * each renamed with different variable names (type 1 + type 2 clones).
 * Realistic scenario: a developer copy-pasted field validation instead of extracting
 * a shared `validateField(value, rules)` helper.
 *
 * Expected: ≥1 DuplicateCode smell with severity 'medium' or 'high'.
 */

// ── First copy: validate email field ─────────────────────────────────────────

export function validateEmailField(value: string, required: boolean): string[] {
  const errors: string[] = [];
  if (required && value.trim() === '') {
    errors.push('Email is required');
  }
  if (value.length > 0 && !value.includes('@')) {
    errors.push('Email must contain @');
  }
  if (value.length > 254) {
    errors.push('Email is too long');
  }
  if (value.startsWith(' ') || value.endsWith(' ')) {
    errors.push('Email must not have leading or trailing spaces');
  }
  return errors;
}

// ── Second copy: validate username field (renamed variables, same structure) ──

export function validateUsernameField(input: string, mandatory: boolean): string[] {
  const issues: string[] = [];
  if (mandatory && input.trim() === '') {
    issues.push('Username is required');
  }
  if (input.length > 0 && !input.includes('@')) {
    issues.push('Username must contain @');
  }
  if (input.length > 254) {
    issues.push('Username is too long');
  }
  if (input.startsWith(' ') || input.endsWith(' ')) {
    issues.push('Username must not have leading or trailing spaces');
  }
  return issues;
}

// ── Third copy: validate handle field (another rename, same logic) ────────────

export function validateHandleField(text: string, isRequired: boolean): string[] {
  const messages: string[] = [];
  if (isRequired && text.trim() === '') {
    messages.push('Handle is required');
  }
  if (text.length > 0 && !text.includes('@')) {
    messages.push('Handle must contain @');
  }
  if (text.length > 254) {
    messages.push('Handle is too long');
  }
  if (text.startsWith(' ') || text.endsWith(' ')) {
    messages.push('Handle must not have leading or trailing spaces');
  }
  return messages;
}
