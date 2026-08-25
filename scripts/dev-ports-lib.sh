#!/usr/bin/env bash
# scripts/dev-ports-lib.sh
#
# Port preflight for `pnpm dev`. Source this file; do not execute it.
#
# A dev server outlives the terminal that started it, keeps its port, and keeps
# serving a module graph pinned to a node_modules layout that a later
# `pnpm install` has already rewritten — so the bundle 500s while `pnpm dev`
# looks healthy: Expo prints one "port is being used" line, then idles instead
# of exiting, and that line drowns in turbo's log stream. Reclaim the port
# before turbo starts so the failure cannot stay silent.
#
# Ownership is decided by cwd, never by matching the command string: only a
# process whose cwd is inside this repo is ours to kill. Anything else is
# reported and the run aborts.

_DEVPORTS_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEVPORTS_ROOT_DIR="$(cd "$_DEVPORTS_LIB_DIR/.." && pwd)"

# Everything below decides who may be killed by asking whether a path sits
# under DEVPORTS_ROOT_DIR. A root that silently degraded to "/" would answer
# yes for every process on the machine, so refuse to load rather than arm that.
if [ -z "$DEVPORTS_ROOT_DIR" ] || [ "$DEVPORTS_ROOT_DIR" = "/" ] ||
  [ ! -f "$DEVPORTS_ROOT_DIR/scripts/dev-ports-lib.sh" ]; then
  echo "❌ dev-ports-lib.sh could not resolve the repo root (got '${DEVPORTS_ROOT_DIR:-}')." >&2
  echo "   Source it from bash — zsh has no BASH_SOURCE." >&2
  return 1 2>/dev/null || exit 1
fi

# A listener is abandoned when it is orphaned (PPID 1 — its terminal is gone)
# or older than this. 0 drops the age rule, leaving orphanhood as the only
# signal.
DEVPORTS_STALE_HOURS="${ZAP_DEV_STALE_HOURS:-12}"

# app web and landing hardcode their port in their own dev script, so there is
# nothing to override. The other three read the names already defined in
# the canonical dev environment, which dev.sh receives from env/run.mjs.
DEVPORTS_APP_WEB=8081
DEVPORTS_LANDING=3000
DEVPORTS_ACCOUNT="${ACCOUNT_ENGINE_PORT:-3004}"
DEVPORTS_ANALYTICS="${ANALYTICS_ENGINE_PORT:-8001}"
DEVPORTS_ALPHA_ETL="${ALPHA_ETL_PORT:-3003}"

# dev_ports_for <subcommand>: ports the given `pnpm dev` stack needs to bind.
# Mirrors the case dispatch in dev.sh; `stop` reclaims every known port.
dev_ports_for() {
  case "$1" in
    "") echo "$DEVPORTS_APP_WEB $DEVPORTS_ACCOUNT $DEVPORTS_ANALYTICS" ;;
    web | app) echo "$DEVPORTS_APP_WEB" ;;
    api) echo "$DEVPORTS_ACCOUNT" ;;
    landing) echo "$DEVPORTS_LANDING" ;;
    analytics) echo "$DEVPORTS_ANALYTICS" ;;
    all | stop)
      echo "$DEVPORTS_APP_WEB $DEVPORTS_LANDING $DEVPORTS_ALPHA_ETL $DEVPORTS_ACCOUNT $DEVPORTS_ANALYTICS"
      ;;
    *) return 1 ;;
  esac
}

# dev_port_listeners <port>: PIDs listening on the port, one per line. Empty
# when free — lsof exits non-zero on no match, which is not an error here.
dev_port_listeners() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | sort -u || true
}

# dev_proc_cwd <pid>: the process's working directory, empty if unreadable.
dev_proc_cwd() {
  lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1 || true
}

