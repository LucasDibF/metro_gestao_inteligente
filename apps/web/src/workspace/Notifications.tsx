import { useEffect, useRef, useState } from 'react';
import { Bell, Check, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { auth } from '../auth/client';
import type { WorkTarget } from './WorkDestination';
interface Activity extends WorkTarget {
  key: string;
  title: string;
  context: string;
  createdAt: string;
  read: boolean;
}
export function Notifications({
  onOpen,
  onError,
  disabled,
}: {
  onOpen: (target: WorkTarget) => void;
  onError: (e: unknown) => void;
  disabled: boolean;
}) {
  const panel = useRef<HTMLDetailsElement>(null);
  const [items, setItems] = useState<Activity[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  async function refresh(background = false) {
    if (!background) setLoading(true);
    setError('');
    try {
      const result = await auth.request<{ items: Activity[] }>('/workspace/atividades');
      setItems(result.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar as atividades.');
      onError(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh(true);
    }, 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && panel.current)
        panel.current.open = false;
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  async function read(keys: string[]) {
    setBusy(true);
    setError('');
    try {
      await auth.request('/workspace/atividades/lidas', {
        method: 'POST',
        body: JSON.stringify({ keys }),
      });
      setItems((previous) =>
        previous.map((i) => (keys.includes(i.key) ? { ...i, read: true } : i)),
      );
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível marcar como lida.');
      onError(e);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const unread = items.filter((i) => !i.read).length;
  return (
    <details
      className="notifications"
      ref={panel}
      onToggle={() => {
        if (panel.current?.open) void refresh();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          if (panel.current) {
            panel.current.open = false;
            panel.current.querySelector<HTMLElement>('summary')?.focus();
          }
        }
      }}
    >
      <summary aria-label={`Notificações${unread ? `, ${unread} não lidas` : ''}`}>
        <Bell aria-hidden="true" />
        {unread ? (
          <span className="notification-count" aria-hidden="true">
            {unread}
          </span>
        ) : null}
      </summary>
      <section className="notification-panel" aria-label="Atividades recentes">
        <div className="section-heading">
          <h3>Atividades recentes</h3>
          <Button
            icon={RefreshCw}
            className="ghost icon-button"
            disabled={loading || busy}
            aria-label="Atualizar notificações"
            onClick={() => void refresh()}
          />
        </div>
        <p className="help">Até 50 atividades recentes da empresa.</p>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        {loading ? (
          <p role="status">Carregando atividades…</p>
        ) : !items.length ? (
          <p>Nenhuma atividade recente.</p>
        ) : (
          <>
            <Button
              icon={Check}
              className="secondary"
              disabled={disabled || busy || !unread}
              onClick={() => void read(items.filter((i) => !i.read).map((i) => i.key))}
            >
              Marcar todas como lidas
            </Button>
            <ul>
              {items.map((item) => (
                <li key={item.key}>
                  <Button
                    className="activity-link"
                    disabled={disabled || busy}
                    onClick={async () => {
                      if (await read([item.key])) {
                        if (panel.current) panel.current.open = false;
                        onOpen(item);
                      }
                    }}
                  >
                    <span>
                      <strong>
                        {item.read ? '' : 'Não lida · '}
                        {item.title}
                      </strong>
                      <span>{item.context}</span>
                      <small>{new Date(item.createdAt).toLocaleString('pt-BR')}</small>
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </details>
  );
}
