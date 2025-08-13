import { Module, forwardRef } from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import IORedis, { RedisOptions } from "ioredis";
import { EXEC_QUEUE, EXEC_WORKER } from "./queue.tokens";
import { EngineModule } from "../engine/engine.module";
import { EngineService } from "../engine/engine.service";

/**
 * Prefer REDIS_URL=rediss://default:PASSWORD@HOST:PORT
 * If REDIS_URL is not set (or contains unescaped characters), we fall back to host/port/password envs.
 */
function makeRedis(): IORedis {
    const url = process.env.REDIS_URL;
    if (url && (url.startsWith("rediss://") || url.startsWith("redis://"))) {
        const u = new URL(url);
        const isTls = u.protocol === "rediss:";
        const client = new IORedis(url, {
            maxRetriesPerRequest: null,
            ...(isTls
                ? {
                    tls: {
                        servername: u.hostname,     // SNI required
                        minVersion: "TLSv1.2",
                    },
                }
                : {}),
        });
        return client;
    }

    // Fallback: explicit options (no URL-encoding issues)
    const host = process.env.UPSTASH_REDIS_HOST ?? "informed-elf-14436.upstash.io";
    const port = Number(process.env.UPSTASH_REDIS_PORT ?? 6379);
    const username = process.env.UPSTASH_REDIS_USERNAME ?? "default";
    const password = process.env.UPSTASH_REDIS_PASSWORD;
    if (!password) {
        throw new Error("Missing Redis credentials. Set REDIS_URL or UPSTASH_REDIS_PASSWORD in .env");
    }
    const opts: RedisOptions = {
        host,
        port,
        username,
        password,
        maxRetriesPerRequest: null,
        tls: {
            servername: host,               // SNI
            minVersion: "TLSv1.2",
        },
    };
    return new IORedis(opts);
}

const redis = makeRedis();
redis.on("connect", () => console.log("[Redis] connected"));
redis.on("error", (e) => console.error("[Redis] error:", e?.message));

@Module({
    imports: [forwardRef(() => EngineModule)],
    providers: [
        {
            provide: EXEC_QUEUE,
            useFactory: () => new Queue("executeNode", { connection: redis }),
        },
        {
            provide: EXEC_WORKER,
            inject: [EngineService],
            useFactory: (engine: EngineService) =>
                new Worker(
                    "executeNode",
                    async (job) => {
                        const { runId, nodeId } = job.data as { runId: string; nodeId: string };
                        await engine.process(runId, nodeId);
                    },
                    { connection: redis, concurrency: 20 }
                ),
        },
    ],
    exports: [EXEC_QUEUE],
})
export class QueueModule { }
