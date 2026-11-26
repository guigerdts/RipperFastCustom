import { el, type Child } from '../dom';

export type BadgeTone = 'accent' | 'ok' | 'warn' | 'danger' | 'muted';

/** Titled content block. */
export function Card(title: string, children: readonly Child[] = []): HTMLElement {
  return el('section', { className: 'rfc-card' }, [
    el('h2', { className: 'rfc-card__title', text: title }),
    ...children,
  ]);
}

export function Badge(text: string, tone: BadgeTone = 'muted'): HTMLElement {
  return el('span', { className: `rfc-badge rfc-badge--${tone}`, text });
}

/** Label/value line used by the dashboard and settings readouts. */
export function StatusRow(label: string, value: string | Node): HTMLElement {
  const valueNode =
    typeof value === 'string'
      ? el('span', { className: 'rfc-status-row__value', text: value })
      : value;
  return el('div', { className: 'rfc-status-row' }, [
    el('span', { className: 'rfc-status-row__label', text: label }),
    valueNode,
  ]);
}

/** Explicit "nothing implemented here yet" block — never a fake screen. */
export function EmptyState(
  title: string,
  body: string,
  children: readonly Child[] = [],
): HTMLElement {
  return el('div', { className: 'rfc-empty' }, [
    el('h3', { className: 'rfc-empty__title', text: title }),
    el('p', { className: 'rfc-empty__body', text: body }),
    ...children,
  ]);
}
