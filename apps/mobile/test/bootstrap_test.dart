import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:metro_mobile/app.dart';
import 'package:metro_mobile/bootstrap.dart';

void main() {
  Widget root(String configured, {bool release = true}) =>
      rootApp(configured: configured, release: release, android: true);

  test('release builds need an HTTPS address', () {
    expect(root(''), isA<ConfigurationErrorApp>());
    expect(root('http://api.exemplo.com/api/v1'), isA<ConfigurationErrorApp>());
    expect(root('https://api.exemplo.com/api/v1'), isA<MetroApp>());
  });

  test('an invalid address never throws before runApp', () {
    expect(
      root('endereço inválido', release: false),
      isA<ConfigurationErrorApp>(),
    );
    expect(root('ftp://api', release: false), isA<ConfigurationErrorApp>());
    expect(root('https://[', release: false), isA<ConfigurationErrorApp>());
  });

  test('development keeps its local defaults', () {
    expect(root('', release: false), isA<MetroApp>());
    expect(
      apiBaseUrl('', release: false, android: false),
      'http://127.0.0.1:3000/api/v1',
    );
    expect(
      apiBaseUrl('', release: false, android: true),
      'http://10.0.2.2:3000/api/v1',
    );
  });

  testWidgets('the error screen explains the configuration', (tester) async {
    await tester.pumpWidget(const ConfigurationErrorApp());
    expect(find.textContaining('API_BASE_URL'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
