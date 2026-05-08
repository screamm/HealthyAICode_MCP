// Triggers: DeepNesting, ComplexMethod, BumpyRoad
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
