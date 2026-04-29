// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

export type GoPackageOption = {
  packageName: string;
  importPath?: string;
};

export function getGoPackageOptionValue(protoText: string): string | undefined {
  return protoText.match(/^\s*option\s+go_package\s*=\s*"([^"]*)"\s*;/m)?.[1]?.trim();
}

export function sanitizeGoPackageName(name: string): string {
  const sanitized = name.trim().replace(/[^A-Za-z0-9_]/g, '_');
  if (!sanitized) return '';
  return /^[A-Za-z_]/.test(sanitized) ? sanitized : `_${sanitized}`;
}

export function parseGoPackageOptionValue(value: string): GoPackageOption | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const separator = trimmed.lastIndexOf(';');
  if (separator >= 0) {
    const importPath = trimmed.slice(0, separator).trim();
    const packageName = sanitizeGoPackageName(trimmed.slice(separator + 1));
    return packageName ? { packageName, importPath: importPath || undefined } : undefined;
  }

  const lastSegment = trimmed.split('/').filter(Boolean).pop()?.trim() ?? '';
  const packageName = sanitizeGoPackageName(lastSegment);
  return packageName ? { packageName, importPath: trimmed.includes('/') ? trimmed : undefined } : undefined;
}

export function inferProtoPackage(protoText: string): string {
  const goPackageValue = getGoPackageOptionValue(protoText);
  if (goPackageValue) return parseGoPackageOptionValue(goPackageValue)?.packageName ?? '';

  const protoPackageMatch = protoText.match(/^\s*package\s+([A-Za-z_][A-Za-z0-9_.]*)\s*;/m);
  return protoPackageMatch?.[1].split('.').pop()?.trim() ?? '';
}
