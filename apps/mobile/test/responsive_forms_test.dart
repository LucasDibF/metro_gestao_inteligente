import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:metro_mobile/field/coordinate_form.dart';
import 'package:metro_mobile/field/field_forms.dart';
import 'package:metro_mobile/field/metre_editor.dart';
import 'package:metro_mobile/field/photo_capture.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'support/field_fixtures.dart';
import 'support/screen_checks.dart';

class _DeniedCamera extends ImagePicker {
  @override
  Future<XFile?> pickImage({
    required ImageSource source,
    double? maxWidth,
    double? maxHeight,
    int? imageQuality,
    CameraDevice preferredCameraDevice = CameraDevice.rear,
    bool requestFullMetadata = true,
  }) async => throw StateError('camera_access_denied');
}

void main() {
  sqfliteFfiInit();
  setUpAll(() async {
    if (capturing) await loadCaptureFonts();
  });
  final font = screenFont;

  for (final viewport in viewports) {
    for (final scale in textScales) {
      final label = '${viewport.name} a ${(scale * 100).round()}%';

      testWidgets('editor de metro · $label', (tester) async {
        applyViewport(tester, viewport, textScale: scale);
        final semantics = tester.ensureSemantics();
        await tester.pumpWidget(
          screenApp(
            MetreEditor(depth: 1, onSave: (_) async {}),
            fontFamily: font,
          ),
        );
        await tester.pumpAndSettle();
        await checkScreen(tester, 'editor-primeiro-metro', viewport, scale);
        await tester.pumpWidget(
          screenApp(
            MetreEditor(
              key: const ValueKey('spt'),
              depth: 2,
              previousSoil: const {'soilType': 'Areia fina'},
              record: metreRecord(2, interrupted: true),
              onSave: (_) async {},
            ),
            fontFamily: font,
          ),
        );
        await tester.pumpAndSettle();
        await checkScreen(tester, 'editor-spt', viewport, scale);
        semantics.dispose();
      });

      testWidgets('formulários de campo · $label', (tester) async {
        applyViewport(tester, viewport, textScale: scale);
        final semantics = tester.ensureSemantics();
        await tester.pumpWidget(
          screenApp(
            FieldForm(hole: const {}, onSave: (_) async {}),
            fontFamily: font,
          ),
        );
        await tester.pumpAndSettle();
        await reveal(tester, find.text('Salvar no aparelho'));
        await tester.tap(find.text('Salvar no aparelho'));
        await tester.pumpAndSettle();
        await checkScreen(
          tester,
          'form-campo',
          viewport,
          scale,
          guidelines: false,
        );
        await tester.pumpWidget(
          screenApp(
            CoordinateForm(key: const ValueKey('c'), onSave: (_) async {}),
            fontFamily: font,
          ),
        );
        await tester.pumpAndSettle();
        await reveal(tester, find.text('Salvar no aparelho'));
        await tester.tap(find.text('Salvar no aparelho'));
        await tester.pumpAndSettle();
        await checkScreen(
          tester,
          'form-coordenada',
          viewport,
          scale,
          guidelines: false,
        );
        semantics.dispose();
      });

      testWidgets('fotografia com câmera negada · $label', (tester) async {
        applyViewport(tester, viewport, textScale: scale);
        final semantics = tester.ensureSemantics();
        final store = memoryStore();
        await tester.pumpWidget(
          screenApp(
            PhotoCapture(
              owner: 'owner',
              holeId: 'hole',
              store: store,
              picker: _DeniedCamera(),
              onSave: (a, b, c) async {},
            ),
            fontFamily: font,
          ),
        );
        await tester.pumpAndSettle();
        await checkScreen(tester, 'foto', viewport, scale);
        await reveal(tester, find.text('Tirar foto'));
        await tester.tap(find.text('Tirar foto'));
        await tester.pumpAndSettle();
        // The failure sits by the buttons, visible right after the tap.
        expect(
          find.textContaining('Confira a permissão').hitTestable(),
          findsOneWidget,
        );
        await checkScreen(
          tester,
          'foto-negada',
          viewport,
          scale,
          guidelines: false,
        );
        await tester.pumpWidget(const SizedBox());
        await store.close();
        semantics.dispose();
      });
    }
  }
}
