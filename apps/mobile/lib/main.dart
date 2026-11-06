import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'bootstrap.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    rootApp(
      configured: const String.fromEnvironment('API_BASE_URL'),
      release: kReleaseMode,
      android: Platform.isAndroid,
    ),
  );
}
