import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

// NOTE — small deviation from the original spec ("GET ?polygon=GeoJSON"):
// we accept POST with a JSON body so non-trivial polygons fit. The handler
// is documented as "POST /properties/overlap-check" in Swagger.
export class OverlapCheckDto {
  @ApiProperty({
    description: 'GeoJSON Polygon to test for intersections with approved parcels.',
  })
  @IsObject()
  polygon!: unknown;
}
