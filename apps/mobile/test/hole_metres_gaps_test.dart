import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:metro_mobile/field/field_repository.dart';
import 'package:metro_mobile/field/field_store.dart';
import 'package:metro_mobile/field/hole_photos_tab.dart';
import 'package:metro_mobile/field/hole_metres_tab.dart';
import 'support/field_fixtures.dart';
import 'support/screen_checks.dart';

Future<List<int>> _pump(
  WidgetTester tester,
  Map<String, dynamic> records, {
  String? executed,
  Json drafts = const {},
  Map<String, String> rejections = const {},
}) async {
  final opened = <int>[];
  await tester.pumpWidget(
    screenApp(
      Scaffold(
        body: HoleMetresTab(
          doc: {
            'hole': {'executedDepthM': executed},
            'records': records,
            'editorDrafts': drafts,
          },
          draft: true,
          busy: false,
          rejections: rejections,
          onEditMetre: opened.add,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return opened;
}

void main() {
  test('finds the metres missing below the deepest record', () {
    expect(HoleMetresTab.missingMetres([]), isEmpty);
    expect(HoleMetresTab.missingMetres([1, 2, 3]), isEmpty);
    expect(HoleMetresTab.missingMetres([1, 4, 6]), [2, 3, 5]);
    expect(HoleMetresTab.missingMetres([3]), [1, 2]);
  });

  testWidgets('a missing metre in the middle can be created', (tester) async {
    final opened = await _pump(tester, {
      '1': metreRecord(1, initial: true),
      '2': metreRecord(2),
      '4': metreRecord(4),
    });
    expect(find.textContaining('Faltam metros'), findsOneWidget);
    await tester.tap(find.text('Preencher 2–3 m'));
    expect(opened, [3]);
    await tester.tap(find.text('Preencher 4–5 m'));
    expect(opened, [3, 5]);
  });

  testWidgets('a closed hole still offers the missing metre', (tester) async {
    final opened = await _pump(tester, {
      '1': metreRecord(1, initial: true),
      '3': metreRecord(3),
    }, executed: '3');
    expect(find.textContaining('Encerrado em 3 m'), findsOneWidget);
    await tester.tap(find.text('Preencher 1–2 m'));
    expect(opened, [2]);
  });

  testWidgets('a continuous hole shows no warning', (tester) async {
    await _pump(tester, {
      '1': metreRecord(1, initial: true),
      '2': metreRecord(2),
    });
    expect(find.textContaining('Faltam metros'), findsNothing);
  });

  testWidgets('a gap with a draft is resumed, not offered twice', (
    tester,
  ) async {
    final opened = await _pump(
      tester,
      {'1': metreRecord(1, initial: true), '3': metreRecord(3)},
      drafts: {'2': <String, dynamic>{}},
    );
    expect(find.text('Preencher 1–2 m'), findsNothing);
    await tester.tap(find.text('Retomar rascunho 1–2 m'));
    expect(opened, [2]);
  });

  testWidgets('a draft past the closed depth stays reachable', (tester) async {
    final opened = await _pump(
      tester,
      {'1': metreRecord(1, initial: true)},
      executed: '1',
      drafts: {'2': <String, dynamic>{}},
    );
    await tester.tap(find.text('Retomar rascunho 1–2 m'));
    expect(opened, [2]);
  });

  testWidgets('a rejected metre shows why and stays editable', (tester) async {
    final opened = await _pump(
      tester,
      {'1': metreRecord(1, initial: true)},
      rejections: {'METRE:1': 'Solo obrigatório.'},
    );
    expect(find.textContaining('Solo obrigatório.'), findsOneWidget);
    await tester.tap(find.textContaining('Toque para corrigir'));
    expect(opened, [1]);
  });

  testWidgets('warnings and rejections fit a narrow phone at 200%', (
    tester,
  ) async {
    final viewport = viewports.first;
    applyViewport(tester, viewport, textScale: 2);
    await _pump(
      tester,
      {'1': metreRecord(1, initial: true), '4': metreRecord(4)},
      rejections: {'METRE:4': 'A profundidade não pode ser registrada.'},
    );
    expect(tester.takeException(), isNull);
    expectContentInsideWindow(tester, viewport);
  });

  group('fotografia recusada', () {
    Future<List<String>> pumpPhotos(WidgetTester tester) async {
      final removed = <String>[];
      final store = memoryStore();
      final document = holeDocument();
      final FieldRepository repository = await repositoryWith(document, store);
      await tester.pumpWidget(
        screenApp(
          Scaffold(
            body: HolePhotosTab(
              doc: document,
              draft: true,
              busy: false,
              repository: repository,
              workId: 'work',
              holeId: 'hole',
              onAddPhoto: () {},
              rejections: const {'PHOTO:/nao/existe.jpg': 'Formato inválido.'},
              onRemovePhoto: removed.add,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      return removed;
    }

    testWidgets('shows why and removes only after confirmation', (
      tester,
    ) async {
      final removed = await pumpPhotos(tester);
      expect(find.textContaining('Formato inválido.'), findsOneWidget);
      final button = find.text('Remover fotografia');
      await tester.ensureVisible(button);
      await tester.pumpAndSettle();
      await tester.tap(button);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Manter'));
      await tester.pumpAndSettle();
      expect(removed, isEmpty);
      await tester.tap(button);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Remover'));
      await tester.pumpAndSettle();
      expect(removed, ['/nao/existe.jpg']);
    });
  });
}
