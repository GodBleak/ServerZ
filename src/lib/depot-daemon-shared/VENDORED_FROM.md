# Vendored depot-daemon shared boundary

Canonical source: `../depot-daemon/src/shared/`

Vendored via Git subtree from the local `depot-daemon` remote:

```bash
bun run update:depot-daemon-subtrees
```

Vendored files:

- `depot-client.config.schema.ts`
- `depot-daemon.config.schema.ts`
- `depot-daemon-api.ts`
- `index.ts`

ServerZ keeps schema imports on `@sinclair/typebox` because its config/docs pipeline uses that TypeBox package directly. The daemon source uses `@feathersjs/typebox` for Feathers app typing compatibility. After subtree pulls, reapply that import adaptation and the `depot-daemon-api.ts` depot-client import path adaptation.
