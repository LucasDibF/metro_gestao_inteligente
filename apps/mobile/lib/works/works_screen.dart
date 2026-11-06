import 'package:flutter/material.dart';
import '../auth/operator_session.dart';
import '../ui/metro_layout.dart';
import '../ui/metro_theme.dart';
import '../ui/metro_widgets.dart';
import 'work_repository.dart';
import 'work_contents_screen.dart';
import '../field/field_store.dart';
import '../field/field_repository.dart';
import '../field/photo_recovery.dart';

class WorksScreen extends StatefulWidget {
  const WorksScreen({
    super.key,
    required this.session,
    required this.repository,
  });
  final OperatorSession session;
  final WorkRepository repository;
  @override
  State<WorksScreen> createState() => _WorksScreenState();
}

class _WorksScreenState extends State<WorksScreen> {
  late Future<WorkList> _works;
  String? _recoveryMessage;
  @override
  void initState() {
    super.initState();
    _works = widget.repository.load();
    recoverCameraPhoto(
          FieldRepository.forAccount(widget.session, FieldStore.instance),
        )
        .then((found) {
          if (found && mounted) {
            setState(
              () => _recoveryMessage =
                  'Fotografia recuperada e salva na fila do furo.',
            );
          }
        })
        .catchError((Object error) {
          if (mounted) {
            setState(
              () => _recoveryMessage =
                  'Confira as fotografias do último furo. A recuperação automática não foi concluída.',
            );
          }
        });
  }

  Future<void> _reload() async {
    setState(() {
      _works = widget.repository.load();
    });
    try {
      await _works;
    } catch (_) {}
  }

  Future<void> _logout() async {
    final count = await FieldStore.instance.pendingCount(
      widget.session.profile!.cacheKey,
    );
    if (!mounted) return;
    if (count > 0) {
      final yes = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          scrollable: true,
          title: const Text('Existem registros pendentes'),
          content: Text(
            '$count registro(s) ainda não foram sincronizados. Eles permanecerão neste aparelho e só poderão ser acessados com esta mesma conta.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Continuar no app'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Sair mesmo assim'),
            ),
          ],
        ),
      );
      if (yes != true) return;
    }
    await widget.session.logout();
  }

  void _open(AssignedWork work) => Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => WorkContentsScreen(work: work, session: widget.session),
    ),
  );

  Widget _list(WorkList data) => MetroActionLayout(
    maxWidth: MetroWidth.list,
    onRefresh: _reload,
    children: [
      Text(
        '${widget.session.profile!.company} · Sondador',
        style: Theme.of(
          context,
        ).textTheme.bodyMedium?.copyWith(color: context.metro.muted),
      ),
      const SizedBox(height: MetroSpace.md),
      if (_recoveryMessage != null) ...[
        MetroNotice(_recoveryMessage!),
        const SizedBox(height: MetroSpace.md),
      ],
      if (data.cached) ...[
        const MetroNotice(
          'Sem conexão · Exibindo a última lista salva neste aparelho.',
          icon: Icons.wifi_off,
        ),
        const SizedBox(height: MetroSpace.md),
      ],
      if (data.items.isEmpty)
        const Padding(
          padding: EdgeInsets.symmetric(vertical: MetroSpace.xxl),
          child: Text(
            'Nenhuma obra atribuída. Peça ao Administrador ou Comercial para atribuir uma obra a você.',
          ),
        ),
      MetroColumns(
        minColumnWidth: 320,
        maxColumns: 2,
        spacing: MetroSpace.md,
        runSpacing: MetroSpace.md,
        equalHeight: true,
        children: [
          for (final (index, work) in data.items.indexed)
            MetroPanel(
              index: index,
              pressable: true,
              child: MetroRow(
                title: work.name,
                lines: [if (work.location.isNotEmpty) work.location],
                leading: Icons.folder_outlined,
                trailing: Icons.chevron_right,
                onTap: () => _open(work),
              ),
            ),
        ],
      ),
    ],
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: metroAppBar(
      context,
      title: 'Minhas obras',
      actions: [
        IconButton(
          onPressed: _reload,
          tooltip: 'Atualizar obras',
          icon: const Icon(Icons.refresh),
        ),
        IconButton(
          onPressed: _logout,
          tooltip: 'Sair',
          icon: const Icon(Icons.logout),
        ),
      ],
    ),
    body: FutureBuilder<WorkList>(
      future: _works,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const MetroLoading();
        }
        if (snapshot.hasError) {
          return MetroStateView(
            icon: Icons.cloud_off_outlined,
            message:
                'Não foi possível carregar suas obras. Confira a conexão e tente novamente.',
            actionLabel: 'Tentar novamente',
            onAction: _reload,
          );
        }
        return _list(snapshot.data!);
      },
    ),
  );
}
