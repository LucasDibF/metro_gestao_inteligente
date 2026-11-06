import { useCallback, useEffect, useState } from 'react';
import { auth } from '../auth/client';
import type { ProfessionalProfile } from './professional-profile-form';

export const professionalProfilePath = '/perfil-profissional';

export interface ProfessionalProfileState {
  profile: ProfessionalProfile | null;
  loading: boolean;
  /** Message of the last failed read; empty when the read worked. */
  error: string;
  reload: () => void;
  /** Replaces the profile with what a successful save returned. */
  replace: (profile: ProfessionalProfile) => void;
}

/** Reads the signed-in engineer's own professional profile while `enabled` is true. */
export function useProfessionalProfile({
  enabled = true,
  onError,
}: {
  enabled?: boolean;
  onError: (error: unknown) => void;
}): ProfessionalProfileState {
  const [profile, setProfile] = useState<ProfessionalProfile | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true);
    setError('');
    auth
      .request<ProfessionalProfile>(professionalProfilePath)
      .then((value) => {
        if (active) setProfile(value);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setProfile(null);
        setError(
          e instanceof Error ? e.message : 'Não foi possível carregar o perfil profissional.',
        );
        onError(e);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [enabled, attempt, onError]);
  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  return { profile, loading, error, reload, replace: setProfile };
}
