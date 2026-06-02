// pair: ts-eq-05-optional-chain
// expected: equivalent
// bugClass: none
// description: getName: explicit null check replaced by optional chaining `?.`. Semantics identical.
// provenance: arXiv:2602.15761 simplify-null-check class

type User = { name?: string } | null | undefined;

export function before(user: User): string | undefined {
  if (user !== null && user !== undefined) {
    return user.name;
  }
  return undefined;
}

export function after(user: User): string | undefined {
  return user?.name;
}

// Optional chaining returns undefined for null/undefined objects — identical to explicit guard.
