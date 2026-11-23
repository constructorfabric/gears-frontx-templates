---
status: proposed
version: 1
date: 2026-11-14
decision-makers: FrontX templates maintainers
description: "Decision record for how the templates in this repository take part in FrontX telemetry: telemetry is a template of its own that a project adds with the CLI, the shell template carries none, and microfrontends report through the shell's telemetry and stay silent in a shell without it."
---

# ADR-0001: Telemetry is a template of its own, and microfrontends report through it

**ID**: `cpt-templates-adr-telemetry-own-template`

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Telemetry is a template of its own](#telemetry-is-a-template-of-its-own)
  - [The shell template carries telemetry](#the-shell-template-carries-telemetry)
  - [Every template sets up its own telemetry](#every-template-sets-up-its-own-telemetry)
  - [Templates carry no telemetry](#templates-carry-no-telemetry)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

## Context and Problem Statement

The FrontX telemetry package is being extended with connectors an application supplies, declared events, flow events for forms and multi-step flows, a consent gate and reporting from microfrontends ([gears-frontx#764](https://github.com/constructorfabric/gears-frontx/pull/764)). The package stays standalone: it imports no UI framework and no other FrontX package, and it knows no analytics backend. The decision record in that pull request therefore leaves to the templates the wiring of telemetry into a shell, the UI-framework bindings such as an error boundary and a form binding, the lint rules shipped to projects, and the report of flows and dialogs that are not instrumented.

No template in this repository uses telemetry today. A project is assembled from several templates that are authored and released independently, and the FrontX CLI adds a template to an existing repository without knowing what the template produces. How does a project get telemetry, and which template carries which part, so that the assembled application has one telemetry setup and not one per template?

## Decision Drivers

* Connectors, consent and user identity must live in one place in the application.
* The shell of a project that does not want telemetry must carry none of it.
* Getting telemetry must be one step a developer or an agent can take on an existing project, with no change to the CLI.
* A microfrontend is built separately and cannot know whether the shell it runs in has telemetry.
* No template may name an analytics backend; the project chooses one and supplies the connector.
* Two templates cannot own the same file.

## Considered Options

* Telemetry is a template of its own
* The shell template carries telemetry
* Every template sets up its own telemetry
* Templates carry no telemetry

## Decision Outcome

Chosen option: **Telemetry is a template of its own**, because it is the only option where the shell of a project without telemetry carries none of it, a project with telemetry has one connector, one consent state and one set of event names, and installing it is the CLI's existing operation of adding a template.

What each template carries:

| Template | What it carries |
|---|---|
| `template-telemetry` (new) | Added to an existing project with the CLI. It installs a workspace package with the telemetry client setup, the one place where the project supplies its connector and connects its consent choice, and the React bindings. The setup creates the client with the telemetry package's shipped collector delivery switched off, so a project whose connector place is empty sends nothing. The bindings are: a flow binding, and an error boundary that reports a render error by kind only, with no message and no stack trace. It also installs the lint rules below, as a package under `src-app/verify_packages/`, where the shell already takes a package as a workspace and loads its lint fragment, and an AI bundle with the instructions for the shell side: supplying a connector, connecting consent, and instrumenting a flow, a dialog and a key action in shell code. It ships no connector and owns only its own subtree. |
| `template-shell` | No telemetry code. Its base domains declare one signal, whether the shell accepts telemetry reports, which is false in a project without telemetry, so a microfrontend there gets an answer, drops what it holds and stays silent. It keeps one place where an added template's setup is started with the application (see More Information). |
| `template-mfe` | Microfrontend packages that report flow, dialog, key-action and error events, and the events they declare, to the shell's telemetry. A package reports through the standalone telemetry package and builds in a project that never added `template-telemetry`. A package declares one event namespace. It holds no connector and no backend client, and it cannot identify the user or change consent. In a shell without telemetry it sends nothing and prints nothing. The template's AI bundle, which every project with `template-mfe` already has, carries the React-specific instructions for instrumenting a flow, a dialog and a key action in a microfrontend package, so they are present in a project that never added `template-telemetry`. |

The three states of the telemetry package map to the project as follows:

| State | Project |
|---|---|
| No telemetry | `template-telemetry` is not applied |
| Telemetry without a connector | `template-telemetry` is applied and the connector place is empty |
| Telemetry with a connector | The developer has written a connector into that place |

Lint rules the telemetry template ships to the project:

* The first segment of the name of an event a microfrontend declares is the namespace that microfrontend declared. Events the telemetry package defines, such as flow events, are exempt: they carry the same names in every microfrontend and in the shell.
* An event name is not built at runtime.
* No analytics backend client is imported outside the connector.

A feature template that is not a microfrontend gets no telemetry requirement from this record.

### Consequences

* Good, because a project without the telemetry template has no telemetry code in its shell, and the shell template does not grow. What remains is the small reporting part in each instrumented microfrontend package, which stays silent.
* Good, because installing telemetry is one existing CLI operation, and upgrading it is the CLI's per-template upgrade.
* Good, because the React bindings and the lint rules have one home, released on their own cadence.
* Good, because a microfrontend package works unchanged in a shell with telemetry and in a shell without it.
* Good, because no template names an analytics backend, so a project is free to choose one.
* Bad, because the shell template owns its application subtree exclusively, so the telemetry template cannot write the line that starts it; how the shell picks it up is not settled (see More Information).
* Bad, because a microfrontend package must build without the telemetry template, so it cannot import the React flow binding from the package that template installs; where the binding lives for microfrontend packages is not settled (see More Information).
* Bad, because which microfrontend sent a record is declared by that microfrontend until the runtime tells the shell who is sending ([gears-frontx#773](https://github.com/constructorfabric/gears-frontx/pull/773)).
* Bad, because the CLI has no operation that removes a template, so a project that applied the telemetry template and no longer wants it removes it by hand.

### Confirmation

* A project built from `template-shell` alone contains no telemetry code.
* A project built from `template-shell` and `template-mfe`, without `template-telemetry`, builds, and its shell bundle contains no telemetry capture code.
* The same project after `template-telemetry` is added, with the connector place empty, makes zero telemetry requests.
* A microfrontend package from `template-mfe`, instrumented, makes zero requests and writes nothing to the console in a shell without telemetry.
* A flow in a microfrontend package and a flow in the shell produce events with the same names.
* A search of this repository finds no analytics backend named in any template.

## Pros and Cons of the Options

### Telemetry is a template of its own

* Good, because it follows `template-design-guardrails`, which already adds a workspace package and an AI bundle to an existing project and owns no application code.
* Good, because consent and identity are set once and hold for every microfrontend.
* Bad, because it needs a pick-up point in the shell, which is one more thing two templates release in step with.

### The shell template carries telemetry

* Good, because the wiring sits in the subtree the shell already owns, with no pick-up point to agree on.
* Bad, because every project carries telemetry code whether it wants telemetry or not, or the shell template grows a switch for it.
* Bad, because the React bindings and the lint rules would be released with the shell, and a microfrontend package using them would depend on the shell's territory.

### Every template sets up its own telemetry

* Good, because a template needs nothing from the shell.
* Bad, because each microfrontend would hold a connector or a backend client, and consent would have to be given to each.
* Bad, because event names and user identity would differ from one part of the application to another.

### Templates carry no telemetry

* Good, because the templates stay smaller.
* Bad, because every project would wire telemetry by hand and differently, and an agent assembling a project would have no pattern to follow.
* Bad, because flows written into microfrontend packages would have no agreed way to report.

## More Information

* This record is proposed and nothing is implemented from it yet. It depends on [gears-frontx#764](https://github.com/constructorfabric/gears-frontx/pull/764) being accepted and on the design of the telemetry package's connector and microfrontend-reporting surface, which does not exist yet.
* Open: how the shell starts an added template's telemetry setup. `template-shell` owns `src-app/app/` exclusively. Either the shell exposes a place an added template registers with, or the telemetry template's instructions tell the developer or the agent which line to add to the shell, which is how `template-design-guardrails` handles its theme id stamp. The pick-up is more than a start-up line. In the microfrontend runtime, records reach a handler in the shell only if the target domain lists the telemetry action and a handler is registered for it, and a microfrontend can learn whether its shell has telemetry only from a property its domain shares. The base domains are declared in `template-shell/packages/framework` with fixed actions and shared properties, and `template-telemetry` cannot edit them. This constrains the wiring to a transport `template-telemetry` can register on its own and a signal the base domains carry whether or not telemetry is present. The mechanism is decided here and not in the telemetry package's design: a runtime spike settles it as part of the work that builds `template-telemetry`, before that wiring is built.
* Open: where the workspace package with the client setup and the bindings goes. `template-shell` owns `package.json` and `eslint.config.js`; its workspaces are `packages/*`, `src-app/mfe_packages/*` and `src-app/verify_packages/*`, and its lint config loads fragments only from `src-app/verify_packages/*/eslint.config.mjs`. The lint rules fit that last convention. The client setup and the bindings are application code and not verification, and anywhere outside those three places the package is neither a workspace nor linted.
* Open: where the React flow binding lives for `template-mfe`'s packages. They must build without `template-telemetry`, so they cannot import a binding that only that template installs. Those packages already depend on `@gears-frontx/react`, published from `template-shell`'s territory, which the workspace template family's PRD records as a known conflict. The flow binding meets the same question. `cpt-frontx-workspace-templates-fr-no-cross-member-import` leaves two places for the binding these packages use: a framework-level React binding library in gears-frontx beside the standalone telemetry package, or code `template-mfe` carries itself.
* Open: the report of flows and dialogs that are not instrumented. It belongs with the telemetry template's lint rules and is a later phase.
* `template-dashboard`'s PRD states that monitoring and telemetry are not applicable at template level and belong to the host and the product. That stays true: the dashboard template sets up no telemetry of its own.
* What an AI agent must instrument is proposed for the AI Tooling Framework in [gears-frontx#774](https://github.com/constructorfabric/gears-frontx/pull/774); the React-specific instructions arrive in template AI bundles: for shell code in `template-telemetry`'s, for microfrontend packages in `template-mfe`'s. What the latter says about flows waits on where the flow binding lives, above. For a microfrontend package the condition is the package, not the project: an agent instruments what it adds to a package that declares an event namespace, whether or not the project added `template-telemetry`.

## Traceability

`template-telemetry` does not exist yet, and neither `template-shell` nor `template-mfe` has a PRD or a DESIGN, so this decision traces to no requirement in this repository. When those documents are written they take it as an input.
