/**
 * Unhealthy fixture — demonstrates chunk-based BumpyRoad smell (Sprint 17 definition).
 *
 * Contains:
 * - BumpyRoad (processRequest: 4 top-level sibling control-flow chunks)
 * - BumpyRoad (handlePipeline: 5 top-level sibling control-flow chunks)
 *
 * These functions have multiple sequential logical responsibilities at the same nesting level,
 * which is the CodeScene definition of Bumpy Road. Each chunk should be extracted into
 * a named helper function so the caller reads as a clean narrative.
 */

interface Request {
  auth?: { token: string };
  items?: string[];
  flush?: boolean;
  queue: string[];
  user?: { id: string };
}

/** BumpyRoad: 4 top-level sibling control-flow chunks. */
export function processRequest(req: Request): void {
  if (req.auth) {
    validateToken(req.auth.token);
    refreshSession(req.user?.id ?? '');
  }
  for (const item of (req.items ?? [])) {
    enqueueItem(item);
  }
  if (req.flush) {
    drainQueue();
  }
  while (req.queue.length > 0) {
    processNext(req.queue.shift()!);
  }
}

/** BumpyRoad: 5 top-level sibling control-flow chunks. */
export function handlePipeline(data: string[], config: Record<string, unknown>): string[] {
  const results: string[] = [];
  if (config['validate']) {
    for (const item of data) {
      if (!item) throw new Error('invalid');
    }
  }
  for (const item of data) {
    results.push(item.trim());
  }
  if (config['transform']) {
    for (let i = 0; i < results.length; i++) {
      results[i] = results[i].toUpperCase();
    }
  }
  while (results.length > 100) {
    results.pop();
  }
  switch (config['output']) {
    case 'json': return [JSON.stringify(results)];
    default: return results;
  }
}

// --- stubs ---
function validateToken(_token: string): void { /* stub */ }
function refreshSession(_userId: string): void { /* stub */ }
function enqueueItem(_item: string): void { /* stub */ }
function drainQueue(): void { /* stub */ }
function processNext(_item: string): void { /* stub */ }
