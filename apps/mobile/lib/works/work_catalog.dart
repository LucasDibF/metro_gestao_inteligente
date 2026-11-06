import '../auth/operator_session.dart';
import '../core/api_client.dart';
import '../field/field_store.dart';

/// Folders, each with its holes, followed by the holes outside any folder.
class WorkCatalog {
  const WorkCatalog(this.rows, {required this.cached});
  final List<Json> rows;

  /// Read from the copy saved on this device because the server did not answer.
  final bool cached;
}

/// Loads the catalog of an assigned work and keeps a copy for offline reading.
class WorkCatalogRepository {
  WorkCatalogRepository(this.session, this.store);
  final OperatorSession session;
  final FieldStore store;

  Future<WorkCatalog> load(String workId) async {
    try {
      final folders = await _pages(workId, 'pastas');
      final holes = await _pages(workId, 'furos');
      final rows = <Json>[
        for (final folder in folders)
          {
            ...folder,
            'children': holes
                .where((h) => h['folderId'] == folder['id'])
                .toList(),
          },
        ...holes.where((h) => h['folderId'] == null),
      ];
      final profile = session.profile;
      if (profile != null) {
        await store.catalog(profile.cacheKey, workId, {'rows': rows});
      }
      return WorkCatalog(rows, cached: false);
    } on Exception catch (failure) {
      if (!allowsOfflineRead(failure) || !session.offlineReadAllowed) rethrow;
      final saved = await store.readCatalog(session.profile!.cacheKey, workId);
      if (saved == null) rethrow;
      return WorkCatalog((saved['rows'] as List).cast<Json>(), cached: true);
    }
  }

  Future<List<Json>> _pages(String workId, String resource) async {
    final rows = <Json>[];
    for (var page = 1; ; page++) {
      final result = await session.get(
        'mobile/obras/$workId/$resource?page=$page',
      );
      final items = (result['items'] as List).cast<Json>();
      rows.addAll(items);
      if (items.isEmpty || rows.length >= (result['total'] as int)) return rows;
    }
  }
}
