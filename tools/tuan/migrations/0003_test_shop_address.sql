-- The test shop of 2026-11-13 (docs/briefs/tuan.md) had its address written in this public
-- repository. Now that a shop has a page of its own listing its group buys (/tuan/s/<shop>), that
-- address would lead anyone to the test group buy, whose real goods, prices and pickup addresses
-- are meant only for the people given its link. So the shop gets an address made up here, by the
-- database, and written nowhere in this repository: its own people find it at /tuan/my. Its group
-- buys, their links, its orders and who runs it stay as they were. On any other database this
-- changes nothing.

UPDATE shops SET slug = 'damituan-test-' || lower(hex(randomblob(4))) WHERE slug = 'damituan-test';
