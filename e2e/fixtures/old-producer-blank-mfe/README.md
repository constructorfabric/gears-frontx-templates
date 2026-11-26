A real build of the blank microfrontend by an older producer, kept as it was
emitted (its `mfe-manifest.json` carries `shared[]` and the older-producer
fields, no `units` or `lists`), pruned to what the mount loads: the files no load reads
(`remoteEntry.js`, `mf-*.json`, `@mf-types*`, `index.html`) and the chunks no
test requested are removed. `mfe-manifest.json` is verbatim old-producer output,
including its `exposeAssets`; the locale chunks in its `js.async` are not shipped
because no test switches language.
`compat-older-producer.spec.ts` serves it next to the current shell.
