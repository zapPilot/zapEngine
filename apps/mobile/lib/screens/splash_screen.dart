import 'dart:async';

import 'package:flutter/material.dart';
import 'package:zapengine_tokens/design_tokens.dart';

import '../theme/colors.dart';
import '../widgets/branded_backdrop.dart';
import 'auth_gate.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key, required this.supabaseConfigured});

  final bool supabaseConfigured;

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  static const _animationDuration = Duration(milliseconds: 1000);
  static const _dwellDuration = Duration(milliseconds: 1600);
  static const _reducedMotionDwellDuration = Duration(milliseconds: 600);
  static const _routeFadeDuration = Duration(milliseconds: 300);
  static const _primaryCurve = Cubic(0.2, 0.65, 0.3, 0.99);

  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: _animationDuration,
  );
  late final Animation<double> _markProgress = CurvedAnimation(
    parent: _controller,
    curve: const Interval(0, 0.7, curve: _primaryCurve),
  );
  late final Animation<double> _wordmarkOpacity = CurvedAnimation(
    parent: _controller,
    curve: const Interval(0.42, 0.82, curve: _primaryCurve),
  );
  late final Animation<Offset> _wordmarkOffset = Tween<Offset>(
    begin: const Offset(0, 0.16),
    end: Offset.zero,
  ).animate(
    CurvedAnimation(
      parent: _controller,
      curve: const Interval(0.42, 0.82, curve: _primaryCurve),
    ),
  );
  late final Animation<double> _endorsementOpacity = CurvedAnimation(
    parent: _controller,
    curve: const Interval(0.62, 1, curve: _primaryCurve),
  );
  late final Animation<Offset> _endorsementOffset = Tween<Offset>(
    begin: const Offset(0, 0.22),
    end: Offset.zero,
  ).animate(
    CurvedAnimation(
      parent: _controller,
      curve: const Interval(0.62, 1, curve: _primaryCurve),
    ),
  );

  Timer? _navigationTimer;
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;

    final mediaQuery = MediaQuery.maybeOf(context);
    final reduceMotion = mediaQuery?.disableAnimations == true ||
        mediaQuery?.accessibleNavigation == true;

    if (reduceMotion) {
      _controller.value = 1;
      _navigationTimer = Timer(_reducedMotionDwellDuration, _navigateToAuth);
      return;
    }

    unawaited(_controller.forward());
    _navigationTimer = Timer(
      _animationDuration + _dwellDuration,
      _navigateToAuth,
    );
  }

  @override
  void dispose() {
    _navigationTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _navigateToAuth() {
    if (!mounted) return;

    Navigator.of(context).pushReplacement<void, void>(
      PageRouteBuilder<void>(
        transitionDuration: _routeFadeDuration,
        reverseTransitionDuration: _routeFadeDuration,
        pageBuilder: (_, __, ___) => AuthGate(
          supabaseConfigured: widget.supabaseConfigured,
        ),
        transitionsBuilder: (_, animation, __, child) {
          final opacity = CurvedAnimation(
            parent: animation,
            curve: _primaryCurve,
          );
          return FadeTransition(opacity: opacity, child: child);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;

    return Semantics(
      label: 'From Fed to Chain, a Zap production',
      container: true,
      child: BrandedBackdrop(
        child: ExcludeSemantics(
          child: SafeArea(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    AnimatedBuilder(
                      animation: _markProgress,
                      builder: (context, _) {
                        return _MeasuredBarsMark(
                          progress: _markProgress.value,
                        );
                      },
                    ),
                    const SizedBox(height: 28),
                    FadeTransition(
                      opacity: _wordmarkOpacity,
                      child: SlideTransition(
                        position: _wordmarkOffset,
                        child: Text(
                          'From Fed to Chain',
                          textAlign: TextAlign.center,
                          style: textTheme.headlineLarge,
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    FadeTransition(
                      opacity: _endorsementOpacity,
                      child: SlideTransition(
                        position: _endorsementOffset,
                        child: Text(
                          'A ZAP PRODUCTION',
                          textAlign: TextAlign.center,
                          style: textTheme.labelMedium?.copyWith(
                            color: AppColors.textSecondary,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 1.8,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _MeasuredBarsMark extends StatelessWidget {
  const _MeasuredBarsMark({required this.progress});

  static const _carrierSize = 76.0;
  static const _glyphSize = 44.0;

  final double progress;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(ZapTokens.radiusControl),
        border: Border.all(color: AppColors.dividerStrong),
        boxShadow: const [
          BoxShadow(
            color: AppColors.accentSoft,
            blurRadius: 34,
            spreadRadius: 2,
          ),
        ],
      ),
      child: SizedBox.square(
        dimension: _carrierSize,
        child: Center(
          child: CustomPaint(
            size: const Size.square(_glyphSize),
            painter: _MeasuredBarsPainter(progress: progress),
          ),
        ),
      ),
    );
  }
}

class _MeasuredBarsPainter extends CustomPainter {
  const _MeasuredBarsPainter({required this.progress});

  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppColors.accent
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round;

    final heights = <double>[0.48, 0.76, 0.58, 0.9, 0.66];
    final gap = size.width / (heights.length + 1);
    final baseline = size.height * 0.86;

    for (var index = 0; index < heights.length; index += 1) {
      final start = index * 0.12;
      final localProgress = ((progress - start) / (1 - start)).clamp(0.0, 1.0);
      final eased = Curves.easeOutCubic.transform(localProgress);
      final minHeight = size.height * 0.18;
      final targetHeight = size.height * heights[index];
      final barHeight = minHeight + ((targetHeight - minHeight) * eased);
      final x = gap * (index + 1);

      canvas.drawLine(
        Offset(x, baseline),
        Offset(x, baseline - barHeight),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _MeasuredBarsPainter oldDelegate) {
    return oldDelegate.progress != progress;
  }
}
