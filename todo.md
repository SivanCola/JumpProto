# JumpProto Todo

按“最值得做、能明显提升质量”的顺序排列。

## 1. 拆分 `extension.ts`（已完成）

当前 `extension.ts` 同时负责配置读取、跳转解析、Go usage 搜索、编译命令、Webview 命令注册，后续维护风险较高。

建议拆分为：

- `config.ts`：配置读取、路径展开、`protoRoots` 匹配。
- `protoResolver.ts`：Go -> Proto 解析。
- `goUsage.ts`：Proto -> Go usage 搜索。
- `compile.ts`：Make Proto 上下文、模板渲染和执行。
- `commands.ts`：VS Code command 注册。

目标：降低单文件复杂度，让核心逻辑更容易单测和 review。

状态：已拆分为 `commands.ts`、`config.ts`、`compile.ts`、`protoResolver.ts`、`goUsage.ts` 和 `utils.ts`，`extension.ts` 仅保留扩展生命周期入口。

## 2. 增加集成测试和 fixture（已完成）

现有测试主要覆盖 `core.ts` 纯函数，真正容易回归的是 VS Code 扩展行为和跨文件解析。

建议新增 fixture workspace，覆盖：

- Go message type -> Proto message。
- Go struct field -> Proto field。
- Proto message / enum / service / rpc -> Go usage。
- Proto field -> Go field usage。
- `protoRoots` 指向 workspace 外目录。
- import alias、同包裸名、nested message。

目标：让跳转和 usage 搜索的关键路径有回归保护。

状态：已新增 `test/fixtures` 和 `integration.test.ts`，覆盖 `.pb.go` source 回源、message / enum / rpc / field 定位、`protoRoots` 外部根目录、`proto_src` fallback、import alias、默认 import 和同包裸名 usage。

## 3. 增加诊断命令（已完成）

新增命令：`JumpProto: Diagnose Current Symbol`。

输出到 `JumpProto` output channel：

- 当前文件语言、光标 symbol。
- 原生 definition provider 返回结果。
- `.pb.go` 中解析到的 `// source:`。
- 命中的 `protoRoots` 和实际搜索路径。
- Proto 文件是否存在。
- Go package / import path 推断结果。
- Usage 搜索使用的匹配策略和候选数量。

目标：用户遇到跳转失败时，可以直接拿诊断日志定位问题。

状态：已新增 `JumpProto: Diagnose Current Symbol` 命令，支持命令面板和 Go / Proto 编辑器右键菜单，诊断信息写入 `JumpProto` output channel。

## 4. 将 Go / Proto 解析逐步结构化（已完成）

当前大量逻辑依赖正则扫描，短期可维护，但长期容易在注释、字符串、嵌套结构、复杂 Go 写法中漏结果。

建议：

- Proto 侧实现轻量 token scanner，正确处理注释、字符串、嵌套 block。
- Go 侧优先复用 VS Code / gopls 能力；文本扫描作为 fallback。
- 对 message、enum、service、rpc、field 建立统一 symbol resolution 流程。

目标：减少边界 case 和文本误匹配。

状态：已完成 Proto / Go 两侧结构化解析落地。`protoScanner.ts` 现在统一提供 message / enum / service / rpc / field symbol、字段类型上下文和 nested message 全名解析，`core.ts` 与 Proto -> Go usage 路径均改为基于 scanner。`goText.ts` 现在负责 import alias、限定名 / 裸名 usage、composite literal 字段、typed variable selector 和 getter 识别，并跳过注释和字符串；运行时 Go usage 搜索已迁移到 token scanner，不再依赖旧 regex fallback。

## 5. 优化 usage 搜索性能（已完成）

当前多处扫描 `**/*.go` / `**/*.pb.go`，并同步读取文件，大仓库可能卡顿。

建议：

- 支持 `CancellationToken`。
- 缓存 `.pb.go` header、Proto source 映射、Go package 信息。
- 监听 workspace 文件变更并失效缓存。
- 增加 `protoJump.exclude` 配置。
- 对大结果集分批或限制展示。

目标：提升大仓库下的响应速度和可取消性。

状态：已为 usage 搜索增加可取消进度、Go 文件列表 / 文件内容 / `.pb.go` header / Go package 推断缓存；注册 Go/Proto 文件变更和 `protoJump` 配置变更时的缓存失效；新增 `protoJump.exclude` 配置；usage 搜索结果限制为 200 条。

## 6. 发布流程增加版本保护（已完成）

当前 release workflow 由 `v*` tag 或手动触发发布。

建议发布前校验：

- tag 版本必须等于 `package.json` 的 `version`。
- `CHANGELOG.md` 包含当前版本内容。
- `npm test` 必须通过。
- VSIX 打包成功且内容符合预期。

目标：避免误 tag、版本冲突或空 changelog 发布。

状态：已新增 `scripts/verify-release.mjs` 和 `release:check` / `release:verify` 脚本；release workflow 会在发布前校验 tag 或手动版本与 `package.json` 一致、`CHANGELOG.md` 包含当前版本内容、`npm test` 通过，并在发布前检查 VSIX 产物关键文件和内嵌版本。

## 7. 让侧边栏配置更闭环（已完成）

建议补充：

- “Test Navigation”：对当前光标执行一次解析，只展示结果，不跳转。
- “Open Output”：快速打开 `JumpProto` 输出日志。
- Make Proto 规则实时展示当前 `.proto` 展开后的命令预览。

目标：让用户在配置 protoRoots 和编译规则时更容易自检。

状态：已在侧边栏新增 `Test Navigation`、`Open Output`、`Compile Current Proto` 和诊断入口；Make Proto 区域会按当前活动 `.proto` 文件实时展示展开后的命令预览。

## 8. 补充 README 的支持边界（已完成）

建议新增“支持边界 / Troubleshooting”说明：

- Go -> Proto 依赖 gopls / definition provider 和 `.pb.go` 头部 `// source:`。
- Proto -> Go usage 是静态搜索，不等于完整 Go 类型系统引用。
- import alias、同包裸名、nested message 的支持范围。
- `Compile Current Proto` 如何确定 `{protoSrcRoot}`。
- 失败时如何使用诊断命令排查。

目标：降低用户误解，减少 issue 沟通成本。

状态：已在 README 的英文和中文部分补充命令说明、侧边栏能力、Make Proto 展开预览、支持边界和 Troubleshooting。
