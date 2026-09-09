const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const token = required('PIPELINE_TELEGRAM_BOT_TOKEN');
const chatId = required('PIPELINE_TELEGRAM_ALLOWED_USER_IDS')
  .split(',')
  .map((value) => value.trim())
  .find(Boolean);
if (!chatId) throw new Error('PIPELINE_TELEGRAM_ALLOWED_USER_IDS is empty');

const workflow = required('WORKFLOW_NAME');
const conclusion = required('CONCLUSION');
const trigger = required('RUN_EVENT');
const branch = required('HEAD_BRANCH');
const runUrl = required('RUN_URL');
const text = [
  'GitHub cron failed',
  `Workflow: ${workflow}`,
  `Conclusion: ${conclusion}`,
  `Trigger/branch: ${trigger} / ${branch}`,
  runUrl,
].join('\n');

const response = await fetch(
  `https://api.telegram.org/bot${token}/sendMessage`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  },
);

if (!response.ok) {
  const detail = (await response.text()).trim().slice(0, 300);
  throw new Error(
    `Telegram cron failure alert failed (${response.status})${detail ? `: ${detail}` : ''}`,
  );
}

console.log(`Telegram cron failure alert sent for ${workflow}`);
