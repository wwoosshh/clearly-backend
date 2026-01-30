import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AdminCronService {
  private readonly logger = new Logger(AdminCronService.name);
}
