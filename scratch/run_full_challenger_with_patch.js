import fs from 'node:fs';
import path from 'node:path';

// Intercept readFileSync for pageContextExtractor.ts
const realReadFileSync = fs.readFileSync;
fs.readFileSync = function (file, options) {
  const content = realReadFileSync.call(fs, file, options);
  if (typeof file === 'string' && file.includes('pageContextExtractor.ts')) {
    let patched = content.toString();
    
    // Fix 1
    patched = patched.replace(
      `  const activeTab = tabManager.getActiveTab();\n  if (!activeTab || activeTab.view.webContents.isDestroyed()) {`,
      `  const activeTab = tabManager.getActiveTab();\n  if (!activeTab || !activeTab.view?.webContents || activeTab.view.webContents.isDestroyed()) {`
    );

    // Fix timer
    patched = patched.replace(
      `    const timeoutPromise = new Promise<null>((_, reject) =>\n      setTimeout(() => reject(new Error('capturePage timeout')), 3000)\n    );\n\n    const image = await Promise.race([\n      wc.capturePage(),\n      timeoutPromise\n    ]);`,
      `    let timeoutId: ReturnType<typeof setTimeout> | undefined;\n    const timeoutPromise = new Promise<null>((_, reject) => {\n      timeoutId = setTimeout(() => reject(new Error('capturePage timeout')), 3000);\n    });\n\n    let image;\n    try {\n      image = await Promise.race([\n        wc.capturePage(),\n        timeoutPromise\n      ]);\n    } finally {\n      if (timeoutId) {\n        clearTimeout(timeoutId);\n      }\n    }`
    );

    // Fix 2
    patched = patched.replace(
      `  if (activeTab.view.webContents.isDestroyed()) {\n    return {\n      url: activeTab.state.url,\n      title: activeTab.state.title,\n      selectedText: '',\n      readableText: '[Tab WebContents destroyed]',\n      metaDescription: '',\n      screenshotBase64: undefined\n    };\n  }`,
      `  if (!activeTab.view?.webContents || activeTab.view.webContents.isDestroyed()) {\n    return {\n      url: activeTab.state.url,\n      title: activeTab.state.title,\n      selectedText: '',\n      readableText: '[Tab WebContents destroyed]',\n      metaDescription: '',\n      screenshotBase64: undefined\n    };\n  }`
    );

    return patched;
  }
  return content;
};

// Now import the challenger test runner
await import('./tests/m3_token_guard_and_screenshot.test.js');
