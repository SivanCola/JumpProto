// Copyright 2026 JumpProto contributors.
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import test from 'node:test';

import { extractProtoPathFromPbGo, findProtoSymbolMatch } from './core';
import {
  findGoCompositeFieldUsagesInText,
  findGoFieldAccessUsagesInText,
  findGoSymbolUsagesInText,
  findGoVariableFieldUsagesInText,
  findImportAliases,
  parseGoPackageInfo
} from './goText';
import { resolveProtoSrcRootPath } from './pathResolver';
import { findProtoFieldContextAtOffset } from './protoScanner';

const fixturesRoot = path.join(process.cwd(), 'test', 'fixtures');
const workspaceRoot = path.join(fixturesRoot, 'workspace');
const protoRoot = path.join(workspaceRoot, 'proto_src');
const externalProtoRoot = path.join(fixturesRoot, 'external_proto');

function readFixture(...parts: string[]): string {
  return fs.readFileSync(path.join(fixturesRoot, ...parts), 'utf8');
}

test('fixture resolves generated Go source header back to proto symbols', () => {
  const pbGo = readFixture('workspace', 'gen', 'activitypb', 'user_profile.pb.go');
  const protoPath = extractProtoPathFromPbGo(pbGo);
  assert.equal(protoPath, 'api/activity/user_profile.proto');

  const proto = readFixture('workspace', 'proto_src', protoPath!);
  const message = findProtoSymbolMatch(proto, 'UserProfile');
  const enumMatch = findProtoSymbolMatch(proto, 'Status');
  const rpc = findProtoSymbolMatch(proto, 'GetUserProfile');
  const fieldAfterNested = findProtoSymbolMatch(proto, 'UserName', 'UserProfile');
  const nestedField = findProtoSymbolMatch(proto, 'NickName', 'UserProfile_Detail');
  const nestedMessage = findProtoSymbolMatch(proto, 'UserProfile_Detail');

  assert.equal(message?.kind, 'message');
  assert.equal(enumMatch?.kind, 'enum');
  assert.equal(rpc?.kind, 'rpc');
  assert.equal(nestedMessage?.kind, 'message');
  assert.equal(proto.slice(nestedMessage!.startOffset, nestedMessage!.endOffset), 'Detail');
  assert.equal(proto.slice(fieldAfterNested!.startOffset, fieldAfterNested!.endOffset), 'user_name');
  assert.equal(proto.slice(nestedField!.startOffset, nestedField!.endOffset), 'nick_name');
});

test('fixture resolves proto roots from configured external roots and proto_src fallback', () => {
  const externalProto = path.join(externalProtoRoot, 'shared', 'external.proto');
  assert.equal(resolveProtoSrcRootPath(externalProto, [externalProtoRoot]), externalProtoRoot);

  const workspaceProto = path.join(protoRoot, 'api', 'activity', 'user_profile.proto');
  assert.equal(resolveProtoSrcRootPath(workspaceProto, []), protoRoot);
});

test('fixture finds Go usage forms for aliases, default imports, and same-package bare names', () => {
  const proto = readFixture('workspace', 'proto_src', 'api', 'activity', 'user_profile.proto');
  const goPkg = parseGoPackageInfo(proto);
  assert.deepEqual(goPkg, {
    packageName: 'activitypb',
    importPath: 'example.com/project/gen/activitypb'
  });

  const aliasedUsage = readFixture('workspace', 'service', 'user_service.go');
  const defaultImportUsage = readFixture('workspace', 'service', 'default_import.go');
  const samePackageUsage = readFixture('workspace', 'gen', 'activitypb', 'helper.go');

  assert.deepEqual(findImportAliases(aliasedUsage, goPkg!.importPath!, goPkg!.packageName), ['apb']);
  assert.deepEqual(findImportAliases(defaultImportUsage, goPkg!.importPath!, goPkg!.packageName), ['activitypb']);

  const aliasMatches = findGoSymbolUsagesInText(aliasedUsage, 'UserProfile', goPkg);
  const qualifiedMatches = findGoSymbolUsagesInText(defaultImportUsage, 'UserProfile', goPkg);
  const bareMatches = findGoSymbolUsagesInText(samePackageUsage, 'UserProfile', goPkg);

  assert.ok(aliasMatches.some(match => match.kind === 'alias' && match.text.includes('apb.UserProfile')));
  assert.ok(qualifiedMatches.some(match => match.kind === 'qualified' && match.text.includes('activitypb.UserProfile')));
  assert.ok(bareMatches.some(match => match.kind === 'bare' && match.text.includes('&UserProfile')));
});

test('fixture finds structured Go field usages for composites, typed variables, and getters', () => {
  const proto = readFixture('workspace', 'proto_src', 'api', 'activity', 'user_profile.proto');
  const goPkg = parseGoPackageInfo(proto);
  const aliasedUsage = readFixture('workspace', 'service', 'user_service.go');

  const composites = findGoCompositeFieldUsagesInText(aliasedUsage, 'UserProfile', 'UserName', goPkg);
  const variableUsages = findGoVariableFieldUsagesInText(aliasedUsage, 'UserProfile', 'UserName', goPkg);
  const fieldAccesses = findGoFieldAccessUsagesInText(aliasedUsage, 'UserName');

  assert.ok(composites.some(match => match.kind === 'compositeField' && match.text.includes('UserName:')));
  assert.ok(variableUsages.some(match => match.kind === 'selectorField' && match.text.includes('profile.UserName')));
  assert.ok(variableUsages.some(match => match.kind === 'getter' && match.text.includes('profile.GetUserName')));
  assert.ok(fieldAccesses.some(match => match.kind === 'getter' && match.text.includes('profile.GetUserName')));
});

test('fixture derives nested proto field container names from the proto scanner', () => {
  const proto = readFixture('workspace', 'proto_src', 'api', 'activity', 'user_profile.proto');
  const offset = proto.indexOf('nick_name');
  assert.notEqual(offset, -1);

  const ctx = findProtoFieldContextAtOffset(proto, offset);
  assert.deepEqual(ctx, {
    kind: 'fieldName',
    fieldName: 'nick_name',
    messageName: 'UserProfile_Detail'
  });
});

test('fixture derives nested proto field type Go names from the proto scanner', () => {
  const proto = readFixture('workspace', 'proto_src', 'api', 'activity', 'user_profile.proto');
  const offset = proto.indexOf('Detail detail');
  assert.notEqual(offset, -1);

  const ctx = findProtoFieldContextAtOffset(proto, offset);
  assert.deepEqual(ctx, {
    kind: 'fieldType',
    typeName: 'Detail',
    goTypeName: 'UserProfile_Detail'
  });
});

test('Go token scanner ignores comments and strings when finding symbols', () => {
  const goText = `package service

// apb.UserProfile should not be counted.
var _ = "apb.UserProfile"
`;
  const goPkg = {
    packageName: 'activitypb',
    importPath: 'example.com/project/gen/activitypb'
  };

  assert.deepEqual(findGoSymbolUsagesInText(goText, 'UserProfile', goPkg), []);
});
