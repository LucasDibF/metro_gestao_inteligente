import 'package:flutter/material.dart';
import '../ui/metro_theme.dart';
import '../ui/metro_widgets.dart';

/// Confirms the submission; returns the note, or null when cancelled.
Future<String?> showSubmitDialog(BuildContext context) async {
  final note = TextEditingController(
    text: 'Execução de campo concluída. Solicito análise técnica.',
  );
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
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
            child: TextField(controller: note, maxLength: 2000, maxLines: 3),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, true),
          child: const Text('Confirmar envio'),
        ),
      ],
    ),
  );
  final text = note.text.trim();
  note.dispose();
  return confirmed == true ? text : null;
}
