import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

class ApiFailure implements Exception {
  const ApiFailure(this.status, this.message, {this.code});
  final int status;
  final String message;
  final String? code;

  /// The server is struggling; its answer says nothing about the session.
  bool get transient => status >= 500 || status == 429;
  @override
  String toString() => message;
}

class NetworkFailure implements Exception {
  const NetworkFailure();
}

class ApiClient {
  ApiClient({required this.baseUri, http.Client? transport})
    : _transport = transport ?? http.Client() {
    if (!['http', 'https'].contains(baseUri.scheme) ||
        baseUri.host.isEmpty ||
        baseUri.userInfo.isNotEmpty ||
        baseUri.hasQuery ||
        baseUri.hasFragment ||
        (kReleaseMode && baseUri.scheme != 'https')) {
      throw ArgumentError('Endereço da API inválido. Em produção, use HTTPS.');
    }
  }
  final Uri baseUri;
  final http.Client _transport;
  Uri _uri(String route) =>
      Uri.parse('${baseUri.toString().replaceFirst(RegExp(r'/$'), '')}/$route');

  Future<Map<String, dynamic>> request(
    String route, {
    String method = 'GET',
    String? token,
    Map<String, dynamic>? body,
  }) async {
    try {
      final response = await _transport
          .send(
            http.Request(method, _uri(route))
              ..headers.addAll({
                'Accept': 'application/json',
                if (body != null) 'Content-Type': 'application/json',
                if (token != null) 'Authorization': 'Bearer $token',
              })
              ..body = body == null ? '' : jsonEncode(body),
          )
          .timeout(const Duration(seconds: 20));
      final text = await response.stream.bytesToString().timeout(
        const Duration(seconds: 20),
      );
      return _decode(response.statusCode, text);
    } on IOException {
      throw const NetworkFailure();
    } on http.ClientException {
      throw const NetworkFailure();
    } on TimeoutException {
      throw const NetworkFailure();
    }
  }

  Future<Map<String, dynamic>> upload(
    String route,
    String filePath,
    Map<String, String> fields, {
    String? token,
  }) async {
    // Read before the guarded section: a local file error is not a network one.
    final file = await http.MultipartFile.fromPath('file', filePath);
    try {
      final request = http.MultipartRequest('POST', _uri(route))
        ..headers['Accept'] = 'application/json'
        ..headers['Authorization'] = 'Bearer $token'
        ..fields.addAll(fields)
        ..files.add(file);
      final response = await _transport
          .send(request)
          .timeout(const Duration(seconds: 60));
      final text = await response.stream.bytesToString().timeout(
        const Duration(seconds: 60),
      );
      return _decode(response.statusCode, text);
    } on IOException {
      throw const NetworkFailure();
    } on http.ClientException {
      throw const NetworkFailure();
    } on TimeoutException {
      throw const NetworkFailure();
    }
  }

  Map<String, dynamic> _decode(int status, String text) {
    if (status < 200 || status >= 300) {
      String? code, reason;
      try {
        final body = jsonDecode(text) as Map<String, dynamic>;
        code = body['code'] as String?;
        final raw = body['message'];
        reason = raw is List ? raw.join(' ') : raw as String?;
      } catch (_) {}
      // Review failures repeat the code as their message: not a readable reason.
      final explained = reason != null && reason != code ? reason : null;
      final message = switch (code) {
        'FIELD_EXECUTION_LOCKED' =>
          'A execução de campo está bloqueada ou indisponível para este perfil.',
        'SOIL_DESCRIPTION_REQUIRED' =>
          'Descreva o solo dos metros registrados.',
        'SPT_DEPTH_EXISTS' => 'Já existe um registro nesta profundidade.',
        'EXECUTED_DEPTH_INVALID' =>
          'Informe uma profundidade executada válida.',
        'FIELD_DATE_INVALID' => 'Informe uma data de campo válida.',
        'FIELD_DATE_REQUIRED' => 'Preencha a data de campo antes de enviar.',
        'EXECUTED_DEPTH_REQUIRED' => 'Informe a profundidade executada.',
        'SPT_REQUIRED' => 'Registre os metros do furo.',
        'SOIL_PROFILE_GAP' =>
          'Confira o solo: existem lacunas até a profundidade final.',
        'SPT_READINGS_INCOMPLETE' =>
          'Complete os avanços ou informe o motivo da interrupção.',
        'SPT_METRES_MISSING' =>
          'Há metros sem registro até a profundidade executada.',
        'SPT_DEPTH_OUTSIDE' || 'EXECUTED_DEPTH_EXCLUDES_DATA' =>
          'A profundidade executada não pode excluir metros registrados.',
        'WATER_LEVEL_BELOW_DEPTH' =>
          'O nível d’água não pode ultrapassar a profundidade executada.',
        _ =>
          status == 401
              ? 'Acesso não autorizado. Entre novamente.'
              : status == 403
              ? explained ?? 'Este acesso não está disponível para seu perfil.'
              : status == 409
              ? 'Os dados foram alterados. Sua cópia local foi preservada para conferência.'
              : status == 404
              ? 'A obra ou o furo não está mais disponível para seu acesso.'
              : status == 429
              ? 'Muitas solicitações. Aguarde um momento antes de sincronizar novamente.'
              : (status == 400 || status == 422) && explained != null
              ? explained
              : 'Não foi possível concluir a solicitação. Confira os campos e tente novamente.',
      };
      throw ApiFailure(status, message, code: code);
    }
    final decoded = jsonDecode(text);
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('Invalid response');
    }
    return decoded;
  }

  Future<Uint8List> bytes(String route, {required String token}) async {
    try {
      final response = await _transport
          .get(_uri(route), headers: {'Authorization': 'Bearer $token'})
          .timeout(const Duration(seconds: 30));
      if (response.statusCode != 200) {
        _decode(response.statusCode, response.body);
      }
      return response.bodyBytes;
    } on IOException {
      throw const NetworkFailure();
    } on http.ClientException {
      throw const NetworkFailure();
    } on TimeoutException {
      throw const NetworkFailure();
    }
  }

  void close() => _transport.close();
}
