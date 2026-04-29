<div align="center">

# JumpProto

### Fast Go and Proto navigation for generated Go projects

[![version](https://img.shields.io/visual-studio-marketplace/v/SivanLiu.jumpproto?label=version&color=2389d7)](https://marketplace.visualstudio.com/items?itemName=SivanLiu.jumpproto)
[![open vsx](https://img.shields.io/open-vsx/v/SivanLiu/jumpproto?label=open%20vsx&color=8a63d2)](https://open-vsx.org/extension/SivanLiu/jumpproto)
![platform](https://img.shields.io/badge/platform-VS%20Code%20%7C%20Cursor-8a8a8a)
![built with](https://img.shields.io/badge/built%20with-TypeScript-3178c6)
[![downloads](https://img.shields.io/visual-studio-marketplace/d/SivanLiu.jumpproto?label=downloads&color=39b91f)](https://marketplace.visualstudio.com/items?itemName=SivanLiu.jumpproto)
[![license](https://img.shields.io/badge/license-Apache--2.0-orange)](LICENSE)

English | [简体中文](#简体中文)

</div>

---

## English

JumpProto connects generated Go code back to its source `.proto` definitions, then helps you move in the other direction when you need to inspect Go usage from a Proto symbol.

Use it to jump from `.pb.go` symbols to `message`, `enum`, `service`, `rpc`, and field definitions, search Go usage from a `.proto` file, and run the current project's Proto compile command from the sidebar.

## What's New

- Symbol-level `Go -> .proto` navigation for generated Go code.
- `.proto -> Go` usage search for definitions, field types, and field names.
- Sidebar configuration for Proto roots, workspace fallback search, UI language, and Make Proto rules.
- `Compile Current Proto` command with placeholder-based shell templates.
- Dry-run command testing before running the compile rule.

## Highlights

- Jump from generated `.pb.go` code to the source `.proto` file.
- Resolve source files from generated headers such as `// source: path/to/file.proto`.
- Locate `message`, `enum`, `service`, `rpc`, nested symbols, and fields when possible.
- Search Go usages from Proto definitions using VS Code's native references view.
- Search field reads, getter calls, and composite literal fields from a Proto field.
- Configure multiple `protoRoots` for repositories with separated Go and Proto source trees.
- Fall back to workspace search when `protoRoots` does not resolve a source file.
- Edit, test, and run a project-specific Proto compile command from the JumpProto sidebar.
- Switch JumpProto UI text between English and Chinese.

## Quick Start

1. Install `JumpProto` from the VS Code Marketplace.
2. Open a Go repository that contains generated `.pb.go` files.
3. Configure `protoJump.protoRoots` if source `.proto` files live outside the opened workspace.
4. Put the cursor on a generated Go symbol and press `F12`.
5. Open the JumpProto sidebar when you need to edit roots or configure the compile rule.

## Navigation Workflow

- From Go, run `JumpProto: Go to Proto Definition` or press `F12` on a generated symbol.
- From Proto, run `JumpProto: Go to Go Usage` on a `message`, `enum`, `service`, `rpc`, field type, or field name.
- From a `.proto` file, run `JumpProto: Compile Current Proto` after configuring a Make Proto rule.
- Use the status bar entry while editing Go files as a shortcut to Proto definition navigation.
- Use the JumpProto Activity Bar sidebar to manage roots, language, workspace search, and compile rules.

When `gopls` is enabled, VS Code may show both generated Go and Proto definition candidates. Choose the `.proto` candidate when you want the source definition.

## Commands

| Command | What it does |
| --- | --- |
| `JumpProto: Go to Proto Definition` | Opens the source `.proto` definition for the generated Go symbol under the cursor. |
| `JumpProto: Go to Go Usage` | Finds Go usage for the Proto symbol or field under the cursor. |
| `JumpProto: Compile Current Proto` | Runs the configured shell command template for the active `.proto` file. |
| `JumpProto: Add Proto Root` | Adds a source `.proto` root directory. |
| `JumpProto: Remove Proto Root` | Removes a configured source `.proto` root directory. |
| `JumpProto: Toggle Search In Workspace` | Enables or disables workspace fallback search. |
| `JumpProto: Select Language` | Switches JumpProto UI text between English and Chinese. |
| `JumpProto: Edit Make Proto Rule` | Opens settings for `protoJump.makeProtoCommand`. |
| `JumpProto: Make Proto Rule Help` | Opens the built-in rule guide. |

## Settings

### `protoJump.protoRoots`

List of directories that contain source `.proto` files. Multiple roots are supported.

```json
{
  "protoJump.protoRoots": [
    "/ABSOLUTE/PATH/TO/your/proto_src",
    "$HOME/work/shared-proto"
  ]
}
```

### `protoJump.searchInWorkspace`

- Type: `boolean`
- Default: `true`
- Description: continue searching in the current workspace when `protoRoots` does not resolve a source file.

### `protoJump.makeProtoCommand`

- Type: `string`
- Default: `""`
- Description: shell command template used by `Compile Current Proto`.

Example:

```bash
cd {protoSrcRoot} && make special_proto packagename={protoPackage} filename={protoFileNoExt}
```

Supported placeholders:

| Placeholder | Value |
| --- | --- |
| `{workspaceFolder}` | Current workspace root directory. |
| `{protoSrcRoot}` | Matched Proto source root. |
| `{protoFile}` | Active Proto file path. |
| `{protoFileNoExt}` | Active Proto file name without `.proto`. |
| `{protoDir}` | Directory of the active Proto file. |
| `{relativeProto}` | Path relative to `protoSrcRoot`, including `.proto`. |
| `{relativeProtoNoExt}` | Path relative to `protoSrcRoot`, without `.proto`. |
| `{protoPackage}` | Package segment inferred from `go_package` or `package`. |

### `protoJump.uiLanguage`

- Type: `"zh" | "en"`
- Default: `"en"`
- Description: language used by the JumpProto sidebar and notifications.

## Make Proto Rule

The Make Proto rule is designed for repositories where one `.proto` file can be regenerated through a project-specific Makefile or shell script.

Start with a simple template:

```bash
cd {protoSrcRoot} && make special_proto packagename={protoPackage} filename={protoFileNoExt}
```

For repositories with multiple compile targets, route by relative path:

```bash
cd {protoSrcRoot} && case {relativeProto} in
  rpc/*) make rpc pkg={protoFileNoExt} ;;
  api/*) make api pkg={protoFileNoExt} ;;
  model/*) make golang_model_proto ;;
  *) make special_proto packagename={protoPackage} filename={protoFileNoExt} ;;
esac
```

Use `Test Command` in the sidebar before compiling. It performs a shell syntax dry run and writes the rendered command to the `JumpProto` output channel.

## Requirements

- Generated Go files should be created by `protoc-gen-go`.
- Generated file headers must include a source line:

```go
// source: path/to/file.proto
```

- Go definition navigation works best with the official Go extension and `gopls` enabled.
- `Compile Current Proto` requires the active `.proto` file to be under a configured root or a detectable `proto_src` directory with a `Makefile`.

## Current Limits

- Go-to-Proto navigation depends on VS Code first resolving the Go symbol to a generated `.pb.go` definition.
- Proto-to-Go usage search is heuristic and capped to keep workspace scans responsive.
- Field usage search can miss complex aliasing, reflection, generated helper wrappers, or heavily dynamic code.
- Proto compile commands run locally through `/bin/zsh`.

## Privacy

JumpProto stores configuration in VS Code or workspace settings and does not send paths, source code, or compile commands to any remote service.

Path examples in this README use placeholders such as `/ABSOLUTE/PATH/TO/...` and `$HOME/...` to avoid exposing personal local directory information.

## Bug Reports

Report issues here: <https://github.com/SivanCola/JumpProto/issues>

## License

JumpProto is licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE). Third-party asset notices are listed in [NOTICE](NOTICE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

<a id="简体中文"></a>

## 简体中文

JumpProto 会把生成后的 Go 代码重新连回源 `.proto` 定义，也能在你查看 Proto 符号时反向查找 Go 侧使用位置。

你可以从 `.pb.go` 符号跳到 `message`、`enum`、`service`、`rpc` 和字段定义，也可以从 `.proto` 文件里搜索 Go 使用处，并在侧边栏里运行当前项目的 Proto 编译命令。

## 最新版亮点

- 支持生成 Go 代码到 `.proto` 的元素级跳转。
- 支持从 `.proto` 反查 Go 使用处，覆盖定义、字段类型和字段名。
- 侧边栏集中管理 Proto 根目录、工作区兜底搜索、界面语言和 Make Proto 规则。
- `Compile Current Proto` 支持基于占位符的 shell 命令模板。
- 编译前可以先执行 dry-run 测试命令。

## 功能亮点

- 从生成的 `.pb.go` 代码跳转到源 `.proto` 文件。
- 基于生成文件头部的 `// source: path/to/file.proto` 解析源文件。
- 尽量定位到 `message`、`enum`、`service`、`rpc`、内部元素和字段。
- 从 Proto 定义出发，在 VS Code 原生引用视图里查看 Go 使用处。
- 从 Proto 字段查找 Go 里的字段读取、getter 调用和结构体字面量字段。
- 支持配置多个 `protoRoots`，适配 Go 代码和 Proto 源码分离的仓库。
- 当 `protoRoots` 未命中时，可继续在当前工作区兜底搜索。
- 在 JumpProto 侧边栏里编辑、测试并运行项目自己的 Proto 编译命令。
- JumpProto 侧边栏和提示消息支持英文与中文切换。

## 快速开始

1. 从 VS Code Marketplace 安装 `JumpProto`。
2. 打开包含生成 `.pb.go` 文件的 Go 仓库。
3. 如果源 `.proto` 文件不在当前工作区内，配置 `protoJump.protoRoots`。
4. 将光标放在生成 Go 符号上并按 `F12`。
5. 需要管理根目录或编译规则时，打开 JumpProto 侧边栏。

## 导航工作流

- 在 Go 文件中，执行 `JumpProto: Go to Proto Definition`，或在生成符号上按 `F12`。
- 在 Proto 文件中，对 `message`、`enum`、`service`、`rpc`、字段类型或字段名执行 `JumpProto: Go to Go Usage`。
- 在 `.proto` 文件中，配置 Make Proto 规则后执行 `JumpProto: Compile Current Proto`。
- 编辑 Go 文件时，可以使用状态栏里的 JumpProto 入口快速跳转到 Proto 定义。
- 使用 Activity Bar 里的 JumpProto 侧边栏管理根目录、语言、工作区搜索和编译规则。

启用 `gopls` 时，VS Code 可能同时给出生成 Go 和 Proto 定义候选。需要源定义时，选择 `.proto` 候选即可。

## 命令

| 命令 | 作用 |
| --- | --- |
| `JumpProto: Go to Proto Definition` | 打开光标下生成 Go 符号对应的源 `.proto` 定义。 |
| `JumpProto: Go to Go Usage` | 查找光标下 Proto 符号或字段的 Go 使用处。 |
| `JumpProto: Compile Current Proto` | 按当前 `.proto` 文件上下文运行已配置的 shell 命令模板。 |
| `JumpProto: Add Proto Root` | 添加源 `.proto` 根目录。 |
| `JumpProto: Remove Proto Root` | 移除已配置的源 `.proto` 根目录。 |
| `JumpProto: Toggle Search In Workspace` | 开启或关闭工作区兜底搜索。 |
| `JumpProto: Select Language` | 在英文和中文之间切换 JumpProto 界面文本。 |
| `JumpProto: Edit Make Proto Rule` | 打开 `protoJump.makeProtoCommand` 设置。 |
| `JumpProto: Make Proto Rule Help` | 打开内置规则说明。 |

## 配置项

### `protoJump.protoRoots`

源 `.proto` 文件所在根目录列表，可配置多个。

```json
{
  "protoJump.protoRoots": [
    "/ABSOLUTE/PATH/TO/your/proto_src",
    "$HOME/work/shared-proto"
  ]
}
```

### `protoJump.searchInWorkspace`

- 类型：`boolean`
- 默认：`true`
- 说明：当 `protoRoots` 未解析到源文件时，是否继续在当前工作区内搜索。

### `protoJump.makeProtoCommand`

- 类型：`string`
- 默认：`""`
- 说明：`Compile Current Proto` 使用的 shell 命令模板。

示例：

```bash
cd {protoSrcRoot} && make special_proto packagename={protoPackage} filename={protoFileNoExt}
```

支持的占位符：

| 占位符 | 含义 |
| --- | --- |
| `{workspaceFolder}` | 当前工作区根目录。 |
| `{protoSrcRoot}` | 当前命中的 Proto 源文件根目录。 |
| `{protoFile}` | 当前 Proto 文件路径。 |
| `{protoFileNoExt}` | 当前 Proto 文件名，不含 `.proto`。 |
| `{protoDir}` | 当前 Proto 文件所在目录。 |
| `{relativeProto}` | 相对 `protoSrcRoot` 的路径，包含 `.proto`。 |
| `{relativeProtoNoExt}` | 相对 `protoSrcRoot` 的路径，不含 `.proto`。 |
| `{protoPackage}` | 根据 `go_package` 或 `package` 推导出的包名片段。 |

### `protoJump.uiLanguage`

- 类型：`"zh" | "en"`
- 默认：`"en"`
- 说明：控制 JumpProto 侧边栏和提示消息语言。

## Make Proto 规则

Make Proto 规则适合用在一个 `.proto` 文件可以通过项目自己的 Makefile 或 shell 脚本重新生成的仓库里。

可以先从简单模板开始：

```bash
cd {protoSrcRoot} && make special_proto packagename={protoPackage} filename={protoFileNoExt}
```

如果同一仓库有多套编译目标，可以按相对路径分流：

```bash
cd {protoSrcRoot} && case {relativeProto} in
  rpc/*) make rpc pkg={protoFileNoExt} ;;
  api/*) make api pkg={protoFileNoExt} ;;
  model/*) make golang_model_proto ;;
  *) make special_proto packagename={protoPackage} filename={protoFileNoExt} ;;
esac
```

编译前建议先在侧边栏点击 `Test Command`。它只做 shell 语法 dry-run，并把展开后的命令写入 `JumpProto` 输出面板。

## 前置条件

- Go 代码应由 `protoc-gen-go` 生成。
- 生成文件头部需要包含 source 行：

```go
// source: path/to/file.proto
```

- Go 定义跳转推荐配合官方 Go 扩展和 `gopls` 使用。
- `Compile Current Proto` 要求当前 `.proto` 文件位于已配置根目录下，或位于可识别且包含 `Makefile` 的 `proto_src` 目录下。

## 当前限制

- Go 到 Proto 跳转依赖 VS Code 先把 Go 符号解析到生成的 `.pb.go` 定义。
- Proto 到 Go 的使用处搜索是启发式扫描，并会限制结果数量以保持响应速度。
- 字段使用处搜索可能漏掉复杂别名、反射、生成辅助包装或高度动态的代码。
- Proto 编译命令会在本机通过 `/bin/zsh` 执行。

## 隐私

JumpProto 会把配置保存在 VS Code 或工作区设置中，不会把路径、源代码或编译命令发送到任何远程服务。

本文档中的路径示例使用 `/ABSOLUTE/PATH/TO/...` 和 `$HOME/...` 这类占位符，避免暴露个人本地目录信息。

## Bug 反馈

提交地址：<https://github.com/SivanCola/JumpProto/issues>

## 许可证

JumpProto 使用 Apache License, Version 2.0 授权。详见 [LICENSE](LICENSE)。第三方资源声明见 [NOTICE](NOTICE) 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
