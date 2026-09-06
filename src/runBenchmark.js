import dotenv from "dotenv";
import { createClient } from "redis";

dotenv.config();

const BASE_URL = `http://127.0.0.1:${process.env.PORT || 5001}`;

const ITERATIONS = 100;

const redisClient = createClient({
    url: process.env.REDIS_URL
});

redisClient.on("error", (error) => {
    console.log("Redis Client Error:", error);
});

const sleep = async (ms) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
};

const sendRequest = async (mode) => {
    const url = `${BASE_URL}/generate/${mode}`;

    console.log(`Request: ${url}`);

    const startTime = performance.now();

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
    });

    const endTime = performance.now();

    const contentType = response.headers.get("content-type");

    if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();

        throw new Error(
            `Expected JSON but received ${contentType}. ` +
            `Status: ${response.status}. ` +
            `Response: ${text.substring(0, 200)}`
        );
    }

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Request failed");
    }

    return {
        requestTime: endTime - startTime,
        userInfoTime: parseFloat(data.userInfoTime),
        userStatusTime: parseFloat(data.userStatusTime),
        problemsetTime: parseFloat(data.problemsetTime),
        processingTime: parseFloat(data.processingTime),
        totalTime: parseFloat(data.time),
        problemCount: data.problemCount,
    };
};

const calculateStats = (values) => {
    const sorted = [...values].sort((a, b) => a - b);

    const sum = values.reduce((total, value) => total + value, 0);

    const mean = sum / values.length;

    const median =
        values.length % 2 === 0
            ? (sorted[values.length / 2 - 1] +
                sorted[values.length / 2]) / 2
            : sorted[Math.floor(values.length / 2)];

    const p95Index = Math.ceil(0.95 * values.length) - 1;

    const p95 = sorted[p95Index];

    const variance =
        values.reduce((total, value) => {
            return total + Math.pow(value - mean, 2);
        }, 0) / values.length;

    const standardDeviation = Math.sqrt(variance);

    return {
        mean,
        median,
        p95,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        standardDeviation,
    };
};

const calculateReduction = (withoutCache, withCache) => {
    return ((withoutCache - withCache) / withoutCache) * 100;
};

const calculateSpeedup = (withoutCache, withCache) => {
    return withoutCache / withCache;
};

const printStats = (name, stats) => {
    console.log(`\n${name}`);
    console.log("--------------------------------");

    console.log(`Mean:              ${stats.mean.toFixed(2)} ms`);
    console.log(`Median (P50):      ${stats.median.toFixed(2)} ms`);
    console.log(`P95:               ${stats.p95.toFixed(2)} ms`);
    console.log(`Min:               ${stats.min.toFixed(2)} ms`);
    console.log(`Max:               ${stats.max.toFixed(2)} ms`);
    console.log(
        `Std Deviation:     ${stats.standardDeviation.toFixed(2)} ms`
    );
};

const runBenchmark = async () => {
    try {
        console.log("========================================");
        console.log("Contest Generator Benchmark");
        console.log("========================================");

        await redisClient.connect();

        console.log("\nRedis connected.");

        console.log("\nWarming up...");

        await sendRequest("cache");
        await sendRequest("no-cache");

        await sleep(500);

        console.log("Warm-up completed.");

        const withoutCacheResults = [];
        const withCacheResults = [];

        console.log(`\nRunning ${ITERATIONS} iterations...`);

        for (let i = 0; i < ITERATIONS; i++) {
            console.log(
                `Iteration ${i + 1}/${ITERATIONS}`
            );

            const withoutCacheResult =
                await sendRequest("no-cache");

            withoutCacheResults.push(withoutCacheResult);

            const withCacheResult =
                await sendRequest("cache");

            withCacheResults.push(withCacheResult);
        }

        const withoutCacheTotalTimes =
            withoutCacheResults.map((result) => result.totalTime);

        const withCacheTotalTimes =
            withCacheResults.map((result) => result.totalTime);

        const withoutCacheProblemsetTimes =
            withoutCacheResults.map((result) => result.problemsetTime);

        const withCacheProblemsetTimes =
            withCacheResults.map((result) => result.problemsetTime);

        const withoutCacheStats =
            calculateStats(withoutCacheTotalTimes);

        const withCacheStats =
            calculateStats(withCacheTotalTimes);

        const withoutCacheProblemsetStats =
            calculateStats(withoutCacheProblemsetTimes);

        const withCacheProblemsetStats =
            calculateStats(withCacheProblemsetTimes);

        printStats(
            "WITHOUT REDIS - Total Generation Time",
            withoutCacheStats
        );

        printStats(
            "WITH REDIS - Total Generation Time",
            withCacheStats
        );

        printStats(
            "WITHOUT REDIS - Problemset Retrieval",
            withoutCacheProblemsetStats
        );

        printStats(
            "WITH REDIS - Problemset Retrieval",
            withCacheProblemsetStats
        );

        const totalLatencyReduction = calculateReduction(
            withoutCacheStats.mean,
            withCacheStats.mean
        );

        const problemsetLatencyReduction = calculateReduction(
            withoutCacheProblemsetStats.mean,
            withCacheProblemsetStats.mean
        );

        const speedup = calculateSpeedup(
            withoutCacheStats.mean,
            withCacheStats.mean
        );

        const problemsetSpeedup = calculateSpeedup(
            withoutCacheProblemsetStats.mean,
            withCacheProblemsetStats.mean
        );

        console.log("\n========================================");
        console.log("RESULT");
        console.log("========================================");

        console.log(
            `End-to-end latency reduction: ${totalLatencyReduction.toFixed(2)}%`
        );

        console.log(
            `Problemset latency reduction:  ${problemsetLatencyReduction.toFixed(2)}%`
        );

        console.log(
            `Overall speedup:               ${speedup.toFixed(2)}x`
        );

        console.log(
            `Problemset speedup:            ${problemsetSpeedup.toFixed(2)}x`
        );

        console.log("========================================");

    } catch (error) {
        console.error("\nBenchmark failed:", error.message);
    } finally {
        if (redisClient.isOpen) {
            await redisClient.quit();
        }
    }
};

runBenchmark();