# dev_proc_is_ours <pid>: true when the process runs out of this repo. This is
# the only ownership test — command strings are shared by unrelated checkouts.
dev_proc_is_ours() {
  local cwd
  cwd="$(dev_proc_cwd "$1")"
  [ -n "$cwd" ] || return 1
  [ "$cwd" = "$DEVPORTS_ROOT_DIR" ] || [[ "$cwd" == "$DEVPORTS_ROOT_DIR"/* ]]
}

# _dev_etime_to_seconds <etime>: parse ps(1) [[DD-]HH:]MM:SS. macOS ps has no
# `etimes` keyword, so the elapsed time has to be parsed by hand. 10# forces
# base 10 — zero-padded fields would otherwise read as octal.
_dev_etime_to_seconds() {
  local etime="$1" days=0 hours=0 mins=0 secs=0 a b c
  [ -n "$etime" ] || return 1

  if [[ "$etime" == *-* ]]; then
    days="${etime%%-*}"
    etime="${etime#*-}"
  fi

  IFS=: read -r a b c <<<"$etime"
  if [ -n "${c:-}" ]; then
    hours="$a" mins="$b" secs="$c"
  else
    mins="$a" secs="${b:-0}"
  fi

  echo $((10#$days * 86400 + 10#$hours * 3600 + 10#$mins * 60 + 10#$secs))
}

# dev_proc_age_seconds <pid>: seconds since the process started.
dev_proc_age_seconds() {
  local etime
  etime="$(ps -o etime= -p "$1" 2>/dev/null | tr -d ' ')" || return 1
  _dev_etime_to_seconds "$etime"
}

# dev_proc_is_abandoned <pid>: nobody is watching this process — either its
# parent shell is gone, or it has been up long enough to be a leftover.
dev_proc_is_abandoned() {
  local pid="$1" ppid age

  ppid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')" || return 1
  [ "$ppid" = "1" ] && return 0

  [ "$DEVPORTS_STALE_HOURS" -gt 0 ] || return 1
  age="$(dev_proc_age_seconds "$pid")" || return 1
  [ "$age" -gt $((DEVPORTS_STALE_HOURS * 3600)) ]
}

# dev_proc_describe <pid>: one line of identifying detail for a message.
dev_proc_describe() {
  local pid="$1" age cmd
  age="$(ps -o etime= -p "$pid" 2>/dev/null | tr -d ' ')" || age="?"
  cmd="$(ps -o command= -p "$pid" 2>/dev/null | cut -c1-100)" || cmd="?"
  printf 'pid=%s up=%s %s' "$pid" "${age:-?}" "${cmd:-?}"
}

_dev_pgid_of() {
  ps -o pgid= -p "$1" 2>/dev/null | tr -d ' ' || true
}

# _dev_descendants <pid>: pid plus every process below it, depth-first.
_dev_descendants() {
  local pid="$1" child
  echo "$pid"
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    _dev_descendants "$child"
  done
}

# _dev_self_lineage: our own PID and every ancestor up to init. Nothing in this
# chain may ever be signalled — it includes the shell the user is typing into.
_dev_self_lineage() {
  local pid=$$
  while [ -n "$pid" ] && [ "$pid" != "0" ] && [ "$pid" != "1" ]; do
    echo "$pid"
    pid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ' || true)"
  done
}

# _dev_kill_specs <pid>: what to hand kill(1) — a negative PGID to take down
# the whole tree (pnpm wrapper -> expo cli -> nativewind daemons) in one shot,
# or, when the group cannot be trusted, the individual descendant PIDs.
#
# The group is only usable when it is not our own, contains no ancestor of
# ours, and every member belongs to this repo. Job control normally puts a
# foreground pipeline in its own group, but that is a convention, not a
# guarantee — verify instead of assuming.
_dev_kill_specs() {
  local pid="$1" pgid own_pgid member lineage
  lineage=" $(_dev_self_lineage | tr '\n' ' ')"

  pgid="$(_dev_pgid_of "$pid")"
  own_pgid="$(_dev_pgid_of $$)"

  if [ -n "$pgid" ] && [ "$pgid" != "0" ] && [ "$pgid" != "1" ] &&
    [ "$pgid" != "$own_pgid" ]; then
    local group_is_ours=1
    for member in $(ps -o pid= -g "$pgid" 2>/dev/null | tr -d ' ' || true); do
      if [[ "$lineage" == *" $member "* ]] || ! dev_proc_is_ours "$member"; then
        group_is_ours=0
        break
      fi
    done
    if [ "$group_is_ours" = "1" ]; then
      echo "-$pgid"
      return 0
    fi
  fi

  local candidate
  while IFS= read -r candidate; do
    [ -n "$candidate" ] || continue
    [[ "$lineage" == *" $candidate "* ]] && continue
    echo "$candidate"
  done < <(_dev_descendants "$pid")
}

_dev_signal() {
  local sig="$1" spec
  shift
  for spec in "$@"; do
    kill "-$sig" "$spec" 2>/dev/null || true
  done
}

# _dev_wait_port_free <port> <attempts>: poll at 250ms. The port being free is
# the real success condition — a dead PID whose port is still bound is not.
_dev_wait_port_free() {
  local port="$1" attempts="$2"
  while [ "$attempts" -gt 0 ]; do
    [ -z "$(dev_port_listeners "$port")" ] && return 0
    sleep 0.25
    attempts=$((attempts - 1))
  done
  [ -z "$(dev_port_listeners "$port")" ]
}

# dev_reclaim_port <port> [--force]: free the port, or explain why not.
#
#   free                  -> nothing to do
#   held, not this repo   -> report, fail; never kill a stranger's server
#   held, ours, abandoned -> reclaim
#   held, ours, live      -> report, fail; someone may be debugging on it
#   held, ours, --force   -> reclaim regardless (`pnpm dev stop`)
dev_reclaim_port() {
  local port="$1" force="${2:-}" pids pid specs=()

  pids="$(dev_port_listeners "$port")"
  [ -n "$pids" ] || return 0

  for pid in $pids; do
    if ! dev_proc_is_ours "$pid"; then
      echo "❌ Port $port is held by a process outside this repo — leaving it alone." >&2
      echo "   $(dev_proc_describe "$pid")" >&2
      echo "   cwd: $(dev_proc_cwd "$pid")" >&2
      return 1
    fi
    if [ "$force" != "--force" ] && ! dev_proc_is_abandoned "$pid"; then
      echo "❌ Port $port is held by a dev server from this repo that still looks live." >&2
      echo "   $(dev_proc_describe "$pid")" >&2
      return 1
    fi
  done

  for pid in $pids; do
    while IFS= read -r spec; do
      [ -n "$spec" ] && specs+=("$spec")
    done < <(_dev_kill_specs "$pid")
    echo "♻️  Reclaiming port $port from $(dev_proc_describe "$pid")"
  done

  _dev_signal TERM "${specs[@]}"
  if ! _dev_wait_port_free "$port" 20; then
    _dev_signal KILL "${specs[@]}"
    _dev_wait_port_free "$port" 20
  fi

  if [ -n "$(dev_port_listeners "$port")" ]; then
    echo "❌ Port $port is still bound after SIGKILL — refusing to start on top of it." >&2
    echo "   $(dev_proc_describe "$(dev_port_listeners "$port" | head -1)")" >&2
    return 1
  fi
}

# dev_preflight_ports <subcommand> [--force]: reclaim every port the stack
# needs. ZAP_DEV_NO_RECLAIM=1 downgrades this to a warning for anyone who
# wants to manage their own processes.
dev_preflight_ports() {
  local sub="$1" force="${2:-}" port failed=0 pids

  if [ "${ZAP_DEV_NO_RECLAIM:-}" = "1" ]; then
    for port in $(dev_ports_for "$sub"); do
      pids="$(dev_port_listeners "$port")"
      [ -n "$pids" ] && echo "⚠️  Port $port in use (ZAP_DEV_NO_RECLAIM=1): $(dev_proc_describe "$(echo "$pids" | head -1)")" >&2
    done
    return 0
  fi

  # Every port is reported before bailing — one run should show the whole
  # picture rather than one blocker at a time. The remedy is printed once.
  for port in $(dev_ports_for "$sub"); do
    dev_reclaim_port "$port" "$force" || failed=1
  done

  if [ "$failed" = "1" ]; then
    echo "" >&2
    echo "   The ports above are still held. Stop those servers yourself, or run" >&2
    echo "   \`pnpm dev stop\` to release every port this repo owns." >&2
  fi

  return "$failed"
}
