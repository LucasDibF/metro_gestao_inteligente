import 'package:flutter/material.dart';
import 'metro_animations.dart' show MetroPageTransitions;
import 'metro_fonts.dart';
import 'metro_motion.dart';
import 'metro_palette.dart';

export 'metro_animations.dart' show MetroPageTransitions;
export 'metro_fonts.dart';
export 'metro_motion.dart';
export 'metro_palette.dart';

abstract final class MetroSpace {
  static const xxs = 2.0;
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 24.0;
  static const xxl = 32.0;
}

abstract final class MetroRadius {
  static const alert = 5.0;
  static const control = 8.0;
  static const panel = 12.0;
}

/// Touch sizes for gloved, one-handed use.
abstract final class MetroTarget {
  static const primary = 56.0;
  static const secondary = 52.0;
  static const minimum = 48.0;
}

abstract final class MetroIconSize {
  /// Beside a line of text, as in the hole status.
  static const inline = 22.0;
  static const navigation = 24.0;

  /// Stands in for a photo that has not loaded.
  static const placeholder = 40.0;
}

/// Thin bars drawn in reserved space, so showing them never moves content.
abstract final class MetroStroke {
  static const progress = 3.0;
}

TextTheme _textTheme(MetroPalette palette, String? sans, String? heading) {
  final base = TextStyle(
    color: palette.ink,
    letterSpacing: 0,
    fontFamily: sans,
  );
  TextStyle style(
    double size,
    double height,
    FontWeight weight, {
    String? family,
  }) => base.copyWith(
    fontSize: size,
    height: height,
    fontWeight: weight,
    fontFamily: family ?? sans,
  );
  return TextTheme(
    displaySmall: style(40, 1.1, FontWeight.w600, family: heading),
    headlineSmall: style(26, 1.25, FontWeight.w600, family: heading),
    titleLarge: style(21, 1.3, FontWeight.w600, family: heading),
    titleMedium: style(17, 1.35, FontWeight.w600),
    titleSmall: style(15, 1.35, FontWeight.w600),
    bodyLarge: style(16, 1.5, FontWeight.w400),
    bodyMedium: style(15, 1.5, FontWeight.w400),
    bodySmall: style(14, 1.45, FontWeight.w400),
    labelLarge: style(16, 1.25, FontWeight.w500),
    labelMedium: style(13, 1.25, FontWeight.w600),
    labelSmall: style(12, 1.25, FontWeight.w600),
  );
}

ButtonStyle _buttonShape(double height) => ButtonStyle(
  minimumSize: WidgetStatePropertyAll(Size(MetroTarget.minimum, height)),
  padding: const WidgetStatePropertyAll(
    EdgeInsets.symmetric(horizontal: MetroSpace.lg, vertical: MetroSpace.sm),
  ),
  iconSize: const WidgetStatePropertyAll(22),
  animationDuration: MetroMotion.color,
  shape: WidgetStatePropertyAll(
    RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(MetroRadius.control),
    ),
  ),
);

OutlineInputBorder _inputBorder(Color color, {double width = 1}) =>
    OutlineInputBorder(
      borderRadius: BorderRadius.circular(MetroRadius.control),
      borderSide: BorderSide(color: color, width: width),
    );

