import { RefreshCw, Save, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { brazilianStates, type Work } from './work-types';
import type { WorksState } from './use-works';

/** Form that registers a work (with its initial boreholes) or edits or shows one. */
export function WorkEditor({
  works,
  editing,
  canWrite,
}: {
  works: WorksState;
  editing: Work | 'new';
  canWrite: boolean;
}) {
  const { saving, saveError } = works;
  const current = editing !== 'new' ? editing : null;
  return (
    <section className="panel work-editor" aria-labelledby="editor-title">
      <h3 id="editor-title">
        {editing === 'new' ? 'Cadastrar obra' : canWrite ? 'Editar obra' : 'Dados da obra'}
      </h3>
      <form
        key={current ? `${current.id}-${current.version}` : 'new'}
        onSubmit={(event) => void works.save(event)}
        aria-busy={saving}
      >
        <fieldset disabled={saving || !canWrite}>
          <label htmlFor="work-name">Nome da obra</label>
          <input
            id="work-name"
            name="name"
            required
            maxLength={200}
            defaultValue={current?.name ?? ''}
          />
          {editing === 'new' ? (
            <fieldset className="spt-advance">
              <legend>Furos iniciais</legend>
              <label htmlFor="work-hole-count">Quantidade de furos</label>
              <input
                id="work-hole-count"
                name="initialBoreholeCount"
                type="number"
                min="0"
                max="200"
                step="1"
                defaultValue="0"
                required
              />
              <label htmlFor="work-initial-folder">Pasta dos furos (opcional)</label>
              <input id="work-initial-folder" name="initialFolderName" maxLength={120} />
              <p className="help">
                Numeração automática: SP-01, SP-02 e assim por diante. Sem uma pasta, os furos ficam
                diretamente na obra. Para criar a obra sem furos, informe zero.
              </p>
            </fieldset>
          ) : null}
          <label htmlFor="work-client">
            Contratante <span className="optional">(opcional)</span>
          </label>
          <input
            id="work-client"
            name="clientName"
            maxLength={200}
            defaultValue={current?.clientName ?? ''}
          />
          <div className="field-pair">
            <div>
              <label htmlFor="work-city">
                Município <span className="optional">(opcional)</span>
              </label>
              <input
                id="work-city"
                name="city"
                maxLength={120}
                defaultValue={current?.city ?? ''}
              />
            </div>
            <div>
              <label htmlFor="work-state">
                UF <span className="optional">(opcional)</span>
              </label>
              <select id="work-state" name="state" defaultValue={current?.state ?? ''}>
                <option value="">Selecione</option>
                {brazilianStates.map((state) => (
                  <option key={state}>{state}</option>
                ))}
              </select>
            </div>
          </div>
          <label htmlFor="work-address">
            Endereço <span className="optional">(opcional)</span>
          </label>
          <input
            id="work-address"
            name="address"
            maxLength={500}
            defaultValue={current?.address ?? ''}
          />
          {canWrite ? (
            <Button icon={Save} loading={saving} type="submit">
              {saving ? 'Salvando…' : 'Salvar obra'}
            </Button>
          ) : null}
        </fieldset>
      </form>
      {saveError ? (
        <div role="alert" className="error">
          <p>{saveError}</p>
          {current ? (
            <Button
              icon={RefreshCw}
              type="button"
              className="secondary"
              disabled={saving}
              onClick={() => void works.reloadWork()}
            >
              Recarregar dados da obra
            </Button>
          ) : null}
        </div>
      ) : null}
      <Button
        icon={X}
        className="secondary"
        disabled={saving}
        onClick={() => {
          works.setEditing(null);
          works.setSaveError('');
        }}
      >
        Fechar formulário
      </Button>
    </section>
  );
}
