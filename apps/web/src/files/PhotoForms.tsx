import type { FormEvent } from 'react';
import { Save, Upload, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { photoPurposes, type Photo, type PhotoChanges } from './file-types';

const cropFields = ['x', 'y', 'width', 'height'] as const;
const cropLabels: Record<(typeof cropFields)[number], string> = {
  x: 'Início horizontal (%)',
  y: 'Início vertical (%)',
  width: 'Largura (%)',
  height: 'Altura (%)',
};

function PurposeOptions() {
  return (
    <>
      {Object.entries(photoPurposes).map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </>
  );
}

/** Upload form for a new JPEG or PNG photograph with its purpose and caption. */
export function PhotoUploadForm({
  busy,
  onUpload,
  onCancel,
}: {
  busy: boolean;
  onUpload: (values: FormData) => void;
  onCancel: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onUpload(new FormData(event.currentTarget));
  }
  return (
    <form className="panel" onSubmit={submit}>
      <fieldset disabled={busy}>
        <label htmlFor="photo-file">Fotografia JPEG ou PNG (até 8 MB)</label>
        <input id="photo-file" name="file" type="file" accept="image/jpeg,image/png" required />
        <label htmlFor="photo-purpose">Finalidade da fotografia</label>
        <select id="photo-purpose" name="purpose" defaultValue="OTHER">
          <PurposeOptions />
        </select>
        <label htmlFor="photo-caption">Legenda da fotografia (opcional)</label>
        <input id="photo-caption" name="caption" maxLength={500} />
        <p className="help">
          O original é preservado em armazenamento privado. Fotografias sem GPS também podem ser
          utilizadas.
        </p>
        <div className="form-actions">
          <Button icon={Upload}>Enviar fotografia</Button>
          <Button icon={X} type="button" className="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

/** Caption, purpose and report crop of an existing photograph; the original stays intact. */
export function PhotoEditorForm({
  photo,
  busy,
  onSave,
  onCancel,
}: {
  photo: Photo;
  busy: boolean;
  onSave: (changes: PhotoChanges) => void;
  onCancel: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    onSave({
      caption: String(values.get('caption')),
      purpose: String(values.get('purpose')),
      crop: Object.fromEntries(cropFields.map((k) => [k, Number(values.get(k)) / 100])),
    });
  }
  return (
    <form className="panel" onSubmit={submit}>
      <fieldset disabled={busy}>
        <legend>Legenda e recorte da fotografia</legend>
        <label htmlFor="edit-photo-purpose">Finalidade</label>
        <select id="edit-photo-purpose" name="purpose" defaultValue={photo.purpose ?? 'OTHER'}>
          <PurposeOptions />
        </select>
        <label htmlFor="edit-photo-caption">Legenda (opcional)</label>
        <input
          id="edit-photo-caption"
          name="caption"
          maxLength={500}
          defaultValue={photo.caption}
        />
        <p className="help">
          Recorte em porcentagem da imagem: origem no canto superior esquerdo. Aplicado ao
          relatório; o original permanece intacto.
        </p>
        {cropFields.map((k) => (
          <div key={k}>
            <label htmlFor={'crop-' + k}>{cropLabels[k]}</label>
            <input
              id={'crop-' + k}
              name={k}
              type="number"
              required
              min={k === 'x' || k === 'y' ? '0' : '0.01'}
              max="100"
              step="0.01"
              defaultValue={photo.crop[k] * 100}
            />
          </div>
        ))}
        <div className="form-actions">
          <Button icon={Save}>Salvar legenda e recorte</Button>
          <Button icon={X} className="secondary" type="button" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
