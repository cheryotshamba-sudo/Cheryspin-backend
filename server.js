const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 10000;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error("DATABASE_URL is missing.");
    process.exit(1);
}


/* =========================
   MIDDLEWARE
========================= */

app.use(cors());

app.use(express.json({
    limit: "10mb"
}));


/* =========================
   DATABASE
========================= */

const pool = new Pool({
    connectionString: DATABASE_URL,

    ssl: {
        rejectUnauthorized: false
    }
});


/* =========================
   DATABASE SETUP
========================= */

async function initializeDatabase() {

    try {

        /*
         * Create the users table if it does not exist.
         */

        await pool.query(`
            CREATE TABLE IF NOT EXISTS cheryspin_users (
                id SERIAL PRIMARY KEY,
                full_name VARCHAR(120) NOT NULL,
                age INTEGER NOT NULL,
                email VARCHAR(180) UNIQUE NOT NULL,
                phone VARCHAR(30) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                balance NUMERIC(12, 2) DEFAULT 1500.00,
                free_spins INTEGER DEFAULT 5,
                is_activated BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);


        /*
         * Add new columns to an older database if necessary.
         */

        await pool.query(`
            ALTER TABLE cheryspin_users
            ADD COLUMN IF NOT EXISTS age INTEGER
        `);

        await pool.query(`
            ALTER TABLE cheryspin_users
            ADD COLUMN IF NOT EXISTS email VARCHAR(180)
        `);


        /*
         * Older database versions may have allowed
         * password_hash to be NULL.
         *
         * New accounts require a password.
         */

        await pool.query(`
            ALTER TABLE cheryspin_users
            ALTER COLUMN password_hash DROP NOT NULL
        `);


        /*
         * Unique email index for existing databases.
         */

        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS
            cheryspin_users_email_unique
            ON cheryspin_users (email)
            WHERE email IS NOT NULL
        `);


        console.log("CherySpin database ready.");

    } catch (error) {

        console.error(
            "Database initialization error:",
            error.message
        );

        process.exit(1);
    }
}


/* =========================
   HOME
========================= */

app.get("/", (req, res) => {

    res.json({
        success: true,
        message: "CherySpin API is working."
    });

});


/* =========================
   HEALTH CHECK
========================= */

app.get("/api/health", async (req, res) => {

    try {

        await pool.query("SELECT 1");

        res.json({
            success: true,
            message: "CherySpin backend and database are working."
        });

    } catch (error) {

        console.error(
            "Health check error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Database connection failed."
        });

    }

});


/* =========================
   REGISTER
========================= */

app.post("/api/register", async (req, res) => {

    try {

        const {
            full_name,
            age,
            email,
            phone,
            password,
            confirm_password
        } = req.body;


        /* =========================
           REQUIRED FIELDS
        ========================= */

        if (
            !full_name ||
            !age ||
            !email ||
            !phone ||
            !password ||
            !confirm_password
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Full name, age, email, phone number, password and confirm password are required."

            });

        }


        /* =========================
           CLEAN DATA
        ========================= */

        const cleanName =
            String(full_name).trim();

        const cleanAge =
            Number(age);

        const cleanEmail =
            String(email).trim().toLowerCase();

        const cleanPhone =
            String(phone).trim();

        const cleanPassword =
            String(password);

        const cleanConfirmPassword =
            String(confirm_password);


        /* =========================
           VALIDATE NAME
        ========================= */

        if (cleanName.length < 2) {

            return res.status(400).json({

                success: false,

                message:
                    "Please enter your full name."

            });

        }


        /* =========================
           VALIDATE AGE
        ========================= */

        if (
            !Number.isInteger(cleanAge) ||
            cleanAge < 18 ||
            cleanAge > 99
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Age must be between 18 and 99."

            });

        }


        /* =========================
           VALIDATE EMAIL
        ========================= */

        const emailPattern =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailPattern.test(cleanEmail)) {

            return res.status(400).json({

                success: false,

                message:
                    "Please enter a valid email address."

            });

        }


        /* =========================
           VALIDATE PHONE
        ========================= */

        if (!/^07\d{8}$/.test(cleanPhone)) {

            return res.status(400).json({

                success: false,

                message:
                    "Enter a valid Kenyan phone number starting with 07."

            });

        }


        /* =========================
           VALIDATE PASSWORD
        ========================= */

        if (cleanPassword.length < 6) {

            return res.status(400).json({

                success: false,

                message:
                    "Password must be at least 6 characters."

            });

        }


        /* =========================
           CONFIRM PASSWORD
        ========================= */

        if (
            cleanPassword !== cleanConfirmPassword
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Passwords do not match."

            });

        }


        /* =========================
           CHECK PHONE
        ========================= */

        const existingPhone =
            await pool.query(
                `
                SELECT id
                FROM cheryspin_users
                WHERE phone = $1
                `,
                [cleanPhone]
            );


        if (existingPhone.rows.length > 0) {

            return res.status(409).json({

                success: false,

                message:
                    "An account with this phone number already exists."

            });

        }


        /* =========================
           CHECK EMAIL
        ========================= */

        const existingEmail =
            await pool.query(
                `
                SELECT id
                FROM cheryspin_users
                WHERE LOWER(email) = LOWER($1)
                `,
                [cleanEmail]
            );


        if (existingEmail.rows.length > 0) {

            return res.status(409).json({

                success: false,

                message:
                    "An account with this email already exists."

            });

        }


        /* =========================
           HASH PASSWORD
        ========================= */

        const passwordHash =
            await bcrypt.hash(
                cleanPassword,
                10
            );


        /* =========================
           CREATE ACCOUNT
        ========================= */

        const result =
            await pool.query(
                `
                INSERT INTO cheryspin_users
                (
                    full_name,
                    age,
                    email,
                    phone,
                    password_hash,
                    balance,
                    free_spins,
                    is_activated
                )
                VALUES
                (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    1500.00,
                    5,
                    FALSE
                )
                RETURNING
                    id,
                    full_name,
                    age,
                    email,
                    phone,
                    balance,
                    free_spins,
                    is_activated,
                    created_at
                `,
                [
                    cleanName,
                    cleanAge,
                    cleanEmail,
                    cleanPhone,
                    passwordHash
                ]
            );


        const user =
            result.rows[0];


        /* =========================
           RESPONSE
        ========================= */

        res.status(201).json({

            success: true,

            message:
                "CherySpin account created successfully.",

            user: user

        });

    } catch (error) {

        console.error(
            "Registration error:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "Unable to create account."

        });

    }

});


