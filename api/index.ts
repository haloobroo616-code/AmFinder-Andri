import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;
  const BASE = 'https://amfinder.web.id';
  const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

  async function amfinder(targetUrl: string) {
    try {
      if (!targetUrl) return { status: false, message: 'URL tidak boleh kosong!' };

      const apiUrl = `${BASE}/api/find?url=${encodeURIComponent(targetUrl.trim())}&bat=80&chg=1`;
      const headers = {
        accept: 'text/event-stream',
        'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        referer: `${BASE}/`,
        'user-agent': UA
      };

      const res = await fetch(apiUrl, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error('Tidak ada response body');

      const reader = (res.body as any).getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          const line = part.split('\n').find(l => l.startsWith('data:'));
          if (!line) continue;
          try {
            const parsed = JSON.parse(line.slice(5).trim());
            if (parsed && typeof parsed === 'object' && 'ok' in parsed) finalResult = parsed;
          } catch {}
        }
      }

      if (!finalResult) return { status: false, message: 'Tidak ada hasil akhir diterima.' };
      return finalResult;
    } catch (error: any) {
      console.error('Amfinder error:', error);
      return { status: false, message: error.message };
    }
  }

  app.get('/api/find', async (req, res) => {
    // Basic anti-scrape protection
    const referer = req.headers.referer;
    const origin = req.headers.origin;
    const customHeader = req.headers['x-app-request'];
    
    // In production, we expect the request to come from our own domain
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
      const appUrl = process.env.APP_URL || '';
      const isSelfRequest = (referer && referer.includes(appUrl)) || (origin && origin.includes(appUrl));
      
      // If APP_URL is not set, we skip referer check but still allow the custom header
      if (appUrl && !isSelfRequest && customHeader !== 'am-preset-finder-secure') {
        return res.status(403).json({ status: false, message: 'Unauthorized request' });
      }
    }

    const url = req.query.url as string;
    const result = await amfinder(url);
    res.json(result);
  });

  // Only handle static/vite in local development or if not on Vercel
  if (!process.env.VERCEL) {
    if (process.env.NODE_ENV === 'production') {
      const distPath = path.resolve(rootDir, 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    } else {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
        root: rootDir,
      });
      app.use(vite.middlewares);
      
      app.get('*', async (req, res, next) => {
        const url = req.originalUrl;
        try {
          const fs = await import('fs');
          let template = fs.readFileSync(path.resolve(rootDir, 'index.html'), 'utf-8');
          template = await vite.transformIndexHtml(url, template);
          res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
        } catch (e) {
          next(e);
        }
      });
    }

    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`Server running at http://0.0.0.0:${PORT}`);
    });
  }

  return app;
}

const appPromise = startServer();
export default async (req: any, res: any) => {
  const app = await appPromise;
  return app(req, res);
};
