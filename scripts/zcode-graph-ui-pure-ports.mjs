import ts from 'typescript';

// Build-only extraction of the precise public helpers used by the 3.15.1
// timeline. The runtime never loads an application projection or account port.
const UI = 'packages/ui/src/', SHARED = 'packages/shared/src/';
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
function named(sources, file, name) {
  const text = sources.get(file);
  if (text === undefined) throw Error('Unverified graph port source: ' + file);
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const node = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name
    || ts.isVariableStatement(node) && node.declarationList.declarations.some(value => ts.isIdentifier(value.name) && value.name.text === name));
  if (!node || ts.isVariableStatement(node) && node.declarationList.declarations.length !== 1)
    throw Error('The fixed graph port declaration changed: ' + file + '#' + name);
  return { node, source };
}
const PORT_EXPORTS = new Set(['WORKFLOW_HOLE_SITE_ID_PATTERN', 'parseModelPickerValue', 'formatProviderModelLabel', 'thoughtLevelLabelId']);
function print({ node, source }) {
  const name = ts.isFunctionDeclaration(node) ? node.name?.text : node.declarationList.declarations[0].name.text;
  if (!PORT_EXPORTS.has(name)) {
    const modifiers = node.modifiers?.filter(modifier => modifier.kind !== ts.SyntaxKind.ExportKeyword);
    node = ts.isFunctionDeclaration(node)
      ? ts.factory.updateFunctionDeclaration(node, modifiers, node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type, node.body)
      : ts.factory.updateVariableStatement(node, modifiers, node.declarationList);
  }
  return printer.printNode(ts.EmitHint.Unspecified, node, source);
}

export function graphUiPortAsset(sources) {
  const chunks = ['import { z } from "zod";'];
  const add = (file, names) => { for (const name of names) chunks.push(print(named(sources, file, name))); };
  add(SHARED + 'zcode-protocol-v4/workflow-runs-holes.ts', ['WORKFLOW_HOLE_SITE_ID_PATTERN']);
  add(SHARED + 'model-selection.ts', ['modelSelectionSchema', 'ZCODE_MODEL_REASONING_SEPARATOR']);
  const canonical = named(sources, SHARED + 'model-selection.ts', 'parseModelPickerValue');
  canonical.node = ts.factory.updateFunctionDeclaration(canonical.node,
    canonical.node.modifiers?.filter(modifier => modifier.kind !== ts.SyntaxKind.ExportKeyword),
    canonical.node.asteriskToken, ts.factory.createIdentifier('parseSharedModelSelection'),
    canonical.node.typeParameters, canonical.node.parameters, canonical.node.type, canonical.node.body);
  chunks.push(print(canonical));
  add(SHARED + 'custom-model-value.ts', ['CUSTOM_MODEL_VALUE_PREFIX', 'safeDecodeUriComponent', 'decodeCustomModelValue']);
  add(SHARED + 'model-provider-types.ts', ['BUILTIN_MODEL_PROVIDER_IDS']);
  const families = named(sources, SHARED + 'model-provider-family.ts', 'MODEL_PROVIDER_FAMILY_SPECS');
  const declaration = families.node.declarationList.declarations[0];
  let values = declaration.initializer;
  while (ts.isAsExpression(values) || ts.isSatisfiesExpression(values)) values = values.expression;
  if (!ts.isArrayLiteralExpression(values)) throw Error('The fixed provider family identity array changed.');
  const fields = new Set(['id', 'startPlanProviderId', 'individualCodingPlanProviderId', 'teamCodingPlanProviderId']);
  const narrowed = values.elements.map(value => {
    if (!ts.isObjectLiteralExpression(value)) throw Error('The fixed provider family identity object changed.');
    const kept = value.properties.filter(property => ts.isPropertyAssignment(property) && fields.has(property.name.getText(families.source)));
    if (kept.length !== fields.size) throw Error('The fixed provider family identity fields changed.');
    return ts.factory.updateObjectLiteralExpression(value, kept);
  });
  // The exact family lookup consumes these four fields. Management URLs and
  // their environment/OAuth dependencies cannot affect that lookup's result.
  const subset = ts.factory.updateVariableDeclaration(declaration, declaration.name, declaration.exclamationToken,
    undefined, ts.factory.createArrayLiteralExpression(narrowed, true));
  families.node = ts.factory.updateVariableStatement(families.node, families.node.modifiers,
    ts.factory.updateVariableDeclarationList(families.node.declarationList, [subset]));
  chunks.push(print(families));
  add(SHARED + 'model-provider-family.ts', ['MODEL_PROVIDER_FAMILY_ID_BY_PROVIDER_ID', 'resolveModelProviderFamilyIdByProviderId']);
  add(UI + 'v4/composer/modelTriggerDisplay.ts', ['formatProviderModelLabel']);
  add(UI + 'lib/zcodeSessionProjection.ts', ['parseModelPickerValue']);
  add(UI + 'chat-input-toolbar/thoughtLevelOptions.ts', ['THOUGHT_LEVEL_LABEL_IDS', 'normalizeThoughtLevelText', 'thoughtLevelLabelId']);
  const result = ts.transpileModule(chunks.join('\n'), { fileName: 'graph-ui-ports.ts', reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
      newLine: ts.NewLineKind.LineFeed, removeComments: false } });
  if (result.diagnostics?.length) throw Error('The selected graph UI port declarations could not be transpiled.');
  return '// Derived from exact Apache-2.0 ZCode aac4755 declarations; build-only selection, no application runtime ports.\n' + result.outputText;
}
