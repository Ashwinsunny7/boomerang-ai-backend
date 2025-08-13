export type NodeType = "NOTIFY" | "EMAIL" | "API_CALL" | "WAIT" | "IF";
export type Edge = { id: string; source: string; target: string; predicate?: string };
export type NodeBase<T = any> = { id: string; type: NodeType; name?: string; config: T };
export type WorkflowGraph = { nodes: NodeBase[]; edges: Edge[] };

export interface ExecutorCtx {
    runId: string; workflowId: string; nodeId: string;
    input: any; bag: Record<string, any>;
    emit: (log: { level: "INFO" | "WARN" | "ERROR"; message: string; details?: any }) => Promise<void>;
    getNextEdges: (predicate?: string) => string[]; // returns next node IDs
}

export interface NodeExecutor<C = any> {
    type: NodeType;
    validate: (config: C) => void;
    execute: (config: C, ctx: ExecutorCtx) => Promise<
        | { status: "OK"; next?: string[] }
        | { status: "WAIT"; resumeAt: Date; next?: string[] }
        | { status: "END" }
    >;
}
