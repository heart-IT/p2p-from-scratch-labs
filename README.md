# P2P from Scratch — labs

Runnable companion labs for the [P2P from Scratch](https://heartit.tech) series.
Real Holepunch-stack software, each small enough to read in one sitting —
that's the point.

| Part | Lab | One command | Teaches |
|---|---|---|---|
| 1 | [`p2p-hello`](./p2p-hello) | `npx @heart-it/p2p-hello <phrase>` | DHT discovery, hole-punching, encrypted transport |
| 2 | [`p2p-channels`](./p2p-channels) | `npx @heart-it/p2p-channels <phrase>` | Protomux channels over one Secret Stream, compact encoding on the wire |
| 3 | [`p2p-append-only`](./p2p-append-only) | `npx @heart-it/p2p-append-only` | Merkle roots move on append; forks announce truncation |
| 4 | [`p2p-sparse-db`](./p2p-sparse-db) | `seed` / `read <key>` | Sparse Hyperbee range queries — kilobytes, not the database |
| 5 | [`p2p-swarm-watch`](./p2p-swarm-watch) | `npx @heart-it/p2p-swarm-watch <phrase>` | Announce vs lookup, churn, reconnects, live |
| 6 | [`p2p-one-truth`](./p2p-one-truth) | `new` / `join <key>` | Two Autobase writers converging on one deterministic view |
| 7 | [`p2p-identity`](./p2p-identity) | `npx @heart-it/p2p-identity` | Mnemonic → identity → device attestation chains → verify |
| 8 | [`p2p-sync-states`](./p2p-sync-states) | `write` / `follow <key>` | Offline-first writes, late-join backfill, honest sync indicators |

Going deeper — a second lab for the parts with the most to show:

| Part | Lab | One command | Teaches |
|---|---|---|---|
| 1 | [`p2p-path`](./p2p-path) | `npx @heart-it/p2p-path <phrase>` | Connection anatomy: what the DHT knows about you, holepunch timing, honest path verdicts |
| 4 | [`p2p-drop`](./p2p-drop) | `seed` / `get <key> [file]` | Hyperdrive's two cores: list a drive from metadata, download one file, skip the rest |
| 6 | [`p2p-quorum`](./p2p-quorum) | `new` / `join <key>` ×2 | Three indexers: majority keeps the checkpoint advancing through a partition |
| 7 | [`p2p-invite`](./p2p-invite) | `new` / `join <invite>` | Blind pairing: an invite admits a stranger without ever containing the key |

Every lab is dual-runtime (Node ≥18 today via `npx`; Bare/Pear-ready via
conditional imports and a staged `pear` config) and carries its own README
with what-you'll-see notes.

No servers, no accounts. Kill a lab and nothing remains — storage, where a
lab needs any, is a temp directory wiped on exit.
