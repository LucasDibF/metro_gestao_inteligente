import type { FormEvent } from 'react';
import { Pencil, Plus, Save, X } from 'lucide-react';
import { Button } from '../ui/Button';
import type { Layer } from './technical-types';

/** Collapsible list of soil layers with the layer editor for engineers. */
export function SoilLayersSection({
  layers,
  layerEditor,
  hidden,
  canWrite,
  busy,
  onEdit,
  onCancel,
  onSubmit,
}: {
  layers: Layer[];
  layerEditor: Layer | 'new' | null;
  hidden: boolean;
  canWrite: boolean;
  busy: boolean;
  onEdit: (layer: Layer | 'new') => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const layer = layerEditor && layerEditor !== 'new' ? layerEditor : null;
  return (
    <details hidden={hidden} open={layerEditor ? true : undefined}>
      <summary>Ajustar camadas de solo</summary>
      <section aria-labelledby="soil-title">
        <div className="section-heading">
          <h3 id="soil-title">Camadas de solo</h3>
          {canWrite && !layerEditor ? (
            <Button icon={Plus} disabled={busy} onClick={() => onEdit('new')}>
              Adicionar camada
            </Button>
          ) : null}
        </div>
        <p className="help">
          O tipo e a descrição são informados pelo responsável. O sistema não deduz o solo a partir
          do N-SPT.
        </p>
        {layerEditor ? (
          <form className="panel" key={layer?.id ?? 'new'} onSubmit={onSubmit}>
            <fieldset disabled={busy}>
              <div className="field-pair">
                <div>
                  <label htmlFor="soil-from">De (m)</label>
                  <input
                    id="soil-from"
                    name="from"
                    required
                    type="number"
                    min="0"
                    max="999999.99"
                    step="0.01"
                    defaultValue={layer?.fromM ?? ''}
                  />
                </div>
                <div>
                  <label htmlFor="soil-to">Até (m)</label>
                  <input
                    id="soil-to"
                    name="to"
                    required
                    type="number"
                    min="0.01"
                    max="999999.99"
                    step="0.01"
                    defaultValue={layer?.toM ?? ''}
                  />
                </div>
              </div>
              <label htmlFor="soil-type">Tipo de solo</label>
              <input
                id="soil-type"
                name="type"
                required
                pattern=".*\S.*"
                title="Informe o tipo de solo."
                maxLength={120}
                defaultValue={layer?.soilType ?? ''}
                placeholder="Ex.: areia siltosa"
              />
              <label htmlFor="soil-description">Descrição da camada (opcional)</label>
              <textarea
                id="soil-description"
                name="description"
                rows={4}
                maxLength={2000}
                defaultValue={layer?.description ?? ''}
                placeholder="Cor, composição e observações de campo"
              />
              <div className="form-actions">
                <Button icon={Save}>Salvar camada</Button>
                <Button icon={X} type="button" className="secondary" onClick={onCancel}>
                  Cancelar
                </Button>
              </div>
            </fieldset>
          </form>
        ) : null}
        {layers.length ? (
          <ul className="work-list">
            {layers.map((l) => (
              <li key={l.id}>
                <div>
                  <h3>
                    {l.fromM}–{l.toM} m · {l.soilType}
                  </h3>
                  <p className="soil-description">{l.description}</p>
                </div>
                {canWrite ? (
                  <Button
                    icon={Pencil}
                    className="secondary"
                    disabled={busy || !!layerEditor}
                    onClick={() => onEdit(l)}
                  >
                    Editar camada
                    <span className="sr-only">
                      {' '}
                      de {l.fromM} a {l.toM} m
                    </span>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>Nenhuma camada registrada.</p>
        )}
      </section>
    </details>
  );
}
