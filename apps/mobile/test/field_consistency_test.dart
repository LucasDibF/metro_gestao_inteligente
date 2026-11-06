import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:metro_mobile/auth/operator_profile.dart';
import 'package:metro_mobile/core/api_client.dart';
import 'package:metro_mobile/field/field_repository.dart';
import 'package:metro_mobile/field/field_store.dart';
import 'package:metro_mobile/field/hole_screen.dart';
import 'package:metro_mobile/field/metre_editor.dart';
import 'package:metro_mobile/works/work_contents_screen.dart';
import 'package:metro_mobile/works/work_repository.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'field_execution_test.dart' show FieldSession;
import 'support/field_fixtures.dart';

/// Holds snapshots back until the test lets them through.
class GatedSession extends FieldSession {
  Completer<void>? gate;

  /// Delivers writes, then loses the connection for the final refresh.
  bool offlineFailureAfterFirstWrite = false;
  @override
  Future<Json> get(String route) async {
    if (offlineFailureAfterFirstWrite && writes > 0) {
      throw const NetworkFailure();
    }
    final result = await super.get(route);
    await gate?.future;
    return result;
  }
}

Json metre(String depth) => {
  'depthM': depth,
  'advances': <dynamic>[],
  'soil': {'soilType': 'Argila'},
};

