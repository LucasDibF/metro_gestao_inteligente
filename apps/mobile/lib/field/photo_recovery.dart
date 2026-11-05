import 'dart:io';
import 'package:image_picker/image_picker.dart';
import 'package:path/path.dart' as path;
import 'package:uuid/uuid.dart';
import 'field_repository.dart';
import 'photo_paths.dart';

/// Copies [source] to private storage and returns its absolute path; what is
/// recorded in the database is the path relative to [root].
Future<String> durablePhoto(
  String source,
  String owner, {
  Future<String> Function() root = applicationPhotoRoot,
}) async {
  final file = File(source);
  if (await file.length() > 8 * 1024 * 1024) {
    throw StateError('A fotografia deve ter no máximo 8 MB.');
  }
  final header = await file.open();
  late List<int> bytes;
  try {
    bytes = await header.read(8);
  } finally {
    await header.close();
  }
  final jpeg =
      bytes.length >= 3 &&
      bytes[0] == 255 &&
      bytes[1] == 216 &&
      bytes[2] == 255;
  final png =
      bytes.length == 8 && bytes.join(',') == '137,80,78,71,13,10,26,10';
  if (!jpeg && !png) throw StateError('Selecione uma fotografia JPEG ou PNG.');
  final directory = Directory(
    path.join(await root(), 'photos', owner.replaceAll(':', '_')),
  );
  await directory.create(recursive: true);
  return (await file.copy(
    path.join(directory.path, '${const Uuid().v4()}.${jpeg ? 'jpg' : 'png'}'),
  )).path;
}

/// Android can destroy the activity while its system camera is open.
Future<bool> recoverCameraPhoto(FieldRepository repo) async {
  if (!Platform.isAndroid) return false;
  final context = await repo.store.readSetting('camera');
  final lost = await ImagePicker().retrieveLostData();
  if (context == null) return false;
  if (lost.files?.isNotEmpty ?? false) {
    final file = await durablePhoto(
      lost.files!.first.path,
      context['owner'] as String,
    );
    context['recoveredPath'] = relativePhotoPath(file);
    await repo.store.setting('camera', context);
    try {
      await File(lost.files!.first.path).delete();
    } on FileSystemException {
      // A leftover temporary file does not invalidate the recovered copy.
    }
  }
  if (context['owner'] != repo.owner || context['recoveredPath'] == null) {
    return false;
  }
  final doc = await repo.store.read(repo.owner, context['hole'] as String);
  if (doc == null || doc['hole']['reviewState'] != 'DRAFT') return false;
  await repo.savePhoto(doc, context['recoveredPath'] as String, '', 'OTHER');
  await repo.store.setting('camera', null);
  return true;
}
