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
