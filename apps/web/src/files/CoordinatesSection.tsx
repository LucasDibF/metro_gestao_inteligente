import { Pencil, Plus } from 'lucide-react';
import { hasRole } from '../auth/permissions';
import type { Profile } from '../auth/client';
import { Button } from '../ui/Button';
import { CoordinateForm } from './CoordinateForm';
import { coordinateKindLabel, type BoreholeFiles } from './file-types';
import type { BoreholeFilesState } from './use-borehole-files';

/** Planned and executed coordinates, the official choice and the coordinate editor. */
export function CoordinatesSection({
  data,
  files,
  profile,
  canWrite,
  hidden,
}: {
  data: BoreholeFiles;
  files: BoreholeFilesState;
  profile: Profile;
  canWrite: boolean;
  hidden: boolean;
}) {
  const { busy, kind } = files;
  return (
    <div hidden={hidden}>
      <h4>Coordenadas do furo</h4>
      <p className="help">
        UTM, datum SIRGAS2000. Escolha uma referência oficial para usar nos croquis e relatórios. O
        GPS da fotografia serve apenas para conferência.
      </p>
      <ul className="work-list">
        {data.coordinates.map((c) => (
          <li key={c.id}>
            <div>
              <h3>
                {c.kind === 'PLANNED' ? 'Planejada' : 'Executada'}
                {data.officialCoordinateId === c.id ? ' · Oficial' : ''}
              </h3>
              <p>
                E {c.eastingM} m · N {c.northingM} m · Fuso {c.zone}
                {c.hemisphere}
              </p>
              <p>{c.reference}</p>
            </div>
            {canWrite && (c.kind !== 'PLANNED' || hasRole(profile, 'ENGINEER')) ? (
              <div className="row-actions">
                <Button
                  icon={Pencil}
                  className="secondary"
                  disabled={busy || !!kind}
                  onClick={() => files.setKind(c.kind)}
                >
                  Editar coordenada {coordinateKindLabel(c.kind)}
                </Button>
                {data.officialCoordinateId !== c.id ? (
                  <Button
                    className="secondary"
                    disabled={busy}
                    onClick={() => files.makeOfficial(c)}
                  >
                    Usar como oficial
                    <span className="sr-only"> {coordinateKindLabel(c.kind)}</span>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {canWrite && !kind ? (
        <div className="form-actions">
          {hasRole(profile, 'ENGINEER') && !data.coordinates.some((c) => c.kind === 'PLANNED') ? (
            <Button
              icon={Plus}
              className="secondary"
              disabled={busy}
              onClick={() => files.setKind('PLANNED')}
            >
              Adicionar coordenada planejada
            </Button>
          ) : null}
          {!data.coordinates.some((c) => c.kind === 'EXECUTED') ? (
            <Button
              icon={Plus}
              className="secondary"
              disabled={busy}
              onClick={() => files.setKind('EXECUTED')}
            >
              Adicionar coordenada executada
            </Button>
          ) : null}
        </div>
      ) : null}
      {kind ? (
        <CoordinateForm
          key={kind + '-' + files.revision}
          kind={kind}
          current={files.current}
          busy={busy}
          onSave={files.saveCoordinate}
          onCancel={() => files.setKind(null)}
        />
      ) : null}
    </div>
  );
}
