import type { PointerEvent } from 'react';

export function isPalmOrEdgeContact<T extends HTMLElement>(event: PointerEvent<T>): boolean {
  if (event.width > 45 || event.height > 45 || event.width * event.height > 2000) return true;
  const rect = event.currentTarget.getBoundingClientRect();
  const padX = rect.width * 0.075;
  const padY = rect.height * 0.075;
  return (
    event.clientX < rect.left + padX ||
    event.clientX > rect.right - padX ||
    event.clientY < rect.top + padY ||
    event.clientY > rect.bottom - padY
  );
}
