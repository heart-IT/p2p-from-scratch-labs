# p2p-quorum — heartIT lab #11

Companion lab for **Part 6: Many Writers, One Truth: Autobase, Causal DAGs, and Quorum Consensus** of the P2P from Scratch series on
[heartit.tech](https://heartit.tech) — this one implements the part's
"Autobase Partition Recovery" capstone. No servers, no accounts; storage
is a throwaway temp dir wiped on exit.

```
npx @heart-it/p2p-quorum new           # terminal 1
npx @heart-it/p2p-quorum join <key>    # terminals 2 and 3 (key printed by terminal 1)
```

## What you'll see

- every joiner admitted THROUGH the log as a writer **and indexer** — a real 3-member quorum
- type in any terminal — all three [view] columns converge to the same numbered order
- a live `[quorum]` line whenever it changes: `writers 3 · agreed 12 of 14 seen` — *agreed* is what a majority of indexers has signed, *seen* is what this replica has applied; the gap is what consensus exists to close

## The experiment

1. Open all three terminals and type in each — every side converges, and `agreed` catches up to `seen` within a second or two (each ack round is a vote).
2. Ctrl-C terminal 3, keep typing in 1 and 2 — `agreed` KEEPS advancing: 2 of 3 indexers is a majority, so the checkpoint moves without the missing member.
3. Re-run the same `join` command in terminal 3 — it backfills the whole view, replays anything the majority reordered while it was gone, and converges.

The restarted terminal is a fresh temp store with a fresh local key, so it is re-admitted as a NEW writer — the `[quorum]` line honestly reads `writers 4` (three of them alive). Real apps persist their store so a returning device keeps its identity; this lab trades that for a zero-setup demo.

## What it maps to

Quorum consensus over a causal DAG: indexers ack what they have seen, and once a majority — ⌊n/2⌋+1, so 2 of 3 — acks a point, it becomes a signed checkpoint that can never reorder. That is why the checkpoint keeps advancing while one member is down, and why the returner replays against the AGREED order rather than its own: pending entries may still move, checkpointed ones cannot.
