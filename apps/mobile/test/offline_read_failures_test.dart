import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:metro_mobile/auth/operator_session.dart';
import 'package:metro_mobile/core/api_client.dart';
import 'package:metro_mobile/works/work_catalog.dart';
import 'package:metro_mobile/works/work_repository.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'operator_access_test.dart' show MemoryCache, MemoryStore, json, profile;
import 'support/field_fixtures.dart' show memoryStore;

/// Signed-in session whose reads all answer [status] once it is set.
class StatusSession extends OperatorSession {
  StatusSession._(super.api, super.store);
  int? status;
  bool readWindowOpen = true;

  @override
  bool get offlineReadAllowed => readWindowOpen && super.offlineReadAllowed;

  static Future<StatusSession> signedIn() async {
    late final StatusSession session;
    final api = ApiClient(
      baseUri: Uri.parse('https://example.invalid/api/v1'),
      transport: MockClient((request) async {
        final status = session.status;
        if (status != null) return json({}, status: status);
        if (request.url.path.endsWith('/login')) {
          return json({'accessToken': 'access', 'refreshToken': 'refresh'});
        }
        if (request.url.path.endsWith('/me')) return json(profile());
        return json({'items': <Object>[], 'total': 0});
      }),
    );
    session = StatusSession._(api, MemoryStore());
    await session.login(
      tenantId: 'company-a',
      email: 'operator@example.invalid',
      password: 'password',
    );
    return session;
  }
}

const savedWork = {'id': 'saved', 'name': 'Obra salva', 'city': null};
const savedRows = [
  {'id': 'hole', 'code': 'SP-01', 'folderId': null},
];

void main() {
  sqfliteFfiInit();

  for (final status in [503, 429]) {
    group('$status na leitura', () {
      test('lista de obras usa a cópia salva', () async {
        final session = await StatusSession.signedIn();
        final cache = MemoryCache();
        await cache.write(session.profile!.cacheKey, [savedWork]);
        session.status = status;
        final works = await WorkRepository(session, cache).load();
        expect(works.cached, isTrue);
        expect(works.items.single.id, 'saved');
      });

      test('catálogo da obra usa a cópia salva', () async {
        final session = await StatusSession.signedIn();
        final store = memoryStore();
        addTearDown(store.close);
        await store.catalog(session.profile!.cacheKey, 'work', {
          'rows': savedRows,
        });
        session.status = status;
        final catalog = await WorkCatalogRepository(
          session,
          store,
        ).load('work');
        expect(catalog.cached, isTrue);
        expect(catalog.rows.single['code'], 'SP-01');
      });

      test('sem cópia salva, o erro do servidor chega à tela', () async {
        final session = await StatusSession.signedIn();
        final store = memoryStore();
        addTearDown(store.close);
        session.status = status;
        final failure = isA<ApiFailure>().having((f) => f.status, 's', status);
        await expectLater(
          WorkRepository(session, MemoryCache()).load(),
          throwsA(failure),
        );
        await expectLater(
          WorkCatalogRepository(session, store).load('work'),
          throwsA(failure),
        );
        expect(session.profile, isNotNull);
      });

      test('fora da janela offline, a cópia salva não abre', () async {
        final session = await StatusSession.signedIn();
        final cache = MemoryCache();
        final store = memoryStore();
        addTearDown(store.close);
        await cache.write(session.profile!.cacheKey, [savedWork]);
        await store.catalog(session.profile!.cacheKey, 'work', {
          'rows': savedRows,
        });
        session
          ..status = status
          ..readWindowOpen = false;
        await expectLater(
          WorkRepository(session, cache).load(),
          throwsA(isA<ApiFailure>()),
        );
        await expectLater(
          WorkCatalogRepository(session, store).load('work'),
          throwsA(isA<ApiFailure>()),
        );
      });
    });
  }

  for (final status in [401, 403, 404]) {
    test('$status nunca vira acesso offline, mesmo com cópia salva', () async {
      final session = await StatusSession.signedIn();
      final owner = session.profile!.cacheKey;
      final cache = MemoryCache();
      final store = memoryStore();
      addTearDown(store.close);
      await cache.write(owner, [savedWork]);
      await store.catalog(owner, 'work', {'rows': savedRows});
      session.status = status;
      final failure = isA<ApiFailure>().having((f) => f.status, 's', status);
      await expectLater(
        WorkCatalogRepository(session, store).load('work'),
        throwsA(failure),
      );
      if (status == 401) {
        // The session ended; nothing of the account stays reachable.
        expect(session.profile, isNull);
        return;
      }
      await expectLater(
        WorkRepository(session, cache).load(),
        throwsA(failure),
      );
      expect(session.profile, isNotNull);
    });
  }

  test('401 na lista de obras encerra a sessão sem abrir o cache', () async {
    final session = await StatusSession.signedIn();
    final cache = MemoryCache();
    await cache.write(session.profile!.cacheKey, [savedWork]);
    session.status = 401;
    await expectLater(
      WorkRepository(session, cache).load(),
      throwsA(isA<ApiFailure>().having((f) => f.status, 'status', 401)),
    );
    expect(session.profile, isNull);
  });

  test('classificação central só libera falhas sem resposta de acesso', () {
    expect(allowsOfflineRead(const NetworkFailure()), isTrue);
    for (final status in [500, 502, 503, 504, 429]) {
      expect(allowsOfflineRead(ApiFailure(status, '')), isTrue);
    }
    for (final status in [400, 401, 403, 404, 409, 422]) {
      expect(allowsOfflineRead(ApiFailure(status, '')), isFalse);
    }
    expect(allowsOfflineRead(const FormatException('x')), isFalse);
  });
}
