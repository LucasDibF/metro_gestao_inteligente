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
    for (final operation in await store.pending(account, hole)) {
      if (isRejected(operation)) continue;
      if (session.profile?.cacheKey != account) {
        throw const ApiFailure(401, 'Entre novamente.');
      }
      final id = operation['id'] as String;
      final Json receipt;
      try {
        receipt = await _deliver(work, hole, operation, doc);
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

  /// The receipt of [operation], from the server's records or from sending it.
  Future<Json> _deliver(
    String work,
    String hole,
    Json operation,
    Json doc,
  ) async {
    final base = route(work, hole);
    final alreadyPrepared = operation['prepared'] as String?;
    if (alreadyPrepared != null) {
      final lookup = await session.get(
        '$base/mobile/operacoes/${operation['id']}',
      );
      final known = lookup['receipt'] as Json?;
      if (known != null) return known;
    }
    final snapshot = await session.get('$base/mobile/snapshot');
    final remote = snapshot['technical'] as Json;
    if (remote['hole']['technicalVersion'] != doc['serverVersion'] ||
        remote['hole']['reviewState'] != 'DRAFT') {
      throw const FieldConflict();
    }
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

class _Refused implements Exception {
  const _Refused(this.reason);
  final String reason;
}
