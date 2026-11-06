import 'package:flutter/material.dart';

/// Metro palette from `apps/web/DESIGN.md`, darkened where sunlight needs it.
abstract final class MetroColors {
  static const brand = Color(0xff1600ff);
  static const brandPressed = Color(0xff1200cc);
  static const selection = Color(0xffe8e6ff);
  static const ink = Color(0xff1f1b17);
  static const muted = Color(0xff57524c);
  static const page = Color(0xfffbfaf8);
  static const surface = Colors.white;
  static const subtle = Color(0xfff3f1ed);
  static const line = Color(0xffded9d2);
  static const inputLine = Color(0xff7d7770);
  static const errorSurface = Color(0xfffcebe7);
  static const errorText = Color(0xff8b2824);
  static const noticeSurface = Color(0xffdcead8);
  static const noticeText = Color(0xff21472f);
}

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

const _tabularFigures = [FontFeature.tabularFigures()];

/// Depth, blow counts and coordinates read better on aligned figures.
const metroNumberStyle = TextStyle(
  fontSize: 22,
  fontWeight: FontWeight.w600,
  fontFeatures: _tabularFigures,
);

TextTheme _textTheme(String? fontFamily) {
  final base = TextStyle(
    color: MetroColors.ink,
    letterSpacing: 0,
    fontFamily: fontFamily,
  );
  TextStyle style(double size, double height, FontWeight weight) =>
      base.copyWith(fontSize: size, height: height, fontWeight: weight);
  return TextTheme(
    displaySmall: style(40, 1.1, FontWeight.w600),
    headlineSmall: style(26, 1.25, FontWeight.w600),
    titleLarge: style(21, 1.3, FontWeight.w600),
    titleMedium: style(17, 1.35, FontWeight.w600),
    titleSmall: style(15, 1.35, FontWeight.w600),
    bodyLarge: style(16, 1.45, FontWeight.w400),
    bodyMedium: style(15, 1.45, FontWeight.w400),
    bodySmall: style(14, 1.4, FontWeight.w400),
    labelLarge: style(16, 1.25, FontWeight.w600),
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

/// [fontFamily] defaults to the platform's system font.
ThemeData metroTheme({String? fontFamily}) {
  final colors = ColorScheme.fromSeed(
    seedColor: MetroColors.brand,
    primary: MetroColors.brand,
    onPrimary: Colors.white,
    secondaryContainer: MetroColors.selection,
    onSecondaryContainer: MetroColors.brand,
    surface: MetroColors.page,
    onSurface: MetroColors.ink,
    onSurfaceVariant: MetroColors.muted,
    surfaceTint: Colors.transparent,
    surfaceContainerLowest: MetroColors.surface,
    surfaceContainerHigh: MetroColors.surface,
    surfaceContainerHighest: MetroColors.subtle,
    outline: MetroColors.inputLine,
    outlineVariant: MetroColors.line,
    error: MetroColors.errorText,
  );
  final text = _textTheme(fontFamily);
  return ThemeData(
    useMaterial3: true,
    fontFamily: fontFamily,
    colorScheme: colors,
    textTheme: text,
    scaffoldBackgroundColor: MetroColors.page,
    dividerTheme: const DividerThemeData(
      color: MetroColors.line,
      thickness: 1,
      space: 1,
    ),
    textSelectionTheme: const TextSelectionThemeData(
      cursorColor: MetroColors.brand,
      selectionColor: MetroColors.selection,
      selectionHandleColor: MetroColors.brand,
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: MetroColors.page,
      foregroundColor: MetroColors.ink,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleSpacing: MetroSpace.lg,
      titleTextStyle: text.titleMedium?.copyWith(fontSize: 18),
      shape: const Border(bottom: BorderSide(color: MetroColors.line)),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(
        minimumSize: const Size.square(MetroTarget.minimum),
        foregroundColor: MetroColors.ink,
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: MetroColors.surface,
      isDense: false,
      contentPadding: const EdgeInsets.symmetric(
        horizontal: MetroSpace.md,
        vertical: MetroSpace.lg,
      ),
      hintStyle: text.bodyLarge?.copyWith(color: MetroColors.muted),
      helperStyle: text.bodySmall?.copyWith(color: MetroColors.muted),
      helperMaxLines: 4,
      errorStyle: text.bodySmall?.copyWith(color: MetroColors.errorText),
      errorMaxLines: 4,
      border: _inputBorder(MetroColors.inputLine),
      enabledBorder: _inputBorder(MetroColors.inputLine),
      disabledBorder: _inputBorder(MetroColors.line),
      focusedBorder: _inputBorder(MetroColors.brand, width: 2),
      errorBorder: _inputBorder(MetroColors.errorText),
      focusedErrorBorder: _inputBorder(MetroColors.errorText, width: 2),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: _buttonShape(MetroTarget.primary).merge(
        FilledButton.styleFrom(
          backgroundColor: MetroColors.brand,
          foregroundColor: Colors.white,
          disabledBackgroundColor: MetroColors.line,
          disabledForegroundColor: MetroColors.muted,
          textStyle: text.labelLarge,
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: _buttonShape(MetroTarget.secondary).merge(
        OutlinedButton.styleFrom(
          foregroundColor: MetroColors.brand,
          disabledForegroundColor: MetroColors.muted,
          side: const BorderSide(color: MetroColors.inputLine),
          textStyle: text.labelLarge,
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: _buttonShape(MetroTarget.minimum).merge(
        TextButton.styleFrom(
          foregroundColor: MetroColors.brand,
          disabledForegroundColor: MetroColors.muted,
          textStyle: text.labelLarge,
        ),
      ),
    ),
    switchTheme: SwitchThemeData(
      trackOutlineColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected)
            ? MetroColors.brand
            : MetroColors.inputLine,
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: MetroColors.surface,
      insetPadding: const EdgeInsets.all(MetroSpace.lg),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(MetroRadius.panel),
      ),
      titleTextStyle: text.titleLarge,
      contentTextStyle: text.bodyLarge,
    ),
    listTileTheme: const ListTileThemeData(
      horizontalTitleGap: MetroSpace.md,
      subtitleTextStyle: TextStyle(color: MetroColors.muted, fontSize: 15),
    ),
    expansionTileTheme: const ExpansionTileThemeData(
      shape: Border(),
      collapsedShape: Border(),
      iconColor: MetroColors.ink,
      collapsedIconColor: MetroColors.ink,
      textColor: MetroColors.ink,
      collapsedTextColor: MetroColors.ink,
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: MetroColors.brand,
      linearTrackColor: MetroColors.selection,
    ),
  );
}
