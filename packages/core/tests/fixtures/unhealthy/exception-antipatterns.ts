// Sprint 58 fixture: exception anti-patterns in TypeScript
// Expected: >= 2 ExceptionHandlingAntiPattern smells

// 1. EmptyCatch — catch block with empty body
function parseData(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (e) {}
}

// 2. EmptyCatch with comment only
function loadConfig(path: string): Record<string, unknown> {
  try {
    const fs = require('fs');
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (err) {
    // TODO: handle error later
  }
  return {};
}

// 3. DestructiveWrapping — re-throw loses stack trace
function fetchUser(id: string): Promise<unknown> {
  try {
    return fetch(`/api/users/${id}`);
  } catch (e) {
    throw new Error(e.message);
  }
}

// 4. Generic catch — catches all errors without discrimination
function processRequest(req: { body: unknown }): void {
  try {
    handleBody(req.body);
  } catch (error) {
    console.log('Something went wrong');
  }
}

function handleBody(_body: unknown): void {
  // implementation
}
