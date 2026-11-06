import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:metro_mobile/auth/operator_session.dart';
import 'package:metro_mobile/core/api_client.dart';
import 'package:metro_mobile/field/field_format.dart';
import 'package:metro_mobile/works/work_contents_screen.dart';
import 'package:metro_mobile/works/work_repository.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'operator_access_test.dart' show MemoryStore;
import 'support/field_fixtures.dart';

class ContentsSession extends OperatorSession {
  ContentsSession()
    : super(
        ApiClient(baseUri: Uri.parse('https://example.invalid')),
        MemoryStore(),
      );
  bool fail = false;
  final routes = <String>[];
  @override
  Future<Map<String, dynamic>> get(String route) async {
    routes.add(route);
    if (fail) throw const NetworkFailure();
    if (route.contains('pastas')) {
      return {
        'items': [
          {'id': 'folder', 'name': 'Setor A'},
        ],
        'total': 1,
      };
    }
    return {
      'items': [
        {
          'id': 'one',
          'code': 'SP-01',
          'folderId': 'folder',
          'plannedDepthM': '20',
        },
        {'id': 'two', 'code': 'SP-02', 'folderId': null},
      ],
      'total': 2,
    };
  }
}

/// Holds hole snapshots until the test lets them through.
class HeldDownloadSession extends ScreenSession {
  final gate = Completer<void>();
  @override
  Future<Map<String, dynamic>> get(String route) async {
    if (route.endsWith('/mobile/snapshot')) await gate.future;
    return super.get(route);
  }
}

void main() {
  sqfliteFfiInit();
  testWidgets('opens folders and shows unfiled holes directly', (tester) async {
    final session = ContentsSession();
    await tester.pumpWidget(
      MaterialApp(
        home: WorkContentsScreen(
          work: const AssignedWork(
            id: 'work',
            name: 'Obra teste',
            location: '',
          ),
          session: session,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('SP-02'), findsOneWidget);
    await tester.tap(find.text('Setor A'));
    await tester.pumpAndSettle();
    expect(find.text('SP-01'), findsOneWidget);
    expect(session.routes, [
      'mobile/obras/work/pastas?page=1',
      'mobile/obras/work/furos?page=1',
    ]);
  });
  testWidgets(
    'network error offers retry without pretending offline data is available',
    (tester) async {
      final session = ContentsSession()..fail = true;
      await tester.pumpWidget(
        MaterialApp(
          home: WorkContentsScreen(
            work: const AssignedWork(
              id: 'work',
              name: 'Obra teste',
              location: '',
            ),
            session: session,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('Conecte-se à internet'), findsOneWidget);
      session.fail = false;
      await tester.tap(find.text('Tentar novamente'));
      await tester.pumpAndSettle();
      expect(find.text('SP-02'), findsOneWidget);
    },
  );

  test('contagem de furos concorda com o número', () {
    expect(holeCount(1), '1 furo');
    expect(holeCount(3), '3 furos');
    expect(holesOnDevice(1), '1 furo disponível no aparelho.');
    expect(holesOnDevice(2), '2 furos disponíveis no aparelho.');
  });

  testWidgets('hole cards do not react to touch while downloading', (
    tester,
  ) async {
    final session = HeldDownloadSession();
    final store = memoryStore();
    await tester.pumpWidget(
      screenApp(
        WorkContentsScreen(
          work: const AssignedWork(id: 'work', name: 'Obra', location: ''),
          session: session,
          store: store,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(AnimatedScale), findsWidgets);
    await tester.tap(find.text('Baixar obra para usar offline'));
    await tester.pump();
    expect(find.text('Baixando furos…'), findsOneWidget);
    expect(find.byType(AnimatedScale), findsNothing);
    session.gate.complete();
    await tester.pumpAndSettle();
    expect(find.byType(AnimatedScale), findsWidgets);
    await tester.pumpWidget(const SizedBox());
    await store.close();
  });

  testWidgets('download informa vários furos no plural', (tester) async {
    final session = ScreenSession();
    final store = memoryStore();
    // Holes with pending work count as available without a new download.
    for (final hole in ['one', 'two']) {
      await store.save(
        session.profile!.cacheKey,
        hole,
        holeDocument(),
        'SUBMIT',
        {'note': 'Fim'},
      );
    }
    await tester.pumpWidget(
      screenApp(
        WorkContentsScreen(
          work: const AssignedWork(id: 'work', name: 'Obra', location: ''),
          session: session,
          store: store,
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Baixar obra para usar offline'));
    await tester.pumpAndSettle();
    expect(
      find.textContaining('2 furos disponíveis no aparelho.'),
      findsOneWidget,
    );
    await tester.pumpWidget(const SizedBox());
    await store.close();
  });
}
