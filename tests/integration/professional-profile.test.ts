import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiFixture, type ApiFixture, type FixtureUser } from '../helpers/api-fixture';
import {
  completeProfessionalProfile,
  completeReviewerCopy,
  saveProfessionalProfile,
} from '../helpers/professional-profile';

interface ProfileBody {
  fullName: string | null;
  creaNumber: string | null;
  creaUf: string | null;
  professionalTitle: string | null;
  phone: string | null;
  professionalEmail: string | null;
  version: number;
  updatedAt: string | null;
  complete: boolean;
  missingFields: string[];
}
interface ErrorBody {
  code?: string;
  field?: string;
  missingFields?: string[];
}
const route = '/perfil-profissional';
const read = (fx: ApiFixture, user: FixtureUser) => fx.call(user, route);
const save = (fx: ApiFixture, user: FixtureUser, body: Record<string, unknown>) =>
  fx.call(user, route, body, 'PUT');
const rowOf = (fx: ApiFixture, user: FixtureUser) =>
  fx.db.professionalProfile.findUnique({
    where: { tenantId_userId: { tenantId: fx.tenantId, userId: user.id } },
  });

test('an engineer reads and edits only their own profile; versions and validation guard it', async () => {
  const fx = await apiFixture([
    { role: 'ENGINEER' },
    { role: 'ENGINEER' },
    { role: 'OPERATOR' },
    { role: 'ADMIN' },
    { role: 'OPERATOR', additionalRoles: ['ENGINEER'] },
  ]);
  const foreign = await apiFixture([{ role: 'ENGINEER' }]);
  const [engineer, colleague, operator, admin, combined] = fx.users;
  try {
    const empty = await read(fx, engineer);
    assert.equal(empty.status, 200);
    assert.equal(empty.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(await empty.json(), {
      fullName: null,
      creaNumber: null,
      creaUf: null,
      professionalTitle: null,
      phone: null,
      professionalEmail: null,
      version: 0,
      updatedAt: null,
      complete: false,
      missingFields: ['fullName', 'creaNumber', 'creaUf', 'professionalTitle'],
    });

    for (const user of [operator, admin]) {
      assert.equal((await read(fx, user)).status, 403);
      assert.equal(
        (await save(fx, user, { ...completeProfessionalProfile, version: 0 })).status,
        403,
      );
      assert.equal(await rowOf(fx, user), null);
    }
    assert.equal((await read(fx, combined)).status, 200);

    const partial = await save(fx, engineer, {
      fullName: '  Ana   Souza ',
      creaNumber: '',
      creaUf: '   ',
      phone: '',
      version: 0,
    });
    assert.equal(partial.status, 200, await partial.clone().text());
    const created = (await partial.json()) as ProfileBody;
    assert.equal(created.fullName, 'Ana Souza');
    assert.equal(created.creaNumber, null);
    assert.equal(created.phone, null);
    assert.equal(created.version, 1);
    assert.equal(created.complete, false);
    assert.deepEqual(created.missingFields, ['creaNumber', 'creaUf', 'professionalTitle']);
    assert.equal(
      ((await (await save(fx, engineer, { fullName: 'Outra', version: 0 })).json()) as ErrorBody)
        .code,
      'RECORD_VERSION_CONFLICT',
    );

    const invalid: Array<[Record<string, unknown>, string]> = [
      [{ creaNumber: '123456', creaUf: 'XX' }, 'creaUf'],
      [{ creaNumber: 'CREA-SP 123456', creaUf: 'SP' }, 'creaNumber'],
      [{ creaNumber: '12', creaUf: 'SP' }, 'creaNumber'],
      [{ creaNumber: '123456' }, 'creaUf'],
      [{ creaUf: 'SP' }, 'creaNumber'],
      [{ professionalEmail: 'sem-arroba.example' }, 'professionalEmail'],
      [{ phone: '1234' }, 'phone'],
      [{ phone: 'ligar (11) 98765-4321' }, 'phone'],
      [{ fullName: 'x'.repeat(201) }, 'fullName'],
      [{ professionalTitle: 'x'.repeat(121) }, 'professionalTitle'],
      [{ fullName: 'Ana\u0000Souza' }, 'fullName'],
      [{ professionalTitle: 42 }, 'professionalTitle'],
    ];
    for (const [fields, field] of invalid) {
      const response = await save(fx, engineer, { ...fields, version: 1 });
      assert.equal(response.status, 400, JSON.stringify(fields));
      assert.deepEqual(
        { ...((await response.json()) as ErrorBody), message: undefined },
        { code: 'PROFESSIONAL_PROFILE_INVALID', field, message: undefined },
        JSON.stringify(fields),
      );
    }
    for (const extra of [{ tenantId: foreign.tenantId }, { userId: colleague.id }]) {
      const response = await save(fx, engineer, { fullName: 'Ana', ...extra, version: 1 });
      assert.equal(response.status, 400);
    }
    assert.equal((await save(fx, engineer, { version: -1 })).status, 400);
    assert.equal((await save(fx, engineer, { version: '1' })).status, 400);
    assert.equal((await rowOf(fx, engineer))?.version, 1, 'rejected input changes nothing');

    const complete = await save(fx, engineer, {
      fullName: 'Ana Souza',
      creaNumber: ' 506.123.456-d ',
      creaUf: 'sp',
      professionalTitle: ' Engenheira  Civil ',
      phone: '+55 (11) 98765-4321',
      professionalEmail: ' Ana.Souza@Example.COM ',
      version: 1,
    });
    assert.equal(complete.status, 200, await complete.clone().text());
    const saved = (await complete.json()) as ProfileBody;
    assert.deepEqual(
      { ...saved, updatedAt: typeof saved.updatedAt },
      {
        fullName: 'Ana Souza',
        creaNumber: '506123456-D',
        creaUf: 'SP',
        professionalTitle: 'Engenheira Civil',
        phone: '+55 (11) 98765-4321',
        professionalEmail: 'ana.souza@example.com',
        version: 2,
        updatedAt: 'string',
        complete: true,
        missingFields: [],
      },
    );
    assert.deepEqual(await (await read(fx, engineer)).json(), saved);
    const stale = await save(fx, engineer, { ...completeProfessionalProfile, version: 1 });
    assert.equal(stale.status, 409);
    assert.equal(((await stale.json()) as ErrorBody).code, 'RECORD_VERSION_CONFLICT');

    // A colleague in the same company and an engineer elsewhere see an empty profile of their own.
    for (const [owner, user] of [
      [fx, colleague],
      [foreign, foreign.users[0]],
    ] as const) {
      const own = (await (await read(owner, user)).json()) as ProfileBody;
      assert.equal(own.version, 0);
      assert.equal(own.fullName, null);
    }
    assert.equal((await save(fx, colleague, { fullName: 'Colega', version: 2 })).status, 409);
    assert.equal(
      (await save(foreign, foreign.users[0], { fullName: 'Fora', version: 2 })).status,
      409,
    );
    await saveProfessionalProfile(fx.base, colleague.token, { fullName: 'Colega' });
    assert.equal((await rowOf(fx, colleague))?.fullName, 'Colega');
    const untouched = await rowOf(fx, engineer);
    assert.equal(untouched?.fullName, 'Ana Souza');
    assert.equal(untouched?.version, 2);
    assert.equal(
      await foreign.db.professionalProfile.count({ where: { tenantId: foreign.tenantId } }),
      0,
    );
  } finally {
    await foreign.close();
    await fx.close();
  }
});

test('approval copies the approver profile; it is blocked without one and later edits keep the copy', async () => {
  const fx = await apiFixture([{ role: 'ENGINEER' }, { role: 'OPERATOR' }]);
  const [engineer, operator] = fx.users;
  try {
    await fx.db.workAssignment.create({
      data: {
        tenantId: fx.tenantId,
        workId: fx.work.id,
        operatorId: operator.id,
        assignedBy: engineer.id,
      },
    });
    const hole = `/obras/${fx.work.id}/furos/${fx.hole.id}`;
    const current = () => fx.db.borehole.findUniqueOrThrow({ where: { id: fx.hole.id } });
    const step = async (path: string, body: Record<string, unknown>, method = 'POST') => {
      const response = await fx.call(engineer, hole + path, body, method);
      assert.ok(response.status < 300, await response.clone().text());
    };
    await step(
      '/tecnico',
      {
        technicalVersion: (await current()).technicalVersion,
        fieldDate: '2026-11-06',
        executedDepthM: '1',
      },
      'PUT',
    );
    await step('/ensaios', {
      depthM: '1',
      advances: [3, 4, 5].map((blows) => ({ blows, penetrationMm: 150 })),
    });
    await step('/tecnico/camadas', { fromM: '0', toM: '1', soilType: 'Argila arenosa' });
    const review = async (action: string, extra: Record<string, unknown> = {}) =>
      fx.call(engineer, `${hole}/tecnico/${action}`, {
        technicalVersion: (await current()).technicalVersion,
        note: 'Conferido.',
        ...extra,
      });
    assert.equal((await review('enviar-revisao')).status, 201);

    const blocked = await review('aprovar');
    assert.equal(blocked.status, 409);
    assert.deepEqual(
      { ...((await blocked.json()) as ErrorBody), message: undefined },
      {
        code: 'PROFESSIONAL_PROFILE_INCOMPLETE',
        missingFields: ['fullName', 'creaNumber', 'creaUf', 'professionalTitle'],
        message: undefined,
      },
    );
    const draft = await saveProfessionalProfile(fx.base, engineer.token, {
      fullName: 'Ana Souza',
      creaNumber: '5061234567',
      creaUf: 'SP',
    });
    const incomplete = await review('aprovar');
    assert.equal(incomplete.status, 409);
    assert.deepEqual(((await incomplete.json()) as ErrorBody).missingFields, ['professionalTitle']);
    assert.equal((await current()).reviewState, 'IN_REVIEW');

    // The reviewer identity is no longer accepted from the request.
    const forged = await review('aprovar', {
      reviewerName: 'Outra Pessoa',
      reviewerRegistration: 'CREA-RJ 1',
      reviewerTitle: 'Falso',
    });
    assert.equal(forged.status, 400);
    assert.equal((await current()).reviewState, 'IN_REVIEW');

    const profile = await saveProfessionalProfile(
      fx.base,
      engineer.token,
      {
        fullName: 'Ana Souza',
        creaNumber: '5061234567',
        creaUf: 'SP',
        professionalTitle: 'Engenheira Civil',
        phone: '11 98765-4321',
        professionalEmail: 'ana@example.com',
      },
      draft.version,
    );
    assert.equal(profile.complete, true);
    assert.equal((await review('aprovar')).status, 201);
    const approved = await current();
    assert.equal(approved.reviewState, 'APPROVED');
    assert.equal(approved.reviewedBy, engineer.id);
    assert.deepEqual(
      {
        reviewerName: approved.reviewerName,
        reviewerRegistration: approved.reviewerRegistration,
        reviewerTitle: approved.reviewerTitle,
      },
      {
        reviewerName: 'Ana Souza',
        reviewerRegistration: 'CREA-SP 5061234567',
        reviewerTitle: 'Engenheira Civil',
      },
    );
    const event = await fx.db.technicalEvent.findFirstOrThrow({
      where: { boreholeId: fx.hole.id, action: 'REVIEW_APPROVE' },
    });
    assert.deepEqual(event.details, {
      note: 'Conferido.',
      reviewerName: 'Ana Souza',
      reviewerRegistration: 'CREA-SP 5061234567',
      reviewerTitle: 'Engenheira Civil',
    });

    // The copy shows to engineers only, and never travels to the field app.
    const technical = async (user: FixtureUser) =>
      ((await (await fx.call(user, hole + '/tecnico')).json()) as { hole: Record<string, unknown> })
        .hole;
    assert.equal((await technical(engineer)).reviewerTitle, 'Engenheira Civil');
    assert.equal((await technical(operator)).reviewerTitle, null);
    const snapshot = (await (await fx.call(operator, hole + '/mobile/snapshot')).json()) as {
      technical: { hole: Record<string, unknown> };
    };
    assert.equal(snapshot.technical.hole.reviewerName, null);
    assert.equal(snapshot.technical.hole.reviewerRegistration, null);
    assert.equal(snapshot.technical.hole.reviewerTitle, null);
    const phoneOrEmail = JSON.stringify(await technical(engineer));
    assert.doesNotMatch(phoneOrEmail, /98765|ana@example\.com/);

    // Editing the profile later leaves the approved hole as it was signed.
    await saveProfessionalProfile(
      fx.base,
      engineer.token,
      { ...completeProfessionalProfile },
      profile.version,
    );
    const kept = await current();
    assert.equal(kept.reviewerName, 'Ana Souza');
    assert.equal(kept.reviewerTitle, 'Engenheira Civil');
    assert.equal(kept.reviewState, 'APPROVED');

    // A technical change reopens the review and the database clears the whole copy.
    await step(
      '/tecnico',
      {
        technicalVersion: kept.technicalVersion,
        fieldDate: '2026-11-06',
        executedDepthM: '1',
        waterLevelM: '0.5',
      },
      'PUT',
    );
    const reopened = await current();
    assert.equal(reopened.reviewState, 'IN_REVIEW');
    assert.equal(reopened.reviewerTitle, null);

    // Returning to the field and submitting again clear any reviewer copy left on the row.
    const leftover = {
      reviewerName: 'Resíduo',
      reviewerRegistration: 'X',
      reviewerTitle: 'Resíduo',
    };
    await fx.db.borehole.update({ where: { id: fx.hole.id }, data: leftover });
    assert.equal((await review('devolver')).status, 201);
    const returned = await current();
    assert.equal(returned.reviewState, 'DRAFT');
    assert.equal(returned.reviewerName, null);
    assert.equal(returned.reviewerRegistration, null);
    assert.equal(returned.reviewerTitle, null);
    await fx.db.borehole.update({ where: { id: fx.hole.id }, data: leftover });
    assert.equal((await review('enviar-revisao')).status, 201);
    const resubmitted = await current();
    assert.equal(resubmitted.reviewerName, null);
    assert.equal(resubmitted.reviewerTitle, null);

    assert.equal((await review('aprovar')).status, 201);
    const reapproved = await current();
    assert.deepEqual(
      {
        reviewerName: reapproved.reviewerName,
        reviewerRegistration: reapproved.reviewerRegistration,
        reviewerTitle: reapproved.reviewerTitle,
      },
      completeReviewerCopy,
    );
  } finally {
    await fx.close();
  }
});
