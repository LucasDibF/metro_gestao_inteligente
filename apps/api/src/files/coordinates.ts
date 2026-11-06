import { BadRequestException } from '@nestjs/common';
import proj4 from 'proj4';
import { technicalInput, text, expectedVersion } from '../technical/technical-input';
/** A validated SIRGAS 2000 UTM coordinate and its geographic position. */
export interface CoordinateInput {
  eastingM: string;
  northingM: string;
  zone: number;
  hemisphere: string;
  datum: 'SIRGAS2000';
  altitudeM: string | null;
  reference: string;
  latitude: number;
  longitude: number;
  version: number | undefined;
}
export function coordinateInput(body: unknown): CoordinateInput {
  const v = technicalInput(body, [
    'eastingM',
    'northingM',
    'zone',
    'hemisphere',
    'datum',
    'altitudeM',
    'reference',
    'version',
  ]);
  const decimal = (value: unknown, min: number, max: number) => {
    if (
      typeof value !== 'string' ||
      !/^-?\d{1,8}(\.\d{1,2})?$/.test(value) ||
      Number(value) < min ||
      Number(value) > max
    )
      throw new BadRequestException('Invalid coordinate');
    return value;
  };
  const eastingM = decimal(v.eastingM, 100000, 900000),
    northingM = decimal(v.northingM, 0, 10000000);
  if (
    !Number.isInteger(v.zone) ||
    Number(v.zone) < 1 ||
    Number(v.zone) > 60 ||
    !['N', 'S'].includes(String(v.hemisphere)) ||
    v.datum !== 'SIRGAS2000'
  )
    throw new BadRequestException('Invalid coordinate reference system');
  const zone = Number(v.zone),
    hemisphere = String(v.hemisphere);
  const [longitude, latitude] = proj4(
    `+proj=utm +zone=${zone} ${hemisphere === 'S' ? '+south' : ''} +ellps=GRS80 +towgs84=0,0,0 +units=m +no_defs`,
    'EPSG:4326',
    [Number(eastingM), Number(northingM)],
  );
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -80 ||
    latitude > 84 ||
    (hemisphere === 'S' && latitude > 0.00001) ||
    (hemisphere === 'N' && latitude < -0.00001)
  )
    throw new BadRequestException('Coordinate outside UTM domain');
  return {
    eastingM,
    northingM,
    zone,
    hemisphere,
    datum: 'SIRGAS2000',
    altitudeM: v.altitudeM == null || v.altitudeM === '' ? null : decimal(v.altitudeM, -500, 9000),
    reference: text(v.reference, 500),
    latitude,
    longitude,
    version: v.version === undefined ? undefined : expectedVersion(v.version),
  };
}
export function photoDistance(
  official: { eastingM: unknown; northingM: unknown; zone: number; hemisphere: string },
  latitude: number,
  longitude: number,
): number {
  const [east, north] = proj4(
    'EPSG:4326',
    `+proj=utm +zone=${official.zone} ${official.hemisphere === 'S' ? '+south' : ''} +ellps=GRS80 +towgs84=0,0,0 +units=m +no_defs`,
    [longitude, latitude],
  );
  return Math.hypot(east - Number(official.eastingM), north - Number(official.northingM));
}
