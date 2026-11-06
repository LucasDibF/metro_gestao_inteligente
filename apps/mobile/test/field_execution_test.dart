import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:metro_mobile/auth/operator_profile.dart';
import 'package:metro_mobile/auth/operator_session.dart';
import 'package:metro_mobile/core/api_client.dart';
import 'package:metro_mobile/field/field_store.dart';
import 'package:metro_mobile/field/field_repository.dart';
import 'operator_access_test.dart' show MemoryStore;

class FieldSession extends OperatorSession {
  FieldSession()
    : super(
        ApiClient(baseUri: Uri.parse('https://example.invalid')),
        MemoryStore(),
      ) {
    profile = OperatorProfile.fromJson({
      'userId': 'operator',
      'role': 'OPERATOR',
      'additionalRoles': <String>[],
      'tenant': {'id': 'company', 'name': 'Empresa'},
    });
  }
  @override
  bool get offlineReadAllowed => true;
  int version = 1, writes = 0;
  bool disconnected = false, loseResponse = false, denied = false;
  String review = 'DRAFT';
  final receipts = <String, Json>{};
  final records = <String, Json>{};
  final sent = <Json>[];
  Json snapshot() => {
    'technical': {
      'hole': {
        'id': 'hole',
        'code': 'SP-01',
        'technicalVersion': version,
        'reviewState': review,
      },
      'tests': records.values.toList(),
      'layers': <dynamic>[],
      'checklist': [
        {'label': 'Data', 'stage': 'review', 'complete': true},
      ],
    },
    'files': {'coordinates': <dynamic>[], 'photos': <dynamic>[]},
  };
  @override
  Future<Json> get(String route) async {
    if (denied) throw const ApiFailure(404, 'Obra indisponível');
    if (disconnected) throw const NetworkFailure();
    if (route.contains('/operacoes/')) {
      return {'receipt': receipts[route.split('/').last]};
    }
    return snapshot();
  }

  @override
  Future<Json> request(
    String route, {
    String method = 'GET',
    Json? body,
  }) async {
    if (disconnected) throw const NetworkFailure();
    if (denied) throw const ApiFailure(404, 'Obra indisponível');
    sent.add(jsonDecode(jsonEncode(body)) as Json);
    final id = body!['operationId'] as String;
    if (receipts.containsKey(id)) return receipts[id]!;
    if (body['expectedTechnicalVersion'] != version) {
      throw const ApiFailure(409, 'Conflito');
    }
    writes++;
    version++;
    final payload = body['payload'] as Json;
    Json result = {...payload, 'id': 'server-record', 'version': writes};
    if (body['kind'] == 'METRE') records[payload['depthM'] as String] = result;
    if (body['kind'] == 'SUBMIT') review = 'IN_REVIEW';
    final receipt = {
      'technicalVersion': version,
      'reviewState': review,
      'result': result,
    };
    receipts[id] = receipt;
    if (loseResponse) {
      loseResponse = false;
      throw const NetworkFailure();
    }
    return receipt;
  }
}

