import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:metro_mobile/ui/metro_theme.dart';

double contrast(Color a, Color b) {
  final (lighter, darker) = a.computeLuminance() > b.computeLuminance()
      ? (a.computeLuminance(), b.computeLuminance())
      : (b.computeLuminance(), a.computeLuminance());
  return (lighter + 0.05) / (darker + 0.05);
}

void main() {
  const palettes = {'claro': MetroPalette.light, 'escuro': MetroPalette.dark};

  for (final MapEntry(key: name, value: p) in palettes.entries) {
    test('$name: text keeps at least 4.5:1 on every surface it is used on', () {
      final pairs = [
        (p.ink, p.page),
        (p.ink, p.surface),
        (p.ink, p.subtle),
        (p.muted, p.page),
        (p.muted, p.surface),
        (p.muted, p.subtle),
        (p.muted, p.line),
        (p.brandText, p.page),
        (p.brandText, p.surface),
        (p.brandText, p.selection),
        (p.onBrand, p.brand),
        (p.onBrand, p.brandPressed),
        (p.errorText, p.errorSurface),
        (p.noticeText, p.noticeSurface),
        (p.page, p.ink),
      ];
      for (final (foreground, background) in pairs) {
        expect(
          contrast(foreground, background),
          greaterThanOrEqualTo(4.5),
          reason: '$foreground sobre $background',
        );
      }
    });

    test('$name: field borders and focus stay visible at 3:1', () {
      expect(contrast(p.inputLine, p.surface), greaterThanOrEqualTo(3));
      expect(contrast(p.focus, p.surface), greaterThanOrEqualTo(3));
    });
  }

  test('claro: errors keep 7:1 on their surface and 4.5:1 on the page', () {
    const p = MetroPalette.light;
    expect(contrast(p.errorText, p.errorSurface), greaterThanOrEqualTo(7));
    expect(contrast(p.errorText, p.surface), greaterThanOrEqualTo(4.5));
    expect(contrast(p.errorText, p.page), greaterThanOrEqualTo(4.5));
  });

  test('the active brightness selects its palette', () {
    expect(metroTheme().extension<MetroPalette>(), MetroPalette.light);
    expect(
      metroTheme(brightness: Brightness.dark).extension<MetroPalette>(),
      MetroPalette.dark,
    );
  });

  test('headings use Fraunces and text uses IBM Plex Sans, as on the web', () {
    final text = metroTheme().textTheme;
    expect(text.headlineSmall?.fontFamily, MetroFonts.heading);
    expect(text.titleLarge?.fontFamily, MetroFonts.heading);
    expect(text.bodyMedium?.fontFamily, MetroFonts.sans);
    expect(text.labelLarge?.fontFamily, MetroFonts.sans);
  });

  testWidgets('screen changes skip animation when motion is reduced', (
    tester,
  ) async {
    late Duration normal, reduced;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) {
            normal = MetroMotion.of(context, MetroMotion.enter);
            return MediaQuery(
              data: MediaQuery.of(context).copyWith(disableAnimations: true),
              child: Builder(
                builder: (context) {
                  reduced = MetroMotion.of(context, MetroMotion.enter);
                  return const SizedBox();
                },
              ),
            );
          },
        ),
      ),
    );
    expect(normal, const Duration(milliseconds: 300));
    expect(reduced, Duration.zero);
  });

  test('buttons from the theme keep the field touch sizes', () {
    final theme = metroTheme();
    Size? minimum(ButtonStyle? style) =>
        style?.minimumSize?.resolve(<WidgetState>{});
    expect(minimum(theme.filledButtonTheme.style)?.height, MetroTarget.primary);
    expect(
      minimum(theme.outlinedButtonTheme.style)?.height,
      MetroTarget.secondary,
    );
    expect(minimum(theme.textButtonTheme.style)?.height, MetroTarget.minimum);
  });
}
