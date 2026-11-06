import { Button } from './ui/Button';
import { hasRole, roleNames } from './auth/permissions';
import type { WorkTarget } from './workspace/WorkDestination';
import type { WorkspaceTab } from './ui/AppShell';
import { AppShell } from './ui/AppShell';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { LoadingState } from './ui/LoadingState';
import { auth, ApiError, isCredentialFailure, type Profile } from './auth/client';
import { Login } from './auth/Login';

const Access = lazy(() =>
  import('./management/Access').then((module) => ({ default: module.Access })),
);
const Clients = lazy(() =>
  import('./management/Clients').then((module) => ({ default: module.Clients })),
);
const ReportCenter = lazy(() =>
  import('./workspace/ReportCenter').then((module) => ({ default: module.ReportCenter })),
);
const WorkDestination = lazy(() =>
  import('./workspace/WorkDestination').then((module) => ({ default: module.WorkDestination })),
);
const Trash = lazy(() => import('./works/Trash').then((module) => ({ default: module.Trash })));
const Works = lazy(() => import('./works/Works').then((module) => ({ default: module.Works })));
const Security = lazy(() =>
  import('./auth/Security').then((module) => ({ default: module.Security })),
);

export function App() {
  const [tab, setTab] = useState<WorkspaceTab>('works');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [target, setTarget] = useState<WorkTarget | null>(null);
  const [message, setMessage] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [editing, setEditing] = useState(false);
  const [homeVisit, setHomeVisit] = useState(0);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(true);
  const [development, setDevelopment] = useState(false);
  const [developmentAvailable, setDevelopmentAvailable] = useState(false);
  const [startupAttempt, setStartupAttempt] = useState(0);
  useEffect(() => {
    if (!editing) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [editing]);
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
  const signedOut = useCallback((message: string) => {
    auth.clear();
    setProfile(null);
    setDevelopment(false);
    setRecovery(false);
    setTab('works');
    setTarget(null);
    setMessage(message);
  }, []);
  const error = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.code === 'SESSION_SUPERSEDED') return;
      if (
        (error instanceof ApiError && error.status === 401 && !isCredentialFailure(error.code)) ||
        !auth.hasSession
      )
        signedOut('Sua sessão terminou. Entre novamente para continuar.');
    },
    [signedOut],
  );
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
      editing={editing}
      onHome={() => {
        setTab('works');
        setTarget(null);
        setHomeVisit((value) => value + 1);
      }}
      onLogout={() => void logout()}
      toolbar={
        development ? (
          <section className="development-toolbar" aria-label="Teste local">
            <p>Acesso de teste local</p>
            <label htmlFor="test-role">Perfil de teste</label>
            <select
              id="test-role"
              value={profile.role}
              disabled={busy || recovery || editing}
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
      <Suspense fallback={<LoadingState>Carregando tela…</LoadingState>}>
        {tab === 'works' ? (
          target ? (
            <WorkDestination
              key={target.workId + (target.boreholeId ?? '')}
              target={target}
              profile={profile}
              onError={error}
              onBack={() => setTarget(null)}
              onEditingChange={setEditing}
            />
          ) : (
            <Works key={homeVisit} profile={profile} onError={error} onEditingChange={setEditing} />
          )
        ) : tab === 'access' && hasRole(profile, 'ADMIN') ? (
          <Access
            profile={profile}
            onError={error}
            onEditingChange={setEditing}
            onProfileChanged={() => {
              void auth.request<Profile>('/auth/me').then(setProfile).catch(error);
            }}
          />
        ) : tab === 'clients' && hasRole(profile, 'ADMIN', 'COMMERCIAL', 'ENGINEER', 'VIEWER') ? (
          <Clients profile={profile} onError={error} onEditingChange={setEditing} />
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
      </Suspense>
    </AppShell>
  );
}
