import type { FormEvent } from 'react';
import { Pencil, Save, X } from 'lucide-react';
import { Button } from '../ui/Button';
import type { TechnicalData } from './technical-types';

/** Executed depth, water level and field date of the borehole, with their editor. */
export function FieldDataSection({
  hole,
  hidden,
  canWrite,
  busy,
  editing,
  formKey,
  onEdit,
  onCancel,
  onSubmit,
}: {
  hole: TechnicalData['hole'];
  hidden: boolean;
  canWrite: boolean;
  busy: boolean;
  editing: boolean;
  formKey: string;
  onEdit: () => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section hidden={hidden} aria-labelledby="field-title">
      <div className="section-heading">
        <h3 id="field-title">Dados de campo</h3>
        {canWrite && !editing ? (
          <Button icon={Pencil} className="secondary" disabled={busy} onClick={onEdit}>
            Editar dados de campo
          </Button>
        ) : null}
      </div>
      <p>
        Profundidade executada: {hole.executedDepthM ?? 'Não informada'} m · Nível d’água:{' '}
        {hole.waterLevelM ?? 'Não informado'}
        {hole.waterLevelM ? ' m' : ''}
      </p>
      <p>
        Data de campo:{' '}
        {hole.fieldDate
          ? new Date(hole.fieldDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
          : 'Não informada'}
      </p>
      {editing ? (
        <form className="panel" key={formKey} onSubmit={onSubmit}>
          <fieldset disabled={busy}>
            <label htmlFor="field-date">Data de campo</label>
            <input
              id="field-date"
              name="date"
              type="date"
              defaultValue={hole.fieldDate?.slice(0, 10) ?? ''}
            />
            <label htmlFor="executed-depth">Profundidade executada em metros</label>
            <input
              id="executed-depth"
              name="executed"
              type="number"
              min="0.01"
              max="999999.99"
              step="0.01"
              defaultValue={hole.executedDepthM ?? ''}
            />
            <label htmlFor="water-level">Nível d’água em metros (opcional)</label>
            <input
              id="water-level"
              name="water"
              type="number"
              min="0"
              max="999999.99"
              step="0.01"
              defaultValue={hole.waterLevelM ?? ''}
            />
            <p className="help">
              Deixar vazio indica ausência de informação. Zero indica água na superfície.
            </p>
            <div className="form-actions">
              <Button icon={Save}>Salvar dados de campo</Button>
              <Button icon={X} type="button" className="secondary" onClick={onCancel}>
                Cancelar
              </Button>
            </div>
          </fieldset>
        </form>
      ) : null}
    </section>
  );
}