/* =========================
   LOGIN
========================= */

app.post("/api/login", async (req, res) => {

    try {

        const {
            identifier,
            password
        } = req.body;


        /* =========================
           REQUIRED FIELDS
        ========================= */

        if (!identifier || !password) {

            return res.status(400).json({

                success: false,

                message:
                    "Email or phone number and password are required."

            });

        }


        const cleanIdentifier =
            String(identifier).trim();

        const cleanPassword =
            String(password);


        /* =========================
           FIND USER
        ========================= */

        const result =
            await pool.query(
                `
                SELECT
                    id,
                    full_name,
                    age,
                    email,
                    phone,
                    password_hash,
                    balance,
                    free_spins,
                    is_activated,
                    created_at
                FROM cheryspin_users
                WHERE
                    LOWER(email) = LOWER($1)
                    OR phone = $1
                LIMIT 1
                `,
                [cleanIdentifier]
            );


        if (result.rows.length === 0) {

            return res.status(401).json({

                success: false,

                message:
                    "Invalid email/phone number or password."

            });

        }


        const user =
            result.rows[0];


        /* =========================
           CHECK PASSWORD
        ========================= */

        if (!user.password_hash) {

            return res.status(401).json({

                success: false,

                message:
                    "This account does not have a password. Please create a new account."

            });

        }


        const passwordMatches =
            await bcrypt.compare(
                cleanPassword,
                user.password_hash
            );


        if (!passwordMatches) {

            return res.status(401).json({

                success: false,

                message:
                    "Invalid email/phone number or password."

            });

        }


        /* =========================
           LOGIN SUCCESS
        ========================= */

        res.json({

            success: true,

            message:
                "Login successful.",

            user: {

                id:
                    user.id,

                full_name:
                    user.full_name,

                age:
                    user.age,

                email:
                    user.email,

                phone:
                    user.phone,

                balance:
                    user.balance,

                free_spins:
                    user.free_spins,

                is_activated:
                    user.is_activated,

                created_at:
                    user.created_at

            }

        });

    } catch (error) {

        console.error(
            "Login error:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "Unable to login."

        });

    }

});


/* =========================
   GET USER
========================= */

app.get("/api/users/:id", async (req, res) => {

    try {

        const userId =
            Number(req.params.id);


        if (!Number.isInteger(userId)) {

            return res.status(400).json({

                success: false,

                message:
                    "Valid user ID is required."

            });

        }


        const result =
            await pool.query(
                `
                SELECT
                    id,
                    full_name,
                    age,
                    email,
                    phone,
                    balance,
                    free_spins,
                    is_activated,
                    created_at
                FROM cheryspin_users
                WHERE id = $1
                `,
                [userId]
            );


        if (result.rows.length === 0) {

            return res.status(404).json({

                success: false,

                message:
                    "User not found."

            });

        }


        res.json({

            success: true,

            user:
                result.rows[0]

        });

    } catch (error) {

        console.error(
            "Get user error:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "Unable to load user."

        });

    }

});


/* =========================
   START SERVER
========================= */

async function startServer() {

    await initializeDatabase();

    app.listen(PORT, () => {

        console.log(
            `CherySpin server running on port ${PORT}`
        );

    });

}


startServer();
