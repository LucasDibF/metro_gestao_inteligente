import 'package:flutter/material.dart';
import '../ui/metro_layout.dart';
import '../ui/metro_theme.dart';
import '../ui/metro_widgets.dart';
import 'field_format.dart';
import 'field_store.dart';
import 'field_store_schema.dart';

class HoleMetresTab extends StatelessWidget {
  const HoleMetresTab({
    super.key,
    required this.doc,
    required this.draft,
    required this.busy,
    required this.onEditMetre,
    this.rejections = const {},
  });
  final Json doc;

  /// The hole is still open for field edits.
  final bool draft;
  final bool busy;
  final ValueChanged<int> onEditMetre;

  /// Reason of each rejected operation, by the item it edits.
  final Map<String, String> rejections;

  /// Metres left without a record below the deepest one. The API refuses the
  /// hole with `SPT_METRES_MISSING` until they exist.
  static List<int> missingMetres(Iterable<num> depths) {
    if (depths.isEmpty) return const [];
    final deepest = depths.reduce((a, b) => a > b ? a : b).ceil();
    final recorded = depths.map((depth) => depth.ceil()).toSet();
    return [
      for (var metre = 1; metre < deepest; metre++)
        if (!recorded.contains(metre)) metre,
    ];
  }

  static String reading(Json record) {
    if (record['recordType'] == 'INITIAL_SOIL' ||
        (record['result'] as Json?)?['status'] == 'NOT_TESTED') {
      return 'Solo inicial · Sem golpes';
    }
    final advances = (record['advances'] as List?) ?? [];
    final text = advances
        .map(
          (a) =>
              '${a['blows']}/${fieldNumber((a['penetrationMm'] as num) / 10)}',
        )
        .join(' · ');
    return '$text${record['interruptionReason'] != null ? ' · Interrompido' : ''}';
  }

  Widget _row(BuildContext context, Json record) {
    final depth = num.parse('${record['depthM']}');
    final soil = (record['soil'] as Json?)?['soilType'] ?? 'Solo não informado';
    return MetroPanel(
      child: MetroRow(
        title: '${fieldNumber(depth - 1)}–${fieldNumber(depth)} m · $soil',
        lines: [
          reading(record),
          if (((doc['editorDrafts'] as Json?) ?? {}).containsKey('$depth'))
            'Rascunho não salvo',
          if (rejections.containsKey(metreItem(depth)))
            'Recusado pelo servidor · Toque para corrigir',
        ],
        trailing: draft ? Icons.edit_outlined : Icons.lock_outline,
        onTap: draft && !busy ? () => onEditMetre(depth.toInt()) : null,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final records = (doc['records'] as Json).values.cast<Json>().toList()
      ..sort(
        (a, b) =>
            num.parse('${a['depthM']}').compareTo(num.parse('${b['depthM']}')),
      );
    final next = records.isEmpty
        ? 1
        : num.parse('${records.last['depthM']}').floor() + 1;
    final drafts = (doc['editorDrafts'] as Json?) ?? {};
    final end = num.tryParse('${(doc['hole'] as Json)['executedDepthM']}');
    final canAdd = draft && (end == null || next - 1 < end);
    final recorded = doc['records'] as Json;
    final gaps = missingMetres(
      records.map((record) => num.parse('${record['depthM']}')),
    ).where((metre) => !drafts.containsKey('$metre')).toList();
    final refused = [
      for (final record in records)
        if (rejections[metreItem(num.parse('${record['depthM']}'))]
            case final reason?)
          'Metro ${fieldNumber(num.parse('${record['depthM']}'))} m recusado: $reason',
    ];
    return MetroActionLayout(
      maxWidth: MetroWidth.list,
      action: canAdd
          ? FilledButton.icon(
              onPressed: busy ? null : () => onEditMetre(next),
              icon: const Icon(Icons.add),
              label: Text('Preencher ${next - 1}–$next m'),
            )
          : null,
      children: [
        const MetroSectionTitle(
          'Execução metro a metro',
          supporting:
              'Golpes e solo são registrados juntos. Salve no aparelho e sincronize quando houver conexão.',
        ),
        const SizedBox(height: MetroSpace.lg),
        if (draft && !canAdd) ...[
          MetroNotice(
            'Encerrado em ${fieldNumber(end)} m. Para continuar, ajuste a profundidade nos dados de campo.',
          ),
          const SizedBox(height: MetroSpace.md),
        ],
        for (final reason in refused) ...[
          MetroNotice(reason, tone: MetroNoticeTone.error),
          const SizedBox(height: MetroSpace.md),
        ],
        // With the hole closed, the action below is gone and only this remains.
        for (final key in drafts.keys.where(
          (k) => !recorded.containsKey(k) && (k != '$next' || !canAdd),
        ))
          TextButton(
            onPressed: draft && !busy
                ? () => onEditMetre(int.parse(key))
                : null,
            child: Text('Retomar rascunho ${int.parse(key) - 1}–$key m'),
          ),
        if (draft && gaps.isNotEmpty) ...[
          const MetroNotice(
            'Faltam metros antes do último registro. Preencha-os para poder enviar o furo.',
          ),
          const SizedBox(height: MetroSpace.sm),
          for (final metre in gaps) ...[
            OutlinedButton.icon(
              onPressed: busy ? null : () => onEditMetre(metre),
              icon: const Icon(Icons.add),
              label: Text('Preencher ${metre - 1}–$metre m'),
            ),
            const SizedBox(height: MetroSpace.sm),
          ],
          const SizedBox(height: MetroSpace.md),
        ],
        if (records.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: MetroSpace.xl),
            child: Text(
              'Nenhum metro salvo. Comece pelo solo inicial, de 0 a 1 m.',
            ),
          ),
        MetroColumns(
          minColumnWidth: 320,
          maxColumns: 2,
          spacing: MetroSpace.md,
          runSpacing: MetroSpace.sm,
          equalHeight: true,
          children: [for (final record in records) _row(context, record)],
        ),
      ],
    );
  }
}
