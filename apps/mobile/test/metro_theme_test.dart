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
  test('text keeps at least 4.5:1 on every surface it is used on', () {
    const pairs = [
      (MetroColors.ink, MetroColors.page),
      (MetroColors.ink, MetroColors.surface),
      (MetroColors.ink, MetroColors.subtle),
      (MetroColors.muted, MetroColors.page),
      (MetroColors.muted, MetroColors.surface),
      (MetroColors.muted, MetroColors.subtle),
      (MetroColors.muted, MetroColors.line),
      (MetroColors.brand, MetroColors.page),
      (MetroColors.brand, MetroColors.selection),
      (Colors.white, MetroColors.brand),
      (MetroColors.errorText, MetroColors.errorSurface),
      (MetroColors.noticeText, MetroColors.noticeSurface),
    ];
    for (final (foreground, background) in pairs) {
      expect(
        contrast(foreground, background),
        greaterThanOrEqualTo(4.5),
        reason: '$foreground sobre $background',
      );
    }
  });

  test('field borders stay visible at 3:1', () {
    expect(
      contrast(MetroColors.inputLine, MetroColors.surface),
      greaterThanOrEqualTo(3),
    );
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
