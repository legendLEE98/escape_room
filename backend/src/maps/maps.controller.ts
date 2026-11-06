import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MapsService } from './maps.service';
import { DeployService } from './deploy.service';
import { UserAuthGuard } from '../auth/auth.guard';
import type { AuthedRequest } from '../auth/auth.guard';
import type { MapLayoutDto } from './dto/map-layout.dto';

// Map authoring: registered users only, and only their own maps.
@Controller('maps')
@UseGuards(UserAuthGuard)
export class MapsController {
  constructor(
    private readonly mapsService: MapsService,
    private readonly deployService: DeployService,
  ) {}

  @Get()
  listMaps(@Req() req: AuthedRequest) {
    return this.mapsService.listMaps(req.auth.sub);
  }

  @Post()
  createMap(
    @Req() req: AuthedRequest,
    @Body()
    body: {
      title: string;
      difficulty?: number;
      minUser?: number;
      maxUser?: number;
    },
  ) {
    return this.mapsService.createMap(req.auth.sub, body);
  }

  @Get(':id')
  getMapInfo(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.mapsService.getMapInfo(id, req.auth.sub);
  }

  @Patch(':id')
  updateMapInfo(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body()
    body: Partial<{
      title: string;
      difficulty: number;
      minUser: number;
      maxUser: number;
      mapDesc: string;
    }>,
  ) {
    return this.mapsService.updateMapInfo(id, req.auth.sub, {
      title: body.title,
      difficulty: body.difficulty,
      min_user: body.minUser,
      max_user: body.maxUser,
      map_desc: body.mapDesc,
    });
  }

  // Cascades through map_room/map_object/map_door/map_door_edge/map_interaction
  // via the FKs in db/schema.sql — nothing else to clean up by hand.
  @Delete(':id')
  @HttpCode(204)
  async deleteMap(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.mapsService.deleteMap(id, req.auth.sub);
  }

  // Snapshots the saved working copy and shares it by code. Responds with the
  // (stable) share code and the new version number.
  @Post(':id/deploy')
  deploy(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.deployService.deploy(id, req.auth.sub);
  }

  @Delete(':id/deploy')
  @HttpCode(204)
  async undeploy(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.deployService.undeploy(id, req.auth.sub);
  }

  @Get(':id/layout')
  getLayout(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.mapsService.loadLayout(id, req.auth.sub);
  }

  @Put(':id/layout')
  putLayout(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: MapLayoutDto,
  ) {
    if (!Array.isArray(body?.rooms)) {
      throw new BadRequestException('Request body must be { rooms: [...] }');
    }
    return this.mapsService.saveLayout(id, req.auth.sub, body);
  }
}
