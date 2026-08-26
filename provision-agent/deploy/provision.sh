#!/usr/bin/env bash
# The ONLY privileged action in the system. Runs as root via a single sudo rule.
#
# Contract: called as `provision.sh <subcommand> <account> [folder]`, prints ONE
# JSON object on stdout, exits non-zero on failure.
#
# HARDENING NOTES — read before editing:
#   * This file must be root:root 0500. The agent user must NOT be able to write
#     it, or compromising the agent would be equivalent to root. The agent checks
#     ownership and mode at startup and refuses to run otherwise.
#   * Arguments are re-validated HERE. The backend and the agent both validate
#     too; this is the third layer, and the one that runs as root.
#   * `sshd_config` is NEVER touched. The chroot/Match block is configured once,
#     by hand, at install time. A script that edits sshd_config can lock everyone
#     out of the box, and it would run unattended.
set -euo pipefail

# DEPLOYMENT CONSTANTS. Defined here, in the root-owned script, and nowhere else.
#
# They are NOT read from the environment: sudo runs with `env_reset`, so an
# environment variable would be stripped before this script ever saw it — an
# option that silently did nothing. `GROUP` must match the `Match Group` block in
# sshd_config, which is configured by hand at install time; if you change one,
# change the other.
GROUP="sftpusers"
ROOT="/home"

die() { printf '%s\n' "$1" >&2; exit 1; }

# ── Argument validation (third layer, running as root) ───────────────────────
subcommand="${1:-}"
account="${2:-}"
folder="${3:-}"

[[ "$account" =~ ^[a-z][a-z0-9_-]{2,31}$ ]] || die "invalid account name"
case "$account" in
  root|daemon|bin|sys|sshd|www-data|nobody|ubuntu|admin|administrator|ftp|sftp|observator|wxstation)
    die "reserved account name" ;;
esac

if [ -n "$folder" ]; then
  [[ "$folder" =~ ^[A-Za-z0-9][A-Za-z0-9\ _.-]{0,63}$ ]] || die "invalid folder name"
  case "$folder" in *..*) die "invalid folder name" ;; esac
fi

home="$ROOT/$account"

# A password is generated here and printed once. It is never written to disk,
# never logged, and the backend strips it from the stored job.
gen_password() { tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 24; }

case "$subcommand" in
  createStationAccount)
    [ -n "$folder" ] || die "folder is required"
    getent group "$GROUP" >/dev/null || groupadd "$GROUP"

    if id -u "$account" >/dev/null 2>&1; then
      # Idempotent: a retried job must not fail because the first attempt
      # half-succeeded before the report was delivered.
      :
    else
      useradd --create-home --home-dir "$home" --shell /usr/sbin/nologin --groups "$GROUP" "$account"
    fi

    password="$(gen_password)"
    printf '%s:%s' "$account" "$password" | chpasswd

    # The chroot target must be root-owned and not group/world writable, or sshd
    # refuses the session with a confusing "bad ownership" error.
    chown root:root "$home"
    chmod 755 "$home"

    install -d -o "$account" -g "$account" -m 750 "$home/upload"
    install -d -o "$account" -g "$account" -m 750 "$home/upload/$folder"

    printf '{"ok":true,"account":"%s","home":"%s","folder":"%s","password":"%s"}\n' \
      "$account" "$home" "$folder" "$password"
    ;;

  createStationFolder)
    [ -n "$folder" ] || die "folder is required"
    id -u "$account" >/dev/null 2>&1 || die "no such account"
    install -d -o "$account" -g "$account" -m 750 "$home/upload/$folder"
    printf '{"ok":true,"account":"%s","folder":"%s"}\n' "$account" "$folder"
    ;;

  rotateStationPassword)
    id -u "$account" >/dev/null 2>&1 || die "no such account"
    password="$(gen_password)"
    printf '%s:%s' "$account" "$password" | chpasswd
    printf '{"ok":true,"account":"%s","password":"%s"}\n' "$account" "$password"
    ;;

  disableStationAccount)
    id -u "$account" >/dev/null 2>&1 || die "no such account"
    # LOCKED, not deleted. Their uploaded files are retained permanently by
    # instruction, and userdel --remove would take the home directory with it.
    usermod --lock --expiredate 1 "$account"
    printf '{"ok":true,"account":"%s","locked":true}\n' "$account"
    ;;

  reportStationUsage)
    id -u "$account" >/dev/null 2>&1 || die "no such account"
    # READ ONLY. Deliberately not a quota: uploads are retained permanently by
    # the client's instruction, so refusing a write would lose data at the
    # source — the logger has nowhere else to put the file. Reporting lets an
    # operator move old archives to cold storage before the disk fills.
    bytes="$(du -sb "$home" 2>/dev/null | cut -f1)"
    bytes="${bytes:-0}"
    printf '{"ok":true,"account":"%s","bytes":%s}\n' "$account" "$bytes"
    ;;

  *)
    die "unknown subcommand: $subcommand"
    ;;
esac
