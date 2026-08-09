// SMTP email notifier (track 5d) via nodemailer. Credential-gated: fully no-ops
// until SMTP_HOST + SMTP_USER + SMTP_PASS (+ a recipient) are set. Server-only —
// never import from client code (uses node:net / node:tls).

import nodemailer from "nodemailer";

const HOST = process.env.SMTP_HOST;
const PORT = Number(process.env.SMTP_PORT ?? "587");
const USER = process.env.SMTP_USER;
const PASS = process.env.SMTP_PASS;
const FROM = process.env.SMTP_FROM ?? USER;
// Comma-separated recipient list; defaults to sending to yourself (FROM).
const TO = process.env.NOTIFY_EMAIL_TO ?? FROM;

export function isEmailConfigured(): boolean {
  return !!(HOST && USER && PASS && TO);
}

export async function sendEmail(input: {
  subject: string;
  html: string;
  text: string;
  // Override recipient (e.g. a registrant's own address). Defaults to the
  // configured admin recipient (NOTIFY_EMAIL_TO / FROM).
  to?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isEmailConfigured()) return { ok: false, error: "not_configured" };
  const recipient = input.to ?? TO;
  if (!recipient) return { ok: false, error: "no_recipient" };
  try {
    const transport = nodemailer.createTransport({
      host: HOST,
      port: PORT,
      secure: PORT === 465, // implicit TLS on 465; STARTTLS otherwise
      auth: { user: USER, pass: PASS },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 8000,
    });
    await transport.sendMail({
      from: FROM,
      to: recipient,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "error" };
  }
}
