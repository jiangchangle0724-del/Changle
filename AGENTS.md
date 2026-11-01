# Working in this repository

The code for [changle.ca](https://changle.ca): the site and its party games (`site/`, with the
online rooms server in `site/worker/`), 到此一游 (`games/been-there`) and 随便 (`tools/suibian`).
Start with [HANDOFF.md](HANDOFF.md): what runs where, how a change goes live, how to add a game,
the commands and the settings.

* Every change on its own branch with a PR. Never push to `main`. CI must be green before merging.
* Ask the owner (Steve) before merging, deploying, or anything that costs money or goes public.
  Merging into `main` deploys (Cloudflare builds each part from GitHub, the rooms server too).
* No keys, secrets or tokens in code, commits, chat or screenshots. They live only in Cloudflare.
* Everything a player reads exists in Chinese and English.
* Each app installs and tests in its own folder (Node 22); read that folder's README first.
* Stuck? Stop and say what you need instead of working around it.
