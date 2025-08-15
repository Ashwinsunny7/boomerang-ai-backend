import { Body, Controller, Get, Post } from '@nestjs/common';
import { ActionsService } from './actions.service';

@Controller('actions')
export class ActionsController {
    constructor(private actions: ActionsService) { }

    @Get()
    list() {
        return this.actions.list();
    }

    @Post()
    create(@Body() dto: any) {
        // you can add a simple admin guard here if you want
        return this.actions.create(dto);
    }
}
