const puppeteer = require('puppeteer');

async function scrapeRedAyuda() {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');
    
    try {
        console.log("Navigating to desaparecidos...");
        await page.goto('https://redayudavenezuela.com/desaparecidos', { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        await new Promise(r => setTimeout(r, 5000));
        
        const htmlDesaparecidos = await page.content();
        const fs = require('fs');
        fs.writeFileSync('../desaparecidos.html', htmlDesaparecidos);
        console.log("Saved desaparecidos.html");
        
        console.log("Navigating to hospitales...");
        await page.goto('https://redayudavenezuela.com/hospitales', { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        await new Promise(r => setTimeout(r, 5000));
        const htmlHospitales = await page.content();
        fs.writeFileSync('../hospitales.html', htmlHospitales);
        console.log("Saved hospitales.html");
        
    } catch (error) {
        console.error("Scraping error:", error);
    } finally {
        await browser.close();
    }
}

scrapeRedAyuda();
