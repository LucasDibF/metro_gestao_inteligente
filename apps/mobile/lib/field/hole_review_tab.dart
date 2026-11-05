import 'package:flutter/material.dart';
import '../ui/metro_layout.dart';
import '../ui/metro_theme.dart';
import '../ui/metro_widgets.dart';
import 'field_store.dart';

class HoleReviewTab extends StatelessWidget {
  const HoleReviewTab({
    super.key,
    required this.doc,
    required this.draft,
    required this.busy,
    required this.pending,
    required this.onSubmit,
    this.rejected = 0,
  });
  final Json doc;
  final bool draft, busy;
  final int pending, rejected;
  final VoidCallback onSubmit;

  Widget _item(BuildContext context, Json item) {
    final complete = item['complete'] == true;
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: MetroSpace.lg,
        vertical: MetroSpace.md,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: MetroSpace.md,
        children: [
          Icon(
            complete ? Icons.check_circle : Icons.radio_button_unchecked,
            color: complete ? MetroColors.noticeText : MetroColors.muted,
            semanticLabel: complete ? 'Concluído' : 'Pendente',
          ),
          Expanded(
            child: Text(
              item['label'] as String,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final hole = doc['hole'] as Json;
    final items = (doc['checklist'] as List)
        .cast<Json>()
        .where((c) => c['stage'] == 'review')
        .toList();
    return MetroActionLayout(
      maxWidth: MetroWidth.form,
      action: draft
          ? FilledButton.icon(
              onPressed: busy ? null : onSubmit,
              icon: const Icon(Icons.send_outlined),
              label: const Text('Concluir e enviar para análise'),
            )
          : null,
      children: [
        const MetroSectionTitle('Conferência de campo'),
        const SizedBox(height: MetroSpace.md),
        if (rejected > 0) ...[
          const MetroNotice(
            'Corrija os registros recusados antes de enviar. O motivo aparece em cada seção.',
            tone: MetroNoticeTone.error,
          ),
          const SizedBox(height: MetroSpace.md),
        ],
        if (pending > 0) ...[
          const MetroNotice(
            'Sincronize para atualizar a conferência com os registros salvos neste aparelho.',
            icon: Icons.sync,
          ),
          const SizedBox(height: MetroSpace.md),
        ],
        if (items.isNotEmpty)
          MetroPanel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final (index, item) in items.indexed) ...[
                  if (index > 0) const Divider(),
                  _item(context, item),
                ],
              ],
            ),
          ),
        if (hole['reviewNote'] != null) ...[
          const SizedBox(height: MetroSpace.lg),
          MetroFact(label: 'Observações', value: '${hole['reviewNote']}'),
        ],
        const SizedBox(height: MetroSpace.lg),
        Text(
          'Enviar exige conexão. Depois do envio, somente o engenheiro poderá analisar ou devolver o furo para correção.',
          style: Theme.of(
            context,
          ).textTheme.bodyMedium?.copyWith(color: MetroColors.muted),
        ),
      ],
    );
  }
}
