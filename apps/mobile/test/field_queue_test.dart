import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:metro_mobile/core/api_client.dart';
import 'package:metro_mobile/field/field_forms.dart';
import 'package:metro_mobile/field/field_repository.dart';
import 'package:metro_mobile/field/field_store.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'field_execution_test.dart' show FieldSession;

/// Refuses the operations whose kind has an entry, as the API does.
class RefusingSession extends FieldSession {
  final refusals = <String, ApiFailure>{};
  final uploads = <String>[];

  /// Snapshots fetched so far, noted at every operation sent.
  final snapshotsAtSend = <int>[];

  /// After this many writes, an edit on the web moves the version.
  int? webEditAfterWrites;

  @override
  Future<Json> request(
    String route, {
    String method = 'GET',
    Json? body,
  }) async {
    snapshotsAtSend.add(snapshots);
    final refusal = refusals[body?['kind']];
    if (refusal != null) throw refusal;
    final receipt = await super.request(route, method: method, body: body);
    if (writes == webEditAfterWrites) version++;
    return receipt;
  }

  @override
  Future<Json> upload(
    String route,
    String filePath,
    Map<String, String> fields,
  ) async {
    final refusal = refusals['PHOTO'];
    if (refusal != null) throw refusal;
    uploads.add(filePath);
    version++;
    return {
      'technicalVersion': version,
      'reviewState': review,
      'result': {'id': 'photo'},
    };
  }
}

const refused = ApiFailure(422, 'Solo obrigatório.');

Json metre(String depth, {String color = 'Marrom'}) => {
  'depthM': depth,
  'advances': <dynamic>[],
  'soil': {'soilType': 'Argila', 'soilColor': color},
};

