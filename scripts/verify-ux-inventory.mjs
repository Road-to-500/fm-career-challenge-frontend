import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from '@vue/compiler-sfc'
import { baseParse } from '@vue/compiler-dom'
import ts from 'typescript'

const files = [
  'src\\views\\DashboardView.vue', 'src\\views\\ChallengeView.vue',
  'src\\views\\NotFoundView.vue', 'src\\components\\FieldHelp.vue',
  'src\\components\\SeasonSelect.vue', 'src\\components\\ThemeToggle.vue',
]
const actions = []
const fields = []
const issues = []
const handlers = []
const attribute = (node, name) => node.props?.find(prop => prop.type === 6 && prop.name === name)?.value?.content
const directive = (node, name, argument) => node.props?.find(prop => prop.type === 7
  && prop.name === name && (argument === undefined || prop.arg?.content === argument))?.exp?.content
const compact = text => text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const descendants = node => [node, ...(node.children ?? []).flatMap(descendants)]

for (const file of files) {
  const source = readFileSync(resolve(file), 'utf8')
  const { descriptor } = parse(source)
  const setup = descriptor.scriptSetup
  const script = ts.createSourceFile(file, setup?.content ?? '', ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  for (const statement of script.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name || !statement.body) continue
    const code = statement.body.getText(script)
    handlers.push({
      file, name: statement.name.text,
      apiCalls: [...code.matchAll(/\bapi(?:<[^;]*?>)?\((['"`])(.+?)\1/g)].map(match => match[2]),
      pendingAndFailureState: [...new Set([...code.matchAll(/(\w+)\.value\s*=/g)].map(match => match[1]))],
      prerequisites: [...code.matchAll(/if\s*\((.*?)\)\s*return/g)].map(match => match[1]),
      confirmations: [...code.matchAll(/window\.confirm\((.+)\)/g)].map(match => match[1]),
      route: code.includes('router.') ? code : null,
      sourceEvidence: code,
    })
  }
  const ast = baseParse(descriptor.template.content)
  const offset = source.slice(0, descriptor.template.loc.start.offset).split('\n').length - 1
  function visit(node, ancestors = []) {
    if (node.type !== 1) {
      for (const child of node.children ?? []) visit(child, ancestors)
      return
    }
    const chain = [...ancestors, node]
    const location = { file, line: node.loc.start.line + offset }
    const gates = chain.flatMap(element => ['if', 'else-if'].map(name => directive(element, name)).filter(Boolean))
    const handler = directive(node, 'on', 'click') ?? directive(node, 'on', 'submit') ?? directive(node, 'on', 'change')
    if (['button', 'Button', 'a', 'RouterLink', 'form', 'summary', 'FieldHelp', 'ThemeToggle'].includes(node.tag)) {
      const form = ancestors.findLast(element => element.tag === 'form')
      const action = handler ?? (attribute(node, 'type') === 'submit' ? directive(form ?? {}, 'on', 'submit') : undefined)
      actions.push({
        ...location, element: node.tag,
        label: attribute(node, 'aria-label') ?? attribute(node, 'label') ?? compact(node.loc.source).slice(0, 160),
        action: action ?? attribute(node, 'href') ?? directive(node, 'bind', 'href')
          ?? attribute(node, 'to') ?? directive(node, 'bind', 'to')
          ?? (node.tag === 'summary' ? 'Native expand/collapse; no data mutation' : node.tag === 'FieldHelp' ? 'Context and optional example toggle' : 'Shared component action'),
        gates,
        disclosure: ancestors.filter(element => element.tag === 'details').map(element =>
          compact(element.children.find(child => child.tag === 'summary')?.loc.source ?? 'Expandable task')),
        pending: directive(node, 'bind', 'disabled') ?? directive(node, 'bind', 'loading') ?? null,
        coverage: 'See README action/state matrix; not every rendered instance is individually exercised.',
      })
      if (['button', 'Button'].includes(node.tag) && !action
        && !node.props.some(prop => prop.type === 7 && prop.name === 'on')) issues.push({ ...location, issue: 'Button without action' })
    }
    if (['input', 'select', 'textarea', 'InputText', 'InputNumber', 'SeasonSelect'].includes(node.tag)) {
      const label = ancestors.findLast(element => element.tag === 'label')
      const id = attribute(node, 'id')
      const described = attribute(node, 'aria-describedby')
      const wrapperHelp = label && descendants(label).some(element => element.tag === 'FieldHelp')
      const explicitHelp = id && descendants(ast).some(element => element.tag === 'FieldHelp' && attribute(element, 'for') === id)
      const context = described ? 'Explicit shared description' : explicitHelp ? 'Explicit FieldHelp target' : wrapperHelp ? 'FieldHelp within field label' : null
      fields.push({
        ...location, element: node.tag, model: directive(node, 'model') ?? directive(node, 'bind', 'value') ?? null,
        name: attribute(node, 'aria-label') ?? (label ? compact(label.loc.source).slice(0, 140) : id),
        context, readonly: node.props.some(prop => prop.type === 6 && prop.name === 'readonly'), gates,
        boundsAndFormat: node.props.filter(prop => (prop.type === 6 && ['required', 'type', 'maxlength', 'pattern', 'inputmode'].includes(prop.name))
          || prop.type === 7 && prop.name === 'bind' && ['min', 'max', 'max-index', 'min-index', 'include-unset'].includes(prop.arg?.content))
          .map(prop => prop.loc.source),
      })
      if (!context && !node.props.some(prop => prop.type === 6 && prop.name === 'readonly')
        && !['SeasonSelect.vue', 'ThemeToggle.vue'].some(name => file.endsWith(name))) issues.push({ ...location, issue: 'Editable field missing associated context' })
    }
    for (const child of node.children ?? []) visit(child, chain)
  }
  visit(ast)
}

const inventory = {
  generatedAt: new Date().toISOString(),
  scope: 'Frontend action/field wiring inventory. Static source evidence is not equivalent to runtime execution.',
  actions, fields, handlers, issues,
}
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(inventory, null, 2))
console.log(JSON.stringify({ actions: actions.length, fields: fields.length, issues }, null, 2))
if (issues.length) process.exitCode = 1
