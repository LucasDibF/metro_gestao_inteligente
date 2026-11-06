import 'package:flutter/material.dart';
import '../ui/metro_layout.dart';
import '../ui/metro_theme.dart';
import '../ui/metro_widgets.dart';
import 'field_format.dart';
import 'field_store.dart';

class HoleFieldsTab extends StatelessWidget {
  const HoleFieldsTab({
    super.key,
    required this.doc,
    required this.draft,
    required this.busy,
    required this.onEditFields,
    required this.onEditCoordinate,
    this.rejections = const {},
  });
  final Json doc;
  final bool draft, busy;
  final VoidCallback onEditFields;
  final ValueChanged<Json?> onEditCoordinate;

  /// Reason of each rejected operation, by the item it edits.
  final Map<String, String> rejections;

  Json? get _coordinate {
    final executed = ((doc['files'] as Json)['coordinates'] as List)
        .cast<Json>()
        .where((c) => c['kind'] == 'EXECUTED');
    return doc['executedCoordinate'] as Json? ??
        (executed.isEmpty ? null : executed.first);
  }

  String _metres(Object? value) =>
      '${fieldNumber(value)}${value == null ? '' : ' m'}';

  @override
  Widget build(BuildContext context) {
    final hole = doc['hole'] as Json;
    final coordinate = _coordinate;
    return MetroActionLayout(
      maxWidth: MetroWidth.hierarchy,
      children: [
        MetroColumns(
          minColumnWidth: 270,
          maxColumns: 2,
          spacing: MetroSpace.xl,
          runSpacing: MetroSpace.xxl,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: MetroSpace.md,
              children: [
                const MetroSectionTitle('Dados de campo'),
                if (rejections['FIELDS'] case final reason?)
                  MetroNotice(
                    'Recusado: $reason Salve novamente para corrigir.',
                    tone: MetroNoticeTone.error,
                  ),
                MetroFact(label: 'Data', value: fieldDate(hole['fieldDate'])),
                MetroFact(
                  label: 'Profundidade executada',
                  value: _metres(hole['executedDepthM']),
                ),
                MetroFact(
                  label: 'Nível d’água',
                  value: _metres(hole['waterLevelM']),
                ),
                if (draft)
                  OutlinedButton.icon(
                    onPressed: busy ? null : onEditFields,
                    icon: const Icon(Icons.edit_outlined),
                    label: const Text('Preencher dados de campo'),
                  ),
              ],
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: MetroSpace.md,
              children: [
                const MetroSectionTitle('Coordenada executada'),
                if (rejections['COORDINATE'] case final reason?)
                  MetroNotice(
                    'Recusada: $reason Salve novamente para corrigir.',
                    tone: MetroNoticeTone.error,
                  ),
                if (coordinate == null)
                  const Text('Nenhuma coordenada executada registrada.')
                else ...[
                  MetroFact(
                    label: 'UTM',
                    value: '${coordinate['zone']}${coordinate['hemisphere']}',
                  ),
                  MetroFact(label: 'E', value: '${coordinate['eastingM']}'),
                  MetroFact(label: 'N', value: '${coordinate['northingM']}'),
                  Text(
                    'SIRGAS 2000',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: context.metro.muted,
                    ),
                  ),
                ],
                if (draft)
                  OutlinedButton.icon(
                    onPressed: busy ? null : () => onEditCoordinate(coordinate),
                    icon: const Icon(Icons.location_on_outlined),
                    label: const Text('Registrar coordenada'),
                  ),
              ],
            ),
          ],
        ),
      ],
    );
  }
}
