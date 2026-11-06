import 'package:flutter/material.dart';
import '../ui/metro_layout.dart';
import '../ui/metro_theme.dart';
import '../ui/metro_widgets.dart';

/// Synchronization state of the hole and the action that advances it.
class HoleStatusStrip extends StatelessWidget {
  const HoleStatusStrip({
    super.key,
    required this.locked,
    required this.pending,
    required this.busy,
    required this.onSync,
    this.rejected = 0,
  });
  final bool locked, busy;
  final int pending, rejected;
  final VoidCallback onSync;

  /// Below this width at 100% text, status and button stack.
  static const _sideBySideWidth = 340.0;

  @override
  Widget build(BuildContext context) {
    final (icon, label) = locked
        ? (Icons.lock_outline, 'Enviado · Edição bloqueada')
        : rejected > 0
        ? (Icons.error_outline, '$rejected registro(s) recusado(s)')
        : pending > 0
        ? (Icons.cloud_upload_outlined, '$pending registro(s) pendente(s)')
        : (Icons.check_circle_outline, 'Dados salvos no aparelho');
    final status = Row(
      spacing: MetroSpace.sm,
      children: [
        Icon(icon, size: MetroIconSize.inline, color: MetroColors.ink),
        Expanded(
          child: Text(label, style: Theme.of(context).textTheme.titleSmall),
        ),
      ],
    );
    final sync = OutlinedButton.icon(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, MetroTarget.minimum),
      ),
      onPressed: busy ? null : onSync,
      icon: const Icon(Icons.sync),
      label: Text(busy ? 'Sincronizando…' : 'Sincronizar'),
    );
    return LayoutBuilder(
      builder: (context, constraints) {
        final stacked =
            constraints.maxWidth < _sideBySideWidth * metroTextScale(context);
        return stacked
            ? Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                spacing: MetroSpace.sm,
                children: [status, sync],
              )
            : Row(
                spacing: MetroSpace.md,
                children: [
                  Expanded(child: status),
                  sync,
                ],
              );
      },
    );
  }
}

/// Status and messages above the sections; scrolls rather than squeezing them
/// when text is large or the window is short.
class HoleHeader extends StatelessWidget {
  const HoleHeader({
    super.key,
    required this.availableHeight,
    required this.availableWidth,
    required this.locked,
    required this.pending,
    required this.busy,
    required this.onSync,
    this.rejected = 0,
    this.error,
    this.message,
  });
  final double availableHeight, availableWidth;
  final bool locked, busy;
  final int pending, rejected;
  final VoidCallback onSync;
  final String? error, message;

  static const _maxShareOfHeight = 0.45;

  @override
  Widget build(BuildContext context) => SafeArea(
    top: false,
    bottom: false,
    child: ConstrainedBox(
      constraints: BoxConstraints(
        maxHeight: availableHeight * _maxShareOfHeight,
      ),
      child: SingleChildScrollView(
        padding: metroContentPadding(
          availableWidth,
          maxWidth: MetroWidth.list,
          vertical: MetroSpace.md,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: MetroSpace.sm,
          children: [
            HoleStatusStrip(
              locked: locked,
              pending: pending,
              rejected: rejected,
              busy: busy,
              onSync: onSync,
            ),
            if (error != null) MetroNotice(error!, tone: MetroNoticeTone.error),
            if (message != null)
              MetroNotice(message!, tone: MetroNoticeTone.success),
          ],
        ),
      ),
    ),
  );
}
