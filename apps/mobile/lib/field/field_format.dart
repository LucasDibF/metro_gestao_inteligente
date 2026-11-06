import '../core/api_client.dart';

String fieldNumber(Object? value) {
  if (value == null) return 'Não informado';
  final number = num.tryParse('$value');
  final text = number == null
      ? '$value'
      : number == number.roundToDouble()
      ? '${number.toInt()}'
      : '$number';
  return text.replaceAll('.', ',');
}

String fieldDate(Object? value) {
  if (value == null || '$value'.isEmpty) return 'Não informada';
  final date = DateTime.tryParse('$value');
  return date == null
      ? '$value'
      : '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
}

/// "1 furo" or "N furos", with the noun agreeing with the count.
String holeCount(int count) => count == 1 ? '1 furo' : '$count furos';

/// How many holes the device can open without connection.
String holesOnDevice(int count) =>
    '${holeCount(count)} ${count == 1 ? 'disponível' : 'disponíveis'} no aparelho.';

/// Text for the operator, without the runtime's exception prefixes.
String fieldErrorMessage(Object error) => error is NetworkFailure
    ? 'Sem conexão. Baixe o furo enquanto estiver online para poder executar sem internet.'
    : error is ApiFailure
    ? error.message
    : error.toString().replaceFirst('Bad state: ', '');
