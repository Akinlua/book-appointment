import puppeteer from 'puppeteer-core'
import { Solver } from '@2captcha/captcha-solver'
import { readFileSync } from 'fs'
import { normalizeUserAgent } from './normalize-ua.js'
import dotenv from 'dotenv'
dotenv.config()

class AppointmentBot {
    constructor() {
        this.currentAppointment = null;
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
                await this.page.waitForSelector('#rescheduleButton', { timeout: 1800000 });
                await this.page.click('#rescheduleButton');

                // Click first available button
                await this.page.waitForSelector('#firstAvailable', { timeout: 1800000 });
                await this.page.click('#firstAvailable');

                // Wait for 2 seconds
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Wait for the calendar to load
                await this.page.waitForSelector('#weekDiv', { timeout: 1800000 });
                console.log("week div seen");

                // Add a delay to ensure calendar is fully rendered
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Wait for actual calendar days to appear
                await this.page.waitForSelector('.calday', { timeout: 1800000 });
                console.log("Calendar days are now visible");


                // Log the page content for debugging
                const calendarContent = await this.page.evaluate(() => {
                    const weekDiv = document.querySelector('#weekDiv');
                    return weekDiv ? weekDiv.innerHTML : 'No weekDiv found';
                });
                console.log('Calendar HTML:', calendarContent);

                // Find available dates (not marked as "Full")
                const availableDates = await this.page.evaluate(() => {
                    try {
                        console.log("Starting date evaluation...");
                        const days = document.querySelectorAll('.calday');
                        console.log(`Found ${days.length} calendar days`);
                        
                        if (days.length === 0) {
                            console.log("No calendar days found on the page");
                            return null;
                        }

                        for (let i = 0; i < days.length; i++) {
                            try {
                                const day = days[i];
                                const text = day.textContent.trim();
                                console.log(`Checking day ${i} with text: "${text}"`);
                                
                                if (!text.includes('Full')) {
                                    const brElement = day.querySelector('br');
                                    if (!brElement) {
                                        console.log("BR element not found in day");
                                        continue;
                                    }
                                    
                                    const nextSibling = brElement.nextSibling;
                                    if (!nextSibling) {
                                        console.log("No next sibling found after BR");
                                        continue;
                                    }
                                    
                                    const dateText = nextSibling.textContent.trim();
                                    console.log(`Found available date at index ${i}: ${dateText}`);
                                    
                                    return {
                                        index: i,
                                        date: dateText
                                    };
                                }
                            } catch (dayError) {
                                console.log(`Error processing individual day: ${dayError.message}`);
                            }
                        }
                        
                        console.log("Finished checking all days, none available");
                        return null;
                    } catch (error) {
                        console.log(`Error in date evaluation: ${error.message}`);
                        return null;
                    }
                }).catch(error => {
                    console.error("Failed to evaluate page:", error);
                    return null;
                });

                if (availableDates) {
                    console.log(availableDates)
                    console.log("available dates found")
                    // Convert date string to Date object
                    const availableDate = new Date(availableDates.date);
                    const currentAppointment = new Date(this.currentAppointmentDate);
                    
                    if (availableDate < currentAppointment) {
                        console.log("available date is less than current appointment")
                        this.currentAppointment = availableDate;
                        
                        // Use Puppeteer's built-in selector and click
                        const calendarDays = await this.page.$$('.calday');
                        if (calendarDays[availableDates.index]) {
                            await calendarDays[availableDates.index].click();
                            console.log("Clicked the available date");

                            // Select earliest time slot
                            await this.page.waitForSelector('.form-check', { timeout: 1800000 });
                            const timeSlots = await this.page.$$('.form-check-label.radio');
                            if (timeSlots.length > 0) {
                                console.log("Found a time slot to book");
                                console.log(timeSlots)
                                await timeSlots[0].click();
                                console.log("Clicked the time slot");

                                // Uncomment these when ready to actually book
                                await this.page.click('#rescheduleButton');
                                console.log(`Successfully booked earlier appointment`);
                                return true;
                            }
                        } else {
                            console.error("Could not find the calendar day element");
                        }
                    }
                }

                console.log('No available dates found. Checking again in 2 seconds...');
                await new Promise(resolve => setTimeout(resolve, 2000));
                await this.page.reload();

            } catch (error) {
                console.error('Error occurred:', error);
                await this.page.reload();
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }

    async getCurrentAppointmentDate() {
        await this.page.waitForSelector('#timeSelected', { timeout: 1800000 });
        const dateText = await this.page.evaluate(() => {
            const timeSelected = document.getElementById('timeSelected');
            const strongTag = timeSelected.querySelector('strong');
            const uTag = strongTag.querySelector('u');
            return uTag ? uTag.textContent.trim() : null;
        });
        
        console.log('Found date text:', dateText);
        
        if (!dateText) {
            throw new Error('Could not find current appointment date');
        }
        
        // Parse the date from format like "January 13, 2026 7:40:00 AM PST"
        const date = new Date(dateText);
        
        if (isNaN(date.getTime())) {
            throw new Error('Invalid date format received: ' + dateText);
        }
        
        this.currentAppointment = date;
        console.log(`Current appointment date: ${this.currentAppointment}`);
    }

    async run(orderNumber, email, password) {
        try {
            await this.initialize();
            await this.login(orderNumber, email, password);
            await this.getCurrentAppointmentDate();
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
    process.env.ORDER,
    process.env.EMAIL,
    process.env.PASSWORD
).catch(console.error);