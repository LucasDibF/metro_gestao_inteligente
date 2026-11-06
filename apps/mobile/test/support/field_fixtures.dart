import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:metro_mobile/auth/operator_profile.dart';
import 'package:metro_mobile/auth/operator_session.dart';
import 'package:metro_mobile/core/api_client.dart';
import 'package:metro_mobile/field/field_repository.dart';
import 'package:metro_mobile/field/field_store.dart';
import 'package:metro_mobile/ui/metro_theme.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import '../operator_access_test.dart' show MemoryStore;

/// Long, synthetic values: the narrowest layouts must cope with real extremes.
const longWorkName =
    'Validação automática · Edifício Comercial Avenida das Nações Unidas, bloco B';

class ScreenSession extends OperatorSession {
  ScreenSession({
    bool signedIn = true,
    this.worksFail = false,
    this.emptyWorks = false,
  }) : super(
         ApiClient(baseUri: Uri.parse('https://example.invalid')),
         MemoryStore(),
       ) {
    if (signedIn) {
      profile = OperatorProfile.fromJson({
        'userId': 'operator',
        'role': 'OPERATOR',
        'additionalRoles': <String>[],
        'tenant': {'id': 'company', 'name': 'Geotecnia Exemplo Ltda.'},
      });
    }
  }
  final bool worksFail, emptyWorks;
  bool disconnected = false;

  @override
  bool get offlineReadAllowed => true;

  @override
  Future<Json> get(String route) async {
    if (disconnected) throw const NetworkFailure();
    if (route.startsWith('mobile/obras?')) {
      if (worksFail) throw const NetworkFailure();
      return emptyWorks
          ? {'items': <Json>[], 'total': 0}
          : {
              'items': [
                {
                  'id': 'work',
                  'name': longWorkName,
                  'city': 'São José do Rio Preto',
                  'state': 'SP',
                },
                {
                  'id': 'work-2',
                  'name': 'Obra Centro',
                  'city': '',
                  'state': '',
                },
                {
                  'id': 'work-3',
                  'name': 'Galpão Logístico',
                  'city': 'Campinas',
                  'state': 'SP',
                },
              ],
              'total': 3,
            };
    }
    if (route.contains('/pastas')) {
      return {
        'items': [
          {'id': 'folder', 'name': 'Setor A · Fundações do bloco principal'},
          {'id': 'empty-folder', 'name': 'Setor B'},
        ],
        'total': 2,
      };
    }
    if (route.contains('/furos')) {
      return {
        'items': [
          {
            'id': 'one',
            'code': 'SP-01',
            'folderId': 'folder',
            'plannedDepthM': '20',
          },
          {
            'id': 'two',
            'code': 'SP-02-LONGO-CODIGO-DE-IDENTIFICACAO',
            'folderId': null,
          },
        ],
        'total': 2,
      };
    }
    throw const NetworkFailure();
  }
}

Json metreRecord(int depth, {bool initial = false, bool interrupted = false}) =>
    {
      'depthM': '$depth',
      if (initial) 'recordType': 'INITIAL_SOIL',
      'advances': initial
          ? <Json>[]
          : [
              {'blows': 3 + depth, 'penetrationMm': 150},
              {'blows': 12, 'penetrationMm': 155},
              if (!interrupted) {'blows': 14, 'penetrationMm': 150},
            ],
      if (interrupted) 'interruptionReason': 'Impenetrável à percussão',
      'soil': {
        'soilType': depth.isEven
            ? 'Argila silto-arenosa, muito mole a mole'
            : 'Areia fina',
        'soilColor': 'Marrom',
        'description': '',
      },
      'fieldDetails': {'executionMethod': 'SP_CA'},
    };

