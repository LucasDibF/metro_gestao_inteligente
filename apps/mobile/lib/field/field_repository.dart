import 'dart:convert';
import 'dart:io';
import '../auth/operator_session.dart';
import '../core/api_client.dart';
import 'field_failures.dart';
import 'field_store.dart';
import 'field_sync.dart';
import 'photo_paths.dart';

export 'field_failures.dart';

class FieldRepository {
  FieldRepository(
    this.session,
    this.store, {
    Future<String> Function() photoRoot = applicationPhotoRoot,
  }) : _photoRoot = photoRoot;

  /// Screens share one instance per account: a second one would not see the
  /// synchronization already running.
  factory FieldRepository.forAccount(
    OperatorSession session,
    FieldStore store,
  ) => (_accounts[session] ??= {}).putIfAbsent((
    store,
    session.profile?.cacheKey,
  ), () => FieldRepository(session, store));

  static final _accounts =
      Expando<Map<(FieldStore, String?), FieldRepository>>();

  final OperatorSession session;
  final FieldStore store;
  final Future<String> Function() _photoRoot;
  final Set<String> _busy = {};
  final Map<String, Future<void>> _writes = {};
  String get owner => session.profile!.cacheKey;
  late final _sync = FieldSync(session, store, photoFile);
  String base(String work, String hole) => _sync.route(work, hole);

  /// Absolute location, on this installation, of a stored photo path.
  Future<String> photoFile(String stored) async => File(stored).isAbsolute
      ? stored
      : resolvePhotoPath(await _photoRoot(), stored);

  /// Local writes of a hole run one at a time, in the order they were asked.
  Future<T> _serial<T>(String hole, Future<T> Function() action) {
    final run = (_writes[hole] ?? Future<void>.value()).then((_) => action());
    _writes[hole] = run.then<void>((_) {}, onError: (Object _) {});
    return run;
  }

  Future<Json> open(String work, String hole) async {
    final local = await store.read(owner, hole);
    if (local != null) {
      if (!session.offlineReadAllowed) {
        throw const ApiFailure(
          401,
          'Entre novamente para acessar os dados salvos.',
        );
      }
      return local;
    }
    return download(work, hole);
  }

  /// Best effort when a downloaded hole opens: the local copy stays on any
  /// failure, and pending work is never replaced.
  Future<Json?> refreshIfClean(String work, String hole) async {
    try {
      if (session.offline ||
          _busy.contains(hole) ||
          (await store.pending(owner, hole)).isNotEmpty) {
        return null;
      }
      return await download(work, hole);
    } catch (_) {
      return null;
    }
  }

  Future<Json> download(String work, String hole) async {
    final account = owner;
    if ((await store.pending(account, hole)).isNotEmpty) {
      throw const FieldConflict();
    }
    if (_busy.contains(hole)) {
      throw StateError('Aguarde a sincronização terminar.');
    }
    final snapshot = await session.get('${base(work, hole)}/mobile/snapshot');
    return _serial(hole, () => _sync.commit(account, work, hole, snapshot));
  }

  Future<void> _editable(Json doc) async {
    final hole = doc['hole']['id'] as String;
    if (_busy.contains(hole)) {
      throw StateError('Aguarde a sincronização terminar.');
    }
    if (!session.offlineReadAllowed) {
      throw const ApiFailure(401, 'Entre novamente antes de registrar dados.');
    }
    if (doc['hole']['reviewState'] != 'DRAFT') {
      throw StateError('O furo foi enviado e está bloqueado para edição.');
    }
    if ((await store.pending(owner, hole)).any((o) => o['kind'] == 'SUBMIT')) {
      throw StateError(
        'O envio para análise está pendente. Sincronize antes de editar o furo.',
      );
    }
  }

  /// Applies an edit over the stored document, never over a screen's old copy.
  Future<void> _edit(
    Json screenDoc,
    String kind,
    Json payload,
    void Function(Json latest) apply,
  ) async {
    await _editable(screenDoc);
    final hole = screenDoc['hole']['id'] as String;
    await _serial(hole, () async {
      final latest =
          await store.read(owner, hole) ??
          (jsonDecode(jsonEncode(screenDoc)) as Json);
      await _editable(latest);
      apply(latest);
      await store.save(owner, hole, latest, kind, payload);
    });
  }

