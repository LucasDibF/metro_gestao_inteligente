import 'package:flutter/painting.dart';

abstract final class MetroFonts {
  /// Text and controls (web body).
  static const sans = 'IBM Plex Sans';

  /// Screen and section headings (web h1/h2).
  static const heading = 'Fraunces';

  /// Copyable data such as keys and codes.
  static const mono = 'IBM Plex Mono';
}

const _tabularFigures = [FontFeature.tabularFigures()];

/// Depth, blow counts and coordinates read better on aligned figures.
const metroNumberStyle = TextStyle(
  fontSize: 22,
  fontWeight: FontWeight.w600,
  fontFeatures: _tabularFigures,
);
