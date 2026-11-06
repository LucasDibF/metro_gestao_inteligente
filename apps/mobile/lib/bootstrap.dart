import 'package:flutter/material.dart';
import 'app.dart';
import 'auth/operator_session.dart';
import 'auth/session_store.dart';
import 'core/api_client.dart';
import 'ui/metro_theme.dart';
import 'ui/metro_widgets.dart';
import 'works/work_repository.dart';

/// Address of the API, or null when this build cannot reach one. The local
/// defaults exist only for development.
String? apiBaseUrl(
  String configured, {
  required bool release,
  required bool android,
}) {
  if (configured.isEmpty) {
    if (release) return null;
    return android
        ? 'http://10.0.2.2:3000/api/v1'
        : 'http://127.0.0.1:3000/api/v1';
  }
  return release && !configured.startsWith('https://') ? null : configured;
}

/// Never throws: a bad build configuration becomes a screen, not a crash
/// before the first frame.
Widget rootApp({
  required String configured,
  required bool release,
  required bool android,
}) {
  final url = apiBaseUrl(configured, release: release, android: android);
  if (url == null) return const ConfigurationErrorApp();
  final ApiClient api;
  try {
    api = ApiClient(baseUri: Uri.parse(url));
  } on ArgumentError {
    return const ConfigurationErrorApp();
  } on FormatException {
    return const ConfigurationErrorApp();
  }
  return MetroApp(
    session: OperatorSession(api, const SecureSessionStore()),
    cache: SqliteWorkCache(),
  );
}

class ConfigurationErrorApp extends StatelessWidget {
  const ConfigurationErrorApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Metro · Campo',
    debugShowCheckedModeBanner: false,
    theme: metroTheme(),
    darkTheme: metroTheme(brightness: Brightness.dark),
    themeMode: ThemeMode.system,
    builder: (context, child) => MediaQuery.withClampedTextScaling(
      maxScaleFactor: metroMaxTextScale,
      child: child!,
    ),
    home: const Scaffold(
      body: MetroStateView(
        icon: Icons.settings_outlined,
        message:
            'Este aplicativo foi gerado sem um endereço válido da API. Avise o responsável pela instalação. Para corrigir, gere o aplicativo novamente com --dart-define=API_BASE_URL=https://endereço/api/v1.',
      ),
    ),
  );
}
