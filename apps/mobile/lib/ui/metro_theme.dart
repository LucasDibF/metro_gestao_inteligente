import 'package:flutter/material.dart';

/// Metro palette from the web tokens (`apps/web/src/styles/theme.css` and
/// `brand.css`), converted from OKLCH. Text that must survive sunlight keeps
/// darker tones than the web where the web value falls below 4.5:1 (3:1 for
/// field borders): [muted], [inputLine] and [noticeText] in the light theme.
/// [errorText] goes further, to 7:1 on [errorSurface], so errors read in sun.
@immutable
class MetroPalette extends ThemeExtension<MetroPalette> {
  const MetroPalette({
    required this.brand,
    required this.brandPressed,
    required this.onBrand,
    required this.brandText,
    required this.selection,
    required this.ink,
    required this.muted,
    required this.page,
    required this.surface,
    required this.subtle,
    required this.line,
    required this.inputLine,
    required this.focus,
    required this.errorSurface,
    required this.errorText,
    required this.noticeSurface,
    required this.noticeText,
  });

  /// Fill of the main action and the selected navigation.
  final Color brand, brandPressed, onBrand;

  /// Brand colour for text and icons on [page], [surface] and [selection].
  final Color brandText;
  final Color selection;
  final Color ink, muted;
  final Color page, surface, subtle, line, inputLine;

  /// Keyboard and field focus (web `--focus`, cobalt).
  final Color focus;
  final Color errorSurface, errorText, noticeSurface, noticeText;

  static const light = MetroPalette(
    brand: Color(0xff1600ff),
    brandPressed: Color(0xff1200cc),
    onBrand: Colors.white,
    brandText: Color(0xff1600ff),
    selection: Color(0xffe8e6ff),
    ink: Color(0xff15110d),
    muted: Color(0xff57524c),
    page: Color(0xfffcfaf7),
    surface: Colors.white,
    subtle: Color(0xfff6f3ef),
    line: Color(0xffd9d7d5),
    inputLine: Color(0xff7d7770),
    focus: Color(0xff007bad),
    errorSurface: Color(0xffffebe7),
    errorText: Color(0xff8b2824),
    noticeSurface: Color(0xffe8f7e8),
    noticeText: Color(0xff2d6a31),
  );

  static const dark = MetroPalette(
    brand: Color(0xff6552ff),
    brandPressed: Color(0xff5644e8),
    onBrand: Colors.white,
    brandText: Color(0xffb2aaff),
    selection: Color(0xff29224f),
    ink: Color(0xfff8f4f2),
    muted: Color(0xff9b9795),
    page: Color(0xff110c08),
    surface: Color(0xff1d1713),
    subtle: Color(0xff0a0704),
    line: Color(0xff322d29),
    inputLine: Color(0xff75706c),
    focus: Color(0xff32b3e6),
    errorSurface: Color(0xff47211c),
    errorText: Color(0xfff27a6e),
    noticeSurface: Color(0xff213321),
    noticeText: Color(0xff71b173),
  );

  @override
  MetroPalette copyWith() => this;

  @override
  MetroPalette lerp(MetroPalette? other, double t) {
    if (other == null) return this;
    Color mix(Color a, Color b) => Color.lerp(a, b, t)!;
    return MetroPalette(
      brand: mix(brand, other.brand),
      brandPressed: mix(brandPressed, other.brandPressed),
      onBrand: mix(onBrand, other.onBrand),
      brandText: mix(brandText, other.brandText),
      selection: mix(selection, other.selection),
      ink: mix(ink, other.ink),
      muted: mix(muted, other.muted),
      page: mix(page, other.page),
      surface: mix(surface, other.surface),
      subtle: mix(subtle, other.subtle),
      line: mix(line, other.line),
      inputLine: mix(inputLine, other.inputLine),
      focus: mix(focus, other.focus),
      errorSurface: mix(errorSurface, other.errorSurface),
      errorText: mix(errorText, other.errorText),
      noticeSurface: mix(noticeSurface, other.noticeSurface),
      noticeText: mix(noticeText, other.noticeText),
    );
  }
}

extension MetroPaletteContext on BuildContext {
  /// Palette of the active (light or dark) theme.
  MetroPalette get metro =>
      Theme.of(this).extension<MetroPalette>() ?? MetroPalette.light;
}

/// Web motion (`DESIGN.md` › Elevation & Depth): colour changes 150 ms,
/// collapsing 200 ms, entering 300 ms on an ease-out-expo curve, leaving
/// 200 ms ease-in. Every animation is skipped when the system reduces motion.
abstract final class MetroMotion {
  static const color = Duration(milliseconds: 150);
  static const collapse = Duration(milliseconds: 200);
  static const enter = Duration(milliseconds: 300);
  static const exit = Duration(milliseconds: 200);

  /// `cubic-bezier(0.16, 1, 0.3, 1)` from the web drawer and curve trace.
  static const enterCurve = Cubic(0.16, 1, 0.3, 1);
  static const exitCurve = Curves.easeIn;

  static bool reduced(BuildContext context) =>
      MediaQuery.maybeDisableAnimationsOf(context) ?? false;

  /// [duration], or zero when the system asks for reduced motion.
  static Duration of(BuildContext context, Duration duration) =>
      reduced(context) ? Duration.zero : duration;
}

abstract final class MetroFonts {
  /// Text and controls (web body).
  static const sans = 'IBM Plex Sans';

  /// Screen and section headings (web h1/h2).
  static const heading = 'Fraunces';

  /// Copyable data such as keys and codes.
  static const mono = 'IBM Plex Mono';
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

/// Screen changes slide in from the side and fade, like the web drawer.
class MetroPageTransitions extends PageTransitionsBuilder {
  const MetroPageTransitions();

  @override
  Duration get transitionDuration => MetroMotion.enter;

  @override
  Duration get reverseTransitionDuration => MetroMotion.exit;

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    if (MetroMotion.reduced(context)) return child;
    final enter = CurvedAnimation(
      parent: animation,
      curve: MetroMotion.enterCurve,
      reverseCurve: MetroMotion.exitCurve,
    );
    return FadeTransition(
      opacity: enter,
      child: SlideTransition(
        position: Tween(
          begin: const Offset(0.08, 0),
          end: Offset.zero,
        ).animate(enter),
        child: child,
      ),
    );
  }
}

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
