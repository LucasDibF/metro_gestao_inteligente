import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'field_fixtures.dart';

/// Set with --dart-define=CAPTURE_DIR=... and --update-goldens to save PNGs.
const captureDir = String.fromEnvironment('CAPTURE_DIR');
const capturing = captureDir != '';
const textScales = [1.0, 2.0];
String? get screenFont => capturing ? captureFont : null;

/// Every text on screen must stay inside the window horizontally.
void expectContentInsideWindow(WidgetTester tester, ScreenWindow viewport) {
  for (final element in find.byType(Text).evaluate()) {
    final box = element.renderObject;
    if (box is! RenderBox || !box.hasSize || !box.attached) continue;
    final rect = MatrixUtils.transformRect(
      box.getTransformTo(null),
      Offset.zero & box.size,
    );
    expect(
      rect.right,
      lessThanOrEqualTo(viewport.width + 0.5),
      reason: 'Texto fora da janela: ${element.widget}',
    );
    expect(rect.left, greaterThanOrEqualTo(-0.5));
  }
}

/// Brings a control of a lazy list into view, wherever the layout placed it.
Future<void> reveal(WidgetTester tester, Finder target) async {
  await tester.scrollUntilVisible(
    target,
    120,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.pumpAndSettle();
}

Future<void> checkScreen(
  WidgetTester tester,
  String name,
  ScreenWindow viewport,
  double scale, {
  bool guidelines = true,
}) async {
  expect(tester.takeException(), isNull);
  expectContentInsideWindow(tester, viewport);
  if (guidelines) {
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
  }
  if (capturing) {
    await expectLater(
      find.byType(MaterialApp),
      matchesGoldenFile(
        '$captureDir/${viewport.name}/${(scale * 100).round()}/$name.png',
      ),
    );
  }
}
