import { Button } from '../ui/Button';
import { Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { auth } from '../auth/client';
export function TrashAction({
  path,
  version,
  label,
  onDone,
  onError,
  actionLabel = 'Lixeira',
}: {
  actionLabel?: string;
  path: string;
  version: number;
  label: string;
  onDone: () => void;
  onError: (error: unknown) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function remove() {
    setBusy(true);
    setError('');
    try {
      await auth.request(path, { method: 'DELETE', body: JSON.stringify({ version }) });
      onDone();
      setConfirm(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível mover para a lixeira.');
      onError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="trash-action">
      {confirm ? (
        <div className="trash-confirm" role="group" aria-label={`Confirmar exclusão de ${label}`}>
          <p>
            Enviar <strong>{label}</strong> para a lixeira? O registro poderá ser restaurado por um
            administrador.
          </p>
          <Button icon={Trash2} loading={busy} className="danger" disabled={busy} onClick={remove}>
            Confirmar envio
          </Button>
          <Button
            icon={X}
            className="secondary"
            disabled={busy}
            onClick={() => {
              setConfirm(false);
              setError('');
            }}
          >
            Cancelar envio
          </Button>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <Button
          icon={Trash2}
          className="secondary"
          onClick={() => setConfirm(true)}
          aria-label={`Mover ${label} para a lixeira`}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
