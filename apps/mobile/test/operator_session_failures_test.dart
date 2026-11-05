import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:metro_mobile/auth/operator_session.dart';
import 'package:metro_mobile/core/api_client.dart';
import 'operator_access_test.dart' show MemoryStore, json, profile;

String savedSession({Duration validFor = const Duration(hours: 1)}) =>
    jsonEncode({
      'refreshToken': 'refresh',
      'offlineUntil': DateTime.now().add(validFor).toIso8601String(),
      'profile': profile(),
    });

ApiClient client(MockClientHandler handler) => ApiClient(
  baseUri: Uri.parse('https://example.invalid/api/v1'),
  transport: MockClient(handler),
);

void main() {
  group('falhas de TLS e E/S', () {
    for (final failure in <Exception>[
      const HandshakeException('certificado'),
      const TlsException('tls'),
      const SocketException('rede'),
      const HttpException('resposta cortada'),
    ]) {
      test('${failure.runtimeType} becomes NetworkFailure', () async {
        final api = client((_) async => throw failure);
        await expectLater(api.request('x'), throwsA(isA<NetworkFailure>()));
        await expectLater(
          api.bytes('x', token: 't'),
          throwsA(isA<NetworkFailure>()),
        );
      });
    }
    test('a handshake failure at startup enters the offline mode', () async {
      final store = MemoryStore()..value = savedSession();
      final session = OperatorSession(
        client((_) async => throw const HandshakeException('certificado')),
        store,
      );
      await session.restore();
      expect(session.offline, isTrue);
      expect(session.profile, isNotNull);
    });
    test('a missing upload file is not reported as lack of network', () async {
      final api = client((_) async => json({}));
      await expectLater(
        api.upload('x', '/nao/existe.jpg', {}, token: 't'),
        throwsA(isA<FileSystemException>()),
      );
    });
  });

  group('restauração da sessão', () {
    for (final status in [500, 502, 503, 429, 403]) {
      test('$status keeps the session in the offline mode', () async {
        final store = MemoryStore()..value = savedSession();
        final session = OperatorSession(
          client((_) async => json({}, status: status)),
          store,
        );
        await session.restore();
        expect(session.offline, isTrue);
        expect(session.profile?.userId, 'operator-a');
        expect(store.value, isNotNull);
      });
    }
    test('a page that is not JSON keeps the session', () async {
      final store = MemoryStore()..value = savedSession();
      final session = OperatorSession(
        client((_) async => http.Response('<html>portal</html>', 200)),
        store,
      );
      await session.restore();
      expect(session.offline, isTrue);
      expect(store.value, isNotNull);
    });
    test('a 401 ends the session', () async {
      final store = MemoryStore()..value = savedSession();
      final session = OperatorSession(
        client((_) async => json({}, status: 401)),
        store,
      );
      await session.restore();
      expect(session.profile, isNull);
      expect(store.value, isNull);
    });
    for (final broken in ['não é json', '[]', '{"refreshToken":"r"}']) {
      test('unreadable saved session "$broken" is cleared', () async {
        final store = MemoryStore()..value = broken;
        final session = OperatorSession(client((_) async => json({})), store);
        await session.restore();
        expect(session.profile, isNull);
        expect(store.value, isNull);
      });
    }
    test('5xx past the offline window does not open the data', () async {
      final store = MemoryStore()
        ..value = savedSession(validFor: const Duration(hours: -1));
      final session = OperatorSession(
        client((_) async => json({}, status: 503)),
        store,
      );
      await session.restore();
      expect(session.profile, isNull);
    });
    test(
      'after a 5xx startup, requests fall back like a lost connection',
      () async {
        final store = MemoryStore()..value = savedSession();
        final session = OperatorSession(
          client((_) async => json({}, status: 503)),
          store,
        );
        await session.restore();
        await expectLater(
          session.get('mobile/obras'),
          throwsA(isA<NetworkFailure>()),
        );
        expect(session.profile, isNotNull);
      },
    );
  });

  group('403', () {
    Future<OperatorSession> signedIn(http.Response denied) async {
      final session = OperatorSession(
        client((request) async {
          if (request.url.path.endsWith('/login')) {
            return json({'accessToken': 'a', 'refreshToken': 'r'});
          }
          if (request.url.path.endsWith('/me')) return json(profile());
          return denied;
        }),
        MemoryStore(),
      );
      await session.login(tenantId: 't', email: 'e', password: 'p');
      return session;
    }

    test('FIELD_EXECUTION_LOCKED is a local error, in Portuguese', () async {
      final session = await signedIn(
        json({
          'code': 'FIELD_EXECUTION_LOCKED',
          'message': 'Field execution is locked',
        }, status: 403),
      );
      await expectLater(
        session.request('x', method: 'POST', body: {}),
        throwsA(
          isA<ApiFailure>()
              .having((e) => e.code, 'code', 'FIELD_EXECUTION_LOCKED')
              .having((e) => e.message, 'message', contains('bloqueada')),
        ),
      );
      expect(session.profile, isNotNull);
    });
    test('any other 403 shows the API message and keeps the session', () async {
      final session = await signedIn(
        json({'message': 'Obra sem atribuição'}, status: 403),
      );
      await expectLater(
        session.get('x'),
        throwsA(
          isA<ApiFailure>().having(
            (e) => e.message,
            'message',
            'Obra sem atribuição',
          ),
        ),
      );
      expect(session.profile, isNotNull);
    });
    test('a 403 on an upload keeps the session too', () async {
      final session = await signedIn(json({}, status: 403));
      final dir = await Directory.systemTemp.createTemp('metro-upload');
      final file = await File('${dir.path}/f.jpg').writeAsBytes([1]);
      await expectLater(
        session.upload('x', file.path, {}),
        throwsA(isA<ApiFailure>()),
      );
      expect(session.profile, isNotNull);
      await dir.delete(recursive: true);
    });
    test('a 401 on a request still ends the session', () async {
      final session = await signedIn(json({}, status: 401));
      await expectLater(session.get('x'), throwsA(isA<ApiFailure>()));
      expect(session.profile, isNull);
    });
    test('a refusal explains itself with the API reason', () async {
      final session = await signedIn(
        json({'message': 'Solo inválido'}, status: 422),
      );
      await expectLater(
        session.get('x'),
        throwsA(
          isA<ApiFailure>().having((e) => e.message, 'm', 'Solo inválido'),
        ),
      );
    });
    test('a review code used as message is not shown raw', () async {
      final session = await signedIn(
        json({
          'code': 'SOIL_DESCRIPTION_REQUIRED',
          'message': 'SOIL_DESCRIPTION_REQUIRED',
        }, status: 400),
      );
      await expectLater(
        session.get('x'),
        throwsA(
          isA<ApiFailure>().having((e) => e.message, 'm', contains('solo')),
        ),
      );
    });
  });
}
