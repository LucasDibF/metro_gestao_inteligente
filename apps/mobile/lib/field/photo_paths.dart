import 'package:path/path.dart' as path;
import 'package:path_provider/path_provider.dart';

/// Base folder of durable photos. iOS changes its absolute value on updates.
Future<String> applicationPhotoRoot() async =>
    (await getApplicationSupportDirectory()).path;

/// Durable photos live at `photos/<owner>/<file>`, below the application root.
/// Paths outside that layout stay as they are, so no reference is invented.
String relativePhotoPath(String stored) {
  if (!path.isAbsolute(stored)) return stored;
  final parts = path.split(stored);
  final photos = parts.length - 3;
  return photos > 0 && parts[photos] == 'photos'
      ? path.joinAll(parts.sublist(photos))
      : stored;
}

String resolvePhotoPath(String root, String stored) =>
    path.isAbsolute(stored) ? stored : path.join(root, stored);
