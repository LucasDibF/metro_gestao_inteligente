import 'dart:convert';
import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:flutter/material.dart';
import 'field_repository.dart';

/// The copy exists only for the share sheet; it leaves the device's temporary
/// folder whatever the outcome, since it holds field data in plain text.
Future<void> exportFieldCopy(
  FieldRepository repo,
  String hole,
  Rect origin, {
  Future<void> Function(ShareParams params)? share,
  Future<Directory> Function() temporaryFolder = getTemporaryDirectory,
}) async {
  final doc = await repo.store.read(repo.owner, hole);
  final queue = await repo.store.pending(repo.owner, hole);
  final folder = await Directory(
    '${(await temporaryFolder()).path}/metro-export-$hole',
  ).create(recursive: true);
  try {
    // Contains field data only; no authentication tokens or passwords.
    final file = await File('${folder.path}/copia-campo.json').writeAsString(
      const JsonEncoder.withIndent('  ').convert({
        'format': 'metro-field-copy-v1',
        'owner': repo.owner,
        'exportedAt': DateTime.now().toIso8601String(),
        'document': doc,
        'operations': queue,
      }),
    );
    final photos = <XFile>[];
    if (doc != null) {
      for (final photo in doc['localPhotos'] as List) {
        final path = await repo.photoFile(photo['path'] as String);
        if (await File(path).exists()) photos.add(XFile(path));
      }
    }
    final params = ShareParams(
      files: [XFile(file.path), ...photos],
      text:
          'Cópia de campo Metro para conferência. Não representa aprovação técnica.',
      sharePositionOrigin: origin,
    );
    await (share ?? SharePlus.instance.share)(params);
  } finally {
    await folder.delete(recursive: true);
  }
}

/// Shares from [button] and reports a failure without touching the local data.
Future<void> shareFieldCopy(
  FieldRepository repo,
  String hole,
  BuildContext button, {
  required VoidCallback onFailure,
}) async {
  final box = button.findRenderObject() as RenderBox;
  try {
    await exportFieldCopy(
      repo,
      hole,
      box.localToGlobal(Offset.zero) & box.size,
    );
  } catch (_) {
    if (button.mounted) onFailure();
  }
}

class HoleShareAction extends StatelessWidget {
  const HoleShareAction({
    super.key,
    required this.repository,
    required this.holeId,
    required this.enabled,
    required this.onFailure,
  });
  final FieldRepository repository;
  final String holeId;
  final bool enabled;
  final VoidCallback onFailure;

  @override
  Widget build(BuildContext context) => IconButton(
    tooltip: 'Compartilhar cópia de campo',
    icon: const Icon(Icons.ios_share),
    onPressed: enabled
        ? () =>
              shareFieldCopy(repository, holeId, context, onFailure: onFailure)
        : null,
  );
}
