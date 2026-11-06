import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:metro_mobile/field/hole_submit_dialog.dart';

void main() {
  Future<List<Object?>> open(WidgetTester tester, String button) async {
    final results = <Object?>[];
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () async => results.add(await showSubmitDialog(context)),
            child: const Text('Abrir'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Abrir'));
    await tester.pumpAndSettle();
    // As in the field, the note has focus with the keyboard open when the dialog closes.
    await tester.tap(find.byType(TextField));
    await tester.pump();
    await tester.tap(find.text(button));
    // Step through the closing animation frame by frame: the field must stay usable.
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 16));
    }
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Enviar para análise?'), findsNothing);
    return results;
  }

  testWidgets('cancelling closes without error and returns nothing', (
    tester,
  ) async {
    expect(await open(tester, 'Cancelar'), [null]);
  });

  testWidgets('confirming closes without error and returns the note', (
    tester,
  ) async {
    expect(await open(tester, 'Confirmar envio'), [
      'Execução de campo concluída. Solicito análise técnica.',
    ]);
  });
}
