import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  creaRegistration,
  missingFieldsSentence,
  profileInput,
  validateProfile,
  type ProfileFormValues,
} from '../apps/web/src/profile/professional-profile-form';

const empty: ProfileFormValues = {
  fullName: '',
  creaNumber: '',
  creaUf: '',
  professionalTitle: '',
  phone: '',
  professionalEmail: '',
};

test('the form accepts what the server accepts, normalizing the CREA number like it does', () => {
  assert.deepEqual(
    validateProfile({
      ...empty,
      fullName: 'Ana Souza',
      creaNumber: '506.123.456-d',
      creaUf: 'SP',
      phone: '(11) 98765-4321',
      professionalEmail: 'Ana@Empresa.com.br',
    }),
    {},
  );
  assert.deepEqual(validateProfile(empty), {}, 'an incomplete profile can be saved');
});

test('the form points at the field the server would reject', () => {
  const errors = validateProfile({
    ...empty,
    creaNumber: 'CREA-SP 123456',
    phone: '9876-5432',
    professionalEmail: 'ana@empresa',
  });
  assert.deepEqual(Object.keys(errors).sort(), [
    'creaNumber',
    'creaUf',
    'phone',
    'professionalEmail',
  ]);
  assert.match(errors.creaNumber!, /Só|só o número/);
  assert.equal(
    validateProfile({ ...empty, creaUf: 'MG' }).creaNumber,
    'Informe o número do CREA da UF selecionada.',
  );
  assert.equal(validateProfile({ ...empty, phone: '+55 (11) 98765-4321' }).phone, undefined);
  assert.ok(validateProfile({ ...empty, phone: '+55 11 98765-4321 0000' }).phone);
});

test('the request sends every field, with blank text as null', () => {
  assert.deepEqual(profileInput({ ...empty, fullName: '  Ana   Souza ', creaUf: 'SP' }, 3), {
    fullName: 'Ana Souza',
    creaNumber: null,
    creaUf: 'SP',
    professionalTitle: null,
    phone: null,
    professionalEmail: null,
    version: 3,
  });
});

test('missing fields and the registration read as the screen and the report show them', () => {
  assert.equal(
    missingFieldsSentence(['fullName', 'creaNumber', 'creaUf', 'professionalTitle']),
    'nome completo, número do CREA, UF do CREA e título profissional',
  );
  assert.equal(missingFieldsSentence(['professionalTitle', 'unknown']), 'título profissional');
  assert.equal(
    creaRegistration({ creaNumber: '506123456-D', creaUf: 'SP' }),
    'CREA-SP 506123456-D',
  );
  assert.equal(creaRegistration({ creaNumber: null, creaUf: 'SP' }), '');
});
