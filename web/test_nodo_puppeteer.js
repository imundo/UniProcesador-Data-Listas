const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // Enable request interception
  await page.setRequestInterception(true);
  
  page.on('request', request => {
    if (request.url().includes('supabase.co')) {
        console.log('--- SUPABASE REQUEST ---');
        console.log('URL:', request.url());
        console.log('Method:', request.method());
        console.log('Headers:', request.headers());
        console.log('Post Data:', request.postData());
        console.log('-----------------------------');
    }
    request.continue();
  });
  
  page.on('response', async response => {
      if (response.url().includes('supabase.co')) {
          console.log('--- RESPONSE STATUS ---', response.status(), response.url());
          try {
            const body = await response.text();
            console.log('Response Body:', body.substring(0, 500) + '...');
          } catch(e) {}
      }
  });

  console.log('Navigating...');
  await page.goto('https://www.nodoayuda.com/', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));
  
  console.log('Typing Garcia...');
  await page.type('input[type="text"]', 'Garcia');
  
  console.log('Pressing Enter...');
  await page.keyboard.press('Enter');
  
  await new Promise(r => setTimeout(r, 5000));
  
  await browser.close();
})();
