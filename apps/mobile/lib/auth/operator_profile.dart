/// The account answered online and is not an operator: never an offline case.
class OperatorRoleRequired extends FormatException {
  const OperatorRoleRequired()
    : super('Este aplicativo é exclusivo para o sondador.');
}

class OperatorProfile {
  const OperatorProfile({
    required this.userId,
    required this.tenantId,
    required this.company,
  });
  final String userId;
  final String tenantId;
  final String company;
  factory OperatorProfile.fromJson(Map<String, dynamic> json) {
    final roles = [json['role'], ...((json['additionalRoles'] as List?) ?? [])];
    if (!roles.contains('OPERATOR')) {
      throw const OperatorRoleRequired();
    }
    final tenant = json['tenant'] as Map<String, dynamic>;
    return OperatorProfile(
      userId: json['userId'] as String,
      tenantId: tenant['id'] as String,
      company: tenant['name'] as String,
    );
  }
  String get cacheKey => '$tenantId:$userId';
  Map<String, dynamic> toJson() => {
    'userId': userId,
    'role': 'OPERATOR',
    'tenant': {'id': tenantId, 'name': company},
  };
}
