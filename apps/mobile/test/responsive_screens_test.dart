import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:metro_mobile/auth/login_screen.dart';
import 'package:metro_mobile/field/hole_screen.dart';
import 'package:metro_mobile/field/metre_editor.dart';
import 'package:metro_mobile/works/work_contents_screen.dart';
import 'package:metro_mobile/works/work_repository.dart';
import 'package:metro_mobile/works/works_screen.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'operator_access_test.dart' show MemoryCache;
import 'support/field_fixtures.dart';
import 'support/screen_checks.dart';

void main() {
  sqfliteFfiInit();
  setUpAll(() async {
    if (capturing) await loadCaptureFonts();
  });
  final font = screenFont;

  for (final viewport in viewports) {
    for (final scale in textScales) {
      final label = '${viewport.name} a ${(scale * 100).round()}%';

      testWidgets('login e validação · $label', (tester) async {
        applyViewport(tester, viewport, textScale: scale);
        final semantics = tester.ensureSemantics();
        await tester.pumpWidget(
          screenApp(
            LoginScreen(session: ScreenSession(signedIn: false)),
            fontFamily: font,
          ),
        );
        await tester.pumpAndSettle();
        await checkScreen(tester, 'login', viewport, scale);
        await reveal(tester, find.text('Entrar'));
        await tester.tap(find.text('Entrar'));
        await tester.pumpAndSettle();
        await checkScreen(
          tester,
          'login-erros',
          viewport,
          scale,
          guidelines: false,
        );
        semantics.dispose();
      });

      testWidgets('obras: lista, vazia e falha · $label', (tester) async {
        applyViewport(tester, viewport, textScale: scale);
        final semantics = tester.ensureSemantics();
        for (final (name, session) in [
          ('obras', ScreenSession()),
          ('obras-vazia', ScreenSession(emptyWorks: true)),
          ('obras-falha', ScreenSession(worksFail: true)),
        ]) {
          await tester.pumpWidget(
            screenApp(
              WorksScreen(
                key: ValueKey(name),
                session: session,
                repository: WorkRepository(session, MemoryCache()),
              ),
              fontFamily: font,
            ),
          );
          await tester.pumpAndSettle();
          await checkScreen(tester, name, viewport, scale);
        }
        semantics.dispose();
      });

      testWidgets('conteúdo da obra com pasta aberta · $label', (tester) async {
        applyViewport(tester, viewport, textScale: scale);
        final semantics = tester.ensureSemantics();
        await tester.pumpWidget(
          screenApp(
            WorkContentsScreen(
              work: const AssignedWork(
                id: 'work',
                name: longWorkName,
                location: '',
              ),
              session: ScreenSession(signedIn: false),
            ),
            fontFamily: font,
          ),
        );
        await tester.pumpAndSettle();
        await checkScreen(tester, 'conteudo-fechado', viewport, scale);
        await reveal(tester, find.textContaining('Setor A'));
        await tester.tap(find.textContaining('Setor A'));
        await tester.pumpAndSettle();
        await checkScreen(
          tester,
          'conteudo-obra',
          viewport,
          scale,
          guidelines: false,
        );
        semantics.dispose();
      });

      testWidgets('furo: as quatro seções · $label', (tester) async {
        applyViewport(tester, viewport, textScale: scale);
        final semantics = tester.ensureSemantics();
        final store = memoryStore();
        final repository = await repositoryWith(holeDocument(), store);
        await tester.pumpWidget(
          screenApp(
            HoleScreen(
              workId: 'work',
              holeId: 'hole',
              code: 'SP-01',
              repository: repository,
            ),
            fontFamily: font,
          ),
        );
        await tester.pumpAndSettle();
        await checkScreen(tester, 'furo-metros', viewport, scale);
        for (final (section, name) in [
          ('Campo', 'furo-campo'),
          ('Fotos', 'furo-fotos'),
          ('Conferência', 'furo-conferencia'),
        ]) {
          await tester.tap(find.text(section));
          await tester.pumpAndSettle();
          await checkScreen(tester, name, viewport, scale);
        }
        await tester.pumpWidget(const SizedBox());
        await store.close();
        semantics.dispose();
      });

      testWidgets('furo enviado e sem dados · $label', (tester) async {
        applyViewport(tester, viewport, textScale: scale);
        for (final (name, document) in [
          ('furo-bloqueado', holeDocument(locked: true)),
          ('furo-vazio', holeDocument(empty: true)),
        ]) {
          final store = memoryStore();
          final repository = await repositoryWith(document, store);
          await tester.pumpWidget(
            screenApp(
              HoleScreen(
                key: ValueKey(name),
                workId: 'work',
                holeId: 'hole',
                code: 'SP-01',
                repository: repository,
              ),
              fontFamily: font,
            ),
          );
          await tester.pumpAndSettle();
          await checkScreen(tester, name, viewport, scale, guidelines: false);
          await tester.pumpWidget(const SizedBox());
          await store.close();
        }
      });
    }

    for (final keyboard in [if (viewport.height > 500) 300.0 else 180.0]) {
      for (final scale in textScales) {
        testWidgets(
          'teclado aberto · ${viewport.name} a ${(scale * 100).round()}%',
          (tester) async {
            applyViewport(
              tester,
              viewport,
              textScale: scale,
              keyboard: keyboard,
            );
            await tester.pumpWidget(
              screenApp(
                MetreEditor(
                  depth: 2,
                  onSave: (_) async {},
                  record: metreRecord(2),
                ),
                fontFamily: font,
              ),
            );
            await tester.pumpAndSettle();
            await checkScreen(
              tester,
              'editor-teclado',
              viewport,
              scale,
              guidelines: false,
            );
            await tester.pumpWidget(
              screenApp(
                LoginScreen(session: ScreenSession(signedIn: false)),
                fontFamily: font,
              ),
            );
            await tester.pumpAndSettle();
            await checkScreen(
              tester,
              'login-teclado',
              viewport,
              scale,
              guidelines: false,
            );
          },
        );
      }
    }
  }
}
