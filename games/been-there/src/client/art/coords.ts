// Where the 22 cities are. On its own so the server can use it (the weather) without the world map.

/** [latitude, longitude] of each city centre. */
export const COORDS: Record<string, [number, number]> = {
  cairo: [30.04, 31.24],
  capetown: [-33.92, 18.42],
  buenosaires: [-34.6, -58.38],
  mexicocity: [19.43, -99.13],
  rio: [-22.91, -43.17],
  istanbul: [41.01, 28.98],
  mumbai: [19.08, 72.88],
  dubai: [25.2, 55.27],
  lasvegas: [36.17, -115.14],
  vancouver: [49.28, -123.12],
  newyork: [40.71, -74.01],
  tokyo: [35.68, 139.69],
  beijing: [39.9, 116.41],
  shanghai: [31.23, 121.47],
  bangkok: [13.76, 100.5],
  sydney: [-33.87, 151.21],
  singapore: [1.35, 103.82],
  venice: [45.44, 12.32],
  paris: [48.86, 2.35],
  london: [51.51, -0.13],
  seoul: [37.57, 126.98],
  hongkong: [22.32, 114.17],
};
