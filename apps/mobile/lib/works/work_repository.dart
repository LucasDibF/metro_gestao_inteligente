import 'dart:convert';
import 'package:path/path.dart' as path;
import 'package:sqflite/sqflite.dart';
import '../auth/operator_session.dart';
import '../core/api_client.dart';

class AssignedWork {
  const AssignedWork({
    required this.id,
    required this.name,
    required this.location,
  });
  final String id, name, location;
  factory AssignedWork.fromJson(Map<String, dynamic> json) => AssignedWork(
    id: json['id'] as String,
    name: json['name'] as String,
    location: [
      json['city'],
      json['state'],
    ].whereType<String>().where((s) => s.isNotEmpty).join(' · '),
  );
}

class WorkList {
  const WorkList(this.items, {required this.cached});
  final List<AssignedWork> items;
  final bool cached;
}

abstract interface class WorkCache {
  Future<List<Map<String, dynamic>>?> read(String owner);
  Future<void> write(String owner, List<Map<String, dynamic>> works);
}

class SqliteWorkCache implements WorkCache {
  Future<Database>? _opening;
  Future<Database> get _db => _opening ??= _open();
  Future<Database> _open() async => openDatabase(
    path.join(await getDatabasesPath(), 'metro-field.db'),
    version: 1,
    onCreate: (db, version) => db.execute(
      'CREATE TABLE assigned_works (owner TEXT PRIMARY KEY, payload TEXT NOT NULL)',
    ),
  );
  @override
  Future<List<Map<String, dynamic>>?> read(String owner) async {
    final rows = await (await _db).query(
      'assigned_works',
      where: 'owner = ?',
      whereArgs: [owner],
    );
    return rows.isEmpty
        ? null
        : (jsonDecode(rows.first['payload'] as String) as List)
              .cast<Map<String, dynamic>>();
  }

  @override
  Future<void> write(String owner, List<Map<String, dynamic>> works) async {
    await (await _db).insert('assigned_works', {
      'owner': owner,
      'payload': jsonEncode(works),
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }
}

class WorkRepository {
  WorkRepository(this.session, this.cache);
  final OperatorSession session;
  final WorkCache cache;
  Future<WorkList> load() async {
    final owner = session.profile!.cacheKey;
    try {
      final works = <Map<String, dynamic>>[];
      var page = 1;
      while (true) {
        final response = await session.get('mobile/obras?page=$page');
        final items = (response['items'] as List).cast<Map<String, dynamic>>();
        works.addAll(items);
        final total = response['total'] as int;
        if (works.length >= total || items.isEmpty) break;
        page++;
      }
      await cache.write(owner, works);
      return WorkList(works.map(AssignedWork.fromJson).toList(), cached: false);
    } on Exception catch (failure) {
      if (!allowsOfflineRead(failure) || !session.offlineReadAllowed) rethrow;
      final works = await cache.read(owner);
      if (works == null) rethrow;
      return WorkList(works.map(AssignedWork.fromJson).toList(), cached: true);
    }
  }
}
