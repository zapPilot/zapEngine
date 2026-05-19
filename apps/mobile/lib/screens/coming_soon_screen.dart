import 'package:flutter/material.dart';

import '../widgets/centered_state_message.dart';

class ComingSoonScreen extends StatelessWidget {
  const ComingSoonScreen({super.key, required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SafeArea(
      child: CenteredStateMessage(
        title: title,
        message: '即將推出',
        icon: Icons.construction_rounded,
        iconSize: 34,
        framedIcon: true,
        iconSpacing: 18,
        padding: EdgeInsets.zero,
        titleStyle: theme.textTheme.titleLarge,
      ),
    );
  }
}
