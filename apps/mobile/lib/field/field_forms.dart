import 'package:flutter/material.dart';
import '../ui/metro_layout.dart';
import '../ui/metro_theme.dart';
import '../ui/metro_widgets.dart';
import 'field_format.dart';
import 'field_store.dart';

String decimal(String value) => value.trim().replaceAll(',', '.');
String? positiveDepth(String? value, {bool optional = false}) {
  final s = decimal(value ?? '');
  if (optional && s.isEmpty) return null;
  return RegExp(r'^\d{1,6}(\.\d{1,2})?$').hasMatch(s) && double.parse(s) > 0
      ? null
      : 'Informe uma profundidade válida em metros';
}

/// Where the local metres end, as the API measures it: an interrupted metre
/// ends at its measured penetration, any other at its nominal depth.
num recordedEndDepth(Json records) {
  num deepest = 0;
  for (final record in records.values.cast<Json>()) {
    final nominal = num.parse('${record['depthM']}');
    final penetrations = ((record['advances'] as List?) ?? const [])
        .map((advance) => advance['penetrationMm'] as num? ?? 0)
        .toList();
    final millimetres = penetrations.fold<num>(0, (sum, mm) => sum + mm);
    final result = record['result'] as Json?;
    final partial =
        penetrations.every((mm) => mm > 0) &&
        millimetres > 0 &&
        millimetres < 450 &&
        (record['interruptionReason'] != null ||
            (result != null &&
                result.containsKey('nSpt') &&
                result['nSpt'] == null));
    final end = partial ? ((nominal - 1) * 1000 + millimetres) / 1000 : nominal;
    if (end > deepest) deepest = end;
  }
  return deepest;
}

class FieldForm extends StatefulWidget {
  const FieldForm({
    super.key,
    required this.hole,
    required this.onSave,
    this.records = const {},
  });
  final Json hole;

  /// Local metres; the executed depth cannot leave any of them out.
  final Json records;
  final Future<void> Function(Json) onSave;
  @override
  State<FieldForm> createState() => _FieldFormState();
}

class _FieldFormState extends State<FieldForm> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController date, depth, water;
  bool busy = false;
  String? error;
  @override
  void initState() {
    super.initState();
    date = TextEditingController(
      text: ('${widget.hole['fieldDate'] ?? ''}').split('T').first,
    );
    depth = TextEditingController(
      text: '${widget.hole['executedDepthM'] ?? ''}',
    );
    water = TextEditingController(text: '${widget.hole['waterLevelM'] ?? ''}');
  }

  @override
  void dispose() {
    date.dispose();
    depth.dispose();
    water.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.onSave({
        'fieldDate': date.text,
        'executedDepthM': decimal(depth.text).isEmpty
            ? null
            : decimal(depth.text),
        'waterLevelM': decimal(water.text).isEmpty ? null : decimal(water.text),
      });
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) setState(() => error = fieldErrorMessage(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: metroAppBar(context, title: 'Dados de campo'),
    body: Form(
      key: _form,
      child: MetroActionLayout(
        action: MetroFormAction(
          error: error,
          button: FilledButton(
            onPressed: busy ? null : _save,
            child: Text(busy ? 'Salvando…' : 'Salvar no aparelho'),
          ),
        ),
        children: [
          MetroField(
            label: 'Data de execução',
            child: TextFormField(
              controller: date,
              readOnly: true,
              decoration: const InputDecoration(
                suffixIcon: Icon(Icons.calendar_today),
              ),
              validator: (v) => (v?.isEmpty ?? true) ? 'Informe a data' : null,
              onTap: () async {
                final selected = await showDatePicker(
                  context: context,
                  initialDate: DateTime.tryParse(date.text) ?? DateTime.now(),
                  firstDate: DateTime(2000),
                  lastDate: DateTime.now().add(const Duration(days: 366)),
                );
                if (selected != null) {
                  date.text =
                      '${selected.year}-${selected.month.toString().padLeft(2, '0')}-${selected.day.toString().padLeft(2, '0')}';
                }
              },
            ),
          ),
          const SizedBox(height: MetroSpace.lg),
          MetroField(
            label: 'Profundidade executada (m)',
            child: TextFormField(
              controller: depth,
              style: metroNumberStyle,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                helperText: 'Preencha ao encerrar o furo. Ex.: 6,14',
              ),
              validator: (v) {
                final invalid = positiveDepth(v, optional: true);
                if (invalid != null) return invalid;
                final end = double.tryParse(decimal(v ?? ''));
                final recorded = recordedEndDepth(widget.records);
                return end != null && end < recorded
                    ? 'Há metros registrados até ${fieldNumber(recorded)} m. Informe esse valor ou mais.'
                    : null;
              },
            ),
          ),
          const SizedBox(height: MetroSpace.lg),
          MetroField(
            label: 'Nível d’água (m, opcional)',
            child: TextFormField(
              controller: water,
              style: metroNumberStyle,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              validator: (v) {
                final s = decimal(v ?? '');
                if (s.isEmpty) return null;
                final n = double.tryParse(s);
                if (!RegExp(r'^\d{1,6}(\.\d{1,2})?$').hasMatch(s) ||
                    n == null ||
                    n < 0) {
                  return 'Informe um nível válido';
                }
                final end = double.tryParse(decimal(depth.text));
                return end != null && n > end
                    ? 'O nível d’água deve estar dentro do furo'
                    : null;
              },
            ),
          ),
        ],
      ),
    ),
  );
}
