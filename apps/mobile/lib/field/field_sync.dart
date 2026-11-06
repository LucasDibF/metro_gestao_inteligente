import 'dart:convert';
import 'dart:io';
import '../auth/operator_session.dart';
import '../core/api_client.dart';
import 'field_document.dart';
import 'field_failures.dart';
import 'field_store.dart';

/// Sends the queue of a hole and commits server snapshots to the local copy.
class FieldSync {
  const FieldSync(this.session, this.store, this.photoFile);
  final OperatorSession session;
  final FieldStore store;
  final Future<String> Function(String stored) photoFile;

  String route(String work, String hole) => 'obras/$work/furos/$hole';

  /// The queue may have grown while the snapshot travelled, and a snapshot
  /// older than the local copy must not replace it.
  Future<Json> commit(
    String account,
    String work,
    String hole,
    Json snapshot,
  ) async {
    if ((await store.pending(account, hole)).isNotEmpty) {
      throw const FieldConflict();
    }
    final existing = await store.read(account, hole);
    final remote = (snapshot['technical'] as Json)['hole'] as Json;
    final known = existing?['serverVersion'] as num?;
    if (known != null && known > (remote['technicalVersion'] as num)) {
      return existing!;
    }
    final doc = holeDocumentFromSnapshot(work, snapshot, existing);
    await store.write(account, hole, doc);
    return doc;
  }

  /// Rejected operations wait for a correction and do not hold back the rest.
  Future<Json> drain(String account, String work, String hole) async {
    var doc = (await store.read(account, hole))!;
    String? submitRefusal;
    // The snapshot confirms the local version once; after that each receipt
    // carries the server's version and review state for the next operation.
    var confirmed = false;
    for (final operation in await store.pending(account, hole)) {
      if (isRejected(operation)) continue;
      if (session.profile?.cacheKey != account) {
        throw const ApiFailure(401, 'Entre novamente.');
      }
      final id = operation['id'] as String;
      final base = route(work, hole);
      final Json receipt;
      try {
        final recorded = await _recordedReceipt(base, operation);
        if (recorded != null) {
          receipt = recorded;
        } else {
          if (!confirmed) {
            await _confirmVersion(base, doc);
            confirmed = true;
          } else if (doc['hole']['reviewState'] != 'DRAFT') {
            throw const FieldConflict();
          }
          receipt = await _send(base, operation, doc);
        }
      } on _Refused catch (refused) {
        if (operation['kind'] == 'SUBMIT') {
          await store.remove(account, hole, id);
          submitRefusal = refused.reason;
        } else {
          await store.reject(account, hole, id, refused.reason);
        }
        continue;
      }
      doc = documentWithReceipt(doc, operation, receipt);
      await store.acknowledge(account, hole, id, doc);
      if (operation['kind'] == 'PHOTO') {
        await deleteQuietly(_payload(operation)['path'] as String);
      }
    }
    final rejected = (await store.pending(
      account,
      hole,
    )).where(isRejected).map((o) => o['rejection']).toSet();
    if (rejected.isNotEmpty) {
      throw FieldRejected(
        'Há registros recusados pelo servidor. Corrija-os para concluir a sincronização. ${rejected.join(' ')}',
      );
    }
    // An empty queue permits refreshing the authoritative checklist/results.
    if (submitRefusal == null) return _refresh(account, work, hole);
    try {
      await _refresh(account, work, hole);
    } on Exception {
      // The refusal is what the operator needs to read.
    }
    throw FieldRejected('O envio para análise foi recusado. $submitRefusal');
  }

  /// A leftover file does not invalidate a committed change.
  Future<void> deleteQuietly(String storedPath) async {
    try {
      final file = File(await photoFile(storedPath));
      if (await file.exists()) await file.delete();
    } on Exception {
      return;
    }
  }

  Json _payload(Json operation) =>
      jsonDecode(operation['payload'] as String) as Json;

  Future<Json> _refresh(String account, String work, String hole) async =>
      commit(
        account,
        work,
        hole,
        await session.get('${route(work, hole)}/mobile/snapshot'),
      );

  /// The receipt the server kept for an operation sent before, if it got there.
  Future<Json?> _recordedReceipt(String base, Json operation) async {
    if (operation['prepared'] == null) return null;
    final lookup = await session.get(
      '$base/mobile/operacoes/${operation['id']}',
    );
    return lookup['receipt'] as Json?;
  }

  /// The local copy must start from the server's current version, in draft.
  Future<void> _confirmVersion(String base, Json doc) async {
    final snapshot = await session.get('$base/mobile/snapshot');
    final remote = (snapshot['technical'] as Json)['hole'] as Json;
    if (remote['technicalVersion'] != doc['serverVersion'] ||
        remote['reviewState'] != 'DRAFT') {
      throw const FieldConflict();
    }
  }

  /// The server locks field execution both when the hole left draft (sent for
  /// review on the web, which keeps its version) and when the profile lost
  /// access. Only the first one is a conflict with the local copy.
  Future<void> _confirmStillDraft(String base) async {
    final snapshot = await session.get('$base/mobile/snapshot');
    final remote = (snapshot['technical'] as Json)['hole'] as Json;
    if (remote['reviewState'] != 'DRAFT') throw const FieldConflict();
  }

  /// Prepares [operation] once and sends it; the server checks the version
  /// again under the hole lock and answers 409 when it moved.
  Future<Json> _send(String base, Json operation, Json doc) async {
    final alreadyPrepared = operation['prepared'] as String?;
    final Json prepared;
    if (alreadyPrepared != null) {
      prepared = jsonDecode(alreadyPrepared) as Json;
    } else {
      prepared = preparedOperation(operation, doc);
      await store.prepare(operation['id'] as String, prepared);
    }
    try {
      return operation['kind'] == 'PHOTO'
          ? await _sendPhoto(base, operation, prepared)
          : await session.request(
              '$base/mobile/operacoes',
              method: 'POST',
              body: prepared,
            );
    } on ApiFailure catch (failure) {
      if (failure.status == 400 || failure.status == 422) {
        throw _Refused(failure.message);
      }
      if (failure.status == 409 && failure.code == _versionConflict) {
        throw const FieldConflict();
      }
      if (failure.status == 403 && failure.code == _executionLocked) {
        await _confirmStillDraft(base);
      }
      rethrow;
    }
  }

  Future<Json> _sendPhoto(String base, Json operation, Json prepared) async {
    final payload = _payload(operation);
    final file = File(await photoFile(payload['path'] as String));
    if (!await file.exists()) {
      throw const _Refused(
        'A fotografia não foi encontrada neste aparelho. Remova-a para liberar o envio.',
      );
    }
    return session.upload('$base/mobile/fotografias', file.path, {
      'operationId': operation['id'] as String,
      'caption': payload['caption'] as String,
      'purpose': payload['purpose'] as String,
      'expectedTechnicalVersion': '${prepared['expectedTechnicalVersion']}',
    });
  }
}

const _versionConflict = 'RECORD_VERSION_CONFLICT';
const _executionLocked = 'FIELD_EXECUTION_LOCKED';

class _Refused implements Exception {
  const _Refused(this.reason);
  final String reason;
}
