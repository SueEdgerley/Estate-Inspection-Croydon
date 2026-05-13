#!/usr/bin/env node

/**
 * Migration Script: Estate Inspection App to Vercel Pro
 * 
 * This script helps you migrate from:
 * - Source: estate-inspection-croydon (Estate Inspections team)
 * - Target: estate-inspection-croydon (Photobook team - Pro account)
 * 
 * Project IDs:
 * - Source: prj_yEGY4csDmGZZXFPlzQxpmbjIHdqu
 * - Target: prj_ByBfAyjIonpncicyBjnR0GimtqVZ
 */

const fs = require('fs');
const path = require('path');

// Environment variables that need to be migrated
const REQUIRED_ENV_VARS = {
  // Database (Neon Postgres)
  database: [
    'POSTGRES_URL',
    'POSTGRES_PRISMA_URL',
    'POSTGRES_URL_NON_POOLING',
    'POSTGRES_USER',
    'POSTGRES_HOST',
    'POSTGRES_PASSWORD',
    'POSTGRES_DATABASE',
    'PGHOST',
    'PGDATABASE',
    'PGUSER',
    'PGPASSWORD',
    'PGHOST_UNPOOLED',
    'NEON_PROJECT_ID',
    'DATABASE_URL',
    'DATABASE_URL_UNPOOLED',
    'POSTGRES_URL_NO_SSL'
  ],
  
  // Airtable
  airtable: [
    'AIRTABLE_BASE_ID',
    'AIRTABLE_API_KEY'
  ],
  
  // Email (optional)
  email: [
    'REPAIRS_EMAIL',
    'GROUNDS_EMAIL',
    'CLEANING_EMAIL',
    'ASB_EMAIL',
    'HEALTH_SAFETY_EMAIL',
    'FIRE_SAFETY_EMAIL',
    'PEST_CONTROL_EMAIL',
    'OTHER_EMAIL'
  ],
  
  // Storage (optional)
  storage: [
    'BLOB_READ_WRITE_TOKEN'
  ]
};

// Project information
const PROJECTS = {
  source: {
    id: 'prj_yEGY4csDmGZZXFPlzQxpmbjIHdqu',
    name: 'estate-inspection-croydon',
    team: 'Estate Inspections',
    teamId: 'team_9iH40mPNHYCxFCm3EFCIqGue',
    url: 'https://vercel.com/estate-inspections/estate-inspection-croydon',
    envUrl: 'https://vercel.com/estate-inspections/estate-inspection-croydon/settings/environment-variables'
  },
  target: {
    id: 'prj_ByBfAyjIonpncicyBjnR0GimtqVZ',
    name: 'estate-inspection-croydon',
    team: 'Photobook',
    teamId: 'team_eNY9pJaMSqa49ljaustIWNMF',
    url: 'https://vercel.com/photobook-73dad537/estate-inspection-croydon',
    envUrl: 'https://vercel.com/photobook-73dad537/estate-inspection-croydon/settings/environment-variables',
    deploymentUrl: 'https://estate-inspection-croydon-6g6ns81dx-photobook-73dad537.vercel.app'
  }
};

function generateMigrationChecklist() {
  const allVars = [
    ...REQUIRED_ENV_VARS.database,
    ...REQUIRED_ENV_VARS.airtable,
    ...REQUIRED_ENV_VARS.email,
    ...REQUIRED_ENV_VARS.storage
  ];

  let checklist = `# Migration Checklist\n\n`;
  checklist += `## Source Project\n`;
  checklist += `- **Name**: ${PROJECTS.source.name}\n`;
  checklist += `- **Team**: ${PROJECTS.source.team}\n`;
  checklist += `- **Environment Variables**: ${PROJECTS.source.envUrl}\n\n`;
  
  checklist += `## Target Project (Pro Account)\n`;
  checklist += `- **Name**: ${PROJECTS.target.name}\n`;
  checklist += `- **Team**: ${PROJECTS.target.team}\n`;
  checklist += `- **Environment Variables**: ${PROJECTS.target.envUrl}\n`;
  checklist += `- **Deployment URL**: ${PROJECTS.target.deploymentUrl}\n\n`;
  
  checklist += `## Step 1: Copy Environment Variables\n\n`;
  checklist += `Go to: ${PROJECTS.source.envUrl}\n\n`;
  checklist += `Copy each variable below to: ${PROJECTS.target.envUrl}\n\n`;
  
  // Database variables
  checklist += `### Database Variables (Required)\n\n`;
  REQUIRED_ENV_VARS.database.forEach(varName => {
    checklist += `- [ ] \`${varName}\`\n`;
  });
  checklist += `\n`;
  
  // Airtable variables
  checklist += `### Airtable Variables (Required)\n\n`;
  REQUIRED_ENV_VARS.airtable.forEach(varName => {
    checklist += `- [ ] \`${varName}\`\n`;
  });
  checklist += `\n`;
  
  // Email variables (optional)
  checklist += `### Email Variables (Optional)\n\n`;
  REQUIRED_ENV_VARS.email.forEach(varName => {
    checklist += `- [ ] \`${varName}\` (if exists)\n`;
  });
  checklist += `\n`;
  
  // Storage variables (optional)
  checklist += `### Storage Variables (Optional)\n\n`;
  REQUIRED_ENV_VARS.storage.forEach(varName => {
    checklist += `- [ ] \`${varName}\` (if exists)\n`;
  });
  checklist += `\n`;
  
  checklist += `## Step 2: Verify GitHub Connection\n\n`;
  checklist += `- [ ] Target project is connected to: \`Estate-Inspection-Croydon\` repository\n`;
  checklist += `- [ ] Branch: \`main\`\n\n`;
  
  checklist += `## Step 3: Redeploy\n\n`;
  checklist += `- [ ] Go to: ${PROJECTS.target.url}/deployments\n`;
  checklist += `- [ ] Click "Redeploy" on latest deployment\n`;
  checklist += `- [ ] Wait for deployment to complete\n\n`;
  
  checklist += `## Step 4: Test Migration\n\n`;
  checklist += `Run the verification script:\n`;
  checklist += `\`\`\`bash\n`;
  checklist += `node scripts/verify-migration.js\n`;
  checklist += `\`\`\`\n\n`;
  
  checklist += `Or test manually:\n`;
  checklist += `- [ ] Dashboard: ${PROJECTS.target.deploymentUrl}/dashboard\n`;
  checklist += `- [ ] API Health: ${PROJECTS.target.deploymentUrl}/api/health\n`;
  checklist += `- [ ] API Issues: ${PROJECTS.target.deploymentUrl}/api/issues (should return [] not 503)\n`;
  checklist += `- [ ] Airtable Templates: ${PROJECTS.target.deploymentUrl}/api/airtable/templates\n`;
  checklist += `- [ ] New Inspection Form: ${PROJECTS.target.deploymentUrl}/inspections/new\n\n`;
  
  checklist += `## Important Notes\n\n`;
  checklist += `1. **Same Database**: Use the same Neon \`POSTGRES_URL\` to keep all existing data\n`;
  checklist += `2. **All Environments**: Make sure variables are enabled for Production, Preview, and Development\n`;
  checklist += `3. **Redeploy Required**: After adding variables, you must redeploy for them to take effect\n`;
  checklist += `4. **Code Already There**: Since both projects use the same GitHub repo, code is already deployed\n\n`;
  
  return checklist;
}

