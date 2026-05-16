import 'package:flutter/material.dart';

import '../theme/colors.dart';

class BrandedBackdrop extends StatelessWidget {
  const BrandedBackdrop({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              AppColors.surfaceElevated,
              AppColors.background,
              AppColors.background,
            ],
          ),
        ),
        child: SizedBox.expand(child: child),
      ),
    );
  }
}
