import 'dart:typed_data';
import 'package:flutter/material.dart';
import '../auth/operator_session.dart';
import '../ui/metro_widgets.dart';
import 'hole_photos_tab.dart';

/// Authenticated preview; fills the [PhotoFrame] that contains it.
class RemotePhoto extends StatefulWidget {
  const RemotePhoto({super.key, required this.session, required this.route});
  final OperatorSession session;
  final String route;
  @override
  State<RemotePhoto> createState() => _RemotePhotoState();
}

class _RemotePhotoState extends State<RemotePhoto> {
  late Future<Uint8List> image;
  @override
  void initState() {
    super.initState();
    image = widget.session.bytes(widget.route);
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<Uint8List>(
    future: image,
    builder: (context, snapshot) {
      if (snapshot.hasData) {
        return Image.memory(
          snapshot.data!,
          fit: BoxFit.contain,
          cacheWidth: photoPreviewCacheWidth,
          errorBuilder: (_, e, s) =>
              const Center(child: Text('Imagem indisponível.')),
        );
      }
      if (snapshot.hasError) {
        return Center(
          child: TextButton.icon(
            onPressed: () {
              setState(() {
                image = widget.session.bytes(widget.route);
              });
            },
            icon: const Icon(Icons.refresh),
            label: const Text('Carregar fotografia'),
          ),
        );
      }
      return const MetroLoading();
    },
  );
}