/// [fontFamily] and [headingFamily] are replaceable for tests that render
/// with fonts loaded from the Flutter SDK.
ThemeData metroTheme({
  Brightness brightness = Brightness.light,
  String? fontFamily = MetroFonts.sans,
  String? headingFamily = MetroFonts.heading,
}) {
  final palette = brightness == Brightness.dark
      ? MetroPalette.dark
      : MetroPalette.light;
  final colors = ColorScheme.fromSeed(
    seedColor: palette.brand,
    brightness: brightness,
    primary: palette.brand,
    onPrimary: palette.onBrand,
    secondaryContainer: palette.selection,
    onSecondaryContainer: palette.brandText,
    surface: palette.page,
    onSurface: palette.ink,
    onSurfaceVariant: palette.muted,
    surfaceTint: Colors.transparent,
    surfaceContainerLowest: palette.surface,
    surfaceContainerLow: palette.surface,
    surfaceContainer: palette.surface,
    surfaceContainerHigh: palette.surface,
    surfaceContainerHighest: palette.subtle,
    outline: palette.inputLine,
    outlineVariant: palette.line,
    error: palette.errorText,
  );
  final text = _textTheme(palette, fontFamily, headingFamily);
  const transitions = MetroPageTransitions();
  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    fontFamily: fontFamily,
    colorScheme: colors,
    textTheme: text,
    extensions: [palette],
    scaffoldBackgroundColor: palette.page,
    // The web gives feedback by changing colour, not with ripples.
    splashFactory: NoSplash.splashFactory,
    highlightColor: palette.brand.withValues(alpha: 0.08),
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {
        TargetPlatform.android: transitions,
        TargetPlatform.iOS: transitions,
        TargetPlatform.fuchsia: transitions,
        TargetPlatform.linux: transitions,
        TargetPlatform.macOS: transitions,
        TargetPlatform.windows: transitions,
      },
    ),
    dividerTheme: DividerThemeData(color: palette.line, thickness: 1, space: 1),
    textSelectionTheme: TextSelectionThemeData(
      cursorColor: palette.brandText,
      selectionColor: palette.selection,
      selectionHandleColor: palette.brandText,
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: palette.page,
      foregroundColor: palette.ink,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleSpacing: MetroSpace.lg,
      titleTextStyle: text.titleMedium?.copyWith(fontSize: 18),
      shape: Border(bottom: BorderSide(color: palette.line)),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(
        minimumSize: const Size.square(MetroTarget.minimum),
        foregroundColor: palette.ink,
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: palette.surface,
      isDense: false,
      contentPadding: const EdgeInsets.symmetric(
        horizontal: MetroSpace.md,
        vertical: MetroSpace.lg,
      ),
      hintStyle: text.bodyLarge?.copyWith(color: palette.muted),
      helperStyle: text.bodySmall?.copyWith(color: palette.muted),
      helperMaxLines: 4,
      errorStyle: text.bodySmall?.copyWith(color: palette.errorText),
      errorMaxLines: 4,
      border: _inputBorder(palette.inputLine),
      enabledBorder: _inputBorder(palette.inputLine),
      disabledBorder: _inputBorder(palette.line),
      focusedBorder: _inputBorder(palette.focus, width: 2),
      errorBorder: _inputBorder(palette.errorText),
      focusedErrorBorder: _inputBorder(palette.errorText, width: 2),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: _buttonShape(MetroTarget.primary).merge(
        ButtonStyle(
          backgroundColor: WidgetStateProperty.resolveWith(
            (states) => states.contains(WidgetState.disabled)
                ? palette.line
                : states.contains(WidgetState.pressed)
                ? palette.brandPressed
                : palette.brand,
          ),
          foregroundColor: WidgetStateProperty.resolveWith(
            (states) => states.contains(WidgetState.disabled)
                ? palette.muted
                : palette.onBrand,
          ),
          overlayColor: const WidgetStatePropertyAll(Colors.transparent),
          textStyle: WidgetStatePropertyAll(text.labelLarge),
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: _buttonShape(MetroTarget.secondary).merge(
        OutlinedButton.styleFrom(
          foregroundColor: palette.brandText,
          disabledForegroundColor: palette.muted,
          overlayColor: palette.brand,
          side: BorderSide(color: palette.inputLine),
          textStyle: text.labelLarge,
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: _buttonShape(MetroTarget.minimum).merge(
        TextButton.styleFrom(
          foregroundColor: palette.brandText,
          disabledForegroundColor: palette.muted,
          overlayColor: palette.brand,
          textStyle: text.labelLarge,
        ),
      ),
    ),
    switchTheme: SwitchThemeData(
      trackOutlineColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected)
            ? palette.brand
            : palette.inputLine,
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: palette.surface,
      insetPadding: const EdgeInsets.all(MetroSpace.lg),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(MetroRadius.panel),
      ),
      titleTextStyle: text.titleLarge,
      contentTextStyle: text.bodyLarge,
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: palette.ink,
      contentTextStyle: text.bodyMedium?.copyWith(color: palette.page),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(MetroRadius.control),
      ),
    ),
    listTileTheme: ListTileThemeData(
      horizontalTitleGap: MetroSpace.md,
      subtitleTextStyle: TextStyle(color: palette.muted, fontSize: 15),
    ),
    expansionTileTheme: ExpansionTileThemeData(
      shape: const Border(),
      collapsedShape: const Border(),
      iconColor: palette.ink,
      collapsedIconColor: palette.ink,
      textColor: palette.ink,
      collapsedTextColor: palette.ink,
      expansionAnimationStyle: const AnimationStyle(
        duration: MetroMotion.enter,
        curve: MetroMotion.enterCurve,
        reverseDuration: MetroMotion.exit,
        reverseCurve: MetroMotion.exitCurve,
      ),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(
      color: palette.brandText,
      linearTrackColor: palette.selection,
    ),
  );
}
