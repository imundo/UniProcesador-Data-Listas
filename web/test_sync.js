const http = require('http');
const req = http.request({
    hostname: 'localhost',
    port: 8080,
    path: '/api/admin/sync-redayuda',
    method: 'POST'
}, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log("Response:", data));
});
req.on('error', console.error);
req.end();