void main() {
  sqfliteFfiInit();
  late Directory dir;
  late FieldStore store;
  late GatedSession session;
  late FieldRepository repo;
  setUp(() async {
    dir = await Directory.systemTemp.createTemp('metro-consistency-test');
    store = FieldStore(
      factory: databaseFactoryFfi,
      databasePath: '${dir.path}/field.db',
    );
    session = GatedSession();
    repo = FieldRepository(session, store, photoRoot: () async => dir.path);
  });
  tearDown(() async {
    await store.close();
    await dir.delete(recursive: true);
    session.api.close();
  });

  group('documento velho', () {
    test('saves apply over the stored document, not the screen copy', () async {
      final stale = await repo.download('work', 'hole');
      await repo.saveMetre(stale, metre('1'));
      await repo.saveFields(stale, {'fieldDate': '2026-11-04'});
      await repo.saveCoordinate(stale, {'zone': 23});
      final file = await File('${dir.path}/f.jpg').writeAsBytes([1]);
      await repo.savePhoto(stale, file.path, '', 'SITE');
      final stored = (await store.read(repo.owner, 'hole'))!;
      expect(stored['records']['1'], isNotNull);
      expect(stored['hole']['fieldDate'], '2026-11-04');
      expect(stored['executedCoordinate']['zone'], 23);
      expect(stored['localPhotos'], hasLength(1));
    });
    test('saving does not change the document the caller holds', () async {
      final stale = await repo.download('work', 'hole');
      await repo.saveFields(stale, {'fieldDate': '2026-11-04'});
      expect(stale['hole']['fieldDate'], isNull);
    });
    test('a stored locked hole refuses a screen copy still in draft', () async {
      final stale = await repo.download('work', 'hole');
      final locked = (await store.read(repo.owner, 'hole'))!;
      locked['hole']['reviewState'] = 'IN_REVIEW';
      await store.write(repo.owner, 'hole', locked);
      await expectLater(
        repo.saveFields(stale, {'fieldDate': '2026-11-04'}),
        throwsStateError,
      );
    });
    test('an older snapshot does not replace a newer local copy', () async {
      await repo.download('work', 'hole');
      final slow = Completer<void>();
      session.gate = slow;
      final late_ = repo.download('work', 'hole');
      await Future<void>.delayed(Duration.zero);
      final newer = (await store.read(repo.owner, 'hole'))!;
      newer['serverVersion'] = 9;
      await store.write(repo.owner, 'hole', newer);
      slow.complete();
      expect((await late_)['serverVersion'], 9);
      expect((await store.read(repo.owner, 'hole'))!['serverVersion'], 9);
    });
    testWidgets('the screen shows what a failed sync already delivered', (
      tester,
    ) async {
      await tester.runAsync(() async {
        final doc = await repo.download('work', 'hole');
        await repo.saveFields(doc, {'fieldDate': '2026-11-04'});
      });
      session.offlineFailureAfterFirstWrite = true;
      await tester.pumpWidget(
        screenApp(
          HoleScreen(
            workId: 'work',
            holeId: 'hole',
            code: 'SP-01',
            repository: repo,
          ),
        ),
      );
      await _settle(tester);
      expect(find.text('1 registro(s) pendente(s)'), findsOneWidget);
      await tester.tap(find.text('Sincronizar'));
      await _settle(tester);
      // The queue was delivered; only the final refresh found no connection.
      expect(find.text('Dados salvos no aparelho'), findsOneWidget);
      expect(find.textContaining('Sem conexão'), findsOneWidget);
    });
  });

  group('sincronização concorrente', () {
    test('screens of one account share one repository', () {
      final first = FieldRepository.forAccount(session, store);
      expect(FieldRepository.forAccount(session, store), same(first));
      session.profile = OperatorProfile.fromJson({
        'userId': 'other',
        'role': 'OPERATOR',
        'additionalRoles': <String>[],
        'tenant': {'id': 'company', 'name': 'Empresa'},
      });
      expect(FieldRepository.forAccount(session, store), isNot(same(first)));
    });
    test('a second sync through the shared repository is refused', () async {
      final shared = FieldRepository.forAccount(session, store);
      await shared.download('work', 'hole');
      session.gate = Completer<void>();
      final running = shared.sync('work', 'hole');
      await expectLater(
        FieldRepository.forAccount(session, store).sync('work', 'hole'),
        throwsStateError,
      );
      session.gate!.complete();
      await running;
    });
    test('a draft typed during a sync waits and survives it', () async {
      final doc = await repo.download('work', 'hole');
      await repo.saveMetre(doc, metre('1'));
      session.gate = Completer<void>();
      final running = repo.sync('work', 'hole');
      var written = false;
      final draft = repo
          .saveMetreDraft('hole', 2, {
            'soil': {'soilType': 'Areia'},
          })
          .then((_) => written = true);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(written, isFalse);
      session.gate!.complete();
      await running;
      await draft;
      final stored = (await store.read(repo.owner, 'hole'))!;
      expect(stored['editorDrafts']['2']['soil']['soilType'], 'Areia');
    });
  });

  group('rascunho', () {
    test('download keeps metre drafts instead of failing', () async {
      await repo.download('work', 'hole');
      await repo.saveMetreDraft('hole', 3, {
        'soil': {'soilType': 'Areia'},
      });
      final fresh = await repo.download('work', 'hole');
      expect(fresh['editorDrafts']['3']['soil']['soilType'], 'Areia');
      final doc = await repo.sync('work', 'hole');
      expect(doc['editorDrafts']['3'], isNotNull);
    });
    test('a draft can be discarded', () async {
      await repo.download('work', 'hole');
      await repo.saveMetreDraft('hole', 3, {'soil': <String, dynamic>{}});
      await repo.discardMetreDraft('hole', 3);
      expect((await store.read(repo.owner, 'hole'))!['editorDrafts'], isEmpty);
    });
    testWidgets('the editor discards only after confirmation', (tester) async {
      var discarded = 0;
      await tester.pumpWidget(
        screenApp(
          Builder(
            builder: (context) => TextButton(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute<void>(
                  builder: (_) => MetreEditor(
                    depth: 3,
                    draft: const {'soil': <String, dynamic>{}},
                    onSave: (_) async {},
                    onDiscardDraft: () async => discarded++,
                  ),
                ),
              ),
              child: const Text('abrir'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('abrir'));
      await tester.pumpAndSettle();
      final button = find.text('Descartar rascunho');
      await tester.ensureVisible(button);
      await tester.pumpAndSettle();
      await tester.tap(button);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continuar editando'));
      await tester.pumpAndSettle();
      expect(discarded, 0);
      expect(find.byType(MetreEditor), findsOneWidget);
      await tester.tap(button);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Descartar'));
      await tester.pumpAndSettle();
      expect(discarded, 1);
      expect(find.byType(MetreEditor), findsNothing);
    });
    testWidgets('no discard action without a draft', (tester) async {
      await tester.pumpWidget(
        screenApp(
          MetreEditor(
            depth: 3,
            onSave: (_) async {},
            onDraft: (_) {},
            onDiscardDraft: () async {},
          ),
        ),
      );
      await tester.pump();
      expect(find.text('Descartar rascunho'), findsNothing);
    });
  });

  group('download da obra', () {
    testWidgets('skips the hole with a problem and names it', (tester) async {
      final contents = _SkippingSession();
      final memory = memoryStore();
      await tester.pumpWidget(
        screenApp(
          WorkContentsScreen(
            work: const AssignedWork(id: 'work', name: 'Obra', location: ''),
            session: contents,
            store: memory,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Baixar obra para usar offline'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('1 furo disponível no aparelho.'),
        findsOneWidget,
      );
      expect(find.textContaining('Não baixados: SP-02'), findsOneWidget);
      expect(await memory.read(contents.profile!.cacheKey, 'one'), isNotNull);
      await tester.pumpWidget(const SizedBox());
      await memory.close();
    });
  });

  group('atualizar ao abrir', () {
    test('brings a clean hole up to date and keeps its drafts', () async {
      await repo.download('work', 'hole');
      await repo.saveMetreDraft('hole', 2, {'soil': <String, dynamic>{}});
      session.version = 5;
      final fresh = await repo.refreshIfClean('work', 'hole');
      expect(fresh!['serverVersion'], 5);
      expect(fresh['editorDrafts']['2'], isNotNull);
    });
    test('never touches a hole with pending work', () async {
      final doc = await repo.download('work', 'hole');
      await repo.saveMetre(doc, metre('1'));
      session.version = 5;
      expect(await repo.refreshIfClean('work', 'hole'), isNull);
      expect((await store.read(repo.owner, 'hole'))!['serverVersion'], 1);
    });
    test('does not try while offline, and survives a failure', () async {
      await repo.download('work', 'hole');
      session.version = 5;
      session.offline = true;
      expect(await repo.refreshIfClean('work', 'hole'), isNull);
      session.offline = false;
      session.disconnected = true;
      expect(await repo.refreshIfClean('work', 'hole'), isNull);
      session.disconnected = false;
      session.denied = true;
      expect(await repo.refreshIfClean('work', 'hole'), isNull);
      expect((await store.read(repo.owner, 'hole'))!['serverVersion'], 1);
    });
    test('a save made while the snapshot travels is not overwritten', () async {
      final doc = await repo.download('work', 'hole');
      session.gate = Completer<void>();
      final refresh = repo.refreshIfClean('work', 'hole');
      await Future<void>.delayed(const Duration(milliseconds: 20));
      await repo.saveMetre(doc, metre('1'));
      session.gate!.complete();
      expect(await refresh, isNull);
      final stored = (await store.read(repo.owner, 'hole'))!;
      expect(stored['records']['1'], isNotNull);
      expect(await store.pending(repo.owner, 'hole'), hasLength(1));
    });
  });
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 20; i++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pump();
  }
}

class _SkippingSession extends ScreenSession {
  @override
  Future<Json> get(String route) async {
    if (route.endsWith('two/mobile/snapshot')) {
      throw const ApiFailure(404, 'Indisponível');
    }
    if (route.endsWith('one/mobile/snapshot')) {
      return {
        'technical': {
          'hole': {'id': 'one', 'technicalVersion': 1, 'reviewState': 'DRAFT'},
          'tests': <dynamic>[],
          'layers': <dynamic>[],
          'checklist': <dynamic>[],
        },
        'files': {'coordinates': <dynamic>[], 'photos': <dynamic>[]},
      };
    }
    if (route.contains('/furos')) {
      return {
        'items': [
          {'id': 'one', 'code': 'SP-01', 'folderId': null},
          {'id': 'two', 'code': 'SP-02', 'folderId': null},
        ],
        'total': 2,
      };
    }
    if (route.contains('/pastas')) return {'items': <Json>[], 'total': 0};
    return super.get(route);
  }
}
