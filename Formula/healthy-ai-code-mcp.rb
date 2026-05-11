class HealthyAiCodeMcp < Formula
  desc "MCP server for AI-powered code health analysis"
  homepage "https://github.com/YOUR_USERNAME/healthy-ai-code-mcp"
  url "https://registry.npmjs.org/@healthy-ai-code/mcp-server/-/mcp-server-0.1.0.tgz"
  sha256 "PLACEHOLDER_SHA256"
  license "MIT"
  version "0.1.0"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  def post_install
    ohai "Healthy AI Code MCP installed!"
    ohai "Add to Claude Code: claude mcp add healthy-ai-code -- healthy-ai-code-mcp"
    ohai "Add to VS Code: see https://github.com/YOUR_USERNAME/healthy-ai-code-mcp#installation"
  end

  test do
    output = shell_output("#{bin}/healthy-ai-code-mcp --version 2>&1", 1)
    # MCP servers communicate via stdio and don't have --version,
    # so we just verify the binary exists and is executable
    assert_predicate bin/"healthy-ai-code-mcp", :executable?
  end
end
