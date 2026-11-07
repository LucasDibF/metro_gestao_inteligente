import type { Profile } from '../auth/client';
import { roleNames } from '../auth/permissions';

/** Company name (the page's only h1), the roles of the signed-in user and the session state. */
export function AccountTitle({ profile, recovery }: { profile: Profile; recovery: boolean }) {
  return (
    <div className="account-title">
      <div>
        {profile.tenant.profile?.logoDataUrl?.startsWith('data:image/png;base64,') ? (
          <img className="company-logo" src={profile.tenant.profile.logoDataUrl} alt="" />
        ) : null}
        <h1>{profile.tenant.name}</h1>
        <p>
          {[profile.role, ...(profile.additionalRoles ?? [])]
            .map((role) => roleNames[role])
            .join(' · ')}{' '}
          · Ambiente de trabalho
        </p>
      </div>
      <span className="status">{recovery ? 'Guarde os códigos' : 'Sessão ativa'}</span>
    </div>
  );
}
