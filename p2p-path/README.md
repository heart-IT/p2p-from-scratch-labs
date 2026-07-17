# p2p-path — heartIT lab #9

Companion lab for **Part 1, "The Internet is Hostile"**, of the **P2P from
Scratch** series on [heartit.tech](https://heartit.tech).

Connection anatomy: make the invisible visible. The DHT knows things about
you that your own machine does not — this lab prints what it knows, stamps
every step of a connection with real milliseconds, and reads the resulting
path honestly: punched, direct, or relayed.

```
npx @heart-it/p2p-path swordfish
```

Same phrase, two terminals — better, two networks (laptop + phone hotspot),
because same-LAN peers connect directly and skip the punch entirely.

## What you'll see

- the **topic** (a salted hash of your passphrase — the DHT sees the hash,
  never the phrase)
- `[t+Nms]` **timeline stamps** as they truly happen: topic joined, announce
  landed on the DHT, connection open — lines land in real async order, which
  can vary between runs
- a `[you]` block once the DHT has finished measuring you: your **external
  address** as remote nodes sampled it (on a port-randomizing NAT the port
  reads `(varies)` — there is no consensus port, and that *is* the
  diagnosis), **firewalled** true/false from an actual inbound probe, your
  **nat port** behavior (consistent vs randomized), and your **dht role**
  (ephemeral vs persistent)
- a `[path]` block per connection: the remote `host:port` and what range it
  sits in (loopback / private / CGNAT 100.64/10 / public), our local socket
  port, an **evidence** line — the node's own punch and relay counters
  diffed across this connection — and a **verdict** built from that
  evidence, not from the address
- one tiny **message each way**, so you see the path carry data; then it
  stays open until ctrl+c

## What it maps to

- **NAT behavioral classes** — the `[you]` block is the node's live NAT
  test: *consistent* NATs reuse one external port (the easy punch),
  *randomizing* NATs pick a fresh port per destination (the hard case,
  solved by birthday-paradox port spraying). `firewalled` decides who must
  fire first: a firewalled node cannot be cold-dialed — every connection to
  it starts with its own outbound packet.
- **Holepunching is a timing problem** — both sides must fire UDP inside
  the same coordinated window, signaled through the DHT. That's why every
  line carries a millisecond stamp: a "dead peer" is often just a slow
  timeline, not an unreachable machine.
- **Why the address can't prove the path** — a hole-punched and a relayed
  connection both show a public `host:port` (for a relayed one it's the
  relay's address). The connection object carries no per-connection relay
  flag, so the lab diffs the DHT node's honest counters instead —
  `dht.stats.punches` (open / consistent / random) and
  `dht.stats.relaying.successes` — and when none of them moved, the verdict
  says *unproven* rather than guessing.
- **DHT node lifecycle** — announcing stores your signed keypair record on
  the nodes closest to the topic hash; `flush()` resolves only once that
  record has actually landed. Every node starts *ephemeral* (queries, stores
  nothing, so churn never hurts the routing tables) and graduates to
  *persistent* only after ~20 minutes of stable, un-firewalled uptime.

## Publishing checklist (maintainer)

**npm (current distribution):**

```
npm publish --access public
```

**Pear (when `pear install` stabilizes):** the `pear` block in package.json is
already staged for it. Mind two things:

1. `pear touch` mints the pear:// link once; then `pear stage pear://<key> .`
   and `pear release pear://<key>`; keep it available with
   `pear seed pear://<key>` on an always-on peer.
2. `pear stage` has **no default ignores** since v2.4 — the `pear.stage.ignore`
   list in package.json is load-bearing. Anything staged into the drive is
   public and content-addressed forever; verify with `pear info` before the
   first release. (`pear run` is deprecated/removed — end users arrive via
   `pear install` once it ships stable.)

The lab stays small on purpose. Readers should be able to hold the whole
thing in their head — that's the point.
