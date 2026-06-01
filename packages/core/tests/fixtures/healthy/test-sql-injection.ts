// Fixture: a mock-SQL test helper carrying a SqlInjectionRisk-shaped sink.
// In test context (Sprint 56 reachability filter), the security smell is discounted 0.4×
// because it is unreachable in production. Score should rise to >= 9.0.
// NOTE: this fixture is intentionally placed under a __tests__/ path when referenced by
// path-based role detection; the inline SQL here uses a parameterised string literal.

export function queryUserForTest(userId: string): string {
  // Parameterised query — string literal sink, typical test helper.
  return `SELECT * FROM users WHERE id = '${userId}'`;
}
