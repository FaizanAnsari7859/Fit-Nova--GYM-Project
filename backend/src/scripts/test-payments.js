import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

let memoryServer;
if (!process.env.MONGO_URI) {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  memoryServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = memoryServer.getUri();
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = 'fitnova-test-secret-must-be-at-least-32';
}

const { createApp } = await import('../app.js');
const { connectDB, disconnectDB } = await import('../config/db.js');
const User = (await import('../models/user.model.js')).default;
const Membership = (await import('../models/membership.model.js')).default;
const Payment = (await import('../models/payment.model.js')).default;

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED] ${message}`);
  }
};

const api = async (baseUrl, method, pathname, { token, body } = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }
  return { status: response.status, data, raw };
};

const app = createApp();
let httpServer;

try {
  await connectDB();
  await new Promise((resolve) => {
    httpServer = app.listen(0, resolve);
  });

  const { port } = httpServer.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const stamp = Date.now();
  const password = 'Password@123';

  console.log('--- Setting up test fixtures for payments ---');

  // 1. Admin
  const admin = await User.create({
    fullName: `Admin ${stamp}`,
    email: `admin.${stamp}@fitnova.test`,
    phone: `91000${String(stamp).slice(-5)}`,
    password,
    gender: 'other',
    dateOfBirth: new Date('1990-01-01'),
    role: 'admin',
  });

  // 2. Trainer A
  const trainerA = await User.create({
    fullName: `Trainer A ${stamp}`,
    email: `trainera.${stamp}@fitnova.test`,
    phone: `92000${String(stamp).slice(-5)}`,
    password,
    gender: 'male',
    dateOfBirth: new Date('1992-02-02'),
    role: 'trainer',
  });

  // 3. Trainer B
  const trainerB = await User.create({
    fullName: `Trainer B ${stamp}`,
    email: `trainerb.${stamp}@fitnova.test`,
    phone: `93000${String(stamp).slice(-5)}`,
    password,
    gender: 'female',
    dateOfBirth: new Date('1993-03-03'),
    role: 'trainer',
  });

  // 4. Member 1 (assigned to Trainer A)
  const member1 = await User.create({
    fullName: `Member 1 ${stamp}`,
    email: `member1.${stamp}@fitnova.test`,
    phone: `94000${String(stamp).slice(-5)}`,
    password,
    gender: 'female',
    dateOfBirth: new Date('1998-04-04'),
    role: 'member',
    assignedTrainer: trainerA._id,
  });

  // 5. Member 2 (assigned to Trainer B)
  const member2 = await User.create({
    fullName: `Member 2 ${stamp}`,
    email: `member2.${stamp}@fitnova.test`,
    phone: `95000${String(stamp).slice(-5)}`,
    password,
    gender: 'male',
    dateOfBirth: new Date('1999-05-05'),
    role: 'member',
    assignedTrainer: trainerB._id,
  });

  // 6. Membership Plan
  const plan = await Membership.create({
    planName: `Plan Gold ${stamp}`,
    duration: 30,
    price: 2500,
    features: ['Access All'],
    status: 'active',
  });

  // Log in to get tokens
  const adminLogin = await api(baseUrl, 'POST', '/api/auth/login', {
    body: { email: admin.email, password },
  });
  const adminToken = adminLogin.data.token;

  const trainerALogin = await api(baseUrl, 'POST', '/api/auth/login', {
    body: { email: trainerA.email, password },
  });
  const trainerAToken = trainerALogin.data.token;

  const trainerBLogin = await api(baseUrl, 'POST', '/api/auth/login', {
    body: { email: trainerB.email, password },
  });
  const trainerBToken = trainerBLogin.data.token;

  const member1Login = await api(baseUrl, 'POST', '/api/auth/login', {
    body: { email: member1.email, password },
  });
  const member1Token = member1Login.data.token;

  const member2Login = await api(baseUrl, 'POST', '/api/auth/login', {
    body: { email: member2.email, password },
  });
  const member2Token = member2Login.data.token;

  console.log('✓ All 5 fixture users logged in and tokens acquired.');

  // TEST 1: Unauthenticated requests
  console.log('Test 1: Unauthenticated requests are rejected');
  const unauthRes = await api(baseUrl, 'GET', '/api/payments');
  assert(unauthRes.status === 401, `Expected 401 unauth, got ${unauthRes.status}`);

  // TEST 2: Member cannot create payments
  console.log('Test 2: Member cannot create payments');
  const memberCreateRes = await api(baseUrl, 'POST', '/api/payments', {
    token: member1Token,
    body: {
      member: member1._id,
      membership: plan._id,
      amount: 2500,
      paymentDate: new Date().toISOString(),
    },
  });
  assert(memberCreateRes.status === 403, `Member should get 403 on create, got ${memberCreateRes.status}`);

  // TEST 3: Trainer cannot create payments
  console.log('Test 3: Trainer cannot create payments');
  const trainerCreateRes = await api(baseUrl, 'POST', '/api/payments', {
    token: trainerAToken,
    body: {
      member: member1._id,
      membership: plan._id,
      amount: 2500,
      paymentDate: new Date().toISOString(),
    },
  });
  assert(trainerCreateRes.status === 403, `Trainer should get 403 on create, got ${trainerCreateRes.status}`);

  // TEST 4: Admin creates payment for Member 1
  console.log('Test 4: Admin creates payment for Member 1');
  const adminCreate1 = await api(baseUrl, 'POST', '/api/payments', {
    token: adminToken,
    body: {
      member: member1._id,
      membership: plan._id,
      amount: 2500,
      paymentStatus: 'paid',
      paymentDate: '2026-05-10T10:00:00.000Z',
      receiptUrl: 'https://fitnova.test/receipts/rec1.pdf',
    },
  });
  assert(adminCreate1.status === 201, `Admin create payment 1 failed: ${adminCreate1.raw}`);
  const payment1 = adminCreate1.data.data;
  assert(payment1.amount === 2500, 'Payment amount mismatch');
  assert(payment1.paymentStatus === 'paid', 'Payment status mismatch');

  // TEST 5: Admin creates payment for Member 2
  console.log('Test 5: Admin creates payment for Member 2');
  const adminCreate2 = await api(baseUrl, 'POST', '/api/payments', {
    token: adminToken,
    body: {
      member: member2._id,
      membership: plan._id,
      amount: 1500,
      paymentStatus: 'pending',
      paymentDate: '2026-05-15T12:00:00.000Z',
    },
  });
  assert(adminCreate2.status === 201, `Admin create payment 2 failed: ${adminCreate2.raw}`);
  const payment2 = adminCreate2.data.data;

  // TEST 6: Admin can list all payments (should see both)
  console.log('Test 6: Admin can list all payments');
  const adminList = await api(baseUrl, 'GET', '/api/payments', { token: adminToken });
  assert(adminList.status === 200, `Admin list failed: ${adminList.raw}`);
  assert(adminList.data.total >= 2, 'Admin should see at least 2 payments');

  // TEST 7: Trainer A can see Member 1 payments (assigned), but NOT Member 2
  console.log('Test 7: Trainer A data isolation');
  const trainerAList = await api(baseUrl, 'GET', '/api/payments', { token: trainerAToken });
  assert(trainerAList.status === 200, `Trainer A list failed: ${trainerAList.raw}`);
  const trainerAPaymentIds = trainerAList.data.data.map((p) => p._id);
  assert(trainerAPaymentIds.includes(payment1._id), 'Trainer A should see payment1 for assigned Member 1');
  assert(!trainerAPaymentIds.includes(payment2._id), 'Trainer A must NOT see payment2 for unassigned Member 2');

  // Direct fetch of unassigned payment by Trainer A
  const trainerAFetchUnassigned = await api(baseUrl, 'GET', `/api/payments/${payment2._id}`, { token: trainerAToken });
  assert(trainerAFetchUnassigned.status === 404, `Trainer A should get 404 on unassigned payment, got ${trainerAFetchUnassigned.status}`);

  // TEST 8: Member 1 can only see own payment, NOT Member 2
  console.log('Test 8: Member isolation');
  const member1List = await api(baseUrl, 'GET', '/api/payments', { token: member1Token });
  assert(member1List.status === 200, `Member 1 list failed: ${member1List.raw}`);
  const member1PaymentIds = member1List.data.data.map((p) => p._id);
  assert(member1PaymentIds.includes(payment1._id), 'Member 1 should see own payment');
  assert(!member1PaymentIds.includes(payment2._id), 'Member 1 must NOT see payment for Member 2');

  // Member 1 direct fetch of Member 2 payment
  const member1FetchOther = await api(baseUrl, 'GET', `/api/payments/${payment2._id}`, { token: member1Token });
  assert(member1FetchOther.status === 404, `Member 1 should get 404 for another member payment, got ${member1FetchOther.status}`);

  // TEST 9: Member cannot update payments
  console.log('Test 9: Member cannot update payments');
  const memberUpdateRes = await api(baseUrl, 'PATCH', `/api/payments/${payment1._id}`, {
    token: member1Token,
    body: { paymentStatus: 'failed' },
  });
  assert(memberUpdateRes.status === 403, `Member update should be 403, got ${memberUpdateRes.status}`);

  // TEST 10: Trainer can update status of assigned member payment
  console.log('Test 10: Trainer updates status of assigned member payment');
  const trainerUpdateRes = await api(baseUrl, 'PATCH', `/api/payments/${payment1._id}`, {
    token: trainerAToken,
    body: { paymentStatus: 'pending' },
  });
  assert(trainerUpdateRes.status === 200, `Trainer status update failed: ${trainerUpdateRes.raw}`);
  assert(trainerUpdateRes.data.data.paymentStatus === 'pending', 'Status was not updated to pending');

  // TEST 11: Trainer CANNOT modify other fields like amount
  console.log('Test 11: Trainer cannot modify restricted fields');
  const trainerTamperRes = await api(baseUrl, 'PATCH', `/api/payments/${payment1._id}`, {
    token: trainerAToken,
    body: { amount: 50 },
  });
  assert(trainerTamperRes.status === 403, `Trainer modifying amount should be 403, got ${trainerTamperRes.status}`);

  // TEST 12: Filters for status, date range, and member
  console.log('Test 12: Filters (status, member, dates)');
  const filterPending = await api(baseUrl, 'GET', '/api/payments?status=pending', { token: adminToken });
  assert(filterPending.status === 200 && filterPending.data.data.every((p) => p.paymentStatus === 'pending'), 'Filter status=pending failed');

  const filterMember = await api(baseUrl, 'GET', `/api/payments?member=${member2._id}`, { token: adminToken });
  assert(filterMember.status === 200 && filterMember.data.data.every((p) => p.member._id === member2._id.toString()), 'Filter member failed');

  // Invalid filters
  const badStatus = await api(baseUrl, 'GET', '/api/payments?status=bogus', { token: adminToken });
  assert(badStatus.status === 400, 'Bogus status filter should return 400');

  const badDate = await api(baseUrl, 'GET', '/api/payments?startDate=not-a-date', { token: adminToken });
  assert(badDate.status === 400, 'Invalid startDate should return 400');

  // TEST 13: Receipt endpoint
  console.log('Test 13: Receipt endpoint');
  const receipt1 = await api(baseUrl, 'GET', `/api/payments/${payment1._id}/receipt`, { token: member1Token });
  assert(receipt1.status === 200, `Receipt fetch failed: ${receipt1.raw}`);
  assert(receipt1.data.data.receiptUrl === 'https://fitnova.test/receipts/rec1.pdf', 'Receipt URL mismatch');

  // Payment 2 has no receipt
  const receipt2 = await api(baseUrl, 'GET', `/api/payments/${payment2._id}/receipt`, { token: adminToken });
  assert(receipt2.status === 404, `Payment without receipt should return 404, got ${receipt2.status}`);

  // TEST 14: Member cannot delete payments, Admin can delete
  console.log('Test 14: Deletion permissions');
  const memberDelete = await api(baseUrl, 'DELETE', `/api/payments/${payment2._id}`, { token: member1Token });
  assert(memberDelete.status === 403, `Member delete should be 403, got ${memberDelete.status}`);

  const trainerDelete = await api(baseUrl, 'DELETE', `/api/payments/${payment2._id}`, { token: trainerAToken });
  assert(trainerDelete.status === 403, `Trainer delete should be 403, got ${trainerDelete.status}`);

  const adminDelete = await api(baseUrl, 'DELETE', `/api/payments/${payment2._id}`, { token: adminToken });
  assert(adminDelete.status === 200, `Admin delete failed: ${adminDelete.raw}`);

  // TEST 15: Receipt generation for paid payment without pre-existing receipt document (old records)
  console.log('Test 15: Auto-generated receipt for paid payment (including old records without receipt document)');
  const adminCreatePaid = await api(baseUrl, 'POST', '/api/payments', {
    token: adminToken,
    body: {
      member: member1._id,
      membership: plan._id,
      amount: 3500,
      paymentStatus: 'paid',
      paymentDate: '2026-06-01T10:00:00.000Z',
    },
  });
  assert(adminCreatePaid.status === 201, `Create paid payment failed: ${adminCreatePaid.raw}`);
  const paidPayment = adminCreatePaid.data.data;

  // Fetch structured receipt details
  const paidReceipt = await api(baseUrl, 'GET', `/api/payments/${paidPayment._id}/receipt`, { token: member1Token });
  assert(paidReceipt.status === 200, `Receipt fetch failed: ${paidReceipt.raw}`);
  assert(paidReceipt.data.data.receiptUrl.includes(`/api/payments/${paidPayment._id}/receipt/download`), 'Receipt URL should point to download endpoint');
  assert(paidReceipt.data.data.transactionReference === paidPayment.transactionReference, 'Transaction reference mismatch');
  assert(paidReceipt.data.data.amount === 3500, 'Amount mismatch');
  assert(paidReceipt.data.data.paymentStatus === 'paid', 'Status mismatch');
  assert(paidReceipt.data.data.member.fullName === member1.fullName, 'Member name mismatch');
  assert(paidReceipt.data.data.membership.planName === plan.planName, 'Plan name mismatch');

  // TEST 16: Printable and downloadable HTML receipt endpoint
  console.log('Test 16: Printable/Downloadable HTML receipt document endpoint');
  const htmlReceipt = await api(baseUrl, 'GET', `/api/payments/${paidPayment._id}/receipt/download`, { token: member1Token });
  assert(htmlReceipt.status === 200, `HTML receipt fetch failed: ${htmlReceipt.raw}`);
  assert(htmlReceipt.raw.includes('FITNOVA'), 'HTML receipt should contain FITNOVA header');
  assert(htmlReceipt.raw.includes(paidPayment.transactionReference), 'HTML receipt should contain transaction reference');
  assert(htmlReceipt.raw.includes(member1.fullName), 'HTML receipt should contain member full name');
  assert(htmlReceipt.raw.includes(plan.planName), 'HTML receipt should contain membership plan name');
  assert(htmlReceipt.raw.includes('PAID'), 'HTML receipt should contain PAID status badge');

  // Download attachment parameter
  const downloadReceipt = await api(baseUrl, 'GET', `/api/payments/${paidPayment._id}/receipt/download?download=true`, { token: member1Token });
  assert(downloadReceipt.status === 200, `Download receipt fetch failed: ${downloadReceipt.raw}`);

  // Unauthorized member cannot access another member's receipt
  const unauthReceipt = await api(baseUrl, 'GET', `/api/payments/${paidPayment._id}/receipt`, { token: member2Token });
  assert(unauthReceipt.status === 404, `Unauthorized receipt access should return 404, got ${unauthReceipt.status}`);

  // Pending payment cannot generate/download receipt
  const pendingReceiptDownload = await api(baseUrl, 'GET', `/api/payments/${payment1._id}/receipt/download`, { token: member1Token });
  assert(pendingReceiptDownload.status === 404, `Pending payment should not be downloadable as receipt, got ${pendingReceiptDownload.status}`);

  console.log('============================================');
  console.log('✓ ALL 16 DEDICATED PAYMENT & RECEIPT BACKEND TESTS PASSED!');
  console.log('============================================');
} catch (error) {
  console.error('[TEST FAILURE]:', error.message);
  process.exitCode = 1;
} finally {
  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
  }
  await disconnectDB();
  if (memoryServer) {
    await memoryServer.stop();
  }
}

