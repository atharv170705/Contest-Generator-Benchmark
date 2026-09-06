import axios from "axios";

const PROBLEMSET_CACHE_KEY = "cf:problemset";
const PROBLEMSET_CACHE_TTL = 60 * 60 * 24;

const getProblemsWithoutCache = async () => {
    const problemsRes = await axios.get(
        "https://codeforces.com/api/problemset.problems"
    );

    return problemsRes.data.result.problems;
};

const getProblemsWithCache = async (redisClient) => {
    try {
        const cachedProblems = await redisClient.get(PROBLEMSET_CACHE_KEY);

        if (cachedProblems) {
            return JSON.parse(cachedProblems);
        }

        const problemsRes = await axios.get(
            "https://codeforces.com/api/problemset.problems"
        );

        const problems = problemsRes.data.result.problems;

        await redisClient.set(
            PROBLEMSET_CACHE_KEY,
            JSON.stringify(problems),
            "EX",
            PROBLEMSET_CACHE_TTL
        );

        return problems;
    } catch (error) {
        console.error("Redis error:", error.message);

        const problemsRes = await axios.get(
            "https://codeforces.com/api/problemset.problems"
        );

        return problemsRes.data.result.problems;
    }
};

const generateContest = async (useCache, redisClient) => {
    const handle = process.env.CF_HANDLE;

    const startTime = performance.now();

    const userStartTime = performance.now();

    const userRes = await axios.get(
        `https://codeforces.com/api/user.info?handles=${handle}`
    );

    const userEndTime = performance.now();

    const statusStartTime = performance.now();

    const statusRes = await axios.get(
        `https://codeforces.com/api/user.status?handle=${handle}`
    );

    const statusEndTime = performance.now();

    const problemsetStartTime = performance.now();

    let problems;

    if (useCache) {
        problems = await getProblemsWithCache(redisClient);
    } else {
        problems = await getProblemsWithoutCache();
    }

    const problemsetEndTime = performance.now();

    const processingStartTime = performance.now();

    const user = userRes.data.result[0];
    const submissions = statusRes.data.result;

    const solved = new Set();

    for (const sub of submissions) {
        if (sub.verdict === "OK") {
            solved.add(`${sub.problem.contestId}-${sub.problem.index}`);
        }
    }

    let userRating = user.rating || 1000;

    const difficulty = "medium";
    const tags = [];

    let targetRatings;

    if (difficulty === "easy") {
        targetRatings = [
            userRating - 300,
            userRating - 200,
            userRating - 100,
            userRating,
        ];
    } else if (difficulty === "hard") {
        targetRatings = [
            userRating,
            userRating + 100,
            userRating + 200,
            userRating + 300,
            userRating + 400,
        ];
    } else {
        targetRatings = [
            userRating - 200,
            userRating - 100,
            userRating,
            userRating + 100,
            userRating + 200,
        ];
    }

    const selectedProblems = [];
    const used = new Set();

    for (const target of targetRatings) {
        const candidates = problems.filter((problem) => {
            const key = `${problem.contestId}-${problem.index}`;

            const tagMatch =
                tags.length === 0 ||
                problem.tags.some((tag) => tags.includes(tag));

            return (
                !solved.has(key) &&
                !used.has(key) &&
                problem.rating &&
                Math.abs(problem.rating - target) <= 100 &&
                tagMatch
            );
        });

        if (candidates.length === 0) {
            continue;
        }

        const chosen =
            candidates[Math.floor(Math.random() * candidates.length)];

        selectedProblems.push(chosen);
        used.add(`${chosen.contestId}-${chosen.index}`);
    }

    const processingEndTime = performance.now();

    const endTime = performance.now();

    return {
        time: endTime - startTime,
        userInfoTime: userEndTime - userStartTime,
        userStatusTime: statusEndTime - statusStartTime,
        problemsetTime: problemsetEndTime - problemsetStartTime,
        processingTime: processingEndTime - processingStartTime,
        problemCount: problems.length,
        selectedProblems: selectedProblems.length,
    };
};

const generateWithoutCache = async (req, res) => {
    try {
        const result = await generateContest(false, null);

        return res.status(200).json({
            mode: "without-cache",
            time: `${result.time.toFixed(2)} ms`,
            userInfoTime: `${result.userInfoTime.toFixed(2)} ms`,
            userStatusTime: `${result.userStatusTime.toFixed(2)} ms`,
            problemsetTime: `${result.problemsetTime.toFixed(2)} ms`,
            processingTime: `${result.processingTime.toFixed(2)} ms`,
            problemCount: result.problemCount,
            selectedProblems: result.selectedProblems,
        });
    } catch (error) {
        console.error("Benchmark error:", error.message);

        return res.status(500).json({
            error: "Failed to generate contest without cache",
        });
    }
};

const generateWithCache = async (req, res) => {
    try {
        const result = await generateContest(true, req.app.locals.redisClient);

        return res.status(200).json({
            mode: "with-cache",
            time: `${result.time.toFixed(2)} ms`,
            userInfoTime: `${result.userInfoTime.toFixed(2)} ms`,
            userStatusTime: `${result.userStatusTime.toFixed(2)} ms`,
            problemsetTime: `${result.problemsetTime.toFixed(2)} ms`,
            processingTime: `${result.processingTime.toFixed(2)} ms`,
            problemCount: result.problemCount,
            selectedProblems: result.selectedProblems,
        });
    } catch (error) {
        console.error("Benchmark error:", error.message);

        return res.status(500).json({
            error: "Failed to generate contest with cache",
        });
    }
};

export {
    generateWithoutCache,
    generateWithCache,
};