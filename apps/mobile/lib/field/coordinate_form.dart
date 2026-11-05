import 'package:flutter/material.dart';
import '../ui/metro_layout.dart';
import '../ui/metro_theme.dart';
import '../ui/metro_widgets.dart';
import 'field_format.dart';
import 'field_forms.dart' show decimal;
import 'field_store.dart';

const _coordinateFieldMinWidth = 200.0;

class CoordinateForm extends StatefulWidget {
  const CoordinateForm({super.key, this.coordinate, required this.onSave});
  final Json? coordinate;
  final Future<void> Function(Json) onSave;
  @override
  State<CoordinateForm> createState() => _CoordinateFormState();
}

class _CoordinateFormState extends State<CoordinateForm> {
  final form = GlobalKey<FormState>();
  late final TextEditingController east, north, zone, altitude, reference;
  String hemisphere = 'S';
  bool busy = false;
  String? error;
  @override
  void initState() {
    super.initState();
    final c = widget.coordinate ?? {};
    east = TextEditingController(text: '${c['eastingM'] ?? ''}');
    north = TextEditingController(text: '${c['northingM'] ?? ''}');
    zone = TextEditingController(text: '${c['zone'] ?? ''}');
    altitude = TextEditingController(text: '${c['altitudeM'] ?? ''}');
    reference = TextEditingController(text: '${c['reference'] ?? ''}');
    hemisphere = c['hemisphere'] as String? ?? 'S';
  }

  @override
  void dispose() {
    for (final c in [east, north, zone, altitude, reference]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (!form.currentState!.validate()) return;
    final z = int.tryParse(zone.text);
    if (z == null) {
      setState(() => error = 'O fuso deve ser um número inteiro.');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.onSave({
        'eastingM': decimal(east.text),
        'northingM': decimal(north.text),
        'zone': z,
        'hemisphere': hemisphere,
        'datum': 'SIRGAS2000',
        'altitudeM': altitude.text.trim().isEmpty
            ? null
            : decimal(altitude.text),
        'reference': reference.text.trim(),
      });
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) setState(() => error = fieldErrorMessage(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget number(
    TextEditingController c,
    String label,
    double min,
    double max, {
    bool optional = false,
  }) => MetroField(
    label: label,
    child: TextFormField(
      controller: c,
      style: metroNumberStyle,
      keyboardType: const TextInputType.numberWithOptions(
        decimal: true,
        signed: true,
      ),
      validator: (v) {
        final s = decimal(v ?? '');
        if (optional && s.isEmpty) return null;
        final n = double.tryParse(s);
        return RegExp(r'^-?\d{1,8}(\.\d{1,2})?$').hasMatch(s) &&
                n != null &&
                n >= min &&
                n <= max
            ? null
            : 'Use um valor entre $min e $max';
      },
    ),
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: metroAppBar(context, title: 'Coordenada executada'),
    body: Form(
      key: form,
      child: MetroActionLayout(
        action: MetroFormAction(
          error: error,
          button: FilledButton(
            onPressed: busy ? null : _save,
            child: const Text('Salvar no aparelho'),
          ),
        ),
        children: [
          const MetroSectionTitle('UTM · SIRGAS 2000'),
          const SizedBox(height: MetroSpace.lg),
          MetroColumns(
            minColumnWidth: _coordinateFieldMinWidth,
            maxColumns: 2,
            children: [
              number(east, 'Easting E (m)', 100000, 900000),
              number(north, 'Northing N (m)', 0, 10000000),
              number(zone, 'Fuso UTM', 1, 60),
              MetroField(
                label: 'Hemisfério',
                child: DropdownButtonFormField(
                  style: Theme.of(context).textTheme.bodyLarge,
                  initialValue: hemisphere,
                  isExpanded: true,
                  items: const [
                    DropdownMenuItem(value: 'S', child: Text('Sul')),
                    DropdownMenuItem(value: 'N', child: Text('Norte')),
                  ],
                  onChanged: (v) => hemisphere = v!,
                ),
              ),
              number(
                altitude,
                'Cota (m, opcional)',
                -500,
                9000,
                optional: true,
              ),
            ],
          ),
          const SizedBox(height: MetroSpace.lg),
          MetroField(
            label: 'Referência da medição',
            child: TextFormField(
              controller: reference,
              maxLength: 500,
              validator: (v) =>
                  (v?.trim().isEmpty ?? true) ? 'Informe a referência' : null,
            ),
          ),
        ],
      ),
    ),
  );
}
