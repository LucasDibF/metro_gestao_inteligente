import { hasRole } from '../auth/permissions';
import { Notifications } from '../workspace/Notifications';
import type { WorkTarget } from '../workspace/WorkDestination';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Users,
  UserCog,
  FolderOpen,
  ShieldCheck,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  Sun,
  Moon,
  LogOut,
  UserRound,
  FileText,
} from 'lucide-react';
import type { Profile } from '../auth/client';
import { Button } from './Button';
import { Brand } from './Brand';

export type WorkspaceTab = 'works' | 'security' | 'trash' | 'reports' | 'clients' | 'access';
const items = [
  { id: 'works', label: 'Obras', icon: FolderOpen },
  { id: 'clients', label: 'Clientes', icon: Users },
  { id: 'access', label: 'Acessos', icon: UserCog },
  { id: 'reports', label: 'Relatórios', icon: FileText },
  { id: 'security', label: 'Segurança da conta', icon: ShieldCheck },
  { id: 'trash', label: 'Lixeira', icon: Trash2 },
] as const;
const editingLockId = 'navigation-lock-reason';
export function AppShell({
  profile,
  tab,
  onTab,
  busy,
  recovery,
  editing,
  onHome,
  onLogout,
  toolbar,
  onTarget,
  onError,
  children,
}: {
  profile: Profile;
  tab: WorkspaceTab;
  onTab: (tab: WorkspaceTab) => void;
  busy: boolean;
  recovery: boolean;
  editing: boolean;
  onHome: () => void;
  onLogout: () => void;
  toolbar?: ReactNode;
  onTarget: (target: WorkTarget) => void;
  onError: (error: unknown) => void;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('spt.sidebarCollapsed') === '1';
    } catch {
      return false;
    }
  });
  const [theme, setTheme] = useState(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  );
  const drawer = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [closing, setClosing] = useState(false);
  const locked = recovery || editing;
  const lockDescription = editing ? editingLockId : undefined;
  useEffect(() => {
    const media = matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => {
      if (media.matches) drawer.current?.close();
    };
    media.addEventListener('change', closeOnDesktop);
    return () => {
      media.removeEventListener('change', closeOnDesktop);
      clearTimeout(closeTimer.current);
    };
  }, []);
  function closeDrawer() {
    if (closing) return;
    setClosing(true);
    closeTimer.current = setTimeout(
      () => {
        drawer.current?.close();
        setClosing(false);
        menuButton.current?.focus();
      },
      matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200,
    );
  }
  function select(value: WorkspaceTab) {
    onTab(value);
    if (drawer.current?.open) closeDrawer();
  }
  function goHome() {
    onHome();
    if (drawer.current?.open) closeDrawer();
  }
  const brand = <Brand onHome={goHome} disabled={locked} describedBy={lockDescription} />;
  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    try {
      localStorage.setItem('spt.theme', next);
    } catch {
      /* Preference is optional. */
    }
  }
  function toggleCollapsed() {
    setCollapsed(!collapsed);
    try {
      localStorage.setItem('spt.sidebarCollapsed', collapsed ? '0' : '1');
    } catch {
      /* Preference is optional. */
    }
  }
  function navigation(compact: boolean) {
    return (
      <nav className="account-nav" aria-label="Área de trabalho">
        {items
          .filter((item) =>
            item.id === 'trash' || item.id === 'access'
              ? hasRole(profile, 'ADMIN')
              : item.id === 'clients'
                ? hasRole(profile, 'ADMIN', 'COMMERCIAL', 'ENGINEER', 'VIEWER')
                : item.id === 'reports'
                  ? hasRole(profile, 'ADMIN', 'COMMERCIAL', 'ENGINEER', 'VIEWER')
                  : true,
          )
          .map((item) => (
            <Button
              key={item.id}
              icon={item.icon}
              className={tab === item.id ? 'selected' : 'secondary'}
              disabled={locked}
              aria-describedby={lockDescription}
              aria-label={compact ? item.label : undefined}
              data-tooltip={compact ? item.label : undefined}
              aria-current={tab === item.id ? 'page' : undefined}
              onClick={() => select(item.id)}
            >
              {!compact && <span>{item.label}</span>}
            </Button>
          ))}
      </nav>
    );
  }
  return (
    <div className={`workspace shell ${collapsed ? 'sidebar-compact' : ''}`}>
      <a className="skip-link" href="#workspace-content">
        Ir para o conteúdo
      </a>
      <aside className="workspace-sidebar" aria-label="Navegação principal">
        <div className="sidebar-brand">
          {!collapsed && brand}
          <Button
            className="ghost icon-button"
            icon={collapsed ? PanelLeftOpen : PanelLeftClose}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            onClick={toggleCollapsed}
          />
        </div>
        {navigation(collapsed)}
      </aside>
      <dialog
        ref={drawer}
        className={`mobile-drawer ${closing ? 'closing' : ''}`}
        aria-labelledby="mobile-menu-title"
        onCancel={(event) => {
          event.preventDefault();
          closeDrawer();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDrawer();
        }}
      >
        <div className="drawer-content">
          <div className="sidebar-brand">
            {brand}
            <Button
              className="ghost icon-button"
              icon={X}
              aria-label="Fechar menu"
              onClick={closeDrawer}
            />
          </div>
          <h2 id="mobile-menu-title" className="sr-only">
            Menu principal
          </h2>
          {navigation(false)}
        </div>
      </dialog>
      <div className="workspace-body">
        <header className="workspace-header">
          <Button
            ref={menuButton}
            className="ghost icon-button mobile-menu-button"
            icon={Menu}
            aria-label="Abrir menu"
            disabled={editing}
            aria-describedby={lockDescription}
            onClick={() => {
              setClosing(false);
              drawer.current?.showModal();
            }}
          />
          <span className="workspace-location">{items.find((item) => item.id === tab)?.label}</span>
          <div className="header-actions">
            <Notifications
              onOpen={onTarget}
              onError={onError}
              disabled={locked}
              describedBy={lockDescription}
            />
            <Button
              className="ghost icon-button"
              icon={theme === 'light' ? Moon : Sun}
              aria-label={theme === 'light' ? 'Mudar para tema escuro' : 'Mudar para tema claro'}
              onClick={toggleTheme}
            />
            <Button
              className="avatar-button"
              icon={UserRound}
              title="Segurança da conta"
              aria-label="Abrir perfil"
              disabled={locked}
              aria-describedby={lockDescription}
              onClick={() => select('security')}
            />
            <Button
              className="ghost logout-button"
              icon={LogOut}
              disabled={busy || locked}
              aria-describedby={lockDescription}
              loading={busy}
              onClick={onLogout}
            >
              {busy ? 'Saindo…' : 'Sair da conta'}
            </Button>
          </div>
        </header>
        {editing ? (
          <p id={editingLockId} className="navigation-lock" role="status">
            Há uma edição aberta. Salve ou cancele para usar o menu, o perfil, as notificações ou
            sair da conta.
          </p>
        ) : null}
        {toolbar}
        <main id="workspace-content" className="account" tabIndex={-1}>
          {children}
        </main>
      </div>
      <footer className="shell-footer">
        {brand}
        <span>{profile.tenant.name}</span>
        <p>Ao recarregar a página, entre novamente. Sua sessão não é salva neste navegador.</p>
      </footer>
    </div>
  );
}
