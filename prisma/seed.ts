import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
    // Example 1: Lead follow-up
    await prisma.workflow.upsert({
        where: { id: "lead-followup" },
        update: {},
        create: {
            id: "lead-followup",
            name: "LinkedIn >75 Lead Follow-up",
            triggerRule: {
                and: [
                    { "==": [{ var: "lead.source" }, "LinkedIn"] },
                    { ">": [{ var: "lead.score" }, 75] }
                ]
            } as any,
            graph: {
                nodes: [
                    { id: "n1", type: "NOTIFY", name: "Notify AE", config: { channel: "console", msg: "Hot lead {{lead.name}} ({{lead.email}})" } },
                    { id: "n2", type: "WAIT", name: "Wait 24h", config: { hours: 24 } },
                    { id: "n3", type: "EMAIL", name: "Follow-up Email", config: { to: "{{lead.email}}", subject: "Following up", body: "Hey {{lead.name}}, checking in!" } },
                    { id: "n4", type: "IF", name: "Is CEO?", config: { rule: { in: ["CEO", { var: "lead.title" }] } } },
                    { id: "n5", type: "API_CALL", name: "Gifting", config: { method: "POST", url: "https://httpbin.org/post", bodyTemplate: "{\"lead\":\"{{lead.email}}\",\"gift\":\"mug\"}" } },
                    { id: "n6", type: "API_CALL", name: "Drip", config: { method: "POST", url: "https://httpbin.org/post", bodyTemplate: "{\"campaign\":\"dripA\",\"to\":\"{{lead.email}}\"}" } }
                ],
                edges: [
                    { id: "e1", source: "n1", target: "n2" },
                    { id: "e2", source: "n2", target: "n3" },
                    { id: "e3", source: "n3", target: "n4" },
                    { id: "e4", source: "n4", target: "n5", predicate: "then" },
                    { id: "e5", source: "n4", target: "n6", predicate: "else" }
                ]
            } as any
        }
    });

    // Example 2: Temperature control (manual run)
    await prisma.workflow.upsert({
        where: { id: "temperature-control" },
        update: {},
        create: {
            id: "temperature-control",
            name: "Temperature Control",
            graph: {
                nodes: [
                    { id: "t1", type: "API_CALL", name: "Turn on AC", config: { method: "POST", url: "https://httpbin.org/post", bodyTemplate: "{\"ac\":\"on\"}" } },
                    { id: "t2", type: "WAIT", name: "Wait 5 min", config: { minutes: 5 } },
                    { id: "t3", type: "IF", name: "Still >30?", config: { rule: { ">": [{ var: "sensor.tempC" }, 30] } } },
                    { id: "t4", type: "NOTIFY", name: "Notify Manager", config: { channel: "console", msg: "Temp still high; pinging manager" } },
                    { id: "t5", type: "WAIT", name: "Wait 10 min", config: { minutes: 10 } },
                    { id: "t6", type: "IF", name: "Manager ack?", config: { rule: { "==": [{ var: "manager.ack" }, true] } } },
                    { id: "t7", type: "API_CALL", name: "Backup Cooling", config: { method: "POST", url: "https://httpbin.org/post", bodyTemplate: "{\"backup\":\"on\"}" } }
                ],
                edges: [
                    { id: "te1", source: "t1", target: "t2" },
                    { id: "te2", source: "t2", target: "t3" },
                    { id: "te3", source: "t3", target: "t4", predicate: "then" },
                    { id: "te4", source: "t3", target: "t6", predicate: "else" },   // if not >30 just check ack node (edge-case)
                    { id: "te5", source: "t4", target: "t5" },
                    { id: "te6", source: "t5", target: "t6" },
                    { id: "te7", source: "t6", target: "t7", predicate: "else" }
                ]
            } as any
        }
    });
}

main().finally(() => prisma.$disconnect());
