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
  actions: string;
  heroSubtitle: string;
  config: string;
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
  makeProtoRuleHelpDemoRuleLabel: string;
  makeProtoRuleHelpDemoResultLabel: string;
  makeProtoRuleHelpAdvancedDemoTitle: string;
  makeProtoRuleHelpAdvancedDemoContext: string;
  makeProtoRuleHelpAdvancedDemoRuleLabel: string;
  makeProtoRuleHelpAdvancedDemoResultLabel: string;
  makeProtoRuleHelpPlaceholdersTitle: string;
  makeProtoRuleHelpPlaceholderWorkspaceFolder: string;
  makeProtoRuleHelpPlaceholderProtoSrcRoot: string;
  makeProtoRuleHelpPlaceholderProtoFile: string;
  makeProtoRuleHelpPlaceholderProtoFileNoExt: string;
  makeProtoRuleHelpPlaceholderProtoDir: string;
  makeProtoRuleHelpPlaceholderRelativeProto: string;
  makeProtoRuleHelpPlaceholderRelativeProtoNoExt: string;
  makeProtoRuleHelpPlaceholderProtoPackage: string;
  makeProtoRuleHelpTroubleshootingTitle: string;
  makeProtoRuleHelpTroubleshooting1: string;
  makeProtoRuleHelpTroubleshooting2: string;
  makeProtoRuleHelpTroubleshooting3: string;
  makeProtoRuleHelpTipsTitle: string;
  makeProtoRuleHelpTips: string;
  makeProtoRuleUnset: string;
  save: string;
  edit: string;
  saved: string;
  unsaved: string;
  openJson: string;
  testCommand: string;
  addProtoRoot: string;
  noProtoRoots: string;
  notConfigured: string;
  searchInWorkspace: string;
  on: string;
  off: string;
  rightClickToRemove: string;
  refresh: string;
  goToProtoDefinition: string;
  goToGoUsage: string;
  compileCurrentProto: string;
  editMakeProtoRule: string;
  language: string;
  languageChinese: string;
  languageEnglish: string;
  languageSelectTitle: string;
  languageUpdated: string;
  openSettingsOpenedJson: string;
  goFileRequired: string;
  resolveFailed: string;
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
  testMakeProtoRuleFailed: string;
};

