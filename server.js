// ============================================================
// MAKA YANGE - My Land USSD System
// Run: npm install express body-parser && node server.js
// ============================================================

const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(__dirname));

const DB_FILE = './claims.json';

// ---- Helper: load and save claims ----
function loadClaims() {
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]');
  return JSON.parse(fs.readFileSync(DB_FILE));
}

function saveClaim(claim) {
  const claims = loadClaims();
  claims.push(claim);
  fs.writeFileSync(DB_FILE, JSON.stringify(claims, null, 2));
  return claim;
}

function generateCode() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `MAKA-${date}-${rand}`;
}

// ---- USSD Webhook (Africa's Talking format) ----
app.post('/ussd', (req, res) => {
  const { sessionId, phoneNumber, text } = req.body;
  const parts = text ? text.split('*') : [''];
  const step = parts.length;
  let response = '';

  // Step 1: Main menu
  if (text === '') {
    response =
      'CON Welcome to Maka Yange (My Land)\n' +
      '1. Register my land\n' +
      '2. Check claim status\n' +
      '3. Help';
  }

  // ---- REGISTER LAND FLOW ----
  else if (text === '1') {
    response =
      'CON Enter your GPS location OR nearest landmark:\n' +
      '(Example: near Gulu Main Market)';
  }

  else if (step === 2 && parts[0] === '1') {
    response = 'CON Enter Witness 1 phone number:\n(Example: 0771234567)';
  }

  else if (step === 3 && parts[0] === '1') {
    response = 'CON Enter Witness 2 phone number:\n(Example: 0781234567)';
  }

  else if (step === 4 && parts[0] === '1') {
    // All data collected - save the claim
    const location = parts[1];
    const witness1 = parts[2];
    const witness2 = parts[3];
    const claimCode = generateCode();
    const timestamp = new Date().toISOString();

    const claim = {
      claimCode,
      farmerPhone: phoneNumber,
      timestamp,
      location,
      witness1,
      witness2,
      witness1Response: 'pending',
      witness2Response: 'pending',
    };

    saveClaim(claim);

    // Simulate SMS to witnesses (log to console)
    console.log(`\n[SMS to ${witness1}]: "Do you confirm that ${phoneNumber} owns land near ${location}? Reply YES or NO. Ref: ${claimCode}"`);
    console.log(`[SMS to ${witness2}]: "Do you confirm that ${phoneNumber} owns land near ${location}? Reply YES or NO. Ref: ${claimCode}"`);

    response =
      `END Land claim registered!\n` +
      `Your code: ${claimCode}\n` +
      `SMS sent to your witnesses.\n` +
      `Show this code in any LC court.`;
  }

  // ---- CHECK STATUS FLOW ----
  else if (text === '2') {
    response = 'CON Enter your claim code:\n(Example: MAKA-20260524-1234)';
  }

  else if (step === 2 && parts[0] === '2') {
    const code = parts[1].trim().toUpperCase();
    const claims = loadClaims();
    const found = claims.find(c => c.claimCode === code);

    if (found) {
      const date = new Date(found.timestamp).toLocaleDateString('en-UG');
      response =
        `END Claim found!\n` +
        `Date: ${date}\n` +
        `Location: ${found.location}\n` +
        `Witness 1: ${found.witness1} (${found.witness1Response})\n` +
        `Witness 2: ${found.witness2} (${found.witness2Response})`;
    } else {
      response = 'END Claim code not found.\nDial again to register your land.';
    }
  }

  // ---- HELP ----
  else if (text === '3') {
    response =
      'END Maka Yange Help:\n' +
      'Register your land boundary with 2 witnesses.\n' +
      'You receive a claim code by SMS.\n' +
      'Use this code in LC courts as evidence.\n' +
      'Questions? Call 0800-MAKALAND';
  }

  // ---- FALLBACK ----
  else {
    response = 'END Invalid option.\nDial again to start over.';
  }

  res.set('Content-Type', 'text/plain');
  res.send(response);
});

// ---- Witness SMS reply (simulated) ----
// In production: Africa's Talking sends POST here when witness replies
app.post('/sms-reply', (req, res) => {
  const { from, text } = req.body;
  const parts = text.trim().toUpperCase().split(' ');
  const reply = parts[0]; // YES or NO
  const code = parts[1];  // e.g. MAKA-20260524-1234

  if (!code || !reply) return res.json({ status: 'error', message: 'Invalid format' });

  const claims = loadClaims();
  const idx = claims.findIndex(c => c.claimCode === code);

  if (idx === -1) return res.json({ status: 'error', message: 'Claim not found' });

  // Match witness phone number to update the right witness
  if (claims[idx].witness1 === from) {
    claims[idx].witness1Response = reply === 'YES' ? 'confirmed' : 'denied';
  } else if (claims[idx].witness2 === from) {
    claims[idx].witness2Response = reply === 'YES' ? 'confirmed' : 'denied';
  }

  fs.writeFileSync(DB_FILE, JSON.stringify(claims, null, 2));
  console.log(`[Witness ${from} replied ${reply} to claim ${code}]`);
  res.json({ status: 'ok' });
});

// ---- Admin API ----
app.get('/api/claims', (req, res) => {
  res.json(loadClaims());
});

// ---- Admin panel (served from public/index.html) ----
// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\nMaka Yange server running on http://localhost:${PORT}`);
  console.log(`Admin panel:  http://localhost:${PORT}`);
  console.log(`USSD webhook: POST http://localhost:${PORT}/ussd`);
  console.log(`SMS reply:    POST http://localhost:${PORT}/sms-reply`);
  console.log('\nSet Africa\'s Talking callback URL to: http://YOUR_IP:3000/ussd\n');
});
