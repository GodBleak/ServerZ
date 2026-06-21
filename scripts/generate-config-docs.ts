#!/usr/bin/env bun
/* oxlint-disable no-console */

import { readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import ts from "typescript"
import type { Dirent } from "node:fs"

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
type JsonObject = { [key: string]: JsonValue | undefined }

type SectionName = string
type TypeKind = "string" | "number" | "boolean" | "array" | "object" | "literal" | "union" | "unknown"
type EnvFormat = "number" | "boolean" | "json"
type DeprecatedMetadata = string | true

interface ProjectPaths {
  root: string
  configSource: string
  defaultJson: string
  envJson: string
  docDirectories: string[]
  generatedDts: string
}

interface ExistingDocFile {
  path: string
  text: string
}

interface ExistingFiles {
  defaultConfig: JsonObject
  envConfig: JsonObject
  docFiles: ExistingDocFile[]
}

interface SchemaEntry {
  path: string[]
  propertyName: string
  required: boolean
  typeKind: TypeKind
  typeText: string
  metadata: SchemaMetadata
}

interface SchemaMetadata {
  env?: string
  envFormat?: EnvFormat
  default?: JsonValue
  defaultDoc?: string
  description?: string
  doc?: string
  section?: SectionName
  serverDZ?: string
  battleye?: string
  noEnv?: boolean
  noDefault?: boolean
  deprecated?: DeprecatedMetadata
}

interface GeneratedDocFile {
  path: string
  text: string
}

interface GeneratedFiles {
  defaultJson: string
  envJson: string
  docFiles: GeneratedDocFile[]
  generatedDts: string
}

interface ResolvedExpression {
  expression: ts.Expression
  sourceFile: ts.SourceFile
}

interface ResolvedTypeObjectCall {
  expression: ts.CallExpression
  sourceFile: ts.SourceFile
}

interface ResolvedSchemaExpression {
  expression: ts.Expression
  sourceFile: ts.SourceFile
}

const validEnvFormats = new Set<EnvFormat>(["number", "boolean", "json"])
const docMarkerPattern = /<!--\s*env-doc:([A-Za-z0-9_.-]+):start\s*-->[\s\S]*?<!--\s*env-doc:\1:end\s*-->/g

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2))
  const write = args.has("--write")
  const check = args.has("--check")
  const strict = !args.has("--allow-missing")

  if (write === check) throw new Error("Pass exactly one of --write or --check")

  const paths = getProjectPaths(process.cwd())
  const sourceContext = new SourceContext(paths.root)
  const [sourceFile, existing] = await Promise.all([sourceContext.load(paths.configSource), readExistingFiles(paths)])

  const schemaCall = findServerZSchemaInitializer(sourceFile)
  const entries = await extractSchemaEntries(schemaCall, sourceFile, sourceContext)

  validateEntries(entries, strict)

  const generated = generateFiles(entries, existing, strict)

  if (check) {
    await assertUnchanged(paths.defaultJson, generated.defaultJson)
    await assertUnchanged(paths.envJson, generated.envJson)
    for (const docFile of generated.docFiles) await assertUnchanged(docFile.path, docFile.text)
    await assertUnchanged(paths.generatedDts, generated.generatedDts)
    console.log("Generated config artifacts are up to date.")
    return
  }

  await Promise.all([
    writeFile(paths.defaultJson, generated.defaultJson),
    writeFile(paths.envJson, generated.envJson),
    ...generated.docFiles.map((docFile) => writeFile(docFile.path, docFile.text)),
    writeFile(paths.generatedDts, generated.generatedDts),
  ])

  const updatedDocs = generated.docFiles.map((docFile) => path.relative(paths.root, docFile.path)).join(", ") || "no markdown files"
  console.log(`Generated config/default.json, config/custom-environment-variables.json, ${updatedDocs}, and src/config.generated.d.ts`)
}

function getProjectPaths(root: string): ProjectPaths {
  return {
    root,
    configSource: path.join(root, "src", "config", "schema.ts"),
    defaultJson: path.join(root, "config", "default.json"),
    envJson: path.join(root, "config", "custom-environment-variables.json"),
    docDirectories: [path.join(root, "doc"), path.join(root, "docs")],
    generatedDts: path.join(root, "src", "config.generated.d.ts"),
  }
}