export function getStrings(lang: UiLanguage = getUiLanguage()): Strings {
  if (lang === 'zh') {
    return {
      actions: '操作',
      heroSubtitle: 'Proto 跳转、编译规则与工作区配置',
      config: '配置',
      protoRoots: 'Proto 根目录',
      makeProtoRule: 'Make Proto 规则',
      makeProtoRuleHelp: '规则说明',
      makeProtoRuleHelpTitle: 'Make Proto 规则说明',
      makeProtoRuleHelpIntro: 'Make Proto 规则用于定义“编译当前 .proto”时实际执行的 shell 命令模板。你可以通过占位符把当前文件上下文注入命令，适配不同项目的 Makefile/脚本结构。',
      makeProtoRuleHelpUsageTitle: '基本用法',
      makeProtoRuleHelpUsage: '在规则中填写可执行的 shell 模板，例如：cd {protoSrcRoot} && make special_proto packagename={protoPackage} filename={protoFileNoExt}。执行时，JumpProto 会把占位符替换成当前 .proto 对应值后再运行。',
      makeProtoRuleHelpQuickStartTitle: '1 分钟上手',
      makeProtoRuleHelpQuickStartStep1: '在侧边栏填写 Make Proto 规则，点击“保存”。',
      makeProtoRuleHelpQuickStartStep2: '先点“测试命令”，只做 dry-run 语法校验，不会真正执行编译。',
      makeProtoRuleHelpQuickStartStep3: '通过后执行“编译当前 Proto”，按当前打开的 .proto 文件上下文运行命令。',
      makeProtoRuleHelpDemoTitle: 'Demo（可直接照抄）',
      makeProtoRuleHelpDemoContext: '假设当前文件是 api/activity/user_profile.proto，proto 根目录为 /ABSOLUTE/PATH/TO/proto_src。',
      makeProtoRuleHelpDemoRuleLabel: '规则模板',
      makeProtoRuleHelpDemoResultLabel: '运行时展开结果',
      makeProtoRuleHelpAdvancedDemoTitle: '进阶示例（按目录分流）',
      makeProtoRuleHelpAdvancedDemoContext: '适合同仓库多套编译目标：根据 {relativeProto} 自动选择不同 make 目标。',
      makeProtoRuleHelpAdvancedDemoRuleLabel: '规则模板',
      makeProtoRuleHelpAdvancedDemoResultLabel: '当当前文件为 rpc/user/get_user.proto 时，运行时展开结果',
      makeProtoRuleHelpPlaceholdersTitle: '可用占位符',
      makeProtoRuleHelpPlaceholderWorkspaceFolder: '当前工作区根目录',
      makeProtoRuleHelpPlaceholderProtoSrcRoot: '当前 proto 命中的根目录（来自 protoRoots）',
      makeProtoRuleHelpPlaceholderProtoFile: '当前 proto 文件名（含 .proto）',
      makeProtoRuleHelpPlaceholderProtoFileNoExt: '当前 proto 文件名（不含扩展名）',
      makeProtoRuleHelpPlaceholderProtoDir: '当前 proto 文件所在目录（绝对路径）',
      makeProtoRuleHelpPlaceholderRelativeProto: '相对 protoSrcRoot 的路径（含 .proto）',
      makeProtoRuleHelpPlaceholderRelativeProtoNoExt: '相对 protoSrcRoot 的路径（不含扩展名）',
      makeProtoRuleHelpPlaceholderProtoPackage: '根据 proto package/go_package 推导的包名片段',
      makeProtoRuleHelpTroubleshootingTitle: '常见问题排查',
      makeProtoRuleHelpTroubleshooting1: '提示规则为空：先保存 Make Proto 规则，再执行测试或编译。',
      makeProtoRuleHelpTroubleshooting2: '提示不是可编译路径：确认当前 .proto 位于可识别的 proto_src 下，且该目录存在 Makefile。',
      makeProtoRuleHelpTroubleshooting3: '测试失败：先在终端手动运行展开后的命令，确认 make 目标和参数名正确。',
      makeProtoRuleHelpTipsTitle: '使用建议',
      makeProtoRuleHelpTips: '先使用“测试命令”校验模板语法，再执行“编译当前 Proto”。如果命令里包含路径或参数空格，JumpProto 会自动做 shell 安全引用。',
      makeProtoRuleUnset: '未配置',
      save: '保存',
      edit: '编辑',
      saved: '已保存',
      unsaved: '未保存',
      openJson: '展开到 JSON',
      testCommand: '测试命令',
      addProtoRoot: '添加 Proto 根目录',
      noProtoRoots: '暂无 Proto 根目录',
      notConfigured: '未配置',
      searchInWorkspace: '在工作区搜索',
      on: '开',
      off: '关',
      rightClickToRemove: '右键移除',
      refresh: '刷新',
      goToProtoDefinition: '跳转到 Proto 定义',
      goToGoUsage: '跳转到 Go 使用处',
      compileCurrentProto: '编译当前 Proto',
      editMakeProtoRule: '编辑 Make Proto 规则',
      language: '语言',
      languageChinese: '中文',
      languageEnglish: 'English',
      languageSelectTitle: '选择语言',
      languageUpdated: 'JumpProto: 语言已更新。',
      openSettingsOpenedJson: 'JumpProto: 已打开 settings.json，请搜索并编辑 protoJump 配置。',
      goFileRequired: 'JumpProto: 请先打开一个 Go 文件并将光标放在符号上。',
      resolveFailed: 'JumpProto: 未能解析到对应的 .proto 定义（请检查 protoRoots / workspace 中是否存在该 proto 文件）。',
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
      makeProtoRuleOpenedJson: 'JumpProto: 已打开设置，请编辑 protoJump.makeProtoCommand。',
      makeProtoRuleSaved: 'JumpProto: Make Proto 规则已保存到当前工作区配置。',
      makeProtoRuleEmpty: 'JumpProto: Make Proto 规则为空，请先填写。',
      testMakeProtoRuleNeedActiveProto: 'JumpProto: 请先打开一个 .proto 文件用于测试命令。',
      testMakeProtoRuleDone: 'JumpProto: 测试通过（dry-run，仅校验命令模板和 shell 语法）。',
      testMakeProtoRuleFailed: 'JumpProto: 测试失败。'
    };
  }

  return {
    actions: 'Actions',
    heroSubtitle: 'Proto navigation, compile rule and workspace setup',
    config: 'Config',
    protoRoots: 'Proto Roots',
    makeProtoRule: 'Make Proto Rule',
    makeProtoRuleHelp: 'Rule Guide',
    makeProtoRuleHelpTitle: 'Make Proto Rule Guide',
    makeProtoRuleHelpIntro: 'The Make Proto rule defines the shell command template executed by "Compile Current Proto". You can inject active-file context through placeholders to fit different Makefile or script layouts.',
    makeProtoRuleHelpUsageTitle: 'Basic Usage',
    makeProtoRuleHelpUsage: 'Write an executable shell template, for example: cd {protoSrcRoot} && make special_proto packagename={protoPackage} filename={protoFileNoExt}. At runtime, JumpProto replaces placeholders with values resolved from the active .proto file, then executes the command.',
    makeProtoRuleHelpQuickStartTitle: 'Quick Start (1 minute)',
    makeProtoRuleHelpQuickStartStep1: 'Fill in the Make Proto rule in the sidebar and click "Save".',
    makeProtoRuleHelpQuickStartStep2: 'Run "Test Command" first. It performs only a dry-run syntax check and will not compile.',
    makeProtoRuleHelpQuickStartStep3: 'If it passes, run "Compile Current Proto" to execute using the currently opened .proto context.',
    makeProtoRuleHelpDemoTitle: 'Demo (ready to copy)',
    makeProtoRuleHelpDemoContext: 'Assume current file is api/activity/user_profile.proto and proto root is /ABSOLUTE/PATH/TO/proto_src.',
    makeProtoRuleHelpDemoRuleLabel: 'Rule template',
    makeProtoRuleHelpDemoResultLabel: 'Rendered command at runtime',
    makeProtoRuleHelpAdvancedDemoTitle: 'Advanced Demo (route by directory)',
    makeProtoRuleHelpAdvancedDemoContext: 'Useful when one repository has multiple compile targets. Automatically select different make targets based on {relativeProto}.',
    makeProtoRuleHelpAdvancedDemoRuleLabel: 'Rule template',
    makeProtoRuleHelpAdvancedDemoResultLabel: 'Rendered command when current file is rpc/user/get_user.proto',
    makeProtoRuleHelpPlaceholdersTitle: 'Supported Placeholders',
    makeProtoRuleHelpPlaceholderWorkspaceFolder: 'Current workspace root directory',
    makeProtoRuleHelpPlaceholderProtoSrcRoot: 'Matched proto root of current file (from protoRoots)',
    makeProtoRuleHelpPlaceholderProtoFile: 'Current proto filename (with .proto)',
    makeProtoRuleHelpPlaceholderProtoFileNoExt: 'Current proto filename (without extension)',
    makeProtoRuleHelpPlaceholderProtoDir: 'Absolute directory of current proto file',
    makeProtoRuleHelpPlaceholderRelativeProto: 'Path relative to protoSrcRoot (with .proto)',
    makeProtoRuleHelpPlaceholderRelativeProtoNoExt: 'Path relative to protoSrcRoot (without extension)',
    makeProtoRuleHelpPlaceholderProtoPackage: 'Package segment inferred from proto package/go_package',
    makeProtoRuleHelpTroubleshootingTitle: 'Troubleshooting',
    makeProtoRuleHelpTroubleshooting1: 'Rule is empty: save a Make Proto rule before testing or compiling.',
    makeProtoRuleHelpTroubleshooting2: 'File is not under a compilable path: ensure current .proto is under a recognized proto_src path and that directory contains a Makefile.',
    makeProtoRuleHelpTroubleshooting3: 'Test failed: run the rendered command in terminal first to verify the make target and argument names.',
    makeProtoRuleHelpTipsTitle: 'Tips',
    makeProtoRuleHelpTips: 'Use "Test Command" to validate template syntax before running "Compile Current Proto". If your command includes paths or arguments with spaces, JumpProto applies shell-safe quoting automatically.',
    makeProtoRuleUnset: 'Not configured',
    save: 'Save',
    edit: 'Edit',
    saved: 'Saved',
    unsaved: 'Unsaved',
    openJson: 'Open JSON',
    testCommand: 'Test Command',
    addProtoRoot: 'Add Proto Root',
    noProtoRoots: 'No Proto Roots',
    notConfigured: 'Not configured',
    searchInWorkspace: 'Search In Workspace',
    on: 'On',
    off: 'Off',
    rightClickToRemove: 'Right click to remove',
    refresh: 'Refresh',
    goToProtoDefinition: 'Go to Proto Definition',
    goToGoUsage: 'Go to Go Usage',
    compileCurrentProto: 'Compile Current Proto',
    editMakeProtoRule: 'Edit Make Proto Rule',
    language: 'Language',
    languageChinese: '中文',
    languageEnglish: 'English',
    languageSelectTitle: 'Select language',
    languageUpdated: 'JumpProto: Language updated.',
    openSettingsOpenedJson: 'JumpProto: Opened settings.json. Search and edit protoJump configuration.',
    goFileRequired: 'JumpProto: Open a Go file and place the cursor on the symbol first.',
    resolveFailed: 'JumpProto: Failed to resolve .proto definition (check protoRoots / workspace for the proto file).',
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
    makeProtoRuleOpenedJson: 'JumpProto: Opened settings. Edit protoJump.makeProtoCommand there.',
    makeProtoRuleSaved: 'JumpProto: Make proto rule saved to workspace settings.',
    makeProtoRuleEmpty: 'JumpProto: Make proto rule is empty. Fill it first.',
    testMakeProtoRuleNeedActiveProto: 'JumpProto: Open a .proto file first to test the command.',
    testMakeProtoRuleDone: 'JumpProto: Test passed (dry-run; template and shell syntax only).',
    testMakeProtoRuleFailed: 'JumpProto: Test failed.'
  };
}
