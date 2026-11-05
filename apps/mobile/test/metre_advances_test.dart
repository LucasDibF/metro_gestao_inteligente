import 'package:flutter_test/flutter_test.dart';
import 'package:metro_mobile/field/metre_advances.dart';

void main() {
  List<dynamic> parse(
    List<String> blows,
    List<String> penetrations, {
    bool interrupted = false,
  }) => parseAdvances(
    blows: blows,
    penetrations: penetrations,
    interrupted: interrupted,
  );

  test('converts centimetres, accepting a decimal comma', () {
    expect(parse(['3', '4', '5'], ['15', '15,5', '15.0']), [
      {'blows': 3, 'penetrationMm': 150},
      {'blows': 4, 'penetrationMm': 155},
      {'blows': 5, 'penetrationMm': 150},
    ]);
  });

  test('partial advances require an interruption', () {
    expect(() => parse(['3', '', ''], ['15', '', '']), throwsFormatException);
    expect(
      parse(['3', '', ''], ['15', '', ''], interrupted: true),
      hasLength(1),
    );
  });

  test('refuses skipped advances, fractions of blows and extra decimals', () {
    expect(
      () => parse(['3', '', '5'], ['15', '', '15'], interrupted: true),
      throwsFormatException,
    );
    expect(
      () => parse(['3.5', '4', '5'], ['15', '15', '15']),
      throwsFormatException,
    );
    expect(
      () => parse(['3', '4', '5'], ['15.55', '15', '15']),
      throwsFormatException,
    );
  });
}
