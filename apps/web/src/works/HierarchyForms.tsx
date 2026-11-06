import type { FormEvent } from 'react';
import { Save, X } from 'lucide-react';
import { Button } from '../ui/Button';
import type { Borehole, BoreholeInput, Folder } from './hierarchy-types';

/** Name form for a new or renamed folder. */
export function FolderForm({
  folder,
  busy,
  onSave,
  onCancel,
}: {
  folder: Folder | null;
  busy: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(String(new FormData(event.currentTarget).get('name')).trim());
  }
  return (
    <form className="panel" onSubmit={submit}>
      <fieldset disabled={busy}>
        <label htmlFor="folder-name">Nome da pasta</label>
        <input
          id="folder-name"
          name="name"
          required
          maxLength={120}
          defaultValue={folder?.name ?? ''}
        />
        <Button icon={Save}>Salvar pasta</Button>
        <Button icon={X} type="button" className="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </fieldset>
    </form>
  );
}

/** Identification, folder and planned depth of a new or existing borehole. */
export function BoreholeForm({
  hole,
  selectedFolder,
  folders,
  folderTotal,
  busy,
  onLoadMoreFolders,
  onSave,
  onCancel,
}: {
  hole: Borehole | null;
  selectedFolder: Folder | null;
  folders: Folder[];
  folderTotal: number;
  busy: boolean;
  onLoadMoreFolders: () => void;
  onSave: (input: BoreholeInput) => void;
  onCancel: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    onSave({
      code: String(values.get('code')).trim(),
      folderId: String(values.get('folderId')) || null,
      plannedDepthM: String(values.get('depth')) || null,
    });
  }
  return (
    <form className="panel" onSubmit={submit}>
      <fieldset disabled={busy}>
        <label htmlFor="hole-code">Identificação do furo</label>
        <input
          id="hole-code"
          name="code"
          required
          maxLength={60}
          defaultValue={hole?.code ?? ''}
          placeholder="SP-01"
        />
        <label htmlFor="hole-folder">Pasta</label>
        <select
          id="hole-folder"
          name="folderId"
          defaultValue={hole?.folderId ?? selectedFolder?.id ?? ''}
        >
          <option value="">Sem pasta</option>
          {selectedFolder && !folders.some((folder) => folder.id === selectedFolder.id) ? (
            <option value={selectedFolder.id}>{selectedFolder.name}</option>
          ) : null}
          {hole?.folderId &&
          hole.folderId !== selectedFolder?.id &&
          !folders.some((folder) => folder.id === hole.folderId) ? (
            <option value={hole.folderId}>Pasta atual</option>
          ) : null}
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>
        {folders.length < folderTotal ? (
          <Button type="button" className="secondary" disabled={busy} onClick={onLoadMoreFolders}>
            Carregar mais opções de pasta
          </Button>
        ) : null}
        <label htmlFor="hole-depth">Profundidade planejada em metros (opcional)</label>
        <input
          id="hole-depth"
          name="depth"
          type="number"
          min="0.01"
          max="999999.99"
          step="0.01"
          defaultValue={hole?.plannedDepthM ?? ''}
        />
        <p className="help">A profundidade executada será registrada no lançamento do ensaio.</p>
        <Button icon={Save}>Salvar furo</Button>
        <Button icon={X} type="button" className="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </fieldset>
    </form>
  );
}
