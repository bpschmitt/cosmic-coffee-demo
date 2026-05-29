const { chromium } = require('playwright');

const HOST = process.env.BROWSER_HOST || 'http://coffee-frontend:80';
const USERS = parseInt(process.env.BROWSER_USERS || '3', 10);
const THINK_TIME_MS = parseInt(process.env.THINK_TIME_MS || '3000', 10);

const FAKE_NAMES = [
  'Alice Chen', 'Bob Martinez', 'Carol Singh', 'David Kim', 'Eva Patel',
  'Frank Lee', 'Grace Liu', 'Henry Brown', 'Isabel Torres', 'James Wilson',
];
const FAKE_EMAILS = [
  'alice@example.com', 'bob@example.com', 'carol@example.com', 'david@example.com',
  'eva@example.com', 'frank@example.com', 'grace@example.com', 'henry@example.com',
  'isabel@example.com', 'james@example.com',
];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runUserJourney(browser, userId) {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. Load the homepage and wait for the NR Browser agent to initialize
    // before interacting — ensures XHR/fetch are wrapped for distributed tracing
    await page.goto(HOST, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForFunction(() => window.newrelic && typeof window.newrelic.interaction === 'function', {
      timeout: 10000,
    }).catch(() => {});
    await sleep(THINK_TIME_MS);

    // 2. Browse products — wait for product cards to appear
    await page.waitForSelector('[data-testid="product-card"], .product-card, .product-item, img[alt]', {
      timeout: 15000,
    }).catch(() => {});
    await sleep(THINK_TIME_MS);

    // 3. Add 1–3 random products to cart by clicking Add to Cart buttons
    const addButtons = await page.$$('button:has-text("Add to Cart"), button:has-text("Add"), [data-testid="add-to-cart"]');
    if (addButtons.length === 0) {
      console.log(`[user-${userId}] No add-to-cart buttons found, skipping order`);
      return;
    }

    const numToAdd = Math.min(Math.floor(Math.random() * 3) + 1, addButtons.length);
    const shuffled = addButtons.sort(() => Math.random() - 0.5).slice(0, numToAdd);
    for (const btn of shuffled) {
      await btn.click().catch(() => {});
      await sleep(500);
    }
    await sleep(THINK_TIME_MS);

    // 4. Navigate to cart / checkout
    const cartLink = page.locator('a[href*="cart"], button:has-text("Cart"), [data-testid="cart"], a:has-text("Checkout")').first();
    if (await cartLink.count() > 0) {
      await cartLink.click();
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await sleep(THINK_TIME_MS);
    }

    // 5. Fill checkout form if present
    const nameInput = page.locator('input[name="name"], input[placeholder*="name" i], input[id*="name" i]').first();
    const emailInput = page.locator('input[name="email"], input[type="email"], input[placeholder*="email" i]').first();

    if (await nameInput.count() > 0) {
      await nameInput.fill(randomItem(FAKE_NAMES));
    }
    if (await emailInput.count() > 0) {
      await emailInput.fill(randomItem(FAKE_EMAILS));
    }

    // 6. Submit checkout
    const submitBtn = page.locator('button[type="submit"], button:has-text("Place Order"), button:has-text("Checkout"), button:has-text("Pay")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      console.log(`[user-${userId}] Order placed`);
    }

    await sleep(THINK_TIME_MS);
  } catch (err) {
    console.error(`[user-${userId}] Journey error: ${err.message}`);
  } finally {
    await context.close();
  }
}

async function runWorker(browserId) {
  const browser = await chromium.launch({
    headless: !process.env.DISPLAY,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  console.log(`[worker-${browserId}] started → ${HOST}`);

  // Run journeys in a continuous loop with a short gap between each
  while (true) {
    await runUserJourney(browser, browserId);
    await sleep(1000 + Math.random() * 2000);
  }
}

async function main() {
  console.log(`Starting browser loadgen: ${USERS} concurrent users → ${HOST}`);
  const workers = [];
  for (let i = 0; i < USERS; i++) {
    // Stagger starts so they don't all hit the server at once
    await sleep(i * 1500);
    workers.push(runWorker(i));
  }
  await Promise.all(workers);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
