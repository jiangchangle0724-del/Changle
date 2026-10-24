// One small picture per city, drawn on a 24 × 24 grid: used on passport stamps, deeds and the board.
// Each one is the city's rule in a glance (a drop of water for Cape Town, a die for Las Vegas).

export const CITY_ICON: Record<string, string> = {
  // a stepped pyramid
  cairo: "M12 3L22 20H2zM7 14h10M5 17h14M9.4 10.7h5.2",
  // the last drop
  capetown: "M12 2.5C9 7.5 6 10.6 6 14.6a6 6 0 0 0 12 0C18 10.6 15 7.5 12 2.5z",
  // a tango shoe
  buenosaires: "M3 12.5c3 .6 6.5 1 9 3.2l2.6 2.3H21c.6 0 1-.4 1-1v-.6c0-2.6-3-3-5.2-3.6C13.6 12 10.2 8 7 7L3 8.6zM4.2 12.7V21h1.6l.8-7.6",
  // a car with a number plate
  mexicocity: "M4 15l1.6-5c.3-.9 1.1-1.5 2-1.5h8.8c.9 0 1.7.6 2 1.5L20 15v4.5h-2.4V18H6.4v1.5H4zM6.6 13.4h10.8l-1-3.2H7.6zM9 15h6v2H9z",
  // a judge's score card
  rio: "M5 3h14v14H5zM12 17v5M8.5 22h7M9 7.5v6M11.6 10.5a2.4 3 0 1 0 4.8 0a2.4 3 0 1 0-4.8 0",
  // a dome and minaret
  istanbul: "M5 21v-6h10v6zM6 15a4 4 0 0 1 8 0M10 9.6V8M18 21V7.5l1-2.5l1 2.5V21z",
  // a stacked tiffin carrier
  mumbai: "M7 8h10v3.6H7zM7 12.6h10v3.6H7zM7 17.2h10V21H7zM9 8V5.5a3 3 0 0 1 6 0V8",
  // a telescope on a stand
  dubai: "M3.6 10.4l13-5.6l2 4.4l-13 5.6zM16.6 4.8l2.8-1.2l2 4.4l-2.8 1.2zM10.5 12.6L7 21M11.5 12.2L16 21",
  // a die showing five
  lasvegas: "M5 5h14v14H5zM8.6 8.6h.01M15.4 8.6h.01M12 12h.01M8.6 15.4h.01M15.4 15.4h.01",
  // an empty house
  vancouver: "M3.5 11.5L12 4l8.5 7.5M6 10v10h12V10M10 20v-5h4v5",
  // a raised hand voting
  newyork: "M8 13V6.5a1.5 1.5 0 0 1 3 0V12V4.5a1.5 1.5 0 0 1 3 0V12V5.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6 7c-2.6 0-4-1.4-5.4-3.4L3.6 14.4c-.8-1.2.9-2.6 2-1.6z",
  // a commuter train, front on
  tokyo: "M6 3h12c1.1 0 2 .9 2 2v11c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2zM6 6h12v5H6zM8 15h.01M16 15h.01M7 18l-2 3M17 18l2 3",
  // a city gate with a double roof
  beijing: "M2 8h20l-2-3H4zM4 12h16l-1.6-2.4H5.6zM6 12v9M18 12v9M10 21v-5h4v5M6 16h12",
  // a sorting bin
  shanghai: "M5 7h14M9.5 7V4.5h5V7M6.6 7l1.2 14h8.4l1.2-14M10 11v6M14 11v6",
  // a splash of water
  bangkok: "M12 3c-2.2 3.6-4.4 6-4.4 8.8a4.4 4.4 0 0 0 8.8 0C16.4 9 14.2 6.6 12 3zM4 16c-1 1.6-1.6 2.6-1.6 3.6a1.6 1.6 0 0 0 3.2 0c0-1-.6-2-1.6-3.6zM20 15c-1 1.6-1.6 2.6-1.6 3.6a1.6 1.6 0 0 0 3.2 0c0-1-.6-2-1.6-3.6z",
  // arrows turning round
  sydney: "M19 12a7 7 0 0 1-12 5M5 12a7 7 0 0 1 12-5M17 3.5V7h-3.5M7 20.5V17h3.5",
  // a permit ticket
  singapore: "M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM9 7v10",
  // a gondola
  venice: "M2 14c3 3 7 4 10 4s7-1 10-4c-2 1-6 1.6-10 1.6S4 15 2 14zM20.6 11l1.4-1.4M20 9.4h2M7 13V7.6l2-1.6",
  // a shopping bag
  paris: "M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2M9 13l6 4M15 13l-6 4",
  // a cup of coffee, where Lloyd's began
  london: "M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M3 21h14M8 3.5c-1 1.6 1 2.4 0 4M12 3.5c-1 1.6 1 2.4 0 4",
  // headphones: the listening exam
  seoul: "M4 15v-3a8 8 0 0 1 16 0v3M4 14h3v6H4zM17 14h3v6h-3z",
  // typhoon signal No. 8
  hongkong: "M12 3l9 15H3zM12 7.5v0M10.4 13.4a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0M10 16.5a2 1.8 0 1 0 4 0a2 1.8 0 1 0-4 0",
};

