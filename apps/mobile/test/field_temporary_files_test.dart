import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:metro_mobile/field/field_export.dart';
import 'package:metro_mobile/field/photo_capture.dart';
import 'package:share_plus/share_plus.dart';
import 'support/field_fixtures.dart';

class _Picker extends ImagePicker {
  _Picker(this.paths);
  final List<String> paths;
  @override
  Future<XFile?> pickImage({
    required ImageSource source,
    double? maxWidth,
    double? maxHeight,
    int? imageQuality,
    CameraDevice preferredCameraDevice = CameraDevice.rear,
    bool requestFullMetadata = true,
  }) async => XFile(paths.removeAt(0));
}

void main() {
  late Directory dir;
  setUp(() {
    dir = Directory.systemTemp.createTempSync('metro-temp-test');
  });
  tearDown(() => dir.deleteSync(recursive: true));

  File temporary(String name) =>
      File('${dir.path}/$name')..writeAsBytesSync([255, 216, 255, 0]);

  Future<void> settle(WidgetTester tester) async {
    for (var i = 0; i < 5; i++) {
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 30)),
      );
      await tester.pump();
    }
  }

  Future<PhotoCapture> capture(
    List<String> picks, {
    required Future<void> Function(String, String, String) onSave,
  }) async => PhotoCapture(
    owner: 'owner',
    holeId: 'hole',
    store: memoryStore(),
    picker: _Picker(picks),
    onSave: onSave,
    makeDurable: (source, owner) async =>
        (await File(source).copy('${dir.path}/durable.jpg')).path,
  );

  testWidgets('the picked copy goes after the durable one is saved', (
    tester,
  ) async {
    final picked = temporary('picked.jpg');
    final saved = <String>[];
    final widget = await capture([
      picked.path,
    ], onSave: (path, _, _) async => saved.add(path));
    await tester.pumpWidget(
      screenApp(Navigator(onGenerateRoute: (_) => _route(widget))),
    );
    await tester.tap(find.text('Tirar foto'));
    await settle(tester);
    await tester.tap(find.text('Salvar fotografia no aparelho'));
    await settle(tester);
    expect(saved.single, endsWith('durable.jpg'));
    expect(picked.existsSync(), isFalse);
    expect(File(saved.single).existsSync(), isTrue);
    await tester.pumpWidget(const SizedBox());
    await widget.store.close();
  });

  testWidgets('choosing again or leaving discards what was picked', (
    tester,
  ) async {
    final first = temporary('first.jpg');
    final second = temporary('second.jpg');
    final widget = await capture([
      first.path,
      second.path,
    ], onSave: (_, _, _) async {});
    await tester.pumpWidget(screenApp(widget));
    await tester.tap(find.text('Tirar foto'));
    await settle(tester);
    expect(first.existsSync(), isTrue);
    await tester.tap(find.text('Galeria'));
    await settle(tester);
    expect(first.existsSync(), isFalse);
    expect(second.existsSync(), isTrue);
    await tester.pumpWidget(const SizedBox());
    await settle(tester);
    expect(second.existsSync(), isFalse);
    await widget.store.close();
  });

  testWidgets('a failed save keeps the picked copy for another try', (
    tester,
  ) async {
    final picked = temporary('picked.jpg');
    final widget = await capture([
      picked.path,
    ], onSave: (_, _, _) async => throw StateError('sem espaço'));
    await tester.pumpWidget(screenApp(widget));
    await tester.tap(find.text('Tirar foto'));
    await settle(tester);
    await tester.tap(find.text('Salvar fotografia no aparelho'));
    await settle(tester);
    expect(find.textContaining('Não foi possível salvar'), findsOneWidget);
    expect(picked.existsSync(), isTrue);
    await tester.pumpWidget(const SizedBox(), duration: Duration.zero);
    await settle(tester);
    await widget.store.close();
  });

  group('cópia de campo', () {
    Future<(bool, List<String>)> export({Object? failure}) async {
      final store = memoryStore();
      final repo = await repositoryWith(holeDocument(empty: true), store);
      var folderExisted = false;
      final shared = <String>[];
      try {
        await exportFieldCopy(
          repo,
          'hole',
          Rect.zero,
          temporaryFolder: () async => dir,
          share: (ShareParams params) async {
            folderExisted = Directory(
              '${dir.path}/metro-export-hole',
            ).existsSync();
            shared.addAll(params.files!.map((f) => f.path));
            if (failure != null) throw failure;
          },
        );
      } finally {
        await store.close();
      }
      return (folderExisted, shared);
    }

    test('the export folder is gone after sharing', () async {
      final (existed, shared) = await export();
      expect(existed, isTrue);
      expect(shared.single, endsWith('copia-campo.json'));
      expect(Directory('${dir.path}/metro-export-hole').existsSync(), isFalse);
    });
    test('and also when sharing fails', () async {
      await expectLater(export(failure: StateError('x')), throwsStateError);
      expect(Directory('${dir.path}/metro-export-hole').existsSync(), isFalse);
    });
  });
}

Route<void> _route(Widget page) =>
    MaterialPageRoute<void>(builder: (_) => page);
