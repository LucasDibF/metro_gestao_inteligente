import type { FormEvent } from 'react';
import { CheckCheck, ClipboardCheck, Undo2, X } from 'lucide-react';
import { Button } from '../ui/Button';
import {
  reviewStateLabels,
  technicalEventNames,
  type ReviewAction,
  type TechnicalData,
} from './technical-types';

function requireNoteText(event: FormEvent<HTMLTextAreaElement>): void {
  const field = event.currentTarget;
  field.setCustomValidity(field.value.trim() ? '' : 'Escreva o parecer da revisão.');
}

/** Technical review state, the submit/approve/return steps and the technical history. */
export function ReviewSection({
  data,
  hidden,
  canWrite,
  canReview,
  busy,
  reviewAction,
  history,
  onAction,
  onToggleHistory,
  onSubmit,
}: {
  data: TechnicalData;
  hidden: boolean;
  canWrite: boolean;
  canReview: boolean;
  busy: boolean;
  reviewAction: ReviewAction | null;
  history: boolean;
  onAction: (action: ReviewAction | null) => void;
  onToggleHistory: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section hidden={hidden} aria-labelledby="review-title">
      <h3 id="review-title">Revisão técnica</h3>
      <p>
        <strong>{reviewStateLabels[data.hole.reviewState]}</strong> · Versão técnica{' '}
        {data.hole.technicalVersion}
      </p>
      <p className="help">
        Alterar ensaios, solo ou dados de campo exige nova revisão. Para enviar, preencha a data, a
        profundidade executada, os ensaios e todas as camadas do perfil.
      </p>
      {data.hole.reviewerName ? (
        <p>
          Responsável: {data.hole.reviewerName} · Registro: {data.hole.reviewerRegistration}
        </p>
      ) : null}
      {data.hole.reviewNote ? <p>{data.hole.reviewNote}</p> : null}
      {!reviewAction ? (
        <div className="form-actions">
          {canWrite && data.hole.reviewState === 'DRAFT' ? (
            <Button
              icon={ClipboardCheck}
              disabled={busy}
              onClick={() => onAction('enviar-revisao')}
            >
              Enviar para análise
            </Button>
          ) : null}
          {canReview && data.hole.reviewState === 'IN_REVIEW' ? (
            <>
              <Button icon={CheckCheck} disabled={busy} onClick={() => onAction('aprovar')}>
                Aprovar tecnicamente
              </Button>
              <Button
                icon={Undo2}
                className="secondary"
                disabled={busy}
                onClick={() => onAction('devolver')}
              >
                Devolver para correção
              </Button>
            </>
          ) : null}
        </div>
      ) : (
        <form className="panel" onSubmit={onSubmit}>
          <fieldset disabled={busy}>
            {reviewAction === 'aprovar' ? (
              <>
                <label htmlFor="reviewer-name">Nome do responsável técnico</label>
                <input id="reviewer-name" name="name" maxLength={200} required />
                <label htmlFor="reviewer-registration">Registro profissional</label>
                <input id="reviewer-registration" name="registration" maxLength={100} required />
              </>
            ) : null}
            <label htmlFor="review-note">Parecer ou observações da revisão</label>
            <textarea
              id="review-note"
              name="note"
              maxLength={2000}
              rows={3}
              required
              onInput={requireNoteText}
            />
            <div className="form-actions">
              <Button
                icon={
                  reviewAction === 'aprovar'
                    ? CheckCheck
                    : reviewAction === 'devolver'
                      ? Undo2
                      : ClipboardCheck
                }
              >
                {reviewAction === 'aprovar'
                  ? 'Confirmar aprovação'
                  : reviewAction === 'devolver'
                    ? 'Confirmar devolução'
                    : 'Confirmar envio para análise'}
              </Button>
              <Button icon={X} type="button" className="secondary" onClick={() => onAction(null)}>
                Cancelar
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      <Button className="secondary" onClick={onToggleHistory} aria-expanded={history}>
        {history ? 'Ocultar histórico' : 'Ver histórico técnico'}
      </Button>
      {history ? (
        <ul className="work-list">
          {data.events.map((e) => (
            <li key={e.id}>
              <div>
                <p>
                  {technicalEventNames[e.action] ?? 'Alteração técnica'} · Versão{' '}
                  {e.technicalVersion}
                </p>
                <p>{new Date(e.createdAt).toLocaleString('pt-BR')}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
