import 'dart:convert';
import 'package:path/path.dart' as path;
import 'package:sqflite/sqflite.dart';
import 'package:uuid/uuid.dart';
import 'field_store_schema.dart';

typedef Json = Map<String, dynamic>;

bool isRejected(Json operation) => operation['status'] == operationRejected;

/// Local changes and their outgoing operation are committed together.
class FieldStore {
  static final instance = FieldStore();
  FieldStore({DatabaseFactory? factory, String? databasePath})
    : _factory = factory,
      _path = databasePath;
  final DatabaseFactory? _factory;
  final String? _path;
  Future<Database>? _opening;
  Future<Database> get database => _opening ??= _open();
  Future<Database> _open() async => (_factory ?? databaseFactory).openDatabase(
    _path ?? path.join(await getDatabasesPath(), 'metro-execution.db'),
    options: OpenDatabaseOptions(
      version: fieldStoreVersion,
      onUpgrade: (db, old, next) => upgradeFieldTables(db, old),
      onCreate: (db, _) => createFieldTables(db),
    ),
  );
  Future<Json?> read(String owner, String hole) async {
    final rows = await (await database).query(
      'documents',
      where: 'owner=? AND hole=?',
      whereArgs: [owner, hole],
    );
    return rows.isEmpty
        ? null
        : jsonDecode(rows.first['payload'] as String) as Json;
  }

  Future<void> write(String owner, String hole, Json data) async =>
      (await database)
          .insert('documents', {
            'owner': owner,
            'hole': hole,
            'payload': jsonEncode(data),
          }, conflictAlgorithm: ConflictAlgorithm.replace)
          .then((_) {});
  Future<List<Json>> pending(String owner, String hole) async =>
      (await database).query(
        'operations',
        where: 'owner=? AND hole=?',
        whereArgs: [owner, hole],
        orderBy: 'sequence',
      );

  /// A rejected operation of the same item leaves in the same transaction.
  Future<void> save(
    String owner,
    String hole,
    Json document,
    String kind,
    Json payload,
  ) async {
    final item = operationItem(kind, payload);
    await (await database).transaction((tx) async {
      await _writeDocument(tx, owner, hole, document);
      await tx.delete(
        'operations',
        where: 'owner=? AND hole=? AND item=? AND status=?',
        whereArgs: [owner, hole, item, operationRejected],
      );
      await tx.insert('operations', {
        'id': const Uuid().v4(),
        'owner': owner,
        'hole': hole,
        'kind': kind,
        'payload': jsonEncode(payload),
        'item': item,
      });
    });
  }

  Future<void> prepare(String id, Json payload) async => (await database)
      .update(
        'operations',
        {'prepared': jsonEncode(payload)},
        where: 'id=?',
        whereArgs: [id],
      )
      .then((_) {});

  /// The server's answer is final: the operation waits for a correction.
  Future<void> reject(
    String owner,
    String hole,
    String id,
    String reason,
  ) async {
    await (await database).transaction((tx) async {
      await _dropOlderRejections(tx, owner, hole, id);
      await tx.update(
        'operations',
        {'status': operationRejected, 'rejection': reason},
        where: 'id=? AND owner=? AND hole=?',
        whereArgs: [id, owner, hole],
      );
    });
  }

  Future<void> acknowledge(
    String owner,
    String hole,
    String id,
    Json document,
  ) async {
    await (await database).transaction((tx) async {
      await _writeDocument(tx, owner, hole, document);
      await _dropOlderRejections(tx, owner, hole, id);
      await _deleteOperation(tx, owner, hole, id);
    });
  }

  /// Removes an operation that will never be sent, with the document without it.
  Future<void> remove(
    String owner,
    String hole,
    String id, {
    Json? document,
  }) async {
    await (await database).transaction((tx) async {
      if (document != null) await _writeDocument(tx, owner, hole, document);
      await _deleteOperation(tx, owner, hole, id);
    });
  }

  Future<void> _writeDocument(
    Transaction tx,
    String owner,
    String hole,
    Json document,
  ) async {
    await tx.insert('documents', {
      'owner': owner,
      'hole': hole,
      'payload': jsonEncode(document),
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<void> _deleteOperation(
    Transaction tx,
    String owner,
    String hole,
    String id,
  ) async {
    await tx.delete(
      'operations',
      where: 'id=? AND owner=? AND hole=?',
      whereArgs: [id, owner, hole],
    );
  }

  /// A later attempt at the same item supersedes what was rejected before it.
  Future<void> _dropOlderRejections(
    Transaction tx,
    String owner,
    String hole,
    String id,
  ) async {
    await tx.rawDelete(
      'DELETE FROM operations WHERE owner=? AND hole=? AND status=? AND '
      'item=(SELECT item FROM operations WHERE id=?) AND '
      'sequence<(SELECT sequence FROM operations WHERE id=?)',
      [owner, hole, operationRejected, id, id],
    );
  }

  Future<void> catalog(String owner, String work, Json data) async =>
      (await database)
          .insert('catalogs', {
            'owner': owner,
            'work': work,
            'payload': jsonEncode(data),
          }, conflictAlgorithm: ConflictAlgorithm.replace)
          .then((_) {});
  Future<Json?> readCatalog(String owner, String work) async {
    final rows = await (await database).query(
      'catalogs',
      where: 'owner=? AND work=?',
      whereArgs: [owner, work],
    );
    return rows.isEmpty
        ? null
        : jsonDecode(rows.first['payload'] as String) as Json;
  }

  Future<void> setting(String key, Json? value) async {
    final db = await database;
    if (value == null) {
      await db.delete('settings', where: 'key=?', whereArgs: [key]);
      return;
    }
    await db.insert('settings', {
      'key': key,
      'payload': jsonEncode(value),
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<Json?> readSetting(String key) async {
    final rows = await (await database).query(
      'settings',
      where: 'key=?',
      whereArgs: [key],
    );
    return rows.isEmpty
        ? null
        : jsonDecode(rows.first['payload'] as String) as Json;
  }

  Future<int> pendingCount(String owner) async =>
      Sqflite.firstIntValue(
        await (await database).rawQuery(
          'SELECT count(*) FROM operations WHERE owner=?',
          [owner],
        ),
      ) ??
      0;
  Future<void> close() async {
    if (_opening != null) await (await _opening!).close();
  }
}
