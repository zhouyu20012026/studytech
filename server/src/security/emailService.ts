import nodemailer from 'nodemailer'
import { config } from '../config.js'

export async function sendResetEmail(to: string, code: string) {
  const transporter = nodemailer.createTransport({
    host: config.MAIL_HOST,
    port: config.MAIL_PORT,
    secure: config.MAIL_PORT === 465,
    auth: {
      user: config.MAIL_USER,
      pass: config.MAIL_PASS,
    },
  })

  await transporter.sendMail({
    from: config.MAIL_FROM,
    to,
    subject: '家庭物品后台密码重置验证码',
    text: `你的验证码是 ${code}，${config.RESET_TOKEN_MINUTES} 分钟内有效。`,
  })
}
