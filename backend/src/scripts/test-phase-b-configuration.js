import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = 'fitnova-test-secret-must-be-at-least-32';
}

const { createApp } = await import('../app.js');
const { validateProductionEnv } = await import('../config/env.js');

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED] ${message}`);
  }
};

const sendRequest = async (baseUrl, method, pathname, headers = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
  });
  return {
    status: response.status,
    headers: response.headers,
    data: await response.text(),
  };
};

console.log('============================================');
console.log('RUNNING PHASE B: PRODUCTION CONFIGURATION TESTS');
console.log('============================================');

// -----------------------------------------------------------------
// Test 1: Angular Environment Configuration Verification
// -----------------------------------------------------------------
console.log('\n--- 1. Testing Angular Environment Configuration ---');

const envProdPath = path.resolve(__dirname, '../../../frontend/src/environments/environment.ts');
const envDevPath = path.resolve(__dirname, '../../../frontend/src/environments/environment.development.ts');
const angularJsonPath = path.resolve(__dirname, '../../../frontend/angular.json');

const prodEnvContent = fs.readFileSync(envProdPath, 'utf8');
const devEnvContent = fs.readFileSync(envDevPath, 'utf8');
const angularJsonContent = JSON.parse(fs.readFileSync(angularJsonPath, 'utf8'));

// Verify production environment does not contain localhost:5000
assert(!prodEnvContent.includes('localhost:5000'), 'Production environment.ts still contains hardcoded localhost:5000!');
assert(prodEnvContent.includes('production: true'), 'Production environment.ts does not have production: true');
assert(prodEnvContent.includes("'/api'"), 'Production environment.ts does not specify /api production endpoint');
console.log('✓ Production environment.ts uses clean production /api URL (no hardcoded localhost)');

// Verify development environment uses local backend
assert(devEnvContent.includes('production: false'), 'Development environment does not specify production: false');
assert(devEnvContent.includes('http://localhost:5000/api'), 'Development environment does not specify http://localhost:5000/api');
console.log('✓ Development environment.development.ts correctly targets http://localhost:5000/api');

// Verify angular.json fileReplacements
const devConfig = angularJsonContent.projects.frontend.architect.build.configurations.development;
assert(devConfig && Array.isArray(devConfig.fileReplacements), 'angular.json missing development fileReplacements');
const envReplacement = devConfig.fileReplacements.find(
  (r) => r.replace.includes('environment.ts') && r.with.includes('environment.development.ts')
);
assert(envReplacement, 'angular.json development fileReplacements not configured for environment.development.ts');
console.log('✓ angular.json correctly configures fileReplacements for development builds');

// -----------------------------------------------------------------
// Test 2: Production Environment Startup Validation
// -----------------------------------------------------------------
console.log('\n--- 2. Testing Production Environment Validation ---');

// 2a. Missing MONGO_URI in production
let rejectedMissingMongo = false;
try {
  validateProductionEnv({
    nodeEnv: 'production',
    mongoUri: '',
    clientUrls: ['https://fitnova.example.com'],
  });
} catch (e) {
  rejectedMissingMongo = e.message.includes('MONGO_URI is required in production');
}
assert(rejectedMissingMongo, 'Production validation failed to reject missing MONGO_URI.');
console.log('✓ Rejects missing MONGO_URI in production');

// 2b. Missing CLIENT_URL in production
let rejectedMissingClientUrl = false;
try {
  validateProductionEnv({
    nodeEnv: 'production',
    mongoUri: 'mongodb://localhost:27017/test',
    clientUrls: [],
  });
} catch (e) {
  rejectedMissingClientUrl = e.message.includes('CLIENT_URL is required in production');
}
assert(rejectedMissingClientUrl, 'Production validation failed to reject missing CLIENT_URL.');
console.log('✓ Rejects missing CLIENT_URL in production');

// 2c. Wildcard CLIENT_URL in production
let rejectedWildcard = false;
try {
  validateProductionEnv({
    nodeEnv: 'production',
    mongoUri: 'mongodb://localhost:27017/test',
    clientUrls: ['*'],
  });
} catch (e) {
  rejectedWildcard = e.message.includes('Wildcard (*) CLIENT_URL is not permitted in production');
}
assert(rejectedWildcard, 'Production validation failed to reject wildcard CLIENT_URL in production.');
console.log('✓ Rejects wildcard (*) CLIENT_URL in production');

// 2d. Invalid protocol in CLIENT_URL
let rejectedInvalidProtocol = false;
try {
  validateProductionEnv({
    nodeEnv: 'production',
    mongoUri: 'mongodb://localhost:27017/test',
    clientUrls: ['ftp://fitnova.example.com'],
  });
} catch (e) {
  rejectedInvalidProtocol = e.message.includes('must use http or https protocol');
}
assert(rejectedInvalidProtocol, 'Production validation failed to reject non-http/https protocol in CLIENT_URL.');
console.log('✓ Rejects invalid protocol in CLIENT_URL');

// 2e. Valid production configuration passes
let validProdPassed = false;
try {
  validateProductionEnv({
    nodeEnv: 'production',
    mongoUri: 'mongodb+srv://admin:pass@cluster.mongodb.net/fitnova',
    clientUrls: ['https://fitnova.example.com', 'https://admin.fitnova.example.com'],
  });
  validProdPassed = true;
} catch (e) {
  validProdPassed = false;
}
assert(validProdPassed, 'Valid production environment failed validation unexpectedly.');
console.log('✓ Accepts valid production configuration with trusted origins');

// 2f. Development / test environments bypass production-only requirements
let devBypassPassed = false;
try {
  validateProductionEnv({
    nodeEnv: 'development',
    mongoUri: '',
    clientUrls: [],
  });
  devBypassPassed = true;
} catch (e) {
  devBypassPassed = false;
}
assert(devBypassPassed, 'Development environment unexpectedly blocked by production validation.');
console.log('✓ Development and test environments remain unblocked');

// -----------------------------------------------------------------
// Test 3: Production vs Development CORS Enforcement
// -----------------------------------------------------------------
console.log('\n--- 3. Testing Production and Development CORS Enforcement ---');

// Create a production app instance with trusted origins
const prodApp = createApp({
  nodeEnv: 'production',
  clientUrl: 'https://fitnova.example.com',
  clientUrls: ['https://fitnova.example.com', 'https://app.fitnova.example.com'],
});

const devApp = createApp({
  nodeEnv: 'development',
  clientUrl: 'http://localhost:4200',
  clientUrls: ['http://localhost:4200'],
});

let prodServer;
let devServer;

try {
  await new Promise((resolve) => {
    prodServer = prodApp.listen(0, resolve);
  });
  await new Promise((resolve) => {
    devServer = devApp.listen(0, resolve);
  });

  const prodPort = prodServer.address().port;
  const devPort = devServer.address().port;
  const prodBaseUrl = `http://127.0.0.1:${prodPort}`;
  const devBaseUrl = `http://127.0.0.1:${devPort}`;

  // 3a. Production: Trusted origin is allowed
  const trustedRes = await sendRequest(prodBaseUrl, 'GET', '/api/health', {
    Origin: 'https://fitnova.example.com',
  });
  assert(
    trustedRes.headers.get('access-control-allow-origin') === 'https://fitnova.example.com',
    'Production CORS did not allow configured trusted origin.',
  );
  console.log('✓ Production CORS allows explicitly configured trusted origin');

  // 3b. Production: Second trusted origin in list is allowed
  const secondTrustedRes = await sendRequest(prodBaseUrl, 'GET', '/api/health', {
    Origin: 'https://app.fitnova.example.com',
  });
  assert(
    secondTrustedRes.headers.get('access-control-allow-origin') === 'https://app.fitnova.example.com',
    'Production CORS did not allow second configured trusted origin.',
  );
  console.log('✓ Production CORS allows multiple explicitly configured trusted origins');

  // 3c. Production: Localhost is REJECTED in production when not in CLIENT_URL
  const localhostProdRes = await sendRequest(prodBaseUrl, 'GET', '/api/health', {
    Origin: 'http://localhost:4200',
  });
  assert(
    !localhostProdRes.headers.get('access-control-allow-origin'),
    `Production CORS unexpectedly allowed localhost: ${localhostProdRes.headers.get('access-control-allow-origin')}`,
  );
  console.log('✓ Production CORS strictly rejects localhost when not configured in CLIENT_URL');

  // 3d. Production: Untrusted / malicious origin is REJECTED
  const untrustedProdRes = await sendRequest(prodBaseUrl, 'GET', '/api/health', {
    Origin: 'https://evil-hacker.com',
  });
  assert(
    !untrustedProdRes.headers.get('access-control-allow-origin'),
    'Production CORS allowed untrusted external origin!',
  );
  console.log('✓ Production CORS strictly rejects untrusted external origins');

  // 3e. Production: Preflight OPTIONS request from untrusted origin is rejected
  const optionsUntrustedRes = await sendRequest(prodBaseUrl, 'OPTIONS', '/api/auth/login', {
    Origin: 'https://evil-hacker.com',
    'Access-Control-Request-Method': 'POST',
  });
  assert(
    !optionsUntrustedRes.headers.get('access-control-allow-origin'),
    'Production preflight allowed untrusted origin!',
  );
  console.log('✓ Production CORS preflight OPTIONS rejects untrusted origins');

  // 3f. Production: Preflight OPTIONS request from trusted origin is allowed
  const optionsTrustedRes = await sendRequest(prodBaseUrl, 'OPTIONS', '/api/auth/login', {
    Origin: 'https://fitnova.example.com',
    'Access-Control-Request-Method': 'POST',
  });
  assert(
    optionsTrustedRes.headers.get('access-control-allow-origin') === 'https://fitnova.example.com',
    'Production preflight failed for trusted origin.',
  );
  assert(optionsTrustedRes.status === 204, `Expected 204 for preflight, got ${optionsTrustedRes.status}`);
  console.log('✓ Production CORS preflight OPTIONS succeeds (204) for trusted origin');

  // 3g. Development: Localhost origins work seamlessly
  const devLocalhostRes = await sendRequest(devBaseUrl, 'GET', '/api/health', {
    Origin: 'http://localhost:4200',
  });
  assert(
    devLocalhostRes.headers.get('access-control-allow-origin') === 'http://localhost:4200',
    'Development CORS failed to allow localhost:4200',
  );

  const devAltPortRes = await sendRequest(devBaseUrl, 'GET', '/api/health', {
    Origin: 'http://localhost:3000',
  });
  assert(
    devAltPortRes.headers.get('access-control-allow-origin') === 'http://localhost:3000',
    'Development CORS failed to allow alternate localhost port',
  );
  console.log('✓ Development CORS allows configured and dynamic localhost ports');

  // 3h. Development: External untrusted origins are still rejected
  const devUntrustedRes = await sendRequest(devBaseUrl, 'GET', '/api/health', {
    Origin: 'https://untrusted-domain.com',
  });
  assert(
    !devUntrustedRes.headers.get('access-control-allow-origin'),
    'Development CORS unexpectedly allowed untrusted external domain!',
  );
  console.log('✓ Development CORS still rejects untrusted external origins');

  console.log('\n============================================');
  console.log('✓ ALL PHASE B: PRODUCTION CONFIGURATION TESTS PASSED!');
  console.log('============================================');
} finally {
  if (prodServer) {
    await new Promise((resolve) => prodServer.close(resolve));
  }
  if (devServer) {
    await new Promise((resolve) => devServer.close(resolve));
  }
}
