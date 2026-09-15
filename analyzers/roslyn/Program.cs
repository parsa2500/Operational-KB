using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Build.Locator;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.MSBuild;

record Evidence(string Path, int LineStart, int LineEnd, string Kind, string Title, string Content, Dictionary<string, object?> Metadata);

static class Program
{
    static async Task<int> Main(string[] args)
    {
        if (args.Length != 1 || !Directory.Exists(args[0]))
        {
            Console.Error.WriteLine("Usage: OperationalKb.Roslyn <project-root>");
            return 2;
        }

        var root = Path.GetFullPath(args[0]);
        try
        {
            RegisterMsBuild();
            var entry = FindEntryPoint(root);
            if (entry is null)
            {
                Console.Error.WriteLine("No .sln, .slnx, or .csproj found; using standalone syntax/semantic fallback.");
                await AnalyzeLooseFiles(root);
                return 0;
            }

            using var workspace = MSBuildWorkspace.Create(new Dictionary<string, string>
            {
                ["SkipAnalyzers"] = "true",
                ["BuildProjectReferences"] = "true"
            });
            workspace.WorkspaceFailed += (_, e) => Console.Error.WriteLine($"MSBuild {e.Diagnostic.Kind}: {e.Diagnostic.Message}");

            if (entry.EndsWith(".sln", StringComparison.OrdinalIgnoreCase) || entry.EndsWith(".slnx", StringComparison.OrdinalIgnoreCase))
            {
                var solution = await workspace.OpenSolutionAsync(entry);
                foreach (var project in solution.Projects.Where(p => p.Language == LanguageNames.CSharp))
                    await AnalyzeProject(project, root);
            }
            else
            {
                var project = await workspace.OpenProjectAsync(entry);
                await AnalyzeProject(project, root);
            }
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"MSBuild load failed: {ex.Message}");
            return 1;
        }
    }

    static void RegisterMsBuild()
    {
        if (!MSBuildLocator.IsRegistered)
            MSBuildLocator.RegisterDefaults();
    }

    static string? FindEntryPoint(string root)
    {
        var solution = Directory.EnumerateFiles(root, "*.sln", SearchOption.AllDirectories)
            .Concat(Directory.EnumerateFiles(root, "*.slnx", SearchOption.AllDirectories))
            .Where(IsAllowedPath)
            .OrderBy(p => p.Length)
            .FirstOrDefault();
        if (solution is not null) return solution;
        return Directory.EnumerateFiles(root, "*.csproj", SearchOption.AllDirectories)
            .Where(IsAllowedPath)
            .OrderBy(p => p.Length)
            .FirstOrDefault();
    }

    static bool IsAllowedPath(string file) =>
        !file.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
            .Any(part => part is "bin" or "obj" or "node_modules" or ".git");

    static async Task AnalyzeProject(Project project, string root)
    {
        var compilation = await project.GetCompilationAsync();
        if (compilation is null)
        {
            Console.Error.WriteLine($"No compilation available for {project.Name}");
            return;
        }

        foreach (var document in project.Documents.Where(d => d.SupportsSyntaxTree && d.FilePath?.EndsWith(".cs", StringComparison.OrdinalIgnoreCase) == true))
        {
            var tree = await document.GetSyntaxTreeAsync();
            var model = await document.GetSemanticModelAsync();
            if (tree is null || model is null || document.FilePath is null) continue;
            await AnalyzeDocument(tree, model, document.FilePath, root, project.Name);
        }
    }

    static async Task AnalyzeLooseFiles(string root)
    {
        foreach (var file in Directory.EnumerateFiles(root, "*.cs", SearchOption.AllDirectories)
            .Where(IsAllowedPath))
        {
            var text = await File.ReadAllTextAsync(file);
            var tree = CSharpSyntaxTree.ParseText(text, path: file);
            var compilation = CSharpCompilation.Create("OperationalKbFallback", new[] { tree });
            var model = compilation.GetSemanticModel(tree);
            await AnalyzeDocument(tree, model, file, root, "standalone");
        }
    }

    static async Task AnalyzeDocument(SyntaxTree tree, SemanticModel model, string file, string root, string projectName)
    {
        var source = await tree.GetTextAsync();
        foreach (var node in tree.GetRoot().DescendantNodes())
        {
            string? kind = null; string? title = null;
            if (node is BaseMethodDeclarationSyntax method)
            { kind = "symbol.method"; title = model.GetDeclaredSymbol(method)?.ToDisplayString() ?? method.ToString(); }
            else if (node is ClassDeclarationSyntax cls)
            { kind = "symbol.class"; title = model.GetDeclaredSymbol(cls)?.ToDisplayString() ?? cls.Identifier.Text; }
            else if (node is AttributeSyntax attr && attr.Name.ToString().Contains("Authorize", StringComparison.OrdinalIgnoreCase))
            { kind = "permission"; title = "Authorization: " + attr; }
            else if (node is AttributeSyntax http && Regex.IsMatch(http.Name.ToString(), "Http(Get|Post|Put|Delete|Patch)|Route", RegexOptions.IgnoreCase))
            { kind = "api.endpoint"; title = "Endpoint: " + http; }
            else if (node is InvocationExpressionSyntax invocation && Regex.IsMatch(invocation.Expression.ToString(), "(Service|Repository|Client)\\.", RegexOptions.IgnoreCase))
            { kind = "service.call"; title = "Call: " + invocation.Expression; }
            else if (node is EnumMemberDeclarationSyntax member && Regex.IsMatch(member.Identifier.Text, "status|state|pending|approve|confirm|payment|order", RegexOptions.IgnoreCase))
            { kind = "state.value"; title = "State: " + member.Identifier.Text; }
            if (kind is null || title is null) continue;

            var span = node.GetLocation().GetLineSpan();
            var content = node.ToFullString().Trim();
            var relative = Path.GetRelativePath(root, file).Replace('\\', '/');
            var evidence = new Evidence(relative, span.StartLinePosition.Line + 1, span.EndLinePosition.Line + 1, kind, title, content.Length > 5000 ? content[..5000] : content, new Dictionary<string, object?>
            {
                ["compiler"] = "roslyn",
                ["symbol"] = title,
                ["project"] = projectName,
                ["referencesResolved"] = true
            });
            Console.WriteLine(JsonSerializer.Serialize(evidence));
        }
    }
}
