// What the fake sources answer in the tests that run a whole morning (tests/run.test.ts,
// tests/ics.test.ts): the colleges' pages and their teams' calendars with nothing on. Their own
// tests read real ones (tests/schools.test.ts).
export const SCHOOLS_EMPTY: [RegExp, string][] = [
  [/gothunderbirds\.ca|athletics\.sfu\.ca/, "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n"],
  [/capilanou\.ca/, '<div id="calendar_events"><ul></ul></div>'],
  [/langara\.ca/, '<form id="views-exposed-form-events-block-all"></form>'],
  [/douglascollege\.ca/, '<form id="views-exposed-form-events-page-1"></form>'],
  [/vcc\.ca/, '<body class="archive tax-events-category term-community-event"></body>'],
];
