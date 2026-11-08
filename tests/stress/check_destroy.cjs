const { app, WebContentsView } = require('electron');

app.whenReady().then(async () => {
  const view = new WebContentsView();
  const wc = view.webContents;
  console.log('INITIAL isDestroyed:', wc.isDestroyed());

  wc.close();
  console.log('AFTER wc.close():', wc.isDestroyed());

  await new Promise(r => setTimeout(r, 100));
  console.log('AFTER 100ms wc.close():', wc.isDestroyed());

  const view2 = new WebContentsView();
  const wc2 = view2.webContents;
  console.log('INITIAL view2 isDestroyed:', wc2.isDestroyed());
  wc2.destroy();
  console.log('AFTER wc2.destroy():', wc2.isDestroyed());

  app.quit();
});
