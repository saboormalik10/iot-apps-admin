# Provisioning — security review

Provisioning is **remote code execution by design**: a value the platform accepts
becomes an argument to a root-level command on the SFTP box. This is the review
of that path (M21 W4), the findings it produced, and how to re-run it.

## The threat model

The thing being prevented is a string reaching `useradd`, `chpasswd` or
`install` in a form the shell would interpret. Secondary: a compromised agent
escalating to root, and a compromised backend queuing something arbitrary.

## Controls

| Control | Where | Why this one |
|---|---|---|
| Fixed job **enum** | queue + agent | The agent never receives a command. A compromised backend can queue a job; it cannot invent one. |
| Allow-list validation ×3 | API, queue, root script | Never an escape, never a deny-list. Three layers so no single mistake is sufficient. |
| `execFile`, argument **array** | agent | There is no shell to inject into. |
| Separate `kind:'provision'` credential | backend guard | The ingest token lives on the same box and is used every minute. A leak of the more exposed token must not create Unix accounts. |
| Outbound-only polling | agent | No inbound port, no TLS cert, no listening service on the box. |
| Root-owned `0500` helper + **startup self-check** | agent | If the agent could write the script, compromising the agent would equal root. Checked before the agent will start. |
| Single `sudo` rule, no wildcard | sudoers | One exact path. `sudo -l -U obsprov` should list one line. |
| `sshd_config` **never touched** | policy | A script editing it, unattended, can lock everyone out of the box. |
| Lock, never `userdel --remove` | script | Uploads are retained permanently by client instruction. |
| Passwords: one-read, never stored | backend | The job document is readable for 90 days and lands in backups. |

## Findings from this review

1. **`sudo` strips the environment (`env_reset`), so the agent's
   `OBSERVATOR_SFTP_GROUP` / `OBSERVATOR_UPLOAD_ROOT` never reached the script.**
   Worse than useless: a deployment setting a different group would have created
   accounts in the wrong one and broken the sshd chroot, silently. Both are now
   constants in the root-owned script, and the options are gone.
2. **The mode branch of the helper self-check was untestable.** The ownership
   check necessarily fires first, so no non-root test could reach it — a safety
   check being taken on trust. Split into `isSafeOwner` / `isSafeMode` and tested
   directly.
3. **Collecting a generated password was a `GET` that mutated state.** A proxy
   prefetch or browser preload would silently consume it. Now a throttled `POST`.
4. **`validateArgs` whitelisted away `stationAccountId`** (found in W3), so a
   station restore queued successfully and then never reconnected — a silent
   no-op with no error anywhere.
5. **A TTL index on the secret's expiry would have deleted the whole job
   document** (found in W3), erasing the provisioning audit trail minutes after
   every rotation. MongoDB TTLs remove documents, not fields. Expiry is enforced
   on read.

## Re-running the review

```bash
# All three validation layers agree on the same corpus (a divergence is a finding)
cd provision-agent && npm test          # cross-layer.test.ts, safety.test.ts, runner.test.ts
cd ../backend && npm test -- provision  # the same corpus, plus the queue

# On the box
sudo -l -U obsprov                       # must be exactly one command
sudo -u obsprov test -w /opt/observator/provision-agent/deploy/provision.sh \
  && echo UNSAFE || echo ok              # the agent must not be able to write it
sudo ss -ltnp | grep -i provision || echo "ok — no inbound port"
```

## Known and accepted

- **Disk is reported, not quota'd.** A hard quota would refuse a legitimate
  upload, and the logger has nowhere to put a rejected file — data loss at the
  source. Since uploads are retained by instruction, the control is visibility.
- **No IP allow-list.** The client confirmed (25 Aug 2026) their telemetry
  devices have no public IPs. Credential plus folder scoping is the boundary.
- **`trust proxy` is unset in `main.ts`**, so rate limiting buckets by the
  proxy's address behind a load balancer. It no longer blocks anything here, but
  it should be configured before the throttles mean much in production.
