#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  pnpm --filter @zapengine/mobile ios:release:prepare
  pnpm --filter @zapengine/mobile ios:release:prepare -- 2.0.1+13
  pnpm --filter @zapengine/mobile ios:release:prepare -- 2.0.1 13

Options:
  --deep-clean   Also remove Runner DerivedData before regenerating iOS config.
  --from-xcode   Internal mode used by the Xcode Archive pre-action.
USAGE
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

find_flutter_bin() {
  local generated_root=""
  if [[ -f ios/Flutter/Generated.xcconfig ]]; then
    generated_root="$(sed -nE 's/^FLUTTER_ROOT=(.*)$/\1/p' ios/Flutter/Generated.xcconfig | head -n 1)"
  fi

  local candidates=()
  if command -v flutter >/dev/null 2>&1; then
    candidates+=("$(command -v flutter)")
  fi
  if [[ -n "${FLUTTER_ROOT:-}" ]]; then
    candidates+=("${FLUTTER_ROOT}/bin/flutter")
  fi
  if [[ -n "$generated_root" ]]; then
    candidates+=("${generated_root}/bin/flutter")
  fi
  candidates+=(
    "/opt/homebrew/bin/flutter"
    "/usr/local/bin/flutter"
    "/opt/homebrew/Caskroom/flutter/3.32.6/flutter/bin/flutter"
  )

  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

FLUTTER_BIN="$(find_flutter_bin || true)"
if [[ -z "$FLUTTER_BIN" ]]; then
  echo "Could not find flutter. Add Flutter to PATH or set FLUTTER_ROOT before archiving." >&2
  exit 1
fi

deep_clean=0
from_xcode=0
version_arg=""
build_arg=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --deep-clean)
      deep_clean=1
      shift
      ;;
    --from-xcode)
      from_xcode=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [[ -z "$version_arg" ]]; then
        version_arg="$1"
      elif [[ -z "$build_arg" ]]; then
        build_arg="$1"
      else
        echo "Unexpected argument: $1" >&2
        usage >&2
        exit 2
      fi
      shift
      ;;
  esac
done

current_version="$(sed -nE 's/^version:[[:space:]]*([^[:space:]]+).*/\1/p' pubspec.yaml | head -n 1)"

if [[ -n "$version_arg" && -n "$build_arg" ]]; then
  release_version="${version_arg}+${build_arg}"
elif [[ -n "$version_arg" ]]; then
  release_version="$version_arg"
else
  release_version="$current_version"
fi

if [[ ! "$release_version" =~ ^[0-9]+(\.[0-9]+){2}\+[0-9]+$ ]]; then
  echo "pubspec.yaml must use version format x.y.z+build before App Store release." >&2
  echo "Current: ${current_version:-missing}" >&2
  echo "Example: pnpm --filter @zapengine/mobile ios:release:prepare -- 2.0.1+13" >&2
  exit 1
fi

build_name="${release_version%%+*}"
build_number="${release_version##*+}"

if [[ "$current_version" != "$release_version" ]]; then
  perl -0pi -e "s/^version:\s*.*/version: ${release_version}/m" pubspec.yaml
fi

rm -f ios/Flutter/Generated.xcconfig
rm -f ios/Flutter/flutter_export_environment.sh
rm -rf build ios/build

if [[ "$deep_clean" == "1" ]]; then
  find "$HOME/Library/Developer/Xcode/DerivedData" -maxdepth 1 -type d -name 'Runner-*' -prune -exec rm -rf {} + 2>/dev/null || true
fi

"$FLUTTER_BIN" pub get
"$FLUTTER_BIN" build ios --release --config-only --build-name="$build_name" --build-number="$build_number"

generated_config="ios/Flutter/Generated.xcconfig"
actual_name="$(sed -nE 's/^FLUTTER_BUILD_NAME=(.*)$/\1/p' "$generated_config")"
actual_number="$(sed -nE 's/^FLUTTER_BUILD_NUMBER=(.*)$/\1/p' "$generated_config")"

if [[ "$actual_name" != "$build_name" || "$actual_number" != "$build_number" ]]; then
  echo "Generated.xcconfig did not receive the expected release version." >&2
  echo "Expected: FLUTTER_BUILD_NAME=$build_name, FLUTTER_BUILD_NUMBER=$build_number" >&2
  echo "Actual:   FLUTTER_BUILD_NAME=$actual_name, FLUTTER_BUILD_NUMBER=$actual_number" >&2
  exit 1
fi

echo "Prepared iOS release $build_name ($build_number)."

if [[ "$from_xcode" != "1" ]]; then
  echo "Next: open ios/Runner.xcworkspace, then Product > Archive."
fi
