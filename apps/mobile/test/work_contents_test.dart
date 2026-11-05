import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:metro_mobile/auth/operator_session.dart';
import 'package:metro_mobile/core/api_client.dart';
import 'package:metro_mobile/works/work_contents_screen.dart';
import 'package:metro_mobile/works/work_repository.dart';
import 'operator_access_test.dart' show MemoryStore;

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

void main() {
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
}
