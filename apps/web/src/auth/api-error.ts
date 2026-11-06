export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}
/** The request belongs to a session that was cleared or replaced meanwhile. */
export function sessionSuperseded(): ApiError {
  return new ApiError(401, 'A requisição pertence a uma sessão anterior.', 'SESSION_SUPERSEDED');
}
export function sessionEnded(): ApiError {
  return new ApiError(401, 'Sua sessão terminou. Entre novamente.');
}
/** 401 codes that reject what the user typed; the session itself is still valid. */
export function isCredentialFailure(code?: string): boolean {
  return code === 'MFA_VERIFICATION_FAILED' || code === 'PASSWORD_INVALID';
}
const domainMessages: Record<string, string> = {
  PASSWORD_INVALID: 'A senha atual não confere. Sua sessão continua ativa.',
  EXECUTED_DEPTH_INVALID: 'Informe uma profundidade executada maior que zero.',
  WATER_LEVEL_BELOW_DEPTH:
    'O nível d’água não pode ser maior que a profundidade executada do furo.',
  FIELD_DATE_INVALID: 'Informe uma data de campo válida.',
  EXECUTED_DEPTH_EXCLUDES_DATA:
    'A profundidade executada não pode ser menor que os ensaios ou camadas já registrados. Confira a profundidade do último metro.',

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
  SPT_METRES_MISSING:
    'Há metros sem registro até a profundidade executada. Registre cada metro; se não houve ensaio, informe o motivo de interrupção.',
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
  413: 'O envio ultrapassa o limite aceito. As fotografias podem ter até 8 MB.',
  429: 'Muitas tentativas. Aguarde um minuto antes de tentar novamente.',
};
/** Turns a failed API response into a Portuguese message for the screen. */
export async function apiErrorFromResponse(response: Response): Promise<ApiError> {
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
  return new ApiError(
    response.status,
    (domainMessages[body.code ?? ''] ?? message) + detail + holeDetail,
    body.code,
  );
}
