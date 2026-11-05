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
        MetroColors.subtle,
        MetroColors.ink,
        Icons.info_outline,
      ),
      MetroNoticeTone.success => (
        MetroColors.noticeSurface,
        MetroColors.noticeText,
        Icons.check_circle_outline,
      ),
      MetroNoticeTone.error => (
        MetroColors.errorSurface,
        MetroColors.errorText,
        Icons.error_outline,
      ),
    };
    return Semantics(
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
              Icon(icon, size: 32, color: MetroColors.muted),
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
            style: text.bodyMedium?.copyWith(color: MetroColors.muted),
          ),
      ],
    );
  }
}

/// White, bordered surface for independent rows and groups (web "panel").
class MetroPanel extends StatelessWidget {
  const MetroPanel({super.key, required this.child, this.padding});
  final Widget child;
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: MetroColors.surface,
      borderRadius: BorderRadius.circular(MetroRadius.panel),
      border: Border.all(color: MetroColors.line),
    ),
    child: ClipRRect(
      borderRadius: BorderRadius.circular(MetroRadius.panel),
      child: Padding(padding: padding ?? EdgeInsets.zero, child: child),
    ),
  );
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
                Icon(leading, size: 24, color: MetroColors.muted),
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
                          color: MetroColors.muted,
                        ),
                      ),
                  ],
                ),
              ),
              if (trailing != null)
                Icon(trailing, size: 24, color: MetroColors.muted),
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
          ).textTheme.bodyMedium?.copyWith(color: MetroColors.muted),
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