void main() {
  sqfliteFfiInit();
  late Directory dir;
  late FieldStore store;
  late FieldSession session;
  late FieldRepository repo;
  setUp(() async {
    dir = await Directory.systemTemp.createTemp('metro-offline-test');
    store = FieldStore(
      factory: databaseFactoryFfi,
      databasePath: '${dir.path}/field.db',
    );
    session = FieldSession();
    repo = FieldRepository(session, store);
  });
  tearDown(() async {
    await store.close();
    await dir.delete(recursive: true);
    session.api.close();
  });
  Json metre(String depth) => {
    'depthM': depth,
    if (depth == '1') 'recordType': 'INITIAL_SOIL',
    'advances': depth == '1'
        ? <dynamic>[]
        : [
            {'blows': 3, 'penetrationMm': 150},
            {'blows': 4, 'penetrationMm': 150},
            {'blows': 5, 'penetrationMm': 150},
          ],
    'soil': {
      'soilType': 'Argila arenosa',
      'soilColor': 'Marrom',
      'description': '',
    },
    'interruptionReason': null,
    'fieldDetails': {'executionMethod': 'TC'},
  };
  test(
    'offline metre and its queue survive close and reopen; another user cannot read them',
    () async {
      final doc = await repo.download('work', 'hole');
      session.disconnected = true;
      await repo.saveMetre(doc, metre('1'));
      await store.close();
      store = FieldStore(
        factory: databaseFactoryFfi,
        databasePath: '${dir.path}/field.db',
      );
      repo = FieldRepository(session, store);
      final restored = await repo.open('work', 'hole');
      expect(restored['records']['1']['soil']['soilType'], 'Argila arenosa');
      expect((await store.pending(repo.owner, 'hole')).length, 1);
      expect(await store.read('another-company:operator', 'hole'), isNull);
    },
  );
  test(
    'lost response resumes by receipt, without a duplicate mutation',
    () async {
      await repo.download('work', 'hole');
      await repo.saveMetre((await repo.open('work', 'hole')), metre('1'));
      session.loseResponse = true;
      await expectLater(
        repo.sync('work', 'hole'),
        throwsA(isA<NetworkFailure>()),
      );
      expect(session.writes, 1);
      expect((await store.pending(repo.owner, 'hole')).length, 1);
      await repo.sync('work', 'hole');
      expect(session.writes, 1);
      expect(await store.pending(repo.owner, 'hole'), isEmpty);
    },
  );
  test(
    'sequential queued edits use the acknowledged version and record ID',
    () async {
      final doc = await repo.download('work', 'hole');
      await repo.saveMetre(doc, metre('1'));
      final next = await repo.open('work', 'hole');
      await repo.saveMetre(next, metre('1')..['soil']['soilColor'] = 'Cinza');
      await repo.sync('work', 'hole');
      expect(session.sent[0]['expectedTechnicalVersion'], 1);
      expect(session.sent[1]['expectedTechnicalVersion'], 2);
      expect(session.sent[1]['recordId'], 'server-record');
      expect(session.sent[1]['payload']['version'], 1);
    },
  );
  test(
    'server conflict and revoked assignment preserve local changes',
    () async {
      final doc = await repo.download('work', 'hole');
      await repo.saveMetre(doc, metre('1'));
      session.version++;
      await expectLater(
        repo.sync('work', 'hole'),
        throwsA(isA<FieldConflict>()),
      );
      expect(session.writes, 0);
      session.denied = true;
      await expectLater(repo.sync('work', 'hole'), throwsA(isA<ApiFailure>()));
      expect((await store.pending(repo.owner, 'hole')).length, 1);
      expect(
        (await store.read(
          repo.owner,
          'hole',
        ))!['records']['1']['soil']['soilColor'],
        'Marrom',
      );
    },
  );
  test(
    'a hole returned by the engineer becomes editable again after synchronizing',
    () async {
      await repo.download('work', 'hole');
      final submitted = await repo.submit('work', 'hole', 'Execução concluída');
      expect(submitted['hole']['reviewState'], 'IN_REVIEW');
      await expectLater(
        repo.saveMetre(submitted, metre('1')),
        throwsStateError,
      );
      session.review = 'DRAFT';
      session.version++;
      final returned = await repo.sync('work', 'hole');
      expect(returned['hole']['reviewState'], 'DRAFT');
      await repo.saveMetre(returned, metre('1'));
      expect((await store.pending(repo.owner, 'hole')).length, 1);
    },
  );
  test(
    'queued data cannot be replaced by a fresh download; submitted holes cannot be edited',
    () async {
      final doc = await repo.download('work', 'hole');
      await repo.saveFields(doc, {
        'fieldDate': '2026-11-04',
        'executedDepthM': '1',
        'waterLevelM': null,
      });
      await expectLater(
        repo.download('work', 'hole'),
        throwsA(isA<FieldConflict>()),
      );
      final locked = await repo.open('work', 'hole');
      locked['hole']['reviewState'] = 'IN_REVIEW';
      await expectLater(repo.saveMetre(locked, metre('1')), throwsStateError);
    },
  );
}
