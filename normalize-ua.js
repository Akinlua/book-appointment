import puppeteer from 'puppeteer-core'

const normalizeUserAgent = () => {
    return new Promise(async (resolve, reject) => {
        try {
            let browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox'],
                executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
            })
            let userAgent = await browser.userAgent()
            let normalized = userAgent.replace('Headless', '')
            normalized = normalized.replace('Chromium', 'Chrome')
            await browser.close()
            resolve(normalized)
        } catch (e) {
            resolve('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36')
        }
    })
}

export { normalizeUserAgent }