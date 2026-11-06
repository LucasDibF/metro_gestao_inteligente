import 'package:flutter/gestures.dart' show kTouchSlop;
import 'package:flutter/material.dart';
import 'metro_motion.dart';

/// Entrance for content that appears: fade and a short rise over 300 ms on
/// the ease-out-expo curve. In a list, [index] staggers items by 45 ms (up to
/// the eighth) so they cascade in. Nothing moves under reduced motion.
class MetroReveal extends StatefulWidget {
  const MetroReveal({super.key, required this.child, this.index = 0});
  final Widget child;
  final int index;

  static const _maxStaggered = 8;

  @override
  State<MetroReveal> createState() => _MetroRevealState();
}

class _MetroRevealState extends State<MetroReveal>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _progress;
  var _started = false;

  @override
  void initState() {
    super.initState();
    // The stagger is a leading pause inside one animation, so no timer is left
    // behind when the widget goes away.
    final delay =
        MetroMotion.stagger * widget.index.clamp(0, MetroReveal._maxStaggered);
    final total = MetroMotion.enter + delay;
    _controller = AnimationController(vsync: this, duration: total);
    _progress = CurvedAnimation(
      parent: _controller,
      curve: Interval(
        delay.inMicroseconds / total.inMicroseconds,
        1,
        curve: MetroMotion.enterCurve,
      ),
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    if (MetroMotion.reduced(context)) {
      _controller.value = 1;
    } else {
      _controller.forward();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _progress,
    child: widget.child,
    builder: (context, child) => Opacity(
      opacity: _progress.value,
      child: Transform.translate(
        offset: Offset(0, (1 - _progress.value) * 12),
        child: child,
      ),
    ),
  );
}

/// Shrinks slightly while pressed and springs back on release, so a tap on a
/// card is felt before the next screen arrives.
class MetroPressable extends StatefulWidget {
  const MetroPressable({super.key, required this.child, this.enabled = true});
  final Widget child;
  final bool enabled;

  static const pressedScale = 0.97;

  @override
  State<MetroPressable> createState() => _MetroPressableState();
}

class _MetroPressableState extends State<MetroPressable> {
  var _pressed = false;
  Offset? _downAt;

  void _set(bool pressed) {
    if (_pressed != pressed) setState(() => _pressed = pressed);
  }

  void _down(PointerDownEvent event) {
    _downAt = event.position;
    _set(true);
  }

  /// A finger that travels past the touch slop is scrolling, not tapping.
  void _move(PointerMoveEvent event) {
    final downAt = _downAt;
    if (downAt != null && (event.position - downAt).distance > kTouchSlop) {
      _release();
    }
  }

  void _release() {
    _downAt = null;
    _set(false);
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.enabled || MetroMotion.reduced(context)) return widget.child;
    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: _down,
      onPointerMove: _move,
      onPointerUp: (_) => _release(),
      onPointerCancel: (_) => _release(),
      child: AnimatedScale(
        scale: _pressed ? MetroPressable.pressedScale : 1,
        duration: _pressed ? MetroMotion.press : MetroMotion.release,
        curve: _pressed ? MetroMotion.pressCurve : MetroMotion.springCurve,
        child: widget.child,
      ),
    );
  }
}

/// Turns [child] once per second while [spinning], like the web loading
/// icon, and eases it back to rest when the work ends.
class MetroSpin extends StatefulWidget {
  const MetroSpin({super.key, required this.spinning, required this.child});
  final bool spinning;
  final Widget child;

  @override
  State<MetroSpin> createState() => _MetroSpinState();
}

class _MetroSpinState extends State<MetroSpin>
    with SingleTickerProviderStateMixin {
  late final AnimationController _turns = AnimationController(
    vsync: this,
    duration: MetroMotion.spin,
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync();
  }

  @override
  void didUpdateWidget(MetroSpin old) {
    super.didUpdateWidget(old);
    _sync();
  }

  /// Whether the icon is in its endless turn, as opposed to finishing one.
  var _repeating = false;

  void _sync() {
    if (widget.spinning && !MetroMotion.reduced(context)) {
      // Work that resumes while the last turn finishes turns again.
      if (!_repeating) _turns.repeat();
      _repeating = true;
    } else if (_repeating) {
      _repeating = false;
      // Finish the current turn instead of snapping back.
      _turns.animateTo(1, duration: MetroMotion.collapse).then((_) {
        if (mounted && !_repeating) _turns.value = 0;
      });
    }
  }

  @override
  void dispose() {
    _turns.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      RotationTransition(turns: _turns, child: widget.child);
}

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
