import 'package:flutter/widgets.dart';

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

  /// Delay between consecutive items of a list that cascades in.
  static const stagger = Duration(milliseconds: 45);

  /// A pressed card shrinks quickly and springs back more slowly.
  static const press = Duration(milliseconds: 90);
  static const release = Duration(milliseconds: 420);
  static const pressCurve = Curves.easeOut;

  /// Overshoots a little before settling: a card springing back, a new status.
  static const springCurve = Curves.easeOutBack;

  /// One full turn of a busy icon, like the web loading icon.
  static const spin = Duration(seconds: 1);

  static bool reduced(BuildContext context) =>
      MediaQuery.maybeDisableAnimationsOf(context) ?? false;

  /// [duration], or zero when the system asks for reduced motion.
  static Duration of(BuildContext context, Duration duration) =>
      reduced(context) ? Duration.zero : duration;
}
