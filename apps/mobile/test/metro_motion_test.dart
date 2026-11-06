import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:metro_mobile/ui/metro_theme.dart';
import 'package:metro_mobile/ui/metro_widgets.dart';

Widget _app(Widget child, {bool reduced = false}) => MaterialApp(
  theme: metroTheme(fontFamily: null, headingFamily: null),
  home: Builder(
    builder: (context) => MediaQuery(
      data: MediaQuery.of(context).copyWith(disableAnimations: reduced),
      child: Scaffold(body: child),
    ),
  ),
);

double _opacity(WidgetTester tester, String key) => tester
    .widget<Opacity>(
      find.descendant(
        of: find.byKey(ValueKey(key)),
        matching: find.byType(Opacity),
      ),
    )
    .opacity;

double _scale(WidgetTester tester) =>
    tester.widget<AnimatedScale>(find.byType(AnimatedScale)).scale;

void main() {
  test('motion keeps the web timing', () {
    expect(MetroMotion.color.inMilliseconds, 150);
    expect(MetroMotion.collapse.inMilliseconds, 200);
    expect(MetroMotion.enter.inMilliseconds, 300);
    expect(MetroMotion.exit.inMilliseconds, 200);
    expect(MetroMotion.stagger.inMilliseconds, 45);
    expect(MetroMotion.press.inMilliseconds, 90);
    expect(MetroMotion.release.inMilliseconds, 420);
    expect(MetroMotion.spin.inMilliseconds, 1000);
  });

  testWidgets('list panels cascade in, later items start later', (
    tester,
  ) async {
    await tester.pumpWidget(
      _app(
        Column(
          children: [
            for (final index in [0, 4])
              MetroReveal(
                key: ValueKey('item$index'),
                index: index,
                child: Text('Item $index'),
              ),
          ],
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 120));
    expect(_opacity(tester, 'item0'), greaterThan(_opacity(tester, 'item4')));
    await tester.pumpAndSettle();
    expect(_opacity(tester, 'item0'), 1);
    expect(_opacity(tester, 'item4'), 1);
  });

  testWidgets('reduced motion shows list panels at once', (tester) async {
    await tester.pumpWidget(
      _app(
        const MetroReveal(key: ValueKey('item'), index: 5, child: Text('Item')),
        reduced: true,
      ),
    );
    expect(_opacity(tester, 'item'), 1);
  });

  testWidgets('pressable panels shrink while pressed and spring back', (
    tester,
  ) async {
    var taps = 0;
    await tester.pumpWidget(
      _app(
        MetroPanel(
          pressable: true,
          child: MetroRow(title: 'Obra', onTap: () => taps++),
        ),
      ),
    );
    final gesture = await tester.startGesture(
      tester.getCenter(find.text('Obra')),
    );
    await tester.pump();
    expect(_scale(tester), MetroPressable.pressedScale);
    await gesture.up();
    await tester.pumpAndSettle();
    expect(_scale(tester), 1);
    expect(taps, 1);
  });

  testWidgets('reduced motion keeps pressable panels still', (tester) async {
    await tester.pumpWidget(
      _app(
        const MetroPanel(pressable: true, child: MetroRow(title: 'Obra')),
        reduced: true,
      ),
    );
    expect(find.byType(AnimatedScale), findsNothing);
  });

  testWidgets('the sync icon turns while busy and comes to rest after', (
    tester,
  ) async {
    Widget spin(bool spinning) =>
        _app(MetroSpin(spinning: spinning, child: const Icon(Icons.sync)));
    double turns() => tester
        .widget<RotationTransition>(
          find.descendant(
            of: find.byType(MetroSpin),
            matching: find.byType(RotationTransition),
          ),
        )
        .turns
        .value;

    await tester.pumpWidget(spin(true));
    await tester.pump(const Duration(milliseconds: 250));
    expect(turns(), closeTo(0.25, 0.01));
    await tester.pumpWidget(spin(false));
    await tester.pumpAndSettle();
    expect(turns(), 0);
  });
}
