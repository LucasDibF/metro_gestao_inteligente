import { useEffect, useState } from 'react';
import { auth, type Profile } from '../auth/client';
import { SptTests } from '../spt/SptTests';
import { Reports } from '../reports/Reports';
import { LoadingState } from '../ui/LoadingState';
import { Button } from '../ui/Button';
import { ArrowLeft } from 'lucide-react';
import type { FuroSection } from '../spt/FuroNavigation';
export interface WorkTarget {
  workId: string;
  boreholeId?: string | null;
  reportId?: string | null;
  /** Borehole section to open first; the profile's default otherwise. */
  section?: FuroSection;
}
/** A borehole to come back to after the professional profile, with the button's label. */
export interface ProfileReturnTarget {
  target: WorkTarget;
  label: string;
}
export function WorkDestination({
  target,
  profile,
  onBack,
  onError,
  onEditingChange,
  onOpenProfessionalProfile,
}: {
  target: WorkTarget;
  profile: Profile;
  onBack: () => void;
  onError: (e: unknown) => void;
  onEditingChange?: (editing: boolean) => void;
  /** Leaves the borehole for the professional profile, remembering where to come back. */
  onOpenProfessionalProfile?: (back: ProfileReturnTarget) => void;
}) {
  const [work, setWork] = useState<{ id: string; name: string } | null>(null),
    [hole, setHole] = useState<{ id: string; code: string } | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([
      auth.request<{ id: string; name: string }>(`/obras/${target.workId}`),
      target.boreholeId
        ? auth.request<{ hole: { id: string; code: string } }>(
            `/obras/${target.workId}/furos/${target.boreholeId}/tecnico`,
          )
        : Promise.resolve(null),
    ])
      .then(([w, h]) => {
        if (active) {
          setWork(w);
          setHole(h?.hole ?? null);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          onError(e);
        }
      });
    return () => {
      active = false;
    };
  }, [target.workId, target.boreholeId, onError]);
  if (error)
    return (
      <div className="error" role="alert">
        <p>{error}</p>
        <Button icon={ArrowLeft} className="secondary" onClick={onBack}>
          Voltar
        </Button>
      </div>
    );
  if (!work || (target.boreholeId && !hole))
    return <LoadingState>Carregando registro…</LoadingState>;
  return hole ? (
    <SptTests
      workId={work.id}
      workName={work.name}
      hole={hole}
      profile={profile}
      onError={onError}
      onBack={onBack}
      onEditingChange={onEditingChange}
      initialSection={target.section}
      onOpenProfessionalProfile={onOpenProfessionalProfile}
    />
  ) : (
    <Reports
      work={work}
      profile={profile}
      onError={onError}
      onBack={onBack}
      onEditingChange={onEditingChange}
    />
  );
}
