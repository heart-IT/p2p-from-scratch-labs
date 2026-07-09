# p2p-swarm-watch — heartIT lab #5

Companion lab for **Part 5: Finding Peers: DHT Discovery, Swarm Lifecycle, and Peer Graphs** of the P2P from Scratch series on
[heartit.tech](https://heartit.tech). No servers, no accounts; storage (if
any) is a throwaway temp dir wiped on exit.

```
npx @heart-it/p2p-swarm-watch <passphrase>
```

## What you'll see

- announce (server) vs lookup (client) roles on the same topic
- peers arriving with their transport path, leaving, reconnecting
- churn narrated as weather, not failure

## What it maps to

Topic-based discovery on a Kademlia DHT with Sybil-resistant node IDs; the swarm keeps a peer list and retries so you don't have to.
