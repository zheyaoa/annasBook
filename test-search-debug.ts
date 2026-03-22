import { loadConfig } from './src/config.js';
import { HttpClient } from './src/http-client.js';

async function main() {
  const config = loadConfig('./config.json', { skipExcelCheck: true });
  const client = new HttpClient(config);

  console.log('Proxy:', config.proxy);

  const mirrors = [
    'https://annas-archive.se',
    'https://annas-archive.li',
    'https://annas-archive.to',
    'https://annas-archive.org',
    'https://annas-archive.gs',
  ];

  for (const mirror of mirrors) {
    const url = mirror + '/search?index=&page=1&sort=&ext=pdf&ext=epub&display=&q=' + encodeURIComponent('Designing Data-Intensive Applications');
    console.log('\nTesting mirror:', mirror);
    console.log('URL:', url);

    try {
      const result = await client.get(url, 30000);
      console.log('Status:', result.status);
      console.log('Body length:', result.body.length);
      console.log('Has MD5 links:', result.body.includes('/md5/'));
      if (result.status === 200 && result.body.length > 0) {
        console.log('First 1000 chars:', result.body.substring(0, 1000));
        break;
      }
    } catch (e: any) {
      console.error('Error:', e.message);
    }
  }
}

main();