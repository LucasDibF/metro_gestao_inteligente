import {
  apiErrorFromResponse,
  isCredentialFailure,
  sessionEnded,
  sessionSuperseded,
} from './api-error';
import { readResponseBody, sendApiRequest } from './transport';
import type { Profile, Tokens } from './types';

export { ApiError, isCredentialFailure } from './api-error';
export { longRequestSignal } from './transport';
export type { Enrollment, Profile, Session, Tokens } from './types';
interface AuthState {
  tokens: Tokens | null;
  renewal: Promise<void> | null;
  generation: number;
  developmentAttempt: Promise<boolean> | null;
  developmentSession?: boolean;
}
function createAuthState(): AuthState {
  return { tokens: null, renewal: null, generation: 0, developmentAttempt: null };
}
export class AuthClient {
  constructor(
    private readonly transport: typeof fetch = (input, init) => fetch(input, init),
    private readonly state: AuthState = createAuthState(),
  ) {}
  get isDevelopmentSession(): boolean {
    return this.state.developmentSession === true;
  }
  get hasSession(): boolean {
    return this.state.tokens !== null;
  }
  clear(): void {
    this.state.tokens = null;
    this.state.developmentSession = false;
    this.state.generation++;
    this.state.renewal = null;
    this.state.developmentAttempt = null;
  }
  private send(path: string, init: RequestInit = {}, token?: string): Promise<Response> {
    return sendApiRequest(this.transport, path, init, token);
  }
  private async decode<T>(response: Response): Promise<T> {
    if (!response.ok) throw await apiErrorFromResponse(response);
    return response.status === 204
      ? (undefined as T)
      : readResponseBody(() => response.json() as Promise<T>);
  }
  async developmentAvailable(): Promise<boolean> {
    const response = await this.send('/auth/dev-status');
    return response.status === 404
      ? false
      : (await this.decode<{ enabled: boolean }>(response)).enabled === true;
  }
  developmentLogin(): Promise<boolean> {
    if (!this.state.developmentAttempt) {
      const generation = this.state.generation;
      this.state.developmentAttempt = (async () => {
        const response = await this.send('/auth/dev-session', { method: 'POST' });
        if (response.status === 404) return false;
        const tokens = await this.decode<Tokens>(response);
        if (generation !== this.state.generation) throw sessionSuperseded();
        this.state.developmentSession = true;
        this.state.tokens = tokens;
        return true;
      })().catch((error) => {
        if (generation === this.state.generation) this.state.developmentAttempt = null;
        throw error;
      });
    }
    return this.state.developmentAttempt;
  }
  async switchDevelopmentRole(role: Profile['role']): Promise<Profile> {
    await this.request('/auth/dev-role', { method: 'POST', body: JSON.stringify({ role }) });
    return this.request<Profile>('/auth/me');
  }
  async login(input: {
    email: string;
    password: string;
    tenantId: string;
    mfaCode?: string;
  }): Promise<void> {
    this.clear();
    const generation = this.state.generation;
    const result = await this.decode<Tokens>(
      await this.send('/auth/login', { method: 'POST', body: JSON.stringify(input) }),
    );
    if (generation === this.state.generation) this.state.tokens = result;
  }
  private renew(): Promise<void> {
    if (this.state.renewal) return this.state.renewal;
    const generation = this.state.generation;
    const token = this.state.tokens?.refreshToken;
    if (!token) return Promise.reject(sessionEnded());
    const operation = (async () => {
      try {
        const result = await this.decode<Tokens>(
          await this.send('/auth/refresh', {
            method: 'POST',
            body: JSON.stringify({ refreshToken: token }),
          }),
        );
        if (generation !== this.state.generation) throw sessionSuperseded();
        this.state.tokens = result;
      } catch (error) {
        if (generation === this.state.generation) this.clear();
        throw error;
      }
    })();
    this.state.renewal = operation;
    void operation
      .finally(() => {
        if (this.state.renewal === operation) this.state.renewal = null;
      })
      .catch(() => {});
    return operation;
  }
  async request<T>(
    path: string,
    init: RequestInit = {},
    read?: (response: Response) => Promise<T>,
  ): Promise<T> {
    const generation = this.state.generation;
    const token = this.state.tokens?.accessToken;
    if (!token) throw sessionEnded();
    let response = await this.send(path, init, token);
    if (generation !== this.state.generation) throw sessionSuperseded();
    const failure =
      response.status === 401
        ? ((await response
            .clone()
            .json()
            .catch(() => ({}))) as { code?: string })
        : {};
    if (response.status === 401 && !isCredentialFailure(failure.code)) {
      // Another request may already have renewed this access token.
      if (this.state.tokens?.accessToken === token) await this.renew();
      if (generation !== this.state.generation) throw sessionSuperseded();
      response = await this.send(path, init, this.state.tokens?.accessToken);
      if (generation !== this.state.generation) throw sessionSuperseded();
      if (response.status === 401) this.clear();
    }
    return response.ok && read ? readResponseBody(() => read(response)) : this.decode<T>(response);
  }
  async logout(): Promise<void> {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } finally {
      this.clear();
    }
  }
}
// Module updates reuse in-memory state; full page reloads show the login screen.
const sessionKey = Symbol.for('spt.auth.memory');
const memory = (typeof window === 'undefined' ? {} : window) as { [sessionKey]?: AuthState };
const session = memory[sessionKey] ?? createAuthState();
memory[sessionKey] = session;
// Remove only the unused experimental tab-session key; tokens remain in memory.
try {
  if (typeof window !== 'undefined') window.sessionStorage.removeItem('spt.session.v1');
} catch {
  /* Optional storage. */
}
export const auth = new AuthClient(undefined, session);
