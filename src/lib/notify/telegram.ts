// Telegram Bot API notifier (track 5d). Credential-gated: fully no-ops until
// TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID are set, so nothing breaks without a token.
// Get a token from @BotFather; get the chat id by messaging the bot then reading
// https://api.telegram.org/bot<TOKEN>/getUpdates (or use a group/channel id).

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export function isTelegramConfigured(): boolean {
  return !!(TOKEN && CHAT_ID);
}

export async function sendTelegramMessage(
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!TOKEN || !CHAT_ID) return { ok: false, error: "not_configured" };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://api.telegram.org/bot${TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      },
    );
    clearTimeout(timeout);
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "error" };
  }
}
