# Changelog

## 1.0.8 - 2026-04-29

- Split extension lifecycle, configuration, navigation, usage search, compile, diagnostics, and command registration into focused modules.
- Added integration fixtures covering Go/proto navigation, workspace-external proto roots, import aliases, same-package usages, nested messages, fields, enums, services, and RPCs.
- Added `JumpProto: Diagnose Current Symbol` for troubleshooting navigation failures from the output channel.
- Added release checks for matching release versions, non-empty changelog entries, passing tests, and verified VSIX contents.
- Added sidebar self-check actions for testing navigation, opening output, and previewing the rendered Make Proto command.
- Documented support boundaries and troubleshooting notes in English and Chinese.
- Improved usage-search performance with cancellable scans, cached Go/proto metadata, workspace file-change invalidation, and configurable `protoJump.exclude` patterns.
