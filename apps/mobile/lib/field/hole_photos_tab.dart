import 'dart:io';
import 'package:flutter/material.dart';
import '../ui/metro_layout.dart';
import '../ui/metro_theme.dart';
import '../ui/metro_widgets.dart';
import 'field_repository.dart';
import 'field_store.dart';
import 'field_store_schema.dart';
import 'remote_photo.dart';

/// Decoded width for on-screen photos; originals stay untouched on disk.
const photoPreviewCacheWidth = 1200;

/// Photo frame that holds its space while loading and never crops the evidence.
class PhotoFrame extends StatelessWidget {
  const PhotoFrame({super.key, this.child});
  final Widget? child;

  @override
  Widget build(BuildContext context) => AspectRatio(
    aspectRatio: 4 / 3,
    child: ClipRRect(
      borderRadius: BorderRadius.circular(MetroRadius.control),
      child: ColoredBox(
        color: MetroColors.subtle,
        child:
            child ??
            const Center(
              child: Icon(
                Icons.photo_outlined,
                size: 40,
                color: MetroColors.muted,
              ),
            ),
      ),
    ),
  );
}

/// A photo still on this device; its stored path is relative to the app folder.
class _LocalPhoto extends StatelessWidget {
  const _LocalPhoto({required this.repository, required this.stored});
  final FieldRepository repository;
  final String stored;

  @override
  Widget build(BuildContext context) => FutureBuilder<String>(
    future: repository.photoFile(stored),
    builder: (context, location) => location.data == null
        ? const SizedBox.expand()
        : Image.file(
            File(location.data!),
            fit: BoxFit.contain,
            cacheWidth: photoPreviewCacheWidth,
            errorBuilder: (_, e, s) => const Center(
              child: Padding(
                padding: EdgeInsets.all(MetroSpace.md),
                child: Text('Arquivo da fotografia não encontrado.'),
              ),
            ),
          ),
  );
}

class HolePhotosTab extends StatelessWidget {
  const HolePhotosTab({
    super.key,
    required this.doc,
    required this.draft,
    required this.busy,
    required this.repository,
    required this.workId,
    required this.holeId,
    required this.onAddPhoto,
    this.rejections = const {},
    this.onRemovePhoto,
  });
  final Json doc;
  final bool draft, busy;
  final FieldRepository repository;
  final String workId, holeId;
  final VoidCallback onAddPhoto;

  /// Reason of each rejected operation, by the item it edits.
  final Map<String, String> rejections;
  final ValueChanged<String>? onRemovePhoto;

  String _caption(Json photo) =>
      photo['caption'] == '' || photo['caption'] == null
      ? 'Fotografia'
      : photo['caption'] as String;

  Widget _tile(
    BuildContext context,
    Widget? image,
    String caption,
    String state, {
    List<Widget> below = const [],
  }) => Semantics(
    container: true,
    label: caption,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: MetroSpace.sm,
      children: [
        PhotoFrame(child: image),
        MetroFact(label: state, value: caption),
        ...below,
      ],
    ),
  );

  Future<void> _confirmRemoval(BuildContext context, String stored) async {
    final remove = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        scrollable: true,
        title: const Text('Remover fotografia recusada?'),
        content: const Text(
          'A fotografia sai deste aparelho e não será enviada. Esta ação não pode ser desfeita.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog, false),
            child: const Text('Manter'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialog, true),
            child: const Text('Remover'),
          ),
        ],
      ),
    );
    if (remove == true) onRemovePhoto?.call(stored);
  }

  List<Widget> _rejection(BuildContext context, String stored) {
    final reason = rejections[photoItem(stored)];
    if (reason == null) return const [];
    return [
      MetroNotice('Recusada: $reason', tone: MetroNoticeTone.error),
      OutlinedButton.icon(
        onPressed: busy ? null : () => _confirmRemoval(context, stored),
        icon: const Icon(Icons.delete_outline),
        label: const Text('Remover fotografia'),
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final local = (doc['localPhotos'] as List).cast<Json>();
    final remote = ((doc['files'] as Json)['photos'] as List).cast<Json>();
    return MetroActionLayout(
      maxWidth: MetroWidth.list,
      action: draft
          ? FilledButton.icon(
              onPressed: busy ? null : onAddPhoto,
              icon: const Icon(Icons.add_a_photo_outlined),
              label: const Text('Adicionar fotografia'),
            )
          : null,
      children: [
        const MetroSectionTitle('Fotografias do furo'),
        const SizedBox(height: MetroSpace.lg),
        if (local.isEmpty && remote.isEmpty)
          const Text(
            'Adicione fotos da execução, do local e do solo. A legenda é opcional.',
          ),
        MetroColumns(
          minColumnWidth: 260,
          runSpacing: MetroSpace.xl,
          children: [
            for (final photo in local)
              _tile(
                context,
                _LocalPhoto(
                  repository: repository,
                  stored: photo['path'] as String,
                ),
                _caption(photo),
                'Pendente de envio',
                below: _rejection(context, photo['path'] as String),
              ),
            for (final photo in remote)
              _tile(
                context,
                photo['processingState'] == 'READY'
                    ? RemotePhoto(
                        session: repository.session,
                        route:
                            '${repository.base(workId, holeId)}/arquivos/fotografias/${photo['id']}/preview',
                      )
                    : null,
                _caption(photo),
                photo['processingState'] == 'READY'
                    ? 'Sincronizada · Processada'
                    : 'Sincronizada · Em processamento',
              ),
          ],
        ),
      ],
    );
  }
}
