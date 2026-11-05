import 'package:flutter/material.dart';
import '../ui/metro_theme.dart';
import 'hole_section_nav.dart';

/// Places the status header above the sections, and the sections' navigation
/// at the bottom of a phone or in a rail on wider windows.
class HoleLayout extends StatelessWidget {
  const HoleLayout({
    super.key,
    required this.rail,
    required this.controller,
    required this.busy,
    required this.header,
    required this.sections,
  });
  final bool rail, busy;
  final TabController controller;
  final Widget Function(BoxConstraints constraints) header;
  final Widget sections;

  Widget _content() => LayoutBuilder(
    builder: (context, constraints) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        header(constraints),
        SizedBox(
          height: MetroStroke.progress,
          child: busy ? const LinearProgressIndicator() : null,
        ),
        const Divider(),
        Expanded(child: sections),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) => rail
      ? Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            HoleSectionNav(controller: controller, vertical: true),
            Expanded(
              // The rail already covers the left inset.
              child: MediaQuery.removePadding(
                context: context,
                removeLeft: true,
                child: _content(),
              ),
            ),
          ],
        )
      : _content();
}
