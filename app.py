from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from datetime import datetime
import time
import json
from twocaptcha import TwoCaptcha

class AppointmentBot:
    def __init__(self, api_key):
        self.driver = webdriver.Chrome()
        self.current_appointment = datetime.strptime("01/13/2026", "%m/%d/%Y")
        self.solver = TwoCaptcha(api_key)
        
    def inject_turnstile_interceptor(self):
        interceptor_script = """
        window.turnstileParams = null;
        window.tsCallback = null;
        
        function interceptTurnstile() {
            if (window.turnstile) {
                const originalRender = window.turnstile.render;
                window.turnstile.render = function(a, b) {
                    let p = {
                        type: "TurnstileTaskProxyless",
                        websiteKey: b.sitekey,
                        websiteURL: window.location.href,
                        data: b.cData,
                        pagedata: b.chlPageData,
                        action: b.action,
                        userAgent: navigator.userAgent
                    };
                    window.turnstileParams = p;
                    window.tsCallback = b.callback;
                    console.log('Turnstile parameters intercepted:', p);
                    return originalRender.call(this, a, b);
                };
                return true;
            }
            return false;
        }

        // Try immediate interception
        if (!interceptTurnstile()) {
            // Set up observer to wait for script injection
            const observer = new MutationObserver((mutations, obs) => {
                if (interceptTurnstile()) {
                    obs.disconnect();
                    console.log('Turnstile intercepted via observer');
                }
            });

            observer.observe(document, {
                childList: true,
                subtree: true
            });
        }
        """
        self.driver.execute_script(interceptor_script)

    def solve_turnstile(self):
        print("Waiting for Turnstile parameters...")
        max_attempts = 30  # Increase wait time to 30 seconds
        attempt = 0
        
        while attempt < max_attempts:
            try:
                params = self.driver.execute_script("return window.turnstileParams")
                if params:
                    print("Turnstile parameters found:", params)
                    try:
                        result = self.solver.turnstile(
                            sitekey=params['websiteKey'],
                            url=params['websiteURL'],
                            action=params.get('action'),
                            data=params.get('data'),
                            pagedata=params.get('pagedata')
                        )
                        
                        print("Turnstile solved, applying solution...")
                        self.driver.execute_script("window.tsCallback(?)", result['code'])
                        return True
                    except Exception as e:
                        print(f"2captcha solving error: {str(e)}")
                        return False
            except Exception as e:
                print(f"Attempt {attempt + 1}: Waiting for parameters... ({str(e)})")
            
            attempt += 1
            time.sleep(1)
        
        raise Exception("Failed to get Turnstile parameters after 30 seconds")

    def login(self, order_number, email, password):
        print("Starting login process...")
        self.driver.get("https://lasd.permitium.com/order_tracker")
        
        print("Injecting Turnstile interceptor...")
        self.inject_turnstile_interceptor()
        
        # Wait for page to fully load
        time.sleep(5)  # Add initial wait for page load
        
        print("Attempting to solve Turnstile...")
        if not self.solve_turnstile():
            raise Exception("Failed to solve Cloudflare challenge")
        
        print("Turnstile solved, proceeding with login...")
        WebDriverWait(self.driver, 10).until(
            EC.presence_of_element_located((By.NAME, "orderid"))
        )
        self.driver.find_element(By.NAME, "orderid").send_keys(order_number)
        self.driver.find_element(By.NAME, "email").send_keys(email)
        self.driver.find_element(By.NAME, "password").send_keys(password)
        self.driver.find_element(By.ID, "loginButton").click()

    def check_appointments(self):
        while True:
            try:
                # Click reschedule button
                WebDriverWait(self.driver, 10).until(
                    EC.element_to_be_clickable((By.CLASS_NAME, "reschedule-btn"))
                ).click()

                # Click "first available" button
                WebDriverWait(self.driver, 10).until(
                    EC.element_to_be_clickable((By.CLASS_NAME, "first-available-btn"))
                ).click()

                # Get available dates (Tuesday and Thursday)
                available_dates = WebDriverWait(self.driver, 10).until(
                    EC.presence_of_all_elements_located((By.CSS_SELECTOR, ".calendar-day:not(.full)"))
                )

                for date_element in available_dates:
                    date_text = date_element.get_attribute("data-date")
                    available_date = datetime.strptime(date_text, "%m/%d/%Y")
                    
                    if available_date < self.current_appointment:
                        # Click the date
                        date_element.click()
                        
                        # Select earliest time slot
                        time_slots = self.driver.find_elements(By.NAME, "appointment_time")
                        if time_slots:
                            time_slots[0].click()
                            
                            # Click update appointment
                            self.driver.find_element(By.CLASS_NAME, "update-appointment-btn").click()
                            
                            print(f"Successfully booked earlier appointment for {date_text}")
                            return True
                
                print(f"No earlier dates found. Checking again in 30 seconds...")
                time.sleep(30)
                self.driver.refresh()
                
            except Exception as e:
                print(f"Error occurred: {str(e)}")
                self.driver.refresh()
                time.sleep(30)

    def run(self, order_number, email, password):
        try:
            self.login(order_number, email, password)
            self.check_appointments()
        finally:
            self.driver.quit()

# Usage
if __name__ == "__main__":
    bot = AppointmentBot(api_key="b2f661fd6f5a3a94d05900a8439c65bd")
    bot.run(
        order_number="YOUR_ORDER_NUMBER",
        email="your_email@example.com",
        password="your_password"
    )
