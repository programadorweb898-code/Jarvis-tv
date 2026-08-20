const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8081;
const APK = path.join(__dirname, '..', 'tv', 'build', 'outputs', 'apk', 'debug', 'tv-debug.apk');

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/tv-debug.apk') {
    if (!fs.existsSync(APK)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('APK no encontrado. Compilalo con gradle :tv:assembleDebug primero.');
      return;
    }
    const stat = fs.statSync(APK);
    res.writeHead(200, {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Length': stat.size,
      'Content-Disposition': 'attachment; filename="tv-debug.apk"',
    });
    fs.createReadStream(APK).pipe(res);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Usá GET /tv-debug.apk');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Sirviendo ${APK} en http://0.0.0.0:${PORT}/tv-debug.apk`);
});