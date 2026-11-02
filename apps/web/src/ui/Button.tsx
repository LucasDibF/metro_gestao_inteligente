import { Loader2, type LucideIcon } from 'lucide-react';
import type { ComponentProps } from 'react';

/** Shared button keeps native form behavior and accessible names intact. */
export function Button({
  icon: Icon,
  loading = false,
  children,
  className = '',
  disabled,
  ...props
}: ComponentProps<'button'> & { icon?: LucideIcon; loading?: boolean }) {
  return (
    <button {...props} className={`ui-button ${className}`} disabled={disabled || loading}>
      {loading ? (
        <Loader2 aria-hidden="true" className="ui-spinner" />
      ) : Icon ? (
        <Icon aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
}
