/**
 * Brevo email service for sending transactional emails
 * Using direct REST API calls for better Cloudflare Workers compatibility
 */

export class BrevoService {
    private apiKey: string;
    private senderEmail: string;
    private senderName: string;
    private apiUrl = 'https://api.brevo.com/v3';

    constructor(
        apiKey: string,
        senderEmail: string = 'verification@focal.creativegeek.net',
        senderName: string = 'Focal - Financial Tracker'
    ) {
        if (!apiKey) {
            throw new Error('Brevo API key is not provided');
        }
        this.apiKey = apiKey;
        this.senderEmail = senderEmail;
        this.senderName = senderName;
    }

    /**
     * Send verification email to new user
     */
    async sendVerificationEmail(
        recipientEmail: string,
        recipientName: string,
        verificationToken: string,
        appUrl: string
    ): Promise<{ success: boolean; messageId?: string; error?: string }> {
        try {
            const verificationUrl = `${appUrl}/verify?token=${verificationToken}`;
            // Use PNG for email (Gmail blocks SVG), ensure URL is public even when testing locally
            const logoUrl = appUrl.includes('localhost')
                ? 'https://focal.creativegeek.net/images/logo-email.png'
                : `${appUrl}/images/logo-email.png`;

            const emailData = {
                sender: {
                    name: this.senderName,
                    email: this.senderEmail
                },
                to: [
                    {
                        email: recipientEmail,
                        name: recipientName
                    }
                ],
                subject: 'Action Required: Verify your Focal account',
                headers: {
                    'X-Mailin-Tag': 'verification'
                },
                htmlContent: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify Your Email</title>
    <style>
        @media (max-width: 600px) {
            .container { width: 100% !important; padding: 16px !important; }
            .content { padding: 24px 20px !important; }
            .button { width: 100% !important; box-sizing: border-box !important; }
        }
    </style>
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
    <div style="display:none;font-size:1px;color:#737373;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
        Please verify your email address to start tracking expenses with Focal.
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table class="container" width="560" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; border: 1px solid #e5e5e5; overflow: hidden;">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #e5e5e5;">
                            <img src="${logoUrl}" alt="Focal" style="width: 48px; height: 48px; margin-bottom: 16px;" />
                            <h1 style="margin: 0; color: #0a0a0a; font-size: 24px; font-weight: 600; letter-spacing: -0.025em;">
                                Welcome to Focal
                            </h1>
                            <p style="margin: 8px 0 0; color: #737373; font-size: 14px; font-weight: 400;">
                                AI-Powered Expense Tracking
                            </p>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td class="content" style="padding: 32px;">
                            <p style="margin: 0 0 16px; color: #0a0a0a; font-size: 15px; line-height: 1.6; font-weight: 500;">
                                Hi ${recipientName},
                            </p>
                            <p style="margin: 0 0 24px; color: #525252; font-size: 15px; line-height: 1.6;">
                                Thanks for signing up. To get started with tracking your expenses using AI-powered receipt scanning, please verify your email address.
                            </p>

                            <!-- CTA Button -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
                                <tr>
                                    <td align="center">
                                        <a href="${verificationUrl}" class="button" style="display: inline-block; padding: 12px 24px; background-color: #171717; color: #fafafa; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">
                                            Verify Email Address
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <!-- Link fallback -->
                            <div style="background-color: #f5f5f5; border-radius: 6px; padding: 16px; margin: 24px 0;">
                                <p style="margin: 0 0 8px; color: #525252; font-size: 13px; font-weight: 500;">
                                    Or copy and paste this link:
                                </p>
                                <p style="margin: 0; color: #3b82f6; font-size: 13px; word-break: break-all; font-family: 'JetBrains Mono', 'Fira Code', monospace;">
                                    ${verificationUrl}
                                </p>
                            </div>

                            <!-- Notice -->
                            <div style="background-color: #fefce8; border-radius: 6px; padding: 12px 16px; margin: 24px 0; border-left: 3px solid #ca8a04;">
                                <p style="margin: 0; color: #a16207; font-size: 13px; line-height: 1.5;">
                                    <strong>Note:</strong> This link will expire in 24 hours for security reasons.
                                </p>
                            </div>

                            <p style="margin: 24px 0 0; color: #a3a3a3; font-size: 13px; line-height: 1.5;">
                                If you didn't create an account with Focal, you can safely ignore this email.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 24px 32px; background-color: #fafafa; border-top: 1px solid #e5e5e5;">
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="text-align: center;">
                                        <p style="margin: 0 0 12px; color: #525252; font-size: 13px;">
                                            Best regards,<br>
                                            <strong style="color: #0a0a0a;">The Focal Team</strong>
                                        </p>
                                        <p style="margin: 0; color: #a3a3a3; font-size: 12px;">
                                            <a href="mailto:support@focal.creativegeek.net" style="color: #737373; text-decoration: none;">Support</a>
                                            <span style="color: #d4d4d4; margin: 0 8px;">|</span>
                                            <a href="https://focal.creativegeek.net" style="color: #737373; text-decoration: none;">Website</a>
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>

                <!-- Copyright -->
                <table width="560" cellpadding="0" cellspacing="0" style="margin-top: 24px;">
                    <tr>
                        <td style="text-align: center;">
                            <p style="margin: 0; color: #a3a3a3; font-size: 12px;">
                                © 2025 Focal. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
                `.trim(),
                textContent: `
Welcome to Focal!

Hi ${recipientName},

Thanks for signing up! To get started with tracking your expenses using AI-powered receipt scanning, please verify your email address by visiting this link:

${verificationUrl}

This link will expire in 24 hours for security reasons.

If you didn't create an account with Focal, you can safely ignore this email.

Best regards,
The Focal Team
                `.trim(),
                replyTo: {
                    email: this.senderEmail,
                    name: this.senderName
                }
            };

            const response = await fetch(`${this.apiUrl}/smtp/email`, {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': this.apiKey,
                    'content-type': 'application/json'
                },
                body: JSON.stringify(emailData)
            });

            const data = await response.json() as any;

            if (!response.ok) {
                console.error('[Brevo] API Error Response:', data);
                return {
                    success: false,
                    error: data.message || `HTTP ${response.status}: ${response.statusText}`
                };
            }

            console.log('[Brevo] API Success Response:', data);
            return {
                success: true,
                messageId: data.messageId
            };
        } catch (error: any) {
            console.error('[Brevo] Failed to send verification email:', error);
            return {
                success: false,
                error: error.message || 'Failed to send verification email'
            };
        }
    }

    /**
     * Send password reset email
     */
    async sendPasswordResetEmail(
        recipientEmail: string,
        recipientName: string,
        resetToken: string,
        appUrl: string
    ): Promise<{ success: boolean; messageId?: string; error?: string }> {
        try {
            const resetUrl = `${appUrl}/reset-password?token=${resetToken}`;
            // Use PNG for email (Gmail blocks SVG), ensure URL is public even when testing locally
            const logoUrl = appUrl.includes('localhost')
                ? 'https://focal.creativegeek.net/images/logo-email.png'
                : `${appUrl}/images/logo-email.png`;

            const emailData = {
                sender: {
                    name: this.senderName,
                    email: this.senderEmail
                },
                to: [
                    {
                        email: recipientEmail,
                        name: recipientName
                    }
                ],
                subject: 'Action Required: Reset your Focal password',
                headers: {
                    'X-Mailin-Tag': 'password-reset'
                },
                htmlContent: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your Password</title>
    <style>
        @media (max-width: 600px) {
            .container { width: 100% !important; padding: 16px !important; }
            .content { padding: 24px 20px !important; }
            .button { width: 100% !important; box-sizing: border-box !important; }
        }
    </style>
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
    <div style="display:none;font-size:1px;color:#737373;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
        You requested a password reset. Click the link to create a new password.
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table class="container" width="560" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; border: 1px solid #e5e5e5; overflow: hidden;">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #e5e5e5;">
                            <img src="${logoUrl}" alt="Focal" style="width: 48px; height: 48px; margin-bottom: 16px;" />
                            <h1 style="margin: 0; color: #0a0a0a; font-size: 24px; font-weight: 600; letter-spacing: -0.025em;">
                                Reset Your Password
                            </h1>
                            <p style="margin: 8px 0 0; color: #737373; font-size: 14px; font-weight: 400;">
                                Secure Account Recovery
                            </p>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td class="content" style="padding: 32px;">
                            <p style="margin: 0 0 16px; color: #0a0a0a; font-size: 15px; line-height: 1.6; font-weight: 500;">
                                Hi ${recipientName},
                            </p>
                            <p style="margin: 0 0 24px; color: #525252; font-size: 15px; line-height: 1.6;">
                                We received a request to reset your password. Click the button below to create a new password.
                            </p>

                            <!-- CTA Button -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
                                <tr>
                                    <td align="center">
                                        <a href="${resetUrl}" class="button" style="display: inline-block; padding: 12px 24px; background-color: #171717; color: #fafafa; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">
                                            Reset Password
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <!-- Link fallback -->
                            <div style="background-color: #f5f5f5; border-radius: 6px; padding: 16px; margin: 24px 0;">
                                <p style="margin: 0 0 8px; color: #525252; font-size: 13px; font-weight: 500;">
                                    Or copy and paste this link:
                                </p>
                                <p style="margin: 0; color: #3b82f6; font-size: 13px; word-break: break-all; font-family: 'JetBrains Mono', 'Fira Code', monospace;">
                                    ${resetUrl}
                                </p>
                            </div>

                            <!-- Notice -->
                            <div style="background-color: #fef3c7; border-radius: 6px; padding: 12px 16px; margin: 24px 0; border-left: 3px solid #d97706;">
                                <p style="margin: 0; color: #92400e; font-size: 13px; line-height: 1.5;">
                                    <strong>Note:</strong> This link will expire in 1 hour for security reasons.
                                </p>
                            </div>

                            <p style="margin: 24px 0 0; color: #a3a3a3; font-size: 13px; line-height: 1.5;">
                                If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 24px 32px; background-color: #fafafa; border-top: 1px solid #e5e5e5;">
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="text-align: center;">
                                        <p style="margin: 0 0 12px; color: #525252; font-size: 13px;">
                                            Need help with your account?<br>
                                            <strong style="color: #0a0a0a;">Contact Focal Support</strong>
                                        </p>
                                        <p style="margin: 0; color: #a3a3a3; font-size: 12px;">
                                            <a href="mailto:support@focal.creativegeek.net" style="color: #737373; text-decoration: none;">Support</a>
                                            <span style="color: #d4d4d4; margin: 0 8px;">|</span>
                                            <a href="https://focal.creativegeek.net" style="color: #737373; text-decoration: none;">Website</a>
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>

                <!-- Copyright -->
                <table width="560" cellpadding="0" cellspacing="0" style="margin-top: 24px;">
                    <tr>
                        <td style="text-align: center;">
                            <p style="margin: 0; color: #a3a3a3; font-size: 12px;">
                                © 2025 Focal. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
                `.trim(),
                textContent: `
Reset Your Password

Hi ${recipientName},

We received a request to reset your password. Visit this link to create a new password:

${resetUrl}

This link will expire in 1 hour for security reasons.

If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.

Best regards,
The Focal Team
                `.trim(),
                replyTo: {
                    email: this.senderEmail,
                    name: this.senderName
                }
            };

            const response = await fetch(`${this.apiUrl}/smtp/email`, {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': this.apiKey,
                    'content-type': 'application/json'
                },
                body: JSON.stringify(emailData)
            });

            const data = await response.json() as any;

            if (!response.ok) {
                console.error('[Brevo] API Error Response:', data);
                return {
                    success: false,
                    error: data.message || `HTTP ${response.status}: ${response.statusText}`
                };
            }

            console.log('[Brevo] API Success Response:', data);
            return {
                success: true,
                messageId: data.messageId
            };
        } catch (error: any) {
            console.error('[Brevo] Failed to send password reset email:', error);
            return {
                success: false,
                error: error.message || 'Failed to send password reset email'
            };
        }
    }
}
