// A vault made once, on 2026-11-19, in format version 1, and kept here for good. It pins what is
// stored: the wrappers' fields and how their keys are derived, the passphrase normalization, the
// recovery code and the sealed blob. If a change to the vault's code makes any of this stop opening,
// real vaults made before the change would stop opening too, so the test that reads this file must
// never be "fixed" by regenerating it. A format change needs a new version number and code that
// still reads version 1.
//
// The vault key here was made for this file and never guarded anything. The passphrase is in
// vault.test.ts, typed the way two different keyboards would type it.
export const GOLDEN = {
  "vault": "7n5P3ttw8TpCciViT9ddfQ",
  "wrappers": [
    {
      "v": 1,
      "id": "prJ9hMK3lXbG_FerGOy15g",
      "vault": "7n5P3ttw8TpCciViT9ddfQ",
      "kind": "passphrase",
      "kdf": "pbkdf2-sha256",
      "iterations": 600000,
      "salt": "JYE_mi4K5829DfUFN-oa55_o4tikj23BAmtqyXNuRpE",
      "wrapped": "ZgpOQKHiSVnCSJoqnDM-WXGiX4VoPvSStPBW-TPO5u0HX57STHDKyg",
      "created": "2026-11-19T09:00:00.000Z"
    },
    {
      "v": 1,
      "id": "d4YF0ByW60WXOnY1YHLYGQ",
      "vault": "7n5P3ttw8TpCciViT9ddfQ",
      "kind": "recovery",
      "kdf": "hkdf-sha256",
      "salt": "GmU4MAHdAj3AWaK-blG7naWjfN_XUd4OWUMD76EyZ-E",
      "wrapped": "SYMEGWMkqMu3CPF4om9pCz_OA8fCz1AqZ2PulGygojUn-zbGFvFHIw",
      "created": "2026-11-19T09:00:00.000Z"
    },
    {
      "v": 1,
      "id": "WPF0RvaFCkm1IiGCQ0krwA",
      "vault": "7n5P3ttw8TpCciViT9ddfQ",
      "kind": "passkey",
      "kdf": "hkdf-sha256",
      "salt": "zeLsTc61GFAlEHlIA1MEXvWcL7HqRX-Ee8ApGSEllYw",
      "wrapped": "LwmN9TWLoaukdVFvKzTIbNEMmLk4HXCbDa16jZpx3rRJoNYymMkHJw",
      "created": "2026-11-19T09:00:00.000Z",
      "credential": "Z29sZGVuLWNyZWRlbnRpYWw",
      "label": "golden key"
    }
  ],
  "recoveryCode": "ZS3E-Q63X-VBAF-3T8B-H8P6-KTYZ-TTBM-T2MW-D6",
  "chunk": {
    "id": "Z29sZGVuLWNodW5rLTAwMQ",
    "type": "txns"
  },
  "value": {
    "note": "golden",
    "amount": -8437,
    "text": "大统华 T&T"
  },
  "blob": "AWX1SYQQzmu7eAlv8BGfD_1nKFJTM8EiOwvoxgHF3dJdVhc5_XWe5VJVP_BRVjIg39N6QAMZKpqHTO9YD9f_KinurJij3FHO4F17TW4uizKGfDmO",
  "prf": "AwoRGB8mLTQ7QklQV15lbHN6gYiPlp2kq7K5wMfO1dw"
} as const;