/// Local document as stored after a download, with content in every section.
Json holeDocument({
  bool locked = false,
  bool empty = false,
  String? executedDepth,
}) => {
  'workId': 'work',
  'serverVersion': 1,
  'hole': {
    'id': 'hole',
    'code': 'SP-01',
    'technicalVersion': 1,
    'reviewState': locked ? 'IN_REVIEW' : 'DRAFT',
    'fieldDate': empty ? null : '2026-11-04',
    'executedDepthM': executedDepth,
    'waterLevelM': empty ? null : '1.20',
    if (locked)
      'reviewNote': 'Execução de campo concluída. Solicito análise técnica.',
  },
  'records': empty
      ? <String, dynamic>{}
      : {
          '1': metreRecord(1, initial: true),
          '2': metreRecord(2),
          '3': metreRecord(3),
          '4': metreRecord(4, interrupted: true),
        },
  'files': {
    'coordinates': empty
        ? <Json>[]
        : [
            {
              'kind': 'EXECUTED',
              'zone': 23,
              'hemisphere': 'S',
              'eastingM': '333123.45',
              'northingM': '7394123.67',
              'version': 1,
            },
          ],
    'photos': empty
        ? <Json>[]
        : [
            {
              'id': 'photo',
              'caption': '',
              'purpose': 'SITE',
              'processingState': 'PENDING',
            },
          ],
  },
  'checklist': [
    {'label': 'Data de campo preenchida', 'stage': 'review', 'complete': true},
    {
      'label': 'Profundidade executada informada',
      'stage': 'review',
      'complete': false,
    },
    {
      'label': 'Avanços preenchidos ou interrupção registrada',
      'stage': 'review',
      'complete': true,
    },
    {
      'label': 'Solo descrito sem lacunas até o encerramento',
      'stage': 'review',
      'complete': false,
    },
  ],
  'localPhotos': empty
      ? <Json>[]
      : [
          {
            'path': '/nao/existe.jpg',
            'caption': 'Vista geral do furo',
            'purpose': 'SITE',
          },
        ],
};

/// Real SQLite running on the test's own isolate, so widget tests can settle.
FieldStore memoryStore() => FieldStore(
  factory: databaseFactoryFfiNoIsolate,
  databasePath: inMemoryDatabasePath,
);

Future<FieldRepository> repositoryWith(Json document, FieldStore store) async {
  final session = ScreenSession();
  final repository = FieldRepository(session, store);
  await store.write(repository.owner, 'hole', document);
  return repository;
}

/// Window under test; sizes in logical points, as a device reports them.
class ScreenWindow {
  const ScreenWindow(
    this.name,
    this.width,
    this.height, {
    this.top = 0,
    this.bottom = 0,
    this.side = 0,
  });
  final String name;
  final double width, height, top, bottom, side;
}

const viewports = [
  ScreenWindow('estreito-320', 320, 568, top: 20),
  ScreenWindow('telefone-390', 390, 844, top: 59, bottom: 34),
  ScreenWindow('grande-430', 430, 932, top: 59, bottom: 34),
  ScreenWindow('tablet-768', 768, 1024, top: 24, bottom: 20),
  ScreenWindow('tablet-paisagem-1024', 1024, 768, top: 24, bottom: 20),
  ScreenWindow('paisagem-844', 844, 390, bottom: 21, side: 59),
  ScreenWindow('paisagem-568', 568, 320),
];

const _pixelRatio = 2.0;

void applyViewport(
  WidgetTester tester,
  ScreenWindow viewport, {
  double textScale = 1,
  double keyboard = 0,
}) {
  final view = tester.view;
  view.devicePixelRatio = _pixelRatio;
  view.physicalSize = Size(viewport.width, viewport.height) * _pixelRatio;
  final padding = FakeViewPadding(
    left: viewport.side * _pixelRatio,
    right: viewport.side * _pixelRatio,
    top: viewport.top * _pixelRatio,
    bottom: viewport.bottom * _pixelRatio,
  );
  view.padding = padding;
  view.viewPadding = padding;
  view.viewInsets = FakeViewPadding(bottom: keyboard * _pixelRatio);
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(view.reset);
  addTearDown(tester.platformDispatcher.clearAllTestValues);
}

Widget screenApp(Widget home, {String? fontFamily}) => MaterialApp(
  debugShowCheckedModeBanner: false,
  theme: metroTheme(fontFamily: fontFamily, headingFamily: fontFamily),
  locale: const Locale('pt', 'BR'),
  supportedLocales: const [Locale('pt', 'BR')],
  localizationsDelegates: GlobalMaterialLocalizations.delegates,
  home: home,
);

/// Family registered by [loadCaptureFonts]; plain tests use the square test
/// font, wider than real text and therefore stricter about overflow.
const captureFont = 'Roboto';

Future<void> loadCaptureFonts() async {
  final fonts =
      '${Platform.environment['FLUTTER_ROOT']}/bin/cache/artifacts/material_fonts';
  Future<ByteData> read(String name) async =>
      ByteData.sublistView(await File('$fonts/$name').readAsBytes());
  await (FontLoader(captureFont)
        ..addFont(read('Roboto-Regular.ttf'))
        ..addFont(read('Roboto-Medium.ttf'))
        ..addFont(read('Roboto-Bold.ttf')))
      .load();
  await (FontLoader(
    'MaterialIcons',
  )..addFont(read('MaterialIcons-Regular.otf'))).load();
}
