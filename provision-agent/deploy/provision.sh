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
# Used when writing a customer's ingest env file. Constants here, not
# environment variables: sudo's env_reset strips anything passed in, so a
# setting would silently do nothing.
API_URL="https://iot-apps-backend.vercel.app"
FILE_PREFIXES="WindSonic_"
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
# Password generator.
#
# NOT `tr -dc ... < /dev/urandom | head -c 24`. That is the obvious form and it is
# fatal here: `head` exits after 24 bytes, `tr` is killed by SIGPIPE (141), and
# with `set -euo pipefail` at the top of this file the whole script aborts —
# AFTER `useradd` has run but BEFORE the chroot chown and the folder creation.
# The result is a half-provisioned account and a failed job, every single time.
#
# Reading a bounded chunk first means `tr` sees EOF and exits 0, so no pipe is
# ever broken. bash then slices to length. 512 random bytes yields ~380
# alphanumerics on average — far more than the 24 needed.
gen_password() {
  local raw
  raw="$(head -c 512 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' || true)"
  printf '%s' "${raw:0:24}"
}

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

    # GROUP-OWNED, not owned by the account alone.
    #
    # The customer owns these files, but the ingest agent has to read them and
    # rename them out into staging. It runs as its own user in $GROUP, so a
    # folder created `-g "$account" -m 750` locks it out completely: a properly
    # provisioned customer could upload happily and nothing would ever collect
    # the files. 2770 gives the group read AND write (a rename needs write on
    # the directory), setgid keeps new tower folders in the same group, and
    # `other` has nothing — so customers still cannot see each other.
    install -d -o "$account" -g "$GROUP" -m 2770 "$home/upload"
    install -d -o "$account" -g "$GROUP" -m 2770 "$home/upload/$folder"

    # The ingest agent's working directories, created HERE because only root can
    # write into the chroot home (it must stay root-owned or sshd refuses the
    # session). The agent cannot make them itself and simply died with ENOENT on
    # every poll for a newly provisioned customer.
    #
    # Group-owned so any $GROUP member — the agent — can move files between them.
    for d in staging archive quarantine; do
      install -d -o root -g "$GROUP" -m 2770 "$home/$d"
    done

    printf '{"ok":true,"account":"%s","home":"%s","folder":"%s","password":"%s"}\n' \
      "$account" "$home" "$folder" "$password"
    ;;

  enableIngestAgent)
    # Install this customer's OWN ingest agent.
    #
    # An ingest token is scoped to one organisation — the server refuses a token
    # uploading for a customer it does not belong to — so a shared agent cannot
    # serve more than one customer. Each gets its own systemd instance and its
    # own credential.
    #
    # The token arrives on STDIN, never as an argument: argv is world-readable
    # through `ps`, and this box also terminates untrusted SFTP logins.
    id -u "$account" >/dev/null 2>&1 || die "no such account"
    read -r token || true
    [ -n "${token:-}" ] || die "no ingest token supplied on stdin"
    case "$token" in
      obsi_*) : ;;
      *) die "token is not an ingest credential" ;;
    esac

    envfile="/etc/observator-ingest-${account}.env"
    umask 077
    cat > "$envfile" <<ENVEOF
OBSERVATOR_API_URL=${API_URL}
OBSERVATOR_ACCOUNT=${account}
OBSERVATOR_ROOT_DIR=/home/${account}
OBSERVATOR_INGEST_TOKEN=${token}
OBSERVATOR_FILE_PREFIXES=${FILE_PREFIXES}
OBSERVATOR_MAX_FILES=20
OBSERVATOR_TIMEOUT_MS=120000
ENVEOF
    chown root:root "$envfile"
    chmod 0600 "$envfile"

    systemctl enable --now "observator-ingest@${account}.service" >/dev/null 2>&1 \
      || die "could not enable observator-ingest@${account}"

    printf '{"ok":true,"account":"%s","service":"observator-ingest@%s"}\n' "$account" "$account"
    ;;

  disableIngestAgent)
    id -u "$account" >/dev/null 2>&1 || die "no such account"
    systemctl disable --now "observator-ingest@${account}.service" >/dev/null 2>&1 || true
    # The credential file goes; the customer's FILES are never touched.
    rm -f "/etc/observator-ingest-${account}.env"
    printf '{"ok":true,"account":"%s","disabled":true}\n' "$account"
    ;;

  createStationFolder)
    [ -n "$folder" ] || die "folder is required"
    id -u "$account" >/dev/null 2>&1 || die "no such account"
    install -d -o "$account" -g "$GROUP" -m 2770 "$home/upload/$folder"
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
