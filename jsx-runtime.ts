type Props = Record<string, unknown> & { children?: unknown }
type Component = (props: Props) => string

function normalizeChildren(children: unknown): string {
  const array = Array.isArray(children) ? children.flat(Infinity) : [children]
  const parts: string[] = []

  for (const child of array) {
    if (child === undefined || child === null || typeof child === "boolean") continue
    const text = String(child)
    if (text.length === 0) continue
    parts.push(text.endsWith("\n") ? text : `${text}\n`)
  }

  return parts.join("")
}

export function jsx(type: unknown, props: Props | null): string {
  if (typeof type === "function") return (type as Component)(props ?? {})

  return normalizeChildren(props?.children)
}

export { jsx as jsxs }

export function jsxDEV(type: unknown, props: Props | null): string {
  return jsx(type, props)
}

export function Fragment(props: { children?: unknown }): string {
  return normalizeChildren(props?.children)
}
