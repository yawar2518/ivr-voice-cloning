import { getPrompts, getPromptById, approvePrompt, rejectPrompt } from './handlers';

async function runTests() {
  console.log('--- Test 1: getPrompts (all) ---');
  const all = await getPrompts();
  console.log('Count:', all.count, '| Expected: 7');

  console.log('--- Test 2: getPrompts (filter by status) ---');
  const readyOnly = await getPrompts({ status: 'ready' });
  console.log('Ready count:', readyOnly.count, '| Expected: 1');

  console.log('--- Test 3: getPromptById (valid) ---');
  const found = await getPromptById('prompt-002');
  console.log('Found:', found.text);

  console.log('--- Test 4: getPromptById (invalid) ---');
  try {
    await getPromptById('does-not-exist');
  } catch (err) {
    console.log('Correctly threw:', err.error);
  }

  console.log('--- Test 5: approvePrompt (valid transition) ---');
  const approved = await approvePrompt('prompt-002', 'approver');
  console.log('New status:', approved.status, '| Expected: approved');

  console.log('--- Test 6: approvePrompt (invalid transition) ---');
  try {
    await approvePrompt('prompt-003', 'approver'); // prompt-003 is "processing"
  } catch (err) {
    console.log('Correctly threw:', err.error, '|', err.detail);
  }

  console.log('--- Test 7: approvePrompt (wrong role) ---');
  try {
    await approvePrompt('prompt-004', 'generator'); // wrong role
  } catch (err) {
    console.log('Correctly threw:', err.error);
  }

  console.log('--- Test 8: rejectPrompt (missing reason) ---');
  try {
    await rejectPrompt('prompt-002', '', 'approver');
  } catch (err) {
    console.log('Correctly threw:', err.error);
  }
}

runTests();