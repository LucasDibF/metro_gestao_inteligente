import { useEffect, useState, type FormEvent } from 'react';
import { Send, X } from 'lucide-react';
import { auth } from '../auth/client';
import { Button } from '../ui/Button';
import { FieldChecklist, type ChecklistItem } from './FieldChecklist';

type SubmissionData = {
  hole: { technicalVersion: number; reviewState: string; reviewNote: string | null };
  checklist: ChecklistItem[];
};
export function FieldSubmission({
  workId,
  boreholeId,
  onSubmitted,
  onError,
  onEditingChange,
}: {
  workId: string;
  boreholeId: string;
  onSubmitted: () => void;
  onError: (error: unknown) => void;
  onEditingChange?: (editing: boolean) => void;
}) {
  const [data, setData] = useState<SubmissionData | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const base = `/obras/${workId}/furos/${boreholeId}/tecnico`;
  useEffect(() => {
    let active = true;
    auth
      .request<SubmissionData>(base)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((error) => {
        if (active) {
          setError(
            error instanceof Error ? error.message : 'Não foi possível carregar a conferência.',
          );
          onError(error);
        }
      });
    return () => {
      active = false;
    };
  }, [base, onError, revision]);
  useEffect(() => {
    onEditingChange?.(editing);
    return () => onEditingChange?.(false);
  }, [editing, onEditingChange]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || busy) return;
    const note = String(new FormData(event.currentTarget).get('note'));
    setBusy(true);
    setError('');
    try {
      await auth.request(base + '/enviar-revisao', {
        method: 'POST',
        body: JSON.stringify({
          technicalVersion: data.hole.technicalVersion,
          note,
        }),
      });
      setEditing(false);
      onSubmitted();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Não foi possível enviar. Confira os dados e tente novamente.',
      );
      onError(error);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return error ? (
      <div role="alert" className="error">
        <p>{error}</p>
        <Button
          className="secondary"
          onClick={() => {
            setError('');
            setRevision((v) => v + 1);
          }}
        >
          Recarregar conferência
        </Button>
      </div>
    ) : null;
  if (data.hole.reviewState !== 'DRAFT') return null;
  return (
    <section aria-labelledby="field-send-title">
      {error ? (
        <div role="alert" className="error">
          <p>{error}</p>
          <Button
            className="secondary"
            type="button"
            disabled={busy}
            onClick={() => setRevision((v) => v + 1)}
          >
            Atualizar conferência
          </Button>
        </div>
      ) : null}
      <h3 id="field-send-title">Concluir registro de campo</h3>
      <p>
        Confira os dados antes de enviar. Após o envio, a edição fica bloqueada até uma devolução do
        engenheiro.
      </p>
      <FieldChecklist items={data.checklist.filter((item) => item.stage === 'review')} />
      {data.hole.reviewNote ? <p>Últimas orientações: {data.hole.reviewNote}</p> : null}
      {editing ? (
        <form onSubmit={submit} className="panel">
          <fieldset disabled={busy}>
            <label htmlFor="field-send-note">Observações para o engenheiro</label>
            <textarea id="field-send-note" name="note" required maxLength={2000} rows={3} />
            <div className="form-actions">
              <Button icon={Send}>Confirmar envio para análise</Button>
              <Button
                icon={X}
                type="button"
                className="secondary"
                onClick={() => setEditing(false)}
              >
                Cancelar
              </Button>
            </div>
          </fieldset>
        </form>
      ) : (
        <Button icon={Send} onClick={() => setEditing(true)}>
          Enviar para análise
        </Button>
      )}
    </section>
  );
}
