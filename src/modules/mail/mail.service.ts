import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface SendCredentialsMailOptions {
  toEmail: string;
  contactName: string;
  companyName: string;
  subdomain: string;
  defaultPassword: string;
}

export interface SendOtpMailOptions {
  toEmail: string;
  userName: string;
  otpCode: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST', 'smtp.gmail.com');
    const port = Number(this.configService.get<number>('SMTP_PORT', 465));
    const secure =
      this.configService.get<string>('SMTP_SECURE', 'true') === 'true';
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user: user.trim(),
          pass: pass.replace(/\s+/g, ''), // Strip spaces from App Password if any
        },
      });
    } else {
      this.logger.warn(
        'SMTP credentials not provided. Email dispatch will be skipped.',
      );
    }
  }

  async sendSuperAdminCredentials(
    options: SendCredentialsMailOptions,
  ): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(
        `Transporter not initialized. Cannot send credentials to ${options.toEmail}`,
      );
      return false;
    }

    const fromName = this.configService.get<string>(
      'SMTP_FROM_NAME',
      'Inspire Next Global - PMS SaaS',
    );
    const fromUser = this.configService.get<string>('SMTP_USER', '');

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; rounded: 8px; background-color: #ffffff;">
        <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #10b981;">
          <h1 style="color: #111827; margin: 0; font-size: 24px;">Welcome to PMS SaaS</h1>
          <p style="color: #6b7280; font-size: 14px; margin-top: 5px;">Your Superadmin Account has been created</p>
        </div>

        <div style="padding: 20px 0; color: #374151; font-size: 15px; line-height: 1.6;">
          <p>Hello <strong>${options.contactName}</strong>,</p>
          <p>Welcome to <strong>${options.companyName}</strong> on the PMS SaaS Platform! A Superadmin account has been provisioned for your organization.</p>

          <div style="background-color: #f3f4f6; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0 0 8px 0;"><strong>Login Email:</strong> <span style="font-family: monospace; font-size: 15px; color: #111827;">${options.toEmail}</span></p>
            <p style="margin: 0 0 8px 0;"><strong>Default Password:</strong> <span style="font-family: monospace; font-size: 16px; color: #059669; font-weight: bold;">${options.defaultPassword}</span></p>
            <p style="margin: 0;"><strong>Subdomain:</strong> <span style="font-family: monospace; font-size: 15px; color: #111827;">${options.subdomain}</span></p>
          </div>

          <div style="background-color: #fffbeb; border: 1px solid #fef3c7; padding: 12px 15px; margin-bottom: 20px; border-radius: 6px; color: #92400e; font-size: 13px;">
            <strong>Important Security Notice:</strong> Please log in to your PMS SaaS account and change this default password immediately in the <strong>Settings</strong> page.
          </div>

          <p style="margin-top: 25px;">If you have any questions or require support, please feel free to reach out to our team.</p>
          <p style="color: #6b7280; font-size: 14px; margin-bottom: 0;">Best regards,<br><strong>Inspire Next Global Team</strong></p>
        </div>

        <div style="text-align: center; border-top: 1px solid #e5e7eb; padding-top: 15px; font-size: 12px; color: #9ca3af;">
          <p style="margin: 0;">&copy; ${new Date().getFullYear()} Inspire Next Global. All rights reserved.</p>
        </div>
      </div>
    `;

    try {
      const info = (await this.transporter.sendMail({
        from: `"${fromName}" <${fromUser}>`,
        to: options.toEmail,
        subject: `Your PMS SaaS Superadmin Account Credentials - ${options.companyName}`,
        html: htmlContent,
      })) as { messageId?: string };

      const messageId =
        typeof info?.messageId === 'string' ? info.messageId : 'sent';
      this.logger.log(
        `Superadmin credentials email sent to ${options.toEmail}: ${messageId}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send credentials email to ${options.toEmail}:`,
        error,
      );
      return false;
    }
  }

  async sendPasswordOtpEmail(options: SendOtpMailOptions): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(
        `Transporter not initialized. Cannot send OTP to ${options.toEmail}`,
      );
      return false;
    }

    const fromName = this.configService.get<string>(
      'SMTP_FROM_NAME',
      'Inspire Next Global - PMS SaaS',
    );
    const fromUser = this.configService.get<string>('SMTP_USER', '');

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; rounded: 8px; background-color: #ffffff;">
        <div style="text-align: center; padding-bottom: 15px; border-bottom: 2px solid #10b981;">
          <h2 style="color: #111827; margin: 0;">Password Change Verification</h2>
        </div>

        <div style="padding: 20px 0; color: #374151; font-size: 14px; line-height: 1.6;">
          <p>Hello <strong>${options.userName}</strong>,</p>
          <p>We received a request to change your password for your PMS SaaS account. Use the verification code below to confirm this request:</p>

          <div style="text-align: center; margin: 25px 0;">
            <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #059669; background-color: #ecfdf5; padding: 10px 24px; border-radius: 8px; border: 1px dashed #10b981;">
              ${options.otpCode}
            </span>
          </div>

          <p style="font-size: 13px; color: #6b7280; text-align: center;">This code will expire in <strong>10 minutes</strong>.</p>
          <p style="font-size: 12px; color: #9ca3af; margin-top: 20px;">If you did not request a password change, please ignore this email or contact your administrator immediately.</p>
        </div>
      </div>
    `;

    try {
      const info = (await this.transporter.sendMail({
        from: `"${fromName}" <${fromUser}>`,
        to: options.toEmail,
        subject: `[${options.otpCode}] Password Change Verification Code - PMS SaaS`,
        html: htmlContent,
      })) as { messageId?: string };

      const messageId =
        typeof info?.messageId === 'string' ? info.messageId : 'sent';
      this.logger.log(
        `Password OTP email sent to ${options.toEmail}: ${messageId}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send OTP email to ${options.toEmail}:`,
        error,
      );
      return false;
    }
  }
}
