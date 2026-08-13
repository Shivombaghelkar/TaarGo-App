const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname)); // To serve index.html and static files

// Multer setup for DP uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Simple JSON Database file path
const DB_FILE = path.join(__dirname, 'database.json');

// Helper functions to read/write DB
function readDB() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], messages: [] }, null, 2));
    }
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return { users: [], messages: [] };
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Temporary storage for OTPs
const otpStorage = {};

// Nodemailer Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'shivombaghelkar@gmail.com',
        pass: 'Shivom@2026'
    }
});

// Helper to send email / Print OTP in console for easy testing
async function sendEmailOtp(identifier, otp) {
    otpStorage[identifier] = otp;
    
    // Yahan terminal/console par OTP print ho jayega
    console.log(`\n========================================`);
    console.log(`🔑 APKA OTP (TESTING): ${otp}`);
    console.log(`========================================\n`);

    const mailOptions = {
        from: 'shivombaghelkar@gmail.com',
        to: identifier,
        subject: 'TaarGo App Verification OTP',
        text: `Your TaarGo Verification OTP is: ${otp}`
    };
    try {
        await transporter.sendMail(mailOptions);
        console.log(`-> OTP sent successfully via Email to ${identifier}`);
        return true;
    } catch (error) {
        console.log("-> Note: Email nahi gayi, lekin upar console mein OTP print ho gaya hai, aap wahan se use kar sakte hain!");
        return true; // Bypass email error for seamless local testing
    }
}

// Serve main frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 1. REGISTER
app.post('/register', async (req, res) => {
    const { identifier, password, name } = req.body;
    if (!identifier || !password || !name) {
        return res.json({ success: false, message: 'All fields are required!' });
    }

    const db = readDB();
    const existingUser = db.users.find(u => u.phoneOrEmail === identifier);
    if (existingUser) {
        return res.json({ success: false, message: 'User already registered!' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const sent = await sendEmailOtp(identifier, otp);

    if (!sent) {
        return res.json({ success: false, message: 'Failed to send OTP email. Check server config.' });
    }

    db.users.push({ phoneOrEmail: identifier, password, name, dpUrl: "", verified: false });
    writeDB(db);

    res.json({ success: true, message: 'OTP sent successfully!' });
});

// 2. LOGIN / SEND-OTP (For existing users)
app.post('/send-otp', async (req, res) => {
    const { identifier, password } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.phoneOrEmail === identifier && u.password === password);

    if (!user) {
        return res.json({ success: false, message: 'User not found or incorrect password!' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const sent = await sendEmailOtp(identifier, otp);

    if (!sent) {
        return res.json({ success: false, message: 'Failed to send OTP.' });
    }

    res.json({ success: true, message: 'OTP sent successfully!' });
});

// 3. RESEND OTP
app.post('/resend-otp', async (req, res) => {
    const { identifier } = req.body;
    if (!identifier) {
        return res.json({ success: false, message: 'Identifier is required!' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const sent = await sendEmailOtp(identifier, otp);

    if (!sent) {
        return res.json({ success: false, message: 'Failed to resend OTP.' });
    }

    res.json({ success: true, message: 'OTP resent successfully!' });
});

// 4. VERIFY LOGIN
app.post('/verify-login', (req, res) => {
    const { identifier, otp } = req.body;

    if (otpStorage[identifier] && otpStorage[identifier] === otp) {
        delete otpStorage[identifier];
        const db = readDB();
        let user = db.users.find(u => u.phoneOrEmail === identifier);
        if (user) {
            user.verified = true;
            writeDB(db);
            return res.json({ success: true, user: { name: user.name, phoneOrEmail: user.phoneOrEmail, dpUrl: user.dpUrl } });
        }
    }
    res.json({ success: false, message: 'Invalid or expired OTP!' });
});

// 5. FORGOT PASSWORD REQUEST
app.post('/forgot-password-request', async (req, res) => {
    const { identifier } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.phoneOrEmail === identifier);

    if (!user) {
        return res.json({ success: false, message: 'User not found!' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const sent = await sendEmailOtp(identifier, otp);

    if (!sent) {
        return res.json({ success: false, message: 'Failed to send reset OTP.' });
    }

    res.json({ success: true, message: 'Reset OTP sent successfully!' });
});

// 6. RESET PASSWORD
app.post('/reset-password', (req, res) => {
    const { identifier, otp, newPassword } = req.body;

    if (otpStorage[identifier] && otpStorage[identifier] === otp) {
        delete otpStorage[identifier];
        const db = readDB();
        let user = db.users.find(u => u.phoneOrEmail === identifier);
        if (user) {
            user.password = newPassword;
            writeDB(db);
            return res.json({ success: true, message: 'Password updated successfully!' });
        }
    }
    res.json({ success: false, message: 'Invalid OTP!' });
});

// 7. FILE UPLOAD (DP)
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.json({ success: false, message: 'No file uploaded!' });
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ success: true, url: fileUrl });
});

// 8. UPDATE PROFILE
app.post('/update-profile', (req, res) => {
    const { identifier, name, dpUrl } = req.body;
    const db = readDB();
    let user = db.users.find(u => u.phoneOrEmail === identifier);

    if (user) {
        user.name = name || user.name;
        user.dpUrl = dpUrl !== undefined ? dpUrl : user.dpUrl;
        writeDB(db);
        return res.json({ success: true, user: { name: user.name, phoneOrEmail: user.phoneOrEmail, dpUrl: user.dpUrl } });
    }
    res.json({ success: false, message: 'User not found!' });
});

// 9. DELETE ACCOUNT
app.post('/delete-account', (req, res) => {
    const { identifier } = req.body;
    const db = readDB();
    db.users = db.users.filter(u => u.phoneOrEmail !== identifier);
    writeDB(db);
    res.json({ success: true, message: 'Account deleted successfully!' });
});

// 10. CLEAR CHAT
app.post('/clear-chat', (req, res) => {
    const db = readDB();
    db.messages = [];
    writeDB(db);
    res.json({ success: true, message: 'Chat cleared!' });
});

// Socket.io integration for Chat
const http = require('http');
const { Server } = require('socket.io');
const server = http.createServer(app);
const io = new Server(server);

io.on('connection', (socket) => {
    console.log('A user connected via Socket.io');

    socket.on('join group', (group) => {
        socket.join(group);
        const db = readDB();
        const groupMessages = db.messages.filter(m => m.group === group);
        socket.emit('load old messages', groupMessages);
    });

    socket.on('chat message', (data) => {
        const messageData = {
            _id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
            group: data.group,
            user: data.user,
            dpUrl: data.dpUrl,
            text: data.text,
            timestamp: new Date()
        };

        const db = readDB();
        db.messages.push(messageData);
        if (db.messages.length > 500) db.messages.shift();
        writeDB(db);

        io.to(data.group).emit('chat message', messageData);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`TaarGo full backend server is running on port ${PORT}`);
});