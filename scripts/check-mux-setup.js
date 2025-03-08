#!/usr/bin/env node

/**
 * This script checks your Mux setup to ensure everything is configured correctly.
 * Run this using: node scripts/check-mux-setup.js
 */

const https = require('https');
require('dotenv').config({ path: '.env.local' });

console.log('🔍 Checking Mux setup...\n');

// Check environment variables
console.log('Checking environment variables:');
const requiredVars = ['MUX_TOKEN_ID', 'MUX_TOKEN_SECRET'];
let hasAllVars = true;

requiredVars.forEach(varName => {
    if (!process.env[varName] || process.env[varName].length === 0) {
        console.error(`❌ ${varName} is missing or empty`);
        hasAllVars = false;
    } else {
        console.log(`✅ ${varName} is present`);
    }
});

if (!hasAllVars) {
    console.error('\n❌ Missing required environment variables. Check your .env.local file.');
    process.exit(1);
}

// Test Mux API access
console.log('\nTesting Mux API access:');

const options = {
    hostname: 'api.mux.com',
    port: 443,
    path: '/video/v1/assets?limit=1',
    method: 'GET',
    headers: {
        'Authorization': 'Basic ' + Buffer.from(`${process.env.MUX_TOKEN_ID}:${process.env.MUX_TOKEN_SECRET}`).toString('base64'),
        'Content-Type': 'application/json'
    }
};

const req = https.request(options, res => {
    const statusCode = res.statusCode;

    if (statusCode === 200) {
        console.log('✅ Successfully connected to Mux API');
        console.log(`✅ API response: ${statusCode} ${res.statusMessage}`);

        let data = '';
        res.on('data', chunk => {
            data += chunk;
        });

        res.on('end', () => {
            try {
                const parsedData = JSON.parse(data);
                const assetCount = parsedData.data ? parsedData.data.length : 0;
                console.log(`✅ Found ${assetCount} assets in your Mux account`);
                console.log('\n✅ Mux setup looks good! Your credentials are working correctly.');
            } catch (e) {
                console.error('❌ Error parsing API response:', e.message);
            }
        });
    } else {
        console.error(`❌ API request failed: ${statusCode} ${res.statusMessage}`);

        let errorData = '';
        res.on('data', chunk => {
            errorData += chunk;
        });

        res.on('end', () => {
            console.error('❌ Error details:', errorData);
            console.error('\n❌ Mux setup check failed. Please check your credentials.');
        });
    }
});

req.on('error', e => {
    console.error(`❌ Request error: ${e.message}`);
});

req.end(); 