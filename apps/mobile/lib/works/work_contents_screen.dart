import 'package:flutter/material.dart';
import '../auth/operator_session.dart';
import '../core/api_client.dart';
import '../ui/metro_layout.dart';
import '../ui/metro_theme.dart';
import '../ui/metro_widgets.dart';
import 'work_catalog.dart';
import 'work_repository.dart';
import '../field/field_format.dart';
import '../field/field_store.dart';
import '../field/field_repository.dart';
import '../field/hole_screen.dart';

/// Browses the assigned work using the API's existing access checks.
class WorkContentsScreen extends StatefulWidget {
  const WorkContentsScreen({
    super.key,
    required this.work,
    required this.session,
    this.store,
  });
  final AssignedWork work;
  final OperatorSession session;

  /// Local database; the app-wide instance unless a test provides its own.
  final FieldStore? store;

  @override
  State<WorkContentsScreen> createState() => _WorkContentsScreenState();
}

class _WorkContentsScreenState extends State<WorkContentsScreen> {
  late Future<WorkCatalog> _contents;
  late final FieldRepository _repository;
  late final WorkCatalogRepository _catalog;
  late final FieldStore _fieldStore;
  bool _downloading = false;
  String? _message;

  @override
  void initState() {
    super.initState();
    _fieldStore = widget.store ?? FieldStore.instance;
    _repository = FieldRepository.forAccount(widget.session, _fieldStore);
    _catalog = WorkCatalogRepository(widget.session, _fieldStore);
    _contents = _load();
  }

  Future<WorkCatalog> _load() => _catalog.load(widget.work.id);

  Future<void> _download() async {
    setState(() {
      _downloading = true;
      _message = null;
    });
    try {
      final rows = (await _contents).rows;
      final holes = <Json>[
        for (final row in rows)
          if (row.containsKey('children'))
            ...(row['children'] as List).cast<Json>()
          else
            row,
      ];
      final available = await _downloadEach(holes);
      final skipped = holes.length - available.length;
      final names = [
        for (final hole in holes)
          if (!available.contains(hole['id'])) hole['code'],
      ].join(', ');
      if (mounted) {
        setState(
          () => _message = skipped == 0
              ? '${holesOnDevice(available.length)} Alterações pendentes foram preservadas.'
              : '${holesOnDevice(available.length)} Não baixados: $names. Confira a conexão e tente novamente. Os furos já salvos foram preservados.',
        );
      }
    } catch (e) {
      if (mounted) {
        setState(
          () => _message =
              'Não foi possível baixar todos os furos. Confira a conexão e tente novamente. Os furos já salvos foram preservados.',
        );
      }
    } finally {
      if (mounted) setState(() => _downloading = false);
    }
  }

  /// A hole with a problem does not hold back the others. Without connection
  /// or session the remaining ones would only fail too, slowly.
  Future<Set<String>> _downloadEach(List<Json> holes) async {
    final available = <String>{};
    for (final hole in holes) {
      final id = hole['id'] as String;
      if (widget.session.profile == null) break;
      try {
        if ((await _fieldStore.pending(_repository.owner, id)).isEmpty) {
          await _repository.download(widget.work.id, id);
        }
        available.add(id);
      } on NetworkFailure {
        break;
      } catch (_) {
        continue;
      }
    }
    return available;
  }

  Future<void> _reload() async {
    setState(() {
      _contents = _load();
    });
    try {
      await _contents;
    } catch (_) {}
  }

