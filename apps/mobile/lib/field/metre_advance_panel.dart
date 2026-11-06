import 'package:flutter/material.dart';
import '../ui/metro_theme.dart';
import '../ui/metro_widgets.dart';
import '../ui/metro_layout.dart';

/// Narrowest advance before the three stop sitting side by side.
const metreAdvanceMinWidth = 230.0;

const _fieldMinWidth = 104.0;
const _standardPenetrationCm = '15';

/// Aligns the shortcuts' text with the fields above them.
final _shortcutStyle = TextButton.styleFrom(
  padding: const EdgeInsets.symmetric(horizontal: MetroSpace.xs),
);

/// Blows and penetration of one SPT advance, with its two field shortcuts.
class MetreAdvancePanel extends StatelessWidget {
  const MetreAdvancePanel({
    super.key,
    required this.index,
    required this.blows,
    required this.penetration,
    required this.enabled,
    required this.onClearFromHere,
  });
  final int index;
  final TextEditingController blows, penetration;
  final bool enabled;
  final VoidCallback onClearFromHere;

  @override
  Widget build(BuildContext context) => MetroPanel(
    padding: const EdgeInsets.all(MetroSpace.md),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: MetroSpace.sm,
      children: [
        Semantics(
          header: true,
          child: Text(
            '${index + 1}º avanço',
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ),
        MetroColumns(
          minColumnWidth: _fieldMinWidth,
          maxColumns: 2,
          spacing: MetroSpace.md,
          runSpacing: MetroSpace.md,
          children: [
            MetroField(
              label: 'Golpes',
              child: TextFormField(
                key: ValueKey('blows-$index'),
                controller: blows,
                enabled: enabled,
                style: metroNumberStyle,
                keyboardType: TextInputType.number,
              ),
            ),
            MetroField(
              label: 'Penetração (cm)',
              child: TextFormField(
                key: ValueKey('penetration-$index'),
                controller: penetration,
                enabled: enabled,
                style: metroNumberStyle,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
              ),
            ),
          ],
        ),
        Wrap(
          spacing: MetroSpace.xs,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            TextButton.icon(
              style: _shortcutStyle,
              onPressed: enabled
                  ? () => penetration.text = _standardPenetrationCm
                  : null,
              icon: const Icon(Icons.straighten),
              label: const Text('Usar 15 cm'),
            ),
            TextButton(
              style: _shortcutStyle,
              onPressed: enabled ? onClearFromHere : null,
              child: const Text('Não executado a partir daqui'),
            ),
          ],
        ),
      ],
    ),
  );
}
