declare namespace WebAssembly {
  type ExportValue = Function | Global | Memory | Table
  type ImportValue = ExportValue | number
  type ModuleImports = Record<string, ImportValue>
  type Imports = Record<string, ModuleImports>
}
