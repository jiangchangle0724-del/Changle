# The golden set (黄金集)

`golden.csv` is the answer key gate A is scored against: real events labelled by hand, every value
read from the event's own page, never from the pipeline. Its columns and how it's scored are in
`../CONTRACTS.md` ("The golden set").

- **G01 to G40**, Claude, 1 November 2026: events from 3 to 21 November from the sources the
  pipeline reads or will: Ticketmaster 4, iCal 6 (Luma 3, UBC 3), the libraries 11 (Vancouver 4,
  Richmond 7), JSON-LD pages 19 (Eventbrite 15, Rogers Forum 2, the Commodore 1, Evergreen 1).
  Every category at least 3 rows, every area at least 4. Four pairs of the same event in two
  sources (G05/G06, G09/G10, G21/G22, G23/G24) and four look-alike pairs that are different events
  (G01/G02, G11/G12, G13/G14, G27/G28). One sold out (G12), one cancelled (G40).
- The plan had 20 more, G41 to G60, from Steve (Chinese community events). On 1 November he
  decided the 40 are enough for gate A, so the set is G01 to G40. Rows added later go on from G41,
  with `by` saying who labelled them.

What labelling turned up, for the sources and the parsers:

- Ticketmaster's search circle (40 km round downtown) doesn't reach Abbotsford's Rogers Forum
  (G21, G23, about 62 km), though the Fraser Valley is in the `langley` area. Widen it, or a second
  circle.
- The Commodore has no page per event (G10's url is its listing): matching by url needs a
  fallback (same source, date and title) for sources like it.
- Eventbrite's JSON-LD prices include its fees (a $10 to $20 night shows 11.98 to 22.63), so those
  rows leave the price blank. Some Eventbrite series pages put the series' url with one date's time.
- Times: B.C. kept UTC-7, and most sources agree; Meetup still writes "PDT", one Eventbrite event
  uses America/Whitehorse, and Burnaby library's own feed (bpl.bc.ca/events.json, not BiblioCommons)
  labels times America/Los_Angeles. Two Eventbrite pages contradicted themselves by an hour and
  were left out.
- No JSON-LD in the page as served: the Chan Centre, the Polygon Gallery, River Rock, UBC Music and
  Theatre; the Langley Events Centre, Vancouver Civic Theatres and the Vogue build theirs in the
  browser. Rogers Forum's and Evergreen's JSON-LD have no location.
