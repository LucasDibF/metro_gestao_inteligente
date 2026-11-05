import 'package:flutter/material.dart';
import '../ui/metro_layout.dart';
import '../ui/metro_theme.dart';
import '../ui/metro_widgets.dart';

const executionMethods = <String, String>{
  'TC': 'TC — Trado concha',
  'TH': 'TH — Trado helicoidal',
  'SP_TH': 'SP + TH — Percussão e trado',
  'CA': 'CA — Circulação de água',
  'SP_CA': 'SP + CA — Percussão e circulação de água',
};

const soilMoistures = ['', 'Seca', 'Úmida', 'Saturada'];

const _fieldMinWidth = 280.0;

class MetreSoilFields extends StatelessWidget {
  const MetreSoilFields({
    super.key,
    required this.soil,
    required this.color,
    required this.description,
    required this.moisture,
    required this.method,
    required this.enabled,
    required this.onMoistureChanged,
    required this.onMethodChanged,
    this.onRepeatPrevious,
  });
  final TextEditingController soil, color, description;
  final String moisture, method;
  final bool enabled;
  final ValueChanged<String> onMoistureChanged, onMethodChanged;
  final VoidCallback? onRepeatPrevious;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    spacing: MetroSpace.md,
    children: [
      const MetroSectionTitle('Solo da camada'),
      if (onRepeatPrevious != null)
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: enabled ? onRepeatPrevious : null,
            icon: const Icon(Icons.copy),
            label: const Text('Mesmo tipo e cor do metro anterior'),
          ),
        ),
      MetroColumns(
        minColumnWidth: _fieldMinWidth,
        maxColumns: 2,
        spacing: MetroSpace.lg,
        runSpacing: MetroSpace.md,
        children: [
          MetroField(
            label: 'Tipo de solo',
            child: TextFormField(
              key: const ValueKey('soil-type'),
              controller: soil,
              enabled: enabled,
              maxLength: 120,
              decoration: const InputDecoration(
                hintText: 'Ex.: Argila arenosa',
                hintMaxLines: 2,
              ),
              validator: (v) =>
                  (v?.trim().isEmpty ?? true) ? 'Informe o tipo de solo' : null,
            ),
          ),
          MetroField(
            label: 'Cor (opcional)',
            child: TextFormField(
              key: const ValueKey('soil-color'),
              controller: color,
              enabled: enabled,
              maxLength: 120,
              decoration: const InputDecoration(
                hintText: 'Ex.: marrom com veios variegados',
                hintMaxLines: 2,
              ),
            ),
          ),
          MetroField(
            label: 'Umidade (opcional)',
            child: DropdownButtonFormField<String>(
              style: Theme.of(context).textTheme.bodyLarge,
              initialValue: moisture,
              isExpanded: true,
              itemHeight: null,
              items: [
                for (final value in soilMoistures)
                  DropdownMenuItem(
                    value: value,
                    child: Text(value.isEmpty ? 'Não informada' : value),
                  ),
              ],
              onChanged: enabled ? (v) => onMoistureChanged(v!) : null,
            ),
          ),
          MetroField(
            label: 'Método de execução',
            child: DropdownButtonFormField<String>(
              style: Theme.of(context).textTheme.bodyLarge,
              initialValue: method,
              isExpanded: true,
              itemHeight: null,
              items: [
                const DropdownMenuItem(value: '', child: Text('Não informado')),
                for (final entry in executionMethods.entries)
                  DropdownMenuItem(value: entry.key, child: Text(entry.value)),
              ],
              onChanged: enabled ? (v) => onMethodChanged(v!) : null,
            ),
          ),
        ],
      ),
      MetroField(
        label: 'Descrição complementar (opcional)',
        child: TextFormField(
          controller: description,
          enabled: enabled,
          maxLength: 2000,
          maxLines: 3,
        ),
      ),
    ],
  );
}
