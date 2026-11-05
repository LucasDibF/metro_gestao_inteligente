import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:metro_mobile/main.dart' as app;
import 'package:metro_mobile/field/field_store.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'operator opens an assigned hole, records soil and field data, and synchronizes',
    (tester) async {
      const qaHole = String.fromEnvironment('qaHoleId');
      const company = String.fromEnvironment('tenantId');
      const user = String.fromEnvironment('userId');
      if (qaHole.isEmpty || company.isEmpty || user.isEmpty) {
        throw StateError('Synthetic fixture required');
      }
      final database = await FieldStore.instance.database;
      await database.transaction((tx) async {
        await tx.delete(
          'documents',
          where: 'owner=? AND hole=?',
          whereArgs: ['$company:$user', qaHole],
        );
        await tx.delete(
          'operations',
          where: 'owner=? AND hole=?',
          whereArgs: ['$company:$user', qaHole],
        );
      });
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
      expect(find.text('Minhas obras'), findsOneWidget);
      await tester.tap(find.text('Validação automática · Mobile'));
      await tester.pumpAndSettle(const Duration(seconds: 1));
      await tester.tap(find.text('QA-01'));
      await tester.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('Execução metro a metro'), findsOneWidget);
      await binding.takeScreenshot('01-metros');
      await tester.tap(find.text('Preencher 0–1 m'));
      await tester.pumpAndSettle();
      expect(find.text('Primeiro metro · Solo inicial'), findsOneWidget);
      await tester.enterText(
        find.byKey(const ValueKey('soil-type')),
        'Argila arenosa',
      );
      await tester.enterText(
        find.byKey(const ValueKey('soil-color')),
        'Marrom',
      );
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      await binding.takeScreenshot('02-solo-inicial');
      await tester.scrollUntilVisible(
        find.text('Salvar metro no aparelho'),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Salvar metro no aparelho'));
      await tester.pumpAndSettle();
      expect(find.textContaining('1 registro(s) pendente(s)'), findsOneWidget);
      await tester.tap(find.text('Preencher 1–2 m'));
      await tester.pumpAndSettle();
      for (var i = 0; i < 3; i++) {
        final blows = find.byKey(ValueKey('blows-$i'));
        final penetration = find.byKey(ValueKey('penetration-$i'));
        await tester.scrollUntilVisible(
          blows,
          120,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.enterText(blows, '${3 + i}');
        await tester.scrollUntilVisible(
          penetration,
          120,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.enterText(penetration, '15');
      }
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.scrollUntilVisible(
        find.text('Mesmo tipo e cor do metro anterior'),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Mesmo tipo e cor do metro anterior'));
      await tester.scrollUntilVisible(
        find.text('Salvar metro no aparelho'),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Salvar metro no aparelho'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Campo'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Preencher dados de campo'));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(TextFormField).at(0));
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField).at(1), '2');
      await tester.enterText(find.byType(TextFormField).at(2), '1,2');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.ensureVisible(find.text('Salvar no aparelho'));
      await tester.tap(find.text('Salvar no aparelho'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Sincronizar'));
      await tester.pumpAndSettle(const Duration(seconds: 1));
      expect(
        find.text('Todos os registros foram sincronizados.'),
        findsOneWidget,
      );
      await binding.takeScreenshot('03-campo');
      await tester.tap(find.text('Fotos'));
      await tester.pumpAndSettle();
      await binding.takeScreenshot('04-fotos');
      await tester.tap(find.text('Conferência'));
      await tester.pumpAndSettle();
      await binding.takeScreenshot('05-conferencia');
      expect(find.text('Concluir e enviar para análise'), findsOneWidget);
      await tester.tap(find.text('Metros'));
      await tester.pumpAndSettle();
      await binding.takeScreenshot('06-metros-sincronizados');
    },
  );
}
