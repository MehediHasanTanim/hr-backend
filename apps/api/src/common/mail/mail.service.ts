import { Inject, Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { AppConfigService } from '../../config/config.service';

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private readonly transporter: nodemailer.Transporter;

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {
    const mailCfg = this.config.get('mail');
    this.transporter = nodemailer.createTransport({
      host: mailCfg.host,
      port: mailCfg.port,
      secure: mailCfg.port === 465,
      auth: mailCfg.user ? { user: mailCfg.user, pass: mailCfg.pass } : undefined,
    });
  }

  async send(options: SendMailOptions): Promise<void> {
    const mailCfg = this.config.get('mail');
    try {
      await this.transporter.sendMail({
        from: mailCfg.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text ?? options.html.replace(/<[^>]+>/g, ''),
      });
      this.logger.log(`Mail sent to ${options.to}: ${options.subject}`);
    } catch (err) {
      this.logger.error(`Failed to send mail to ${options.to}`, err);
    }
  }

  renderTemplate(title: string, body: string, cta?: { label: string; url: string }): string {
    const ctaHtml = cta
      ? `<div style="text-align:center;margin:32px 0"><a href="${cta.url}" style="background:#2563eb;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:600">${cta.label}</a></div>`
      : '';

    return `<!DOCTYPE html><html><body style="font-family:Inter,sans-serif;background:#f9fafb;margin:0;padding:32px"><div style="max-width:480px;margin:0 auto;background:white;border-radius:8px;padding:32px;border:1px solid #e5e7eb"><h2 style="color:#111827;margin-top:0">${title}</h2><div style="color:#374151;line-height:1.6">${body}</div>${ctaHtml}<p style="color:#9ca3af;font-size:12px;margin-top:32px">This email was sent by HR Platform. If you did not expect it, you can safely ignore it.</p></div></body></html>`;
  }
}
