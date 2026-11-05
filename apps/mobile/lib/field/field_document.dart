import 'dart:convert';
import 'field_store.dart';

Json _copy(Json source) => jsonDecode(jsonEncode(source)) as Json;

/// Builds the local document from a server snapshot. Typed metre drafts belong
/// to the operator, so they outlive the refresh.
Json holeDocumentFromSnapshot(String work, Json snapshot, Json? existing) {
  final technical = snapshot['technical'] as Json;
  final layersAll = (technical['layers'] as List).cast<Json>();
  final records = <String, dynamic>{};
  for (final raw in technical['tests'] as List) {
    final test = Map<String, dynamic>.from(raw as Map);
    final depth = num.parse('${test['depthM']}');
    final layers = layersAll
        .where(
          (l) =>
              num.parse('${l['fromM']}') < depth &&
              num.parse('${l['toM']}') > depth - 1,
        )
        .toList();
    records['$depth'] = {
      ...test,
      'soil': layers.isEmpty ? <String, dynamic>{} : {...layers.last},
    };
  }
  final drafts = existing?['editorDrafts'] as Json?;
  return {
    'workId': work,
    'hole': technical['hole'],
    'serverVersion': technical['hole']['technicalVersion'],
    'records': records,
    'files': snapshot['files'] as Json,
    'checklist': technical['checklist'],
    'localPhotos': <dynamic>[],
    'downloadedAt': DateTime.now().toIso8601String(),
    if (drafts != null && drafts.isNotEmpty) 'editorDrafts': drafts,
  };
}

/// Fixes the request of a queued operation against the acknowledged document.
Json preparedOperation(Json operation, Json doc) {
  final kind = operation['kind'] as String;
  final payload = jsonDecode(operation['payload'] as String) as Json;
  final body = Map<String, dynamic>.from(payload);
  String? recordId;
  if (kind == 'METRE') {
    final record =
        doc['records']['${num.parse(payload['depthM'] as String)}'] as Json?;
    recordId = record?['id'] as String?;
    if (recordId != null) body['version'] = record!['version'];
  }
  if (['METRE', 'FIELDS', 'SUBMIT'].contains(kind)) {
    body['technicalVersion'] = doc['serverVersion'];
  }
  if (kind == 'COORDINATE') {
    final coordinates = (doc['files']['coordinates'] as List)
        .cast<Json>()
        .where((c) => c['kind'] == 'EXECUTED');
    if (coordinates.isNotEmpty) {
      body['version'] = coordinates.first['version'];
    }
  }
  return {
    'operationId': operation['id'],
    'expectedTechnicalVersion': doc['serverVersion'],
    'kind': kind,
    'payload': body,
    'recordId': ?recordId,
  };
}

/// The document after the server acknowledged [operation].
Json documentWithReceipt(Json doc, Json operation, Json receipt) {
  final next = _copy(doc);
  final kind = operation['kind'] as String;
  final payload = jsonDecode(operation['payload'] as String) as Json;
  next['serverVersion'] = receipt['technicalVersion'];
  next['hole']['technicalVersion'] = receipt['technicalVersion'];
  next['hole']['reviewState'] = receipt['reviewState'];
  if (kind == 'METRE') {
    final key = '${num.parse(payload['depthM'] as String)}';
    next['records'][key]['id'] = receipt['result']['id'];
    next['records'][key]['version'] = receipt['result']['version'];
  }
  if (kind == 'COORDINATE') {
    final rows = next['files']['coordinates'] as List;
    rows.removeWhere((c) => c['kind'] == 'EXECUTED');
    rows.add(receipt['result']);
  }
  if (kind == 'PHOTO') {
    (next['localPhotos'] as List).removeWhere(
      (p) => p['path'] == payload['path'],
    );
    (next['files']['photos'] as List).add({
      ...receipt['result'] as Json,
      'caption': payload['caption'],
      'purpose': payload['purpose'],
      'processingState': 'PENDING',
    });
  }
  return next;
}
