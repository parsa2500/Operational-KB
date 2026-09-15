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
        if (args.Length != 1 || !Directory.Exists(args[0])) { Console.Error.WriteLine("Usage: OperationalKb.Roslyn <project-root>"); return 2; }
        var root = Path.GetFullPath(args[0]);
        try
        {
            RegisterMsBuild();
            var entry = FindEntryPoint(root);
            if (entry is null) { Console.Error.WriteLine("No .sln, .slnx, or .csproj found; using standalone fallback."); await AnalyzeLooseFiles(root); return 0; }
            using var workspace = MSBuildWorkspace.Create(new Dictionary<string, string> { ["SkipAnalyzers"] = "true", ["BuildProjectReferences"] = "true" });
            workspace.WorkspaceFailed += (_, e) => Console.Error.WriteLine($"MSBuild {e.Diagnostic.Kind}: {e.Diagnostic.Message}");
            if (entry.EndsWith(".sln", StringComparison.OrdinalIgnoreCase) || entry.EndsWith(".slnx", StringComparison.OrdinalIgnoreCase))
            {
                var solution = await workspace.OpenSolutionAsync(entry);
                foreach (var project in solution.Projects.Where(p => p.Language == LanguageNames.CSharp)) await AnalyzeProject(project, root);
            }
            else await AnalyzeProject(await workspace.OpenProjectAsync(entry), root);
            return 0;
        }
        catch (Exception ex) { Console.Error.WriteLine($"MSBuild load failed: {ex.Message}"); return 1; }
    }

    static void RegisterMsBuild()
    {
        if (MSBuildLocator.IsRegistered) return;
        try { MSBuildLocator.RegisterDefaults(); return; }
        catch (InvalidOperationException) { }
        var roots = new[] {
            Environment.GetEnvironmentVariable("DOTNET_ROOT"),
            Environment.GetEnvironmentVariable("DOTNET_ROOT(x86)"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "dotnet"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "dotnet")
        }.Where(x => !string.IsNullOrWhiteSpace(x)).Select(Path.GetFullPath).Distinct();
        var sdk = roots.SelectMany(root => Directory.Exists(Path.Combine(root, "sdk")) ? Directory.EnumerateDirectories(Path.Combine(root, "sdk")) : Enumerable.Empty<string>())
            .Where(dir => File.Exists(Path.Combine(dir, "MSBuild.dll")))
            .OrderByDescending(dir => dir, StringComparer.OrdinalIgnoreCase).FirstOrDefault();
        if (sdk is null) throw new InvalidOperationException("No MSBuild SDK was found. Install the .NET SDK and ensure DOTNET_ROOT or Program Files\\dotnet is available.");
        MSBuildLocator.RegisterMSBuildPath(sdk);
    }

    static string? FindEntryPoint(string root)
    {
        static bool Allowed(string f) => !f.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar).Any(p => p is "bin" or "obj" or "node_modules" or ".git");
        var solution = Directory.EnumerateFiles(root, "*.sln", SearchOption.AllDirectories).Concat(Directory.EnumerateFiles(root, "*.slnx", SearchOption.AllDirectories)).Where(Allowed).OrderBy(p => p.Length).FirstOrDefault();
        return solution ?? Directory.EnumerateFiles(root, "*.csproj", SearchOption.AllDirectories).Where(Allowed).OrderBy(p => p.Length).FirstOrDefault();
    }

    static async Task AnalyzeProject(Project project, string root)
    {
        var compilation = await project.GetCompilationAsync();
        if (compilation is null) { Console.Error.WriteLine($"No compilation available for {project.Name}"); return; }
        foreach (var document in project.Documents.Where(d => d.SupportsSyntaxTree && d.FilePath?.EndsWith(".cs", StringComparison.OrdinalIgnoreCase) == true))
        {
            var tree = await document.GetSyntaxTreeAsync(); var model = await document.GetSemanticModelAsync();
            if (tree is not null && model is not null && document.FilePath is not null) await AnalyzeDocument(tree, model, document.FilePath, root, project.Name);
        }
    }

    static async Task AnalyzeLooseFiles(string root)
    {
        foreach (var file in Directory.EnumerateFiles(root, "*.cs", SearchOption.AllDirectories).Where(f => !f.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar).Any(p => p is "bin" or "obj" or "node_modules" or ".git")))
        {
            var tree = CSharpSyntaxTree.ParseText(await File.ReadAllTextAsync(file), path: file);
            await AnalyzeDocument(tree, CSharpCompilation.Create("OperationalKbFallback", new[] { tree }).GetSemanticModel(tree), file, root, "standalone");
        }
    }

    static async Task AnalyzeDocument(SyntaxTree tree, SemanticModel model, string file, string root, string projectName)
    {
        _ = await tree.GetTextAsync();
        foreach (var node in tree.GetRoot().DescendantNodes())
        {
            string? kind = null; string? title = null;
            if (node is BaseMethodDeclarationSyntax method) { kind = "symbol.method"; title = model.GetDeclaredSymbol(method)?.ToDisplayString() ?? method.ToString(); }
            else if (node is ClassDeclarationSyntax cls) { kind = "symbol.class"; title = model.GetDeclaredSymbol(cls)?.ToDisplayString() ?? cls.Identifier.Text; }
            else if (node is AttributeSyntax attr && attr.Name.ToString().Contains("Authorize", StringComparison.OrdinalIgnoreCase)) { kind = "permission"; title = "Authorization: " + attr; }
            else if (node is AttributeSyntax http && Regex.IsMatch(http.Name.ToString(), "Http(Get|Post|Put|Delete|Patch)|Route", RegexOptions.IgnoreCase)) { kind = "api.endpoint"; title = "Endpoint: " + http; }
            else if (node is InvocationExpressionSyntax invocation && Regex.IsMatch(invocation.Expression.ToString(), "(Service|Repository|Client)\\.", RegexOptions.IgnoreCase)) { kind = "service.call"; title = "Call: " + invocation.Expression; }
            else if (node is EnumMemberDeclarationSyntax member && Regex.IsMatch(member.Identifier.Text, "status|state|pending|approve|confirm|payment|order", RegexOptions.IgnoreCase)) { kind = "state.value"; title = "State: " + member.Identifier.Text; }
            if (kind is null || title is null) continue;
            var span = node.GetLocation().GetLineSpan(); var content = node.ToFullString().Trim();
            Console.WriteLine(JsonSerializer.Serialize(new Evidence(Path.GetRelativePath(root, file).Replace('\\', '/'), span.StartLinePosition.Line + 1, span.EndLinePosition.Line + 1, kind, title, content.Length > 5000 ? content[..5000] : content, new() { ["compiler"] = "roslyn", ["symbol"] = title, ["project"] = projectName, ["referencesResolved"] = projectName != "standalone" })));
        }
    }
}