async function readExistingFiles(paths: ProjectPaths): Promise<ExistingFiles> {
  const [defaultConfig, envConfig, docFiles] = await Promise.all([
    readJsonObject(paths.defaultJson),
    readJsonObject(paths.envJson),
    readDocFiles(paths.docDirectories),
  ])
  return { defaultConfig, envConfig, docFiles }
}

async function readJsonObject(filePath: string): Promise<JsonObject> {
  const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"))
  if (!isJsonObject(parsed)) throw new Error(`${filePath} must contain a JSON object`)
  return parsed
}

async function readOptionalText(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}

async function readDocFiles(directories: string[]): Promise<ExistingDocFile[]> {
  const files: ExistingDocFile[] = []
  const seen = new Set<string>()

  for (const directory of directories) {
    for (const filePath of await listMarkdownFiles(directory)) {
      if (seen.has(filePath)) continue
      seen.add(filePath)
      files.push({ path: filePath, text: await readFile(filePath, "utf8") })
    }
  }

  return files
}

async function listMarkdownFiles(directory: string): Promise<string[]> {
  let entries: Dirent[]
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }

  const files: string[] = []
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await listMarkdownFiles(entryPath)))
    else if (entry.isFile() && /\.mdx?$/i.test(entry.name)) files.push(entryPath)
  }
  return files
}

class SourceContext {
  private readonly sourceFiles = new Map<string, ts.SourceFile>()
  private readonly importMaps = new Map<string, Map<string, ImportBinding>>()

  constructor(private readonly root: string) {}

  async load(filePath: string): Promise<ts.SourceFile> {
    const normalized = path.normalize(filePath)
    const cached = this.sourceFiles.get(normalized)
    if (cached) return cached

    const text = await readFile(normalized, "utf8")
    const sourceFile = ts.createSourceFile(normalized, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    this.sourceFiles.set(normalized, sourceFile)
    return sourceFile
  }

  async resolveIdentifier(identifier: ts.Identifier, sourceFile: ts.SourceFile): Promise<ResolvedExpression | null> {
    const localInitializer = findVariableInitializer(sourceFile, identifier.text)
    if (localInitializer) return { expression: localInitializer, sourceFile }

    const importBinding = this.getImportMap(sourceFile).get(identifier.text)
    if (!importBinding) return null

    const importedFilePath = resolveImportPath(sourceFile.fileName, importBinding.moduleSpecifier)
    const importedSourceFile = await this.load(importedFilePath)
    const importedInitializer = findVariableInitializer(importedSourceFile, importBinding.importedName)
    if (!importedInitializer) return null

    return { expression: importedInitializer, sourceFile: importedSourceFile }
  }

  private getImportMap(sourceFile: ts.SourceFile): Map<string, ImportBinding> {
    const cached = this.importMaps.get(sourceFile.fileName)
    if (cached) return cached

    const map = new Map<string, ImportBinding>()
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement)) continue
      if (!ts.isStringLiteral(statement.moduleSpecifier)) continue

      const clause = statement.importClause
      const namedBindings = clause?.namedBindings
      if (!namedBindings || !ts.isNamedImports(namedBindings)) continue

      for (const specifier of namedBindings.elements) {
        const localName = specifier.name.text
        const importedName = specifier.propertyName?.text ?? localName
        map.set(localName, {
          importedName,
          moduleSpecifier: statement.moduleSpecifier.text,
        })
      }
    }

    this.importMaps.set(sourceFile.fileName, map)
    return map
  }
}

interface ImportBinding {
  importedName: string
  moduleSpecifier: string
}

function resolveImportPath(fromFile: string, moduleSpecifier: string): string {
  if (!moduleSpecifier.startsWith(".")) throw new Error(`Only relative schema imports are supported, got ${JSON.stringify(moduleSpecifier)} in ${fromFile}`)

  const base = path.resolve(path.dirname(fromFile), moduleSpecifier)
  const extension = path.extname(base)
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") return `${base.slice(0, -extension.length)}.ts`

  if (!extension) return `${base}.ts`
  return base
}

