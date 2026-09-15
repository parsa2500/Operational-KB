using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

record Evidence(string Path, int LineStart, int LineEnd, string Kind, string Title, string Content, Dictionary<string, object?> Metadata);

static class Program
{
    static async Task<int> Main(string[] args)
    {
        if (args.Length != 1 || !Directory.Exists(args[0])) { Console.Error.WriteLine("Usage: OperationalKb.Roslyn <root>"); return 2; }
        var root = Path.GetFullPath(args[0]);
        var files = Directory.EnumerateFiles(root, "*.cs", SearchOption.AllDirectories)
            .Where(f => !f.Contains(Path.DirectorySeparatorChar + "bin" + Path.DirectorySeparatorChar) && !f.Contains(Path.DirectorySeparatorChar + "obj" + Path.DirectorySeparatorChar));
        foreach (var file in files)
        {
            try { await AnalyzeFile(file, root); }
            catch (Exception ex) { Console.Error.WriteLine($"{file}: {ex.Message}"); }
        }
        return 0;
    }

    static async Task AnalyzeFile(string file, string root)
    {
        var text = await File.ReadAllTextAsync(file);
        var tree = CSharpSyntaxTree.ParseText(text, path: file);
        var compilation = CSharpCompilation.Create("OperationalKbAnalysis", new[] { tree }, new[] { MetadataReference.CreateFromFile(typeof(object).Assembly.Location) });
        var model = compilation.GetSemanticModel(tree);
        var source = tree.GetText();
        foreach (var node in tree.GetRoot().DescendantNodes())
        {
            string? kind = null; string? title = null;
            if (node is MethodDeclarationSyntax method)
            { kind = "symbol.method"; title = model.GetDeclaredSymbol(method)?.ToDisplayString() ?? method.Identifier.Text; }
            else if (node is ClassDeclarationSyntax cls)
            { kind = "symbol.class"; title = model.GetDeclaredSymbol(cls)?.ToDisplayString() ?? cls.Identifier.Text; }
            else if (node is AttributeSyntax attr && attr.Name.ToString().Contains("Authorize", StringComparison.OrdinalIgnoreCase))
            { kind = "permission"; title = "Authorization: " + attr.ToString(); }
            else if (node is AttributeSyntax http && Regex.IsMatch(http.Name.ToString(), "Http(Get|Post|Put|Delete|Patch)|Route", RegexOptions.IgnoreCase))
            { kind = "api.endpoint"; title = "Endpoint: " + http.ToString(); }
            else if (node is InvocationExpressionSyntax invocation && Regex.IsMatch(invocation.Expression.ToString(), "(Service|Repository|Client)\\.", RegexOptions.IgnoreCase))
            { kind = "service.call"; title = "Call: " + invocation.Expression; }
            else if (node is EnumMemberDeclarationSyntax member && Regex.IsMatch(member.Identifier.Text, "status|state|pending|approve|confirm|payment|order", RegexOptions.IgnoreCase))
            { kind = "state.value"; title = "State: " + member.Identifier.Text; }
            if (kind is null || title is null) continue;
            var span = node.GetLocation().GetLineSpan();
            var content = node.ToFullString().Trim();
            var evidence = new Evidence(Path.GetRelativePath(root, file).Replace('\\', '/'), span.StartLinePosition.Line + 1, span.EndLinePosition.Line + 1, kind, title, content.Length > 5000 ? content[..5000] : content, new Dictionary<string, object?> { ["compiler"] = "roslyn", ["symbol"] = title });
            Console.WriteLine(JsonSerializer.Serialize(evidence));
        }
    }
}
