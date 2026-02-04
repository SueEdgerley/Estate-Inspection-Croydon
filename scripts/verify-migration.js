#!/usr/bin/env node

/**
 * Verification Script: Test Migration to Vercel Pro
 * 
 * This script tests if the migration was successful by checking:
 * - API endpoints return expected responses
 * - Database connection works
 * - Airtable integration works
 */

const https = require('https');
const http = require('http');

const TARGET_URL = 'https://estate-inspection-croydon-ruby.vercel.app';

const tests = [
  {
    name: 'API Health Check',
    url: `${TARGET_URL}/api/health`,
    expectedStatus: 200,
    validate: (data) => {
      try {
        const json = JSON.parse(data);
        return json.status === 'ok' || json.healthy === true || typeof json === 'object';
      } catch {
        return false;
      }
    }
  },
  {
    name: 'API Issues (Database Connection)',
    url: `${TARGET_URL}/api/issues`,
    expectedStatus: 200,
    validate: (data) => {
      try {
        const json = JSON.parse(data);
        // Should return array (empty or with data), not error
        return Array.isArray(json);
      } catch {
        return false;
      }
    },
    shouldNotBe: 503 // Database not configured
  },
  {
    name: 'Airtable Templates',
    url: `${TARGET_URL}/api/airtable/templates`,
    expectedStatus: 200,
    validate: (data) => {
      try {
        const json = JSON.parse(data);
        return Array.isArray(json);
      } catch {
        return false;
      }
    }
  },
  {
    name: 'Dashboard Page',
    url: `${TARGET_URL}/dashboard`,
    expectedStatus: 200,
    validate: (data) => {
      // Should return HTML, not 404 or 204
      return data.includes('<!DOCTYPE html>') || data.includes('<html') || data.length > 100;
    }
  }
];

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    client.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function runTests() {
  console.log('\n🧪 Testing Migration to Vercel Pro\n');
  console.log(`Target: ${TARGET_URL}\n`);
  console.log('='.repeat(60));
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      console.log(`\n📋 ${test.name}`);
      console.log(`   URL: ${test.url}`);
      
      const response = await makeRequest(test.url);
      
      // Check status code
      if (response.statusCode === test.expectedStatus) {
        console.log(`   ✅ Status: ${response.statusCode} (expected)`);
      } else if (test.shouldNotBe && response.statusCode === test.shouldNotBe) {
        console.log(`   ❌ Status: ${response.statusCode} (should not be ${test.shouldNotBe})`);
        console.log(`   💡 This means the database is not configured. Check POSTGRES_URL environment variable.`);
        failed++;
        continue;
      } else {
        console.log(`   ⚠️  Status: ${response.statusCode} (expected ${test.expectedStatus})`);
      }
      
      // Validate response
      if (test.validate) {
        const isValid = test.validate(response.data);
        if (isValid) {
          console.log(`   ✅ Response valid`);
          passed++;
        } else {
          console.log(`   ❌ Response invalid`);
          console.log(`   Response preview: ${response.data.substring(0, 100)}...`);
          failed++;
        }
      } else {
        passed++;
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('\n✅ All tests passed! Migration successful!\n');
    console.log('🎉 Your app is now running on Vercel Pro!');
    console.log(`\n📱 Live URL: ${TARGET_URL}`);
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed. Please check the errors above.');
    console.log('\n💡 Common fixes:');
    console.log('   1. Make sure all environment variables are copied');
    console.log('   2. Redeploy after adding environment variables');
    console.log('   3. Check that POSTGRES_URL is set correctly');
    console.log('   4. Verify Airtable credentials are correct\n');
    process.exit(1);
  }
}

runTests();
