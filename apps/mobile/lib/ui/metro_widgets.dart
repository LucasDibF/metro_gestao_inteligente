import 'package:flutter/material.dart';
import 'metro_animations.dart';
import 'metro_layout.dart';
import 'metro_theme.dart';

export 'metro_animations.dart' show MetroPressable, MetroReveal, MetroSpin;
export 'metro_fields.dart';

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
