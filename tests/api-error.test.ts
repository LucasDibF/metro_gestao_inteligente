import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ApiError,
  apiErrorFromResponse,
  isCredentialFailure,
  sessionSuperseded,
} from '../apps/web/src/auth/api-error';
import { ApiError as ReexportedApiError } from '../apps/web/src/auth/client';

const failure = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('the auth client re-exports the same ApiError class', () => {
  assert.equal(ReexportedApiError, ApiError);
});

test('domain codes win over the status message and list the affected metres and boreholes', async () => {
  const error = await apiErrorFromResponse(
    failure(422, {
      code: 'SPT_METRES_MISSING',
      depths: ['2', '3.5', 'abc'],
      holeCodes: ['SP-01', 42],
    }),
  );
  assert.ok(error instanceof ApiError);
  assert.equal(error.status, 422);
  assert.equal(error.code, 'SPT_METRES_MISSING');
  assert.equal(
    error.message,
    'Há metros sem registro até a profundidade executada. Registre cada metro; se não houve ensaio, informe o motivo de interrupção. Metro(s): 2, 3,5 m. Furos: SP-01.',
  );
});

test('unknown codes fall back to the status message, and unknown statuses to the generic one', async () => {
  const conflict = await apiErrorFromResponse(failure(409, { code: 'SOMETHING_NEW' }));
  assert.equal(
    conflict.message,
    'Os dados mudaram ou já existem. Recarregue a tela e confira o registro.',
  );
  const broken = await apiErrorFromResponse(new Response('not json', { status: 502 }));
  assert.equal(broken.message, 'O serviço não concluiu a ação. Tente novamente.');
  assert.equal(broken.code, undefined);
});

test('a superseded session is a 401 with its own code, distinct from a credential failure', () => {
  const error = sessionSuperseded();
  assert.equal(error.status, 401);
  assert.equal(error.code, 'SESSION_SUPERSEDED');
  assert.equal(isCredentialFailure(error.code), false);
  assert.equal(isCredentialFailure('PASSWORD_INVALID'), true);
});

test('professional profile failures keep the rejected field and the missing fields', async () => {
  const invalid = await apiErrorFromResponse(
    failure(400, {
      code: 'PROFESSIONAL_PROFILE_INVALID',
      field: 'creaNumber',
      message: 'Registration number',
    }),
  );
  assert.equal(invalid.message, 'Confira o campo indicado no perfil profissional.');
  assert.deepEqual(invalid.details, { field: 'creaNumber' });
  const incomplete = await apiErrorFromResponse(
    failure(409, {
      code: 'PROFESSIONAL_PROFILE_INCOMPLETE',
      missingFields: ['professionalTitle', 7],
    }),
  );
  assert.equal(incomplete.code, 'PROFESSIONAL_PROFILE_INCOMPLETE');
  assert.equal(
    incomplete.message,
    'Complete seu perfil profissional para aprovar: nome completo, CREA com UF e título profissional.',
  );
  assert.deepEqual(incomplete.details, { missingFields: ['professionalTitle'] });
  assert.deepEqual((await apiErrorFromResponse(failure(409, {}))).details, {});
});
