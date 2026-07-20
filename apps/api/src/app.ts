import dotenv from "dotenv";
dotenv.config();

import express from "express";
import authRouter from "./modules/auth/auth.routes";
import { rateLimit, MINUTE } from "express-rate-limit";


const app = express();
const PORT = process.env.PORT || 8080;

const envVariables = ["JWT_SECRET", "DATABASE_URL"];


envVariables.forEach((key) => {
    if (!process.env[key]) {
        console.error(`${key} is not defined in the environment variables.`);
        process.exit(1);
    }
});


const limiter = rateLimit({
    windowMs: 15 * MINUTE, // SECOND, MINUTE, HOUR, and DAY constants are available, or a use bare number for milliseconds
    limit: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
    standardHeaders: 'draft-8', // draft-6: `RateLimit-*` headers; draft-7 & draft-8: combined `RateLimit` header
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
    ipv6Subnet: 56, // Set to 60 or 64 to be less aggressive, or 52 or 48 to be more aggressive
    // store: ... , // Redis, Memcached, etc. See below.
})

//middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(limiter)

//routes
app.use("/api/auth", authRouter);


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

