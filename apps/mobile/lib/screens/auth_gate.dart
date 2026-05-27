import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:zapengine_tokens/design_tokens.dart';

import '../state/auth_provider.dart';
import '../theme/colors.dart';
import '../utils/app_logger.dart';
import '../utils/snackbar.dart';
import '../widgets/branded_backdrop.dart';
import 'home_shell.dart';

class AuthGate extends StatefulWidget {
  const AuthGate({super.key, required this.supabaseConfigured});

  final bool supabaseConfigured;

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  final TextEditingController _emailController = TextEditingController();
  bool _checkingBiometrics = true;
  bool _canUseBiometrics = false;
  bool _emailVisible = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadBiometrics());
  }

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _loadBiometrics() async {
    final auth = context.read<AuthProvider>();
    final canUseBiometrics = await auth.canUseBiometrics();
    if (!mounted) return;
    setState(() {
      _checkingBiometrics = false;
      _canUseBiometrics = canUseBiometrics;
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    if (auth.loading) {
      return const BrandedBackdrop(
        child: Center(child: CircularProgressIndicator()),
      );
    }

    if (auth.currentUser != null) {
      return const HomeShell();
    }

    return BrandedBackdrop(
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Spacer(),
              SizedBox(
                width: 74,
                height: 74,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(22),
                    gradient: const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [AppColors.accent, AppColors.accentMuted],
                    ),
                  ),
                  child: const Icon(
                    Icons.graphic_eq_rounded,
                    color: AppColors.background,
                    size: 36,
                  ),
                ),
              ),
              const SizedBox(height: 28),
              Text(
                'From Fed to Chain',
                style: Theme.of(context).textTheme.headlineLarge,
              ),
              const SizedBox(height: 12),
              Text(
                'Markets, policy, and crypto in one focused listen.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: AppColors.textSecondary,
                      height: 1.45,
                    ),
              ),
              const SizedBox(height: 36),
              if (!widget.supabaseConfigured) ...[
                _ConfigWarning(),
                const SizedBox(height: 16),
              ],
              if (_checkingBiometrics)
                const SizedBox(
                  height: 48,
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                )
              else if (_canUseBiometrics)
                FilledButton.icon(
                  onPressed: auth.signingIn || !widget.supabaseConfigured
                      ? null
                      : () => _runSignIn(auth.signInWithFaceId),
                  icon: const Icon(Icons.face_rounded),
                  label: const Text('Continue with Face ID'),
                ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: auth.signingIn || !widget.supabaseConfigured
                    ? null
                    : () => setState(() => _emailVisible = !_emailVisible),
                icon: const Icon(Icons.alternate_email_rounded),
                label: const Text('Continue with email'),
              ),
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 180),
                child: _emailVisible
                    ? Padding(
                        key: const ValueKey('email-form'),
                        padding: const EdgeInsets.only(top: 16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            TextField(
                              controller: _emailController,
                              keyboardType: TextInputType.emailAddress,
                              textInputAction: TextInputAction.done,
                              autofillHints: const [AutofillHints.email],
                              decoration: const InputDecoration(
                                labelText: 'Email',
                                hintText: 'you@example.com',
                              ),
                              onSubmitted: (_) => _submitEmail(auth),
                            ),
                            const SizedBox(height: 12),
                            FilledButton(
                              onPressed: auth.signingIn
                                  ? null
                                  : () => _submitEmail(auth),
                              child: auth.signingIn
                                  ? const SizedBox.square(
                                      dimension: 18,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                      ),
                                    )
                                  : const Text('Continue'),
                            ),
                          ],
                        ),
                      )
                    : const SizedBox.shrink(),
              ),
              if (auth.error != null) ...[
                const SizedBox(height: 16),
                Text(
                  auth.error!,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.error,
                      ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _submitEmail(AuthProvider auth) {
    return _runSignIn(() => auth.signInWithEmail(_emailController.text));
  }

  Future<void> _runSignIn(Future<void> Function() action) async {
    try {
      await action();
    } catch (error, stackTrace) {
      AppLogger.warn('Sign in failed', error, stackTrace);
      if (!mounted) return;
      final message = context.read<AuthProvider>().error ?? 'Sign in failed.';
      context.showMessage(message);
    }
  }
}

class _ConfigWarning extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        borderRadius: BorderRadius.circular(ZapTokens.radiusCard),
        border: Border.all(color: AppColors.divider),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Text(
          'Missing Supabase build defines.',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: AppColors.accent,
                fontWeight: FontWeight.w700,
              ),
        ),
      ),
    );
  }
}
