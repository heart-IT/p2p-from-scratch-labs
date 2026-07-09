# p2p-hello — heartIT lab #1

Companion lab for the **P2P from Scratch** series on [heartit.tech](https://heartit.tech).

Two strangers run one command with the same passphrase. Their machines find
each other through the Hyperswarm DHT, hole-punch a direct UDP path, open a
Noise-XX-encrypted stream, and say hello. No server, no account; kill it and
nothing remains.

```
npx @heart-it/p2p-hello swordfish
```

Run it in two terminals — better, on two networks (laptop + phone hotspot),
because same-LAN peers connect directly without needing the punch.

## What you'll see

- the 32-byte **topic** (a salted hash of your passphrase — the DHT sees the
  hash, never the phrase)
- the peer's **Noise key** (their ephemeral identity for this session)
- the **UDP path** — their actual `host:port`, meaning the connection was
  hole-punched, not relayed
- an end-to-end **encrypted hello** (secret-stream won't give you less)

Each line maps to a part of the series: DHT announce/lookup, reflexive
address discovery, the punch, and the encrypted transport on top.

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

The lab is intentionally ~80 lines. Readers should be able to hold the whole
thing in their head — that's the point.
