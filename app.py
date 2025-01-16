from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from datetime import datetime
import time

class AppointmentBot:
    def __init__(self):
        self.driver = webdriver.Chrome()  # Make sure you have ChromeDriver installed
        self.current_appointment = datetime.strptime("01/13/2026", "%m/%d/%Y")
        
    def login(self, order_number, email, password):
        self.driver.get("https://lasd.permitium.com/order_tracker")
        
        # Add delay to allow manual completion of Cloudflare verification
        print("Please complete the Cloudflare verification if shown...")
        input("Press Enter once the verification is complete and you can see the login form...")
        
        # Rest of login process
        WebDriverWait(self.driver, 10).until(
            EC.presence_of_element_located((By.NAME, "orderid"))
        )
        self.driver.find_element(By.NAME, "order_number").send_keys(order_number)
        self.driver.find_element(By.NAME, "email").send_keys(email)
        self.driver.find_element(By.NAME, "password").send_keys(password)
        self.driver.find_element(By.ID, "loginButton").click()
        print("Logged in")
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
    bot = AppointmentBot()
    bot.run(
        order_number="DFBLJK7Q2",
        email="your_email@example.com",
        password="your_password"
    )