void main() {
  sqfliteFfiInit();
  late Directory dir;
  late FieldStore store;
  late RefusingSession session;
  late FieldRepository repo;
  setUp(() async {
    dir = await Directory.systemTemp.createTemp('metro-queue-test');
    store = FieldStore(
      factory: databaseFactoryFfi,
      databasePath: '${dir.path}/field.db',
    );
    session = RefusingSession();
    repo = FieldRepository(session, store, photoRoot: () async => dir.path);
  });
  tearDown(() async {
    await store.close();
    await dir.delete(recursive: true);
    session.api.close();
  });
  Future<List<Json>> queue() => store.pending(repo.owner, 'hole');

  test(
    'a 422 marks the operation rejected and the rest of the queue goes',
    () async {
      final doc = await repo.download('work', 'hole');
      await repo.saveFields(doc, {'fieldDate': '2026-11-04'});
      await repo.saveMetre(doc, metre('1'));
      session.refusals['FIELDS'] = refused;
      await expectLater(
        repo.sync('work', 'hole'),
        throwsA(
          isA<FieldRejected>().having(
            (e) => e.message,
            'motivo',
            contains('Solo obrigatório.'),
          ),
        ),
      );
      final left = await queue();
      expect(left.single['kind'], 'FIELDS');
      expect(left.single['status'], 'rejected');
      expect(left.single['rejection'], 'Solo obrigatório.');
      expect(session.writes, 1);
    },
  );

  test(
    'a 400 is final too, while other failures keep the operation pending',
    () async {
      final doc = await repo.download('work', 'hole');
      await repo.saveFields(doc, {'fieldDate': '2026-11-04'});
      session.refusals['FIELDS'] = const ApiFailure(500, 'Falha');
      await expectLater(repo.sync('work', 'hole'), throwsA(isA<ApiFailure>()));
      expect((await queue()).single['status'], 'pending');
      session.refusals['FIELDS'] = const ApiFailure(400, 'Data inválida.');
      await expectLater(
        repo.sync('work', 'hole'),
        throwsA(isA<FieldRejected>()),
      );
      expect((await queue()).single['status'], 'rejected');
    },
  );

  test(
    'a new save of the item replaces the rejection and the queue moves on',
    () async {
      final doc = await repo.download('work', 'hole');
      await repo.saveMetre(doc, metre('1'));
      session.refusals['METRE'] = refused;
      await expectLater(
        repo.sync('work', 'hole'),
        throwsA(isA<FieldRejected>()),
      );
      final rejectedId = (await queue()).single['id'];
      // Another metre does not touch the rejection of the first one.
      await repo.saveMetre(doc, metre('2'));
      expect((await queue()).length, 2);
      await repo.saveMetre(doc, metre('1', color: 'Cinza'));
      final left = await queue();
      expect(left.map((o) => o['id']), isNot(contains(rejectedId)));
      expect(left.where(isRejected), isEmpty);
      session.refusals.clear();
      await repo.sync('work', 'hole');
      expect(await queue(), isEmpty);
      expect(session.sent.last['payload']['depthM'], '1');
      expect(session.sent.last['payload']['soil']['soilColor'], 'Cinza');
    },
  );

  test(
    'a later attempt that succeeds clears the rejection before it',
    () async {
      final doc = await repo.download('work', 'hole');
      await repo.saveFields(doc, {'fieldDate': '2026-11-01'});
      await repo.saveFields(doc, {'fieldDate': '2026-11-02'});
      final first = (await queue()).first['id'] as String;
      await store.reject(repo.owner, 'hole', first, 'Data inválida.');
      await repo.sync('work', 'hole');
      expect(await queue(), isEmpty);
    },
  );

  test('one snapshot confirms the version for the whole queue', () async {
    final doc = await repo.download('work', 'hole');
    await repo.saveFields(doc, {'fieldDate': '2026-11-04'});
    await repo.saveMetre(doc, metre('1'));
    await repo.saveMetre(doc, metre('2'));
    session.snapshots = 0;
    await repo.sync('work', 'hole');
    expect(session.snapshotsAtSend, [1, 1, 1]);
    // The other snapshot refreshes the copy once the queue is empty.
    expect(session.snapshots, 2);
    expect(await queue(), isEmpty);
  });

  test('each operation expects the version of the receipt before it', () async {
    final doc = await repo.download('work', 'hole');
    await repo.saveFields(doc, {'fieldDate': '2026-11-04'});
    await repo.saveMetre(doc, metre('1'));
    await repo.saveMetre(doc, metre('2'));
    await repo.sync('work', 'hole');
    final receipts = session.sent
        .map((sent) => session.receipts[sent['operationId']]!)
        .toList();
    expect(session.sent.first['expectedTechnicalVersion'], 1);
    for (var index = 1; index < session.sent.length; index++) {
      expect(
        session.sent[index]['expectedTechnicalVersion'],
        receipts[index - 1]['technicalVersion'],
      );
    }
    expect(session.sent.last['expectedTechnicalVersion'], 3);
  });

  test(
    'a web edit in the middle of the queue stops it as a conflict',
    () async {
      final doc = await repo.download('work', 'hole');
      await repo.saveFields(doc, {'fieldDate': '2026-11-04'});
      await repo.saveMetre(doc, metre('1'));
      await repo.saveMetre(doc, metre('2'));
      session.webEditAfterWrites = 1;
      session.snapshots = 0;
      await expectLater(
        repo.sync('work', 'hole'),
        throwsA(isA<FieldConflict>()),
      );
      expect(session.writes, 1);
      expect(session.snapshotsAtSend, [1, 1]);
      final left = await queue();
      expect(left.map((o) => o['kind']), ['METRE', 'METRE']);
      expect(left.where(isRejected), isEmpty);
      final local = (await store.read(repo.owner, 'hole'))!;
      expect(local['records']['2']['soil']['soilColor'], 'Marrom');
    },
  );

  test('a rejected photo can be removed, with its file', () async {
    final file = await File('${dir.path}/foto.jpg').writeAsBytes([1, 2, 3]);
    final doc = await repo.download('work', 'hole');
    await repo.savePhoto(doc, file.path, '', 'SITE');
    session.refusals['PHOTO'] = refused;
    await expectLater(repo.sync('work', 'hole'), throwsA(isA<FieldRejected>()));
    final local = await store.read(repo.owner, 'hole');
    final stored = local!['localPhotos'].single['path'] as String;
    await repo.removeRejectedPhoto('hole', stored);
    expect(await queue(), isEmpty);
    expect((await store.read(repo.owner, 'hole'))!['localPhotos'], isEmpty);
    expect(await file.exists(), isFalse);
  });

  test('a photo that is not rejected cannot be removed', () async {
    final file = await File('${dir.path}/foto.jpg').writeAsBytes([1]);
    final doc = await repo.download('work', 'hole');
    await repo.savePhoto(doc, file.path, '', 'SITE');
    await expectLater(
      repo.removeRejectedPhoto('hole', file.path),
      throwsStateError,
    );
    expect(await file.exists(), isTrue);
  });

  test('a photo whose file vanished stops blocking the queue', () async {
    final doc = await repo.download('work', 'hole');
    await repo.savePhoto(doc, '${dir.path}/sumiu.jpg', '', 'SITE');
    await repo.saveFields(doc, {'fieldDate': '2026-11-04'});
    await expectLater(repo.sync('work', 'hole'), throwsA(isA<FieldRejected>()));
    final left = await queue();
    expect(left.single['kind'], 'PHOTO');
    expect(left.single['rejection'], contains('não foi encontrada'));
  });

  test('submit does not go out while there are rejected records', () async {
    final doc = await repo.download('work', 'hole');
    await repo.saveMetre(doc, metre('1'));
    session.refusals['METRE'] = refused;
    await expectLater(
      repo.submit('work', 'hole', 'Concluído'),
      throwsA(isA<FieldRejected>()),
    );
    expect((await queue()).map((o) => o['kind']), ['METRE']);
  });

  test('a queued SUBMIT blocks every edit until it is synchronized', () async {
    final doc = await repo.download('work', 'hole');
    await store.save(repo.owner, 'hole', doc, 'SUBMIT', {'note': 'Fim'});
    final file = await File('${dir.path}/foto.jpg').writeAsBytes([1]);
    for (final edit in <Future<void> Function()>[
      () => repo.saveMetre(doc, metre('1')),
      () => repo.saveFields(doc, {'fieldDate': '2026-11-04'}),
      () => repo.saveCoordinate(doc, {'zone': 23}),
      () => repo.savePhoto(doc, file.path, '', 'SITE'),
    ]) {
      await expectLater(
        edit(),
        throwsA(
          isA<StateError>().having(
            (e) => e.message,
            'mensagem',
            contains('envio para análise está pendente'),
          ),
        ),
      );
    }
    expect((await queue()).length, 1);
  });

  test(
    'a rejected SUBMIT leaves the queue, keeps the hole editable and tells why',
    () async {
      final doc = await repo.download('work', 'hole');
      session.refusals['SUBMIT'] = const ApiFailure(
        400,
        'Há metros sem registro.',
      );
      await expectLater(
        repo.submit('work', 'hole', 'Concluído'),
        throwsA(
          isA<FieldRejected>().having(
            (e) => e.message,
            'motivo',
            contains('Há metros sem registro.'),
          ),
        ),
      );
      expect(await queue(), isEmpty);
      await repo.saveMetre(doc, metre('1'));
      expect((await queue()).single['kind'], 'METRE');
    },
  );

  group('profundidade executada contra os metros locais', () {
    Json interrupted(int depth, int mm) => {
      'depthM': '$depth',
      'interruptionReason': 'Impenetrável',
      'advances': [
        {'blows': 30, 'penetrationMm': mm},
      ],
    };
    test('the end follows the API rule', () {
      expect(recordedEndDepth({}), 0);
      expect(
        recordedEndDepth({
          '1': {'depthM': '1', 'advances': <dynamic>[]},
          '6': {'depthM': '6', 'advances': <dynamic>[]},
        }),
        6,
      );
      expect(recordedEndDepth({'7': interrupted(7, 140)}), 6.14);
      // A complete penetration ends at the nominal depth, even if interrupted.
      expect(recordedEndDepth({'7': interrupted(7, 450)}), 7);
      expect(
        recordedEndDepth({
          '7': {
            'depthM': '7',
            'result': {'nSpt': null},
            'advances': [
              {'blows': 30, 'penetrationMm': 140},
            ],
          },
        }),
        6.14,
      );
    });
    testWidgets('the form refuses a depth that leaves metres out', (
      tester,
    ) async {
      Json? saved;
      await tester.pumpWidget(
        MaterialApp(
          home: FieldForm(
            hole: const {'fieldDate': '2026-11-04'},
            records: {
              '6': {'depthM': '6', 'advances': <dynamic>[]},
            },
            onSave: (value) async => saved = value,
          ),
        ),
      );
      final depth = find.byType(TextFormField).at(1);
      await tester.enterText(depth, '5,5');
      await tester.tap(find.text('Salvar no aparelho'));
      await tester.pump();
      expect(
        find.textContaining('Há metros registrados até 6 m'),
        findsOneWidget,
      );
      expect(saved, isNull);
      await tester.enterText(depth, '6');
      await tester.tap(find.text('Salvar no aparelho'));
      await tester.pumpAndSettle();
      expect(saved!['executedDepthM'], '6');
    });
  });
}