function findServerZSchemaInitializer(sourceFile: ts.SourceFile): ts.CallExpression {
  const initializer = findVariableInitializer(sourceFile, "ServerZSchema")
  if (!initializer) throw new Error("Could not find `ServerZSchema = Type.Object(...)` in src/config.ts")
  if (!ts.isCallExpression(initializer) || !isTypeCall(initializer, "Object")) throw new Error("`ServerZSchema` must be initialized with Type.Object(...)")
  return initializer
}

function findVariableInitializer(sourceFile: ts.SourceFile, variableName: string): ts.Expression | null {
  let found: ts.Expression | null = null

  const visit = (node: ts.Node): void => {
    if (found) return
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === variableName && node.initializer) {
      found = node.initializer
      return
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return found
}

async function extractSchemaEntries(rootObjectCall: ts.CallExpression, sourceFile: ts.SourceFile, sourceContext: SourceContext): Promise<SchemaEntry[]> {
  const rootProperties = getTypeObjectProperties(rootObjectCall)
  const entries: SchemaEntry[] = []

  for (const property of rootProperties) {
    const rootName = getPropertyName(property.name)
    if (!rootName) continue

    const objectCalls = await resolveTypeObjectCalls(property.initializer, sourceFile, sourceContext)
    for (const objectCall of objectCalls) await walkTypeObject(objectCall.expression, objectCall.sourceFile, [rootName], true, sourceContext, entries)
  }

  return entries
}

async function walkTypeObject(
  objectCall: ts.CallExpression,
  sourceFile: ts.SourceFile,
  currentPath: string[],
  required: boolean,
  sourceContext: SourceContext,
  entries: SchemaEntry[]
): Promise<void> {
  for (const property of getTypeObjectProperties(objectCall)) {
    const name = getPropertyName(property.name)
    if (!name) continue

    const propertyPath = [...currentPath, name]
    const unwrapped = unwrapOptional(property.initializer)
    const propertyRequired = !isTypeCall(property.initializer, "Optional") && required
    const resolved = await resolveSchemaExpression(unwrapped, sourceFile, sourceContext)
    const objectCalls = await resolveTypeObjectCalls(resolved.expression, resolved.sourceFile, sourceContext)

    if (objectCalls.length > 0) {
      for (const nestedObject of objectCalls)
        await walkTypeObject(nestedObject.expression, nestedObject.sourceFile, propertyPath, propertyRequired, sourceContext, entries)

      continue
    }

    entries.push({
      path: propertyPath,
      propertyName: name,
      required: propertyRequired,
      typeKind: getTypeKind(resolved.expression),
      typeText: await getTypeText(resolved.expression, resolved.sourceFile, sourceContext),
      metadata: extractMetadata(resolved.expression, propertyPath),
    })
  }
}

async function resolveSchemaExpression(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  sourceContext: SourceContext,
  seenIdentifiers = new Set<string>()
): Promise<ResolvedSchemaExpression> {
  const unwrapped = unwrapOptional(expression)

  if (!ts.isIdentifier(unwrapped)) return { expression: unwrapped, sourceFile }

  const key = `${sourceFile.fileName}:${unwrapped.text}`
  if (seenIdentifiers.has(key)) return { expression: unwrapped, sourceFile }
  seenIdentifiers.add(key)

  const resolved = await sourceContext.resolveIdentifier(unwrapped, sourceFile)
  if (!resolved) return { expression: unwrapped, sourceFile }

  return await resolveSchemaExpression(resolved.expression, resolved.sourceFile, sourceContext, seenIdentifiers)
}

async function resolveTypeObjectCalls(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  sourceContext: SourceContext,
  seenIdentifiers = new Set<string>()
): Promise<ResolvedTypeObjectCall[]> {
  const unwrapped = unwrapOptional(expression)

  if (ts.isCallExpression(unwrapped) && isTypeCall(unwrapped, "Object")) return [{ expression: unwrapped, sourceFile }]

  if (ts.isCallExpression(unwrapped) && isTypeCall(unwrapped, "Intersect")) {
    const firstArg = unwrapped.arguments[0]
    if (!firstArg || !ts.isArrayLiteralExpression(firstArg)) return []

    const resolved: ResolvedTypeObjectCall[] = []
    for (const element of firstArg.elements) resolved.push(...(await resolveTypeObjectCalls(element, sourceFile, sourceContext, seenIdentifiers)))

    return resolved
  }

  if (ts.isIdentifier(unwrapped)) {
    const key = `${sourceFile.fileName}:${unwrapped.text}`
    if (seenIdentifiers.has(key)) return []
    seenIdentifiers.add(key)

    const resolved = await sourceContext.resolveIdentifier(unwrapped, sourceFile)
    if (!resolved) return []
    return await resolveTypeObjectCalls(resolved.expression, resolved.sourceFile, sourceContext, seenIdentifiers)
  }

  return []
}

function getTypeObjectProperties(objectCall: ts.CallExpression): ts.PropertyAssignment[] {
  const firstArg = objectCall.arguments[0]
  if (!firstArg || !ts.isObjectLiteralExpression(firstArg))
    throw new Error(`Type.Object at ${location(objectCall)} must have an object literal as its first argument`)

  return firstArg.properties.filter(ts.isPropertyAssignment)
}

function unwrapOptional(expression: ts.Expression): ts.Expression {
  if (ts.isCallExpression(expression) && isTypeCall(expression, "Optional")) {
    const inner = expression.arguments[0]
    if (!inner || !ts.isExpression(inner)) throw new Error(`Type.Optional at ${location(expression)} must wrap a schema expression`)
    return inner
  }
  return expression
}

function extractMetadata(typeExpression: ts.Expression, propertyPath: string[]): SchemaMetadata {
  const metadataExpression = findMetadataObject(typeExpression)
  if (!metadataExpression) return {}

  const metadata: SchemaMetadata = {}
  for (const prop of metadataExpression.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    const key = getPropertyName(prop.name)
    if (!key) continue
    const value = prop.initializer

    switch (key) {
      case "env":
        metadata.env = expectString(value, propertyPath, key)
        break
      case "envFormat": {
        const format = expectString(value, propertyPath, key)
        if (!validEnvFormats.has(format as EnvFormat)) fail(propertyPath, `invalid envFormat ${JSON.stringify(format)}`)
        metadata.envFormat = format as EnvFormat
        break
      }
      case "default":
        metadata.default = expectJsonValue(value, propertyPath, key)
        break
      case "defaultDoc":
        metadata.defaultDoc = expectString(value, propertyPath, key)
        break
      case "description":
        metadata.description = expectString(value, propertyPath, key)
        break
      case "doc":
        metadata.doc = expectString(value, propertyPath, key)
        break
      case "section":
        metadata.section = expectNonEmptyString(value, propertyPath, key)
        break
      case "serverDZ":
        metadata.serverDZ = expectString(value, propertyPath, key)
        break
      case "battleye":
        metadata.battleye = expectString(value, propertyPath, key)
        break
      case "noEnv":
        metadata.noEnv = expectBoolean(value, propertyPath, key)
        break
      case "noDefault":
        metadata.noDefault = expectBoolean(value, propertyPath, key)
        break
      case "deprecated":
        metadata.deprecated = expectDeprecated(value, propertyPath, key)
        break
      default:
        // Leave normal TypeBox / JSON Schema options alone: title, examples, minimum, enum-ish custom keys, etc.
        break
    }
  }

  // `description` is a valid JSON Schema option and is also the generated public table description.
  // `doc` is the longer editor-hover text used in the generated .d.ts; if omitted, description is used.
  if (!metadata.doc && metadata.description) metadata.doc = metadata.description

  return metadata
}

function findMetadataObject(expression: ts.Expression): ts.ObjectLiteralExpression | null {
  if (!ts.isCallExpression(expression)) return null

  if (isTypeCall(expression, "Optional")) {
    const inner = expression.arguments[0]
    return inner && ts.isExpression(inner) ? findMetadataObject(inner) : null
  }

  const lastArg = expression.arguments[expression.arguments.length - 1]
  if (lastArg && ts.isObjectLiteralExpression(lastArg)) return lastArg
  return null
}

function validateEntries(entries: SchemaEntry[], strict: boolean): void {
  const seenEnvNames = new Map<string, string>()

  for (const entry of entries) {
    const meta = entry.metadata
    const propertyPath = entry.path.join(".")

    if (!strict && !meta.env && !meta.noEnv) continue

    if (meta.env && meta.noEnv) fail(entry.path, "cannot have both env and noEnv")
    if (!meta.env && !meta.noEnv) fail(entry.path, "missing env or noEnv")

    if (meta.env) {
      if (!meta.description) fail(entry.path, "missing description")
      if (meta.default === undefined && !meta.defaultDoc && !meta.noDefault) fail(entry.path, "missing default/defaultDoc or noDefault")
      const previous = seenEnvNames.get(meta.env)
      if (previous) fail(entry.path, `env ${meta.env} is already used by ${previous}`)
      seenEnvNames.set(meta.env, propertyPath)
    }
  }
}

function generateFiles(entries: SchemaEntry[], existing: ExistingFiles, strict: boolean): GeneratedFiles {
  const defaultJson = generateDefaultJson(entries, existing.defaultConfig)
  const envJson = generateEnvJson(entries, existing.envConfig)
  const docFiles = generateEnvDocFiles(entries, existing.docFiles, strict)
  const generatedDts = generateDts(entries)

  return { defaultJson, envJson, docFiles, generatedDts }
}

function generateDefaultJson(entries: SchemaEntry[], existingDefault: JsonObject): string {
  const output = deepCloneObject(existingDefault)
  const serverz = ensureObject(output, "serverz")

  for (const entry of entries) {
    ensureAncestorObjects(serverz, entry.path)

    const { metadata } = entry
    if (metadata.noDefault || metadata.default === undefined) {
      deleteNested(serverz, entry.path)
      continue
    }

    setNested(serverz, entry.path, metadata.default)
  }

  return `${JSON.stringify(output, null, 4)}\n`
}

function ensureAncestorObjects(root: JsonObject, pathSegments: string[]): void {
  let current = root
  for (const segment of pathSegments.slice(0, -1)) current = ensureObject(current, segment)
}

function deleteNested(root: JsonObject, pathSegments: string[]): void {
  let current: JsonObject | undefined = root

  for (const segment of pathSegments.slice(0, -1)) {
    const next = current?.[segment]
    if (!isJsonObject(next)) return
    current = next
  }

  if (!current) return
  delete current[pathSegments[pathSegments.length - 1]]
}

function generateEnvJson(entries: SchemaEntry[], existingEnv: JsonObject): string {
  const output = deepCloneObject(existingEnv)
  const serverz = ensureObject(output, "serverz")

  for (const entry of entries) {
    const { metadata } = entry
    if (!metadata.env || metadata.noEnv) continue
    const envFormat = getEnvFormat(entry)
    const value: JsonValue = envFormat ? { __name: metadata.env, __format: envFormat } : metadata.env
    setNested(serverz, entry.path, value)
  }

  return `${JSON.stringify(output, null, 4)}\n`
}

function generateEnvDocFiles(entries: SchemaEntry[], docFiles: ExistingDocFile[], strict: boolean): GeneratedDocFile[] {
  const sections = groupDocSections(entries)
  const sectionsWithMarkers = new Set<string>()
  const generated: GeneratedDocFile[] = []

  for (const docFile of docFiles) {
    let replacedAnyMarker = false
    const rendered = docFile.text.replace(docMarkerPattern, (fullMatch: string, section: string): string => {
      replacedAnyMarker = true
      sectionsWithMarkers.add(section)
      const start = `<!-- env-doc:${section}:start -->`
      const end = `<!-- env-doc:${section}:end -->`
      return `${start}\n${generateSectionTable(section, sections.get(section) ?? [])}\n${end}`
    })

    if (replacedAnyMarker) generated.push({ path: docFile.path, text: rendered.endsWith("\n") ? rendered : `${rendered}\n` })
  }

  if (strict) {
    const missingSections = [...sections.entries()]
      .filter(([, sectionEntries]) => sectionEntries.length > 0)
      .map(([section]) => section)
      .filter((section) => !sectionsWithMarkers.has(section))

    if (missingSections.length > 0)
      throw new Error(`Missing env-doc markers for section(s): ${missingSections.map((section) => `env-doc:${section}`).join(", ")}`)
  }

  return generated
}

function groupDocSections(entries: SchemaEntry[]): Map<string, SchemaEntry[]> {
  const sections = new Map<string, SchemaEntry[]>()

  for (const entry of entries) {
    if (!entry.metadata.env || entry.metadata.noEnv) continue
    const section = getDocSection(entry)
    const sectionEntries = sections.get(section) ?? []
    sectionEntries.push(entry)
    sections.set(section, sectionEntries)
  }

  return sections
}

function generateSectionTable(section: string, entries: SchemaEntry[]): string {
  if (section === "server") return generateServerTable(entries)
  if (section === "battleye") return generateBattleyeTable(entries)
  return generateGenericTable(entries)
}

function generateGenericTable(entries: SchemaEntry[]): string {
  const lines = ["| Variable | Default | Description |", "| --- | --- | --- |"]

  for (const entry of entries) lines.push(`| ${cellCode(entry.metadata.env)} | ${cellDefault(entry)} | ${cellText(entry.metadata.description)} |`)

  return lines.join("\n")
}

function generateServerTable(entries: SchemaEntry[]): string {
  const lines = ["| Variable | serverDZ.cfg | Default | Description |", "| --- | --- | --- | --- |"]

  for (const entry of entries) {
    const key = entry.metadata.serverDZ ?? entry.propertyName
    lines.push(`| ${cellCode(entry.metadata.env)} | ${cellCode(key)} | ${cellDefault(entry)} | ${cellText(entry.metadata.description)} |`)
  }

  return lines.join("\n")
}

function generateBattleyeTable(entries: SchemaEntry[]): string {
  const lines = ["| Variable | beserver_x64.cfg | Default | Description |", "| --- | --- | --- | --- |"]

  for (const entry of entries) {
    const key = entry.metadata.battleye ?? entry.propertyName
    lines.push(`| ${cellCode(entry.metadata.env)} | ${cellCode(key)} | ${cellDefault(entry)} | ${cellText(entry.metadata.description)} |`)
  }

  return lines.join("\n")
}

function generateDts(entries: SchemaEntry[]): string {
  const root: DtsObject = {}
  for (const entry of entries) setDtsEntry(root, entry.path, entry)

  const lines: string[] = [
    "// This file is generated by scripts/generate-config-from-typebox.ts.",
    "// Do not edit this file by hand.",
    "",
    "export interface ServerZGeneratedConfig {",
  ]

  emitDtsObject(lines, root, 1)
  lines.push('    _defaults: Partial<Omit<ServerZGeneratedConfig, "_defaults">>')
  lines.push("}", "")
  return lines.join("\n")
}

type DtsObject = { [name: string]: DtsObject | SchemaEntry }

function setDtsEntry(root: DtsObject, propertyPath: string[], entry: SchemaEntry): void {
  let target = root
  for (const segment of propertyPath.slice(0, -1)) {
    const existing = target[segment]
    if (!existing || isSchemaEntry(existing)) {
      const next: DtsObject = {}
      target[segment] = next
      target = next
    } else {
      target = existing
    }
  }
  target[propertyPath[propertyPath.length - 1]!] = entry
}

function emitDtsObject(lines: string[], object: DtsObject, indentLevel: number): void {
  const indent = "    ".repeat(indentLevel)
  for (const [key, value] of Object.entries(object)) {
    if (isSchemaEntry(value)) {
      const docs = value.metadata.doc ?? value.metadata.description
      if (docs || value.metadata.deprecated) {
        lines.push(`${indent}/**`)
        if (docs) for (const line of docs.split(/\r?\n/)) lines.push(`${indent} * ${line}`.trimEnd())

        if (value.metadata.default) lines.push(`${indent} * @default ${JSON.stringify(value.metadata.default)}`)
        if (value.metadata.env) lines.push(`${indent} * @env ${value.metadata.env}`)
        if (value.metadata.deprecated) {
          const deprecatedText = value.metadata.deprecated === true ? "" : ` ${value.metadata.deprecated}`
          lines.push(`${indent} * @deprecated${deprecatedText}`)
        }
        lines.push(`${indent} */`)
      }
      const optional = value.required ? "" : "?"
      lines.push(`${indent}${quoteIdentifier(key)}${optional}: ${value.typeText}`)
    } else {
      lines.push(`${indent}${quoteIdentifier(key)}: {`)
      emitDtsObject(lines, value, indentLevel + 1)
      lines.push(`${indent}}`)
    }
  }
}

function getDocSection(entry: SchemaEntry): string {
  return entry.metadata.section ?? entry.path[0] ?? "config"
}

function getEnvFormat(entry: SchemaEntry): EnvFormat | undefined {
  if (entry.metadata.envFormat) return entry.metadata.envFormat
  switch (entry.typeKind) {
    case "number":
      return "number"
    case "boolean":
      return "boolean"
    default:
      return undefined
  }
}

async function assertUnchanged(filePath: string, expected: string): Promise<void> {
  const actual = await readOptionalText(filePath)
  if (actual !== expected) throw new Error(`${path.relative(process.cwd(), filePath)} is out of date. Run bun scripts/generate-config-docs.ts --write`)
}

function isTypeCall(expression: ts.Expression, typeName: string): boolean {
  if (!ts.isCallExpression(expression)) return false
  const callee = expression.expression
  return ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === "Type" && callee.name.text === typeName
}

function getTypeKind(expression: ts.Expression): TypeKind {
  if (!ts.isCallExpression(expression)) return "unknown"
  const callee = expression.expression
  if (!ts.isPropertyAccessExpression(callee)) return "unknown"
  switch (callee.name.text) {
    case "String":
      return "string"
    case "Number":
      return "number"
    case "Boolean":
      return "boolean"
    case "Array":
      return "array"
    case "Object":
      return "object"
    case "Literal":
      return "literal"
    case "Union":
      return "union"
    default:
      return "unknown"
  }
}

async function getTypeText(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  sourceContext: SourceContext,
  seenIdentifiers = new Set<string>()
): Promise<string> {
  const unwrapped = unwrapOptional(expression)

  if (ts.isIdentifier(unwrapped)) {
    const key = `${sourceFile.fileName}:${unwrapped.text}`
    if (seenIdentifiers.has(key)) return "unknown"
    seenIdentifiers.add(key)

    const resolved = await sourceContext.resolveIdentifier(unwrapped, sourceFile)
    if (!resolved) return "unknown"
    return await getTypeText(resolved.expression, resolved.sourceFile, sourceContext, seenIdentifiers)
  }

  if (!ts.isCallExpression(unwrapped)) return "unknown"
  const kind = getTypeKind(unwrapped)

  switch (kind) {
    case "string":
      return "string"
    case "number":
      return "number"
    case "boolean":
      return "boolean"
    case "array": {
      const item = unwrapped.arguments[0]
      const itemType = item && ts.isExpression(item) ? await getTypeText(item, sourceFile, sourceContext, new Set(seenIdentifiers)) : "unknown"
      return `${parenthesizeUnion(itemType)}[]`
    }
    case "literal": {
      const literal = unwrapped.arguments[0]
      const value = literal && ts.isExpression(literal) ? expectJsonValue(literal, ["<literal>"], "literal") : null
      return JSON.stringify(value)
    }
    case "union": {
      const variants = unwrapped.arguments[0]
      const resolvedVariants =
        variants && ts.isExpression(variants) ? await resolveUnionVariants(variants, sourceFile, sourceContext, new Set(seenIdentifiers)) : null
      if (!resolvedVariants) return "unknown"

      const variantTypes: string[] = []
      for (const variant of resolvedVariants.elements)
        variantTypes.push(await getTypeText(variant, resolvedVariants.sourceFile, sourceContext, new Set(seenIdentifiers)))

      return variantTypes.join(" | ")
    }
    default:
      return "unknown"
  }
}

async function resolveUnionVariants(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  sourceContext: SourceContext,
  seenIdentifiers = new Set<string>()
): Promise<{ elements: ts.Expression[]; sourceFile: ts.SourceFile } | null> {
  if (ts.isArrayLiteralExpression(expression)) return { elements: expression.elements.filter(ts.isExpression), sourceFile }

  if (!ts.isIdentifier(expression)) return null

  const key = `${sourceFile.fileName}:${expression.text}`
  if (seenIdentifiers.has(key)) return null
  seenIdentifiers.add(key)

  const resolved = await sourceContext.resolveIdentifier(expression, sourceFile)
  if (!resolved) return null

  return await resolveUnionVariants(resolved.expression, resolved.sourceFile, sourceContext, seenIdentifiers)
}

function parenthesizeUnion(typeText: string): string {
  return typeText.includes(" | ") ? `(${typeText})` : typeText
}

function getPropertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return null
}