function generateVerificationScript() {
  return `#!/usr/bin/env node

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

const TARGET_URL = '${PROJECTS.target.deploymentUrl}';

const tests = [
  {
    name: 'API Health Check',
    url: \`\${TARGET_URL}/api/health\`,
    expectedStatus: 200,
    validate: (data) => {
      try {
        const json = JSON.parse(data);
        return json.status === 'ok' || json.healthy === true;
      } catch {
        return false;
      }
    }
  },
  {
    name: 'API Issues (Database Connection)',
    url: \`\${TARGET_URL}/api/issues\`,
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
    url: \`\${TARGET_URL}/api/airtable/templates\`,
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
    url: \`\${TARGET_URL}/dashboard\`,
    expectedStatus: 200,
    validate: (data) => {
      // Should return HTML, not 404 or 204
      return data.includes('<!DOCTYPE html>') || data.includes('<html');
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
  console.log('\\n🧪 Testing Migration to Vercel Pro\\n');
  console.log(\`Target: \${TARGET_URL}\\n\`);
  console.log('='.repeat(60));
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      console.log(\`\\n📋 \${test.name}\`);
      console.log(\`   URL: \${test.url}\`);
      
      const response = await makeRequest(test.url);
      
      // Check status code
      if (response.statusCode === test.expectedStatus) {
        console.log(\`   ✅ Status: \${response.statusCode} (expected)\`);
      } else if (test.shouldNotBe && response.statusCode === test.shouldNotBe) {
        console.log(\`   ❌ Status: \${response.statusCode} (should not be \${test.shouldNotBe})\`);
        failed++;
        continue;
      } else {
        console.log(\`   ⚠️  Status: \${response.statusCode} (expected \${test.expectedStatus})\`);
      }
      
      // Validate response
      if (test.validate) {
        const isValid = test.validate(response.data);
        if (isValid) {
          console.log(\`   ✅ Response valid\`);
          passed++;
        } else {
          console.log(\`   ❌ Response invalid\`);
          failed++;
        }
      } else {
        passed++;
      }
      
    } catch (error) {
      console.log(\`   ❌ Error: \${error.message}\`);
      failed++;
    }
  }
  
  console.log('\\n' + '='.repeat(60));
  console.log(\`\\n📊 Results: \${passed} passed, \${failed} failed\`);
  
  if (failed === 0) {
    console.log('\\n✅ All tests passed! Migration successful!\\n');
    process.exit(0);
  } else {
    console.log('\\n❌ Some tests failed. Please check the errors above.\\n');
    process.exit(1);
  }
}

runTests();
`;
}

// Main execution
console.log('🚀 Generating migration files...\n');

// Create scripts directory if it doesn't exist
const scriptsDir = path.join(process.cwd(), 'scripts');
if (!fs.existsSync(scriptsDir)) {
  fs.mkdirSync(scriptsDir, { recursive: true });
}

// Generate checklist
const checklist = generateMigrationChecklist();
fs.writeFileSync(
  path.join(process.cwd(), 'MIGRATION_CHECKLIST.md'),
  checklist
);

// Generate verification script
const verificationScript = generateVerificationScript();
fs.writeFileSync(
  path.join(scriptsDir, 'verify-migration.js'),
  verificationScript
);

// Make verification script executable (Unix)
if (process.platform !== 'win32') {
  fs.chmodSync(path.join(scriptsDir, 'verify-migration.js'), '755');
}

console.log('✅ Generated files:');
console.log('   - MIGRATION_CHECKLIST.md');
console.log('   - scripts/verify-migration.js\n');
console.log('📋 Next steps:');
console.log('   1. Open MIGRATION_CHECKLIST.md');
console.log('   2. Follow the checklist to copy environment variables');
console.log('   3. After migration, run: node scripts/verify-migration.js\n');
