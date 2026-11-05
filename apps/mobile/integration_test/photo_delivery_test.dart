import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:metro_mobile/main.dart' as app;
import 'package:metro_mobile/field/hole_screen.dart';
import 'package:metro_mobile/field/photo_recovery.dart';
import 'photo_fixture.dart';

/// Run after field_flow_test against its disposable QA work, never real field data.
void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('photo upload, processing and field submission lock the hole', (
    tester,
  ) async {
    app.main();
    await tester.pumpAndSettle(const Duration(seconds: 1));
    if (find.text('Acesso do sondador').evaluate().isNotEmpty) {
      await tester.enterText(
        find.byType(TextFormField).at(0),
        const String.fromEnvironment('tenantId'),
      );
      await tester.enterText(
        find.byType(TextFormField).at(1),
        const String.fromEnvironment('email'),
      );
      await tester.enterText(
        find.byType(TextFormField).at(2),
        const String.fromEnvironment('password'),
      );
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.ensureVisible(find.text('Entrar'));
      await tester.tap(find.text('Entrar'));
      await tester.pumpAndSettle(const Duration(seconds: 1));
    }
    await tester.tap(find.text('Validação automática · Mobile'));
    await tester.pumpAndSettle(const Duration(seconds: 1));
    await tester.tap(find.text('QA-01'));
    await tester.pumpAndSettle(const Duration(seconds: 1));
    final screen = tester.widget<HoleScreen>(find.byType(HoleScreen));
    final repo = screen.repository;
    final temporary = await File(
      '${(await getTemporaryDirectory()).path}/field-test.jpg',
    ).writeAsBytes(base64Decode(photoFixture));
    final durable = await durablePhoto(temporary.path, repo.owner);
    final doc = await repo.open(screen.workId, screen.holeId);
    await repo.savePhoto(doc, durable, '', 'SAMPLE_2');
    await tester.tap(find.text('Sincronizar'));
    await tester.pumpAndSettle(const Duration(seconds: 1));
    var ready = false;
    for (var i = 0; i < 15; i++) {
      final saved = await repo.open(screen.workId, screen.holeId);
      ready =
          (saved['files']['photos'] as List).isNotEmpty &&
          (saved['files']['photos'] as List).every(
            (p) => p['processingState'] == 'READY',
          );
      if (ready) break;
      await tester.pumpAndSettle(const Duration(seconds: 2));
      await tester.tap(find.text('Sincronizar'));
      await tester.pumpAndSettle(const Duration(seconds: 1));
    }
    expect(ready, isTrue);
    await tester.tap(find.text('Fotos'));
    await tester.pumpAndSettle(const Duration(seconds: 1));
    expect(find.text('Sincronizada · Processada'), findsOneWidget);
    await binding.takeScreenshot('07-fotografia-processada');
    await tester.tap(find.text('Conferência'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Concluir e enviar para análise'));
    await tester.tap(find.text('Concluir e enviar para análise'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Confirmar envio'));
    await tester.pumpAndSettle(const Duration(seconds: 1));
    expect(find.text('Enviado · Edição bloqueada'), findsOneWidget);
    await binding.takeScreenshot('08-enviado-para-analise');
  });
}