/** Draw a city icon at (x, y), size s; stroke-only line art in the given colour. */
export function CityGlyph({ id, x = 0, y = 0, size = 24, color = "currentColor", width = 1.8 }: { id: string; x?: number; y?: number; size?: number; color?: string; width?: number }) {
  const k = size / 24;
  return (
    <path
      d={CITY_ICON[id] ?? ""}
      transform={`translate(${x} ${y}) scale(${k})`}
      fill="none"
      stroke={color}
      stroke-width={width / k}
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  );
}

/** Icons for the spaces that aren't cities (same 24 × 24 grid). */
export const SPACE_ICON: Record<string, string> = {
  // Departure: a plane taking off
  go: "M2.5 19h19M5 13.4l2.4-1 3 1.6 3.8-2.4-5.4-4.2 2-1 7.2 3.2 2.8-1.6c1-.6 2.2-.2 2.4.6.2.8-.4 1.6-1.4 2.2L8.6 16.4z",
  // Immigration: a passport with a stamp
  immigration: "M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6zM9 8.6a3 3 0 1 0 6 0a3 3 0 1 0-6 0M9 15h6M9 17.6h4",
  // Transit lounge: a cup with steam
  lounge: "M5 10h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 11h1.5a2.5 2.5 0 0 1 0 5H16M8.4 3.5c-.8 1.4.8 2.2 0 3.6M12.4 3.5c-.8 1.4.8 2.2 0 3.6M4 21h13",
  // Passport expired: a passport crossed out
  expired: "M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6zM4 4l17 17M9 8.6a3 3 0 1 0 6 0",
  // a plane for flight routes
  route: "M21 15.5v-2l-8-5V3.6a1.6 1.6 0 0 0-3.2 0V8.5l-8 5v2l8-2.5V18l-2 1.5V21l3.6-1 3.6 1v-1.5l-2-1.5v-5z",
  // currency exchange
  exchange: "M4 8h13l-3-3M20 16H7l3 3M12 9.5v5",
  // a travel SIM card
  esim: "M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM9 11h6v6H9zM12 11v6M9 14h6",
  // journey card: a compass
  journey: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M15.5 8.5l-2 5-5 2 2-5z",
  // postcard
  postcard: "M3 6h18v12H3zM13 6v12M15.5 9h3v3h-3M5.5 10h5M5.5 13h5",
  // departure tax
  departure: "M12 3v18M16 7.5c0-1.6-1.8-2.5-4-2.5s-4 1-4 2.8c0 4.2 8 2.4 8 6.6c0 1.8-1.8 2.8-4 2.8s-4-1-4-2.6",
  // excess baggage: a suitcase
  baggage: "M4 8h16v12H4zM9 8V5h6v3M8 8v12M16 8v12",
};

export function SpaceGlyph({ name, x = 0, y = 0, size = 24, color = "currentColor", width = 1.8 }: { name: string; x?: number; y?: number; size?: number; color?: string; width?: number }) {
  const k = size / 24;
  return (
    <path
      d={SPACE_ICON[name] ?? ""}
      transform={`translate(${x} ${y}) scale(${k})`}
      fill="none"
      stroke={color}
      stroke-width={width / k}
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  );
}
