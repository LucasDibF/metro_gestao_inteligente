import proj4 from 'proj4';
export interface InpeMapData {
  zone: number;
  hemisphere: string;
  view?: { centerX: number; centerY: number; spanM: number };
  points: Array<{ x: number; y: number }>;
}
export function inpeProjection(map: InpeMapData) {
  if (
    !map.points.length ||
    !Number.isInteger(map.zone) ||
    map.zone < 1 ||
    map.zone > 60 ||
    !['S', 'N'].includes(map.hemisphere)
  )
    throw Error('Invalid map');
  const view = map.view ?? {
    centerX:
      (Math.min(...map.points.map((p) => p.x)) + Math.max(...map.points.map((p) => p.x))) / 2,
    centerY:
      (Math.min(...map.points.map((p) => p.y)) + Math.max(...map.points.map((p) => p.y))) / 2,
    spanM:
      Math.max(
        Math.max(...map.points.map((p) => p.x)) - Math.min(...map.points.map((p) => p.x)),
        Math.max(...map.points.map((p) => p.y)) - Math.min(...map.points.map((p) => p.y)),
        20,
      ) * 1.3,
  };
  if (!Object.values(view).every(Number.isFinite) || view.spanM <= 0 || view.spanM > 1500)
    throw Error('Unsupported extent');
  const utm = `+proj=utm +zone=${map.zone} ${map.hemisphere === 'S' ? '+south' : ''} +ellps=GRS80 +towgs84=0,0,0 +units=m +no_defs`;
  const geographic = proj4(utm, 'EPSG:4326');
  const utmAt = (x: number, y: number) => [
    view.centerX + ((x - 300) / 420) * view.spanM,
    view.centerY - ((y - 260) / 420) * view.spanM,
  ];
  const geographicCorners = [
    [0, 0],
    [600, 0],
    [0, 520],
    [600, 520],
  ].map(([x, y]) => geographic.forward(utmAt(x, y)));
  if (geographicCorners.some((p) => !p.every(Number.isFinite) || Math.abs(p[1]) > 85))
    throw Error('Unsupported extent');
  return {
    view,
    utm,
    utmAt,
    bbox: [
      Math.min(...geographicCorners.map((p) => p[0])),
      Math.min(...geographicCorners.map((p) => p[1])),
      Math.max(...geographicCorners.map((p) => p[0])),
      Math.max(...geographicCorners.map((p) => p[1])),
    ],
  };
}
/** Approximation checked against exact projection before use; error must be < 2 cm. */
export function sourceGrid(map: InpeMapData, epsg: number) {
  const p = inpeProjection(map);
  const zone = epsg % 100;
  if (!((epsg >= 32601 && epsg <= 32660) || (epsg >= 32701 && epsg <= 32760)))
    throw Error('Unsupported image CRS');
  const project = proj4(
    p.utm,
    `+proj=utm +zone=${zone} ${epsg >= 32700 ? '+south' : ''} +datum=WGS84 +units=m +no_defs`,
  );
  const corners = [
    [0, 0],
    [600, 0],
    [0, 520],
    [600, 520],
  ].map(([x, y]) => project.forward(p.utmAt(x, y)));
  const at = (x: number, y: number) =>
    [0, 1].map(
      (i) =>
        (corners[0][i] * (1 - x / 600) + (corners[1][i] * x) / 600) * (1 - y / 520) +
        ((corners[2][i] * (1 - x / 600) + (corners[3][i] * x) / 600) * y) / 520,
    );
  for (const x of [0, 150, 300, 450, 600])
    for (const y of [0, 130, 260, 390, 520]) {
      const exact = project.forward(p.utmAt(x, y)),
        approx = at(x, y);
      if (Math.hypot(exact[0] - approx[0], exact[1] - approx[1]) > 0.02)
        throw Error('Projection approximation outside tolerance');
    }
  return { corners, at };
}
