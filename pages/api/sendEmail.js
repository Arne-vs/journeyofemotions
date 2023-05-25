// pages/api/sendEmail.js
import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  const { image } = req.body;
  console.log(image);

  // create reusable transporter object using the default SMTP transport
  let transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: `${process.env.yourEmail}`,
      pass: `${process.env.PasswordEmail}`,
    },
  });

  // send mail with defined transport object
  let info = await transporter.sendMail({
    from: '"Arne" <arnescha2003@gmail.com',
    to: `${process.env.emailToSendPost}`,
    subject: 'Journey of emotion',
    text: '',
    attachments: [
      {
        filename: 'image.png',
        path: image,
      },
    ],
  });

  console.log('Message sent: %s', info.messageId);

  res.status(200).json({ message: 'Email sent' });
}
