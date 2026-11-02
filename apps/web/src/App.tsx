import { Button } from './ui/Button';
import { hasRole } from './auth/permissions';
import { Access } from './management/Access';
import { Clients } from './management/Clients';
import { ReportCenter } from './workspace/ReportCenter';
import { WorkDestination, type WorkTarget } from './workspace/WorkDestination';
import type { WorkspaceTab } from './ui/AppShell';
import { AppShell } from './ui/AppShell';
import { Trash } from './works/Trash';
import { Works } from './works/Works';
import { useEffect, useState } from 'react';
import { auth, ApiError, type Profile } from './auth/client';
import { Login } from './auth/Login';
import { Security } from './auth/Security';

const roles = {
  ADMIN: 'Administrador',
  ENGINEER: 'Engenheiro',
  OPERATOR: 'Sondador',
  COMMERCIAL: 'Comercial',
  VIEWER: 'Consulta',
};
export function App() {
  const [tab, setTab] = useState<WorkspaceTab>('works');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [target, setTarget] = useState<WorkTarget | null>(null);
  const [message, setMessage] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(true);
  const [development, setDevelopment] = useState(false);
  const [developmentAvailable, setDevelopmentAvailable] = useState(false);
  const [startupAttempt, setStartupAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setStarting(true);
    const restore = async () => {
      const enabled = auth.isDevelopmentSession;
      const available = await auth.developmentAvailable().catch(() => false);
      if (active) setDevelopmentAvailable(available);
      if (auth.hasSession) {
        const profile = await auth.request<Profile>('/auth/me');
        if (active) {
          setProfile({ ...profile, ...(enabled ? { localTesting: true } : {}) });
          setDevelopment(enabled);
          setMessage('');
        }
      }
    };
    void restore()
      .catch((error: unknown) => {
        if (!active || (error instanceof ApiError && error.code === 'SESSION_SUPERSEDED')) return;
        if (auth.hasSession)
          setMessage(
            'Não foi possível conectar ao serviço. Sua sessão foi preservada. Tente novamente.',
          );
        else
          setMessage(
            error instanceof ApiError && error.status === 401
              ? 'Sua sessão expirou. Entre novamente para continuar.'
              : 'Não foi possível iniciar o acesso. Tente novamente.',
          );
      })
      .finally(() => {
        if (active) setStarting(false);
      });
    return () => {
      active = false;
    };
  }, [startupAttempt]);
  function signedOut(message: string) {
    auth.clear();
    setProfile(null);
    setDevelopment(false);
    setRecovery(false);
    setTab('works');
    setTarget(null);
    setMessage(message);
  }
  function error(error: unknown) {
    if (error instanceof ApiError && error.code === 'SESSION_SUPERSEDED') return;
    if (
      (error instanceof ApiError &&
        error.status === 401 &&
        error.code !== 'MFA_VERIFICATION_FAILED') ||
      !auth.hasSession
    )
      signedOut('Sua sessão terminou. Entre novamente para continuar.');
  }
  async function switchTestRole(role: Profile['role']) {
    setBusy(true);
    setMessage('');
    try {
      const updated = await auth.switchDevelopmentRole(role);
      setProfile({ ...updated, localTesting: true });
      setTab('works');
      setTarget(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível trocar o perfil de teste.');
      error(e);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await auth.logout();
      signedOut('Você saiu da sua conta.');
    } catch {
      signedOut('Você saiu deste navegador. Não foi possível confirmar o encerramento no serviço.');
    } finally {
      setBusy(false);
    }
  }
  if (starting)
    return (
      <main className="account">
        <p role="status">Preparando acesso…</p>
      </main>
    );
  if (!profile && auth.hasSession)
    return (
      <main className="account">
        <p role="alert">{message || 'Não foi possível recuperar a sessão.'}</p>
        <Button onClick={() => setStartupAttempt((value) => value + 1)}>Tentar novamente</Button>
      </main>
    );
  if (!profile)
    return (
      <>
        {message ? (
          <div className="notice" role="status">
            {message}
          </div>
        ) : null}
        <Login
          onTestLogin={
            developmentAvailable
              ? async () => {
                  if (!(await auth.developmentLogin()))
                    throw new Error('O acesso de teste não está disponível.');
                  const result = await auth.request<Profile>('/auth/me');
                  setProfile({ ...result, localTesting: true });
                  setDevelopment(true);
                  setMessage('');
                }
              : undefined
          }
          onLogin={async () => {
            const result = await auth.request<Profile>('/auth/me');
            setProfile(result);
            setMessage('');
          }}
        />
      </>
    );
  return (
    <AppShell
      key={[profile.userId, profile.role, ...(profile.additionalRoles ?? [])].join(':')}
      profile={profile}
      tab={tab}
      onTab={(next) => {
        setTab(next);
        setTarget(null);
      }}
      onTarget={(next) => {
        setTarget(next);
        setTab('works');
      }}
      onError={error}
      busy={busy}
      recovery={recovery}
      onLogout={() => void logout()}
      toolbar={
        development ? (
          <section className="development-toolbar" aria-label="Teste local">
            <p>Acesso de teste local</p>
            <label htmlFor="test-role">Perfil de teste</label>
            <select
              id="test-role"
              value={profile.role}
              disabled={busy || recovery}
              onChange={(e) => void switchTestRole(e.target.value as Profile['role'])}
            >
              <option value="ADMIN">Administrador</option>
              <option value="ENGINEER">Engenheiro</option>
              <option value="OPERATOR">Sondador</option>
              <option value="COMMERCIAL">Comercial</option>
              <option value="VIEWER">Consulta</option>
            </select>
            {message ? <p role="alert">{message}</p> : null}
          </section>
        ) : null
      }
    >
      <div className="account-title">
        <div>
          <h1>{profile.tenant.name}</h1>
          <p>
            {[profile.role, ...(profile.additionalRoles ?? [])]
              .map((role) => roles[role])
              .join(' · ')}{' '}
            · Ambiente de trabalho
          </p>
        </div>
        <span className="status">{recovery ? 'Guarde os códigos' : 'Sessão ativa'}</span>
      </div>
      {tab === 'works' ? (
        target ? (
          <WorkDestination
            key={target.workId + (target.boreholeId ?? '')}
            target={target}
            profile={profile}
            onError={error}
            onBack={() => setTarget(null)}
          />
        ) : (
          <Works profile={profile} onError={error} />
        )
      ) : tab === 'access' && hasRole(profile, 'ADMIN') ? (
        <Access
          profile={profile}
          onError={error}
          onProfileChanged={() => {
            void auth.request<Profile>('/auth/me').then(setProfile).catch(error);
          }}
        />
      ) : tab === 'clients' && hasRole(profile, 'ADMIN', 'COMMERCIAL', 'ENGINEER', 'VIEWER') ? (
        <Clients profile={profile} onError={error} />
      ) : tab === 'reports' && hasRole(profile, 'ADMIN', 'COMMERCIAL', 'ENGINEER', 'VIEWER') ? (
        <ReportCenter
          canDownload={profile.canDownloadReports !== false}
          onOpen={(next) => {
            setTarget(next);
            setTab('works');
          }}
          onError={error}
        />
      ) : tab === 'trash' && hasRole(profile, 'ADMIN') ? (
        <Trash onError={error} />
      ) : (
        <Security
          key={profile.userId}
          profile={profile}
          onSignedOut={signedOut}
          onError={error}
          onRecovery={() => setRecovery(true)}
        />
      )}
    </AppShell>
  );
}
