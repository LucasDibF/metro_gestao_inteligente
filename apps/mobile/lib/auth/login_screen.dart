import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../ui/metro_layout.dart';
import '../ui/metro_theme.dart';
import '../ui/metro_widgets.dart';
import 'operator_session.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.session});
  final OperatorSession session;
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _company = TextEditingController(),
      _email = TextEditingController(),
      _password = TextEditingController(),
      _mfa = TextEditingController();
  bool _busy = false;
  String? _error;
  @override
  void dispose() {
    for (final c in [_company, _email, _password, _mfa]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _login() async {
    if (!_form.currentState!.validate() || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.session.login(
        tenantId: _company.text,
        email: _email.text,
        password: _password.text,
        mfaCode: _mfa.text,
      );
    } on NetworkFailure {
      if (mounted) {
        setState(
          () => _error = 'Sem conexão. O primeiro acesso precisa de internet.',
        );
      }
    } on ApiFailure catch (e) {
      if (mounted) setState(() => _error = e.message);
    } on FormatException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Não foi possível entrar. Tente novamente.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _intro(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'metro',
          style: text.displaySmall?.copyWith(color: MetroColors.brand),
        ),
        const SizedBox(height: MetroSpace.lg),
        Semantics(
          header: true,
          child: Text('Acesso do sondador', style: text.headlineSmall),
        ),
        const SizedBox(height: MetroSpace.xs),
        Text(
          'Entre para consultar as obras atribuídas a você.',
          style: text.bodyLarge?.copyWith(color: MetroColors.muted),
        ),
      ],
    );
  }

  Widget _fields(BuildContext context) => AutofillGroup(
    child: Form(
      key: _form,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: MetroSpace.lg,
        children: [
          MetroField(
            label: 'ID da empresa',
            child: TextFormField(
              controller: _company,
              enabled: !_busy,
              autocorrect: false,
              textInputAction: TextInputAction.next,
              validator: (v) =>
                  v == null || !RegExp(r'^[0-9a-fA-F-]{36}$').hasMatch(v.trim())
                  ? 'Informe o ID da empresa.'
                  : null,
            ),
          ),
          MetroField(
            label: 'E-mail',
            child: TextFormField(
              controller: _email,
              enabled: !_busy,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.username],
              autocorrect: false,
              textInputAction: TextInputAction.next,
              validator: (v) =>
                  v == null || !v.contains('@') ? 'Informe seu e-mail.' : null,
            ),
          ),
          MetroField(
            label: 'Senha',
            child: TextFormField(
              controller: _password,
              enabled: !_busy,
              obscureText: true,
              autofillHints: const [AutofillHints.password],
              textInputAction: TextInputAction.next,
              validator: (v) =>
                  v == null || v.isEmpty ? 'Informe sua senha.' : null,
            ),
          ),
          MetroField(
            label: 'Código MFA, se habilitado',
            child: TextFormField(
              controller: _mfa,
              enabled: !_busy,
              autocorrect: false,
              textInputAction: TextInputAction.done,
              onFieldSubmitted: (_) => _login(),
            ),
          ),
          const SizedBox(height: MetroSpace.xs),
          MetroFormAction(
            error: _error,
            button: FilledButton(
              onPressed: _busy ? null : _login,
              child: _busy
                  ? const SizedBox.square(
                      dimension: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: MetroColors.muted,
                      ),
                    )
                  : const Text('Entrar'),
            ),
          ),
        ],
      ),
    ),
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: LayoutBuilder(
        builder: (context, constraints) {
          final wide = constraints.maxWidth >= metroRailBreakpoint;
          final short = constraints.maxHeight < 560;
          final padding = EdgeInsets.all(metroGutter(constraints.maxWidth));
          // Landscape puts the identity beside the form so fields stay on top.
          final content = wide && short
              ? Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: MetroSpace.xxl,
                  children: [
                    Expanded(child: _intro(context)),
                    Expanded(child: _fields(context)),
                  ],
                )
              : ConstrainedBox(
                  constraints: const BoxConstraints(
                    maxWidth: MetroWidth.compactPane,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    spacing: MetroSpace.xl,
                    children: [_intro(context), _fields(context)],
                  ),
                );
          return Center(
            child: SingleChildScrollView(
              padding: padding,
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              child: wide && !short
                  ? MetroPanel(
                      padding: const EdgeInsets.all(MetroSpace.xl),
                      child: content,
                    )
                  : content,
            ),
          );
        },
      ),
    ),
  );
}
