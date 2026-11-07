import { Button } from './ui/Button';
import { hasRole } from './auth/permissions';
import { AccountTitle } from './ui/AccountTitle';
import type { ProfileReturnTarget, WorkTarget } from './workspace/WorkDestination';
import type { WorkspaceTab } from './ui/AppShell';
import { AppShell } from './ui/AppShell';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { LoadingState } from './ui/LoadingState';
import { auth, ApiError, isCredentialFailure, type Profile } from './auth/client';
import { Login } from './auth/Login';
import { DevelopmentToolbar } from './ui/DevelopmentToolbar';
import {
  Access,
  Clients,
  ProfessionalProfile,
  ReportCenter,
  Security,
  Trash,
  WorkDestination,
  Works,
} from './workspace-screens';

export function App() {
  const [tab, setTab] = useState<WorkspaceTab>('works');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [target, setTarget] = useState<WorkTarget | null>(null);
  const [profileReturn, setProfileReturn] = useState<ProfileReturnTarget | null>(null);
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
    setProfileReturn(null);
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
  function openProfessionalProfile(back: ProfileReturnTarget) {
    setProfileReturn(back);
    setTarget(null);
    setTab('professional-profile');
  }
  async function switchTestRole(role: Profile['role']) {
    setBusy(true);
    setMessage('');
    try {
      const updated = await auth.switchDevelopmentRole(role);
      setProfile({ ...updated, localTesting: true });
      setTab('works');
      setTarget(null);
      setProfileReturn(null);
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
        setProfileReturn(null);
      }}
      onTarget={(next) => {
        setTarget(next);
        setTab('works');
        setProfileReturn(null);
      }}
      onError={error}
      busy={busy}
      recovery={recovery}
      editing={editing}
      onHome={() => {
        setTab('works');
        setTarget(null);
        setProfileReturn(null);
        setHomeVisit((value) => value + 1);
      }}
      onLogout={() => void logout()}
      toolbar={
        development ? (
          <DevelopmentToolbar
            role={profile.role}
            disabled={busy || recovery || editing}
            message={message}
            onSwitch={(role) => void switchTestRole(role)}
          />
        ) : null
      }
    >
      <AccountTitle profile={profile} recovery={recovery} />
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
              onOpenProfessionalProfile={openProfessionalProfile}
            />
          ) : (
            <Works
              key={homeVisit}
              profile={profile}
              onError={error}
              onEditingChange={setEditing}
              onOpenProfessionalProfile={openProfessionalProfile}
            />
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
        ) : tab === 'professional-profile' && hasRole(profile, 'ENGINEER') ? (
          <ProfessionalProfile
            onError={error}
            onEditingChange={setEditing}
            back={
              profileReturn
                ? {
                    label: profileReturn.label,
                    onReturn: () => {
                      setTarget(profileReturn.target);
                      setProfileReturn(null);
                      setTab('works');
                    },
                  }
                : undefined
            }
          />
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
