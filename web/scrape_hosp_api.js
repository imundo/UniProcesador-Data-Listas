const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function scrapeHospApi() {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    const apiResponses = [];
    
    page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('api') || url.includes('json') || url.includes('trpc') || url.includes('_next/data')) {
            try {
                const text = await response.text();
                if (text.length > 500) {
                    apiResponses.push({ url, text: text.substring(0, 1000) });
                }
            } catch (e) {}
        }
    });
    
    try {
        console.log("Navigating to hospitales...");
        await page.goto('https://redayudavenezuela.com/hospitales', { waitUntil: 'networkidle2', timeout: 30000 });
        
        await new Promise(r => setTimeout(r, 5000));
        
        const fs = require('fs');
        fs.writeFileSync('../api_hospitales.json', JSON.stringify(apiResponses, null, 2));
        console.log("Saved api_hospitales.json");
        
    } catch (error) {
        console.error("Scraping error:", error);
    } finally {
        await browser.close();
    }
}

scrapeHospApi();
