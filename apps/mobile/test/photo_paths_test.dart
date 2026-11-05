import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:metro_mobile/field/field_repository.dart';
import 'package:metro_mobile/field/field_store.dart';
import 'package:metro_mobile/field/field_store_schema.dart';
import 'package:metro_mobile/field/photo_paths.dart';
import 'package:metro_mobile/field/photo_recovery.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'field_queue_test.dart' show RefusingSession;

const _old =
    '/var/mobile/Containers/Data/Application/AAA/Library/Application Support/photos/company_op/uuid.jpg';
const _relative = 'photos/company_op/uuid.jpg';

/// The tables as version 2 of the app created them.
Future<void> _createVersion2(String file) async {
  final db = await databaseFactoryFfi.openDatabase(
    file,
    options: OpenDatabaseOptions(
      version: 2,
      onCreate: (db, _) async {
        await db.execute(
          'CREATE TABLE settings(key TEXT PRIMARY KEY, payload TEXT NOT NULL)',
        );
        await db.execute(
          'CREATE TABLE documents(owner TEXT NOT NULL, hole TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(owner,hole))',
        );
        await db.execute(
          'CREATE TABLE operations(sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, owner TEXT NOT NULL, hole TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, prepared TEXT)',
        );
        await db.execute(
          'CREATE INDEX operations_owner_hole ON operations(owner,hole,sequence)',
        );
        await db.execute(
          'CREATE TABLE catalogs(owner TEXT NOT NULL, work TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(owner,work))',
        );
      },
    ),
  );
  await db.insert('documents', {
    'owner': 'o',
    'hole': 'h',
    'payload': jsonEncode({
      'hole': {'id': 'h', 'reviewState': 'DRAFT'},
      'localPhotos': [
        {'path': _old, 'caption': '', 'purpose': 'SITE'},
      ],
    }),
  });
  await db.insert('documents', {
    'owner': 'o',
    'hole': 'quebrado',
    'payload': 'não é json',
  });
  await db.insert('operations', {
    'id': 'photo',
    'owner': 'o',
    'hole': 'h',
    'kind': 'PHOTO',
    'payload': jsonEncode({'path': _old, 'caption': '', 'purpose': 'SITE'}),
    'prepared': jsonEncode({
      'operationId': 'photo',
      'payload': {'path': _old},
    }),
  });
  await db.insert('operations', {
    'id': 'metre',
    'owner': 'o',
    'hole': 'h',
    'kind': 'METRE',
    'payload': jsonEncode({'depthM': '3'}),
    'prepared': jsonEncode({'operationId': 'metre', 'expected': 7}),
  });
  await db.insert('settings', {
    'key': 'camera',
    'payload': jsonEncode({'owner': 'o', 'hole': 'h', 'recoveredPath': _old}),
  });
  await db.close();
}

void main() {
  sqfliteFfiInit();
  late Directory dir;
  setUp(() async {
    dir = await Directory.systemTemp.createTemp('metro-photo-test');
  });
  tearDown(() => dir.delete(recursive: true));

  test('only the durable layout becomes relative', () {
    expect(relativePhotoPath(_old), _relative);
    expect(relativePhotoPath(_relative), _relative);
    expect(relativePhotoPath('/tmp/outra/foto.jpg'), '/tmp/outra/foto.jpg');
    expect(resolvePhotoPath('/novo', _relative), '/novo/$_relative');
    expect(resolvePhotoPath('/novo', '/tmp/a.jpg'), '/tmp/a.jpg');
  });

  test('the upgrade migrates paths and keeps the whole queue', () async {
    final file = '${dir.path}/field.db';
    await _createVersion2(file);
    final store = FieldStore(factory: databaseFactoryFfi, databasePath: file);
    final queue = await store.pending('o', 'h');
    expect(queue.map((o) => o['id']), ['photo', 'metre']);
    expect(queue.every((o) => o['status'] == 'pending'), isTrue);
    expect(queue[0]['item'], photoItem(_relative));
    expect(queue[1]['item'], metreItem(3));
    expect(jsonDecode(queue[0]['payload'] as String)['path'], _relative);
    expect(
      jsonDecode(queue[0]['prepared'] as String)['payload']['path'],
      _relative,
    );
    // A prepared request is sent as it was; the migration leaves it identical.
    expect(jsonDecode(queue[1]['prepared'] as String)['expected'], 7);
    final doc = await store.read('o', 'h');
    expect(doc!['localPhotos'].single['path'], _relative);
    expect((await store.readSetting('camera'))!['recoveredPath'], _relative);
    await store.close();
  });

  test('an unreadable row does not stop the upgrade', () async {
    final file = '${dir.path}/field.db';
    await _createVersion2(file);
    final store = FieldStore(factory: databaseFactoryFfi, databasePath: file);
    final db = await store.database;
    final rows = await db.query(
      'documents',
      where: 'hole=?',
      whereArgs: ['quebrado'],
    );
    expect(rows.single['payload'], 'não é json');
    expect(await db.getVersion(), fieldStoreVersion);
    await store.close();
  });

  test('photos survive the app folder moving between updates', () async {
    final firstRoot = Directory('${dir.path}/AAA')..createSync();
    final store = FieldStore(
      factory: databaseFactoryFfi,
      databasePath: '${dir.path}/field.db',
    );
    final session = RefusingSession();
    final repo = FieldRepository(
      session,
      store,
      photoRoot: () async => firstRoot.path,
    );
    final source = await File(
      '${dir.path}/picked.jpg',
    ).writeAsBytes([255, 216, 255, 0]);
    final durable = await durablePhoto(
      source.path,
      'company:op',
      root: () async => firstRoot.path,
    );
    expect(durable, startsWith(firstRoot.path));
    final doc = await repo.download('work', 'hole');
    await repo.savePhoto(doc, durable, '', 'SITE');
    final stored = (await store.read(repo.owner, 'hole'))!;
    final saved = stored['localPhotos'].single['path'] as String;
    expect(saved, startsWith('photos/'));

    // The update moved the container; nothing in the database has to change.
    final secondRoot = firstRoot.renameSync('${dir.path}/BBB');
    final updated = FieldRepository(
      session,
      store,
      photoRoot: () async => secondRoot.path,
    );
    expect(await updated.photoFile(saved), '${secondRoot.path}/$saved');
    await updated.sync('work', 'hole');
    expect(session.uploads.single, '${secondRoot.path}/$saved');
    expect(await File('${secondRoot.path}/$saved').exists(), isFalse);
    await store.close();
    session.api.close();
  });
}
