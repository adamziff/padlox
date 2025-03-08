#!/usr/bin/env node

/**
 * This script tests the Mux API directly to create an upload URL.
 * Run this using: node scripts/test-mux-upload.js
 */

const https = require('https');
require('dotenv').config({ path: '.env.local' });

// Check environment variables
console.log('Checking Mux credentials:');
const muxTokenId = process.env.MUX_TOKEN_ID;
const muxTokenSecret = process.env.MUX_TOKEN_SECRET;

if (!muxTokenId || !muxTokenSecret) {
    console.error('❌ Missing Mux credentials in .env.local file');
    process.exit(1);
}

console.log('✅ Found Mux credentials');

// Create the request payload - using a string, not an array, for playback_policy
const payload = JSON.stringify({
    cors_origin: 'http://localhost:3000',
    new_asset_settings: {
        playback_policy: 'signed' // This should be a string, not an array
    }
});

console.log('\nSending request to Mux API:');
console.log(payload);

// Set up the request options
const options = {
    hostname: 'api.mux.com',
    port: 443,
    path: '/video/v1/uploads',
    method: 'POST',
    headers: {
        'Authorization': 'Basic ' + Buffer.from(`${muxTokenId}:${muxTokenSecret}`).toString('base64'),
        'Content-Type': 'application/json',
        'Content-Length': payload.length
    }
};

// Make the request
const req = https.request(options, (res) => {
    console.log(`\nResponse status: ${res.statusCode} ${res.statusMessage}`);

    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            // Check for successful status codes (both 200 OK and 201 Created are valid)
            if (res.statusCode === 200 || res.statusCode === 201) {
                const response = JSON.parse(data);
                console.log('\n✅ Successfully created upload URL:');
                console.log(JSON.stringify(response, null, 2));
                console.log('\nUpload URL:', response.data.url);
                console.log('Asset ID:', response.data.asset_id || response.data.id || 'N/A');
                if (response.data.new_asset_settings?.playback_ids?.[0]?.id) {
                    console.log('Playback ID:', response.data.new_asset_settings.playback_ids[0].id);
                }
            } else {
                console.error('\n❌ Failed to create upload URL:');
                console.error(data);
            }
        } catch (error) {
            console.error('\n❌ Error parsing response:', error);
            console.error('Raw response:', data);
        }
    });
});

req.on('error', (error) => {
    console.error('\n❌ Request error:', error);
});

// Send the request
req.write(payload);
req.end();

console.log('\nRequest sent, waiting for response...'); 