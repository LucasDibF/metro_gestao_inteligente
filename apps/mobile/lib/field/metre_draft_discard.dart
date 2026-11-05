import 'package:flutter/material.dart';

/// Lets the operator abandon typed text that was never saved as a metre.
class MetreDraftDiscard extends StatelessWidget {
  const MetreDraftDiscard({
    super.key,
    required this.enabled,
    required this.onDiscard,
  });
  final bool enabled;
  final Future<void> Function() onDiscard;

  Future<void> _confirm(BuildContext context) async {
    final discard = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        scrollable: true,
        title: const Text('Descartar rascunho?'),
        content: const Text(
          'O texto ainda não salvo deste metro será apagado. Os dados já salvos continuam como estão.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog, false),
            child: const Text('Continuar editando'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialog, true),
            child: const Text('Descartar'),
          ),
        ],
      ),
    );
    if (discard != true) return;
    await onDiscard();
    if (context.mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) => OutlinedButton.icon(
    onPressed: enabled ? () => _confirm(context) : null,
    icon: const Icon(Icons.delete_outline),
    label: const Text('Descartar rascunho'),
  );
}
