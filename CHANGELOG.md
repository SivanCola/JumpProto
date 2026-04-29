# Changelog

## 1.1.1 - 2026-04-30

- Removed duplicate screenshots from the Chinese README section so marketplace pages keep the visual examples in the English overview only.

## 1.1.0 - 2026-04-30

- Added the redesigned JumpProto sidebar with English-first UI, language and theme controls, project configuration, diagnostics, and cache cleanup.
- Added `.jumpproto` project configuration for shared Proto roots, workspace search, exclude rules, and compile command templates.
- Improved Go and Proto navigation performance with bounded lookup, source header caching, symbol indexes, package indexes, and LRU memory limits.
- Added Proto-to-Go usage search improvements for fields, getters, composite literals, aliases, nested messages, services, RPCs, and generated packages.
- Added user-facing README screenshots and marketplace metadata for Visual Studio Marketplace and Open VSX.
- Added release packaging hygiene with `.vscodeignore`, localized extension metadata, and VSIX verification.

## 1.0.9 - 2026-04-29

- Fixed VSIX file whitelist so release verification no longer packages unused resources.
- Limited bare Go symbol usage matches to files in the generated Go package.
- Allowed Proto compile templates to render when `{protoPackage}` cannot be inferred.

## 1.0.8 - 2026-04-29

- Split extension lifecycle, configuration, navigation, usage search, compile, diagnostics, and command registration into focused modules.
- Added integration fixtures covering Go/proto navigation, workspace-external proto roots, import aliases, same-package usages, nested messages, fields, enums, services, and RPCs.
- Added `JumpProto: Diagnose Current Symbol` for troubleshooting navigation failures from the output channel.
- Added release checks for matching release versions, non-empty changelog entries, passing tests, and verified VSIX contents.
- Added sidebar self-check actions for testing navigation, opening output, and previewing the rendered Make Proto command.
- Documented support boundaries and troubleshooting notes in English and Chinese.
- Improved usage-search performance with cancellable scans, cached Go/proto metadata, workspace file-change invalidation, and configurable `protoJump.exclude` patterns.
