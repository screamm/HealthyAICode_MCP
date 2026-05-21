// Triggers: DeepNesting, ComplexMethod
// NOTE (Sprint 17): BumpyRoad is NOT triggered by this file under the new chunk-based definition.
// resolvePermission has only 1 top-level sibling chunk (the outer `if (user)` block).
// All nested control flow lives inside that single top-level chunk.
// The old file-level heuristic (3+ functions with nestingDepth >= 3) is no longer used.
export function resolvePermission(
  user: Record<string, unknown>,
  resource: Record<string, unknown>,
  context: Record<string, unknown>
): string {
  if (user) {
    if (user['role']) {
      if (user['role'] === 'admin') {
        if (resource) {
          if (resource['public']) {
            return 'allow';
          } else {
            if (context['override']) {
              if (context['override'] === true) {
                return 'allow-override';
              } else {
                return 'deny';
              }
            }
            return 'deny';
          }
        }
      } else if (user['role'] === 'editor') {
        if (resource) {
          if (resource['editable']) {
            if (context['timestamp']) {
              if (Number(context['timestamp']) > Date.now() - 3600000) {
                return 'allow-recent';
              }
            }
            return 'allow-edit';
          }
        }
      }
    }
  }
  return 'deny';
}
