import nodemailer, { type Transporter, type SendMailOptions } from "nodemailer";
import { convert as htmlToText } from "html-to-text";

type EmailUser = {
  email: string;
  displayName?: string;
};

type Env = "production" | "development" | "test" | string;

export default class Email {
  private to: string;
  private firstName: string;
  private url: string;
  private from: string;

  constructor(user: EmailUser, url: string) {
    this.to = user.email;
    this.firstName = (user?.displayName ?? "").split(" ")[0] || "there";
    this.url = url;
    this.from = `Lucky Chukwujekwu <${process.env.EMAIL_FROM ?? "no-reply@mystic.com"}>`;
  }

  private newTransport = (): Transporter => {
    const nodeEnv: Env = process.env.NODE_ENV ?? "development";

    if (nodeEnv === "production") {
      return nodemailer.createTransport({
        service: "SendGrid",
        auth: {
          user: process.env.SENDGRID_USERNAME,
          pass: process.env.SENDGRID_PASSWORD,
        },
      });
    }

    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT ?? 2525),
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  };

  private send = async (subject: string, html: string): Promise<void> => {
    const mailOptions: SendMailOptions = {
      from: this.from,
      to: this.to,
      subject,
      html,
      text: htmlToText(html),
    };

    await this.newTransport().sendMail(mailOptions);
  };

  public sendWelcome = async (): Promise<void> => {
    const subject = "Welcome!";
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6">
        <h2>Hi ${this.firstName},</h2>
        <p>Welcome! You’re all set.</p>
        <p><a href="${this.url}">Open the app</a></p>
      </div>
    `;
    await this.send(subject, html);
  };

  public sendSignInToken = async (token: string): Promise<void> => {
    const subject = "Your sign-in code (valid for 10 minutes)";
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6">
        <h2>Hi ${this.firstName},</h2>
        <p>Use this code to sign in:</p>

        <div style="
          font-size: 28px;
          letter-spacing: 6px;
          font-weight: 700;
          padding: 12px 16px;
          display: inline-block;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          background: #f9fafb;
          margin: 10px 0 16px;
        ">
          ${token}
        </div>

        <p>This code expires in <b>10 minutes</b>.</p>
        <p>If you didn’t request this, you can ignore this email.</p>

        <hr style="border:none;border-top:1px solid #eee;margin:18px 0" />
        <p style="font-size: 12px; color: #6b7280;">
          Mystic Chat • <a href="${this.url}">Open app</a>
        </p>
      </div>
    `;

    await this.send(subject, html);
  };
}
