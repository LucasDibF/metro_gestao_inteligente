import 'package:flutter/gestures.dart' show kTouchSlop;
import 'package:flutter/material.dart';
import 'metro_layout.dart';
import 'metro_theme.dart';

enum MetroNoticeTone { info, success, error }

/// Inline status message, announced by screen readers when it appears.
class MetroNotice extends StatelessWidget {
  const MetroNotice(
    this.message, {
    super.key,
    this.tone = MetroNoticeTone.info,
    this.icon,
  });
  final String message;
  final MetroNoticeTone tone;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final (surface, foreground, fallbackIcon) = switch (tone) {
      MetroNoticeTone.info => (
        context.metro.subtle,
        context.metro.ink,
        Icons.info_outline,
      ),
      MetroNoticeTone.success => (
        context.metro.noticeSurface,
        context.metro.noticeText,
        Icons.check_circle_outline,
      ),
      MetroNoticeTone.error => (
        context.metro.errorSurface,
        context.metro.errorText,
        Icons.error_outline,
      ),
    };
    return MetroReveal(
      child: Semantics(
        liveRegion: true,
        container: true,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: surface,
            borderRadius: BorderRadius.circular(MetroRadius.alert),
          ),
          child: Padding(
            padding: const EdgeInsets.all(MetroSpace.md),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: MetroSpace.sm,
              children: [
                Icon(icon ?? fallbackIcon, size: 20, color: foreground),
                Expanded(
                  child: Text(
                    message,
                    style: Theme.of(
                      context,
                    ).textTheme.bodyMedium?.copyWith(color: foreground),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Entrance for content that appears: fade and a short rise over 300 ms on
/// the ease-out-expo curve. In a list, [index] staggers items by 45 ms (up to
/// the eighth) so they cascade in. Nothing moves under reduced motion.
class MetroReveal extends StatefulWidget {
  const MetroReveal({super.key, required this.child, this.index = 0});
  final Widget child;
  final int index;

  static const stagger = Duration(milliseconds: 45);
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
        MetroReveal.stagger * widget.index.clamp(0, MetroReveal._maxStaggered);
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
        duration: _pressed
            ? const Duration(milliseconds: 90)
            : const Duration(milliseconds: 420),
        curve: _pressed ? Curves.easeOut : Curves.easeOutBack,
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
    duration: const Duration(seconds: 1),
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

class MetroLoading extends StatelessWidget {
  const MetroLoading({super.key});
  @override
  Widget build(BuildContext context) =>
      const Center(child: CircularProgressIndicator());
}

/// Empty and failure states; scrolls so 200% text fits in landscape.
class MetroStateView extends StatelessWidget {
  const MetroStateView({
    super.key,
    required this.message,
    required this.icon,
    this.actionLabel,
    this.onAction,
  });
  final String message;
  final IconData icon;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(MetroSpace.xl),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: MetroWidth.compactPane),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: MetroSpace.lg,
            children: [
              Icon(icon, size: 32, color: context.metro.muted),
              Text(message, textAlign: TextAlign.center),
              if (actionLabel != null)
                FilledButton(onPressed: onAction, child: Text(actionLabel!)),
            ],
          ),
        ),
      ),
    ),
  );
}

class MetroSectionTitle extends StatelessWidget {
  const MetroSectionTitle(this.title, {super.key, this.supporting});
  final String title;
  final String? supporting;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      spacing: MetroSpace.xs,
      children: [
        Semantics(header: true, child: Text(title, style: text.titleLarge)),
        if (supporting != null)
          Text(
            supporting!,
            style: text.bodyMedium?.copyWith(color: context.metro.muted),
          ),
      ],
    );
  }
}

/// White, bordered surface for independent rows and groups (web "panel").
class MetroPanel extends StatelessWidget {
  const MetroPanel({
    super.key,
    required this.child,
    this.padding,
    this.index,
    this.pressable = false,
  });
  final Widget child;
  final EdgeInsets? padding;

  /// Position in a list; when set, the panel cascades in with [MetroReveal].
  final int? index;

  /// Whether the whole panel reacts to touch, for panels that open something.
  final bool pressable;

  @override
  Widget build(BuildContext context) {
    Widget panel = DecoratedBox(
      decoration: BoxDecoration(
        color: context.metro.surface,
        borderRadius: BorderRadius.circular(MetroRadius.panel),
        border: Border.all(color: context.metro.line),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(MetroRadius.panel),
        child: Padding(padding: padding ?? EdgeInsets.zero, child: child),
      ),
    );
    if (pressable) panel = MetroPressable(child: panel);
    if (index != null) panel = MetroReveal(index: index!, child: panel);
    return panel;
  }
}

/// Tappable list line with title, supporting lines and a trailing icon.
class MetroRow extends StatelessWidget {
  const MetroRow({
    super.key,
    required this.title,
    this.lines = const [],
    this.leading,
    this.trailing,
    this.onTap,
    this.titleStyle,
  });
  final String title;
  final List<String> lines;
  final IconData? leading, trailing;
  final VoidCallback? onTap;
  final TextStyle? titleStyle;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return InkWell(
      onTap: onTap,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: MetroTarget.primary + 12),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: MetroSpace.lg,
            vertical: MetroSpace.md,
          ),
          child: Row(
            spacing: MetroSpace.md,
            children: [
              if (leading != null)
                Icon(leading, size: 24, color: context.metro.muted),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  spacing: 2,
                  children: [
                    Text(title, style: titleStyle ?? text.titleMedium),
                    for (final line in lines)
                      Text(
                        line,
                        style: text.bodyMedium?.copyWith(
                          color: context.metro.muted,
                        ),
                      ),
                  ],
                ),
              ),
              if (trailing != null)
                Icon(trailing, size: 24, color: context.metro.muted),
            ],
          ),
        ),
      ),
    );
  }
}

/// Visible label above a control: unlike a floating label, it can wrap at any
/// text size. The merge keeps label and input as one screen reader element.
class MetroField extends StatelessWidget {
  const MetroField({super.key, required this.label, required this.child});
  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) => MergeSemantics(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: MetroSpace.xs + 2,
      children: [
        Text(label, style: Theme.of(context).textTheme.titleSmall),
        child,
      ],
    ),
  );
}

/// Error beside the action that produced it, then the action itself.
class MetroFormAction extends StatelessWidget {
  const MetroFormAction({super.key, required this.button, this.error});
  final Widget button;
  final String? error;

  @override
  Widget build(BuildContext context) => Column(
    mainAxisSize: MainAxisSize.min,
    crossAxisAlignment: CrossAxisAlignment.stretch,
    spacing: MetroSpace.md,
    children: [
      if (error != null) MetroNotice(error!, tone: MetroNoticeTone.error),
      button,
    ],
  );
}

/// Label over value, for facts the operator reads at a glance.
class MetroFact extends StatelessWidget {
  const MetroFact({super.key, required this.label, required this.value});
  final String label, value;

  @override
  Widget build(BuildContext context) => MergeSemantics(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(
            context,
          ).textTheme.bodyMedium?.copyWith(color: context.metro.muted),
        ),
        Text(
          value,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
      ],
    ),
  );
}
