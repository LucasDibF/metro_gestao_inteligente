import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'auth/login_screen.dart';
import 'auth/operator_session.dart';
import 'works/work_repository.dart';
import 'works/works_screen.dart';
import 'ui/metro_theme.dart';
import 'ui/metro_widgets.dart';

/// Largest system text size the layouts are verified against.
const metroMaxTextScale = 2.0;

class MetroApp extends StatefulWidget {
  const MetroApp({super.key, required this.session, required this.cache});
  final OperatorSession session;
  final WorkCache cache;
  @override
  State<MetroApp> createState() => _MetroAppState();
}

class _MetroAppState extends State<MetroApp> {
  final _navigator = GlobalKey<NavigatorState>();
  bool _starting = true;
  String? _error;
  @override
  void initState() {
    super.initState();
    widget.session.addListener(_sessionChanged);
    _start();
  }

  void _sessionChanged() {
    if (widget.session.profile == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          _navigator.currentState?.popUntil((route) => route.isFirst);
        }
      });
    }
  }

  @override
  void dispose() {
    widget.session.removeListener(_sessionChanged);
    super.dispose();
  }

  Future<void> _start() async {
    setState(() {
      _starting = true;
      _error = null;
    });
    try {
      await widget.session.restore();
    } catch (_) {
      _error = 'Não foi possível recuperar o acesso neste aparelho.';
    }
    if (mounted) setState(() => _starting = false);
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Metro · Campo',
    navigatorKey: _navigator,
    locale: const Locale('pt', 'BR'),
    supportedLocales: const [Locale('pt', 'BR')],
    localizationsDelegates: GlobalMaterialLocalizations.delegates,
    debugShowCheckedModeBanner: false,
    theme: metroTheme(),
    darkTheme: metroTheme(brightness: Brightness.dark),
    themeMode: ThemeMode.system,
    // Layouts are verified up to 200%; the system may offer larger sizes.
    builder: (context, child) => MediaQuery.withClampedTextScaling(
      maxScaleFactor: metroMaxTextScale,
      child: child!,
    ),
    home: ListenableBuilder(
      listenable: widget.session,
      builder: (context, child) {
        if (_starting) {
          return const Scaffold(body: MetroLoading());
        }
        if (_error != null) {
          return Scaffold(
            body: MetroStateView(
              icon: Icons.error_outline,
              message: _error!,
              actionLabel: 'Tentar novamente',
              onAction: _start,
            ),
          );
        }
        if (widget.session.profile == null) {
          return LoginScreen(session: widget.session);
        }
        return WorksScreen(
          key: ValueKey(widget.session.profile!.cacheKey),
          session: widget.session,
          repository: WorkRepository(widget.session, widget.cache),
        );
      },
    ),
  );
}
