// The real night on the boards (the big screen's globe, the phone's map): where the sun is, and where it has set.
import assert from "node:assert/strict";
import { test } from "node:test";
import { isNight, nightPath } from "../src/client/art/geo";
import { subsolar } from "../src/client/globe/sun";

const near = (got: number, want: number, within: number) => assert.ok(Math.abs(got - want) <= within, `${got.toFixed(2)} is not within ${within} of ${want}`);

test("the sun is overhead at the tropics at the solstices, and at the equator at the equinoxes", () => {
  near(subsolar(Date.UTC(2026, 5, 21, 12)).lat, 23.44, 0.5);
  near(subsolar(Date.UTC(2026, 11, 21, 12)).lat, -23.44, 0.5);
  near(subsolar(Date.UTC(2026, 2, 20, 12)).lat, 0, 1.5);
  near(subsolar(Date.UTC(2026, 8, 23, 12)).lat, 0, 1.5);
});

test("the sun is overhead where it's noon, give or take the equation of time", () => {
  near(subsolar(Date.UTC(2026, 5, 21, 12)).lon, 0.4, 1);
  // Early November: the sun runs about 16 minutes ahead of the clock, so at noon UTC it's already 4° west.
  near(subsolar(Date.UTC(2026, 10, 3, 12)).lon, -4.1, 1);
  near(subsolar(Date.UTC(2026, 5, 21, 18)).lon, -89.6, 1);
  // At midnight UTC it's noon on the other side of the world.
  near(Math.abs(subsolar(Date.UTC(2026, 5, 21, 0)).lon), 180, 1.5);
});

test("night falls where the sun is below the horizon", () => {
  const noon = Date.UTC(2026, 11, 21, 12);
  // Midwinter: the North Pole is in the dark all day; at noon in London it's day, in Sydney it's 11 pm.
  assert.equal(isNight(89, 0, noon), true);
  assert.equal(isNight(51.5, -0.1, noon), false);
  assert.equal(isNight(-33.9, 151.2, noon), true);
  // Midsummer: the pole has the midnight sun.
  assert.equal(isNight(89, 0, Date.UTC(2026, 5, 21, 0)), false);
});

test("the map's night side holds the pole in winter and leaves it out in summer", () => {
  // In winter the night is one shape around the pole; in summer a ring from the line out to the edge.
  assert.equal((nightPath(Date.UTC(2026, 11, 21, 12), 100).match(/M/g) ?? []).length, 1);
  assert.equal((nightPath(Date.UTC(2026, 5, 21, 12), 100).match(/M/g) ?? []).length, 2);
});
