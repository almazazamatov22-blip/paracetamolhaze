const http = require('http');
const fs = require('fs');
const path = require('path');

const CLIENT_ID = 'njwi66jx4ju5kpb25aeh4fd4i2okq5';
const CLIENT_SECRET = 'uspju8gdepuar3e7fgv7c5q0p5xem8';

const SC_CLIENT_ID = 'B48zwWMdEXabNmvW';
const SC_TOKEN = '$2y$10$1oDc6YqpQ2dOdh10tdmLhOZX56f99.u9rD.1gCKf2TqabJPUPeWKO';

let tokenCache = null;
let tokenExpiry = 0;

async function getToken() {
  if (tokenCache && Date.now() < tokenExpiry) return tokenCache;
  
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    body: `client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`
  });
  const data = await res.json();
  tokenCache = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
  return tokenCache;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  console.log('Request:', req.method, url.pathname);
  
  // API endpoint
  if (url.pathname.startsWith('/api') || url.pathname === '/api') {
    const action = url.searchParams.get('a');
    const user = url.searchParams.get('u');
    
    try {
      const token = await getToken();
      const headers = { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` };
      
      // User info via Twitch API
      if ((action === 'u' || url.pathname.includes('user')) && user) {
        const res2 = await fetch(`https://api.twitch.tv/helix/users?login=${user}`, { headers });
        const data = await res2.json();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify(data.data?.[0] || { error: 'not found' }));
        return;
      }
      
      // StreamsCharts API
      if (action === 'sc' && user) {
        try {
          // First get user ID from Twitch
          const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${user}`, { headers });
          const userData = await userRes.json();
          const twitchId = userData.data?.[0]?.id;
          
          if (!twitchId) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'user not found' }));
            return;
          }
          
          // Then get data from streamscharts
          const scRes = await fetch(`https://streamscharts.com/api/token?login=${twitchId}`, {
            headers: {
              'Authorization': `Bearer ${SC_TOKEN}`,
              'Client-ID': SC_CLIENT_ID
            }
          });
          const scData = await scRes.json();
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify(scData));
          return;
        } catch (e) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: e.message }));
          return;
        }
      }
      
      // Stream status
      if (action === 's' && user) {
        const res2 = await fetch(`https://api.twitch.tv/helix/streams?user_login=${user}`, { headers });
        const data = await res2.json();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({ live: !!data.data?.length, stream: data.data?.[0] || null }));
        return;
      }
      
      // Followers
      if (action === 'f' && user) {
        const res2 = await fetch(`https://api.twitch.tv/helix/users?login=${user}`, { headers });
        const ud = await res2.json();
        const uid = ud.data?.[0]?.id;
        if (!uid) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ total: 0 }));
          return;
        }
        const res3 = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${uid}&first=1`, { headers });
        const fd = await res3.json();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({ total: fd.total || 0 }));
        return;
      }
      
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'unknown action', path: url.pathname, params: { a: action, u: user } }));
      return;
    } catch (e) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: e.message }));
      return;
    }
  }
  
  // Static files
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  
  const ext = path.extname(filePath);
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8'
  };
  
  try {
    const content = fs.readFileSync(path.join(__dirname, filePath));
    res.setHeader('Content-Type', contentTypes[ext] || 'text/plain; charset=utf-8');
    res.end(content);
  } catch (e) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
  }
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Server on ${port}`));