  Widget _hole(Map<String, dynamic> hole) => MetroRow(
    leading: Icons.straighten,
    title: hole['code'] as String,
    lines: [
      hole['plannedDepthM'] == null
          ? 'Profundidade prevista não informada'
          : 'Profundidade prevista: ${hole['plannedDepthM']} m',
    ],
    trailing: Icons.chevron_right,
    onTap: _downloading
        ? null
        : () => Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => HoleScreen(
                workId: widget.work.id,
                holeId: hole['id'] as String,
                code: hole['code'] as String,
                repository: _repository,
              ),
            ),
          ),
  );

  Widget _folder(Json row) {
    // Rows read from the offline catalog come from JSON, as `List<dynamic>`.
    final holes = (row['children'] as List).cast<Json>();
    return ExpansionTile(
      key: PageStorageKey(row['id']),
      // The theme sets the timing; reduced motion opens the folder at once.
      expansionAnimationStyle: MetroMotion.reduced(context)
          ? AnimationStyle.noAnimation
          : null,
      tilePadding: const EdgeInsets.symmetric(
        horizontal: MetroSpace.lg,
        vertical: MetroSpace.xs,
      ),
      leading: Icon(Icons.folder_outlined, color: context.metro.muted),
      title: Text(
        row['name'] as String,
        style: Theme.of(context).textTheme.titleMedium,
      ),
      subtitle: Text(holeCount(holes.length)),
      children: [
        const Divider(),
        if (holes.isEmpty)
          const Padding(
            padding: EdgeInsets.all(MetroSpace.lg),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text('Nenhum furo nesta pasta.'),
            ),
          ),
        for (final (index, hole) in holes.indexed) ...[
          if (index > 0) const Divider(),
          _hole(hole),
        ],
      ],
    );
  }

  Widget _contentsList(WorkCatalog catalog) {
    final rows = catalog.rows;
    return MetroActionLayout(
      maxWidth: MetroWidth.hierarchy,
      onRefresh: _reload,
      children: [
        const MetroSectionTitle('Pastas e furos'),
        const SizedBox(height: MetroSpace.md),
        if (catalog.cached) ...[
          const MetroNotice(
            'Sem conexão · Catálogo salvo neste aparelho',
            icon: Icons.wifi_off,
          ),
          const SizedBox(height: MetroSpace.md),
        ],
        if (rows.isNotEmpty) ...[
          OutlinedButton.icon(
            onPressed: _downloading ? null : _download,
            icon: const Icon(Icons.download_for_offline_outlined),
            label: Text(
              _downloading
                  ? 'Baixando furos…'
                  : 'Baixar obra para usar offline',
            ),
          ),
          const SizedBox(height: MetroSpace.md),
        ],
        if (_message != null) ...[
          MetroNotice(_message!),
          const SizedBox(height: MetroSpace.md),
        ],
        if (rows.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: MetroSpace.xl),
            child: Text(
              'Esta obra ainda não possui furos. Peça ao responsável para cadastrar os furos no sistema web.',
            ),
          ),
        for (final (index, row) in rows.indexed) ...[
          const SizedBox(height: MetroSpace.xs),
          MetroPanel(
            index: index,
            pressable: !row.containsKey('children'),
            child: row.containsKey('children') ? _folder(row) : _hole(row),
          ),
          const SizedBox(height: MetroSpace.xs),
        ],
      ],
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: metroAppBar(
      context,
      title: widget.work.name,
      actions: [
        IconButton(
          onPressed: _downloading ? null : _reload,
          tooltip: 'Atualizar furos',
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    body: FutureBuilder<WorkCatalog>(
      future: _contents,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const MetroLoading();
        }
        if (snapshot.hasError) {
          final error = snapshot.error;
          final message = error is NetworkFailure
              ? 'Conecte-se à internet para baixar esta obra antes de usar sem conexão.'
              : error is ApiFailure && error.status == 404
              ? 'Esta obra não está mais disponível para seu acesso. Atualize a lista de obras.'
              : error is ApiFailure && error.status == 403
              ? error.message
              : 'Não foi possível carregar os furos. Tente novamente.';
          return MetroStateView(
            icon: Icons.cloud_off_outlined,
            message: message,
            actionLabel: 'Tentar novamente',
            onAction: _downloading ? null : _reload,
          );
        }
        return _contentsList(snapshot.data!);
      },
    ),
  );
}
