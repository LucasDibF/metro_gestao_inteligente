import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
export function LoadingState({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="ui-loading">
      <Loader2 aria-hidden="true" className="ui-spinner" />
      {children}
    </p>
  );
}
