const {tbsWebPool} = require('../config/dbconfig')
const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    auth: {
        user: 'no-reply@thebusstand.com',
        pass: 'bdqbqlgqgcnnrxrr',
    },
})

const postInquiry = async (req, res) => {
    const { name, phone, email, message, terms } = req.body;

    if(!name || !phone || !email || !message || !terms){
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        
      const user =  await tbsWebPool.query(
            `INSERT INTO public.inquiries_tbl(name, phone, email, message, terms) VALUES($1, $2, $3, $4, $5)`,
            [name, phone, email, message, terms]
        )
        console.log(req.body);

        const mailOptions = {
            from: 'no-reply@thebusstand.com', 
            to: 'support@thebusstand.com',
            subject: 'New Inquiry from ' + name, 
            html: `
             <html>
                <body>
                    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);">
                        <div style="background-color: #003366; padding: 20px; color: #ffffff; text-align: center;">
                        <h1 style="margin: 0; font-size: 28px; text-transform: uppercase; letter-spacing: 1px;">TheBusStand</h1>
                        </div>
                        <div style="padding: 20px; background-color: #f9f9f9;">
                        <h2 style="color: #003366; border-bottom: 2px solid #003366; padding-bottom: 10px; margin-bottom: 20px; text-transform: capitalize; font-size: 22px;">New Inquiry from ${name}</h2>
                        <div style="margin-bottom: 20px;">
                            <p style="margin: 0 0 10px;"><strong>Name:</strong> ${name}</p>
                            <p style="margin: 0 0 10px;"><strong>Phone:</strong> ${phone}</p>
                            <p style="margin: 0 0 10px;"><strong>Email:</strong> ${email}</p>
                            <p style="margin: 0 0 10px;"><strong>Message:</strong></p>
                            <div style="border: 1px dashed #1F487C; padding: 15px; border-radius: 5px; background-color: #D2DAE5;">${message}</div>
                        </div>
                        </div>
                        <div style="background-color: #003366; padding: 15px; text-align: center; color: #ffffff; border-top: 1px solid #e0e0e0;">
                        <p style="margin: 0;">&copy; ${new Date().getFullYear()} TheBusStand. All rights reserved.</p>
                        </div>
                    </div>
                    </div>
                </body>
            </html>
            `,
        };

        // Send email
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log('Error:', error);
                res.status(201).send('There was an error sending your inquiry. Please try again later.');
            } else {
                console.log('Email sent:', info.response);
                res.send('Thank you for your inquiry! We will get back to you soon.');
            }
        });

    } catch (error) {
        console.error('Database error:', error);
        res.status(201).send('There was an error processing your inquiry. Please try again later.');
    }
};

module.exports = { postInquiry };
