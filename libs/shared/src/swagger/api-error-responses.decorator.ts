import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiProperty,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';

class PaginatedMetaDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  totalPages!: number;
}

export function ApiErrorResponses(): MethodDecorator {
  return applyDecorators(
    ApiResponse({ status: 400, description: 'Bad Request' }),
    ApiResponse({ status: 401, description: 'Unauthorized' }),
    ApiResponse({ status: 403, description: 'Forbidden' }),
    ApiResponse({ status: 422, description: 'Validation Error' }),
    ApiResponse({ status: 500, description: 'Internal Server Error' }),
  );
}

export function ApiPaginatedResponse<T>(dto: Type<T>): MethodDecorator {
  return applyDecorators(
    ApiExtraModels(dto, PaginatedMetaDto),
    ApiOkResponse({
      schema: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { $ref: getSchemaPath(dto) },
          },
          meta: { $ref: getSchemaPath(PaginatedMetaDto) },
        },
      },
    }),
  );
}
