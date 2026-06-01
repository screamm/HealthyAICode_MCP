// Fixture: a production request handler with an identical SqlInjectionRisk sink to
// test-sql-injection.ts, but in a normal production path (no test pattern).
// Under Sprint 56 scoring the security smell keeps full weight → score should stay low.

export function queryUserHandler(userId: string): string {
  // String-interpolated, attacker-controlled input flowing into a SQL sink.
  return `SELECT * FROM users WHERE id = '${userId}'`;
}
