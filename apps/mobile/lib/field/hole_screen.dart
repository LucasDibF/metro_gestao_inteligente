import 'package:flutter/material.dart';
import '../ui/metro_layout.dart';
import '../ui/metro_widgets.dart';
import 'field_export.dart';
import 'coordinate_form.dart';
import 'field_format.dart';
import 'field_forms.dart';
import 'field_repository.dart';
import 'field_store.dart';
import 'field_store_schema.dart';
import 'hole_fields_tab.dart';
import 'hole_layout.dart';
import 'hole_metres_tab.dart';
import 'hole_photos_tab.dart';
import 'hole_review_tab.dart';
import 'hole_section_nav.dart';
import 'hole_status_strip.dart';
import 'hole_submit_dialog.dart';
import 'metre_editor.dart';
import 'photo_capture.dart';

class HoleScreen extends StatefulWidget {
  const HoleScreen({
    super.key,
    required this.workId,
    required this.holeId,
    required this.code,
    required this.repository,
  });
  final String workId, holeId, code;
  final FieldRepository repository;
  @override
  State<HoleScreen> createState() => _HoleScreenState();
}

class _HoleScreenState extends State<HoleScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _sections;
  Json? doc;
  String? error, message;
  bool busy = false;
  int pending = 0;
  Map<String, String> rejections = const {};
  Future<void> _draftWrites = Future.value();
  FieldRepository get repo => widget.repository;
  bool get _draft => doc?['hole']['reviewState'] == 'DRAFT';

  @override
  void initState() {
    super.initState();
    _sections = TabController(length: 4, vsync: this);
    _start();
  }

  /// A hole already on the device opens at once, and catches up if it can.
  Future<void> _start() async {
    final downloaded =
        repo.session.profile != null &&
        await repo.store.read(repo.owner, widget.holeId) != null;
    await _load();
    if (!downloaded || doc == null) return;
    final fresh = await repo.refreshIfClean(widget.workId, widget.holeId);
    if (fresh != null && mounted && !busy) await _load();
  }

  @override
  void dispose() {
    _sections.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final value = await repo.open(widget.workId, widget.holeId);
      final queue = await repo.store.pending(repo.owner, widget.holeId);
      if (mounted) {
        setState(() {
          doc = value;
          pending = queue.where((o) => !isRejected(o)).length;
          rejections = {
            for (final operation in queue.where(isRejected))
              operation['item'] as String: operation['rejection'] as String,
          };
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = fieldErrorMessage(e));
    }
  }

  /// The stored document is what the screen shows after any operation, also a
  /// failed one: a synchronization may have delivered part of the queue.
  Future<void> _run(
    Future<void> Function() operation, {
    String? success,
  }) async {
    setState(() {
      busy = true;
      error = null;
      message = null;
    });
    Object? failure;
    try {
      await operation();
    } catch (e) {
      failure = e;
    } finally {
      await _load();
      if (mounted) {
        setState(() {
          busy = false;
          if (failure != null) {
            error = fieldErrorMessage(failure);
          } else {
            message = success;
          }
        });
      }
    }
  }

  Future<void> _sync() => _run(() async {
    await repo.sync(widget.workId, widget.holeId);
  }, success: 'Todos os registros foram sincronizados.');

  Future<void> _openForm(WidgetBuilder builder) async {
    await Navigator.push(context, MaterialPageRoute<void>(builder: builder));
    await _load();
  }

  void _saveDraft(int depth, Json value) {
    _draftWrites = _draftWrites
        .then((_) => repo.saveMetreDraft(widget.holeId, depth, value))
        .catchError((Object e) {
          if (mounted) {
            setState(
              () => error =
                  'Não foi possível salvar o rascunho automaticamente. Salve o metro antes de sair.',
            );
          }
        });
  }

  Future<void> _editMetre(int depth) async {
    final record = (doc!['records'] as Json)['$depth'] as Json?;
    await Navigator.push(
      context,
      MaterialPageRoute<void>(
        builder: (_) => MetreEditor(
          depth: depth,
          record: record,
          previousSoil:
              (doc!['records']['${depth - 1}'] as Json?)?['soil'] as Json?,
          draft: (doc!['editorDrafts'] as Json?)?['$depth'] as Json?,
          onDraft: (value) => _saveDraft(depth, value),
          onSave: (value) async {
            await _draftWrites;
            await repo.saveMetre(doc!, value);
          },
          onDiscardDraft: () async {
            await _draftWrites;
            await repo.discardMetreDraft(widget.holeId, depth);
          },
          rejection: rejections[metreItem(depth)],
        ),
      ),
    );
    await _draftWrites;
    await _load();
  }

  Future<void> _submit() async {
    final text = await showSubmitDialog(context);
    if (text == null || !mounted) return;
    if (text.isEmpty) {
      setState(() => error = 'Informe uma observação para o engenheiro.');
      return;
    }
    await _run(() async {
      await repo.submit(widget.workId, widget.holeId, text);
    }, success: 'Furo enviado para análise. Edição bloqueada.');
  }

  Widget _sectionsView() => TabBarView(
    controller: _sections,
    children: [
      HoleMetresTab(
        doc: doc!,
        draft: _draft,
        busy: busy,
        rejections: rejections,
        onEditMetre: _editMetre,
      ),
      HoleFieldsTab(
        doc: doc!,
        draft: _draft,
        busy: busy,
        rejections: rejections,
        onEditFields: () => _openForm(
          (_) => FieldForm(
            hole: doc!['hole'] as Json,
            records: doc!['records'] as Json,
            onSave: (value) => repo.saveFields(doc!, value),
          ),
        ),
        onEditCoordinate: (coordinate) => _openForm(
          (_) => CoordinateForm(
            coordinate: coordinate,
            onSave: (value) => repo.saveCoordinate(doc!, value),
          ),
        ),
      ),
      HolePhotosTab(
        doc: doc!,
        draft: _draft,
        busy: busy,
        repository: repo,
        workId: widget.workId,
        holeId: widget.holeId,
        rejections: rejections,
        onRemovePhoto: (stored) => _run(
          () => repo.removeRejectedPhoto(widget.holeId, stored),
          success: 'Fotografia removida do aparelho.',
        ),
        onAddPhoto: () => _openForm(
          (_) => PhotoCapture(
            owner: repo.owner,
            holeId: widget.holeId,
            store: repo.store,
            onSave: (path, caption, purpose) =>
                repo.savePhoto(doc!, path, caption, purpose),
          ),
        ),
      ),
      HoleReviewTab(
        doc: doc!,
        draft: _draft,
        busy: busy,
        pending: pending,
        rejected: rejections.length,
        onSubmit: _submit,
      ),
    ],
  );

  @override
  Widget build(BuildContext context) {
    final rail =
        MediaQuery.sizeOf(context).width >= metroRailBreakpoint && doc != null;
    return Scaffold(
      appBar: metroAppBar(
        context,
        title: widget.code,
        actions: [
          HoleShareAction(
            repository: repo,
            holeId: widget.holeId,
            enabled: doc != null && !busy,
            onFailure: () => setState(
              () => error =
                  'Não foi possível compartilhar a cópia. Os dados continuam salvos no aparelho.',
            ),
          ),
        ],
      ),
      bottomNavigationBar: doc == null || rail
          ? null
          : HoleSectionNav(controller: _sections),
      body: doc == null
          ? error == null
                ? const MetroLoading()
                : MetroStateView(
                    icon: Icons.cloud_off_outlined,
                    message: error!,
                    actionLabel: 'Tentar novamente',
                    onAction: _load,
                  )
          : HoleLayout(
              rail: rail,
              controller: _sections,
              busy: busy,
              sections: _sectionsView(),
              header: (constraints) => HoleHeader(
                availableHeight: constraints.maxHeight,
                availableWidth: constraints.maxWidth,
                locked: !_draft,
                pending: pending,
                rejected: rejections.length,
                busy: busy,
                error: error,
                message: message,
                onSync: _sync,
              ),
            ),
    );
  }
}
