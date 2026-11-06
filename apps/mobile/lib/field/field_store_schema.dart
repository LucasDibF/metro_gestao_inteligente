import 'dart:convert';
import 'package:sqflite/sqflite.dart';
import 'photo_paths.dart';

const fieldStoreVersion = 3;
const operationPending = 'pending';
const operationRejected = 'rejected';

String metreItem(num depth) => 'METRE:$depth';
String photoItem(String storedPath) => 'PHOTO:$storedPath';

/// What an operation edits: a new save of the same item replaces its rejection.
String operationItem(String kind, Map<String, dynamic> payload) {
  final depth = num.tryParse('${payload['depthM']}');
  return switch (kind) {
    'METRE' when depth != null => metreItem(depth),
    'PHOTO' => photoItem('${payload['path']}'),
    _ => kind,
  };
}

Future<void> createFieldTables(DatabaseExecutor db) async {
  await db.execute(
    'CREATE TABLE settings(key TEXT PRIMARY KEY, payload TEXT NOT NULL)',
  );
  await db.execute(
    'CREATE TABLE documents(owner TEXT NOT NULL, hole TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(owner,hole))',
  );
  await db.execute(
    "CREATE TABLE operations(sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, owner TEXT NOT NULL, hole TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, prepared TEXT, item TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT '$operationPending', rejection TEXT)",
  );
  await db.execute(
    'CREATE INDEX operations_owner_hole ON operations(owner,hole,sequence)',
  );
  await db.execute(
    'CREATE TABLE catalogs(owner TEXT NOT NULL, work TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(owner,work))',
  );
}

/// Runs inside the transaction sqflite opens for an upgrade: any failure
/// restores the previous database and its queue.
Future<void> upgradeFieldTables(DatabaseExecutor db, int old) async {
  if (old < 2) {
    await db.execute(
      'CREATE TABLE settings(key TEXT PRIMARY KEY, payload TEXT NOT NULL)',
    );
  }
  if (old < 3) {
    await db.execute(
      "ALTER TABLE operations ADD COLUMN item TEXT NOT NULL DEFAULT ''",
    );
    await db.execute(
      "ALTER TABLE operations ADD COLUMN status TEXT NOT NULL DEFAULT '$operationPending'",
    );
    await db.execute('ALTER TABLE operations ADD COLUMN rejection TEXT');
    await _relativizeDocuments(db);
    await _migrateOperations(db);
    await _relativizeCameraRecovery(db);
  }
}

Map<String, dynamic>? _decoded(Object? raw) {
  try {
    return jsonDecode(raw as String) as Map<String, dynamic>;
  } on FormatException {
    return null;
  } on TypeError {
    return null;
  }
}

Future<void> _relativizeDocuments(DatabaseExecutor db) async {
  for (final row in await db.query('documents')) {
    final document = _decoded(row['payload']);
    final photos = document?['localPhotos'];
    if (photos is! List) continue;
    for (final photo in photos.whereType<Map<String, dynamic>>()) {
      photo['path'] = relativePhotoPath('${photo['path']}');
    }
    await db.update(
      'documents',
      {'payload': jsonEncode(document)},
      where: 'owner=? AND hole=?',
      whereArgs: [row['owner'], row['hole']],
    );
  }
}

Future<void> _migrateOperations(DatabaseExecutor db) async {
  for (final row in await db.query('operations')) {
    final kind = row['kind'] as String;
    final payload = _decoded(row['payload']);
    if (payload == null) {
      await db.update(
        'operations',
        {'item': kind},
        where: 'sequence=?',
        whereArgs: [row['sequence']],
      );
      continue;
    }
    final prepared = _decoded(row['prepared']);
    if (kind == 'PHOTO') {
      payload['path'] = relativePhotoPath('${payload['path']}');
      final body = prepared?['payload'];
      if (body is Map<String, dynamic>) {
        body['path'] = payload['path'];
      }
    }
    await db.update(
      'operations',
      {
        'item': operationItem(kind, payload),
        'payload': jsonEncode(payload),
        if (prepared != null) 'prepared': jsonEncode(prepared),
      },
      where: 'sequence=?',
      whereArgs: [row['sequence']],
    );
  }
}

Future<void> _relativizeCameraRecovery(DatabaseExecutor db) async {
  final rows = await db.query(
    'settings',
    where: 'key=?',
    whereArgs: ['camera'],
  );
  if (rows.isEmpty) return;
  final camera = _decoded(rows.first['payload']);
  final recovered = camera?['recoveredPath'];
  if (recovered is! String) return;
  camera!['recoveredPath'] = relativePhotoPath(recovered);
  await db.update(
    'settings',
    {'payload': jsonEncode(camera)},
    where: 'key=?',
    whereArgs: ['camera'],
  );
}
