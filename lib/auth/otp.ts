import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export function generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendOTPEmail(email: string, otp: string) {
    console.log('Sending OTP to', email);
    await resend.emails.send({
        from: 'noreply@pcichat.com',
        to: email,
        subject: 'Your PCIChat verification code',
        html: `
      <h1>PCIChat</h1>
      <p>Your verification code is: <strong>${otp}</strong></p>
      <p>This code will expire in 15 minutes.</p>
    `,
    });
} 