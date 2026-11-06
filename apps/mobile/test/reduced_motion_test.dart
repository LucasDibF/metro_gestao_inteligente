import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:metro_mobile/field/field_store.dart';
import 'package:metro_mobile/field/hole_screen.dart';
import 'package:metro_mobile/works/work_contents_screen.dart';
import 'package:metro_mobile/works/work_repository.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'support/field_fixtures.dart';
import 'work_contents_test.dart' show ContentsSession;

/// Turns on the system preference the way the platform reports it.
void reduceMotion(WidgetTester tester) {
  tester.platformDispatcher.accessibilityFeaturesTestValue =
      const FakeAccessibilityFeatures(disableAnimations: true);
  addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
}

void main() {
  sqfliteFfiInit();

  /// Returns the store, which the test closes after unmounting the screen.
  Future<FieldStore> openSection(WidgetTester tester) async {
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
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Campo'));
    await tester.pump();
    return store;
  }

  testWidgets('hole sections slide when motion is not reduced', (tester) async {
    final store = await openSection(tester);
    expect(tester.hasRunningAnimations, isTrue);
    await tester.pumpAndSettle();
    expect(find.text('Dados de campo'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await store.close();
  });

  testWidgets('reduced motion changes hole sections at once', (tester) async {
    reduceMotion(tester);
    final store = await openSection(tester);
    expect(tester.hasRunningAnimations, isFalse);
    expect(find.text('Dados de campo'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await store.close();
  });

  Future<void> openFolder(WidgetTester tester) async {
    await tester.pumpWidget(
      screenApp(
        WorkContentsScreen(
          work: const AssignedWork(
            id: 'work',
            name: 'Obra teste',
            location: '',
          ),
          session: ContentsSession(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Setor A'));
    await tester.pump();
  }

  testWidgets('folders unfold when motion is not reduced', (tester) async {
    await openFolder(tester);
    expect(tester.hasRunningAnimations, isTrue);
    await tester.pumpAndSettle();
    expect(find.text('SP-01'), findsOneWidget);
  });

  testWidgets('reduced motion opens folders at once', (tester) async {
    reduceMotion(tester);
    await openFolder(tester);
    expect(tester.hasRunningAnimations, isFalse);
    expect(find.text('SP-01'), findsOneWidget);
  });
}
