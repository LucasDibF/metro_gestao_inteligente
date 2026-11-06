import 'package:flutter/material.dart';
import '../ui/metro_theme.dart';

const _sections = <(IconData, String)>[
  (Icons.straighten, 'Metros'),
  (Icons.assignment_outlined, 'Campo'),
  (Icons.photo_camera_outlined, 'Fotos'),
  (Icons.checklist, 'Conferência'),
];

/// Hole sections: a thumb-reach bar on phones, a side rail from 600 pt wide.
///
/// Like the system tab bars, its labels stop growing at 130%; the sections
/// must keep fitting side by side while the content follows the full 200%.
class HoleSectionNav extends StatelessWidget {
  const HoleSectionNav({
    super.key,
    required this.controller,
    this.vertical = false,
  });
  final TabController controller;
  final bool vertical;

  static const _railWidth = 96.0;
  static const _barItemHeight = 64.0;

  @override
  Widget build(BuildContext context) {
    final items = [
      for (final (index, (icon, label)) in _sections.indexed)
        AnimatedBuilder(
          animation: controller,
          builder: (context, _) => _SectionItem(
            icon: icon,
            label: label,
            selected: controller.index == index,
            onTap: () => controller.animateTo(index),
          ),
        ),
    ];
    return MediaQuery.withClampedTextScaling(
      maxScaleFactor: 1.3,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: context.metro.surface,
          border: vertical
              ? Border(right: BorderSide(color: context.metro.line))
              : Border(top: BorderSide(color: context.metro.line)),
        ),
        child: vertical
            ? SafeArea(
                right: false,
                child: SizedBox(
                  width: _railWidth,
                  child: SingleChildScrollView(child: Column(children: items)),
                ),
              )
            : SafeArea(
                top: false,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(minHeight: _barItemHeight),
                  child: Row(
                    children: [for (final item in items) Expanded(child: item)],
                  ),
                ),
              ),
      ),
    );
  }
}

class _SectionItem extends StatelessWidget {
  const _SectionItem({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected ? context.metro.brandText : context.metro.muted;
    return Semantics(
      button: true,
      selected: selected,
      container: true,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            vertical: MetroSpace.sm,
            horizontal: MetroSpace.xs,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            spacing: MetroSpace.xxs,
            children: [
              AnimatedContainer(
                duration: MetroMotion.of(context, MetroMotion.color),
                padding: const EdgeInsets.symmetric(
                  horizontal: MetroSpace.lg,
                  vertical: MetroSpace.xs,
                ),
                decoration: BoxDecoration(
                  color: selected
                      ? context.metro.selection
                      : Colors.transparent,
                  borderRadius: BorderRadius.circular(MetroRadius.control),
                ),
                child: TweenAnimationBuilder<Color?>(
                  tween: ColorTween(end: color),
                  duration: MetroMotion.of(context, MetroMotion.color),
                  builder: (context, value, _) =>
                      Icon(icon, size: MetroIconSize.navigation, color: value),
                ),
              ),
              FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  label,
                  maxLines: 1,
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    color: color,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
