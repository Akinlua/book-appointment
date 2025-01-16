import puppeteer from 'puppeteer-core'
import { Solver } from '@2captcha/captcha-solver'
import { readFileSync } from 'fs'
import { normalizeUserAgent } from './normalize-ua.js'

class AppointmentBot {
    constructor() {
        this.currentAppointment = new Date('2026-01-13');
        this.browser = null;
        this.page = null;
    }

    async initialize() {
        const initialUserAgent = await normalizeUserAgent();
        this.browser = await puppeteer.launch({
            headless: false,
            devtools: true,
            executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            channel: 'chrome',
            args: [`--user-agent=${initialUserAgent}`]
        });
        this.page = (await this.browser.pages())[0];

        // Inject the Cloudflare bypass script
        const preloadFile = readFileSync('./inject.js', 'utf8');
        await this.page.evaluateOnNewDocument(preloadFile);
    }

    async login(orderNumber, email, password) {
        const solver = new Solver("b2f661fd6f5a3a94d05900a8439c65bd");

        // Handle Cloudflare verification
        this.page.on('console', async (msg) => {
            const txt = msg.text();
            if (txt.includes('intercepted-params:')) {
                const params = JSON.parse(txt.replace('intercepted-params:', ''));
                try {
                    console.log('Solving the captcha...');
                    const res = await solver.cloudflareTurnstile(params);
                    console.log(`Solved the captcha ${res.id}`);
                    await this.page.evaluate((token) => {
                        cfCallback(token);
                    }, res.data);
                } catch (e) {
                    console.error('Captcha error:', e);
                }
            }
        });

        await this.page.goto('https://lasd.permitium.com/order_tracker', { waitUntil: 'networkidle2', timeout: 1800000 });

        // Wait for login form and fill credentials
        await this.page.waitForSelector('input[name="orderid"]', { timeout: 1800000 });
        await this.page.type('input[name="orderid"]', orderNumber);
        await this.page.type('input[name="email"]', email);
        await this.page.type('input[name="password"]', password);
        await this.page.click('#loginButton');
        console.log('Logged in');
    }

    async checkAppointments() {
        while (true) {
            try {
                // Click reschedule button
                await this.page.waitForSelector('.reschedule-btn', { timeout: 1800000 });
                await this.page.click('.reschedule-btn');

                // Click first available button
                await this.page.waitForSelector('.first-available-btn', { timeout: 1800000 });
                await this.page.click('.first-available-btn');

                // Get available dates
                await this.page.waitForSelector('.calendar-day:not(.full)', { timeout: 1800000 });
                const availableDates = await this.page.$$('.calendar-day:not(.full)');

                for (const dateElement of availableDates) {
                    const dateText = await dateElement.evaluate(el => el.getAttribute('data-date'));
                    const availableDate = new Date(dateText);

                    if (availableDate < this.currentAppointment) {
                        // Click the date
                        await dateElement.click();

                        // Select earliest time slot
                        await this.page.waitForSelector('input[name="appointment_time"]', { timeout: 1800000 });
                        const timeSlots = await this.page.$$('input[name="appointment_time"]');
                        if (timeSlots.length > 0) {
                            await timeSlots[0].click();
                            await this.page.click('.update-appointment-btn');
                            console.log(`Successfully booked earlier appointment for ${dateText}`);
                            return true;
                        }
                    }
                }

                console.log('No earlier dates found. Checking again in 30 seconds...');
                await new Promise(resolve => setTimeout(resolve, 30000));
                await this.page.reload();

            } catch (error) {
                console.error('Error occurred:', error);
                await this.page.reload();
                await new Promise(resolve => setTimeout(resolve, 30000));
            }
        }
    }

    async run(orderNumber, email, password) {
        try {
            await this.initialize();
            await this.login(orderNumber, email, password);
            await this.checkAppointments();
        } finally {
            if (this.browser) {
                await this.browser.close();
            }
        }
    }
}

// Usage
const bot = new AppointmentBot();
bot.run(
    'DFBLJK7Q2',
    'your_email@example.com',
    'your_password'
).catch(console.error);