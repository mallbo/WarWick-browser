const { app, WebContentsView } = require('electron');

app.whenReady().then(() => {
  try {
    const v = new WebContentsView();
    console.log('HAS_CLOSE:', typeof v.webContents.close);
    console.log('HAS_DESTROY:', typeof v.webContents.destroy);
    console.log('WEB_CONTENTS_METHODS:', Object.getOwnPropertyNames(Object.getPrototypeOf(v.webContents)).filter(m => m.includes('close') || m.includes('destroy')));
  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    app.quit();
  }
});
