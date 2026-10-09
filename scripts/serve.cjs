const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const app = 'contract-penalty-calculator';
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const stateDir = path.join(root, '.local');
const portFlag = process.argv.indexOf('--port');
let port = portFlag === -1 ? 8080 : Number(process.argv[portFlag + 1]);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port.');
const lastPort = Math.min(65535, port + 20);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'};
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, {'Allow':'GET, HEAD'});res.end();return;
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (pathname === '/__health') {
      res.writeHead(200, {'Content-Type':'application/json'});res.end(req.method==='HEAD'?'':JSON.stringify({app}));return;
    }
    if (pathname === '/favicon.ico') {res.writeHead(204);res.end();return;}
    const target = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname));
    const relative = path.relative(dist, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {res.writeHead(403);res.end();return;}
    const actual = await fs.realpath(target);
    const actualRelative = path.relative(dist, actual);
    if (actualRelative.startsWith('..') || path.isAbsolute(actualRelative)) {res.writeHead(403);res.end();return;}
    const bytes = await fs.readFile(actual);
    res.writeHead(200, {'Content-Type':types[path.extname(actual)] || 'application/octet-stream','Content-Length':bytes.length});
    res.end(req.method==='HEAD' ? undefined : bytes);
  } catch (error) {
    res.writeHead(error.code==='ENOENT' || error.code==='EISDIR' ? 404 : 400);res.end();
  }
});
server.on('error', error => {
  if (error.code === 'EADDRINUSE' && port < lastPort) {port++;server.listen(port, '127.0.0.1');}
  else {console.error(error);process.exitCode=1;}
});
server.on('listening', async () => {
  const actualPort = server.address().port;
  const url = `http://127.0.0.1:${actualPort}/`;
  try {
    await fs.mkdir(stateDir, {recursive:true});
    await fs.writeFile(path.join(stateDir, 'site.json'), JSON.stringify({app,url,pid:process.pid}));
    console.log(`Local site: ${url}`);
  } catch (error) {console.error(error);server.close();process.exitCode=1;}
});
server.listen(port, '127.0.0.1');
