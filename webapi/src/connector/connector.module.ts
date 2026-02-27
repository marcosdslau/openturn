import { Module } from '@nestjs/common';
import { ConnectorController } from './connector.controller';
import { ConnectorService } from './connector.service';
import { WsRelayGateway } from './ws-relay.gateway';
import { RemoteSessionService } from './remote-session.service';
import { RemoteSessionController } from './remote-session.controller';

@Module({
    controllers: [ConnectorController, RemoteSessionController],
    providers: [ConnectorService, WsRelayGateway, RemoteSessionService],
    exports: [ConnectorService, WsRelayGateway, RemoteSessionService],
})
export class ConnectorModule { }
