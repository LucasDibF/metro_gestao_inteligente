import 'dart:io';
import 'package:integration_test/integration_test_driver_extended.dart';

Future<void> main() async => integrationDriver(
  onScreenshot: (name, bytes, [args]) async {
    await File('/tmp/metro-mobile-ui-$name.png').writeAsBytes(bytes);
    return true;
  },
);
