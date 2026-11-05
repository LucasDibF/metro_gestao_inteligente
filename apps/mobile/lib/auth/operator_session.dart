import 'dart:convert';
import 'package:flutter/foundation.dart';
import '../core/api_client.dart';
import 'operator_profile.dart';
import 'session_store.dart';

class OperatorSession extends ChangeNotifier {
  OperatorSession(this.api, this.store);
  final ApiClient api;
  final SessionStore store;
  OperatorProfile? profile;
  String? _access;
  String? _refresh;
  DateTime? _offlineUntil;
  Future<void>? _refreshing;
  bool offline = false;
  bool get offlineReadAllowed =>
      _offlineUntil?.isAfter(DateTime.now()) ?? false;

  /// A 401, a lost operator role or an unreadable saved session ends it here. Anything
  /// else, like 5xx or 429, leaves the operator in the offline mode.
  Future<void> restore() async {
    final raw = await store.read();
    if (raw == null) return;
    final OperatorProfile cached;
    try {
      final saved = jsonDecode(raw) as Map<String, dynamic>;
      _refresh = saved['refreshToken'] as String;
      _offlineUntil = DateTime.parse(saved['offlineUntil'] as String);
      cached = OperatorProfile.fromJson(
        saved['profile'] as Map<String, dynamic>,
      );
    } catch (_) {
      await _clear();
      notifyListeners();
      return;
    }
    profile = cached;
    try {
      await _renew();
    } catch (failure) {
      final denied =
          failure is OperatorRoleRequired ||
          (failure is ApiFailure && failure.status == 401);
      if (denied || !DateTime.now().isBefore(_offlineUntil!)) {
        await _clear();
      } else {
        profile = cached;
        offline = true;
      }
    }
    notifyListeners();
  }

  Future<void> login({
    required String tenantId,
    required String email,
    required String password,
    String? mfaCode,
  }) async {
    final tokens = await api.request(
      'auth/login',
      method: 'POST',
      body: {
        'tenantId': tenantId.trim(),
        'email': email.trim(),
        'password': password,
        if (mfaCode != null && mfaCode.trim().isNotEmpty)
          'mfaCode': mfaCode.trim(),
      },
    );
    _access = tokens['accessToken'] as String;
    _refresh = tokens['refreshToken'] as String;
    _offlineUntil = DateTime.now().add(const Duration(days: 7));
    try {
      profile = OperatorProfile.fromJson(
        await api.request('auth/me', token: _access),
      );
      offline = false;
      await _persist();
    } catch (_) {
      try {
        await api.request(
          'auth/logout',
          method: 'POST',
          body: {'refreshToken': _refresh},
        );
      } catch (_) {}
      await _clear();
      rethrow;
    }
    notifyListeners();
  }

  Future<void> _persist() => store.write(
    jsonEncode({
      'refreshToken': _refresh,
      'offlineUntil': _offlineUntil!.toIso8601String(),
      'profile': profile!.toJson(),
    }),
  );
  Future<void> _renew() async {
    if (_refreshing != null) return _refreshing!;
    final pending = _renewOnce();
    _refreshing = pending;
    try {
      await pending;
    } finally {
      _refreshing = null;
    }
  }

  Future<void> _renewOnce() async {
    if (_refresh == null) throw const ApiFailure(401, 'Entre novamente.');
    final tokens = await api.request(
      'auth/refresh',
      method: 'POST',
      body: {'refreshToken': _refresh},
    );
    _access = tokens['accessToken'] as String;
    _refresh = tokens['refreshToken'] as String;
    // Persist the rotated token before another network operation can fail.
    if (profile != null) await _persist();
    profile = OperatorProfile.fromJson(
      await api.request('auth/me', token: _access),
    );
    offline = false;
    await _persist();
  }

  /// A struggling server keeps cached data reachable, as a lost connection does.
  Future<void> _ensureAccess() async {
    if (_access != null) return;
    try {
      await _renew();
    } on ApiFailure catch (failure) {
      if (failure.transient) throw const NetworkFailure();
      rethrow;
    }
  }

  /// A 403 denies one action; only a 401 means the session itself has ended.
  Future<void> _endIfUnauthorized(ApiFailure failure) async {
    if (failure.status != 401) return;
    await _clear();
    notifyListeners();
  }

  Future<Map<String, dynamic>> get(String route) => request(route);

  Future<Map<String, dynamic>> request(
    String route, {
    String method = 'GET',
    Map<String, dynamic>? body,
  }) async {
    try {
      await _ensureAccess();
      try {
        return await api.request(
          route,
          token: _access,
          method: method,
          body: body,
        );
      } on ApiFailure catch (error) {
        if (error.status != 401) rethrow;
        await _renew();
        return await api.request(
          route,
          token: _access,
          method: method,
          body: body,
        );
      }
    } on ApiFailure catch (error) {
      await _endIfUnauthorized(error);
      rethrow;
    }
  }

  Future<Map<String, dynamic>> upload(
    String route,
    String filePath,
    Map<String, String> fields,
  ) async {
    try {
      await _ensureAccess();
      try {
        return await api.upload(route, filePath, fields, token: _access);
      } on ApiFailure catch (error) {
        if (error.status != 401) rethrow;
        await _renew();
        return await api.upload(route, filePath, fields, token: _access);
      }
    } on ApiFailure catch (error) {
      await _endIfUnauthorized(error);
      rethrow;
    }
  }

  Future<Uint8List> bytes(String route) async {
    await _ensureAccess();
    try {
      return await api.bytes(route, token: _access!);
    } on ApiFailure catch (e) {
      if (e.status != 401) rethrow;
      await _renew();
      return api.bytes(route, token: _access!);
    }
  }

  Future<void> logout() async {
    try {
      if (_refresh != null) {
        await api.request(
          'auth/logout',
          method: 'POST',
          body: {'refreshToken': _refresh},
        );
      }
    } catch (_) {} // Local sign-out must remain available offline.
    await _clear();
    notifyListeners();
  }

  Future<void> _clear() async {
    profile = null;
    _access = null;
    _refresh = null;
    _offlineUntil = null;
    offline = false;
    await store.clear();
  }
}
