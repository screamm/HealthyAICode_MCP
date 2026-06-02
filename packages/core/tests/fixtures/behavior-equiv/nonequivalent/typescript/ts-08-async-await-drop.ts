// pair: ts-08-async-await-drop
// expected: divergent
// bugClass: async-semantics
// description: loadProfile: await dropped on an intermediate Promise that is then USED
//              synchronously; the unresolved Promise (not the resolved value) flows into the
//              result, so the caller observes a Promise where a value was expected.
// provenance: arXiv:2602.15761 pattern — async/await semantic change (dropped await)
//
// NOTE ON THE BUG SHAPE (honest): an `async function` that merely does `return somePromise`
// instead of `return await somePromise` is GENUINELY equivalent — the JS spec auto-unwraps a
// thenable returned from an async function (it resolves through it). A dropped await is only
// OBSERVABLE when the unawaited Promise is consumed synchronously (property access, arithmetic,
// or — as here — embedded inside another structure that async-return does NOT auto-unwrap).
// This fixture uses the embed-in-array form so the divergence is real, not a spec artefact:
//   before(1) => { user: { id: 1, name: 'user-1' } }   (resolved value embedded)
//   after(1)  => { user: <Promise> }                   (unresolved Promise embedded → {} once serialised)
// The differential engine catches this two ways: the embedded value diverges ({id,name} vs an
// unresolved Promise), AND the async-aware harness records the Promise-nesting structure.

type User = { id: number; name: string };

async function resolveUser(id: number): Promise<User> {
  return { id, name: `user-${id}` };
}

export async function before(id: number): Promise<{ user: User }> {
  // Correct: await the user BEFORE embedding it in the result object.
  const user = await resolveUser(id);
  return { user };
}

export async function after(id: number): Promise<{ user: User }> {
  // BUG: await dropped — the *Promise* (not the resolved User) is embedded in the result.
  // Async-return only auto-unwraps a thenable returned DIRECTLY; a thenable nested inside an
  // object is left unresolved, so the caller gets { user: Promise } instead of { user: User }.
  const user = resolveUser(id); // missing await
  return { user: user as unknown as User }; // type cast hides the bug at compile time
}

// Divergence witness:
//   before(1) resolves to { user: { id: 1, name: 'user-1' } }
//   after(1)  resolves to { user: <pending/resolved Promise> } — structurally different
