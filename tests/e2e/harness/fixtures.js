/**
 * Test Fixtures for WarWick Browser E2E Test Suite
 */

export const SAMPLE_HTML_SIMPLE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>WarWick Simple Test Page</title>
  <meta name="description" content="A simple test page for browser verification">
  <link rel="icon" href="https://example.com/favicon.ico">
</head>
<body>
  <h1>Welcome to WarWick Test</h1>
  <p>This is a paragraph of clean readable content used for DOM reader verification.</p>
</body>
</html>
`;

export const SAMPLE_HTML_WITH_NOISE = `
<!DOCTYPE html>
<html>
<head>
  <title>Complex Page with Noise</title>
  <style>body { background: black; } .ad { display: block; }</style>
  <script>console.log("noisy tracking script");</script>
</head>
<body>
  <nav><ul><li><a href="/">Home</a></li><li><a href="/about">About</a></li></ul></nav>
  <header><h1>Site Header Banner</h1></header>
  <main>
    <article>
      <h2>Deep Reinforcement Learning in Web Agents</h2>
      <p>Modern browser agents leverage multi-modal context including DOM structure and screen captures.</p>
      <p>Autonomous researchers can navigate across tabs to gather distributed data points.</p>
    </article>
  </main>
  <aside><div class="ad">Sidebar Advertisement Banner</div></aside>
  <footer><p>© 2026 WarWick Test Corp. All rights reserved.</p></footer>
  <svg><circle cx="50" cy="50" r="40" /></svg>
</body>
</html>
`;

// Massive HTML fixture exceeding 40k chars to verify truncation limits
export const SAMPLE_HTML_MASSIVE = (() => {
  let text = '<h1>Massive Research Corpus</h1>\n';
  for (let i = 0; i < 2000; i++) {
    text += `<p>Data block ${i}: The quantum state fidelity was measured across multiple redundant qubits with high precision error detection.</p>\n`;
  }
  return `<!DOCTYPE html><html><head><title>Massive Corpus</title></head><body>${text}</body></html>`;
})();

export const SAMPLE_SEARCH_RESULTS = [
  {
    title: 'Strawberry Browser - Autonomous Agent Browser',
    url: 'https://strawberry.browser/overview',
    snippet: 'Strawberry is an AI-powered desktop browser with autonomous research tabs.'
  },
  {
    title: 'Electron WebContentsView Architecture Guide',
    url: 'https://www.electronjs.org/docs/latest/api/web-contents-view',
    snippet: 'WebContentsView manages native view layout in modern Electron applications.'
  },
  {
    title: 'Model Context Protocol (MCP) Quickstart',
    url: 'https://modelcontextprotocol.io/docs/quickstart',
    snippet: 'Connecting local tools to LLMs via standard JSON-RPC stdio transports.'
  }
];

export const MOCK_JPEG_BASE64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
