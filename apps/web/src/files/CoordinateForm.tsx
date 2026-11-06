import type { FormEvent } from 'react';
import { Save, X } from 'lucide-react';
import { Button } from '../ui/Button';
import {
  coordinateKindLabel,
  type Coordinate,
  type CoordinateInput,
  type CoordinateKind,
} from './file-types';

/** UTM SIRGAS2000 coordinate form for the planned or executed position of a borehole. */
export function CoordinateForm({
  kind,
  current,
  busy,
  onSave,
  onCancel,
}: {
  kind: CoordinateKind;
  current: Coordinate | undefined;
  busy: boolean;
  onSave: (input: CoordinateInput) => void;
  onCancel: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    onSave({
      eastingM: String(values.get('east')),
      northingM: String(values.get('north')),
      zone: Number(values.get('zone')),
      hemisphere: String(values.get('hemisphere')),
      datum: 'SIRGAS2000',
      altitudeM: String(values.get('altitude')) || null,
      reference: String(values.get('reference')),
    });
  }
  return (
    <form className="panel" onSubmit={submit}>
      <fieldset disabled={busy}>
        <legend>Coordenada {coordinateKindLabel(kind)}</legend>
        <div className="field-pair">
          <div>
            <label htmlFor="coord-east">Este (m)</label>
            <input
              id="coord-east"
              name="east"
              type="number"
              required
              min="100000"
              max="900000"
              step="0.01"
              defaultValue={current?.eastingM ?? ''}
            />
          </div>
          <div>
            <label htmlFor="coord-north">Norte (m)</label>
            <input
              id="coord-north"
              name="north"
              type="number"
              required
              min="0"
              max="10000000"
              step="0.01"
              defaultValue={current?.northingM ?? ''}
            />
          </div>
        </div>
        <div className="field-pair">
          <div>
            <label htmlFor="coord-zone">Fuso UTM</label>
            <input
              id="coord-zone"
              name="zone"
              type="number"
              required
              min="1"
              max="60"
              step="1"
              defaultValue={current?.zone ?? ''}
            />
          </div>
          <div>
            <label htmlFor="coord-hemisphere">Hemisfério</label>
            <select
              id="coord-hemisphere"
              name="hemisphere"
              defaultValue={current?.hemisphere ?? 'S'}
            >
              <option value="S">Sul</option>
              <option value="N">Norte</option>
            </select>
          </div>
        </div>
        <label htmlFor="coord-altitude">Altitude em metros (opcional)</label>
        <input
          id="coord-altitude"
          name="altitude"
          type="number"
          min="-500"
          max="9000"
          step="0.01"
          defaultValue={current?.altitudeM ?? ''}
        />
        <label htmlFor="coord-reference">Origem da coordenada</label>
        <input
          id="coord-reference"
          name="reference"
          required
          maxLength={500}
          defaultValue={current?.reference ?? ''}
          placeholder="Ex.: levantamento de campo"
        />
        <p className="help">Alterar uma coordenada oficial exige nova aprovação técnica.</p>
        <div className="form-actions">
          <Button icon={Save}>Salvar coordenada</Button>
          <Button icon={X} className="secondary" type="button" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
