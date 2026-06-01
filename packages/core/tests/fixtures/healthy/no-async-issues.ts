// Sprint 58 fixture: correct async/await patterns (healthy)
// Expected: 0 AsyncAntiPattern smells

// Correct: async function that properly uses await
async function fetcher(url: string): Promise<unknown> {
  const response = await fetch(url);
  return response.json();
}

// Correct: async function with multiple awaits
async function processUser(userId: string): Promise<{ name: string; posts: unknown[] }> {
  const user = await fetchUser(userId);
  const posts = await fetchUserPosts(userId);
  return { name: user.name, posts };
}

// Correct: return await inside try/catch (intentional — converts rejection to exception)
async function safeLoad(path: string): Promise<string> {
  try {
    return await readFile(path);
  } catch (e) {
    throw new Error(`Failed to load ${path}`, { cause: e });
  }
}

// Correct: Promise constructor with both resolve and reject
function readFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const fs = require('fs');
    fs.readFile(path, 'utf8', (err: Error | null, data: string) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

// Correct: Promise.all is excluded from P3 detection
async function loadAll(urls: string[]): Promise<unknown[]> {
  return await Promise.all(urls.map(url => fetcher(url)));
}

async function fetchUser(_id: string): Promise<{ name: string }> {
  const response = await fetch(`/api/users/${_id}`);
  return response.json();
}

async function fetchUserPosts(_id: string): Promise<unknown[]> {
  const response = await fetch(`/api/users/${_id}/posts`);
  return response.json();
}
