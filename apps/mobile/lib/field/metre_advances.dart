import 'field_store.dart';

/// Advances recorded per metre of SPT.
const advanceCount = 3;

/// Converts the typed advances; throws [FormatException] with the field message.
List<Json> parseAdvances({
  required List<String> blows,
  required List<String> penetrations,
  required bool interrupted,
}) {
  final advances = <Json>[];
  var ended = false;
  for (var i = 0; i < advanceCount; i++) {
    final typedBlows = blows[i].trim();
    final typedPenetration = penetrations[i].trim().replaceAll(',', '.');
    if (typedBlows.isEmpty && typedPenetration.isEmpty) {
      ended = true;
      continue;
    }
    final count = int.tryParse(typedBlows);
    final centimetres = double.tryParse(typedPenetration);
    if (ended ||
        count == null ||
        centimetres == null ||
        count < 0 ||
        centimetres < 0 ||
        ((centimetres * 10) - (centimetres * 10).round()).abs() > 0.001) {
      throw const FormatException(
        'Preencha golpes inteiros e penetração em cm, sem pular avanços. Use até uma casa decimal nos cm.',
      );
    }
    advances.add({'blows': count, 'penetrationMm': (centimetres * 10).round()});
  }
  if (advances.isEmpty || (advances.length < advanceCount && !interrupted)) {
    throw const FormatException(
      'Preencha os avanços executados. Se parou antes do terceiro, informe a interrupção.',
    );
  }
  return advances;
}
