import { useEffect, useId, useState } from 'react';
import {
  ChevronRight,
  FileText,
  Folder as FolderIcon,
  FolderOpen,
  Pencil,
  RefreshCw,
} from 'lucide-react';
import { auth } from '../auth/client';
import { TrashAction } from './TrashAction';
interface Folder {
  id: string;
  name: string;
  version: number;
}
export interface TreeHole {
  id: string;
  code: string;
  folderId: string | null;
  plannedDepthM: string | null;
  version: number;
}
interface HolePage {
  items: TreeHole[];
  total: number;
  page: number;
  pageSize: number;
}
interface TreeProps {
  workId: string;
  workName: string;
  folders: Folder[];
  selectedId: string | null;
  revision: number;
  busy: boolean;
  canWrite: boolean;
  canDelete: boolean;
  onSelect: (folder: Folder | null) => void;
  onOpenHole: (hole: TreeHole) => void;
  onRename: (folder: Folder) => void;
  onRemoved: (folder: Folder) => void;
  onError: (error: unknown) => void;
}
export function FolderTree(props: TreeProps) {
  const [expanded, setExpanded] = useState(true),
    id = useId();
  return (
    <nav className="folder-tree" aria-label="Árvore de pastas e furos">
      <button
        className="tree-label tree-work"
        aria-label={`${expanded ? 'Recolher' : 'Expandir'} organização de ${props.workName}`}
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded((value) => !value)}
      >
        <ChevronRight aria-hidden="true" className="tree-chevron" />
        {expanded ? <FolderOpen aria-hidden="true" /> : <FolderIcon aria-hidden="true" />}
        <span>{props.workName}</span>
      </button>
      <div
        id={id}
        className={`tree-children-wrapper ${expanded ? 'is-open' : ''}`}
        inert={!expanded}
        aria-hidden={!expanded}
      >
        <div className="tree-children">
          <ul>
            {props.folders.map((folder) => (
              <FolderNode key={folder.id} {...props} folder={folder} />
            ))}
            <FolderNode {...props} folder={null} />
          </ul>
        </div>
      </div>
    </nav>
  );
}
function FolderNode(props: TreeProps & { folder: Folder | null }) {
  const { folder, workId, selectedId, revision } = props,
    id = useId(),
    selected = selectedId === (folder?.id ?? null);
  const [expanded, setExpanded] = useState(selected),
    [data, setData] = useState<HolePage | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0),
    [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
    setData(null);
  }, [revision]);
  useEffect(() => {
    if (folder && !expanded) return;
    let active = true;
    setLoading(true);
    setError('');
    auth
      .request<HolePage>(`/obras/${workId}/furos?folderId=${folder?.id ?? 'root'}&page=${page}`)
      .then((result) => {
        if (active)
          setData((old) => ({
            ...result,
            items:
              page === 1
                ? result.items
                : [
                    ...(old?.items ?? []),
                    ...result.items.filter(
                      (item) => !old?.items.some((other) => other.id === item.id),
                    ),
                  ],
          }));
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          props.onError(e);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [expanded, workId, folder?.id, page, revision, retry]);
  const label = folder?.name ?? 'Furos';
  function toggle() {
    setExpanded(!expanded);
    props.onSelect(folder);
  }
  const children = (
    <>
      {data?.items.map((hole) => (
        <li className="tree-item" key={hole.id}>
          <button
            className="file-item"
            disabled={props.busy}
            aria-label={`Abrir ensaios de ${hole.code} na árvore`}
            onClick={() => props.onOpenHole(hole)}
          >
            <FileText aria-hidden="true" />
            <span>{hole.code}</span>
          </button>
        </li>
      ))}
      {loading ? (
        <li className="tree-state" role="status">
          Carregando furos…
        </li>
      ) : error ? (
        <li className="tree-state">
          <p role="alert">{error}</p>
          <button className="file-item" onClick={() => setRetry((v) => v + 1)}>
            Tentar novamente
          </button>
        </li>
      ) : null}
      {data && data.items.length < data.total ? (
        <li className="tree-state">
          <button
            className="file-item"
            disabled={loading || props.busy}
            onClick={() => setPage((v) => v + 1)}
          >
            Carregar mais furos
          </button>
        </li>
      ) : null}
    </>
  );
  if (!folder) return children;
  return (
    <li className="tree-item">
      <div className="tree-folder-row">
        <button
          className={`tree-label ${selected ? 'is-selected' : ''}`}
          disabled={props.busy}
          aria-label={folder ? `Abrir pasta ${label}` : 'Consultar furos sem pasta'}
          aria-expanded={expanded}
          aria-controls={id}
          aria-current={selected ? 'location' : undefined}
          onClick={toggle}
        >
          <ChevronRight className="tree-chevron" aria-hidden="true" />
          {expanded ? <FolderOpen aria-hidden="true" /> : <FolderIcon aria-hidden="true" />}
          <span>{label}</span>
        </button>
        {folder && (props.canWrite || props.canDelete) ? (
          <div className="tree-node-actions">
            {props.canWrite ? (
              <button
                className="tree-action"
                disabled={props.busy}
                aria-label={`Renomear ${label}`}
                title="Renomear pasta"
                onClick={() => props.onRename(folder)}
              >
                <Pencil aria-hidden="true" />
              </button>
            ) : null}
            {props.canDelete ? (
              <TrashAction
                path={`/obras/${workId}/pastas/${folder.id}`}
                version={folder.version}
                label={label}
                onError={props.onError}
                onDone={() => props.onRemoved(folder)}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      <div
        id={id}
        className={`tree-children-wrapper ${expanded ? 'is-open' : ''}`}
        inert={!expanded}
        aria-hidden={!expanded}
      >
        <div className="tree-children">
          <ul>
            {children}
            {!loading && !error && data && !data.total ? (
              <li className="tree-state">Nenhum furo nesta pasta.</li>
            ) : null}
          </ul>
        </div>
      </div>
    </li>
  );
}
