// import priceService from "./modules/market_price/market_price.services";

// const ps = new priceService();
// const x = await ps.getMarketState();
// console.log(x);


import dotenv from "dotenv";
import { Redis } from "ioredis";
dotenv.config();

import express from "express";
import authRouter from "./modules/auth/auth.routes";
import { rateLimit, MINUTE } from "express-rate-limit";
import { prisma } from "@project-eryx/db";
// import marketRouter from "./modules/market_price/market_price.routes";

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
app.get("/api/health", async (req, res) => {
    try {
        await prisma.$connect();
        const redis = new Redis();
        await redis.ping()
        res.send("Database and redis working... all systems healthy");
    } catch (e: any) {
        res.json({
            message: e.error
        })
    }
});

//auth routes
app.use("/api/auth", authRouter);
// app.use("/api/market", marketRouter)


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
