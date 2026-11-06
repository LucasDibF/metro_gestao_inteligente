import { Check, Image, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { photoPurposes, sortPhotosByPurpose, type Photo } from './file-types';
import type { BoreholeFilesState } from './use-borehole-files';

function photoStatus(p: Photo): string {
  if (p.processingState !== 'READY')
    return p.processingState === 'FAILED'
      ? 'Fotografia não processada. Remova o arquivo e envie outra imagem.'
      : 'Processando fotografia…';
  if (p.gpsLatitude === null) return 'Fotografia sem GPS';
  if (p.distanceM === null) return 'GPS disponível; falta uma coordenada oficial.';
  return `Distância aproximada à referência oficial: ${p.distanceM.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m`;
}

/** Photographs ordered by purpose, with preview, edit and two-step removal. */
export function PhotoList({
  photos,
  files,
  canWrite,
}: {
  photos: Photo[];
  files: BoreholeFilesState;
  canWrite: boolean;
}) {
  const { busy, preview, remove } = files;
  return (
    <ul className="work-list photo-list">
      {sortPhotosByPurpose(photos).map((p) => (
        <li key={p.id}>
          <div>
            <h3>{p.caption || photoPurposes[p.purpose ?? ''] || 'Fotografia do furo'}</h3>
            <p>{photoPurposes[p.purpose ?? 'OTHER']}</p>
            <p>{photoStatus(p)}</p>
            {p.gpsWarning ? (
              <p className="notice">
                GPS a mais de 10 m do furo. Confira a localização. A coordenada oficial foi
                preservada.
              </p>
            ) : null}
            {preview?.id === p.id ? (
              <img
                src={preview.url}
                alt={p.caption || 'Fotografia do furo'}
                className="photo-preview"
              />
            ) : null}
          </div>
          <div className="row-actions">
            <Button
              icon={Image}
              className="secondary"
              disabled={busy}
              onClick={() => void files.show(p)}
            >
              Ver fotografia<span className="sr-only"> {p.caption}</span>
            </Button>
            {canWrite ? (
              <>
                <Button
                  icon={Pencil}
                  className="secondary"
                  disabled={busy}
                  onClick={() => files.setPhotoEditor(p)}
                >
                  Editar fotografia<span className="sr-only"> {p.caption}</span>
                </Button>
                {remove === p.id ? (
                  <>
                    <p>Remover esta fotografia da seleção atual?</p>
                    <Button icon={Check} disabled={busy} onClick={() => files.removePhoto(p)}>
                      Confirmar remoção
                    </Button>
                    <Button
                      icon={X}
                      className="secondary"
                      disabled={busy}
                      onClick={() => files.setRemove(null)}
                    >
                      Cancelar remoção
                    </Button>
                  </>
                ) : (
                  <Button
                    icon={Trash2}
                    className="secondary"
                    disabled={busy}
                    onClick={() => files.setRemove(p.id)}
                  >
                    Remover fotografia<span className="sr-only"> {p.caption}</span>
                  </Button>
                )}
              </>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
