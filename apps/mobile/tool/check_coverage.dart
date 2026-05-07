import 'dart:io';

void main(List<String> args) {
  if (args.length != 2) {
    stderr.writeln('Usage: dart run tool/check_coverage.dart <lcov> <minimum>');
    exitCode = 64;
    return;
  }

  final file = File(args[0]);
  final minimum = double.tryParse(args[1]);
  if (minimum == null) {
    stderr.writeln('Coverage minimum must be a number.');
    exitCode = 64;
    return;
  }

  if (!file.existsSync()) {
    stderr.writeln('Coverage file not found: ${file.path}');
    exitCode = 66;
    return;
  }

  var found = 0;
  var hit = 0;
  for (final line in file.readAsLinesSync()) {
    if (!line.startsWith('DA:')) continue;
    final parts = line.substring(3).split(',');
    if (parts.length != 2) continue;
    found += 1;
    if ((int.tryParse(parts[1]) ?? 0) > 0) {
      hit += 1;
    }
  }

  if (found == 0) {
    stderr.writeln('Coverage file has no executable lines.');
    exitCode = 65;
    return;
  }

  final percent = hit / found * 100;
  stdout.writeln('Mobile coverage: ${percent.toStringAsFixed(2)}%');

  if (percent < minimum) {
    stderr.writeln(
      'Mobile coverage ${percent.toStringAsFixed(2)}% is below ${minimum.toStringAsFixed(2)}%.',
    );
    exitCode = 1;
  }
}
