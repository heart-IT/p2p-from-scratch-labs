# Verifying the series against a live Holepunch stack

Every specific claim in *P2P from Scratch* — a constant, a default, a wire
format, a byte count — is asserted here against the real packages. Dependencies
are floating (`*`) on purpose: `npm install` pulls whatever Holepunch publishes
today, so a failure means the stack moved and a post needs updating.

```sh
cd verify
npm install
npm run verify
```

`src-asserts.js` reads the installed source and checks the constants and shapes
the posts cite. `run-asserts.js` executes the behaviour: it spins up a testnet,
records which Noise pattern a real Hyperswarm connection negotiates, drives the
NAT classifier down all four paths, measures secret-stream framing, captures
replication messages off the wire, and builds both Autobase view shapes.

Exit code is non-zero if any assertion fails, so it drops into CI as-is.

## What a failure means

Not necessarily a bug. It means a published sentence no longer matches the
code, which is exactly what this is for. The assertion names map onto the
claims, so a failure names the sentence to fix.

## Known drift this caught

`corestore` 7.11 flushed the database inside `suspend()`. 7.12 removed that
call. Part 8 asserted the flush, so Part 8 was wrong until it was rewritten.
