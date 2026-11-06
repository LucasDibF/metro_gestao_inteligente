import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../ui/metro_layout.dart';
import '../ui/metro_theme.dart';
import '../ui/metro_widgets.dart';
import 'field_store.dart';
import 'hole_photos_tab.dart';
import 'photo_recovery.dart';

const _paneMinWidth = 300.0;
const _sourceButtonMinWidth = 130.0;

class PhotoCapture extends StatefulWidget {
  const PhotoCapture({
    super.key,
    required this.owner,
    required this.holeId,
    required this.store,
    required this.onSave,
    ImagePicker? picker,
    this.makeDurable = durablePhoto,
  }) : _picker = picker;
  final String owner, holeId;
  final FieldStore store;
  final Future<void> Function(String, String, String) onSave;
  final ImagePicker? _picker;
  final Future<String> Function(String source, String owner) makeDurable;
  ImagePicker get picker => _picker ?? ImagePicker();
  @override
  State<PhotoCapture> createState() => _PhotoCaptureState();
}

class _PhotoCaptureState extends State<PhotoCapture> {
  final caption = TextEditingController();
  String purpose = 'SITE';
  String? file, pickError, saveError;
  bool busy = false;
  final _pickErrorKey = GlobalKey();

  /// The buttons may sit at the window's edge; the failure must not stay hidden.
  void _showPickError(String message) {
    setState(() => pickError = message);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final notice = _pickErrorKey.currentContext;
      if (notice != null && notice.mounted) {
        Scrollable.ensureVisible(notice, alignment: 0.5);
      }
    });
  }

  /// The picker hands over a temporary copy of its own, never the original
  /// in the gallery, so the copy can go once it is no longer needed.
  void _discardPicked(String? picked) {
    if (picked == null) return;
    File(picked).delete().then<void>((_) {}, onError: (Object _) {});
  }

  @override
  void dispose() {
    _discardPicked(file);
    caption.dispose();
    super.dispose();
  }

  Future<void> _pick(ImageSource source) async {
    setState(() {
      busy = true;
      pickError = null;
    });
    try {
      await widget.store.setting('camera', {
        'owner': widget.owner,
        'hole': widget.holeId,
      });
      final image = await widget.picker.pickImage(
        source: source,
        imageQuality: 85,
        maxWidth: 2400,
        maxHeight: 2400,
      );
      if (image == null) {
        await widget.store.setting('camera', null);
        return;
      }
      await widget.store.setting('camera', null);
      final bytes = await image.length();
      if (bytes > 8 * 1024 * 1024) {
        _discardPicked(image.path);
        throw StateError('A fotografia deve ter no máximo 8 MB.');
      }
      if (!mounted) {
        _discardPicked(image.path);
        return;
      }
      _discardPicked(file);
      setState(() => file = image.path);
    } catch (_) {
      if (mounted) {
        _showPickError(
          'Não foi possível obter a fotografia. Confira a permissão da câmera ou escolha um JPEG/PNG da galeria.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _savePhoto() async {
    setState(() {
      busy = true;
      saveError = null;
    });
    File? durable;
    try {
      durable = File(await widget.makeDurable(file!, widget.owner));
      await widget.onSave(durable.path, caption.text.trim(), purpose);
      if (durable.path != file) _discardPicked(file);
      file = null;
      if (mounted) Navigator.pop(context);
    } catch (_) {
      if (durable != null && await durable.exists()) {
        await durable.delete();
      }
      if (mounted) {
        setState(
          () => saveError =
              'Não foi possível salvar a fotografia. Confira o espaço disponível e tente novamente.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget _source() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    spacing: MetroSpace.md,
    children: [
      PhotoFrame(
        child: file == null
            ? null
            : Image.file(
                File(file!),
                fit: BoxFit.contain,
                cacheWidth: photoPreviewCacheWidth,
                errorBuilder: (_, e, s) => const Center(
                  child: Text('Não foi possível abrir a imagem.'),
                ),
              ),
      ),
      MetroColumns(
        minColumnWidth: _sourceButtonMinWidth,
        maxColumns: 2,
        spacing: MetroSpace.md,
        runSpacing: MetroSpace.sm,
        children: [
          OutlinedButton.icon(
            onPressed: busy ? null : () => _pick(ImageSource.camera),
            icon: const Icon(Icons.camera_alt_outlined),
            label: const Text('Tirar foto'),
          ),
          OutlinedButton.icon(
            onPressed: busy ? null : () => _pick(ImageSource.gallery),
            icon: const Icon(Icons.photo_library_outlined),
            label: const Text('Galeria'),
          ),
        ],
      ),
      if (pickError != null)
        MetroNotice(
          pickError!,
          key: _pickErrorKey,
          tone: MetroNoticeTone.error,
        ),
    ],
  );

  Widget _details() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    spacing: MetroSpace.lg,
    children: [
      MetroField(
        label: 'Tipo de fotografia',
        child: DropdownButtonFormField<String>(
          style: Theme.of(context).textTheme.bodyLarge,
          initialValue: purpose,
          isExpanded: true,
          itemHeight: null,
          items: const [
            DropdownMenuItem(value: 'SITE', child: Text('Vista geral')),
            DropdownMenuItem(
              value: 'EXECUTION',
              child: Text('Execução da sondagem'),
            ),
            DropdownMenuItem(
              value: 'SAMPLE_1',
              child: Text('Solo no amostrador'),
            ),
            DropdownMenuItem(
              value: 'SAMPLE_2',
              child: Text('Solo fora do amostrador'),
            ),
          ],
          onChanged: busy ? null : (v) => purpose = v!,
        ),
      ),
      MetroField(
        label: 'Legenda (opcional)',
        child: TextField(controller: caption, maxLength: 500, maxLines: 3),
      ),
    ],
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: metroAppBar(context, title: 'Adicionar fotografia'),
    body: MetroActionLayout(
      maxWidth: MetroWidth.hierarchy,
      action: MetroFormAction(
        error: saveError,
        button: FilledButton.icon(
          onPressed: busy || file == null ? null : _savePhoto,
          icon: const Icon(Icons.save_outlined),
          label: Text(busy ? 'Salvando…' : 'Salvar fotografia no aparelho'),
        ),
      ),
      children: [
        MetroColumns(
          minColumnWidth: _paneMinWidth,
          maxColumns: 2,
          spacing: MetroSpace.xl,
          runSpacing: MetroSpace.lg,
          children: [_source(), _details()],
        ),
      ],
    ),
  );
}
