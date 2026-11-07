import { Pencil, RefreshCw, UserRoundPen } from 'lucide-react';
import { Button } from '../ui/Button';
import { LoadingState } from '../ui/LoadingState';
import { creaRegistration, missingFieldsSentence } from '../profile/professional-profile-form';
import type { ProfessionalProfileState } from '../profile/use-professional-profile';

export const reviewerBlockId = 'reviewer-identity-status';

/**
 * Read-only view of the data an approval copies to the borehole. It always comes from the
 * engineer's profile; changing it means editing the profile.
 */
export function ReviewerIdentity({
  state,
  locked,
  onOpenProfile,
}: {
  state: ProfessionalProfileState;
  /** An approval form is open: leaving now would lose it. */
  locked: boolean;
  onOpenProfile?: () => void;
}) {
  const { profile, loading, error } = state;
  if (loading && !profile) return <LoadingState>Carregando seu perfil profissional…</LoadingState>;
  if (!profile)
    return (
      <div className="error" role="alert" id={reviewerBlockId}>
        <p>
          {error || 'Não foi possível carregar seu perfil profissional.'} A aprovação depende dele.
        </p>
        <Button icon={RefreshCw} className="secondary" onClick={state.reload}>
          Tentar carregar o perfil
        </Button>
      </div>
    );
  if (!profile.complete)
    return (
      <div className="reviewer-blocked" id={reviewerBlockId}>
        <p>
          <strong>Complete seu perfil profissional para aprovar este furo.</strong> Falta preencher:{' '}
          {missingFieldsSentence(profile.missingFields)}.
        </p>
        {onOpenProfile ? (
          <Button
            icon={UserRoundPen}
            className="secondary"
            disabled={locked}
            onClick={onOpenProfile}
          >
            Completar perfil profissional
          </Button>
        ) : null}
      </div>
    );
  return (
    <section className="reviewer-identity" aria-labelledby="reviewer-identity-title">
      <h4 id="reviewer-identity-title">Responsável técnico na aprovação</h4>
      <p className="help">Vem do seu perfil profissional e fica gravado no furo ao aprovar.</p>
      <dl>
        <div>
          <dt>Nome</dt>
          <dd>{profile.fullName}</dd>
        </div>
        <div>
          <dt>Título profissional</dt>
          <dd>{profile.professionalTitle}</dd>
        </div>
        <div>
          <dt>Registro</dt>
          <dd>{creaRegistration(profile)}</dd>
        </div>
      </dl>
      {onOpenProfile ? (
        <Button icon={Pencil} className="secondary" disabled={locked} onClick={onOpenProfile}>
          Editar perfil
        </Button>
      ) : null}
    </section>
  );
}
