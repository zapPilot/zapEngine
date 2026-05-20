import 'package:flutter/material.dart';

import '../widgets/centered_state_message.dart';

class ComingSoonScreen extends StatelessWidget {
  const ComingSoonScreen({super.key, required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: CenteredStateMessage.hero(
        title: title,
        message: '即將推出',
        icon: Icons.construction_rounded,
      ),
    );
  }
}
