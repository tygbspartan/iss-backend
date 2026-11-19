import nodemailer, { Transporter } from "nodemailer";
import { config } from "../config/env.config";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string; // plain-text version for clients that don't render HTML
  replyTo?: string;
}

// Created on first use so the app starts fine without SMTP settings.
let transporter: Transporter | null = null;

const getTransporter = (): Transporter => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465, // 465 = TLS from the start; 587 upgrades via STARTTLS
      auth: { user: config.smtp.user, pass: config.smtp.pass },
      // Don't let a slow or unreachable mail server hang forever.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return transporter;
};

export const EmailService = {
  /**
   * Send an email. Never throws: email is a side effect, so a mail-server
   * problem must not fail the request that triggered it. Returns whether the
   * message was accepted by the SMTP server.
   */
  async send({ to, subject, html, text, replyTo }: EmailOptions): Promise<boolean> {
    if (!config.smtp.enabled) return false;
    try {
      await getTransporter().sendMail({ from: config.smtp.from, to, subject, html, text, replyTo });
      return true;
    } catch (error) {
      console.error(`❌ Email to ${to} failed ("${subject}"):`, (error as Error).message);
      return false;
    }
  },

  /** Startup check: logs whether the SMTP login works. Never throws. */
  async verify(): Promise<void> {
    if (!config.smtp.enabled) return;
    try {
      await getTransporter().verify();
      console.log("✅ SMTP connection verified — emails enabled");
    } catch (error) {
      console.error("⚠️ SMTP login failed — emails will not send:", (error as Error).message);
    }
  },
};
