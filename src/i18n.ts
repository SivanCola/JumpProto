// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';

export type UiLanguage = 'zh' | 'en';

export function getUiLanguage(): UiLanguage {
  const config = vscode.workspace.getConfiguration('protoJump');
  const lang = config.get<string>('uiLanguage');
  if (lang === 'zh' || lang === 'en') return lang;
  return vscode.env.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export type Strings = {
  primaryActionGoTitle: string;
  primaryActionProtoCompileTitle: string;
  primaryActionProtoSetupTitle: string;
  primaryActionEmptyTitle: string;
  primaryActionUnsupportedTitle: string;
  primaryActionGoButton: string;
  primaryActionConfigureRule: string;
  primaryActionDisabledButton: string;
  primaryActionGoDescription: string;
  primaryActionProtoDescription: string;
  primaryActionProtoSetupDescription: string;
  primaryActionFallbackDescription: string;
  primaryActionUnsupportedDescription: string;
  protoRootsEmptyDescription: string;
  makeProtoRuleEmptyDescription: string;
  makeProtoRuleConfiguredDescription: string;
  diagnosticTools: string;
  advanced: string;
  protoRoots: string;
  makeProtoRule: string;
  makeProtoRuleHelp: string;
  makeProtoRuleHelpTitle: string;
  makeProtoRuleHelpIntro: string;
  makeProtoRuleHelpUsageTitle: string;
  makeProtoRuleHelpUsage: string;
  makeProtoRuleHelpQuickStartTitle: string;
  makeProtoRuleHelpQuickStartStep1: string;
  makeProtoRuleHelpQuickStartStep2: string;
  makeProtoRuleHelpQuickStartStep3: string;
  makeProtoRuleHelpDemoTitle: string;
  makeProtoRuleHelpDemoContext: string;
  makeProtoRuleHelpDemoResultLabel: string;
  makeProtoRuleHelpPlaceholdersTitle: string;
  makeProtoRuleHelpPlaceholderWorkspaceFolder: string;
  makeProtoRuleHelpPlaceholderProtoSrcRoot: string;
  makeProtoRuleHelpPlaceholderProtoFileNoExt: string;
  makeProtoRuleHelpPlaceholderRelativeProto: string;
  makeProtoRuleHelpPlaceholderProtoPackage: string;
  makeProtoRuleHelpTroubleshootingTitle: string;
  makeProtoRuleHelpTroubleshooting1: string;
  makeProtoRuleHelpTroubleshooting2: string;
  makeProtoRuleHelpTroubleshooting3: string;
  makeProtoRuleHelpTipsTitle: string;
  makeProtoRuleHelpTips: string;
  makeProtoRuleUnset: string;
  remove: string;
  save: string;
  cancel: string;
  configure: string;
  edit: string;
  saved: string;
  unsaved: string;
  openJson: string;
  testCommand: string;
  testNavigation: string;
  openOutput: string;
  themeLabel: string;
  themeSystem: string;
  themeDark: string;
  themeLight: string;
  themeAurora: string;
  themeCoffee: string;
  themeSunlit: string;
  themeClean: string;
  themePurple: string;
  themeContrast: string;
  feedbackLabel: string;
  clearCaches: string;
  renderedCommandPreview: string;
  renderedCommandPreviewNeedProto: string;
  renderedCommandPreviewNeedContext: string;
  addProtoRoot: string;
  noProtoRoots: string;
  notConfigured: string;
  searchInWorkspace: string;
  on: string;
  off: string;
  refresh: string;
  goToProtoDefinition: string;
  goToGoUsage: string;
  compileCurrentProto: string;
  diagnoseCurrentSymbol: string;
  testNavigationDone: string;
  testNavigationNeedEditor: string;
  testNavigationUnsupported: string;
  testNavigationResolved: string;
  testNavigationNoResult: string;
  editMakeProtoRule: string;
  language: string;
  languageChinese: string;
  languageEnglish: string;
  languageSelectTitle: string;
  languageUpdated: string;
  openSettingsOpenedJson: string;
  goFileRequired: string;
  resolveFailed: string;
  resolveFailedDiagnoseAction: string;
  protoDefinitionRequired: string;
  pickProtoDefinitionTitle: string;
  pickProtoDefinitionPlaceholder: string;
  searchingGoUsages: string;
  noGoUsagesFound: string;
  pickGoUsageTitle: string;
  pickLocationPlaceholder: string;
  compilingCurrentProto: string;
  compileCurrentProtoDone: string;
  compileCurrentProtoFailed: string;
  compileCurrentProtoInvalid: string;
  makeProtoRulePrompt: string;
  makeProtoRulePlaceholder: string;
  makeProtoRuleOpenedJson: string;
  makeProtoRuleSaved: string;
  makeProtoRuleEmpty: string;
  testMakeProtoRuleNeedActiveProto: string;
  testMakeProtoRuleDone: string;
  testMakeProtoRuleRenderedOnly: string;
  testMakeProtoRuleFailed: string;
  clearCachesDone: string;
  diagnoseCurrentSymbolDone: string;
  outputTime: string;
  outputActiveEditorNone: string;
  outputFile: string;
  outputLanguage: string;
  outputCursor: string;
  outputSymbol: string;
  outputWorkspace: string;
  outputResult: string;
  outputNone: string;
  outputEmpty: string;
  outputConfigured: string;
  outputNotFound: string;
  outputResolved: string;
  outputCandidates: string;
  outputMore: string;
  testNavigationOutputTitle: string;
  testNavigationOutputUnsupported: string;
  diagnosticsOutputTitle: string;
  diagnosticsEditorSection: string;
  diagnosticsConfigSection: string;
  diagnosticsProtoSection: string;
  diagnosticsGoDefinitionProviderSection: string;
  diagnosticsResolutionSection: string;
  diagnosticsUnsupportedEditor: string;
  diagnosticsGoPackageName: string;
  diagnosticsGoPackageImportPath: string;
  diagnosticsUsageStrategy: string;
  diagnosticsUsageStrategyValue: string;
  diagnosticsUsageCandidates: string;
  diagnosticsTotalDefinitions: string;
  diagnosticsGeneratedGoDefinitions: string;
  diagnosticsElapsed: string;
  diagnosticsError: string;
  diagnosticsSteps: string;
  diagnosticsProtoCandidates: string;
  diagnosticsResolvedProto: string;
  diagnosticsCandidateExists: string;
  diagnosticsCandidateMissing: string;
  diagnosticsCandidateVia: string;
};

export function getStrings(lang: UiLanguage = getUiLanguage()): Strings {
  if (lang === 'zh') {
    return {
      primaryActionGoTitle: 'Go → Proto',
      primaryActionProtoCompileTitle: '编译此 Proto',
      primaryActionProtoSetupTitle: 'Proto 工具',
      primaryActionEmptyTitle: '未检测到可操作文件',
      primaryActionUnsupportedTitle: '不支持当前文件',
      primaryActionGoButton: '跳转到 Proto',
      primaryActionConfigureRule: '配置编译规则',
      primaryActionDisabledButton: '等待文件',
      primaryActionGoDescription: '跳转到当前 Go 符号对应的 .proto 定义。',
      primaryActionProtoDescription: '使用 .jumpproto 中的规则编译当前文件。',
      primaryActionProtoSetupDescription: '可反查 Go 使用处；配置规则后可编译当前文件。',
      primaryActionFallbackDescription: '打开 Go 或 .proto 文件后，可在这里执行跳转、反查或编译。',
      primaryActionUnsupportedDescription: '切换到 Go 或 .proto 文件后，可使用 JumpProto 操作。',
      protoRootsEmptyDescription: '未配置 Proto 根目录。JumpProto 仍会尝试通过生成文件头和工作区搜索跳转；添加根目录可提升跨目录解析命中率。',
      makeProtoRuleEmptyDescription: '配置后即可在侧边栏编译当前 Proto。',
      makeProtoRuleConfiguredDescription: '已保存为当前工作区的编译命令模板。',
      diagnosticTools: '诊断工具',
      advanced: '高级',
      protoRoots: 'Proto 根目录',
      makeProtoRule: 'Make Proto 规则',
      makeProtoRuleHelp: '规则说明',
      makeProtoRuleHelpTitle: 'Make Proto 规则说明',
      makeProtoRuleHelpIntro: '这里填写一条终端命令。点击“编译此 Proto”时，JumpProto 会把当前 .proto 文件信息填进命令里再执行。',
      makeProtoRuleHelpUsageTitle: '推荐写法',
      makeProtoRuleHelpUsage: '先从下面这个模板开始，再把 make 目标和参数名改成你项目里的名字。',
      makeProtoRuleHelpQuickStartTitle: '怎么用',
      makeProtoRuleHelpQuickStartStep1: '点击“编辑”，填入一条编译命令，然后保存。',
      makeProtoRuleHelpQuickStartStep2: '先点“测试命令”，只检查命令格式，不会真正编译。',
      makeProtoRuleHelpQuickStartStep3: '确认没问题后，打开 .proto 文件并点击“编译此 Proto”。',
      makeProtoRuleHelpDemoTitle: '例子',
      makeProtoRuleHelpDemoContext: '假设当前文件是 api/activity/user_profile.proto。',
      makeProtoRuleHelpDemoResultLabel: '执行时会变成',
      makeProtoRuleHelpPlaceholdersTitle: '常用占位符',
      makeProtoRuleHelpPlaceholderWorkspaceFolder: '当前工作区目录',
      makeProtoRuleHelpPlaceholderProtoSrcRoot: '当前 .proto 所在的 Proto 根目录',
      makeProtoRuleHelpPlaceholderProtoFileNoExt: '当前文件名，不含 .proto',
      makeProtoRuleHelpPlaceholderRelativeProto: '当前文件相对 Proto 根目录的路径',
      makeProtoRuleHelpPlaceholderProtoPackage: '从 package/go_package 推出的包名',
      makeProtoRuleHelpTroubleshootingTitle: '不生效时看这里',
      makeProtoRuleHelpTroubleshooting1: '提示规则为空：先保存规则。',
      makeProtoRuleHelpTroubleshooting2: '提示路径不可编译：打开的 .proto 需要位于可识别的 proto_src 或 Proto 根目录下。',
      makeProtoRuleHelpTroubleshooting3: '测试失败：把展开后的命令复制到终端运行，先确认 make 目标和参数名正确。',
      makeProtoRuleHelpTipsTitle: '提示',
      makeProtoRuleHelpTips: '路径和参数会自动加引号；一般不需要自己再包一层引号。',
      makeProtoRuleUnset: '未配置',
      remove: '移除',
      save: '保存',
      cancel: '取消',
      configure: '配置',
      edit: '编辑',
      saved: '已保存',
      unsaved: '未保存',
      openJson: '打开 .jumpproto',
      testCommand: '测试命令',
      testNavigation: '测试跳转',
      openOutput: '打开输出',
      themeLabel: '切换主题',
      themeSystem: '跟随编辑器',
      themeDark: '深色',
      themeLight: '浅色',
      themeAurora: '极光',
      themeCoffee: '咖啡',
      themeSunlit: '日光',
      themeClean: '清爽浅色',
      themePurple: '紫夜',
      themeContrast: '高对比度',
      feedbackLabel: '反馈问题',
      clearCaches: '清除缓存',
      renderedCommandPreview: '展开后的命令',
      renderedCommandPreviewNeedProto: '打开 .proto 文件后显示展开结果',
      renderedCommandPreviewNeedContext: '当前 .proto 不在可识别的 proto_src / protoRoots 下',
      addProtoRoot: '添加 Proto 根目录',
      noProtoRoots: '暂无 Proto 根目录',
      notConfigured: '未配置',
      searchInWorkspace: '在工作区搜索',
      on: '开',
      off: '关',
      refresh: '刷新',
      goToProtoDefinition: '跳转到 Proto',
      goToGoUsage: '跳转到 Go',
      compileCurrentProto: '编译此 Proto',
      diagnoseCurrentSymbol: '诊断当前符号',
      testNavigationDone: 'JumpProto: 测试跳转结果已写入输出面板。',
      testNavigationNeedEditor: 'JumpProto: 请先打开 Go 或 .proto 文件并将光标放在符号上。',
      testNavigationUnsupported: 'JumpProto: 测试跳转仅支持 Go 和 .proto 文件。',
      testNavigationResolved: 'JumpProto: 已解析到结果，未执行跳转。',
      testNavigationNoResult: 'JumpProto: 未解析到跳转结果。',
      editMakeProtoRule: '编辑 Make Proto 规则',
      language: '语言',
      languageChinese: '中文',
      languageEnglish: 'English',
      languageSelectTitle: '选择语言',
      languageUpdated: 'JumpProto: 语言已更新。',
      openSettingsOpenedJson: 'JumpProto: 已打开 settings.json，请搜索并编辑 protoJump 配置。',
      goFileRequired: 'JumpProto: 请先打开一个 Go 文件并将光标放在符号上。',
      resolveFailed: 'JumpProto: 未能解析到对应的 .proto 定义（请检查 protoRoots / workspace 中是否存在该 proto 文件）。',
      resolveFailedDiagnoseAction: '运行诊断',
      protoDefinitionRequired: 'JumpProto: 请将光标放在 proto 的 message/enum/service 名称上。',
      pickProtoDefinitionTitle: '选择 proto 定义',
      pickProtoDefinitionPlaceholder: '请选择要查找使用处的 message/enum/service',
      searchingGoUsages: 'JumpProto: 正在查找 Go 使用处…',
      noGoUsagesFound: 'JumpProto: 未找到 Go 使用处。',
      pickGoUsageTitle: '选择要跳转的位置',
      pickLocationPlaceholder: '输入关键字过滤，回车跳转',
      compilingCurrentProto: 'JumpProto: 正在编译当前 Proto…',
      compileCurrentProtoDone: 'JumpProto: 当前 Proto 编译完成。',
      compileCurrentProtoFailed: 'JumpProto: 当前 Proto 编译失败。',
      compileCurrentProtoInvalid: 'JumpProto: 当前文件不在可编译的 proto_src 路径下。',
      makeProtoRulePrompt: '请输入当前项目的 Proto 编译命令模板',
      makeProtoRulePlaceholder: '例如：cd {protoSrcRoot} && make special_proto packagename={protoPackage} filename={protoFileNoExt}',
      makeProtoRuleOpenedJson: 'JumpProto: 已打开项目配置文件 .jumpproto。',
      makeProtoRuleSaved: 'JumpProto: Make Proto 规则已保存到 .jumpproto。',
      makeProtoRuleEmpty: 'JumpProto: Make Proto 规则为空，请先填写。',
      testMakeProtoRuleNeedActiveProto: 'JumpProto: 请先打开一个 .proto 文件用于测试命令。',
      testMakeProtoRuleDone: 'JumpProto: 测试通过（dry-run，仅校验命令模板和 shell 语法）。',
      testMakeProtoRuleRenderedOnly: 'JumpProto: 当前系统 shell 不支持 dry-run 语法校验，已仅渲染命令。',
      testMakeProtoRuleFailed: 'JumpProto: 测试失败。',
      clearCachesDone: 'JumpProto: 缓存已清除。',
      diagnoseCurrentSymbolDone: 'JumpProto: 诊断信息已写入输出面板。',
      outputTime: '时间',
      outputActiveEditorNone: '当前编辑器：无',
      outputFile: '文件',
      outputLanguage: '语言',
      outputCursor: '光标',
      outputSymbol: '符号',
      outputWorkspace: '工作区',
      outputResult: '结果',
      outputNone: '无',
      outputEmpty: '空',
      outputConfigured: '已配置',
      outputNotFound: '未找到',
      outputResolved: '已解析',
      outputCandidates: '候选结果',
      outputMore: '个更多结果',
      testNavigationOutputTitle: 'JumpProto 测试跳转',
      testNavigationOutputUnsupported: '当前编辑器不支持测试跳转。请先打开 Go 或 .proto 文件。',
      diagnosticsOutputTitle: 'JumpProto 诊断',
      diagnosticsEditorSection: '编辑器',
      diagnosticsConfigSection: '配置',
      diagnosticsProtoSection: 'Proto',
      diagnosticsGoDefinitionProviderSection: 'Go 定义提供器',
      diagnosticsResolutionSection: 'JumpProto 解析',
      diagnosticsUnsupportedEditor: '此命令主要用于 Go 或 .proto 文件。',
      diagnosticsGoPackageName: 'go_package 包名',
      diagnosticsGoPackageImportPath: 'go_package 导入路径',
      diagnosticsUsageStrategy: '使用处搜索策略',
      diagnosticsUsageStrategyValue: '缓存的工作区扫描 + Proto 扫描器 + Go token 扫描器 + import 别名 + 同包裸名 + 结构化字段访问',
      diagnosticsUsageCandidates: '使用处候选',
      diagnosticsTotalDefinitions: '定义总数',
      diagnosticsGeneratedGoDefinitions: '生成 Go 定义数',
      diagnosticsElapsed: '耗时',
      diagnosticsError: '错误',
      diagnosticsSteps: '步骤',
      diagnosticsProtoCandidates: 'Proto 候选',
      diagnosticsResolvedProto: '已解析 Proto',
      diagnosticsCandidateExists: '存在',
      diagnosticsCandidateMissing: '缺失',
      diagnosticsCandidateVia: '来源'
    };
  }

  return {
    primaryActionGoTitle: 'Go → Proto',
    primaryActionProtoCompileTitle: 'Compile This Proto',
    primaryActionProtoSetupTitle: 'Proto Tools',
    primaryActionEmptyTitle: 'No actionable file detected',
    primaryActionUnsupportedTitle: 'Unsupported file',
    primaryActionGoButton: 'Jump To Proto',
    primaryActionConfigureRule: 'Configure Rule',
    primaryActionDisabledButton: 'Waiting',
    primaryActionGoDescription: 'Jump to the .proto definition for the current Go symbol.',
    primaryActionProtoDescription: 'Compile the current file using the rule from .jumpproto.',
    primaryActionProtoSetupDescription: 'Search Go usages now; configure a rule to compile this file.',
    primaryActionFallbackDescription: 'Open a Go or .proto file to run navigation, usage search, or compile actions here.',
    primaryActionUnsupportedDescription: 'Switch to a Go or .proto file to use JumpProto actions.',
    protoRootsEmptyDescription: 'No Proto roots configured. JumpProto still tries generated-file headers and workspace search; adding roots improves cross-directory resolution.',
    makeProtoRuleEmptyDescription: 'Configure this to compile the active Proto from the sidebar.',
    makeProtoRuleConfiguredDescription: 'Saved as the compile command template for this workspace.',
    diagnosticTools: 'Diagnostic Tools',
    advanced: 'Advanced',
    protoRoots: 'Proto Roots',
    makeProtoRule: 'Make Proto Rule',
    makeProtoRuleHelp: 'Rule Guide',
    makeProtoRuleHelpTitle: 'Make Proto Rule Guide',
    makeProtoRuleHelpIntro: 'Enter one terminal command here. When you click "Compile This Proto", JumpProto fills in the current .proto file values and runs it.',
    makeProtoRuleHelpUsageTitle: 'Recommended Template',
    makeProtoRuleHelpUsage: 'Start with this template, then rename the make target and argument names for your project.',
    makeProtoRuleHelpQuickStartTitle: 'How To Use',
    makeProtoRuleHelpQuickStartStep1: 'Click "Edit", enter one compile command, then save it.',
    makeProtoRuleHelpQuickStartStep2: 'Run "Test Command" first. It checks the command format and does not compile.',
    makeProtoRuleHelpQuickStartStep3: 'If it looks right, open a .proto file and click "Compile This Proto".',
    makeProtoRuleHelpDemoTitle: 'Example',
    makeProtoRuleHelpDemoContext: 'Assume the current file is api/activity/user_profile.proto.',
    makeProtoRuleHelpDemoResultLabel: 'It runs as',
    makeProtoRuleHelpPlaceholdersTitle: 'Common Placeholders',
    makeProtoRuleHelpPlaceholderWorkspaceFolder: 'Current workspace folder',
    makeProtoRuleHelpPlaceholderProtoSrcRoot: 'Proto root for the current file',
    makeProtoRuleHelpPlaceholderProtoFileNoExt: 'Current filename, without .proto',
    makeProtoRuleHelpPlaceholderRelativeProto: 'Current file path relative to the Proto root',
    makeProtoRuleHelpPlaceholderProtoPackage: 'Package name inferred from package/go_package',
    makeProtoRuleHelpTroubleshootingTitle: 'If It Does Not Work',
    makeProtoRuleHelpTroubleshooting1: 'Rule is empty: save the rule first.',
    makeProtoRuleHelpTroubleshooting2: 'File is not compilable: open a .proto under a recognized proto_src or Proto root.',
    makeProtoRuleHelpTroubleshooting3: 'Test failed: run the rendered command in terminal and check the make target and argument names.',
    makeProtoRuleHelpTipsTitle: 'Tip',
    makeProtoRuleHelpTips: 'Paths and arguments are quoted automatically; you usually do not need extra quotes.',
    makeProtoRuleUnset: 'Not configured',
    remove: 'Remove',
    save: 'Save',
    cancel: 'Cancel',
    configure: 'Configure',
    edit: 'Edit',
    saved: 'Saved',
    unsaved: 'Unsaved',
    openJson: 'Open .jumpproto',
    testCommand: 'Test Command',
    testNavigation: 'Test Navigation',
    openOutput: 'Open Output',
    themeLabel: 'Switch Theme',
    themeSystem: 'Follow Editor',
    themeDark: 'Dark',
    themeLight: 'Light',
    themeAurora: 'Aurora',
    themeCoffee: 'Coffee',
    themeSunlit: 'Sunlit',
    themeClean: 'Clean Light',
    themePurple: 'Purple Night',
    themeContrast: 'High Contrast',
    feedbackLabel: 'Send Feedback',
    clearCaches: 'Clear Cache',
    renderedCommandPreview: 'Rendered Command',
    renderedCommandPreviewNeedProto: 'Open a .proto file to preview the rendered command',
    renderedCommandPreviewNeedContext: 'Current .proto is not under a recognized proto_src / protoRoots path',
    addProtoRoot: 'Add Proto Root',
    noProtoRoots: 'No Proto Roots',
    notConfigured: 'Not configured',
    searchInWorkspace: 'Search In Workspace',
    on: 'On',
    off: 'Off',
    refresh: 'Refresh',
    goToProtoDefinition: 'Jump To Proto',
    goToGoUsage: 'Jump To Go',
    compileCurrentProto: 'Compile This Proto',
    diagnoseCurrentSymbol: 'Diagnose Current Symbol',
    testNavigationDone: 'JumpProto: Test navigation result written to the output panel.',
    testNavigationNeedEditor: 'JumpProto: Open a Go or .proto file and place the cursor on a symbol first.',
    testNavigationUnsupported: 'JumpProto: Test navigation supports Go and .proto files only.',
    testNavigationResolved: 'JumpProto: Resolved a result without jumping.',
    testNavigationNoResult: 'JumpProto: No navigation result resolved.',
    editMakeProtoRule: 'Edit Make Proto Rule',
    language: 'Language',
    languageChinese: '中文',
    languageEnglish: 'English',
    languageSelectTitle: 'Select language',
    languageUpdated: 'JumpProto: Language updated.',
    openSettingsOpenedJson: 'JumpProto: Opened settings.json. Search and edit protoJump configuration.',
    goFileRequired: 'JumpProto: Open a Go file and place the cursor on the symbol first.',
    resolveFailed: 'JumpProto: Failed to resolve .proto definition (check protoRoots / workspace for the proto file).',
    resolveFailedDiagnoseAction: 'Run Diagnostics',
    protoDefinitionRequired: 'JumpProto: Place the cursor on a proto message/enum/service name.',
    pickProtoDefinitionTitle: 'Select proto definition',
    pickProtoDefinitionPlaceholder: 'Pick a message/enum/service to search usages for',
    searchingGoUsages: 'JumpProto: Searching Go usages…',
    noGoUsagesFound: 'JumpProto: No Go usages found.',
    pickGoUsageTitle: 'Select a location to open',
    pickLocationPlaceholder: 'Type to filter, press Enter to open',
    compilingCurrentProto: 'JumpProto: Compiling current proto…',
    compileCurrentProtoDone: 'JumpProto: Current proto compiled.',
    compileCurrentProtoFailed: 'JumpProto: Failed to compile current proto.',
    compileCurrentProtoInvalid: 'JumpProto: Current file is not under a supported proto_src path.',
    makeProtoRulePrompt: 'Enter the proto compile command template for this project',
    makeProtoRulePlaceholder: 'Example: cd {protoSrcRoot} && make special_proto packagename={protoPackage} filename={protoFileNoExt}',
    makeProtoRuleOpenedJson: 'JumpProto: Opened project config file .jumpproto.',
    makeProtoRuleSaved: 'JumpProto: Make proto rule saved to .jumpproto.',
    makeProtoRuleEmpty: 'JumpProto: Make proto rule is empty. Fill it first.',
    testMakeProtoRuleNeedActiveProto: 'JumpProto: Open a .proto file first to test the command.',
    testMakeProtoRuleDone: 'JumpProto: Test passed (dry-run; template and shell syntax only).',
    testMakeProtoRuleRenderedOnly: 'JumpProto: The current system shell does not support dry-run syntax checks; command rendered only.',
    testMakeProtoRuleFailed: 'JumpProto: Test failed.',
    clearCachesDone: 'JumpProto: Cache cleared.',
    diagnoseCurrentSymbolDone: 'JumpProto: Diagnostics written to the output panel.',
    outputTime: 'Time',
    outputActiveEditorNone: 'Active editor: none',
    outputFile: 'File',
    outputLanguage: 'Language',
    outputCursor: 'Cursor',
    outputSymbol: 'Symbol',
    outputWorkspace: 'Workspace',
    outputResult: 'Result',
    outputNone: 'none',
    outputEmpty: 'empty',
    outputConfigured: 'configured',
    outputNotFound: 'not found',
    outputResolved: 'Resolved',
    outputCandidates: 'Candidates',
    outputMore: 'more',
    testNavigationOutputTitle: 'JumpProto Test Navigation',
    testNavigationOutputUnsupported: 'Unsupported editor. Open a Go or .proto file first.',
    diagnosticsOutputTitle: 'JumpProto Diagnostics',
    diagnosticsEditorSection: 'Editor',
    diagnosticsConfigSection: 'Config',
    diagnosticsProtoSection: 'Proto',
    diagnosticsGoDefinitionProviderSection: 'Go Definition Provider',
    diagnosticsResolutionSection: 'JumpProto Resolution',
    diagnosticsUnsupportedEditor: 'This command is most useful in Go or .proto files.',
    diagnosticsGoPackageName: 'go_package packageName',
    diagnosticsGoPackageImportPath: 'go_package importPath',
    diagnosticsUsageStrategy: 'Usage strategy',
    diagnosticsUsageStrategyValue: 'cached workspace scan + proto scanner + Go token scanner + import alias + same-package bare name + structured field access',
    diagnosticsUsageCandidates: 'Usage candidates',
    diagnosticsTotalDefinitions: 'Total definitions',
    diagnosticsGeneratedGoDefinitions: 'Generated Go definitions',
    diagnosticsElapsed: 'Elapsed',
    diagnosticsError: 'Error',
    diagnosticsSteps: 'Steps',
    diagnosticsProtoCandidates: 'Proto candidates',
    diagnosticsResolvedProto: 'Resolved proto',
    diagnosticsCandidateExists: 'exists',
    diagnosticsCandidateMissing: 'missing',
    diagnosticsCandidateVia: 'via'
  };
}
