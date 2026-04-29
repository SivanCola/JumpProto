#!/usr/bin/env node

import { inflateRawSync } from "node:zlib";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const args = new Set(process.argv.slice(2));
const skipVsix = args.has("--skip-vsix");
const vsixPath = resolve(process.cwd(), process.env.VSIX_PATH || "dist/JumpProto.vsix");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const version = packageJson.version;
const expectedTag = `v${version}`;

function fail(message) {
  console.error(`Release verification failed: ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`ok - ${message}`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function verifyReleaseRef() {
  if (process.env.GITHUB_ACTIONS !== "true") {
    console.warn("warn - not running in GitHub Actions; skipped release ref check");
    return;
  }

  const refType = process.env.GITHUB_REF_TYPE || "";
  const refName = process.env.GITHUB_REF_NAME || "";
  const releaseVersion = process.env.RELEASE_VERSION || "";

  if (refType === "tag") {
    if (refName !== expectedTag) {
      fail(`tag ${refName} does not match package.json version ${version}; expected ${expectedTag}`);
    }
    pass(`tag ${refName} matches package.json version`);
    return;
  }

  if (!releaseVersion) {
    fail(`manual releases must provide RELEASE_VERSION=${version} or run from tag ${expectedTag}`);
  }

  if (releaseVersion !== version) {
    fail(`manual release version ${releaseVersion} does not match package.json version ${version}`);
  }

  pass(`manual release version ${releaseVersion} matches package.json version`);
}

function verifyChangelog() {
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  const headingPattern = new RegExp(`^#{1,3}\\s*(?:\\[)?v?${escapeRegExp(version)}(?:\\])?(?:\\s|$|[-:])`, "im");
  const match = headingPattern.exec(changelog);

  if (!match) {
    fail(`CHANGELOG.md does not contain a heading for version ${version}`);
  }

  const sectionStart = match.index + match[0].length;
  const rest = changelog.slice(sectionStart);
  const nextHeading = rest.search(/^#{1,3}\s+/m);
  const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
  const hasContent = section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => line && !line.startsWith("#"));

  if (!hasContent) {
    fail(`CHANGELOG.md section for version ${version} is empty`);
  }

  pass(`CHANGELOG.md contains release notes for ${version}`);
}

function findEndOfCentralDirectory(buffer) {
  const signature = 0x06054b50;
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);

  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) {
      return offset;
    }
  }

  fail("VSIX is not a valid zip archive");
}

function readZipEntries(filePath) {
  const buffer = readFileSync(filePath);
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  let offset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map();

  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      fail("VSIX central directory is malformed");
    }

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + fileNameLength);

    entries.set(name, {
      name,
      method,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return { buffer, entries };
}

function extractEntry(zip, entryName) {
  const entry = zip.entries.get(entryName);
  if (!entry) {
    fail(`VSIX is missing ${entryName}`);
  }

  const offset = entry.localHeaderOffset;
  if (zip.buffer.readUInt32LE(offset) !== 0x04034b50) {
    fail(`VSIX local header for ${entryName} is malformed`);
  }

  const fileNameLength = zip.buffer.readUInt16LE(offset + 26);
  const extraLength = zip.buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const compressed = zip.buffer.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.method === 0) {
    return compressed;
  }

  if (entry.method === 8) {
    return inflateRawSync(compressed);
  }

  fail(`VSIX entry ${entryName} uses unsupported compression method ${entry.method}`);
}

function requireEntry(zip, entryName) {
  if (!zip.entries.has(entryName)) {
    fail(`VSIX is missing ${entryName}`);
  }
}

function requireAnyEntry(zip, entryNames, label) {
  if (!entryNames.some((entryName) => zip.entries.has(entryName))) {
    fail(`VSIX is missing ${label}: expected one of ${entryNames.join(", ")}`);
  }
}

function verifyVsix() {
  try {
    const stats = statSync(vsixPath);
    if (!stats.isFile() || stats.size === 0) {
      fail(`${vsixPath} is empty or not a file`);
    }
  } catch {
    fail(`${vsixPath} does not exist`);
  }

  const zip = readZipEntries(vsixPath);
  const entryNames = [...zip.entries.keys()];

  requireEntry(zip, "extension.vsixmanifest");
  requireEntry(zip, "extension/package.json");
  requireAnyEntry(zip, ["extension/readme.md", "extension/README.md"], "README");
  requireAnyEntry(zip, ["extension/LICENSE.txt", "extension/LICENSE"], "license");
  requireAnyEntry(zip, ["extension/changelog.md", "extension/CHANGELOG.md"], "changelog");

  const main = String(packageJson.main || "").replace(/^\.\//, "");
  if (!main) {
    fail("package.json does not define a main entry");
  }
  requireEntry(zip, `extension/${main}`);

  if (packageJson.icon) {
    requireEntry(zip, `extension/${packageJson.icon}`);
  }

  const extensionPackage = JSON.parse(extractEntry(zip, "extension/package.json").toString("utf8"));
  if (extensionPackage.version !== version) {
    fail(`VSIX package version ${extensionPackage.version} does not match package.json version ${version}`);
  }

  const forbiddenPatterns = [
    /^extension\/src\//,
    /^extension\/test\//,
    /^extension\/scripts\//,
    /^extension\/\.github\//,
    /^extension\/\.gitignore$/,
    /^extension\/\.jumpjump\//,
    /^extension\/\.trae\//,
    /^extension\/\.vscode\//,
    /^extension\/AGENTS\.md$/,
    /^extension\/dist\//,
    /^extension\/todo\.md$/,
    /^extension\/tsconfig\.json$/,
    /^extension\/package-lock\.json$/,
    /^extension\/resources\/proto-jump\.svg$/,
    /^extension\/out\/.*\.test\.js(?:\.map)?$/,
    /^extension\/\.git(?:\/|$)/,
    /^extension\/node_modules\//,
    /(?:^|\/)\.DS_Store$/,
  ];
  const forbiddenEntry = entryNames.find((entryName) =>
    forbiddenPatterns.some((pattern) => pattern.test(entryName)),
  );

  if (forbiddenEntry) {
    fail(`VSIX contains unexpected file ${forbiddenEntry}`);
  }

  pass(`VSIX ${vsixPath} exists and contains expected release files`);
}

verifyReleaseRef();
verifyChangelog();

if (!skipVsix) {
  verifyVsix();
}
