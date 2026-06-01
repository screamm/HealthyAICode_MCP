/**
 * Event handler with moderate branching — borderline health score expected.
 * Contains a ComplexMethod smell (multiple conditions in one function).
 */

export type EventType = 'click' | 'submit' | 'change' | 'blur' | 'focus' | 'keydown';

export interface DomEvent {
  type: EventType;
  target: { id: string; value?: string; tagName: string };
  key?: string;
  shiftKey?: boolean;
}

/**
 * Dispatches a DOM event to the appropriate handler based on event type and
 * target properties.  Returns a status string for testing purposes.
 */
export function dispatchEvent(event: DomEvent, handlers: Record<string, () => void>): string {
  if (event.type === 'click') {
    const handlerKey = `click-${event.target.id}`;
    if (handlerKey in handlers) {
      handlers[handlerKey]();
      return 'handled';
    }
    if ('click-default' in handlers) {
      handlers['click-default']();
      return 'default';
    }
    return 'unhandled';
  }

  if (event.type === 'submit') {
    if (event.target.tagName === 'FORM') {
      handlers['submit']?.();
      return 'submit-handled';
    }
    return 'not-a-form';
  }

  if (event.type === 'keydown') {
    if (event.key === 'Enter' && !event.shiftKey) {
      handlers['enter']?.();
      return 'enter-handled';
    }
    if (event.key === 'Escape') {
      handlers['escape']?.();
      return 'escape-handled';
    }
    return 'key-unhandled';
  }

  if (event.type === 'change') {
    const value = event.target.value ?? '';
    handlers['change']?.();
    return `change:${value.length}`;
  }

  return 'noop';
}