  Future<void> saveMetre(Json doc, Json payload) {
    final key = '${num.parse(payload['depthM'] as String)}';
    return _edit(doc, 'METRE', payload, (latest) {
      (latest['editorDrafts'] as Json?)?.remove(key);
      latest['records'][key] = {
        ...?latest['records'][key] as Json?,
        ...payload,
      };
    });
  }

  /// Keeps typed text of a metre that was not confirmed yet. Waits for a
  /// running synchronization, whose acknowledgements would overwrite it.
  Future<void> saveMetreDraft(String hole, int depth, Json draft) =>
      _serial(hole, () async {
        final latest = (await store.read(owner, hole))!;
        latest['editorDrafts'] ??= <String, dynamic>{};
        latest['editorDrafts']['$depth'] = draft;
        await store.write(owner, hole, latest);
      });

  Future<void> discardMetreDraft(String hole, int depth) =>
      _serial(hole, () async {
        final latest = (await store.read(owner, hole))!;
        (latest['editorDrafts'] as Json?)?.remove('$depth');
        await store.write(owner, hole, latest);
      });

  Future<void> saveFields(Json doc, Json payload) =>
      _edit(doc, 'FIELDS', payload, (latest) => latest['hole'].addAll(payload));

  Future<void> saveCoordinate(Json doc, Json payload) => _edit(
    doc,
    'COORDINATE',
    payload,
    (latest) => latest['executedCoordinate'] = payload,
  );

  Future<void> savePhoto(
    Json doc,
    String filePath,
    String caption,
    String purpose,
  ) {
    final payload = <String, dynamic>{
      'path': relativePhotoPath(filePath),
      'caption': caption,
      'purpose': purpose,
    };
    return _edit(
      doc,
      'PHOTO',
      payload,
      (latest) => (latest['localPhotos'] as List).add(payload),
    );
  }

  /// A rejected photo cannot be corrected, only taken out of the queue.
  Future<void> removeRejectedPhoto(String hole, String storedPath) async {
    await _serial(hole, () async {
      final operation = (await store.pending(owner, hole)).where(
        (o) =>
            isRejected(o) &&
            o['kind'] == 'PHOTO' &&
            (jsonDecode(o['payload'] as String) as Json)['path'] == storedPath,
      );
      if (operation.isEmpty) {
        throw StateError('Esta fotografia não está recusada.');
      }
      final latest = (await store.read(owner, hole))!;
      (latest['localPhotos'] as List).removeWhere(
        (p) => p['path'] == storedPath,
      );
      await store.remove(
        owner,
        hole,
        operation.first['id'] as String,
        document: latest,
      );
    });
    await _sync.deleteQuietly(storedPath);
  }

  Future<Json> sync(String work, String hole) async {
    if (!_busy.add(hole)) {
      throw StateError('Sincronização já está em andamento.');
    }
    try {
      final account = owner;
      return await _serial(hole, () => _sync.drain(account, work, hole));
    } finally {
      _busy.remove(hole);
    }
  }

  Future<Json> submit(String work, String hole, String note) async {
    var doc = await sync(work, hole);
    if (doc['hole']['reviewState'] != 'DRAFT') return doc;
    final missing = (doc['checklist'] as List)
        .cast<Json>()
        .where((c) => c['stage'] == 'review' && c['complete'] != true)
        .toList();
    if (missing.isNotEmpty) {
      throw StateError(missing.map((c) => c['label']).join('\n'));
    }
    if ((doc['files']['photos'] as List).any(
      (p) => p['processingState'] != 'READY',
    )) {
      throw StateError(
        'Aguarde o processamento das fotografias antes de enviar.',
      );
    }
    await _serial(hole, () async {
      final latest = await store.read(owner, hole) ?? doc;
      await store.save(owner, hole, latest, 'SUBMIT', {'note': note});
    });
    doc = await sync(work, hole);
    return doc;
  }
}
