# Provisioning agent — install

Ordered so the box is never in a state where the agent can run something
unverified.

```bash
# 1. Unprivileged service account. No login, no home to write into.
sudo useradd --system --shell /usr/sbin/nologin --no-create-home obsprov

# 2. Code, owned by root — the agent must not be able to modify itself.
sudo install -d -o root -g root -m 755 /opt/observator/provision-agent
sudo rsync -a --chown=root:root dist/ deploy/ /opt/observator/provision-agent/

# 3. The privileged helper: root-owned, not writable by anyone else.
#    The agent verifies this at startup and refuses to run if it is wrong.
sudo chown root:root /opt/observator/provision-agent/deploy/provision.sh
sudo chmod 0500      /opt/observator/provision-agent/deploy/provision.sh

# 4. The single sudo rule. VALIDATE FIRST — a bad sudoers file locks out sudo.
sudo visudo -c -f deploy/observator-provision.sudoers
sudo install -o root -g root -m 0440 \
  deploy/observator-provision.sudoers /etc/sudoers.d/observator-provision

# 5. Credentials. Mode 0400: the token can create Unix accounts.
sudo install -d -o root -g obsprov -m 750 /etc/observator
sudo install -o root -g obsprov -m 0640 /dev/null /etc/observator/provision-agent.env
# OBSERVATOR_API_URL=https://api.example.com
# OBSERVATOR_PROVISION_TOKEN=obsp_...        <- kind:'provision', NOT the ingest token
# OBSERVATOR_AGENT_ID=wxbox-1
#
# There is deliberately NO setting here for the SFTP group or the upload root.
# sudo's env_reset strips environment variables before the helper runs, so such a
# setting would silently do nothing. Both are constants at the top of
# provision.sh, which is root-owned — change them there, and keep GROUP in step
# with the `Match Group` block in sshd_config.

# 6. Start.
sudo install -o root -g root -m 0644 \
  deploy/observator-provision.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now observator-provision
```

## Configure sshd ONCE, by hand

The agent never edits `sshd_config` — a script that does, running unattended,
can lock everyone out of the box. Add this block yourself:

```
Match Group sftpusers
    ChrootDirectory %h
    ForceCommand internal-sftp
    AllowTcpForwarding no
    X11Forwarding no
```

The chroot target (`%h`) must be **root-owned and not group- or world-writable**,
which is why `provision.sh` chowns the home directory to root and puts the
station's writable area at `~/upload`.

## Verifying it is safe

```bash
# Helper cannot be modified by the agent user:
sudo -u obsprov test -w /opt/observator/provision-agent/deploy/provision.sh && echo UNSAFE || echo ok

# The agent can run exactly one command as root, and nothing else:
sudo -l -U obsprov

# Nothing is listening for this agent:
sudo ss -ltnp | grep -i provision || echo "ok — no inbound port"
```
