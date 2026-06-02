// pair: ts-08-async-await-drop
// expected: divergent
// bugClass: async-semantics
// description: fetchUser: await dropped inside async function; caller receives Promise<T> not T.
// provenance: arXiv:2602.15761 pattern — async/await semantic change
// NOTE: Differential-execution harness must run in async context and compare resolved values.

type User = { id: number; name: string };

async function resolveUser(id: number): Promise<User> {
  return { id, name: `user-${id}` };
}

export async function before(id: number): Promise<User> {
  // Correct: awaits the resolved user object
  const user = await resolveUser(id);
  return user;
}

export async function after(id: number): Promise<User | Promise<User>> {
  // BUG: await dropped — returns the Promise itself, not the resolved User
  const user = resolveUser(id); // missing await
  return user as unknown as User; // type cast hides the bug at compile time
}

// Divergence witness:
//   await before(1) => { id: 1, name: 'user-1' }  (User object)
//   await after(1)  => Promise<User>  (nested promise, resolves to User only after second await)
//   typeof (await before(1)) === 'object'  /  instanceof: not a Promise
//   typeof (await after(1))  === 'object'  but .name is undefined at first resolution level
