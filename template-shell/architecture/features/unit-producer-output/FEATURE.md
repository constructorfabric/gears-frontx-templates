---
status: accepted
version: 1
date: 2026-11-20
description: "Feature: the output of the unit producer: shared chunks and their unit table, the fetch-list emission, the alias unit for an unhashed cycle location, the opaque-import report, and the producer's own tests that verify the output against the FrontX unit format contract."
---

# Feature: Unit Producer Output

- [x] `p1` - **ID**: `cpt-template-shell-featstatus-unit-producer-output`

<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Produce the unit output](#produce-the-unit-output)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Emit fetch lists](#emit-fetch-lists)
  - [Produce the host's units](#produce-the-hosts-units)
- [4. States (CDSL)](#4-states-cdsl)
  - [No lifecycle states](#no-lifecycle-states)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Fetch lists keyed per target](#fetch-lists-keyed-per-target)
  - [Producer output obligations](#producer-output-obligations)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

## 1. Feature Context

- [x] `p1` - `cpt-template-shell-feature-unit-producer-output`

### 1.1 Overview

The unit producer (`template-shell/packages/unit-producer`) turns the shared packages a build reaches into content-addressed chunks, a unit table and fetch lists, in the format the FrontX unit format contract fixes. The shell build and every microfrontend build call it. This feature specifies what the producer emits; the contract it emits against, and the runtime that reads the output, belong to FrontX.

### 1.2 Purpose

The FrontX runtime shares fetched text under the content identity a producer declares, so the output has to meet the contract exactly: every chunk content-addressed and declared, every fetch list complete, and nothing in the manifest beyond the unit table and the lists. A producer that breaks the contract breaks sharing or the load, so the producer verifies its own output in its own tests.

**Requirements**: the FrontX unit format contract (FrontX feature unit-format-contract, algorithm fetch-list-schema, cpt-frontx-algo-unit-format-contract-fetch-list-schema) and its producer output obligations (the producer-obligations paragraph of that algorithm).

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| Build author | Builds a shell or a microfrontend; receives chunks, `units` and `lists` for the manifest, and the opaque-import report. |

### 1.4 References

- **FrontX contract**: the FrontX unit format contract, feature unit-format-contract, algorithm cpt-frontx-algo-unit-format-contract-fetch-list-schema (the format, value formats, key forms, content identity, alias location form and the producer output obligations); content-keyed reuse is FrontX ADR-0034 (cpt-frontx-adr-shared-dep-reuse) and asset discovery FrontX ADR-0013 (cpt-frontx-adr-mfe-asset-discovery).
- **Dependencies**: None. The microfrontend build plugin consumes this output (`cpt-template-mfe-feature-mfe-fetch-list-assembly`).

## 2. Actor Flows (CDSL)

### Produce the unit output

- [x] `p1` - **ID**: `cpt-template-shell-flow-unit-producer-output-produce`

**Actor**: Build author

**Success Scenarios**:
- The build author builds a shell or microfrontend; the producer returns content-addressed chunks, the unit table and one flat fetch list per exposed module and per lazy target, and the runtime loads the output with content-keyed reuse.

**Error Scenarios**:
- A lazy chunk imports helpers from its entry chunk, so a cycle is spelled through an unhashed location: the producer publishes that alias file as a unit of its own with the same `contentHash` as the file it aliases, and the runtime resolves it like any other unit (see the alias unit step).
- A lazy target reaches a parent list's chunk through its alias: the alias unit is found on that parent list.
- A fully opaque `import(expr)` is reached: the build reports it with the emitted chunk's location and the call's line in the emitted code, and leaves the call native.
- A consumer import rewritten off a barrel lands on a module whose answering unit does not export every name the consumer imports from it (a nested barrel's entry chunk answers the paths of the modules it holds but exports only its own names): the import goes back to the barrel.
- A shared package's import of another shared package's barrel is rewritten to a module whose answering unit does not export the imported name: the import stays on the barrel specifier.
- The text of an emitted unit cannot be parsed to read its export names: the build fails naming the unit.
- More than one version of a shared package is reachable from the shared closure: the build fails naming the package, both versions and the package through which the second was reached.
- The shared packages import each other in a cycle: the build fails naming the cycle.
- A requested specifier has no answering chunk, so no fetch list can be emitted for it: the build fails naming the package and the specifier, and the skipped entry when one caused it.
- A list reaches a specifier of a delivered package that no emitted item answers, or an emitted item carries a relative import that no emitted item, lazy target or pattern file of the list and its parent chain carries: the build fails naming the list, the item and the specifier.
- A shared package's chunks would inline another shared package's modules, or the bundler fails on a package: the build fails naming the package.
- A file matching a pattern import imports other modules, or cannot be parsed to check that it does not: the build fails naming the file, since a pattern file is published as it is.
- A statically bounded pattern import matches no file, or names a directory that does not exist inside the package: the build fails naming the package, the chunk and the pattern's prefix.

**Steps**:
1. [x] - `p1` - The producer emits, for each exposed module and each lazy target, the shared chunks and the fetch list that describes them, following `cpt-template-shell-algo-unit-producer-output-emit-fetch-lists`; chunk bytes are fixed by `package@version` alone - `inst-produce-output`
2. [x] - `p1` - The producer returns the unit table and the fetch lists for the build to record in the manifest as `units` and `lists`, so every list references units by content identity that the unit table holds - `inst-record-manifest-entries`
3. [x] - `p1` - The producer describes shared code only through `units` and `lists`: it emits no `shared` entry and no whole-package file, so every shared file of its output is a unit that a list references - `inst-emit-no-whole-package`
4. [x] - `p1` - The producer verifies its own output against the producer output obligations (`cpt-template-shell-dod-unit-producer-output-obligations`) in its own tests - `inst-verify-own-output`
5. [x] - `p1` - **RETURN** output the FrontX runtime loads with content-keyed reuse - `inst-return-output`

## 3. Processes / Business Logic (CDSL)

### Emit fetch lists

- [x] `p1` - **ID**: `cpt-template-shell-algo-unit-producer-output-emit-fetch-lists`

**Input**: The exposed modules and lazy targets of a build, the shared packages they reach, the own chunks they reach statically, and each package's declared side-effect freedom

**Output**: A unit table and one flat fetch list per exposed module and per lazy target, in the format of the FrontX unit format contract

**Steps**:
1. [x] - `p1` - Determine each shared package's chunks by entry-point chunking: one chunk per entry point, overlapping internals in shared internal chunks, by deterministic bundler chunk splitting with fixed settings and no merging, so chunk bytes stay fixed; `exports` subpaths and barrel members stay units; one rule covers every package - `inst-determine-chunks`
   1. [x] - `p1` - Take as a package's entry set its `exports` subpaths plus every module a public barrel re-exports - `inst-compute-entry-set`
   2. [x] - `p1` - Split barrel members only when provably side-effect-free under the standard bundler semantics: the `sideEffects` field including its globs, where a pattern without a slash matches the file name in any directory; when the field is absent, only a barrel proven to be a pure re-export list - `inst-split-barrel-members`
   3. [x] - `p1` - Otherwise use the whole entry's chunk - `inst-keep-whole-entry`
2. [x] - `p1` - Keep every bare import in every chunk external and inline nothing across a package boundary - `inst-externalize-imports`
   1. [x] - `p1` - Compute a package's chunk boundaries and bytes from that package's own complete entry set, independent of any consumer - `inst-package-own-entry-set`
   2. [x] - `p1` - Include in a build's output only the chunks its own fetch lists reference - `inst-include-referenced-chunks`
3. [x] - `p1` - Key the build-machine cache entry of a package's computation by a content hash of its inputs - `inst-key-build-cache`
   1. [x] - `p1` - Take as inputs the package's own files, the content fingerprints of the packages its declared dependencies resolve to, the versions of the toolchain that runs inside the computation, and the producer's own built code and fixed settings - `inst-cache-key-inputs`
   2. [x] - `p1` - Hold no absolute location in a cache record or in its key, so an entry written from one install path answers any other - `inst-cache-record-portable`
4. [x] - `p1` - Write each shared chunk once in the unit table, each unit carrying `location`, `contentHash` (SHA-256 of the file's text, 64 lowercase hexadecimal characters), `answers` and `imports` (a bare specifier, or an intra-package relative edge as `{ unit: <contentHash> }`) - `inst-emit-units`
   1. [x] - `p1` - Write each fetch list's `units` as the content identities of every shared chunk the module or target reaches - `inst-list-units`
   2. [x] - `p1` - Answer every specifier a unit imports by exactly one unit on the combined lists of the module or target and its parent chain - `inst-answer-every-import`
   3. [x] - `p1` - Form no import cycle among the units of a load - `inst-no-unit-cycle`
5. [x] - `p1` - Return to the build, outside the manifest, the names each emitted unit exports, so a consumer import bound to a unit stands only when the unit exports the imported name - `inst-return-export-names`
6. [x] - `p1` - Carry on each fetch list `ownChunks`, the locations of the microfrontend's own chunks the exposed module or lazy target reaches statically, relative to `metaData.publicPath` or absolute http(s) URLs, with no content identity - `inst-emit-own-chunks`
7. [x] - `p1` - Key each fetch list by emitted chunk location, relative to the base that chunk resolves against - `inst-emit-lazy-lists`
   1. [x] - `p1` - Hold every lazy target (an own lazy chunk, or the target of a literal dynamic import inside a shared chunk) as a list of its own under the target's chunk location - `inst-lazy-key-location`
   2. [x] - `p1` - Hold the target of a bare dynamic import of a shared package (`import('pkg/sub')`) as a list of its own under that bare specifier - `inst-lazy-key-bare`
   3. [x] - `p1` - Hold in each lazy list only what the target needs beyond its parent chain's lists, and name it in the `lazy` array of every list that reaches it - `inst-lazy-delta`
   4. [x] - `p1` - Hold every file a statically bounded pattern import inside a shared chunk matches, found relative to the module that makes the call, as a list of its own, and name it in the `patterns` array - `inst-emit-pattern-lists`
   5. [x] - `p1` - Key and publish a pattern file at the location the call's computed path resolves to against the calling chunk's location, writing the file at the decoded path and keeping the encoded form in the list - `inst-pattern-file-location`
8. [x] - `p1` - **IF** two parents reach one lazy target - `inst-merge-shared-target`
   1. [x] - `p1` - Hold one list for the target, keyed by the target's location, that is the union of what the target needs beyond each parent chain, so a load through either parent finds every unit and own chunk the target needs - `inst-merge-union`
9. [x] - `p1` - Emit every chunk content-addressed, with the content hash in the file's location, and declare each unit's content identity in the unit table - `inst-emit-content-addressed`
10. [x] - `p1` - **IF** a lazy-chunk cycle is spelled through an unhashed location - `inst-emit-alias-unit`
   1. [x] - `p1` - Publish the unhashed alias file as a unit at its own location with the same `contentHash` as the content-addressed file it aliases, so the alias resolves to the same text under the same identity - `inst-alias-unit-publish`
11. [x] - `p1` - Report every fully opaque `import(expr)` against the emitted chunk's location and the call's line in the emitted code, in the producer's own output, outside the manifest; the call stays native - `inst-report-opaque-imports`
12. [x] - `p1` - Write only `units` and `lists` for shared code: no `shared` entry, no whole-package file - `inst-write-units-lists-only`
13. [x] - `p1` - **RETURN** the chunks, the unit table `units` and the fetch lists - `inst-return-lists`

### Produce the host's units

- [x] `p1` - **ID**: `cpt-template-shell-algo-unit-producer-output-host-production`

**Input**: The shell plugin's `unitsDir` option, and the host's emitted chunks with the consumer barrel rewrites applied to them

**Output**: The host's units and fetch lists in `unitsDir` of the build output, and the build report's cache summary

**Steps**:
1. [x] - `p1` - Reject a `unitsDir` that is empty, has an empty, `.` or `..` segment, is absolute, or is otherwise not a relative path strictly inside the build output, failing with an error that names `unitsDir`, before anything is written - `inst-validate-units-dir`
2. [x] - `p1` - Produce the units and lists for the specifiers the host's chunks import, then turn the consumer barrel rewrites no unit answers back to their barrel in the emitted chunks - `inst-produce-host-units`
3. [x] - `p1` - **IF** the chunks import a specifier after the fallback that they did not import before it, or no longer import one that they did (a specifier a chunk still imports dynamically is kept) - `inst-reproduce-after-fallback`
   1. [x] - `p1` - Remove only the files the first pass wrote, keeping whatever else the output directory holds, and produce again for the changed specifiers - `inst-remove-first-pass-files`
   2. [x] - `p1` - Fingerprint each package directory once across both producers, sharing the first producer's content-fingerprint memo with the second - `inst-share-content-fingerprints`
   3. [x] - `p1` - Merge the cache outcomes of both runs into one summary for the build report - `inst-merge-cache-summary`

## 4. States (CDSL)

### No lifecycle states

This FEATURE defines no state machines; the producer's output is a pure function of its inputs.

## 5. Definitions of Done

### Fetch lists keyed per target

- [x] `p1` - **ID**: `cpt-template-shell-dod-unit-producer-output-fetch-lists`

The producer **MUST** emit one flat fetch list per exposed module and per lazy target, each list keyed by the location of the chunk it describes (a lazy target of a bare dynamic import of a shared package, by that bare specifier), and **MUST** merge into one union list a target that two parents reach. It **MUST** publish an unhashed alias location as a unit carrying the same `contentHash` as the file it aliases. It **MUST** write only `units` and `lists` for shared code.

**Implements**:
- `cpt-template-shell-flow-unit-producer-output-produce`
- `cpt-template-shell-algo-unit-producer-output-emit-fetch-lists`
- `cpt-template-shell-algo-unit-producer-output-host-production`

**Touches**:
- Modules: `template-shell/packages/unit-producer`, `template-shell/packages/vite-plugin-shell`

### Producer output obligations

- [x] `p1` - **ID**: `cpt-template-shell-dod-unit-producer-output-obligations`

The producer's output **MUST** satisfy the FrontX producer output obligations: units and lists only, with no `shared` entry and no whole-package file; content identity, with every chunk content-addressed and every content identity a list names held by the unit table; complete fetch lists, with every shared chunk reachable from an exposed module on its fetch list, every own chunk it reaches statically in `ownChunks` and every import edge answered, including through re-export chains, namespace imports, `as default` and side-effectful barrels; acyclic units; delta lists; consumer independence, so two consumers using different subsets of a package get identical chunks for it; byte identity across builds of the same producer version; and, for the microfrontend's own code, the `__frontx_lazy` call emitted for every literal and every pattern dynamic import, with a fetch list per literal lazy target and none for a pattern import. The producer **MUST** verify its output against these obligations in its own tests.

**Implements**:
- `cpt-template-shell-flow-unit-producer-output-produce`
- `cpt-template-shell-algo-unit-producer-output-emit-fetch-lists`

**Touches**:
- Modules: `template-shell/packages/unit-producer`

## 6. Acceptance Criteria

- [x] Verified in the producer's own tests: shared packages are chunked by consumer-independent entry-point chunking: one chunk per entry point, overlapping internals in shared internal chunks; a package's chunk boundaries and bytes are computed from its own complete entry set (`exports` subpaths plus every module a public barrel re-exports), so every runtime's chunks of `package@version` are byte-identical; `exports` subpaths and barrel members stay units.
- [x] Verified in the producer's own tests: every bare import in a chunk is external and no package is inlined across a package boundary; barrel members are split only when provably side-effect-free under the standard bundler `sideEffects` semantics; chunk bytes carry only text derived from the package and are identical for every consumer.
- [x] Verified in the producer's own tests: exactly one flat fetch list exists per exposed module and per lazy target, each unit carrying `location`, `contentHash`, `answers` and `imports`, each list carrying `units`, `ownChunks` and the `lazy` and `patterns` arrays of keys; every lazy list is held once in the manifest's top-level `lists`, under its target's chunk location, or under the bare specifier for a bare dynamic import of a shared package.
- [x] Verified in the producer's own tests: the output carries `units` and `lists` only, with no `shared` entry and no whole-package file; every content identity a list names is held by the unit table, and chunks are content-addressed.
- [x] Verified in the producer's own tests: a lazy target that two parents reach has one list, the union of what it needs beyond each parent chain.
- [x] Verified in the producer's own tests: an unhashed alias location is published as a unit with the same `contentHash` as the file it aliases.
- [x] Verified in the producer's own tests: every fully opaque `import(expr)` is reported with the emitted chunk's location and the call's line in the emitted code.
- [x] Verified in the producer's own tests: a bare dynamic import inside a shared chunk has its lazy list under the bare specifier, and a pattern import's matching files are lists keyed and published at the locations the runtime resolves.
- [x] Verified in the producer's own tests: a consumer rewrite through a nested barrel whose answering unit does not export the imported name goes back to the barrel.
- [x] Verified in the producer's own tests: a shared package's import of another shared package's nested barrel keeps the barrel specifier when the answering unit does not export the imported name, and stays on the defining module when it does.
- [x] Verified in the producer's own tests: the build-cache key changes with a package's files, its declared dependencies' content, the toolchain versions and the producer's code, and a cache record written from one install root answers another, at a different depth, with identical entry units, answers and lists.
- [x] Verified in the producer's own tests: a pattern import is found relative to the module that spells its prefix, a pattern that matches no file or names a missing directory fails the build naming the package, the chunk and the prefix, and a file whose name percent-encodes is published at the decoded path under its encoded list key.
- [x] Verified in the producer's own tests: a unit whose text cannot be parsed fails the build naming the unit.
