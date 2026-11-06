import 'package:flutter/material.dart';
import 'metro_theme.dart';
import 'metro_widgets.dart' show MetroNotice, MetroNoticeTone;

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
