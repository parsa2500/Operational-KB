import ts from 'typescript';
import path from 'node:path';
import type { Evidence } from '../db.js';

export type ExtractedEvidence = Omit<Evidence, 'id' | 'revision'> & { source: 'typescript' | 'roslyn'; symbol?: string };

function lineOf(source: ts.SourceFile, position: number) { return source.getLineAndCharacterOfPosition(position).line + 1; }

function record(root: string, source: ts.SourceFile, node: ts.Node, kind: string, title: string, content: string, metadata: Record<string, unknown> = {}): ExtractedEvidence {
  const relative = path.relative(root, source.fileName).replaceAll('\\', '/');
  return {
    path: relative,
    lineStart: lineOf(source, node.getStart(source)),
    lineEnd: lineOf(source, node.getEnd()),
    kind,
    title: title.slice(0, 180),
    content: content.slice(0, 5000),
    metadata: { ...metadata, compiler: 'typescript', sourceFile: relative },
    source: 'typescript',
  };
}

export function extractTypeScript(root: string, files: string[]): ExtractedEvidence[] {
  const normalizedRoot = path.resolve(root);
  const names = files.filter((f) => /\.(ts|tsx|js|jsx)$/.test(f)).map((f) => path.resolve(normalizedRoot, f));
  if (!names.length) return [];
  const nameSet = new Set(names.map((name) => path.normalize(name).toLowerCase()));
  const program = ts.createProgram(names, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, jsx: ts.JsxEmit.ReactJSX, allowJs: true, noEmit: true, skipLibCheck: true });
  const checker = program.getTypeChecker();
  const output: ExtractedEvidence[] = [];
  for (const source of program.getSourceFiles()) {
    if (!nameSet.has(path.normalize(source.fileName).toLowerCase()) || source.isDeclarationFile) continue;
    const visit = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isClassDeclaration(node)) {
        const name = node.name?.getText(source) ?? '<anonymous>';
        const symbol = node.name ? checker.getSymbolAtLocation(node.name) : undefined;
        const qualified = symbol?.getName() ?? name;
        output.push(record(normalizedRoot, source, node, ts.isClassDeclaration(node) ? 'symbol.class' : 'symbol.function', qualified, node.getText(source), { symbol: qualified }));
      }
      if (ts.isCallExpression(node)) {
        const expression = node.expression.getText(source);
        if (/^(fetch|axios|client\.|api\.)|\.(get|post|put|patch|delete)$/i.test(expression)) output.push(record(normalizedRoot, source, node, 'api.client_call', `API call: ${expression}`, node.getText(source), { callee: expression, arguments: node.arguments.map((a) => a.getText(source)) }));
        if (/^(useNavigate|navigate|router\.push|router\.replace)$/i.test(expression)) output.push(record(normalizedRoot, source, node, 'ui.navigation', `Navigation: ${expression}`, node.getText(source), { callee: expression }));
      }
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const opening = ts.isJsxElement(node) ? node.openingElement : node;
        const tag = opening.tagName.getText(source);
        if (/^(button|a|form|NavLink|Link|Button|MenuItem)$/i.test(tag)) output.push(record(normalizedRoot, source, node, 'ui.action', `UI action: ${tag}`, node.getText(source), { component: tag }));
      }
      if ((ts.isVariableDeclaration(node) || ts.isPropertyAssignment(node)) && node.initializer && ts.isStringLiteralLike(node.initializer)) {
        const text = node.initializer.text;
        if (/^\/(?!\/)|payment|order|approve|confirm|pending|پرداخت|تایید/i.test(text)) output.push(record(normalizedRoot, source, node, 'ui.route_or_state', `${node.name.getText(source)} = ${text}`, node.getText(source), { value: text }));
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return output;
}
