import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:metro_mobile/auth/operator_profile.dart';
import 'package:metro_mobile/auth/operator_session.dart';
import 'package:metro_mobile/auth/session_store.dart';
import 'package:metro_mobile/core/api_client.dart';
import 'package:metro_mobile/works/work_repository.dart';

class MemoryStore implements SessionStore {
  String? value;
  @override
  Future<String?> read() async => value;
  @override
  Future<void> write(String value) async {
    this.value = value;
  }

  @override
  Future<void> clear() async {
    value = null;
  }
}

class MemoryCache implements WorkCache {
  final values = <String, List<Map<String, dynamic>>>{};
  @override
  Future<List<Map<String, dynamic>>?> read(String owner) async => values[owner];
  @override
  Future<void> write(String owner, List<Map<String, dynamic>> works) async {
    values[owner] = works;
  }
}

Map<String, dynamic> profile({String role = 'OPERATOR'}) => {
  'userId': 'operator-a',
  'role': role,
  'additionalRoles': <String>[],
  'tenant': {'id': 'company-a', 'name': 'Empresa A'},
};
http.Response json(Object data, {int status = 200}) => http.Response(
  jsonEncode(data),
  status,
  headers: {'content-type': 'application/json'},
);
void main() {
  test('only operator responsibilities grant access to the mobile profile', () {
    expect(OperatorProfile.fromJson(profile()).company, 'Empresa A');
    for (final role in ['ADMIN', 'COMMERCIAL', 'ENGINEER', 'VIEWER']) {
      expect(
        () => OperatorProfile.fromJson(profile(role: role)),
        throwsFormatException,
      );
    }
    final combined = profile(role: 'ADMIN')..['additionalRoles'] = ['OPERATOR'];
    expect(OperatorProfile.fromJson(combined).userId, 'operator-a');
  });
  test(
    'login validates the profile and stores no password or access token',
    () async {
      final store = MemoryStore();
      final api = ApiClient(
        baseUri: Uri.parse('https://example.invalid/api/v1'),
        transport: MockClient((r) async {
          if (r.url.path.endsWith('/login')) {
            return json({'accessToken': 'access', 'refreshToken': 'refresh'});
          }
          return json(profile());
        }),
      );
      final session = OperatorSession(api, store);
      await session.login(
        tenantId: 'company-a',
        email: 'operator@example.invalid',
        password: 'private-password',
      );
      expect(session.profile?.userId, 'operator-a');
      expect(store.value, contains('refresh'));
      expect(store.value, isNot(contains('private-password')));
      expect(store.value, isNot(contains('accessToken')));
    },
  );
  test('non-operator login is rejected without retaining a session', () async {
    final store = MemoryStore();
    final api = ApiClient(
      baseUri: Uri.parse('https://example.invalid/api/v1'),
      transport: MockClient((r) async {
        if (r.url.path.endsWith('/login')) {
          return json({'accessToken': 'access', 'refreshToken': 'refresh'});
        }
        if (r.url.path.endsWith('/logout')) return json({});
        return json(profile(role: 'ENGINEER'));
      }),
    );
    final session = OperatorSession(api, store);
    await expectLater(
      session.login(
        tenantId: 'company-a',
        email: 'engineer@example.invalid',
        password: 'password',
      ),
      throwsFormatException,
    );
    expect(store.value, isNull);
    expect(session.profile, isNull);
  });
  test(
    'offline restoration requires a prior, unexpired operator session',
    () async {
      final store = MemoryStore();
      Future<OperatorSession> restore(DateTime until) async {
        store.value = jsonEncode({
          'refreshToken': 'refresh',
          'offlineUntil': until.toIso8601String(),
          'profile': profile(),
        });
        final api = ApiClient(
          baseUri: Uri.parse('https://example.invalid/api/v1'),
          transport: MockClient(
            (r) async => throw http.ClientException('offline'),
          ),
        );
        final session = OperatorSession(api, store);
        await session.restore();
        return session;
      }

      final valid = await restore(DateTime.now().add(const Duration(hours: 1)));
      expect(valid.profile?.userId, 'operator-a');
      expect(valid.offline, isTrue);
      final expired = await restore(
        DateTime.now().subtract(const Duration(hours: 1)),
      );
      expect(expired.profile, isNull);
      expect(store.value, isNull);
    },
  );
  test(
    'a rotated refresh token is saved even if the subsequent profile request loses connection',
    () async {
      final store = MemoryStore()
        ..value = jsonEncode({
          'refreshToken': 'old',
          'offlineUntil': DateTime.now()
              .add(const Duration(hours: 1))
              .toIso8601String(),
          'profile': profile(),
        });
      final api = ApiClient(
        baseUri: Uri.parse('https://example.invalid/api/v1'),
        transport: MockClient((r) async {
          if (r.url.path.endsWith('/refresh')) {
            return json({
              'accessToken': 'new-access',
              'refreshToken': 'rotated',
            });
          }
          throw http.ClientException('offline');
        }),
      );
      final session = OperatorSession(api, store);
      await session.restore();
      expect(jsonDecode(store.value!)['refreshToken'], 'rotated');
    },
  );
  test(
    'an online profile without the operator role ends the session',
    () async {
      final store = MemoryStore()
        ..value = jsonEncode({
          'refreshToken': 'old',
          'offlineUntil': DateTime.now()
              .add(const Duration(hours: 1))
              .toIso8601String(),
          'profile': profile(),
        });
      final api = ApiClient(
        baseUri: Uri.parse('https://example.invalid/api/v1'),
        transport: MockClient((r) async {
          if (r.url.path.endsWith('/refresh')) {
            return json({'accessToken': 'access', 'refreshToken': 'rotated'});
          }
          return json({...profile(), 'role': 'VIEWER', 'additionalRoles': []});
        }),
      );
      final session = OperatorSession(api, store);
      await session.restore();
      expect(session.profile, isNull);
      expect(session.offline, isFalse);
      expect(store.value, isNull);
    },
  );
  test(
    'cached works are isolated by company and operator, and authorization errors never fall back to cache',
    () async {
      final store = MemoryStore()
        ..value = jsonEncode({
          'refreshToken': 'refresh',
          'offlineUntil': DateTime.now()
              .add(const Duration(hours: 1))
              .toIso8601String(),
          'profile': profile(),
        });
      var denied = false;
      final api = ApiClient(
        baseUri: Uri.parse('https://example.invalid/api/v1'),
        transport: MockClient((r) async {
          if (denied) return json({}, status: 401);
          throw http.ClientException('offline');
        }),
      );
      final session = OperatorSession(api, store);
      await session.restore();
      final cache = MemoryCache();
      await cache.write('other-company:operator-a', [
        {'id': 'foreign', 'name': 'Foreign', 'city': null, 'state': null},
      ]);
      final repository = WorkRepository(session, cache);
      await expectLater(repository.load(), throwsA(isA<NetworkFailure>()));
      await cache.write(session.profile!.cacheKey, [
        {'id': 'own', 'name': 'Assigned', 'city': null, 'state': null},
      ]);
      expect((await repository.load()).items.single.id, 'own');
      denied = true;
      await expectLater(repository.load(), throwsA(isA<ApiFailure>()));
      expect(session.profile, isNull);
    },
  );
  test(
    'all assigned pages are cached atomically and an online revocation removes stale works',
    () async {
      final store = MemoryStore();
      final cache = MemoryCache();
      var revoked = false;
      final pages = <int>[];
      final api = ApiClient(
        baseUri: Uri.parse('https://example.invalid/api/v1'),
        transport: MockClient((request) async {
          if (request.url.path.endsWith('/login')) {
            return json({'accessToken': 'access', 'refreshToken': 'refresh'});
          }
          if (request.url.path.endsWith('/me')) return json(profile());
          final page = int.parse(request.url.queryParameters['page']!);
          pages.add(page);
          return json({
            'items': revoked
                ? []
                : [
                    {
                      'id': 'work-$page',
                      'name': 'Work $page',
                      'city': null,
                      'state': null,
                    },
                  ],
            'total': revoked ? 0 : 2,
          });
        }),
      );
      final session = OperatorSession(api, store);
      await session.login(
        tenantId: 'company-a',
        email: 'operator@example.invalid',
        password: 'password',
      );
      final repository = WorkRepository(session, cache);
      final result = await repository.load();
      expect(pages, [1, 2]);
      expect(result.items.map((work) => work.id), ['work-1', 'work-2']);
      expect((await cache.read(session.profile!.cacheKey))!.length, 2);
      revoked = true;
      expect((await repository.load()).items, isEmpty);
      expect(await cache.read(session.profile!.cacheKey), isEmpty);
    },
  );
}
