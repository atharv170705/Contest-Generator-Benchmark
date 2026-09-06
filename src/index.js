import dotenv from "dotenv";
import express from "express";
import {createClient} from "redis";
import { generateWithCache, generateWithoutCache } from "./benchmark.js";

dotenv.config();

const app = express();

const port = process.env.PORT || 5001;

app.use(express.json());

const redisClient = createClient({
    url: process.env.REDIS_URL
});

redisClient.on("error", (err) => {
    console.log("Redis Client Error:", err);
});

const connectRedis = async () => {
    try {
        await redisClient.connect();
        console.log("Redis connected!");
    } catch (error) {
        console.log("Redis connection error:", error);
        process.exit(1);
    }
};

app.locals.redisClient = redisClient;

app.get('/', (req, res) => {
    res.json({
        message: "Benchmark server is running"
    })
});

app.post("/generate/no-cache", generateWithoutCache);
app.post("/generate/cache", generateWithCache);


const startServer = async () => {
    await connectRedis();

    app.listen(port, () => {
        console.log(`Server is listening on port: ${port}`);
    });
};

startServer();