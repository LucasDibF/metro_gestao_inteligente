import 'package:flutter/material.dart';
import '../ui/metro_theme.dart';
import '../ui/metro_widgets.dart';

/// Confirms the submission; returns the note, or null when cancelled.
Future<String?> showSubmitDialog(BuildContext context) =>
    showDialog<String>(context: context, builder: (_) => const _SubmitDialog());

/// Owns its controller so the closing animation never rebuilds a disposed one.
class _SubmitDialog extends StatefulWidget {
  const _SubmitDialog();

  @override
  State<_SubmitDialog> createState() => _SubmitDialogState();
}

class _SubmitDialogState extends State<_SubmitDialog> {
  final _note = TextEditingController(
    text: 'Execução de campo concluída. Solicito análise técnica.',
  );

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    scrollable: true,
    title: const Text('Enviar para análise?'),
    content: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: MetroSpace.lg,
      children: [
        const Text(
          'Os registros serão sincronizados. Após o envio, a edição ficará bloqueada até uma devolução do engenheiro.',
        ),
        MetroField(
          label: 'Observações para o engenheiro',
          child: TextField(controller: _note, maxLength: 2000, maxLines: 3),
        ),
      ],
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancelar'),
      ),
      FilledButton(
        onPressed: () => Navigator.pop(context, _note.text.trim()),
        child: const Text('Confirmar envio'),
      ),
    ],
  );
}
