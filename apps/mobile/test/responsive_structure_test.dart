import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:metro_mobile/field/field_store.dart';
import 'package:metro_mobile/field/hole_screen.dart';
import 'package:metro_mobile/field/metre_editor.dart';
import 'package:metro_mobile/works/work_contents_screen.dart';
import 'package:metro_mobile/works/work_repository.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'support/field_fixtures.dart';
import 'support/screen_checks.dart';

void main() {
  sqfliteFfiInit();
  group('estrutura adaptativa', () {
    Future<void> pumpHole(
      WidgetTester tester,
      FieldStore store,
      Json doc,
    ) async {
      final repository = await repositoryWith(doc, store);
      await tester.pumpWidget(
        screenApp(
          HoleScreen(
            workId: 'work',
            holeId: 'hole',
            code: 'SP-01',
            repository: repository,
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    testWidgets('seções ficam na base do telefone e ao lado no tablet', (
      tester,
    ) async {
      final store = memoryStore();
      applyViewport(tester, viewports[1]);
      await pumpHole(tester, store, holeDocument());
      final phone = tester.getCenter(find.text('Metros'));
      expect(phone.dy, greaterThan(viewports[1].height * 0.8));
      await tester.pumpWidget(const SizedBox());
      applyViewport(tester, viewports[3]);
      await tester.pump();
      await pumpHole(tester, store, holeDocument());
      final tablet = tester.getCenter(find.text('Metros'));
      expect(tablet.dx, lessThan(96));
      expect(tablet.dy, lessThan(viewports[3].height * 0.5));
      await tester.pumpWidget(const SizedBox());
      await store.close();
    });

    testWidgets('ação principal fica ao alcance do polegar no telefone', (
      tester,
    ) async {
      final store = memoryStore();
      applyViewport(tester, viewports[1]);
      await pumpHole(tester, store, holeDocument());
      final action = tester.getCenter(find.text('Preencher 4–5 m'));
      expect(action.dy, greaterThan(viewports[1].height * 0.75));
      await tester.pumpWidget(const SizedBox());
      await store.close();
    });

    testWidgets('botão de salvar deixa de ocupar a tela com teclado aberto', (
      tester,
    ) async {
      applyViewport(tester, viewports[0], keyboard: 260);
      await tester.pumpWidget(
        screenApp(MetreEditor(depth: 1, onSave: (_) async {})),
      );
      await tester.pumpAndSettle();
      // In a short window the action is part of the scroll, off screen at first.
      expect(find.text('Salvar metro no aparelho').hitTestable(), findsNothing);
      await tester.scrollUntilVisible(
        find.text('Salvar metro no aparelho'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(
        find.text('Salvar metro no aparelho').hitTestable(),
        findsOneWidget,
      );
    });

    testWidgets('campo obrigatório fora da área visível ainda é validado', (
      tester,
    ) async {
      applyViewport(tester, viewports[0], textScale: 2);
      var saved = false;
      await tester.pumpWidget(
        screenApp(
          MetreEditor(
            depth: 2,
            record: const {
              'advances': [
                {'blows': 3, 'penetrationMm': 150},
                {'blows': 3, 'penetrationMm': 150},
                {'blows': 3, 'penetrationMm': 150},
              ],
            },
            onSave: (_) async => saved = true,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await reveal(tester, find.text('Salvar metro no aparelho'));
      await tester.tap(find.text('Salvar metro no aparelho'));
      await tester.pumpAndSettle();
      expect(saved, isFalse);
      expect(find.text('Informe o tipo de solo'), findsOneWidget);
    });

    // Without scrolling, the docked action must still validate the fields
    // below the fold; a lazy list would never build them.
    testWidgets('ação fixa valida campo obrigatório sem rolar', (tester) async {
      final failures = <String>[];
      for (final viewport in viewports.sublist(1, 5)) {
        for (final scale in textScales) {
          final name = '${viewport.name} a ${(scale * 100).round()}%';
          applyViewport(tester, viewport, textScale: scale);
          var saved = false;
          // A new app per window: a wrong save pops the editor's only route.
          await tester.pumpWidget(
            KeyedSubtree(
              key: ValueKey(name),
              child: screenApp(
                MetreEditor(
                  depth: 2,
                  record: const {
                    'advances': [
                      {'blows': 3, 'penetrationMm': 150},
                      {'blows': 3, 'penetrationMm': 150},
                      {'blows': 3, 'penetrationMm': 150},
                    ],
                  },
                  onSave: (_) async => saved = true,
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          final action = find.text('Salvar metro no aparelho').hitTestable();
          expect(action, findsOneWidget, reason: 'ação fixa em $name');
          await tester.tap(action);
          await tester.pumpAndSettle();
          if (saved || find.text('Informe o tipo de solo').evaluate().isEmpty) {
            failures.add(name);
          }
        }
      }
      expect(failures, isEmpty, reason: 'salvou sem tipo de solo');
    });

    testWidgets('três avanços lado a lado só quando cabem', (tester) async {
      Future<double> secondAdvanceTop(
        ScreenWindow viewport,
        double scale,
      ) async {
        applyViewport(tester, viewport, textScale: scale);
        await tester.pumpWidget(
          screenApp(
            MetreEditor(
              key: ValueKey(viewport.name + scale.toString()),
              depth: 2,
              onSave: (_) async {},
            ),
          ),
        );
        await tester.pumpAndSettle();
        return tester.getTopLeft(find.byKey(const ValueKey('blows-1'))).dy -
            tester.getTopLeft(find.byKey(const ValueKey('blows-0'))).dy;
      }

      expect(await secondAdvanceTop(viewports[1], 1), greaterThan(0));
      expect(await secondAdvanceTop(viewports[3], 1), 0);
      expect(await secondAdvanceTop(viewports[3], 2), greaterThan(0));
    });

    testWidgets('furo encerrado não oferece novo metro', (tester) async {
      final store = memoryStore();
      applyViewport(tester, viewports[1]);
      await pumpHole(tester, store, holeDocument(executedDepth: '4'));
      expect(find.textContaining('Preencher'), findsNothing);
      expect(find.textContaining('Encerrado em 4 m'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      await store.close();
    });

    testWidgets('catálogo offline abre pastas salvas em JSON', (tester) async {
      final store = memoryStore();
      applyViewport(tester, viewports[1]);
      final session = ScreenSession();
      await store.catalog(session.profile!.cacheKey, 'work', {
        'rows': [
          {
            'id': 'folder',
            'name': 'Setor A',
            'children': [
              {'id': 'one', 'code': 'SP-01'},
            ],
          },
        ],
      });
      session.disconnected = true;
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
      expect(tester.takeException(), isNull);
      expect(find.textContaining('Catálogo salvo'), findsOneWidget);
      await tester.tap(find.text('Setor A'));
      await tester.pumpAndSettle();
      expect(find.text('SP-01'), findsOneWidget);
      expect(find.text('1 furo'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      await store.close();
    });
  });
}
