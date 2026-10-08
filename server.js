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

        await pool.query(`
            CREATE TABLE IF NOT EXISTS cheryspin_users (
                id SERIAL PRIMARY KEY,
                full_name VARCHAR(120) NOT NULL,
                phone VARCHAR(30) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                balance NUMERIC(12, 2) DEFAULT 1500.00,
                free_spins INTEGER DEFAULT 5,
                is_activated BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
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
            phone,
            password
        } = req.body;


        if (!full_name || !phone || !password) {

            return res.status(400).json({
                success: false,
                message: "Full name, phone number and password are required."
            });

        }


        if (password.length < 6) {

            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters."
            });

        }


        const cleanName =
            String(full_name).trim();

        const cleanPhone =
            String(phone).trim();


        const existingUser =
            await pool.query(
                `
                SELECT id
                FROM cheryspin_users
                WHERE phone = $1
                `,
                [cleanPhone]
            );


        if (existingUser.rows.length > 0) {

            return res.status(409).json({
                success: false,
                message: "An account with this phone number already exists."
            });

        }


        const passwordHash =
            await bcrypt.hash(password, 10);


        const result =
            await pool.query(
                `
                INSERT INTO cheryspin_users
                (
                    full_name,
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
                    1500.00,
                    5,
                    FALSE
                )
                RETURNING
                    id,
                    full_name,
                    phone,
                    balance,
                    free_spins,
                    is_activated,
                    created_at
                `,
                [
                    cleanName,
                    cleanPhone,
                    passwordHash
                ]
            );


        const user =
            result.rows[0];


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
            phone,
            password
        } = req.body;


        if (!phone || !password) {

            return res.status(400).json({

                success: false,

                message:
                    "Phone number and password are required."

            });

        }


        const cleanPhone =
            String(phone).trim();


        const result =
            await pool.query(
                `
                SELECT *
                FROM cheryspin_users
                WHERE phone = $1
                `,
                [cleanPhone]
            );


        if (result.rows.length === 0) {

            return res.status(401).json({

                success: false,

                message:
                    "Invalid phone number or password."

            });

        }


        const user =
            result.rows[0];


        const passwordMatches =
            await bcrypt.compare(
                password,
                user.password_hash
            );


        if (!passwordMatches) {

            return res.status(401).json({

                success: false,

                message:
                    "Invalid phone number or password."

            });

        }


        res.json({

            success: true,

            message:
                "Login successful.",

            user: {

                id: user.id,

                full_name:
                    user.full_name,

                phone:
                    user.phone,

                balance:
                    user.balance,

                free_spins:
                    user.free_spins,

                is_activated:
                    user.is_activated

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
