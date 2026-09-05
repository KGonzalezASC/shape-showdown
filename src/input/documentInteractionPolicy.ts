import { useLayoutEffect, useRef } from 'react';

export type DocumentInteractionMode = 'landing' | 'puzzle-picker' | 'gameplay';

interface RegisteredOwner {
  mode: DocumentInteractionMode;
  priority: number;
  order: number;
}

const owners = new Map<symbol, RegisteredOwner>();
let nextOrder = 0;

function applyMode(mode: DocumentInteractionMode): void {
  if (typeof document === 'undefined') return;

  const html = document.documentElement;
  const body = document.body;
  const root = document.getElementById('root');
  const isLanding = mode === 'landing' || mode === 'puzzle-picker';
  const overflow = isLanding ? 'auto' : 'hidden';
  const overscrollBehavior = isLanding ? 'auto' : 'none';
  // Gameplay must use touch-action: none so the browser does not arbitrate
  // scroll/pinch gestures against L/R piece moves on the playfield.
  const touchAction = isLanding ? 'auto' : 'none';

  html.style.height = isLanding ? 'auto' : '100%';
  html.style.minHeight = '100%';
  html.style.overflow = overflow;
  html.style.overscrollBehavior = overscrollBehavior;
  html.style.touchAction = touchAction;

  body.style.height = isLanding ? 'auto' : '100%';
  body.style.minHeight = '100%';
  body.style.overflow = overflow;
  body.style.overscrollBehavior = overscrollBehavior;
  body.style.touchAction = touchAction;

  if (root) {
    root.style.height = isLanding ? 'auto' : '100%';
    root.style.minHeight = '100%';
    root.style.overflow = isLanding ? 'visible' : 'hidden';
    root.style.overscrollBehavior = overscrollBehavior;
    root.style.touchAction = touchAction;
  }

  html.dataset.interaction = mode;
}

function applyCurrentMode(): void {
  let current: RegisteredOwner | null = null;
  owners.forEach((owner) => {
    if (
      current === null
      || owner.priority > current.priority
      || (owner.priority === current.priority && owner.order > current.order)
    ) {
      current = owner;
    }
  });
  applyMode(current?.mode ?? 'landing');
}

/**
 * Registers one route or gameplay phase with the document policy owner.
 * Nested route content can temporarily replace its parent's mode without
 * writing competing document styles of its own.
 */
export function useDocumentInteractionPolicy(mode: DocumentInteractionMode, priority = 0): void {
  const ownerRef = useRef<symbol | null>(null);
  if (ownerRef.current === null) ownerRef.current = Symbol('document-interaction-owner');

  useLayoutEffect(() => {
    const owner = ownerRef.current;
    if (owner === null) return;
    owners.set(owner, { mode, priority, order: nextOrder++ });
    applyCurrentMode();
    return () => {
      owners.delete(owner);
      applyCurrentMode();
    };
  }, [mode]);
}
