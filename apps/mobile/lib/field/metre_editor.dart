import 'package:flutter/material.dart';
import '../ui/metro_layout.dart';
import '../ui/metro_theme.dart';
import '../ui/metro_widgets.dart';
import 'field_format.dart';
import 'field_store.dart';
import 'metre_advance_panel.dart';
import 'metre_advances.dart';
import 'metre_draft_discard.dart';
import 'metre_soil_fields.dart';

class MetreEditor extends StatefulWidget {
  const MetreEditor({
    super.key,
    required this.depth,
    required this.onSave,
    this.record,
    this.previousSoil,
    this.draft,
    this.onDraft,
    this.onDiscardDraft,
    this.rejection,
  });
  final int depth;
  final Json? record, previousSoil, draft;
  final Future<void> Function(Json) onSave;
  final void Function(Json)? onDraft;
  final Future<void> Function()? onDiscardDraft;

  /// Why the server refused the last save of this metre.
  final String? rejection;
  @override
  State<MetreEditor> createState() => _MetreEditorState();
}

class _MetreEditorState extends State<MetreEditor> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController soil, color, description, reason;
  late final List<TextEditingController> blows, penetrations;
  String moisture = '', method = '';
  bool busy = false, interrupted = false, hasDraft = false;
  String? error;
  bool get initial => widget.depth == 1;
  List<TextEditingController> get _controllers => [
    soil,
    color,
    description,
    reason,
    ...blows,
    ...penetrations,
  ];
  @override
  void initState() {
    super.initState();
    hasDraft = widget.draft != null;
    final record = widget.draft ?? widget.record ?? <String, dynamic>{};
    final ground = record['soil'] as Json? ?? {};
    soil = TextEditingController(text: ground['soilType'] as String? ?? '');
    color = TextEditingController(text: ground['soilColor'] as String? ?? '');
    description = TextEditingController(
      text: ground['description'] as String? ?? '',
    );
    reason = TextEditingController(
      text: record['interruptionReason'] as String? ?? '',
    );
    moisture = ground['soilMoisture'] as String? ?? '';
    method =
        (record['fieldDetails'] as Json?)?['executionMethod'] as String? ?? '';
    interrupted = reason.text.isNotEmpty;
    final values = (record['advances'] as List?) ?? [];
    blows = List.generate(
      advanceCount,
      (i) => TextEditingController(
        text: i < values.length ? '${values[i]['blows']}' : '',
      ),
    );
    penetrations = List.generate(
      advanceCount,
      (i) => TextEditingController(
        text: i < values.length
            ? fieldNumber((values[i]['penetrationMm'] as num) / 10)
            : '',
      ),
    );
    if (record['draftBlows'] is List) {
      for (var i = 0; i < advanceCount; i++) {
        blows[i].text = record['draftBlows'][i] as String;
        penetrations[i].text = record['draftPenetrations'][i] as String;
      }
    }
    for (final c in _controllers) {
      c.addListener(_draft);
    }
  }

  void _draft() {
    if (!hasDraft && widget.onDraft != null) setState(() => hasDraft = true);
    widget.onDraft?.call({
      'soil': {
        'soilType': soil.text,
        'soilColor': color.text,
        'description': description.text,
        'soilMoisture': moisture,
      },
      'fieldDetails': {'executionMethod': method},
      'interruptionReason': interrupted ? reason.text : null,
      'advances': List.generate(
        advanceCount,
        (i) => {
          'blows': int.tryParse(blows[i].text) ?? 0,
          'penetrationMm':
              ((double.tryParse(penetrations[i].text.replaceAll(',', '.')) ??
                          0) *
                      10)
                  .round(),
        },
      ),
      'draftBlows': blows.map((c) => c.text).toList(),
      'draftPenetrations': penetrations.map((c) => c.text).toList(),
    });
  }

  @override
  void dispose() {
    for (final c in _controllers) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    final List<Json> advances;
    try {
      advances = initial
          ? const []
          : parseAdvances(
              blows: [for (final c in blows) c.text],
              penetrations: [for (final c in penetrations) c.text],
              interrupted: interrupted,
            );
    } on FormatException catch (invalid) {
      setState(() => error = invalid.message);
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.onSave({
        'depthM': '${widget.depth}',
        if (initial) 'recordType': 'INITIAL_SOIL',
        'advances': advances,
        'interruptionReason': !initial && interrupted
            ? reason.text.trim()
            : null,
        'soil': {
          'soilType': soil.text.trim(),
          'soilColor': color.text.trim(),
          'description': description.text.trim(),
          'soilMoisture': moisture.isEmpty ? null : moisture,
        },
        'fieldDetails': {'executionMethod': method.isEmpty ? null : method},
      });
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) setState(() => error = fieldErrorMessage(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void _clearFrom(int first) {
    for (var index = first; index < advanceCount; index++) {
      blows[index].clear();
      penetrations[index].clear();
    }
  }

  void _repeatPreviousSoil() {
    soil.text = widget.previousSoil!['soilType'] as String? ?? '';
    color.text = widget.previousSoil!['soilColor'] as String? ?? '';
  }

  Widget _advances(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    spacing: MetroSpace.md,
    children: [
      MetroColumns(
        minColumnWidth: metreAdvanceMinWidth,
        spacing: MetroSpace.md,
        runSpacing: MetroSpace.md,
        children: [
          for (var i = 0; i < advanceCount; i++)
            MetreAdvancePanel(
              index: i,
              blows: blows[i],
              penetration: penetrations[i],
              enabled: !busy,
              onClearFromHere: () => _clearFrom(i),
            ),
        ],
      ),
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        title: const Text('Ensaio interrompido'),
        value: interrupted,
        onChanged: busy
            ? null
            : (v) {
                setState(() => interrupted = v);
                _draft();
              },
      ),
      if (interrupted)
        MetroField(
          label: 'Motivo da interrupção',
          child: TextFormField(
            controller: reason,
            maxLength: 500,
            enabled: !busy,
            validator: (v) => interrupted && (v?.trim().isEmpty ?? true)
                ? 'Informe o motivo'
                : null,
          ),
        ),
    ],
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: metroAppBar(
      context,
      title: '${widget.depth - 1}–${widget.depth} m',
    ),
    body: Form(
      key: _form,
      child: MetroActionLayout(
        maxWidth: MetroWidth.hierarchy,
        action: MetroFormAction(
          error: error,
          button: FilledButton.icon(
            onPressed: busy ? null : _save,
            icon: const Icon(Icons.save_outlined),
            label: Text(busy ? 'Salvando…' : 'Salvar metro no aparelho'),
          ),
        ),
        children: [
          if (widget.rejection != null) ...[
            MetroNotice(
              'Recusado: ${widget.rejection} Corrija e salve novamente.',
              tone: MetroNoticeTone.error,
            ),
            const SizedBox(height: MetroSpace.lg),
          ],
          MetroSectionTitle(
            initial ? 'Primeiro metro · Solo inicial' : 'Ensaio SPT e solo',
            supporting: initial
                ? 'Neste metro são registrados o solo e o método, sem golpes ou avanços.'
                : 'Golpes e penetração em centímetros',
          ),
          const SizedBox(height: MetroSpace.lg),
          if (!initial) ...[
            _advances(context),
            const SizedBox(height: MetroSpace.xl),
          ],
          MetreSoilFields(
            soil: soil,
            color: color,
            description: description,
            moisture: moisture,
            method: method,
            enabled: !busy,
            onMoistureChanged: (value) {
              moisture = value;
              _draft();
            },
            onMethodChanged: (value) {
              method = value;
              _draft();
            },
            onRepeatPrevious: widget.previousSoil == null
                ? null
                : _repeatPreviousSoil,
          ),
          if (hasDraft && widget.onDiscardDraft != null) ...[
            const SizedBox(height: MetroSpace.lg),
            MetreDraftDiscard(
              enabled: !busy,
              onDiscard: widget.onDiscardDraft!,
            ),
          ],
        ],
      ),
    ),
  );
}
