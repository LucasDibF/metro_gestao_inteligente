class FieldConflict implements Exception {
  const FieldConflict();
  @override
  String toString() =>
      'O furo mudou no servidor. Sua cópia local está preservada. Confira com o engenheiro antes de continuar.';
}

/// The server refused queued data for good; the operator has to correct it.
class FieldRejected implements Exception {
  const FieldRejected(this.message);
  final String message;
  @override
  String toString() => message;
}
