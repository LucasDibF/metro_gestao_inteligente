export interface Tokens {
  accessToken: string;
  refreshToken: string;
}
export interface Profile {
  localTesting?: boolean;
  userId: string;
  tenant: { id: string; name: string };
  role: 'ADMIN' | 'ENGINEER' | 'OPERATOR' | 'COMMERCIAL' | 'VIEWER';
  additionalRoles?: Profile['role'][];
  canDownloadReports?: boolean;
  mfaEnabled: boolean;
}
export interface Enrollment {
  secret: string;
  uri: string;
  expiresIn: number;
}
export interface Session {
  familyId: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}
const domainMessages: Record<string, string> = {
  INTERACTIVE_SHEET_LIMIT:
    'Este furo excede o limite da folha interativa (1.000 m ou 1.000 registros). Consulte os registros na listagem.',
  MAP_EXCLUDES_BOREHOLE:
    'O enquadramento precisa incluir todos os furos selecionados. Amplie a abrangência ou ajuste o centro.',
  SPT_DEPTH_OUTSIDE: 'O metro do ensaio ultrapassa a profundidade executada do furo.',
  SOIL_LAYER_OVERLAP: 'Esta camada se sobrepõe a outra. Confira os intervalos de profundidade.',
  SOIL_PROFILE_GAP:
    'Complete as camadas de solo, sem intervalos vazios, até a profundidade executada.',
  ACCESS_INPUT_INVALID: 'Informe um email válido e uma senha inicial de 12 a 128 caracteres.',
  EMAIL_ALREADY_REGISTERED:
    'Esse email já possui um cadastro. Use outro email para criar um novo login.',
  ADMIN_ACCESS_PROTECTED:
    'Mantenha seu acesso de administrador e pelo menos um administrador ativo na empresa.',
  FIELD_EXECUTION_LOCKED:
    'O registro de campo está bloqueado para este perfil. Após o envio, aguarde a análise ou devolução do engenheiro.',
  FIELD_DATE_REQUIRED: 'Preencha e salve a data de campo em Visão geral do furo.',
  EXECUTED_DEPTH_REQUIRED: 'Preencha e salve a profundidade executada do furo.',
  SPT_REQUIRED: 'Registre pelo menos um ensaio SPT.',
  SOIL_DESCRIPTION_REQUIRED: 'Preencha a descrição do solo junto ao ensaio.',
  SPT_READINGS_INCOMPLETE:
    'Há ensaio incompleto. Complete os avanços ou registre o motivo de interrupção, conforme ocorreu em campo.',
  TECHNICAL_DATA_INCOMPLETE:
    'Preencha a data, a profundidade executada, as camadas e os ensaios dentro do limite do furo.',
  REVIEW_STATE_CONFLICT: 'A situação da revisão mudou. Recarregue os dados antes de continuar.',
  REPORT_COORDINATES_REQUIRED:
    'Defina uma coordenada oficial para os furos indicados em Visão geral do furo.',
  REPORT_HOLE_UNAVAILABLE:
    'Um furo selecionado não está disponível. Edite a composição do relatório.',
  REPORT_NOT_APPROVED:
    'Há furo sem aprovação técnica atual. Confira a revisão dos furos indicados.',
  IDEMPOTENCY_CONFLICT:
    'Esta solicitação já foi utilizada com outros dados. Recarregue as emissões.',
  QUEUE_LIMIT:
    'A empresa já tem muitas gerações pendentes. Aguarde a conclusão antes de solicitar outra.',
};
const messages: Record<number, string> = {
  400: 'Confira os dados informados e tente novamente.',
  401: 'Acesso não autorizado. Confira suas credenciais e o código de autenticação, se ativado.',
  403: 'Seu perfil não permite realizar esta ação.',
  404: 'Este registro não está disponível na sua empresa.',
  409: 'Os dados mudaram ou já existem. Recarregue a tela e confira o registro.',
  429: 'Muitas tentativas. Aguarde um minuto antes de tentar novamente.',
};
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
  get isDevelopmentSession() {
    return this.state.developmentSession === true;
  }
  get hasSession() {
    return this.state.tokens !== null;
  }
  clear() {
    this.state.tokens = null;
    this.state.developmentSession = false;
    this.state.generation++;
    this.state.renewal = null;
    this.state.developmentAttempt = null;
  }
  private async send(path: string, init: RequestInit = {}, token?: string) {
    try {
      return await this.transport(`/api/v1${path}`, {
        ...init,
        credentials: 'omit',
        cache: 'no-store',
        signal: init.signal ?? AbortSignal.timeout(12000),
        headers: {
          ...(init.body && !(init.body instanceof FormData)
            ? { 'Content-Type': 'application/json' }
            : {}),
          ...init.headers,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    } catch {
      throw new ApiError(
        0,
        'Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.',
      );
    }
  }
  private async decode<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        code?: string;
        depths?: string[];
        holeCodes?: string[];
      };
      const message =
        body.code === 'SPT_DEPTH_EXISTS'
          ? 'Já existe um ensaio nesta profundidade. Edite o registro existente.'
          : body.code === 'ACTIVE_CHILDREN'
            ? 'Envie primeiro os furos e as pastas ativos para a lixeira. Nenhum vínculo foi alterado.'
            : body.code === 'PARENT_IN_TRASH'
              ? 'Restaure primeiro a obra e a pasta vinculadas a este registro.'
              : body.code === 'DUPLICATE_RECORD'
                ? 'Já existe uma pasta com esse nome ou um furo com essa identificação nesta obra, inclusive na lixeira.'
                : body.code === 'RECORD_VERSION_CONFLICT'
                  ? 'Este registro foi alterado. Recarregue os dados antes de salvar novamente.'
                  : body.code === 'WORK_VERSION_CONFLICT'
                    ? 'Outra pessoa atualizou esta obra. Recarregue os dados antes de salvar novamente.'
                    : body.code === 'MFA_VERIFICATION_FAILED'
                      ? 'Confira a senha e o código informados. Sua sessão continua ativa.'
                      : (messages[response.status] ??
                        'O serviço não concluiu a ação. Tente novamente.');
      const depths = Array.isArray(body.depths)
        ? body.depths.filter((d) => typeof d === 'string' && /^\d+(\.\d+)?$/.test(d))
        : [];
      const detail = depths.length
        ? ' Metro(s): ' + depths.map((d) => Number(d).toLocaleString('pt-BR')).join(', ') + ' m.'
        : '';
      const holes = Array.isArray(body.holeCodes)
        ? body.holeCodes
            .filter((c) => typeof c === 'string')
            .slice(0, 20)
            .map((c) => c.slice(0, 120))
        : [];
      const holeDetail = holes.length ? ' Furos: ' + holes.join(', ') + '.' : '';
      throw new ApiError(
        response.status,
        (domainMessages[body.code ?? ''] ?? message) + detail + holeDetail,
        body.code,
      );
    }
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
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
        if (generation !== this.state.generation)
          throw new ApiError(
            401,
            'A requisição pertence a uma sessão anterior.',
            'SESSION_SUPERSEDED',
          );
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
  async switchDevelopmentRole(role: Profile['role']) {
    await this.request('/auth/dev-role', { method: 'POST', body: JSON.stringify({ role }) });
    return this.request<Profile>('/auth/me');
  }
  async login(input: { email: string; password: string; tenantId: string; mfaCode?: string }) {
    this.clear();
    const generation = this.state.generation;
    const result = await this.decode<Tokens>(
      await this.send('/auth/login', { method: 'POST', body: JSON.stringify(input) }),
    );
    if (generation === this.state.generation) this.state.tokens = result;
  }
  private renew() {
    if (this.state.renewal) return this.state.renewal;
    const generation = this.state.generation;
    const token = this.state.tokens?.refreshToken;
    if (!token) return Promise.reject(new ApiError(401, 'Sua sessão terminou. Entre novamente.'));
    const operation = (async () => {
      try {
        const result = await this.decode<Tokens>(
          await this.send('/auth/refresh', {
            method: 'POST',
            body: JSON.stringify({ refreshToken: token }),
          }),
        );
        if (generation !== this.state.generation)
          throw new ApiError(
            401,
            'A requisição pertence a uma sessão anterior.',
            'SESSION_SUPERSEDED',
          );
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
    if (!token) throw new ApiError(401, 'Sua sessão terminou. Entre novamente.');
    let response = await this.send(path, init, token);
    if (generation !== this.state.generation)
      throw new ApiError(401, 'A requisição pertence a uma sessão anterior.', 'SESSION_SUPERSEDED');
    const failure =
      response.status === 401
        ? ((await response
            .clone()
            .json()
            .catch(() => ({}))) as { code?: string })
        : {};
    if (response.status === 401 && failure.code !== 'MFA_VERIFICATION_FAILED') {
      // Another request may already have renewed this access token.
      if (this.state.tokens?.accessToken === token) await this.renew();
      if (generation !== this.state.generation)
        throw new ApiError(
          401,
          'A requisição pertence a uma sessão anterior.',
          'SESSION_SUPERSEDED',
        );
      response = await this.send(path, init, this.state.tokens?.accessToken);
      if (generation !== this.state.generation)
        throw new ApiError(
          401,
          'A requisição pertence a uma sessão anterior.',
          'SESSION_SUPERSEDED',
        );
      if (response.status === 401) this.clear();
    }
    return response.ok && read ? read(response) : this.decode<T>(response);
  }
  async logout() {
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
