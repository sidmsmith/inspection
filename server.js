const express = require('express');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

const app = express();
app.use(express.json({ limit: '50mb' }));

// Serve static files from both root and public directory
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/config', express.static(path.join(__dirname, 'config')));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/samples', express.static(path.join(__dirname, 'samples')));

// Proxy all /api calls to Flask (running on localhost:5000 during dev)
app.post('/api/:action', async (req, res) => {
  const url = process.env.VERCEL ? `https://${process.env.VERCEL_URL}/api/${req.params.action}` : 'http://localhost:5000/api/' + req.params.action;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const rawText = await response.text();
    let data;
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      return res.status(response.status).json({
        success: false,
        error: response.status === 413
          ? 'Upload too large for server (HTTP 413)'
          : (rawText.slice(0, 200) || `Request failed (HTTP ${response.status})`)
      });
    }
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Handle image files explicitly (for Vercel serverless)
app.get(/\.(png|jpg|jpeg|gif|svg|ico|webp)$/i, (req, res, next) => {
  // Skip favicon.ico - let it 404 gracefully
  if (req.path === '/favicon.ico') {
    return res.status(404).send('Not found');
  }

  // Try public directory first (Vercel serves this automatically)
  const publicPath = path.join(__dirname, 'public', req.path);
  if (fs.existsSync(publicPath)) {
    return res.sendFile(publicPath, (err) => {
      if (err) {
        console.error('Error serving file from public:', err);
        res.status(404).send('File not found');
      }
    });
  }

  // Fallback to root directory
  const rootPath = path.join(__dirname, req.path);
  res.sendFile(rootPath, (err) => {
    if (err) {
      console.error('Error serving static file:', err);
      res.status(404).send('File not found');
    }
  });
});

function sendRootFile(res, relativePath) {
  const filePath = path.join(__dirname, relativePath);
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  return false;
}

// Admin UI and other HTML pages (before SPA catch-all)
app.get('/admin.html', (req, res) => {
  if (!sendRootFile(res, 'admin.html')) {
    res.status(404).send('admin.html not found');
  }
});

// Catch-all for SPA routing (must be last)
// Use regex pattern instead of '*' to avoid path-to-regexp errors on Vercel/Express 5
app.get(/^(?!\/api).*$/, (req, res) => {
  if (req.path === '/admin.html') {
    if (sendRootFile(res, 'admin.html')) return;
  }
  if (/\.\w+$/.test(req.path) && sendRootFile(res, req.path.replace(/^\//, ''))) {
    return;
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

module.exports = app;

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server on port ${PORT}`));
}