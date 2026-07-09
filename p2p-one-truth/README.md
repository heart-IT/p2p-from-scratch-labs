# p2p-one-truth — heartIT lab #6

Companion lab for **Part 6: Many Writers, One Truth: Autobase, Causal DAGs, and Quorum Consensus** of the P2P from Scratch series on
[heartit.tech](https://heartit.tech). No servers, no accounts; storage (if
any) is a throwaway temp dir wiped on exit.

```
npx @heart-it/p2p-one-truth new           # terminal 1
npx @heart-it/p2p-one-truth join <key>    # terminal 2 (key printed by terminal 1)
```

## What you'll see

- the joiner added as a writer THROUGH the log (membership is an op like any other)
- type in either terminal — both [view] columns converge to the same numbered order
- the apply function is pure: same log, same truth, every replica

## What it maps to

Event sourcing over a causal DAG: writers append concurrently, linearization is deterministic, and the add-writer handshake rides a Protomux channel next to replication (part 2, applied).