function expectString(expression: ts.Expression, propertyPath: string[], key: string): string {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text
  fail(propertyPath, `${key} must be a string literal`)
}

function expectNonEmptyString(expression: ts.Expression, propertyPath: string[], key: string): string {
  const value = expectString(expression, propertyPath, key).trim()
  if (!value) fail(propertyPath, `${key} must not be empty`)
  return value
}

function expectBoolean(expression: ts.Expression, propertyPath: string[], key: string): boolean {
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false
  fail(propertyPath, `${key} must be a boolean literal`)
}

function expectDeprecated(expression: ts.Expression, propertyPath: string[], key: string): DeprecatedMetadata {
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true
  return expectString(expression, propertyPath, key)
}

function expectJsonValue(expression: ts.Expression, propertyPath: string[], key: string): JsonValue {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text
  if (ts.isNumericLiteral(expression)) return Number(expression.text)
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false
  if (expression.kind === ts.SyntaxKind.NullKeyword) return null
  if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(expression.operand))
    return -Number(expression.operand.text)

  if (ts.isArrayLiteralExpression(expression)) return expression.elements.map((element) => expectJsonValue(element, propertyPath, key))

  if (ts.isObjectLiteralExpression(expression)) {
    const object: JsonObject = {}
    for (const prop of expression.properties) {
      if (!ts.isPropertyAssignment(prop)) fail(propertyPath, `${key} object defaults can only contain property assignments`)
      const name = getPropertyName(prop.name)
      if (!name) fail(propertyPath, `${key} object defaults can only contain simple property names`)
      object[name] = expectJsonValue(prop.initializer, propertyPath, key)
    }
    return object
  }
  fail(propertyPath, `${key} must be a JSON-literal-compatible value`)
}

