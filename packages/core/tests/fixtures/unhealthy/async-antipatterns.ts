// Sprint 58 fixture: async/Promise anti-patterns in TypeScript
// Expected: >= 2 AsyncAntiPattern smells

// P1 — asyncFunctionNoAwait: async function with no await expression
async function computeHash(data: string): Promise<string> {
  const result = data.split('').reverse().join('');
  return result;
}

// P1 — another async function without await
async function formatDate(date: Date): Promise<string> {
  return date.toISOString();
}

// P3 — asyncFunctionAwaitedReturn: redundant "return await" outside try/catch
async function getUserData(userId: string): Promise<unknown> {
  return await fetchUser(userId);
}

// P8 — executorOneArgUsed: Promise constructor missing reject parameter
function readFileAsync(path: string): Promise<string> {
  return new Promise((resolve) => {
    const fs = require('fs');
    fs.readFile(path, 'utf8', (err: Error | null, data: string) => {
      if (err) {
        // Cannot reject — no reject parameter!
        resolve('');
      } else {
        resolve(data);
      }
    });
  });
}

// P7 — reactionReturnsPromise: .then callback returns nested .then
function processItems(items: string[]): Promise<unknown[]> {
  return fetchItems(items).then((results) => {
    return results.map(r => r.id).then((ids) => {
      return ids;
    });
  });
}

async function fetchUser(_id: string): Promise<unknown> {
  return { id: _id };
}

async function fetchItems(_items: string[]): Promise<Array<{ id: string; map: Function }>> {
  return [];
}
