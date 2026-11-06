import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'metro_theme.dart';

/// Content widths; lists may use more of a tablet than a form or a text block.
abstract final class MetroWidth {
  static const form = 640.0;
  static const hierarchy = 760.0;
  static const list = 1120.0;
  static const compactPane = 448.0;
}

/// From this window width the hole sections move to a side rail.
const metroRailBreakpoint = 600.0;

double metroGutter(double width) =>
    width >= metroRailBreakpoint ? MetroSpace.xl : MetroSpace.lg;

/// Centers content in [maxWidth] while keeping the scroll gesture edge to edge.
EdgeInsets metroContentPadding(
  double width, {
  double maxWidth = MetroWidth.list,
  double vertical = MetroSpace.lg,
}) {
  final side = math.max(metroGutter(width), (width - maxWidth) / 2);
  return EdgeInsets.symmetric(horizontal: side, vertical: vertical);
}

double metroTextScale(BuildContext context) =>
    MediaQuery.textScalerOf(context).scale(1);

/// Lays out [children] in as many columns as fit [minColumnWidth] at the
/// current text size, so 200% text falls back to a single column on its own.
class MetroColumns extends StatelessWidget {
  const MetroColumns({
    super.key,
    required this.children,
    required this.minColumnWidth,
    this.maxColumns = 3,
    this.spacing = MetroSpace.lg,
    this.runSpacing = MetroSpace.lg,
    this.equalHeight = false,
  });
  final List<Widget> children;
  final double minColumnWidth, spacing, runSpacing;
  final int maxColumns;

  /// Stretches row siblings; children must support intrinsic sizing.
  final bool equalHeight;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final minimum = minColumnWidth * metroTextScale(context);
      final columns = ((constraints.maxWidth + spacing) / (minimum + spacing))
          .floor()
          .clamp(1, maxColumns)
          .toInt();
      final rows = <Widget>[
        for (var start = 0; start < children.length; start += columns)
          _row(
            children.sublist(start, math.min(start + columns, children.length)),
            columns,
          ),
      ];
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: runSpacing,
        children: rows,
      );
    },
  );

  Widget _row(List<Widget> items, int columns) {
    if (columns == 1) return items.single;
    final row = Row(
      crossAxisAlignment: equalHeight
          ? CrossAxisAlignment.stretch
          : CrossAxisAlignment.start,
      spacing: spacing,
      children: [
        for (var index = 0; index < columns; index++)
          Expanded(
            child: index < items.length
                ? items[index]
                : const SizedBox.shrink(),
          ),
      ],
    );
    return equalHeight ? IntrinsicHeight(child: row) : row;
  }
}

/// Scrollable content with its main action docked under the thumb.
///
/// When the window is short (keyboard open, landscape, large text) the action
/// joins the end of the scroll so it never takes the room of the fields.
class MetroActionLayout extends StatelessWidget {
  const MetroActionLayout({
    super.key,
    required this.children,
    this.action,
    this.maxWidth = MetroWidth.form,
    this.onRefresh,
  });
  final List<Widget> children;
  final Widget? action;
  final double maxWidth;
  final Future<void> Function()? onRefresh;

  /// Room the dock needs before it may stay fixed, in points at 100% text.
  static const _dockBaseHeight = 240.0;
  static const _dockHeightPerTextScale = 120.0;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final minimum =
          _dockBaseHeight + _dockHeightPerTextScale * metroTextScale(context);
      final docked = action != null && constraints.maxHeight >= minimum;
      final padding = metroContentPadding(
        constraints.maxWidth,
        maxWidth: maxWidth,
      );
      // Not a lazy list: a Form validates only mounted fields, so required
      // fields scrolled out of a ListView would be skipped silently.
      Widget list = SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: padding,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ...children,
            if (action != null && !docked) ...[
              const SizedBox(height: MetroSpace.xl),
              action!,
            ],
          ],
        ),
      );
      if (onRefresh != null) {
        list = RefreshIndicator(onRefresh: onRefresh!, child: list);
      }
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: SafeArea(top: false, bottom: !docked, child: list),
          ),
          if (docked)
            DecoratedBox(
              decoration: BoxDecoration(
                color: context.metro.surface,
                border: Border(top: BorderSide(color: context.metro.line)),
              ),
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: EdgeInsets.fromLTRB(
                    padding.left,
                    MetroSpace.md,
                    padding.right,
                    MetroSpace.md,
                  ),
                  child: action,
                ),
              ),
            ),
        ],
      );
    },
  );
}

/// App bar whose height follows the title's size and allows two lines, so a
/// long work name stays readable on a narrow phone.
AppBar metroAppBar(
  BuildContext context, {
  required String title,
  List<Widget>? actions,
}) {
  const baseHeight = 56.0, tallHeight = 76.0, tallFromScale = 1.25;
  return AppBar(
    toolbarHeight: metroTextScale(context) > tallFromScale
        ? tallHeight
        : baseHeight,
    title: MediaQuery.withClampedTextScaling(
      maxScaleFactor: 1.5,
      child: Text(title, maxLines: 2, overflow: TextOverflow.ellipsis),
    ),
    actions: actions,
  );
}