function setNested(root: JsonObject, propertyPath: string[], value: JsonValue): void {
  let target = root
  for (const segment of propertyPath.slice(0, -1)) target = ensureObject(target, segment)

  target[propertyPath[propertyPath.length - 1]!] = value
}

function ensureObject(root: JsonObject, key: string): JsonObject {
  const value = root[key]
  if (isJsonObject(value)) return value
  const next: JsonObject = {}
  root[key] = next
  return next
}

function deepCloneObject(object: JsonObject): JsonObject {
  return JSON.parse(JSON.stringify(object)) as JsonObject
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isSchemaEntry(value: DtsObject | SchemaEntry): value is SchemaEntry {
  return "metadata" in value && "path" in value
}

function quoteIdentifier(identifier: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(identifier) ? identifier : JSON.stringify(identifier)
}

function cellCode(value: string | undefined): string {
  return value ? `\`${escapeMarkdown(value)}\`` : ""
}

function cellDefault(entry: SchemaEntry): string {
  if (entry.metadata.defaultDoc !== undefined) return cellDefaultString(entry.metadata.defaultDoc)

  const value = entry.metadata.default
  if (value === undefined) return ""
  const rendered = typeof value === "string" ? value : JSON.stringify(value)
  return cellDefaultString(rendered)
}

function cellDefaultString(value: string): string {
  const escaped = escapeMarkdown(value)
  if (escaped.startsWith("`") && escaped.endsWith("`")) return escaped
  return `\`${escaped}\``
}

function cellText(value: string | undefined): string {
  return escapeMarkdown(value ?? "")
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>")
}

function location(node: ts.Node): string {
  const source = node.getSourceFile()
  const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source))
  return `${path.basename(source.fileName)}:${line + 1}:${character + 1}`
}

function fail(propertyPath: string[], message: string): never {
  throw new Error(`${propertyPath.join(".")}: ${message}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
