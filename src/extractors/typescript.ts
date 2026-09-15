import ts from 'typescript';
import path from 'node:path';
import type { Evidence } from '../db.js';

export type ExtractedEvidence = Omit<Evidence, 'id' | 'revision'> & { source: 'typescript'; symbol?: string };

function lineOf(source: ts.SourceFile, position: number) {
  return source.getLineAndCharacterOfPosition(position).line + 1;
}

function record(source: ts.SourceFile, node: ts.Node, kind: string, title: string, content: string, metadata: Record<string, unknown> = {}): ExtractedEvidence {
  const start = lineOf(source, node.getStart(source));
  const end = lineOf(source, node.getEnd());
  return { path: source.fileName, lineStart: start, lineEnd: end, kind, title: title.slice(0, 180), content: content.slice(0, 5000), metadata: { ...metadata, compiler: 'typescript', sourceFile: source.fileName }, source: 'typescript' };
}

export function extractTypeScript(root: string, files: string[]): ExtractedEvidence[] {
  const names = files.filter((f) => /\.(ts|tsx|js|jsx)$/.test(f)).map((f) => path.resolve(root, f));
  if (!names.length) return [];
  const options: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, jsx: ts.JsxEmit.ReactJSX, allowJs: true, noEmit: true, skipLibCheck: true };
  const program = ts.createProgram(names, options);
  const checker = program.getTypeChecker();
  const output: ExtractedEvidence[] = [];
  for (const source of program.getSourceFiles()) {
    if (!names.includes(source.fileName) || source.isDeclarationFile) continue;
    const visit = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isClassDeclaration(node)) {
        const name = node.name?.getText(source) ?? '<anonymous>';
        const symbol = node.name ? checker.getSymbolAtLocation(node.name) : undefined;
        const qualified = symbol?.getName() ?? name;
        output.push(record(source, node, ts.isClassDeclaration(node) ? 'symbol.class' : 'symbol.function', qualified, node.getText(source), { symbol: qualified }));
      }
      if (ts.isCallExpression(node)) {
        const expression = node.expression.getText(source);
        if (/^(fetch|axios|client\.|api\.)|\.(get|post|put|patch|delete)$/.test(expression)) {
          output.push(record(source, node, 'api.client_call', `API call: ${expression}`, node.getText(source), { callee: expression, arguments: node.arguments.map((a) => a.getText(source)) }));
        }
      }
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = ts.isJsxElement(node) ? node.openingElement.tagName.getText(source) : node.tagName.getText(source);
        if (/^(button|a|form|NavLink|Link|Button|MenuItem)$/i.test(tag)) output.push(record(source, node, 'ui.action', `UI action: ${tag}`, node.getText(source), { component: tag }));
      }
      if (ts.isVariableDeclaration(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
        const text = node.initializer.text;
        if (/^\/(?!\/)|payment|order|approve|confirm|pending/i.test(text)) output.push(record(source, node, 'ui.route_or_state', `${node.name.getText(source)} = ${text}`, node.getText(source), { value: text }));
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return output;
}
