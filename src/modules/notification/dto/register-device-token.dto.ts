import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEnum } from 'class-validator';
import { DevicePlatform } from '@prisma/client';

export class RegisterDeviceTokenDto {
  @ApiProperty({ description: 'FCM 디바이스 토큰' })
  @IsString()
  @IsNotEmpty({ message: '토큰을 입력해주세요.' })
  token: string;

  @ApiProperty({ description: '디바이스 플랫폼', enum: DevicePlatform })
  @IsEnum(DevicePlatform, { message: '유효한 플랫폼을 선택해주세요.' })
  platform: DevicePlatform;
}

export class UnregisterDeviceTokenDto {
  @ApiProperty({ description: '해제할 FCM 디바이스 토큰' })
  @IsString()
  @IsNotEmpty({ message: '토큰을 입력해주세요.' })
  token: string;
}
