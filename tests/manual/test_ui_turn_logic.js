// End-to-end UI test for turn logic using browser automation
const { chromium } = require('playwright');

async function testTurnLogicUI() {
  let browser;
  let page1, page2;
  
  try {
    console.log('🚀 Starting UI test for turn logic...');
    
    // Launch browser
    browser = await chromium.launch({ headless: false, slowMo: 1000 });
    
    // Create two browser contexts (like two different browsers)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    // Create pages for both players
    page1 = await context1.newPage();
    page2 = await context2.newPage();
    
    console.log('👨‍💼 Setting up Player 1 (Emma)...');
    await page1.goto('http://localhost:3002');
    await page1.waitForSelector('[data-testid="login-form"], [data-testid="create-room-button"], .login-form', { timeout: 10000 });
    
    // Login as Emma
    try {
      const usernameField = await page1.$('input[name="username"], input[type="text"]');
      if (usernameField) {
        await usernameField.fill('Emma');
        const passwordField = await page1.$('input[name="password"], input[type="password"]');
        await passwordField.fill('emma123');
        await page1.click('button[type="submit"], .login-button');
        await page1.waitForTimeout(2000);
      }
    } catch (e) {
      console.log('Emma seems already logged in');
    }
    
    console.log('👩‍💼 Setting up Player 2 (Jocke)...');
    await page2.goto('http://localhost:3002');
    await page2.waitForSelector('[data-testid="login-form"], [data-testid="create-room-button"], .login-form', { timeout: 10000 });
    
    // Login as Jocke
    try {
      const usernameField2 = await page2.$('input[name="username"], input[type="text"]');
      if (usernameField2) {
        await usernameField2.fill('Jocke');
        const passwordField2 = await page2.$('input[name="password"], input[type="password"]');
        await passwordField2.fill('jocke123');
        await page2.click('button[type="submit"], .login-button');
        await page2.waitForTimeout(2000);
      }
    } catch (e) {
      console.log('Jocke seems already logged in');
    }
    
    // Emma creates a room
    console.log('🏠 Emma creating a room...');
    await page1.waitForTimeout(1000);
    
    // Try to find create room button
    const createRoomBtn = await page1.$('button:has-text("Create Room"), .create-room-btn, [data-testid="create-room"]');
    if (createRoomBtn) {
      await createRoomBtn.click();
      await page1.waitForTimeout(1000);
      
      // Fill room details if needed
      const roomNameField = await page1.$('input[name="name"], input[placeholder*="room name"]');
      if (roomNameField) {
        await roomNameField.fill('Turn Test Room');
        const submitBtn = await page1.$('button[type="submit"], button:has-text("Create")');
        await submitBtn.click();
      }
    }
    
    // Get room code
    await page1.waitForTimeout(2000);
    const roomCodeElement = await page1.$('.room-code, [data-testid="room-code"]');
    let roomCode = '';
    if (roomCodeElement) {
      roomCode = await roomCodeElement.textContent();
      console.log('🔑 Room code:', roomCode);
    }
    
    // Jocke joins the room
    console.log('👥 Jocke joining room...');
    const joinBtn = await page2.$('button:has-text("Join"), .join-room-btn');
    if (joinBtn) {
      await joinBtn.click();
      const codeField = await page2.$('input[name="code"], input[placeholder*="code"]');
      if (codeField && roomCode) {
        await codeField.fill(roomCode.trim());
        const submitJoin = await page2.$('button[type="submit"], button:has-text("Join")');
        await submitJoin.click();
      }
    }
    
    await page2.waitForTimeout(2000);
    
    // Emma starts the game
    console.log('🎮 Emma starting the game...');
    const startGameBtn = await page1.$('button:has-text("Start"), .start-game-btn');
    if (startGameBtn) {
      await startGameBtn.click();
      await page1.waitForTimeout(3000);
    }
    
    // Wait for game to start
    await page1.waitForTimeout(2000);
    await page2.waitForTimeout(2000);
    
    console.log('🔍 Testing turn logic...');
    
    // Check who can select letters
    const letters = ['A', 'B', 'C', 'D', 'E'];
    let emmaCanSelect = false;
    let jockeCanSelect = false;
    
    // Test Emma's ability to select letters
    try {
      const emmaLetterBtn = await page1.$('button:has-text("A"), .letter-button[data-letter="A"]');
      if (emmaLetterBtn) {
        await emmaLetterBtn.click();
        await page1.waitForTimeout(1000);
        
        // Check if letter was selected (look for visual feedback)
        const selectedIndicator = await page1.$('.selected-letter, .letter-selected, [data-selected="true"]');
        emmaCanSelect = !!selectedIndicator;
      }
    } catch (e) {
      console.log('Emma cannot select letters');
    }
    
    // Test Jocke's ability to select letters  
    try {
      const jockeLetterBtn = await page2.$('button:has-text("B"), .letter-button[data-letter="B"]');
      if (jockeLetterBtn) {
        await jockeLetterBtn.click();
        await page2.waitForTimeout(1000);
        
        // Check if letter was selected
        const selectedIndicator = await page2.$('.selected-letter, .letter-selected, [data-selected="true"]');
        jockeCanSelect = !!selectedIndicator;
      }
    } catch (e) {
      console.log('Jocke cannot select letters');
    }
    
    // Check console logs for turn debug info
    const emmaLogs = await page1.evaluate(() => {
      const logs = [];
      const originalConsoleError = console.error;
      console.error = (...args) => {
        if (args[0] && typeof args[0] === 'string' && args[0].includes('TURN DEBUG')) {
          logs.push(args);
        }
        originalConsoleError.apply(console, args);
      };
      return logs;
    });
    
    console.log('\n📊 TURN LOGIC TEST RESULTS:');
    console.log(`👨‍💼 Emma can select letters: ${emmaCanSelect}`);
    console.log(`👩‍💼 Jocke can select letters: ${jockeCanSelect}`);
    
    if (emmaCanSelect && !jockeCanSelect) {
      console.log('✅ TURN LOGIC WORKING: Only Emma (first player) can select');
    } else if (!emmaCanSelect && jockeCanSelect) {
      console.log('✅ TURN LOGIC WORKING: Only Jocke (current player) can select');
    } else if (emmaCanSelect && jockeCanSelect) {
      console.log('❌ TURN LOGIC BROKEN: Both players can select letters!');
    } else {
      console.log('⚠️ UNCLEAR: Neither player seems able to select letters');
    }
    
    // Take screenshots for debugging
    await page1.screenshot({ path: 'emma_screen.png' });
    await page2.screenshot({ path: 'jocke_screen.png' });
    console.log('📸 Screenshots saved: emma_screen.png, jocke_screen.png');
    
  } catch (error) {
    console.error('❌ UI test failed:', error.message);
  } finally {
    if (browser) {
      console.log('🧹 Cleaning up browser...');
      await browser.close();
    }
  }
}

// Check if playwright is available, otherwise skip
(async () => {
  try {
    testTurnLogicUI();
  } catch (error) {
    console.log('⚠️ Playwright not available. Please install with: npm install playwright');
    console.log('📱 Please test manually in browser:');
    console.log('1. Open http://localhost:3002 in two different browsers/tabs');
    console.log('2. Login as different users (Emma/Jocke)');
    console.log('3. Create room with one, join with other');
    console.log('4. Start game and try to select letters');
    console.log('5. Check that only ONE player can select at a time');
  }
})();