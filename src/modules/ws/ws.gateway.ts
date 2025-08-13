import { WebSocketGateway, WebSocketServer, SubscribeMessage, ConnectedSocket, MessageBody } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: process.env.CORS_ORIGIN?.split(',') ?? true } })
export class WsGateway {
    @WebSocketServer() server: Server;

    @SubscribeMessage('join')
    handleJoin(@ConnectedSocket() socket: Socket, @MessageBody() { runId }: any) {
        socket.join(runId);
        socket.emit('joined', { runId });
    }

    emitNodeStarted(runId: string, nodeId: string) {
        this.server.to(runId).emit('node:started', { runId, nodeId });
    }
    emitNodeCompleted(runId: string, nodeId: string, status: string) {
        this.server.to(runId).emit('node:completed', { runId, nodeId, status });
    }
    emitRunStatus(runId: string, status: string) {
        this.server.to(runId).emit('run:status', { runId, status });
    }
    emitLog(runId: string, nodeId: string | null, payload: any) {
        this.server.to(runId).emit('log', { runId, nodeId, ...payload });
    }
}
