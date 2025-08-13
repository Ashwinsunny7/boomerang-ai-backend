import { z } from "zod";
import * as jsonLogic from 'json-logic-js';
import axios from "axios";
import { NodeExecutor } from "../types/workflow";

export const registry = new Map<string, NodeExecutor>();

// ---- helpers
const render = (tpl: string | undefined, scope: any) =>
    tpl ? tpl.replace(/\{\{([^}]+)\}\}/g, (_, k) => String(k.split(".").reduce((a, c) => a?.[c], scope) ?? "")) : undefined;

// ---- IF
const IfCfg = z.object({ rule: z.any() });
registry.set("IF", {
    type: "IF",
    validate: (c) => IfCfg.parse(c),
    execute: async (config, ctx) => {
        const result = jsonLogic.apply(config.rule, { ...ctx.input, ...ctx.bag });
        await ctx.emit({ level: "INFO", message: "IF evaluated", details: { result } });
        const next = ctx.getNextEdges(result ? "then" : "else");
        return { status: "OK", next };
    },
});

// ---- WAIT
const WaitCfg = z.object({ ms: z.number().optional(), seconds: z.number().optional(), minutes: z.number().optional(), hours: z.number().optional(), until: z.string().optional() });
registry.set("WAIT", {
    type: "WAIT",
    validate: (c) => WaitCfg.parse(c),
    execute: async (config) => {
        const ms = config.ms ?? (config.seconds ?? 0) * 1_000 + (config.minutes ?? 0) * 60_000 + (config.hours ?? 0) * 3_600_000;
        const resumeAt = config.until ? new Date(config.until) : new Date(Date.now() + ms);
        return { status: "WAIT", resumeAt };
    },
});

// ---- API_CALL
const ApiCfg = z.object({
    method: z.enum(["GET", "POST", "PUT", "DELETE"]).default("POST"),
    url: z.string().url(),
    headers: z.record(z.string(), z.string()).optional(),
    bodyTemplate: z.string().optional(),
    timeoutMs: z.number().optional(),
});

registry.set("API_CALL", {
    type: "API_CALL",
    validate: (c) => ApiCfg.parse(c),
    execute: async (config, ctx) => {
        const data = render(config.bodyTemplate, { ...ctx.input, ...ctx.bag });
        const res = await axios.request({
            method: config.method, url: config.url, data, headers: config.headers,
            timeout: config.timeoutMs ?? 15000, validateStatus: () => true
        });
        await ctx.emit({ level: "INFO", message: "API response", details: { status: res.status } });
        if (res.status >= 200 && res.status < 300) {
            ctx.bag[`node:${ctx.nodeId}:response`] = res.data;
            return { status: "OK" };
        }
        throw new Error(`HTTP_${res.status}`);
    },
});

// ---- NOTIFY (console stub)
const NotifyCfg = z.object({ channel: z.string().default("console"), msg: z.string() });
registry.set("NOTIFY", {
    type: "NOTIFY",
    validate: (c) => NotifyCfg.parse(c),
    execute: async (config, ctx) => {
        await ctx.emit({ level: "INFO", message: `NOTIFY ${config.channel}: ${render(config.msg, { ...ctx.input, ...ctx.bag })}` });
        return { status: "OK" };
    },
});

// ---- EMAIL (stub)
const EmailCfg = z.object({ to: z.string(), subject: z.string().default(""), body: z.string().default("") });
registry.set("EMAIL", {
    type: "EMAIL",
    validate: (c) => EmailCfg.parse(c),
    execute: async (config, ctx) => {
        await ctx.emit({ level: "INFO", message: `EMAIL queued to ${render(config.to, { ...ctx.input, ...ctx.bag })}`, details: { subject: config.subject } });
        return { status: "OK" };
    },
});
